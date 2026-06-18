import type { RoomRow, ShowRow } from "@/lib/parser/types";

/** ShowForViewer.rooms element type: a parsed RoomRow plus its DB PK. */
export type ProjectedRoomRow = RoomRow & { id: string };

/** Present keys only; an absent anchor is simply not a key (strip omits it). */
export type KeyTimeAnchors = { set?: string; show?: string; strike?: string };

const ROOM_KIND_RANK: Record<RoomRow["kind"], number> = { gs: 0, breakout: 1, additional: 2 };

/**
 * True when a free-text time value should be treated as ABSENT: empty, or it
 * contains a bare TBD/N/A/TBA token (e.g. "10/20 @ TBD", a breakout literal
 * "TBD"). Live-data guard (§3/§4.4) — these must not render as a real time.
 */
function isAbsentTime(value: string | null | undefined): boolean {
  if (value == null) return true;
  const v = value.trim();
  if (v.length === 0) return true;
  return /\b(?:TBD|N\/A|TBA)\b/i.test(v);
}

/** Stable total order: kind rank, then normalized name, then DB id. */
function compareRooms(a: ProjectedRoomRow, b: ProjectedRoomRow): number {
  const rk = ROOM_KIND_RANK[a.kind] - ROOM_KIND_RANK[b.kind];
  if (rk !== 0) return rk;
  const an = a.name.trim().toLowerCase();
  const bn = b.name.trim().toLowerCase();
  if (an !== bn) return an < bn ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Resolve the Set/Show/Strike anchors for the Today KeyTimesStrip, Schedule
 * "Daily times", and buildRightNowContext. Deterministic regardless of DB
 * return order (the rooms query has no ORDER BY).
 *
 * Set precedence: dates.loadIn (non-sentinel) ?? selected-room set_time ?? omit.
 * Show/Strike: selected-room show_time/strike_time (sentinel-guarded).
 * Set is rooms-INDEPENDENT (wp-23): a present dates.loadIn renders even when
 * rooms is null/empty.
 */
export function resolveKeyTimes(
  show: Pick<ShowRow, "dates">,
  rooms: ProjectedRoomRow[] | null,
): KeyTimeAnchors {
  const anchors: KeyTimeAnchors = {};

  // Deterministic room pick: gs preferred via kind rank; else first in total order.
  const sorted = (rooms ?? []).slice().sort(compareRooms);
  const selected = sorted[0] ?? null; // total order already prefers gs (rank 0)

  // Set: dates.loadIn wins, else selected room's set_time, else omit.
  const loadIn = show.dates.loadIn;
  if (!isAbsentTime(loadIn)) {
    anchors.set = (loadIn as string).trim();
  } else if (selected && !isAbsentTime(selected.set_time)) {
    anchors.set = (selected.set_time as string).trim();
  }

  // Show / Strike: selected room only (rooms-dependent).
  if (selected && !isAbsentTime(selected.show_time)) {
    anchors.show = (selected.show_time as string).trim();
  }
  if (selected && !isAbsentTime(selected.strike_time)) {
    anchors.strike = (selected.strike_time as string).trim();
  }

  return anchors;
}
