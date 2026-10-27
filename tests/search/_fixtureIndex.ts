import type { SectionId } from "@/lib/crew/resolveActiveSection";
import type { SearchCopy, SearchEntry, SearchIndex } from "@/lib/search/types";

/**
 * A hand-built search index shaped like a real show, for the matcher and the
 * results component. Entries are in render order per section. Ids are opaque:
 * tests find an entry by its content (`entryWhere`) and never type an id.
 *
 * Planted on purpose:
 * - a Today twin of a Venue line (the Where address) and of a Schedule line
 *   (Crew call), which repeat removal must drop;
 * - a Today-only room note (Salon A), which must stay;
 * - "Internet hardline at front of house" in Gear, reachable by the Wi-Fi alias
 *   and the phrase alias "front of house";
 * - Wi-Fi network and password rows with `copy`;
 * - two rooms whose scope reads "TBD".
 */

type EntrySpec = {
  section: SectionId;
  region: string;
  group: string;
  label: string | null;
  value: string;
  context?: readonly string[];
  copy?: SearchCopy;
};

export function buildEntries(specs: readonly EntrySpec[]): SearchEntry[] {
  return specs.map((spec, index) => ({
    id: `${spec.section}:${spec.region}:${index + 1}`,
    section: spec.section,
    group: spec.group,
    label: spec.label,
    value: spec.value,
    context: spec.context ?? [],
    copy: spec.copy ?? null,
  }));
}

const HYATT = "Hyatt Regency Chicago";

export const FIXTURE_INDEX: SearchIndex = {
  entries: buildEntries([
    // Today
    {
      section: "today",
      region: "today-where",
      group: "Where",
      label: "Address",
      value: "720 S Michigan Ave, Chicago, IL",
    },
    {
      section: "today",
      region: "today-key-times",
      group: "Key times",
      label: "Crew call",
      value: "6:30 AM",
      context: ["Tue, Oct 27"],
    },
    {
      section: "today",
      region: "today-notes",
      group: "Show notes",
      label: "Salon A",
      value: "Stage left door sticks, prop it open",
    },
    // Schedule
    {
      section: "schedule",
      region: "schedule-days",
      group: "Tue, Oct 27",
      label: "Crew call",
      value: "6:30 AM",
    },
    {
      section: "schedule",
      region: "schedule-run-of-show",
      group: "Run of show",
      label: "11:00 PM",
      value: "Strike and load out",
      context: ["Wed, Oct 28"],
    },
    {
      section: "schedule",
      region: "none",
      group: "Tue, Oct 27",
      label: "9:00 AM",
      value: "General session: Opening keynote",
      context: ["Grand Ballroom"],
    },
    // Venue
    {
      section: "venue",
      region: "venue-where",
      group: "Where",
      label: "Venue",
      value: "Hilton Chicago",
    },
    {
      section: "venue",
      region: "venue-where",
      group: "Where",
      label: "Address",
      value: "720 S Michigan Ave, Chicago, IL",
    },
    {
      section: "venue",
      region: "venue-facilities",
      group: "Facilities",
      label: "Wi-Fi network",
      value: "FXAV-Guest",
      copy: { kind: "network", text: "FXAV-Guest" },
    },
    {
      section: "venue",
      region: "venue-facilities",
      group: "Facilities",
      label: "Wi-Fi password",
      value: "ORDTG.",
      copy: { kind: "password", text: "ORDTG." },
    },
    {
      section: "venue",
      region: "venue-facilities",
      group: "Facilities",
      label: "Dock",
      value: "Loading dock on Balbo Dr, 12 ft clearance",
    },
    {
      section: "venue",
      region: "venue-facilities",
      group: "Facilities",
      label: "Parking",
      value: "Self park in the Balbo garage, $35 a day",
    },
    {
      section: "venue",
      region: "venue-facilities",
      group: "Facilities",
      label: "Power",
      value: "100A three phase at stage left",
    },
    {
      section: "venue",
      region: "venue-diagrams",
      group: "Diagrams",
      label: null,
      value: "Grand Ballroom floor plan",
    },
    // Travel
    {
      section: "travel",
      region: "travel-flight",
      group: "Your flight",
      label: null,
      value: "UA 1452 ORD to LGA, 7:05 PM",
    },
    {
      section: "travel",
      region: "travel-flight",
      group: "Your flight",
      label: "Confirmation",
      value: "QX7RTP",
      copy: { kind: "flightConfirmation", text: "QX7RTP" },
    },
    {
      section: "travel",
      region: "travel-getting-there",
      group: "Getting there",
      label: "Load out",
      value: "Truck departs 11:00 PM from the Balbo Dr entrance",
    },
    { section: "travel", region: "travel-hotels", group: "Hotels", label: null, value: HYATT },
    {
      section: "travel",
      region: "travel-hotels",
      group: "Hotels",
      label: "Check-in",
      value: "Mon, Oct 26",
      context: [HYATT],
    },
    {
      section: "travel",
      region: "travel-hotels",
      group: "Hotels",
      label: "Confirmation",
      value: "83920174",
      context: [HYATT],
      copy: { kind: "hotelConfirmation", text: "83920174" },
    },
    // Crew
    {
      section: "crew",
      region: "crew-roster",
      group: "Crew",
      label: "Doug Larson",
      value: "Producer",
    },
    { section: "crew", region: "crew-roster", group: "Crew", label: "Maria Chen", value: "A1" },
    {
      section: "crew",
      region: "crew-contacts",
      group: "Key contacts",
      label: "Priya Patel",
      value: "Client contact",
    },
    // Gear
    {
      section: "gear",
      region: "gear-scope-audio",
      group: "Audio",
      label: "Grand Ballroom",
      value: "8 handheld mics, 6 lavs, FOH console Yamaha CL5",
    },
    {
      section: "gear",
      region: "gear-scope-video",
      group: "Video",
      label: "Grand Ballroom",
      value: "Two 16x9 screens with 20K projectors, confidence monitor DSL",
    },
    {
      section: "gear",
      region: "gear-scope-lighting",
      group: "Lighting",
      label: "Salon A",
      value: "TBD",
    },
    {
      section: "gear",
      region: "gear-scope-lighting",
      group: "Lighting",
      label: "Salon B",
      value: "TBD",
    },
    {
      section: "gear",
      region: "gear-scope-other",
      group: "Other",
      label: "Grand Ballroom",
      value: "Internet hardline at front of house",
    },
    {
      section: "gear",
      region: "gear-keynote",
      group: "Keynote requirements",
      label: null,
      value: "Client laptops at the lectern with a presenter clicker",
    },
    // Budget
    { section: "budget", region: "budget", group: "Budget", label: "PO", value: "PO-44821" },
    {
      section: "budget",
      region: "budget",
      group: "Budget",
      label: "Invoice notes",
      value: "Net 30, send to accounts payable",
    },
  ]),
};

type EntryMatch = Partial<Pick<SearchEntry, "section" | "group" | "label" | "value">>;

/**
 * The ONE fixture entry whose fields equal every field given. Throws on zero or
 * several matches, so a test can never silently pick the wrong line.
 */
export function entryWhere(match: EntryMatch, index: SearchIndex = FIXTURE_INDEX): SearchEntry {
  const keys = Object.keys(match) as (keyof EntryMatch)[];
  const found = index.entries.filter((entry) => keys.every((key) => entry[key] === match[key]));
  if (found.length !== 1) {
    throw new Error(`entryWhere(${JSON.stringify(match)}) matched ${found.length} entries`);
  }
  return found[0]!;
}
