import { flightCard, transportPanel } from "@/components/crew/sections/transportRows";
import { suppressesDates } from "@/lib/crew/dateSuppression";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import type { SearchEntry } from "@/lib/search/types";
import { transportTileVisible } from "@/lib/visibility/scopeTiles";

import type { SectionBuildInput } from "./index";

/**
 * Transport search entries (spec §2.4, §4; crew page redesign PR B Task 9): the
 * lines `TransportSection` renders for this viewer, in render order — Your
 * flight (each segment's line and its Conf, then the itinerary Confirmation),
 * then the shared transport body (its cells, its legs, its notes).
 *
 * The rows come from the same transportRows.ts derivations the component
 * renders, so each entry's id is the `data-search-target` on its line. The
 * gates are the component's: `transportTileVisible` with the arguments the
 * component passes, and `suppressesDates` for `hideDates`.
 *
 * The section's body is one `WrappedSection` (`crew:travel:transport`): when a
 * derivation throws, the page renders the fallback and no lines, so the builder
 * contributes nothing. `resolveViewerContext` sits outside that boundary in the
 * component and here, so a malformed projection throws in both places.
 */
export function buildTransportEntries({ data, viewer, today }: SectionBuildInput): SearchEntry[] {
  const ctx = resolveViewerContext(viewer, data);
  const hideDates = suppressesDates(ctx.dateRestriction);
  try {
    const transportVisible = transportTileVisible({
      transportation: data.transportation,
      viewerId: data.viewerId,
      transportationOwnerIds: data.transportationOwnerIds,
      viewerName: data.viewerName,
      viewerNameAliases: data.viewerNameAliases,
      isAdmin: ctx.isAdmin,
    });
    const transportation = transportVisible ? data.transportation : null;
    const panel = transportation !== null ? transportPanel(transportation, hideDates) : null;
    const flight = flightCard(data, today, hideDates);

    const lines: (SearchEntry | null)[] = [];
    if (flight.rows.length > 0) {
      for (const row of flight.rows) lines.push(row.line, row.confLine);
      lines.push(flight.confirmationLine);
    }
    if (panel !== null) lines.push(...panel.lines);
    return lines.filter((e): e is SearchEntry => e !== null);
  } catch {
    return [];
  }
}
