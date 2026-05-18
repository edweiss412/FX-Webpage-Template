import { NextResponse } from "next/server";
import {
  applyStaged_unlocked as defaultApplyStagedUnlocked,
  type ApplyStagedDeps,
  type ApplyStagedResult,
  type ReviewerChoice,
} from "@/lib/sync/applyStaged";
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
  applyStagedUnlocked?: (
    tx: WizardStagedRouteTx,
    args: Parameters<typeof defaultApplyStagedUnlocked>[1],
    deps?: ApplyStagedDeps,
  ) => Promise<ApplyStagedResult>;
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
    applyStagedUnlocked:
      deps.applyStagedUnlocked ??
      (defaultApplyStagedUnlocked as unknown as NonNullable<
        WizardStagedRouteDeps["applyStagedUnlocked"]
      >),
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
    const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : null;
    if (code === "ADMIN_SESSION_LOOKUP_FAILED") return errorResponse(500, code);
    return errorResponse(403, "ADMIN_FORBIDDEN");
  }

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

  const result = await deps.withRowTx(driveFileId, (tx) =>
    deps.applyStagedUnlocked(
      tx,
      {
        sourceScope: "wizard",
        wizardSessionId,
        driveFileId,
        stagedId: body.stagedId as string,
        reviewerChoices,
        appliedByEmail: admin.email,
      },
      {},
    ),
  );
  if (result.outcome === "wizard_applied") {
    return NextResponse.json({
      status: "reapplied",
      wizard_session_id: wizardSessionId,
      drive_file_id: driveFileId,
    });
  }
  const mapped = statusForApplyResult(result);
  return errorResponse(mapped.status, mapped.code);
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return await handleWizardStagedApply(request, context);
}
