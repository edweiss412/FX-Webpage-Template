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
import { useCallback } from "react";
import {
  ALLOWED_GATE_VALUES,
  BASE_SECTION_IDS,
  type SectionId,
} from "@/lib/crew/resolveActiveSection";

const SECTION_LABELS: Record<SectionId, string> = {
  today: "Today",
  schedule: "Schedule",
  venue: "Venue",
  travel: "Travel",
  crew: "Crew",
  gear: "Gear",
  budget: "Budget",
};

const ALLOWED_GATE_SET = new Set<string>(ALLOWED_GATE_VALUES);

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
      // FRESH params — NOT a clone of the current query. Carry only the
      // section and an allow-listed gate; drop everything else.
      const next = new URLSearchParams();
      next.set("s", id);
      const gate = searchParams.get("gate");
      if (gate !== null && ALLOWED_GATE_SET.has(gate)) {
        next.set("gate", gate);
      }
      router.push(`${pathname}?${next.toString()}`, { scroll: false });
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
    return (
      <button
        key={id}
        type="button"
        data-section={id}
        aria-current={isActive ? "page" : undefined}
        onClick={() => navigate(id)}
        className={`${base} ${variant === "desktop" ? desktop : mobile}`}
      >
        {SECTION_LABELS[id]}
      </button>
    );
  };

  return (
    <div data-testid="crew-sub-nav">
      {/* Desktop tab row — visible at ≥720px. */}
      <nav
        aria-label="Show sections"
        className="hidden min-[720px]:flex items-stretch gap-1 border-b border-border"
      >
        {sections.map((id) => tab(id, "desktop"))}
      </nav>

      {/* Mobile bottom bar — visible below 720px. */}
      <nav
        aria-label="Show sections"
        className="min-[720px]:hidden fixed inset-x-0 bottom-0 z-10 flex items-stretch border-t border-border bg-surface"
      >
        {sections.map((id) => tab(id, "mobile"))}
      </nav>
    </div>
  );
}
