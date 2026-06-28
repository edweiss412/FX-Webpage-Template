import { presence, normalizeDate, clean, decodeEntities } from "./_helpers";
import { extractFirstClock } from "./scheduleTimes";
import { extractClockTimeTokens } from "./dates";
import { strikeDateOffSchedule } from "./agendaWarnings";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";
import type {
  RoomKind,
  ScheduleDay,
  AgendaEntry,
  ParseWarning,
  ShowRow,
  TransportationRow,
  RoomRow,
} from "../types";

const ROOM_KIND_LABEL: Record<RoomKind, string> = {
  gs: "General Session",
  breakout: "Breakout",
  additional: "Room",
};
export function roomKindFallback(kind: RoomKind): string {
  return ROOM_KIND_LABEL[kind];
}

/** Leading M/D[/YY] date (year-resolved) + first real clock from the tail. */
export function parseRoomTimeCell(
  raw: string | null,
  contextYear: string | null,
): { date: string | null; time: string | null } {
  if (presence(raw ?? "") === null) return { date: null, time: null };
  const cell = raw!.trim();
  const m = /^\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/.exec(cell);
  if (!m) return { date: null, time: null };
  const explicitYear = m[3];
  const cellYear = /\b(20\d\d)\b/.exec(cell)?.[1];
  const year = explicitYear ?? cellYear ?? contextYear;
  if (!year) return { date: null, time: null };
  const date = normalizeDate(`${m[1]}/${m[2]}/${year}`);
  if (!date) return { date: null, time: null };
  const tail = cell.slice(m[0].length);
  return { date, time: extractFirstClock(tail) };
}

const STRIKE_ROOM_NAME_CAP = 3;

function appendEntry(ros: Record<string, ScheduleDay>, iso: string, entry: AgendaEntry): void {
  const day = ros[iso] ?? { entries: [], showStart: null, window: null };
  ros[iso] = { ...day, entries: [...day.entries, entry] };
}

/** Text immediately before a clock → its label. Mirrors titleAfter (scheduleTimes.ts:88) but
 *  strips separators on BOTH ends ("Load In:"→"Load In", " / Room Access:"→"Room Access"). D-SET1. */
function labelBefore(cell: string, from: number, to: number): string {
  const slice = cell
    .slice(from, to)
    .replace(/^\s*[-–:/,;]?\s*/, "")
    .replace(/\s*[-–:/,;]?\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  return shouldHideGenericOptional(slice) ? "" : slice;
}

/**
 * Label-before-clock tokenizer for the SET TIME cell. Returns one {label,clock} per
 * colon-required clock when the cell is label-before-shaped (a colon-terminated label
 * precedes the first clock); otherwise `[]` (time-first / no-colon / no-clock → caller
 * falls through to the loadIn/setupTime synthesis). Clock values come from the same
 * decodeEntities(clean(...)) as extractClockTimes, so they equal dates.loadIn/setupTime. §4.3
 */
export function tokenizeSetSchedule(raw: string | null): { label: string | null; clock: string }[] {
  const c = decodeEntities(clean(raw ?? ""));
  if (!c) return [];
  const toks = extractClockTimeTokens(c);
  if (toks.length === 0) return [];
  const lead = c.slice(0, toks[0]!.start);
  if (!/:\s*$/.test(lead)) return []; // not label-before → caller falls through
  return toks.map((t, i) => {
    const prevEnd = i === 0 ? 0 : toks[i - 1]!.end;
    const label = labelBefore(c, prevEnd, t.start);
    return { label: label || null, clock: t.clock };
  });
}

export function deriveScheduleBookends(
  rosIn: Record<string, ScheduleDay> | undefined,
  dates: ShowRow["dates"],
  transportation: TransportationRow | null,
  rooms: RoomRow[],
  contextYear: string | null,
): { runOfShow: Record<string, ScheduleDay> | undefined; warnings: ParseWarning[] } {
  const ros: Record<string, ScheduleDay> = {};
  for (const [k, v] of Object.entries(rosIn ?? {})) ros[k] = { ...v, entries: [...v.entries] };
  const warnings: ParseWarning[] = [];

  const scheduleDateSet = new Set(
    [dates.travelIn, dates.set, ...dates.showDays, dates.travelOut].filter(Boolean) as string[],
  );

  // ── STRIKE ──
  const strikeIntentCount = rooms.filter((r) => presence(r.strike_time ?? "") !== null).length;
  const groups = new Map<string, { iso: string; time: string; rooms: string[] }>();
  for (const r of rooms) {
    const { date, time } = parseRoomTimeCell(r.strike_time, contextYear);
    if (date == null || time == null) continue;
    const name = presence(r.name) ?? roomKindFallback(r.kind);
    const key = `${date}|${time}`;
    const g = groups.get(key) ?? { iso: date, time, rooms: [] };
    if (!g.rooms.includes(name)) g.rooms.push(name);
    groups.set(key, g);
  }
  const sorted = [...groups.values()].sort(
    (a, b) =>
      a.iso.localeCompare(b.iso) ||
      a.time.localeCompare(b.time) ||
      a.rooms.join().localeCompare(b.rooms.join()),
  );
  for (const g of sorted) {
    let title: string;
    if (g.rooms.length === 1) title = `Strike — ${g.rooms[0]}`;
    else if (g.rooms.length === strikeIntentCount) title = "Strike — all rooms";
    else if (g.rooms.length <= STRIKE_ROOM_NAME_CAP)
      title = `Strike — ${[...g.rooms].sort().join(", ")}`;
    else title = `Strike — ${g.rooms.length} rooms`;
    appendEntry(ros, g.iso, { start: g.time, title, kind: "strike" });
    if (!scheduleDateSet.has(g.iso)) warnings.push(strikeDateOffSchedule(g.iso));
  }

  // ── LOAD OUT (transport Pick Up Venue) ──
  const puv = transportation?.schedule.find((s) => /pick\s*up\s*venue/i.test(s.stage.trim()));
  const puvClock = puv ? extractFirstClock(puv.time ?? "") : null;
  if (puv && puv.date != null && puvClock != null) {
    appendEntry(ros, puv.date, { start: puvClock, title: "Load Out", kind: "loadout" });
  }

  // ── SET (tokenized cell-derived labels when label-before; else dates fall-through; kind absent) ──
  if (dates.set) {
    const tokens = tokenizeSetSchedule(dates.setAgendaRaw ?? null);
    if (tokens.length > 0) {
      tokens.forEach((t, i) => {
        const title = t.label ?? (i === 0 ? "Load In" : i === 1 ? "Setup" : null);
        if (title == null) return; // 3rd+ unlabeled clock → skip (matches today's ≤2 cap)
        appendEntry(ros, dates.set!, { start: t.clock, title });
      });
    } else {
      if (presence(dates.loadIn ?? ""))
        appendEntry(ros, dates.set, { start: dates.loadIn!, title: "Load In" });
      if (presence(dates.setupTime ?? ""))
        appendEntry(ros, dates.set, { start: dates.setupTime!, title: "Setup" });
    }
  }

  return { runOfShow: Object.keys(ros).length ? ros : rosIn, warnings };
}
