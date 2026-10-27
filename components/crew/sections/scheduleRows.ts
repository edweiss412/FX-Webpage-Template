/**
 * components/crew/sections/scheduleRows.ts — the Schedule section's row
 * derivations, shared by `ScheduleSection` and the Schedule search builder
 * (lib/search/sections/schedule.ts), so the page and the search index describe
 * the same lines in the same order (spec §2.4, INV-1).
 *
 * Each block function returns what the section renders AND the search entries
 * for it, with each line's target id. The component renders the rows and puts
 * the ids on the elements; the builder keeps the entries. A block is one search
 * region (its `data-card-id`, or `none` outside every card), so each block
 * counts byte-identical lines (`~n`) on its own, in render order.
 *
 * Also home to the entry helpers Today's rows reuse (todayRows.ts): the run-of-show
 * list and the key-times strip render in both sections.
 *
 * A non-client module: the builder runs on the server and imports from here.
 */
import { normalize } from "@/lib/search/normalize";
import { entryId } from "@/lib/search/entryId";
import type { SearchCopy, SearchEntry } from "@/lib/search/types";
import {
  agendaSessionLine,
  agendaTrackLine,
  structuredAgenda,
  type AgendaBlockSearch,
} from "@/components/crew/agendaScheduleRows";
import { keyTimeRows } from "@/components/crew/primitives/KeyTimesStrip";
import { runOfShowEntryLine, runOfShowRows } from "@/components/crew/primitives/RunOfShowList";
import { agendaDisplayLabel } from "@/lib/agenda/agendaLabel";
import { driftNote } from "@/lib/agenda/agendaPaint";
import {
  aggregateDays,
  formatScheduleWindow,
  resolveOptionalField,
  scheduleEntriesForViewer,
  showStartDisplayEntry,
  visibleShowDays,
  type AggregateDay,
} from "@/lib/crew/agendaDisplay";
import { normalizeMeridiem } from "@/lib/crew/normalizeMeridiem";
import type { SectionId } from "@/lib/crew/resolveActiveSection";
import type { KeyTimeAnchors } from "@/lib/crew/resolveKeyTimes";
import type { ShowForViewer } from "@/lib/data/getShowForViewer";
import { dayBadgeParts } from "@/lib/format/date";
import type { AgendaEntry, DateRestriction } from "@/lib/parser/types";

// ── Entry helpers (shared with todayRows.ts) ────────────────────────────────

/** Collects one region's entries in render order and numbers byte-identical lines. */
export type EntrySink = {
  readonly section: SectionId;
  readonly region: string;
  readonly seen: Map<string, number>;
  readonly entries: SearchEntry[];
};

export function entrySink(section: SectionId, region: string): EntrySink {
  return { section, region, seen: new Map(), entries: [] };
}

export type EntryLine = {
  group: string;
  label?: string | null;
  value: string;
  context?: readonly (string | null | undefined)[];
  copy?: SearchCopy | null;
};

const normalized = (text: string): string =>
  normalize(text)
    .map((t) => t.text)
    .join(" ");

/**
 * Adds one line's entry and returns its target id, or `undefined` when the
 * value is empty after trimming (spec §3: no entry, so the line gets no target).
 * A label equal to the group after normalization is stored as `null`, and empty
 * context strings are dropped.
 */
export function addEntry(sink: EntrySink, line: EntryLine): string | undefined {
  if (line.value.trim() === "") return undefined;
  const rawLabel = line.label ?? null;
  const label =
    rawLabel === null || rawLabel.trim() === "" || normalized(rawLabel) === normalized(line.group)
      ? null
      : rawLabel;
  const id = entryId(sink.section, sink.region, line.group, label, line.value, sink.seen);
  sink.entries.push({
    id,
    section: sink.section,
    group: line.group,
    label,
    value: line.value,
    context: (line.context ?? []).filter((c): c is string => c != null && c.trim() !== ""),
    copy: line.copy ?? null,
  });
  return id;
}

