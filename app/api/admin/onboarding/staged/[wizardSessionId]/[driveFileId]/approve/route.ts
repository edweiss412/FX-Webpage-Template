import { NextResponse } from "next/server";
import type { LockedShowTx } from "@/lib/sync/lockedShowTx";
import { withPostgresSyncPipelineLock } from "@/lib/sync/runScheduledCronSync";
import { canonicalize } from "@/lib/email/canonicalize";
import { parseTriggeredReviewItems } from "@/lib/staging/triggeredReviewItems";
import { RESCAN_REVIEW_REQUIRED } from "@/lib/onboarding/rescanReviewCode";

// Task D3 (spec §7.2 "Write (check)"): approve is the LIGHTWEIGHT durable
// publish-intent write — the symmetric inverse of C3's un-approve. It sets
// pending_syncs.wizard_approved=true with approve provenance + synthesized
// reviewer choices, and marks the manifest row 'applied'. Admin-gated; runs
// under the per-show advisory lock as a SINGLE JS-side holder
// (withPostgresSyncPipelineLock, mirroring apply/route.ts + unapprove/route.ts —
// no nested holder, invariant 2).
//
// DESIGN DECISION: this deliberately does NOT run the heavy navigation-era apply
// route's Drive-revision re-validation. Finalize (Task B2 processApprovedRow)
// re-validates each approved row at apply time, so the checkbox stays cheap. The
// stored approver email + synthesized apply-all choices are exactly what B2's
// checked branch consumes (the row carries the apply-only ONBOARDING_SCAN_REVIEW
// sentinel(s); `apply` is the only allowed action — mirror finalize's
// synthesizeDefaultChoices). A corrupt triggered_review_items value fails CLOSED
// via parseTriggeredReviewItems (the same gate the finalize route uses), refusing
// approval rather than approving an uninterpretable review gate.
//
// Active-session CAS: the read + both UPDATEs carry the `exists (...
// pending_wizard_session_id = $wsid)` predicate (mirrors
// defaultApproveWizardPendingSync in applyStaged.ts). The pending_syncs UPDATE is
// the gate and runs FIRST; a 0-row outcome means the session was superseded
// between the click and the write, so NO mutation has run yet and returning a 409
// from inside the tx is safe (commits an empty tx — the same pre-mutation refusal
// pattern as C3). The manifest UPDATE runs only after a confirmed non-zero
// pending UPDATE.

export type WizardApproveRouteTx = LockedShowTx<{
  queryOne<T>(sql: string, params: unknown[]): Promise<T>;
}>;

