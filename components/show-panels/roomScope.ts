/**
 * components/show-panels/roomScope.ts — the room scope model both surfaces read
 * (crew page redesign spec §6.2, `rooms` row): the five disciplines, the room-kind
 * labels, and the rules that say a discipline holds no gear. Moved out of
 * step3ReviewSections.tsx with the Rooms body (PR C plan Task 3); the admin file
 * re-exports `roomHasScope`.
 *
 * Markup-free, so the crew's row helper reads the same rules the body renders with
 * and the search index and the page agree (plan decision 6).
 */
import { Lightbulb, Package, Theater, Video, Volume2, type LucideIcon } from "lucide-react";

import { hasContent } from "@/components/show-panels/fieldRows";
import type { RoomRow } from "@/lib/parser/types";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";

export type RoomScopeKey = "audio" | "video" | "lighting" | "scenic" | "other";

// Per-room equipment-scope disciplines shown under each room in the review
// breakdown so the operator can VERIFY parsed gear (GEAR-tab + INFO A/V/L)
// before publishing. Parsed values render AS-PARSED (sentinels like "TBD"/"-"
// included) — this is a parse-review surface, not the crew page (which
// sentinel-hides), so the operator sees exactly what landed. All five rows
// ALWAYS render (rooms-scope-cards redesign, 2026-07-04): an unparsed
// discipline reads a muted "Not specified", stating fact rather than asserting
// an intentional call. Order + glyphs mirror the crew GearSection
// (A→V→L→Scenic→Other). `color` is a single mid-lightness OKLCH per discipline
// (mock parity) — readable on the sunken icon chip in both light and dark.
export const ROOM_SCOPE: ReadonlyArray<{
  label: string;
  key: RoomScopeKey;
  Icon: LucideIcon;
  color: string;
}> = [
  { label: "Audio", key: "audio", Icon: Volume2, color: "oklch(0.60 0.12 25)" },
  { label: "Video", key: "video", Icon: Video, color: "oklch(0.57 0.11 255)" },
  { label: "Lighting", key: "lighting", Icon: Lightbulb, color: "oklch(0.63 0.11 75)" },
  { label: "Scenic", key: "scenic", Icon: Theater, color: "oklch(0.55 0.10 155)" },
  { label: "Other", key: "other", Icon: Package, color: "oklch(0.55 0.10 300)" },
];

// Copy shown for a discipline that did not parse. Deliberately NOT the mock's
// literal "Not needed" (which asserts an intentional decision) — on a
// parse-review surface a blank cell may simply be a gap. (owner decision,
// 2026-07-04; PRODUCT.md "missing data is a human sentence".)
export const ROOM_SCOPE_UNSPECIFIED = "Not specified";

/** The label an emphasized (the viewer's own) discipline carries. */
export const YOUR_SCOPE = "Your scope";

// A discipline whose gear is effectively empty — either unparsed (null → renders
// "Not specified") or an explicit "N/A" / "Not specified" sentinel from the
// sheet. These sort BELOW disciplines that carry real gear (owner decision,
// 2026-07-05) so the operator sees what's actually scoped first. Matched
// case-insensitively; leading/trailing whitespace tolerated.
export function isEmptyScopeValue(value: string | null): boolean {
  if (value === null) return true;
  return /^\s*(n\/?a|not\s*specified)\s*$/i.test(value);
}

/**
 * A discipline `dropEmpty` removes: either existing rule calls it empty (plan
 * decision 6). The crew's sentinel rule misses a parsed "Not specified", which spec
 * line 309 rules out, and the admin's misses TBD and the dashes.
 */
export function isDroppedScopeValue(value: string | null): boolean {
  return isEmptyScopeValue(value) || shouldHideGenericOptional(value);
}

// Humanized room-kind labels for the header pill (replaces the raw enum the
// legacy flat list rendered). RoomKind is a closed 3-value union, so the map is
// exhaustive — a new kind is a compile error here.
export const ROOM_KIND_LABEL: Record<RoomRow["kind"], string> = {
  gs: "General session",
  breakout: "Breakout",
  additional: "Additional",
};

/** A discipline's parsed gear, or null when the room holds no text for it. */
function scopeValue(room: RoomRow, key: RoomScopeKey): string | null {
  const value = room[key];
  return hasContent(value) ? value : null;
}

/**
 * A room "counts" for the Rooms & scope tally only when at least one of its five
 * A/V disciplines (audio/video/lighting/scenic/other) carries real gear. A room
 * whose every discipline is unparsed OR an explicit "N/A" / "Not specified"
 * sentinel — e.g. an "additional rooms" placeholder that only holds a setup note
 * — is not an A/V scope, so it is excluded from the count (owner decision,
 * 2026-07-06). The room still RENDERS in the breakdown; only the header/rail
 * count changes. Mirrors the per-discipline emptiness test used for scope sort.
 */
export function roomHasScope(r: RoomRow): boolean {
  return ROOM_SCOPE.some((scope) => !isEmptyScopeValue(scopeValue(r, scope.key)));
}

export type RoomScopeRow = (typeof ROOM_SCOPE)[number] & {
  value: string | null;
  emphasized: boolean;
};

/**
 * A room's discipline rows in render order. Disciplines with real gear sort to the
 * top; "N/A" / "Not specified" gear sinks to the bottom (owner decision,
 * 2026-07-05), and a stable sort keeps A→V→L→Scenic→Other within each group. Then
 * `dropEmpty` removes the empty ones, and the viewer's own disciplines lead, a
 * stable partition after that sort (plan decision 6).
 */
export function roomScopeRows(
  room: RoomRow,
  { dropEmpty, emphasize }: { dropEmpty: boolean; emphasize: ReadonlySet<RoomScopeKey> },
): RoomScopeRow[] {
  const rows = ROOM_SCOPE.map((scope) => ({
    ...scope,
    value: scopeValue(room, scope.key),
    emphasized: emphasize.has(scope.key),
  })).sort((a, b) => Number(isEmptyScopeValue(a.value)) - Number(isEmptyScopeValue(b.value)));
  const kept = dropEmpty ? rows.filter((row) => !isDroppedScopeValue(row.value)) : rows;
  return [...kept.filter((row) => row.emphasized), ...kept.filter((row) => !row.emphasized)];
}
