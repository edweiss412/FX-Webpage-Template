import { shouldHideGenericOptional, shouldHideOpeningReel } from "@/lib/visibility/emptyState";
import { stripOpeningReelText } from "@/lib/visibility/openingReelText";

/**
 * Closed-vocab whitelist for surfacing event_details text specs — single source
 * of truth for the crew Event details section AND the Step-3 review modal, which
 * render the one shared body. Keys with NO entry (PII/financial/unknown, and `diagrams` — a folder
 * link surfaced by the Diagrams tile) never render. (BL-EVENT-DETAILS-UNRENDERED)
 */
export const EVENT_DETAILS_LABELS = {
  stage_size: "Stage size",
  podium_type: "Podium",
  polling: "Audience polling",
  led: "LED wall",
  scenic: "Scenic",
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
  // Shown in the operator modal; on the crew page the first three join the Event
  // details section as field cards or the reel, and Wi-Fi and power stay in Venue:
  keynote_requirements: "Keynote",
  opening_reel: "Opening reel",
  internet: "Internet / Wi-Fi",
  power: "Power",
  dress_code: "Dress code",
} as const;

export type EventDetailKey = keyof typeof EVENT_DETAILS_LABELS;

/**
 * Event-details grouping (spec "3a Grouped"). The flat 20-field wall clusters
 * under five eyebrow headers; every key in the closed-vocab `EVENT_DETAILS_LABELS`
 * appears in exactly one group so a newly-added spec key can never silently
 * vanish from the review surface (pinned by a completeness test). The four
 * boolean keys render as neutral Yes/No state chips; `dress_code` renders as a
 * sunken free-text block; everything else is a label:value row
 * (components/show-panels/EventDetailsBody.tsx).
 */
export const EVENT_DETAIL_GROUPS: {
  title: string;
  keys: EventDetailKey[];
}[] = [
  { title: "Stage & scenic", keys: ["stage_size", "podium_type", "led", "scenic", "gooseneck"] },
  {
    title: "Display & content",
    keys: ["test_pattern", "digital_signage", "opening_reel", "fonts"],
  },
  { title: "Production", keys: ["polling", "record", "virtual_speaker", "virtual_audience"] },
  {
    title: "Site & logistics",
    keys: ["equipment_storage", "staff_office_room", "internet", "power"],
  },
  { title: "Wardrobe & key moments", keys: ["keynote_requirements", "dress_code", "notes"] },
];

export type EventDetailField = { key: EventDetailKey; label: string; value: string };
export type EventDetailGroup = { title: string; fields: EventDetailField[] };

/**
 * The groups a surface shows: each field's value, in group and key order, with
 * blank fields and emptied groups gone. `keys` narrows to a surface's subset;
 * absent, every key shows. Coerce FIRST (`String()` is null- and non-string-safe);
 * `opening_reel` keeps its URL-strip cleanup; trim keeps whitespace from inflating
 * a count. A sentinel stays: what a surface does with one is
 * `EventDetailsBody`'s `sentinels` prop.
 *
 * Pure and markup-free, so the crew page's client-reachable peek can read it
 * (tests/crew/crewSectionsClientGraph.test.ts); the body re-exports it.
 */
export function eventDetailGroups(
  details: Readonly<Record<string, unknown>> | null | undefined,
  keys?: readonly EventDetailKey[],
): EventDetailGroup[] {
  const ed = details ?? {};
  const valueFor = (key: string): string => {
    const text = String(ed[key] ?? "").trim();
    return key === "opening_reel" ? stripOpeningReelText(text).trim() : text;
  };
  const wanted = keys === undefined ? null : new Set<string>(keys);
  return EVENT_DETAIL_GROUPS.map((g) => ({
    title: g.title,
    fields: g.keys
      .filter((key) => wanted === null || wanted.has(key))
      .map((key) => ({ key, label: EVENT_DETAILS_LABELS[key], value: valueFor(key) }))
      .filter((f) => f.value.length > 0),
  })).filter((g) => g.fields.length > 0);
}

/**
 * Each key hides on its own rule: the reel keeps an "N/A", every other field drops
 * it. What `sentinels: "hide"` means, in `EventDetailsBody` and in every crew
 * reader of the same fields.
 */
export function hiddenEventField(field: EventDetailField): boolean {
  return field.key === "opening_reel"
    ? shouldHideOpeningReel(field.value)
    : shouldHideGenericOptional(field.value);
}

/** `groups` with each hidden field gone, and any group that leaves empty. */
export function withoutHiddenEventFields(
  groups: readonly EventDetailGroup[],
): readonly EventDetailGroup[] {
  return groups
    .map((g) => ({ ...g, fields: g.fields.filter((f) => !hiddenEventField(f)) }))
    .filter((g) => g.fields.length > 0);
}

/**
 * Ordered crew Tech-specs subset, the rows of the Event details panel — EXCLUDES
 * the keys with a card of their own there (`CREW_EVENT_KEYS` below), the keys
 * rendered on another crew surface (internet/power→Venue) and `diagrams`.
 * Crew-impact first.
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

/**
 * Every key the crew page's Event details section shows (spec §6.2 `event` row):
 * the Tech specs, the keynote, the opening reel and the dress code. Wi-Fi and
 * power stay in Venue.
 */
export const CREW_EVENT_KEYS = [
  ...CREW_TECH_SPEC_KEYS,
  "keynote_requirements",
  "opening_reel",
  "dress_code",
] as const;

/** The groups the crew section shows: its keys, each hidden on its own rule. */
export function crewEventGroups(
  details: Readonly<Record<string, unknown>> | null | undefined,
): readonly EventDetailGroup[] {
  return withoutHiddenEventFields(eventDetailGroups(details, CREW_EVENT_KEYS));
}

/**
 * How many fields the crew section shows. A playable video with no reel text is
 * one of them: the reel's label renders over the player alone. JSX-free, so the
 * client-reachable peek reads it (tests/crew/crewSectionsClientGraph.test.ts).
 */
export function crewEventFieldCount(
  details: Readonly<Record<string, unknown>> | null | undefined,
  hasVideo: boolean,
): number {
  const fields = crewEventGroups(details).flatMap((g) => g.fields);
  const playerAlone = hasVideo && !fields.some((f) => f.key === "opening_reel");
  return fields.length + (playerAlone ? 1 : 0);
}

// Compile-time guard: every crew key MUST be a declared label key.
const _crewKeysAreLabeled: readonly (keyof typeof EVENT_DETAILS_LABELS)[] = CREW_EVENT_KEYS;
void _crewKeysAreLabeled;
