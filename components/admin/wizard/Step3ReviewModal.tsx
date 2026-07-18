"use client";

/**
 * components/admin/wizard/Step3ReviewModal.tsx (Task 4 — spec §5, §9.1, §9.4, §15)
 *
 * The NEW Step-3 review modal: a bottom SHEET below `sm` and a centered panel
 * above it (popup < lg, two-pane ≥ lg). Task 4 shipped the shell/header/
 * footer; Task 5 filled the body — side rail + chip rail (§6.2/§6.3, twin
 * navs per §9.4) + the §6.4 section panels; Task 6 wires the §6.3a
 * deterministic scroll-spy; Task 7 (below) wires the §10 sheet
 * drag-to-dismiss (slop-based click/drag discrimination + the §11 C6
 * matchMedia mode-boundary cleanup).
 * It supersedes Step3DetailsDialog (removed in Task 8) and carries its
 * topology: tap-out scrim + focus-trapped `role="dialog" aria-modal` panel
 * (`useDialogFocus` — initial focus on the close button, Tab trap,
 * restore-to-trigger), Esc on document, body scroll lock, and CSS-driven
 * entrance animation hooks ([data-step3-review-scrim]/[data-step3-review-panel]
 * in app/globals.css, reduced-motion collapse included). That chrome —
 * portal/scrim/panel/grab/drag/Esc/scroll-lock/inert — now lives in the
 * extracted ReviewModalShell (admin-show-modal spec §5); this module consumes
 * it with `dataAttrPrefix="step3-review"` and keeps every header/body/footer
 * slot byte-identical.
 *
 * Heading-safe title (spec §9.1/§15): the dialog's accessible name comes from
 * `aria-labelledby` → the `<h2>` that contains ONLY the plain title text. The
 * sheet deep link is a SEPARATE adjacent 44px icon anchor OUTSIDE the heading,
 * so its action label ("Open the source sheet for …") can never hijack the
 * accessible-name computation (the reason SheetTitleLink is NOT reused here).
 *
 * Result-bearing publish (spec §9.1/§9.2-consumer): the footer's primary
 * button ALWAYS requests `onRequestSetChecked(true)` — an idempotent approve,
 * never a toggle — and closes ONLY when the promise resolves true. On false
 * the modal stays open with an inline plain-English error note (never a raw
 * §12.4 code, invariant 5).
 *
 * Tokens only (DESIGN.md §10): the behavioral gesture/scroll constants below
 * are interaction thresholds, not painted px (documented in DESIGN.md §5
 * "Interaction constants" per spec §6.3a's token-contract disposition).
 */
import { useId, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, ExternalLink, X } from "lucide-react";
import { ReviewModalShell } from "@/components/admin/review/ReviewModalShell";
import { buildSheetDeepLink } from "@/lib/sheet-links/buildSheetDeepLink";
import { sectionStatus, warningsBySection } from "@/lib/admin/step3SectionStatus";
import {
  dateSummarySegments,
  NotPublishableNote,
  RawUnrecognizedCallout,
  step3Sections,
} from "@/components/admin/wizard/step3ReviewSections";
import type { StagedSectionData } from "@/components/admin/review/sectionData";
import { ShowReviewSurface } from "@/components/admin/review/ShowReviewSurface";
import { ArchivedTabOffer, deriveArchivedOffers } from "@/components/admin/wizard/archivedTabOffer";
import { RescanSheetButton } from "@/components/admin/RescanSheetButton";
import {
  allowedActionsFor,
  describeItem,
  actionLabel,
  expectedRenameValue,
  tierForItem,
  type ReviewerAction,
} from "@/lib/admin/step3ReviewItemTiers";
import type { ReviewerChoice } from "@/lib/sync/applyStaged";
import type { TriggeredReviewItem } from "@/lib/parser/types";

