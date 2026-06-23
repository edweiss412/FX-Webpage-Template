import { NextResponse } from "next/server";
import { canonicalize } from "@/lib/email/canonicalize";
import type { LockedShowTx } from "@/lib/sync/lockedShowTx";
import { withPostgresSyncPipelineLock } from "@/lib/sync/runScheduledCronSync";
import {
  readCurrentWizardSessionIdBestEffort,
  WizardSessionSupersededRollbackError,
} from "@/lib/sync/wizardSessionRollback";
import { transitionManifestRow } from "@/app/api/admin/onboarding/pending_ingestions/[id]/retry/route";
import {
  upsertAdminAlert as defaultUpsertAdminAlert,
  type UpsertAdminAlertInput,
} from "@/lib/adminAlerts/upsertAdminAlert";

/**
 * DS3-1 — in-wizard "Permanently ignore" for the Step-3 blocking statuses
 * `live_row_conflict` and `discard_retryable`.
 *
 * These rows have NO `pending_ingestions` and NO `pending_syncs` row (their scan
 * tx rolled back / the staged row was already deleted), so the three existing
 * Ignore routes are unreachable. The only durable identifier is
 * (wizard_session_id, drive_file_id) + `onboarding_scan_manifest.name`. This
 * route sources the ignore from the manifest row directly.
 *
 * It mirrors the shipped `hard_failed` C1 path: it writes the DURABLE LIVE
 * partition (`wizard_session_id IS NULL`) permanent_ignore — which survives the
 * finalize purge (purgeWizardRows deletes only wizard-scoped deferrals) and is the
 * partition cron's skip gate reads — and FLIPS the manifest status to
 * 'permanent_ignore' (it never DELETEs the manifest row; the resolved row still
 * renders the "Permanently ignored" badge and no longer blocks finish). Unlike the
 * live `upsertLiveDeferral`, it writes `drive_file_name` (from `manifest.name`,
 * closing the §6.1 D11 gap).
 *
 * Invariant 2 (single-holder): the per-show advisory lock is acquired at EXACTLY
 * ONE layer — defaultWithRowTx → withPostgresSyncPipelineLock. The writer and the
 * reused `transitionManifestRow` take NO nested lock; they issue plain SQL on the
 * already-locked tx (no M5-R20 deadlock).
 *
 * Invariant 3 (email canon): `deferredByEmail = canonicalize(admin.email)` is
 * computed in TS and bound as a SQL PARAMETER — canonicalize is never called in
 * SQL. `deferred_by_email` is NOT NULL when `wizard_session_id IS NULL` (CHECK
 * deferred_ingestions_deferred_by_scope_check).
 *
 * Tx ordering (round-1 review): the deferral write happens BEFORE the manifest
 * transition. transitionManifestRow returns a boolean; on a CAS miss (false) the
 * route THROWS WizardSessionSupersededRollbackError so the already-written deferral
 * is rolled back (a plain return would COMMIT the orphan — withPostgresSyncPipelineLock
 * commits on normal return).
 */

export type WizardManifestIgnoreRouteTx = LockedShowTx<{
  queryOne<T>(sql: string, params: unknown[]): Promise<T>;
}>;

export type WizardManifestIgnoreRouteDeps = {
  requireAdminIdentity?: () => Promise<{ email: string }>;
  withRowTx?: <R>(
    driveFileId: string,
    fn: (tx: WizardManifestIgnoreRouteTx) => Promise<R> | R,
  ) => Promise<R>;
  // Post-rollback WIZARD_SESSION_SUPERSEDED_RACE alert producer (its own
  // transaction — never the aborted one) + best-effort current-session read.
  upsertAdminAlert?: (input: UpsertAdminAlertInput) => Promise<string | null>;
  readCurrentWizardSessionId?: () => Promise<string | null>;
};

type RouteContext = {
  params: Promise<{ wizardSessionId: string; driveFileId: string }>;
};

type ManifestRow = {
  name: string | null;
  status: string;
};

const IGNORABLE_STATUSES: ReadonlySet<string> = new Set([
  "live_row_conflict",
  "discard_retryable",
]);

async function defaultRequireAdminIdentity(): Promise<{ email: string }> {
  const { requireAdminIdentity } = await import("@/lib/auth/requireAdmin");
  return await requireAdminIdentity();
}

async function defaultWithRowTx<R>(
  driveFileId: string,
  fn: (tx: WizardManifestIgnoreRouteTx) => Promise<R> | R,
): Promise<R> {
  const result = await withPostgresSyncPipelineLock(driveFileId, fn, { tryOnly: false });
  if (typeof result === "object" && result !== null && "skipped" in result) {
    throw new Error("blocking wizard manifest-ignore route returned skipped lock");
  }
  return result;
}

function depsWithDefaults(deps: WizardManifestIgnoreRouteDeps) {
  return {
    requireAdminIdentity: deps.requireAdminIdentity ?? defaultRequireAdminIdentity,
    withRowTx: deps.withRowTx ?? defaultWithRowTx,
  };
}

function errorResponse(status: number, code: string): Response {
  return NextResponse.json({ ok: false, code }, { status });
}

// Read the manifest row FOR UPDATE under the active wizard session. Null result =
// row missing OR the session was superseded (the EXISTS predicate no longer holds).
async function readLockedManifestRow(
  tx: WizardManifestIgnoreRouteTx,
  wizardSessionId: string,
  driveFileId: string,
): Promise<ManifestRow | null> {
  return await tx.queryOne<ManifestRow | null>(
    `
      select name, status
        from public.onboarding_scan_manifest
       where wizard_session_id = $1::uuid
         and drive_file_id = $2
         and exists (
           select 1 from public.app_settings
            where id = 'default'
              and pending_wizard_session_id = $1::uuid
         )
       for update
    `,
    [wizardSessionId, driveFileId],
  );
}

