/**
 * ROOMS block parser (§2.7).
 *
 * Returns RoomRow[] from three layout variants in the corpus:
 *
 * 1. v4 structured blocks (2026+):
 *    Header cell: "GENERAL SESSION <name> <dimensions> <floor>" (first col, all caps)
 *    Followed by bare-label rows for all 12 v4 fields (V4_LABEL_TO_FIELD): Setup, Set Time,
 *      Show Time, Strike Time, Audio, Video, Lighting, Scenic, Power, Digital Signage, Other,
 *      Notes. A misspelled bare label is recovered via a gated fuzzy fallback (PR-D3); do not
 *      strip the map's "backdrop / scenic" / "gs other" / "bo other" exact aliases.
 *    Breakout header: "BREAKOUT N <name> <dimensions> <floor>"
 *
 * 2. v2/v1 GS-prefix rows (2025 and earlier):
 *    GS room: rows labeled "GS Setup", "GS Set Time", "GS Show Time", "GS Strike Time",
 *             "GS Audio", "GS Video", "GS Scenic", "GS LED", "GS Lighting", "GS Power",
 *             "GS Other", "Digital Signage"
 *    Breakout: header cell "BREAKOUT N\nBREAKOUT ROOM\nDimensions\nFloor" (&#10; separated)
 *              followed by "BO Setup", "BO Set Time", "BO Show Time", "BO Strike Time", etc.
 *    Additional: header cell "ADDITIONAL ROOM\nDimensions\nFloor"
 *              followed by "Setup", "Set Time", "Show Time", "Strike Time"
 *
 * 3. v1 GS-prefix rows (2024, same as v2 but slightly different labels):
 *    "GS Setup" / "GS Set Time" / "GS Strike Time" / "GS Audio" / "GS Video" / "GS Scenic"
 *    Breakout header: "MABEL 1\nDAY 1 & 2" style (name only in header)
 *    BO fields: "BO Setup", "BO Set Time", etc.
 */

import type { RoomRow, RoomKind } from "../types";
import { type ParseAggregator, emitEmptySection } from "@/lib/parser/warnings";
import { clean, presence, splitRow } from "./_helpers";
import { gatedVocabCorrect } from "@/lib/parser/typoGate";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";
import { classifyGearItem } from "@/lib/parser/gearClassification";
import { KNOWN_SECTION_HEADERS, KNOWN_SUB_LABELS } from "@/lib/parser/knownSections";

// ── Room-header shape model (spec §2.2/§2.3) ──────────────────────────────────
// De-literalizes the two-name `mabelRe` loop: a v1 breakout room is admitted on
// THREE local structural signals (shape + preceded-by-boundary + field-evidence),
// never on a hardcoded venue name.

// Room-FIELD labels (spec §2.3 item 3). DERIVED from the labels `applyBoLabel`/
// `applyGsLabel` recognize (below) plus the header value-fields `splitRoomHeader`
// lifts (DIMENSIONS/FLOOR) and the v4 NAME(S) template word — a proper room NAME is
// never one of these, so a field-label row (`BO SETUP`, `AUDIO`) is rejected at the
// name-shape gate. Kept as a single const so it cannot drift from the parser.
const ROOM_FIELD_LABELS: ReadonlySet<string> = new Set([
  "SETUP",
  "SET TIME",
  "SHOW TIME",
  "STRIKE TIME",
  "AUDIO",
  "VIDEO",
  "SCENIC",
  "LIGHTING",
  "LED",
  "POWER",
  "OTHER",
  "DIMENSIONS",
  "FLOOR",
  "DIGITAL SIGNAGE",
  "NAME(S)",
  "NOTES",
]);

// Section/room FAMILIES that intentionally carry a suffix and are claimed by a
// dedicated path (BO/GS/ADDITIONAL/LUNCH) — matched as a whole-token PREFIX so
// `BREAKOUT 3` / `ADDITIONAL ROOM 2` / `LUNCH ROOM` are excluded but a compound
// room name is not (spec §2.3 item 2, PREFIX-match).
const SECTION_PREFIX_FAMILIES = [
  "GENERAL SESSION",
  "BREAKOUT",
  "ADDITIONAL",
  "LUNCH",
  "DETAILS",
] as const;

// Bare generic section tokens — a section header is EXACTLY the token, never a
// compound room name — matched by EQUALITY against the DAY-stripped identity (spec
// §2.3 item 2, EXACT-match), unioned with the live known-section registries.
const SECTION_EXACT_TOKENS: ReadonlySet<string> = new Set([
  "DOCUMENTS",
  "DATES",
  "CREW",
  "DRESS",
  "TRANSPORTATION",
  "HOTEL",
  "VENUE",
  "AGENDA",
  "CONTACTS",
  ...KNOWN_SECTION_HEADERS,
  ...KNOWN_SUB_LABELS,
]);

/** First cell of a markdown table row, trimmed (keeps a literal `&#10;`). */
function col0Of(line: string): string {
  return (line.split("|")[1] ?? "").trim();
}

/** True iff `row` is a `| … |` row whose every inter-pipe cell is whitespace. */
function allEmptyCells(row: string): boolean {
  const t = row.trim();
  if (!t.startsWith("|")) return false;
  const cells = t.split("|").slice(1, -1);
  return cells.length > 0 && cells.every((c) => c.trim() === "");
}

/**
 * PURE — name-shape only (spec §2.2 (a), §2.3 items 1-3). True iff the header
 * cell's first line is a proper, non-dims-leading NAME with a NON-EMPTY base after
 * the trailing DAY-range is stripped, and is neither a section banner nor a
 * room-field label.
 */
