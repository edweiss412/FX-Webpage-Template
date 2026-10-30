/**
 * components/crew/sections/gearRows.ts — the Gear section's row derivations.
 *
 * `GearSection` renders from these and the crew search builder
 * (lib/search/sections/gear.ts) indexes from them, so the page and the index
 * cannot disagree about which lines exist, in what order, or under which id
 * (spec §2.4, INV-1). Each line the section renders carries its `SearchEntry`
 * here; the component puts that entry's `id` on the line's element as
 * `data-search-target`.
 *
 * One export per card, on purpose: the parity suite's error-guard case makes
 * one of them throw for both callers, which only works across a module
 * boundary.
 *
 * Every generic-optional read routes through `shouldHideGenericOptional`
 * (lib/visibility/emptyState.ts), as it did inline in the component. No
 * `"use client"`: the builder runs on the server.
 */
import type { KeyValueRow } from "@/components/crew/primitives/KeyValueRows";
import { CREW_TECH_SPEC_KEYS, EVENT_DETAILS_LABELS } from "@/lib/crew/eventDetailsSpecs";
import { compareRooms, type ProjectedRoomRow } from "@/lib/crew/resolveKeyTimes";
import { ROOM_DETAIL_FIELDS } from "@/lib/crew/roomDetailFields";
import type { ShowForViewer } from "@/lib/data/getShowForViewer";
import type { PullSheetItem, RoleFlag, StageRestriction } from "@/lib/parser/types";
import { entryId } from "@/lib/search/entryId";
import { normalize } from "@/lib/search/normalize";
import type { SearchEntry } from "@/lib/search/types";
import { shouldHideGenericOptional, shouldHideOpeningReel } from "@/lib/visibility/emptyState";
import { stripOpeningReelText } from "@/lib/visibility/openingReelText";
import { isPackListVisibleToday } from "@/lib/visibility/packList";
import { roomLabel } from "@/lib/visibility/roomLabel";
import {
  audioScopeVisible,
  lightingScopeVisible,
  videoScopeVisible,
} from "@/lib/visibility/scopeTiles";

/**
 * Pack-list cases rendered inline; cases past it are not in the DOM (a "+N more"
 * stub renders instead). Exported so the crew search builder applies the same
 * cap, and so the cap-boundary test reads the live value.
 */
export const CASE_CAP = 12;

/**
 * Room-detail blocks rendered; blocks past it are not in the DOM (an "…and N
 * more rooms" line renders instead). Exported for the crew search builder.
 */
export const ROOM_DETAIL_CAP = 12;

type Seen = Map<string, number>;
type EventDetails = ShowForViewer["show"]["event_details"];

const tokens = (s: string) =>
  normalize(s)
    .map((t) => t.text)
    .join(" ");

/**
 * One search entry for one rendered line of a Gear card, or null when the line's
 * value is blank (the page renders no target for it). A label that equals its
 * group is stored as null (spec §3) and kept as context, so the rendered label
 * text is still carried by the entry (INV-1 clause 3).
 */
function searchLine(
  region: string,
  group: string,
  label: string | null,
  value: string,
  context: readonly (string | null | undefined)[],
  seen: Seen,
): SearchEntry | null {
  if (value.trim().length === 0) return null;
  const ctx = context.filter((c): c is string => typeof c === "string" && c.trim().length > 0);
  let lab = label !== null && label.trim().length > 0 ? label : null;
  if (lab !== null && tokens(lab) === tokens(group)) {
    ctx.unshift(lab);
    lab = null;
  }
  return {
    id: entryId("gear", region, group, lab, value, seen),
    section: "gear",
    group,
    label: lab,
    value,
    context: ctx,
    copy: null,
  };
}

/** `row` with its search target set, when the line has an entry. */
function targeted(row: KeyValueRow, entry: SearchEntry | null): KeyValueRow {
  return entry !== null ? { ...row, searchTarget: entry.id } : row;
}

// ── Scope cards ──────────────────────────────────────────────────────────────

export type Discipline = "audio" | "video" | "lighting" | "scenic" | "other";

