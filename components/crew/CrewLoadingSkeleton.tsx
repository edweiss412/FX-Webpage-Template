import { Skeleton, SkeletonText } from "@/components/layout/Skeleton";
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
 *   - below 1024px: the header (a two-line eyebrow and title, the pill, the
 *     date) with its search row, the day-row strip, a typical pass's block, the
 *     quick facts, then the "All sections" list block;
 *   - from 1024px: the header sticky at `--crew-sticky-top`, `--crew-header-h`
 *     tall, the title block with twice the search slot's share, the 240px left nav
 *     column, and beside it the Today block (the day row and pass beside a home
 *     body column) over one stacked section frame.
 * The saved-copy bar (components/offline/SavedCopyBar.tsx) renders between the
 * header and the body, and the server renders it hidden, a zero-height region,
 * in every state but `sheet-gone`; the skeleton reserves that zero. A sheet-gone
 * page's bar cannot be reserved: this file renders before the projection that
 * says the sheet is gone. The nav column reads `--crew-sticky-bottom`, the same
 * edge the live nav reads, which takes in the bar's height while it shows.
 * The header bar, its row, its title block and each of that block's lines, the
 * search slot and the nav column carry the real components' class lists
 * verbatim (`components/layout/Header.tsx`,
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
          {/* The title block, with the live header's classes (`Header.tsx`) on
              every line's element, so each line box is the loaded line's height.
              Below 640px it reserves a two-line eyebrow and a two-line title (the
              common case for a sheet's client, venue and show names on a phone,
              UI-gate re-run P3-2), each a forced break between short words that
              fit the narrowest title block; from 640px one line each. The pill
              takes its own row under the title, as a long title pushes it there;
              from 1024px the bar is a fixed height and the grid places it. */}
          <div
            data-testid="crew-loading-title-block"
            className="min-w-0 flex-1 lg:grid lg:flex-[2_1_0%] lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-x-2 lg:gap-y-1"
          >
            <p
              data-testid="crew-loading-eyebrow"
              className="text-xs font-medium uppercase tracking-eyebrow text-text-subtle lg:truncate lg:col-start-1"
            >
              <SkeletonText>Client name</SkeletonText>
              <br className="sm:hidden" /> <SkeletonText>Venue name</SkeletonText>
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 lg:contents">
              <p
                data-testid="crew-loading-title"
                className="basis-full text-base font-semibold leading-tight tracking-tight text-text-strong sm:text-lg lg:col-span-2 lg:min-w-0 lg:basis-auto lg:truncate"
              >
                <SkeletonText>Show title</SkeletonText>
                <br className="sm:hidden" /> <SkeletonText>on two lines</SkeletonText>
              </p>
              <span
                aria-hidden="true"
                className="shrink-0 lg:col-start-2 lg:row-start-1 lg:justify-self-end"
              >
                <span className="inline-flex animate-pulse items-center rounded-pill border border-transparent bg-surface-sunken px-2 py-0.5 text-xs font-semibold uppercase tracking-eyebrow text-transparent motion-reduce:animate-none">
                  Show day 1 of 2
                </span>
              </span>
            </div>
            <p
              data-testid="crew-loading-date"
              className="mt-1 text-xs text-text-subtle lg:col-span-2 lg:mt-0"
            >
              <span className="font-medium">
                <SkeletonText>April 20, 2026</SkeletonText>
              </span>
            </p>
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
          className="sticky top-(--crew-sticky-bottom) hidden h-[calc(100dvh-var(--crew-sticky-bottom))] w-60 shrink-0 flex-col gap-1 self-start overflow-y-auto border-r border-border py-6 pr-3 lg:flex"
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
              {/* The pass, at a typical pass's height with its facts rather than
                  its floor (critique N4: 176px against a loaded 289 to 339). */}
              <div
                data-testid="crew-loading-pass"
                className="flex min-h-pass-typical flex-col items-stretch"
              >
                <Skeleton className="flex-1" />
              </div>
              {/* Below 1024px the quick facts follow the pass, as they do on the
                  loaded home (critique N4): a heading and two rows of two tiles. */}
              <div
                data-testid="crew-loading-quick-facts"
                className="mt-4 flex flex-col gap-3 lg:hidden"
              >
                <p className="text-base font-semibold">
                  <SkeletonText>Quick facts</SkeletonText>
                </p>
                <div className="grid grid-cols-2 items-stretch gap-3">
                  {DAY_SLOTS.map((slot) => (
                    <Skeleton key={slot} className="h-36" />
                  ))}
                </div>
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
