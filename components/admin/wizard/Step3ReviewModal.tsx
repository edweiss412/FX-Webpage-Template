"use client";

/**
 * components/admin/wizard/Step3ReviewModal.tsx (Task 4 — spec §5, §9.1, §9.4, §15)
 *
 * The NEW Step-3 review modal: a bottom SHEET below `sm` and a centered panel
 * above it (popup < lg, two-pane ≥ lg). Task 4 shipped the shell/header/
 * footer; Task 5 fills the body — side rail + chip rail (§6.2/§6.3, twin navs
 * per §9.4) + the §6.4 section panels; scroll-spy wiring and sheet drag land
 * in Tasks 6-7.
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
import { Fragment, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, ChevronRight, ExternalLink, X } from "lucide-react";
import { useDialogFocus } from "@/lib/a11y/dialogFocus";
import { buildSheetDeepLink } from "@/lib/sheet-links/buildSheetDeepLink";
import { deriveSectionStatuses, type SectionId } from "@/lib/admin/step3SectionStatus";
import {
  dateSummarySegments,
  step3Sections,
  STEP3_SECTION_GROUPS,
  Step3SectionChromeContext,
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

  // ── Section registry + statuses (spec §6.1/§7) — ONE memoized derivation
  // feeds the header chip, footer note, both navs, and the section panels. ──
  const sections = useMemo(() => step3Sections(data), [data]);
  const { flagged, flaggedCount } = useMemo(() => {
    const rendered = new Set<SectionId>(sections.map((s) => s.id));
    return deriveSectionStatuses(data.warnings, rendered);
  }, [sections, data.warnings]);
  // Row-local warnings dot (§6.2): red iff ≥1 warn-severity warning exists,
  // MAPPED OR NOT — the checks row summarizes the whole list. Deliberately
  // different from the §7 flagged-set rule (which only adds `warnings` for
  // UNMAPPED warns so the header count never double-counts).
  const hasWarnRow = useMemo(
    () => data.warnings.some((w) => w.severity === "warn"),
    [data.warnings],
  );

  // Active nav section — shared by BOTH navs (§9.4); starts at the first
  // rendered section (§6.3a initial state). Scroll-spy re-derives it in Task 6.
  const [active, setActive] = useState<SectionId>(() => step3Sections(data)[0]?.id ?? "warnings");
  const contentRef = useRef<HTMLDivElement | null>(null);
  const sectionElsRef = useRef(new Map<SectionId, HTMLElement>());

  /** Rail/chip status-dot tone (§6.2/§6.3). */
  function dotToneClass(id: SectionId): string {
    const review = id === "warnings" ? hasWarnRow : flagged.has(id);
    return review ? "bg-status-review" : "bg-status-positive";
  }

  /** Click override (§6.3a): set active immediately + scroll the content pane
   *  to `sectionTop − 8` using the container-relative coordinate contract. JS
   *  passes no `behavior` — the pane's `motion-safe` CSS smooth-scroll governs.
   *  (jsdom has no Element#scrollTo; tests stub it — guard keeps this safe.) */
  function handleNavClick(id: SectionId) {
    setActive(id);
    const scroller = contentRef.current;
    const target = sectionElsRef.current.get(id);
    if (!scroller || !target || typeof scroller.scrollTo !== "function") return;
    const top =
      target.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top +
      scroller.scrollTop -
      8;
    scroller.scrollTo({ top });
  }

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
      data-testid={`wizard-step3-card-${dfid}-review-modal`}
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

        {/* Body region (Task 5 — spec §5.1.2/§5.1.3, §6.2-§6.4, §9.4): a flex
            COLUMN in sheet/popup (chip rail pinned above the scrolling content)
            that becomes a ROW at lg (side rail | content). `items-stretch`
            stated explicitly (Tailwind v4 no-default-stretch, DESIGN.md §7).
            Duplicate-navigation contract (§9.4): BOTH navs are always in the
            JSX; mode exclusivity is CSS-only (`hidden lg:flex` / `flex
            lg:hidden`), NO id attributes inside either nav, and both render
            aria-current from the same shared `active` state. */}
        <div
          data-testid={`wizard-step3-card-${dfid}-review-main`}
          className="flex min-h-0 flex-1 flex-col items-stretch lg:flex-row"
        >
          {/* Side rail — two-pane mode only (§6.2). */}
          <nav
            aria-label="Review sections"
            data-testid={`wizard-step3-card-${dfid}-review-rail`}
            className="hidden w-60 shrink-0 flex-col overflow-y-auto border-r border-border bg-surface px-2 pb-3 lg:flex"
          >
            {STEP3_SECTION_GROUPS.map((group) => {
              const groupSections = sections.filter((s) => s.group === group);
              if (groupSections.length === 0) return null;
              return (
                <Fragment key={group}>
                  <div
                    data-rail-group={group}
                    className="px-2 pt-3 pb-1 text-xs font-semibold uppercase tracking-eyebrow text-text-faint"
                  >
                    {group}
                  </div>
                  {groupSections.map((s) => {
                    const isActive = active === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        data-testid={`wizard-step3-card-${dfid}-review-rail-item-${s.id}`}
                        aria-current={isActive ? "true" : undefined}
                        onClick={() => handleNavClick(s.id)}
                        className={`relative flex min-h-tap-min w-full shrink-0 items-center gap-2.5 rounded-sm px-2 text-left transition-colors duration-fast ${
                          isActive ? "bg-surface-sunken" : "hover:bg-surface-sunken"
                        }`}
                      >
                        {isActive ? (
                          <span
                            aria-hidden="true"
                            className="absolute inset-y-3 left-0 w-1 rounded-r-pill bg-accent"
                          />
                        ) : null}
                        <s.Icon
                          aria-hidden="true"
                          className={`size-4 shrink-0 ${
                            isActive ? "text-accent-on-bg" : "text-text-subtle"
                          }`}
                        />
                        <span
                          className={`min-w-0 flex-1 truncate text-sm font-medium ${
                            isActive ? "text-text-strong" : "text-text"
                          }`}
                        >
                          {s.label}
                        </span>
                        {s.railCount !== null ? (
                          <span className="shrink-0 text-xs font-medium tabular-nums text-text-faint">
                            {s.railCount(data)}
                          </span>
                        ) : null}
                        <span
                          aria-hidden="true"
                          className={`size-2 shrink-0 rounded-pill ${dotToneClass(s.id)}`}
                        />
                      </button>
                    );
                  })}
                </Fragment>
              );
            })}
          </nav>

          {/* Chip rail — sheet + popup modes (§6.3): one horizontal scroll row
              pinned above the content (shrink-0 in the flex column, NOT
              sticky — the content pane below is the scroll container). No
              counts on chips (mock's collapse behavior). */}
          <nav
            aria-label="Review sections"
            data-testid={`wizard-step3-card-${dfid}-review-chiprail`}
            className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-border bg-surface px-tile-pad py-2 lg:hidden"
          >
            {sections.map((s) => {
              const isActive = active === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  data-testid={`wizard-step3-card-${dfid}-review-chip-item-${s.id}`}
                  aria-current={isActive ? "true" : undefined}
                  onClick={() => handleNavClick(s.id)}
                  className={`inline-flex min-h-tap-min shrink-0 items-center gap-1.5 rounded-pill border px-3 text-sm font-medium whitespace-nowrap transition-colors duration-fast ${
                    isActive
                      ? "border-transparent bg-surface-sunken text-text-strong"
                      : "border-border bg-surface text-text"
                  }`}
                >
                  <s.Icon aria-hidden="true" className="size-4 shrink-0 text-text-subtle" />
                  {s.label}
                  <span
                    aria-hidden="true"
                    className={`size-2 shrink-0 rounded-pill ${dotToneClass(s.id)}`}
                  />
                </button>
              );
            })}
          </nav>

          {/* Content pane — the scroll container (§5.2 rhythm; §6.3a names it
              the scroll-spy root). Smooth glide is motion-safe CSS only. */}
          <div
            ref={contentRef}
            data-testid={`wizard-step3-card-${dfid}-review-content`}
            className="flex min-w-0 flex-1 flex-col gap-6 overflow-y-auto p-tile-pad motion-safe:scroll-smooth"
          >
            {sections.map((s) => (
              <section
                key={s.id}
                data-testid={`wizard-step3-card-${dfid}-review-section-${s.id}`}
                ref={(el) => {
                  if (el) sectionElsRef.current.set(s.id, el);
                  else sectionElsRef.current.delete(s.id);
                }}
                className="flex min-w-0 flex-col"
              >
                {/* The provider makes the body render the §6.4 heading row +
                    §5.2 panel card (see step3ReviewSections.tsx) — the body's
                    own count can never drift from the heading. */}
                <Step3SectionChromeContext.Provider
                  value={{ Icon: s.Icon, label: s.label, flagged: flagged.has(s.id) }}
                >
                  {s.render(data)}
                </Step3SectionChromeContext.Provider>
              </section>
            ))}
          </div>
        </div>

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
