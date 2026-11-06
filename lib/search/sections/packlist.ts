import { packList } from "@/components/crew/sections/packListRows";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import type { SearchEntry } from "@/lib/search/types";
import { isPackListVisibleToday } from "@/lib/visibility/packList";

import type { SectionBuildInput } from "./index";

/**
 * Pack list search entries (spec §2.4, §4; crew page redesign PR C Task 6): the lines
 * `PackListSection` renders, in render order, from `packList` (packListRows.ts), the
 * model the section renders the shared body from, so each entry's id is the
 * `data-search-target` on its line: each case's summary, then its items.
 *
 * - A viewer the gate refuses has no section: no entries. The shell's member list
 *   already leaves the id out, and this holds for any other caller.
 * - The section's body is one `WrappedSection` (`crew:packlist:cases`): when the
 *   derivation throws, the page renders the fallback and no lines, so the builder
 *   contributes nothing. `resolveViewerContext` sits outside that boundary in the
 *   component and here, so a malformed projection throws in both places.
 */
export function buildPackListEntries({ data, viewer, today }: SectionBuildInput): SearchEntry[] {
  const { stageRestriction } = resolveViewerContext(viewer, data);
  if (!isPackListVisibleToday({ show: data.show, restriction: stageRestriction, today })) return [];
  try {
    return packList(data).entries;
  } catch {
    return [];
  }
}