/**
 * Step-3 consolidation (spec §4.4): the folded re-apply resolution contract.
 * When present, the modal renders the tiered resolution body + Approve & apply /
 * Re-scan / Ignore footer instead of the pre-finalize publish footer. This is
 * the ONLY resolution path for a blocked re-apply row (never a blind inline
 * approve).
 */
export type Step3ReviewResolution = {
  triggeredReviewItems: TriggeredReviewItem[];
  reviewItemsCorrupt: boolean;
  stagedId: string;
  isPublishRunActive: boolean;
  onApplyResolve: (choices: ReviewerChoice[]) => Promise<boolean>;
  onRescan: () => void;
  onIgnore: () => Promise<boolean>;
};

// ── Interaction constants (spec §10; DESIGN.md §5 note) ─────────────────────
// Behavioral thresholds, not rendered visual values — they never paint a px.
// The scroll-spy rule + its constants (SCROLL_SPY_OFFSET_PX, NAV_SCROLL_SETTLE_*,
// INDICATOR_INSET_PX, `activeSectionFor`) moved with the rail/content body into
// ShowReviewSurface.tsx; the sheet drag-dismiss + fallback-timer constants
// moved with the drag machinery into ReviewModalShell.tsx. Both sets are
// re-exported below so existing importers keep resolving them from this
// module's public path. Only the warning-flash constant stays DEFINED here.
export {
  DRAG_DISMISS_THRESHOLD_PX,
  DRAG_SLOP_PX,
  DURATION_NORMAL_FALLBACK_MS,
  DURATION_FAST_FALLBACK_MS,
} from "@/components/admin/review/ReviewModalShell";
/** §E4 one-shot warning-row highlight duration (follow-ups spec §2/§H N3).
 *  MUST equal the 1600ms literal in app/globals.css's
 *  `[data-step3-warning-flash]` keyframe (the transitions test pins the
 *  pairing — same drift-guard rationale as the fallback constants above).
 *  Stays DEFINED here (the §11 source-marker audit pins the literal to this
 *  file); ShowReviewSurface imports the value for its warning-flash. */
export const WARNING_HIGHLIGHT_MS = 1600;

// Re-exported from the extracted surface so `activeSectionFor` + the scroll-spy
// interaction constants still resolve from this module's public path (their
// definitions moved with the rail/content body to ShowReviewSurface.tsx).
export {
  activeSectionFor,
  SCROLL_SPY_OFFSET_PX,
  NAV_SCROLL_SETTLE_TIMEOUT_MS,
  NAV_SCROLL_SETTLE_EPSILON_PX,
  INDICATOR_INSET_PX,
} from "@/components/admin/review/ShowReviewSurface";

/** Pending carries WHICH operation is in flight: the footer slot follows the
 *  operation, not the optimistically-flipped `checked` prop (spec §B2). */
type PublishState = "idle" | "error" | { pending: "publish" | "unpublish" };