export function roomHeaderNameShape(col0Raw: string): boolean {
  const firstLine = col0Raw.replace(/&#10;/g, "\n").split("\n")[0]!.trim();
  const upper = firstLine.toUpperCase();
  // item 1: proper name shape, NOT dimension-leading.
  if (!/^[A-Z0-9][A-Z0-9 &',./-]*$/.test(upper)) return false;
  if (/^\d+\s*'\s*x/i.test(upper)) return false;
  // item 2: non-empty identity (DAY-stripped), not a section banner.
  const identity = roomBaseName(firstLine);
  if (identity.length === 0) return false;
  if (SECTION_PREFIX_FAMILIES.some((p) => identity === p || identity.startsWith(p + " "))) {
    return false;
  }
  if (SECTION_EXACT_TOKENS.has(identity)) return false;
  if (/^GS\s/i.test(firstLine)) return false;
  // item 3: not a room-FIELD label (strip an optional leading BO / GS prefix).
  const labelIdentity = upper.replace(/^(?:BO|GS)\s+/, "").trim();
  if (ROOM_FIELD_LABELS.has(labelIdentity)) return false;
  return true;
}

/**
 * PURE — a TRAILING DAY-RANGE that is the cell's LAST content (spec §2.2 (b)).
 * The DAY line must END with the range (rejects `SPECIAL DAY 1 NOTES`), and every
 * non-empty line AFTER it must be a dims-only line (rejects `SPECIAL DAY 1&#10;NOTES`
 * but admits `MERIDIAN&#10;DAY 1 & 2&#10;60' x 45'`). Robust to `&#10;` vs real `\n`.
 */
export function headerDayMarker(col0Raw: string): boolean {
  const lines = col0Raw
    .replace(/&#10;/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  let anchor = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/\bDAYS?\s+\d[\d\s&,.\-–—]*$/i.test(lines[i]!)) anchor = i;
  }
  if (anchor === -1) return false;
  for (let i = anchor + 1; i < lines.length; i++) {
    if (!/^\d+\s*'?\s*x\s*\d/i.test(lines[i]!)) return false;
  }
  return true;
}

/** PURE single-cell SHAPE predicate (spec §2.2 (c)). */
export function isRoomHeaderShape(col0Raw: string): boolean {
  return roomHeaderNameShape(col0Raw) && headerDayMarker(col0Raw);
}

/** The bare NAME — first line with a TRAILING inline DAY-range stripped, uppercased (spec §2.2 (d)). */
export function roomBaseName(firstLine: string): string {
  return firstLine
    .replace(/\s*\bDAYS?\s+\d[\d\s&,.\-–—]*$/i, "")
    .trim()
    .toUpperCase();
}

/**
 * The NORMALIZED trailing DAY-range digits of the cell's LAST day-marker line (spec §2.2 (d)).
 * MUST anchor on the LAST day line, not the first — `headerDayMarker` admits on the last trailing
 * day marker, so a first-match here would group a multi-day-line header (`SALON&#10;DAY 1&#10;DAY 2`)
 * under `DAY 1` and wrong-merge it with a real single-day `SALON&#10;DAY 1` block (whole-diff R6 f2).
 */
export function dayRangeOf(col0Raw: string): string {
  let last = "";
  for (const line of col0Raw.replace(/&#10;/g, "\n").split("\n")) {
    const m = /\bDAYS?\s+(\d[\d\s&,.\-–—]*?)\s*$/i.exec(line.trim());
    if (m) last = m[1]!;
  }
  return last.replace(/\s+/g, "").toUpperCase();
}

/** The GROUPING key = roomBaseName + " " + dayRangeOf (spec §2.2 (d)). */
export function roomGroupKey(col0Raw: string, firstLine: string): string {
  return roomBaseName(firstLine) + " " + dayRangeOf(col0Raw);
}

/**
 * FIELD-EVIDENCE (spec §2.2 (c2) signal 1, R37 f1). True iff the row IMMEDIATELY
 * beneath `i` (skipping a `:---:` separator / all-empty row) is a `BO …`/`GS …`
 * field-label row. The `BO`/`GS` prefix is MANDATORY (whole-diff Codex R1 [high]):
 * a BARE field-ish col0 (`Audio`, `Setup`, `Notes`) is NOT evidence, else a DAY-titled
 * NOTE whose first row happens to be `| Audio | … |` would be admitted as a phantom
 * breakout. Real rooms in BOTH renderer families carry the prefix on the FIRST field
 * row (raw/: `BO Setup`; exporter-xlsx: `BO Setup`/`GS Setup` — its bare `Setup`/
 * `Power`/`Notes` rows are only deeper CONTINUATION rows, never the first). Separates a
 * room (`MABEL`→`BO Setup`) from an agenda note (`WELCOME RECEPTION DAY 1`→schedule rows).
 */
function hasFieldBlock(lines: string[], i: number, prefixRe: RegExp): boolean {
  for (let k = i + 1; k < lines.length; k++) {
    const t = (lines[k] ?? "").trim();
    if (!t.startsWith("|")) break;
    if (/^\|\s*:?-+/.test(t) || allEmptyCells(t)) continue;
    const prefixed = prefixRe.exec(col0Of(lines[k]!).trim());
    if (prefixed && ROOM_FIELD_LABELS.has(prefixed[1]!.trim().toUpperCase())) return true;
    break; // the first NON-field body row ends the immediately-following field block
  }
  return false;
}

export function hasRoomFieldBlock(lines: string[], i: number): boolean {
  return hasFieldBlock(lines, i, /^(?:BO|GS)\s+(.*)$/i);
}

/**
 * BO-ONLY field-evidence (whole-diff Codex R7 [high]). A GS row proves a room EXISTS but that
 * room belongs to the general-session path (`extractGsBlock`/`parseGsRoom`), NOT the v1 Pass-2
 * BREAKOUT loop that consumes `model.groups`. Admitting a GS-only-evidenced header to a group
 * emits a PHANTOM breakout — the header-dims harvest (parseBoRooms ~1081) makes an otherwise
 * BO-empty room pass `roomHasContent`, duplicating the GS room. So `groups` membership is gated
 * on BO evidence; `roomHeaderLines` (the terminator set) still admits BO OR GS via `isRoomHeader`
 * — a GS header scoping block extraction is correct and carries no overrun risk. origin/main's
 * literal MABEL/LAUDERDALE loop was BO-only by construction; this preserves that contract.
 */
export function hasBoFieldBlock(lines: string[], i: number): boolean {
  return hasFieldBlock(lines, i, /^BO\s+(.*)$/i);
}

/**
 * PRECEDED-BY-BOUNDARY (spec §2.2 (c2) signal 2, R38 f1). True iff the candidate
 * STARTS a room block: `i===0`, or the immediately-preceding line is blank/non-`|`,
 * a `:---:` separator, or an all-empty-cells row. This is what an interleaved
 * in-room note LACKS (it is preceded by a non-empty field row).
 */
export function precededByBoundary(lines: string[], i: number): boolean {
  if (i === 0) return true;
  const prev = (lines[i - 1] ?? "").trim();
  if (!prev.startsWith("|")) return true;
  if (/^\|\s*:?-+/.test(prev)) return true;
  return allEmptyCells(prev);
}

/** Composed room-header admit predicate — shape × boundary × field-evidence (spec §2.2 (c2)). */
export function isRoomHeader(lines: string[], i: number): boolean {
  return (
    isRoomHeaderShape(col0Of(lines[i] ?? "")) &&
    precededByBoundary(lines, i) &&
    hasRoomFieldBlock(lines, i)
  );
}

export type RoomCandidate = { key: string; displayName: string; lineIndex: number };
export type RoomHeaderModel = {
  lines: string[]; // markdown.split("\n"), shared by all consumers
  roomHeaderLines: ReadonlySet<number>; // absolute LINE indices of ALL admitted headers (terminators)
  groups: Map<string, RoomCandidate[]>; // roomGroupKey → its admitted candidates (for Pass 2)
};

/**
 * TOP-LEVEL room-header model (spec §2.2 (e), Pass 0). Computed ONCE from the raw
 * markdown BEFORE any block parse; LINE-BASED (indices into `markdown.split("\n")`).
 * Admits a candidate iff `isRoomHeader` (shape AND boundary AND field-evidence), so a
 * day-labelled note has no field block / is not at a boundary → not admitted, not a
 * terminator, cannot fabricate a room or steal a field. This is the DROP-IN for the
 * old two-name `mabelRe` loop.
 */
export function computeRoomHeaderModel(markdown: string): RoomHeaderModel {
  const lines = markdown.split("\n");
  const roomHeaderLines = new Set<number>();
  const groups = new Map<string, RoomCandidate[]>();
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]!.trim().startsWith("|")) continue;
    if (!isRoomHeader(lines, i)) continue;
    const col0Raw = col0Of(lines[i]!);
    const firstLine = col0Raw.replace(/&#10;/g, "\n").split("\n")[0]!.trim();
    const key = roomGroupKey(col0Raw, firstLine);
    roomHeaderLines.add(i); // terminator set: any admitted DAY-range header (BO OR GS)
    // Breakout GROUP membership is BO-ONLY (whole-diff R7): a GS-evidenced header is a
    // general-session room (its own path), never a Pass-2 breakout — else a phantom.
    if (!hasBoFieldBlock(lines, i)) continue;
    const list = groups.get(key);
    const candidate: RoomCandidate = { key, displayName: firstLine, lineIndex: i };
    if (list) list.push(candidate);
    else groups.set(key, [candidate]);
  }
  return { lines, roomHeaderLines, groups };
}

// Mergeable room data fields (everything except kind/name) — used to absorb a same-name
// breakout into its GS room without dropping any populated value.
const RECONCILE_FIELDS = [
  "dimensions",
  "floor",
  "setup",
  "set_time",
  "show_time",
  "strike_time",
  "audio",
  "video",
  "lighting",
  "scenic",
  "power",
  "digital_signage",
  "other",
  "notes",
] as const;

// idx20 (BL-ROOMS-BREAKOUT-REUSE-DROP): when a breakout room is reused across days — two
// "BREAKOUT N <venue>" blocks with the SAME venue name but different sessions — MERGE them
// into ONE room instead of dropping the second (owner decision 2026-07-03: one card,
// per-day values preserved). Physical specs are the same physical room (kept once); TIME
// fields carry their own dates (concatenated); other CONTENT fields are day-labeled (from
// the session's show/set date) only when they differ across sessions.
const BO_PHYSICAL_FIELDS = ["dimensions", "floor"] as const satisfies readonly (keyof RoomRow)[];
const BO_TIME_FIELDS = [
  "set_time",
  "show_time",
  "strike_time",
] as const satisfies readonly (keyof RoomRow)[];
const BO_CONTENT_FIELDS = [
  "setup",
  "audio",
  "video",
  "lighting",
  "scenic",
  "power",
  "digital_signage",
  "other",
  "notes",
] as const satisfies readonly (keyof RoomRow)[];

/** Leading M/D date of a session (from show_time, else set_time) — used for per-day labels. */
function sessionDayLabel(room: RoomRow): string | null {
  const t = room.show_time ?? room.set_time ?? "";
  const m = /^\s*(\d{1,2}\/\d{1,2})/.exec(t);
  return m ? m[1]! : null;
}

/** Distinct non-null values of `field` across sessions (first occurrence), each with the day
 * label of the session that carried it. */
function distinctSessionValues(
  sessions: RoomRowInternal[],
  field: keyof RoomRow,
): Array<{ day: string | null; value: string }> {
  const seen = new Set<string>();
  const out: Array<{ day: string | null; value: string }> = [];
  for (const s of sessions) {
    const v = s[field];
    if (typeof v !== "string" || v.length === 0 || seen.has(v)) continue;
    seen.add(v);
    out.push({ day: sessionDayLabel(s), value: v });
  }
  return out;
}

/** Merge same-venue breakout SESSIONS into one room (idx20), preserving every value. */
function mergeBreakoutSessions(sessions: RoomRowInternal[]): RoomRowInternal {
  const base = sessions[0]!;
  if (sessions.length === 1) return base;
  // Physical specs (same physical room): first non-null wins (values should agree).
  for (const s of sessions.slice(1)) {
    for (const f of BO_PHYSICAL_FIELDS) if (base[f] == null && s[f] != null) base[f] = s[f];
  }
  // Time fields already contain their dates → concatenate the distinct values in order.
  for (const f of BO_TIME_FIELDS) {
    const d = distinctSessionValues(sessions, f);
    base[f] = d.length ? d.map((x) => x.value).join(" / ") : null;
  }
  // Content fields: a single shared value stays plain; differing values are day-labeled.
  for (const f of BO_CONTENT_FIELDS) {
    const d = distinctSessionValues(sessions, f);
    base[f] =
      d.length === 0
        ? null
        : d.length === 1
          ? d[0]!.value
          : d.map((x) => (x.day ? `${x.day}: ${x.value}` : x.value)).join(" / ");
  }
  return base;
}

export function parseRooms(
  markdown: string,
  _version: "v1" | "v2" | "v4",

  agg?: ParseAggregator,
): RoomRow[] {
  // Parse BOTH the v4 structured layout and the v2/v1 layout, then merge — a
  // version-skewed sheet can carry a real v4 General Session alongside v2
  // BO-prefixed breakouts, and neither must shadow the other. Dedupe by kind+name
  // (v4 takes precedence on collision; for a clean v4 sheet the v2 parsers re-match
  // the same headers, which dedupe collapses). Both parsers gate placeholder/empty
  // template stubs, so the merge never introduces phantom rooms.
  const rooms = mergeRooms(parseV4Rooms(markdown, agg), collectV2V1Rooms(markdown));

  // Free-text "Additional Room Name(s) / Setup" FIELDS (distinct from the all-caps
  // ADDITIONAL ROOM block) carry real crew instructions — meal/social rooms, setup
  // notes — on both v2 (redefining/consultants) and v4 (rpas) shows. Emit a room
  // from them when populated, unless an ADDITIONAL room was already captured. Empty
  // template fields (ria/fintech/fixed-income) stay suppressed.
  if (!rooms.some((r) => r.kind === "additional")) {
    const fieldsRoom = parseAdditionalRoomFields(markdown);
    if (fieldsRoom) rooms.push(fieldsRoom);
  }

  // East-coast-class reconciliation: a breakout that names the SAME physical room as a
  // GS room (east-coast's MABEL 1 is both the general session AND a reused day-1&2
  // breakout) is not a separate room. MERGE its non-null fields into the GS room — GS is
  // primary, so it only fills GS's STILL-EMPTY fields; no breakout data is dropped — then
  // remove the now-absorbed duplicate. No-op for every other show (distinct names).
  const gsByName = new Map<string, RoomRowInternal>();
  for (const r of rooms) {
    if (r.kind === "gs") gsByName.set((r.name ?? "").trim().toUpperCase(), r as RoomRowInternal);
  }
  const reconciled =
    gsByName.size === 0
      ? rooms
      : rooms.filter((r) => {
          if (r.kind !== "breakout") return true;
          const gs = gsByName.get((r.name ?? "").trim().toUpperCase());
          if (!gs) return true;
          // Absorb the breakout ONLY when it is a lossless SUBSET of the GS room — every
          // populated breakout field is either absent in the GS room (copy it in) or an
          // exact duplicate. If ANY field conflicts (both populated, different values),
          // the breakout is a genuinely distinct use of the room (east-coast's MABEL 1 is
          // the general session AND a day-1&2 breakout with its own AV) → keep it as a
          // separate room so no crew-visible value is ever dropped.
          const conflicts = RECONCILE_FIELDS.some(
            (f) => r[f] != null && gs[f] != null && gs[f] !== r[f],
          );
          if (conflicts) return true; // distinct room — keep both
          for (const f of RECONCILE_FIELDS) {
            if (gs[f] == null && r[f] != null) gs[f] = r[f];
          }
          return false; // pure subset — absorbed into the GS room
        });

  // D1: a recognized room-block header (GENERAL SESSION / BREAKOUT N / ADDITIONAL
  // ROOM) whose body was content-gated out, leaving zero rooms, is a silent
  // section-drop — fail loud. (No room header = absent section, no warning.)
  if (
    reconciled.length === 0 &&
    (/^\|?\s*GENERAL SESSION\b/m.test(markdown) ||
      /^\|?\s*BREAKOUT[\s&]/m.test(markdown) ||
      /^\|?\s*ADDITIONAL\s+ROOM\b/m.test(markdown))
  ) {
    emitEmptySection(agg, "rooms");
  }
  return reconciled;
}

// Merge two room lists, deduping by kind+name (case/whitespace-insensitive). The
// primary list (v4) wins on collision; secondary rooms with a new key are appended.
function mergeRooms(primary: RoomRow[], secondary: RoomRow[]): RoomRow[] {
  const keyOf = (r: RoomRow) => `${r.kind}::${(r.name ?? "").trim().toUpperCase()}`;
  const seen = new Set(primary.map(keyOf));
  const out = [...primary];
  for (const r of secondary) {
    const k = keyOf(r);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(r);
    }
  }
  return out;
}

function collectV2V1Rooms(markdown: string): RoomRow[] {
  // v2/v1: GS-prefix rows + BO-prefix block headers + the all-caps ADDITIONAL ROOM block.
  // Compute the room-header model ONCE (spec Pass 0), before any block parse, so GS and BO
  // extraction share ONE terminator set regardless of call order.
  const model = computeRoomHeaderModel(markdown);
  const rooms: RoomRow[] = [];
  const gsRoom = parseGsRoom(markdown, model);
  if (gsRoom) rooms.push(gsRoom);
  rooms.push(...parseBoRooms(markdown, model));
  const additionalRoom = parseAdditionalRoom(markdown, model);
  if (additionalRoom) rooms.push(additionalRoom);
  return rooms;
}

/** Line index (0-based) of the byte offset `offset` in `markdown` (offset is at a line start). */
function lineIndexOfOffset(markdown: string, offset: number): number {
  return markdown.slice(0, offset).split("\n").length - 1;
}

function parseAdditionalRoomFields(markdown: string): RoomRow | null {
  const nameVal = presence(
    clean(matchFieldValue(markdown, /^Additional\s+Room\s+Name\(s\)$/i) ?? ""),
  );
  const setupVal = presence(clean(matchFieldValue(markdown, /^Additional\s+Room\s+Setup$/i) ?? ""));
  if (!nameVal && !setupVal) return null;
  // These "Additional Room Name(s) / Setup" values come from the CLIENT INTAKE FORM tab
  // (free-text Google-Form answers), not Doug's INFO room blocks — so the "name" answer is
  // usually meal/social PROSE ("Lunch in Adorn both days. Reception Social Lounge…"). Do NOT
  // use it as the room NAME (that renders as a paragraph-as-name card). Surface one generic
  // "Additional rooms" card and move the prose into `notes` — which the crew Today section
  // renders as a "Room: Additional rooms" callout (components/crew/sections/TodaySection.tsx),
  // so the real "which rooms / no AV needed" signal stays visible behind a clean label.
  const room = buildEmptyRoom("additional", "Additional rooms");
  room.notes = nameVal;
  room.setup = setupVal;
  return room;
}

function matchFieldValue(markdown: string, labelRe: RegExp): string | null {
  for (const line of markdown.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("|")) continue;
    const cells = splitRow(t);
    if (labelRe.test(clean(cells[0] ?? ""))) return cells[1] ?? null;
  }
  return null;
}

// ── v4 structured block parser ────────────────────────────────────────────────

type RoomRowInternal = RoomRow & { _nextLine?: number };

// Bare v4 field labels (the rows under a v4 GENERAL SESSION / BREAKOUT header).
// v2 blocks use "GS Setup" / "BO Setup" prefixes instead, so the presence of a
// bare label discriminates a real v4 block from a v2 one (regardless of the
// detected version, which is unreliable — raw fixed-income is "v2" but v4-shaped).
const V4_BARE_LABELS = new Set([
  "setup",
  "set time",
  "show time",
  "strike time",
  "audio",
  "video",
  "lighting",
  "scenic",
  "power",
  "digital signage",
  "other",
  "notes",
]);

type RoomFieldKey =
  | "setup"
  | "set_time"
  | "show_time"
  | "strike_time"
  | "audio"
  | "video"
  | "lighting"
  | "scenic"
  | "power"
  | "digital_signage"
  | "other"
  | "notes";

// EXACT label → field. 12 bare labels + 3 aliases the if/else chain handled
// ("backdrop / scenic"→scenic, "gs other"/"bo other"→other). Lowercase keys (col0 is
// lowercased), underscore field names. These aliases stay EXACT-only — they are NOT in
// the fuzzy vocab below.
const V4_LABEL_TO_FIELD: Record<string, RoomFieldKey> = {
  setup: "setup",
  "set time": "set_time",
  "show time": "show_time",
  "strike time": "strike_time",
  audio: "audio",
  video: "video",
  lighting: "lighting",
  scenic: "scenic",
  "backdrop / scenic": "scenic",
  power: "power",
  "digital signage": "digital_signage",
  other: "other",
  "gs other": "other",
  "bo other": "other",
  notes: "notes",
};

// Uppercase fuzzable vocab the v4 fuzzy fallback corrects toward — DERIVED from V4_BARE_LABELS
// (single source; lib/parser/typoVocabRegistry.ts imports this exact const so it can't drift).
// All 12 members are >=5 chars, so minLen:5 never trips.
export const V4_BARE_LABEL_VOCAB: readonly string[] = [...V4_BARE_LABELS].map((s) =>
  s.toUpperCase(),
);
// Do-not-fuzz tokens (belt-and-suspenders — all <5 chars so minLen:5 already drops them;
// passed for parity with the milestone's gate-exclusion convention).
const ROOM_GATE_EXCLUDE = ["LED", "LEAD", "DATE", "DAY", "ROOM", "TBD", "TBA", "N/A"] as const;
const ROOM_GATE_OPTS = { minLen: 5, tieAbort: true, exclude: ROOM_GATE_EXCLUDE } as const;

function hasBareV4DataRow(lines: string[], startLine: number): boolean {
  for (let j = startLine; j < lines.length; j++) {
    const t = (lines[j] ?? "").trim();
    if (!t.startsWith("|")) continue;
    const cells = splitRow(t);
    if (cells.every((c) => /^[\s:|*-]*$/.test(c))) continue; // separator row
    return V4_BARE_LABELS.has(clean(cells[0] ?? "").toLowerCase());
  }
  return false;
}

function parseV4Rooms(markdown: string, agg?: ParseAggregator): RoomRow[] {
  const rooms: RoomRowInternal[] = [];
  const lines = markdown.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = (lines[i] ?? "").trim();
    i++;

    if (!line.startsWith("|")) continue;

    const cells = splitRow(line);
    const col0 = clean(cells[0] ?? "");
    const col1 = clean(cells[1] ?? "");

    // v4 GS header: col0 starts with "GENERAL SESSION" in ALL-CAPS; col1 is
    // either empty (raw) OR column-duplicated by the exporter (col1 === col0);
    // it does NOT contain &#10; (which marks v2 multi-line cells); AND its first
    // data row is a BARE v4 label (Setup/Set Time/…), not a v2 "GS Setup"-
    // prefixed row. The lookahead keeps v2 shows on the v2 path without keying
    // on the (unreliable) detected version.
    if (
      /^GENERAL SESSION\b/.test(col0) &&
      (!col1 || col1 === col0) &&
      !col0.includes("&#10;") &&
      hasBareV4DataRow(lines, i)
    ) {
      const result = parseV4RoomBlock(lines, i, col0, "gs", agg);
      rooms.push(result.room);
      i = result.nextLine;
      continue;
    }

    // v4 Breakout header: "BREAKOUT N ..." in ALL-CAPS, same col1/&#10;/lookahead
    // rules. Content-gated like ADDITIONAL ROOM: the exporter emits unfilled
    // breakout template stubs ("BREAKOUT N BREAKOUT ROOM Dimensions Floor" with
    // blank Setup/Set/Show/Strike and no real dimensions) which must not surface
    // as phantom crew-visible rooms. A real breakout carries dimensions and/or
    // populated fields.
    if (
      /^BREAKOUT \d/.test(col0) &&
      (!col1 || col1 === col0) &&
      !col0.includes("&#10;") &&
      hasBareV4DataRow(lines, i)
    ) {
      const result = parseV4RoomBlock(lines, i, col0, "breakout", agg);
      i = result.nextLine;
      if (roomHasContent(result.room) || !isPlaceholderRoomName(result.room.name))
        rooms.push(result.room);
      continue;
    }

    // v4 Additional-room header: ALL-CAPS "ADDITIONAL ROOM ...", same rules. The
    // v4 path short-circuits the v2 parseAdditionalRoom fallback, so a real v4
    // additional room must be parsed here. Content-gate it: an unfilled template
    // stub (e.g. fintech's "ADDITIONAL ROOM Dimensions Floor" with empty Setup
    // rows) has no fields, so it is dropped rather than added as an all-null room.
    if (
      /^ADDITIONAL\s+ROOM\b/.test(col0) &&
      (!col1 || col1 === col0) &&
      !col0.includes("&#10;") &&
      hasBareV4DataRow(lines, i)
    ) {
      const result = parseV4RoomBlock(lines, i, col0, "additional", agg);
      i = result.nextLine;
      if (roomHasContent(result.room) || !isPlaceholderRoomName(result.room.name))
        rooms.push(result.room);
      continue;
    }
  }

  return rooms.map(({ _nextLine: _n, ...rest }) => rest as RoomRow);
}

// A v4 room header is a placeholder template ("BREAKOUT 1 BREAKOUT ROOM
// Dimensions Floor", "ADDITIONAL ROOM Dimensions Floor") when, after stripping the
// kind prefix and the template words, nothing real remains. A filled name like
// "BREAKOUT 1 SALON D" leaves "SALON D" and is therefore a real room even with no
// other populated fields.
function isPlaceholderRoomName(name: string): boolean {
  const rest = name
    .replace(/^(?:BREAKOUT\s+\d+|ADDITIONAL\s+ROOM|GENERAL\s+SESSION)\s*/i, "")
    .replace(/BREAKOUT\s+ROOM|ADDITIONAL\s+ROOM|Dimensions|Floor|Name\(s\)/gi, "")
    .replace(/\s+/g, "")
    .trim();
  return rest.length === 0;
}

function roomHasContent(room: RoomRow): boolean {
  return [
    room.dimensions,
    room.floor,
    room.setup,
    room.set_time,
    room.show_time,
    room.strike_time,
    room.audio,
    room.video,
    room.lighting,
    room.scenic,
    room.power,
    room.digital_signage,
    room.other,
    room.notes,
  ].some((v) => v != null);
}

function parseV4RoomBlock(
  lines: string[],
  startLine: number,
  headerText: string,
  kind: RoomKind,
  agg?: ParseAggregator,
): { room: RoomRowInternal; nextLine: number } {
  const { name, dimensions, floor } = splitRoomHeader(headerText, kind);
  const room = buildEmptyRoom(kind, name);
  room.dimensions = dimensions;
  room.floor = floor;

  let j = startLine;

  // PR-D3 deferred-commit state (block-LOCAL — fresh per block, no cross-block leakage):
  // fields an EXACT label gave a REAL (non-null, non-sentinel) value, and fuzzy candidates.
  const exactReal = new Set<RoomFieldKey>();
  const fuzzyCandidates = new Map<RoomFieldKey, { rawLabel: string; value: string }>();

  while (j < lines.length) {
    const line = (lines[j] ?? "").trim();
    j++;

    if (!line.startsWith("|")) break;

    const cells = splitRow(line);
    const col0 = clean(cells[0] ?? "");
    const col1 = clean(cells[1] ?? "");

    // Separator row
    if (cells.every((c) => /^[\s:|*-]*$/.test(c))) continue;

    // Stop at another room header (all-caps only, same rule as detection above)
    if (
      /^GENERAL SESSION\b/.test(col0) ||
      /^BREAKOUT \d/.test(col0) ||
      /^ADDITIONAL\s+ROOM\b/.test(col0)
    ) {
      j--; // back up so the outer loop sees this
      break;
    }

    const label = col0.toLowerCase();
    const exactField = V4_LABEL_TO_FIELD[label];
    if (exactField !== undefined) {
      const v = presence(col1);
      room[exactField] = v;
      // A real value claims the field (sentinel/empty does NOT — mirrors PR-D1).
      if (v !== null && !shouldHideGenericOptional(v)) exactReal.add(exactField);
    } else {
      // Not an exact label: try a gated fuzzy recovery on the LABEL only (never the value).
      const fix = gatedVocabCorrect(col0.toUpperCase(), V4_BARE_LABEL_VOCAB, ROOM_GATE_OPTS);
      const v = presence(col1);
      if (fix?.corrected && v !== null) {
        const field = V4_LABEL_TO_FIELD[fix.match.toLowerCase()];
        if (field) {
          // Last-write-wins with sentinel-aware precedence (a sentinel never displaces a real
          // candidate held), matching the exact-write rule.
          const prev = fuzzyCandidates.get(field);
          const prevIsReal = prev !== undefined && !shouldHideGenericOptional(prev.value);
          if (!(shouldHideGenericOptional(v) && prevIsReal)) {
            fuzzyCandidates.set(field, { rawLabel: col0, value: v });
          }
        }
      }
    }
  }

  // Phantom-room guard: for gated kinds (breakout/additional), fuzzy-only content must NOT
  // resurrect a placeholder stub. roomHasContent here is evaluated on EXACT content only
  // (fuzzy not yet applied). A dropped room emits no warning. gs is ungated.
  const gatedKind = kind === "breakout" || kind === "additional";
  const droppedAsPlaceholder =
    gatedKind && !roomHasContent(room) && isPlaceholderRoomName(room.name);
  if (!droppedAsPlaceholder) {
    for (const [field, cand] of fuzzyCandidates) {
      if (exactReal.has(field)) continue;
      room[field] = cand.value;
      agg?.warnings.push({
        severity: "warn",
        code: "FIELD_LABEL_AUTOCORRECTED",
        message: `Read likely-misspelled room label '${cand.rawLabel}' as field '${field}'`,
        blockRef: { kind: "rooms", name: room.name },
        rawSnippet: cand.rawLabel,
      });
    }
  }

  return { room, nextLine: j };
}

// ── v2/v1 GS-prefix room parser ───────────────────────────────────────────────

// The GS block on some v1 sheets is headed by a venue-name cell rather than a
// "GENERAL SESSION" label (east-coast: "MABEL 1\nAPPROXIMATELY 60' x 45'"). Find that
// header = the nearest column-duplicated block-header row directly above the first GS
// room-field row (GS Setup / GS Set Time / …). Returns null when the row above is an
// ordinary "| label | value |" DETAILS field (redefining/ria/consultants: "Fonts |
// Aptos Font Folder") — so those correctly stay "General Session" — and null for
// section banners (DETAILS / DOCUMENTS / …) that are also column-duplicated.
function findGsBlockVenueHeader(markdown: string): string | null {
  const lines = markdown.split("\n");
  let firstGsRow = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\|\s*GS\s+(?:Setup|Set Time|Show Time|Strike Time)\b/i.test((lines[i] ?? "").trim())) {
      firstGsRow = i;
      break;
    }
  }
  if (firstGsRow === -1) return null;
  for (let j = firstGsRow - 1; j >= 0; j--) {
    const t = (lines[j] ?? "").trim();
    if (t === "") continue;
    if (!t.startsWith("|")) return null; // left the table without finding a header
    if (/^\|\s*:?-+:?\s*\|/.test(t)) continue; // separator row
    const cells = splitRow(t);
    const c0 = clean(cells[0] ?? "");
    const c1 = clean(cells[1] ?? "");
    // Block-header shape: a single cell OR column-duplicated (c1 empty or === c0). An
    // ordinary DETAILS pair ("Fonts | Aptos Font Folder") has a distinct c1 → not one.
    if (c0.length === 0 || (c1 !== "" && c1 !== c0)) return null;
    // Section banners are also column-duplicated — exclude them.
    if (
      /^(?:DETAILS|DOCUMENTS|DATES|CREW|DRESS|TRANSPORTATION|HOTEL|VENUE|AGENDA|CONTACTS|GENERAL SESSION|BREAKOUT|ADDITIONAL|LUNCH)\b/i.test(
        c0,
      )
    ) {
      return null;
    }
    // Require STRONG evidence this is a real multi-line room-header cell, not a metadata
    // label whose value column was trimmed to empty (e.g. "| Fonts |" / "| Test Pattern |"
    // sitting directly above GS Setup): an in-cell newline OR a dimension token. Without
    // it, fall back to "General Session" rather than mis-naming the GS room.
    const raw = cells[0] ?? "";
    if (!/&#10;/.test(raw) && !/\d+\s*'\s*x/i.test(raw)) return null;
    return raw; // raw (keeps &#10; for splitRoomHeader to flatten)
  }
  return null;
}

