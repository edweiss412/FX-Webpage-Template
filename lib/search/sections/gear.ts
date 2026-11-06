import { gearScopeCards, packList, roomDetailBlocks } from "@/components/crew/sections/gearRows";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import type { SearchEntry } from "@/lib/search/types";

import type { SectionBuildInput } from "./index";

/**
 * Gear search entries (spec §2.4, §4): the lines `GearSection` renders for this
 * viewer, in render order — the scope cards (the viewer's own disciplines
 * first; group = discipline, label = room), the pack list when it is visible
 * today (each case's summary, then its items), room details (each room's heading,
 * then its fields).
 *
 * The rows come from the same gearRows.ts derivations the component renders,
 * so each entry's id is the `data-search-target` on its line, and the caps
 * (`CASE_CAP`, `ROOM_DETAIL_CAP`) apply by construction.
 *
 * The section's body is one `WrappedSection` (`crew:gear:scope`): when a
 * derivation throws, the page renders the fallback and no lines, so the builder
 * contributes nothing. `resolveViewerContext` sits outside that boundary in the
 * component and here, so a malformed projection throws in both places.
 */
export function buildGearEntries({ data, viewer, today }: SectionBuildInput): SearchEntry[] {
  const ctx = resolveViewerContext(viewer, data);
  try {
    const scopeCards = gearScopeCards(data.rooms, ctx.viewerFlags);
    const pack = packList(data, ctx.stageRestriction, today);
    const rooms = roomDetailBlocks(data.rooms);

    const lines: (SearchEntry | null | undefined)[] = [];
    for (const card of scopeCards) lines.push(...card.entries);
    for (const c of pack.cases) lines.push(c.entry, ...c.items.map((item) => item.entry));
    for (const block of rooms.shown) lines.push(block.heading, ...block.entries);
    return lines.filter((e): e is SearchEntry => e !== null && e !== undefined);
  } catch {
    return [];
  }
}
