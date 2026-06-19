/**
 * ROOMS block parser (§2.7).
 *
 * Returns RoomRow[] from three layout variants in the corpus:
 *
 * 1. v4 structured blocks (2026+):
 *    Header cell: "GENERAL SESSION <name> <dimensions> <floor>" (first col, all caps)
 *    Followed by rows: Setup | Set Time | Show Time | Strike Time
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
import type { ParseAggregator } from "@/lib/parser/warnings";
import { clean, presence, splitRow } from "./_helpers";

export function parseRooms(
  markdown: string,
  _version: "v1" | "v2" | "v4",
   
  _agg?: ParseAggregator,
): RoomRow[] {
  // Try v4 structured block first. A v4 room block uses all-caps GENERAL SESSION /
  // BREAKOUT headers as standalone rows. If any are found, treat as v4 and skip v2/v1 parsers.
  // Use sawV4 (a v4 layout was detected) — NOT v4Rooms.length — to decide the
  // path: an all-stub v4 sheet gates every room out yet must still NOT fall back
  // to v2/v1 parsing, which would re-emit the same stubs as phantom rooms.
  const { rooms: v4Rooms, sawV4 } = parseV4Rooms(markdown);
  const rooms: RoomRow[] = sawV4 ? v4Rooms : collectV2V1Rooms(markdown);

  // Free-text "Additional Room Name(s) / Setup" FIELDS (distinct from the all-caps
  // ADDITIONAL ROOM block) carry real crew instructions — meal/social rooms, setup
  // notes — on both v2 (redefining/consultants) and v4 (rpas) shows. Emit a room
  // from them when populated, unless an ADDITIONAL room was already captured. Empty
  // template fields (ria/fintech/fixed-income) stay suppressed.
  if (!rooms.some((r) => r.kind === "additional")) {
    const fieldsRoom = parseAdditionalRoomFields(markdown);
    if (fieldsRoom) rooms.push(fieldsRoom);
  }

  return rooms;
}

function collectV2V1Rooms(markdown: string): RoomRow[] {
  // v2/v1: GS-prefix rows + BO-prefix block headers + the all-caps ADDITIONAL ROOM block
  const rooms: RoomRow[] = [];
  const gsRoom = parseGsRoom(markdown);
  if (gsRoom) rooms.push(gsRoom);
  rooms.push(...parseBoRooms(markdown));
  const additionalRoom = parseAdditionalRoom(markdown);
  if (additionalRoom) rooms.push(additionalRoom);
  return rooms;
}

function parseAdditionalRoomFields(markdown: string): RoomRow | null {
  const nameVal = presence(clean(matchFieldValue(markdown, /^Additional\s+Room\s+Name\(s\)$/i) ?? ""));
  const setupVal = presence(
    clean(matchFieldValue(markdown, /^Additional\s+Room\s+Setup$/i) ?? ""),
  );
  if (!nameVal && !setupVal) return null;
  const room = buildEmptyRoom("additional", nameVal ?? "Additional Room(s)");
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

function parseV4Rooms(markdown: string): { rooms: RoomRow[]; sawV4: boolean } {
  const rooms: RoomRowInternal[] = [];
  const lines = markdown.split("\n");
  let i = 0;
  // True once any v4-shaped room header is detected, even if every room is then
  // content-gated out — so an all-stub v4 sheet stays on the v4 path instead of
  // falling back to v2/v1 parsing (which would re-emit the same stubs as phantoms).
  let sawV4 = false;

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
      sawV4 = true;
      const result = parseV4RoomBlock(lines, i, col0, "gs");
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
      sawV4 = true;
      const result = parseV4RoomBlock(lines, i, col0, "breakout");
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
      sawV4 = true;
      const result = parseV4RoomBlock(lines, i, col0, "additional");
      i = result.nextLine;
      if (roomHasContent(result.room) || !isPlaceholderRoomName(result.room.name))
        rooms.push(result.room);
      continue;
    }
  }

  return { rooms: rooms.map(({ _nextLine: _n, ...rest }) => rest as RoomRow), sawV4 };
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
): { room: RoomRowInternal; nextLine: number } {
  const room = buildEmptyRoom(kind, headerText);

  // Extract dimensions from header text
  const dimMatch = /(\d+'\s*x\s*\d+'(?:\s*x\s*\d+')?)/.exec(headerText);
  if (dimMatch) room.dimensions = dimMatch[1]!;

  // Extract floor from header text
  const floorMatch = /(\d+)(?:st|nd|rd|th)\s+floor/i.exec(headerText);
  if (floorMatch) room.floor = floorMatch[0]!;

  let j = startLine;

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
    if (label === "setup") room.setup = presence(col1);
    else if (label === "set time") room.set_time = presence(col1);
    else if (label === "show time") room.show_time = presence(col1);
    else if (label === "strike time") room.strike_time = presence(col1);
    else if (label === "audio") room.audio = presence(col1);
    else if (label === "video") room.video = presence(col1);
    else if (label === "lighting") room.lighting = presence(col1);
    else if (label === "scenic" || label === "backdrop / scenic") room.scenic = presence(col1);
    else if (label === "power") room.power = presence(col1);
    else if (label === "digital signage") room.digital_signage = presence(col1);
    else if (label === "other" || label === "gs other" || label === "bo other")
      room.other = presence(col1);
    else if (label === "notes") room.notes = presence(col1);
  }

  return { room, nextLine: j };
}

// ── v2/v1 GS-prefix room parser ───────────────────────────────────────────────

function parseGsRoom(markdown: string): RoomRow | null {
  if (!/GS\s+Setup/i.test(markdown) && !/GS\s+Set\s+Time/i.test(markdown)) return null;

  const room = buildEmptyRoom("gs", "");

  // Extract GS room name from "GENERAL SESSION <name>" header cell.
  // Must be an all-caps block header (not a metadata row like "General Session Room Name").
  // Exclude cells with &#10; (those are v2 multi-line room cells handled by parseBoRooms).
  const gsHeaderRe = /^\|\s*GENERAL\s+SESSION\s+([^|]+?)\s*\|/m;
  const gsHeaderMatch = gsHeaderRe.exec(markdown);
  if (gsHeaderMatch && !gsHeaderMatch[0].includes("&#10;")) {
    room.name = clean(gsHeaderMatch[1]!);
  } else {
    room.name = "General Session";
  }

  // Extract dimensions from room name
  const dimMatch = /(\d+'\s*x\s*\d+'(?:\s*x\s*\d+')?)/.exec(room.name);
  if (dimMatch) room.dimensions = dimMatch[1]!;

  // Extract field values from GS-prefixed rows
  const gsFieldRe = /^\|\s*GS\s+([\w\s/]+?)\s*\|([^|]*)/gim;
  let m: RegExpExecArray | null;
  while ((m = gsFieldRe.exec(markdown)) !== null) {
    const label = m[1]!.trim().toLowerCase();
    const val = presence(clean(m[2]!));
    applyGsLabel(room, label, val);
  }

  // Digital Signage
  const dsRe = /^\|\s*Digital\s+Signage\s*\|([^|]*)/im;
  const dsMatch = dsRe.exec(markdown);
  if (dsMatch) room.digital_signage = presence(clean(dsMatch[1]!));

  return room.name ? room : null;
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

// ── Breakout room parser ──────────────────────────────────────────────────────

// Derive a numberless breakout's name: drop the leading "BREAKOUT" word and the
// "Dimensions Floor" template suffix, flattening any in-cell newline. Falls back
// to "Breakout" if nothing real remains.
function deriveBreakoutName(rawHeader: string): string {
  const name = rawHeader
    .replace(/\n/g, " ")
    .replace(/^\s*BREAKOUT\s*/i, "")
    .replace(/\bDimensions\s+Floor\b/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return name.length > 0 ? name : "Breakout";
}

