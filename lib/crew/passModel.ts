/**
 * lib/crew/passModel.ts — the props of the crew home's pass (crew page redesign
 * spec §4.3), built on the server for `live` and every `day(iso)`.
 *
 * The pass is the dark card under the day row. It keeps the right-now machinery
 * (`selectRightNowState`, the client clock, the transition table); this module is
 * the data side only: the day set, each day's static facts (label, anchor time,
 * fact grid), and the pure status-line helper the live body calls with the client
 * clock. No React, no clock reads; `today` is passed in.
 *
 * What crosses to the client is only what the viewer may see. A viewer whose
 * dates are suppressed gets the state kind alone, never a day, an anchor or a
 * hotel date (spec §4.3, closing the §2.2 leak where `RightNowContext` carried
 * check-in and check-out dates and hid them only at render). The same holds for
 * a show whose dates are incomplete: both are clock-independent degraded states,
 * so the server computes them once and the pass renders them without a clock.
 *
 * Server-safe (pure; no environment reads, no side effects).
 */
import type { DateRestriction, ShowRow } from "@/lib/parser/types";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import { aggregateDays, visibleShowDays, type AggregateDay } from "@/lib/crew/agendaDisplay";
import { suppressesDates } from "@/lib/crew/dateSuppression";
import { reservationForNight } from "@/lib/crew/quickFacts";
import { resolveKeyTimes } from "@/lib/crew/resolveKeyTimes";
import { generalSessionRoomName } from "@/lib/crew/generalSessionRoom";
import { clockToMinutes } from "@/lib/time/clockToMinutes";
import { formatIsoForTimezone, selectRightNowState, type RightNowState } from "@/lib/time/rightNow";
import { hasFullShowDates } from "@/lib/time/showSpan";
import { resolveShowTimezone } from "@/lib/time/showTimezone";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";

/** The countdown runs only for a show start within this many minutes (spec §4.3). */
export const PASS_COUNTDOWN_WINDOW_MINUTES = 180;

/** A leading `M/D`: the value already names its day. */
const LEADING_MONTH_DAY = /^\s*\d{1,2}\/\d{1,2}\b/;

export type PassDayKind = "travel_in" | "travel_in_load_in" | "load_in" | "show" | "travel_out";

/** A labeled time, rendered as the sheet wrote it. */
export type PassTime = { label: "Show" | "Load in" | "Strike"; time: string };

export type PassFactId = "room" | "lead" | "hotel" | "dressCode" | "strike" | "loadIn";

export type PassFact = { id: PassFactId; label: string; value: string };

/** One day's static facts, for `day(iso)` and for the live body on that day. */
export type PassDay = {
  /** ISO `YYYY-MM-DD`. */
  iso: string;
  kind: PassDayKind;
  /** Eyebrow left: "Show day 1 of 2", "Load in", "Travel in", "Travel in, load in", "Travel out". */
  label: string;
  /** Show days: "Show" + the day's anchor; load-in days: "Load in" + the Set anchor; travel days: null. */
  bigTime: PassTime | null;
  /** The last show day only: "Strike" + the strike anchor, at the big time's right edge. */
  strike: PassTime | null;
  /** Show days only: one segment per show day of the show. */
  progress: { n: number; total: number } | null;
  /** Fact grid, in spec order, cells with no value omitted; empty means no divider and no grid. */
  facts: PassFact[];
};

/** The degraded states: eyebrow and lead only, no times, no grid, no day row (spec §4.3). */
export type PassDegradedState = Extract<
  RightNowState["kind"],
  "dateless" | "unknown" | "viewer_unconfirmed"
>;

/** The dates the client clock needs for `selectRightNowState`, nothing more. */
export type PassDates = Pick<ShowRow["dates"], "travelIn" | "set" | "showDays" | "travelOut">;

type PassCommon = {
  /** The `unknown` state's detail line. */
  showTitle: string;
  /** Eyebrow right: "You, <role>" for a personal viewer with a role; null otherwise. */
  eyebrowRight: string | null;
};

export type PassProps =
  | (PassCommon & {
      mode: "degraded";
      /** Computed on the server with the real dates; independent of the clock. */
      state: PassDegradedState;
    })
  | (PassCommon & {
      mode: "dated";
      /** IANA timezone the client converts its clock in. */
      timezone: string;
      dates: PassDates;
      dateRestriction: DateRestriction;
      /**
       * The day set (§4.2), each with its static facts. The live body on a
       * travel, load-in, show or travel-out day reads the entry for today.
       */
      days: PassDay[];
    });

const DEGRADED: ReadonlySet<RightNowState["kind"]> = new Set<PassDegradedState>([
  "dateless",
  "unknown",
  "viewer_unconfirmed",
]);

function isDegraded(kind: RightNowState["kind"]): kind is PassDegradedState {
  return DEGRADED.has(kind);
}

/** Trimmed text, or null when the value is empty or a sentinel. */
function present(value: string | null | undefined): string | null {
  if (value == null || shouldHideGenericOptional(value)) return null;
  return value.trim();
}

