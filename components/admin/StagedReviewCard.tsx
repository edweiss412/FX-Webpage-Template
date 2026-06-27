"use client";

/**
 * components/admin/StagedReviewCard.tsx (M6 §B Task 6.11 — UI portion)
 *
 * Per-row review card for a live `pending_syncs` row. Mounts inside
 * <ParsePanel> on the per-show admin page (`app/admin/show/[slug]/page.tsx`).
 *
 * Wires the operator's reviewer choices into §A's Pin-stop 2 extension
 * routes (handoff §0 ddafda3 pin):
 *
 *   POST /api/admin/staged/[fileId]/apply
 *     { source_scope: 'live', staged_id, choices: ReviewerChoice[] }
 *
 *   POST /api/admin/staged/[fileId]/discard
 *     { source_scope: 'live', staged_id, variant }
 *
 * Apply enforces the validator's per-invariant allowed-action set BEFORE
 * the round-trip so the operator gets immediate feedback when a required
 * choice is missing. Allowed actions match `lib/sync/applyStaged.ts`
 * `allowedActions(item)` exactly:
 *   - asset-review invariants → only `apply`
 *   - MI-12 → `rename` | `reject`
 *   - MI-13 / MI-14 → `rename` | `independent`
 *   - everything else → only `apply`
 *
 * Items whose allowed-actions set has size 1 default to that action so the
 * operator can apply immediately. Multi-action items require an explicit
 * pick — Apply blocks locally with `MISSING_REVIEWER_CHOICE` if any item
 * is unset, never round-tripping a guaranteed-400 request.
 *
 * `rename_value` is fixed to the item's `added_name` (the validator
 * rejects any other value), so the UI does not surface a free-text field —
 * picking "rename" implies the canonical rename target.
 *
 * First-seen rows (`FIRST_SEEN_REVIEW` or `ONBOARDING_SCAN_REVIEW` present
 * in `triggered_review_items`) expose all three discard variants
 * (try_again / defer_until_modified / permanent_ignore). Every other row
 * exposes only `try_again` because the discardStaged validator rejects
 * defer/ignore on existing-show rows as `INVALID_REVIEWER_ACTION`.
 *
 * All errors render through <ErrorExplainer surface="admin" /> using the
 * §12.4 catalog so no raw codes leak into the DOM (invariant 5).
 *
 * Note on Amendment 9 (M6-D12 deferred): the current code ships
 * pre-amendment AC-6.11 behavior — first-seen live sheets stage as
 * FIRST_SEEN_REVIEW and surface here for explicit operator review.
 * Amendment 9's auto-publish + 24h undo path is M6-D12 territory.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ErrorExplainer } from "@/components/messages/ErrorExplainer";
import { HelpAffordance } from "@/components/admin/HelpAffordance";
import { HelpTooltip } from "@/components/admin/HelpTooltip";
import { ReportButton } from "@/components/shared/ReportButton";
import { messageFor } from "@/lib/messages/lookup";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import type { MessageCode } from "@/lib/messages/catalog";
import { renderEmphasisOr } from "@/components/messages/renderEmphasis";
import type { TriggeredReviewItem, ParseWarning } from "@/lib/parser/types";
import type { ReviewerChoice } from "@/lib/sync/applyStaged";
import { AccentButton } from "@/components/shared/AccentButton";
import { dataGapClassDetails, type DataGapsSummary } from "@/lib/parser/dataGaps";
import { PerShowActionableWarnings } from "@/components/admin/PerShowActionableWarnings";

function safeDougFacing(code: string): string | null {
  if (!(code in MESSAGE_CATALOG)) return null;
  return messageFor(code as MessageCode).dougFacing ?? null;
}

const ASSET_REVIEW_INVARIANTS = new Set<TriggeredReviewItem["invariant"]>([
  "DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE",
  "DIAGRAMS_EMBEDDED_NONE_FOUND",
  "DIAGRAMS_LINKED_FOLDER_DRIFT_PENDING",
  "REEL_DRIFT_PENDING",
]);

const FIRST_SEEN_INVARIANTS = new Set<TriggeredReviewItem["invariant"]>([
  "FIRST_SEEN_REVIEW",
  "ONBOARDING_SCAN_REVIEW",
]);

type ReviewerAction = ReviewerChoice["action"];
type DiscardVariant = "try_again" | "defer_until_modified" | "permanent_ignore";

// Plain-language label for each `pending_syncs.source_kind` enum value.
// PRODUCT.md design principle 5 ("plain language, never technical chrome")
// requires admin copy to read as English, not schema vocabulary.
const SOURCE_LABELS: Record<"cron" | "push" | "manual" | "onboarding_scan", string> = {
  cron: "Auto sync",
  push: "Drive push",
  manual: "Manual sync",
  onboarding_scan: "Onboarding scan",
};

// Format a Drive timestamp as a friendly clock label. Falls back to the raw
// ISO string only when parsing fails (the upstream column is `timestamptz
// not null`, so this should not happen in practice).
//
// `suppressHydrationWarning` is set on the consuming `<time>` element
// because Node and the browser may resolve the user's local TZ differently
// during the first render — the hydrated client value is the one that
// matters and the SSR flash is a few ms.
function formatStagedAt(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function allowedActionsFor(item: TriggeredReviewItem): readonly ReviewerAction[] {
  if (ASSET_REVIEW_INVARIANTS.has(item.invariant)) return ["apply"];
  if (item.invariant === "MI-12") return ["rename", "reject"];
  if (item.invariant === "MI-13" || item.invariant === "MI-14") {
    return ["rename", "independent"];
  }
  return ["apply"];
}

function expectedRenameValue(item: TriggeredReviewItem): string | null {
  if (item.invariant === "MI-12" || item.invariant === "MI-13" || item.invariant === "MI-14") {
    return item.added_name;
  }
  return null;
}

function describeItem(item: TriggeredReviewItem): string {
  // No em dashes (DESIGN.md §9 absolute ban). Use periods, parens, or
  // colons. Plain language; avoid leaking the MI-* invariant code into
  // user copy where possible.
  switch (item.invariant) {
    case "FIRST_SEEN_REVIEW":
      // §4.3 approval-gate context: auto-publish for clean new shows is off, so
      // this brand-new sheet parsed cleanly and is waiting for your approval.
      // Apply to publish it (with the same 24h undo as the auto-publish path).
      return "New show, parsed clean. Apply to publish it (you can still undo within 24 hours).";
    case "ONBOARDING_SCAN_REVIEW":
      return "Onboarding scan staged this sheet for review.";
    case "MI-6":
      return "A header cell drifted. Review the parse before applying.";
    case "MI-7":
      return `Section "${item.section}" row count changed. Was ${item.prior_count}, now ${item.new_count}.`;
    case "MI-7b":
      return `Section "${item.section}" row identity drifted (key: ${item.missingKey}).`;
    case "MI-8":
      return `Field "${item.field}" changed.`;
    case "MI-8b": {
      const prior = item.prior ?? "blank";
      const next = item.next ?? "blank";
      return `Schedule note drifted. Was ${prior}. Now ${next}.`;
    }
    case "MI-8c":
      return `Schedule debounce mode: ${item.mode}${item.details ? ` (${item.details})` : ""}.`;
    case "MI-9":
      return `Lead role flag changed for "${item.crew_name}".`;
    case "MI-10":
      return "Crew table-anchor drift. Review before applying.";
    case "MI-11": {
      const prior = item.prior_email ?? "blank";
      const next = item.new_email ?? "blank";
      return `Email changed for "${item.crew_name}". Was ${prior}. Now ${next}.`;
    }
    case "MI-12":
      return `Email "${item.email}" reassigned from "${item.removed_name}" to "${item.added_name}".`;
    case "MI-13":
      return `Position swap: "${item.removed_name}" replaced by "${item.added_name}".`;
    case "MI-14":
      return `Position swap: "${item.removed_name}" replaced by "${item.added_name}".`;
    case "MI-13-orphan-remove":
    case "MI-14-orphan-remove":
      return `Orphaned removal: "${item.removed_name}"${item.reason ? ` (${item.reason})` : ""}.`;
    case "MI-13-orphan-add":
    case "MI-14-orphan-add":
      return `Orphaned addition: "${item.added_name}".`;
    case "DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE":
      return "Embedded diagram revisions are unavailable. Apply preserves the existing snapshot.";
    case "DIAGRAMS_EMBEDDED_NONE_FOUND":
      return "DIAGRAMS tab found no embedded objects. Apply publishes an empty gallery.";
    case "DIAGRAMS_LINKED_FOLDER_DRIFT_PENDING":
      return `Linked diagrams folder drifted (${item.drift_count} entries).`;
    case "REEL_DRIFT_PENDING":
      return "Opening reel changed since staging.";
  }
}

function actionLabel(
  action: ReviewerAction,
  item: TriggeredReviewItem,
  isWizardMode: boolean,
): string {
  // F1 (§8.1 / D9): the apply affordance is "Approve" only in the onboarding
  // wizard re-approve context (mode='wizard_failed_reapply' re-approves a
  // failed sheet for publishing). The live-show staged surface keeps the
  // unchanged "Apply this change" wording. Approval is not publish — finalize
  // publishes — so we never label this "Publish".
  if (action === "apply") return isWizardMode ? "Approve" : "Apply this change";
  if (action === "reject") return "Reject this change";
  if (action === "independent") return "Treat as different people";
  // rename
  const target = expectedRenameValue(item);
  return target ? `Rename to "${target}"` : "Rename";
}

export type StagedRow = {
  driveFileId: string;
  stagedId: string;
  sourceKind: "cron" | "push" | "manual" | "onboarding_scan";
  stagedModifiedTime: string;
  baseModifiedTime: string | null;
  warningSummary: string;
  triggeredReviewItems: TriggeredReviewItem[];
  /**
   * True when the stored `triggered_review_items` jsonb could not be
   * interpreted as a review-item array (corrupt review gate). The card then
   * renders a recovery state (cataloged STAGED_REVIEW_ITEMS_CORRUPT message +
   * Discard, no Apply) instead of presenting the corrupt row as choice-free —
   * the fail-closed counterpart to the Apply-path refusal. triggeredReviewItems
   * is [] in that case so the card's array ops stay safe.
   */
  reviewItemsCorrupt?: boolean;
  /** Optional one-line summary derived from `parse_result` by the page. */
  parseSummaryLine?: string;
  /**
   * parse-data-quality-warnings §6.1 — structured data-gaps summary derived by
   * the page from the staged row's `parse_result.warnings`. When `total > 0` the
   * card renders a per-class breakdown beneath the human `warningSummary` line;
   * `total === 0` / undefined → no breakdown (the warningSummary text alone, if
   * any, still shows). Single-sourced via `summarizeDataGaps` — never recounted
   * in the component.
   */
  dataGaps?: DataGapsSummary;
  /**
   * parse-warning deep links — operator-actionable warnings (role/day/schedule/
   * field) derived by the page from `parse_result.warnings`. The card renders
   * each with the catalog title + a source-sheet "Open in Sheet" link when the
   * scan resolved the cell. Filtered + deduped via `operatorActionableWarnings`
   * at the page; the component re-filters defensively. undefined/[] → nothing.
   */
  operatorActionable?: ParseWarning[];
};

