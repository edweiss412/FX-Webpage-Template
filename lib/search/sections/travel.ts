import { flightCard, gettingThereRows, hotelBlocks } from "@/components/crew/sections/travelRows";
import { suppressesDates } from "@/lib/crew/dateSuppression";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import type { SearchEntry } from "@/lib/search/types";
import { transportTileVisible } from "@/lib/visibility/scopeTiles";

import type { SectionBuildInput } from "./index";

/**
 * Travel search entries (spec §2.4, §4): the lines `TravelSection` renders for
 * this viewer, in render order — Your flight (each segment's line and its Conf,
 * then the itinerary Confirmation), Getting there (its rows, then the transport
 * notes), Hotels (per reservation: name, address, check in, check out,
 * confirmation, notes).
 *
 * The rows come from the same travelRows.ts derivations the component renders,
 * so each entry's id is the `data-search-target` on its line. The gates are the
 * component's: `transportTileVisible` with the arguments the component passes,
 * and `suppressesDates` for `hideDates`.
 *
 * The section's body is one `WrappedSection` (`crew:travel:transport`): when a
 * derivation throws, the page renders the fallback and no lines, so the builder
 * contributes nothing. `resolveViewerContext` sits outside that boundary in the
 * component and here, so a malformed projection throws in both places.
 */
export function buildTravelEntries({ data, viewer, today }: SectionBuildInput): SearchEntry[] {
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
    const ground = gettingThereRows(transportVisible ? data.transportation : null, hideDates);
    const hotels = hotelBlocks(data.hotelReservations, hideDates);
    const flight = flightCard(data, today, hideDates);

    const lines: (SearchEntry | null | undefined)[] = [];
    if (flight.rows.length > 0) {
      for (const row of flight.rows) lines.push(row.line, row.confLine);
      lines.push(flight.confirmationLine);
    }
    if (ground.visible) {
      for (const row of ground.rows) lines.push(row.line);
      lines.push(ground.notesLine);
    }
    for (const h of hotels) {
      lines.push(h.nameLine, h.addressLine, h.checkIn?.line, h.checkOut?.line, ...h.stayLines);
    }
    return lines.filter((e): e is SearchEntry => e !== null && e !== undefined);
  } catch {
    return [];
  }
}
