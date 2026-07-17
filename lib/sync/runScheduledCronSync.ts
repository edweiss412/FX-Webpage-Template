import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { google } from "googleapis";
import {
  upsertAdminAlert as defaultUpsertAdminAlert,
  type UpsertAdminAlertInput,
} from "@/lib/adminAlerts/upsertAdminAlert";
import {
  getActiveWatchedFolderId,
  type ActiveWatchedFolderResult,
} from "@/lib/appSettings/getWatchedFolderId";
import {
  writeSyncCronHeartbeat as defaultWriteSyncCronHeartbeat,
  type HeartbeatWriteResult,
} from "@/lib/appSettings/writeSyncCronHeartbeat";
import { canonicalize } from "@/lib/email/canonicalize";
import { log, setCronInFlight } from "@/lib/log";
import { runInvariants } from "@/lib/parser/invariants";
import {
  summarizeDataGaps,
  isQualityRegression,
  hasRecoveredToBaseline,
  regressionKind,
  GAP_CLASSES,
  type DataGapsSummary,
} from "@/lib/parser/dataGaps";
import { warningFingerprint } from "@/lib/dataQuality/warningFingerprint";
import { blockDisappearanceWarnings } from "@/lib/sync/blockDisappearance";
import { databaseUrl } from "@/lib/sync/_databaseUrl";
import { ARCHIVED_SKIP_REASON, readShowArchived_unlocked } from "@/lib/sync/lifecycleGuards";
import {
  DRIVE_FILES_GET_TIMEOUT_MS,
  fetchDriveFileMetadata,
  fetchSheetMarkdownAndBytesAtRevision,
  withDriveRetry,
} from "@/lib/drive/fetch";
import { synthesizeMarkdownFromXlsx } from "@/lib/drive/exportSheetToMarkdown";
import { extractSourceAnchors } from "@/lib/drive/sourceAnchors";
import { attachWarningAnchors } from "@/lib/sync/attachWarningAnchors";
import {
  discardAndRerun,
  finalizeArchivedTabs,
  overrideSnapshot,
  reconcileIncludedTab,
  type OverrideSnapshot,
  type PullSheetOverride,
} from "@/lib/sync/pullSheetOverride";
import type { SourceAnchor } from "@/lib/sheet-links/buildSheetDeepLink";
import { getDriveAccessToken, getDriveAuth } from "@/lib/drive/client";
import {
  downloadFileBytes as downloadAgendaFileBytes,
  getAgendaChips,
} from "@/lib/drive/agendaDrive";
import { listFolder as listDriveFolder, type DriveListedFile } from "@/lib/drive/list";
import { emitUnexpectedParentWarning } from "@/lib/sync/logUnexpectedParent";
import { parseSheet as parseMarkdownSheet, buildThrownParsedSheet } from "@/lib/parser";
import type {
  AgendaEntry,
  ParsedSheet,
  ParseResult,
  TriggeredReviewItem,
} from "@/lib/parser/types";
import { decodeRunOfShow } from "@/lib/data/decodeRunOfShow";
import { asTriggeredReviewItems } from "@/lib/staging/triggeredReviewItems";
import {
  enrichWithDrivePins,
  type DriveClient,
  type DriveFileMeta,
  type SpreadsheetSheet,
} from "@/lib/sync/enrichWithDrivePins";
import { readBoundedWebStream } from "@/lib/sync/boundedBytes";
import { createStallGuard, DRIVE_ASSET_STALL_TIMEOUT_MS } from "@/lib/drive/stallGuard";
import { makeSnapshotAssetsForApply } from "@/lib/sync/defaultSnapshotAssetsForApply";
import { revalidateShow, revalidateShowFromResult } from "@/lib/data/showCacheTag";
import { classifyProcessed } from "@/lib/cron/classifyProcessed";
import { SYNC_PROBLEM_CODES, type SyncProblemCode } from "@/lib/notify/constants";
import {
  assertShowLockHeld,
  CONCURRENT_SYNC_SKIPPED,
  type ConcurrentSyncSkipped,
  type LockableSyncTx,
  type LockedShowTx,
  withShowLock,
} from "@/lib/sync/lockedShowTx";
import {
  Phase1InfraError,
  runPhase1,
  syncLayerReviewItems,
  type Phase1Args,
  type Phase1Binding,
  type Phase1Tx,
} from "@/lib/sync/phase1";
import {
  Phase2InfraError,
  runPhase2,
  type Phase2Args,
  type Phase2Mode,
  type Phase2Result,
  type RoleFlagsNotice,
  type Phase2Tx,
} from "@/lib/sync/phase2";
import { computeIdentityLinkRenames } from "@/lib/sync/identityLinkRenames";
import { promoteSnapshotUpload as defaultPromoteSnapshotUpload } from "@/lib/sync/promoteSnapshot";
import {
  type DeferredIngestionRow,
  perFileProcessor,
  type ResolvedSyncMode,
  SyncInfraError,
  type SyncMode,
} from "@/lib/sync/perFileProcessor";
import { normalizeUseRawDecisions } from "@/lib/sync/useRawOverlay";
import { normalizeRoleTokenMappings, type GatedRoleMapping } from "@/lib/sync/roleMappingOverlay";
import { listRoleVocabDriftEligibleFileIds } from "@/lib/sync/roleVocabDrift";
import { resolveUnreadableAlertIfHealed } from "@/lib/adminAlerts/resolveOnboardingSheetUnreadable";
import { emitRoleTokenMapped } from "@/lib/log/emitRoleTokenMapped";
import { emitLeadRoleApplied } from "@/lib/log/emitLeadRoleApplied";

export const STAGED_PARSE_REVISION_RACE = "STAGED_PARSE_REVISION_RACE" as const;
export const STAGED_PARSE_REVISION_RACE_COOLDOWN = "STAGED_PARSE_REVISION_RACE_COOLDOWN" as const;
export const STAGED_PARSE_SOURCE_GONE = "STAGED_PARSE_SOURCE_GONE" as const;
export const SYNC_FILE_FAILED = "SYNC_FILE_FAILED" as const;
export const SYNC_INFRA_ERROR = "SYNC_INFRA_ERROR" as const;
export const SYNC_STEP_TIMEOUT = "SYNC_STEP_TIMEOUT" as const;
export const DRIVE_METADATA_MISSING = "DRIVE_METADATA_MISSING" as const;
export const SHEET_UNAVAILABLE = "SHEET_UNAVAILABLE" as const;
const DRIVE_SYNC_STEP_TIMEOUT_MS = 30_000;
/**
 * audit idx57/#166 — enrichment gets its OWN step budget, decoupled from the 30s single-Drive-call
 * timeout above.
 *
 * `enrichWithDrivePins` fans into `enrichAgenda`, which does up to `AGENDA_MAX_PDFS_PER_SHEET` (6)
 * SEQUENTIAL agenda-PDF downloads, each bounded by `AGENDA_PDF_DEADLINE_MS` (120s). Under the old
 * 30s budget any legitimate multi-PDF agenda pass >30s threw `SyncStepTimeoutError` and hard-failed
 * the WHOLE show — repeatedly. So enrich needs a budget sized to real agenda work, not a single
 * Drive round-trip.
 *
 * Ceiling: the cron entry point `app/api/cron/sync/route.ts` does not override `maxDuration`, so it
 * runs under the project's serverless ceiling of 300s — the value every sibling sync route pins
 * explicitly (`app/api/admin/onboarding/{extract-agenda,finalize,finalize-cas,scan}` all
 * `export const maxDuration = 300`). Per-file processing also spends up to ~120s across the four
 * OTHER 30s `withStepTimeout` Drive-call steps (captureBinding, fetch-markdown, capture-result,
 * reverify-binding) plus ~30s of unwrapped tx/apply work. 300 − 120 − 30 ≈ 150s is the headroom a
 * single file can safely give enrichment without risking a platform kill mid-write.
 *
 * The absolute worst case (6 × 120s = 720s) CANNOT fit 300s, so this budget deliberately does not
 * try to cover it: the per-download `AGENDA_PDF_DEADLINE_MS` (120s) deadline plus the AbortSignal
 * threaded from `withStepTimeout` (which aborts in-flight downloads on overrun) bound the
 * pathological case. The guard is preserved — an overrun still throws `SyncStepTimeoutError`; it is
 * just given a correct, larger budget and made to actually abort its work.
 */
export const ENRICH_STEP_TIMEOUT_MS = 150_000;
type SyncFailureCode =
  | typeof SYNC_FILE_FAILED
  | typeof SYNC_INFRA_ERROR
  | typeof SYNC_STEP_TIMEOUT
  | typeof DRIVE_METADATA_MISSING
  | typeof SHEET_UNAVAILABLE
  | "LOCK_OWNERSHIP_ASSERTION_FAILED";

export type RevisionRaceCooldown = {
  retryCount: number;
  cooldownSeconds: number;
  cooldownRemainingMs: number;
};

export function revisionRaceCooldownSeconds(retryCount: number): number {
  return Math.min(60 * 2 ** retryCount, 600);
}

type RevisionRaceCooldownTx = {
  readRevisionRaceCooldown(
    driveFileId: string,
    racedHeadRevisionId: string,
  ): Promise<RevisionRaceCooldown | null>;
  upsertRevisionRaceCooldown(
    driveFileId: string,
    racedHeadRevisionId: string,
  ): Promise<{ retryCount: number; cooldownSeconds: number }>;
  deleteRevisionRaceCooldowns(driveFileId: string): Promise<void>;
};

type LiveDeferralTx = {
  readLiveDeferral(driveFileId: string): Promise<DeferredIngestionRow | null>;
  deleteLiveDeferral(driveFileId: string): Promise<void>;
};

type SnapshotApplyTx = {
  readShowId?(driveFileId: string): Promise<string | null>;
  insertPendingSnapshotUpload(row: {
    showId: string;
    driveFileId: string;
    tempPrefix: string;
    snapshotRevisionId: string;
    assetCount: number;
  }): Promise<void>;
  markPendingSnapshotDeleteStarted?(snapshotRevisionId: string): Promise<void>;
};

export type SyncPipelineTx = LockableSyncTx &
  Phase1Tx &
  Phase2Tx &
  Partial<SnapshotApplyTx> &
  Partial<RevisionRaceCooldownTx> &
  Partial<LiveDeferralTx>;

export function syncProblemCodeForStatus(
  status: string | null | undefined,
): SyncProblemCode | null {
  if (status === "drive_error") return "DRIVE_FETCH_FAILED";
  if (status === "parse_error") return "PARSE_ERROR_LAST_GOOD";
  if (status === "sheet_unavailable") return "SHEET_UNAVAILABLE";
  if (status === "shrink_held") return "RESYNC_SHRINK_HELD";
  return null;
}

export async function resolveStaleSyncProblemAlerts_unlocked(
  tx: Pick<SyncPipelineTx, "queryOne">,
  showId: string | null | undefined,
  currentCode: SyncProblemCode | null,
): Promise<void> {
  if (!showId) return;
  await tx.queryOne<{ resolved: true } | undefined>(
    `
      update public.admin_alerts a
         set resolved_at = now()
       where a.show_id = $1::uuid
         and a.resolved_at is null
         and a.code = any($2::text[])
         and a.code <> coalesce($3::text, '')
       returning true as resolved
    `,
    [showId, [...SYNC_PROBLEM_CODES], currentCode],
  );
}

// ── Unit C (audit #16): RESYNC_QUALITY_REGRESSED — post-apply data-quality regression alert ──
// Per-show self-relative (corpus proves gap totals are show-intrinsic 0..120, so an absolute floor
// is meaningless). Baseline-anchored: the OPEN alert stores the pre-regression summary as
// context.baseline; it clears only when EVERY class recovers to ≤ baseline (hasRecoveredToBaseline).

/** Auto-resolve the open per-show regression alert (full per-class recovery to baseline). */
export async function resolveQualityRegression_unlocked(
  tx: Pick<SyncPipelineTx, "queryOne">,
  showId: string,
): Promise<void> {
  // live-partition:live-only — resolves the live per-show regression alert; never runs from a
  // wizard/onboarding apply (the producer is wired only in the cron applied epilogue + first-seen
  // retry no-op, NOT in applyStagedCore). Not reachable from the core apply surface.
  await tx.queryOne<{ resolved: true } | undefined>(
    `
      update public.admin_alerts
         set resolved_at = now()
       where show_id = $1::uuid
         and code = 'RESYNC_QUALITY_REGRESSED'
         and resolved_at is null
       returning true as resolved
    `,
    [showId],
  );
}

type QualityRegressionPayload = {
  breakdown: Record<string, number>;
  new_classes: string[];
  worsened: string[];
};

function buildRegressionPayload(
  prior: DataGapsSummary,
  current: DataGapsSummary,
): QualityRegressionPayload {
  const breakdown: Record<string, number> = {};
  const new_classes: string[] = [];
  const worsened: string[] = [];
  for (const c of GAP_CLASSES) {
    // Gate-exempt classes (e.g. VENUE_GEOCODE_UNRESOLVED) are badge-visible but never
    // open/populate a push alert — skip so they can't leak into the payload breakdown.
    if ((c as { gateExempt?: boolean }).gateExempt) continue;
    const p = prior.classes[c.code];
    const n = current.classes[c.code];
    if (n > 0) breakdown[c.code] = n;
    const kind = regressionKind(p, n); // single-sourced with isQualityRegression (no drift)
    if (kind === "new") new_classes.push(c.code);
    else if (kind === "worsened") worsened.push(c.code);
  }
  return { breakdown, new_classes, worsened };
}

/** Order-insensitive string-set equality (dedupes + compares membership). */
function sameStringSet(a: readonly string[], b: readonly string[]): boolean {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size !== sb.size) return false;
  for (const x of sa) if (!sb.has(x)) return false;
  return true;
}

/** Order-insensitive payload equality for the §6.4a no-op gate (no JSON.stringify — jsonb boundary). */
function payloadEqual(a: QualityRegressionPayload, b: QualityRegressionPayload): boolean {
  const aKeys = Object.keys(a.breakdown);
  const bKeys = Object.keys(b.breakdown);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) if (a.breakdown[k] !== b.breakdown[k]) return false;
  return sameStringSet(a.new_classes, b.new_classes) && sameStringSet(a.worsened, b.worsened);
}

/**
 * Evaluate a post-apply data-quality regression for an EXISTING published show and raise /
 * keep-open (payload-gated no-op) / resolve the per-show RESYNC_QUALITY_REGRESSED alert.
 * Called from the applied epilogue with the PRE-apply `priorShow` snapshot.
 */
export async function evaluateQualityRegression_unlocked(args: {
  tx: Pick<SyncPipelineTx, "queryOne">;
  deps: ProcessOneFileDeps;
  driveFileId: string;
  showId: string | null | undefined;
  priorParseWarningsRaw: ParseResult["warnings"] | null;
  nextWarnings: ParseResult["warnings"];
  sheetName: string;
}): Promise<void> {
  const { tx, deps, driveFileId, showId, priorParseWarningsRaw, nextWarnings, sheetName } = args;
  if (!showId || priorParseWarningsRaw === null) return; // §6.5 record-and-skip / not published

  const prior = summarizeDataGaps(priorParseWarningsRaw);
  const current = summarizeDataGaps(nextWarnings);

  // live-partition:live-only — reads/raises the live per-show regression alert; reachable only
  // from the cron applied epilogue (+ first-seen retry no-op), never from a wizard/core apply.
  const open = await tx.queryOne<{ context: Record<string, unknown> } | undefined>(
    `select context from public.admin_alerts
      where show_id = $1::uuid and code = 'RESYNC_QUALITY_REGRESSED' and resolved_at is null`,
    [showId],
  );

  // Decide the terminal action; funnel BOTH raise paths through ONE upsert call so the
  // show-scoping raise-site pin (_metaAlertActionsContract) matches exactly once.
  let context: Record<string, unknown> | null = null;

  if (!open) {
    if (!isQualityRegression(prior, current)) return; // no regression, no open alert → nothing to do
    context = {
      drive_file_id: driveFileId,
      sheet_name: sheetName,
      ...buildRegressionPayload(prior, current),
      baseline: prior, // pre-regression anchor
    };
  } else {
    const baseline = open.context.baseline as DataGapsSummary;
    if (hasRecoveredToBaseline(baseline, current)) {
      await resolveQualityRegression_unlocked(tx, showId); // full per-class recovery → resolve
      return;
    }
    // keep open — payload-gated no-op (§6.4a): skip the upsert when nothing material changed.
    const nextPayload = buildRegressionPayload(baseline, current);
    const storedPayload: QualityRegressionPayload = {
      breakdown: (open.context.breakdown as Record<string, number>) ?? {},
      new_classes: (open.context.new_classes as string[]) ?? [],
      worsened: (open.context.worsened as string[]) ?? [],
    };
    // The no-op ALSO requires the displayed identity fields (sheet_name, drive_file_id) to be
    // unchanged — otherwise a pure rename would leave the Bell/per-show copy pointing at the stale
    // name forever (Codex whole-diff R1). A rename re-upserts once (one re-ping), refreshing the copy.
    const identityUnchanged =
      open.context.sheet_name === sheetName && open.context.drive_file_id === driveFileId;
    if (payloadEqual(nextPayload, storedPayload) && identityUnchanged) return; // no bump, no re-ping
    context = { drive_file_id: driveFileId, sheet_name: sheetName, ...nextPayload, baseline }; // baseline preserved
  }

  // Single show-scoped raise site (open OR materially-changed keep-open). `showId` is guarded
  // non-null above; the `showId,` shorthand is pinned by _metaAlertActionsContract RAISE_SITE_PINS
  // so a `showId: null` regression fails the pin (per-show row must not collapse into a global one).
  const upsertAdminAlert = requireTxBoundUpsertAdminAlert(deps, "evaluateQualityRegression");
  await upsertAdminAlert({
    showId,
    code: "RESYNC_QUALITY_REGRESSED",
    context,
  });
}

export type ProcessOneFileResult =
  | { outcome: "skipped"; reason: string }
  | { outcome: "asset_recovery" }
  | { outcome: "stage"; stagedId: string }
  | { outcome: "hard_fail"; code: string; showId?: string | null }
  // Re-sync quality gate (audit finding #3): material shrinkage (MI-6/MI-7) on an existing show
  // retains last-good instead of clobbering. No `code` field (Codex plan-R7) — the alert code is
  // raised at the caller's raise site (a later task), and keeping it off means the manual route's
  // `"code" in result` error branch never matches a hold. showId carries so the file loop busts
  // the crew cache tag (the hold committed shows.last_sync_status='shrink_held').
  | { outcome: "shrink_held"; showId?: string | null; detail: string; heldModifiedTime: string }
  | {
      outcome: "applied";
      showId: string;
      roleFlagsNotice?: RoleFlagsNotice;
      snapshotRevisionId?: string;
      // §02 (FIX-3 / R16 structural defense): REQUIRED so tsc forces EVERY tail caller that builds
      // an applied result (cron / manual / staged) to supply it — a future 4th caller cannot
      // silently drop the sync_log channel. The applied path's sync_log parse_warnings is sourced
      // from here (NOT from the tail's separate parseResult arg, which the runPhase2 rebind makes
      // unreliable). Callers source from their own apply outcome (phase2.parseWarnings ?? [] /
      // coreResult.parseWarnings). [] is a valid empty value; the per-caller runtime tests pin
      // correct SOURCING.
      parseWarnings: ParseResult["warnings"];
      // §10 points 4/5: post-gate, emission-ready ROLE_TOKEN_MAPPED entries carried out of the
      // locked apply so processOneFile's post-commit region emits them (invariant 10). REQUIRED
      // (parseWarnings precedent) so every applied-result builder — cron/manual core AND the
      // staged tail — must supply it; a future caller cannot silently drop the telemetry channel.
      // [] is a valid empty value (nothing gate-passing / no mappings).
      appliedRoleMappings: GatedRoleMapping[];
    }
  | { outcome: "stale"; code: string }
  | { outcome: "revision_race"; code: typeof STAGED_PARSE_REVISION_RACE }
  | {
      outcome: "revision_race_cooldown";
      code: typeof STAGED_PARSE_REVISION_RACE_COOLDOWN;
      cooldownRemainingMs: number;
      retryCount: number;
    }
  // nav-perf tag-caching (whole-diff R2): source_gone / parse_error carry the
  // OPTIONAL showId the markShow* recovery write read back (RETURNING id). These
  // outcomes commit `shows.last_sync_status` (projected by StaleFooter via
  // getShowForViewer's `lastSyncStatus`), so post-commit callers revalidate the
  // show's cache tag via `revalidateShowFromResult` (showId-presence gate). null /
  // absent when no public.shows row was matched (first-seen / pending-ingestion
  // path) — then there is no projected show to bust, so the gate correctly no-ops.
  | { outcome: "source_gone"; code: typeof STAGED_PARSE_SOURCE_GONE; showId?: string | null }
  | { outcome: "source_gone"; code: typeof SHEET_UNAVAILABLE; showId?: string | null }
  | {
      outcome: "parse_error";
      code: SyncFailureCode;
      showId?: string | null;
    }
  | ConcurrentSyncSkipped;

