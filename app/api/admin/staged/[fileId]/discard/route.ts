import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { canonicalize } from "@/lib/email/canonicalize";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { discardStaged, type DiscardVariant } from "@/lib/sync/discardStaged";
import { log } from "@/lib/log";
import { logAdminOutcome } from "@/lib/log/logAdminOutcome";

type RouteContext = {
  params: Promise<{ fileId: string }>;
};

type DiscardRequestBody = {
  source_scope?: unknown;
  wizard_session_id?: unknown;
  staged_id?: unknown;
  variant?: unknown;
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isDiscardVariant(value: unknown): value is DiscardVariant {
  return value === "try_again" || value === "defer_until_modified" || value === "permanent_ignore";
}

function statusForCode(code: string): number {
  if (code === "PENDING_SYNC_NOT_FOUND") return 404;
  if (code === "INVALID_REVIEWER_ACTION") return 400;
  return 409;
}

async function readAdminEmail(): Promise<{ kind: "ok"; email: string } | { kind: "infra_error" }> {
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch (error) {
    log.error("server client construction failed", {
      source: "api.admin.staged.discard",
      code: "LIVE_STAGED_DISCARD_CLIENT_CONSTRUCTION_FAILED",
      error,
    });
    return { kind: "infra_error" };
  }

  let data: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"];
  let error: Awaited<ReturnType<typeof supabase.auth.getUser>>["error"];
  try {
    const response = await supabase.auth.getUser();
    data = response.data;
    error = response.error;
  } catch (cause) {
    log.error("getUser threw", {
      source: "api.admin.staged.discard",
      code: "LIVE_STAGED_DISCARD_GETUSER_THREW",
      error: cause,
    });
    return { kind: "infra_error" };
  }
  if (error) {
    log.error("getUser failed", {
      source: "api.admin.staged.discard",
      code: "LIVE_STAGED_DISCARD_GETUSER_FAILED",
      errorMessage: error.message,
    });
    return { kind: "infra_error" };
  }
  const email = canonicalize(data.user?.email);
  if (!email) return { kind: "infra_error" };
  return { kind: "ok", email };
}

export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
  // S1: a bare `await requireAdmin()` let an AdminInfraError (infra fault resolving
  // admin identity — DB outage / RPC failure / missing env, coded
  // ADMIN_SESSION_LOOKUP_FAILED) surface as a generic framework 500. Mirror the sibling
  // handleLivePendingIngestionRetry route: map the typed infra code to a typed 500 +
  // a fail-open forensic breadcrumb; any other throw (forbidden/redirect control-flow)
  // is re-thrown so existing behavior is byte-preserved. The happy path (requireAdmin
  // resolves) falls straight through — unchanged.
  try {
    await requireAdmin();
  } catch (error) {
    const code =
      typeof error === "object" && error !== null ? (error as { code?: unknown }).code : null;
    if (code === "ADMIN_SESSION_LOOKUP_FAILED") {
      void log.error("live staged discard: admin identity infra fault", {
        source: "api.admin.staged.discard",
        code: "LIVE_STAGED_DISCARD_AUTH_INFRA",
        error,
      });
      return NextResponse.json(
        { ok: false, error: "ADMIN_SESSION_LOOKUP_FAILED" },
        { status: 500 },
      );
    }
    throw error;
  }
  const { fileId } = await context.params;

  let body: DiscardRequestBody;
  try {
    body = (await request.json()) as DiscardRequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: "INVALID_REVIEWER_ACTION" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "INVALID_REVIEWER_ACTION" }, { status: 400 });
  }

  if (
    (body.source_scope !== "live" && body.source_scope !== "wizard") ||
    typeof body.staged_id !== "string" ||
    !isUuid(body.staged_id)
  ) {
    return NextResponse.json({ ok: false, error: "INVALID_REVIEWER_ACTION" }, { status: 400 });
  }
  if (
    body.source_scope === "wizard" &&
    (typeof body.wizard_session_id !== "string" || !isUuid(body.wizard_session_id))
  ) {
    return NextResponse.json({ ok: false, error: "INVALID_REVIEWER_ACTION" }, { status: 400 });
  }
  if (body.variant !== undefined && !isDiscardVariant(body.variant)) {
    return NextResponse.json({ ok: false, error: "INVALID_REVIEWER_ACTION" }, { status: 400 });
  }
  const variant = body.variant ?? "try_again";
  const admin = await readAdminEmail();
  if (admin.kind === "infra_error") {
    return NextResponse.json({ ok: false, error: "SYNC_INFRA_ERROR" }, { status: 500 });
  }

  const result = await discardStaged(
    body.source_scope === "wizard"
      ? {
          driveFileId: fileId,
          sourceScope: "wizard",
          wizardSessionId: (body.wizard_session_id as string).toLowerCase(),
          stagedId: body.staged_id.toLowerCase(),
          variant,
        }
      : {
          driveFileId: fileId,
          sourceScope: "live",
          stagedId: body.staged_id.toLowerCase(),
          discardedByEmail: admin.email,
          variant,
        },
  );
  if ("skipped" in result) {
    return NextResponse.json({ ok: false, error: "SHOW_BUSY_RETRY" }, { status: 409 });
  }
  if (result.outcome === "discarded") {
    // Durable success telemetry (audit finding #15a): discardStaged owns its per-show lock/tx and
    // has committed by the time it resolves, so this is POST-COMMIT. REUSED code (STAGE_DISCARDED,
    // already SANCTIONED). Fail-open at the callsite (invariant 9). admin.email is canonical
    // (readAdminEmail canonicalize()s it). Emitted ONLY on the discarded branch — never on a
    // skipped-409 / not-found-404 / conflict path (no false audit row).
    try {
      await logAdminOutcome({
        code: "STAGE_DISCARDED",
        source: "api.admin.staged.discard",
        actorEmail: admin.email,
        driveFileId: fileId,
        extra: { variant },
      });
    } catch {
      /* best-effort */
    }
    return NextResponse.json({ ok: true, result });
  }
  return NextResponse.json(
    { ok: false, error: result.code },
    { status: statusForCode(result.code) },
  );
}
