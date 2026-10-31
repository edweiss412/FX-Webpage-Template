import { Skeleton } from "@/components/layout/Skeleton";
import { crewSectionLabel } from "@/lib/crew/crewSections";
import { CREW_PAGE_CONTAINER } from "@/lib/crew/pageContainer";
import { BASE_SECTION_IDS } from "@/lib/crew/resolveActiveSection";
import { cn } from "@/lib/ui/cn";

/**
 * components/crew/CrewLoadingSkeleton.tsx: the crew show page's loading
 * silhouette, drawn by the crew route's `loading.tsx` and, under its banner
 * strip, by the admin "preview as crew member" route's.
 *
 * It reserves the loaded page's geometry (crew page redesign spec §3), so the
 * swap to the real page settles instead of jumping. The server cannot know the
 * viewport, so both layouts are in the markup and CSS picks one at 1024px, the
 * same split `components/crew/CrewSections.tsx` uses before hydration:
 *   - below 1024px: the header with its search row, the day-row strip, a
 *     pass-sized block, then the "All sections" list block;
 *   - from 1024px: the header sticky at `--crew-sticky-top`, `--crew-header-h`
 *     tall, the title block with twice the search slot's share, the 240px left nav
 *     column, and beside it the Today block (the day row and pass beside a home
 *     body column) over one stacked section frame.
 * The header bar, its row, the search slot and the nav column carry the real
 * components' class lists verbatim (`components/layout/Header.tsx`,
 * `components/crew/CrewWideNav.tsx`); tests/components/crew/loading.test.tsx
 * compares them with the rendered components, so a change there fails here
 * rather than drifting.
 *
 * §4.17 / no-Budget invariant: every labelled placeholder derives from
 * BASE_SECTION_IDS. `financialsVisible` is unknown before the projection, so a
 * Budget entry MUST NEVER flash here.
 *
 * Pure server component (no 'use client', no hooks). Decorative only: the
 * enclosing `LoadingShell` announces the load and keeps the no-JS notice.
 */

/** The sections the "All sections" list shows every viewer: Today is the home, not a row. */
const LIST_IDS = BASE_SECTION_IDS.filter((id) => id !== "today");

/** Day buttons in the strip: the day row's equal-width grid holds up to four. */
const DAY_SLOTS = [0, 1, 2, 3] as const;

export function CrewLoadingSkeleton() {
  return (
    <>
      {/* Header: the live header's bar and row (`Header.tsx`), so its height is the
          same in both modes, the fixed `--crew-header-h` bar from 1024px included. */}
      <div
        data-testid="crew-loading-header"
        className="border-b border-border bg-bg lg:sticky lg:top-(--crew-sticky-top) lg:z-nav lg:h-(--crew-header-h)"
      >
        <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-baseline justify-between gap-x-6 gap-y-3 px-4 py-3 sm:gap-y-4 sm:px-8 sm:py-4 lg:h-full lg:flex-nowrap lg:items-center lg:py-0">
          {/* One plate per line box of the title block: the eyebrow (`text-xs`,
              16px), the title row (its status pill, 22px) and the date (`text-xs`). */}
          <div className="min-w-0 flex-1 lg:flex-[2_1_0%]">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-1 h-5.5 w-56" />
            <Skeleton className="mt-1 h-4 w-40" />
          </div>
          <div
            data-testid="crew-loading-search"
            className="order-last basis-full lg:order-0 lg:max-w-sm lg:grow lg:basis-0 lg:self-center"
          >
            <Skeleton className="h-13 w-full" />
          </div>
          <Skeleton className="size-tap-min shrink-0 self-start lg:self-center" />
        </div>
      </div>

      <div
        data-testid="crew-loading-body"
        className={cn(CREW_PAGE_CONTAINER, "flex flex-1 items-stretch lg:gap-8")}
      >
        {/* Left nav column, 1024px and up: `CrewWideNav`'s box, Today then the base sections. */}
        <div
          data-testid="crew-loading-nav"
          className="sticky top-(--crew-header-bottom) hidden h-[calc(100dvh-var(--crew-header-bottom))] w-60 shrink-0 flex-col gap-1 self-start overflow-y-auto border-r border-border py-6 pr-3 lg:flex"
        >
          {BASE_SECTION_IDS.map((id) => (
            <div
              key={id}
              data-testid="crew-loading-nav-item"
              className="ml-3 flex min-h-tap-min items-center gap-3 px-3 text-sm text-text-faint"
            >
              <Skeleton className="size-4 shrink-0" />
              {crewSectionLabel(id)}
            </div>
          ))}
        </div>

        <div
          data-testid="crew-loading-main"
          className="flex min-w-0 flex-1 flex-col gap-section-gap pt-6 pb-8 sm:pt-8"
        >
          {/* The Today block: one column below 1024px, the lead beside the home body from it. */}
          <div className="flex flex-col lg:flex-row lg:items-start lg:gap-6">
            <div className="flex min-w-0 flex-col lg:flex-1">
              {/* Day-row strip. Each slot is a day button's box (border, `py-2`,
                  `gap-0.5`) with one plate per line box: the weekday (`text-xs`,
                  16px), the date (`text-lg/tight`, 22.5px) and the label
                  (`text-xs/tight`, 15px), so the strip is the row's height. */}
              <div
                data-testid="crew-loading-day-row"
                className="mb-4 grid grid-cols-4 items-stretch gap-2"
              >
                {DAY_SLOTS.map((slot) => (
                  <div
                    key={slot}
                    className="flex min-h-tap-min flex-col items-center justify-center gap-0.5 rounded-md border border-border px-1 py-2"
                  >
                    <Skeleton className="h-4 w-8" />
                    <Skeleton className="h-5.5 w-6" />
                    <Skeleton className="h-3.75 w-10" />
                  </div>
                ))}
              </div>
              {/* The pass, at its height floor. */}
              <div
                data-testid="crew-loading-pass"
                className="flex min-h-right-now-min-h flex-col items-stretch"
              >
                <Skeleton className="flex-1" />
              </div>
            </div>
            {/* The home body's column, beside the lead from 1024px. Below it the
                home body sits under the pass, past the fold the skeleton holds. */}
            <div
              data-testid="crew-loading-home-body"
              className="hidden min-w-0 flex-col gap-4 lg:flex lg:flex-1"
            >
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          </div>

          {/* "All sections" list block, below 1024px. */}
          <div data-testid="crew-loading-list" className="flex flex-col gap-3 lg:hidden">
            <Skeleton className="h-5 w-28" />
            <div className="overflow-hidden rounded-md border border-border bg-surface shadow-tile">
              {LIST_IDS.map((id) => (
                <div
                  key={id}
                  data-testid="crew-loading-list-row"
                  className="flex min-h-tap-min items-center gap-3 border-t border-border px-4 py-3 first:border-t-0"
                >
                  <Skeleton className="size-7 shrink-0" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-sm font-semibold text-text-faint">
                      {crewSectionLabel(id)}
                    </span>
                    <Skeleton className="h-3 w-32" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Stacked section frame, 1024px and up. */}
          <div data-testid="crew-loading-stack" className="hidden flex-col gap-section-gap lg:flex">
            <div data-testid="crew-loading-section" className="flex flex-col gap-4">
              <Skeleton className="h-5 w-32" />
              <div className="min-h-right-now-min-h rounded-lg border border-border bg-surface-sunken" />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
