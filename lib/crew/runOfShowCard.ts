/**
 * lib/crew/runOfShowCard.ts: the props of the crew home's run-of-show card
 * (crew page redesign spec §4.4), built on the server for every day the viewer
 * can select.
 *
 * The card sits under the pass and shows the selected day's run of show: `live`
 * shows today (by the shared crew clock), `day(iso)` the day the day row chose.
 * This module is the data side: which days get rows, and each day's rows, built
 * exactly as Today built its run-of-show card before the redesign:
 *
 *   - eligibility: a day of `passDaySet`, the day row's own set, so an explicit
 *     viewer gets only their days and a suppressed viewer none (spec §4.4: no
 *     restriction, or an explicit restriction listing the day);
 *   - entries: `scheduleEntriesForViewer`, so a load-out stays hidden from a
 *     viewer the transport gate excludes; a bare show day gets the synthetic
 *     "Show Start" row from `showStartDisplayEntry`, fed the RAW entries, so a
 *     viewer-hidden load-out still suppresses it;
 *   - the agenda merge, behind the same gate: `buildShowDayTimeline` with the
 *     day's `agendaSessionsForToday`;
 *   - the cap: the first `RUN_CARD_ROW_CAP` rows in render order; `more` says
 *     there were others, and the card links to the Schedule section.
 *
 * Only these rows cross to the client (harness rule "Client props carry only
 * what the viewer may see"): never a projection, never another day's rows.
 *
 * Search (crew show search spec §2.4, INV-1): the card renders the Today
 * section's `today-run-of-show` lines. `runCardSearch` gives a day's search
 * entries and their target ids; the server's today carries its targets in the
 * props, and the Today builder (lib/search/sections/today.ts) adds the same
 * entries, so the index and the rendered card describe the same lines. Ids are
 * content-addressed (lib/search/entryId.ts), so the two calls agree.
 *
 * The same day also carries `scheduleTargets`: each row's line in the Schedule
 * section, which lists every day. A reveal whose day the card cannot show (no
 * day row to select it from, and the device clock on another day) opens that
 * line instead (whole-diff review round 2, 2B-1).
 *
 * Server-safe (pure; no clock reads, `today` is passed in). The client card
 * imports its types and two runtime constants, `RUN_CARD_ID` and
 * `RUN_CARD_TITLE`, so this module and everything it imports ships in the
 * client bundle: keep it free of server-only imports.
 */
import { runOfShowEntryLine, runOfShowRows } from "@/components/crew/primitives/RunOfShowList";
import { agendaSessionRowLine } from "@/components/crew/primitives/ShowDayTimelineList";
import {
  addEntry,
  entrySink,
  scheduleDayRows,
  scheduleVisibleDays,
  type ScheduleDayRow,
} from "@/components/crew/sections/scheduleRows";
import { agendaSessionsForToday } from "@/lib/crew/agendaDayForToday";
import {
  scheduleEntriesForViewer,
  showStartDisplayEntry,
  type AggregateDay,
} from "@/lib/crew/agendaDisplay";
import type { CardReportContext } from "@/lib/crew/cardReportContext";
import { suppressesDates } from "@/lib/crew/dateSuppression";
import { passDaySet } from "@/lib/crew/passModel";
import { buildShowDayTimeline, type TimelineItem } from "@/lib/crew/showDayTimeline";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import { resolveViewerContext, type ViewerContext } from "@/lib/data/viewerContext";
import type { AgendaEntry } from "@/lib/parser/types";
import type { SearchEntry } from "@/lib/search/types";
import { CARD_REGION_MAP, type SourceAnchor } from "@/lib/sheet-links/buildSheetDeepLink";
import { clockToMinutes } from "@/lib/time/clockToMinutes";
import { resolveShowTimezone } from "@/lib/time/showTimezone";
import { todayIsoInShowTimezone } from "@/lib/visibility/packList";
import { transportTileVisible } from "@/lib/visibility/scopeTiles";

/** Rows on the home card (spec §4.4); the Schedule section keeps its own cap. */
export const RUN_CARD_ROW_CAP = 6;

/** The card's title, which is also the search group of its lines (spec §9.1). */
export const RUN_CARD_TITLE = "Run of show";

/** The card id: Today's run-of-show card id, kept (spec §6.4). */
export const RUN_CARD_ID = "today-run-of-show" as const;

/** A day's rows in render order: the merged timeline when it has agenda sessions, else the list. */
export type RunCardRows =
  | { kind: "timeline"; items: TimelineItem[] }
  | { kind: "list"; entries: AgendaEntry[] };

