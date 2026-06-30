import type { RoomRow } from "@/lib/parser/types";

/** The per-room detail keys surfaced by BL-ROOM-DETAIL-UNRENDERED. */
export type RoomDetailKey =
  | "dimensions"
  | "floor"
  | "setup"
  | "set_time"
  | "show_time"
  | "strike_time";

/**
 * Ordered display list for the crew "Room details" card AND the Step-3 review
 * modal — single source of truth so the two surfaces can't drift. Physical
 * detail first (where / how big / how set), then the per-room schedule.
 * Deliberately EXCLUDES power/digital_signage (AV-adjacent; show-level
 * event_details already surfaces them) and notes (TodaySection renders it).
 * (BL-ROOM-DETAIL-UNRENDERED)
 */
export const ROOM_DETAIL_FIELDS: readonly { key: RoomDetailKey; label: string }[] = [
  { key: "dimensions", label: "Dimensions" },
  { key: "floor", label: "Floor" },
  { key: "setup", label: "Setup" },
  { key: "set_time", label: "Set time" },
  { key: "show_time", label: "Show time" },
  { key: "strike_time", label: "Strike time" },
] as const;

// Compile-time guard: every key is a real RoomRow field.
const _keysAreRoomFields: readonly (keyof RoomRow)[] = ROOM_DETAIL_FIELDS.map((f) => f.key);
void _keysAreRoomFields;
