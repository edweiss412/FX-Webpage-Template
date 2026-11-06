/**
 * components/crew/sections/eventRows.ts — the Event details section's model, read
 * by `EventSection` and the search builder (lib/search/sections/event.ts), so the
 * page and the index cannot disagree about which lines exist, in what order, or
 * under which id (spec §2.4, INV-1).
 *
 * One model: the groups the shared body renders, a search target per line, and the
 * entries in render order. A row of the panel card is a line of the panel's region
 * under the registry label; a field card is its own region, and its label is its
 * group (plan decision 4), which `searchLine` then folds out of the label.
 *
 * Each key hides on its own existing rule (`crewEventGroups`), and every key goes
 * through `eventDetailGroups`, so the reel's URL strip applies to the page and the
 * index alike. No `"use client"`: the builder runs on the server.
 */
import { searchLine, type Seen } from "@/components/crew/sections/sectionLines";
import { parseDressCodeLines } from "@/lib/crew/dressCodeLines";
import {
  crewEventGroups,
  type EventDetailGroup,
  type EventDetailKey,
} from "@/lib/crew/eventDetailsSpecs";
import type { ShowForViewer } from "@/lib/data/getShowForViewer";
import type { SearchEntry } from "@/lib/search/types";
import type { CardId } from "@/lib/sheet-links/buildSheetDeepLink";
import { showSection } from "@/lib/showSections/registry";

/** The panel card's id: the old Tech specs card's, so a stored report still resolves. */
export const EVENT_PANEL_CARD_ID = "gear-tech-specs" satisfies CardId;

/** The fields that keep a card of their own inside the panel, each with its old id. */
export const EVENT_FIELD_CARD_IDS = {
  keynote_requirements: "gear-keynote",
  opening_reel: "gear-opening-reel",
  dress_code: "today-dress",
} as const satisfies Partial<Record<EventDetailKey, CardId>>;

/** The crew's name for a group: spec line 406 retires "Wardrobe" here, and only here. */
export function eventGroupTitle(title: string): string {
  return title === "Wardrobe & key moments" ? "Dress code & key moments" : title;
}

export type EventPanel = {
  groups: readonly EventDetailGroup[];
  /** Per key, a search target per line it renders: one, or one per dress code phase. */
  targets: Partial<Record<EventDetailKey, readonly (string | undefined)[]>>;
  /** Every line, in render order. */
  entries: SearchEntry[];
  /** The reel's proxied player renders. */
  showPlayer: boolean;
  /** The panel draws: a field to show, or the player. */
  visible: boolean;
};

function hasFieldCard(key: EventDetailKey): key is keyof typeof EVENT_FIELD_CARD_IDS {
  return Object.hasOwn(EVENT_FIELD_CARD_IDS, key);
}

export function eventPanel(
  eventDetails: ShowForViewer["show"]["event_details"] | null | undefined,
  hasVideo: boolean,
): EventPanel {
  const groups = crewEventGroups(eventDetails);
  const panelGroup = showSection("event").label;
  const seen: Seen = new Map();
  const entries: SearchEntry[] = [];
  const targets: EventPanel["targets"] = {};

  for (const { key, label, value } of groups.flatMap((g) => g.fields)) {
    const card = hasFieldCard(key) ? EVENT_FIELD_CARD_IDS[key] : null;
    const line = (lineLabel: string | null, lineValue: string): string | undefined => {
      const region = card ?? EVENT_PANEL_CARD_ID;
      const group = card !== null ? label : panelGroup;
      const entry = searchLine("event", region, group, lineLabel, lineValue, [], seen);
      if (entry !== null) entries.push(entry);
      return entry?.id;
    };
    const phases = key === "dress_code" ? parseDressCodeLines(value) : null;
    if (phases !== null) targets[key] = phases.map((p) => line(p.phase, p.attire));
    else if (key === "dress_code") targets[key] = [line(null, value)];
    else targets[key] = [line(label, value)];
  }

  return { groups, targets, entries, showPlayer: hasVideo, visible: groups.length > 0 || hasVideo };
}
