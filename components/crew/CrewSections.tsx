"use client";

/**
 * components/crew/CrewSections.tsx: the crew page's section controller (crew
 * page redesign spec §3, §5.2, §5.3).
 *
 * Two layouts from ONE set of server-rendered bodies (`sectionNodes`):
 *   - compact, below 1024px: the home (the Today block: day row, pass, run of
 *     show, then the home body of quick facts, show notes and the Dress code
 *     card; then the "All sections" card) with any section in a bottom sheet
 *     (`CrewSectionSheet`);
 *   - wide, 1024px and up: a left nav ("Today" then the sections) beside one
 *     column, the Today block first (the home body beside the day row, pass
 *     and run of show) and every section stacked under it.
 * The server cannot know the viewport, so its render carries both, and CSS
 * shows the right one at the breakpoint until hydration resolves the mode
 * (`matchMedia("(min-width: 1024px)")`, compact when `matchMedia` is missing);
 * from then on only the live layout is mounted. No body is ever in the DOM
 * twice: in the server render an open section's body sits in the sheet only,
 * and its slot in the wide stack is filled after hydration, which is also when
 * a wide deep link scrolls to it.
 *
 * Every element that bounds a section body is a size container (`@container`):
 * each wide stacked section and the sheet body. A body's grids switch on that
 * container's width (`@min-crew-split:`, the `--container-crew-split` token in
 * app/globals.css), never the viewport, so one body is single column in the
 * 480px sheet and two columns in the wide column at the same 1000px window. The
 * Today block is not one: its home body reads no container query (plan Task 11).
 *
 * FRESHNESS INVARIANT (NON-NEGOTIABLE): the controller chooses where a body
 * shows, never what it holds. It never fetches, derives or caches section data;
 * `ShowRealtimeBridge → router.refresh()` re-renders `_CrewShell`, every body
 * arrives fresh in `sectionNodes`, and this component stays mounted so an open
 * sheet stays open.
 *
 * NO ROUTER. Opening, switching and closing are history calls, the mechanism
 * the 2026-10-26 spike ratified (spec §5.2):
 *   - open from home: `pushState(url with s, { ...history.state, crewSheet: true })`;
 *   - open another while one is open: `replaceState(url with the new s, history.state)`,
 *     the body scroller back at the top;
 *   - every close (button, scrim, Esc, swipe): `history.back()` when the entry
 *     carries the `crewSheet` marker, so the `popstate` that follows closes it;
 *     otherwise (a deep link) `replaceState(url without s, state without the marker)`;
 *   - `popstate`: an entry without `s` closes, an entitled `s` opens, any other
 *     `s` is replaced away and closes.
 * Wide mode never pushes: a nav click smooth-scrolls (instant under reduced
 * motion), focuses the section heading and `replaceState`s `s`; Back and
 * Forward only scroll; the scroll-spy (the shared `activeSectionFor` rule,
 * held still during a nav-click glide) never writes the URL.
 *
 * Every history write leaves Next's own keys out of the state it passes, so
 * Next's patched `pushState`/`replaceState` copy them back AND move the
 * router's URL with it (node_modules/next/dist/client/components/app-router.js,
 * the `__NA` bypass). Passing them through would hide the write from the
 * router, and the next `router.refresh()` would replace the entry with the URL
 * the router last knew, dropping `s`. A refresh also replaces the entry's state
 * with Next's alone, so the controller puts the sheet marker back on the entry
 * it pushed.
 *
 * Compound transitions (spec §7):
 *   - into wide (rotation, resize): the sheet unmounts in the same commit, with
 *     no exit slide and any dialog open inside it, which ends a drag in
 *     progress (its listeners and pointer capture go with the panel); the page
 *     lands on the open section; the URL keeps `s` and the entry its marker;
 *   - back into compact: the home at the top, no sheet, and
 *     `replaceState(url without s, state without the marker)`;
 *   - a refresh never closes the sheet while the open section still has a body
 *     (its fresh, empty or degraded state); when the viewer lost the
 *     entitlement to it, the server built no body, so the sheet closes to home
 *     through the close rows above, without its exit slide (§5.2 amendment
 *     2026-10-27), and nothing of the old body stays on the page;
 *   - a refresh that removes the selected day returns the day row to `live`
 *     (`daySelection.tsx`).
 *
 * Links: a click on any same-page link carrying an entitled `s` (an "All
 * sections" row, a nav item, a section link inside a body) is intercepted here
 * and routed through the rules above. Rows and nav items are real hrefs, so a
 * tap before hydration or "open in new tab" reaches the server-rendered sheet.
 *
 * SEARCH (crew show search spec §6.2, §6.6, §9.1; redesign spec §1.2). Under a
 * `CrewSearchProvider`, an active search hides the wide nav and the page body
 * with `hidden` (so open disclosures survive) and renders the search panel in
 * their place. `useSectionController()` (components/crew/sectionController.ts,
 * provided here) exposes `openSectionAndReveal(sectionId, targetId)`, the one
 * entry point search calls: compact opens the section's sheet (Today closes
 * it) and centres the `[data-search-target]` line inside the sheet body; wide
 * scrolls the page to the line with the section's scroll margin. Both then
 * wait for the line to mount (up to `REVEAL_WAIT_MS`), open every `<details>`
 * around and inside it, focus it and mark it `data-search-reveal` for the
 * highlight in app/globals.css, cleared after `REVEAL_HIGHLIGHT_MS`. A line that
 * never mounts is announced in a polite status region, and focus that fell to
 * the page moves to the opened section's body.
 *
 * Readiness: `data-crew-controller-ready="true"` appears with the first client
 * layout, after hydration (e2e harness readiness gate).
 */