export type RunCardDay = {
  /** ISO `YYYY-MM-DD`. */
  iso: string;
  /** At most `RUN_CARD_ROW_CAP` rows, in render order. */
  rows: RunCardRows;
  /**
   * Each rendered row's start through `clockToMinutes`, in render order. The
   * "Next" marker goes on the first row at or after now; a null never takes it
   * (documented limit L1).
   */
  minutes: (number | null)[];
  /** More rows than the cap: the card shows "Full schedule". */
  more: boolean;
  /**
   * Search target ids, one per rendered row: only on the server's today, the
   * day the search index describes; null on every other day.
   */
  targets: (string | undefined)[] | null;
  /**
   * The same rows' target ids in the Schedule section's day card, aligned with
   * `targets` and on the same day only (`runCardScheduleTargets`); undefined
   * for a row Schedule's day card does not list (a merged agenda session).
   */
  scheduleTargets: (string | undefined)[] | null;
};

/** A day as `runCardDay` builds it, before the server's today gets its target ids. */
type RunCardDayRows = Omit<RunCardDay, "targets" | "scheduleTargets">;

/** The card's header actions, Today's run-of-show card's (spec §6.4). */
export type RunCardHeader = {
  driveFileId: string | null;
  anchor: SourceAnchor | null;
  showId: string;
  cardReport: CardReportContext | null;
};

export type RunCardProps = {
  /** IANA timezone the client converts its clock in, to find today and "now". */
  timezone: string;
  /** Every selectable day that has displayable rows, in date order. */
  days: RunCardDay[];
  header: RunCardHeader;
};

/** The transport gate, read the same way Today reads it (components/crew/sections/todayRows.ts). */
function transportVisibleFor(data: ShowForViewer, isAdmin: boolean): boolean {
  return transportTileVisible({
    transportation: data.transportation,
    viewerId: data.viewerId,
    transportationOwnerIds: data.transportationOwnerIds,
    viewerName: data.viewerName,
    viewerNameAliases: data.viewerNameAliases,
    isAdmin,
  });
}

/**
 * One day's rows, or null when the day has none to display (spec §4.4 "Empty",
 * §11: no `ScheduleDay` and no agenda sessions, or only rows the viewer cannot
 * see). The caller has already established that the day is the viewer's own.
 */
export function runCardDay(
  data: ShowForViewer,
  day: AggregateDay,
  transportVisible: boolean,
): RunCardDayRows | null {
  const scheduleDay = data.runOfShow?.[day.date] ?? null;
  const entries = scheduleEntriesForViewer(scheduleDay?.entries, { transportVisible });
  // The RAW entries decide the synthetic row: a hidden load-out still counts.
  const showStart = scheduleDay ? showStartDisplayEntry(scheduleDay, day.phase) : null;
  const crew = entries.length > 0 ? entries : showStart ? [showStart] : [];
  const sessions = agendaSessionsForToday(
    data.show.agenda_links ?? [],
    data.show.dates.showDays ?? [],
    day.date,
  );

  if (sessions.length > 0) {
    const all = buildShowDayTimeline(crew, sessions);
    const items = all.slice(0, RUN_CARD_ROW_CAP);
    return {
      iso: day.date,
      rows: { kind: "timeline", items },
      minutes: items.map((item) => item.minutes),
      more: all.length > RUN_CARD_ROW_CAP,
    };
  }
  if (crew.length === 0) return null;
  // `runOfShowRows` is the list's own render order (agenda rows, then the
  // synthetic strike and load-out rows), so the cap keeps what renders first.
  const { shown, overflow } = runOfShowRows(crew);
  const total = shown.length + Math.max(0, overflow);
  const kept = shown.slice(0, RUN_CARD_ROW_CAP);
  if (kept.length === 0) return null;
  return {
    iso: day.date,
    rows: { kind: "list", entries: kept },
    minutes: kept.map((entry) => clockToMinutes(entry.start)),
    more: total > RUN_CARD_ROW_CAP,
  };
}

/**
 * A day's search entries and target ids, one per rendered row in render order,
 * in the card's region (`today-run-of-show`) of the Today section.
 */
export function runCardSearch(day: Pick<RunCardDay, "rows">): {
  targets: (string | undefined)[];
  entries: SearchEntry[];
} {
  const sink = entrySink("today", RUN_CARD_ID);
  const targets =
    day.rows.kind === "list"
      ? day.rows.entries.map((entry) => {
          const line = runOfShowEntryLine(entry);
          return addEntry(sink, {
            group: RUN_CARD_TITLE,
            label: line.timeLabel,
            value: line.title,
            context: [line.room, line.av],
          });
        })
      : day.rows.items.map((item) => {
          if (item.source === "crew") {
            const line = runOfShowEntryLine(item.entry);
            return addEntry(sink, {
              group: RUN_CARD_TITLE,
              label: line.timeLabel,
              value: line.title,
              context: [line.room, line.av],
            });
          }
          const { time, title, room } = agendaSessionRowLine(item.session);
          return addEntry(sink, {
            group: RUN_CARD_TITLE,
            label: title !== "" ? time : null,
            value: title !== "" ? title : time,
            context: [room],
          });
        });
  return { targets, entries: sink.entries };
}