function parseGsRoom(markdown: string, model: RoomHeaderModel): RoomRow | null {
  if (!/GS\s+Setup/i.test(markdown) && !/GS\s+Set\s+Time/i.test(markdown)) return null;

  const room = buildEmptyRoom("gs", "");

  // (venue-headed GS fallback uses findGsBlockVenueHeader, defined above.)
  // Extract GS room name from "GENERAL SESSION <name>" header cell.
  // Must be an all-caps block header (not a metadata row like "General Session Room Name").
  // Exclude cells with &#10; (those are v2 multi-line room cells handled by parseBoRooms).
  const gsHeaderRe = /^\|\s*GENERAL\s+SESSION\s+([^|]+?)\s*\|/m;
  const gsHeaderMatch = gsHeaderRe.exec(markdown);
  if (gsHeaderMatch && !gsHeaderMatch[0].includes("&#10;")) {
    const split = splitRoomHeader(gsHeaderMatch[1]!, "gs");
    room.name = split.name;
    room.dimensions = split.dimensions;
    room.floor = split.floor;
  } else {
    // Some v1 sheets (east-coast) head the General Session block with a venue cell
    // ("MABEL 1\nAPPROXIMATELY 60' x 45'") instead of a "GENERAL SESSION" label —
    // adopt that name + dims + floor. Falls back to "General Session" when the row
    // above the GS block is an ordinary "| label | value |" DETAILS field (redefining/
    // ria/consultants stale fixtures) or a section banner.
    const venueHeader = findGsBlockVenueHeader(markdown);
    const split = venueHeader ? splitRoomHeader(venueHeader, "gs") : null;
    if (split && split.name) {
      room.name = split.name;
      room.dimensions = split.dimensions;
      room.floor = split.floor;
    } else {
      room.name = "General Session";
    }
  }

  // Extract field values from GS-prefixed rows
  const gsFieldRe = /^\|\s*GS\s+([\w\s/]+?)\s*\|([^|]*)/gim;
  let m: RegExpExecArray | null;
  while ((m = gsFieldRe.exec(markdown)) !== null) {
    const label = m[1]!.trim().toLowerCase();
    const val = presence(clean(m[2]!));
    applyGsLabel(room, label, val);
  }

  // Unlabeled GS continuation rows (empty col0, value in col1) — e.g. east-coast
  // `| | (2) Lekos for Stage Wash (6) Blizzard LED Uplights |` directly under GS Scenic.
  // Classify the value: a recognized discipline (lighting here) gets its OWN column
  // instead of bleeding into the preceding labeled field; an unrecognized value falls
  // back to appending onto that preceding field (gear-parser-fidelity Task 6). Scoped to
  // the GS block so DETAILS/AV continuation rows elsewhere are never pulled onto the room.
  let prevGsCol: GsTextCol | null = null;
  for (const blockLine of extractGsBlock(model).split("\n")) {
    const t = blockLine.trim();
    if (!t.startsWith("|")) continue;
    if (/^\|\s*:?-+:?\s*\|/.test(t)) continue; // separator
    const cells = splitRow(t);
    const col0 = clean(cells[0] ?? "");
    const gsMatch = /^GS\s+(.+)$/i.exec(col0);
    if (gsMatch) {
      prevGsCol = gsLabelToColumn(gsMatch[1]!.trim().toLowerCase());
      continue;
    }
    if (col0.length === 0) {
      const val = presence(clean(cells[1] ?? ""));
      if (!val) continue;
      const disc = classifyGearItem(val, null);
      if (disc !== "other") appendGsValue(room, disc, val);
      else if (prevGsCol) appendGsValue(room, prevGsCol, val);
    } else {
      prevGsCol = null; // a non-GS-labeled row (Digital Signage / next block) ends the run
    }
  }

  // Digital Signage is a BARE row (no "GS " prefix), so scope it to the GS block.
  // A global match grabs the first "Digital Signage" anywhere in the sheet — e.g.
  // a ~300-char sentence in a DETAILS/AV section — and copies it onto the GS room
  // (consultants). The GS room's own value is the bare row immediately after the
  // GS-prefixed block (redefining "N/A", ria/east-coast "NONE"); consultants has a
  // BREAKOUT header there instead, so its GS digital_signage is correctly null.
  const dsRe = /^\|\s*Digital\s+Signage\s*\|([^|]*)/im;
  const dsMatch = dsRe.exec(extractGsBlock(model));
  if (dsMatch) room.digital_signage = presence(clean(dsMatch[1]!));

  return room.name ? room : null;
}