function weekday(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    timeZone: "UTC",
  });
}

/**
 * A date as the crew home speaks it, "Sun Jun 14" (spec §9.1, §9.4): the day
 * row's accessible names and the pass's region label ("Your day, Sun Jun 14")
 * and next-day line. Pure; a calendar date, so no timezone conversion.
 */
export function spokenDate(iso: string): string {
  const at = new Date(`${iso}T12:00:00Z`);
  const part = (opts: Intl.DateTimeFormatOptions) =>
    at.toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
  return `${part({ weekday: "short" })} ${part({ month: "short" })} ${part({ day: "numeric" })}`;
}

/**
 * The day set: `aggregateDays` filtered through the date restriction exactly as
 * the Schedule section filters its day list (an explicit viewer sees only their
 * own days; a suppressed viewer sees none). The day row and the pass read this
 * one list.
 */
export function passDaySet(dates: ShowRow["dates"], restriction: DateRestriction): AggregateDay[] {
  if (suppressesDates(restriction)) return [];
  const all = aggregateDays(dates);
  if (restriction.kind !== "explicit") return all;
  const allowedShowDays = new Set(visibleShowDays(dates, restriction));
  return all.filter((d) => allowedShowDays.has(d.date) || restriction.days.includes(d.date));
}

/**
 * The live status line for a show day (spec §4.3 item 2, §9.2, §9.3):
 * "Show starts in 25 min" / "Show starts in 1 hr 20 min" while the start is
 * within the next 3 hours, "Show started at 7:45 AM." once it has passed.
 * Null when the day is not a show day, is not today in the show timezone, has no
 * start, the start is more than 3 hours away, or `clockToMinutes` cannot convert
 * it (documented limit L1: never a guessed time). The caller uses it in `live` only.
 */
export function passStatusLine(day: PassDay, now: Date, timezone: string): string | null {
  if (day.kind !== "show" || day.bigTime === null) return null;
  if (formatIsoForTimezone(now, timezone) !== day.iso) return null;
  const start = clockToMinutes(day.bigTime.time);
  if (start === null) return null;
  const until = start - minuteOfDay(now, timezone);
  if (until <= 0) return `Show started at ${day.bigTime.time}.`;
  if (until > PASS_COUNTDOWN_WINDOW_MINUTES) return null;
  return `Show starts in ${formatDuration(until)}`;
}

function minuteOfDay(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: "hour" | "minute") => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return part("hour") * 60 + part("minute");
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

function dayKind(day: AggregateDay, dates: ShowRow["dates"]): PassDayKind {
  switch (day.phase) {
    case "Travel In":
      return dates.set === day.date ? "travel_in_load_in" : "travel_in";
    case "Set":
      return "load_in";
    case "Show":
      return "show";
    case "Travel Out":
      return "travel_out";
  }
}

const KIND_LABEL: Record<Exclude<PassDayKind, "show">, string> = {
  travel_in: "Travel in",
  travel_in_load_in: "Travel in, load in",
  load_in: "Load in",
  travel_out: "Travel out",
};

/** One day row button (spec §4.2): the date's parts and its phase label, nothing else. */
export type DayRowDay = {
  /** ISO `YYYY-MM-DD`. */
  iso: string;
  /** Weekday, "Sat". The client shows "Today" in its place on today's button. */
  weekday: string;
  /** Day of month, "13". */
  day: string;
  /** "Travel in", "Load in", "Show day 1", "Travel out", or "Travel in, load in" (spec §9.1). */
  label: string;
  /** Accessible name, "Sun Jun 14, show day 1" (spec §9.4). */
  name: string;
};

/** What the day row receives across the client boundary. */
export type DayRowProps = {
  /** IANA timezone the client converts its clock in to find today. */
  timezone: string;
  /** The day set (`passDaySet`), in date order. */
  days: DayRowDay[];
};

/**
 * Build the day row's props, or null when the row is hidden (spec §4.2): the
 * viewer's dates are suppressed, the live state is degraded (dates too thin for
 * `selectRightNowState`, the pass's own degraded test), or the day set is empty.
 * The day set is `passDaySet`, the pass's and the Schedule section's list.
 */
export function buildDayRowProps(
  show: Pick<ShowRow, "dates" | "venue">,
  restriction: DateRestriction,
): DayRowProps | null {
  const dates = show.dates;
  if (suppressesDates(restriction) || !hasFullShowDates(dates)) return null;
  const set = passDaySet(dates, restriction);
  if (set.length === 0) return null;
  const showDays = aggregateDays(dates)
    .filter((d) => d.phase === "Show")
    .map((d) => d.date);
  return {
    timezone: resolveShowTimezone(show.venue),
    days: set.map((day): DayRowDay => {
      const kind = dayKind(day, dates);
      const label =
        kind === "show" ? `Show day ${showDays.indexOf(day.date) + 1}` : KIND_LABEL[kind];
      return {
        iso: day.date,
        weekday: weekday(day.date),
        day: String(Number(day.date.slice(8, 10))),
        label,
        name: `${spokenDate(day.date)}, ${label.toLowerCase()}`,
      };
    }),
  };
}

