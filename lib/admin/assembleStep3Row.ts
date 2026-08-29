/**
 * lib/admin/assembleStep3Row.ts
 *
 * The Step-3 unified read's per-row assembly, extracted verbatim from
 * `components/admin/OnboardingWizard.tsx` (spec
 * `docs/superpowers/specs/admin/2026-08-02-step3-live-render-cluster-design.md`
 * §2.4). `buildStep3Row` is the pure derivation core; `assembleStep3Row` is the
 * FULL row production path — the core plus the two presentation-enrichment
 * branches (clean-row parse/title, hard-fail ingestion id) the wizard's fetch
 * loop used to inline. Both the production loop and the seeded state-gallery
 * test consume this module, so the gallery measures the same executable seam
 * the live render does.
 *
 * Server-safe by construction: no React imports, type-only import of the
 * Step-3 row types.
 */
import type { Step3Row, Step3ManifestStatus } from "@/components/admin/wizard/Step3Review";
import type { ParseResult, TriggeredReviewItem } from "@/lib/parser/types";
import type { SourceAnchor } from "@/lib/sheet-links/buildSheetDeepLink";
import type { AdminAgendaItem } from "@/lib/agenda/agendaAdminPreview";
import type { UseRawDecision } from "@/lib/sync/useRawOverlay";
import { coerceOverrideSnapshotFromRow } from "@/lib/sync/pullSheetOverride";
import { parseTriggeredReviewItems } from "@/lib/staging/triggeredReviewItems";
import { isStructurallyValidReviewItem } from "@/lib/staging/reviewPayloadGuards";
import { deriveStep3DisplayState } from "@/lib/admin/step3DisplayState";

// FIX 1 (CRITICAL): a "clean review row" is one that renders as the publish
// CARD — manifest 'staged' (unchecked) OR 'applied' (checked). Both carry the
// surviving pending_syncs parse preview; an 'applied' row keeps its card +
// checked, individually-uncheckable checkbox so per-row uncheck survives a
// router.refresh(). 'applied' is NOT a blocking status.
const isCleanReviewRow = (s: Step3ManifestStatus): boolean => s === "staged" || s === "applied";

/** Minimal manifest shape buildStep3Row derives from. */
export type ManifestRowForBuild = {
  drive_file_id: string;
  status: Step3ManifestStatus;
  name?: string | null;
  publish_intent?: boolean | null;
  created_show_id?: string | null;
  wizard_session_id: string;
};

/** Raw pending_syncs row (clean rows only). null for hard_failed/skipped/resolved
 *  rows, which carry no pending_syncs row (plan-R3). */
export type PendingSyncRowForBuild = {
  staged_id: string;
  parse_result: unknown;
  last_finalize_failure_code?: string | null;
  triggered_review_items?: unknown;
  pull_sheet_override?: unknown;
} | null;

/** A public.shows candidate for the row's drive_file_id. */
export type ShowCandidate = {
  id: string;
  drive_file_id: string;
  published: boolean;
  archived: boolean;
  wizard_created_session_id: string | null;
  // The show's crew-page slug (wizard-warning-ignore-controls §2.1 Phase A). Optional
  // so pure buildStep3Row unit tests need not supply it; fetchStep3Data always selects
  // it. When the candidate wins linked-show resolution AND the slug is a usable
  // non-empty string, buildStep3Row emits `row.linkedShowRef` — the signal that this
  // row's ignores live in the durable show-keyed table rather than the staged column.
  slug?: string | null;
  // Summary fields (owner decision 2026-07-06) for the post-finalize badge-only
  // backfill. Optional so pure buildStep3Row unit tests need not supply them;
  // fetchStep3Data always selects them. When the candidate wins linked-show
  // resolution, buildStep3Row copies these onto row.linkedShowSummary.
  title?: string | null;
  clientLabel?: string | null;
  venue?: unknown;
  dates?: unknown;
};

/**
 * The staged pending_syncs preview the clean-row branch layers onto a row.
 * Mirrors the `stagedByDfid` map value the wizard's fetch loop builds.
 */
export type StagedPreviewForRow = {
  stagedId: string;
  title: string | null;
  parseResult: ParseResult | null;
  sourceAnchors: Record<string, SourceAnchor>;
  adminAgendaPreview: AdminAgendaItem[];
  agendaStateKey: string;
  lastFinalizeFailureCode: string | null;
  useRawDecisions: UseRawDecision[];
  /** Raw `pending_syncs.ignored_warnings` jsonb (wizard-warning-ignore-controls §2.1).
   *  Untyped on purpose: coercion is enrichment's single boundary
   *  (`normalizeStagedIgnoredWarnings`), so no second copy can drift from it. */
  ignoredWarnings: unknown;
};