export type SyncLogEntry = {
  driveFileId: string | null;
  outcome: string;
  code?: string;
  payload?: Record<string, unknown>;
  // §02 (D-7 / FIX-3): the parse warnings to union into the persisted parse_warnings $5 array
  // (sync_log channel). Set ONLY for the applied outcome (the parser-owned codes + any sync-emitted
  // AGENDA_DAY_EMPTIED). insertSyncLog unions these alongside the per-outcome payload row.
  parseWarnings?: ParseResult["warnings"];
};

export type SyncPipelineTxBoundDeps = {
  upsertAdminAlert(input: UpsertAdminAlertInput): Promise<string | null>;
};

export type CronLiveShowRow = {
  showId: string;
  driveFileId: string;
  lastSeenModifiedTime: string | null;
  wizardSessionId: string | null;
  /**
   * Show title (sheet name) — projected so SHEET_UNAVAILABLE admin
   * alerts can supply `sheet_name` in admin_alerts.context for the
   * (live-partition:n/a — doc reference, no statement)
   * §12.4 `<sheet-name>` placeholder interpolation (M9 C0 round-7 fix).
   * Nullable for shows that haven't successfully parsed yet, or for
   * legacy rows that pre-date title population.
   */
  title: string | null;
};

type CronRecoveryTx = SyncPipelineTx & {
  markShowSheetUnavailable(
    driveFileId: string,
    code: typeof SHEET_UNAVAILABLE | typeof STAGED_PARSE_SOURCE_GONE,
  ): Promise<{
    showId: string | null;
    lastSeenModifiedTime: string | null;
    title: string | null;
  }>;
  markShowDriveError(
    driveFileId: string,
    code: string,
  ): Promise<{ showId: string | null; lastSeenModifiedTime: string | null; title: string | null }>;
  insertSyncLog(entry: SyncLogEntry, showId?: string | null): Promise<void>;
  upsertAdminAlert(input: UpsertAdminAlertInput): Promise<string | null>;
};

export type ProcessOneFileDeps = {
  withShowLock?: (
    driveFileId: string,
    fn: (
      tx: LockedShowTx<SyncPipelineTx>,
      txDeps?: SyncPipelineTxBoundDeps,
    ) => Promise<ProcessOneFileResult> | ProcessOneFileResult,
    options?: Parameters<typeof withShowLock<SyncPipelineTx, ProcessOneFileResult>>[2],
  ) => Promise<ProcessOneFileResult | ConcurrentSyncSkipped>;
  perFileProcessor?: typeof perFileProcessor;
  /**
   * Role-vocab drift pre-pass (spec 2026-07-16-role-vocab-mapping-convergence §3.3): the tick's
   * derived set of published drive_file_ids whose stored role vocabulary drifted from the live
   * `role_token_mappings`. Membership makes the cron gate rescue the plain watermark skip and mark
   * the run `driftResync`. Cron-only — manual/push/onboarding callers never set it.
   */
  roleVocabDriftEligibleIds?: ReadonlySet<string>;
  captureBinding?: (driveFileId: string, fileMeta: DriveListedFile) => Promise<Phase1Binding>;
  fetchMarkdownAtRevision?: (driveFileId: string, revisionId: string) => Promise<string>;
  /**
   * Task 5 (test injection): raw XLSX bytes for the revision (used by extractSourceAnchors).
   * Only consulted when fetchMarkdownAtRevision is also injected (test path). On the real
   * path, fetchSheetMarkdownAndBytesAtRevision performs a single Drive export and returns
   * both markdown and bytes together — no second export ever occurs.
   */
  fetchXlsxBytes?: (driveFileId: string, revisionId: string) => Promise<ArrayBuffer>;
  parseSheet?: (markdown: string, filename?: string) => ParsedSheet;
  enrichWithDrivePins?: (
    parsed: ParsedSheet,
    driveClient: DriveClient,
    ctx: {
      driveFileId: string;
      fileMeta: DriveFileMeta;
      sheets?: SpreadsheetSheet[];
      signal?: AbortSignal;
    },
  ) => Promise<ParseResult>;
  /**
   * Finding C7: read the currently-stored `shows.agenda_links` so the fresh parse can be
   * seeded with prior `extracted` payloads BEFORE enrich — the fresh cron/push/manual parse
   * carries no `extracted`, unlike the admin path pre-seeded from `pending_syncs`
   * (live-partition:n/a — doc reference, no statement). Injected in tests; defaults to an
   * unlocked Postgres read.
   */
  readStoredAgendaLinks?: (
    driveFileId: string,
  ) => Promise<ParseResult["show"]["agenda_links"] | null>;
  /**
   * §5.3 cron override read: the durable `shows.pull_sheet_override` for this file. When set,
   * the export threads `includePullSheetFromTab`; a content/tab drift auto-clears it (§5.2).
   * Defaults to an unlocked Postgres read; tests inject a stub.
   */
  readShowPullSheetOverride?: (driveFileId: string) => Promise<PullSheetOverride | null>;
  /**
   * §5.2 forensic sink for the durable-clear event (published-show archived-tab drift). Called
   * post-clear under the show lock with the tab name. Defaults to a `log.warn` code-emit; tests
   * inject a spy to assert the CONTENT_CHANGED code fired.
   */
  emitPullSheetOverrideContentChanged?: (args: {
    driveFileId: string;
    tabName: string;
  }) => Promise<void> | void;
  driveClient?: DriveClient;
  runPhase1?: typeof runPhase1;
  runPhase2?: typeof runPhase2;
  promoteSnapshotUpload?: typeof defaultPromoteSnapshotUpload;
  readRevisionRaceCooldown?: (
    driveFileId: string,
    racedHeadRevisionId: string,
  ) => Promise<RevisionRaceCooldown | null>;
  upsertAdminAlert?: typeof defaultUpsertAdminAlert;
  logSync?: (entry: SyncLogEntry) => Promise<void>;
  publishShowInvalidation?: (showId: string) => Promise<void>;
  createUnpublishToken?: () => string;
  now?: () => Date;
  /**
   * Re-sync quality gate (Task 2): the manual/version-bound accept route sets
   * these to apply a held shrinkage; cron/push never populate them, so the hold
   * is always active on the automatic path. `expectedModifiedTime` version-binds
   * the accept so a newer edit landing between review and accept re-holds.
   */
  acceptShrink?: boolean;
  expectedModifiedTime?: string;
};

export type RunScheduledCronSyncDeps = {
  folderId?: string;
  getActiveWatchedFolderId?: () => Promise<ActiveWatchedFolderResult>;
  listFolder?: typeof listDriveFolder;
  logSync?: (entry: SyncLogEntry) => Promise<void>;
  emitEscapedSyncFailureAlert?: (driveFileId: string, failureCode: string) => Promise<void>;
  listLiveShows?: () => Promise<CronLiveShowRow[]>;
  withShowLock?: <R>(
    driveFileId: string,
    fn: (tx: LockedShowTx<SyncPipelineTx>, txDeps?: SyncPipelineTxBoundDeps) => Promise<R> | R,
    options?: Parameters<typeof withShowLock<SyncPipelineTx, R>>[2],
  ) => Promise<R | ConcurrentSyncSkipped>;
  processOneFile?: (
    driveFileId: string,
    mode: "cron",
    fileMeta: DriveListedFile,
    deps?: Pick<ProcessOneFileDeps, "logSync" | "roleVocabDriftEligibleIds">,
  ) => Promise<ProcessOneFileResult>;
  writeSyncCronHeartbeat?: () => Promise<HeartbeatWriteResult>;
  /**
   * Role-vocab drift pre-pass (Task 6, spec §3.2). Test injection point for the per-tick
   * drift-eligibility scan; production leaves it undefined and the tick calls
   * `listRoleVocabDriftEligibleFileIds` (unless a test-injected `listFolder` suppresses ambient
   * DB reads). An empty result is inert — the file-loop gate treats it as "no rescue".
   */
  listRoleVocabDriftEligible?: () => Promise<ReadonlySet<string>>;
  /**
   * Hybrid-lifecycle observer (spec 2026-07-16 §3.4). Test injection point for
   * the per-tick "resolve the open ONBOARDING_SHEET_UNREADABLE alert if healed"
   * epilogue. Production leaves it undefined and the tick calls the real
   * `resolveUnreadableAlertIfHealed` — UNLESS a test-injected `listFolder`
   * suppresses ambient DB reads (mirrors the listLiveShows / driftEligible
   * guard). An explicitly-injected spy ALWAYS runs (that is how DB/integration
   * tests drive it).
   */
  resolveUnreadableAlertIfHealed?: typeof import("@/lib/adminAlerts/resolveOnboardingSheetUnreadable").resolveUnreadableAlertIfHealed;
};

export type RunScheduledCronSyncResult = {
  processed: Array<{
    driveFileId: string;
    result: ProcessOneFileResult;
  }>;
  summary?:
    | { outcome: "skipped"; skipReason: "no_folder_configured" }
    | { outcome: "parse_error"; code: typeof SYNC_INFRA_ERROR };
  maintenanceFaults?: { syncCronHeartbeat?: "infra_error" };
};

type PostgresTransaction = {
  unsafe(sql: string, params?: unknown[]): Promise<unknown[]>;
};

export const MAX_SHOW_SLUG_INSERT_ATTEMPTS = 20;

export class ShowSlugCollisionRetryExhaustedError extends Error {
  readonly code = "SHOW_SLUG_COLLISION_RETRY_EXHAUSTED";

  constructor(baseSlug: string, attempts: number) {
    super(`Could not allocate a unique show slug for ${baseSlug} after ${attempts} attempts`);
    this.name = "ShowSlugCollisionRetryExhaustedError";
  }
}

function slugCandidateForAttempt(baseSlug: string, attempt: number): string {
  return attempt === 1 ? baseSlug : `${baseSlug}-${attempt}`;
}

/**
 * First-seen show INSERT with slug-collision retry (§6.9 collision policy).
 *
 * The retry is driven by EMPTY RETURNS from a conflict-free
 * `INSERT … ON CONFLICT DO NOTHING RETURNING …` — NEVER by catching 23505.
 * Catch-and-retry inside one transaction is broken on real Postgres: the first
 * unique violation ABORTS the transaction, so attempt 2 fails with 25P02
 * `in_failed_sql_transaction` (live-reproduced via wizard finalize 500 on a
 * first-seen sheet whose derived slug collided with an existing show). With
 * `ON CONFLICT DO NOTHING` no statement ever errors, so the transaction stays
 * healthy across attempts.
 *
 * Because the conflict-free INSERT cannot name two arbiters, an empty return
 * means SOME unique key conflicted — `shows_slug_key` (retry with the next
 * suffix) or `shows_drive_file_id_key` (the caller's existing concurrent-insert
 * stale path; see applyShowSnapshot's `if (!updated) return stale`).
 * `isSlugTaken` disambiguates: under READ COMMITTED the follow-up SELECT runs
 * on a fresh statement snapshot, so a concurrent insert that just committed
 * (the ON CONFLICT speculative-insertion wait) is visible to it.
 */
export async function insertFirstSeenShowWithSlugRetry<T>(args: {
  baseSlug: string;
  insert: (slug: string) => Promise<T | null>;
  isSlugTaken: (slug: string) => Promise<boolean>;
  maxAttempts?: number;
}): Promise<T | null> {
  const maxAttempts = args.maxAttempts ?? MAX_SHOW_SLUG_INSERT_ATTEMPTS;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const candidate = slugCandidateForAttempt(args.baseSlug, attempt);
    const inserted = await args.insert(candidate);
    if (inserted !== null) return inserted;
    // Empty return without a slug conflict → the drive_file_id key conflicted;
    // preserve the caller's null → "stale" contract.
    if (!(await args.isSlugTaken(candidate))) return null;
  }

  throw new ShowSlugCollisionRetryExhaustedError(args.baseSlug, maxAttempts);
}

// The DATABASE_URL resolver lives in a shared module (imported at the top of this file) so the
// drift pre-pass (`roleVocabDrift.ts`) resolves the same url with the same precedence as this
// pipeline (spec §3.2). Re-exported here for the resolver-identity test and any external caller.
export { databaseUrl };

/**
 * §5.3 cron default: read the durable `shows.pull_sheet_override` on a short-lived connection
 * (the prepare phase is pre-lock, DB-tx-free). Best-effort — a fault degrades to "no override"
 * (the fail-safe direction: do NOT force-include archived gear).
 */
async function defaultReadShowPullSheetOverride(
  driveFileId: string,
): Promise<PullSheetOverride | null> {
  const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 1, prepare: false });
  try {
    const rows = (await sql.unsafe(
      `select pull_sheet_override as o from public.shows where drive_file_id = $1 limit 1`,
      [driveFileId],
    )) as Array<{ o: PullSheetOverride | null }>;
    return rows[0]?.o ?? null;
  } catch {
    return null;
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }
}

/**
 * §5.2 default forensic emit for the durable auto-clear (published-show archived-tab drift):
 * a code-carrying `log.warn` (the persisted `code` is the durable signal, not the message).
 */
function defaultEmitPullSheetOverrideContentChanged(args: {
  driveFileId: string;
  tabName: string;
}): void {
  log.warn("PULL_SHEET_OVERRIDE_CONTENT_CHANGED: archived-tab override auto-cleared on drift", {
    code: "PULL_SHEET_OVERRIDE_CONTENT_CHANGED",
    source: "cron_sync",
    driveFileId: args.driveFileId,
    tabName: args.tabName,
  });
}

class PostgresPipelineTx implements SyncPipelineTx {
  constructor(private readonly tx: PostgresTransaction) {}

  async queryOne<T>(sql: string, params: unknown[]): Promise<T> {
    return (await this.one<T>(sql, params)) as T;
  }

