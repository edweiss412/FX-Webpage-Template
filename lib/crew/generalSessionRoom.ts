/**
 * lib/crew/generalSessionRoom.ts — the general-session room name a crew surface
 * may show.
 *
 * One rule for the Venue section's "Room" row and the crew home pass's "Room"
 * cell (crew page redesign spec §4.3), so the two can never disagree.
 */
import type { ShowForViewer } from "@/lib/data/getShowForViewer";
import { compareRooms } from "@/lib/crew/resolveKeyTimes";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";

/**
 * The name the parser synthesizes when a v1 / metadata-trimmed sheet heads its
 * general-session block with nothing nameable (`lib/parser/blocks/rooms.ts` —
 * "fall back to 'General Session' rather than mis-naming the GS room"). Five of
 * the ten raw fixtures parse to exactly this. A row reading "Room: General
 * Session" restates the block heading and tells a crew member nothing, so it is
 * suppressed. Held locally rather than imported because the parser is out of
 * scope; the suppression test is fixture-derived (it runs the real parser) so a
 * renamed fallback fails loudly instead of passing vacuously.
 */
export const SYNTHESIZED_GS_ROOM_NAME = "General Session";

/**
 * The deterministic GS room's name (`compareRooms`), or null.
 *
 * Already parsed (ROOMS header line 2, section prefix stripped) — surfaced here,
 * never re-derived. Null on a rooms fetch failure: `readRooms` fail-softs to `[]`
 * with `tileErrors.rooms`, so the array alone cannot tell "no rooms" from "we
 * could not read them", and the failure is already surfaced by the
 * rooms-consuming tiles' SectionTileError. Null for a sentinel name (a room
 * literally named "TBD" would otherwise be shown and then dropped by a renderer
 * that hides sentinels, leaving an empty card; diff review R2 F2), and null for
 * the parser's synthesized fallback name.
 */
export function generalSessionRoomName(
  data: Pick<ShowForViewer, "rooms" | "tileErrors">,
): string | null {
  if (data.tileErrors["rooms"]) return null;
  const gsRoom = data.rooms.filter((room) => room.kind === "gs").sort(compareRooms)[0] ?? null;
  if (gsRoom === null || shouldHideGenericOptional(gsRoom.name)) return null;
  const name = gsRoom.name.trim();
  return name.length > 0 && name.toLowerCase() !== SYNTHESIZED_GS_ROOM_NAME.toLowerCase()
    ? name
    : null;
}
