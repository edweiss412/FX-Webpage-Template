import {
  FACILITIES_TITLE,
  STATUS_TITLE,
  WIFI_PASSWORD_TEST_ID,
  WIFI_SSID_TEST_ID,
  venueFactRows,
  venueStatusLines,
  venueTransportVisible,
  venueWhereProps,
} from "@/components/crew/sections/venueRows";
import type { FactRow } from "@/components/crew/primitives/FactRows";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import type { SectionBuildInput } from "@/lib/search/sections";
import type { SearchCopy, SearchEntry } from "@/lib/search/types";
import { showSection } from "@/lib/showSections/registry";

/**
 * Venue search entries (spec §2.4, §4): the Venue panel's lines (the venue
 * name, the street and the city, grouped under the panel card's title, the
 * section's registry label), Facilities (dock, parking when the transport tile
 * is visible, room, the Wi-Fi network and password with `copy`, or the raw Crew
 * Wi-Fi row, internet notes, power) and Venue status (COI, venue notes): exactly
 * the lines `VenueSection` renders. Diagrams moved to Rooms (PR C Task 7).
 *
 * The Venue panel's wrapper holds the body call only; its lines are derived before
 * it, on both sides.
 */
export function buildVenueEntries({ data, viewer }: SectionBuildInput): SearchEntry[] {
  const ctx = resolveViewerContext(viewer, data);
  const entries: SearchEntry[] = [];
  const entry = (
    id: string,
    group: string,
    label: string | null,
    value: string,
    copy: SearchCopy | null = null,
  ): SearchEntry => ({ id, section: "venue", group, label, value, context: [], copy });

  // The Venue panel's lines, each its own target with no label: the body's
  // eyebrow repeats the card's title and is skipped. Derived outside the panel's
  // WrappedSection in the section too, so a throw here throws on both sides.
  const where = venueWhereProps(data.show.venue);
  const whereGroup = showSection("venue").label;
  for (const line of ["name", "address", "city"] as const) {
    const id = where.targets[line];
    const value = where[line];
    if (id !== undefined && value !== null) entries.push(entry(id, whereGroup, null, value));
  }

  const transportVisible = venueTransportVisible(data, ctx.isAdmin);
  for (const row of venueFactRows(data, { transportVisible })) {
    if (row.searchTarget !== undefined) {
      entries.push(entry(row.searchTarget, FACILITIES_TITLE, row.k, row.v, copyOf(row)));
    }
  }

  const { coi, notes } = venueStatusLines(data);
  for (const line of [coi, notes]) {
    if (line !== null) entries.push(entry(line.searchTarget, STATUS_TITLE, line.label, line.value));
  }
  return entries;
}

/** The Wi-Fi network and password rows are copyable (spec §3 `copy`). */
function copyOf(row: FactRow): SearchCopy | null {
  if (row.testId === WIFI_SSID_TEST_ID) return { kind: "network", text: row.v };
  if (row.testId === WIFI_PASSWORD_TEST_ID) return { kind: "password", text: row.v };
  return null;
}
