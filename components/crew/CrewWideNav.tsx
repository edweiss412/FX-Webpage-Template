"use client";

/**
 * components/crew/CrewWideNav.tsx: the crew page's wide-layout left nav (crew
 * page redesign spec §5.3), 1024px and up.
 *
 * "Today" first, then the viewer's sections from `crewSectionsFor`, one level,
 * no group headings in PR A, and nothing beside a label: no counts, no status
 * dots (spec §9.2, numbers beside nav labels read as alerts).
 *
 * Presentational. The active item comes from the controller's scroll-spy
 * (`CrewSections`, the shared `activeSectionFor` rule) and carries
 * `aria-current`. Each item is a real link (`buildSectionHref`; Today is the
 * page without `s`), and the controller intercepts the click to scroll,
 * focus the section heading and `replaceState`, so this component owns no
 * navigation and imports no `next/link`.
 *
 * The accent bar is ONE measured element that slides to the active item at
 * `--duration-fast` by transform alone (a fixed-height bar, sized per item by
 * scaleY), the admin rail's mechanism
 * (`components/admin/review/ShowReviewSurface.tsx`, §A3), never a per-item
 * conditional render: a conditional bar would teleport rather than move. It
 * mounts without its transition and turns it on the next frame, so it never
 * slides in from the top on first paint.
 *
 * Dimensions (spec §8 item 5): 240px wide (`w-60 shrink-0`), sticky under the
 * header's bottom edge (`--crew-header-bottom`: the header token, plus the
 * preview banner's height on the admin preview route), and exactly the viewport
 * less that tall, scrolling on its own.
 *
 * data-testid: crew-wide-nav (each item data-section), crew-wide-nav-indicator.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { SECTION_ICON } from "@/components/crew/sectionIcon";
import type { SectionId } from "@/lib/crew/resolveActiveSection";
import { cn } from "@/lib/ui/cn";

/** Vertical inset of the accent bar inside its item (painted, but measured at runtime). */
const INDICATOR_INSET_PX = 10;

export type CrewWideNavItem = { id: SectionId; label: string };

export interface CrewWideNavProps {
  items: readonly CrewWideNavItem[];
  active: SectionId;
  hrefFor: (id: SectionId) => string;
  /** Hidden, never unmounted, while search shows its results (search spec §6.2). */
  hidden?: boolean;
}

export function CrewWideNav({ items, active, hrefFor, hidden = false }: CrewWideNavProps) {
  const navRef = useRef<HTMLElement | null>(null);
  const itemRefs = useRef(new Map<SectionId, HTMLAnchorElement>());
  // `base` is the bar's layout height, fixed at its first placement; every size
  // after that is a scaleY of it, so a move animates transform alone (DESIGN.md
  // §5.4, critique F15).
  const [indicator, setIndicator] = useState<{ y: number; h: number; base: number } | null>(null);
  const [transitionsOn, setTransitionsOn] = useState(false);

  useLayoutEffect(() => {
    const nav = navRef.current;
    const item = itemRefs.current.get(active);
    if (!nav || !item) {
      setIndicator(null);
      return;
    }
    const navRect = nav.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    if (itemRect.height === 0 && navRect.height === 0) {
      setIndicator(null); // unmeasurable (jsdom, display:none): hidden until a real layout
      return;
    }
    const h = itemRect.height - 2 * INDICATOR_INSET_PX;
    setIndicator((prev) => ({
      y: itemRect.top - navRect.top + nav.scrollTop + INDICATOR_INSET_PX,
      h,
      base: prev?.base ?? h,
    }));
  }, [active, items]);

  // The frame after the bar is first placed, turn its transition on. Its own
  // effect, rescheduled on every run until it fires: a one-shot inside the
  // measure effect is cancelled for good when that effect runs again within the
  // frame (React's double mount effect in development, a hydrated page).
  const placed = indicator !== null;
  useEffect(() => {
    if (!placed || transitionsOn) return;
    const raf = requestAnimationFrame(() => setTransitionsOn(true));
    return () => cancelAnimationFrame(raf);
  }, [placed, transitionsOn]);

  return (
    <nav
      ref={navRef}
      data-testid="crew-wide-nav"
      aria-label="Show sections"
      hidden={hidden}
      className="sticky top-(--crew-header-bottom) hidden h-[calc(100dvh-var(--crew-header-bottom))] w-60 shrink-0 flex-col gap-1 self-start overflow-y-auto border-r border-border py-6 pr-3 lg:flex"
    >
      {indicator !== null ? (
        <span
          aria-hidden="true"
          data-testid="crew-wide-nav-indicator"
          className={cn(
            "pointer-events-none absolute top-0 left-0 w-1 origin-top rounded-r-pill bg-accent",
            transitionsOn &&
              "transition-transform duration-fast ease-out-quart motion-reduce:transition-none",
          )}
          style={{
            transform: `translateY(${indicator.y}px) scaleY(${indicator.h / indicator.base})`,
            height: `${indicator.base}px`,
          }}
        />
      ) : null}
      {items.map((item) => {
        const isActive = item.id === active;
        const Icon = SECTION_ICON[item.id];
        return (
          <a
            key={item.id}
            ref={(el) => {
              if (el) itemRefs.current.set(item.id, el);
              else itemRefs.current.delete(item.id);
            }}
            data-section={item.id}
            href={hrefFor(item.id)}
            aria-current={isActive ? "true" : undefined}
            // Today's href has no `s`, so the controller needs this to know it as home.
            data-crew-home-link={item.id === "today" ? "" : undefined}
            className={cn(
              "ml-3 flex min-h-tap-min items-center gap-3 rounded-sm px-3 text-sm transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
              isActive
                ? "bg-surface-sunken font-semibold text-text-strong"
                : "text-text hover:bg-surface-sunken hover:text-text-strong",
            )}
          >
            <Icon
              className={cn("size-4 shrink-0", isActive ? "text-accent-on-bg" : "text-text-subtle")}
            />
            {item.label}
          </a>
        );
      })}
    </nav>
  );
}