export type StagedReviewCardProps = {
  row: StagedRow;
  /** Callback invoked after a successful Apply or Discard, before router.refresh(). */
  onMutated?: () => void;
  /**
   * Show id — when provided, the card surfaces an admin "Report this"
   * affordance (M8 Task 8.4 §B) scoped to this staged row. Doug uses it
   * when a staged parse looks wrong and needs a GitHub issue filed. The
   * modal it opens owns the idempotency-key + sessionStorage lifecycle.
   *
   * When absent, the report button is omitted — admin contexts without
   * a show in scope (none today, but defensively) don't render it.
   */
  showId?: string;
  /**
   * Card mode (M10 §B Task 10.1 §B / Phase 2):
   *   - 'live' (default) → POST to the live /api/admin/staged routes
   *     with the source_scope='live' payload (M6 / M7 contract).
   *   - 'wizard_failed_reapply' → POST to the wizard-scoped
   *     /api/admin/onboarding/staged/[wsid]/[dfid] routes with the
   *     Pin-2 wizard payload shape ({ stagedId, reviewerChoicesVersion,
   *     reviewerChoices } for apply; { stagedId, kind } for discard).
   *     Requires `wizardSessionId`. Surfaces `lastFinalizeFailureCode`
   *     above the review items if provided.
   *   - 'first_seen' → POST to the LIVE first-seen route
   *     /api/admin/show/staged/[stagedId]/apply|discard with the
   *     Pin-2 LiveFirstSeenStagedApply/DiscardRequest shape
   *     ({ reviewerChoices } for apply; { kind } for discard). On
   *     apply success the response carries `{ slug }`; the parent
   *     route redirects to /admin/show/[slug].
   */
  mode?: "live" | "wizard_failed_reapply" | "first_seen";
  /** Required when mode === 'wizard_failed_reapply'. */
  wizardSessionId?: string;
  /**
   * Per-row finalize failure code (M10 §4.5 amendment —
   * pending_syncs.last_finalize_failure_code). Only meaningful when
   * mode === 'wizard_failed_reapply'. Surfaced via messageFor() at
   * render time so the operator sees the Doug-facing reason their
   * per-row commit aborted.
   */
  lastFinalizeFailureCode?: string | null;
  /**
   * M12.2 Phase A (§6 / R32) — read-only mode for an ARCHIVED show. The staged
   * change stays VIEWABLE (work isn't hidden) but apply/discard controls are
   * suppressed, since archived mutation semantics are deferred to Phase B
   * (§16 DEF-2). A view-only notice replaces the action bar.
   */
  readOnly?: boolean;
};

