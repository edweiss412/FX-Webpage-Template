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
 */

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { CrewSubNav } from "@/components/crew/CrewSubNav";
import { CrewSectionTransition } from "@/components/crew/CrewSectionTransition";
import { CREW_PAGE_CONTAINER } from "@/lib/crew/pageContainer";
import { buildSectionHref } from "@/lib/crew/sectionHref";
import { resolveActiveSection, type SectionId } from "@/lib/crew/resolveActiveSection";

export interface CrewSectionsProps {
  initialSection: SectionId;
  budgetVisible: boolean;
  sectionNodes: Partial<Record<SectionId, ReactNode>>;
}

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
  if (initialSection !== syncedInitial) {
    setSyncedInitial(initialSection);
    setActive(initialSection);
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
    <div data-testid="crew-shell-sections" data-active-section={effectiveActive}>
      <CrewSubNav
        activeSection={effectiveActive}
        budgetVisible={budgetVisible}
        onSelect={onSelect}
      />
      <main
        data-testid="page-container"
        className={`${CREW_PAGE_CONTAINER} flex flex-1 flex-col gap-section-gap pt-6 pb-[calc(var(--spacing-tap-min)+env(safe-area-inset-bottom)+1rem)] sm:pt-8 min-[720px]:pb-8`}
      >
        <CrewSectionTransition sectionId={effectiveActive}>{body}</CrewSectionTransition>
      </main>
    </div>
  );
}
