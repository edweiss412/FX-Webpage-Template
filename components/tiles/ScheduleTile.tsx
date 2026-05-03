/**
 * components/tiles/ScheduleTile.tsx — per-show schedule tile (M4 Task 4.5;
 * spec §8.1, AC-4.6).
 *
 * The viewer's per-day schedule. Reads:
 *   - `props.show.dates` — { travelIn, set, showDays[], travelOut } from
 *     ShowRow (lib/parser/types.ts:92-97). The tile aggregates these
 *     into a single chronological list of days, each tagged with its
 *     phase (Travel In / Set / Show / Travel Out).
 *   - `props.dateRestriction` — DateRestriction from
 *     getShowForViewer.crewMembers[*].dateRestriction. Three branches
 *     per spec §8.1:
 *
 *       kind: 'unknown_asterisk'
 *         → tile renders the "your schedule isn't confirmed yet"
 *           placeholder. ZERO per-day rows. AC-4.6 contract: a viewer
 *           with the *** marker on their crew row MUST NOT see which
 *           days the show is on (the asterisk is the operator's signal
 *           that they haven't told us yet which days the crew member
 *           is staffed for).
 *
 *       kind: 'explicit'
 *         → tile renders ONLY the days listed in
 *           dateRestriction.days[]. The intersection of show.dates and
 *           dateRestriction.days is what's shown — if the operator
 *           lists a day NOT present in show.dates, it's silently
 *           dropped (the parser's job to keep these consistent).
 *
 *       kind: 'none'
 *         → tile renders ALL show.dates entries.
 *
 * Empty-state discipline (spec §8.3):
 *   - kind === 'none' AND show has no dates at all → required-field
 *     EmptyState ("Doug hasn't filled this in yet"). The dates block is
 *     structural, not optional — a show with no dates is broken data,
 *     not "this viewer has no days."
 *   - kind === 'explicit' AND days[] is empty (or no day intersects
 *     show.dates) → same required-field EmptyState. An explicit
 *     restriction with zero days is a configuration bug, not a valid
 *     "this viewer works zero days" state.
 *   - kind === 'unknown_asterisk' → never an empty state per se; the
 *     unconfirmed-days placeholder IS the body.
 *
 * Each day row carries `data-testid="schedule-day"` AND
 * `data-day="<ISO YYYY-MM-DD>"` so e2e tests can pin exact identity
 * without coupling to locale-formatted display text.
 *
 * The unconfirmed placeholder carries
 * `data-testid="schedule-day-unconfirmed"` so the AC-4.6 test can find
 * it without scanning prose.
 *
 * Server Component (no `'use client'`).
 */
import type { DateRestriction, ShowRow } from "@/lib/parser/types";
import { Section } from "@/components/atoms/Section";
import { EmptyState } from "@/components/atoms/EmptyState";
import { formatIsoDate } from "@/lib/format/date";

type SchedulePhase = "Travel In" | "Set" | "Show" | "Travel Out";

type ScheduleDay = {
  /** ISO 'YYYY-MM-DD'. */
  date: string;
  /** Phase tag — what's happening on this day. */
  phase: SchedulePhase;
};

type ScheduleTileProps = {
  show: Pick<ShowRow, "dates">;
  dateRestriction: DateRestriction;
};

/**
 * Aggregate ShowRow.dates into a chronological list of (date, phase) rows,
 * deduped by date. If two phases land on the same date, the earlier
 * phase in the workflow wins as the displayed tag (Travel In > Set >
 * Show > Travel Out — chronological by definition); subsequent phases
 * are dropped from the visible row but the row itself is still rendered
 * once. (Compound days like Show+Strike are PackListTile's domain — Task
 * 4.9 — not this tile's.)
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
  // Sort ASC by ISO date (lexical sort works for YYYY-MM-DD).
  return [...seen.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, phase]) => ({ date, phase }));
}

export function ScheduleTile({ show, dateRestriction }: ScheduleTileProps) {
  // Branch 1 — unknown_asterisk. Render the placeholder copy and STOP.
  // Per spec §8.1 / AC-4.6 the viewer MUST NOT see the show's day list
  // while their own days are unconfirmed.
  if (dateRestriction.kind === "unknown_asterisk") {
    return (
      <Section
        testId="schedule-tile"
        heading="My schedule"
        headingTone="eyebrow"
        ariaLabel="My schedule"
        bodyAs="div"
      >
        <div
          data-testid="schedule-day-unconfirmed"
          className="rounded-sm bg-surface-sunken px-3 py-3 text-sm text-text-subtle"
        >
          Your days haven&apos;t been confirmed yet. Check back after Doug
          finalizes the schedule.
        </div>
      </Section>
    );
  }

  const allDays = aggregateDays(show.dates);

  // Branch 2 — explicit. Filter to the intersection of show.dates and
  // dateRestriction.days[]. If the parser emitted explicit days that
  // don't overlap any show.date, we treat that as a configuration bug
  // and render the required-field placeholder rather than an empty
  // list (silent drop would mislead the viewer).
  let visibleDays: ScheduleDay[];
  if (dateRestriction.kind === "explicit") {
    const allowed = new Set(dateRestriction.days);
    visibleDays = allDays.filter((d) => allowed.has(d.date));
  } else {
    // Branch 3 — none. All days visible.
    visibleDays = allDays;
  }

  // Empty-state branch — see file-header doc above.
  if (visibleDays.length === 0) {
    return (
      <Section
        testId="schedule-tile"
        heading="My schedule"
        headingTone="eyebrow"
        ariaLabel="My schedule"
        bodyAs="div"
      >
        <EmptyState />
      </Section>
    );
  }

  return (
    <Section
      testId="schedule-tile"
      heading="My schedule"
      headingTone="eyebrow"
      ariaLabel="My schedule"
      bodyAs="div"
    >
      <ol className="flex flex-1 flex-col gap-2">
        {visibleDays.map((day) => (
          <li
            key={day.date}
            data-testid="schedule-day"
            data-day={day.date}
            className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-2 last:border-b-0 last:pb-0"
          >
            {/*
              Date column — tabular figures default-on for <time> via
              app/globals.css. Strong tone on the day label so the
              chronological column scans cleanly.
            */}
            <time
              dateTime={day.date}
              className="text-sm font-semibold text-text-strong"
            >
              {formatIsoDate(day.date, "weekday-short")}
            </time>
            <span className="text-xs uppercase tracking-[0.12em] text-text-faint">
              {day.phase}
            </span>
          </li>
        ))}
      </ol>
    </Section>
  );
}
