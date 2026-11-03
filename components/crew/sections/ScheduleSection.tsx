/**
 * components/crew/sections/ScheduleSection.tsx — crew-redesign §9 "Schedule"
 * section. Synchronous Server Component for the Schedule section body.
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
 * The agenda (the "View agenda" PDFs and their structured schedule) is not here:
 * it moved to its own section, components/crew/sections/AgendaSection.tsx (crew
 * page redesign PR B, Task 10, spec §6.2 `agenda` row).
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
import { SectionCard } from "@/components/crew/primitives/SectionCard";
import { CardHeaderActions } from "@/components/crew/primitives/CardHeaderActions";
import { DEFAULT_CARD_REPORT, type CardReportContext } from "@/lib/crew/cardReportContext";
import { CARD_REGION_MAP } from "@/lib/sheet-links/buildSheetDeepLink";
import { ClockIcon } from "@/components/crew/icons/sectionIcons";
import { SectionTileError } from "@/components/crew/SectionTileError";
import { KeyTimesStrip } from "@/components/crew/primitives/KeyTimesStrip";
import { RunOfShowList } from "@/components/crew/primitives/RunOfShowList";
import { EmptyState } from "@/components/atoms/EmptyState";
import { WrappedSection } from "@/components/crew/WrappedSection";
import { resolveKeyTimes } from "@/lib/crew/resolveKeyTimes";
import { RUN_OF_SHOW_DISPLAY_CAP } from "@/lib/crew/agendaDisplay";
import {
  keyTimeEntries,
  scheduleDayRows,
  scheduleVisibleDays,
  SCHEDULE_CALL_TIMES_REGION,
  SCHEDULE_CALL_TIMES_TITLE,
} from "@/components/crew/sections/scheduleRows";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import { todayIsoInShowTimezone } from "@/lib/visibility/packList";
import { transportTileVisible } from "@/lib/visibility/scopeTiles";
import { type TileRenderLedger } from "@/lib/crew/tileRenderLedger";
import { suppressesDates } from "@/lib/crew/dateSuppression";

// Preserve the public export surface after the run-of-show predicates/renderer
// were extracted to @/lib/crew/agendaDisplay + @/components/crew/primitives/
// RunOfShowList (pure move). Existing consumers (e.g. the §9 caps test) import
// RUN_OF_SHOW_DISPLAY_CAP from this module; re-export it so the move is API-
// preserving and the shared module stays the single source of truth.
export { RUN_OF_SHOW_DISPLAY_CAP };

type ScheduleSectionProps = {
  data: ShowForViewer;
  viewer: Viewer;
  today: Date;
  showId: string;
  /** Per-request tile ledger, threaded from _CrewShell. */
  ledger: TileRenderLedger;
  cardReport?: CardReportContext | null;
};

