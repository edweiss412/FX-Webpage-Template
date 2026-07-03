"use client";

/**
 * components/admin/wizard/Step3ReviewModal.tsx (Task 4 — spec §5, §9.1, §9.4, §15)
 *
 * The NEW Step-3 review modal: a bottom SHEET below `sm` and a centered panel
 * above it (popup < lg, two-pane ≥ lg — the navs/content land in Tasks 5-7;
 * this task ships the shell, header, and footer with a stub body region).
 * It supersedes Step3DetailsDialog (removed in Task 8) and carries its
 * topology: tap-out scrim + focus-trapped `role="dialog" aria-modal` panel
 * (`useDialogFocus` — initial focus on the close button, Tab trap,
 * restore-to-trigger), Esc on document, body scroll lock, and CSS-driven
 * entrance animation hooks ([data-step3-review-scrim]/[data-step3-review-panel]
 * in app/globals.css, reduced-motion collapse included).
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
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, ChevronRight, ExternalLink, X } from "lucide-react";
import { useDialogFocus } from "@/lib/a11y/dialogFocus";
import { buildSheetDeepLink } from "@/lib/sheet-links/buildSheetDeepLink";
import { deriveSectionStatuses, type SectionId } from "@/lib/admin/step3SectionStatus";
import {
  dateSummarySegments,
  step3Sections,
  type SectionData,
} from "@/components/admin/wizard/step3ReviewSections";
import { RescanSheetButton } from "@/components/admin/RescanSheetButton";

// ── Interaction constants (spec §6.3a/§10; DESIGN.md §5 note) ───────────────
// Behavioral thresholds, not rendered visual values — they never paint a px.
/** Scroll-spy anchor offset: a section is "active" once its top passes this
 *  many px below the content pane's top (§6.3a). */
export const SCROLL_SPY_OFFSET_PX = 90;
/** Sheet-mode drag distance past which release dismisses the modal (§10). */
export const DRAG_DISMISS_THRESHOLD_PX = 110;
/** Max pointer travel still treated as a tap (click) rather than a drag (§10). */
export const DRAG_SLOP_PX = 6;

/**
 * Pure scroll-spy rule (spec §6.3a): the active section is the LAST one whose
 * top is at/above `scrollTop + SCROLL_SPY_OFFSET_PX`; when the pane is scrolled
 * to the bottom the last section wins (it may be too short to ever cross the
 * offset line). Task 6 wires this to the panes and pins its boundary cases;
 * the shape ships here so the module contract is complete from day one.
 */
export function activeSectionFor(
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number,
  sectionTops: ReadonlyArray<{ id: SectionId; top: number }>,
): SectionId {
  const first = sectionTops[0];
  if (!first) return "warnings"; // registry always renders ≥11 sections; defensive only
  const last = sectionTops[sectionTops.length - 1] ?? first;
  if (scrollTop + clientHeight >= scrollHeight - 1) return last.id;
  let current = first.id;
  for (const s of sectionTops) {
    if (s.top <= scrollTop + SCROLL_SPY_OFFSET_PX) current = s.id;
    else break;
  }
  return current;
}

type PublishState = "idle" | "pending" | "error";

