// tests/parser/fuzz/render.ts
//
// Deterministic serialization of a (validated) `ShowModel` + `DialChoices` into a
// v4 markdown sheet the production parser accepts (spec §3.3, Task 6).
//
// render.ts is SERIALIZATION ONLY. It NEVER re-checks honesty — the single honesty
// gate is `validateGeneratedCase` (Task 5, model.ts); by the time a model reaches
// here it is trusted. render.ts owns exactly ONE piece of semantic coupling the
// model deliberately deferred: the day-restriction clause is emitted on a crew
// role cell ONLY when the member carries a `dayRestriction` AND `dials.dayRestrictionOn`
// is true (Task 5 review). Everything else is a straight template fill.
//
// Section templates are fixture-derived (verbatim shapes verified against the live
// parser at authoring time; see the anchor tests in render.test.ts):
//   - v4 scaffold + DATES + CREW + VENUE + ROOMS  →  fixtures/shows/raw/2025-04-asset-mgmt-cfo-coo.md
//   - structured HOTEL reservation grid            →  fixtures/shows/raw/2026-04-asset-mgmt-cfo-coo-waldorf.md
//
// Live-parser contracts this module renders against (verified at authoring time):
//   - confident-v4 detection needs strict-col0 markers from >=2 V4_BLOCKS (schema.ts:90-103);
//     the scaffold supplies contact(3) + rental(2) = score 5, blocks 2.
//   - crew header row is ALWAYS consumed as row 0; data starts row 1 (crew.ts:140-167).
//   - headerless crew = a label-only header row; positional fallback fires (crew.ts:156-164).
//   - a CREW-cell typo with an intact field band autocorrects (sectionHeaderNormalize.ts:98-114).
//   - day restriction parses from `(<M/D> & <M/D> ONLY)` (personalization.ts:58,93-122).
//   - v4 GS / BREAKOUT <n> / ADDITIONAL ROOM headers: rooms.ts:671-718; content-gated
//     kinds need a real name and/or a populated field (rooms.ts:697,715).
//   - LUNCH ROOM parses via lunchRe as kind `breakout` (rooms.ts:1220-1236).
//   - structured hotel table + guest glue-split: hotels.ts:381-555,157-218.

import type { ShowModel, CrewModel, RoomModel, SectionKind } from "./model";
import { renderDateToken, mdToken } from "./model";
import type { DialChoices } from "./dials";

// ---------------------------------------------------------------------------
// Small deterministic helpers
// ---------------------------------------------------------------------------

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** Correct weekday name for an ISO date (UTC, so no TZ drift). Cosmetic — the DAY
 *  column is not parsed — but a wrong weekday would be an unplanted inconsistency. */
function isoWeekday(iso: string): string {
  const [y, m, d] = iso.split("-").map((s) => Number.parseInt(s, 10));
  const dow = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
  return WEEKDAYS[dow]!;
}

/**
 * Render a room dimension pair in the dialed token shape (`_dimsToken.ts` accepted
 * forms). Exported so the anchor tests derive the expected dims from the SAME source
 * instead of hardcoding (anti-tautology).
 */
export function renderDims(w: number, d: number, fmt: DialChoices["dimsFormat"]): string {
  switch (fmt) {
    case "unit":
      return `${w}' x ${d}'`;
    case "bare":
      return `${w} x ${d}`;
    case "unicode":
      return `${w}′ × ${d}′`;
  }
}

// ---------------------------------------------------------------------------
// v4 scaffold — byte-constant, always rendered LAST (spec §3.3).
// contact(3) + rental(2) strict-col0 markers → confident-v4 (schema.ts V4_BLOCKS).
// ---------------------------------------------------------------------------

export const SCAFFOLD = [
  "| CONTACT OFFICE | 000-000-0000 |",
  "| CONTACT CELL | 000-000-0000 |",
  "| CONTACT EMAIL | scaffold@fuzz.example |",
  "| RENTAL PICKUP | TBD |",
  "| RENTAL RETURN | TBD |",
].join("\n");

