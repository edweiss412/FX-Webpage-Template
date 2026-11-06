import { gearScopeCards, roomDetailBlocks } from "@/components/crew/sections/gearRows";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import type { SearchEntry } from "@/lib/search/types";

import type { SectionBuildInput } from "./index";

/**
 * Gear search entries (spec §2.4, §4): the lines `GearSection` renders for this
 * viewer, in render order — the scope cards (the viewer's own disciplines
 * first; group = discipline, label = room), then room details (each room's
 * heading, then its fields).
 *
 * The rows come from the same gearRows.ts derivations the component renders,
 * so each entry's id is the `data-search-target` on its line, and the cap
 * (`ROOM_DETAIL_CAP`) applies by construction.
 *
 * The section's body is one `WrappedSection` (`crew:gear:scope`): when a
 * derivation throws, the page renders the fallback and no lines, so the builder
 * contributes nothing. `resolveViewerContext` sits outside that boundary in the
 * component and here, so a malformed projection throws in both places.
 */
export function buildGearEntries({ data, viewer }: SectionBuildInput): SearchEntry[] {
  const ctx = resolveViewerContext(viewer, data);
  try {
    const scopeCards = gearScopeCards(data.rooms, ctx.viewerFlags);
    const rooms = roomDetailBlocks(data.rooms);

    const lines: (SearchEntry | null | undefined)[] = [];
    for (const card of scopeCards) lines.push(...card.entries);
    for (const block of rooms.shown) lines.push(block.heading, ...block.entries);
    return lines.filter((e): e is SearchEntry => e !== null && e !== undefined);
  } catch {
    return [];
  }
}
