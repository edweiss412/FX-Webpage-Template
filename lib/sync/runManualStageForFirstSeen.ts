import { randomUUID } from "node:crypto";
import type { UpsertAdminAlertInput } from "@/lib/adminAlerts/upsertAdminAlert";
import type { DriveListedFile } from "@/lib/drive/list";
import type { ParseResult } from "@/lib/parser/types";
import {
  makeSnapshotAssetsForApply,
  type SnapshotAssetsApplyTx,
} from "@/lib/sync/defaultSnapshotAssetsForApply";
import { assertShowLockHeld, type LockedShowTx } from "@/lib/sync/lockedShowTx";
import {
  runPhase1,
  type Phase1Deps,
  type Phase1PendingSyncRow,
  type Phase1Result,
} from "@/lib/sync/phase1";
import { runPhase2, type Phase2Tx, type RoleFlagsNotice } from "@/lib/sync/phase2";
import { normalizeRoleTokenMappings } from "@/lib/sync/roleMappingOverlay";
import {
  emitSuccessfulPhase2Tail,
  evaluateQualityRegression_unlocked,
  resolveStaleSyncProblemAlerts_unlocked,
  type ProcessOneFileDeps,
  type ProcessOneFileResult,
} from "@/lib/sync/runScheduledCronSync";

export type RunManualStageForFirstSeenTx = Phase2Tx & {
  readShowId?(driveFileId: string): Promise<string | null>;
  insertPendingSnapshotUpload?: SnapshotAssetsApplyTx["insertPendingSnapshotUpload"];
  markPendingSnapshotDeleteStarted?: SnapshotAssetsApplyTx["markPendingSnapshotDeleteStarted"];
  deleteRevisionRaceCooldowns?(driveFileId: string): Promise<void>;
  queryOne<T>(sql: string, params: unknown[]): Promise<T>;
  upsertAdminAlert(input: UpsertAdminAlertInput): Promise<string | null>;
  deleteLivePendingIngestion(driveFileId: string): Promise<void>;
  upsertLivePendingSync(
    row: Omit<Phase1PendingSyncRow, "stagedId"> & { stagedId?: string },
  ): Promise<{ stagedId: string }>;
};

export type RunManualStageForFirstSeenResult =
  | { outcome: "parsed_pending_review"; stagedId: string }
  | { outcome: "hard_failed"; errorCode: string }
  | { outcome: "deferred"; reason: "mi8_modtime_unstable" | "mi8b_modtime_unstable" }
  // Unit C (spec 2026-08-03-apply-undo-audit-fidelity §2.3): this function BUILDS a roleFlagsNotice
  // and used to return only { outcome, showId }, discarding it. It runs INSIDE the pending-ingestion
  // retry route's withRowTryLock, so emitting here would put a post-commit emit inside a held lock
  // (invariant 10). It therefore CARRIES the notice out and the caller emits once that lock resolves
  // (app/api/admin/pending-ingestions/[id]/retry/route.ts). OPTIONAL, mirroring the same field on
  // Phase2Result / ProcessOneFileResult — absent means "no capability change to report".
  | { outcome: "applied"; showId: string; roleFlagsNotice?: RoleFlagsNotice }
  | { outcome: "parsed"; stagedId?: string };

export type RunManualStageForFirstSeenDeps = {
  fileMeta?: DriveListedFile;
  parseResult?: ParseResult;
  binding?: { bindingToken: string; modifiedTime: string };
  runPhase1?: typeof runPhase1;
  getAutoPublishCleanFirstSeen?: Phase1Deps["getAutoPublishCleanFirstSeen"];
  runPhase2?: typeof runPhase2;
  createUnpublishToken?: () => string;
  now?: () => Date;
  upsertAdminAlert?: ProcessOneFileDeps["upsertAdminAlert"];
  publishShowInvalidation?: ProcessOneFileDeps["publishShowInvalidation"];
  logSync?: ProcessOneFileDeps["logSync"];
  /** Set by runManualStageForFirstSeen at its own entry; read by logSync via the tail. */
  attemptStartedAtMs?: number;
};

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

