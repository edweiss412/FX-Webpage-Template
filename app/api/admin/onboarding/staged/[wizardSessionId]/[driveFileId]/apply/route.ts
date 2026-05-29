import { NextResponse } from "next/server";
import {
  applyStaged as defaultApplyStaged,
  type ApplyStagedDeps,
  type ApplyStagedResult,
  type ReviewerChoice,
} from "@/lib/sync/applyStaged";
import type { ConcurrentSyncSkipped } from "@/lib/sync/lockedShowTx";
import type { LockedShowTx } from "@/lib/sync/lockedShowTx";
import { withPostgresSyncPipelineLock } from "@/lib/sync/runScheduledCronSync";

export type WizardStagedRouteTx = LockedShowTx<{
  queryOne<T>(sql: string, params: unknown[]): Promise<T>;
}>;

export type WizardStagedRouteDeps = {
  requireAdminIdentity?: () => Promise<{ email: string }>;
  withRowTx?: <R>(
    driveFileId: string,
    fn: (tx: WizardStagedRouteTx) => Promise<R> | R,
  ) => Promise<R>;
  applyStaged?: (
    args: Parameters<typeof defaultApplyStaged>[0],
    deps?: ApplyStagedDeps,
  ) => Promise<ApplyStagedResult | ConcurrentSyncSkipped>;
};

type RouteContext = {
  params: Promise<{ wizardSessionId: string; driveFileId: string }>;
};

type ApplyBody = {
  stagedId?: unknown;
  reviewerChoices?: unknown;
  reviewerChoicesVersion?: unknown;
};

async function defaultRequireAdminIdentity(): Promise<{ email: string }> {
  const { requireAdminIdentity } = await import("@/lib/auth/requireAdmin");
  return await requireAdminIdentity();
}

async function defaultWithRowTx<R>(
  driveFileId: string,
  fn: (tx: WizardStagedRouteTx) => Promise<R> | R,
): Promise<R> {
  const result = await withPostgresSyncPipelineLock(driveFileId, fn, { tryOnly: false });
  if (typeof result === "object" && result !== null && "skipped" in result) {
    throw new Error("blocking wizard staged route returned skipped lock");
  }
  return result;
}

function depsWithDefaults(deps: WizardStagedRouteDeps) {
  return {
    requireAdminIdentity: deps.requireAdminIdentity ?? defaultRequireAdminIdentity,
    withRowTx: deps.withRowTx ?? defaultWithRowTx,
    applyStaged: deps.applyStaged ?? defaultApplyStaged,
  };
}

function errorResponse(status: number, code: string): Response {
  return NextResponse.json({ ok: false, code }, { status });
}

function isReviewerChoice(value: unknown): value is ReviewerChoice {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { item_id?: unknown; action?: unknown; rename_value?: unknown };
  return (
    typeof candidate.item_id === "string" &&
    (candidate.action === "apply" ||
      candidate.action === "reject" ||
      candidate.action === "rename" ||
      candidate.action === "independent") &&
    (candidate.rename_value === undefined || typeof candidate.rename_value === "string")
  );
}

async function readBody(request: Request): Promise<ApplyBody> {
  try {
    const body = await request.json();
    return typeof body === "object" && body !== null ? (body as ApplyBody) : {};
  } catch {
    return {};
  }
}

function statusForApplyResult(result: ApplyStagedResult): { status: number; code: string } {
  if (result.outcome === "superseded") {
    return { status: 409, code: result.code };
  }
  if (result.outcome === "not_found") {
    return { status: 409, code: "STALE_DISCARD_REJECTED" };
  }
  if (result.outcome === "wizard_superseded") {
    return { status: 409, code: result.code };
  }
  if (result.outcome === "invalid_request") {
    return { status: 400, code: result.code };
  }
  if ("code" in result) return { status: 409, code: result.code };
  return { status: 409, code: "STALE_DISCARD_REJECTED" };
}

export async function handleWizardStagedApply(
  request: Request,
  context: RouteContext,
  routeDeps: WizardStagedRouteDeps = {},
): Promise<Response> {
  const deps = depsWithDefaults(routeDeps);
  let admin: { email: string };
  try {
    admin = await deps.requireAdminIdentity();
  } catch (error) {
    const code =
      typeof error === "object" && error !== null ? (error as { code?: unknown }).code : null;
    if (code === "ADMIN_SESSION_LOOKUP_FAILED") return errorResponse(500, code);
    return errorResponse(403, "ADMIN_FORBIDDEN");
  }

  // Wrap everything after the admin check so no infra fault (or jsonb-deref throw
  // inside applyStaged) can leak a body-less 500. Early returns below are returns,
  // not throws, so the typed 400/409 paths are preserved (Codex R5/R6).
  try {
    const { wizardSessionId, driveFileId } = await context.params;
    const body = await readBody(request);
    if (typeof body.stagedId !== "string") return errorResponse(400, "INVALID_REVIEWER_ACTION");
    if (body.reviewerChoicesVersion !== 1) {
      return errorResponse(409, "WIZARD_REVIEWER_CHOICES_VERSION_UNSUPPORTED");
    }
    const reviewerChoices = Array.isArray(body.reviewerChoices) ? body.reviewerChoices : [];
    if (!reviewerChoices.every(isReviewerChoice)) {
      return errorResponse(400, "INVALID_REVIEWER_ACTION");
    }

    const result = await deps.applyStaged(
      {
        sourceScope: "wizard",
        wizardSessionId,
        driveFileId,
        stagedId: body.stagedId as string,
        reviewerChoices,
        appliedByEmail: admin.email,
      },
      {
        withPipelineLock: async (lockedDriveFileId, fn) =>
          deps.withRowTx(lockedDriveFileId, (lockedTx) =>
            fn(
              lockedTx as unknown as Parameters<
                Parameters<NonNullable<ApplyStagedDeps["withPipelineLock"]>>[1]
              >[0],
            ),
          ),
      },
    );
    if ("skipped" in result) return errorResponse(409, "SHOW_BUSY_RETRY");
    if (result.outcome === "wizard_applied") {
      return NextResponse.json({
        status: "reapplied",
        wizard_session_id: wizardSessionId,
        drive_file_id: driveFileId,
      });
    }
    if (result.outcome === "restaged_inline") {
      return NextResponse.json({
        status: "restaged_inline",
        wizard_session_id: wizardSessionId,
        drive_file_id: driveFileId,
        staged_id: result.stagedId,
        staged_modified_time: result.stagedModifiedTime,
        code: "STAGED_PARSE_RESTAGED_INLINE",
      });
    }
    const mapped = statusForApplyResult(result);
    return errorResponse(mapped.status, mapped.code);
  } catch (error) {
    // Never leak an empty 500. The Apply read mapper flags a corrupt parse_result
    // (→ STAGED_PARSE_RESULT_CORRUPT) for the common case, but ANY other unexpected
    // throw inside applyStaged (e.g. a deref of a corrupt-but-object field the
    // coercer's shape gate doesn't cover, or a DB fault) must still return a typed
    // JSON body, not a body-less 500 (Codex R5 — the structural backstop that makes
    // field-by-field shape completeness non-load-bearing for the empty-500 contract).
    console.error(
      `wizard staged apply: unexpected failure: ${
        error instanceof Error ? error.message : String(error)
      }`,
      error,
    );
    return errorResponse(500, "SYNC_INFRA_ERROR");
  }
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return await handleWizardStagedApply(request, context);
}