// The GS block = the contiguous "GS <label>"-prefixed rows plus any trailing BARE
// field rows (Digital Signage, …) that follow across blank/separator rows, up to
// the next room/section header. Used to scope bare-field extraction to the GS room.
function extractGsBlock(model: RoomHeaderModel): string {
  const lines = model.lines;
  let first = -1;
  let last = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\|\s*GS\s+[A-Za-z]/.test(lines[i]!.trim())) {
      if (first === -1) first = i;
      last = i;
    }
  }
  if (first === -1) return "";
  let end = last;
  for (let j = last + 1; j < lines.length; j++) {
    const t = lines[j]!.trim();
    if (t === "") continue; // blank — keep scanning for the trailing DS row
    if (!t.startsWith("|")) break; // left the table
    if (/^\|\s*:?-+:?\s*\|/.test(t)) continue; // separator row
    // Next room / section: a structural keyword OR any admitted DAY-range room header
    // (the de-literalized replacement for the old literal MABEL/LAUDERDALE terminator).
    if (
      /^\|\s*(GENERAL SESSION|BREAKOUT|ADDITIONAL|LUNCH|DETAILS)\b/i.test(t) ||
      model.roomHeaderLines.has(j)
    ) {
      break;
    }
    end = j;
  }
  return lines.slice(first, end + 1).join("\n");
}

