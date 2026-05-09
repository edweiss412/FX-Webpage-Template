import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { canonicalize } from "@/lib/email/canonicalize";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  applyStaged,
  WIZARD_SCOPE_NOT_YET_IMPLEMENTED,
  type ReviewerChoice,
} from "@/lib/sync/applyStaged";

type RouteContext = {
  params: Promise<{ fileId: string }>;
};

type ApplyRequestBody = {
  source_scope?: unknown;
  staged_id?: unknown;
  choices?: unknown;
};

async function readAdminEmail(): Promise<
  { kind: "ok"; email: string } | { kind: "infra_error" }
> {
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
    case "INVALID_REVIEWER_ACTION":
      return 400;
    default:
      return 409;
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

  if (body.source_scope === "wizard") {
    // wizard-scope deferred to 6.8 coda
    return NextResponse.json(
      { ok: false, error: WIZARD_SCOPE_NOT_YET_IMPLEMENTED },
      { status: 501 },
    );
  }
  if (body.source_scope !== "live" || typeof body.staged_id !== "string") {
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

  const result = await applyStaged({
    driveFileId: fileId,
    sourceScope: "live",
    stagedId: body.staged_id,
    reviewerChoices: choices,
    appliedByEmail: admin.email,
  });
  if ("skipped" in result) {
    return NextResponse.json({ ok: false, error: "SHOW_BUSY_RETRY" }, { status: 409 });
  }
  if (result.outcome === "applied") {
    return NextResponse.json({ ok: true, result });
  }
  return NextResponse.json(
    { ok: false, error: result.code },
    { status: statusForCode(result.code) },
  );
}
