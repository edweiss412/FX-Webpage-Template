export const SOURCE_LINK_ALLOWLIST = ["INFO", "AGENDA", "GEAR", "TRAVEL", "PULL SHEET"] as const;
export type AllowedTabTitle = (typeof SOURCE_LINK_ALLOWLIST)[number];
export type SourceAnchor = { title: string; gid: number; a1?: string };

function isAllowed(title: string): boolean {
  return (SOURCE_LINK_ALLOWLIST as readonly string[]).includes(title);
}

export function buildSheetDeepLink(
  driveFileId: string | null | undefined,
  anchor?: SourceAnchor | null,
): string | null {
  if (!driveFileId) return null; // null OR empty string → omit
  const base = `https://docs.google.com/spreadsheets/d/${driveFileId}/edit`;
  if (!anchor || !isAllowed(anchor.title) || typeof anchor.gid !== "number") return base;
  let url = `${base}#gid=${anchor.gid}`; // gid===0 emitted literally
  if (anchor.a1) url += `&range=${encodeURIComponent(anchor.a1)}`;
  return url;
}

export const REGION_IDS = ["crew","contacts","hotels","transportation","flights",
  "rooms","venue","financials","details","gear_packlist","schedule"] as const;
export type RegionId = (typeof REGION_IDS)[number];

// EXACT full-cell section-header matches that bound a "header-block" region (mirror
// of the parser's per-block TERMINATING_LABELS; lib/parser/blocks/crew.ts:29-46 et al.).
// Anchored with $ so a region's OWN data rows (e.g. "Hotel Address", "Details note",
// "Driver") do NOT terminate its block (plan-R2 finding 2). The header row is excluded
// from terminator evaluation by scanning from the row AFTER the header (plan-R2 finding 1).
export const BLOCK_TERMINATORS: RegExp[] = [
  /^(CREW|TECH|VENUE|DATES|HOTEL|HOTELS|ROOMS|TRANSPORTATION|CONTACTS|SCHEDULE|PULL SHEET|DIAGRAMS|EVENT DETAILS|DETAILS|DRESS|GENERAL SESSION|BREAKOUT(?:\s+\d+)?|TO DO)$/i,
];

export type RegionAnchorSpec =
  | { tabs: AllowedTabTitle[]; strategy: "row-label-union"; labels: RegExp[] }
  | { tabs: AllowedTabTitle[]; strategy: "header-block"; header: RegExp; terminators: RegExp[] }
  | { tabs: AllowedTabTitle[]; strategy: "whole-tab" }
  | { tabs: AllowedTabTitle[]; strategy: "alias-of"; region: RegionId };

export const REGION_ANCHOR_SPEC: Record<RegionId, RegionAnchorSpec> = {
  crew:           { tabs: ["INFO"], strategy: "header-block", header: /^(CREW|TECH)$/i, terminators: BLOCK_TERMINATORS },
  flights:        { tabs: ["INFO"], strategy: "alias-of", region: "crew" }, // legacy flights live in the INFO TECH grid arrival/departure cols (spec §10)
  contacts:       { tabs: ["INFO"], strategy: "row-label-union", labels: [/contact\s*info/i, /in\s*house\s*av/i, /^contact\b/i] },
  hotels:         { tabs: ["INFO"], strategy: "header-block", header: /^(HOTEL|HOTELS|Hotel Stays|Hotel Reservations)$/i, terminators: BLOCK_TERMINATORS },
  transportation: { tabs: ["INFO"], strategy: "header-block", header: /^(TRANSPORTATION|Driver)$/i, terminators: BLOCK_TERMINATORS },
  rooms:          { tabs: ["INFO"], strategy: "row-label-union", labels: [/^GENERAL SESSION/i, /^BREAKOUT/i, /^GS (Setup|Set Time|Strike Time|Audio|Video|Scenic|Other)/i, /^BO (Setup|Set Time|Strike Time|Audio|Video|Other)/i] },
  venue:          { tabs: ["INFO"], strategy: "row-label-union", labels: [/^VENUE$/i, /Hotel Address/i, /Loading Dock/i, /Google/i] },
  financials:     { tabs: ["INFO"], strategy: "row-label-union", labels: [/^COI$/i, /^PO\s*#?$/i, /^Proposal$/i, /^Invoice/i] },
  details:        { tabs: ["INFO"], strategy: "header-block", header: /^(EVENT\s+DETAILS|DETAILS|GS\s+DETAILS)/i, terminators: BLOCK_TERMINATORS },
  gear_packlist:  { tabs: ["PULL SHEET","GEAR"], strategy: "whole-tab" },
  schedule:       { tabs: ["AGENDA"], strategy: "whole-tab" },
};

export const CARD_REGION_MAP: Record<string, RegionId> = { "crew-roster":"crew", "crew-contacts":"contacts", "travel-flight":"flights", "travel-getting-there":"transportation", "travel-hotels":"hotels", "venue-where":"venue", "venue-facilities":"venue", "venue-status":"venue", "gear-scope-audio":"rooms", "gear-scope-video":"rooms", "gear-scope-lighting":"rooms", "gear-pack-list":"gear_packlist", "gear-keynote":"details", "gear-opening-reel":"details", "schedule-days":"schedule", "schedule-call-times":"rooms", "budget-main":"financials", "today-tonight":"hotels", "today-where":"venue", "today-contact":"contacts", "today-key-times":"rooms", "today-dress":"details", "today-run-of-show":"schedule" };
export const MIXED_SOURCE_REGISTRY: Record<string, { primary: RegionId; secondaryFields: string[] }> = { "venue-facilities": { primary: "venue", secondaryFields: ["transportation.parking","event_details.internet","event_details.power"] }, "venue-status": { primary: "venue", secondaryFields: ["coi_status"] } };
export const OUT_OF_SCOPE_CARDS = ["today-rightnow","today-notes","venue-diagrams","gear-opening-reel-video"] as const;
