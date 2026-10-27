"use client";

/**
 * components/crew/CrewSections.tsx: the crew page's section controller (crew
 * page redesign spec §3, §5.2, §5.3).
 *
 * Two layouts from ONE set of server-rendered bodies (`sectionNodes`):
 *   - compact, below 1024px: the home (the Today block, then the "All
 *     sections" card) with any section in a bottom sheet (`CrewSectionSheet`);
 *   - wide, 1024px and up: a left nav ("Today" then the sections) beside one
 *     column, the Today block first and every section stacked under it.
 * The server cannot know the viewport, so its render carries both, and CSS
 * shows the right one at the breakpoint until hydration resolves the mode
 * (`matchMedia("(min-width: 1024px)")`, compact when `matchMedia` is missing);
 * from then on only the live layout is mounted. No body is ever in the DOM
 * twice: in the server render an open section's body sits in the sheet only,
 * and its slot in the wide stack is filled after hydration, which is also when
 * a wide deep link scrolls to it.
 *
 * Every element that bounds a body is a size container (`@container`): the
 * Today block here, each wide stacked section, and the sheet body. A body's
 * grids switch on that container's width (`@min-crew-split:`, the
 * `--container-crew-split` token in app/globals.css), never the viewport, so
 * one body is single column in the 480px sheet and two columns in the wide
 * column at the same 1000px window.
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
 * Links: a click on any same-page link carrying an entitled `s` (an "All
 * sections" row, a nav item, a section link inside a body) is intercepted here
 * and routed through the rules above. Rows and nav items are real hrefs, so a
 * tap before hydration or "open in new tab" reaches the server-rendered sheet.
 *
 * `useSectionController()` exposes `openSectionAndReveal(sectionId, targetId)`,
 * the one entry point search calls (search spec §9.1): compact opens the
 * section's sheet and centres the `[data-search-target]` line inside its body;
 * wide scrolls the page to it; both then highlight it (`data-search-reveal`).
 *
 * Readiness: `data-crew-controller-ready="true"` appears with the first client
 * layout, after hydration (e2e harness readiness gate).
 */

import { usePathname, useSearchParams } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { CrewAllSections } from "@/components/crew/CrewAllSections";
import { CrewSectionSheet } from "@/components/crew/CrewSectionSheet";
import { CrewWideNav, type CrewWideNavItem } from "@/components/crew/CrewWideNav";
import { usePrefersReducedMotion } from "@/lib/a11y/usePrefersReducedMotion";
import {
  CREW_TODAY_LABEL,
  type CrewSectionEntry,
  type CrewSectionId,
} from "@/lib/crew/crewSections";
import { CREW_PAGE_CONTAINER } from "@/lib/crew/pageContainer";
import type { SectionId } from "@/lib/crew/resolveActiveSection";
import { buildHomeHref, buildSectionHref } from "@/lib/crew/sectionHref";
import { cn } from "@/lib/ui/cn";
import {
  activeSectionFor,
  NAV_SCROLL_SETTLE_EPSILON_PX,
  NAV_SCROLL_SETTLE_TIMEOUT_MS,
} from "@/lib/ui/scrollSpy";

export interface CrewSectionsProps {
  /** The server-resolved `?s=` (`today` means home, no sheet). */
  initialSection: SectionId;
  /** The viewer's sections in nav order, with peeks (`crewSectionEntries`). */
  sections: readonly CrewSectionEntry[];
  /** Every body the shell rendered: `today` plus one per listed section. */
  sectionNodes: Partial<Record<SectionId, ReactNode>>;
  /** Rendered at the top of the column (search's results mount here). */
  children?: ReactNode;
}

type Mode = "ssr" | "compact" | "wide";

const WIDE_QUERY = "(min-width: 1024px)";
/** How many frames a reveal waits for its target to mount before giving up. */
const REVEAL_FRAME_BUDGET = 90;

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

/** The history state without the sheet marker; `null` stays `null`. */
function withoutMarker(state: unknown): unknown {
  if (!isRecord(state)) return state;
  const { crewSheet: _marker, ...rest } = state;
  return rest;
}

/** Document-relative scroll target for a stacked section: its top less its scroll margin. */
function scrollTargetFor(el: Element): number {
  const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
  return el.getBoundingClientRect().top + window.scrollY - margin;
}

