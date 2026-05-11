import { after, NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { canonicalize } from "@/lib/email/canonicalize";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { applyStaged, type ReviewerChoice } from "@/lib/sync/applyStaged";
import { promoteSnapshotUpload } from "@/lib/sync/promoteSnapshot";

type RouteContext = {
  params: Promise<{ fileId: string }>;
};

type ApplyRequestBody = {
  source_scope?: unknown;
  wizard_session_id?: unknown;
  staged_id?: unknown;
  choices?: unknown;
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function readAdminEmail(): Promise<{ kind: "ok"; email: string } | { kind: "infra_error" }> {
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch (error) {
    console.error("[/api/admin/staged/[fileId]/apply] server client construction failed", error);
    return { kind: "infra_error" };
  }

  let data: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"];
  let error: Awaited<ReturnType<typeof supabase.auth.getUser>>["error"];
  try {
    const response = await supabase.auth.getUser();
    data = response.data;
    error = response.error;
  } catch (cause) {
    console.error("[/api/admin/staged/[fileId]/apply] getUser threw", cause);
    return { kind: "infra_error" };
  }
  if (error) {
    console.error("[/api/admin/staged/[fileId]/apply] getUser failed", error.message);
    return { kind: "infra_error" };
  }
  const email = canonicalize(data.user?.email);
  if (!email) return { kind: "infra_error" };
  return { kind: "ok", email };
}

function isReviewerChoice(value: unknown): value is ReviewerChoice {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { item_id?: unknown; action?: unknown; rename_value?: unknown };
  if (typeof candidate.item_id !== "string") return false;
  if (
    candidate.action !== "apply" &&
    candidate.action !== "reject" &&
    candidate.action !== "rename" &&
    candidate.action !== "independent"
  ) {
    return false;
  }
  return candidate.rename_value === undefined || typeof candidate.rename_value === "string";
}

function statusForCode(code: string): number {
  switch (code) {
    case "PENDING_SYNC_NOT_FOUND":
      return 404;
    case "MISSING_REVIEWER_CHOICE":
    case "EXTRA_REVIEWER_CHOICE":
    case "DUPLICATE_REVIEWER_CHOICE":
    case "INVALID_REVIEWER_ACTION":
      return 400;
    case "SYNC_INFRA_ERROR":
      return 500;
    default:
      return 409;
  }
}

function scheduleAfterResponse(task: () => Promise<unknown>): void {
  try {
    after(() => {
      void task();
    });
  } catch {
    void task();
  }
}

export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
  await requireAdmin();
  const { fileId } = await context.params;

  let body: ApplyRequestBody;
  try {
    body = (await request.json()) as ApplyRequestBody;
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
  const choices = Array.isArray(body.choices) ? body.choices : [];
  if (!choices.every(isReviewerChoice)) {
    return NextResponse.json({ ok: false, error: "INVALID_REVIEWER_ACTION" }, { status: 400 });
  }

  const admin = await readAdminEmail();
  if (admin.kind === "infra_error") {
    return NextResponse.json({ ok: false, error: "SYNC_INFRA_ERROR" }, { status: 500 });
  }

  const result = await applyStaged(
    body.source_scope === "wizard"
      ? {
          driveFileId: fileId,
          sourceScope: "wizard",
          wizardSessionId: (body.wizard_session_id as string).toLowerCase(),
          stagedId: body.staged_id.toLowerCase(),
          reviewerChoices: choices,
          appliedByEmail: admin.email,
        }
      : {
          driveFileId: fileId,
          sourceScope: "live",
          stagedId: body.staged_id.toLowerCase(),
          reviewerChoices: choices,
          appliedByEmail: admin.email,
        },
  );
  if ("skipped" in result) {
    return NextResponse.json({ ok: false, error: "SHOW_BUSY_RETRY" }, { status: 409 });
  }
  if (result.outcome === "applied") {
    if (result.snapshotRevisionId) {
      scheduleAfterResponse(
        async () =>
          await promoteSnapshotUpload(result.snapshotRevisionId!).catch((error) => {
            console.error("[/api/admin/staged/[fileId]/apply] snapshot promotion failed", error);
          }),
      );
      return NextResponse.json(
        {
          ok: true,
          status: "apply_committed_pending_promote",
          apply_id: result.snapshotRevisionId,
          snapshot_revision_id: result.snapshotRevisionId,
        },
        { status: 202 },
      );
    }
    return NextResponse.json(
      {
        ok: true,
        status: "applied",
        result,
      },
      { status: 200 },
    );
  }
  if (result.outcome === "wizard_applied") {
    return NextResponse.json(
      {
        ok: true,
        status: "applied",
        result,
      },
      { status: 200 },
    );
  }
  if (result.outcome === "discarded") {
    return NextResponse.json({ ok: true, result });
  }
  return NextResponse.json(
    { ok: false, error: result.code },
    { status: statusForCode(result.code) },
  );
}