import { usePathname, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { CrewAllSections } from "@/components/crew/CrewAllSections";
import { CrewDayRow } from "@/components/crew/CrewDayRow";
import { CrewPass } from "@/components/crew/CrewPass";
import { CrewRunOfShowCard } from "@/components/crew/CrewRunOfShowCard";
import { DaySelectionProvider, type DaySelectionApi } from "@/components/crew/daySelection";
import { CrewClockProvider } from "@/components/crew/useCrewClock";
import { CrewSectionSheet } from "@/components/crew/CrewSectionSheet";
import { CrewWideNav, type CrewWideNavItem } from "@/components/crew/CrewWideNav";
import {
  SectionControllerContext,
  type SectionController,
} from "@/components/crew/sectionController";
import { CrewSearchHint } from "@/components/crew/search/CrewSearchField";
import { CrewSearchResults } from "@/components/crew/search/CrewSearchResults";
import { useOptionalCrewSearch } from "@/components/crew/search/CrewSearchProvider";
import { usePrefersReducedMotion } from "@/lib/a11y/usePrefersReducedMotion";
import {
  CREW_SECTION_LABELS,
  CREW_TODAY_LABEL,
  type CrewSectionEntry,
  type CrewSectionId,
} from "@/lib/crew/crewSections";
import { CREW_PAGE_CONTAINER } from "@/lib/crew/pageContainer";
import type { DayRowProps, PassProps } from "@/lib/crew/passModel";
import type { SectionId } from "@/lib/crew/resolveActiveSection";
import type { RunCardProps } from "@/lib/crew/runOfShowCard";
import { buildHomeHref, buildSectionHref } from "@/lib/crew/sectionHref";
import { cn } from "@/lib/ui/cn";
import {
  activeSectionFor,
  NAV_SCROLL_SETTLE_EPSILON_PX,
  NAV_SCROLL_SETTLE_TIMEOUT_MS,
} from "@/lib/ui/scrollSpy";

export { useSectionController, type SectionController } from "@/components/crew/sectionController";

export interface CrewSectionsProps {
  /** The server-resolved `?s=` (`today` means home, no sheet). */
  initialSection: SectionId;
  /** The viewer's sections in nav order, with peeks (`crewSectionEntries`). */
  sections: readonly CrewSectionEntry[];
  /** Every body the shell rendered: `today` plus one per listed section. */
  sectionNodes: Partial<Record<SectionId, ReactNode>>;
  /** Rendered at the top of the page column, above the Today block. */
  children?: ReactNode;
  /**
   * The day row's server-built props (`buildDayRowProps`), or null when the row
   * is hidden (spec §4.2). It mounts atop the Today block in both modes, and
   * the selected day it writes is provided to the whole page (`daySelection`).
   */
  dayRow?: DayRowProps | null;
  /**
   * The pass's server-built props (`buildPassProps`), or null when the shell
   * could not build them (a projection with no dates at all). It mounts under
   * the day row, above the Today body, in both modes (spec §3.2, §4.3).
   */
  pass?: PassProps | null;
  /**
   * The run-of-show card's server-built props (`buildRunCardProps`), or null
   * when no day of the viewer's has rows. It mounts under the pass, above the
   * Today body, in both modes (spec §3.1, §4.4); the card itself renders nothing
   * on a selected day without rows.
   */
  runCard?: RunCardProps | null;
  /**
   * The server's request time (epoch ms, the shell's `await nowDate()`). It
   * seeds the shared crew clock so the server render and hydration agree on
   * `now` (components/crew/useCrewClock.ts).
   */
  initialNow?: number | null;
}

type Mode = "ssr" | "compact" | "wide";

const WIDE_QUERY = "(min-width: 1024px)";
/** How long a reveal waits for its target to mount before giving up (search spec §6.6). */
const REVEAL_WAIT_MS = 1500;
/** The highlight's fade; the `[data-search-reveal]` keyframe in app/globals.css runs 1600ms. */
const REVEAL_HIGHLIGHT_MS = 1600;
/** Under reduced motion the tint holds without fading for this long, then goes at once. */
const REVEAL_HIGHLIGHT_REDUCED_MS = 2000;
// not-subject:M5-D8: a polite status announcement for a search result whose line
// changed under it, not an error path and carries no code; the copy is pinned in
// the search spec §10 and asserted literally in CrewSections.search.test.tsx.
const REVEAL_GONE_MESSAGE = "That line isn't on the page anymore.";

function subscribeMode(onChange: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => {};
  const mq = window.matchMedia(WIDE_QUERY);
  if (typeof mq.addEventListener === "function") {
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }
  mq.addListener(onChange);
  return () => mq.removeListener(onChange);
}

function clientMode(): Mode {
  if (typeof window.matchMedia !== "function") return "compact";
  return window.matchMedia(WIDE_QUERY).matches ? "wide" : "compact";
}

function serverMode(): Mode {
  return "ssr";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Next's own history keys: its patched history methods skip any state that carries one. */
const NEXT_HISTORY_KEYS = ["__NA", "_N", "__PRIVATE_NEXTJS_INTERNALS_TREE"] as const;

/**
 * The state to hand `pushState` / `replaceState`: the entry's own keys without
 * Next's, so Next copies its keys back and moves the router's URL with the
 * write (see the header). `null` stays `null`.
 */
function forHistory(state: unknown): Record<string, unknown> | null {
  if (!isRecord(state)) return null;
  const rest: Record<string, unknown> = { ...state };
  for (const key of NEXT_HISTORY_KEYS) delete rest[key];
  return rest;
}

/** The history state without the sheet marker. */
function withoutMarker(state: unknown): Record<string, unknown> | null {
  const rest = forHistory(state);
  if (rest === null) return null;
  delete rest["crewSheet"];
  return rest;
}

/** True when the current history entry carries the sheet marker. */
function entryHasMarker(): boolean {
  const state: unknown = window.history.state;
  return isRecord(state) && state.crewSheet === true;
}

/** Document-relative scroll target for a stacked section: its top less its scroll margin. */
function scrollTargetFor(el: Element): number {
  const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
  return el.getBoundingClientRect().top + window.scrollY - margin;
}

/** The target with this exact id inside `root`; compared as a string, so no selector escaping. */
function findTarget(root: HTMLElement | null, targetId: string): HTMLElement | null {
  if (root === null) return null;
  for (const el of root.querySelectorAll<HTMLElement>("[data-search-target]")) {
    if (el.getAttribute("data-search-target") === targetId) return el;
  }
  return null;
}

/** Open every `<details>` that contains `el` (itself included) and every one inside it. */
function openDisclosures(el: HTMLElement): void {
  for (let d = el.closest("details"); d !== null; d = d.parentElement?.closest("details") ?? null) {
    d.open = true;
  }
  for (const d of el.querySelectorAll("details")) d.open = true;
}

/**
 * After a reveal finds nothing, give focus a place in the opened section when it
 * fell to the page, which it does because the tapped row went with the search
 * panel (search spec §6.8). Focus the viewer has moved somewhere else stays there.
 */
function focusBodyIfFocusFell(body: HTMLElement | null): void {
  if (body === null || body.closest("[hidden]") !== null) return;
  const current = document.activeElement;
  if (current !== null && current !== document.body && current.isConnected) return;
  if (!body.hasAttribute("tabindex")) body.setAttribute("tabindex", "-1");
  body.focus({ preventScroll: true });
}

/**
 * The wide Today block when the viewer has no run of show (critique F7, spec
 * §3.2 amendment 2026-10-30). Two columns otherwise put the day row and pass
 * beside the whole home body, and with no run card under the pass the lead
 * column ended there while the quick facts and the show notes ran on beside
 * it: a blank quadrant next to the page's most important card. Here the block
 * is a two-column grid instead, the home body's root `display: contents` so its
 * cards are grid items: the quick facts sit beside the pass, and the show notes,
 * the Dress code card and an admin fetch-failure block each span both columns
 * under that row. Moving the notes under the pass alone only moved the hole
 * under the quick facts (measured at 1280: a 533px column of air beside the
 * notes); spanning leaves no column of air at all. Dense flow keeps the pass and
 * the quick facts on the first row whatever renders after them. Only while the
 * block holds quick facts: without them the notes are the right column's only
 * content and the two-column flex layout below already places them there. Every
 * rule reads the server render's own nodes, so nothing a body holds changes.
 */
const TODAY_PACKED = cn(
  "lg:has-data-[testid=crew-quick-facts]:grid",
  "lg:has-data-[testid=crew-quick-facts]:grid-cols-2",
  "lg:has-data-[testid=crew-quick-facts]:grid-flow-row-dense",
  "lg:has-data-[testid=crew-quick-facts]:gap-y-4",
  "lg:has-data-[testid=crew-quick-facts]:*:data-[testid=section-today]:contents",
  "lg:has-data-[testid=crew-quick-facts]:*:data-[testid=crew-today-lead]:col-start-1",
  // The lead's last margin spaced it from the home body; the row gap does here.
  "lg:has-data-[testid=crew-quick-facts]:[&>[data-testid=crew-today-lead]>:last-child]:mb-0",
  "lg:has-data-[testid=crew-quick-facts]:[&>[data-testid=section-today]>[data-testid=crew-quick-facts]]:col-start-2",
  "lg:has-data-[testid=crew-quick-facts]:[&>[data-testid=section-today]>[data-card-id]]:col-span-2",
  "lg:has-data-[testid=crew-quick-facts]:[&>[data-testid=section-today]>[data-testid^=section-tile-error]]:col-span-2",
);

type RevealRun = { frame: number; deadline: number };

/** A viewport crossing the controller still has to act on (spec §7 compound rows). */
type Crossing = { to: "wide"; section: CrewSectionId | null } | { to: "compact" };

export function CrewSections({
  initialSection,
  sections,
  sectionNodes,
  children,
  dayRow = null,
  pass = null,
  runCard = null,
  initialNow = null,
}: CrewSectionsProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const mode = useSyncExternalStore(subscribeMode, clientMode, serverMode);
  const reduced = usePrefersReducedMotion() === true;

  const entitled = useMemo(() => new Set<string>(sections.map((s) => s.id)), [sections]);
  const toOpen = useCallback(
    (id: SectionId | string | null | undefined): CrewSectionId | null =>
      id && id !== "today" && entitled.has(id) ? (id as CrewSectionId) : null,
    [entitled],
  );

  const [openId, setOpenId] = useState<CrewSectionId | null>(() => toOpen(initialSection));
  // A server navigation to a new `?s=` re-renders the shell with a new
  // `initialSection` while this component stays mounted: follow it (the
  // React "adjust state when a prop changes" pattern, not an effect).
  const [syncedInitial, setSyncedInitial] = useState<SectionId>(initialSection);
  if (initialSection !== syncedInitial) {
    setSyncedInitial(initialSection);
    setOpenId(toOpen(initialSection));
  }

  // A refresh never closes the sheet while the open section still has a body:
  // a section that left the list stays open on its fresh state (spec §5.2). The
  // server builds no body for a section the viewer lost the entitlement to see
  // (PR A: Budget once `financialsVisible` turns false), so that sheet closes
  // to home, in the commit that brought the refresh: `dismissals` remounts the
  // sheet's presence so no exit slide holds the old body on the page, and
  // `lostCloses` runs the close's history call after the commit.
  const [dismissals, setDismissals] = useState(0);
  const [lostCloses, setLostCloses] = useState(0);
  if (openId !== null && !Object.hasOwn(sectionNodes, openId)) {
    setOpenId(null);
    setDismissals((n) => n + 1);
    setLostCloses((n) => n + 1);
  }

  // Viewport crossings (spec §7): leaving wide closes nothing that is open and
  // opens nothing (the home, at the top); the sheet itself leaves wide by
  // unmounting (`showCompact` below). Adjusted during render, so no commit ever
  // mounts a sheet on the way into compact; the history and scroll half runs in
  // the effect that reads `crossing`.
  // Starts at "ssr" even when this mounts without hydrating (a client
  // navigation into the page reads the live mode on its first render), so the
  // first client layout always counts as arriving in its mode.
  const [seenMode, setSeenMode] = useState<Mode>("ssr");
  const [crossing, setCrossing] = useState<Crossing | null>(null);
  if (mode !== seenMode) {
    setSeenMode(mode);
    if (mode === "wide") {
      // Hydrating into wide (a deep link) or crossing into it with a sheet up.
      setCrossing({ to: "wide", section: openId });
    } else if (mode === "compact" && seenMode === "wide") {
      setOpenId(null);
      setCrossing({ to: "compact" });
    }
  }

  const open = openId !== null && Object.hasOwn(sectionNodes, openId) ? openId : null;
  const openEntry =
    open === null
      ? null
      : (sections.find((s) => s.id === open) ?? { id: open, label: CREW_SECTION_LABELS[open] });

  const sheetBodyRef = useRef<HTMLDivElement | null>(null);
  const allSectionsRef = useRef<HTMLDivElement | null>(null);
  const todayRef = useRef<HTMLElement | null>(null);
  const stackRefs = useRef(new Map<CrewSectionId, HTMLElement>());

  // ── Wide: scroll-spy, held still while a nav-click glide runs ──────────────
  const [spyActive, setSpyActive] = useState<SectionId>("today");
  const suppressedRef = useRef(false);
  const targetTopRef = useRef<number | null>(null);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const releaseSuppression = useCallback(() => {
    suppressedRef.current = false;
    targetTopRef.current = null;
    if (settleTimerRef.current !== null) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
  }, []);

  const beginSuppressedScroll = useCallback(
    (targetTop: number) => {
      const max = Math.max(
        0,
        document.documentElement.scrollHeight - document.documentElement.clientHeight,
      );
      const clamped = Math.min(Math.max(0, targetTop), max);
      if (Math.abs(window.scrollY - clamped) <= NAV_SCROLL_SETTLE_EPSILON_PX) {
        releaseSuppression();
        return;
      }
      suppressedRef.current = true;
      targetTopRef.current = clamped;
      if (settleTimerRef.current !== null) clearTimeout(settleTimerRef.current);
      settleTimerRef.current = setTimeout(releaseSuppression, NAV_SCROLL_SETTLE_TIMEOUT_MS);
    },
    [releaseSuppression],
  );

  // Each section is read where a nav jump lands it, its top less its scroll
  // margin: the sticky header covers the margin, so the spy's line is measured
  // from the header's bottom edge (spec §8 item 6), and a jumped-to section is
  // the active one.
  const spyItems = useCallback((): Array<{ id: string; top: number }> => {
    const tops: Array<{ id: string; top: number }> = [];
    const today = todayRef.current;
    if (today) tops.push({ id: "today", top: scrollTargetFor(today) });
    for (const s of sections) {
      const el = stackRefs.current.get(s.id);
      if (el) tops.push({ id: s.id, top: scrollTargetFor(el) });
    }
    return tops;
  }, [sections]);

  useEffect(() => {
    if (mode !== "wide") return;
    let raf: number | null = null;
    function evaluate() {
      raf = null;
      const doc = document.documentElement;
      if (doc.scrollHeight === 0) return; // unmeasured (no layout yet)
      const tops = spyItems();
      if (tops.length === 0) return;
      const at = (top: number) =>
        activeSectionFor(
          top,
          document.documentElement.clientHeight,
          doc.scrollHeight,
          tops,
        ) as SectionId;
      if (suppressedRef.current) {
        const target = targetTopRef.current;
        const settled =
          target !== null && Math.abs(window.scrollY - target) <= NAV_SCROLL_SETTLE_EPSILON_PX;
        const arrived = target === null || at(window.scrollY) === at(target);
        if (!(settled && arrived)) {
          // A glide still in flight pushes the fallback release back out.
          if (settleTimerRef.current !== null) clearTimeout(settleTimerRef.current);
          settleTimerRef.current = setTimeout(releaseSuppression, NAV_SCROLL_SETTLE_TIMEOUT_MS);
          return;
        }
        releaseSuppression();
      }
      setSpyActive(at(window.scrollY));
    }
    function onScroll() {
      if (raf === null) raf = requestAnimationFrame(evaluate);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    // Manual input ends the hold at once, so the spy follows the user.
    for (const type of ["wheel", "touchstart", "keydown"] as const) {
      window.addEventListener(type, releaseSuppression, { passive: true });
    }
    evaluate();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      for (const type of ["wheel", "touchstart", "keydown"] as const) {
        window.removeEventListener(type, releaseSuppression);
      }
      releaseSuppression();
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, [mode, spyItems, releaseSuppression]);

  /** Wide: scroll the window to a section (or the top for Today). */
  const scrollWide = useCallback(
    (id: SectionId, { focus }: { focus: boolean }) => {
      const el = id === "today" ? null : (stackRefs.current.get(id as CrewSectionId) ?? null);
      const top = el ? scrollTargetFor(el) : 0;
      setSpyActive(el || id === "today" ? id : "today");
      beginSuppressedScroll(top);
      window.scrollTo({ top, behavior: reduced ? "auto" : "smooth" });
      if (focus) {
        // Today has no visible heading (its `h2` is visually hidden, and a ring
        // on a 1px clipped box is no ring at all, audit P2-6), so the block it
        // names takes focus: the ring then outlines what the jump landed on.
        const target = id === "today" ? todayRef.current : el?.querySelector<HTMLElement>("h2");
        target?.focus({ preventScroll: true });
      }
    },
    [beginSuppressedScroll, reduced],
  );

  // Whether the current history entry is the one this controller pushed the
  // sheet onto (its marker set). A refresh replaces the entry's state with
  // Next's alone; the effect after every commit below puts the marker back.
  const markedRef = useRef(false);
  // A reload keeps an entry's state (browsers preserve it), so a sheet rendered
  // open on a reloaded pushed entry starts out marked.
  useEffect(() => {
    markedRef.current = entryHasMarker();
  }, []);

  // The history and scroll half of a viewport crossing (spec §7):
  //   - into wide, from a deep link's hydration or from compact with a sheet
  //     up: land on that section at once (the sheet already left without its
  //     exit slide), the URL and the entry's marker untouched;
  //   - into compact: the home at the top, `s` and the marker replaced away.
  useEffect(() => {
    if (crossing === null) return;
    if (crossing.to === "wide") {
      const el = crossing.section ? stackRefs.current.get(crossing.section) : undefined;
      if (!crossing.section || !el) return;
      const top = scrollTargetFor(el);
      setSpyActive(crossing.section);
      beginSuppressedScroll(top);
      window.scrollTo({ top, behavior: "auto" });
      return;
    }
    markedRef.current = false;
    window.history.replaceState(
      withoutMarker(window.history.state),
      "",
      buildHomeHref(pathname, new URLSearchParams(window.location.search)),
    );
    window.scrollTo({ top: 0, behavior: "auto" });
    // Runs once per crossing: the other inputs are read as they stand then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crossing]);

  // ── Opening and closing ────────────────────────────────────────────────────
  const openSection = useCallback(
    (id: CrewSectionId) => {
      const href = buildSectionHref(pathname, searchParams, id);
      if (mode === "wide") {
        window.history.replaceState(forHistory(window.history.state), "", href);
        scrollWide(id, { focus: true });
        return;
      }
      if (open === id) return;
      if (open === null) {
        window.history.pushState(
          { ...forHistory(window.history.state), crewSheet: true },
          "",
          href,
        );
        markedRef.current = true;
      } else {
        window.history.replaceState(forHistory(window.history.state), "", href);
        if (sheetBodyRef.current) sheetBodyRef.current.scrollTop = 0;
      }
      setOpenId(id);
    },
    [mode, open, pathname, searchParams, scrollWide],
  );

  /**
   * The close rows' history call (spec §5.2): back over the marker, else replace
   * `s` away. The marker is the entry's, or this controller's record of having
   * pushed it: a refresh's own history write drops the entry's copy before the
   * effects of its commit run, which is when a lost entitlement closes.
   */
  const closeEntry = useCallback((): "back" | "replaced" => {
    if (markedRef.current || entryHasMarker()) {
      window.history.back(); // the popstate that follows closes the sheet
      return "back";
    }
    markedRef.current = false;
    window.history.replaceState(
      withoutMarker(window.history.state),
      "",
      buildHomeHref(pathname, new URLSearchParams(window.location.search)),
    );
    return "replaced";
  }, [pathname]);

  const requestClose = useCallback(() => {
    if (closeEntry() === "replaced") setOpenId(null);
  }, [closeEntry]);

  // A sheet with no opener to go back to (a deep link) returns focus to the
  // "All sections" row that opens the same section (audit P2-5).
  const sheetFallbackFocus = useCallback((id: CrewSectionId): HTMLElement | null => {
    for (const el of allSectionsRef.current?.querySelectorAll<HTMLElement>("[data-section]") ??
      []) {
      if (el.getAttribute("data-section") === id) return el;
    }
    return null;
  }, []);

  // A lost entitlement already closed the sheet, during render; its history
  // call follows here, in compact only (wide shows no sheet to close).
  useEffect(() => {
    if (lostCloses === 0 || mode !== "compact") return;
    closeEntry();
    // Once per lost entitlement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lostCloses]);

  // After every commit: a refresh replaced the entry the sheet was pushed onto
  // with Next's own state, dropping the marker. Put it back, so the sheet's
  // close still goes back to the entry beneath (spec §5.2, §10).
  useEffect(() => {
    if (!markedRef.current || open === null || entryHasMarker()) return;
    window.history.replaceState({ ...forHistory(window.history.state), crewSheet: true }, "");
  });

  const goHome = useCallback(() => {
    if (mode === "wide") {
      window.history.replaceState(
        forHistory(window.history.state),
        "",
        buildHomeHref(pathname, searchParams),
      );
      scrollWide("today", { focus: true });
      return;
    }
    if (open !== null) requestClose();
  }, [mode, open, pathname, searchParams, requestClose, scrollWide]);

  useEffect(() => {
    function onPopState() {
      const raw = new URLSearchParams(window.location.search).get("s");
      const id = toOpen(raw);
      markedRef.current = entryHasMarker();
      if (raw !== null && raw !== "today" && id === null) {
        // Unknown or not entitled: drop it, as the server resolves it to home.
        window.history.replaceState(
          forHistory(window.history.state),
          "",
          buildHomeHref(pathname, new URLSearchParams(window.location.search)),
        );
      }
      setOpenId(id);
      // A frame later: the browser restores the entry's saved scroll position as
      // part of the traversal, and that would land on top of a scroll started now.
      if (mode === "wide") requestAnimationFrame(() => scrollWide(id ?? "today", { focus: false }));
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [mode, pathname, toOpen, scrollWide]);

  const onClickCapture = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest?.("a[href]");
      if (!(link instanceof HTMLAnchorElement)) return;
      if ((link.target && link.target !== "_self") || link.hasAttribute("download")) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname !== window.location.pathname) {
        return;
      }
      const raw = url.searchParams.get("s");
      if (raw === "today" || (raw === null && link.hasAttribute("data-crew-home-link"))) {
        event.preventDefault();
        goHome();
        return;
      }
      const id = toOpen(raw);
      if (id === null) return; // not a section this viewer opens: let the server resolve it
      event.preventDefault();
      openSection(id);
    },
    [goHome, openSection, toOpen],
  );

  // ── openSectionAndReveal (search's entry point, search spec §6.6) ──────────
  const revealRun = useRef<RevealRun | null>(null);
  // The day selection's API, from the provider rendered below this component.
  const daySelection = useRef<DaySelectionApi | null>(null);
  const highlight = useRef<{ el: HTMLElement; timer: number } | null>(null);
  const [revealStatus, setRevealStatus] = useState("");

  const stopWaiting = useCallback(() => {
    const run = revealRun.current;
    if (run === null) return;
    window.cancelAnimationFrame(run.frame);
    window.clearTimeout(run.deadline);
    revealRun.current = null;
  }, []);

  const clearHighlight = useCallback(() => {
    const current = highlight.current;
    if (current === null) return;
    window.clearTimeout(current.timer);
    current.el.removeAttribute("data-search-reveal");
    highlight.current = null;
  }, []);

  useEffect(
    () => () => {
      stopWaiting();
      clearHighlight();
    },
    [stopWaiting, clearHighlight],
  );

  const openSectionAndReveal = useCallback(
    (sectionId: SectionId, targetId: string) => {
      stopWaiting();
      setRevealStatus("");
      const id = toOpen(sectionId);
      if (sectionId !== "today" && id === null) return;
      // A run-of-show line is indexed for the server's day only: the card carries
      // search targets on that day alone, while it shows the selected day, or in
      // live the device's day. Select the line's day first, so the line is on the
      // page when the look below runs (whole-diff review R1-F1).
      if (sectionId === "today") {
        const lineDay = runCard?.days.find((d) => d.targets?.includes(targetId));
        if (lineDay !== undefined) daySelection.current?.selectDay(lineDay.iso);
      }
      const wide = mode === "wide";
      const inSheet = !wide && id !== null;
      if (id !== null) {
        if (wide) {
          window.history.replaceState(
            forHistory(window.history.state),
            "",
            buildSectionHref(pathname, searchParams, id),
          );
        } else {
          openSection(id);
        }
      } else if (!wide && open !== null) {
        requestClose();
      }
      // Where the line lives: the sheet body (compact), the stacked section
      // (wide), or the Today block. Read each frame: the sheet body mounts with
      // the open that was just requested.
      const scopeOf = (): HTMLElement | null =>
        inSheet
          ? sheetBodyRef.current
          : id !== null
            ? (stackRefs.current.get(id) ?? null)
            : todayRef.current;

      const reveal = (target: HTMLElement) => {
        clearHighlight();
        openDisclosures(target);
        const body = sheetBodyRef.current;
        if (inSheet && body) {
          // Centred inside the sheet body; the page behind is locked (spec §5.2).
          const t = target.getBoundingClientRect();
          const b = body.getBoundingClientRect();
          body.scrollTop = body.scrollTop + (t.top - b.top) - (body.clientHeight - t.height) / 2;
        } else {
          // The page, to the line, with its section's scroll margin (spec §5.3).
          const section = scopeOf();
          const margin = section ? parseFloat(getComputedStyle(section).scrollMarginTop) || 0 : 0;
          const top = target.getBoundingClientRect().top + window.scrollY - margin;
          setSpyActive(id ?? "today");
          beginSuppressedScroll(top);
          window.scrollTo({ top, behavior: reduced ? "auto" : "smooth" });
        }
        // A line that is not focusable on its own takes focus without joining the
        // tab order; a button or link keeps its own.
        if (target.tabIndex < 0 && !target.hasAttribute("tabindex")) {
          target.setAttribute("tabindex", "-1");
        }
        target.focus({ preventScroll: true });
        target.setAttribute("data-search-reveal", "");
        // Two calls rather than one with a computed delay, so each delay is a named
        // constant the DESIGN.md §5.5 timing scan resolves.
        const timer = reduced
          ? window.setTimeout(clearHighlight, REVEAL_HIGHLIGHT_REDUCED_MS)
          : window.setTimeout(clearHighlight, REVEAL_HIGHLIGHT_MS);
        highlight.current = { el: target, timer };
      };

      const run: RevealRun = { frame: 0, deadline: 0 };
      const look = () => {
        const target = findTarget(scopeOf(), targetId);
        // A line still under the search panel's `hidden` is not laid out yet.
        if (target === null || target.closest("[hidden]") !== null) {
          run.frame = window.requestAnimationFrame(look);
          return;
        }
        stopWaiting();
        reveal(target);
      };
      run.deadline = window.setTimeout(() => {
        stopWaiting();
        setRevealStatus(REVEAL_GONE_MESSAGE);
        // The section stays open at its top (search spec §6.6): the sheet opened
        // there; the wide page goes to the section.
        if (wide) scrollWide(id ?? "today", { focus: false });
        focusBodyIfFocusFell(scopeOf());
      }, REVEAL_WAIT_MS);
      run.frame = window.requestAnimationFrame(look);
      revealRun.current = run;
    },
    [
      beginSuppressedScroll,
      clearHighlight,
      mode,
      open,
      openSection,
      pathname,
      reduced,
      requestClose,
      runCard,
      scrollWide,
      searchParams,
      stopWaiting,
      toOpen,
    ],
  );

  const api = useMemo<SectionController>(() => ({ openSectionAndReveal }), [openSectionAndReveal]);

  const search = useOptionalCrewSearch();
  const searchActive = search?.active ?? false;

  const navItems: CrewWideNavItem[] = useMemo(
    () => [
      { id: "today", label: CREW_TODAY_LABEL },
      ...sections.map(({ id, label }) => ({ id, label })),
    ],
    [sections],
  );
  const hrefFor = useCallback(
    (id: SectionId) =>
      id === "today"
        ? buildHomeHref(pathname, searchParams)
        : buildSectionHref(pathname, searchParams, id),
    [pathname, searchParams],
  );

  const dayIsos = useMemo(() => dayRow?.days.map((d) => d.iso) ?? [], [dayRow]);

  const showCompact = mode !== "wide";
  const showWide = mode !== "compact";
  const hasSections = sections.length > 0;

  return (
    <SectionControllerContext.Provider value={api}>
      <CrewClockProvider initialNow={initialNow}>
        <DaySelectionProvider days={dayIsos} apiRef={daySelection}>
          <div
            data-testid="crew-shell-sections"
            data-crew-controller-ready={mode === "ssr" ? undefined : "true"}
            data-crew-mode={mode === "ssr" ? undefined : mode}
            className="flex flex-1 flex-col"
            onClickCapture={onClickCapture}
          >
            <div className={cn(CREW_PAGE_CONTAINER, "flex flex-1 items-stretch lg:gap-8")}>
              {showWide && hasSections ? (
                <CrewWideNav
                  items={navItems}
                  active={spyActive}
                  hrefFor={hrefFor}
                  hidden={searchActive}
                />
              ) : null}
              {/* Hidden, never unmounted, while search is active: section state survives. */}
              <main
                data-testid="page-container"
                hidden={searchActive}
                className="flex min-w-0 flex-1 flex-col gap-section-gap pt-6 pb-8 sm:pt-8"
              >
                {children}
                <section
                  ref={todayRef}
                  data-testid="crew-today-block"
                  aria-labelledby="crew-today-heading"
                  // The wide nav's Today jump focuses the block (see scrollWide).
                  tabIndex={-1}
                  // Compact: one column, the home body under the run card.
                  // Wide: two columns, the day row, pass and run card beside the
                  // home body (quick facts, show notes, Dress code card), each
                  // `flex-1` so a column that renders nothing (`empty:hidden`)
                  // leaves the other the full width; with no run of show, the
                  // packed grid of `TODAY_PACKED` instead. Not a size container:
                  // the home body reads no container query, and containment would
                  // make this block the containing block of the fixed copy toast.
                  // Its scroll margin is the one every reveal into it reads, so a
                  // revealed line and its ring land clear of the sticky chrome
                  // (UI-gate re-run, audit P1-1).
                  className={cn(
                    "flex scroll-mt-(--crew-scroll-clearance) flex-col lg:flex-row lg:items-start lg:gap-6",
                    runCard === null && TODAY_PACKED,
                  )}
                >
                  <h2 id="crew-today-heading" className="sr-only">
                    {CREW_TODAY_LABEL}
                  </h2>
                  {/* The day row atop the Today block in both modes, then the pass
                  and the run-of-show card under it, then the home body (spec
                  §3.2, §4.2 to §4.6). */}
                  <div
                    data-testid="crew-today-lead"
                    className="flex min-w-0 flex-col empty:hidden lg:flex-1"
                  >
                    {dayRow ? (
                      <div className="mb-4">
                        <CrewDayRow {...dayRow} />
                      </div>
                    ) : null}
                    {pass ? (
                      <div className="mb-4">
                        <CrewPass {...pass} />
                      </div>
                    ) : null}
                    {runCard ? <CrewRunOfShowCard {...runCard} /> : null}
                  </div>
                  {sectionNodes.today}
                </section>
                {showCompact && hasSections ? (
                  <div ref={allSectionsRef} className="lg:hidden">
                    <CrewAllSections sections={sections} hrefFor={hrefFor} />
                  </div>
                ) : null}
                {showWide && hasSections ? (
                  <div
                    data-testid="crew-wide-stack"
                    className="hidden flex-col gap-section-gap lg:flex"
                  >
                    {sections.map((s) => (
                      <section
                        key={s.id}
                        ref={(el) => {
                          if (el) stackRefs.current.set(s.id, el);
                          else stackRefs.current.delete(s.id);
                        }}
                        id={`crew-section-${s.id}`}
                        data-testid="crew-wide-section"
                        data-section={s.id}
                        aria-labelledby={`crew-section-heading-${s.id}`}
                        className="@container flex scroll-mt-(--crew-scroll-clearance) flex-col gap-4"
                      >
                        <h2
                          id={`crew-section-heading-${s.id}`}
                          tabIndex={-1}
                          className="text-lg font-semibold text-text-strong"
                        >
                          {s.label}
                        </h2>
                        {/* Server render: the open body is the sheet's (one copy of every testid and search target). */}
                        {mode === "ssr" && s.id === open ? null : sectionNodes[s.id]}
                      </section>
                    ))}
                  </div>
                ) : null}
              </main>
              {searchActive ? (
                <main
                  data-testid="crew-search-panel"
                  className="flex min-w-0 flex-1 flex-col gap-6 pt-6 pb-8 sm:pt-8"
                >
                  <CrewSearchHint />
                  <CrewSearchResults />
                </main>
              ) : null}
            </div>
            {/* Unmounted, not closed, in the wide layout: a closing sheet would hold
            its body through the exit slide while the stack shows the same body,
            and the sheet leaves wide without animation (spec §7). */}
            {showCompact ? (
              <CrewSectionSheet
                section={openEntry ? { id: openEntry.id, label: openEntry.label } : null}
                modal={mode === "compact"}
                onRequestClose={requestClose}
                fallbackFocus={sheetFallbackFocus}
                bodyRef={sheetBodyRef}
                presence={dismissals}
              >
                {open !== null ? sectionNodes[open] : null}
              </CrewSectionSheet>
            ) : null}
            {/* Left live by the sheet's inert sweep, so a gone line is announced over an open sheet. */}
            <p
              data-testid="crew-reveal-status"
              data-sheet-live-region=""
              role="status"
              className="sr-only"
            >
              {revealStatus}
            </p>
          </div>
        </DaySelectionProvider>
      </CrewClockProvider>
    </SectionControllerContext.Provider>
  );
}