type SectionController = {
  openSectionAndReveal(sectionId: SectionId, targetId: string): void;
};

const SectionControllerContext = createContext<SectionController>({
  openSectionAndReveal: () => {},
});

/** Search's entry point into the controller (search spec §9.1). */
export function useSectionController(): SectionController {
  return useContext(SectionControllerContext);
}

export function CrewSections({
  initialSection,
  sections,
  sectionNodes,
  children,
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

  const open = openId !== null && entitled.has(openId) ? openId : null;
  const openEntry = open === null ? null : (sections.find((s) => s.id === open) ?? null);

  const sheetBodyRef = useRef<HTMLDivElement | null>(null);
  const todayRef = useRef<HTMLElement | null>(null);
  const todayHeadingRef = useRef<HTMLHeadingElement | null>(null);
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

  const spyItems = useCallback((): Array<{ id: string; top: number }> => {
    const tops: Array<{ id: string; top: number }> = [];
    const today = todayRef.current;
    if (today) tops.push({ id: "today", top: today.getBoundingClientRect().top + window.scrollY });
    for (const s of sections) {
      const el = stackRefs.current.get(s.id);
      if (el) tops.push({ id: s.id, top: el.getBoundingClientRect().top + window.scrollY });
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
        const heading =
          id === "today" ? todayHeadingRef.current : el?.querySelector<HTMLElement>("h2");
        heading?.focus({ preventScroll: true });
      }
    },
    [beginSuppressedScroll, reduced],
  );

  // Wide deep link: after hydration, land on the `?s=` section.
  const landedRef = useRef(false);
  useEffect(() => {
    if (mode !== "wide" || landedRef.current) return;
    landedRef.current = true;
    const id = toOpen(initialSection);
    const el = id ? stackRefs.current.get(id) : undefined;
    if (!id || !el) return;
    const top = scrollTargetFor(el);
    setSpyActive(id);
    beginSuppressedScroll(top);
    window.scrollTo({ top, behavior: "auto" });
    // Runs once per mount, on the first wide layout; later `?s=` changes are
    // history entries handled by the popstate listener below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // ── Opening and closing ────────────────────────────────────────────────────
  const openSection = useCallback(
    (id: CrewSectionId) => {
      const href = buildSectionHref(pathname, searchParams, id);
      if (mode === "wide") {
        window.history.replaceState(window.history.state, "", href);
        scrollWide(id, { focus: true });
        return;
      }
      if (open === id) return;
      if (open === null) {
        const state: unknown = window.history.state;
        window.history.pushState({ ...(isRecord(state) ? state : {}), crewSheet: true }, "", href);
      } else {
        window.history.replaceState(window.history.state, "", href);
        if (sheetBodyRef.current) sheetBodyRef.current.scrollTop = 0;
      }
      setOpenId(id);
    },
    [mode, open, pathname, searchParams, scrollWide],
  );

  const requestClose = useCallback(() => {
    const state: unknown = window.history.state;
    if (isRecord(state) && state.crewSheet === true) {
      window.history.back(); // the popstate that follows closes the sheet
      return;
    }
    window.history.replaceState(
      withoutMarker(state),
      "",
      buildHomeHref(pathname, new URLSearchParams(window.location.search)),
    );
    setOpenId(null);
  }, [pathname]);

  const goHome = useCallback(() => {
    if (mode === "wide") {
      window.history.replaceState(window.history.state, "", buildHomeHref(pathname, searchParams));
      scrollWide("today", { focus: true });
      return;
    }
    if (open !== null) requestClose();
  }, [mode, open, pathname, searchParams, requestClose, scrollWide]);

  useEffect(() => {
    function onPopState() {
      const raw = new URLSearchParams(window.location.search).get("s");
      const id = toOpen(raw);
      if (raw !== null && raw !== "today" && id === null) {
        // Unknown or not entitled: drop it, as the server resolves it to home.
        window.history.replaceState(
          window.history.state,
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

  // ── openSectionAndReveal (search's entry point) ────────────────────────────
  const revealRef = useRef<HTMLElement | null>(null);
  const openSectionAndReveal = useCallback(
    (sectionId: SectionId, targetId: string) => {
      const id = toOpen(sectionId);
      if (sectionId !== "today" && id === null) return;
      const inSheet = mode !== "wide" && id !== null;
      if (id !== null) {
        if (mode === "wide") {
          window.history.replaceState(
            window.history.state,
            "",
            buildSectionHref(pathname, searchParams, id),
          );
        } else {
          openSection(id);
        }
      } else if (mode !== "wide") {
        if (open !== null) requestClose();
      }
      const selector = `[data-search-target="${CSS.escape(targetId)}"]`;
      let frames = 0;
      const look = () => {
        const scope = inSheet
          ? sheetBodyRef.current
          : id !== null
            ? (stackRefs.current.get(id) ?? null)
            : todayRef.current;
        const target = scope?.querySelector<HTMLElement>(selector) ?? null;
        if (!target) {
          frames += 1;
          if (frames < REVEAL_FRAME_BUDGET) requestAnimationFrame(look);
          return;
        }
        for (
          let d = target.parentElement?.closest("details");
          d;
          d = d.parentElement?.closest("details")
        ) {
          d.open = true;
        }
        const body = sheetBodyRef.current;
        if (inSheet && body) {
          const t = target.getBoundingClientRect();
          const b = body.getBoundingClientRect();
          body.scrollTop = body.scrollTop + (t.top - b.top) - (body.clientHeight - t.height) / 2;
        } else {
          const section = id !== null ? stackRefs.current.get(id) : todayRef.current;
          const margin = section ? parseFloat(getComputedStyle(section).scrollMarginTop) || 0 : 0;
          const top = target.getBoundingClientRect().top + window.scrollY - margin;
          setSpyActive(id ?? "today");
          beginSuppressedScroll(top);
          window.scrollTo({ top, behavior: reduced ? "auto" : "smooth" });
        }
        if (target.tabIndex < 0 && !target.hasAttribute("tabindex")) target.tabIndex = -1;
        target.focus({ preventScroll: true });
        revealRef.current?.removeAttribute("data-search-reveal");
        target.setAttribute("data-search-reveal", "");
        revealRef.current = target;
      };
      requestAnimationFrame(look);
    },
    [
      beginSuppressedScroll,
      mode,
      open,
      openSection,
      pathname,
      reduced,
      requestClose,
      searchParams,
      toOpen,
    ],
  );

  const api = useMemo(() => ({ openSectionAndReveal }), [openSectionAndReveal]);

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

  const showCompact = mode !== "wide";
  const showWide = mode !== "compact";
  const hasSections = sections.length > 0;

  return (
    <SectionControllerContext.Provider value={api}>
      <div
        data-testid="crew-shell-sections"
        data-crew-controller-ready={mode === "ssr" ? undefined : "true"}
        data-crew-mode={mode === "ssr" ? undefined : mode}
        className="flex flex-1 flex-col"
        onClickCapture={onClickCapture}
      >
        <div className={cn(CREW_PAGE_CONTAINER, "flex flex-1 items-stretch lg:gap-8")}>
          {showWide && hasSections ? (
            <CrewWideNav items={navItems} active={spyActive} hrefFor={hrefFor} />
          ) : null}
          <main
            data-testid="page-container"
            className="flex min-w-0 flex-1 flex-col gap-section-gap pt-6 pb-8 sm:pt-8"
          >
            {children}
            <section
              ref={todayRef}
              data-testid="crew-today-block"
              aria-labelledby="crew-today-heading"
              className="@container"
            >
              <h2 id="crew-today-heading" ref={todayHeadingRef} tabIndex={-1} className="sr-only">
                {CREW_TODAY_LABEL}
              </h2>
              {sectionNodes.today}
            </section>
            {showCompact && hasSections ? (
              <div className="lg:hidden">
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
                    className="@container flex scroll-mt-6 flex-col gap-4"
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
        </div>
        {/* Unmounted, not closed, in the wide layout: a closing sheet would hold
            its body through the exit slide while the stack shows the same body,
            and the sheet leaves wide without animation (spec §7). */}
        {showCompact ? (
          <CrewSectionSheet
            section={openEntry ? { id: openEntry.id, label: openEntry.label } : null}
            modal={mode === "compact"}
            onRequestClose={requestClose}
            bodyRef={sheetBodyRef}
          >
            {open !== null ? sectionNodes[open] : null}
          </CrewSectionSheet>
        ) : null}
      </div>
    </SectionControllerContext.Provider>
  );
}
