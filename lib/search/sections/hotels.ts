import { hotelsPanel } from "@/components/crew/sections/hotelsRows";
import { suppressesDates } from "@/lib/crew/dateSuppression";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import type { SearchEntry } from "@/lib/search/types";

import type { SectionBuildInput } from "./index";

/**
 * Hotels search entries (spec §2.4, §4; crew page redesign PR B Task 9): the
 * lines `HotelsSection` renders for this viewer, in render order, per
 * reservation by `ordinal`: name, address, check in, check out, confirmation,
 * notes. They come from `hotelsPanel` (hotelsRows.ts), the derivation the
 * section renders its shared hotel cards from, so each entry's id is the
 * `data-search-target` on its line. The gate is the section's: `suppressesDates`
 * for `hideDates`.
 *
 * The section's body is one `WrappedSection` (`crew:hotels:list`): when the
 * derivation throws, the page renders the fallback and no lines, so the builder
 * contributes nothing. `resolveViewerContext` sits outside that boundary in the
 * component and here, so a malformed projection throws in both places.
 */
export function buildHotelsEntries({ data, viewer }: SectionBuildInput): SearchEntry[] {
  const ctx = resolveViewerContext(viewer, data);
  const hideDates = suppressesDates(ctx.dateRestriction);
  try {
    return hotelsPanel(data.hotelReservations, hideDates).lines;
  } catch {
    return [];
  }
}