/**
 * Entries for a `RunOfShowList` of `entries`, one per rendered row in render
 * order: the row's time group is the label, its title the value, room and AV
 * the context. Returns the ids in the order `RunOfShowList` takes them.
 */
export function addRunOfShowEntries(
  sink: EntrySink,
  group: string,
  entries: AgendaEntry[],
): (string | undefined)[] {
  return runOfShowRows(entries).shown.map((entry) => {
    const line = runOfShowEntryLine(entry);
    return addEntry(sink, {
      group,
      label: line.timeLabel,
      value: line.title,
      context: [line.room, line.av],
    });
  });
}

/**
 * Entries for a `KeyTimesStrip` of `anchors`, one per rendered row (the rows
 * folded past `SHOWS_CAP` included), keyed by row key as the strip takes them.
 */
export function keyTimeEntries(
  section: SectionId,
  region: string,
  group: string,
  anchors: KeyTimeAnchors,
): { targets: Record<string, string>; entries: SearchEntry[] } {
  const sink = entrySink(section, region);
  const targets: Record<string, string> = {};
  for (const row of keyTimeRows(anchors).all) {
    const id = addEntry(sink, { group, label: row.label, value: row.value });
    if (id !== undefined) targets[row.rowKey] = id;
  }
  return { targets, entries: sink.entries };
}

// ── Schedule blocks ─────────────────────────────────────────────────────────

/** The card id of the day-card column (`data-card-id`). */
export const SCHEDULE_DAYS_REGION = "schedule-days";
/** The card id of the "Crew Schedule" key-times card. */
export const SCHEDULE_CALL_TIMES_REGION = "schedule-call-times";
/** The card title of the key-times card. */
export const SCHEDULE_CALL_TIMES_TITLE = "Crew Schedule";
/** The agenda area's heading: the group of every agenda line (region `none`). */
export const AGENDA_GROUP = "Agenda";

/**
 * The days the viewer may see: the full date domain (travel in, set, show days,
 * travel out) intersected with an explicit restriction. Throws on a malformed
 * `dates.showDays` (the projection casts the jsonb); the caller contains it.
 */
export function scheduleVisibleDays(
  data: ShowForViewer,
  dateRestriction: DateRestriction,
): AggregateDay[] {
  const allDays = aggregateDays(data.show.dates);
  // visibleShowDays is the SINGLE SOURCE for the SHOW-DAY ∩ restriction set; the full
  // schedule list also shows travel/set/strike, so for explicit we intersect the FULL
  // aggregate against (restriction.days) — but the show-day SUBSET of that intersection
  // MUST equal visibleShowDays(...) (drift guard).
  const allowedShowDays = new Set(visibleShowDays(data.show.dates, dateRestriction));
  return dateRestriction.kind === "explicit"
    ? allDays.filter((d) => allowedShowDays.has(d.date) || dateRestriction.days.includes(d.date))
    : allDays; // kind === 'none'
}

export type ScheduleDayRow = {
  day: AggregateDay;
  isToday: boolean;
  /** The day card's meta line; undefined renders none. */
  meta: string | undefined;
  /** What the day's `RunOfShowList` receives; null renders no list. */
  runOfShow: AgendaEntry[] | null;
  dayCardTarget: string | undefined;
  runOfShowTargets: (string | undefined)[];
};

/**
 * Per visible day: the day card's meta line and run of show, and their search
 * entries. The day card is one line: its label is the group heading (the column
 * has no card title), its meta the value when present, else the label itself.
 * Its run-of-show rows share that group.
 */