function applyGsLabel(room: RoomRow, label: string, val: string | null): void {
  if (label === "setup") room.setup = val;
  else if (label === "set time") room.set_time = val;
  else if (label === "show time") room.show_time = val;
  else if (label === "strike time") room.strike_time = val;
  else if (label === "audio") room.audio = val;
  else if (label === "video") room.video = val;
  else if (label === "scenic") room.scenic = val;
  else if (label === "led") room.lighting = val;
  else if (label === "lighting") room.lighting = val;
  else if (label === "power") room.power = val;
  else if (label === "other") room.other = val;
}

// The free-text RoomRow columns a GS continuation row may target (all `string | null`).
type GsTextCol =
  | "setup"
  | "set_time"
  | "show_time"
  | "strike_time"
  | "audio"
  | "video"
  | "lighting"
  | "scenic"
  | "power"
  | "other";

function gsLabelToColumn(label: string): GsTextCol | null {
  if (label === "setup") return "setup";
  if (label === "set time") return "set_time";
  if (label === "show time") return "show_time";
  if (label === "strike time") return "strike_time";
  if (label === "audio") return "audio";
  if (label === "video") return "video";
  if (label === "scenic") return "scenic";
  if (label === "led" || label === "lighting") return "lighting";
  if (label === "power") return "power";
  if (label === "other") return "other";
  return null;
}

