import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/requireAdmin";
import {
  rescanWizardSheet as realRescanWizardSheet,
  type RescanDeps,
  type RescanResult,
} from "@/lib/onboarding/rescanWizardSheet";

/**
 * POST /api/admin/onboarding/rescan-sheet — the thin route over `rescanWizardSheet` (spec §4 / §5.4).
 *
 * Admin-gated (mirrors `app/api/admin/sync/[slug]/route.ts`). Validates the posted body, runs the
 * orchestration core, and serializes its typed `RescanResult` to JSON. Every non-throw mapping is
 * HTTP 200 (the button reads `{ ok }` + the inline copy); only a malformed body is 400. No raw
 * error codes are rendered here — the button looks them up via the §12.4 catalog (invariant 5).
 */
export type RescanSheetRouteDeps = {
  /** Injected for tests — defaults to the real orchestration core. */
  rescanWizardSheet?: typeof realRescanWizardSheet;
  /** Forwarded as `rescanWizardSheet`'s 3rd arg (Drive/tx seams; default = real Drive + DB). */
  rescanDeps?: RescanDeps;
};

function mapResult(result: RescanResult): Record<string, unknown> {
  switch (result.status) {
    case "updated":
      return {
        ok: true,
        status: "updated",
        needsReview: result.needsReview,
        changed: result.changed,
      };
    case "needs_attention":
    case "busy":
      // A cataloged §12.4 code the button renders via lookupDougFacing (never raw).
      return { ok: false, status: result.status, code: result.code };
    default:
      // superseded | no_active_session | not_found | not_a_sheet — typed, code-less guards.
      return { ok: false, status: result.status };
  }
}

export async function handleRescanSheet(
  req: Request,
  deps?: RescanSheetRouteDeps,
): Promise<Response> {
  await requireAdmin();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, code: "BAD_REQUEST" }, { status: 400 });
  }
  const driveFileId = (body as { driveFileId?: unknown } | null)?.driveFileId;
  const wizardSessionId = (body as { wizardSessionId?: unknown } | null)?.wizardSessionId;
  if (
    typeof driveFileId !== "string" ||
    driveFileId.length === 0 ||
    typeof wizardSessionId !== "string" ||
    wizardSessionId.length === 0
  ) {
    return NextResponse.json({ ok: false, code: "BAD_REQUEST" }, { status: 400 });
  }

  const run = deps?.rescanWizardSheet ?? realRescanWizardSheet;
  // not-subject-to-meta: server-locked tx path — every DB mutation runs INSIDE rescanWizardSheet's
  // finalize→app_settings→show locked transaction (no PostgREST client surface in this route).
  const result = await run(driveFileId, wizardSessionId, deps?.rescanDeps);
  return NextResponse.json(mapResult(result));
}

export function POST(req: Request): Promise<Response> {
  return handleRescanSheet(req);
}
