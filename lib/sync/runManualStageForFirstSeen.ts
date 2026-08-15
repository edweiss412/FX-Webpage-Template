import { randomUUID } from "node:crypto";
import type { UpsertAdminAlertInput } from "@/lib/adminAlerts/upsertAdminAlert";
import type { DriveListedFile } from "@/lib/drive/list";
import { log, serializeError } from "@/lib/log";
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
  classifySyncFailure,
  emitSuccessfulPhase2Tail,
  errorPayload,
  evaluateQualityRegression_unlocked,
  logSync,
  resolveStaleSyncProblemAlerts_unlocked,
  type ProcessOneFileDeps,
  type ProcessOneFileResult,
} from "@/lib/sync/runScheduledCronSync";
import type { DiagramVariantFailureRow } from "@/lib/sync/snapshotAssets";

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
  // Census hop 5 (spec §3): like the notice above, the diagram variant failures are
  // produced inside the retry route's withRowTryLock, so they are CARRIED OUT and the
  // caller emits once that lock resolves (invariant 10).
  | {
      outcome: "applied";
      showId: string;
      roleFlagsNotice?: RoleFlagsNotice;
      variantFailures?: DiagramVariantFailureRow[];
    }
  // `degenerate` (spec 2026-08-14 §3.2): set when toResult's exhaustive Phase1Result switch met a
  // variant that cannot arise on a genuine first-seen file (auto_apply_with_holds / shrink_held,
  // both of which require an existing show or prior). Caller-visible behavior is unchanged — the
  // discriminator exists so the single emit site can record a distinct, truthful skip reason
  // instead of silently filing it as a clean phase-1 pass.
  | { outcome: "parsed"; stagedId?: string; degenerate?: "unexpected_phase1_outcome" };

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
): Promise<RunManualStageForFirstSeenResult> {
  // Exhaustive over Phase1Result (spec 2026-08-14 §3.2). The former if-chain fell through to
  // `return null`, which the caller coalesced to `{ outcome: "parsed" }` — so an unhandled
  // phase-1 variant silently became a clean pass, defeating the outcome-layer emit guard from
  // below. The terminating `never` default makes a NEW phase-1 variant a compile error instead.
  // This function emits nothing itself; recording stays at the caller's single emit site.
  switch (result.outcome) {
    case "stage":
      return { outcome: "parsed_pending_review", stagedId: result.stagedId };
    case "hard_fail":
      return { outcome: "hard_failed", errorCode: result.code };
    case "pass":
      return { outcome: "parsed" };
    case "defer":
      return { outcome: "deferred", reason: result.reason };
    // Neither can arise on a genuine first-seen file (each requires an existing show or a prior),
    // so caller-visible behavior stays exactly what the old `return null` coalesce produced; the
    // discriminator only tells the emit site to record a distinct reason.
    case "auto_apply_with_holds":
    case "shrink_held":
      return { outcome: "parsed", degenerate: "unexpected_phase1_outcome" };
    case "auto_publish_ready": {
      const autoPublishFirstSeen = {
        unpublishToken: (deps.createUnpublishToken ?? randomUUID)(),
        unpublishTokenExpiresAt: addHours((deps.now ?? (() => new Date()))(), 24).toISOString(),
      };
      const snapshotAssetsForApply = await (async () => {
        if (!tx.insertPendingSnapshotUpload) return undefined;
        const showId = await tx.readShowId?.(driveFileId);
        return showId
          ? makeSnapshotAssetsForApply(
              showId,
              tx as Parameters<typeof makeSnapshotAssetsForApply>[1],
            )
          : undefined;
      })();
      const snapshotAssetsForApplyForShowId = tx.insertPendingSnapshotUpload
        ? (showId: string) =>
            makeSnapshotAssetsForApply(
              showId,
              tx as Parameters<typeof makeSnapshotAssetsForApply>[1],
            )
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
      if (phase2.variantFailures && phase2.variantFailures.length > 0) {
        applied.variantFailures = phase2.variantFailures;
      }
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
        // Census hop 5: same carry-out as the notice — the caller emits post-lock.
        ...(applied.variantFailures?.length ? { variantFailures: applied.variantFailures } : {}),
      };
    }
    default: {
      const _exhaustive: never = result;
      throw new Error(
        `unreachable Phase1Result outcome: ${String((_exhaustive as { outcome?: string }).outcome)}`,
      );
    }
  }
}

