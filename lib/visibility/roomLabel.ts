/**
 * lib/visibility/roomLabel.ts — display-label helper for a `RoomRow`
 * (M4 catch-up review, Important 4).
 *
 * The same 4-line function was inlined in AudioScopeTile,
 * VideoScopeTile, and LightingScopeTile before this extraction. Three
 * copies of "the room's display label" risked drift the moment the
 * label rule changed (e.g., when M9 polish adds a "GS" prefix or
 * truncation). One source of truth now lives here.
 *
 * Label rule (verbatim from the original tile copies):
 *   - kind: 'gs'         → room.name || "General Session"
 *   - kind: 'breakout'   → room.name || "Breakout"
 *   - kind: 'additional' → room.name || "Additional"
 *
 * Empty-string names fall through to the kind-default via `||` —
 * matching the original short-circuit semantics. RoomRow.name is typed
 * `string` (not `string | null`) per lib/parser/types.ts:130, so a
 * null-fallback isn't needed; empty-string is the only "no name"
 * signal the parser emits.
 *
 * Server-safe pure function.
 */
import type { RoomRow } from "@/lib/parser/types";

export function roomLabel(room: RoomRow): string {
  if (room.kind === "gs") return room.name || "General Session";
  if (room.kind === "breakout") return room.name || "Breakout";
  return room.name || "Additional";
}
