"use client";

/**
 * components/admin/review/ShowReviewSurface.tsx (Phase 1 — spec
 * 2026-07-16-consolidated-admin-show-page §5)
 *
 * The source-agnostic Step-3 review BODY, extracted verbatim from
 * `Step3ReviewModal.tsx` so both the wizard modal (staged) and the Phase-2
 * consolidated show page (published) render the identical rail + chip rail +
 * section-panel column + deterministic scroll-spy from one place.
 *
 * What this owns: the desktop side rail (§6.2), the mobile horizontal chip rail
 * (§6.3), the §6.3a deterministic scroll-spy, the §6.4 section panels via the
 * shared `step3Sections` registry + `Step3SectionChromeContext`, and the
 * `warningsBySection`/section-status rail chips. It does NOT own dialog chrome
 * (scrim / focus trap / drag-dismiss), the approve/publish footer, or the page
 * strip — those belong to the SHELL (the modal today, the page in Phase 2).
 *
 * Byte-identical Phase-1 contract: with no `extraSectionsBefore`/`After`,
 * `bottomSlot`, `children`, or `renderSectionExtras` passed (exactly how the
 * modal wraps it), the rendered rail/content DOM is identical to the pre-
 * extraction modal — every `data-testid`, class string, and constant is
 * preserved. The scroll container is owned by the SHELL and handed in via
 * `scrollerRef` (in modal mode it is the content pane below; Phase 2's page
 * shell owns a different scroller). The extra-section rail/scroll-spy
 * participation documented in the API is completed by Phase 2 (Task 13 fills the
 * page-mode differences); Phase 1 renders the content-pane slots only.
 */
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type ReactNode,
  type RefObject,
} from "react";
import type { LucideIcon } from "lucide-react";
import { sectionStatus, warningsBySection, type SectionId } from "@/lib/admin/step3SectionStatus";
import {
  ROOMS_CAP,
  step3Sections,
  STEP3_SECTION_GROUPS,
  Step3SectionChromeContext,
} from "@/components/admin/wizard/step3ReviewSections";
import { isStaged, type SectionData } from "@/components/admin/review/sectionData";
// WARNING_HIGHLIGHT_MS stays DEFINED in Step3ReviewModal.tsx (the §11
// source-marker audit pins `export const WARNING_HIGHLIGHT_MS = 1600;` to that
// file) and is imported here for `jumpToWarning`'s one-shot flash. The import
// is call-time only (used inside a handler, never at module-eval), so the
// modal↔surface cycle never touches an uninitialized binding.
import { WARNING_HIGHLIGHT_MS } from "@/components/admin/wizard/Step3ReviewModal";

// ── Interaction constants (spec §6.3a; DESIGN.md §5 note) ───────────────────
// Behavioral thresholds, not rendered visual values — they never paint a px.
/** Scroll-spy anchor offset: a section is "active" once its top passes this
 *  many px below the content pane's top (§6.3a). */
export const SCROLL_SPY_OFFSET_PX = 90;
/** §A2 fallback release of the nav-click scroll-spy suppression when a
 *  programmatic glide never settles (zero-event and interrupted glides).
 *  Measured from the click/jump AND from every suppressed scroll-progress
 *  frame (the spy's evaluate restarts it while the glide is in flight), so a
 *  healthy glide longer than this window is NOT cut short — see the restart
 *  comment in the scroll-spy effect (Task 14 real-browser finding). */
export const NAV_SCROLL_SETTLE_TIMEOUT_MS = 700;
/** §A2 settle tolerance: |scrollTop − target| at/below this many px releases
 *  the nav-click scroll-spy suppression. */
export const NAV_SCROLL_SETTLE_EPSILON_PX = 2;
/** §A3 sliding rail indicator's vertical inset inside the active rail item —
 *  matches the retired per-item `inset-y-3` span (12px). Painted geometry,
 *  but derived at runtime from measured rects (never a static class), so it
 *  lives here beside the interaction constants it composes with. */
export const INDICATOR_INSET_PX = 12;