/**
 * Each card row's target id in the Schedule section (spec §4.4: Schedule lists
 * every day), in render order: the line with the same text in that day's
 * Schedule day card, taken in order when a day repeats a line. The ids come from
 * `scheduleDayRows` over the days `ScheduleSection` lists, so they are the ones
 * Schedule renders. A merged agenda session is not in the day card (Schedule
 * shows it in its agenda area), and neither is a row of a day whose day cards
 * failed to derive (Schedule renders its fallback there): those stay undefined.
 */
export function runCardScheduleTargets(
  data: ShowForViewer,
  ctx: Pick<ViewerContext, "dateRestriction" | "isAdmin">,
  day: RunCardDayRows,
  todayIso: string,
): (string | undefined)[] {
  const rows = day.rows.kind === "list" ? day.rows.entries.length : day.rows.items.length;
  let scheduleDay: ScheduleDayRow | undefined;
  try {
    scheduleDay = scheduleDayRows({
      data,
      visibleDays: scheduleVisibleDays(data, ctx.dateRestriction),
      todayIso,
      transportVisible: transportVisibleFor(data, ctx.isAdmin),
    }).rows.find((row) => row.day.date === day.iso);
  } catch {
    return Array.from({ length: rows }, () => undefined);
  }
  const lines = scheduleDay?.runOfShow ? runOfShowRows(scheduleDay.runOfShow).shown : [];
  const keyOf = (entry: AgendaEntry) => JSON.stringify(runOfShowEntryLine(entry));
  const keys = lines.map(keyOf);
  const used = new Set<number>();
  const match = (entry: AgendaEntry): string | undefined => {
    const key = keyOf(entry);
    const i = keys.findIndex((k, j) => k === key && !used.has(j));
    if (i < 0) return undefined;
    used.add(i);
    return scheduleDay?.runOfShowTargets[i];
  };
  return day.rows.kind === "list"
    ? day.rows.entries.map(match)
    : day.rows.items.map((item) => (item.source === "crew" ? match(item.entry) : undefined));
}

/**
 * The days that get a card: the viewer's own days (`passDaySet`), each with its
 * rows, dropping the days that have none. Empty for a suppressed viewer or a
 * projection too thin to carry dates. `ctx` is the viewer's
 * `resolveViewerContext`, so Today's Mode A gate (todayRows.ts) and the card
 * read one answer.
 */
export function runCardDays(
  data: ShowForViewer,
  ctx: Pick<ViewerContext, "dateRestriction" | "isAdmin">,
): RunCardDayRows[] {
  const dates = data.show?.dates;
  if (!dates || suppressesDates(ctx.dateRestriction)) return [];
  const transportVisible = transportVisibleFor(data, ctx.isAdmin);
  return passDaySet(dates, ctx.dateRestriction).flatMap((day) => {
    const built = runCardDay(data, day, transportVisible);
    return built === null ? [] : [built];
  });
}

/**
 * Build the card's props for one viewer, or null when no day has rows (the
 * card never renders). `today` is the request-scoped server clock; it only
 * picks which day carries search targets.
 */
export function buildRunCardProps(input: {
  data: ShowForViewer;
  viewer: Viewer;
  today: Date;
  showId: string;
  cardReport: CardReportContext | null;
}): RunCardProps | null {
  const { data, viewer, today, showId, cardReport } = input;
  const ctx = resolveViewerContext(viewer, data);
  const days = runCardDays(data, ctx);
  if (days.length === 0) return null;
  const todayIso = todayIsoInShowTimezone(data.show, today);
  return {
    timezone: resolveShowTimezone(data.show.venue),
    days: days.map((day) =>
      day.iso === todayIso
        ? {
            ...day,
            targets: runCardSearch(day).targets,
            scheduleTargets: runCardScheduleTargets(data, ctx, day, todayIso),
          }
        : { ...day, targets: null, scheduleTargets: null },
    ),
    header: {
      driveFileId: data.driveFileId,
      anchor: data.sourceAnchors[CARD_REGION_MAP[RUN_CARD_ID]] ?? null,
      showId,
      cardReport,
    },
  };
}

/**
 * The search entries of the card on the server's today, in render order: the
 * lines the card shows in `live` when the client's today is the server's.
 */
export function runCardSearchEntries(input: {
  data: ShowForViewer;
  viewer: Viewer;
  today: Date;
}): SearchEntry[] {
  const { data, viewer, today } = input;
  const todayIso = todayIsoInShowTimezone(data.show, today);
  const day = runCardDays(data, resolveViewerContext(viewer, data)).find((d) => d.iso === todayIso);
  return day ? runCardSearch(day).entries : [];
}