/**
 * Per-discipline static metadata: canonical A→V→L order, the human heading, and
 * the per-room scalar accessor. The accessor reads `r.audio` / `r.video` /
 * `r.lighting` so the sentinel meta-test's `\br\.(audio|video|lighting)\b`
 * pattern matches and is sentinel-guarded. The card glyphs live in the
 * component.
 */
const DISCIPLINES: ReadonlyArray<{
  id: Discipline;
  heading: string;
  value: (r: ProjectedRoomRow) => string | null;
}> = [
  { id: "audio", heading: "Audio", value: (r) => r.audio },
  { id: "video", heading: "Video", value: (r) => r.video },
  { id: "lighting", heading: "Lighting", value: (r) => r.lighting },
  // Scenic + Other extend the same per-discipline card model (spec §3.6). They are
  // NEVER emphasized (viewerDisciplines below covers only A/V/L), so they render
  // neutral, after the three disciplines, and auto-omit when zero non-sentinel rows.
  { id: "scenic", heading: "Scenic", value: (r) => r.scenic },
  { id: "other", heading: "Other gear", value: (r) => r.other },
];

/** The eyebrow an emphasized (the viewer's own) scope card carries. */
export const YOUR_SCOPE = "Your scope";

/**
 * Which disciplines does this viewer "own"? Routes the freshly-derived
 * roleFlags through the canonical SCOPE_TILE_VISIBILITY_RULE predicates — the
 * SAME predicates that used to GATE the M4 scope tiles now drive the redesign's
 * emphasis flip (all scope shown to everyone; the viewer's own discipline(s)
 * sort first + carry the accent). This is an EMPHASIS signal, NOT a gate.
 */
function viewerDisciplines(flags: RoleFlag[]): Set<Discipline> {
  const set = new Set<Discipline>();
  if (audioScopeVisible(flags)) set.add("audio");
  if (videoScopeVisible(flags)) set.add("video");
  if (lightingScopeVisible(flags)) set.add("lighting");
  return set;
}

export type ScopeCard = {
  id: Discipline;
  heading: string;
  emphasized: boolean;
  /** One row per room with a present value, in `rooms` order, each targeted. */
  rows: KeyValueRow[];
  entries: SearchEntry[];
};

/** The scope cards in render order: the viewer's own disciplines first, then the rest. */
export function gearScopeCards(rooms: ProjectedRoomRow[], flags: RoleFlag[]): ScopeCard[] {
  const owned = viewerDisciplines(flags);

  // Build each discipline's present (non-sentinel) room values. A discipline
  // with zero present values is omitted — INCLUDING the viewer's own.
  const built = DISCIPLINES.map((d) => {
    const seen: Seen = new Map();
    const emphasized = owned.has(d.id);
    const region = `gear-scope-${d.id}`;
    const rows: KeyValueRow[] = [];
    const entries: SearchEntry[] = [];
    for (const r of rooms) {
      const v = d.value(r);
      if (shouldHideGenericOptional(v)) continue;
      const k = roomLabel(r);
      const entry = searchLine(region, d.heading, k, v!, [emphasized ? YOUR_SCOPE : null], seen);
      rows.push(targeted({ k, v: v! }, entry));
      if (entry !== null) entries.push(entry);
    }
    return { id: d.id, heading: d.heading, emphasized, rows, entries };
  }).filter((d) => d.rows.length > 0);

  // Emphasis order: the viewer's owned discipline cards FIRST (in canonical
  // A→V→L order, which is the DISCIPLINES array order — already preserved by
  // the .map above), then the remaining disciplines in the same canonical
  // order. A stable partition preserves canonical order within each group.
  return [...built.filter((d) => d.emphasized), ...built.filter((d) => !d.emphasized)];
}

// ── Pack list ────────────────────────────────────────────────────────────────

/** One pull-sheet item as its row reads: "4 × Shure ULXD4 receiver (Audio / Wireless)". */
export function packListItemLabel(item: PullSheetItem): string {
  const cat = shouldHideGenericOptional(item.cat) ? null : item.cat;
  const subCat = shouldHideGenericOptional(item.subCat) ? null : item.subCat;
  const taxonomy = [cat, subCat].filter(Boolean).join(" / ");
  const qtyPart = item.qty !== null ? `${item.qty} × ` : "";
  return `${qtyPart}${item.item}${taxonomy ? ` (${taxonomy})` : ""}`;
}

