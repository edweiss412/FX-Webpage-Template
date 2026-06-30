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

import { AgendaEmbed } from "@/components/agenda/AgendaEmbed";
import { AgendaScheduleBlock } from "@/components/crew/AgendaScheduleBlock";
import { agendaDisplayLabel } from "@/lib/agenda/agendaLabel";
import { DayCard } from "@/components/crew/primitives/DayCard";
import { SectionCard } from "@/components/crew/primitives/SectionCard";
import { SourceLink } from "@/components/crew/primitives/SourceLink";
import { buildSheetDeepLink, CARD_REGION_MAP } from "@/lib/sheet-links/buildSheetDeepLink";
import { ClockIcon } from "@/components/crew/icons/sectionIcons";
import { SectionTileError } from "@/components/crew/SectionTileError";
import { KeyTimesStrip } from "@/components/crew/primitives/KeyTimesStrip";
import { RunOfShowList } from "@/components/crew/primitives/RunOfShowList";
import { EmptyState } from "@/components/atoms/EmptyState";
import { WrappedSection } from "@/components/crew/WrappedSection";
import { resolveKeyTimes } from "@/lib/crew/resolveKeyTimes";
import {
  aggregateDays,
  scheduleEntriesForViewer,
  formatScheduleWindow,
  resolveOptionalField,
  visibleShowDays,
  RUN_OF_SHOW_DISPLAY_CAP,
  type AggregateDay,
} from "@/lib/crew/agendaDisplay";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import { todayIsoInShowTimezone } from "@/lib/visibility/packList";
import { transportTileVisible } from "@/lib/visibility/scopeTiles";

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

  // §9.6 load-out trust boundary: the Pick Up Venue–derived load-out entry is
  // gated EXACTLY like the Travel section's transport tile (admin → always;
  // assigned driver / schedule-tagged crew → yes; unassigned crew → no). Strike
  // entries are room-sourced (ungated) and the SET entries are plain agenda, so
  // scheduleEntriesForViewer only ever drops kind:"loadout" when this is false.
  const transportVisible = transportTileVisible({
    transportation: data.transportation,
    viewerName: data.viewerName,
    isAdmin,
  });

  const anchors = resolveKeyTimes(data.show, data.rooms, data.runOfShow, dateRestriction);

  // §4.13 mechanism #3 — active-section FETCH-error visual fallback. The
  // KeyTimesStrip anchors are derived from data.rooms (scope shown to all →
  // effectively ungated); a rooms fetch error surfaces an inline degraded block
  // to admin and an omission to crew. NO upsertAdminAlert (the _CrewShell
  // projection alert is the sole producer).
  const roomsFetchFailed = Boolean(data.tileErrors["rooms"]) && isAdmin;

  // §4.6/§4.8 — the agenda area is the authoritative schedule overview and
  // sits at the TOP of the Schedule section, above the day-cards grid. One
  // "View agenda" affordance per fileId-bearing link (AgendaEmbed, multi-doc)
  // plus the structured per-day schedule for any link whose extraction is
  // high-confidence (AgendaScheduleBlock renders nothing for low/malformed).
  // Rendered ONLY when ≥1 link carries a Drive fileId (else the embed is null
  // and the block has nothing to show — no empty area). Deliberately NOT
  // rendered in the unknown_asterisk privacy branch above (that branch leaks
  // ZERO dates and returns before this point).
  const agendaLinks = data.show.agenda_links;
  const hasAgenda = agendaLinks.some((link) => Boolean(link.fileId));
  // Show a per-document label on the structured blocks only when there's more
  // than one agenda PDF (so two "View agenda" buttons + two schedules are
  // distinguishable — impeccable MEDIUM). A single agenda needs no badge.
  const agendaPdfCount = agendaLinks.filter((link) => Boolean(link.fileId)).length;
  const agendaArea = hasAgenda ? (
    <section
      data-testid="agenda-area"
      aria-labelledby="agenda-heading"
      className="flex min-w-0 flex-col gap-3"
    >
      <h2 id="agenda-heading" className="text-sm font-semibold text-text-strong">
        Agenda
      </h2>
      <AgendaEmbed showId={showId} agendaLinks={agendaLinks} />
      {agendaLinks.map((link) =>
        link.fileId && link.extracted ? (
          <AgendaScheduleBlock
            key={link.fileId}
            extraction={link.extracted}
            label={agendaPdfCount > 1 ? agendaDisplayLabel(link.label) : null}
          />
        ) : null,
      )}
    </section>
  ) : null;

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
      {agendaArea}
      <WrappedSection
        tileId="crew:schedule:days"
        showId={showId}
        sheetName={data.show.title}
        render={() => {
          // Intersect the restriction against the FULL aggregate (travel / set /
          // showDays / travelOut — not just showDays).
          const allDays = aggregateDays(data.show.dates);
          // visibleShowDays is the SINGLE SOURCE for the SHOW-DAY ∩ restriction set;
          // the full schedule list also shows travel/set/strike, so for explicit we
          // intersect the FULL aggregate against (restriction.days) — but the show-day
          // SUBSET of that intersection MUST equal visibleShowDays(...) (drift guard).
          const allowedShowDays = new Set(visibleShowDays(data.show.dates, dateRestriction));
          const visibleDays: AggregateDay[] =
            dateRestriction.kind === "explicit"
              ? allDays.filter(
                  (d) => allowedShowDays.has(d.date) || dateRestriction.days.includes(d.date),
                )
              : allDays; // kind === 'none'

          const todayIso = todayIsoInShowTimezone(data.show, today);

          // §4.9 mock `split-wide`: at ≥720px the section is two columns — LEFT
          // the day-card list (primary, wider via the 1.6fr track), RIGHT the
          // "Crew Schedule" SectionCard THEN (admin) the rooms-fetch degraded
          // tile, stacked. <720px it collapses to a single column (grid-cols-1)
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
          // tile — the 2-track grid would leave a BLANK right column at ≥720px.
          // In that case the wrapper falls back to `flex flex-col` so the days
          // column spans full width. The right-column container is STILL emitted
          // (empty, zero-height) so the `data-schedule-column="times"` anchor-
          // floor contract holds (ScheduleSection.anchorFloor.test.tsx).
          const hasTimesCard = Object.values(anchors).some((v) => v != null);
          const rightHasContent = hasTimesCard || roomsFetchFailed;
          return (
            <div
              data-testid="schedule-grid"
              className={
                rightHasContent
                  ? "grid grid-cols-1 gap-4 min-[720px]:grid-cols-[1.6fr_1fr] min-[720px]:items-start"
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
                    so the source link sits in a flush, right-aligned header above
                    the day list — rendered only when a link exists (no empty
                    header band). The `section-card-action` slot keeps it discover-
                    able by the §12 coverage walker, matching the SectionCard
                    header contract. */}
                {buildSheetDeepLink(
                  data.driveFileId,
                  data.sourceAnchors[CARD_REGION_MAP["schedule-days"]],
                ) !== null ? (
                  <div className="mb-2 flex justify-end">
                    <div data-slot="section-card-action" className="flex shrink-0 items-center">
                      <SourceLink
                        driveFileId={data.driveFileId}
                        anchor={data.sourceAnchors[CARD_REGION_MAP["schedule-days"]]}
                      />
                    </div>
                  </div>
                ) : null}
                {visibleDays.length === 0 ? (
                  <EmptyState label="Show dates haven't been confirmed yet." />
                ) : (
                  <div className="flex flex-col gap-2">
                    {visibleDays.map((day) => {
                      const isToday = day.date === todayIso;
                      const sd = data.runOfShow?.[day.date] ?? null; // types.ScheduleDay | null
                      const isSetDay = day.phase === "Set";
                      // EVERY meta source is routed through resolveOptionalField (strips
                      // URLs + hides 'TBD'/'N/A'/'TBA' sentinels). The file-level sentinel
                      // meta-test (Task 15) is VACUOUS for ScheduleSection (the import is
                      // already present for other fields), so THIS per-value guard + the
                      // behavioral tests are the real enforcement for showStart/window/
                      // setupTime (plan-review R5 finding).
                      const guardMeta = (v: string | null | undefined): string | undefined =>
                        resolveOptionalField(v ?? undefined) ?? undefined;
                      // Per-viewer schedule entries (§9.6): displayable minus a
                      // gated-out load-out. Drives BOTH the SET-meta suppression
                      // and the per-day run-of-show gate/render below, so a day
                      // whose only synthetic entry is a hidden load-out neither
                      // opens a container nor suppresses the meta for that viewer.
                      const dayEntries = scheduleEntriesForViewer(sd?.entries, {
                        transportVisible,
                      });
                      let meta: string | undefined;
                      if (isSetDay) {
                        // §6/§9.1: when the SET day carries displayable run-of-show
                        // entries (the synthesized Load In/Setup), the RunOfShowList
                        // renders them below — suppress the standalone "Setup <time>"
                        // meta to avoid double-printing setupTime. Guard the RAW
                        // setupTime FIRST, THEN prefix (plan-review R6).
                        const t =
                          dayEntries.length > 0 ? null : guardMeta(data.show.dates.setupTime);
                        meta = t != null ? `Setup ${t}` : undefined;
                      } else if (sd?.window != null) {
                        meta = guardMeta(formatScheduleWindow(sd.window));
                      } else if (sd != null && sd.showStart != null && sd.entries.length === 0) {
                        meta = guardMeta(sd.showStart); // fragment day: single showStart
                      }
                      // titled day (entries.length > 0) → meta stays undefined; the
                      // RunOfShowList renders below instead.
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
                          <DayCard day={day.date} phase={day.phase} today={isToday} meta={meta} />
                          {/* Gate on the per-viewer (load-out-gated) DISPLAYABLE
                              count, not the raw stored count: a day whose entries
                              are all URL-only (stripped title → "") OR only a
                              gated-out load-out has zero entries → no run-of-show
                              container → the Phase-1 anchor floor shows. */}
                          {dayEntries.length > 0 ? (
                            <RunOfShowList entries={dayEntries} isoDate={day.date} />
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
                      title="Crew Schedule"
                      action={
                        <SourceLink
                          driveFileId={data.driveFileId}
                          anchor={data.sourceAnchors[CARD_REGION_MAP["schedule-call-times"]]}
                        />
                      }
                    >
                      <KeyTimesStrip anchors={anchors} />
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