export async function runManualStageForFirstSeen(
  tx: LockedShowTx<RunManualStageForFirstSeenTx>,
  driveFileId: string,
  deps: RunManualStageForFirstSeenDeps = {},
): Promise<RunManualStageForFirstSeenResult> {
  await assertShowLockHeld(tx, driveFileId);
  // Tracked sink (spec 2026-08-14 §3.2): a throw can escape BEFORE any row exists (a phase-1
  // explosion) or AFTER one already landed (the applied tail wrote its row, then a post-tail step
  // threw). A naive catch-emit would file a factually wrong parse_error over a recorded outcome,
  // so the catch below keys on whether the attempt's sink actually fired.
  const baseSink = deps.logSync;
  let rowWritten = false;
  const trackedLogSync: RunManualStageForFirstSeenDeps["logSync"] = baseSink
    ? async (entry) => {
        rowWritten = true;
        await baseSink(entry);
      }
    : undefined;
  // Spec §3.3 branch 3: this path owns its OWN attempt boundary. Captured here, at the
  // top, so the recorded duration covers the whole attempt — and threaded on a COPY, so
  // the caller's deps object is never mutated (same rule as processOneFile's).
  const depsWithStart: RunManualStageForFirstSeenDeps = {
    ...deps,
    ...(trackedLogSync ? { logSync: trackedLogSync } : {}),
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
  try {
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
    const outcome = await toResult(
      tx,
      driveFileId,
      { fileMeta, parseResult, binding },
      depsWithStart,
      result,
    );
    // THE single emit site (spec §3.2). Per-branch emits are the shape that failed here: a branch
    // added without its emit went silent again. Switching on the RESULT outcome makes a new
    // variant a compile error until this mapping says what it records. Cron twins in comments.
    switch (outcome.outcome) {
      case "applied":
        // emitSuccessfulPhase2Tail already wrote this attempt's row; a second one here would
        // double-report the same apply (AC-5).
        break;
      case "parsed_pending_review":
        // cron twin: runScheduledCronSync.ts stage branch.
        await logSync(depsWithStart, driveFileId, {
          outcome: "stage",
          stagedId: outcome.stagedId,
        });
        break;
      case "hard_failed":
        // cron twin: the locked hard_fail branch. First-seen has no shows row, hence showId null.
        // Absorbs the phase-2 `stale` return too (it returns hard_failed carrying phase2.code) —
        // the sink's status column records the code either way.
        await logSync(depsWithStart, driveFileId, {
          outcome: "hard_fail",
          code: outcome.errorCode,
          showId: null,
        });
        break;
      case "deferred":
        // cron twin: the defer branch's mi8_debounce_skip payload.
        await logSync(
          depsWithStart,
          driveFileId,
          { outcome: "skipped", reason: outcome.reason },
          { kind: "mi8_debounce_skip", reason: outcome.reason },
        );
        break;
      case "parsed":
        // No cron twin: phase-1 `pass` means "existing show, clean parse", which on the first-seen
        // stage path stages nothing and applies nothing. Recorded as a skip with a distinct reason
        // so the row stays truthful (sync_log.status is free text — no migration needed).
        await logSync(
          depsWithStart,
          driveFileId,
          {
            outcome: "skipped",
            reason: outcome.degenerate
              ? "first_seen_unexpected_phase1_outcome"
              : "first_seen_phase1_pass",
          },
          outcome.stagedId ? { stagedId: outcome.stagedId } : undefined,
        );
        break;
      default: {
        const _exhaustive: never = outcome;
        throw new Error(
          `unreachable RunManualStageForFirstSeenResult outcome: ${String(
            (_exhaustive as { outcome?: string }).outcome,
          )}`,
        );
      }
    }
    return outcome;
  } catch (error) {
    // Escaped-throw recording (spec §3.2 / AC-3). Direct sink call — no attemptStartedAtMs deps
    // object — so the row carries NULL duration: the attempt aborted, and a partial elapsed time
    // would misreport as a completed one.
    if (!rowWritten) {
      try {
        await depsWithStart.logSync?.({
          driveFileId,
          outcome: "parse_error",
          code: classifySyncFailure(error),
          payload: errorPayload(error),
        });
      } catch (sinkError) {
        // Assigned to a local (NOT chained) so prettier keeps `log.error(` on ONE line —
        // stripLogEmissionCalls cannot match a `log` / `.error` split across lines, which would
        // leak this app_events-only forensic code into the §12.4 producer scans.
        const escalation = log.error("first-seen stage sync_log emit failed", {
          source: "sync.runManualStageForFirstSeen",
          code: "SYNC_LOG_EMIT_FAILED",
          driveFileId,
          error: serializeError(sinkError),
        });
        // Invariant 10 (prod diff review R1 P0): this catch runs INSIDE the caller's held
        // advisory lock, and app_events emits must never extend that window. Fire-and-forget
        // rather than awaited — the same shape as the PARSE_SHEET_THREW forensic emit in
        // runScheduledCronSync. The sync_log write above is the ratified in-lock channel; the
        // app_events escalation is not.
        void escalation.catch(() => {
          /* best-effort: a recording failure must never displace the failure it was recording */
        });
      }
    }
    throw error;
  }
}