async function toResult(
  tx: LockedShowTx<RunManualStageForFirstSeenTx>,
  driveFileId: string,
  args: {
    fileMeta: DriveListedFile;
    parseResult: ParseResult;
    binding: { bindingToken: string; modifiedTime: string };
  },
  deps: RunManualStageForFirstSeenDeps,
  result: Phase1Result,
): Promise<RunManualStageForFirstSeenResult | null> {
  if (result.outcome === "stage") {
    return { outcome: "parsed_pending_review", stagedId: result.stagedId };
  }
  if (result.outcome === "hard_fail") {
    return { outcome: "hard_failed", errorCode: result.code };
  }
  if (result.outcome === "pass") return { outcome: "parsed" };
  if (result.outcome === "auto_publish_ready") {
    const autoPublishFirstSeen = {
      unpublishToken: (deps.createUnpublishToken ?? randomUUID)(),
      unpublishTokenExpiresAt: addHours((deps.now ?? (() => new Date()))(), 24).toISOString(),
    };
    const snapshotAssetsForApply = await (async () => {
      if (!tx.insertPendingSnapshotUpload) return undefined;
      const showId = await tx.readShowId?.(driveFileId);
      return showId
        ? makeSnapshotAssetsForApply(showId, tx as Parameters<typeof makeSnapshotAssetsForApply>[1])
        : undefined;
    })();
    const snapshotAssetsForApplyForShowId = tx.insertPendingSnapshotUpload
      ? (showId: string) =>
          makeSnapshotAssetsForApply(showId, tx as Parameters<typeof makeSnapshotAssetsForApply>[1])
      : undefined;
    // §6.2 loader: the GLOBAL role_token_mappings vocabulary (normalized). Threaded so a first-seen
    // auto-publish applies pre-existing global mappings IMMEDIATELY — behavioral parity with the cron
    // first-seen path (_phase2ArgsParityContract).
    // first-publish-only: priorParseWarnings is NOT threaded — a genuine first publish has no prior;
    // ROLE_TOKEN_MAPPED is not emitted on this path (not one of §10 point 5's three surfaces), but any
    // applied flag delta still surfaces via the ROLE_FLAGS_NOTICE changes feed inside runPhase2.
    const roleMappingAgg = await tx.queryOne<{ rows: unknown }>(
      `select coalesce(jsonb_agg(jsonb_build_object(
          'token', token, 'grants', grants, 'decided_by', decided_by, 'decided_at', decided_at)), '[]'::jsonb) as rows
         from role_token_mappings`,
      [],
    );
    const roleTokenMappings = normalizeRoleTokenMappings(roleMappingAgg?.rows ?? []);
    const phase2 = await (deps.runPhase2 ?? runPhase2)(tx, {
      driveFileId,
      mode: "manual",
      fileMeta: args.fileMeta,
      parseResult: args.parseResult,
      binding: args.binding,
      roleTokenMappings,
      ...(snapshotAssetsForApply ? { snapshotAssetsForApply } : {}),
      ...(snapshotAssetsForApplyForShowId ? { snapshotAssetsForApplyForShowId } : {}),
      verifyReelOnApply: false,
      autoPublishFirstSeen,
      // Phase 2 parity with the cron path. A first-seen sheet has no prior — no notable diffs
      // to log and no MI-11 holds and no rename pairs to identity-link.
      notableItems: [],
      identityLinkRenames: [],
    });
    if (phase2.outcome === "stale") {
      return { outcome: "hard_failed", errorCode: phase2.code };
    }
    const applied: Extract<ProcessOneFileResult, { outcome: "applied" }> = {
      outcome: "applied",
      showId: phase2.showId,
      // §02 (FIX-3 / R16): source the sync_log parse_warnings from this apply's outcome (manual
      // first-seen caller #2). tsc-FORCED by the required ProcessOneFileResult.applied.parseWarnings.
      parseWarnings: phase2.parseWarnings ?? [],
      // first-publish-only (§6.2): no mappings threaded on this path → always [] (tsc-required).
      appliedRoleMappings: phase2.appliedRoleMappings,
    };
    if (phase2.roleFlagsNotice) applied.roleFlagsNotice = phase2.roleFlagsNotice;
    if (phase2.snapshotRevisionId) applied.snapshotRevisionId = phase2.snapshotRevisionId;
    await emitSuccessfulPhase2Tail({
      tx,
      result: applied,
      deps: {
        ...deps,
        upsertAdminAlert: deps.upsertAdminAlert ?? tx.upsertAdminAlert.bind(tx),
      },
      driveFileId,
      fileMeta: args.fileMeta,
      parseResult: args.parseResult,
      autoPublishFirstSeen,
    });
    // Tail-parity with the cron applied epilogue (audit #16). First-seen has NO prior published
    // show, so priorParseWarningsRaw is null → the producer returns immediately (no regression is
    // possible on a brand-new show). Present here so the two success tails stay structurally
    // identical (_phase2ArgsParityContract) — a future edit to one must mirror the other.
    await evaluateQualityRegression_unlocked({
      tx,
      deps: {
        ...deps,
        upsertAdminAlert: deps.upsertAdminAlert ?? tx.upsertAdminAlert.bind(tx),
      } as unknown as ProcessOneFileDeps,
      driveFileId,
      showId: applied.showId,
      priorParseWarningsRaw: null,
      nextWarnings: args.parseResult.warnings,
      sheetName: args.parseResult.show.title,
    });
    await resolveStaleSyncProblemAlerts_unlocked(tx, applied.showId, null);
    // Unit C: carry the notice built at `applied.roleFlagsNotice` above out to the caller instead of
    // dropping it here. Conditional spread because `exactOptionalPropertyTypes` forbids assigning an
    // explicit `undefined` to an optional property.
    return {
      outcome: "applied",
      showId: phase2.showId,
      ...(applied.roleFlagsNotice ? { roleFlagsNotice: applied.roleFlagsNotice } : {}),
    };
  }
  if (result.outcome === "defer") {
    return { outcome: "deferred", reason: result.reason };
  }
  return null;
}