function parseBoRooms(markdown: string): RoomRow[] {
  const rooms: RoomRow[] = [];
  const seen = new Set<string>();

  // v2 format: numbered "| BREAKOUT N&#10;… |" AND numberless "| BREAKOUT&#10;LASALLE A |"
  // / "| BREAKOUT WALTON ROOM Dimensions Floor |" (redefining exporter) — the name
  // rides on the next line or after the word, with no number.
  // Case-SENSITIVE (uppercase BREAKOUT) so it matches real headers but not
  // mixed-case template field labels like "Breakout Room Setup Date / Time".
  const boBlockRe = /^\|\s*(BREAKOUT(?:&#10;|\s)[^|]*?)\s*\|/gm;
  let m: RegExpExecArray | null;

  while ((m = boBlockRe.exec(markdown)) !== null) {
    const rawHeader = m[1]!.replace(/&#10;/g, "\n").replace(/\r/g, "");
    const firstLine = rawHeader.split("\n")[0]!.trim();
    // Numbered "BREAKOUT N…" keeps its full header as the name (existing behavior);
    // numberless "BREAKOUT" derives the name from the remaining header text.
    const numbered = /^BREAKOUT\s+\d/i.test(firstLine);
    const name = numbered ? firstLine : deriveBreakoutName(rawHeader);
    const headerKey = name.toUpperCase();

    if (seen.has(headerKey)) continue;

    const room = buildEmptyRoom("breakout", name);
    const headerLines = rawHeader.split("\n");
    for (let k = 1; k < headerLines.length; k++) {
      const hl = (headerLines[k] ?? "").trim();
      const dimMatch = /(\d+'\s*x\s*\d+'(?:\s*x\s*\d+')?)/.exec(hl);
      if (dimMatch && !room.dimensions) room.dimensions = dimMatch[1]!;
      if (/floor/i.test(hl) && !room.floor) {
        const floorMatch = /(.+?)\s*floor/i.exec(hl);
        if (floorMatch) room.floor = floorMatch[1]!.trim();
      }
    }

    const blockText = extractBoBlock(markdown, m.index);
    applyBoFields(room, blockText);

    // A numberless header must carry real BO fields to count as a room — this
    // rejects pull-sheet "BREAKOUT SESSION N - X" equipment sections that share the
    // bare-BREAKOUT shape but populate no room fields. Numbered headers are real
    // room blocks and keep their existing (ungated) behavior.
    if (!numbered && !roomHasContent(room)) continue;

    seen.add(headerKey);
    rooms.push(room);
  }

  // LUNCH ROOM blocks (consultants roundtable)
  const lunchRe = /^\|\s*(LUNCH\s+ROOM[^|]*?)\s*\|/gim;
  while ((m = lunchRe.exec(markdown)) !== null) {
    const rawHeader = m[1]!.replace(/&#10;/g, "\n");
    const firstLine = rawHeader.split("\n")[0]!.trim();
    const headerKey = firstLine.toUpperCase();
    if (seen.has(headerKey)) continue;
    seen.add(headerKey);

    const room = buildEmptyRoom("breakout", firstLine);
    const blockText = extractBoBlock(markdown, m.index);
    applyBoFields(room, blockText);
    rooms.push(room);
  }

  // v1: MABEL N and LAUDERDALE N rooms (2024 fixture). One room can span multiple
  // blocks — "MABEL 1&#10;APPROXIMATELY 60' x 45'" (dims in header) and
  // "MABEL 1&#10;DAY 1 & 2" (the populated fields). MERGE blocks by header key so
  // the room keeps its content, instead of the empty first occurrence winning
  // dedup and the populated duplicate being skipped. Drop a room that stays empty.
  const mabelRooms = new Map<string, RoomRowInternal>();
  const mabelOrder: string[] = [];
  const mabelRe = /^\|\s*(MABEL\s+\d[^|]*|LAUDERDALE[^|]*?)\s*\|/gim;
  while ((m = mabelRe.exec(markdown)) !== null) {
    const rawHeader = m[1]!.replace(/&#10;/g, "\n");
    const firstLine = rawHeader.split("\n")[0]!.trim();
    const headerKey = firstLine.toUpperCase();
    if (seen.has(headerKey)) continue; // claimed by a BREAKOUT / LUNCH room above
    let room = mabelRooms.get(headerKey);
    if (!room) {
      room = buildEmptyRoom("breakout", firstLine);
      mabelRooms.set(headerKey, room);
      mabelOrder.push(headerKey);
    }
    // dims may ride in the header ("APPROXIMATELY 60' x 45'")
    for (const hl of rawHeader.split("\n").slice(1)) {
      const dimMatch = /(\d+'\s*x\s*\d+'(?:\s*x\s*\d+')?)/.exec(hl);
      if (dimMatch && !room.dimensions) room.dimensions = dimMatch[1]!;
    }
    mergeBoFields(room, extractBoBlock(markdown, m.index));
  }
  for (const key of mabelOrder) {
    const room = mabelRooms.get(key)!;
    if (roomHasContent(room)) rooms.push(room);
  }

  return rooms;
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

function extractBoBlock(markdown: string, startOffset: number): string {
  const slice = markdown.slice(startOffset);
  const lines = slice.split("\n");
  const blockLines: string[] = [];

  for (const line of lines) {
    if (!line.trim().startsWith("|") && blockLines.length > 0) break;
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

function parseAdditionalRoom(markdown: string): RoomRow | null {
  // Case-SENSITIVE: a real additional-room block header is ALL-CAPS
  // "ADDITIONAL ROOM" (e.g. "ADDITIONAL ROOM\nDimensions\nFloor"). The mixed-case
  // INFO metadata fields ("Additional Room Name(s)", "Additional Room Setup", …)
  // are NOT block headers and must not become phantom all-null rooms. Discriminate
  // by header shape (case), not content-emptiness — the latter also drops the
  // legitimate empty raw block.
  const re = /^\|\s*(ADDITIONAL\s+ROOM[^|]*?)\s*\|/m;
  const m = re.exec(markdown);
  if (!m) return null;

  const rawHeader = m[1]!.replace(/&#10;/g, "\n");
  const firstLine = rawHeader.split("\n")[0]!.trim();
  const room = buildEmptyRoom("additional", firstLine);

  const headerLines = rawHeader.split("\n");
  for (let k = 1; k < headerLines.length; k++) {
    const hl = (headerLines[k] ?? "").trim();
    const dimMatch = /(\d+'\s*x\s*\d+'(?:\s*x\s*\d+')?)/.exec(hl);
    if (dimMatch && !room.dimensions) room.dimensions = dimMatch[1]!;
  }

  const blockText = extractBoBlock(markdown, m.index);
  applyBoFields(room, blockText);

  return room;
}

// ── Shared helpers ────────────────────────────────────────────────────────────

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
