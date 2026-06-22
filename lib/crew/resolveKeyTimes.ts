import type { DateRestriction, RunOfShow, ShowAnchor, ShowRow } from "@/lib/parser/types";
import type { RoomRow } from "@/lib/parser/types";
import { visibleShowDays } from "@/lib/crew/agendaDisplay";

/** ShowForViewer.rooms element type: a parsed RoomRow plus its DB PK. */
export type ProjectedRoomRow = RoomRow & { id: string };

/** Present keys only; an absent anchor is simply not a key (strip omits it). */
export type KeyTimeAnchors = { set?: string; shows?: ShowAnchor[]; strike?: string };

// Re-export ShowAnchor so consumers can import it from this module.
export type { ShowAnchor };

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

/** ISO 'YYYY-MM-DD' → 'M/D' (no zero-pad), matching the room show_time M/D form. */
function formatMD(iso: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${Number(m[1])}/${Number(m[2])}`;
}

/** Extract a leading 'M/D' from a free-text room show_time (e.g. '5/13 @ 8:00 AM'); null if none. */
function parseRoomShowTimeMD(raw: string): string | null {
  const m = /^\s*(\d{1,2})\/(\d{1,2})\b/.exec(raw);
  return m ? `${Number(m[1])}/${Number(m[2])}` : null;
}

/**
 * Short weekday abbreviation for a given ISO date string.
 * Uses UTC to avoid timezone-induced day-shifts on the label.
 */
function wkd(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
}

/**
 * Label for a ShowAnchor:
 *   - rawShowDayCount === 1  → "Show"
 *   - rawShowDayCount  > 1  → "Day N · <Wkd M/D>" (1-indexed per showDays position)
 */
function labelFor(iso: string, rawShowDayCount: number, showDays: string[]): string {
  if (rawShowDayCount === 1) return "Show";
  const n = showDays.indexOf(iso) + 1; // 1-indexed
  return `Day ${n} · ${wkd(iso)} ${formatMD(iso)}`;
}

/**
 * Resolve the Set/Shows/Strike anchors for the Today KeyTimesStrip, Schedule
 * "Daily times", and buildRightNowContext. Deterministic regardless of DB
 * return order (the rooms query has no ORDER BY).
 *
 * unknown_asterisk → {} (whole strip suppressed, zero date leak).
 *
 * Set precedence (D3): compose dates.set (M/D) + dates.loadIn (non-sentinel)
 *   → "10/7 @ 9:00PM"; else bare loadIn; else selected-room set_time ?? omit.
 *   Set is rooms-INDEPENDENT (wp-23): a present dates.loadIn renders even when
 *   rooms is null/empty.
 *
 * shows[]: per-day ShowAnchor[] from visibleShowDays(dates, dateRestriction)
 *   via the 6-row anchor decision table. Each candidate is sentinel-guarded
 *   via isAbsentTime before becoming a ShowAnchor.time.
 *
 * Strike: selected-room strike_time (sentinel-guarded), unchanged.
 */
export function resolveKeyTimes(
  show: Pick<ShowRow, "dates">,
  rooms: ProjectedRoomRow[] | null,
  runOfShow: RunOfShow | null,
  dateRestriction: DateRestriction,
): KeyTimeAnchors {
  // unknown_asterisk → whole strip suppressed (zero date leak). Short-circuit BEFORE table.
  if (dateRestriction.kind === "unknown_asterisk") return {};

  const anchors: KeyTimeAnchors = {};

  // Deterministic room pick: gs preferred via kind rank; else first in total order.
  const sorted = (rooms ?? []).slice().sort(compareRooms);
  const selected = sorted[0] ?? null;

  // Set (D3): compose dates.set (M/D) + loadIn when clock non-sentinel; else bare loadIn;
  // else GS room set_time; else omit. Rooms-INDEPENDENT (wp-23).
  const loadIn = show.dates.loadIn;
  if (!isAbsentTime(loadIn)) {
    const clock = (loadIn as string).trim();
    anchors.set = show.dates.set ? `${formatMD(show.dates.set)} @ ${clock}` : clock;
  } else if (selected && !isAbsentTime(selected.set_time)) {
    anchors.set = (selected.set_time as string).trim();
  }

  // Strike: unchanged — selected-room strike_time, sentinel-guarded.
  if (selected && !isAbsentTime(selected.strike_time)) {
    anchors.strike = (selected.strike_time as string).trim();
  }

  // shows[] — decision table over VISIBLE show days only.
  // Rule 4 keys on RAW showDays.length (pre-restriction), NOT the visible count.
  const rawShowDays = show.dates.showDays ?? [];
  const rawShowDayCount = rawShowDays.length;
  const roomShow =
    selected && !isAbsentTime(selected.show_time) ? (selected.show_time as string).trim() : null;
  const roomMD = roomShow ? parseRoomShowTimeMD(roomShow) : null;

  const out: ShowAnchor[] = [];
  for (const D of visibleShowDays(show.dates, dateRestriction)) {
    const day = runOfShow?.[D] ?? null;
    let time: string | null = null;

    if (day) {
      // Rows 1-3: sentinel-guarded candidate loop (showStart > window.start > entries[0].start).
      // Each candidate is checked via isAbsentTime before becoming ShowAnchor.time.
      for (const cand of [day.showStart, day.window?.start, day.entries[0]?.start]) {
        if (!isAbsentTime(cand)) {
          time = (cand as string).trim();
          break;
        }
      }
    }

    if (time == null && roomShow) {
      if (rawShowDayCount === 1) {
        // Row 4: single-show-day (RAW count) — room show_time always applies.
        time = roomShow;
      } else if (roomMD != null && roomMD === formatMD(D)) {
        // Row 5: multi-day — room show_time M/D must match this day's ISO date.
        time = roomShow;
      }
      // Row 6: no match → OMIT (time stays null).
    }

    if (time != null) {
      out.push({ date: D, label: labelFor(D, rawShowDayCount, rawShowDays), time });
    }
  }
  if (out.length > 0) anchors.shows = out;

  return anchors;
}