/** The pending_ingestions projection the hard-fail branch layers onto a row. */
export type IngestionForRow = { id: string; code: string | null };

/**
 * Manifest input to `assembleStep3Row`. Identical to `ManifestRowForBuild`
 * except `wizard_session_id` may be absent/null — the assembly applies the
 * caller's session id as the fallback, exactly as the wizard loop did at its
 * `buildStep3Row` call site before the extraction.
 */
export type ManifestRowForAssemble = Omit<ManifestRowForBuild, "wizard_session_id"> & {
  wizard_session_id?: string | null;
};

/**
 * buildStep3Row — the pure core of the unified read (spec §4.3/§4.3.1). Produces
 * the derivation-carrying fields of a Step3Row from its manifest row, its
 * (nullable) pending_syncs row, and the full list of public.shows candidates for
 * its drive_file_id. Presentation-only enrichment (agenda preview, source
 * anchors, ingestion id) is layered on by the caller.
 *
 * Candidate-selection contract (plan-R1): session-provenance join FIRST; the
 * existing-show branch fires ONLY when created_show_id IS NULL and never trusts a
 * bare created_show_id — a forged/stale non-null pointer that matches no candidate
 * yields no linked show (R2 safety).
 */
export function buildStep3Row(
  m: ManifestRowForBuild,
  pending: PendingSyncRowForBuild,
  candidates: ShowCandidate[],
): Step3Row {
  const driveFileId = m.drive_file_id;
  const status = m.status;
  const driveFileName = m.name ?? null;

  // Two-level review-items guard (spec §4.3.1): array parse AND every element
  // structurally valid; else fail closed (reviewItemsCorrupt). No pending → no items.
  let triggeredReviewItems: TriggeredReviewItem[] | undefined;
  let reviewItemsCorrupt = false;
  if (pending) {
    const parsed = parseTriggeredReviewItems(pending.triggered_review_items);
    const ok = parsed.ok && parsed.items.every(isStructurallyValidReviewItem);
    reviewItemsCorrupt = !ok;
    if (ok) triggeredReviewItems = parsed.items;
  }

  // Linked-show resolution. Session-provenance join first (all three predicates).
  const createdShowId = m.created_show_id ?? null;
  let linkedShow: { published: boolean; archived: boolean } | null = null;
  let sessionLinked = false;
  // The candidate that WON linked-show resolution — its summary backfills the
  // post-finalize badge-only card (owner decision 2026-07-06).
  let matchedCandidate: ShowCandidate | null = null;
  const sessionMatch = candidates.find(
    (c) =>
      createdShowId !== null &&
      c.id === createdShowId &&
      c.drive_file_id === driveFileId &&
      c.wizard_created_session_id === m.wizard_session_id,
  );
  if (sessionMatch) {
    linkedShow = { published: sessionMatch.published, archived: sessionMatch.archived };
    sessionLinked = true;
    matchedCandidate = sessionMatch;
  } else if (createdShowId === null) {
    // Existing-show branch: only when this session created nothing. Not-this-session
    // (IS DISTINCT FROM), crew-visible. Excludes forged pointers (gated on null above).
    const existing = candidates.find(
      (c) =>
        c.drive_file_id === driveFileId &&
        c.published === true &&
        c.archived === false &&
        c.wizard_created_session_id !== m.wizard_session_id,
    );
    if (existing) {
      linkedShow = { published: existing.published, archived: existing.archived };
      sessionLinked = false;
      matchedCandidate = existing;
    }
  }

  const publishIntent = m.publish_intent === true;
  const lastFinalizeFailureCode = pending?.last_finalize_failure_code ?? null;
  const parseResult =
    pending && pending.parse_result !== null && typeof pending.parse_result === "object"
      ? (pending.parse_result as ParseResult)
      : null;
  const hasWellFormedParseResult = !!(parseResult && (parseResult as { show?: unknown }).show);

  const displayState = deriveStep3DisplayState({
    status,
    lastFinalizeFailureCode,
    hasWellFormedParseResult,
    linkedShow,
    publishIntent,
    sessionLinked,
  });

  const row: Step3Row = {
    driveFileId,
    status,
    driveFileName,
    reviewItemsCorrupt,
    publishIntent,
    createdShowId,
    linkedShow,
    sessionLinked,
    displayState,
  };
  if (pending) row.stagedId = pending.staged_id;
  if (triggeredReviewItems) row.triggeredReviewItems = triggeredReviewItems;
  if (lastFinalizeFailureCode !== null) row.lastFinalizeFailureCode = lastFinalizeFailureCode;
  const pullSheetOverride = pending
    ? coerceOverrideSnapshotFromRow(pending.pull_sheet_override)
    : null;
  if (pullSheetOverride) row.pullSheetOverride = pullSheetOverride;
  // Backfill summary from the linked live show (owner decision 2026-07-06). Only
  // attach when at least one summary field is present, so a pure buildStep3Row
  // unit test (candidates without summary fields) yields no linkedShowSummary.
  // wizard-warning-ignore-controls §2.1 Phase A: the winning candidate's identity,
  // emitted ONLY for a usable non-empty string slug. A matched candidate without one
  // degrades the row to the staged ignore arm (spec §3), which needs no show record —
  // strictly better than minting a slug-keyed route target that resolves to nothing.
  const candidateSlug = matchedCandidate?.slug;
  if (matchedCandidate && typeof candidateSlug === "string" && candidateSlug.trim() !== "") {
    row.linkedShowRef = { id: matchedCandidate.id, slug: candidateSlug };
  }
  if (
    matchedCandidate &&
    (matchedCandidate.title != null ||
      matchedCandidate.clientLabel != null ||
      matchedCandidate.venue != null ||
      matchedCandidate.dates != null)
  ) {
    row.linkedShowSummary = {
      title: matchedCandidate.title ?? null,
      clientLabel: matchedCandidate.clientLabel ?? null,
      venue: matchedCandidate.venue ?? null,
      dates: matchedCandidate.dates ?? null,
    };
  }
  return row;
}

