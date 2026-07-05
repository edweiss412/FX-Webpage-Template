import type { ParseWarning } from "@/lib/parser/types";
import type { RegionId } from "@/lib/sheet-links/buildSheetDeepLink";

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
  | "diagrams"
  | "packlist"
  | "billing"
  | "warnings"
  | "report";

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

// SectionId → the parser RegionId whose source_anchors range the section's
// "In sheet" heading link should target (bug #316 item 3). A wizard section is
// coarser than a region (KIND_TO_SECTION folds details/event_details/dress into
// `event`), so each section maps to its PRIMARY region; `null` = no single region
// → whole-sheet #gid=0 fallback (diagrams sub-block has no dfid; warnings spans the
// sheet; report is not a parsed region).
export const SECTION_REGION_MAP: Record<SectionId, RegionId | null> = {
  venue: "venue",
  event: "details",
  crew: "crew",
  contacts: "contacts",
  schedule: "schedule",
  agenda: "schedule",
  hotels: "hotels",
  transport: "transportation",
  rooms: "rooms",
  diagrams: null,
  packlist: "gear_packlist",
  billing: "financials",
  warnings: null,
  report: null,
};

export function sectionForWarning(w: ParseWarning): SectionId | null {
  const kind = w.blockRef?.kind;
  if (!kind) return null;
  return KIND_TO_SECTION[kind] ?? null;
}

export function warningsBySection(
  warnings: readonly ParseWarning[],
  renderedSections: ReadonlySet<SectionId>,
): ReadonlyMap<SectionId, readonly { warning: ParseWarning; index: number }[]> {
  const map = new Map<SectionId, { warning: ParseWarning; index: number }[]>();
  warnings.forEach((warning, index) => {
    if (warning.severity !== "warn") return;
    const mapped = sectionForWarning(warning);
    const target: SectionId = mapped !== null && renderedSections.has(mapped) ? mapped : "warnings";
    const list = map.get(target);
    if (list) list.push({ warning, index });
    else map.set(target, [{ warning, index }]);
  });
  return map;
}

export function deriveSectionStatuses(
  warnings: readonly ParseWarning[],
  renderedSections: ReadonlySet<SectionId>,
): { flagged: ReadonlySet<SectionId>; flaggedCount: number } {
  // Derived from warningsBySection so the flag set and the callout map can
  // never disagree (spec §E2). Same rules as before: warn-severity only;
  // mapped→section when rendered, else the warnings bucket; unmapped→warnings.
  const flagged = new Set(warningsBySection(warnings, renderedSections).keys());
  return { flagged, flaggedCount: flagged.size };
}
