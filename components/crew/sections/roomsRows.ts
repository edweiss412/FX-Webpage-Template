/**
 * components/crew/sections/roomsRows.ts — the Rooms section's model, read by
 * `RoomsSection` and the search builder (lib/search/sections/rooms.ts), so the page
 * and the index cannot disagree about which lines exist, in what order, or under
 * which id (spec §2.4, INV-1).
 *
 * One model: the rooms the shared body renders, in `compareRooms` order with each
 * value coerced, the viewer's own disciplines, a search target per line, and the
 * entries in render order. A line is the room's name, a header field, or a discipline,
 * each in the panel's region under the registry label, and each after the name carries
 * its room as context. The body draws "Your scope" as chrome, so the line carries it
 * as context too.
 *
 * The viewer's own disciplines are an EMPHASIS, not a gate (spec line 309): every
 * discipline stays visible to everyone. No `"use client"`: the builder runs on the
 * server.
 */
import { searchLine, type Seen } from "@/components/crew/sections/sectionLines";
import { arr } from "@/components/show-panels/fieldRows";
import {
  ROOM_HEADER_KEYS,
  ROOM_HEADER_LABELS,
  ROOM_SCOPE,
  YOUR_SCOPE,
  roomHeaderValue,
  roomScopeRows,
  type RoomScopeKey,
} from "@/components/show-panels/roomScope";
import type { RoomTargets } from "@/components/show-panels/RoomsBody";
import { compareRooms, type ProjectedRoomRow } from "@/lib/crew/resolveKeyTimes";
import type { RoleFlag } from "@/lib/parser/types";
import type { SearchEntry } from "@/lib/search/types";
import type { CardId } from "@/lib/sheet-links/buildSheetDeepLink";
import { showSection } from "@/lib/showSections/registry";
import { roomLabel } from "@/lib/visibility/roomLabel";
import {
  audioScopeVisible,
  lightingScopeVisible,
  videoScopeVisible,
} from "@/lib/visibility/scopeTiles";

/** The panel card's id, the old Room details card's, and the region of its lines. */
export const ROOMS_CARD_ID = "gear-room-details" satisfies CardId;

/**
 * Which disciplines does this viewer "own"? Routes the freshly-derived roleFlags
 * through the canonical SCOPE_TILE_VISIBILITY_RULE predicates, the same predicates
 * that used to GATE the M4 scope tiles. Scenic and Other are never a viewer's own.
 */
function viewerDisciplines(flags: RoleFlag[]): Set<RoomScopeKey> {
  const set = new Set<RoomScopeKey>();
  if (audioScopeVisible(flags)) set.add("audio");
  if (videoScopeVisible(flags)) set.add("video");
  if (lightingScopeVisible(flags)) set.add("lighting");
  return set;
}

/** Every text field the body reads. */
const TEXT_KEYS = [...ROOM_HEADER_KEYS, ...ROOM_SCOPE.map((scope) => scope.key)];

/** The room with each value as text, so a non-string JSONB value still shows (plan decision 6). */
function coerced(room: ProjectedRoomRow): ProjectedRoomRow {
  const text = Object.fromEntries(TEXT_KEYS.map((k) => [k, String(room[k] ?? "").trim()]));
  return { ...room, ...text };
}

export type RoomsPanel = {
  /** Every room on the sheet, sorted and coerced. A partial projection's non-list reads as none. */
  rooms: ProjectedRoomRow[];
  /** The viewer's own disciplines. */
  emphasize: ReadonlySet<RoomScopeKey>;
  /** Per room, by its place in `rooms`, a search target per line. */
  targets: RoomTargets[];
  /** Every line, in render order. */
  entries: SearchEntry[];
};

export function roomsPanel(rooms: ProjectedRoomRow[], flags: RoleFlag[]): RoomsPanel {
  const emphasize = viewerDisciplines(flags);
  const group = showSection("rooms").label;
  const seen: Seen = new Map();
  const entries: SearchEntry[] = [];
  const line = (label: string | null, value: string, context: readonly (string | null)[]) => {
    const entry = searchLine("rooms", ROOMS_CARD_ID, group, label, value, context, seen);
    if (entry !== null) entries.push(entry);
    return entry?.id;
  };

  const shown = [...arr(rooms)].sort(compareRooms).map(coerced);
  const targets = shown.map((room): RoomTargets => {
    const name = roomLabel(room);
    const lines: RoomTargets = { name: line(null, name, []) };
    for (const key of ROOM_HEADER_KEYS) {
      const value = roomHeaderValue(room[key], "hide");
      if (value !== null) lines[key] = line(ROOM_HEADER_LABELS[key], value, [name]);
    }
    for (const row of roomScopeRows(room, { dropEmpty: true, emphasize })) {
      lines[row.key] = line(row.label, row.value!, [name, row.emphasized ? YOUR_SCOPE : null]);
    }
    return lines;
  });

  return { rooms: shown, emphasize, targets, entries };
}