  private async rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return (await this.tx.unsafe(sql, params)) as T[];
  }

  private async one<T>(sql: string, params: unknown[] = []): Promise<T | null> {
    const rows = await this.rows<T>(sql, params);
    return rows[0] ?? null;
  }

  holdPort() {
    // Service-role hold-port over the same locked txn (Phase 2 hold writes + hold-aware apply).
    // Rides the existing JS-held show lock; no nested lock-taking RPC (invariant 2).
    return {
      unsafe: (query: string, params: unknown[]) => this.tx.unsafe(query, params),
    };
  }

  async readCurrentDiagrams(driveFileId: string): Promise<unknown> {
    const row = await this.one<{ diagrams: unknown }>(
      "select diagrams from public.shows where drive_file_id = $1 limit 1",
      [driveFileId],
    );
    if (!row?.diagrams || typeof row.diagrams !== "object") return null;
    if ("current" in row.diagrams) return (row.diagrams as { current?: unknown }).current ?? null;
    return row.diagrams;
  }

  async readShowId(driveFileId: string): Promise<string | null> {
    const row = await this.one<{ id: string }>(
      "select id from public.shows where drive_file_id = $1 limit 1",
      [driveFileId],
    );
    return row?.id ?? null;
  }

  async applyDiagramSnapshot(
    driveFileId: string,
    diagrams: ParseResult["diagrams"],
  ): Promise<void> {
    await this.rows(
      `
        update public.shows
           set diagrams = $2::jsonb
         where drive_file_id = $1
      `,
      [driveFileId, diagrams],
    );
  }

  async insertPendingSnapshotUpload(row: {
    showId: string;
    driveFileId: string;
    tempPrefix: string;
    snapshotRevisionId: string;
    assetCount: number;
  }): Promise<void> {
    await this.rows(
      `
        insert into public.pending_snapshot_uploads (
          show_id, drive_file_id, temp_prefix, snapshot_revision_id, asset_count
        )
        values ($1::uuid, $2, $3, $4::uuid, $5)
      `,
      [row.showId, row.driveFileId, row.tempPrefix, row.snapshotRevisionId, row.assetCount],
    );
  }

  async markPendingSnapshotDeleteStarted(snapshotRevisionId: string): Promise<void> {
    await this.rows(
      `
        update public.pending_snapshot_uploads
           set claim_token = coalesce(claim_token, gen_random_uuid()),
               claimed_at = coalesce(claimed_at, now()),
               claim_expires_at = coalesce(claim_expires_at, now()),
               delete_started_at = now()
         where snapshot_revision_id = $1::uuid
           and promoted_at is null
      `,
      [snapshotRevisionId],
    );
  }

  async readShowForPhase1(driveFileId: string) {
    const show = await this.one<{
      id: string;
      drive_file_id: string;
      title: string;
      client_label: string;
      client_contact: unknown;
      template_version: string;
      venue: unknown;
      dates: unknown;
      event_details: unknown;
      agenda_links: unknown;
      diagrams: unknown;
      opening_reel_drive_file_id: string | null;
      opening_reel_drive_modified_time: string | null;
      opening_reel_head_revision_id: string | null;
      opening_reel_mime_type: string | null;
      coi_status: string | null;
      pull_sheet: unknown;
      last_sync_status: string | null;
      last_sync_error: string | null;
      last_seen_modified_time: string | null;
      published: boolean;
    }>(
      `
        select *
          from public.shows
         where drive_file_id = $1
         limit 1
      `,
      [driveFileId],
    );
    if (!show) return null;

    const crewMembers = await this.rows<ParseResult["crewMembers"][number]>(
      `
        select name, email, phone, role, role_flags, date_restriction, stage_restriction, flight_info
          from public.crew_members
         where show_id = $1
         order by name
      `,
      [show.id],
    );
    const hotelReservations = await this.rows<ParseResult["hotelReservations"][number]>(
      `
        select ordinal, hotel_name, hotel_address, names, confirmation_no, check_in, check_out, notes
          from public.hotel_reservations
         where show_id = $1
         order by ordinal
      `,
      [show.id],
    );
    const rooms = await this.rows<ParseResult["rooms"][number]>(
      `
        select kind, name, dimensions, floor, setup, set_time, show_time, strike_time,
               audio, video, lighting, scenic, power, digital_signage, other, notes
          from public.rooms
         where show_id = $1
         order by name
      `,
      [show.id],
    );
    const transportation = await this.one<ParseResult["transportation"]>(
      `
        select driver_name, driver_phone, driver_email, vehicle, license_plate, color,
               parking, schedule, notes, loadout_name, loadout_phone, loadout_email
          from public.transportation
         where show_id = $1
         limit 1
      `,
      [show.id],
    );
    const contacts = await this.rows<ParseResult["contacts"][number]>(
      `
        select kind, name, email, phone, notes
          from public.contacts
         where show_id = $1
         order by kind, name
      `,
      [show.id],
    );
    const internal = await this.one<{
      parse_warnings: ParseResult["warnings"] | null;
      raw_unrecognized: ParseResult["raw_unrecognized"] | null;
      use_raw_decisions: unknown;
    }>(
      `
        select parse_warnings, raw_unrecognized, use_raw_decisions
          from public.shows_internal
         where show_id = $1
         limit 1
      `,
      [show.id],
    );

    return {
      showId: show.id,
      driveFileId: show.drive_file_id,
      lastSeenModifiedTime: show.last_seen_modified_time,
      lastSyncStatus: show.last_sync_status,
      published: show.published,
      lastSyncError: show.last_sync_error,
      priorParseResult: {
        show: {
          title: show.title,
          client_label: show.client_label,
          client_contact: show.client_contact as ParseResult["show"]["client_contact"],
          template_version: show.template_version as ParseResult["show"]["template_version"],
          venue: show.venue as ParseResult["show"]["venue"],
          dates: show.dates as ParseResult["show"]["dates"],
          schedule_phases: {},
          event_details: (show.event_details ?? {}) as ParseResult["show"]["event_details"],
          agenda_links: (show.agenda_links ?? []) as ParseResult["show"]["agenda_links"],
          coi_status: show.coi_status,
          po: null,
          proposal: null,
          invoice: null,
          invoice_notes: null,
        },
        crewMembers,
        hotelReservations,
        rooms,
        transportation,
        contacts,
        pullSheet: show.pull_sheet as ParseResult["pullSheet"],
        diagrams: show.diagrams as ParseResult["diagrams"],
        openingReel: show.opening_reel_drive_file_id
          ? {
              driveFileId: show.opening_reel_drive_file_id,
              drive_modified_time: show.opening_reel_drive_modified_time ?? "",
              headRevisionId: show.opening_reel_head_revision_id ?? "",
              mimeType: show.opening_reel_mime_type ?? "",
            }
          : null,
        raw_unrecognized: internal?.raw_unrecognized ?? [],
        warnings: internal?.parse_warnings ?? [],
        archivedPullSheetTabs: [], // prior-parse reconstruction from live tables; archived-tab list is scan-time only
        hardErrors: [],
      },
      // §6.5: RAW nullable prior warnings — null when the column is NULL OR no shows_internal row
      // (untrustworthy baseline → Unit C skips). NOT coalesced to [] like `warnings` above.
      priorParseWarningsRaw: internal?.parse_warnings ?? null,
      // Task 6: the stored "use raw" decisions, normalized at the single JSONB boundary. First-seen
      // (no shows_internal row / null column) → []. Threaded into runPhase2's overlay on re-sync.
      useRawDecisions: normalizeUseRawDecisions(internal?.use_raw_decisions ?? null),
    };
  }

  async readLivePendingSync(driveFileId: string) {
    const row = await this.one<{
      drive_file_id: string;
      wizard_session_id: string | null;
      base_modified_time: string | null;
      staged_modified_time: string;
      parse_result: ParseResult;
      triggered_review_items: unknown[];
      prior_last_sync_status: string | null;
      prior_last_sync_error: string | null;
      staged_id: string;
      source_kind: string;
      warning_summary: string;
    }>(
      `
        select drive_file_id, wizard_session_id, base_modified_time, staged_modified_time,
               parse_result, triggered_review_items, prior_last_sync_status,
               prior_last_sync_error, staged_id, source_kind, warning_summary
          -- live-partition:live-only — live pending_syncs read (wizard_session_id is null);
          -- cron surface, not reachable from the wizard apply core (F1 Task 1.2/1.7)
          from public.pending_syncs
         where drive_file_id = $1
           and wizard_session_id is null
         limit 1
      `,
      [driveFileId],
    );
    if (!row) return null;
    return {
      driveFileId: row.drive_file_id,
      wizardSessionId: row.wizard_session_id,
      baseModifiedTime: row.base_modified_time,
      stagedModifiedTime: row.staged_modified_time,
      parseResult: row.parse_result,
      triggeredReviewItems: asTriggeredReviewItems(row.triggered_review_items),
      priorLastSyncStatus: row.prior_last_sync_status,
      priorLastSyncError: row.prior_last_sync_error,
      stagedId: row.staged_id,
      sourceKind: row.source_kind,
      warningSummary: row.warning_summary,
    };
  }

  async upsertLivePendingIngestion(row: Parameters<Phase1Tx["upsertLivePendingIngestion"]>[0]) {
    await this.rows(
      `
        -- live-partition:live-only — live pending_ingestions upsert (wizard_session_id null)
        insert into public.pending_ingestions (
          drive_file_id, drive_file_name, last_error_code, last_error_message,
          last_warnings, wizard_session_id, last_seen_modified_time
        )
        values ($1, $2, $3, $4, $5::jsonb, null, $6::timestamptz)
        on conflict (drive_file_id) where wizard_session_id is null
        do update set
          drive_file_name = excluded.drive_file_name,
          last_attempt_at = now(),
          -- live-partition:live-only — live-row on-conflict arm (F1 Task 1.2/1.7)
          attempt_count = public.pending_ingestions.attempt_count + 1,
          last_error_code = excluded.last_error_code,
          last_error_message = excluded.last_error_message,
          last_warnings = excluded.last_warnings,
          last_seen_modified_time = excluded.last_seen_modified_time
      `,
      [
        row.driveFileId,
        row.driveFileName,
        row.lastErrorCode,
        row.lastErrorMessage,
        row.lastWarnings,
        row.lastSeenModifiedTime,
      ],
    );
  }

  async deleteLivePendingIngestion(driveFileId: string) {
    await this.rows(
      `
        delete from public.pending_ingestions
         where drive_file_id = $1
           and wizard_session_id is null
      `,
      [driveFileId],
    );
  }

  async upsertLivePendingSync(row: Parameters<Phase1Tx["upsertLivePendingSync"]>[0]) {
    const upserted = await this.one<{ staged_id: string }>(
      `
        -- live-partition:live-only — live pending_syncs stage write (wizard_session_id null)
        insert into public.pending_syncs (
          drive_file_id, base_modified_time, staged_modified_time, parse_result,
          triggered_review_items, prior_last_sync_status, prior_last_sync_error,
          staged_id, source_kind, warning_summary, wizard_session_id,
          pull_sheet_override_applied
        )
        values ($1, $2::timestamptz, $3::timestamptz, $4::jsonb, $5::jsonb, $6, $7,
                coalesce($8::uuid, gen_random_uuid()), $9, $10, null, $11::jsonb)
        on conflict (drive_file_id) where wizard_session_id is null
        do update set
          parsed_at = now(),
          base_modified_time = excluded.base_modified_time,
          staged_modified_time = excluded.staged_modified_time,
          parse_result = excluded.parse_result,
          triggered_review_items = excluded.triggered_review_items,
          prior_last_sync_status = excluded.prior_last_sync_status,
          prior_last_sync_error = excluded.prior_last_sync_error,
          staged_id = excluded.staged_id,
          source_kind = excluded.source_kind,
          warning_summary = excluded.warning_summary,
          -- §5.8 Flow C: applied snapshot tracks the freshly-staged live parse.
          pull_sheet_override_applied = excluded.pull_sheet_override_applied
        returning staged_id
      `,
      [
        row.driveFileId,
        row.baseModifiedTime,
        row.stagedModifiedTime,
        row.parseResult,
        row.triggeredReviewItems,
        row.priorLastSyncStatus,
        row.priorLastSyncError,
        row.stagedId ?? null,
        row.sourceKind,
        row.warningSummary,
        // $11: §5.8 applied snapshot (raw object|null → jsonb). Absent ⇒ null.
        row.pullSheetOverrideApplied ?? null,
      ],
    );
    return { stagedId: upserted?.staged_id ?? row.stagedId ?? "" };
  }

  async updateShowParseError(
    driveFileId: string,
    error: { code: string; message: string },
  ): Promise<string | null> {
    // `returning id`: the id of the existing shows row this UPDATE touched (used by phase1 to
    // carry showId onto the hard_fail result so the crew cache tag is busted). null when the
    // WHERE matched no row — a first-seen hard-fail writes nothing here. (idx17/#102)
    const rows = await this.rows<{ id: string }>(
      `
        update public.shows
           set last_sync_status = 'parse_error',
               last_sync_error = $2,
               last_synced_at = now()
         where drive_file_id = $1
        returning id
      `,
      // Persist code AND message so the scored VERSION_AMBIGUOUS (and every parser
      // hard-fail) diagnostic survives on the existing-show retain-last-good path.
      // last_sync_error is never consumed as a bare code (verified); it is displayed
      // + carried as an opaque prior_last_sync_error passthrough.
      [driveFileId, `${error.code}: ${error.message}`],
    );
    return rows[0]?.id ?? null;
  }

  async updateShowShrinkHeld(
    driveFileId: string,
    payload: { message: string },
  ): Promise<string | null> {
    // Codex plan-R3: DO NOT advance `last_synced_at` — a hold is NOT a successful sync. Unlike
    // updateShowParseError (whose 'parse_error' status maps to an IMMEDIATE red StaleFooter tier
    // where the timestamp is irrelevant), 'shrink_held' uses AGE-BASED crew escalation (like
    // pending_review). If each repeated cron re-hold on an unchanged sheet refreshed
    // last_synced_at=now(), a persistent hold would look perpetually fresh and the crew footer
    // would NEVER reach SYNC_DELAYED_SEVERE. Leaving last_synced_at at the last successful apply
    // makes crew staleness reflect the TRUE age of the served last-good data.
    const rows = await this.rows<{ id: string }>(
      `
        update public.shows
           set last_sync_status = 'shrink_held',
               last_sync_error = $2,
               last_checked_at = now()
         where drive_file_id = $1
        returning id
      `,
      [driveFileId, payload.message],
    );
    return rows[0]?.id ?? null;
  }

  async updateShowPendingReview(driveFileId: string) {
    await this.rows(
      `
        update public.shows
           set last_sync_status = 'pending_review',
               last_sync_error = null,
               last_synced_at = now(),
               last_checked_at = now()
         where drive_file_id = $1
      `,
      [driveFileId],
    );
  }

  async markShowSheetUnavailable(
    driveFileId: string,
    code: typeof SHEET_UNAVAILABLE | typeof STAGED_PARSE_SOURCE_GONE,
  ) {
    const row = await this.one<{
      id: string;
      last_seen_modified_time: string | null;
      title: string | null;
    }>(
      `
        update public.shows
           set last_sync_status = 'sheet_unavailable',
               last_sync_error = $2,
               last_synced_at = now()
         where drive_file_id = $1
         returning id, last_seen_modified_time, title
      `,
      [driveFileId, code],
    );
    return {
      showId: row?.id ?? null,
      lastSeenModifiedTime: row?.last_seen_modified_time ?? null,
      // Returned so admin_alerts producers can supply `sheet_name` in
      // (live-partition:n/a — doc reference, no statement)
      // context for the §12.4 SHEET_UNAVAILABLE placeholder (M9 C0 R7).
      title: row?.title ?? null,
    };
  }

  async markShowDriveError(driveFileId: string, code: string) {
    const row = await this.one<{
      id: string;
      last_seen_modified_time: string | null;
      title: string | null;
    }>(
      `
        update public.shows
           set last_sync_status = 'drive_error',
               last_sync_error = $2,
               last_synced_at = now()
         where drive_file_id = $1
         returning id, last_seen_modified_time, title
      `,
      [driveFileId, code],
    );
    return {
      showId: row?.id ?? null,
      lastSeenModifiedTime: row?.last_seen_modified_time ?? null,
      title: row?.title ?? null,
    };
  }

  async insertSyncLog(entry: SyncLogEntry, showId?: string | null) {
    await this.rows(
      `
        insert into public.sync_log (show_id, drive_file_id, status, message, parse_warnings)
        values ($1::uuid, $2, $3, $4, $5::jsonb)
      `,
      [
        showId ?? null,
        entry.driveFileId,
        entry.code ?? entry.outcome,
        entry.code ? `${entry.outcome}:${entry.code}` : entry.outcome,
        // §02 (D-7 / FIX-3): preserve the per-outcome payload row AND append the parse warnings.
        [
          ...(entry.payload ? [{ ...entry.payload, outcome: entry.outcome }] : []),
          ...(entry.parseWarnings ?? []),
        ],
      ],
    );
  }

  async upsertAdminAlert(input: UpsertAdminAlertInput): Promise<string | null> {
    const row = await this.one<{ id: string }>(
      "select public.upsert_admin_alert($1::uuid, $2, $3::jsonb)::text as id",
      [input.showId, input.code, input.context],
    );
    return row?.id ?? null;
  }

  async readRevisionRaceCooldown(
    driveFileId: string,
    racedHeadRevisionId: string,
  ): Promise<RevisionRaceCooldown | null> {
    const row = await this.one<{
      retry_count: number;
      cooldown_seconds: number;
      cooldown_remaining_ms: number;
    }>(
      `
        with cooldown as (
          select
            retry_count,
            least((60 * power(2, retry_count))::int, 600) as cooldown_seconds,
            last_race_at
          from public.revision_race_cooldowns
         where drive_file_id = $1
           and raced_head_revision_id = $2
           and retry_count > 0
         limit 1
        )
        select
          retry_count,
          cooldown_seconds,
          greatest(
            0,
            ceil(extract(epoch from (last_race_at + cooldown_seconds * interval '1 second' - now())) * 1000)
          )::bigint as cooldown_remaining_ms
          from cooldown
         where now() < last_race_at + cooldown_seconds * interval '1 second'
      `,
      [driveFileId, racedHeadRevisionId],
    );
    if (!row) return null;
    return {
      retryCount: row.retry_count,
      cooldownSeconds: row.cooldown_seconds,
      cooldownRemainingMs: Number(row.cooldown_remaining_ms),
    };
  }

  async upsertRevisionRaceCooldown(
    driveFileId: string,
    racedHeadRevisionId: string,
  ): Promise<{ retryCount: number; cooldownSeconds: number }> {
    const row = await this.one<{ retry_count: number; cooldown_seconds: number }>(
      `
        with upserted as (
          insert into public.revision_race_cooldowns (
            drive_file_id, raced_head_revision_id, last_race_at, retry_count
          )
          values ($1, $2, now(), 1)
          on conflict (drive_file_id, raced_head_revision_id)
          do update set
            last_race_at = now(),
            retry_count = public.revision_race_cooldowns.retry_count + 1
          returning retry_count
        )
        select
          retry_count,
          least((60 * power(2, retry_count))::int, 600) as cooldown_seconds
          from upserted
      `,
      [driveFileId, racedHeadRevisionId],
    );
    return {
      retryCount: row?.retry_count ?? 1,
      cooldownSeconds: row?.cooldown_seconds ?? revisionRaceCooldownSeconds(1),
    };
  }

  async deleteRevisionRaceCooldowns(driveFileId: string): Promise<void> {
    await this.rows(
      `
        delete from public.revision_race_cooldowns
         where drive_file_id = $1
      `,
      [driveFileId],
    );
  }

  async readLiveDeferral(driveFileId: string): Promise<DeferredIngestionRow | null> {
    const row = await this.one<DeferredIngestionRow>(
      `
        -- live-partition:live-only — live deferred_ingestions read (wizard_session_id is null)
        select deferred_kind, deferred_at_modified_time
          from public.deferred_ingestions
         where drive_file_id = $1
           and wizard_session_id is null
         limit 1
      `,
      [driveFileId],
    );
    return row;
  }

  async deleteLiveDeferral(driveFileId: string): Promise<void> {
    await this.rows(
      `
        -- live-partition:live-only — live deferred_ingestions delete (wizard_session_id is null)
        delete from public.deferred_ingestions
         where drive_file_id = $1
           and wizard_session_id is null
      `,
      [driveFileId],
    );
  }

  async deleteWizardPendingSyncsExcept(wizardSessionId: string) {
    await this.rows(
      `
        -- live-partition:wizard-only — wizard pending_syncs supersession cleanup
        delete from public.pending_syncs
         where wizard_session_id is not null
           and wizard_session_id <> $1::uuid
      `,
      [wizardSessionId],
    );
  }

  async applyShowSnapshot(args: Parameters<Phase2Tx["applyShowSnapshot"]>[0]) {
    const existing = await this.one<{ id: string }>(
      "select id from public.shows where drive_file_id = $1 limit 1",
      [args.driveFileId],
    );
    // §02 (D-2 / R6 / R20 live-producer): read the prior stored run_of_show so the apply core can
    // decide which AGENDA_DAY_EMPTIED warnings to emit. Keyed on the resolved existing show id; a
    // first-seen show has no shows_internal row → null (the correct "nothing previously stored"
    // signal). Raw-tx path returns the parsed jsonb object (matching the parse_warnings read shape).
    const priorInternal = existing
      ? await this.one<{ run_of_show: unknown }>(
          "select run_of_show from public.shows_internal where show_id = $1 limit 1",
          [existing.id],
        )
      : null;
    const previousCrew = existing
      ? await this.rows<{
          id: string;
          name: string;
          email: string | null;
          phone: string | null;
          role: string;
          role_flags: string[];
          date_restriction: unknown;
          stage_restriction: unknown;
          flight_info: string | null;
          claimed_via_oauth_at: string | null;
          selections_reset_at: string | null;
        }>(
          // PF38 (resolution #24): id + claimed_via_oauth_at are load-bearing for Phase-4 undo
          // identity continuity (picker-cookie key + OAuth claim). §3.6: selections_reset_at joins the
          // lifecycle set the id-keyed crew reconciliation preserves.
          `
            select id, name, email, phone, role, role_flags, date_restriction, stage_restriction,
                   flight_info, claimed_via_oauth_at, selections_reset_at
              from public.crew_members
             where show_id = $1
             order by name
          `,
          [existing.id],
        )
      : [];
    const stalePredicate =
      args.staleGuard === "strict_less_than"
        ? "(last_seen_modified_time is null or last_seen_modified_time < $15::timestamptz)"
        : "(last_seen_modified_time is null or last_seen_modified_time <= $15::timestamptz)";
    const skipDiagramsStalePredicate =
      args.staleGuard === "strict_less_than"
        ? "(last_seen_modified_time is null or last_seen_modified_time < $14::timestamptz)"
        : "(last_seen_modified_time is null or last_seen_modified_time <= $14::timestamptz)";
    // NO autoPublish token entries in updateParams: the UPDATE arm references $1-$17 only (the
    // tokens are first-seen INSERT columns). postgres.js sends every array entry as a wire
    // parameter and real Postgres rejects an unreferenced one with 42P18 "could not determine
    // data type of parameter $18" — latent since Amendment 9 (fda81c4d) because every prior
    // suite faked this tx; surfaced by the first real-DB execution of the UPDATE arm (F1 Task
    // 1.5 Phase D). Pinned by tests/sync/_insertParamsArityContract.test.ts (update-arm cases).
    const updateParams = [
      args.driveFileId,
      args.parseResult.show.title,
      args.parseResult.show.client_label,
      args.parseResult.show.client_contact,
      args.parseResult.show.template_version,
      args.parseResult.show.venue,
      args.parseResult.show.dates,
      args.parseResult.show.event_details,
      args.parseResult.show.agenda_links,
      args.parseResult.diagrams,
      args.parseResult.openingReel?.driveFileId ?? null,
      args.parseResult.openingReel?.drive_modified_time ?? null,
      args.parseResult.openingReel?.headRevisionId ?? null,
      args.parseResult.openingReel?.mimeType ?? null,
      args.modifiedTime,
      args.parseResult.show.coi_status,
      args.parseResult.pullSheet,
      // Task 6: source_anchors — pass raw object to $18::jsonb (never JSON.stringify; postgres.js serializes)
      // Pass null (not {}) when sourceAnchors is absent: SQL uses coalesce($18::jsonb, source_anchors)
      // so the existing column value is preserved. Cron path (sourceAnchors defined) overwrites as before.
      args.sourceAnchors ?? null,
    ];
    const skipDiagramsParams = [
      args.driveFileId,
      args.parseResult.show.title,
      args.parseResult.show.client_label,
      args.parseResult.show.client_contact,
      args.parseResult.show.template_version,
      args.parseResult.show.venue,
      args.parseResult.show.dates,
      args.parseResult.show.event_details,
      args.parseResult.show.agenda_links,
      args.parseResult.openingReel?.driveFileId ?? null,
      args.parseResult.openingReel?.drive_modified_time ?? null,
      args.parseResult.openingReel?.headRevisionId ?? null,
      args.parseResult.openingReel?.mimeType ?? null,
      args.modifiedTime,
      args.parseResult.show.coi_status,
      args.parseResult.pullSheet,
      // Task 6: source_anchors — pass raw object to $17::jsonb (never JSON.stringify; postgres.js serializes)
      // Pass null (not {}) when sourceAnchors is absent: SQL uses coalesce($17::jsonb, source_anchors)
      // so the existing column value is preserved. Cron path (sourceAnchors defined) overwrites as before.
      args.sourceAnchors ?? null,
    ];
    const insertParamsForSlug = (slug: string) => [
      args.driveFileId,
      slug,
      args.parseResult.show.title,
      args.parseResult.show.client_label,
      args.parseResult.show.client_contact,
      args.parseResult.show.template_version,
      args.parseResult.show.venue,
      args.parseResult.show.dates,
      args.parseResult.show.event_details,
      args.parseResult.show.agenda_links,
      args.parseResult.diagrams,
      args.parseResult.openingReel?.driveFileId ?? null,
      args.parseResult.openingReel?.drive_modified_time ?? null,
      args.parseResult.openingReel?.headRevisionId ?? null,
      args.parseResult.openingReel?.mimeType ?? null,
      args.modifiedTime,
      args.parseResult.show.coi_status,
      args.parseResult.pullSheet,
      args.autoPublishFirstSeen?.unpublishToken ?? null,
      args.autoPublishFirstSeen?.unpublishTokenExpiresAt ?? null,
      // Task 6 (F1 fix): source_anchors on first-seen INSERT — pass raw object to $21::jsonb
      args.sourceAnchors ?? {},
    ];

    const updated = existing
      ? await this.one<{ id: string }>(
          args.skipDiagramsWrite
            ? `
            update public.shows
               set title = $2,
                   client_label = $3,
                   client_contact = $4::jsonb,
                   template_version = $5,
                   venue = $6::jsonb,
                   dates = $7::jsonb,
                   event_details = $8::jsonb,
                   agenda_links = $9::jsonb,
                   opening_reel_drive_file_id = $10,
                   opening_reel_drive_modified_time = $11::timestamptz,
                   opening_reel_head_revision_id = $12,
                   opening_reel_mime_type = $13,
                   last_seen_modified_time = $14::timestamptz,
                   coi_status = $15,
                   pull_sheet = $16::jsonb,
                   source_anchors = coalesce($17::jsonb, source_anchors),
                   last_synced_at = now(),
                   last_checked_at = now(),
                   last_sync_status = 'ok',
                   last_sync_error = null,
                   requires_resync = false
             where drive_file_id = $1
               and ${skipDiagramsStalePredicate}
             returning id
          `
            : `
            update public.shows
               set title = $2,
                   client_label = $3,
                   client_contact = $4::jsonb,
                   template_version = $5,
                   venue = $6::jsonb,
                   dates = $7::jsonb,
                   event_details = $8::jsonb,
                   agenda_links = $9::jsonb,
                   diagrams = $10::jsonb,
                   opening_reel_drive_file_id = $11,
                   opening_reel_drive_modified_time = $12::timestamptz,
                   opening_reel_head_revision_id = $13,
                   opening_reel_mime_type = $14,
                   last_seen_modified_time = $15::timestamptz,
                   coi_status = $16,
                   pull_sheet = $17::jsonb,
                   source_anchors = coalesce($18::jsonb, source_anchors),
                   last_synced_at = now(),
                   last_checked_at = now(),
                   last_sync_status = 'ok',
                   last_sync_error = null,
                   requires_resync = false
             where drive_file_id = $1
               and ${stalePredicate}
             returning id
          `,
          args.skipDiagramsWrite ? skipDiagramsParams : updateParams,
        )
      : await (() => {
          // R30-1 + R65-1 (F1): wizard Phase B first-seen INSERT variants. When
          // firstSeenPublished === false the column list gains `published` with literal false
          // (overriding the DDL default true); when wizardCreatedSessionId is set the column
          // list gains `wizard_created_session_id` ($22::uuid) — the show-side provenance
          // discriminator every created_show_id consumer joins on. Both absent → the SQL is
          // byte-identical to the pre-F1 statement.
          // NOTE: $21 is now source_anchors (F1 finding 1 fix); wizard extra is $22.
          const extraColumns =
            (args.firstSeenPublished === false ? ", published" : "") +
            (args.wizardCreatedSessionId ? ", wizard_created_session_id" : "");
          const extraValues =
            (args.firstSeenPublished === false ? ", false" : "") +
            (args.wizardCreatedSessionId ? ", $22::uuid" : "");
          const extraParams = args.wizardCreatedSessionId ? [args.wizardCreatedSessionId] : [];
          return insertFirstSeenShowWithSlugRetry({
            baseSlug: args.slug,
            insert: async (slug) =>
              await this.one<{ id: string }>(
                `
                insert into public.shows (
                  drive_file_id, slug, title, client_label, client_contact, template_version,
                  venue, dates, event_details, agenda_links, diagrams,
                  opening_reel_drive_file_id, opening_reel_drive_modified_time,
                  opening_reel_head_revision_id, opening_reel_mime_type,
                  last_seen_modified_time, coi_status, pull_sheet,
                  unpublish_token, unpublish_token_expires_at, source_anchors,
                  last_synced_at, last_checked_at, last_sync_status, last_sync_error${extraColumns}
                )
                values ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, $8::jsonb,
                        $9::jsonb, $10::jsonb, $11::jsonb, $12, $13::timestamptz,
                        $14, $15, $16::timestamptz, $17, $18::jsonb,
                        $19::uuid, $20::timestamptz, $21::jsonb, now(), now(), 'ok', null${extraValues})
                on conflict do nothing
                returning id
              `,
                [...insertParamsForSlug(slug), ...extraParams],
              ),
            // Disambiguates the conflict-free INSERT's empty return: slug taken
            // → next suffix; otherwise drive_file_id conflicted → null → stale.
            isSlugTaken: async (slug) =>
              (await this.one<{ taken: true }>(
                "select true as taken from public.shows where slug = $1 limit 1",
                [slug],
              )) !== null,
          });
        })();

    if (!updated) return { outcome: "stale" as const };
    return {
      outcome: "updated" as const,
      showId: updated.id,
      // §02 (D-2 / R6 / R3-finding-5): the prior stored run_of_show decoded through decodeRunOfShow
      // so legacy-array rows are wrapped to ScheduleDay before apply reads them. null for a
      // first-seen show with no shows_internal row.
      priorRunOfShow: decodeRunOfShow(priorInternal?.run_of_show ?? null).value,
      previousCrewNames: previousCrew.map((row) => row.name),
      previousCrewMembers: previousCrew.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        phone: row.phone,
        role: row.role,
        role_flags: row.role_flags as ParseResult["crewMembers"][number]["role_flags"],
        date_restriction:
          row.date_restriction as ParseResult["crewMembers"][number]["date_restriction"],
        stage_restriction:
          row.stage_restriction as ParseResult["crewMembers"][number]["stage_restriction"],
        flight_info: row.flight_info,
        claimed_via_oauth_at: row.claimed_via_oauth_at,
        selections_reset_at: row.selections_reset_at,
      })),
    };
  }

  async deleteCrewMembersNotIn(showId: string, names: string[]) {
    await this.rows("delete from public.crew_members where show_id = $1 and not (name = any($2))", [
      showId,
      names,
    ]);
  }

  async renameCrewMember(showId: string, removedName: string, addedName: string) {
    // Identity-preserving rename (spec 2026-07-10 §3.4): guarded, idempotent, at-most-one-row.
    // The NOT EXISTS makes a target-name collision or a re-run a no-op instead of a
    // unique (show_id, name) violation; the subsequent upsertCrewMembers refreshes every parsed
    // field on the renamed row. Runs on the already-locked show tx (no new lock holder).
    await this.rows(
      `
        update public.crew_members
           set name = $3
         where show_id = $1 and name = $2
           and not exists (
             select 1 from public.crew_members where show_id = $1 and name = $3
           )
      `,
      [showId, removedName, addedName],
    );
  }

  async upsertCrewMembers(showId: string, members: ParseResult["crewMembers"]) {
    for (const member of members) {
      await this.rows(
        `
          insert into public.crew_members (
            show_id, name, email, phone, role, role_flags, date_restriction,
            stage_restriction, flight_info
          )
          values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9)
          on conflict (show_id, name)
          do update set
            email = excluded.email,
            phone = excluded.phone,
            role = excluded.role,
            role_flags = excluded.role_flags,
            date_restriction = excluded.date_restriction,
            stage_restriction = excluded.stage_restriction,
            flight_info = excluded.flight_info
        `,
        [
          showId,
          member.name,
          canonicalize(member.email),
          member.phone,
          member.role,
          member.role_flags,
          member.date_restriction,
          member.stage_restriction,
          member.flight_info,
        ],
      );
    }
  }

  async provisionAddedCrewAuth(showId: string, names: string[]) {
    void showId;
    void names;
  }

  async revokeRemovedCrewAuth(showId: string, names: string[]) {
    void showId;
    void names;
  }

  async replaceHotelReservations(showId: string, rows: ParseResult["hotelReservations"]) {
    await this.rows("delete from public.hotel_reservations where show_id = $1", [showId]);
    for (const row of rows) {
      await this.rows(
        `
          insert into public.hotel_reservations (
            show_id, ordinal, hotel_name, hotel_address, names, confirmation_no,
            check_in, check_out, notes
          )
          values ($1, $2, $3, $4, $5, $6, $7::date, $8::date, $9)
        `,
        [
          showId,
          row.ordinal,
          row.hotel_name,
          row.hotel_address,
          row.names,
          row.confirmation_no,
          row.check_in,
          row.check_out,
          row.notes,
        ],
      );
    }
  }

  async replaceRooms(showId: string, rows: ParseResult["rooms"]) {
    await this.rows("delete from public.rooms where show_id = $1", [showId]);
    for (const row of rows) {
      await this.rows(
        `
          insert into public.rooms (
            show_id, kind, name, dimensions, floor, setup, set_time, show_time,
            strike_time, audio, video, lighting, scenic, power, digital_signage,
            other, notes
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        `,
        [
          showId,
          row.kind,
          row.name,
          row.dimensions,
          row.floor,
          row.setup,
          row.set_time,
          row.show_time,
          row.strike_time,
          row.audio,
          row.video,
          row.lighting,
          row.scenic,
          row.power,
          row.digital_signage,
          row.other,
          row.notes,
        ],
      );
    }
  }

  async replaceTransportation(showId: string, row: ParseResult["transportation"]) {
    await this.rows("delete from public.transportation where show_id = $1", [showId]);
    if (!row) return;
    await this.rows(
      `
        insert into public.transportation (
          show_id, driver_name, driver_phone, driver_email, vehicle, license_plate,
          color, parking, schedule, notes, loadout_name, loadout_phone, loadout_email
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13)
      `,
      [
        showId,
        row.driver_name,
        row.driver_phone,
        canonicalize(row.driver_email),
        row.vehicle,
        row.license_plate,
        row.color,
        row.parking,
        row.schedule,
        row.notes,
        // Coalesce undefined→null: a legacy/pre-loadout ParseResult (built without
        // loadout_* keys, e.g. a cast test fixture) reads `undefined`, and postgres.js
        // rejects undefined bind params. null = "no load-out contact". canonicalize()
        // already maps undefined→null for the email.
        row.loadout_name ?? null,
        row.loadout_phone ?? null,
        canonicalize(row.loadout_email),
      ],
    );
  }

  async replaceContacts(showId: string, rows: ParseResult["contacts"]) {
    await this.rows("delete from public.contacts where show_id = $1", [showId]);
    for (const row of rows) {
      await this.rows(
        `
          insert into public.contacts (show_id, kind, name, email, phone, notes)
          values ($1, $2, $3, $4, $5, $6)
        `,
        [showId, row.kind, row.name, canonicalize(row.email), row.phone, row.notes],
      );
    }
  }

  async upsertShowsInternal(
    showId: string,
    payload: Parameters<Phase2Tx["upsertShowsInternal"]>[1],
  ) {
    await this.rows(
      `
        insert into public.shows_internal (show_id, financials, parse_warnings, raw_unrecognized, run_of_show, use_raw_decisions, applied_role_mappings)
        values ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb)
        on conflict (show_id)
        do update set
          financials = excluded.financials,
          parse_warnings = excluded.parse_warnings,
          raw_unrecognized = excluded.raw_unrecognized,
          run_of_show = excluded.run_of_show,
          use_raw_decisions = excluded.use_raw_decisions,
          applied_role_mappings = excluded.applied_role_mappings
      `,
      // $5/$6: pass the computed object/null/array RAW — postgres.js serializes $N::jsonb itself; a
      // manual JSON.stringify would double-encode (the postgres.js jsonb param trap).
      [
        showId,
        payload.financials,
        payload.parse_warnings,
        payload.raw_unrecognized,
        payload.run_of_show,
        // Coalesce: the payload field is optional (direct tx-double callers may omit it); the DB
        // column is NOT NULL, and postgres.js rejects an undefined bind param. applyParseResult
        // always supplies an array, so this only guards standalone upsertShowsInternal doubles.
        payload.use_raw_decisions ?? [],
        // Nullable column; coalesce undefined → null (postgres.js rejects undefined bind params).
        payload.applied_role_mappings ?? null,
      ],
    );
    // DQIGNORE-3 — prune ignored_warnings orphaned by this parse: any standing ignore whose content
    // fingerprint is NO LONGER present in the freshly-written parse_warnings (the warning it silenced
    // has been fixed/removed). Runs in the SAME locked apply tx as the parse_warnings replace above —
    // single-holder rule (no new advisory lock). A still-present warning keeps its fingerprint here,
    // so its ignore SURVIVES (recurrence preserved); only vanished fingerprints are removed. Empty
    // active set (no ignorable warnings this parse) → every standing ignore is orphaned → all pruned
    // (same `not (x = any($2))` empty-array semantics as deleteCrewMembersNotIn). The fingerprint is
    // the SAME content key the ignore route stored (lib/dataQuality/warningFingerprint).
    const activeFingerprints = (payload.parse_warnings ?? [])
      .map((w) => warningFingerprint(w))
      .filter((fp): fp is string => fp !== null);
    await this.rows(
      "delete from public.ignored_warnings where show_id = $1 and not (fingerprint = any($2))",
      [showId, activeFingerprints],
    );
  }
}