function appendGsValue(room: RoomRow, col: GsTextCol, val: string): void {
  const existing = room[col];
  room[col] = existing && existing.length > 0 ? `${existing} ${val}` : val;
}

// ── Breakout room parser ──────────────────────────────────────────────────────

function parseBoRooms(markdown: string, model: RoomHeaderModel): RoomRow[] {
  const rooms: RoomRow[] = [];
  const seen = new Set<string>();

  // v2 format: numbered "| BREAKOUT N&#10;… |" AND numberless "| BREAKOUT&#10;LASALLE A |"
  // / "| BREAKOUT WALTON ROOM Dimensions Floor |" (redefining exporter) — the name
  // rides on the next line or after the word, with no number.
  // Case-SENSITIVE (uppercase BREAKOUT) so it matches real headers but not
  // mixed-case template field labels like "Breakout Room Setup Date / Time".
  const boBlockRe = /^\|\s*(BREAKOUT(?:&#10;|\s)[^|]*?)\s*\|/gm;
  let m: RegExpExecArray | null;

  // Group breakout blocks by venue key so a room reused across days is MERGED into one
  // (idx20), not dropped. Identical repeats (double-parse) collapse to single field values.
  const boGroups = new Map<string, RoomRowInternal[]>();
  const boOrder: string[] = [];
  while ((m = boBlockRe.exec(markdown)) !== null) {
    const rawHeader = m[1]!.replace(/&#10;/g, "\n").replace(/\r/g, "");
    const firstLine = rawHeader.split("\n")[0]!.trim();
    // Numbered "BREAKOUT N…" keeps its full header as the name (existing behavior);
    // numberless "BREAKOUT" derives the name from the remaining header text.
    const numbered = /^BREAKOUT\s+\d/i.test(firstLine);
    // Split the (possibly multi-line) header into venue name + dims + floor. A
    // numbered header that reduces to nothing keeps its raw first line so the
    // placeholder gate below can still recognize+drop the stub.
    const split = splitRoomHeader(rawHeader, "breakout");
    const name = split.name || (numbered ? firstLine : "Breakout");
    const headerKey = name.toUpperCase();

    const room = buildEmptyRoom("breakout", name);
    room.dimensions = split.dimensions;
    room.floor = split.floor;

    const blockText = extractBoBlock(model.lines, lineIndexOfOffset(markdown, m.index), model);
    applyBoFields(room, blockText);

    // Gating (mirrors the v4 path so v2/v1 never re-emits template stubs as
    // phantoms — incl. when reached as the all-stub-v4 fallback):
    //  - numberless: require real BO fields, which rejects pull-sheet "BREAKOUT
    //    SESSION N - X" equipment sections (real-looking name, no room fields);
    //  - numbered: drop only placeholder template names with no content
    //    ("BREAKOUT N BREAKOUT ROOM Dimensions Floor"); a real name like
    //    "BREAKOUT 1 SALON D" is kept even with empty fields.
    if (!numbered && !roomHasContent(room)) continue;
    if (numbered && !roomHasContent(room) && isPlaceholderRoomName(name)) continue;

    if (!boGroups.has(headerKey)) {
      boGroups.set(headerKey, []);
      boOrder.push(headerKey);
    }
    boGroups.get(headerKey)!.push(room);
  }
  for (const key of boOrder) {
    rooms.push(mergeBreakoutSessions(boGroups.get(key)!));
    seen.add(key); // claim the venue so the LUNCH / MABEL loops below skip it
  }

  // LUNCH ROOM blocks (consultants roundtable)
  const lunchRe = /^\|\s*(LUNCH\s+ROOM[^|]*?)\s*\|/gim;
  while ((m = lunchRe.exec(markdown)) !== null) {
    const rawHeader = m[1]!.replace(/&#10;/g, "\n");
    const split = splitRoomHeader(rawHeader, "breakout");
    const name = split.name || rawHeader.split("\n")[0]!.trim();
    const headerKey = name.toUpperCase();
    if (seen.has(headerKey)) continue;
    seen.add(headerKey);

    const room = buildEmptyRoom("breakout", name);
    room.dimensions = split.dimensions;
    room.floor = split.floor;
    const blockText = extractBoBlock(model.lines, lineIndexOfOffset(markdown, m.index), model);
    applyBoFields(room, blockText);
    rooms.push(room);
  }

  // v1: DAY-range breakout rooms (de-literalized from the old MABEL/LAUDERDALE loop, spec
  // Pass 2). Every candidate admitted by the precomputed model — a proper NAME + trailing
  // DAY-range at a block boundary with a `BO …`/`GS …` field block beneath — is grouped by
  // roomGroupKey (base name + normalized day-range), so the inline-DAY and second-line-DAY
  // forms of the SAME name+day MERGE while DISTINCT day-ranges stay separate. One room can
  // span multiple blocks — "MABEL 1&#10;APPROXIMATELY 60' x 45'" (dims in header) and
  // "MABEL 1&#10;DAY 1 & 2" (the populated fields) — so blocks in a group are extracted
  // independently and merged, and a room that stays empty is dropped (roomHasContent).
  for (const candidates of model.groups.values()) {
    const displayName = candidates[0]!.displayName;
    const headerKey = displayName.toUpperCase();
    if (seen.has(headerKey)) continue; // claimed by a BREAKOUT / LUNCH room above
    const room = buildEmptyRoom("breakout", displayName);
    for (const candidate of candidates) {
      const rawHeader = col0Of(model.lines[candidate.lineIndex]!).replace(/&#10;/g, "\n");
      // dims may ride in the header ("APPROXIMATELY 60' x 45'")
      for (const hl of rawHeader.split("\n").slice(1)) {
        const dimMatch = /(\d+'\s*x\s*\d+'(?:\s*x\s*\d+')?)/.exec(hl);
        if (dimMatch && !room.dimensions) room.dimensions = dimMatch[1]!;
      }
      mergeBoFields(room, extractBoBlock(model.lines, candidate.lineIndex, model));
    }
    // Origin parity (mabelRe grouped by first-line name): a SAME-first-line non-DAY header
    // — e.g. east-coast's GS venue header "MABEL 1&#10;APPROXIMATELY 60' x 45'" (no DAY-range,
    // so not admitted as its own room) — still contributes its dims to the same-named DAY-range
    // breakout via the old name-keyed merge. Harvest those dims if none rode the DAY header.
    if (!room.dimensions) {
      const nameKeys = new Set(candidates.map((c) => c.displayName.toUpperCase()));
      room.dimensions = harvestSameNameHeaderDims(model, nameKeys);
    }
    if (roomHasContent(room)) rooms.push(room);
  }

  return rooms;
}

// First dims token (with optional trailing height) found on a non-first line of any header
// cell whose first line matches one of `nameKeys` (uppercased). Mirrors the old mabelRe
// name-keyed dims merge without admitting a dims-only header as a standalone room (spec §2 descope).
function harvestSameNameHeaderDims(
  model: RoomHeaderModel,
  nameKeys: ReadonlySet<string>,
): string | null {
  for (const line of model.lines) {
    if (!line.trim().startsWith("|")) continue;
    const parts = col0Of(line).replace(/&#10;/g, "\n").split("\n");
    if (!nameKeys.has(parts[0]!.trim().toUpperCase())) continue;
    for (const hl of parts.slice(1)) {
      const dimMatch = /(\d+'\s*x\s*\d+'(?:\s*x\s*\d+')?)/.exec(hl);
      if (dimMatch) return dimMatch[1]!;
    }
  }
  return null;
}

// Fill only the still-empty fields of `room` from `blockText`, so merging multiple
// blocks for one room never overwrites populated values with a later empty cell.
function mergeBoFields(room: RoomRowInternal, blockText: string): void {
  const tmp = buildEmptyRoom(room.kind, room.name);
  applyBoFields(tmp, blockText);
  const FIELDS = [
    "dimensions",
    "floor",
    "setup",
    "set_time",
    "show_time",
    "strike_time",
    "audio",
    "video",
    "lighting",
    "scenic",
    "power",
    "digital_signage",
    "other",
    "notes",
  ] as const;
  for (const f of FIELDS) {
    if (room[f] == null && tmp[f] != null) room[f] = tmp[f];
  }
}

// Header of the NEXT room/section — extraction must stop here so an adjacent block
// (no blank separator) doesn't bleed its fields into the current room. The literal
// MABEL/LAUDERDALE names are no longer here — they are covered by the precomputed
// `model.roomHeaderLines` terminator set (any admitted DAY-range room header).
const NEXT_ROOM_HEADER_RE =
  /^\|\s*(GENERAL\s+SESSION|BREAKOUT|ADDITIONAL\s+ROOM|LUNCH\s+ROOM|DETAILS)\b/i;

// LINE-BASED (spec §2.2 (e), R24 f1): walk `lines` from `startLine`. Behavior-identical
// to the old `extractBoBlock(markdown, m.index)` because `m.index` is the row's line
// start, so `markdown.slice(m.index) === lines.slice(startLine).join("\n")`.
function extractBoBlock(lines: string[], startLine: number, model: RoomHeaderModel): string {
  const blockLines: string[] = [];

  for (let k = 0; startLine + k < lines.length; k++) {
    const line = lines[startLine + k]!;
    if (!line.trim().startsWith("|") && blockLines.length > 0) break;
    // Stop at the next room/section header — but not the current block's own header on
    // line 0 (k === 0), which also matches. A structural keyword OR an admitted DAY-range
    // header (absolute index ∈ roomHeaderLines) terminates.
    if (k > 0 && NEXT_ROOM_HEADER_RE.test(line.trim())) break;
    if (k > 0 && model.roomHeaderLines.has(startLine + k)) break;
    blockLines.push(line);
  }

  return blockLines.join("\n");
}

function applyBoFields(room: RoomRow, blockText: string): void {
  // BO-prefixed fields
  const boFieldRe = /^\|\s*BO\s+([\w\s/]+?)\s*\|([^|]*)/gim;
  let m: RegExpExecArray | null;
  while ((m = boFieldRe.exec(blockText)) !== null) {
    const label = m[1]!.trim().toLowerCase();
    const val = presence(clean(m[2]!));
    applyBoLabel(room, label, val);
  }

  // Non-prefixed fields (v4 breakouts, ADDITIONAL ROOM, LUNCH ROOM)
  const plainFieldRe =
    /^\|\s*(Setup|Set Time|Show Time|Strike Time|Audio|Video|Lighting|Scenic|Power|Digital Signage|Other|Notes)\s*\|([^|]*)/gim;
  while ((m = plainFieldRe.exec(blockText)) !== null) {
    const label = m[1]!.trim().toLowerCase();
    const val = presence(clean(m[2]!));
    applyBoLabel(room, label, val);
  }
}

function applyBoLabel(room: RoomRow, label: string, val: string | null): void {
  if (label === "setup") room.setup = val;
  else if (label === "set time") room.set_time = val;
  else if (label === "show time") room.show_time = val;
  else if (label === "strike time") room.strike_time = val;
  else if (label === "audio") room.audio = val;
  else if (label === "video") room.video = val;
  else if (label === "scenic") room.scenic = val;
  else if (label === "led") room.lighting = val;
  else if (label === "lighting") room.lighting = val;
  else if (label === "power") room.power = val;
  else if (label === "other") room.other = val;
  else if (label === "digital signage") room.digital_signage = val;
  else if (label === "notes") room.notes = val;
}

// ── Additional room parser ────────────────────────────────────────────────────

function parseAdditionalRoom(markdown: string, model: RoomHeaderModel): RoomRow | null {
  // Case-SENSITIVE: a real additional-room block header is ALL-CAPS
  // "ADDITIONAL ROOM" (e.g. "ADDITIONAL ROOM\nDimensions\nFloor"). The mixed-case
  // INFO metadata fields ("Additional Room Name(s)", "Additional Room Setup", …)
  // are NOT block headers and must not become phantom all-null rooms. Discriminate
  // by header shape (case), not content-emptiness — the latter also drops the
  // legitimate empty raw block.
  const re = /^\|\s*(ADDITIONAL\s+ROOM[^|]*?)\s*\|/m;
  const m = re.exec(markdown);
  if (!m) return null;

  // Split the header the SAME way the v4 path does, so a v4 ADDITIONAL block and
  // this v2 fallback produce the same kind+name dedup key and mergeRooms collapses
  // them instead of emitting the room twice.
  const rawHeader = m[1]!.replace(/&#10;/g, "\n");
  const split = splitRoomHeader(rawHeader, "additional");
  const room = buildEmptyRoom("additional", split.name);
  room.dimensions = split.dimensions;
  room.floor = split.floor;

  const blockText = extractBoBlock(model.lines, lineIndexOfOffset(markdown, m.index), model);
  applyBoFields(room, blockText);

  // Gate like the v4 path: a bare "ADDITIONAL ROOM" / "ADDITIONAL ROOM Dimensions
  // Floor" placeholder header with no fields is a template stub, not a room (and
  // must not slip through as a phantom when this runs as the all-stub-v4 fallback).
  if (!roomHasContent(room) && isPlaceholderRoomName(room.name)) return null;

  return room;
}

// ── Shared helpers ────────────────────────────────────────────────────────────

// Split a flattened room-header string into { name, dimensions, floor }.
//
// The production exporter flattens the source's single multi-line header cell
// ("LABEL\nNAME\nDIMS\nFLOOR") into one space-joined line, so name + dimensions +
// floor arrive FUSED (e.g. "GENERAL SESSION ADLER BALLROOM 75' x 37' x 15th Floor",
// "BREAKOUT 1 DELAWARE 7th Floor"). Split by PATTERN, not position:
//   1. drop the kind label prefix (GENERAL SESSION / BREAKOUT N / ADDITIONAL ROOM /
//      LUNCH ROOM) and a stray leading separator dash ("- GRAND BALLROOM A/B");
//   2. lift the floor ("7th Floor", "15th Floor") out;
//   3. lift the dimensions out — everything from the first dimension token to the
//      end, KEEPING semantic prefixes (rpas "TOTAL:" / "A/B:") and an incomplete
//      trailing dimension ("75' x 37' x"), and DROPPING a leading hedge word
//      ("APPROXIMATELY");
//   4. strip leftover template placeholder words ("Dimensions"/"Floor"/"Name(s)")
//      left behind by an unfilled stub.
// `name` falls back to "General Session" for a GS header that reduces to nothing;
// other kinds keep an empty name so the caller's placeholder gate can drop the stub.
function splitRoomHeader(
  raw: string,
  kind: RoomKind,
): { name: string; dimensions: string | null; floor: string | null } {
  let s = clean(raw.replace(/&#10;/g, " ")).replace(/\s+/g, " ").trim();

  // 1. kind label prefix + stray leading separator
  s = s
    .replace(/^(?:GENERAL\s+SESSION|BREAKOUT(?:\s+\d+)?|ADDITIONAL\s+ROOM|LUNCH\s+ROOM)\b/i, "")
    .replace(/^[\s:–—-]+/, "")
    .trim();

  // 2. floor. Ordinal floors ("7th Floor" / "15th Floor") match ANYWHERE — the
  // "Nth" form is vanishingly rare inside a real room name, so the original
  // unanchored behavior is preserved. Named non-ordinal levels ("Ground Floor",
  // "Main Floor", "Lobby Floor", …) are only extracted when they are the TRAILING
  // field (`\s*$`): those qualifier words are common enough to appear INSIDE a
  // legitimate room name ("Main Floor Ballroom"), so requiring end-position avoids
  // mis-extracting a name fragment as the floor (Codex R1). Either way the closed
  // qualifier set excludes the bare "Floor" template PLACEHOLDER (unfilled
  // "Dimensions Floor" stub), which still falls through to the step-4 strip.
  // Without a non-ordinal branch a trailing "Ground Floor" leaked into the dims
  // string (dims present) or glued its qualifier onto the room name (no dims) — audit idx23.
  let floor: string | null = null;
  const floorMatch =
    /\b\d+\s*(?:st|nd|rd|th)\s+floor\b/i.exec(s) ??
    /\b(?:ground|main|lobby|lower|upper|mezzanine|concourse|penthouse|rooftop|basement|garden|terrace)\s+floor\b\s*$/i.exec(
      s,
    );
  if (floorMatch) {
    floor = floorMatch[0].replace(/\s+/g, " ").trim();
    s = (
      s.slice(0, floorMatch.index) +
      " " +
      s.slice(floorMatch.index + floorMatch[0].length)
    ).trim();
  }

  // 3. dimensions — first dimension token (with an optional semantic prefix) to end
  let dimensions: string | null = null;
  // Optional dims-label prefix. TOTAL / APPROXIMATELY are ONLY ever dims labels, so their
  // colon is optional; "A/B", however, is also a real room-NAME suffix ("GRAND BALLROOM
  // A/B" = the room spanning sections A and B), so it counts as a dims label ONLY with a
  // colon ("A/B:"). Making A/B colon-optional (PR #114) wrongly pulled an unlabeled
  // trailing "A/B" out of the name into the dims (audit idx25).
  const dimStart = s.search(/(?:\b(?:TOTAL|APPROXIMATELY)\s*:?\s*|\bA\/B\s*:\s*)?\d+\s*'\s*x/i);
  if (dimStart !== -1) {
    dimensions = presence(
      s
        .slice(dimStart)
        .replace(/^APPROXIMATELY\s+/i, "")
        .replace(/\s+/g, " ")
        // Drop a dangling trailing "x" left by an unfilled height cell — the venue
        // filled "75' x 37'" but left the 3rd dimension blank, so the flattened
        // header reads "75' x 37' x" and the stray "x" would reach the crew card
        // verbatim (confirmed on the LIVE fintech ADLER BALLROOM cell) — audit idx22.
        .replace(/\s*x\s*$/i, "")
        .trim(),
    );
    s = s.slice(0, dimStart).trim();
  }

  // 4. leftover template placeholder words. An unfilled "Dimensions"/"Floor"/"Name(s)"
  // stub always TRAILS the name ("BALLROOM C Dimensions Floor"), so strip only from the
  // END (iteratively — the stub can carry two words). A real name word, e.g. a room
  // literally named "MAIN FLOOR BALLROOM", is mid-string and preserved (Codex R1); the
  // old unconditional global strip corrupted it to "MAIN BALLROOM".
  let name = s.replace(/\s+/g, " ").trim();
  let prevName: string;
  do {
    prevName = name;
    name = name.replace(/\s*\b(?:Dimensions|Floor|Name\(s\))\s*$/i, "").trim();
  } while (name !== prevName);
  if (!name && kind === "gs") name = "General Session";

  return { name, dimensions, floor };
}

function buildEmptyRoom(kind: RoomKind, name: string): RoomRowInternal {
  return {
    kind,
    name: clean(name),
    dimensions: null,
    floor: null,
    setup: null,
    set_time: null,
    show_time: null,
    strike_time: null,
    audio: null,
    video: null,
    lighting: null,
    scenic: null,
    power: null,
    digital_signage: null,
    other: null,
    notes: null,
  };
}