export function ScheduleSection({
  data,
  viewer,
  today,
  showId,
  ledger,
  cardReport = DEFAULT_CARD_REPORT,
}: ScheduleSectionProps): JSX.Element {
  // Single canonical viewer resolution: admin → none-restriction;
  // crew/admin_preview → matched row's dateRestriction; malformed projection
  // throws MalformedProjectionError (INTENTIONALLY outside WrappedSection so the
  // route-level infra arm catches it, not the per-block fallback).
  const { dateRestriction, isAdmin, stageRestriction } = resolveViewerContext(viewer, data);

  // §9.6 load-out trust boundary: the Pick Up Venue–derived load-out entry is
  // gated EXACTLY like the Travel section's transport tile (admin → always;
  // assigned driver / schedule-tagged crew → yes; unassigned crew → no). Strike
  // entries are room-sourced (ungated) and the SET entries are plain agenda, so
  // scheduleEntriesForViewer only ever drops kind:"loadout" when this is false.
  const transportVisible = transportTileVisible({
    transportation: data.transportation,
    viewerId: data.viewerId,
    transportationOwnerIds: data.transportationOwnerIds,
    viewerName: data.viewerName,
    viewerNameAliases: data.viewerNameAliases,
    isAdmin,
  });

  const anchors = resolveKeyTimes(
    data.show,
    data.rooms,
    data.runOfShow,
    dateRestriction,
    stageRestriction,
  );

  // §4.13 mechanism #3 — active-section FETCH-error visual fallback. The
  // KeyTimesStrip anchors are derived from data.rooms (scope shown to all →
  // effectively ungated); a rooms fetch error surfaces an inline degraded block
  // to admin and an omission to crew. NO upsertAdminAlert (the _CrewShell
  // projection alert is the sole producer).
  const roomsFetchFailed = Boolean(data.tileErrors["rooms"]) && isAdmin;

  // Privacy trust boundary — unknown_asterisk leaks ZERO dates. Render ONLY the
  // placeholder and STOP before building the day list (testid does NOT start
  // with "schedule-day", so the prefix-counting selector reads 0 cards).
  if (suppressesDates(dateRestriction)) {
    return (
      <div data-testid="section-schedule" className="flex flex-col gap-4">
        <div
          data-testid="schedule-unconfirmed"
          data-search-skip=""
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
        ledger={ledger}
        tileId="crew:schedule:days"
        showId={showId}
        sheetName={data.show.title}
        render={() => {
          // Inside the callback, so a fault reading `dates.showDays` (the projection CASTS the
          // jsonb rather than validating it) is this boundary's: it records the ledger entry and
          // renders the tile fallback.
          const visibleDays = scheduleVisibleDays(data, dateRestriction);

          const todayIso = todayIsoInShowTimezone(data.show, today);

          // §4.9 mock `split-wide`: once split (`@min-crew-split`) it is two columns — LEFT
          // the day-card list (primary, wider via the 1.6fr track), RIGHT the
          // "Crew Schedule" SectionCard THEN (admin) the rooms-fetch degraded
          // tile, stacked. Narrower it collapses to a single column (grid-cols-1)
          // with the left column first, then the right column. The grid uses
          // `items-start` (NOT the default stretch) so the SHORT right column
          // ("Crew Schedule", ~3 rows) takes its natural height instead of
          // stretching to match the tall day list and leaving dead space below it
          // (2026-06-21 owner amendment — see v1-pre-deployment-amendments). Each
          // column carries `min-w-0` so long day/anchor strings wrap instead of
          // overflowing 390px.
          //
          // One-sided collapse (Task 4 §6 / Codex plan R2, mirrors Crew Task 8):
          // when the RIGHT column would have NO content — no "Crew Schedule"
          // card (all anchors absent → KeyTimesStrip null) AND no rooms-error
          // tile — the 2-track grid would leave a BLANK right column when split.
          // In that case the wrapper falls back to `flex flex-col` so the days
          // column spans full width. The right-column container is STILL emitted
          // (empty, zero-height) so the `data-schedule-column="times"` anchor-
          // floor contract holds (ScheduleSection.anchorFloor.test.tsx).
          const hasTimesCard = Object.values(anchors).some((v) => v != null);
          const days = scheduleDayRows({ data, visibleDays, todayIso, transportVisible });
          const callTimes = keyTimeEntries(
            "schedule",
            SCHEDULE_CALL_TIMES_REGION,
            SCHEDULE_CALL_TIMES_TITLE,
            anchors,
          );
          const rightHasContent = hasTimesCard || roomsFetchFailed;
          return (
            <div
              data-testid="schedule-grid"
              className={
                rightHasContent
                  ? "grid grid-cols-1 gap-4 @min-crew-split:grid-cols-[1.6fr_1fr] @min-crew-split:items-start"
                  : "flex flex-col gap-4"
              }
            >
              <div
                data-testid="schedule-column"
                data-schedule-column="days"
                data-card-id="schedule-days"
                className="min-w-0"
              >
                {/* The Schedule day-cards are not wrapped in a SectionCard shell,
                    so the card actions sit in a flush, right-aligned header above
                    the day list. Rendered UNCONDITIONALLY: `CardHeaderActions`
                    always emits the per-card report trigger (and the "In sheet"
                    link when a link exists), so the header band is never empty —
                    matching the other 22 source-backed cards, whose SectionCard
                    header always carries the actions cluster. The
                    `section-card-action` slot keeps it discoverable by the §12
                    coverage walker, matching the SectionCard header contract. */}
                <div className="mb-2 flex justify-end">
                  <div data-slot="section-card-action" className="flex shrink-0 items-center">
                    <CardHeaderActions
                      cardId="schedule-days"
                      driveFileId={data.driveFileId}
                      anchor={data.sourceAnchors[CARD_REGION_MAP["schedule-days"]]}
                      showId={showId}
                      cardReport={cardReport}
                      // CARDREPORT-1: this bare header is NOT a SectionCard — the
                      // section's heading (or the sheet's header) sits just above it
                      // and the non-interactive day list below. Grow the tap overlays
                      // DOWN so they clear what is above (the agenda area sat there
                      // until it moved to its own section, PR B Task 10). (Every
                      // SectionCard-hosted cluster keeps the "up" default; see the
                      // schedule-call-times SectionCard below.)
                      hitDirection="down"
                    />
                  </div>
                </div>
                {visibleDays.length === 0 ? (
                  <EmptyState label="Show dates haven't been confirmed yet." />
                ) : (
                  <div className="flex flex-col gap-2">
                    {days.rows.map((row) => {
                      const { day, isToday, meta, runOfShow } = row;
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
                          <DayCard
                            day={day.date}
                            phase={day.phase}
                            today={isToday}
                            meta={meta}
                            label={day.label}
                            {...(row.dayCardTarget !== undefined
                              ? { searchTarget: row.dayCardTarget }
                              : {})}
                          />
                          {/* Gate on the per-viewer (load-out-gated) DISPLAYABLE
                              count, not the raw stored count: a day whose entries
                              are all URL-only (stripped title → "") OR only a
                              gated-out load-out has zero entries → no run-of-show
                              container → the Phase-1 anchor floor shows. */}
                          {runOfShow != null ? (
                            <RunOfShowList
                              entries={runOfShow}
                              isoDate={day.date}
                              searchTargets={row.runOfShowTargets}
                            />
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
                {/* Wrap the key-times in the "Crew Schedule" card so the right
                    column reads as a card (matching the left). With `items-start`
                    the card takes its natural height. Render NO card when all
                    anchors are absent — no empty shell. (Renamed from "Daily call
                    times": the card carries the call anchor AND the run-of-show
                    entries, not just call times.) */}
                {hasTimesCard ? (
                  <div data-card-id="schedule-call-times">
                    <SectionCard
                      icon={<ClockIcon />}
                      title={SCHEDULE_CALL_TIMES_TITLE}
                      action={
                        <CardHeaderActions
                          cardId="schedule-call-times"
                          driveFileId={data.driveFileId}
                          anchor={data.sourceAnchors[CARD_REGION_MAP["schedule-call-times"]]}
                          showId={showId}
                          cardReport={cardReport}
                        />
                      }
                    >
                      <KeyTimesStrip anchors={anchors} searchTargets={callTimes.targets} />
                    </SectionCard>
                  </div>
                ) : null}
                {roomsFetchFailed ? <SectionTileError domain="rooms" /> : null}
              </div>
            </div>
          );
        }}
      />
    </div>
  );
}
