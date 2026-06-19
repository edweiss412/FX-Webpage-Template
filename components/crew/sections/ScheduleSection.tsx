/**
 * components/crew/sections/ScheduleSection.tsx — crew-redesign §9 "Schedule"
 * section. Synchronous Server Component for the Schedule sub-nav surface.
 *
 * Two non-negotiable contracts (§9 tests 32 + 34):
 *
 *   1. DateRestriction privacy trust boundary. The viewer's per-crew
 *      `dateRestriction` (resolved via `resolveViewerContext`) decides which
 *      days the viewer may see. The visible day list is the intersection of
 *      the restriction against the FULL date domain — travelIn / set /
 *      showDays / travelOut, NOT just showDays.
 *
 *        kind: 'unknown_asterisk'  → render ONLY the unconfirmed placeholder.
 *          ZERO day cards, NO date text for ANY phase. The viewer with the
 *          *** marker MUST NOT learn which days the show runs (the asterisk is
 *          the operator's "haven't told us yet" signal). STOP before building
 *          the day list.
 *        kind: 'explicit'          → only days listed in `dateRestriction.days`
 *          that intersect the aggregate (silent-drop of off-aggregate days).
 *        kind: 'none'              → every aggregate day.
 *
 *   2. Timezone today-pin. The card whose ISO date matches
 *      `todayIsoInShowTimezone(data.show, today)` (the SHOW venue timezone, not
 *      UTC) is the pinned-today card: `data-testid="schedule-day-today"` +
 *      `today={true}`. Every other card is `data-testid="schedule-day-<date>"`.
 *      Both forms match the `^="schedule-day"` prefix selector the tests count.
 *
 * Empty visible-day list → required-field EmptyState ("Show dates haven't been
 * confirmed yet." — matches ScheduleTile copy / spec §8.3).
 *
 * `aggregateDays` is ported from ScheduleTile.tsx:93-107 (push travelIn→"Travel
 * In", set→"Set", each showDays[]→"Show", travelOut→"Travel Out"; dedup
 * first-phase-wins; sort ASC by ISO).
 *
 * Synchronous Server Component (no `'use client'`, no `async`, no
 * `next/headers`, no `new Date()` inside). `today` + `showId` are passed in.
 */
import type { JSX } from "react";

import { DayCard } from "@/components/crew/primitives/DayCard";
import { SectionTileError } from "@/components/crew/SectionTileError";
import { KeyTimesStrip } from "@/components/crew/primitives/KeyTimesStrip";
import { EmptyState } from "@/components/atoms/EmptyState";
import { WrappedSection } from "@/components/crew/WrappedSection";
import { resolveKeyTimes } from "@/lib/crew/resolveKeyTimes";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import type { ShowRow } from "@/lib/parser/types";
import { todayIsoInShowTimezone } from "@/lib/visibility/packList";

type SchedulePhase = "Travel In" | "Set" | "Show" | "Travel Out";

type ScheduleDay = {
  /** ISO 'YYYY-MM-DD'. */
  date: string;
  /** Phase tag — what's happening on this day. */
  phase: SchedulePhase;
};

/**
 * Aggregate ShowRow.dates into a chronological list of (date, phase) rows,
 * deduped by date (first phase in the workflow wins), sorted ASC by ISO date.
 * Ported verbatim from ScheduleTile.tsx:93-107.
 */
function aggregateDays(dates: ShowRow["dates"]): ScheduleDay[] {
  const seen = new Map<string, SchedulePhase>();
  const push = (date: string | null, phase: SchedulePhase): void => {
    if (!date) return;
    if (!seen.has(date)) seen.set(date, phase);
  };
  push(dates.travelIn, "Travel In");
  push(dates.set, "Set");
  for (const d of dates.showDays ?? []) push(d, "Show");
  push(dates.travelOut, "Travel Out");
  return [...seen.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, phase]) => ({ date, phase }));
}

type ScheduleSectionProps = {
  data: ShowForViewer;
  viewer: Viewer;
  today: Date;
  showId: string;
};