export function scheduleDayRows({
  data,
  visibleDays,
  todayIso,
  transportVisible,
}: {
  data: ShowForViewer;
  visibleDays: readonly AggregateDay[];
  todayIso: string;
  transportVisible: boolean;
}): { rows: ScheduleDayRow[]; entries: SearchEntry[] } {
  const sink = entrySink("schedule", SCHEDULE_DAYS_REGION);
  const rows = visibleDays.map((day): ScheduleDayRow => {
    const isToday = day.date === todayIso;
    const sd = data.runOfShow?.[day.date] ?? null; // types.ScheduleDay | null
    const isSetDay = day.phase === "Set";
    // EVERY meta source is routed through resolveOptionalField (strips
    // URLs + hides 'TBD'/'N/A'/'TBA' sentinels). The file-level sentinel
    // meta-test (Task 15) is VACUOUS for ScheduleSection (the import is
    // already present for other fields), so THIS per-value guard + the
    // behavioral tests are the real enforcement for showStart/window/
    // setupTime (plan-review R5 finding).
    // D3: normalize meridiem casing/spacing on the schedule meta
    // (setup / window / showStart / showEnd) so it matches the
    // KeyTimesStrip anchors — one shape across the card. Applied
    // AFTER the URL/sentinel guard so a hidden value stays hidden.
    const guardMeta = (v: string | null | undefined): string | undefined => {
      const resolved = resolveOptionalField(v ?? undefined);
      return resolved != null ? normalizeMeridiem(resolved) : undefined;
    };
    // Per-viewer schedule entries (§9.6): displayable minus a
    // gated-out load-out. Drives BOTH the SET-meta suppression
    // and the per-day run-of-show gate/render below, so a day
    // whose only synthetic entry is a hidden load-out neither
    // opens a container nor suppresses the meta for that viewer.
    const dayEntries = scheduleEntriesForViewer(sd?.entries, { transportVisible });
    // Bare-showStart SHOW day (phase Show, raw entries.length===0,
    // no window, real showStart) → render the call time as a "Show
    // Start" run-of-show entry instead of a label-less meta line.
    // Renderer-only; gates on RAW sd.entries (NOT dayEntries) so a
    // viewer-hidden load-out day keeps its #169 call-time meta, and on
    // phase==="Show" so Set/travel days are never relabeled.
    const showStartRow = sd != null ? showStartDisplayEntry(sd, day.phase) : null;
    let meta: string | undefined;
    if (isSetDay) {
      // §6/§9.1: when the SET day carries displayable run-of-show
      // entries (the synthesized Load In/Setup), the RunOfShowList
      // renders them below — suppress the standalone "Setup <time>"
      // meta to avoid double-printing setupTime. Guard the RAW
      // setupTime FIRST, THEN prefix (plan-review R6).
      const t = dayEntries.length > 0 ? null : guardMeta(data.show.dates.setupTime);
      meta = t != null ? `Setup ${t}` : undefined;
    } else if (sd?.window != null) {
      meta = guardMeta(formatScheduleWindow(sd.window));
    } else if (
      sd != null &&
      sd.showStart != null &&
      dayEntries.length === 0 &&
      showStartRow == null
    ) {
      // Fragment day: single showStart, no DISPLAYABLE entries. Gate
      // on the per-viewer load-out-filtered `dayEntries` (NOT the raw
      // `sd.entries`) so a day whose only synthetic entry is a hidden
      // load-out still surfaces its call-time meta rather than silently
      // dropping it (audit idx34/#169). Mirrors the SET-meta suppression
      // and the RunOfShowList gate, both of which already key off
      // `dayEntries`.
      meta = guardMeta(sd.showStart);
    } else if (sd != null && sd.showEnd != null && dayEntries.length === 0) {
      // End-only day (§#307): unknown start, known end → "Ends 6:00 PM".
      // guardMeta hides a TBD/N/A sentinel. Mutually exclusive with the
      // showStart branch (showEnd is set only when showStart is null).
      const t = guardMeta(sd.showEnd);
      meta = t != null ? `Ends ${t}` : undefined;
    }
    // titled day (displayable dayEntries.length > 0) → meta stays
    // undefined; the RunOfShowList renders below instead.
    // Gate on the per-viewer (load-out-gated) DISPLAYABLE count, not the raw
    // stored count: a day whose entries are all URL-only (stripped title → "")
    // OR only a gated-out load-out has zero entries → no run-of-show container
    // → the Phase-1 anchor floor shows.
    const runOfShow =
      dayEntries.length > 0 ? dayEntries : showStartRow != null ? [showStartRow] : null;

    const { dow, dnum } = dayBadgeParts(day.date);
    const dayCardTarget = addEntry(sink, {
      group: day.label,
      value: meta ?? day.label,
      // The card's other text: its date badge, and its label when the meta is the value.
      context: [dow, dnum, meta !== undefined ? day.label : null],
    });
    const runOfShowTargets =
      runOfShow != null ? addRunOfShowEntries(sink, day.label, runOfShow) : [];
    return { day, isToday, meta, runOfShow, dayCardTarget, runOfShowTargets };
  });
  return { rows, entries: sink.entries };
}