export function Step3ReviewModal({
  data,
  checked,
  isDirtyRescan,
  onRequestSetChecked,
  onClose,
  resolution,
  isPublishRunActive: isPublishRunActiveProp = false,
}: {
  // Phase 1: the review modal is the staged host — it destructures the staged
  // session/row and drives publish/unpublish/re-scan, all staged-only ops. Task 13
  // owns published-page composition and will generalize this to the union.
  data: StagedSectionData;
  checked: boolean;
  isDirtyRescan: boolean;
  onRequestSetChecked: (next: boolean) => Promise<boolean>;
  onClose: () => void;
  resolution?: Step3ReviewResolution;
  // Spec §4.4 R8: freeze THIS modal's own mutators (Publish/Unpublish + Re-scan)
  // while a publish/resume finalize run is active. The read-only view stays
  // open (design: the modal remains inspectable), but no mutation can fire. The
  // resolution footer freezes independently via `resolution.isPublishRunActive`.
  isPublishRunActive?: boolean;
}) {
  const { dfid, wizardSessionId } = data;
  // Archived-tab pending offers (spec §4.2/§4.3) — the box appears for these even
  // when there is no blocked re-apply resolution. Same shared derivation as
  // Pack-list (parity invariant), incl. PSAT-1's durable-snapshot + S5 gating:
  // a divergent (S5) or override-active row yields no offers, so the box shows an
  // archived offer only in the true pending-S2/S4 case; S5 recovery + S3 revoke
  // stay in the Pack-list section.
  const archivedOffers = deriveArchivedOffers(
    data.archivedPullSheetTabs,
    wizardSessionId != null,
    data.pullSheetOverride,
  ).offers;
  const hasPendingArchivedOffer = archivedOffers.length > 0;
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const h2Id = useId();
  const [publishState, setPublishState] = useState<PublishState>("idle");

  // ── Re-apply resolution state (spec §4.4) — active only when `resolution` is
  // passed. Single-action items auto-bind their sole action; multi-action
  // (tier-3) items start unset and force an explicit choice before Approve. ──
  const resolutionItems = resolution?.triggeredReviewItems ?? [];
  const reviewItemsCorrupt = resolution?.reviewItemsCorrupt === true;
  // Spec §4.4 R8: the modal is frozen when EITHER the top-level prop says a run
  // is active (non-reapply View/Publish path — Codex R1 HIGH) OR the resolution
  // payload carries the signal (blocked re-apply path). One effective flag drives
  // every mutator below: Publish/Unpublish, Re-scan, and the resolution actions.
  const isPublishRunActive = isPublishRunActiveProp || resolution?.isPublishRunActive === true;
  const initialResolutionChoices = useMemo(() => {
    const initial = new Map<string, ReviewerAction>();
    for (const item of resolutionItems) {
      const allowed = allowedActionsFor(item);
      if (allowed.length === 1) initial.set(item.id, allowed[0]!);
    }
    return initial;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolution?.triggeredReviewItems]);
  const [resolutionChoices, setResolutionChoices] =
    useState<Map<string, ReviewerAction>>(initialResolutionChoices);
  // `useState(initialMemo)` only seeds on first mount. An in-modal Re-scan
  // triggers router.refresh, which delivers NEW triggeredReviewItems to the
  // still-open modal — re-derive the choices so single-action items auto-bind
  // and stale bindings for removed items are dropped (else Approve can stick
  // disabled with no selectable radios until reopen). React's blessed
  // reset-on-prop-change pattern: adjust state DURING render (no effect, no
  // cascading-render lint), guarded by the previous memo identity so it fires
  // only when the item ids actually change. (Codex R5 MEDIUM.)
  const [prevInitialChoices, setPrevInitialChoices] = useState(initialResolutionChoices);
  if (prevInitialChoices !== initialResolutionChoices) {
    setPrevInitialChoices(initialResolutionChoices);
    setResolutionChoices(initialResolutionChoices);
  }
  const [resolutionPending, setResolutionPending] = useState(false);
  const [resolutionError, setResolutionError] = useState<string | null>(null);

  const setResolutionChoice = (itemId: string, action: ReviewerAction) => {
    setResolutionChoices((prev) => {
      const next = new Map(prev);
      next.set(itemId, action);
      return next;
    });
  };

  // Approve is gated: every item must carry a choice (single-action items
  // already do), the items must not be corrupt, and no publish run may be in
  // flight (spec §4.4 R8 full freeze).
  const allResolutionChosen = resolutionItems.every((i) => resolutionChoices.has(i.id));
  const canApprove =
    !reviewItemsCorrupt && allResolutionChosen && !resolutionPending && !isPublishRunActive;

  async function handleApproveResolve() {
    if (!resolution || resolutionPending || reviewItemsCorrupt || isPublishRunActive) return;
    setResolutionError(null);
    const reviewerChoices: ReviewerChoice[] = [];
    for (const item of resolutionItems) {
      const action = resolutionChoices.get(item.id);
      if (!action) {
        setResolutionError("MISSING_REVIEWER_CHOICE");
        return;
      }
      const choice: ReviewerChoice = { item_id: item.id, action };
      if (action === "rename") {
        const target = expectedRenameValue(item);
        if (target !== null) choice.rename_value = target;
      }
      reviewerChoices.push(choice);
    }
    setResolutionPending(true);
    let ok = false;
    try {
      ok = await resolution.onApplyResolve(reviewerChoices);
    } catch {
      ok = false;
    }
    if (ok) {
      onClose();
      return; // parent unmounts us
    }
    setResolutionPending(false);
    setResolutionError("STAGED_APPLY_FAILED");
  }

  async function handleIgnoreResolve() {
    if (!resolution || resolutionPending || isPublishRunActive) return;
    setResolutionError(null);
    setResolutionPending(true);
    let ok = false;
    try {
      ok = await resolution.onIgnore();
    } catch {
      ok = false;
    }
    if (ok) {
      onClose();
      return;
    }
    setResolutionPending(false);
    setResolutionError("STAGED_DISCARD_FAILED");
  }

  // ── Flagged-section count (spec §6.1/§7) — the header chip + footer note read
  // "N need a look" from this ONE derivation. The full section registry, the
  // §7.1 flagged/judgment split, the §E3 callout map, the rail dots + sliding
  // indicator, the deterministic scroll-spy, and the section panels all moved
  // with the review body into ShowReviewSurface. §7.1 rule (spec 2026-07-07): a
  // section is flagged when it has ≥1 NON-ambiguity warn; judgment-only sections
  // (all warns ambiguity-class) are excluded from the count.
  const flaggedCount = useMemo(() => {
    const defs = step3Sections(data);
    const bySection = warningsBySection(data.warnings, new Set(defs.map((s) => s.id)));
    let count = 0;
    for (const [, entries] of bySection) {
      if (sectionStatus(entries.map((e) => e.warning)) === "flagged") count += 1;
    }
    return count;
  }, [data]);

  // The scroll container the modal (shell) owns and hands to ShowReviewSurface
  // as its scroll-spy root (spec §6.3a): the surface renders it as the content
  // pane and attaches the deterministic scroll listener to it.
  const scrollerRef = useRef<HTMLElement | null>(null);

  // ── Header derivations (spec §9.1) ─────────────────────────────────────────
  // title/clientLabel are composed in the staged builder (Task 4); the modal reads
  // the mode-agnostic SectionCore fields.
  const title = data.title;
  const client = data.clientLabel;
  const segs = dateSummarySegments(data.dates ?? undefined);
  const sheetLink = buildSheetDeepLink(dfid);
  // Finalize-demoted gate (spec §C3): derived from data the modal already
  // receives — no new prop. Dirty rescan is the RESCAN_REVIEW_REQUIRED subtype
  // (⇒ lastFinalizeFailureCode != null), so the footer branches dirty first.
  const isFinalizeDemoted = data.row.lastFinalizeFailureCode != null;

  // Result-bearing publish (spec §9.1): the unchecked slot requests true;
  // close only on a true resolution.
  async function handlePublish() {
    if (isPublishRunActive) return; // R8: no mutation while a finalize run is active
    setPublishState({ pending: "publish" });
    let ok = false;
    try {
      ok = await onRequestSetChecked(true);
    } catch {
      ok = false;
    }
    if (ok) {
      onClose();
      return; // parent unmounts us — no state write after close
    }
    setPublishState("error");
  }

  // Unpublish (spec §C2): request false, stay open on success — the checked
  // prop flips via the card's settlement (§9.2 waiter queue, untouched), so
  // the slot swaps to "Publish this show" (instant, §H N5).
  async function handleUnpublish() {
    setPublishState({ pending: "unpublish" });
    let ok = false;
    try {
      ok = await onRequestSetChecked(false);
    } catch {
      ok = false;
    }
    if (ok) {
      setPublishState("idle");
      return;
    }
    setPublishState("error"); // same affordance as the publish failure path
  }

  // In-flight derivations (spec §B2): `checked` flips OPTIMISTICALLY the
  // moment the card's request starts, so mid-flight the slot must follow the
  // OPERATION — publish keeps the accent CTA, unpublish keeps the quiet
  // button — and only settle back onto `checked` once pendingOp clears.
  const pendingOp = typeof publishState === "object" ? publishState.pending : null;
  const isPending = pendingOp !== null;
  const showCheckedSlot = pendingOp !== null ? pendingOp === "unpublish" : checked;

  // The checked slot owns its own labels ("Unpublish" / "Removing…") below —
  // this pair is the unchecked publish CTA's only.
  const publishLabel = pendingOp === "publish" ? "Selecting…" : "Publish this show";

  return (
    <ReviewModalShell
      open
      onClose={onClose}
      labelledBy={h2Id}
      dataAttrPrefix="step3-review"
      testIdBase={`wizard-step3-card-${dfid}-review`}
      initialFocusRef={closeRef}
      header={
        <>
          {/* Header (spec §9.1): min-w-0 flex-1 text block + shrink-0 actions,
              so a long unbroken title wraps and never pushes the chip/close
              off-screen. */}
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium uppercase tracking-eyebrow text-text-subtle">
              Review before publishing
            </div>
            {/* Heading-safe title split: the h2 holds ONLY the plain title;
                the deep link is a separate adjacent 44px icon anchor. */}
            <div className="flex min-w-0 items-center gap-1">
              <h2
                id={h2Id}
                data-testid={`wizard-step3-card-${dfid}-review-title`}
                className="min-w-0"
              >
                <span className="min-w-0 wrap-break-word text-lg font-bold tracking-tight text-text-strong">
                  {title}
                </span>
              </h2>
              {/* §11: instant — deliberate (link presence follows data, not a state transition) */}
              {sheetLink !== null ? (
                <a
                  data-testid={`wizard-step3-card-${dfid}-review-sheetlink`}
                  href={sheetLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open the source sheet for ${title}`}
                  className="inline-flex size-tap-min shrink-0 items-center justify-center rounded-sm text-text-subtle transition-colors duration-fast hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                >
                  <ExternalLink aria-hidden="true" className="size-4" />
                </a>
              ) : null}
            </div>
            {/* Subline: client entry (omitted when null) + dates entry ALWAYS
                (joined segments or the "Dates not detected" fallback). */}
            <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-text-subtle">
              {/* §11: instant — deliberate (client presence follows data, not a state transition) */}
              {client !== null ? (
                <>
                  <span className="min-w-0 wrap-break-word">{client}</span>
                  <span
                    aria-hidden="true"
                    className="size-[3px] shrink-0 rounded-pill bg-border-strong"
                  />
                </>
              ) : null}
              <span className="min-w-0 wrap-break-word">
                {segs.length > 0 ? segs.join(" · ") : "Dates not detected"}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {/* §11 T10: instant — deliberate (chip swaps with flaggedCount/isDirtyRescan; no animation on rescan) */}
            {isDirtyRescan ? (
              /* Dirty re-scan wins over the clean/flagged derivation: an
                 "All clean" chip would contradict the footer's review-required
                 note (§9.2), so the chip mirrors it instead. */
              <span
                data-testid={`wizard-step3-card-${dfid}-review-chip`}
                className="inline-flex items-center gap-1.5 rounded-pill bg-warning-bg px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-warning-text"
              >
                <span aria-hidden="true" className="size-2 rounded-pill bg-status-review" />
                Sheet changed
              </span>
            ) : flaggedCount > 0 ? (
              <span
                data-testid={`wizard-step3-card-${dfid}-review-chip`}
                className="inline-flex items-center gap-1.5 rounded-pill bg-warning-bg px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-warning-text"
              >
                <span aria-hidden="true" className="size-2 rounded-pill bg-status-review" />
                {flaggedCount === 1 ? "1 needs a look" : `${flaggedCount} need a look`}
              </span>
            ) : (
              <span
                data-testid={`wizard-step3-card-${dfid}-review-chip`}
                className="inline-flex items-center gap-1 rounded-pill bg-surface-sunken px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-status-positive-text"
              >
                <Check aria-hidden="true" className="size-3.5" />
                All clean
              </span>
            )}
            <button
              ref={closeRef}
              type="button"
              data-testid={`wizard-step3-card-${dfid}-review-close`}
              aria-label="Close"
              onClick={onClose}
              className="-mr-1 inline-flex size-tap-min shrink-0 items-center justify-center rounded-sm text-text-subtle transition-colors duration-fast hover:bg-surface-sunken hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              <X aria-hidden="true" className="size-5" />
            </button>
          </div>
        </>
      }
      footer={
        <>
          {/* Footer (spec §9.1): rendered inside the shell's footer wrapper
              (safe-area padding + the load-bearing `relative` for the
              RescanSheetButton overlay result — see ReviewModalShell.tsx). */}
          {/* Re-apply resolution footer (spec §4.4): the ONLY resolution path
              for a blocked re-apply row. Approve & apply (primary) + Re-scan +
              Ignore. All three freeze during an active publish run (R8).
              §11: instant — deliberate (footer swaps on resolution presence; server truth, no animation) */}
          {resolution ? (
            <>
              <span
                data-testid={`wizard-step3-card-${dfid}-review-resolution-note`}
                className="hidden min-w-0 items-center text-sm text-text-subtle sm:flex sm:flex-1"
              >
                Approve to re-apply, or set this sheet aside.
              </span>
              {/* §11: instant — deliberate (error note appears instantly, no animation) */}
              {resolutionError !== null ? (
                <span
                  // role="alert" (not status): this note mounts already-populated
                  // on a failed Approve/Ignore, so it needs an assertive live
                  // region to be announced on insertion (impeccable audit P2).
                  role="alert"
                  data-testid={`wizard-step3-card-${dfid}-review-resolution-error`}
                  className="min-w-0 text-sm font-medium text-warning-text"
                >
                  {resolutionError === "MISSING_REVIEWER_CHOICE"
                    ? "Pick an option for each change first."
                    : "Something went wrong. Try again."}
                </span>
              ) : null}
              <button
                type="button"
                data-testid={`wizard-step3-card-${dfid}-review-resolution-ignore`}
                onClick={handleIgnoreResolve}
                disabled={resolutionPending || isPublishRunActive}
                className="inline-flex min-h-tap-min items-center justify-center rounded-sm border border-border-strong bg-surface px-4 text-sm font-semibold whitespace-nowrap text-text transition-colors duration-fast hover:bg-surface-sunken disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                Ignore this sheet
              </button>
              <RescanSheetButton
                driveFileId={dfid}
                wizardSessionId={wizardSessionId}
                resultPlacement="overlay"
                disabled={isPublishRunActive}
              />
              {/* §11: instant — deliberate (approve button presence follows corrupt flag; server truth, no animation) */}
              {!reviewItemsCorrupt ? (
                <button
                  type="button"
                  data-testid={`wizard-step3-card-${dfid}-review-resolution-approve`}
                  onClick={handleApproveResolve}
                  disabled={!canApprove}
                  aria-busy={resolutionPending || undefined}
                  className="inline-flex min-h-tap-min flex-1 items-center justify-center gap-2 rounded-sm bg-accent px-4 text-sm font-semibold whitespace-nowrap text-accent-text transition-colors duration-fast hover:bg-accent-hover disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface sm:flex-none"
                >
                  {resolutionPending ? "Applying…" : "Approve & apply"}
                </button>
              ) : null}
            </>
          ) : /* §11 T10: instant — deliberate (footer swaps on isDirtyRescan/props change; server truth) */
          isDirtyRescan ? (
            /* Dirty re-scan (spec §9.2): the plain publish approve cannot clear
               RESCAN_REVIEW_REQUIRED, so BOTH the publish and re-scan buttons are
               suppressed. Step-3 consolidation (spec §4.6): the standalone reapply
               page is retired — resolution now happens IN this modal via the
               resolution footer (the `resolution ?` branch above), which a dirty
               row always receives. This context-only fallback (no link-out) covers
               the read-only-preview edge where no resolution handlers were passed. */
            <span
              data-testid={`wizard-step3-card-${dfid}-review-reapply`}
              className="flex min-w-0 items-start gap-2 text-sm font-medium text-warning-text"
            >
              <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              This sheet changed since you reviewed it. Reopen it from Review to resolve it before
              publishing.
            </span>
          ) : isFinalizeDemoted ? (
            /* §11: instant — deliberate (demoted slot follows server truth;
               spec §C2). Non-rescan finalize demotion (spec §C3): the row
               cannot be published as-is — no publish/unpublish button; the
               card's NotPublishableNote copy replaces it (recovery flows
               through the next scan, so Re-scan still renders). */
            <>
              <div className="min-w-0 flex-1">
                <NotPublishableNote
                  dfid={dfid}
                  testId={`wizard-step3-card-${dfid}-review-not-publishable`}
                />
              </div>
              <RescanSheetButton
                driveFileId={dfid}
                wizardSessionId={wizardSessionId}
                resultPlacement="overlay"
                disabled={isPublishRunActive}
              />
            </>
          ) : (
            <>
              <span
                data-testid={`wizard-step3-card-${dfid}-review-note`}
                className="hidden min-w-0 items-center text-sm text-text-subtle sm:flex sm:flex-1"
              >
                {flaggedCount > 0
                  ? `${flaggedCount} to review · publishing isn't blocked`
                  : "All clear to publish"}
              </span>
              {/* §11 T7b: instant — deliberate (error note appears instantly, no animation) */}
              {publishState === "error" ? (
                <span role="status" className="min-w-0 text-sm font-medium text-warning-text">
                  Couldn&apos;t update the publish selection. Try again.
                </span>
              ) : null}
              <RescanSheetButton
                driveFileId={dfid}
                wizardSessionId={wizardSessionId}
                resultPlacement="overlay"
                disabled={isPublishRunActive}
              />
              {/* §11 N5: instant — deliberate (slot follows the operation in flight while pending, else the checked prop; spec 2026-07-04 §B2 amendment) */}
              {showCheckedSlot ? (
                <button
                  type="button"
                  data-testid={`wizard-step3-card-${dfid}-review-publish`}
                  onClick={handleUnpublish}
                  disabled={isPending || isPublishRunActive}
                  aria-busy={isPending || undefined}
                  className="inline-flex min-h-tap-min flex-1 items-center justify-center gap-2 rounded-sm border border-border-strong bg-surface px-4 text-sm font-semibold whitespace-nowrap text-text transition-colors duration-fast hover:bg-surface-sunken disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface sm:flex-none"
                >
                  {/* Quiet/secondary treatment, no Check icon (spec §C2); exact
                      weights design-stage-tunable under impeccable. */}
                  {pendingOp === "unpublish" ? "Removing…" : "Unpublish"}
                </button>
              ) : (
                <button
                  type="button"
                  data-testid={`wizard-step3-card-${dfid}-review-publish`}
                  onClick={handlePublish}
                  disabled={isPending || isPublishRunActive}
                  aria-busy={isPending || undefined}
                  className="inline-flex min-h-tap-min flex-1 items-center justify-center gap-2 rounded-sm bg-accent px-4 text-sm font-semibold whitespace-nowrap text-accent-text transition-colors duration-fast hover:bg-accent-hover disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface sm:flex-none"
                >
                  {publishLabel}
                </button>
              )}
            </>
          )}
        </>
      }
    >
      {/* Review body (spec §5.1.2/§5.1.3, §6.2-§6.4, §9.4): the extracted
            source-agnostic surface owns the side rail + chip rail + section-panel
            column + deterministic scroll-spy. The modal (shell) owns the scroll
            container (`scrollerRef`), and passes the §4.4 re-apply resolution
            body as the content-pane TOP slot (children) and the §C raw-
            unrecognized callout as the BOTTOM slot. No extras arrays are passed
            → the rail model is byte-identical to the pre-extraction modal. */}
      <ShowReviewSurface
        data={data}
        isPublishRunActive={isPublishRunActive}
        scrollerRef={scrollerRef}
        layout="modal"
        bottomSlot={<RawUnrecognizedCallout raw={data.rawUnrecognized} />}
      >
        {/* Re-apply resolution body (spec §4.4): rendered ABOVE the section
              panels when this is a blocked re-apply row. Tier-1/2 items are
              context/diagnostic lines; tier-3 items force a radio choice.
              §11: instant — deliberate (resolution presence follows data/props, no animation) */}
        {resolution || hasPendingArchivedOffer ? (
          <section
            data-testid={`wizard-step3-card-${dfid}-review-resolution`}
            aria-label="Resolve before publishing"
            className="flex min-w-0 flex-col gap-4 rounded-md border border-border bg-surface-sunken p-tile-pad"
          >
            <h3 className="text-sm font-semibold text-text-strong">Resolve before publishing</h3>
            {/* Re-apply items render ONLY when a blocked re-apply resolution is
                  present (spec §4.4 decoupling — the box may also appear for a
                  pending archived-tab offer alone).
                  §11: instant — deliberate (re-apply body follows server truth, no animation) */}
            {resolution ? (
              reviewItemsCorrupt ? (
                <p
                  data-testid={`wizard-step3-card-${dfid}-review-resolution-corrupt`}
                  className="text-sm text-warning-text"
                >
                  We couldn&apos;t read the review details for this sheet. Re-scan it, or set it
                  aside for this setup.
                </p>
              ) : (
                resolutionItems.map((item) => {
                  const tier = tierForItem(item);
                  if (tier !== "tier3_radio") {
                    return (
                      <p
                        key={item.id}
                        data-testid={`wizard-step3-card-${dfid}-review-resolution-item-${item.id}`}
                        className="text-sm text-text"
                      >
                        {describeItem(item)}
                      </p>
                    );
                  }
                  const allowed = allowedActionsFor(item);
                  return (
                    <fieldset
                      key={item.id}
                      data-testid={`wizard-step3-card-${dfid}-review-resolution-item-${item.id}`}
                      className="flex min-w-0 flex-col gap-2"
                    >
                      <legend className="text-sm text-text">{describeItem(item)}</legend>
                      {allowed.map((action) => {
                        const selected = resolutionChoices.get(item.id) === action;
                        return (
                          <label
                            key={action}
                            className="flex min-h-tap-min items-center gap-2 text-sm text-text"
                          >
                            <input
                              type="radio"
                              name={`resolution-${item.id}`}
                              checked={selected}
                              disabled={isPublishRunActive}
                              onChange={() => setResolutionChoice(item.id, action)}
                              className="size-4 shrink-0 accent-accent"
                            />
                            <span>{actionLabel(action, item, true)}</span>
                          </label>
                        );
                      })}
                    </fieldset>
                  );
                })
              )
            ) : null}
            {/* Archived-tab accept offer(s) (spec §4.3/§4.5b): pending offers
                  render here even with no re-apply resolution. showDismiss={false}
                  so the box region is a pure function of server offers (no local
                  dismiss can strand an empty titled box). Not frozen during a
                  publish run — identical mutation contract to the Pack-list offer. */}
            {archivedOffers.map((tab) => (
              <ArchivedTabOffer
                key={tab.tabName}
                dfid={data.driveFileId}
                wizardSessionId={wizardSessionId}
                tab={tab}
                showDismiss={false}
                testId={`wizard-step3-card-${dfid}-review-resolution-archived-${tab.tabName}`}
              />
            ))}
          </section>
        ) : null}
      </ShowReviewSurface>
    </ReviewModalShell>
  );
}