/**
 * assembleStep3Row — the FULL per-row production path: `buildStep3Row` plus the
 * two presentation-enrichment branches. Verbatim relocation of the wizard fetch
 * loop's body; no logic edits.
 */
export function assembleStep3Row(
  m: ManifestRowForAssemble,
  pending: PendingSyncRowForBuild,
  candidates: ShowCandidate[],
  staged: StagedPreviewForRow | undefined,
  ingestion: IngestionForRow | undefined,
  wizardSessionId: string,
): Step3Row {
  const status = m.status;
  // Spec §4.3: buildStep3Row is the derivation core (displayState, linkedShow,
  // reviewItemsCorrupt, stagedId, publishIntent). Presentation-only fields
  // (parseResult preview, anchors, agenda, ingestion id) are layered on below.
  const base = buildStep3Row(
    {
      drive_file_id: m.drive_file_id,
      status,
      name: m.name ?? null,
      publish_intent: m.publish_intent ?? null,
      created_show_id: m.created_show_id ?? null,
      wizard_session_id: m.wizard_session_id ?? wizardSessionId,
    },
    pending,
    candidates,
  );
  if (isCleanReviewRow(status)) {
    // FIX 1 (CRITICAL): a checked card flips the manifest status
    // 'staged'→'applied', but the pending_syncs row SURVIVES approval (it is
    // deleted only at finalize). Both 'staged' (unchecked) and 'applied'
    // (checked) clean rows render as the SAME publish card, so BOTH must carry
    // the full ParseResult — gating on 'staged' alone made a refreshed applied
    // row lose its preview + checkbox and collapse to a dead "Applied" badge.
    if (staged) {
      // §7.1: a clean row carries its full ParseResult (may be null if the
      // jsonb was absent/malformed). Title is the back-compat summary field.
      // Task 11: carry the baseline (note-only) agenda preview + the stable
      // agendaStateKey so the card has note-only items immediately.
      const withParse: Step3Row = {
        ...base,
        parseResult: staged.parseResult,
        // Anchor freshness (spec 2026-08-09-m-wave-2 §2.3): fresh-by-construction —
        // staging anchors were computed by the scan that produced this staged parse
        // (same revision), so the shows-row freshness helper does not apply here.
        sourceAnchors: staged.sourceAnchors,
        adminAgendaPreview: staged.adminAgendaPreview,
        agendaStateKey: staged.agendaStateKey,
        useRawDecisions: staged.useRawDecisions,
        // Raw, un-coerced: normalization happens once, in enrichment (§2.1).
        stagedIgnoredWarnings: staged.ignoredWarnings,
      };
      if (staged.title) return { ...withParse, stagedShowTitle: staged.title };
      return withParse;
    }
  }
  if (status === "hard_failed") {
    if (ingestion) {
      const withId: Step3Row = { ...base, pendingIngestionId: ingestion.id };
      if (ingestion.code !== null) return { ...withId, errorCode: ingestion.code };
      return withId;
    }
  }
  return base;
}