export function ScheduleSection({
  data,
  viewer,
  today,
  showId,
}: ScheduleSectionProps): JSX.Element {
  // Single canonical viewer resolution: admin → none-restriction;
  // crew/admin_preview → matched row's dateRestriction; malformed projection
  // throws MalformedProjectionError (INTENTIONALLY outside WrappedSection so the
  // route-level infra arm catches it, not the per-block fallback).
  const { dateRestriction, isAdmin } = resolveViewerContext(viewer, data);

  const anchors = resolveKeyTimes(data.show, data.rooms);

  // §4.13 mechanism #3 — active-section FETCH-error visual fallback. The
  // KeyTimesStrip anchors are derived from data.rooms (scope shown to all →
  // effectively ungated); a rooms fetch error surfaces an inline degraded block
  // to admin and an omission to crew. NO upsertAdminAlert (the _CrewShell
  // projection alert is the sole producer).
  const roomsFetchFailed = Boolean(data.tileErrors["rooms"]) && isAdmin;

  // Privacy trust boundary — unknown_asterisk leaks ZERO dates. Render ONLY the
  // placeholder and STOP before building the day list (testid does NOT start
  // with "schedule-day", so the prefix-counting selector reads 0 cards).
  if (dateRestriction.kind === "unknown_asterisk") {
    return (
      <div data-testid="section-schedule" className="flex flex-col gap-4">
        <div
          data-testid="schedule-unconfirmed"
          className="rounded-sm bg-surface-sunken p-3 text-sm text-text-subtle"
        >
          Your days haven&apos;t been confirmed yet. Check back after the schedule is finalized.
        </div>
      </div>
    );
  }

  return (
    <div data-testid="section-schedule" className="flex flex-col gap-4">
      <WrappedSection
        tileId="crew:schedule:days"
        showId={showId}
        sheetName={data.show.title}
        render={() => {
          // Intersect the restriction against the FULL aggregate (travel / set /
          // showDays / travelOut — not just showDays).
          const allDays = aggregateDays(data.show.dates);
          const visibleDays =
            dateRestriction.kind === "explicit"
              ? ((): ScheduleDay[] => {
                  const allowed = new Set(dateRestriction.days);
                  return allDays.filter((d) => allowed.has(d.date));
                })()
              : allDays; // kind === 'none'

          const todayIso = todayIsoInShowTimezone(data.show, today);

          // §4.9 mock `split-wide`: at ≥720px the section is two columns — LEFT
          // the day-card list (primary, wider via the 1.6fr track), RIGHT the
          // Daily-call-times strip THEN the "Heads up" degraded tile, stacked.
          // <720px it collapses to a single column (grid-cols-1) with the left
          // column first, then the right column — day cards above the times +
          // heads-up. CSS grid tracks default to `align-items: stretch`, so the
          // two columns share an equal height at ≥720px without the Tailwind-v4
          // `.flex`-no-stretch trap (DESIGN §7). Each column carries `min-w-0` so
          // long day/anchor strings wrap instead of overflowing 390px.
          return (
            <div className="grid grid-cols-1 gap-4 min-[720px]:grid-cols-[1.6fr_1fr] min-[720px]:items-stretch">
              <div data-testid="schedule-column" data-schedule-column="days" className="min-w-0">
                {visibleDays.length === 0 ? (
                  <EmptyState label="Show dates haven't been confirmed yet." />
                ) : (
                  <div className="flex flex-col gap-2">
                    {visibleDays.map((day) => {
                      const isToday = day.date === todayIso;
                      // DayCard's typed props don't forward `data-testid`, so the testid
                      // lives on a wrapper. The pinned-today card uses the dedicated
                      // testid; every other card carries its date. Both forms match the
                      // `^="schedule-day"` prefix selector the tests count.
                      return (
                        <div
                          key={day.date}
                          data-testid={isToday ? "schedule-day-today" : `schedule-day-${day.date}`}
                        >
                          <DayCard day={day.date} phase={day.phase} today={isToday} />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div
                data-testid="schedule-column"
                data-schedule-column="times"
                className="flex min-w-0 flex-col gap-4"
              >
                <KeyTimesStrip anchors={anchors} />
                {roomsFetchFailed ? <SectionTileError domain="rooms" /> : null}
              </div>
            </div>
          );
        }}
      />
    </div>
  );
}