// ---------------------------------------------------------------------------
// DATES (5-col v4)
// ---------------------------------------------------------------------------

function renderDates(model: ShowModel, dials: DialChoices): string {
  const fmt = dials.dateFormat;
  const lines: string[] = [
    "| DATES | | DAY | DATE | TIME |",
    "| :---: | :---: | :---: | :---: | :---: |",
  ];
  const row = (label: string, iso: string) =>
    `| | ${label} | ${isoWeekday(iso)} | ${renderDateToken(iso, fmt)} | |`;
  lines.push(row("TRAVEL IN", model.dates.travelIn));
  model.dates.showDays.forEach((iso, i) => lines.push(row(`SHOW DAY ${i + 1}`, iso)));
  lines.push(row("TRAVEL OUT", model.dates.travelOut));
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// CREW
// ---------------------------------------------------------------------------

// Positional/vocab orders (crew.ts CREW_COLUMN_VOCAB). `labeled` = canonical order;
// `permuted` = a fixed non-identity permutation (header labels AND data cells move
// together so `detectColumns` re-maps them and every value still round-trips).
const CREW_LABELED_ORDER = ["NAME", "ROLE", "PHONE", "EMAIL"] as const;
const CREW_PERMUTED_ORDER = ["ROLE", "NAME", "EMAIL", "PHONE"] as const;

type CrewField = (typeof CREW_LABELED_ORDER)[number];

/** The role cell as rendered: the base role, plus the day-restriction clause IFF the
 *  member carries a restriction AND the dial is on (render owns this coupling). */
function roleCell(member: CrewModel, dials: DialChoices): string {
  if (dials.dayRestrictionOn && member.dayRestriction && member.dayRestriction.length > 0) {
    const days = member.dayRestriction.map(mdToken).join(" & ");
    return `${member.role} (${days} ONLY)`;
  }
  return member.role;
}

function crewFieldValues(member: CrewModel, dials: DialChoices): Record<CrewField, string> {
  return {
    NAME: member.name,
    ROLE: roleCell(member, dials),
    PHONE: member.phone,
    EMAIL: member.email ?? "",
  };
}

function renderCrew(model: ShowModel, dials: DialChoices): string {
  // Section label: the CREW typo when present (the gate guarantees headerTypo is null
  // whenever crewHeader === "headerless", so the two never compose).
  const label = dials.headerTypo ? dials.headerTypo.typoedCrewLabel : "CREW";

  let headerFields: readonly string[];
  let order: readonly CrewField[];
  if (dials.crewHeader === "headerless") {
    // A label-only header row (no recognized column tokens) → positional fallback.
    // Data still starts at row 1, values in positional columns 1/2/3 (name/role/phone).
    headerFields = ["", "", "", ""];
    order = CREW_LABELED_ORDER; // positional defaults line up with the labeled order
  } else if (dials.crewHeader === "permuted") {
    order = CREW_PERMUTED_ORDER;
    headerFields = CREW_PERMUTED_ORDER;
  } else {
    order = CREW_LABELED_ORDER;
    headerFields = CREW_LABELED_ORDER;
  }

  const lines: string[] = [
    `| ${label} | ${headerFields.join(" | ")} |`,
    "| :---: | :---: | :---: | :---: | :---: |",
  ];
  for (const member of model.crew) {
    const values = crewFieldValues(member, dials);
    lines.push(`| | ${order.map((k) => values[k]).join(" | ")} |`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// VENUE (v2/v4 3-column label/value block)
// ---------------------------------------------------------------------------

function renderVenue(model: ShowModel): string {
  return [
    `| VENUE | VENUE NAME | ${model.venue.name} |`,
    "| :---: | :---: | :---: |",
    `| | VENUE ADDRESS | ${model.venue.address} |`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// HOTEL (structured reservation grid; hotels.ts parseHotelTable)
// ---------------------------------------------------------------------------

/** Guest confirmation serial — `#3` + 6 zero-padded digits (brief shape). Unique per
 *  guest via a render-global counter; parsed only to be stripped, never persisted. */
function guestConf(globalIndex: number): string {
  return `#3${String(globalIndex).padStart(6, "0")}`;
}

/** The single "Names on Reservation" cell: all guests glued as `<name> - #<conf>`
 *  (the parser glue-splits this back into per-guest names — hotels.ts:157-218). */
function guestsCell(guests: string[], startIndex: number): string {
  return guests.map((g, i) => `${g} - ${guestConf(startIndex + i)}`).join(" ");
}

function renderHotels(model: ShowModel, dials: DialChoices): string {
  const fmt = dials.dateFormat;
  const checkIn = renderDateToken(model.dates.travelIn, fmt);
  const checkOut = renderDateToken(model.dates.travelOut, fmt);
  const lines: string[] = [];
  let guestCounter = 0;

  // Reserve a guest-index block per hotel up front so the per-hotel cell content is
  // independent of grid pairing (deterministic + disjoint).
  const guestStart: number[] = [];
  for (const h of model.hotels) {
    guestStart.push(guestCounter);
    guestCounter += h.guests.length;
  }

  for (let i = 0; i < model.hotels.length; i += 2) {
    const left = model.hotels[i]!;
    const right = model.hotels[i + 1]; // may be undefined (odd tail)
    const leftNum = i + 1;
    const rightNum = i + 2;
    const first = i === 0;

    if (right) {
      // 5-column paired reservation group.
      lines.push(
        `${first ? "| HOTEL" : "| "} | RESERVATION #${leftNum} | | RESERVATION #${rightNum} |`,
      );
      if (first) lines.push("| :---: | :---: | :---: | :---: |");
      lines.push("| | Hotel Name / Address | | Hotel Name / Address |");
      lines.push(`| | ${left.name} ${left.address} | | ${right.name} ${right.address} |`);
      lines.push("| | Names on Reservation | | Names on Reservation |");
      lines.push(
        `| | ${guestsCell(left.guests, guestStart[i]!)} | | ${guestsCell(right.guests, guestStart[i + 1]!)} |`,
      );
      lines.push("| | Check In Date | Check Out Date | Check In Date | Check Out Date |");
      lines.push(`| | ${checkIn} | ${checkOut} | ${checkIn} | ${checkOut} |`);
    } else {
      // 3-column lone reservation.
      lines.push(`${first ? "| HOTEL" : "| "} | RESERVATION #${leftNum} |`);
      if (first) lines.push("| :---: | :---: |");
      lines.push("| | Hotel Name / Address |");
      lines.push(`| | ${left.name} ${left.address} |`);
      lines.push("| | Names on Reservation |");
      lines.push(`| | ${guestsCell(left.guests, guestStart[i]!)} |`);
      lines.push("| | Check In Date | Check Out Date |");
      lines.push(`| | ${checkIn} | ${checkOut} |`);
    }
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// ROOMS — each of the FOUR model kinds has its OWN admitted header shape.
// Room blocks are separated by a blank line so each terminates cleanly (parseV4RoomBlock
// stops at a non-`|` line; its header-stop set does NOT include LUNCH ROOM — rooms.ts:811-818).
// ---------------------------------------------------------------------------

// Bare v4 field labels (rooms.ts V4_BARE_LABELS / applyBoFields plainFieldRe). The
// FIRST row must be a bare label so hasBareV4DataRow routes to the v4 path; the first
// carries a real value so content-gated kinds (breakout/additional) survive.
const ROOM_FIELD_ROWS: ReadonlyArray<readonly [string, string]> = [
  ["Setup", "1 room"],
  ["Set Time", ""],
  ["Show Time", ""],
  ["Strike Time", ""],
  ["Audio", ""],
  ["Video", ""],
  ["Lighting", ""],
  ["Scenic", ""],
  ["Power", ""],
  ["Digital Signage", ""],
  ["Other", ""],
  ["Notes", ""],
];

/** The header-cell prefix for a room kind. BREAKOUT requires a number (`^BREAKOUT \d`). */
function roomHeaderCell(room: RoomModel, breakoutNumber: number, dims: string): string {
  const nameAndDims = `${room.name} ${dims}`;
  switch (room.kind) {
    case "GENERAL SESSION":
      return `GENERAL SESSION ${nameAndDims}`;
    case "BREAKOUT":
      return `BREAKOUT ${breakoutNumber} ${nameAndDims}`;
    case "ADDITIONAL ROOM":
      return `ADDITIONAL ROOM ${nameAndDims}`;
    case "LUNCH ROOM":
      return `LUNCH ROOM ${nameAndDims}`;
  }
}

function renderRoomBlock(room: RoomModel, breakoutNumber: number, dials: DialChoices): string {
  const dims = renderDims(room.dims.w, room.dims.d, dials.dimsFormat);
  const lines: string[] = [
    `| ${roomHeaderCell(room, breakoutNumber, dims)} | |`,
    "| :---: | :---: |",
  ];
  for (const [label, value] of ROOM_FIELD_ROWS) lines.push(`| ${label} | ${value} |`);
  return lines.join("\n");
}

function renderRooms(model: ShowModel, dials: DialChoices): string {
  let breakoutNumber = 0;
  const blocks: string[] = [];
  for (const room of model.rooms) {
    if (room.kind === "BREAKOUT") breakoutNumber += 1;
    blocks.push(renderRoomBlock(room, breakoutNumber, dials));
  }
  // Blank line BETWEEN room blocks so each block terminates independently.
  return blocks.join("\n\n");
}

// ---------------------------------------------------------------------------
// Assembly — section order (Lehmer decode of sectionOrder) + blank padding.
// ---------------------------------------------------------------------------

function factorial(n: number): number {
  let f = 1;
  for (let i = 2; i <= n; i++) f *= i;
  return f;
}

/** Decode `index` into a permutation of `sections` via the factorial number system
 *  (Lehmer code). Total < 5! = 120 so the nat({max:5000}) dial covers every ordering. */
export function decodeSectionOrder(index: number, sections: readonly SectionKind[]): SectionKind[] {
  const pool = [...sections];
  const n = pool.length;
  if (n <= 1) return pool;
  let idx = ((index % factorial(n)) + factorial(n)) % factorial(n);
  const out: SectionKind[] = [];
  for (let i = n; i >= 1; i--) {
    const f = factorial(i - 1);
    const pick = Math.floor(idx / f);
    idx %= f;
    out.push(pool.splice(pick, 1)[0]!);
  }
  return out;
}

/**
 * Serialize a validated `ShowModel` + `DialChoices` into a v4 markdown sheet.
 * Deterministic: identical inputs always produce byte-identical output.
 */
export function renderCase(model: ShowModel, dials: DialChoices): string {
  const rendered: Record<SectionKind, string> = {
    crew: renderCrew(model, dials),
    dates: renderDates(model, dials),
    venue: renderVenue(model),
    hotels: model.hotels.length > 0 ? renderHotels(model, dials) : "",
    rooms: model.rooms.length > 0 ? renderRooms(model, dials) : "",
  };

  const order = decodeSectionOrder(dials.sectionOrder, model.sections);
  // A "blank row" between sections = one empty line minimum; blankPadding∈{1,2,3}
  // empty lines. `"\n" + "\n".repeat(blankPadding)` ⇒ blankPadding=1 → exactly one.
  const sep = "\n" + "\n".repeat(dials.blankPadding);
  const body = order.map((k) => rendered[k]).join(sep);

  // Scaffold appended LAST after a single blank line (fixed placement, not dialed).
  return `${body}\n\n${SCAFFOLD}`;
}