/**
 * Pure scroll-spy rule (spec §6.3a): the active section is the LAST one whose
 * top is at/above `scrollTop + SCROLL_SPY_OFFSET_PX`; when the pane is scrolled
 * to the bottom the last section wins (it may be too short to ever cross the
 * offset line). Task 6 wires this to the content pane's rAF-throttled scroll
 * listener below (`sectionTopFor` + the effect after `handleNavClick`).
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

/** Coordinate contract (§6.3a): DOM `offsetTop` is relative to `offsetParent`,
 *  NOT necessarily the scroll container — it is NOT used. `el`'s top is
 *  container-relative by construction (immune to padding/panel
 *  nesting/offsetParent changes), so it stays correct across the chip rail /
 *  side rail's differing ancestor chains. Shared by the click override
 *  (`handleNavClick`) and the scroll-spy wiring effect so there is exactly
 *  one place this math lives. */
function sectionTopFor(scroller: Element, el: Element): number {
  return (
    el.getBoundingClientRect().top -
    scroller.getBoundingClientRect().top +
    (scroller as HTMLElement).scrollTop
  );
}

/**
 * A rail item mounted from outside the `step3Sections` registry (Phase 2:
 * Overview / Changes). It becomes a rail item id + hash anchor and renders its
 * own panel via `render()`. Phase 1 (the modal) passes none.
 */
export type ExtraSection = {
  id: string; // "overview" | "changes" — becomes the rail item id + hash anchor
  label: string;
  Icon: LucideIcon;
  railBadge?: ReactNode; // e.g. the Overview alert-count chip
  render: () => ReactNode;
};