/**
 * F1 (shared apply core): expose the canonical pipeline tx over an EXISTING raw
 * postgres.js transaction handle — the finalize routes' per-row transactions
 * already hold the per-show advisory lock, and the shared apply core must run
 * on the holder's transaction (acquire-free; single-holder rule, spec §3.3).
 */
export function makeSyncPipelineTx(tx: PostgresTransaction): SyncPipelineTx {
  return new PostgresPipelineTx(tx);
}

class DriveMetadataMissingError extends Error {
  readonly code = DRIVE_METADATA_MISSING;

  constructor(driveFileId: string) {
    super(`Drive file ${driveFileId} omitted headRevisionId`);
    this.name = "DriveMetadataMissingError";
  }
}

export class SyncStepTimeoutError extends Error {
  readonly code = SYNC_STEP_TIMEOUT;

  constructor(label: string, timeoutMs: number) {
    super(`${label} timed out after ${timeoutMs}ms`);
    this.name = "SyncStepTimeoutError";
  }
}

export async function withPostgresSyncPipelineLock<R = ProcessOneFileResult>(
  driveFileId: string,
  fn: (tx: LockedShowTx<SyncPipelineTx>, txDeps?: SyncPipelineTxBoundDeps) => Promise<R> | R,
  options: { tryOnly?: boolean } = { tryOnly: true },
): Promise<R | ConcurrentSyncSkipped> {
  const sql = postgres(databaseUrl(), {
    max: 1,
    idle_timeout: 1,
    prepare: false,
  });

  try {
    return (await sql.begin(async (rawTx) => {
      const tx = new PostgresPipelineTx(rawTx as unknown as PostgresTransaction);
      const txDeps: SyncPipelineTxBoundDeps = {
        upsertAdminAlert: tx.upsertAdminAlert.bind(tx),
      };
      return await withShowLock<SyncPipelineTx, R>(
        driveFileId,
        (lockedTx) => fn(lockedTx, txDeps),
        {
          tx,
          tryOnly: options.tryOnly ?? true,
        },
      );
    })) as R | ConcurrentSyncSkipped;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function readPostgresRevisionRaceCooldown(
  driveFileId: string,
  racedHeadRevisionId: string,
): Promise<RevisionRaceCooldown | null> {
  const sql = postgres(databaseUrl(), {
    max: 1,
    idle_timeout: 1,
    prepare: false,
  });

  try {
    const rows = (await sql.unsafe(
      `
        with cooldown as (
          select
            retry_count,
            least((60 * power(2, retry_count))::int, 600) as cooldown_seconds,
            last_race_at
          from public.revision_race_cooldowns
         where drive_file_id = $1
           and raced_head_revision_id = $2
           and retry_count > 0
         limit 1
        )
        select
          retry_count,
          cooldown_seconds,
          greatest(
            0,
            ceil(extract(epoch from (last_race_at + cooldown_seconds * interval '1 second' - now())) * 1000)
          )::bigint as cooldown_remaining_ms
          from cooldown
         where now() < last_race_at + cooldown_seconds * interval '1 second'
      `,
      [driveFileId, racedHeadRevisionId],
    )) as Array<{
      retry_count: number;
      cooldown_seconds: number;
      cooldown_remaining_ms: number;
    }>;
    const row = rows[0];
    if (!row) return null;
    return {
      retryCount: row.retry_count,
      cooldownSeconds: row.cooldown_seconds,
      cooldownRemainingMs: Number(row.cooldown_remaining_ms),
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/**
 * Finding C7: seed the fresh parse's agenda_links with the stored `extracted` payloads
 * (matched by fileId, fallback trimmed/lowercased label) so enrichAgenda's revision
 * cache-hit and leave-existing paths become effective on the cron/push/manual prepare
 * path. Pure + in-place; NEVER overrides a fresh-parse-carried extraction.
 */
export function seedPriorAgendaExtracted(
  freshLinks: ParseResult["show"]["agenda_links"],
  priorLinks: ParseResult["show"]["agenda_links"] | null | undefined,
): void {
  if (!priorLinks || priorLinks.length === 0) return;
  type Extracted = NonNullable<ParseResult["show"]["agenda_links"][number]["extracted"]>;
  const byFileId = new Map<string, Extracted>();
  const byLabel = new Map<string, Extracted>();
  for (const prior of priorLinks) {
    if (!prior?.extracted) continue;
    if (prior.fileId) byFileId.set(prior.fileId, prior.extracted);
    const key = prior.label?.trim().toLowerCase(); // canonicalize-exempt: agenda label, not an email
    if (key) byLabel.set(key, prior.extracted);
  }
  for (const link of freshLinks) {
    if (link.extracted) continue;
    const match =
      (link.fileId ? byFileId.get(link.fileId) : undefined) ??
      byLabel.get(link.label?.trim().toLowerCase() ?? ""); // canonicalize-exempt: agenda label, not an email
    if (match) link.extracted = match;
  }
}

async function readPostgresStoredAgendaLinks(
  driveFileId: string,
): Promise<ParseResult["show"]["agenda_links"] | null> {
  const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 1, prepare: false });
  try {
    const rows = (await sql.unsafe(
      `select agenda_links from public.shows where drive_file_id = $1 limit 1`,
      [driveFileId],
    )) as Array<{ agenda_links: ParseResult["show"]["agenda_links"] | null }>;
    return rows[0]?.agenda_links ?? null;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/**
 * Race a per-step operation against a timeout. The operation is a FACTORY receiving an
 * `AbortSignal` so an overrun can actually cancel in-flight work (audit idx57/#166): when the timer
 * fires we `abort()` the controller BEFORE rejecting, so a wrapped op that forwards the signal
 * (e.g. enrichment → agenda-PDF downloads) stops immediately instead of running to completion after
 * the race was already lost. `timeoutMs` defaults to the 30s single-Drive-call budget; callers that
 * legitimately need longer (enrichment) pass an explicit larger budget.
 */
export async function withStepTimeout<T>(
  label: string,
  op: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number = DRIVE_SYNC_STEP_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timer = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      // Abort in-flight work first so the losing branch stops doing (now-wasted) downloads, THEN
      // reject the race with the timeout that actually elapsed (message stays accurate per-budget).
      controller.abort();
      reject(new SyncStepTimeoutError(label, timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([op(controller.signal), timer]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function toDriveFileMeta(file: DriveListedFile): DriveFileMeta {
  return {
    driveFileId: file.driveFileId,
    headRevisionId: file.headRevisionId ?? "",
    md5Checksum: file.md5Checksum ?? "",
    mimeType: file.mimeType,
    modifiedTime: file.modifiedTime,
    name: file.name,
  };
}

async function defaultCaptureBinding(
  driveFileId: string,
  fileMeta: DriveListedFile,
): Promise<Phase1Binding> {
  const metadata = await fetchDriveFileMetadata(driveFileId);
  void fileMeta;
  return {
    bindingToken: metadata.headRevisionId ?? metadata.modifiedTime,
    modifiedTime: metadata.modifiedTime,
  };
}

/**
 * The default cron `getEmbeddedImageBytes` body, extracted as an injectable +
 * directly-unit-testable function (DXT-2), with the same idle stall guard as the
 * asset-recovery / snapshot-apply embedded-image helpers: a stalled download trips
 * at `timeoutMs` and returns null (fail-soft), while a healthy slow download stays
 * alive via `onChunk`. (This file is not under `_streamingHashContract`, so it uses
 * `readBoundedWebStream(...).bytes` directly to get the per-chunk hook.)
 */
export async function cronFetchEmbeddedImageBytesTimed(
  contentUrl: string | null | undefined,
  deps: { fetch?: typeof fetch; getAccessToken?: () => Promise<string>; timeoutMs?: number } = {},
): Promise<Uint8Array | null> {
  if (!contentUrl) return null;
  const fetchImpl = deps.fetch ?? fetch;
  const token = await (deps.getAccessToken ?? getDriveAccessToken)();
  const guard = createStallGuard(deps.timeoutMs ?? DRIVE_ASSET_STALL_TIMEOUT_MS);
  try {
    const response = await fetchImpl(contentUrl, {
      headers: { Authorization: `Bearer ${token}` },
      signal: guard.signal,
    });
    if (!response.ok || !response.body) return null;
    const result = await readBoundedWebStream(response.body, 50 * 1024 * 1024, {
      onChunk: () => guard.reset(),
    });
    return result.bytes;
  } catch (error) {
    if (guard.timedOut()) return null;
    throw error;
  } finally {
    guard.clear();
  }
}

export function defaultDriveClient(): DriveClient {
  return {
    async getFile(fileId) {
      return toDriveFileMeta(await fetchDriveFileMetadata(fileId));
    },
    async listFolder(folderId) {
      return {
        folderId,
        files: (await listDriveFolder(folderId)).map(toDriveFileMeta),
      };
    },
    async listSpreadsheetSheets(spreadsheetId) {
      // Sheets v4's Sheet schema exposes NO field that enumerates floating
      // drawn/embedded images, so the projection is titles-only and embeddedObjects
      // is always empty. extractEmbeddedImages degrades honestly (warning +
      // linked-folder fallback). Feasible diagram sourcing is tracked in
      // BACKLOG.md (BL-DIAGRAMS-EMBEDDED-SOURCE).
      const sheetsClient = google.sheets({ version: "v4", auth: getDriveAuth() });
      // DXT-3: bound the previously-untimed Sheets metadata read with a per-call
      // gaxios timeout (gaxios-7 "TimeoutError" → driveErrorStatus 504) under
      // withDriveRetry; retry:false keeps withDriveRetry the single retry layer.
      const response = await withDriveRetry(() =>
        sheetsClient.spreadsheets.get(
          { spreadsheetId, fields: "sheets(properties(sheetId,title))" },
          { timeout: DRIVE_FILES_GET_TIMEOUT_MS, retry: false },
        ),
      );
      return ((response.data.sheets ?? []) as unknown[]).map((sheet) => {
        const record = sheet as { properties?: { title?: string | null; sheetId?: number | null } };
        return {
          title: record.properties?.title ?? "",
          sheetId:
            typeof record.properties?.sheetId === "number" ? record.properties.sheetId : undefined,
          embeddedObjects: [],
        } satisfies SpreadsheetSheet;
      });
    },
    async getEmbeddedImageBytes(_spreadsheetId, _objectId, contentUrl) {
      return cronFetchEmbeddedImageBytesTimed(contentUrl);
    },
    async getSpreadsheetRevisionId(spreadsheetId) {
      const drive = google.drive({ version: "v3", auth: getDriveAuth() });
      // DXT-3: bound the previously-untimed revisions.list with a per-call gaxios
      // timeout under withDriveRetry (retry:false keeps it the single retry layer).
      const response = await withDriveRetry(() =>
        drive.revisions.list(
          { fileId: spreadsheetId, fields: "revisions(id,modifiedTime)" },
          { timeout: DRIVE_FILES_GET_TIMEOUT_MS, retry: false },
        ),
      );
      const revisions = response.data.revisions ?? [];
      return revisions.at(-1)?.id ?? null;
    },
    // Agenda PDF surfacing (spec §4.5.3): bytes-only PDF download + smart-chip
    // fileId recovery. Both return discriminated unions (invariant 9); the impls
    // live in lib/drive/agendaDrive.ts so the real + mock clients share the shape.
    downloadFileBytes: downloadAgendaFileBytes,
    getAgendaChips: getAgendaChips,
  };
}

async function listPostgresLiveShows(): Promise<CronLiveShowRow[]> {
  const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 1, prepare: false });
  try {
    const rows = (await sql.unsafe(`
      select id, drive_file_id, last_seen_modified_time, title
        from public.shows
       where drive_file_id is not null
         and archived = false
    `)) as Array<{
      id: string;
      drive_file_id: string;
      last_seen_modified_time: string | null;
      title: string | null;
    }>;
    return rows.map((row) => ({
      showId: row.id,
      driveFileId: row.drive_file_id,
      lastSeenModifiedTime: row.last_seen_modified_time,
      wizardSessionId: null,
      title: row.title,
    }));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function errorCode(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const candidate = error as { code?: unknown; status?: unknown; response?: { status?: unknown } };
  const value = candidate.code ?? candidate.status ?? candidate.response?.status;
  return typeof value === "number" ? value : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isSpreadsheetBindingRace(error: unknown): boolean {
  const message = errorMessage(error);
  return (
    /did not include an xlsx export link/i.test(message) ||
    /xlsx export failed with HTTP 404/i.test(message) ||
    /changed during xlsx export/i.test(message) ||
    /bound revision token/i.test(message)
  );
}

function isBinaryAssetRevisionRace(error: unknown): boolean {
  const message = errorMessage(error);
  if (errorCode(error) === 404 && /revision/i.test(message)) return true;
  return /bound revision/i.test(message);
}

function isSourceGone(error: unknown): boolean {
  const code = errorCode(error);
  return code === 404 && !isSpreadsheetBindingRace(error) && !isBinaryAssetRevisionRace(error);
}

type SyncLogDeps = {
  logSync?: ProcessOneFileDeps["logSync"];
};

type FirstPublishedNoticeDeps = {
  upsertAdminAlert: NonNullable<ProcessOneFileDeps["upsertAdminAlert"]>;
};

type SuccessfulPhase2TailDeps = SyncLogDeps &
  FirstPublishedNoticeDeps & {
    publishShowInvalidation?: ProcessOneFileDeps["publishShowInvalidation"];
  };

async function logSync(
  deps: SyncLogDeps,
  driveFileId: string,
  result: ProcessOneFileResult,
  payload?: Record<string, unknown>,
  // §02 (D-7 / FIX-3): applied-outcome parse warnings to persist on the sync_log row. Threaded from
  // the tail's applied result (NOT from parseResult — the runPhase2 rebind makes that unreliable).
  parseWarnings?: ParseResult["warnings"],
): Promise<void> {
  if ("skipped" in result) return;
  const entry: SyncLogEntry = {
    driveFileId,
    outcome: result.outcome,
  };
  if ("code" in result) entry.code = result.code;
  if ("reason" in result) entry.code = result.reason;
  if (payload) entry.payload = payload;
  // Set ONLY for the applied outcome (skip/error/stale/stage rows carry no parse warnings).
  if (result.outcome === "applied" && parseWarnings) entry.parseWarnings = parseWarnings;
  await deps.logSync?.(entry);
}

/**
 * Summarize an error's `.cause` chain for forensic persistence. Wrapped infra
 * errors (Phase1InfraError / Phase2InfraError / SyncInfraError) carry the REAL
 * underlying failure on `.cause`; without capturing it, sync_log.parse_warnings
 * records only the generic wrapper (e.g. "transaction-port failure during
 * snapshotAssetsForApply") and the root Supabase-Storage / Drive / SQL error is
 * lost. Bounded depth guards against pathological cyclic causes; stack is
 * truncated so a single row never bloats the log.
 */
function summarizeErrorCause(cause: unknown, depth: number): Record<string, unknown> | undefined {
  if (cause == null || depth > 4) return undefined;
  if (cause instanceof Error) {
    const out: Record<string, unknown> = { name: cause.name, message: cause.message };
    if (typeof cause.stack === "string") out.stack = cause.stack.slice(0, 2000);
    const code = (cause as { code?: unknown }).code;
    if (typeof code === "string" || typeof code === "number") out.code = code;
    if ("operation" in cause && typeof (cause as { operation?: unknown }).operation === "string") {
      out.operation = (cause as { operation: string }).operation;
    }
    const nested = summarizeErrorCause((cause as { cause?: unknown }).cause, depth + 1);
    if (nested !== undefined) out.cause = nested;
    return out;
  }
  return { message: String(cause) };
}

export function errorPayload(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const payload: Record<string, unknown> = {
      name: error.name,
      message: error.message,
    };
    if ("operation" in error && typeof error.operation === "string") {
      payload.operation = error.operation;
    }
    if ("source" in error && typeof error.source === "string") {
      payload.source = error.source;
    }
    if ("code" in error && typeof error.code === "string") {
      payload.errorCode = error.code;
    }
    const cause = summarizeErrorCause((error as { cause?: unknown }).cause, 0);
    if (cause !== undefined) payload.cause = cause;
    return payload;
  }
  return { message: String(error) };
}

function txBoundProcessDeps(
  tx: LockedShowTx<SyncPipelineTx>,
  deps: ProcessOneFileDeps,
  injected?: SyncPipelineTxBoundDeps,
): ProcessOneFileDeps {
  if (!injected?.upsertAdminAlert && deps.upsertAdminAlert) return deps;

  const txUpsertAdminAlert =
    injected?.upsertAdminAlert ??
    (typeof (tx as { upsertAdminAlert?: unknown }).upsertAdminAlert === "function"
      ? ((
          tx as unknown as { upsertAdminAlert: SyncPipelineTxBoundDeps["upsertAdminAlert"] }
        ).upsertAdminAlert.bind(tx) as SyncPipelineTxBoundDeps["upsertAdminAlert"])
      : undefined);

  if (!txUpsertAdminAlert) return deps;
  return { ...deps, upsertAdminAlert: txUpsertAdminAlert };
}

function requireTxBoundUpsertAdminAlert(
  deps: ProcessOneFileDeps,
  operation: string,
): NonNullable<ProcessOneFileDeps["upsertAdminAlert"]> {
  if (deps.upsertAdminAlert) return deps.upsertAdminAlert;
  throw new SyncInfraError(
    operation,
    "thrown_error",
    new Error("transaction-bound upsertAdminAlert is required inside sync pipeline transaction"),
  );
}

async function emitDeferredRoleFlagsNotice(
  result: ProcessOneFileResult,
  deps: ProcessOneFileDeps,
): Promise<void> {
  if ("skipped" in result || result.outcome !== "applied" || !result.roleFlagsNotice) return;
  const upsertAdminAlert = deps.upsertAdminAlert ?? defaultUpsertAdminAlert;
  // §3.4 (F1): emit the durable, non-coalescing LEAD audit event FIRST — BEFORE the alert upsert.
  // `upsertAdminAlert` THROWS on RPC failure; ordering the authoritative audit ahead of it means a
  // transient feed-write failure (post-commit, after the LEAD mutation already landed) can never
  // skip the durable record. The audit is failure-visible internally ({ok,error}); it never throws.
  // Rides the SAME site as the feed nudge so no apply path is missed (cross-caller topology).
  await emitLeadRoleApplied(result.roleFlagsNotice, { source: "sync.roleFlags" });
  await upsertAdminAlert(result.roleFlagsNotice);
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function showDateForAlert(parseResult: ParseResult): string | null {
  return (
    parseResult.show.dates.showDays[0] ??
    parseResult.show.dates.set ??
    parseResult.show.dates.travelIn ??
    null
  );
}

async function emitFirstPublishedNotice(args: {
  result: Extract<ProcessOneFileResult, { outcome: "applied" }>;
  deps: FirstPublishedNoticeDeps;
  driveFileId: string;
  fileMeta: DriveListedFile;
  parseResult: ParseResult;
  // M12.13: unpublishToken is intentionally NOT a parameter — the raw bearer secret never enters
  // alert context. The token is still minted + persisted to shows.unpublish_token upstream.
  unpublishTokenExpiresAt: string;
}): Promise<void> {
  // parse-data-quality-warnings §6.4 (P1) — additive data-gaps digest. This is
  // the SHARED first-published emitter (reached by cron auto-publish, applyStaged
  // FIRST_SEEN_REVIEW, and runManualStageForFirstSeen via emitSuccessfulPhase2Tail),
  // so adding the digest here covers EVERY first-published emission with one
  // implementation. Only attached when there is ≥1 warn-severity data-quality
  // warning (total>0); otherwise the key is omitted (no empty digest). No new
  // admin_alert code, no §12.4 prose change — PerShowAlertSection renders it as a
  // bespoke sub-line, not via the catalog dougFacing.
  const dataGaps = summarizeDataGaps(args.parseResult.warnings);
  await args.deps.upsertAdminAlert({
    showId: args.result.showId,
    code: "SHOW_FIRST_PUBLISHED",
    context: {
      drive_file_id: args.driveFileId,
      sheet_name: args.fileMeta.name,
      crew_count: args.parseResult.crewMembers.length,
      show_date: showDateForAlert(args.parseResult),
      // M12.13: the raw bearer secret is no longer persisted in alert context (a table every
      // admin session reads). Only the non-secret expiry window stays; the in-app alert-row
      // action re-reads shows.unpublish_token service-role-side when it needs the secret.
      unpublish_token_expires_at: args.unpublishTokenExpiresAt,
      ...(dataGaps.total > 0 ? { data_gaps: dataGaps } : {}),
    },
  });
}

export async function emitSuccessfulPhase2Tail(args: {
  tx: Pick<SyncPipelineTx, "deleteRevisionRaceCooldowns">;
  result: Extract<ProcessOneFileResult, { outcome: "applied" }>;
  deps: SuccessfulPhase2TailDeps;
  driveFileId: string;
  fileMeta: DriveListedFile;
  parseResult: ParseResult;
  autoPublishFirstSeen?:
    | {
        unpublishToken: string;
        unpublishTokenExpiresAt: string;
      }
    | undefined;
}): Promise<void> {
  await args.tx.deleteRevisionRaceCooldowns?.(args.driveFileId);
  await args.deps.publishShowInvalidation?.(args.result.showId);
  if (args.autoPublishFirstSeen) {
    await emitFirstPublishedNotice({
      result: args.result,
      deps: args.deps,
      driveFileId: args.driveFileId,
      fileMeta: args.fileMeta,
      parseResult: args.parseResult,
      unpublishTokenExpiresAt: args.autoPublishFirstSeen.unpublishTokenExpiresAt,
    });
  }
  // §02 (D-7 / FIX-3): thread the applied result's parseWarnings into the sync_log row.
  await logSync(args.deps, args.driveFileId, args.result, undefined, args.result.parseWarnings);
}

function shouldUseRevisionRaceCooldown(mode: SyncMode): boolean {
  return mode === "cron" || mode === "push";
}

// Accepts a JS Date as well as an ISO string: `deferred_at_modified_time` is
// read from a `timestamptz` column via postgres.js, which yields a Date at
// runtime. `Date.parse(<Date>)` would coerce through toString() and DROP the
// milliseconds, so an unchanged file at e.g. "...06.040Z" looked advanced and
// erased a valid defer-until-modified deferral (the cron peer of the apply
// revision-race false positive, M12 Phase 0.F smoke 3). `getTime()` preserves
// the milliseconds.
function timestampMs(value: string | Date | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function modifiedTimeAdvanced(
  left: string | Date,
  right: string | Date | null | undefined,
): boolean {
  const leftMs = timestampMs(left);
  const rightMs = timestampMs(right);
  if (leftMs === null) return false;
  if (rightMs === null) return true;
  return leftMs > rightMs;
}

function listedRevisionToken(fileMeta: DriveListedFile): string {
  return fileMeta.headRevisionId ?? fileMeta.modifiedTime;
}

function fallbackBindingFromListedFile(fileMeta: DriveListedFile): Phase1Binding {
  return {
    bindingToken: listedRevisionToken(fileMeta),
    modifiedTime: fileMeta.modifiedTime,
  };
}

async function checkRevisionRaceCooldown(
  readCooldown:
    | ((driveFileId: string, racedHeadRevisionId: string) => Promise<RevisionRaceCooldown | null>)
    | undefined,
  driveFileId: string,
  racedHeadRevisionId: string,
): Promise<Extract<ProcessOneFileResult, { outcome: "revision_race_cooldown" }> | null> {
  if (!readCooldown) return null;
  const cooldown = await readCooldown(driveFileId, racedHeadRevisionId);
  if (!cooldown) return null;
  return {
    outcome: "revision_race_cooldown",
    code: STAGED_PARSE_REVISION_RACE_COOLDOWN,
    cooldownRemainingMs: cooldown.cooldownRemainingMs,
    retryCount: cooldown.retryCount,
  };
}

async function recordRevisionRaceCooldown(
  tx: LockedShowTx<SyncPipelineTx>,
  driveFileId: string,
  racedHeadRevisionId: string,
): Promise<void> {
  await tx.upsertRevisionRaceCooldown?.(driveFileId, racedHeadRevisionId);
}

async function recheckLiveDeferralAfterLock(
  tx: LockedShowTx<SyncPipelineTx>,
  driveFileId: string,
  mode: SyncMode,
  fileMeta: DriveListedFile,
): Promise<Extract<ProcessOneFileResult, { outcome: "skipped" }> | null> {
  if (mode !== "cron" && mode !== "push") return null;
  if (!tx.readLiveDeferral || !tx.deleteLiveDeferral) return null;

  const liveDeferral = await tx.readLiveDeferral(driveFileId);
  if (liveDeferral?.deferred_kind === "permanent_ignore") {
    return { outcome: "skipped", reason: "deferred_permanent" };
  }
  if (liveDeferral?.deferred_kind !== "defer_until_modified") return null;
  if (!modifiedTimeAdvanced(fileMeta.modifiedTime, liveDeferral.deferred_at_modified_time)) {
    return { outcome: "skipped", reason: "deferred_modtime" };
  }
  await tx.deleteLiveDeferral(driveFileId);
  return null;
}

export function classifySyncFailure(error: unknown): SyncFailureCode {
  if (
    error instanceof SyncInfraError ||
    error instanceof Phase1InfraError ||
    error instanceof Phase2InfraError
  ) {
    return SYNC_INFRA_ERROR;
  }
  if (error instanceof SyncStepTimeoutError) {
    return SYNC_STEP_TIMEOUT;
  }
  if (error instanceof DriveMetadataMissingError) {
    return DRIVE_METADATA_MISSING;
  }
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "LOCK_OWNERSHIP_ASSERTION_FAILED"
  ) {
    return "LOCK_OWNERSHIP_ASSERTION_FAILED";
  }
  return SYNC_FILE_FAILED;
}

export async function runPhase1_unlocked(
  tx: LockedShowTx<SyncPipelineTx>,
  args: Phase1Args,
  deps: ProcessOneFileDeps = {},
) {
  return await (deps.runPhase1 ?? runPhase1)(tx, args);
}

export async function runPhase2_unlocked(
  tx: LockedShowTx<SyncPipelineTx>,
  args: Phase2Args,
  deps: ProcessOneFileDeps = {},
): Promise<Phase2Result> {
  return await (deps.runPhase2 ?? runPhase2)(tx, args);
}

async function markMissingShow_unlocked(
  tx: LockedShowTx<SyncPipelineTx>,
  show: CronLiveShowRow,
): Promise<
  | { outcome: "source_gone"; code: typeof SHEET_UNAVAILABLE; showId?: string | null }
  | { outcome: "skipped"; reason: typeof ARCHIVED_SKIP_REASON }
> {
  await assertShowLockHeld(tx, show.driveFileId);
  // DEF-4 (defense-in-depth; listPostgresLiveShows already excludes archived): never mark/log a
  // missing-file error against an archived show. Silent skip, no mutation, no sync_log.
  if (await readShowArchived_unlocked(tx, show.driveFileId)) {
    return { outcome: "skipped", reason: ARCHIVED_SKIP_REASON };
  }
  const recoveryTx = tx as LockedShowTx<CronRecoveryTx>;
  const updated = await recoveryTx.markShowSheetUnavailable(show.driveFileId, SHEET_UNAVAILABLE);
  const showId = updated.showId ?? show.showId;
  const previousLastSeenModifiedTime =
    updated.lastSeenModifiedTime ?? show.lastSeenModifiedTime ?? null;
  const payload = {
    driveFileId: show.driveFileId,
    previousLastSeenModifiedTime,
  };
  await recoveryTx.insertSyncLog(
    {
      driveFileId: show.driveFileId,
      outcome: "error",
      code: SHEET_UNAVAILABLE,
      payload,
    },
    showId,
  );
  await recoveryTx.upsertAdminAlert({
    showId,
    code: "SHEET_UNAVAILABLE",
    context: {
      drive_file_id: show.driveFileId,
      previous_last_seen_modified_time: previousLastSeenModifiedTime,
      // Supplies the §12.4 `<sheet-name>` placeholder for AlertBanner
      // interpolation (M9 C0 round-7).
      sheet_name: show.title,
    },
  });
  await resolveStaleSyncProblemAlerts_unlocked(
    tx,
    showId,
    syncProblemCodeForStatus("sheet_unavailable"),
  );
  // nav-perf tag-caching (whole-diff R2): carry the showId the markShowSheetUnavailable
  // write read back so the post-commit gate busts the projected last_sync_status.
  return { outcome: "source_gone", code: SHEET_UNAVAILABLE, showId };
}

async function handleFetchFailure_unlocked(
  tx: LockedShowTx<SyncPipelineTx>,
  driveFileId: string,
  fileMeta: DriveListedFile,
  binding: Phase1Binding,
  error: unknown,
  code: typeof STAGED_PARSE_SOURCE_GONE | SyncFailureCode,
): Promise<ProcessOneFileResult> {
  const existingPending = await tx.readLivePendingSync(driveFileId);
  const result =
    code === STAGED_PARSE_SOURCE_GONE
      ? { outcome: "source_gone" as const, code }
      : { outcome: "parse_error" as const, code };
  if (existingPending) return result;

  const show = await tx.readShowForPhase1(driveFileId);
  const recoveryTx = tx as LockedShowTx<CronRecoveryTx>;
  if (show) {
    const updated =
      code === STAGED_PARSE_SOURCE_GONE
        ? await recoveryTx.markShowSheetUnavailable(driveFileId, code)
        : await recoveryTx.markShowDriveError(driveFileId, code);
    const showId = updated.showId;
    const previousLastSeenModifiedTime =
      updated.lastSeenModifiedTime ?? show.lastSeenModifiedTime ?? null;
    await recoveryTx.insertSyncLog(
      {
        driveFileId,
        outcome: "error",
        code,
        payload: {
          driveFileId,
          message: errorMessage(error),
          previousLastSeenModifiedTime,
        },
      },
      showId,
    );
    if (code === STAGED_PARSE_SOURCE_GONE) {
      await recoveryTx.upsertAdminAlert({
        showId,
        code: "SHEET_UNAVAILABLE",
        context: {
          drive_file_id: driveFileId,
          failure_code: code,
          previous_last_seen_modified_time: previousLastSeenModifiedTime,
          // Supplies §12.4 `<sheet-name>` placeholder for AlertBanner
          // interpolation (M9 C0 round-8). When code is STAGED_PARSE_SOURCE_GONE,
          // updated came from markShowSheetUnavailable which now exposes
          // title in its RETURNING. The narrowing below picks up `title`
          // off the markShowSheetUnavailable branch's union member.
          sheet_name: "title" in updated ? updated.title : null,
        },
      });
    } else {
      // B3 §4.1: show-level DRIVE_FETCH_FAILED producer. Realtime email
      // consumes admin_alerts (live-partition:n/a — doc reference, no statement),
      // while `code` here is the raw drive failure.
      await recoveryTx.upsertAdminAlert({
        showId,
        code: "DRIVE_FETCH_FAILED",
        context: {
          drive_file_id: driveFileId,
          failure_code: code,
          previous_last_seen_modified_time: previousLastSeenModifiedTime,
          sheet_name: updated.title,
        },
      });
    }
    await resolveStaleSyncProblemAlerts_unlocked(
      tx,
      showId,
      syncProblemCodeForStatus(
        code === STAGED_PARSE_SOURCE_GONE ? "sheet_unavailable" : "drive_error",
      ),
    );
    // nav-perf tag-caching (whole-diff R2): this branch committed
    // `shows.last_sync_status` (markShow{SheetUnavailable,DriveError}); carry the
    // showId so the post-commit gate busts the projected last_sync_status. The
    // existingPending early-return + the no-show upsertLivePendingIngestion path
    // below match NO public.shows row, so they correctly leave showId absent.
    return { ...result, showId };
  }

  await tx.upsertLivePendingIngestion({
    driveFileId,
    wizardSessionId: null,
    driveFileName: fileMeta.name,
    lastErrorCode: code,
    lastErrorMessage: errorMessage(error),
    lastWarnings: [],
    lastSeenModifiedTime: binding.modifiedTime,
  });
  return result;
}

export async function processOneFile(
  driveFileId: string,
  mode: SyncMode,
  fileMeta: DriveListedFile,
  deps: ProcessOneFileDeps = {},
): Promise<ProcessOneFileResult> {
  const prepared = await prepareProcessOneFile(driveFileId, mode, fileMeta, deps);
  if (prepared.kind === "skip") {
    // DEF-4: an archived show is a SILENT skip — return WITHOUT logSync. The normal skip path below
    // writes a sync_log row (logSync's `"skipped" in result` guard checks for the {skipped:true}
    // ConcurrentSyncSkipped shape, NOT outcome:"skipped", so it does NOT suppress {outcome:"skipped"}).
    if (prepared.result.reason === ARCHIVED_SKIP_REASON) {
      return prepared.result;
    }
    // R10 DEF-4 TOCTOU: prepareProcessOneFile read the gate (incl. archived) BEFORE the per-show lock.
    // An Archive may have committed since. Re-read archived UNDER the lock before writing the non-archived
    // skip log (watermark / deferred_modtime / deferred_permanent): archive_show takes the SAME advisory
    // lock, so the re-read+log is authoritative. If the show became archived in the gap, skip SILENTLY —
    // no sync_log. Shared by cron / push / manual (all route their apply through processOneFile). If the
    // lock is contended (ConcurrentSyncSkipped), another sync is processing the file; return the skip
    // without logging (it will log its own outcome).
    const lock = deps.withShowLock ?? withPostgresSyncPipelineLock;
    const logged = await lock(driveFileId, async (lockedTx) => {
      if (await readShowArchived_unlocked(lockedTx, driveFileId)) {
        return { outcome: "skipped" as const, reason: ARCHIVED_SKIP_REASON };
      }
      // A non-error skip (watermark / deferred_modtime / deferred_permanent) is a SUCCESSFUL
      // Drive check that applied nothing. Advance last_checked_at so idle-but-healthy shows stay
      // fresh for the driveConnectionHealth + StaleFooter age tiers (spec 2026-07-16-last-checked-at
      // §4). Rides THIS single held show-lock tx (invariant 2 single-holder); last_synced_at
      // untouched. A missing show row (deferred_permanent non-show file) matches zero rows → undefined.
      await lockedTx.queryOne<{ updated: true } | undefined>(
        "update public.shows set last_checked_at = now() where drive_file_id = $1 returning true as updated",
        [driveFileId],
      );
      await logSync(deps, driveFileId, prepared.result, prepared.payload);
      return prepared.result;
    });
    return "skipped" in logged ? prepared.result : logged;
  }

  const lock = deps.withShowLock ?? withPostgresSyncPipelineLock;
  const result = await lock(driveFileId, (lockedTx, txDeps) =>
    processOneFile_unlocked(
      lockedTx,
      driveFileId,
      mode,
      fileMeta,
      txBoundProcessDeps(lockedTx, deps, txDeps),
      prepared,
    ),
  );
  if ("skipped" in result) {
    const skipped = { outcome: "skipped" as const, reason: CONCURRENT_SYNC_SKIPPED };
    await logSync(deps, driveFileId, skipped);
  }
  if (!("skipped" in result) && result.outcome === "applied" && result.snapshotRevisionId) {
    await (deps.promoteSnapshotUpload ?? defaultPromoteSnapshotUpload)(result.snapshotRevisionId);
  }
  await emitDeferredRoleFlagsNotice(result, deps);
  // §10 point 5: ROLE_TOKEN_MAPPED emission — POST-COMMIT, outside the show-lock tx (invariant 10).
  // Reads the committed apply outcome; a skipped / rolled-back / non-applied result carries no
  // entries, so nothing is emitted. This wrapper covers cron AND manual (runManualSyncForShow runs
  // processOneFile); emitting in the cron file-loop instead would leave every manual re-sync dark.
  if (!("skipped" in result) && result.outcome === "applied") {
    await emitRoleTokenMapped(result.appliedRoleMappings, {
      showId: result.showId,
      source: "sync.roleMapping",
    });
  }
  return result;
}

export type PreparedProcessOneFile =
  | {
      kind: "skip";
      result: Extract<ProcessOneFileResult, { outcome: "skipped" }>;
      payload?: Record<string, unknown>;
    }
  | { kind: "asset_recovery"; result: Extract<ProcessOneFileResult, { outcome: "asset_recovery" }> }
  | {
      kind: "revision_race_cooldown";
      result: Extract<ProcessOneFileResult, { outcome: "revision_race_cooldown" }>;
      payload: Record<string, unknown>;
    }
  | {
      kind: "revision_race";
      result: Extract<ProcessOneFileResult, { outcome: "revision_race" }>;
      racedHeadRevisionId: string;
      payload: Record<string, unknown>;
    }
  | {
      kind: "fetch_failure";
      binding: Phase1Binding;
      error: unknown;
      code: typeof STAGED_PARSE_SOURCE_GONE | SyncFailureCode;
    }
  | {
      kind: "ready";
      resolvedMode: Exclude<ResolvedSyncMode, "asset_recovery">;
      binding: Phase1Binding;
      parseResult: ParseResult;
      /**
       * Role-vocab drift rescue (spec 2026-07-16-role-vocab-mapping-convergence §3.3): set when the
       * cron gate proceeded ONLY because this file was drift-eligible at/below the watermark. Drives
       * the in-lock recheck (Task 4) and the `less_than_or_equal` Phase 2 stale guard (Task 5).
       */
      driftResync?: true;
      /**
       * Task 5: source-region anchors extracted from the XLSX bytes (one pass, no extra API call).
       * audit idx12+idx63: `undefined` ONLY when the sheets-list fetch failed transiently — the
       * omit-on-undefined chain + persist coalesce then PRESERVE the stored source_anchors rather
       * than wiping them to `{}`. A successful extract (incl. genuinely-no-anchors) stays `{}`.
       */
      sourceAnchors?: Record<string, SourceAnchor>;
      // §5.8: the override snapshot the staged/applied parse was produced under —
      // overrideSnapshot(override-as-of-read) on match/no-override, null on the
      // content-changed/tab-missing discard-and-rerun. Written to
      // pull_sheet_override_applied by upsertLivePendingSync (Flow C).
      pullSheetOverrideApplied?: OverrideSnapshot;
      // §5.2/I5b: true when the pre-lock reconcile discarded the override — the
      // locked apply clears durable shows.pull_sheet_override + emits the forensic event.
      pullSheetOverrideCleared?: boolean;
      // The archived tab whose drift triggered the clear (for the forensic emit).
      pullSheetOverrideClearedTab?: string;
      // §5.7/I5a: the raw pre-lock override snapshot that drove this parse. Re-read under the
      // show: lock and compared; a concurrent change (finalize propagation) ⇒ stale, skip apply.
      pullSheetOverrideUsed?: OverrideSnapshot;
    };

function defaultCooldownReader(
  deps: ProcessOneFileDeps,
):
  | ((driveFileId: string, racedHeadRevisionId: string) => Promise<RevisionRaceCooldown | null>)
  | undefined {
  if (deps.readRevisionRaceCooldown) return deps.readRevisionRaceCooldown;
  if (deps.withShowLock) return undefined;
  return readPostgresRevisionRaceCooldown;
}

export async function prepareProcessOneFile(
  driveFileId: string,
  mode: SyncMode,
  fileMeta: DriveListedFile,
  deps: ProcessOneFileDeps,
  readCooldown:
    | ((driveFileId: string, racedHeadRevisionId: string) => Promise<RevisionRaceCooldown | null>)
    | undefined = defaultCooldownReader(deps),
): Promise<PreparedProcessOneFile> {
  const roleVocabDriftEligible = deps.roleVocabDriftEligibleIds?.has(driveFileId) ?? false;
  const gate = await (deps.perFileProcessor ?? perFileProcessor)(driveFileId, mode, fileMeta, {
    roleVocabDriftEligible,
  });
  if (gate.outcome === "skip") {
    return { kind: "skip", result: { outcome: "skipped", reason: gate.reason } };
  }
  if (gate.mode === "asset_recovery") {
    return { kind: "asset_recovery", result: { outcome: "asset_recovery" } };
  }

  if (shouldUseRevisionRaceCooldown(mode)) {
    const cooldown = await checkRevisionRaceCooldown(
      readCooldown,
      driveFileId,
      listedRevisionToken(fileMeta),
    );
    if (cooldown) {
      return {
        kind: "revision_race_cooldown",
        result: cooldown,
        payload: {
          racedHeadRevisionId: listedRevisionToken(fileMeta),
          cooldownRemainingMs: cooldown.cooldownRemainingMs,
          retryCount: cooldown.retryCount,
        },
      };
    }
  }

  const captureBinding = deps.captureBinding ?? defaultCaptureBinding;
  let binding: Phase1Binding;
  try {
    binding = await withStepTimeout("captureBinding", () => captureBinding(driveFileId, fileMeta));
  } catch (error) {
    return {
      kind: "fetch_failure",
      binding: fallbackBindingFromListedFile(fileMeta),
      error,
      code: isSourceGone(error) ? STAGED_PARSE_SOURCE_GONE : classifySyncFailure(error),
    };
  }
  if (
    shouldUseRevisionRaceCooldown(mode) &&
    binding.bindingToken !== listedRevisionToken(fileMeta)
  ) {
    const cooldown = await checkRevisionRaceCooldown(
      readCooldown,
      driveFileId,
      binding.bindingToken,
    );
    if (cooldown) {
      return {
        kind: "revision_race_cooldown",
        result: cooldown,
        payload: {
          racedHeadRevisionId: binding.bindingToken,
          cooldownRemainingMs: cooldown.cooldownRemainingMs,
          retryCount: cooldown.retryCount,
        },
      };
    }
  }

  // §5.3 cron override read (pre-lock, best-effort): if a durable override pinned an archived
  // tab's pull sheet, thread `includePullSheetFromTab` so the export re-includes that gear.
  const overrideReader = deps.readShowPullSheetOverride ?? defaultReadShowPullSheetOverride;
  const pullSheetOverride = await overrideReader(driveFileId).catch(() => null);
  const includeOpts = pullSheetOverride
    ? { includePullSheetFromTab: pullSheetOverride.tabName }
    : {};

  // Task 5 — single Drive export: fetch markdown AND raw bytes in one call on the real path.
  // When deps.fetchMarkdownAtRevision is injected (tests), fall back to separate markdown +
  // fetchXlsxBytes injections. On the real path, fetchSheetMarkdownAndBytesAtRevision performs
  // exactly ONE Drive export and returns both artifacts — no second export ever occurs.
  let markdown: string;
  let xlsxBytes: ArrayBuffer | undefined;
  try {
    if (deps.fetchMarkdownAtRevision) {
      // Test/injected path: markdown and bytes come from separate injected fns.
      markdown = await withStepTimeout("fetchMarkdownAtRevision", () =>
        deps.fetchMarkdownAtRevision!(driveFileId, binding.bindingToken),
      );
      try {
        xlsxBytes = deps.fetchXlsxBytes
          ? await deps.fetchXlsxBytes(driveFileId, binding.bindingToken)
          : undefined;
      } catch {
        xlsxBytes = undefined;
      }
    } else {
      // Real path: single Drive export, both markdown and bytes from one HTTP call.
      const result = await withStepTimeout("fetchMarkdownAtRevision", () =>
        fetchSheetMarkdownAndBytesAtRevision(driveFileId, binding.bindingToken, includeOpts),
      );
      markdown = result.markdown;
      xlsxBytes = result.bytes;
    }
  } catch (error) {
    if (isSpreadsheetBindingRace(error)) {
      return {
        kind: "revision_race",
        result: { outcome: "revision_race", code: STAGED_PARSE_REVISION_RACE },
        racedHeadRevisionId: binding.bindingToken,
        payload: { bindingToken: binding.bindingToken },
      };
    }
    return {
      kind: "fetch_failure",
      binding,
      error,
      code: isSourceGone(error) ? STAGED_PARSE_SOURCE_GONE : classifySyncFailure(error),
    };
  }

  // Task 5 — exactly-once Sheets API list ownership:
  // Call listSpreadsheetSheets HERE (once) so both enrichWithDrivePins AND
  // extractSourceAnchors consume the same result — no second API call.
  const driveClient = deps.driveClient ?? defaultDriveClient();
  let sheets: SpreadsheetSheet[] | undefined;
  // audit idx12+idx63: distinguish a genuine sheets-list FETCH FAILURE from the mock/no-op
  // path (both leave `sheets` undefined). On a real fetch failure we must emit `undefined`
  // source-anchors below so the persist coalesce PRESERVES the stored value instead of
  // wiping it to `{}` (an empty titleToGid makes every region miss → a DEFINED `{}`).
  let sheetsListFailed = false;
  if (!deps.enrichWithDrivePins && driveClient.listSpreadsheetSheets) {
    // Real path: fetch the sheet list once; pass into enrich via ctx.sheets so
    // extractEmbeddedImages does NOT re-call the API.
    try {
      sheets = await driveClient.listSpreadsheetSheets(driveFileId);
    } catch {
      // Non-fatal for enrich (extractEmbeddedImages falls back gracefully), but the empty
      // titleToGid would otherwise produce a DEFINED `{}` that durably wipes source_anchors.
      sheets = undefined;
      sheetsListFailed = true;
    }
  }

  let parsed: ParsedSheet;
  try {
    parsed = (deps.parseSheet ?? parseMarkdownSheet)(markdown, fileMeta.name);
  } catch (error) {
    // The parser is contractually non-throwing (it degrades to hardErrors). A throw here means a
    // novel structure hit an unanticipated path. Route it to the SAME fail-closed handling as a
    // parse hardError (retain last-good + PARSE_ERROR_LAST_GOOD for an existing show; first-seen
    // stages for review) instead of aborting the sync. Audit rec-6 / finding #17.
    let message: string;
    try {
      message = error instanceof Error ? error.message : String(error);
    } catch {
      // Pathological throw value (throwing toString/valueOf, or Error with a throwing message getter).
      message = "unknown parser error (unstringifiable throw value)";
    }
    // Synthesize the fail-closed sheet FIRST — the guard must not depend on logging succeeding.
    parsed = buildThrownParsedSheet(message);
    // Forensic, best-effort: never let a logging fault break the guard or leak an unhandled rejection.
    // Assigned to a local (not chained) so prettier keeps `log.error(` on one line — a chained
    // `.catch()` makes prettier split `log` / `.error` across lines, which stripLogEmissionCalls
    // cannot match, leaking the app_events-only PARSE_SHEET_THREW code into the §12.4 producer scan.
    const forensicLog = log.error("Parser threw on sheet parse; routing to hard_fail", {
      source: "sync",
      code: "PARSE_SHEET_THREW",
      driveFileId,
      error,
    });
    void forensicLog.catch(() => {});
  }

  // Finding C7: seed prior stored `extracted` onto the fresh agenda_links BEFORE enrich, so
  // enrichAgenda's revision cache-hit / leave-existing paths are effective. Without this a
  // transient Drive fault leaves the fresh links unenriched and applyShowSnapshot wholesale-
  // overwrites shows.agenda_links, erasing a published schedule (spec §240 preserve-never-clear).
  // Best-effort read OUTSIDE the lock (a read; enrichAgenda re-validates against Drive revision).
  // `?.length` guards fixtures/parses that leave agenda_links unset (the field is typed as a
  // required array but mock parses may omit it) — never seed when there are no agenda links.
  if (parsed.show.agenda_links?.length) {
    try {
      const priorLinks = await (deps.readStoredAgendaLinks ?? readPostgresStoredAgendaLinks)(
        driveFileId,
      );
      seedPriorAgendaExtracted(parsed.show.agenda_links, priorLinks);
    } catch {
      // best-effort: never fail the sync because the prior-agenda read faulted.
    }
  }

  let enriched: ParseResult;
  try {
    enriched = await withStepTimeout(
      "enrichWithDrivePins",
      // Thread the step's AbortSignal into enrich → enrichAgenda so an overrun of the enrich budget
      // aborts the in-flight agenda-PDF downloads instead of leaving the 6-download loop running
      // (audit idx57/#166).
      (signal) =>
        (deps.enrichWithDrivePins ?? enrichWithDrivePins)(parsed, driveClient, {
          driveFileId,
          fileMeta: toDriveFileMeta(fileMeta),
          ...(sheets !== undefined ? { sheets } : {}),
          // Surface DIAGRAMS-tab embedded images from the already-fetched export.
          ...(xlsxBytes !== undefined ? { xlsxBytes } : {}),
          signal,
        }),
      // Enrichment gets its own (larger) budget, NOT the 30s single-Drive-call default — see
      // ENRICH_STEP_TIMEOUT_MS. Every OTHER withStepTimeout call above keeps the 30s default.
      ENRICH_STEP_TIMEOUT_MS,
    );
  } catch (error) {
    if (isBinaryAssetRevisionRace(error)) {
      return {
        kind: "revision_race",
        result: { outcome: "revision_race", code: STAGED_PARSE_REVISION_RACE },
        racedHeadRevisionId: binding.bindingToken,
        payload: { bindingToken: binding.bindingToken },
      };
    }
    return {
      kind: "fetch_failure",
      binding,
      error,
      code: classifySyncFailure(error),
    };
  }

  const titleToGid = new Map<string, number>(
    (sheets ?? [])
      .filter((s): s is SpreadsheetSheet & { sheetId: number } => typeof s.sheetId === "number")
      .map((s) => [s.title, s.sheetId]),
  );
  // audit idx12+idx63: on a genuine sheets-list fetch failure, emit `undefined` (NOT `{}`)
  // so the downstream omit-on-undefined chain + persist coalesce PRESERVE the stored anchors.
  // The mock/no-op path (sheets undefined but NOT failed) and a successful fetch that finds no
  // anchors both still yield a DEFINED `{}` (unchanged behaviour — a real clear still overwrites).
  const sourceAnchors: Record<string, SourceAnchor> | undefined = sheetsListFailed
    ? undefined
    : xlsxBytes !== undefined
      ? extractSourceAnchors(xlsxBytes, titleToGid)
      : {};

  // Populate per-warning source-cell/region deep-link anchors on the cron path
  // (parse-warning deep links). Pure raw-workbook read inside the existing prepare
  // stage — no new lock (invariant 2). Reuse the already-computed titleToGid +
  // sourceAnchors (no extra fetch / recompute). attachWarningAnchors needs a defined map;
  // on a sheets-list failure there are no anchors to attach anyway, so pass `{}`.
  await attachWarningAnchors(
    enriched.warnings,
    xlsxBytes,
    async () => titleToGid,
    sourceAnchors ?? {},
  );

  let currentBinding: Phase1Binding;
  try {
    currentBinding = await withStepTimeout("reverifyBinding", () =>
      captureBinding(driveFileId, fileMeta),
    );
  } catch (error) {
    return {
      kind: "fetch_failure",
      binding,
      error,
      code: isSourceGone(error) ? STAGED_PARSE_SOURCE_GONE : classifySyncFailure(error),
    };
  }
  if (currentBinding.bindingToken !== binding.bindingToken) {
    return {
      kind: "revision_race",
      result: { outcome: "revision_race", code: STAGED_PARSE_REVISION_RACE },
      racedHeadRevisionId: binding.bindingToken,
      payload: {
        staged: binding.bindingToken,
        current: currentBinding.bindingToken,
      },
    };
  }

  // §5.2/§5.3 reconcile: attach the archived-tab offers + emit PULL_SHEET_ON_ARCHIVED_TAB
  // warnings, then compare the accepted tab's CURRENT fingerprint against the durable override.
  const archivedPullSheetTabs = xlsxBytes
    ? synthesizeMarkdownFromXlsx(xlsxBytes, includeOpts).archivedPullSheetTabs
    : [];
  finalizeArchivedTabs(enriched, archivedPullSheetTabs);

  let readyParseResult = enriched;
  let pullSheetOverrideApplied: OverrideSnapshot = overrideSnapshot(pullSheetOverride);
  let pullSheetOverrideCleared = false;
  let pullSheetOverrideClearedTab: string | undefined;
  const reconciled = reconcileIncludedTab({
    tabs: archivedPullSheetTabs,
    override: pullSheetOverride,
  });
  if (
    pullSheetOverride &&
    xlsxBytes &&
    (reconciled.kind === "content_changed" || reconciled.kind === "tab_missing")
  ) {
    // §5.2/I5b: the accepted archived gear drifted (or its tab vanished). SHARED discard-and-rerun
    // (same helper as onboarding/rescan): re-parse WITHOUT inclusion — preserving any current
    // non-OLD pull sheet, dropping only the OLD-tab gear — and defer the durable clear + forensic
    // emit to the locked apply (below), where the show: lock is held.
    const bytes = xlsxBytes;
    const discard = await discardAndRerun({
      reconcile: reconciled,
      overrideTabName: pullSheetOverride.tabName,
      reparseNoOverride: async () => {
        const noOverride = synthesizeMarkdownFromXlsx(bytes);
        // Reuse the already-enriched result (reel/diagrams are identical — the OLD tab does not
        // affect them); only the pull sheet + archived-tab list change under no-override.
        const reparsedPull = (deps.parseSheet ?? parseMarkdownSheet)(
          noOverride.markdown,
          fileMeta.name,
        );
        const cloned: ParseResult = {
          ...enriched,
          pullSheet: reparsedPull.pullSheet,
          warnings: [...enriched.warnings],
          archivedPullSheetTabs: [],
        };
        return finalizeArchivedTabs(cloned, noOverride.archivedPullSheetTabs);
      },
      clearOverride: async () => {
        pullSheetOverrideCleared = true;
      },
    });
    readyParseResult = discard.parseResult;
    pullSheetOverrideApplied = discard.appliedSnapshot;
    pullSheetOverrideCleared = true;
    pullSheetOverrideClearedTab = pullSheetOverride.tabName;
  }

  return {
    kind: "ready",
    resolvedMode: gate.mode as Exclude<ResolvedSyncMode, "asset_recovery">,
    binding,
    parseResult: readyParseResult,
    // Role-vocab drift rescue (spec §3.3): the gate marks a cron proceed that only happened
    // because this file was drift-eligible at/below the watermark. Carry it onto the ready
    // variant so the locked pipeline runs the in-lock recheck + equal-watermark stale guard.
    ...(gate.driftResync ? { driftResync: true as const } : {}),
    // audit idx12+idx63: OMIT on a genuine sheets-list fetch failure (exactOptionalPropertyTypes
    // forbids an explicit `undefined` on an optional field). The guarded cron spread
    // (`pipeline.sourceAnchors !== undefined`) reads an absent property identically → coalesce
    // receives null → the stored source_anchors are PRESERVED, not wiped to `{}`.
    ...(sourceAnchors !== undefined ? { sourceAnchors } : {}),
    ...(pullSheetOverrideApplied !== undefined ? { pullSheetOverrideApplied } : {}),
    ...(pullSheetOverrideCleared ? { pullSheetOverrideCleared } : {}),
    ...(pullSheetOverrideClearedTab !== undefined ? { pullSheetOverrideClearedTab } : {}),
    // §5.7/I5a: the pre-lock override snapshot this parse was produced under. Re-read + compared
    // under the show: lock in processOneFile_unlocked; a TOCTOU change (e.g. a concurrent finalize
    // propagation writing shows.pull_sheet_override) makes this parse stale → refuse-and-retry.
    pullSheetOverrideUsed: overrideSnapshot(pullSheetOverride),
  };
}

/** §5.7 snapshot equality: both null, or same tabName+fingerprint. null↔set differs. */
function pullSheetOverrideSnapshotsEqual(a: OverrideSnapshot, b: OverrideSnapshot): boolean {
  if (a === null || b === null) return a === b;
  return a.tabName === b.tabName && a.fingerprint === b.fingerprint;
}

/** Re-read the durable override under the held show: lock (TOCTOU authority for §5.7). */
async function readShowPullSheetOverride_unlocked(
  tx: LockedShowTx<SyncPipelineTx>,
  driveFileId: string,
): Promise<OverrideSnapshot> {
  const row = await tx.queryOne<{ pull_sheet_override: PullSheetOverride | null }>(
    `select pull_sheet_override from public.shows where drive_file_id = $1`,
    [driveFileId],
  );
  return overrideSnapshot(row?.pull_sheet_override ?? null);
}

/**
 * §5.2/I5b durable auto-clear of the archived-tab override, under the held show: lock.
 * Narrow single-purpose writer so the shows-UPDATE tripwire
 * (`tests/sync/_secondCopyApplyTripwire.test.ts`) registers exactly this symbol.
 */
async function clearShowPullSheetOverride_unlocked(
  tx: LockedShowTx<SyncPipelineTx>,
  driveFileId: string,
): Promise<void> {
  await tx.queryOne(`update public.shows set pull_sheet_override = null where drive_file_id = $1`, [
    driveFileId,
  ]);
}

/**
 * Drift-rescued cron runs ONLY (spec §3.3 "Recheck placement is load-bearing", R4/R5): re-verify
 * published + no-live-pending under the held lock as the FIRST drift step, BEFORE
 * `runPhase1_unlocked` — Phase 1 mutates durable state on non-happy paths (hard-fail marks `shows`,
 * shrink holds write hold state, review branches upsert `pending_syncs` (live-partition:n/a — doc
 * reference, no statement)). Returns `true` (BLOCKED)
 * when the show is no longer published, or a live (`wizard_session_id is null`) `pending_syncs` gate
 * row now exists, or the show row vanished. `archived = false` is kept as defense-in-depth only; the
 * archived RACE is authoritatively owned by the earlier DEF-4 re-read (`readShowArchived_unlocked`),
 * which returns ARCHIVED_SKIP_REASON first (plan R1 F1). The live-partition predicate mirrors the
 * live `pending_syncs` read at :954. (live-partition:n/a — doc reference above; the statement's own
 * classification is the live-partition:live-only annotation inside the SQL below.)
 */
async function readDriftRecheckBlocked_unlocked(
  tx: LockedShowTx<SyncPipelineTx>,
  driveFileId: string,
): Promise<boolean> {
  const row = await tx.queryOne<{ ok: boolean } | null>(
    `select (s.published = true and s.archived = false
             and not exists (select 1 from public.pending_syncs p
                              -- live-partition:live-only — live pending_syncs existence probe
                              -- (wizard_session_id is null): a drift-rescued run must never
                              -- apply over a live pending review (spec §3.3 R1 F1/R5 F1).
                              where p.drive_file_id = s.drive_file_id
                                and p.wizard_session_id is null)) as ok
       from public.shows s where s.drive_file_id = $1`,
    [driveFileId],
  );
  return row?.ok !== true;
}

export async function processOneFile_unlocked(
  tx: LockedShowTx<SyncPipelineTx>,
  driveFileId: string,
  mode: SyncMode,
  fileMeta: DriveListedFile,
  deps: ProcessOneFileDeps = {},
  prepared?: PreparedProcessOneFile,
): Promise<ProcessOneFileResult> {
  await assertShowLockHeld(tx, driveFileId);
  // DEF-4: authoritative in-lock archived re-read (an Archive may have committed between prepare and
  // lock acquisition). Silent abort — return WITHOUT logSync / any persisted mutation.
  if (await readShowArchived_unlocked(tx, driveFileId)) {
    return { outcome: "skipped", reason: ARCHIVED_SKIP_REASON };
  }
  const txDeps = txBoundProcessDeps(tx, deps);
  if (!prepared) {
    throw new SyncInfraError(
      "processOneFile_unlocked",
      "thrown_error",
      new Error("prepared process data is required before acquiring the show lock"),
    );
  }
  const pipeline = prepared;

  // Role-vocab drift recheck (spec §3.3 R4/R5): for a drift-rescued run ONLY, re-verify
  // published + no-live-pending under the held lock as the FIRST drift step — before
  // recheckLiveDeferralAfterLock and runPhase1_unlocked, both of which can mutate durable state.
  // The archived race is already owned by the DEF-4 re-read above (ARCHIVED_SKIP_REASON). A blocked
  // recheck is a benign skip with ZERO Phase 1 side effects.
  if (pipeline.kind === "ready" && pipeline.driftResync) {
    if (await readDriftRecheckBlocked_unlocked(tx, driveFileId)) {
      const result = { outcome: "skipped" as const, reason: "drift_recheck_failed" };
      await logSync(txDeps, driveFileId, result);
      return result;
    }
  }

  const lockedDeferralSkip = await recheckLiveDeferralAfterLock(tx, driveFileId, mode, fileMeta);
  if (lockedDeferralSkip) {
    await logSync(txDeps, driveFileId, lockedDeferralSkip);
    return lockedDeferralSkip;
  }

  if (pipeline.kind === "skip") {
    await logSync(txDeps, driveFileId, pipeline.result, pipeline.payload);
    return pipeline.result;
  }
  if (pipeline.kind === "asset_recovery") {
    await logSync(txDeps, driveFileId, pipeline.result);
    return pipeline.result;
  }
  if (pipeline.kind === "revision_race_cooldown") {
    await logSync(txDeps, driveFileId, pipeline.result, pipeline.payload);
    return pipeline.result;
  }
  if (pipeline.kind === "revision_race") {
    await recordRevisionRaceCooldown(tx, driveFileId, pipeline.racedHeadRevisionId);
    await logSync(txDeps, driveFileId, pipeline.result, pipeline.payload);
    return pipeline.result;
  }
  if (pipeline.kind === "fetch_failure") {
    return await handleFetchFailure_unlocked(
      tx,
      driveFileId,
      fileMeta,
      pipeline.binding,
      pipeline.error,
      pipeline.code,
    );
  }

  // §5.7/I5a locked-snapshot protocol (mirror of rescanWizardSheet): re-read the durable override
  // under the held show: lock. prepareProcessOneFile read it + parsed BEFORE the lock, so a
  // concurrent finalize propagation could have changed shows.pull_sheet_override in the TOCTOU
  // window. If it differs from the pre-lock snapshot this parse was produced under, the parse is
  // STALE — refuse-and-retry: apply/clear NOTHING, so we never clobber the newer override. The next
  // cron re-derives under the current override.
  if (pipeline.pullSheetOverrideUsed !== undefined) {
    const lockedSnapshot = await readShowPullSheetOverride_unlocked(tx, driveFileId);
    if (!pullSheetOverrideSnapshotsEqual(pipeline.pullSheetOverrideUsed, lockedSnapshot)) {
      return { outcome: "skipped", reason: "pull_sheet_override_changed_under_lock" };
    }
  }

  // §5.2/I5b durable auto-clear (under the show: lock): the pre-lock reconcile discarded the
  // override (content drift or the tab vanished). Clear the DURABLE shows.pull_sheet_override so
  // the next cron re-parses with no override (never sticky on a stale fingerprint), and emit the
  // forensic CONTENT_CHANGED signal. The applied parse (pipeline.parseResult) already dropped the
  // changed OLD gear while preserving any current non-OLD pull sheet.
  if (pipeline.pullSheetOverrideCleared) {
    await clearShowPullSheetOverride_unlocked(tx, driveFileId);
    const emit =
      deps.emitPullSheetOverrideContentChanged ?? defaultEmitPullSheetOverrideContentChanged;
    await emit({ driveFileId, tabName: pipeline.pullSheetOverrideClearedTab ?? "" });
  }

  const phase1 = await runPhase1_unlocked(
    tx,
    {
      driveFileId,
      mode: pipeline.resolvedMode,
      fileMeta,
      parseResult: pipeline.parseResult,
      binding: pipeline.binding,
      // §5.8: Flow C live-staging writes pull_sheet_override_applied with the staged parse.
      ...(pipeline.pullSheetOverrideApplied !== undefined
        ? { pullSheetOverrideApplied: pipeline.pullSheetOverrideApplied }
        : {}),
      ...(deps.acceptShrink !== undefined ? { acceptShrink: deps.acceptShrink } : {}),
      ...(deps.expectedModifiedTime !== undefined
        ? { expectedModifiedTime: deps.expectedModifiedTime }
        : {}),
    },
    txDeps,
  );
  if (phase1.outcome === "hard_fail") {
    // Carry phase1's showId through: an EXISTING-show hard_fail committed
    // shows.last_sync_status='parse_error', so revalidateShowFromResult (file-loop, post-commit)
    // must bust the crew cache tag. null for a first-seen hard_fail (nothing written). (idx17/#102)
    const result = {
      outcome: "hard_fail" as const,
      code: phase1.code,
      showId: phase1.showId ?? null,
    };
    await logSync(txDeps, driveFileId, result);
    const show = await tx.readShowForPhase1(driveFileId);
    if (show?.showId) {
      // B3 §4.1: show-level PARSE_ERROR_LAST_GOOD producer, in the
      // locked hard_fail branch after Phase 1 has retained last-good.
      const upsertAdminAlert = requireTxBoundUpsertAdminAlert(txDeps, "processOneFile_unlocked");
      await upsertAdminAlert({
        showId: show.showId,
        code: "PARSE_ERROR_LAST_GOOD",
        context: {
          drive_file_id: driveFileId,
          sheet_name: show.priorParseResult.show.title,
        },
      });
      await resolveStaleSyncProblemAlerts_unlocked(
        tx,
        show.showId,
        syncProblemCodeForStatus("parse_error"),
      );
    }
    return result;
  }
  if (phase1.outcome === "shrink_held") {
    // Retain last-good: STOP before Phase 2 (data-safety, Codex plan-R2). Without this branch a
    // shrink_held phase1 result would fall through to runPhase2_unlocked and CLOBBER the roster.
    // A later task enhances this branch to also raise RESYNC_SHRINK_HELD + resolve stale peers —
    // those are grep-coupled to SYNC_PROBLEM_CODES and the §12.4 catalog, so they land together
    // there. This minimal branch only returns (no alert, no code literal).
    const result = {
      outcome: "shrink_held" as const,
      showId: phase1.showId ?? null,
      detail: phase1.message,
      heldModifiedTime: phase1.heldModifiedTime,
    };
    await logSync(txDeps, driveFileId, result);
    const show = await tx.readShowForPhase1(driveFileId);
    if (show?.showId) {
      // §4.1 producer: show-level RESYNC_SHRINK_HELD in the locked shrink_held branch
      // after Phase 1 has retained last-good. Mirrors the hard_fail branch above.
      const upsertAdminAlert = requireTxBoundUpsertAdminAlert(txDeps, "processOneFile_unlocked");
      await upsertAdminAlert({
        showId: show.showId,
        code: "RESYNC_SHRINK_HELD",
        context: {
          drive_file_id: driveFileId,
          sheet_name: show.priorParseResult.show.title,
          detail: phase1.message,
          held_modified_time: phase1.heldModifiedTime,
        },
      });
      await resolveStaleSyncProblemAlerts_unlocked(
        tx,
        show.showId,
        syncProblemCodeForStatus("shrink_held"), // === "RESYNC_SHRINK_HELD" → keeps its own row
      );
    }
    return result;
  }
  if (phase1.outcome === "stage") {
    const result = { outcome: "stage" as const, stagedId: phase1.stagedId };
    await logSync(txDeps, driveFileId, result);
    return result;
  }
  if (phase1.outcome === "defer") {
    const result = { outcome: "skipped" as const, reason: phase1.reason };
    await logSync(txDeps, driveFileId, result, {
      kind: "mi8_debounce_skip",
      reason: phase1.reason,
    });
    return result;
  }
  const autoPublishFirstSeen =
    phase1.outcome === "auto_publish_ready"
      ? {
          unpublishToken: (deps.createUnpublishToken ?? randomUUID)(),
          unpublishTokenExpiresAt: addHours((deps.now ?? (() => new Date()))(), 24).toISOString(),
        }
      : undefined;

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
  // Unit C (audit #16) + notableItems share ONE pre-apply read (captured BEFORE phase2 overwrites
  // shows_internal.parse_warnings). Only existing shows (pass / auto_apply_with_holds) have a prior;
  // a first-seen show ('auto_publish_ready') has no prior, so both consumers correctly skip.
  const priorShow =
    phase1.outcome === "pass" || phase1.outcome === "auto_apply_with_holds"
      ? await tx.readShowForPhase1(driveFileId)
      : null;
  // Task 2.9: derive the notable changes (renames, section shrink, field changes, asset drift) for
  // the auto-apply show_change_log feed rows. Only an EXISTING show (phase1 'pass' or
  // 'auto_apply_with_holds') has a prior to diff against; a first-seen show ('auto_publish_ready')
  // has no prior, so notableItems stays empty and no extra read happens.
  const notableItems: TriggeredReviewItem[] =
    phase1.outcome === "pass" || phase1.outcome === "auto_apply_with_holds"
      ? await (async () => {
          if (!priorShow) return [];
          // Defensive: runInvariants is pure but a degraded/minimal parseResult could throw; the
          // change-log is best-effort and must never fail the sync. Production parses always carry
          // full dates/crew, so this only guards malformed fixtures / partial parses.
          let invariantItems: TriggeredReviewItem[] = [];
          try {
            const inv = runInvariants(priorShow.priorParseResult, pipeline.parseResult);
            invariantItems = inv.outcome === "stage" ? inv.triggeredItems : [];
          } catch {
            invariantItems = [];
          }
          // P2-F3: include the sync-layer asset-drift items (DIAGRAMS_*/REEL_DRIFT_PENDING). These
          // come from the parse warnings, NOT runInvariants — without them the asset_drift feed row
          // is never written on the real path (PF34: asset drift auto-applies but must still notify).
          const phase1ArgsForSyncLayer: Phase1Args = {
            driveFileId,
            mode: pipeline.resolvedMode as Phase1Args["mode"],
            fileMeta,
            parseResult: pipeline.parseResult,
            binding: pipeline.binding,
          };
          const assetItems = syncLayerReviewItems(
            phase1ArgsForSyncLayer,
            pipeline.parseResult,
            priorShow,
          );
          return [...invariantItems, ...assetItems];
        })()
      : [];

  // Class C (§5.3, VB10) — derive BLOCK_DISAPPEARED parse-warnings from the MI-7
  // items (new_count===0) so a vanished block also reaches the parse-warning-based
  // surfaces (per-show Data-Quality panel). This does NOT add a feed row — MI-7
  // already wrote its single section_shrunk row — so there is exactly one feed row
  // and one parse-warning per disappearance. Suppressed when a SECTION_HEADER_NO_FIELDS
  // warning already covers the (normalized) block. Appended to parseResult.warnings
  // before Phase 2 persists shows_internal.parse_warnings. First-seen (no prior →
  // notableItems empty) yields nothing, correctly.
  {
    const disappearedWarnings = blockDisappearanceWarnings(
      notableItems,
      pipeline.parseResult.warnings,
    );
    if (disappearedWarnings.length > 0) {
      pipeline.parseResult.warnings.push(...disappearedWarnings);
    }
  }

  // BL-CREW-RENAME-SILENT-REPLACEMENT (spec §3.3): classified rename pairs to land as
  // identity-preserving in-place renames. MI-12 always; MI-13/MI-14 only when THIS run is the
  // version-bound accepted apply — the same predicate phase1's hold fall-through uses
  // (acceptShrink + expectedModifiedTime === binding.modifiedTime), recomputed here where the
  // Phase-2 args are built. Onboarding/first-seen never reach this with items (notableItems is
  // pass/auto-apply-only above).
  const acceptedShrinkThisVersion =
    deps.acceptShrink === true && deps.expectedModifiedTime === pipeline.binding.modifiedTime;
  const identityLinkRenames = computeIdentityLinkRenames(notableItems, acceptedShrinkThisVersion);

  // §6.2 loader: the GLOBAL role_token_mappings vocabulary, normalized at the single JSONB
  // boundary. Read read-only inside the existing pipeline tx (postgres.js `unsafe`, not a
  // supabase-js call site → outside _metaInfraContract scope by construction). This shared core
  // covers cron AND manual (runManualSyncForShow runs processOneFile, runScheduledCronSync.ts:12).
  const roleMappingAgg = await tx.queryOne<{ rows: unknown }>(
    `select coalesce(jsonb_agg(jsonb_build_object(
        'token', token, 'grants', grants, 'decided_by', decided_by, 'decided_at', decided_at)), '[]'::jsonb) as rows
       from role_token_mappings`,
    [],
  );
  const roleTokenMappings = normalizeRoleTokenMappings(roleMappingAgg?.rows ?? []);

  const phase2 = await runPhase2_unlocked(
    tx,
    {
      driveFileId,
      mode: pipeline.resolvedMode as Phase2Mode,
      fileMeta,
      parseResult: pipeline.parseResult,
      binding: pipeline.binding,
      // Task 5 (spec §3.3): a drift-rescued cron run relaxes the stale CAS to less_than_or_equal
      // so the equal-watermark re-apply over an unchanged sheet lands.
      ...(pipeline.driftResync ? { driftResync: true } : {}),
      ...(snapshotAssetsForApply ? { snapshotAssetsForApply } : {}),
      ...(snapshotAssetsForApplyForShowId ? { snapshotAssetsForApplyForShowId } : {}),
      // Cron just captured the reel tuple during this same Drive-read pass; manual Apply
      // re-verifies because review latency creates the drift window.
      verifyReelOnApply: false,
      ...(autoPublishFirstSeen ? { autoPublishFirstSeen } : {}),
      // Phase 2 decision rule: an MI-11 parse routes to auto_apply_with_holds — write the holds +
      // run the hold-aware apply inside the same locked txn.
      ...(phase1.outcome === "auto_apply_with_holds" ? { mi11Items: phase1.mi11Items } : {}),
      // Task 2.9: drive the auto-apply changes feed.
      notableItems,
      ...(identityLinkRenames.length > 0 ? { identityLinkRenames } : {}),
      // Task 6: thread the prior show's stored "use raw" decisions into the runPhase2 overlay.
      // Only an EXISTING show (pass / auto_apply_with_holds) has a priorShow; first-seen → [].
      ...(priorShow?.useRawDecisions ? { useRawDecisions: priorShow.useRawDecisions } : {}),
      // §6.2/§10: the global role-mapping overlay input (always threaded) + the prior persisted
      // parse_warnings the delta gate reads (§10 point 2). priorParseWarnings is threaded ONLY when
      // a priorShow exists; its absence at genuine first publish is the emit-everything-new signal.
      roleTokenMappings,
      ...(priorShow ? { priorParseWarnings: priorShow.priorParseResult.warnings } : {}),
      // Task 5: thread source-region anchors into applyShowSnapshot (Task 6 persists them).
      ...(pipeline.sourceAnchors !== undefined ? { sourceAnchors: pipeline.sourceAnchors } : {}),
    },
    txDeps,
  );

  if (phase2.outcome === "stale") {
    const result = { outcome: "stale" as const, code: phase2.code };
    await logSync(txDeps, driveFileId, result);
    return result;
  }

  const result: ProcessOneFileResult = {
    outcome: "applied" as const,
    showId: phase2.showId,
    // §02 (FIX-3): source the sync_log parse_warnings from this apply's outcome (cron caller #1).
    parseWarnings: phase2.parseWarnings ?? [],
    // §10 point 5: carry the gate-passing entries to processOneFile's post-commit emit region.
    appliedRoleMappings: phase2.appliedRoleMappings,
  };
  if (phase2.roleFlagsNotice) result.roleFlagsNotice = phase2.roleFlagsNotice;
  if (phase2.snapshotRevisionId) result.snapshotRevisionId = phase2.snapshotRevisionId;
  await emitSuccessfulPhase2Tail({
    tx,
    result,
    deps: {
      ...txDeps,
      upsertAdminAlert: requireTxBoundUpsertAdminAlert(txDeps, "emitSuccessfulPhase2Tail"),
    },
    driveFileId,
    fileMeta,
    parseResult: pipeline.parseResult,
    autoPublishFirstSeen,
  });
  // Unit C (audit #16): evaluate post-apply data-quality regression against the PRE-apply snapshot.
  // priorShow was captured before runPhase2_unlocked persisted the new warnings, so
  // priorParseWarningsRaw is the prior last-good baseline (NOT the just-applied warnings). First-seen
  // (priorShow === null) → producer skips. C is NOT in SYNC_PROBLEM_CODES, so the sweep below never
  // touches it. Post-commit? No — this runs pre-commit inside the show lock like the tail; the alert
  // upsert is tx-bound (invariant 10's post-commit rule is for the crew/admin outcome channel).
  await evaluateQualityRegression_unlocked({
    tx,
    deps: {
      ...txDeps,
      upsertAdminAlert: requireTxBoundUpsertAdminAlert(txDeps, "evaluateQualityRegression"),
    },
    driveFileId,
    showId: result.showId,
    priorParseWarningsRaw: priorShow?.priorParseWarningsRaw ?? null,
    nextWarnings: pipeline.parseResult.warnings,
    sheetName: pipeline.parseResult.show.title,
  });
  await resolveStaleSyncProblemAlerts_unlocked(tx, result.showId, null);
  return result;
}

/**
 * Raise a durable per-show sync-problem alert for an infra fault that ESCAPED
 * `processOneFile` (reaching the cron file-loop catch below). That path builds a
 * `parse_error` result but — unlike `handleFetchFailure_unlocked` — never marks
 * the show or raises an alert, so a show could fail every cron run visible only
 * as the aggregate `partial` run summary (the 2026-07-03 outage class). We reuse
 * the existing `DRIVE_FETCH_FAILED` sync-problem code (already the generic
 * drive/parse failure alert; no new §12.4 code) via the canonical
 * `upsert_admin_alert` RPC. A FRESH connection is required — the pipeline tx has
 * already rolled back/ended by the time we reach the catch. Auto-resolves on the
 * next successful sync via `resolveStaleSyncProblemAlerts_unlocked`. Best-effort:
 * the caller swallows failures so alerting never fails the run.
 */
export async function emitEscapedSyncFailureAlert(
  driveFileId: string,
  failureCode: string,
): Promise<void> {
  const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 1, prepare: false });
  try {
    const rows = (await sql`
      select id::text as show_id, title
        from public.shows
       where drive_file_id = ${driveFileId}
       limit 1
    `) as Array<{ show_id: string; title: string | null }>;
    const show = rows[0];
    if (!show) return; // first-seen / no live show row → nothing to attribute
    await sql`
      select public.upsert_admin_alert(
        ${show.show_id}::uuid,
        'DRIVE_FETCH_FAILED',
        ${sql.json({
          drive_file_id: driveFileId,
          failure_code: failureCode,
          // §12.4 <sheet-name> placeholder for the AlertBanner interpolation.
          sheet_name: show.title,
        })}::jsonb
      )
    `;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function runScheduledCronSync(
  deps: RunScheduledCronSyncDeps = {},
): Promise<RunScheduledCronSyncResult> {
  const finishCompletedRun = async (
    result: RunScheduledCronSyncResult,
  ): Promise<RunScheduledCronSyncResult> => {
    const heartbeat = await (deps.writeSyncCronHeartbeat ?? defaultWriteSyncCronHeartbeat)();
    if (heartbeat.kind !== "infra_error") return result;
    return {
      ...result,
      maintenanceFaults: {
        ...result.maintenanceFaults,
        syncCronHeartbeat: "infra_error",
      },
    };
  };

  let inFlightPhase:
    | "resolve-folder"
    | "list-folder"
    | "list-live-shows"
    | "missing-shows"
    | "file-loop"
    | "finish" = "resolve-folder";
  let inFlightDriveFileId: string | null = null;
  let resolvedFolderId: string | null = null;
  // HOISTED for the hybrid-lifecycle epilogue (spec 2026-07-16 §3.4): the listed
  // drive_file_id -> Drive modifiedTime map, assigned once the folder is listed.
  let listedFiles: ReadonlyMap<string, string> = new Map();
  const processed: RunScheduledCronSyncResult["processed"] = []; // HOISTED for throw attribution

  // Keep the local lets (read by the S1 syncRunContext attach below) AND the
  // request-context ALS in sync, so a throw that BYPASSES the S1 try (a detached
  // Drive-promise rejection surfaced into the request) still carries which-record
  // context via runCronRoute's ALS fallback (audit #4 PR-1).
  const setPhase = (p: typeof inFlightPhase) => {
    inFlightPhase = p;
    setCronInFlight({ phase: p });
  };
  const setInFlightId = (id: string | null) => {
    inFlightDriveFileId = id;
    setCronInFlight({ driveFileId: id, processedCount: processed.length });
  };
  setCronInFlight({ phase: inFlightPhase, processedCount: 0 }); // seed "resolve-folder"

  try {
    const folderResult = deps.folderId
      ? { folderId: deps.folderId }
      : await (deps.getActiveWatchedFolderId ?? getActiveWatchedFolderId)();
    if ("kind" in folderResult) {
      if (folderResult.kind === "no_folder_configured") {
        await deps.logSync?.({
          driveFileId: null,
          outcome: "skipped",
          code: "no_folder_configured",
          payload: {
            kind: "cron_no_folder_configured",
            skip_reason: "no_folder_configured",
          },
        });
        // `await` so a heartbeat-write rejection is caught by the outer catch (attributed),
        // not returned as an unawaited rejecting promise that bypasses it.
        return await finishCompletedRun({
          processed: [],
          summary: { outcome: "skipped", skipReason: "no_folder_configured" },
        });
      }
      await deps.logSync?.({
        driveFileId: null,
        outcome: "parse_error",
        code: SYNC_INFRA_ERROR,
        payload: errorPayload(folderResult.cause),
      });
      return { processed: [], summary: { outcome: "parse_error", code: SYNC_INFRA_ERROR } };
    }

    const folderId = folderResult.folderId;
    resolvedFolderId = folderId;
    const listFolder =
      deps.listFolder ??
      ((id: string) => listDriveFolder(id, { onWarning: emitUnexpectedParentWarning }));
    const runOne = deps.processOneFile ?? processOneFile;
    setPhase("list-folder");
    const files = await listFolder(folderId);
    const listedDriveFileIds = new Set(files.map((file) => file.driveFileId));
    listedFiles = new Map(files.map((file) => [file.driveFileId, file.modifiedTime]));
    setPhase("list-live-shows");
    const liveShows = deps.listLiveShows
      ? await deps.listLiveShows()
      : deps.listFolder
        ? []
        : await listPostgresLiveShows();
    const missingShows = liveShows.filter(
      (show) => show.wizardSessionId === null && !listedDriveFileIds.has(show.driveFileId),
    );
    const lockMissingShow = deps.withShowLock ?? withPostgresSyncPipelineLock;

    // Role-vocab drift pre-pass (Task 6, spec §3.2/§3.3): derive the set of published
    // drive_file_ids whose stored role vocabulary drifted from the live role_token_mappings, so the
    // file-loop gate can rescue an at-watermark skip into a `driftResync` apply. Fail-open — a scan
    // fault degrades to an empty (inert) set and NEVER fails the tick. A test-injected `listFolder`
    // means this run must not touch the ambient DB: mirror the `listLiveShows` guard so the real DB
    // scanner fires only on the un-injected production path.
    let driftEligible: ReadonlySet<string> = new Set();
    try {
      driftEligible = deps.listRoleVocabDriftEligible
        ? await deps.listRoleVocabDriftEligible()
        : deps.listFolder
          ? new Set()
          : await listRoleVocabDriftEligibleFileIds();
      if (driftEligible.size > 0) {
        await log.info("role-vocab drift resync eligibility computed", {
          source: "cron/sync",
          code: "ROLE_VOCAB_DRIFT_RESYNC_ELIGIBLE",
          persist: true,
          count: driftEligible.size,
          driveFileIds: [...driftEligible],
        });
      }
    } catch (error) {
      await log.warn("role-vocab drift scan failed; treating set as empty", {
        source: "cron/sync",
        code: "ROLE_VOCAB_DRIFT_SCAN_FAILED",
        persist: true,
        ...errorPayload(error),
      });
    }
    // exactOptional: carry `roleVocabDriftEligibleIds` unconditionally (empty set is inert); keep
    // `logSync` present-only so an absent injector stays absent rather than `undefined`.
    const processDeps: Pick<ProcessOneFileDeps, "logSync" | "roleVocabDriftEligibleIds"> = {
      roleVocabDriftEligibleIds: driftEligible,
      ...(deps.logSync ? { logSync: deps.logSync } : {}),
    };

    setPhase("missing-shows");
    for (const show of missingShows) {
      setInFlightId(show.driveFileId);
      const result = await lockMissingShow(show.driveFileId, (lockedTx) =>
        markMissingShow_unlocked(lockedTx, show),
      );
      if ("skipped" in result) {
        // Finding-#16 sibling nit (ASSESSED — no code change): unlike the file-loop
        // path (which records contention via `deps.logSync` → sync_log), this
        // missing-show branch's durable record is the app_events channel below. That
        // split is INTENTIONAL and acceptable — BOTH channels persist: this emit is a
        // durable coded record (info-WITH-code, forced via `persist: true`) carrying a
        // stable forensic `code` and the `driveFileId`, so the missing-show contention
        // is queryable and self-correlating without duplicating it into sync_log
        // (which is keyed to the file-loop's per-file processing, not to a show that is
        // absent from the listing this pass).
        await log.info("missing-show sync skipped on lock contention", {
          source: "cron/sync",
          code: "CONCURRENT_SYNC_SKIPPED",
          driveFileId: show.driveFileId,
          persist: true,
        });
        processed.push({
          driveFileId: show.driveFileId,
          result,
        });
        setInFlightId(null); // benign completion
        continue;
      }
      // nav-perf tag-caching (Task 5): only a source_gone result means
      // markMissingShow_unlocked ran the markShowSheetUnavailable shows-row UPDATE
      // inside the now-resolved lock — post-commit here, so revalidate the show's
      // tag. The archived-skip branch (`{ outcome: "skipped" }`) silently returns
      // without writing the shows row, so it is explicitly excluded.
      // (Comment avoids the literal SQL pattern the _secondCopyApplyTripwire +
      // showCacheRevalidateCoverage regexes scan for.)
      if (result.outcome === "source_gone") {
        revalidateShow(show.showId);
      }
      processed.push({
        driveFileId: show.driveFileId,
        result,
      });
      setInFlightId(null); // benign completion
    }

    setPhase("file-loop");
    for (const file of files) {
      setInFlightId(file.driveFileId);
      try {
        // nav-perf tag-caching (Task 5 / whole-diff R2): `runOne` (= processOneFile) owns the
        // per-show pipeline lock (withPostgresSyncPipelineLock → sql.begin); when
        // this await resolves the apply tx has COMMITTED. Revalidate the show's
        // cache tag HERE — post-commit — never inside processOneFile_unlocked /
        // emitSuccessfulPhase2Tail (those run inside sql.begin = pre-commit, which
        // would expose a stale-read window). showId-presence gate: busts on applied
        // AND on the parse_error/source_gone recovery outcomes AND on an EXISTING-show
        // hard_fail (all of which carry showId + commit last_sync_status). No-op on
        // skipped/stale/revision_race/stage and a first-seen hard_fail (no showId — nothing
        // written to `shows`). The catch-built parse_error below carries no showId.
        const result = await runOne(file.driveFileId, "cron", file, processDeps);
        revalidateShowFromResult(result);
        processed.push({
          driveFileId: file.driveFileId,
          result,
        });
      } catch (error) {
        const result = {
          outcome: "parse_error" as const,
          code: classifySyncFailure(error),
        };
        await deps.logSync?.({
          driveFileId: file.driveFileId,
          outcome: result.outcome,
          code: result.code,
          payload: errorPayload(error),
        });
        // Escaped infra fault: processOneFile's in-lock recovery (mark + alert)
        // did not run. Raise a durable per-show alert so persistent failures reach
        // the notify tier, not just the aggregate summary. Best-effort — never fail
        // the run on an alert-emit error.
        try {
          await (deps.emitEscapedSyncFailureAlert ?? emitEscapedSyncFailureAlert)(
            file.driveFileId,
            result.code,
          );
        } catch {
          // swallow: alerting is advisory, the sync run must complete
        }
        processed.push({
          driveFileId: file.driveFileId,
          result,
        });
      }
      setInFlightId(null); // reached only if neither try nor catch re-threw
    }

    // Hybrid-lifecycle epilogue (spec 2026-07-16 §3.4): resolve the open
    // ONBOARDING_SHEET_UNREADABLE alert if every previously-failed sheet has
    // healed. POST-COMMIT, no advisory lock, fail-open (never fail the tick).
    // The default helper is suppressed when a test-injected `listFolder` is
    // present (mirrors the listLiveShows / driftEligible ambient-DB guard); an
    // explicitly-injected observer spy ALWAYS runs. The only durable emit is the
    // info-level forensic code on a successful resolve (never warn/error).
    try {
      const resolveHealed = deps.resolveUnreadableAlertIfHealed
        ? deps.resolveUnreadableAlertIfHealed
        : deps.listFolder
          ? null
          : resolveUnreadableAlertIfHealed;
      if (resolveHealed) {
        const r = await resolveHealed({ activeFolderId: folderId, listedFiles });
        if (r.kind === "ok" && r.resolved) {
          await log.info("onboarding unreadable-sheet alert auto-resolved (cron heal)", {
            source: "cron/sync",
            code: "ONBOARDING_ALERT_AUTO_RESOLVED",
          });
        }
      }
    } catch {
      /* fail-open: never fail the tick */
    }

    setPhase("finish");
    // `await` (not a bare promise return) so a heartbeat-write rejection is caught by the
    // outer catch and attributed with phase "finish", instead of bypassing it.
    return await finishCompletedRun({ processed });
  } catch (err) {
    if (err && typeof err === "object") {
      (err as { syncRunContext?: unknown }).syncRunContext = {
        phase: inFlightPhase,
        folderId: resolvedFolderId,
        inFlightDriveFileId,
        processedBeforeThrow: processed.length,
        failures: classifyProcessed(processed).breadcrumbs,
      };
    }
    throw err; // preserve semantics; wrapper is the sole emitter (no double-log)
  }
}