export function Step3ReviewModal({
  data,
  checked,
  isDirtyRescan,
  onRequestSetChecked,
  onClose,
}: {
  data: SectionData;
  checked: boolean;
  isDirtyRescan: boolean;
  onRequestSetChecked: (next: boolean) => Promise<boolean>;
  onClose: () => void;
}) {
  const { dfid, wizardSessionId } = data;
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const h2Id = useId();
  const [publishState, setPublishState] = useState<PublishState>("idle");

  // Initial focus → close button; Tab-trap inside the panel; restore focus to
  // the trigger on unmount. (WCAG 2.4.3 / 2.1.2 — shared hook.)
  useDialogFocus(panelRef, closeRef);

  // Lock background scroll while the overlay is open; restore the prior value
  // on close/unmount (the card unmounts this component to close).
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Escape closes. The focus hook traps Tab but defers Esc to the dialog
  // (lib/a11y/dialogFocus.ts contract). Listen on document so the key is
  // caught wherever focus currently sits inside the trap.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // ── Header derivations (spec §9.1) ─────────────────────────────────────────
  const title = data.pr.show.title || data.row.driveFileName || dfid;
  const client = data.pr.show.client_label || null;
  const segs = dateSummarySegments(data.pr.show.dates);
  const sheetLink = buildSheetDeepLink(dfid);

  // Overall status chip (spec §7): flagged count via the shared mapping lib,
  // over the sections this modal actually renders (registry + agenda gate).
  const renderedSections = new Set<SectionId>(step3Sections(data).map((s) => s.id));
  const { flaggedCount } = deriveSectionStatuses(data.warnings, renderedSections);

  // Result-bearing publish (spec §9.1): ALWAYS request true (idempotent
  // approve, never a toggle); close only on a true resolution.
  async function handlePublish() {
    setPublishState("pending");
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

  const publishLabel =
    publishState === "pending"
      ? "Selecting…"
      : checked
        ? "Selected to publish"
        : "Publish this show";

  return (
    <div
      data-testid={`wizard-step3-card-${dfid}-review-dialog`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={h2Id}
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
    >
      {/* Scrim — tap-out closes. A labelled close button kept OUT of the tab
          order (tabIndex -1) so the focus trap never lands on it; Escape + the
          visible close button are the keyboard/AT exits. Deliberately NOT
          aria-hidden — aria-hidden on an interactive control is an a11y
          footgun. (Pattern carried from Step3DetailsDialog / ReportModal.) */}
      <button
        type="button"
        data-testid={`wizard-step3-card-${dfid}-review-backdrop`}
        data-step3-review-scrim=""
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-overlay-scrim"
      />

      {/* Panel — `items-stretch` stated explicitly: this repo's Tailwind v4
          does NOT default `.flex` to align-items:stretch (DESIGN.md §7).
          Header/footer/grab are shrink-0; the body region is min-h-0 flex-1. */}
      <div
        ref={panelRef}
        data-step3-review-panel=""
        className="relative flex max-h-[85vh] w-full flex-col items-stretch rounded-t-md bg-bg text-text shadow-(--shadow-tile) sm:max-h-[80vh] sm:max-w-5xl sm:rounded-md"
      >
        {/* Grab strip — sheet mode only (§9.4). Full-width 44px button; the
            visual affordance is the small inner pill. A plain tap closes; the
            drag gesture itself is wired in Task 7. */}
        <button
          type="button"
          data-testid={`wizard-step3-card-${dfid}-review-grab`}
          aria-label="Drag down or tap to close"
          onClick={onClose}
          className="flex min-h-tap-min w-full shrink-0 items-center justify-center sm:hidden"
        >
          <span aria-hidden="true" className="h-1 w-10 rounded-pill bg-border-strong" />
        </button>

        {/* Header (spec §9.1): min-w-0 flex-1 text block + shrink-0 actions,
            so a long unbroken title wraps and never pushes the chip/close
            off-screen. */}
        <header
          data-testid={`wizard-step3-card-${dfid}-review-header`}
          className="flex shrink-0 items-start gap-3 border-b border-border bg-surface px-tile-pad py-3 sm:py-4"
        >
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium uppercase tracking-eyebrow text-text-faint">
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
            {flaggedCount > 0 ? (
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
        </header>

        {/* Body region — nav rails + section panes land in Tasks 5-7. */}
        <div data-testid={`wizard-step3-card-${dfid}-review-main`} className="min-h-0 flex-1" />

        {/* Footer (spec §9.1). Sheet-mode bottom padding adds the device safe
            area so the controls are never covered by the iOS home indicator;
            ≥sm restores the plain token padding. */}
        <footer
          data-testid={`wizard-step3-card-${dfid}-review-footer`}
          className="flex shrink-0 flex-wrap items-center gap-3 border-t border-border bg-surface px-tile-pad pt-3 pb-[calc(--spacing(3)+env(safe-area-inset-bottom,0))] sm:pb-3"
        >
          {isDirtyRescan ? (
            /* Dirty re-scan (spec §9.2): the plain publish approve cannot clear
               RESCAN_REVIEW_REQUIRED, so BOTH the publish and re-scan buttons
               are suppressed; the operator routes through the reapply page
               (same copy/target as the card's RescanReviewBanner). */
            <>
              <span className="flex min-w-0 items-start gap-2 text-sm font-medium text-warning-text">
                <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                This sheet changed since you reviewed it. Review it before publishing.
              </span>
              <Link
                data-testid={`wizard-step3-card-${dfid}-review-reapply`}
                href={`/admin/onboarding/staged/${wizardSessionId}/${dfid}`}
                className="inline-flex min-h-tap-min items-center gap-1 text-sm font-medium text-text-strong underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              >
                Review this sheet
                <ChevronRight aria-hidden="true" className="size-4" />
              </Link>
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
              {publishState === "error" ? (
                <span className="min-w-0 text-sm font-medium text-warning-text">
                  Couldn&apos;t update the publish selection. Try again.
                </span>
              ) : null}
              <RescanSheetButton driveFileId={dfid} wizardSessionId={wizardSessionId} />
              <button
                type="button"
                data-testid={`wizard-step3-card-${dfid}-review-publish`}
                onClick={handlePublish}
                disabled={publishState === "pending"}
                aria-busy={publishState === "pending" || undefined}
                className="inline-flex min-h-tap-min flex-1 items-center justify-center gap-2 rounded-sm bg-accent px-4 text-sm font-semibold whitespace-nowrap text-accent-text transition-colors duration-fast hover:bg-accent-hover disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface sm:flex-none"
              >
                {checked && publishState !== "pending" ? (
                  <Check aria-hidden="true" className="size-4" />
                ) : null}
                {publishLabel}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