export function ShowReviewSurface({
  data,
  scrollerRef,
  extraSectionsBefore,
  extraSectionsAfter,
  renderSectionExtras,
  bottomSlot,
  children,
}: {
  data: SectionData;
  scrollerRef: RefObject<HTMLElement | null>; // the scroll container the SHELL owns
  layout: "modal" | "page"; // modal: current <lg chip rail + ≥lg two-pane inside dialog; page: full-page two-pane
  extraSectionsBefore?: ExtraSection[]; // Phase 2: [Overview] — full rail items: scroll-spy + hash + chips participate
  extraSectionsAfter?: ExtraSection[]; // Phase 2: [Changes]
  renderSectionExtras?: (id: SectionId, d: SectionData) => ReactNode; // Phase 2 hook: per-section warning controls
  bottomSlot?: ReactNode; // Phase 2 hook: RawUnrecognizedCallout — renders AFTER the registry sections
  // (incl. warnings) and BEFORE extraSectionsAfter. Not a rail item.
  children?: ReactNode; // shell-owned content-pane TOP slot (the modal's re-apply resolution body)
}): JSX.Element {
  // Staged-only identifiers (spec §3.2): `dfid` fills the section/rail testids;
  // in staged mode it is the drive file id (byte-identical to the modal), in
  // published mode it falls back to the mode-agnostic `driveFileId`.
  const dfid = isStaged(data) ? data.dfid : (data.driveFileId ?? "");

  // ── Section registry + statuses (spec §6.1/§7) — ONE memoized derivation
  // feeds both navs and the section panels. ──
  const sections = useMemo(() => step3Sections(data), [data]);
  // §E3 callout map: warn-severity warnings keyed by section (index = FULL
  // warnings-array position — the §E4 jump-target key). The §7.1 section-status
  // split reads from THIS map so flags and callouts can never disagree.
  const bySection = useMemo(
    () => warningsBySection(data.warnings, new Set(sections.map((s) => s.id))),
    [sections, data.warnings],
  );
  // §7.1 (spec 2026-07-07): each section carrying warnings is either flagged
  // (≥1 NON-ambiguity warn) or judgment (≥1 warn, ALL ambiguity-class) — mutually
  // exclusive. A judgment section gets the calm judgment callout, never the amber
  // flag.
  const { flagged, judgment } = useMemo(() => {
    const flagged = new Set<SectionId>();
    const judgment = new Set<SectionId>();
    for (const [sid, entries] of bySection) {
      const st = sectionStatus(entries.map((e) => e.warning));
      if (st === "flagged") flagged.add(sid);
      else if (st === "judgment") judgment.add(sid);
    }
    return { flagged, judgment };
  }, [bySection]);
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
  const sectionElsRef = useRef(new Map<SectionId, HTMLElement>());

  // §D3a active-section plumbing: a stable-identity reader over a ref kept in
  // sync with `active`, so ReportIssueSection gets a stale-free read AT SUBMIT
  // TIME. NOT render optimization — the chrome provider below keeps passing a
  // fresh inline object each render (unchanged, spec §D3a).
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);
  const getActiveSection = useCallback((): SectionId => activeRef.current, []);

  /** Rail/chip status-dot tone (§6.2/§6.3). */
  function dotToneClass(id: SectionId): string {
    const review = id === "warnings" ? hasWarnRow : flagged.has(id);
    return review ? "bg-status-review" : "bg-status-positive";
  }

  // ── §A2 nav-click scroll-spy suppression ───────────────────────────────────
  // While a programmatic glide is in flight the rAF spy must NOT re-derive
  // `active` from intermediate positions (§H N1 — the indicator hopped across
  // every section between here and there). All state is refs: no re-renders,
  // unmount-safe teardown.
  const spySuppressedRef = useRef(false);
  const spyTargetTopRef = useRef<number | null>(null);
  const spySettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function releaseSpySuppression() {
    spySuppressedRef.current = false;
    spyTargetTopRef.current = null;
    if (spySettleTimerRef.current !== null) {
      clearTimeout(spySettleTimerRef.current);
      spySettleTimerRef.current = null;
    }
  }

  /** §A2: clamp the target, hold the spy until settle/clamp/timeout/user-input.
   *  Already-at-target → release immediately (no scroll event will fire).
   *  A second call replaces the target and restarts the timeout (no queuing). */
  function beginSuppressedScroll(scroller: HTMLElement, targetTop: number): number {
    const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    const clamped = Math.min(Math.max(0, targetTop), maxTop);
    if (Math.abs(scroller.scrollTop - clamped) <= NAV_SCROLL_SETTLE_EPSILON_PX) {
      releaseSpySuppression();
      return clamped;
    }
    spySuppressedRef.current = true;
    spyTargetTopRef.current = clamped;
    if (spySettleTimerRef.current !== null) clearTimeout(spySettleTimerRef.current);
    spySettleTimerRef.current = setTimeout(releaseSpySuppression, NAV_SCROLL_SETTLE_TIMEOUT_MS);
    return clamped;
  }

  /** Click override (§6.3a): set active immediately + scroll the content pane
   *  to `sectionTop − 8` using the container-relative coordinate contract. JS
   *  passes no `behavior` — the pane's `motion-safe` CSS smooth-scroll governs.
   *  The clicked id stays `active` for the whole §A2 suppressed window on BOTH
   *  navs (shared state — no flicker on the chip rail either).
   *  (jsdom has no Element#scrollTo; tests stub it — guard keeps this safe.) */
  function handleNavClick(id: SectionId) {
    setActive(id);
    const scroller = scrollerRef.current;
    const target = sectionElsRef.current.get(id);
    if (!scroller || !target || typeof scroller.scrollTo !== "function") return;
    const top = beginSuppressedScroll(scroller, sectionTopFor(scroller, target) - 8);
    scroller.scrollTo({ top });
  }

  // ── §E4 warning jump + one-shot highlight (§H N3) ──────────────────────────
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const highlightedElRef = useRef<HTMLElement | null>(null);

  /** One highlight at a time: cancel the pending timer and strip the
   *  attribute from whichever row currently carries it. */
  function clearWarningHighlight() {
    if (highlightTimerRef.current !== null) {
      clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = null;
    }
    highlightedElRef.current?.removeAttribute("data-step3-warning-flash");
    highlightedElRef.current = null;
  }

  /** §E4 jump: `index` = FULL warnings-array position (the callout entry's
   *  key); `null` = the "+N more" section-top jump (plain nav-click
   *  semantics, no highlight). */
  function jumpToWarning(index: number | null) {
    if (index === null) {
      handleNavClick("warnings"); // "+N more": plain nav-click semantics, no highlight
      return;
    }
    setActive("warnings");
    const scroller = scrollerRef.current;
    // Container-scoped attribute query — NO id attributes (twin-nav rule §9.4).
    const target = scroller?.querySelector<HTMLElement>(`[data-warning-index="${index}"]`);
    if (scroller && target && typeof scroller.scrollTo === "function") {
      // §A2: the jump engages the SAME scroll-spy suppression as a rail click
      // (beginSuppressedScroll clamps to [0, max] — the old Math.max(0, …)
      // lives inside it now).
      const top = beginSuppressedScroll(scroller, sectionTopFor(scroller, target) - 8);
      scroller.scrollTo({ top });
    }
    clearWarningHighlight(); // one highlight at a time
    if (target) {
      target.setAttribute("data-step3-warning-flash", "");
      highlightedElRef.current = target;
      highlightTimerRef.current = setTimeout(clearWarningHighlight, WARNING_HIGHLIGHT_MS);
    }
  }

  /** Rooms sub-nav: scroll the content pane to the room card at `index`. Keeps
   *  the parent "Rooms & scope" rail item active (rooms live inside that
   *  section). Container-scoped attribute query — NO id attributes (twin-nav
   *  rule §9.4), mirroring `jumpToWarning`. */
  function jumpToRoom(index: number) {
    setActive("rooms");
    const scroller = scrollerRef.current;
    const target = scroller?.querySelector<HTMLElement>(`[data-room-nav="${index}"]`);
    if (scroller && target && typeof scroller.scrollTo === "function") {
      const top = beginSuppressedScroll(scroller, sectionTopFor(scroller, target) - 8);
      scroller.scrollTo({ top });
    }
  }

  // Unmount hygiene (§H compound: drag-dismiss or unmount during highlight →
  // timer cleared in effect teardown).
  useEffect(() => clearWarningHighlight, []);

  // Deterministic scroll-spy (§6.3a): a rAF-throttled PASSIVE `scroll`
  // listener on the content pane recomputes every rendered section's
  // container-relative top each pass (cheap: ≤12 rects; keeps `<details>`
  // disclosure expansion from leaving stale positions) and derives `active`
  // via the pure `activeSectionFor` rule above — the SAME coordinate
  // contract `handleNavClick` uses, via the shared `sectionTopFor` helper.
  // No `IntersectionObserver` — the rule is the single source of truth.
  // Registered on mount, cleaned up on unmount (pending rAF cancelled).
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    let rafId: number | null = null;

    function evaluate() {
      rafId = null;
      const el = scrollerRef.current;
      if (!el) return;
      // Unmeasured pane (no real layout yet — e.g. not yet painted, or a
      // jsdom test that hasn't stubbed geometry): both dimensions read 0,
      // which would otherwise satisfy the bottom-clamp's `0 >= -1` and
      // spuriously jump `active` to the last section. Skip until the pane
      // actually has a size; the initial-render default (first section)
      // stands until then.
      if (el.clientHeight === 0 && el.scrollHeight === 0) return;
      const tops: Array<{ id: SectionId; top: number }> = [];
      for (const s of sections) {
        const sectionEl = sectionElsRef.current.get(s.id);
        if (sectionEl) tops.push({ id: s.id, top: sectionTopFor(el, sectionEl) });
      }
      if (tops.length === 0) return;
      // §A2: while a nav-click/jump glide is in flight, hold `active` constant
      // instead of deriving from intermediate positions (§H N1). Release on
      // settle or bottom-clamp and fall through to derivation the SAME frame;
      // timeout and user-input releases happen outside this handler.
      if (spySuppressedRef.current) {
        const targetTop = spyTargetTopRef.current;
        const settled =
          targetTop !== null && Math.abs(el.scrollTop - targetTop) <= NAV_SCROLL_SETTLE_EPSILON_PX;
        // Bottom-clamp releases ONLY when the pending target is itself the bottom —
        // otherwise an upward click made while parked at the bottom would release on
        // the first barely-moved frame and re-derive the bottom section (the exact
        // flicker this fix removes; plan-review R3 LOW).
        const maxScrollTop = el.scrollHeight - el.clientHeight;
        const targetIsBottom =
          targetTop !== null && targetTop >= maxScrollTop - NAV_SCROLL_SETTLE_EPSILON_PX;
        const bottomClamped =
          targetIsBottom && el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
        // Arrival consistency (Task 14 real-browser finding, part 2): the
        // settled ε (2px) is WIDER than the pure rule's bottom-clamp tolerance
        // (1px), so a decelerating glide can enter the ε-zone at e.g.
        // maxTop−1.8 where the same-frame derivation still yields the
        // SECOND-TO-LAST section — a 1-2 frame flicker right at the end of a
        // bottom-clamped glide (observed in the §K11 frame sampler). Only
        // complete the release when the derivation at the CURRENT position
        // already equals the derivation at the DESTINATION; otherwise hold one
        // more frame (the glide finishes at the exact target, and the
        // debounced timeout below still backstops a stalled glide).
        const arrivalConsistent =
          targetTop === null ||
          activeSectionFor(el.scrollTop, el.clientHeight, el.scrollHeight, tops) ===
            activeSectionFor(targetTop, el.clientHeight, el.scrollHeight, tops);
        if ((settled || bottomClamped) && arrivalConsistent) {
          releaseSpySuppression(); // fall through same frame
        } else {
          // §A2 condition-3 semantics (Task 14 real-browser finding): the
          // fallback timeout covers ZERO-EVENT and INTERRUPTED glides — a
          // glide still producing scroll progress is neither, so every
          // suppressed scroll frame pushes the fallback back out (this
          // handler only runs from the pane's scroll listener). Without the
          // restart, any healthy glide longer than NAV_SCROLL_SETTLE_TIMEOUT_MS
          // (measured: ~973ms for a 3156px two-pane glide at 1280×800 with a
          // realistic diagrams+warnings fixture) resumed the spy mid-flight
          // and re-introduced the §H N1 flicker near the end of long glides
          // (first intermediate active observed at ~714ms — the timer firing).
          // Zero-event glides still release exactly at the timeout: no scroll
          // frame ever runs this restart.
          if (spySettleTimerRef.current !== null) clearTimeout(spySettleTimerRef.current);
          spySettleTimerRef.current = setTimeout(
            releaseSpySuppression,
            NAV_SCROLL_SETTLE_TIMEOUT_MS,
          );
          return; // hold active constant (§H N1)
        }
      }
      setActive(activeSectionFor(el.scrollTop, el.clientHeight, el.scrollHeight, tops));
    }

    function onScroll() {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(evaluate);
    }

    scroller.addEventListener("scroll", onScroll, { passive: true });
    // §A2 user-input release: manual interaction cancels the suppression
    // instantly so the spy follows the user, not the interrupted glide.
    scroller.addEventListener("wheel", releaseSpySuppression, { passive: true });
    scroller.addEventListener("touchstart", releaseSpySuppression, { passive: true });
    scroller.addEventListener("pointerdown", releaseSpySuppression, { passive: true });
    evaluate(); // initial state (§6.3a): rule evaluated once on mount
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      scroller.removeEventListener("wheel", releaseSpySuppression);
      scroller.removeEventListener("touchstart", releaseSpySuppression);
      scroller.removeEventListener("pointerdown", releaseSpySuppression);
      releaseSpySuppression(); // clears the settle timer; refs only — unmount safe
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
    // releaseSpySuppression touches refs only — safe to omit from deps (same
    // convention as clearPanelDragStyles in the mode-boundary effect below).
    // scrollerRef is the shell-owned prop ref (stable identity per render); it
    // is in the dep list only to satisfy exhaustive-deps — it never re-fires
    // the effect (the modal's `useRef` never changes identity).
  }, [sections, scrollerRef]);

  // ── §A3 sliding rail indicator (desktop rail only) ─────────────────────────
  // ONE shared indicator, positioned from the ACTIVE rail button's measured
  // rect — replaces the per-item conditionally-mounted span so the accent bar
  // can slide between items instead of teleporting.
  const railRef = useRef<HTMLElement | null>(null);
  const railItemRefs = useRef(new Map<SectionId, HTMLButtonElement>());
  const [railIndicator, setRailIndicator] = useState<{ y: number; h: number } | null>(null);
  const [indicatorTransitionsOn, setIndicatorTransitionsOn] = useState(false);
  const hasMeasuredRef = useRef(false);

  useLayoutEffect(() => {
    const nav = railRef.current;
    const btn = railItemRefs.current.get(active);
    if (!nav || !btn) {
      setRailIndicator(null); // hidden until the next successful measure (§A3 guard)
      return;
    }
    const navRect = nav.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    if (btnRect.height === 0 && navRect.height === 0) {
      setRailIndicator(null); // unmeasurable (jsdom / display:none) → hidden
      return;
    }
    // Container-relative technique, NOT offsetTop (same contract as
    // sectionTopFor above; parent-spec §6.3a).
    const y = btnRect.top - navRect.top + nav.scrollTop + INDICATOR_INSET_PX;
    const h = btnRect.height - 2 * INDICATOR_INSET_PX;
    setRailIndicator({ y, h });
    if (!hasMeasuredRef.current) {
      hasMeasuredRef.current = true;
      // First paint lands WITHOUT transition classes; enable on the next frame
      // so the indicator never slides in from translateY(0) on mount (§A3).
      const raf = requestAnimationFrame(() => setIndicatorTransitionsOn(true));
      return () => cancelAnimationFrame(raf);
    }
  }, [active, sections]);

  return (
    <div
      data-testid={`wizard-step3-card-${dfid}-review-main`}
      className="flex min-h-0 flex-1 flex-col items-stretch lg:flex-row"
    >
      {/* Side rail — two-pane mode only (§6.2). `relative` anchors the §A3
          sliding indicator (first child below). */}
      <nav
        ref={railRef}
        aria-label="Review sections"
        data-testid={`wizard-step3-card-${dfid}-review-rail`}
        className="relative hidden w-60 shrink-0 flex-col overflow-y-auto border-r border-border bg-surface px-2 pb-3 lg:flex"
      >
        {/* §11 T6′: animated — the shared indicator slides via transition-[transform,height] duration-fast ease-out-quart (§A3/§A4) */}
        {railIndicator !== null ? (
          <span
            aria-hidden="true"
            data-testid={`wizard-step3-card-${dfid}-review-rail-indicator`}
            className={`absolute top-0 left-0 w-1 rounded-r-pill bg-accent ${
              indicatorTransitionsOn
                ? "transition-[transform,height] duration-fast ease-out-quart motion-reduce:transition-none"
                : ""
            }`}
            style={{
              transform: `translateY(${railIndicator.y}px)`,
              height: `${railIndicator.h}px`,
            }}
          />
        ) : null}
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
                  <Fragment key={s.id}>
                    <button
                      type="button"
                      ref={(el) => {
                        if (el) railItemRefs.current.set(s.id, el);
                        else railItemRefs.current.delete(s.id);
                      }}
                      data-testid={`wizard-step3-card-${dfid}-review-rail-item-${s.id}`}
                      aria-current={isActive ? "true" : undefined}
                      onClick={() => handleNavClick(s.id)}
                      className={`relative flex min-h-tap-min w-full shrink-0 items-center gap-2.5 rounded-sm px-2 text-left transition-colors duration-fast ${
                        isActive ? "bg-surface-sunken" : "hover:bg-surface-sunken"
                      }`}
                    >
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
                      {/* §11: instant — deliberate (rail count follows the static registry definition) */}
                      {s.railCount !== null ? (
                        <span className="shrink-0 text-xs font-medium tabular-nums text-text-subtle">
                          {s.railCount(data)}
                        </span>
                      ) : null}
                      {/* §11: instant — deliberate (dot presence follows the static registry definition, §D2) */}
                      {!s.hideDot ? (
                        <span
                          aria-hidden="true"
                          className={`size-2 shrink-0 rounded-pill ${dotToneClass(s.id)}`}
                        />
                      ) : null}
                    </button>
                    {/* Rooms & scope sub-nav: one indented child per rendered
                      room, scrolling the pane to that card. Rooms live inside
                      the "rooms" section, so these keep the parent active. */}
                    {s.id === "rooms"
                      ? data.rooms.slice(0, ROOMS_CAP).map((r, i) => (
                          <button
                            key={`room-nav-${r.name}-${i}`}
                            type="button"
                            data-testid={`wizard-step3-card-${dfid}-review-rail-room-${i}`}
                            onClick={() => jumpToRoom(i)}
                            className="flex min-h-tap-min w-full shrink-0 items-center rounded-sm py-1 pr-2 pl-9 text-left transition-colors duration-fast hover:bg-surface-sunken"
                          >
                            <span className="min-w-0 flex-1 truncate text-xs font-medium text-text-subtle">
                              {r.name || `Room ${i + 1}`}
                            </span>
                          </button>
                        ))
                      : null}
                  </Fragment>
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
              {/* §11: instant — deliberate (dot presence follows the static registry definition, §D2) */}
              {!s.hideDot ? (
                <span
                  aria-hidden="true"
                  className={`size-2 shrink-0 rounded-pill ${dotToneClass(s.id)}`}
                />
              ) : null}
            </button>
          );
        })}
      </nav>

      {/* Content pane — the scroll container (§5.2 rhythm; §6.3a names it
          the scroll-spy root). Smooth glide is motion-safe CSS only. */}
      <div
        ref={scrollerRef as RefObject<HTMLDivElement>}
        data-testid={`wizard-step3-card-${dfid}-review-content`}
        className="flex min-w-0 flex-1 flex-col gap-6 overflow-y-auto p-tile-pad motion-safe:scroll-smooth"
      >
        {/* Shell-owned TOP slot (the modal's §4.4 re-apply resolution body).
            Renders ABOVE every rail section; nothing when the shell passes no
            children (byte-identical to the pre-extraction modal). */}
        {children}
        {/* Extra rail sections mounted before the registry (Phase 2: Overview).
            Phase 1 (the modal) passes none → renders nothing. */}
        {extraSectionsBefore?.map((extra) => (
          <Fragment key={extra.id}>{extra.render()}</Fragment>
        ))}
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
              value={{
                Icon: s.Icon,
                label: s.label,
                flagged: flagged.has(s.id),
                judgment: judgment.has(s.id),
                getActiveSection,
                dfid,
                sectionId: s.id,
                // Bug #316 item 3: the staged row's per-region source-sheet anchors,
                // so each section's "In sheet" heading link opens at its cell range.
                sourceAnchors: data.sourceAnchors ?? {},
                // spec §8/§9a: staged use-raw decisions + session so the §E3
                // judgment callout can render the per-warning use-raw toggle.
                useRawDecisions: data.useRawDecisions,
                // wizardSessionId is staged-only (spec §3.2); present in staged
                // mode (byte-identical to the modal), ABSENT in published
                // (exactOptional discipline: absent, never undefined).
                ...(isStaged(data) ? { wizardSessionId: data.wizardSessionId } : {}),
                // §E3: callout entries for every flagged section EXCEPT
                // `warnings` (its body IS the warning list — circular).
                // exactOptional discipline: ABSENT, never undefined.
                ...(s.id !== "warnings" && bySection.has(s.id)
                  ? { calloutEntries: bySection.get(s.id)!, onJumpToWarning: jumpToWarning }
                  : {}),
              }}
            >
              {s.render(data)}
            </Step3SectionChromeContext.Provider>
            {/* Phase 2 hook: per-section warning controls under the panel.
                Phase 1 passes no `renderSectionExtras` → renders nothing. */}
            {renderSectionExtras?.(s.id, data)}
          </section>
        ))}
        {/* Shell-owned BOTTOM slot (spec §5.3a): the modal passes
            RawUnrecognizedCallout — content the parser captured but couldn't
            understand. Renders after the registry sections, before
            extraSectionsAfter. Nothing when the shell passes none. */}
        {bottomSlot}
        {/* Extra rail sections mounted after the registry (Phase 2: Changes).
            Phase 1 (the modal) passes none → renders nothing. */}
        {extraSectionsAfter?.map((extra) => (
          <Fragment key={extra.id}>{extra.render()}</Fragment>
        ))}
      </div>
    </div>
  );
}
