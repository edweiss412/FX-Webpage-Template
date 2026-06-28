import { presence, normalizeDate } from "./_helpers";
import { extractFirstClock } from "./scheduleTimes";
import type { RoomKind } from "../types";

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
  if (presence(raw) === null) return { date: null, time: null };
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
