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

/**
 * The crew's group order: the group holding the dress code leads, the rest as the
 * admin has them. The home clamps the dress code and names this section its full-text
 * destination, so a crew member arrives here for that fact; it came last, 1372px down
 * a 2153px sheet at 390 (gate repair 3).
 */
const CREW_LEAD_GROUP = "Wardrobe & key moments";
export const CREW_EVENT_GROUP_ORDER: readonly string[] = [
  CREW_LEAD_GROUP,
  ...EVENT_DETAIL_GROUPS.map((g) => g.title).filter((title) => title !== CREW_LEAD_GROUP),
];

/** The groups the crew section shows: its keys, each hidden on its own rule, in its order. */
export function crewEventGroups(
  details: Readonly<Record<string, unknown>> | null | undefined,
): readonly EventDetailGroup[] {
  const rank = (g: EventDetailGroup) => CREW_EVENT_GROUP_ORDER.indexOf(g.title);
  return [...withoutHiddenEventFields(eventDetailGroups(details, CREW_EVENT_KEYS))].sort(
    (a, b) => rank(a) - rank(b),
  );
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

/** The fields the section's peek names, in the order it names them. */
export const CREW_EVENT_PEEK_KEYS = ["dress_code", "keynote_requirements"] as const;

/** The labels of `CREW_EVENT_PEEK_KEYS` the section shows for these details. */
export function crewEventPeekLabels(
  details: Readonly<Record<string, unknown>> | null | undefined,
): readonly string[] {
  const shown = new Set(crewEventGroups(details).flatMap((g) => g.fields.map((f) => f.key)));
  return CREW_EVENT_PEEK_KEYS.filter((key) => shown.has(key)).map(
    (key) => EVENT_DETAILS_LABELS[key],
  );
}

// Compile-time guard: every crew key MUST be a declared label key.
const _crewKeysAreLabeled: readonly (keyof typeof EVENT_DETAILS_LABELS)[] = CREW_EVENT_KEYS;
void _crewKeysAreLabeled;
