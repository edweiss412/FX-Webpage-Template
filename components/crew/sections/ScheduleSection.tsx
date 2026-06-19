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
import type { AgendaEntry, ShowRow } from "@/lib/parser/types";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";
import { stripAgendaUrls } from "@/lib/visibility/agendaUrls";
import { todayIsoInShowTimezone } from "@/lib/visibility/packList";

// NOTE: the display-cap const (RUN_OF_SHOW_DISPLAY_CAP) and the title-truncation
// const (TITLE_TRUNCATE_AT) are NOT declared here — they ship in Task 3 alongside
// their failing tests (TDD per task / invariant 1). Task 2 renders ALL displayable
// entries untruncated.

/**
 * Resolve an optional agenda field for display: URL-strip it, then hide it if
 * the residue is a generic sentinel ('' / TBD / N/A / TBA). Returns null when
 * the field should not render (the entry still renders iff its title is real,
 * which the parser/decoder already guarantee).
 */
function resolveOptionalField(value: string | undefined): string | null {
  if (value == null) return null;
  const stripped = stripAgendaUrls(value);
  if (shouldHideGenericOptional(stripped)) return null;
  return stripped;
}

/**
 * The parser/decoder prove the title REAL on the RAW value — but a raw title can
 * be a URL (non-empty, non-sentinel → it passes both gates), and stripAgendaUrls
 * reduces a URL-only title to "". So RE-validate the title AFTER stripping: an
 * entry whose stripped title is empty-or-sentinel is NOT displayable (it would
 * otherwise render a blank agenda-entry row). This is the single source of truth
 * for "is this entry renderable" — both the per-day mode gate and RunOfShowList
 * filter through it, so the mode/container key off the DISPLAYABLE count, not the
 * raw stored count.
 */
function isDisplayableEntry(entry: AgendaEntry): boolean {
  return !shouldHideGenericOptional(stripAgendaUrls(entry.title));
}

/** The entries of a day that actually render (stripped-title-real), sheet order. */
function displayableEntries(entries: AgendaEntry[] | undefined): AgendaEntry[] {
  return (entries ?? []).filter(isDisplayableEntry);
}

/**
 * One run-of-show row (spec §4.3 shape). Surfaces ALL six AgendaEntry fields:
 * the time group `START–FINISH · TRT` (each part sentinel-guarded), the required
 * real TITLE, then the ROOM + AV-badge metadata when present.
 */
function RunOfShowEntry({ entry }: { entry: AgendaEntry }): JSX.Element {
  // Title is URL-stripped (free text could paste a link). The caller only passes
  // DISPLAYABLE entries (isDisplayableEntry — stripped title is real), so the
  // stripped title here is guaranteed non-empty and renders. (Title display-
  // truncation is added in Task 3 as its own red→green TDD step — NOT here.)
  const title = stripAgendaUrls(entry.title);
  const start = resolveOptionalField(entry.start) ?? "";
  const finish = resolveOptionalField(entry.finish);
  const trt = resolveOptionalField(entry.trt);
  const room = resolveOptionalField(entry.room);
  const av = resolveOptionalField(entry.av);
  // Time group (spec §4.3 row shape): START–FINISH with the TRT duration as a
  // middot-joined suffix when present (e.g. "7:15 AM–7:30 AM · 0:15"). Each part
  // is sentinel-guarded via resolveOptionalField, so a TBD/blank trt/finish drops
  // out without leaving an orphan separator.
  const range = finish ? `${start}–${finish}` : start;
  const timeLabel = trt ? (range ? `${range} · ${trt}` : trt) : range;

  return (
    <li data-testid="agenda-entry" className="flex flex-col gap-0.5 py-1">
      <div className="flex items-baseline gap-2">
        {timeLabel ? (
          <span
            data-agenda-field="time"
            className="shrink-0 text-xs font-semibold tabular-nums text-text-subtle"
          >
            {timeLabel}
          </span>
        ) : null}
        <span className="min-w-0 text-sm font-medium text-text-strong">{title}</span>
      </div>
      {room || av ? (
        <div className="flex items-center gap-2 text-xs text-text-subtle">
          {room ? <span data-agenda-field="room">{room}</span> : null}
          {av ? (
            <span
              data-agenda-field="av"
              className="rounded-xs bg-surface-sunken px-1.5 py-0.5 font-medium uppercase tracking-eyebrow"
            >
              {av}
            </span>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/**
 * Per-day run-of-show list. Renders the DISPLAYABLE entries (stripped-title-real)
 * in sheet order. The caller already gates on displayableEntries(...).length > 0,
 * so `display` here is non-empty. (The §4.3 display cap + `+N more` overflow stub
 * are added in Task 3 as their own red→green TDD step — this Task-2 version renders
 * ALL displayable entries untruncated; Task 2's tests use ≤ cap entries so the
 * absence of a cap is not a hidden behavior.)
 */
function RunOfShowList({ entries, isoDate }: { entries: AgendaEntry[]; isoDate: string }): JSX.Element {
  const display = displayableEntries(entries);
  return (
    <div data-testid={`run-of-show-${isoDate}`} className="mt-2 flex flex-col">
      <ul className="flex flex-col divide-y divide-border-subtle">
        {display.map((entry, i) => (
          <RunOfShowEntry key={i} entry={entry} />
        ))}
      </ul>
    </div>
  );
}

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
                      // `^="schedule-day"` prefix selector the tests count. `data-day`
                      // (always) + `data-today` (today only) expose the frozen-clock
                      // today-marking to the screenshot clock-pipeline e2e, which reads
                      // the today card's ISO date out of the server-rendered HTML.
                      return (
                        <div
                          key={day.date}
                          data-testid={isToday ? "schedule-day-today" : `schedule-day-${day.date}`}
                          data-day={day.date}
                          {...(isToday ? { "data-today": "true" } : {})}
                        >
                          <DayCard day={day.date} phase={day.phase} today={isToday} />
                          {/* Gate on the DISPLAYABLE count, not the raw stored
                              count: a day whose entries are all URL-only (stripped
                              title → "") has zero displayable entries → no
                              run-of-show container → the Phase-1 anchor floor shows. */}
                          {displayableEntries(data.runOfShow?.[day.date]).length > 0 ? (
                            <RunOfShowList entries={data.runOfShow![day.date]!} isoDate={day.date} />
                          ) : null}
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