export type WizardApproveRouteDeps = {
  requireAdminIdentity?: () => Promise<{ email: string }>;
  withRowTx?: <R>(
    driveFileId: string,
    fn: (tx: WizardApproveRouteTx) => Promise<R> | R,
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
  fn: (tx: WizardApproveRouteTx) => Promise<R> | R,
): Promise<R> {
  const result = await withPostgresSyncPipelineLock(driveFileId, fn, { tryOnly: false });
  if (typeof result === "object" && result !== null && "skipped" in result) {
    throw new Error("blocking wizard approve route returned skipped lock");
  }
  return result;
}

function depsWithDefaults(deps: WizardApproveRouteDeps) {
  return {
    requireAdminIdentity: deps.requireAdminIdentity ?? defaultRequireAdminIdentity,
    withRowTx: deps.withRowTx ?? defaultWithRowTx,
  };
}

function errorResponse(status: number, code: string): Response {
  return NextResponse.json({ ok: false, code }, { status });
}

// Synthesized reviewer choices over the row's ONBOARDING_SCAN_REVIEW sentinel(s):
// apply-all is the only allowed action (mirrors finalize's synthesizeDefaultChoices).
type ReviewerChoice = { item_id: string; action: "apply" };

// Read the target row's triggered_review_items + last_finalize_failure_code under the
// active-session guard so a superseded session is observed BEFORE any mutation. Returns
// null when the row is not visible (superseded / missing); throws on corrupt items
// (fail-closed). The failure code drives the targeted dirty-rescan guard below.
async function readPendingForActiveSession(
  tx: WizardApproveRouteTx,
  wizardSessionId: string,
  driveFileId: string,
): Promise<{ reviewerChoices: ReviewerChoice[]; lastFinalizeFailureCode: string | null } | null> {
  const row = await tx.queryOne<{
    triggered_review_items: unknown;
    last_finalize_failure_code: string | null;
  } | null>(
    `
      select ps.triggered_review_items, ps.last_finalize_failure_code
        from public.pending_syncs ps
       where ps.drive_file_id = $1
         and ps.wizard_session_id = $2::uuid
         and exists (
           select 1 from public.app_settings
            where id = 'default'
              and pending_wizard_session_id = $2::uuid
         )
    `,
    [driveFileId, wizardSessionId],
  );
  if (!row) return null;
  const parsed = parseTriggeredReviewItems(row.triggered_review_items);
  if (!parsed.ok) {
    // Corrupt review gate → fail closed (do not approve an uninterpretable gate).
    throw new Error("wizard approve: corrupt triggered_review_items — refusing approval");
  }
  return {
    reviewerChoices: parsed.items.map((item) => ({ item_id: item.id, action: "apply" as const })),
    lastFinalizeFailureCode: row.last_finalize_failure_code ?? null,
  };
}

// Set wizard_approved + approve provenance + synthesized choices, guarded on the
// active wizard session. `$5::jsonb` receives the RAW choices array — postgres.js
// serializes a jsonb param itself, so JSON.stringify here would double-encode.
// Returns whether a row was affected (0 → superseded).
async function approvePendingSync(
  tx: WizardApproveRouteTx,
  wizardSessionId: string,
  driveFileId: string,
  approverEmail: string,
  reviewerChoices: ReviewerChoice[],
): Promise<boolean> {
  const updated = await tx.queryOne<{ approved: boolean } | null>(
    `
      update public.pending_syncs
         set wizard_approved = true,
             wizard_approved_by_email = $3,
             wizard_approved_at = now(),
             wizard_reviewer_choices = $4::jsonb,
             wizard_reviewer_choices_version = 1,
             -- Clear any prior demotion failure code: an approved row MUST have
             -- last_finalize_failure_code IS NULL (CHECK
             -- pending_syncs_approved_requires_full_payload). A DEMOTED row (manifest
             -- 'staged' + this code set + wizard_approved=false) is re-approved from the
             -- Step-3 card; without this clear the UPDATE violates the CHECK → the route
             -- 500s and the demoted row is un-clearable AND un-finishable (deadlock).
             -- Finalize (B2 processApprovedRow) re-validates the Drive revision at apply
             -- time, so a still-stale row simply re-demotes — no data loss.
             last_finalize_failure_code = null
       where drive_file_id = $1
         and wizard_session_id = $2::uuid
         and exists (
           select 1 from public.app_settings
            where id = 'default'
              and pending_wizard_session_id = $2::uuid
         )
      returning true as approved
    `,
    // canonicalize() AT the write (invariant 3 — canonicalization at every
    // boundary): approverEmail is already canonicalized at the route entry, so
    // this is idempotent, and it matches how the finalize route binds this same
    // wizard_approved_by_email column (finalize/route.ts: canonicalize(...)).
    [driveFileId, wizardSessionId, canonicalize(approverEmail), reviewerChoices],
  );
  return Boolean(updated?.approved);
}

// Mark the manifest row 'applied'. Same active-session guard; runs only after a
// confirmed pending-row approve, so a 0-row outcome here is benign (the row may
// not exist for a never-staged sheet) — we do not treat it as an error.
async function markManifestApplied(
  tx: WizardApproveRouteTx,
  wizardSessionId: string,
  driveFileId: string,
): Promise<void> {
  await tx.queryOne<{ updated: boolean } | null>(
    `
      update public.onboarding_scan_manifest
         set status = 'applied', transitioned_at = now()
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

export async function handleWizardStagedApprove(
  _request: Request,
  context: RouteContext,
  routeDeps: WizardApproveRouteDeps = {},
): Promise<Response> {
  const deps = depsWithDefaults(routeDeps);
  let adminEmail: string;
  try {
    adminEmail = (await deps.requireAdminIdentity()).email;
  } catch (error) {
    const code =
      typeof error === "object" && error !== null ? (error as { code?: unknown }).code : null;
    if (code === "ADMIN_SESSION_LOOKUP_FAILED") return errorResponse(500, code as string);
    return errorResponse(403, "ADMIN_FORBIDDEN");
  }

  const approverEmail = canonicalize(adminEmail);
  if (!approverEmail) {
    // The admin identity was non-canonicalizable — an infra/auth fault, not a
    // user-correctable action; surface a typed 500, never a bare one (invariant 9).
    return errorResponse(500, "SYNC_INFRA_ERROR");
  }

  // Wrap the locked mutation so no infra fault leaks a body-less 500 (invariant 9).
  try {
    const { wizardSessionId, driveFileId } = await context.params;
    return await deps.withRowTx(driveFileId, async (tx) => {
      // Read review items + the demotion code under the active-session guard FIRST. A
      // null result means the session was superseded (or the row is gone) — refuse
      // before mutating.
      const pending = await readPendingForActiveSession(tx, wizardSessionId, driveFileId);
      if (pending === null) {
        return errorResponse(409, "WIZARD_SESSION_SUPERSEDED");
      }
      // Targeted dirty-rescan guard (spec §6.1): a row demoted by a per-sheet re-scan
      // carries RESCAN_REVIEW_REQUIRED. The plain checkbox /approve clears the code and
      // synthesizes an apply-all, which would SILENTLY re-approve a crew-identity change
      // (MI-11) or write an invalid apply-all for a multi-action MI-12/13/14 (→ 500 at
      // finalize). Refuse here — HTTP 200 + the cataloged code, ZERO mutation — and let
      // the card route Doug to the reapply page, which exposes the real per-item choice
      // controls. EVERY other demotion code keeps the one-click checkbox recovery.
      if (pending.lastFinalizeFailureCode === RESCAN_REVIEW_REQUIRED) {
        return errorResponse(200, RESCAN_REVIEW_REQUIRED);
      }
      const approved = await approvePendingSync(
        tx,
        wizardSessionId,
        driveFileId,
        approverEmail,
        pending.reviewerChoices,
      );
      if (!approved) {
        // Superseded between the read and the write — no mutation ran; safe refusal.
        return errorResponse(409, "WIZARD_SESSION_SUPERSEDED");
      }
      await markManifestApplied(tx, wizardSessionId, driveFileId);
      return NextResponse.json({
        status: "approved",
        wizard_session_id: wizardSessionId,
        drive_file_id: driveFileId,
      });
    });
  } catch (error) {
    console.error(
      `wizard approve: unexpected failure: ${
        error instanceof Error ? error.message : String(error)
      }`,
      error,
    );
    return errorResponse(500, "SYNC_INFRA_ERROR");
  }
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return await handleWizardStagedApprove(request, context);
}
