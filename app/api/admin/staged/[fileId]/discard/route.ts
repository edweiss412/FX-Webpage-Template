import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
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

function isDiscardVariant(value: unknown): value is DiscardVariant {
  return value === "try_again" || value === "defer_until_modified" || value === "permanent_ignore";
}

function statusForCode(code: string): number {
  if (code === "PENDING_SYNC_NOT_FOUND") return 404;
  return 409;
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
  const variant = isDiscardVariant(body.variant) ? body.variant : "try_again";

  const result = await discardStaged({
    driveFileId: fileId,
    sourceScope: "live",
    stagedId: body.staged_id,
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