export type PackItem = {
  key: string;
  label: string;
  rawSnippet: string | null;
  entry: SearchEntry | null;
};

export type PackCase = {
  key: string;
  /** The summary label: the sheet's case label, else the invented "Case N". */
  label: string;
  /** "2 items". */
  count: string;
  /** The summary's line. Null for an invented "Case N" label, which is not sheet data. */
  entry: SearchEntry | null;
  items: PackItem[];
};

export type PackList = { visible: boolean; cases: PackCase[]; overflowCount: number };

const PACK = { region: "gear-pack-list", group: "Pack list" } as const;

/**
 * The pack list, gated by the canonical predicate (`today` threads straight
 * through); the pullSheet/empty-array fall-through mirrors PackListTile. Cases
 * past `CASE_CAP` are not rendered, so they carry no lines.
 */
export function packList(
  data: Pick<ShowForViewer, "pullSheet" | "show">,
  restriction: StageRestriction,
  today: Date,
): PackList {
  const visible =
    data.pullSheet !== null &&
    data.pullSheet.length > 0 &&
    isPackListVisibleToday({ show: data.show, restriction, today });
  if (!visible || data.pullSheet === null) return { visible: false, cases: [], overflowCount: 0 };

  const seen: Seen = new Map();
  const cases = data.pullSheet.slice(0, CASE_CAP).map((c, idx): PackCase => {
    const count = `${c.items.length} ${c.items.length === 1 ? "item" : "items"}`;
    const realLabel = c.caseLabel ? c.caseLabel : null;
    const entry =
      realLabel !== null
        ? searchLine(PACK.region, PACK.group, null, realLabel, [count], seen)
        : null;
    const items = c.items.map((item, itemIdx): PackItem => {
      const label = packListItemLabel(item);
      const rawSnippet = item.rawSnippet ? item.rawSnippet : null;
      // An item is one line: its label, with the raw sheet snippet beside it.
      const [value = "", ...rest] = [label, rawSnippet].filter(
        (l): l is string => l !== null && l.trim().length > 0,
      );
      return {
        key: `${item.item}-${itemIdx}`,
        label,
        rawSnippet,
        entry: searchLine(PACK.region, PACK.group, null, value, [...rest, entry?.value], seen),
      };
    });
    return {
      key: `${c.caseLabel}-${idx}`,
      label: c.caseLabel || `Case ${idx + 1}`,
      count,
      entry,
      items,
    };
  });
  return { visible, cases, overflowCount: Math.max(0, data.pullSheet.length - CASE_CAP) };
}

// ── Tech specs ───────────────────────────────────────────────────────────────

export type TechSpecs = { visible: boolean; rows: KeyValueRow[]; entries: SearchEntry[] };

/**
 * The show-level event_details specs not surfaced elsewhere
 * (BL-EVENT-DETAILS-UNRENDERED), in `CREW_TECH_SPEC_KEYS` order. `?? {}` is
 * null-safe parity with the modal; `String(...)` coerces non-string JSONB
 * values without throwing. KeyValueRows omits any sentinel/empty row, so a
 * row's entry exists exactly when the row renders.
 */
export function techSpecs(eventDetails: EventDetails | null | undefined): TechSpecs {
  const ed = eventDetails ?? {};
  const seen: Seen = new Map();
  const entries: SearchEntry[] = [];
  const rows = CREW_TECH_SPEC_KEYS.map((key): KeyValueRow => {
    const row = { k: EVENT_DETAILS_LABELS[key], v: String(ed[key] ?? "").trim() };
    if (shouldHideGenericOptional(row.v)) return row;
    const entry = searchLine("gear-tech-specs", "Tech specs", row.k, row.v, [], seen);
    if (entry !== null) entries.push(entry);
    return targeted(row, entry);
  });
  return { visible: rows.some((r) => !shouldHideGenericOptional(r.v)), rows, entries };
}

// ── Room details ─────────────────────────────────────────────────────────────

export type RoomDetailBlock = {
  id: string;
  label: string;
  /** The room heading's line. */
  heading: SearchEntry | null;
  rows: KeyValueRow[];
  /** The field lines, in field order. */
  entries: SearchEntry[];
};

