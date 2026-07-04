import type { ParseWarning } from "@/lib/parser/types";

export type SectionId =
  | "venue"
  | "event"
  | "crew"
  | "contacts"
  | "schedule"
  | "agenda"
  | "hotels"
  | "transport"
  | "rooms"
  | "packlist"
  | "billing"
  | "warnings";

const KIND_TO_SECTION: Record<string, Exclude<SectionId, "warnings">> = {
  crew: "crew",
  travel: "crew",
  flights: "crew",
  contacts: "contacts",
  client: "contacts",
  schedule: "schedule",
  dates: "schedule",
  strike: "schedule",
  loadout: "schedule",
  agenda: "agenda",
  hotels: "hotels",
  hotel_reservations: "hotels",
  transportation: "transport",
  rooms: "rooms",
  gear_scope: "rooms",
  pull_sheet: "packlist",
  gear_packlist: "packlist",
  venue: "venue",
  details: "event",
  event_details: "event",
  dress: "event",
  financials: "billing",
};

export function sectionForWarning(w: ParseWarning): SectionId | null {
  const kind = w.blockRef?.kind;
  if (!kind) return null;
  return KIND_TO_SECTION[kind] ?? null;
}

export function deriveSectionStatuses(
  warnings: readonly ParseWarning[],
  renderedSections: ReadonlySet<SectionId>,
): { flagged: ReadonlySet<SectionId>; flaggedCount: number } {
  const flagged = new Set<SectionId>();
  for (const w of warnings) {
    if (w.severity !== "warn") continue;
    const mapped = sectionForWarning(w);
    if (mapped !== null && renderedSections.has(mapped)) flagged.add(mapped);
    else flagged.add("warnings"); // unmapped or degraded → the always-rendered checks row (§7)
  }
  return { flagged, flaggedCount: flagged.size };
}