export function StagedReviewCard({
  row,
  onMutated,
  showId,
  mode = "live",
  wizardSessionId,
  lastFinalizeFailureCode,
  readOnly = false,
}: StagedReviewCardProps) {
  const isWizardMode = mode === "wizard_failed_reapply";
  const isFirstSeenMode = mode === "first_seen";
  // Corrupt review gate (server flagged triggered_review_items uninterpretable):
  // render a recovery state and suppress Apply — the row must be discarded and
  // re-synced, never applied as if it had no review items. Fail-closed mirror
  // of the Apply-path STAGED_REVIEW_ITEMS_CORRUPT refusal.
  const reviewItemsCorrupt = row.reviewItemsCorrupt === true;
  // Items with a single allowed action default to that action so an
  // operator can apply immediately. Multi-action items (MI-12 / MI-13 /
  // MI-14) start unset and force an explicit choice.
  const initialChoices = useMemo(() => {
    const initial = new Map<string, ReviewerAction>();
    for (const item of row.triggeredReviewItems) {
      const allowed = allowedActionsFor(item);
      if (allowed.length === 1) initial.set(item.id, allowed[0]!);
    }
    return initial;
  }, [row.triggeredReviewItems]);

  const [choices, setChoices] = useState<Map<string, ReviewerAction>>(initialChoices);
  const [pending, setPending] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const router = useRouter();

  const isFirstSeen = row.triggeredReviewItems.some((i) => FIRST_SEEN_INVARIANTS.has(i.invariant));

  const setChoice = (itemId: string, action: ReviewerAction) => {
    setChoices((prev) => {
      const next = new Map(prev);
      next.set(itemId, action);
      return next;
    });
  };

  const applyEndpoint = isWizardMode
    ? `/api/admin/onboarding/staged/${encodeURIComponent(wizardSessionId ?? "")}/${encodeURIComponent(row.driveFileId)}/apply`
    : isFirstSeenMode
      ? `/api/admin/show/staged/${encodeURIComponent(row.stagedId)}/apply`
      : `/api/admin/staged/${encodeURIComponent(row.driveFileId)}/apply`;
  const discardEndpoint = isWizardMode
    ? `/api/admin/onboarding/staged/${encodeURIComponent(wizardSessionId ?? "")}/${encodeURIComponent(row.driveFileId)}/discard`
    : isFirstSeenMode
      ? `/api/admin/show/staged/${encodeURIComponent(row.stagedId)}/discard`
      : `/api/admin/staged/${encodeURIComponent(row.driveFileId)}/discard`;

  const handleApply = async () => {
    if (pending) return;
    setErrorCode(null);
    const reviewerChoices: ReviewerChoice[] = [];
    for (const item of row.triggeredReviewItems) {
      const action = choices.get(item.id);
      if (!action) {
        setErrorCode("MISSING_REVIEWER_CHOICE");
        return;
      }
      const choice: ReviewerChoice = { item_id: item.id, action };
      if (action === "rename") {
        const target = expectedRenameValue(item);
        if (target !== null) choice.rename_value = target;
      }
      reviewerChoices.push(choice);
    }
    setPending(true);
    try {
      const applyBody = isWizardMode
        ? {
            stagedId: row.stagedId,
            reviewerChoicesVersion: 1,
            reviewerChoices,
          }
        : isFirstSeenMode
          ? { reviewerChoices }
          : {
              source_scope: "live",
              staged_id: row.stagedId,
              choices: reviewerChoices,
            };
      const res = await fetch(applyEndpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(applyBody),
      });
      const json = (await res.json()) as
        | { ok: boolean; error?: string }
        | { status: string }
        | { ok: false; code: string };
      // AC-10.6 wizard inline rescan: the route detected a Drive modtime
      // drift, re-parsed the sheet inside this wizard session, and
      // returned a fresh staged row. Clear local reviewer choices so the
      // re-rendered card starts clean, surface the catalog notice, and
      // let the parent re-fetch the new staged parse via router.refresh.
      // STAGED_PARSE_RESTAGED_INLINE is an informational catalog code
      // (not a true error), but the ErrorExplainer is the project's
      // canonical catalog renderer per invariant 5 — every dougFacing
      // code surfaces through the same path.
      if (
        isWizardMode &&
        "status" in json &&
        (json as { status: string }).status === "restaged_inline"
      ) {
        setChoices(new Map());
        setErrorCode("STAGED_PARSE_RESTAGED_INLINE");
        onMutated?.();
        router.refresh();
        return;
      }
      const succeeded = isWizardMode
        ? "status" in json && (json as { status: string }).status === "reapplied"
        : isFirstSeenMode
          ? "slug" in json
          : "ok" in json && (json as { ok: boolean }).ok === true;
      if (succeeded) {
        onMutated?.();
        if (isFirstSeenMode) {
          const slug = (json as { slug?: string | null }).slug;
          if (typeof slug === "string" && slug.length > 0) {
            router.push(`/admin/show/${encodeURIComponent(slug)}`);
            return;
          }
        }
        router.refresh();
      } else {
        const errMaybe = json as { error?: string; code?: string };
        setErrorCode(errMaybe.error ?? errMaybe.code ?? "SYNC_INFRA_ERROR");
      }
    } catch {
      setErrorCode("SYNC_INFRA_ERROR");
    } finally {
      setPending(false);
    }
  };

  const handleDiscard = async (variant: DiscardVariant) => {
    if (pending) return;
    setErrorCode(null);
    setPending(true);
    try {
      // Wizard-scoped discard uses `kind` (try_again_next_sync /
      // defer_until_modified / permanent_ignore) per Pin-2 contract.
      // Live-scope discard uses `variant` (try_again / ...). Translate
      // the legacy `try_again` shorthand to the canonical
      // `try_again_next_sync` for the wizard route.
      const wizardKind: "try_again_next_sync" | "defer_until_modified" | "permanent_ignore" =
        variant === "try_again" ? "try_again_next_sync" : variant;
      const discardBody = isWizardMode
        ? { stagedId: row.stagedId, kind: wizardKind }
        : isFirstSeenMode
          ? { kind: wizardKind }
          : {
              source_scope: "live",
              staged_id: row.stagedId,
              variant,
            };
      const res = await fetch(discardEndpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(discardBody),
      });
      const json = (await res.json()) as
        | { ok: boolean; error?: string }
        | { status: string }
        | { ok: false; code: string };
      const succeeded = isWizardMode
        ? "status" in json && (json as { status: string }).status === "discarded"
        : isFirstSeenMode
          ? "status" in json && (json as { status: string }).status === "discarded"
          : "ok" in json && (json as { ok: boolean }).ok === true;
      if (succeeded) {
        onMutated?.();
        router.refresh();
      } else {
        const errMaybe = json as { error?: string; code?: string };
        setErrorCode(errMaybe.error ?? errMaybe.code ?? "SYNC_INFRA_ERROR");
      }
    } catch {
      setErrorCode("SYNC_INFRA_ERROR");
    } finally {
      setPending(false);
    }
  };

  return (
    <article
      data-testid="staged-review-card"
      data-staged-id={row.stagedId}
      data-drive-file-id={row.driveFileId}
      className="rounded-md border border-border-strong bg-surface-raised p-tile-pad shadow-tile"
    >
      <header className="mb-4 space-y-1">
        {/* Source kicker — replaces the buried `<dl>` source row. Plain
            language label rather than the raw `cron`/`onboarding_scan`
            enum so Doug doesn't have to translate schema vocabulary. */}
        <p
          className="text-xs font-medium uppercase tracking-eyebrow text-text-subtle"
          data-testid="staged-source-kind"
        >
          {SOURCE_LABELS[row.sourceKind]}
        </p>
        {/* Heading is the parse summary itself when available — that's
            what Doug actually wants to recognize on a phone glance.
            "Staged update" fallback covers rows where the page couldn't
            derive a summary from `parse_result`. */}
        <div className="flex flex-wrap items-center gap-2">
          <h3
            className="text-base font-semibold text-text-strong"
            data-testid="staged-parse-summary"
          >
            {row.parseSummaryLine ?? "Staged update"}
          </h3>
          {isFirstSeenMode ? (
            <HelpTooltip
              label="Help: First-seen staged review"
              testId="help-affordance--first-seen-review-card--tooltip"
            >
              <p>
                This is the first time we have seen this sheet. Approve the parsed details to
                publish, or set the sheet aside until it changes again.
              </p>
              <a
                href="/help/admin/review-queues#first-seen"
                aria-label="Learn more about first-seen staged review"
                className="mt-2 inline-flex w-fit min-h-tap-min items-center text-sm font-medium text-accent-on-bg underline underline-offset-2 transition-colors duration-fast hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              >
                Learn more →
              </a>
            </HelpTooltip>
          ) : null}
        </div>
        {/* Time caption — formatted human-friendly; the ISO is preserved
            in the `<time dateTime=...>` attribute for machines. */}
        <p className="text-sm text-text-subtle">
          Staged{" "}
          <time dateTime={row.stagedModifiedTime} suppressHydrationWarning>
            {formatStagedAt(row.stagedModifiedTime)}
          </time>
          {row.baseModifiedTime ? (
            <>
              {", prior "}
              <time dateTime={row.baseModifiedTime} suppressHydrationWarning>
                {formatStagedAt(row.baseModifiedTime)}
              </time>
            </>
          ) : null}
        </p>
        {row.warningSummary ? (
          <p className="text-sm text-warning-text" data-testid="staged-warning-summary">
            {row.warningSummary}
          </p>
        ) : null}
        {/* parse-data-quality-warnings §6.1 — per-class data-gap breakdown. Static
            parse state → two states (present iff total>0 / absent), no animation
            (Transition Inventory: instant). Renders human labels, never the raw
            §12.4 code literal (invariant 5). */}
        {row.dataGaps && row.dataGaps.total > 0 ? (
          <ul
            data-testid="staged-data-gaps"
            className="flex flex-wrap items-center gap-1.5 text-xs text-warning-text"
          >
            {dataGapClassDetails(row.dataGaps).map((d) => (
              <li
                key={d.key}
                data-testid={`staged-data-gap-${d.key}`}
                className="inline-flex items-center gap-1 rounded-sm bg-warning-bg px-2 py-0.5 font-medium"
              >
                <span className="tabular-nums">{d.count}</span> {d.label}
              </li>
            ))}
          </ul>
        ) : null}
        {/* Operator-actionable parse warnings with source-sheet deep links to the
            offending cell (role/day/schedule/field). Renders nothing when none. */}
        {row.operatorActionable && row.operatorActionable.length > 0 ? (
          <PerShowActionableWarnings
            warnings={row.operatorActionable}
            driveFileId={row.driveFileId}
          />
        ) : null}
        {isWizardMode && lastFinalizeFailureCode ? (
          <p className="text-sm text-warning-text" data-testid="staged-wizard-failure-code">
            {renderEmphasisOr(
              safeDougFacing(lastFinalizeFailureCode),
              "This sheet could not be published in the last batch.",
            )}
          </p>
        ) : null}
      </header>

      {reviewItemsCorrupt ? (
        <div
          data-testid="staged-review-items-corrupt"
          className="rounded-sm border border-border-strong bg-warning-bg p-3 text-warning-text"
        >
          <ErrorExplainer code="STAGED_REVIEW_ITEMS_CORRUPT" surface="admin" />
          <HelpAffordance code="STAGED_REVIEW_ITEMS_CORRUPT" />
        </div>
      ) : row.triggeredReviewItems.length > 0 ? (
        <ul className="space-y-4" data-testid="staged-review-items">
          {row.triggeredReviewItems.map((item) => {
            const allowed = allowedActionsFor(item);
            return (
              <li
                key={item.id}
                data-testid={`review-item-${item.id}`}
                className="rounded-sm bg-surface-sunken p-3"
              >
                <p id={`item-${item.id}-desc`} className="text-sm text-text-strong">
                  {describeItem(item)}
                </p>
                {/* Associate the visible description with the radio group
                    so screen readers announce the change context, not
                    just "Apply, radio button" with no antecedent. */}
                <fieldset className="mt-2 space-y-2" aria-describedby={`item-${item.id}-desc`}>
                  <legend className="sr-only">How should this change be applied?</legend>
                  {allowed.map((action) => {
                    const id = `item-${item.id}-${action}`;
                    return (
                      <label
                        key={action}
                        htmlFor={id}
                        className="flex cursor-pointer items-center gap-2 text-sm text-text"
                      >
                        <input
                          id={id}
                          type="radio"
                          name={`item-${item.id}`}
                          value={action}
                          checked={choices.get(item.id) === action}
                          onChange={() => setChoice(item.id, action)}
                          className="size-4"
                        />
                        <span>{actionLabel(action, item, isWizardMode)}</span>
                      </label>
                    );
                  })}
                </fieldset>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-text-subtle" data-testid="staged-review-no-items">
          {readOnly
            ? "Nothing to decide here."
            : "Nothing to decide here. You can apply this change as-is."}
        </p>
      )}

      {errorCode ? (
        <div
          data-testid="staged-review-card-error"
          role="alert"
          className="mt-4 rounded-sm border border-border-strong bg-warning-bg p-3 text-warning-text"
        >
          <ErrorExplainer code={errorCode} surface="admin" />
          <HelpAffordance code={errorCode} />
        </div>
      ) : null}

      {/* Action bar — three visual tiers so the destructive action does
          not sit at the same affordance level as Apply / Discard. The
          per-card "Apply" stays primary accent; "Retry on next sync"
          and "Wait for next edit" are secondary outline buttons; the
          permanent-ignore action is split below a divider with a
          quieter affordance and an inline note explaining the
          consequence. Mitigates impeccable critique P0 ("destructive
          action visually identical to safe action"). */}
      {readOnly ? (
        <p
          data-testid="staged-review-read-only"
          className="mt-6 rounded-sm border border-border bg-surface-sunken p-3 text-sm text-text-subtle"
        >
          This show is archived. Staged changes are view-only here; applying or discarding for an
          archived show isn&rsquo;t available in Phase A.
        </p>
      ) : null}
      {!readOnly && (
        <div className="mt-6 flex flex-wrap gap-2">
          {!reviewItemsCorrupt && (
            <AccentButton
              onClick={handleApply}
              disabled={pending}
              data-testid="staged-review-apply"
              aria-busy={pending}
              fontWeight="medium"
              minWidthTap
              ringOffset="surface-raised"
            >
              {isWizardMode ? "Approve" : "Apply this change"}
            </AccentButton>
          )}
          <button
            type="button"
            onClick={() => handleDiscard("try_again")}
            disabled={pending}
            data-testid="staged-review-discard-try-again"
            aria-busy={pending}
            className="min-h-tap-min rounded-sm border border-border-strong bg-surface px-4 py-2 font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-raised disabled:cursor-not-allowed disabled:opacity-60"
          >
            Retry on next sync
          </button>
          {isFirstSeen ? (
            <button
              type="button"
              onClick={() => handleDiscard("defer_until_modified")}
              disabled={pending}
              data-testid="staged-review-discard-defer"
              aria-busy={pending}
              className="min-h-tap-min rounded-sm border border-border-strong bg-surface px-4 py-2 font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-raised disabled:cursor-not-allowed disabled:opacity-60"
            >
              Wait for next edit
            </button>
          ) : null}
        </div>
      )}
      {!readOnly && isFirstSeen ? (
        <div className="mt-4 border-t border-border pt-4">
          <button
            type="button"
            onClick={() => handleDiscard("permanent_ignore")}
            disabled={pending}
            data-testid="staged-review-discard-ignore"
            aria-busy={pending}
            aria-describedby={`staged-${row.stagedId}-ignore-note`}
            className="min-h-tap-min text-sm font-medium text-text-subtle underline underline-offset-4 transition-colors duration-fast hover:text-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-raised disabled:cursor-not-allowed disabled:opacity-60"
          >
            Stop showing this sheet
          </button>
          <p id={`staged-${row.stagedId}-ignore-note`} className="mt-1 text-xs text-text-subtle">
            This sheet will not reappear until Doug clears it from settings.
          </p>
        </div>
      ) : null}
      {showId ? (
        <div className="mt-4 border-t border-border pt-4">
          <ReportButton
            surface="admin"
            surfaceId={`admin-staged-${row.stagedId}`}
            showId={showId}
            variant="text"
            label="Report this parse"
            autocapture={{
              fieldRef: {
                stagedId: row.stagedId,
                driveFileId: row.driveFileId,
                sourceKind: row.sourceKind,
                stagedModifiedTime: row.stagedModifiedTime,
                baseModifiedTime: row.baseModifiedTime,
              },
              parseWarnings: row.triggeredReviewItems,
              rawSnippet: row.parseSummaryLine ?? row.warningSummary,
            }}
          />
        </div>
      ) : null}
    </article>
  );
}