export type RoomDetails = {
  visible: boolean;
  /** The blocks the card renders (at most `ROOM_DETAIL_CAP`), sorted by `compareRooms`. */
  shown: RoomDetailBlock[];
  hiddenCount: number;
};

const ROOMS = { region: "gear-room-details", group: "Room details" } as const;

/**
 * Per-room detail (BL-ROOM-DETAIL-UNRENDERED): physical + schedule fields the
 * parser captures but no card rendered. Room-first (a block per room), distinct
 * from the discipline-first scope cards. Sentinel-hidden via KeyValueRows;
 * String() coerces non-string JSONB without throwing.
 */
export function roomDetailBlocks(rooms: ProjectedRoomRow[]): RoomDetails {
  const all = [...rooms]
    .sort(compareRooms)
    .map((r) => ({
      id: r.id,
      label: roomLabel(r),
      rows: ROOM_DETAIL_FIELDS.map((f) => ({
        k: f.label,
        v: String(r[f.key] ?? "").trim(),
      })) satisfies KeyValueRow[],
    }))
    .filter((b) => b.rows.some((row) => !shouldHideGenericOptional(row.v)));
  const seen: Seen = new Map();
  const shown = all.slice(0, ROOM_DETAIL_CAP).map((b): RoomDetailBlock => {
    // The room heading is a line of its own; each field line names its room.
    const heading = searchLine(ROOMS.region, ROOMS.group, null, b.label, [], seen);
    const entries: SearchEntry[] = [];
    const rows = b.rows.map((row) => {
      if (shouldHideGenericOptional(row.v)) return row;
      const entry = searchLine(ROOMS.region, ROOMS.group, row.k, row.v, [b.label], seen);
      if (entry !== null) entries.push(entry);
      return targeted(row, entry);
    });
    return { id: b.id, label: b.label, heading, rows, entries };
  });
  return { visible: all.length > 0, shown, hiddenCount: all.length - shown.length };
}

// ── Keynote requirements, opening reel ───────────────────────────────────────

export type TextLine = { text: string; entry: SearchEntry | null };

/** `event_details.keynote_requirements`, sentinel-guarded, trimmed. */
export function keynoteRequirements(eventDetails: EventDetails): TextLine | null {
  const rawKeynote = eventDetails["keynote_requirements"] ?? null;
  if (shouldHideGenericOptional(rawKeynote)) return null;
  const text = rawKeynote!.trim();
  return {
    text,
    entry: searchLine("gear-keynote", "Keynote requirements", null, text, [], new Map()),
  };
}

export type OpeningReel = {
  /** The card renders: a playable video, or reel text. */
  visible: boolean;
  showPlayer: boolean;
  /** The URL-stripped "Status" row, targeted; empty when there is no reel text. */
  rows: KeyValueRow[];
  entries: SearchEntry[];
};

/**
 * Opening reel — URL-stripped text + the proxied player. The text line is shown
 * only when the cell isn't hidden (shouldHideOpeningReel); the player is shown
 * when the projection says a playable video exists.
 */
export function openingReel(eventDetails: EventDetails, hasVideo: boolean): OpeningReel {
  const rawReel = eventDetails["opening_reel"] ?? null;
  const reelText = shouldHideOpeningReel(rawReel) ? null : stripOpeningReelText(rawReel);
  // Defensive invariant: "has reel text" requires a NON-EMPTY string. Today
  // `shouldHideOpeningReel` already returns true for any value that strips to
  // "" (OPENING_REEL_HIDE contains "", emptyState.ts:49), so `reelText` is
  // never "" — but making the non-empty requirement explicit keeps the
  // whole-card-missing contract (no text + no video → render nothing, the
  // ported OpeningReelTile behavior) robust if that hide-set ever changes.
  const hasReelText = reelText !== null && reelText.length > 0;
  const entry = hasReelText
    ? searchLine("gear-opening-reel", "Opening reel", "Status", reelText, [], new Map())
    : null;
  return {
    visible: hasVideo || hasReelText,
    showPlayer: hasVideo,
    rows: hasReelText ? [targeted({ k: "Status", v: reelText }, entry)] : [],
    entries: entry !== null ? [entry] : [],
  };
}
