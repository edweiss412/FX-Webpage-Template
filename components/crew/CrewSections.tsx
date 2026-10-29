"use client";

/**
 * components/crew/CrewSections.tsx — the crew-page section controller
 * (client-section-toggle).
 *
 * Owns `activeSection` client state over the SERVER-RENDERED section bodies that
 * `_CrewShell` passes in via `sectionNodes`. Switching a tab is a pure client
 * state change plus a SHALLOW URL update (`history.pushState`, NO `router.push`)
 * and a scroll-to-top — so the dynamic crew route does NOT re-run
 * `getShowForViewer` per tap. Section switches are instant.
 *
 * FRESHNESS INVARIANT (NON-NEGOTIABLE): the controller toggles VISIBILITY only.
 * It never fetches, derives, or caches section data client-side. All section
 * bodies stay server-sourced; the page stays sheet-synced via the unchanged
 * `ShowRealtimeBridge → router.refresh()` path, which re-renders `_CrewShell`
 * (all bodies fresh) while this client component stays mounted and `active`
 * survives. Content always flows from the `sectionNodes` prop.
 *
 * SEARCH (crew show search spec §6.2, §6.6, §9.1). Under a `CrewSearchProvider`,
 * an active search hides the sub-nav and the section body with `hidden` (so
 * open disclosures survive) and renders the search panel in their place. The
 * controller also provides `useSectionController().openSectionAndReveal`, the
 * ONE call search uses to open a section and reveal a line: it switches the
 * section exactly as a tab tap does, waits for the target to mount (the
 * transition mounts the destination only after the outgoing exit), opens every
 * `<details>` around and inside it, scrolls it to centre, focuses it and marks it
 * `data-search-reveal` for the highlight in app/globals.css.
 */

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CrewSubNav } from "@/components/crew/CrewSubNav";
import { CrewSectionTransition } from "@/components/crew/CrewSectionTransition";
import {
  SectionControllerContext,
  type SectionController,
} from "@/components/crew/sectionController";
import { CrewSearchHint } from "@/components/crew/search/CrewSearchField";
import { CrewSearchResults } from "@/components/crew/search/CrewSearchResults";
import { useOptionalCrewSearch } from "@/components/crew/search/CrewSearchProvider";
import { CREW_PAGE_CONTAINER } from "@/lib/crew/pageContainer";
import { buildSectionHref } from "@/lib/crew/sectionHref";
import { resolveActiveSection, type SectionId } from "@/lib/crew/resolveActiveSection";

export { useSectionController, type SectionController } from "@/components/crew/sectionController";

export interface CrewSectionsProps {
  initialSection: SectionId;
  budgetVisible: boolean;
  sectionNodes: Partial<Record<SectionId, ReactNode>>;
}

/** How long a reveal waits for its target to mount before giving up (spec §6.6). */
const REVEAL_WAIT_MS = 1500;
/** The highlight's fade; the `[data-search-reveal]` keyframe in app/globals.css runs 1600ms. */
const REVEAL_HIGHLIGHT_MS = 1600;
/** Under reduced motion the tint holds without fading for this long, then goes at once. */
const REVEAL_HIGHLIGHT_REDUCED_MS = 2000;
// not-subject:M5-D8: a polite status announcement for a search result whose line
// changed under it, not an error path and carries no code; the copy is pinned in
// the search spec §10 and asserted literally in CrewSections.search.test.tsx.
const REVEAL_GONE_MESSAGE = "That line isn't on the page anymore.";

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
 * panel (spec §6.8). Focus the viewer has moved somewhere else stays there.
 */
function focusBodyIfFocusFell(body: HTMLElement | null): void {
  if (body === null || body.hidden) return;
  const current = document.activeElement;
  if (current !== null && current !== document.body && current.isConnected) return;
  if (!body.hasAttribute("tabindex")) body.setAttribute("tabindex", "-1");
  body.focus({ preventScroll: true });
}

type RevealRun = { frame: number; deadline: number };

