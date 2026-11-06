import { eventPanel } from "@/components/crew/sections/eventRows";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import type { SearchEntry } from "@/lib/search/types";

import type { SectionBuildInput } from "./index";

/**
 * Event details search entries (spec §2.4, §4; crew page redesign PR C Task 5): the
 * lines `EventSection` renders, in render order, from `eventPanel` (eventRows.ts),
 * the model the section renders the shared body from, so each entry's id is the
 * `data-search-target` on its line. A row of the panel card sits in the panel's
 * region under the registry label; a field card's lines in the card's own region
 * under the field's label (plan decision 4).
 *
 * The section's body is one `WrappedSection` (`crew:event:details`): when the
 * derivation throws, the page renders the fallback and no lines, so the builder
 * contributes nothing. `resolveViewerContext` sits outside that boundary in the
 * component and here, so a malformed projection throws in both places.
 */
export function buildEventEntries({ data, viewer }: SectionBuildInput): SearchEntry[] {
  resolveViewerContext(viewer, data);
  try {
    return eventPanel(data.show.event_details, data.openingReelHasVideo).entries;
  } catch {
    return [];
  }
}