type AgendaLinkRow = ShowForViewer["show"]["agenda_links"][number];

export type ScheduleAgendaBlock = {
  /** The per-document caption, shown only when there is more than one agenda PDF. */
  label: string | null;
  search: AgendaBlockSearch;
};

/**
 * The agenda area (region `none`, outside every card and every error boundary):
 * one "View agenda" button per link with a Drive file id, whose document label is
 * a line, then per link with an extraction its structured block (document
 * caption, each day, each session with its tracks and drift note). `blocks` is
 * aligned with `agendaLinks`; null where a link renders no block.
 */
export function scheduleAgendaRows(agendaLinks: readonly AgendaLinkRow[]): {
  embedTargets: Record<string, string>;
  blocks: (ScheduleAgendaBlock | null)[];
  entries: SearchEntry[];
} {
  const sink = entrySink("schedule", "none");
  const embedTargets: Record<string, string> = {};
  for (const link of agendaLinks) {
    if (!link.fileId) continue;
    const badge = link.label ? agendaDisplayLabel(link.label) : null;
    const id = badge !== null ? addEntry(sink, { group: AGENDA_GROUP, value: badge }) : undefined;
    if (id !== undefined) embedTargets[link.fileId] = id;
  }
  // Show a per-document label on the structured blocks only when there's more
  // than one agenda PDF (so two "View agenda" buttons + two schedules are
  // distinguishable — impeccable MEDIUM). A single agenda needs no badge.
  const agendaPdfCount = agendaLinks.filter((link) => Boolean(link.fileId)).length;
  const blocks = agendaLinks.map((link): ScheduleAgendaBlock | null => {
    if (!link.fileId || !link.extracted) return null;
    const label = agendaPdfCount > 1 ? agendaDisplayLabel(link.label) : null;
    const data = structuredAgenda(link.extracted);
    if (data === null) return { label, search: { days: [] } };
    const docLabel = label ? addEntry(sink, { group: AGENDA_GROUP, value: label }) : undefined;
    const days = data.days.map((day) => {
      const summary = addEntry(sink, {
        group: AGENDA_GROUP,
        value: day.dayLabel,
        context: [day.date],
      });
      const sessions = day.sessions.map((session) => {
        const line = agendaSessionLine(session);
        return addEntry(sink, {
          group: AGENDA_GROUP,
          label: line !== "" ? session.time : null,
          value: line !== "" ? line : session.time,
          context: [
            day.dayLabel,
            session.drift !== null ? driftNote(session.drift) : null,
            ...session.tracks.map(agendaTrackLine),
          ],
        });
      });
      return { ...(summary !== undefined ? { summary } : {}), sessions };
    });
    return { label, search: { ...(docLabel !== undefined ? { docLabel } : {}), days } };
  });
  return { embedTargets, blocks, entries: sink.entries };
}
