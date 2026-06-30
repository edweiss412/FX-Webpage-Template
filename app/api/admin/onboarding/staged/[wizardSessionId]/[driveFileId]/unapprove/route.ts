import { NextResponse } from "next/server";
import { log } from "@/lib/log";
import type { LockedShowTx } from "@/lib/sync/lockedShowTx";
import { withPostgresSyncPipelineLock } from "@/lib/sync/runScheduledCronSync";

// Task C3 (spec §7.2 "Write (uncheck)"): un-approve is the inverse of the wizard
// apply/approve. It reverts pending_syncs.wizard_approved to false (nulling the
// approve provenance + reviewer choices) and resets the manifest row to clean
// 'staged' — a non-blocking finish input (§7.3). Admin-gated; runs under the
// per-show advisory lock as a SINGLE JS-side holder (withPostgresSyncPipelineLock,
// mirroring apply/route.ts — no nested holder, invariant 2).
//
// Active-session CAS: both UPDATEs carry the `exists (... pending_wizard_session_id
// = $wsid)` predicate (mirrors defaultApproveWizardPendingSync in applyStaged.ts).
// The pending_syncs UPDATE is the gate and runs FIRST; a 0-row outcome means the
// session was superseded between the click and the write, so NO mutation has run
// yet and returning a 409 from inside the tx is safe (commits an empty tx — the
// same pre-mutation refusal pattern as requireCurrentWizardRow in retry/route.ts).
// The manifest UPDATE runs only after a confirmed non-zero pending UPDATE.

export type WizardUnapproveRouteTx = LockedShowTx<{
  queryOne<T>(sql: string, params: unknown[]): Promise<T>;
}>;

export type WizardUnapproveRouteDeps = {
  requireAdminIdentity?: () => Promise<{ email: string }>;
  withRowTx?: <R>(
    driveFileId: string,
    fn: (tx: WizardUnapproveRouteTx) => Promise<R> | R,
  ) => Promise<R>;
};

type RouteContext = {
  params: Promise<{ wizardSessionId: string; driveFileId: string }>;
};

async function defaultRequireAdminIdentity(): Promise<{ email: string }> {
  const { requireAdminIdentity } = await import("@/lib/auth/requireAdmin");
  return await requireAdminIdentity();
}

async function defaultWithRowTx<R>(
  driveFileId: string,
  fn: (tx: WizardUnapproveRouteTx) => Promise<R> | R,
): Promise<R> {
  const result = await withPostgresSyncPipelineLock(driveFileId, fn, { tryOnly: false });
  if (typeof result === "object" && result !== null && "skipped" in result) {
    throw new Error("blocking wizard un-approve route returned skipped lock");
  }
  return result;
}

function depsWithDefaults(deps: WizardUnapproveRouteDeps) {
  return {
    requireAdminIdentity: deps.requireAdminIdentity ?? defaultRequireAdminIdentity,
    withRowTx: deps.withRowTx ?? defaultWithRowTx,
  };
}

function errorResponse(status: number, code: string): Response {
  return NextResponse.json({ ok: false, code }, { status });
}

// Revert wizard_approved + null the approve provenance/choices, guarded on the
// active wizard session. Returns whether a row was affected (0 → superseded).
async function unapprovePendingSync(
  tx: WizardUnapproveRouteTx,
  wizardSessionId: string,
  driveFileId: string,
): Promise<boolean> {
  const updated = await tx.queryOne<{ unapproved: boolean } | null>(
    `
      update public.pending_syncs
         set wizard_approved = false,
             wizard_approved_by_email = null,
             wizard_approved_at = null,
             wizard_reviewer_choices = null,
             wizard_reviewer_choices_version = null
       where drive_file_id = $1
         and wizard_session_id = $2::uuid
         and exists (
           select 1 from public.app_settings
            where id = 'default'
              and pending_wizard_session_id = $2::uuid
         )
      returning true as unapproved
    `,
    [driveFileId, wizardSessionId],
  );
  return Boolean(updated?.unapproved);
}

// Reset the manifest row to clean 'staged'. Same active-session guard; this runs
// only after a confirmed pending-row revert, so a 0-row outcome here is benign
// (the row may not exist for a never-staged sheet) — we do not treat it as an error.
async function resetManifestToStaged(
  tx: WizardUnapproveRouteTx,
  wizardSessionId: string,
  driveFileId: string,
): Promise<void> {
  await tx.queryOne<{ updated: boolean } | null>(
    `
      update public.onboarding_scan_manifest
         set status = 'staged', transitioned_at = now()
       where drive_file_id = $1
         and wizard_session_id = $2::uuid
         and exists (
           select 1 from public.app_settings
            where id = 'default'
              and pending_wizard_session_id = $2::uuid
         )
      returning true as updated
    `,
    [driveFileId, wizardSessionId],
  );
}

export async function handleWizardStagedUnapprove(
  _request: Request,
  context: RouteContext,
  routeDeps: WizardUnapproveRouteDeps = {},
): Promise<Response> {
  const deps = depsWithDefaults(routeDeps);
  try {
    await deps.requireAdminIdentity();
  } catch (error) {
    const code =
      typeof error === "object" && error !== null ? (error as { code?: unknown }).code : null;
    if (code === "ADMIN_SESSION_LOOKUP_FAILED") return errorResponse(500, code as string);
    return errorResponse(403, "ADMIN_FORBIDDEN");
  }

  // Wrap the locked mutation so no infra fault leaks a body-less 500 (invariant 9).
  try {
    const { wizardSessionId, driveFileId } = await context.params;
    return await deps.withRowTx(driveFileId, async (tx) => {
      const reverted = await unapprovePendingSync(tx, wizardSessionId, driveFileId);
      if (!reverted) {
        // Superseded (or stale row) — no mutation ran; safe pre-mutation refusal.
        return errorResponse(409, "WIZARD_SESSION_SUPERSEDED");
      }
      await resetManifestToStaged(tx, wizardSessionId, driveFileId);
      return NextResponse.json({
        status: "unapproved",
        wizard_session_id: wizardSessionId,
        drive_file_id: driveFileId,
      });
    });
  } catch (error) {
    log.error(
      `wizard un-approve: unexpected failure: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { source: "api.admin.onboarding.staged.unapprove", error },
    );
    return errorResponse(500, "SYNC_INFRA_ERROR");
  }
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return await handleWizardStagedUnapprove(request, context);
}
