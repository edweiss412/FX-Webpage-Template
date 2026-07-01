import { NextResponse } from "next/server";
import { log } from "@/lib/log";
import { logAdminOutcome, type AdminOutcome } from "@/lib/log/logAdminOutcome";
import {
  discardStaged_unlocked as defaultDiscardStagedUnlocked,
  type DiscardStagedDeps,
  type DiscardStagedResult,
  type DiscardVariant,
} from "@/lib/sync/discardStaged";
import { type WizardStagedRouteDeps, type WizardStagedRouteTx } from "../apply/route";
import { withPostgresSyncPipelineLock } from "@/lib/sync/runScheduledCronSync";
import {
  readCurrentWizardSessionIdBestEffort,
  WizardSessionSupersededRollbackError,
} from "@/lib/sync/wizardSessionRollback";
import {
  upsertAdminAlert as defaultUpsertAdminAlert,
  type UpsertAdminAlertInput,
} from "@/lib/adminAlerts/upsertAdminAlert";

export type WizardDiscardRouteDeps = Omit<WizardStagedRouteDeps, "applyStagedUnlocked"> & {
  discardStagedUnlocked?: (
    tx: WizardStagedRouteTx,
    args: Parameters<typeof defaultDiscardStagedUnlocked>[1],
    deps?: DiscardStagedDeps,
  ) => Promise<DiscardStagedResult>;
  // F5 Task 5.5 (R51-1): the alert contract is route-consistent — the discard
  // route fires the SAME post-rollback WIZARD_SESSION_SUPERSEDED_RACE
  // producer as the retry route, in its own follow-up transaction.
  upsertAdminAlert?: (input: UpsertAdminAlertInput) => Promise<string | null>;
  readCurrentWizardSessionId?: () => Promise<string | null>;
};

type RouteContext = {
  params: Promise<{ wizardSessionId: string; driveFileId: string }>;
};

type DiscardBody = {
  stagedId?: unknown;
  kind?: unknown;
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

function depsWithDefaults(deps: WizardDiscardRouteDeps) {
  return {
    requireAdminIdentity: deps.requireAdminIdentity ?? defaultRequireAdminIdentity,
    withRowTx: deps.withRowTx ?? defaultWithRowTx,
    discardStagedUnlocked:
      deps.discardStagedUnlocked ??
      (defaultDiscardStagedUnlocked as unknown as NonNullable<
        WizardDiscardRouteDeps["discardStagedUnlocked"]
      >),
  };
}

function errorResponse(status: number, code: string): Response {
  return NextResponse.json({ ok: false, code }, { status });
}

async function readBody(request: Request): Promise<DiscardBody> {
  try {
    const body = await request.json();
    return typeof body === "object" && body !== null ? (body as DiscardBody) : {};
  } catch {
    return {};
  }
}

function variantForKind(kind: unknown): DiscardVariant | null {
  if (kind === "try_again_next_sync") return "try_again";
  if (kind === "defer_until_modified" || kind === "permanent_ignore") return kind;
  return null;
}

function statusForDiscardResult(result: DiscardStagedResult): { status: number; code: string } {
  if (result.outcome === "not_found" || result.outcome === "stale") {
    return { status: 409, code: "STALE_DISCARD_REJECTED" };
  }
  if ("code" in result) return { status: 409, code: result.code };
  return { status: 409, code: "STALE_DISCARD_REJECTED" };
}

export async function handleWizardStagedDiscard(
  request: Request,
  context: RouteContext,
  routeDeps: WizardDiscardRouteDeps = {},
): Promise<Response> {
  const deps = depsWithDefaults(routeDeps);
  let adminEmail: string;
  try {
    ({ email: adminEmail } = await deps.requireAdminIdentity());
  } catch (error) {
    const code =
      typeof error === "object" && error !== null ? (error as { code?: unknown }).code : null;
    if (code === "ADMIN_SESSION_LOOKUP_FAILED") return errorResponse(500, code);
    return errorResponse(403, "ADMIN_FORBIDDEN");
  }

  const { wizardSessionId, driveFileId } = await context.params;
  const body = await readBody(request);
  if (typeof body.stagedId !== "string") return errorResponse(400, "INVALID_REVIEWER_ACTION");
  const variant = variantForKind(body.kind);
  if (!variant) return errorResponse(400, "INVALID_REVIEWER_ACTION");

  let result: DiscardStagedResult;
  let outcome: AdminOutcome | null = null;
  try {
    result = await deps.withRowTx(driveFileId, async (tx) => {
      const discardResult = await deps.discardStagedUnlocked(
        tx,
        {
          sourceScope: "wizard",
          wizardSessionId,
          driveFileId,
          stagedId: body.stagedId as string,
          variant,
        },
        {},
      );
      // OUTCOME-REF: stage the durable telemetry inside the locked tx (only on the
      // committed discard path), but EMIT it after withRowTx resolves — never inside
      // the advisory-lock tx, and never when a post-callback commit fault aborts.
      if (discardResult.outcome === "discarded") {
        outcome = {
          code: "STAGE_DISCARDED",
          source: "api.admin.onboarding.staged.discard",
          actorEmail: adminEmail,
          driveFileId,
          wizardSessionId,
        };
      }
      return discardResult;
    });
  } catch (error) {
    // F5 Task 5.5 (S3/S4 + R51-1): discardStaged_unlocked throws the typed
    // rollback error on a post-mutation currency miss. The per-show-locked tx
    // is already ABORTED here; map to the cataloged 409 (never an uncataloged
    // 500 — invariant 5) and fire the post-rollback race alert in its own
    // follow-up transaction (best-effort; failure logged, never masks the 409).
    if (error instanceof WizardSessionSupersededRollbackError) {
      try {
        await (routeDeps.upsertAdminAlert ?? defaultUpsertAdminAlert)({
          showId: null,
          code: "WIZARD_SESSION_SUPERSEDED_RACE",
          context: {
            attempted_action: error.context.attemptedAction,
            superseded_session_id: error.context.supersededSessionId,
            current_session_id: await (
              routeDeps.readCurrentWizardSessionId ?? readCurrentWizardSessionIdBestEffort
            )(),
            pending_ingestion_id: error.context.pendingIngestionId ?? null,
            drive_file_id: error.context.driveFileId,
          },
        });
      } catch (alertError) {
        log.error("WIZARD_SESSION_SUPERSEDED_RACE alert write failed", {
          source: "api.admin.onboarding.staged.discard",
          error: alertError,
        });
      }
      return errorResponse(409, "WIZARD_SESSION_SUPERSEDED");
    }
    // Never leak a body-less 500 (invariant 5). A post-callback commit fault (or any
    // other unexpected throw from the locked tx) aborts the row tx; map it to a typed
    // JSON 500 — the staged outcome is NOT emitted because control never reaches the
    // post-resolve logAdminOutcome call below.
    log.error("wizard staged discard: unexpected failure", {
      source: "api.admin.onboarding.staged.discard",
      error,
    });
    return errorResponse(500, "SYNC_INFRA_ERROR");
  }
  if (outcome) await logAdminOutcome(outcome);
  if (result.outcome === "discarded") {
    return NextResponse.json({
      status: "discarded",
      wizard_session_id: wizardSessionId,
      drive_file_id: driveFileId,
      variant,
    });
  }
  const mapped = statusForDiscardResult(result);
  return errorResponse(mapped.status, mapped.code);
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return await handleWizardStagedDiscard(request, context);
}