// Write the DURABLE LIVE partition (wizard_session_id IS NULL) permanent_ignore.
// `deferredByEmail` is the TS-canonicalized admin email, bound as a parameter.
// Carries the active-wizard-session EXISTS predicate so a supersession between the
// manifest read and this write no-ops it; the caller converts the 0-row outcome
// into the typed rollback throw. Writes drive_file_name from manifest.name (D11).
async function upsertManifestLivePermanentIgnore(
  tx: WizardManifestIgnoreRouteTx,
  args: {
    wizardSessionId: string;
    driveFileId: string;
    driveFileName: string | null;
    deferredByEmail: string;
  },
): Promise<boolean> {
  const written = await tx.queryOne<{ upserted: boolean } | null>(
    `
      insert into public.deferred_ingestions (
        drive_file_id, deferred_kind, deferred_at_modified_time,
        deferred_by_email, drive_file_name, reason, wizard_session_id
      )
      select $1, 'permanent_ignore', null, $3, $2, 'manifest:permanent_ignore', null
      where exists (
        select 1 from public.app_settings
         where id = 'default'
           and pending_wizard_session_id = $4::uuid
      )
      on conflict (drive_file_id) where wizard_session_id is null
      do update set
        deferred_kind = excluded.deferred_kind,
        deferred_at_modified_time = excluded.deferred_at_modified_time,
        deferred_by_email = excluded.deferred_by_email,
        drive_file_name = excluded.drive_file_name,
        reason = excluded.reason,
        deferred_at = now()
      returning true as upserted
    `,
    [args.driveFileId, args.driveFileName, args.deferredByEmail, args.wizardSessionId],
  );
  return Boolean(written?.upserted);
}

export async function handleWizardManifestIgnore(
  _request: Request,
  context: RouteContext,
  routeDeps: WizardManifestIgnoreRouteDeps = {},
): Promise<Response> {
  const deps = depsWithDefaults(routeDeps);
  let admin: { email: string };
  try {
    admin = await deps.requireAdminIdentity();
  } catch (error) {
    const code =
      typeof error === "object" && error !== null ? (error as { code?: unknown }).code : null;
    if (code === "ADMIN_SESSION_LOOKUP_FAILED") return errorResponse(500, "ADMIN_SESSION_LOOKUP_FAILED");
    return errorResponse(403, "ADMIN_FORBIDDEN");
  }

  // Email canon is a TS boundary (invariant 3) — compute the canonical value here
  // and bind it as a SQL parameter; never canonicalize() inside SQL.
  const deferredByEmail = canonicalize(admin.email);
  if (!deferredByEmail) {
    // Non-canonicalizable admin identity is an infra/auth fault, not user-correctable.
    return errorResponse(500, "ADMIN_SESSION_LOOKUP_FAILED");
  }

  const { wizardSessionId, driveFileId } = await context.params;

  try {
    return await deps.withRowTx(driveFileId, async (tx) => {
      const manifest = await readLockedManifestRow(tx, wizardSessionId, driveFileId);
      if (!manifest) {
        // Row missing or session superseded — no mutation has run, safe to refuse.
        return errorResponse(409, "WIZARD_SESSION_SUPERSEDED");
      }
      if (!IGNORABLE_STATUSES.has(manifest.status)) {
        // Status-gate (resolved decision): only live_row_conflict / discard_retryable
        // are ignorable here. No mutation has run, safe to refuse.
        return errorResponse(409, "INVALID_REVIEWER_ACTION");
      }

      const rollbackContext = {
        attemptedAction: "permanent_ignore" as const,
        supersededSessionId: wizardSessionId,
        driveFileId,
      };

      // Tx ordering: deferral FIRST, then the manifest transition.
      const wroteDeferral = await upsertManifestLivePermanentIgnore(tx, {
        wizardSessionId,
        driveFileId,
        driveFileName: manifest.name,
        deferredByEmail,
      });
      if (!wroteDeferral) {
        throw new WizardSessionSupersededRollbackError(rollbackContext);
      }

      // transitionManifestRow returns a boolean; a CAS miss (false) means the
      // session was superseded BETWEEN the deferral write and here. The deferral is
      // already written, so we MUST throw to roll back the whole tx (a plain return
      // would COMMIT the orphaned deferral — withPostgresSyncPipelineLock commits on
      // normal return). No pending_ingestions / pending_syncs touch.
      const ok = await transitionManifestRow(
        tx,
        { wizard_session_id: wizardSessionId, drive_file_id: driveFileId },
        "permanent_ignore",
      );
      if (!ok) {
        throw new WizardSessionSupersededRollbackError(rollbackContext);
      }

      return NextResponse.json({
        status: "ignored",
        drive_file_id: driveFileId,
        wizard_session_id: wizardSessionId,
      });
    });
  } catch (error) {
    if (error instanceof WizardSessionSupersededRollbackError) {
      // Transaction already aborted. The alert write runs on its own service-role
      // transaction (never the aborted one); best-effort, never masks the 409.
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
        console.error("WIZARD_SESSION_SUPERSEDED_RACE alert write failed", alertError);
      }
      return errorResponse(409, "WIZARD_SESSION_SUPERSEDED");
    }
    throw error;
  }
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return await handleWizardManifestIgnore(request, context);
}
