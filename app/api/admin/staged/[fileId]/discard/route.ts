import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { canonicalize } from "@/lib/email/canonicalize";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  discardStaged,
  WIZARD_SCOPE_NOT_YET_IMPLEMENTED,
  type DiscardVariant,
} from "@/lib/sync/discardStaged";

type RouteContext = {
  params: Promise<{ fileId: string }>;
};

type DiscardRequestBody = {
  source_scope?: unknown;
  staged_id?: unknown;
  variant?: unknown;
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function isDiscardVariant(value: unknown): value is DiscardVariant {
  return value === "try_again" || value === "defer_until_modified" || value === "permanent_ignore";
}

function statusForCode(code: string): number {
  if (code === "WIZARD_SCOPE_NOT_YET_IMPLEMENTED") return 501;
  if (code === "PENDING_SYNC_NOT_FOUND") return 404;
  if (code === "INVALID_REVIEWER_ACTION") return 400;
  return 409;
}

async function readAdminEmail(): Promise<
  { kind: "ok"; email: string } | { kind: "infra_error" }
> {
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch (error) {
    console.error("[/api/admin/staged/[fileId]/discard] server client construction failed", error);
    return { kind: "infra_error" };
  }

  let data: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"];
  let error: Awaited<ReturnType<typeof supabase.auth.getUser>>["error"];
  try {
    const response = await supabase.auth.getUser();
    data = response.data;
    error = response.error;
  } catch (cause) {
    console.error("[/api/admin/staged/[fileId]/discard] getUser threw", cause);
    return { kind: "infra_error" };
  }
  if (error) {
    console.error("[/api/admin/staged/[fileId]/discard] getUser failed", error.message);
    return { kind: "infra_error" };
  }
  const email = canonicalize(data.user?.email);
  if (!email) return { kind: "infra_error" };
  return { kind: "ok", email };
}

export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
  await requireAdmin();
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

  if (body.source_scope === "wizard") {
    // wizard-scope deferred to 6.8 coda
    return NextResponse.json(
      { ok: false, error: WIZARD_SCOPE_NOT_YET_IMPLEMENTED },
      { status: 501 },
    );
  }
  if (
    body.source_scope !== "live" ||
    typeof body.staged_id !== "string" ||
    !isUuid(body.staged_id)
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

  const result = await discardStaged({
    driveFileId: fileId,
    sourceScope: "live",
    stagedId: body.staged_id.toLowerCase(),
    discardedByEmail: admin.email,
    variant,
  });
  if ("skipped" in result) {
    return NextResponse.json({ ok: false, error: "SHOW_BUSY_RETRY" }, { status: 409 });
  }
  if (result.outcome === "discarded") {
    return NextResponse.json({ ok: true, result });
  }
  return NextResponse.json(
    { ok: false, error: result.code },
    { status: statusForCode(result.code) },
  );
}
