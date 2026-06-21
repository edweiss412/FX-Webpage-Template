"use client";

/**
 * components/crew/CrewSubNav.tsx — crew-redesign section sub-nav (Task 6).
 *
 * One client island that renders the section navigation TWICE for CSS-only
 * responsive switching: a desktop tab row (`hidden min-[720px]:flex`) and a
 * mobile bottom bar (`min-[720px]:hidden`). Both are real DOM nodes; the
 * breakpoint chooses which is visible. There is no `md` breakpoint in this
 * project — the §sub-nav layout pivot is `min-[720px]:`.
 *
 * Tabs = BASE_SECTION_IDS, plus "budget" iff the caller is Budget-entitled
 * (`budgetVisible`). The tab list, the URL `?s=`, and the resolved section all
 * derive from the same SectionId set, so they can never diverge (§4.1).
 *
 * URL discipline (R13-MEDIUM-1): activating a tab builds a FRESH
 * `URLSearchParams` carrying ONLY allow-listed params — never a clone of all
 * current params. It sets `s=<id>`, then re-emits `gate` ONLY when the current
 * value is in `ALLOWED_GATE_VALUES`. Every other key (a stale `evil`, a leaked
 * `token`, etc.) is dropped from the pushed URL and from history. The push is
 * `{ scroll: false }` (we control scroll ourselves) followed by `scrollTo(0,0)`.
 *
 * The active tab — and only the active tab — carries `aria-current="page"`.
 * Tap targets meet the 44px floor (`min-h-tap-min` → `--spacing-tap-min`).
 * Active-state colour transitions via `--duration-fast` / `--ease-out-quart`
 * (the token is 0ms under reduced motion, so no JS branch is needed here).
 *
 * data-testid="crew-sub-nav"; each tab carries `data-section={id}`.
 */

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { JSX } from "react";
import { useCallback } from "react";
import {
  BoxIcon,
  CalendarIcon,
  HomeIcon,
  MapPinIcon,
  PlaneIcon,
  ReceiptIcon,
  UsersIcon,
} from "@/components/crew/icons/sectionIcons";
import { CREW_PAGE_CONTAINER } from "@/lib/crew/pageContainer";
import { buildSectionHref } from "@/lib/crew/sectionHref";
import { BASE_SECTION_IDS, type SectionId } from "@/lib/crew/resolveActiveSection";

const SECTION_LABELS: Record<SectionId, string> = {
  today: "Today",
  schedule: "Schedule",
  venue: "Venue",
  travel: "Travel",
  crew: "Crew",
  gear: "Gear",
  budget: "Budget",
};

/**
 * Per-section glyph (Task 8.5). Each is a `({ className }) => svg` from the
 * shared crew icon set; the glyph inherits color (`currentColor`) so the active
 * tab's text color drives the icon. Sizes are set per variant at the call site
 * (`size-4` desktop / `size-[22px]` mobile).
 */
const SECTION_ICON: Record<SectionId, (props: { className?: string }) => JSX.Element> = {
  today: HomeIcon,
  schedule: CalendarIcon,
  venue: MapPinIcon,
  travel: PlaneIcon,
  crew: UsersIcon,
  gear: BoxIcon,
  budget: ReceiptIcon,
};

export interface CrewSubNavProps {
  activeSection: SectionId;
  budgetVisible: boolean;
}

export function CrewSubNav({ activeSection, budgetVisible }: CrewSubNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const sections: SectionId[] = budgetVisible
    ? [...BASE_SECTION_IDS, "budget"]
    : [...BASE_SECTION_IDS];

  const navigate = useCallback(
    (id: SectionId) => {
      // FRESH params via the shared builder — carries only `s` + an allow-listed
      // `gate`, drops everything else (single source of truth with
      // SectionChipLink; lib/crew/sectionHref.ts).
      router.push(buildSectionHref(pathname, searchParams, id), { scroll: false });
      window.scrollTo(0, 0);
    },
    [pathname, router, searchParams],
  );

  const tab = (id: SectionId, variant: "desktop" | "mobile") => {
    const isActive = id === activeSection;
    const base =
      "inline-flex min-h-tap-min items-center justify-center px-3 text-sm font-medium " +
      "transition-colors duration-fast ease-out-quart focus-visible:outline-none " +
      "focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 " +
      "focus-visible:ring-offset-bg";
    const desktop = isActive
      ? "border-b-2 border-accent text-text-strong"
      : "border-b-2 border-transparent text-text-subtle hover:text-text";
    // `min-w-0` is REQUIRED for `flex-1` to equalize the tab widths: flex items
    // default to `min-width: auto`, so without it a wider-label tab ("Schedule",
    // "Budget") refuses to shrink below its content width and the bottom bar's
    // tabs come out unequal. `min-w-0` lets every tab collapse to a true `1fr`
    // track. (Pinned by the §4.9 invariant-5 equal-width assertion.)
    const mobile = isActive
      ? "min-w-0 flex-1 flex-col text-accent"
      : "min-w-0 flex-1 flex-col text-text-subtle";

    // Per-section glyph (Task 8.5). The glyph inherits `currentColor`, so it
    // tracks the tab's text color by default. The ONLY place that needs an
    // explicit override is the ACTIVE DESKTOP tab: its text is `text-text-strong`
    // (a near-black), but the active icon should read in the accent — so we tint
    // it `text-accent-on-bg`. The active MOBILE tab is already `text-accent`, so
    // the inherited color is correct and no override is needed.
    const Icon = SECTION_ICON[id];
    const iconSize = variant === "desktop" ? "size-4" : "size-[22px]";
    const iconActiveTint = variant === "desktop" && isActive ? " text-accent-on-bg" : "";

    return (
      <button
        key={id}
        type="button"
        data-section={id}
        aria-current={isActive ? "page" : undefined}
        onClick={() => navigate(id)}
        className={
          `${base} ${variant === "desktop" ? desktop : mobile}` +
          (variant === "desktop" ? " gap-2" : " gap-0.5 py-1")
        }
      >
        <Icon className={`${iconSize}${iconActiveTint}`} />
        {SECTION_LABELS[id]}
      </button>
    );
  };

  return (
    <div data-testid="crew-sub-nav">
      {/* Desktop tab row — visible at ≥720px.
          The tab row lives OUTSIDE _CrewShell's `[data-testid="page-container"]`,
          so without its own centering container it spans edge-to-edge while the
          section content is centered → the first tab's left edge fails to align
          (the user-reported "off-center" miss, Task 8.5). The wrapper composes
          the SHARED `CREW_PAGE_CONTAINER` constant — the exact same utilities
          `_CrewShell` puts on the page container (`mx-auto w-full max-w-300
          px-4 sm:px-8`) — so the two can never drift and the first tab's left
          edge aligns with the section content's left edge. */}
      <div className={CREW_PAGE_CONTAINER}>
        <nav
          aria-label="Show sections"
          className="hidden min-[720px]:flex items-stretch gap-1 border-b border-border"
        >
          {sections.map((id) => tab(id, "desktop"))}
        </nav>
      </div>

      {/* Mobile bottom bar — visible below 720px. `pb-[env(safe-area-inset-bottom)]`
          lets the tabs clear the iOS home indicator so the bottom row of labels
          isn't overlapped by the system gesture bar; `<main>` reserves matching
          bottom clearance so section content never scrolls under this fixed bar. */}
      <nav
        aria-label="Show sections"
        className="min-[720px]:hidden fixed inset-x-0 bottom-0 z-10 flex items-stretch border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]"
      >
        {sections.map((id) => tab(id, "mobile"))}
      </nav>
    </div>
  );
}