/**
 * Build the pass props for one viewer. `today` is the request-scoped server
 * clock; it decides nothing a client clock could change (the degraded states do
 * not depend on it), so a stale server instant cannot mislabel a day.
 */
export function buildPassProps(input: {
  data: ShowForViewer;
  viewer: Viewer;
  today: Date;
}): PassProps {
  const { data, viewer, today } = input;
  const ctx = resolveViewerContext(viewer, data);
  const personal = viewer.kind === "crew" || viewer.kind === "admin_preview";
  const role = personal ? present(ctx.viewerCrew?.role) : null;
  const common: PassCommon = {
    showTitle: data.show.title,
    eyebrowRight: role === null ? null : `You, ${role}`,
  };
  const dates = data.show.dates;
  const timezone = resolveShowTimezone(data.show.venue);

  // Suppressed viewers and incomplete dates land in a degraded state whatever the
  // clock reads (`selectRightNowState`'s first three branches), so the server
  // evaluates it once with the real dates and sends the kind alone.
  if (suppressesDates(ctx.dateRestriction) || !hasFullShowDates(dates)) {
    const { kind } = selectRightNowState(today, dates, ctx.dateRestriction, { timezone });
    // Fail closed: a suppressed viewer never receives dates, even if the ladder changed.
    const state: PassDegradedState = isDegraded(kind) ? kind : "viewer_unconfirmed";
    return { ...common, mode: "degraded", state };
  }

  const anchors = resolveKeyTimes(
    data.show,
    data.rooms,
    data.runOfShow,
    ctx.dateRestriction,
    ctx.stageRestriction,
  );
  const all = aggregateDays(dates);
  const showDays = all.filter((d) => d.phase === "Show").map((d) => d.date);
  const lastShowDay = showDays[showDays.length - 1] ?? null;

  // A strike time always carries its day (spec §9.2): as written when it already
  // leads with its M/D, otherwise prefixed with the last show day's weekday,
  // which is the day the pass places Strike on.
  const strikeTime =
    anchors.strike === undefined
      ? null
      : LEADING_MONTH_DAY.test(anchors.strike) || lastShowDay === null
        ? anchors.strike
        : `${weekday(lastShowDay)} ${anchors.strike}`;
  const setTime = anchors.set ?? null;

  // Show-wide cells, shared by every day.
  const room = generalSessionRoomName(data);
  const firstLead = data.crewMembers.find((c) => c.roleFlags.includes("LEAD")) ?? null;
  const lead =
    personal && firstLead !== null && firstLead.id !== ctx.viewerCrew?.id
      ? present(firstLead.name)
      : null;
  const dressCode = present(data.show.event_details.dress_code);

  const days = passDaySet(dates, ctx.dateRestriction).map((day): PassDay => {
    const kind = dayKind(day, dates);
    const showIndex = kind === "show" ? showDays.indexOf(day.date) : -1;
    const isLastShow = kind === "show" && day.date === lastShowDay;
    const showTime =
      kind === "show" ? (anchors.shows?.find((s) => s.date === day.date)?.time ?? null) : null;

    const bigTime: PassTime | null =
      kind === "show"
        ? showTime === null
          ? null
          : { label: "Show", time: showTime }
        : kind === "load_in" || kind === "travel_in_load_in"
          ? setTime === null
            ? null
            : { label: "Load in", time: setTime }
          : null;
    const strike: PassTime | null =
      isLastShow && strikeTime !== null ? { label: "Strike", time: strikeTime } : null;

    const hotel = personal
      ? present(reservationForNight(data.hotelReservations, day.date)?.hotel_name)
      : null;
    const candidates: Array<[PassFactId, string, string | null]> = [
      ["room", "Room", room],
      ["lead", "Your lead", lead],
      ["hotel", "Hotel tonight", hotel],
      ["dressCode", "Dress code", dressCode],
      ["strike", "Strike", isLastShow ? null : strikeTime],
      ["loadIn", "Load in", kind === "travel_in" ? setTime : null],
    ];

    return {
      iso: day.date,
      kind,
      label: kind === "show" ? `Show day ${showIndex + 1} of ${showDays.length}` : KIND_LABEL[kind],
      bigTime,
      strike,
      progress: kind === "show" ? { n: showIndex + 1, total: showDays.length } : null,
      facts: candidates.flatMap(([id, label, value]) =>
        value === null ? [] : [{ id, label, value }],
      ),
    };
  });

  return {
    ...common,
    mode: "dated",
    timezone,
    dates: {
      travelIn: dates.travelIn,
      set: dates.set,
      showDays: dates.showDays,
      travelOut: dates.travelOut,
    },
    dateRestriction: ctx.dateRestriction,
    days,
  };
}