export async function runManualStageForFirstSeen(
  tx: LockedShowTx<RunManualStageForFirstSeenTx>,
  driveFileId: string,
  deps: RunManualStageForFirstSeenDeps = {},
): Promise<RunManualStageForFirstSeenResult> {
  await assertShowLockHeld(tx, driveFileId);
  // Spec §3.3 branch 3: this path owns its OWN attempt boundary. Captured here, at the
  // top, so the recorded duration covers the whole attempt — and threaded on a COPY, so
  // the caller's deps object is never mutated (same rule as processOneFile's).
  const depsWithStart: RunManualStageForFirstSeenDeps = {
    ...deps,
    attemptStartedAtMs: (deps.now ?? (() => new Date()))().getTime(),
  };
  if (!deps.fileMeta || !deps.parseResult || !deps.binding) {
    throw new Error(
      "runManualStageForFirstSeen requires pre-fetched fileMeta, parseResult, and binding",
    );
  }
  const fileMeta = deps.fileMeta;
  const binding = deps.binding;
  const parseResult = deps.parseResult;
  const result = await (deps.runPhase1 ?? runPhase1)(
    tx as never,
    {
      driveFileId,
      mode: "manual",
      fileMeta,
      parseResult,
      binding,
    },
    // Task 4.3: thread the auto-publish flag into runPhase1 so the manual-retry first-seen path is
    // gated by the same toggle — OFF makes runPhase1 return "stage" (FIRST_SEEN_REVIEW) instead of
    // "auto_publish_ready", so this path stages for approval rather than auto-applying. When the dep
    // is absent, runPhase1 falls back to its default (real) flag reader.
    deps.getAutoPublishCleanFirstSeen
      ? { getAutoPublishCleanFirstSeen: deps.getAutoPublishCleanFirstSeen }
      : {},
  );
  return (
    (await toResult(
      tx,
      driveFileId,
      { fileMeta, parseResult, binding },
      depsWithStart,
      result,
    )) ?? {
      outcome: "parsed",
    }
  );
}
