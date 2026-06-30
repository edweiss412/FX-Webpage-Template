/**
 * Closed-vocab whitelist for surfacing event_details text specs — single source
 * of truth for the crew GearSection "Tech specs" card AND the Step-3 review
 * modal. Keys with NO entry (PII/financial/unknown, and `diagrams` — a folder
 * link surfaced by the Diagrams tile) never render. (BL-EVENT-DETAILS-UNRENDERED)
 */
export const EVENT_DETAILS_LABELS = {
  stage_size: "Stage size",
  podium_type: "Podium",
  polling: "Polling",
  led: "LED wall",
  scenic: "Backdrop / scenic",
  gooseneck: "Gooseneck mics",
  digital_signage: "Digital signage",
  test_pattern: "Test pattern",
  fonts: "Fonts",
  equipment_storage: "Equipment storage",
  staff_office_room: "Staff office",
  record: "Recording",
  virtual_speaker: "Virtual speaker",
  virtual_audience: "Virtual audience",
  notes: "Notes",
  // Shown in the operator modal; already rendered elsewhere on the crew page:
  keynote_requirements: "Keynote",
  opening_reel: "Opening reel",
  internet: "Internet / Wi-Fi",
  power: "Power",
  dress_code: "Dress code",
} as const;

/**
 * Ordered crew Tech-specs card subset — EXCLUDES keys rendered on other crew
 * surfaces (dress→Today, internet/power→Venue, keynote/opening_reel→Gear) and
 * `diagrams`. Crew-impact first.
 */
export const CREW_TECH_SPEC_KEYS = [
  "stage_size",
  "podium_type",
  "polling",
  "led",
  "scenic",
  "gooseneck",
  "digital_signage",
  "test_pattern",
  "fonts",
  "equipment_storage",
  "staff_office_room",
  "record",
  "virtual_speaker",
  "virtual_audience",
  "notes",
] as const;

// Compile-time guard: every crew key MUST be a declared label key.
const _crewKeysAreLabeled: readonly (keyof typeof EVENT_DETAILS_LABELS)[] = CREW_TECH_SPEC_KEYS;
void _crewKeysAreLabeled;