export function CrewSections({ initialSection, budgetVisible, sectionNodes }: CrewSectionsProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [active, setActive] = useState<SectionId>(initialSection);

  // Sync to SERVER-driven section changes via the React-recommended "adjust state
  // during render when a prop changes" pattern (https://react.dev/learn/you-might-
  // not-need-an-effect) — NOT a setState-in-effect (forbidden by
  // react-hooks/set-state-in-effect; it would cascade-render). The in-body
  // SectionChipLink (Today's "Run of show → Agenda" chip) is a next/link <Link> to
  // ?s=schedule: a real Next nav re-renders _CrewShell with a NEW initialSection,
  // but the controller stays mounted so `active` would otherwise keep the old value
  // (URL/server on Schedule, body/nav stale). A router.refresh() (realtime sync)
  // likewise re-renders with the current URL's section. A shallow CrewSubNav tap
  // does NOT change initialSection, so this never fires for a tap. (Review R1 [HIGH].)
  const [syncedInitial, setSyncedInitial] = useState<SectionId>(initialSection);
  // Also track the URL-derived section so a SAME-VALUE server re-delivery is caught.
  // If the client shallow-navigates `active` away (e.g. tap Today after a chip sent
  // ?s=schedule) and the SectionChipLink then re-navigates to the SAME ?s=schedule the
  // server last rendered, `initialSection` never changes value — the block below cannot
  // fire — and the URL is the only thing that moved. Firing on a urlSection VALUE CHANGE
  // (not on active/searchParams lag) keeps this race-proof: a shallow tap changes `active`
  // before Next syncs useSearchParams, but urlSection===syncedUrl at that instant so
  // nothing reverts; when the URL catches up, urlSection!==initialSection (the prop is
  // stale) so `active` still holds. onSelect/popstate are unchanged.
  // useSearchParams() can be null (SSR of a client component before hydration), so guard the read.
  const urlSection = resolveActiveSection(searchParams?.get("s") ?? undefined, {
    budgetVisible,
  });
  const [syncedUrl, setSyncedUrl] = useState<SectionId>(urlSection);
  if (initialSection !== syncedInitial) {
    setSyncedInitial(initialSection);
    setActive(initialSection);
  } else if (urlSection !== syncedUrl) {
    setSyncedUrl(urlSection);
    if (urlSection === initialSection && active !== initialSection) {
      setActive(initialSection);
    }
  }

  const onSelect = useCallback(
    (id: SectionId) => {
      if (id === active) return;
      setActive(id);
      // Shallow URL: history.pushState updates ?s= WITHOUT a server render
      // (no router.push → the dynamic route does not re-run getShowForViewer).
      // Next App Router keeps useSearchParams in sync with history.pushState.
      window.history.pushState(null, "", buildSectionHref(pathname, searchParams, id));
      window.scrollTo(0, 0);
    },
    [active, pathname, searchParams],
  );

  // ── Search reveal (spec §6.6) ─────────────────────────────────────────────
  const bodyRef = useRef<HTMLElement>(null);
  const revealRun = useRef<RevealRun | null>(null);
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

  const reveal = useCallback(
    (el: HTMLElement) => {
      clearHighlight();
      openDisclosures(el);
      el.scrollIntoView({ block: "center" });
      // A line that is not focusable on its own takes focus without joining the
      // tab order; a button or link keeps its own.
      if (el.tabIndex < 0 && !el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
      el.focus({ preventScroll: true });
      el.setAttribute("data-search-reveal", "");
      // Two calls rather than one with a computed delay, so each delay is a named
      // constant the DESIGN.md §5.5 timing scan resolves.
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const timer = reduced
        ? window.setTimeout(clearHighlight, REVEAL_HIGHLIGHT_REDUCED_MS)
        : window.setTimeout(clearHighlight, REVEAL_HIGHLIGHT_MS);
      highlight.current = { el, timer };
    },
    [clearHighlight],
  );

  const openSectionAndReveal = useCallback(
    (sectionId: SectionId, targetId: string) => {
      stopWaiting();
      setRevealStatus("");
      if (sectionId !== active) {
        setActive(sectionId);
        window.history.pushState(null, "", buildSectionHref(pathname, searchParams, sectionId));
      }
      window.scrollTo(0, 0);

      const run: RevealRun = { frame: 0, deadline: 0 };
      const look = () => {
        const el = findTarget(bodyRef.current, targetId);
        if (el === null) {
          run.frame = window.requestAnimationFrame(look);
          return;
        }
        stopWaiting();
        reveal(el);
      };
      run.deadline = window.setTimeout(() => {
        stopWaiting();
        setRevealStatus(REVEAL_GONE_MESSAGE);
        focusBodyIfFocusFell(bodyRef.current);
      }, REVEAL_WAIT_MS);
      run.frame = window.requestAnimationFrame(look);
      revealRun.current = run;
    },
    [active, pathname, searchParams, reveal, stopWaiting],
  );

  useEffect(
    () => () => {
      stopWaiting();
      clearHighlight();
    },
    [stopWaiting, clearHighlight],
  );

  const controller = useMemo<SectionController>(
    () => ({ openSectionAndReveal }),
    [openSectionAndReveal],
  );

  const search = useOptionalCrewSearch();
  const searchActive = search?.active ?? false;

  useEffect(() => {
    const onPop = () => {
      const raw = new URLSearchParams(window.location.search).get("s") ?? undefined;
      setActive(resolveActiveSection(raw, { budgetVisible }));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [budgetVisible]);

  // Clamp to a present, entitled section so EVERYTHING (data-active-section,
  // nav active tab, transition key, body) stays consistent. resolveActiveSection
  // only returns entitled ids, but a refresh that flips budgetVisible true→false
  // while active==="budget" would otherwise leave a STALE split state (Today body
  // under a "budget" data-active-section / active tab). `effectiveActive` is the
  // single source used by all four below, so there is never a split.
  const effectiveActive: SectionId = sectionNodes[active] ? active : "today";
  const body = sectionNodes[effectiveActive] ?? null;

  return (
    <SectionControllerContext.Provider value={controller}>
      <div data-testid="crew-shell-sections" data-active-section={effectiveActive}>
        {/* Hidden, never unmounted, while search is active: section state survives. */}
        <div data-testid="crew-sub-nav-slot" hidden={searchActive}>
          <CrewSubNav
            activeSection={effectiveActive}
            budgetVisible={budgetVisible}
            onSelect={onSelect}
          />
        </div>
        <main
          ref={bodyRef}
          data-testid="page-container"
          hidden={searchActive}
          className={
            // Bar clearance moved to `crew-shell` (below the FOOTER, not below <main>) —
            // keeping it here too would double-pad at <720px. What remains is the
            // ordinary bottom rhythm, the same value the >=720px case already used.
            `${CREW_PAGE_CONTAINER} flex flex-1 flex-col gap-section-gap pt-6 pb-8 sm:pt-8`
          }
        >
          <CrewSectionTransition sectionId={effectiveActive}>{body}</CrewSectionTransition>
        </main>
        {searchActive ? (
          <main
            data-testid="crew-search-panel"
            className={`${CREW_PAGE_CONTAINER} flex flex-1 flex-col gap-6 pt-6 pb-8 sm:pt-8`}
          >
            <CrewSearchHint />
            <CrewSearchResults />
          </main>
        ) : null}
        <p data-testid="crew-reveal-status" role="status" className="sr-only">
          {revealStatus}
        </p>
      </div>
    </SectionControllerContext.Provider>
  );
}
