// tests/parser/fuzz/model.ts
//
// The semantic core of the fuzz layer (spec §3.1). This module owns:
//   1. `ShowModel` — the abstract, render-independent description of ONE generated
//      show (the oracle in Task 7 derives ground truth from THIS, never from the
//      rendered markdown).
//   2. `showModel` / `caseArb` — the fast-check arbitraries that generate honest
//      `ShowModel`s (and `[ShowModel, DialChoices]` pairs).
//   3. `validateGeneratedCase` — the ONE honesty gate. Every construction rule the
//      arbitrary claims to obey is RE-CHECKED here (invariants a–h). `render.ts`
//      (Task 6) never checks honesty; it trusts a model that has passed this gate.
//      Because it is the soundness boundary of the whole layer, every invariant is a
//      separately-callable function and a violation throws `GeneratorInvariantViolation`
//      whose message names the offending letter.
//
// Live-code contracts this module is written against (verified at authoring time):
//   - stage-clause vocabulary Load In / Set / Show / Strike / Load Out —
//     `lib/parser/stageClause.ts:21` (`parseStageClause` lives there, not
//     personalization.ts).
//   - hotel guest tokenizer rejects digits in names — `lib/parser/blocks/hotels.ts:185`.
//   - room header name shape `/^[A-Z0-9][A-Z0-9 &',./-]*$/` — `rooms.ts:134-152`
//     (⇒ room names are UPPERCASE).
//   - US suffix-bearing street address — `STREET_ADDRESS_RE` `hotelConfTokens.ts`.
//   - 4-digit-year date shapes bounded to 2000–2099 — `normalizeDate` `_helpers.ts:178`
//     (our [2020,2035] window sits safely inside it for every dateFormat dial value).
//   - day-restriction / date tokens `\d{1,2}/\d{1,2}` — `PAREN_ONLY_PATTERN`
//     `personalization.ts:58`.

import fc from "fast-check";
import { parseStageClause } from "@/lib/parser/stageClause";
import { dialChoices, type DialChoices } from "./dials";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A calendar date as an ISO `YYYY-MM-DD` string (the parser's canonical form). */
export type IsoDate = string;

/** The five section kinds the Phase-1 model can render (spec §3.1). */
export type SectionKind = "crew" | "hotels" | "rooms" | "venue" | "dates";

export const SECTION_KINDS: readonly SectionKind[] = [
  "crew",
  "hotels",
  "rooms",
  "venue",
  "dates",
] as const;

export type CrewModel = {
  name: string;
  role: string;
  phone: string;
  email?: string;
  /** A non-empty subset of `dates.showDays` when present. */
  dayRestriction?: IsoDate[];
};

export type HotelModel = {
  name: string;
  address: string;
  /** Crew names, each appearing in AT MOST one hotel (invariant b). */
  guests: string[];
};

export type RoomModel = {
  kind: "GENERAL SESSION" | "BREAKOUT" | "ADDITIONAL ROOM" | "LUNCH ROOM";
  name: string;
  dims: { w: number; d: number };
};

export type ShowModel = {
  version: "v4";
  year: number;
  dates: { travelIn: IsoDate; showDays: IsoDate[]; travelOut: IsoDate };
  crew: CrewModel[];
  hotels: HotelModel[];
  rooms: RoomModel[];
  venue: { name: string; address: string };
  /**
   * The ORDERED list of sections PRESENT in this show. Always contains
   * `crew`/`venue`/`dates`; contains `hotels`/`rooms` IFF their list is
   * non-empty (spec §3.1 presence/content coupling). `dials.sectionOrder`
   * permutes THIS list at render time — the model's order is the canonical
   * baseline.
   */
  sections: SectionKind[];
};

// ---------------------------------------------------------------------------
// Shared vocabularies / pools (letter-safe, marker-free by construction)
// ---------------------------------------------------------------------------

/**
 * The clean role vocabulary (spec §3.1 rule 2). Two constraints, both RE-ASSERTED
 * in `model.test.ts`:
 *
 *   1. Invariant (c) screen: contains NONE of the 5 stage tokens (Load In / Set /
 *      Show / Strike / Load Out), no `ONLY`, no `***`, no `\d{1,2}/\d{1,2}` date
 *      token, and no parens (checked against the live `parseStageClause` grammar).
 *
 *   2. RECOGNIZED tokens only — every entry is a key of `ROLE_NORMALIZATIONS`
 *      (personalization.ts:18-42), so the parser recognizes it and emits ZERO crew
 *      warnings for it (verbatim round-trip: planted "A1" → parsed role "A1").
 *      This is LOAD-BEARING for Tier-2 soundness: an UNRECOGNIZED role (e.g. the
 *      old "Video Engineer") makes the parser emit a per-member `UNKNOWN_ROLE_TOKEN`
 *      warning stamped `blockRef = {kind:"crew", name:<crew name>}` (crew.ts:293,
 *      367-372). The oracle's t1 channel absolves any crew miss when
 *      `blockRef.name === entity.identityValue` (groundTruth.ts:201) — so a
 *      self-naming role warning would blanket-absolve EVERY crew field/existence
 *      miss, making the Tier-2 property's crew clause trivially satisfied and its
 *      phone/email/date_restriction comparators dead code. Recognized tokens emit
 *      no such warning, so a crew regression (dropped member, wrong phone) has
 *      NOTHING to absolve it and the property genuinely catches it. Proven by
 *      `plantAndFind.fuzz.test.ts`'s property-distribution regression test.
 */
export const CLEAN_ROLE_VOCAB = ["LEAD", "A1", "A2", "V1", "L1"] as const;

export const ROOM_KINDS: readonly RoomModel["kind"][] = [
  "GENERAL SESSION",
  "BREAKOUT",
  "ADDITIONAL ROOM",
  "LUNCH ROOM",
] as const;

/**
 * Bare stage-clause words (spec §3.1 rule 2 / stageClause.ts:21). A role must not
 * contain any of the 5 stage tokens even WITHOUT an ONLY marker — `parseStageClause`
 * only recognizes a stage RESTRICTION (which needs an ONLY / full-4 clause), so this
 * whole-token screen is what catches a bare `Set` / `Show` / `Load In` in a role cell.
 */
const STAGE_WORD_RE = /\b(?:LOAD\s+IN|LOAD\s+OUT|SET|SHOW|STRIKE)\b/i;

const FIRST_NAMES = [
  "Amara",
  "Boris",
  "Clara",
  "Devon",
  "Elena",
  "Farid",
  "Greta",
  "Hugo",
] as const;
const LAST_NAMES = ["Quinn", "Stone", "Vale", "Marsh", "Reyes", "Novak", "Wren", "Cole"] as const;
const HOTEL_WORDS = ["Harborview", "Bayside", "Grand", "Summit", "Riverside", "Beacon"] as const;
const ROOM_WORDS = ["ALPINE", "MERIDIAN", "HARBOR", "SUMMIT", "AZURE", "CEDAR"] as const;
const VENUE_WORDS = ["Vantage", "Cascade", "Horizon", "Vista", "Keystone"] as const;

// STREET_ADDRESS_RE suffix subset (hotelConfTokens.ts). Letter-only street names +
// a suffix drawn from the regex's own list; the house number carries the only
// digits, and no marker literal (ONLY/***/#/`\d/\d`/parens) can appear.
const STREET_NAMES = ["Main", "Oak", "Maple", "Highland", "Cedar", "Birch"] as const;
const STREET_SUFFIXES = ["St", "Ave", "Blvd", "Dr", "Rd", "Pl", "Ln", "Way", "Ct"] as const;

// ---------------------------------------------------------------------------
// Serials — fixed-width letters-only base-26 codes with a section prefix.
// Fixed width ⇒ no serial is a substring/prefix of another; a distinct prefix
// per section keeps cross-section serials disjoint too.
// ---------------------------------------------------------------------------

/** `prefix` + two-letter base-26 code, e.g. serial("Q",0)="QAA", serial("Q",27)="QBB". */
export function serial(prefix: string, index: number): string {
  const hi = String.fromCharCode(65 + Math.floor(index / 26));
  const lo = String.fromCharCode(65 + (index % 26));
  return `${prefix}${hi}${lo}`;
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function isoParts(d: IsoDate): { y: number; m: number; day: number } {
  const [y, m, day] = d.split("-").map((s) => Number.parseInt(s, 10));
  return { y: y!, m: m!, day: day! };
}

/** Yearless `M/D` (no leading zeros) — matches `DATE_TOKEN_PATTERN` `\d{1,2}/\d{1,2}`. */
export function mdToken(d: IsoDate): string {
  const { m, day } = isoParts(d);
  return `${m}/${day}`;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/**
 * Render an ISO date in one of the five parser-accepted shapes (the `dateFormat`
 * dial domain). Each shape round-trips through `normalizeDate` back to `d`.
 */
export function renderDateToken(d: IsoDate, fmt: DialChoices["dateFormat"]): string {
  const { y, m, day } = isoParts(d);
  const mm = String(m).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  switch (fmt) {
    case "slash":
      return `${m}/${day}/${y}`;
    case "dash":
      return `${m}-${day}-${y}`;
    case "iso":
      return `${y}-${mm}-${dd}`;
    case "longMDY":
      return `${MONTH_NAMES[m - 1]} ${day}, ${y}`;
    case "longDMY":
      return `${day} ${MONTH_NAMES[m - 1]} ${y}`;
  }
}

/** Day-of-year (0-based, in `year`) → ISO date. Uses UTC so no TZ drift. */
function dayOfYearToIso(year: number, doy: number): IsoDate {
  const dt = new Date(Date.UTC(year, 0, 1 + doy));
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${mm}-${dd}`;
}

// ---------------------------------------------------------------------------
// The showModel arbitrary
// ---------------------------------------------------------------------------

type RawCrew = {
  firstIdx: number;
  lastIdx: number;
  roleIdx: number;
  phoneA: number;
  phoneB: number;
  phoneC: number;
  restrictOn: boolean;
  restrictMask: number;
};
type RawHotel = { wordIdx: number; num: number; streetIdx: number; suffixIdx: number };
type RawRoom = { kindIdx: number; wordIdx: number; w: number; d: number };

const rawCrewArb: fc.Arbitrary<RawCrew> = fc.record({
  firstIdx: fc.nat({ max: FIRST_NAMES.length - 1 }),
  lastIdx: fc.nat({ max: LAST_NAMES.length - 1 }),
  roleIdx: fc.nat({ max: CLEAN_ROLE_VOCAB.length - 1 }),
  phoneA: fc.integer({ min: 200, max: 999 }),
  phoneB: fc.integer({ min: 200, max: 999 }),
  phoneC: fc.integer({ min: 0, max: 9999 }),
  restrictOn: fc.boolean(),
  restrictMask: fc.nat({ max: 63 }),
});

const rawHotelArb: fc.Arbitrary<RawHotel> = fc.record({
  wordIdx: fc.nat({ max: HOTEL_WORDS.length - 1 }),
  num: fc.integer({ min: 1, max: 9999 }),
  streetIdx: fc.nat({ max: STREET_NAMES.length - 1 }),
  suffixIdx: fc.nat({ max: STREET_SUFFIXES.length - 1 }),
});

const rawRoomArb: fc.Arbitrary<RawRoom> = fc.record({
  kindIdx: fc.nat({ max: ROOM_KINDS.length - 1 }),
  wordIdx: fc.nat({ max: ROOM_WORDS.length - 1 }),
  w: fc.integer({ min: 10, max: 200 }),
  d: fc.integer({ min: 10, max: 200 }),
});

function address(num: number, streetIdx: number, suffixIdx: number): string {
  return `${num} ${STREET_NAMES[streetIdx % STREET_NAMES.length]} ${STREET_SUFFIXES[suffixIdx % STREET_SUFFIXES.length]}`;
}

type RawShow = {
  year: number;
  doys: number[];
  crew: RawCrew[];
  hotels: RawHotel[];
  rooms: RawRoom[];
  hotelAssign: number[];
  venueWordIdx: number;
  venueNum: number;
  venueStreetIdx: number;
  venueSuffixIdx: number;
};

function assemble(raw: RawShow): ShowModel {
  const { year } = raw;

  // Dates: distinct day-of-year values → distinct calendar days, sorted ascending.
  const sortedDoys = [...raw.doys].sort((a, b) => a - b);
  const isoDates = sortedDoys.map((doy) => dayOfYearToIso(year, doy));
  const travelIn = isoDates[0]!;
  const travelOut = isoDates[isoDates.length - 1]!;
  const showDays = isoDates.slice(1, -1);

  // Crew.
  const crew: CrewModel[] = raw.crew.map((c, i) => {
    const name = `${FIRST_NAMES[c.firstIdx]} ${serial("Q", i)} ${LAST_NAMES[c.lastIdx]}`;
    const phone = `${c.phoneA}-${c.phoneB}-${String(c.phoneC).padStart(4, "0")}`;
    const member: CrewModel = {
      name,
      role: CLEAN_ROLE_VOCAB[c.roleIdx % CLEAN_ROLE_VOCAB.length]!,
      phone,
      email: `q${i}@fuzz.example`,
    };
    if (c.restrictOn && showDays.length > 0) {
      let subset = showDays.filter((_, k) => (c.restrictMask >> k) & 1);
      if (subset.length === 0) subset = [showDays[0]!]; // keep non-empty
      member.dayRestriction = subset;
    }
    return member;
  });

  // Hotels (guest lists filled by the partition below).
  const hotels: HotelModel[] = raw.hotels.map((h, i) => ({
    name: `${HOTEL_WORDS[h.wordIdx]} ${serial("H", i)} Hotel`,
    address: address(h.num, h.streetIdx, h.suffixIdx),
    guests: [],
  }));

  // Guest partition: each crew member is assigned to at most one hotel (−1 = none).
  raw.crew.forEach((_, i) => {
    if (hotels.length === 0) return;
    const target = raw.hotelAssign[i] ?? -1;
    if (target >= 0 && target < hotels.length) {
      hotels[target]!.guests.push(crew[i]!.name);
    }
  });

  // Rooms (UPPERCASE names to satisfy roomHeaderNameShape).
  const rooms: RoomModel[] = raw.rooms.map((r, i) => ({
    kind: ROOM_KINDS[r.kindIdx % ROOM_KINDS.length]!,
    name: `${ROOM_WORDS[r.wordIdx]} ${serial("R", i)}`,
    dims: { w: r.w, d: r.d },
  }));

  const venue = {
    name: `${VENUE_WORDS[raw.venueWordIdx]} ${serial("V", 0)} Center`,
    address: address(raw.venueNum, raw.venueStreetIdx, raw.venueSuffixIdx),
  };

  // Presence/content coupling: crew/dates/venue always; hotels/rooms iff non-empty.
  const sections: SectionKind[] = ["crew", "dates", "venue"];
  if (hotels.length > 0) sections.push("hotels");
  if (rooms.length > 0) sections.push("rooms");

  return {
    version: "v4",
    year,
    dates: { travelIn, showDays, travelOut },
    crew,
    hotels,
    rooms,
    venue,
    sections,
  };
}

export const showModel: fc.Arbitrary<ShowModel> = fc
  .record<RawShow>({
    year: fc.integer({ min: 2020, max: 2035 }),
    // 3–6 distinct days-of-year (capped at 359 so every year — leap or not — is valid).
    doys: fc.uniqueArray(fc.integer({ min: 0, max: 359 }), { minLength: 3, maxLength: 6 }),
    // Ranges match the plan's Global Constraints: crew 1–12, hotels 0–3, rooms 0–6.
    crew: fc.array(rawCrewArb, { minLength: 1, maxLength: 12 }),
    hotels: fc.array(rawHotelArb, { minLength: 0, maxLength: 3 }),
    rooms: fc.array(rawRoomArb, { minLength: 0, maxLength: 6 }),
    // One slot per potential crew member (max 12); −1 = unhoused; max index 2 = hotels max−1.
    hotelAssign: fc.array(fc.integer({ min: -1, max: 2 }), { minLength: 12, maxLength: 12 }),
    venueWordIdx: fc.nat({ max: VENUE_WORDS.length - 1 }),
    venueNum: fc.integer({ min: 1, max: 9999 }),
    venueStreetIdx: fc.nat({ max: STREET_NAMES.length - 1 }),
    venueSuffixIdx: fc.nat({ max: STREET_SUFFIXES.length - 1 }),
  })
  .map(assemble);

// ---------------------------------------------------------------------------
// caseArb + cross-dial normalization
// ---------------------------------------------------------------------------

/**
 * Resolve cross-dial exclusions BY CONSTRUCTION (spec §3.2) so every case
 * `caseArb` yields is in-contract (the parser is contractually required to
 * handle it). Two headerless-crew resolutions, both returning a fresh pair:
 *
 *   1. A headerless crew header carries no header row at all, so a header-cell
 *      typo cannot coexist with it — "headerless wins" ⇒ `headerTypo := null`.
 *
 *   2. EMAIL is HEADER-GATED: `detectColumns`' positional default is `email=-1`
 *      (crew.ts:85-88) — positionally column 4 is ambiguous (`notes` OR `EMAIL`
 *      in the v2 layout, crew.ts:9-10), so the parser deliberately refuses to
 *      recover an email without an explicit `EMAIL` header token. A headerless
 *      crew table therefore CANNOT round-trip email, so an honest in-contract
 *      case plants none — drop `email` from every crew member here. The oracle
 *      then expects `null` (matching the parser) while name / role / phone /
 *      date_restriction / existence stay FULLY compared. This is a model-side
 *      honesty resolution, NOT an oracle relaxation: `groundTruth.ts` is
 *      untouched and still strictly compares every recoverable crew field.
 */
export function normalizeCombo(
  pair: readonly [ShowModel, DialChoices],
): readonly [ShowModel, DialChoices] {
  const [model, dials] = pair;
  if (dials.crewHeader !== "headerless") return [model, dials];

  const nextDials = dials.headerTypo !== null ? { ...dials, headerTypo: null } : dials;
  const needsEmailStrip = model.crew.some((c) => c.email !== undefined);
  if (!needsEmailStrip) return [model, nextDials];

  const nextModel: ShowModel = {
    ...model,
    // contract-narrowed: EMAIL is header-gated (crew.ts:88 email=-1 positional default; col-4 is ambiguous notes-vs-EMAIL, crew.ts:9-10), so headerless crew cannot recover email positionally — strip it from the model rather than plant an unrecoverable value. No BACKLOG entry: the notes-vs-EMAIL ambiguity makes positional email recovery genuinely out-of-contract, not a bug worth fixing.
    crew: model.crew.map((c) => {
      if (c.email === undefined) return c;
      // Omit the `email` key entirely (not `email: undefined`) so the oracle's
      // `planted.email ?? null` reads as an unplanted email under this dial.
      const { email: _drop, ...rest } = c;
      return rest;
    }),
  };
  return [nextModel, nextDials];
}

/** The `[ShowModel, DialChoices]` pair every property samples. */
export const caseArb: fc.Arbitrary<readonly [ShowModel, DialChoices]> = fc
  .tuple(showModel, dialChoices)
  .map(normalizeCombo);

// ---------------------------------------------------------------------------
// validateGeneratedCase — the single honesty gate (invariants a–h)
// ---------------------------------------------------------------------------

export class GeneratorInvariantViolation extends Error {
  readonly invariant: string;
  constructor(invariant: string, detail: string) {
    super(`invariant (${invariant}): ${detail}`);
    this.name = "GeneratorInvariantViolation";
    this.invariant = invariant;
  }
}

function fail(letter: string, detail: string): never {
  throw new GeneratorInvariantViolation(letter, detail);
}

/** All free-text identity strings that must be marker-literal-free (roles handled by (c)). */
function identityStrings(model: ShowModel): string[] {
  const out: string[] = [];
  for (const c of model.crew) out.push(c.name);
  for (const h of model.hotels) {
    out.push(h.name, h.address, ...h.guests);
  }
  for (const r of model.rooms) out.push(r.name);
  out.push(model.venue.name, model.venue.address);
  return out;
}

/**
 * (a) Identity uniqueness + substring-disjointness. Every crew/hotel/room/venue
 * NAME is unique, and no name's embedded serial appears inside ANY OTHER
 * identity's rendered name (so a guest/venue/room string can never be confused
 * for another identity by a substring match downstream).
 */
export function checkIdentityDisjointness(model: ShowModel): void {
  const named: { name: string; sec: SectionKind; serialTok: string }[] = [];
  model.crew.forEach((c, i) =>
    named.push({ name: c.name, sec: "crew", serialTok: serial("Q", i) }),
  );
  model.hotels.forEach((h, i) =>
    named.push({ name: h.name, sec: "hotels", serialTok: serial("H", i) }),
  );
  model.rooms.forEach((r, i) =>
    named.push({ name: r.name, sec: "rooms", serialTok: serial("R", i) }),
  );
  named.push({ name: model.venue.name, sec: "venue", serialTok: serial("V", 0) });

  const seenNames = new Set<string>();
  for (const n of named) {
    if (seenNames.has(n.name)) fail("a", `duplicate identity name "${n.name}"`);
    seenNames.add(n.name);
  }
  // Pairwise: identity i's serial must not appear inside identity j's name (i≠j).
  for (const a of named) {
    for (const b of named) {
      if (a === b) continue;
      if (b.name.includes(a.serialTok)) {
        fail(
          "a",
          `serial "${a.serialTok}" of ${a.sec} name "${a.name}" is a substring of "${b.name}"`,
        );
      }
    }
  }
}

/**
 * (b) Guest partition. Every hotel guest is an actual crew member's name, and no
 * guest appears in more than one hotel's list.
 */
export function checkGuestPartition(model: ShowModel): void {
  const crewNames = new Set(model.crew.map((c) => c.name));
  const seen = new Set<string>();
  for (const h of model.hotels) {
    for (const g of h.guests) {
      if (!crewNames.has(g)) fail("b", `hotel "${h.name}" guest "${g}" is not a crew member`);
      if (seen.has(g)) fail("b", `guest "${g}" appears in more than one hotel`);
      seen.add(g);
    }
  }
}

/**
 * (c) Role vocabulary screen. Every crew role must carry NO stage clause (checked
 * against the live `parseStageClause` grammar), no `ONLY`, no `***`, no
 * `\d{1,2}/\d{1,2}` date token, and no parens.
 */
export function checkRoleScreen(model: ShowModel): void {
  for (const c of model.crew) {
    const role = c.role;
    const clause = parseStageClause(role);
    if (clause.stages.length > 0) fail("c", `role "${role}" carries a stage token`);
    if (clause.unrecognizedRestriction)
      fail("c", `role "${role}" reads as a malformed stage clause`);
    if (STAGE_WORD_RE.test(role)) fail("c", `role "${role}" contains a bare stage word`);
    if (/\bONLY\b/i.test(role)) fail("c", `role "${role}" contains ONLY`);
    if (/\*/.test(role)) fail("c", `role "${role}" contains an asterisk`);
    if (/\d{1,2}\/\d{1,2}/.test(role)) fail("c", `role "${role}" contains a date token`);
    if (/[()]/.test(role)) fail("c", `role "${role}" contains parens`);
  }
}

/** (d) Year range: `year ∈ [2020,2035]`. */
export function checkYearRange(model: ShowModel): void {
  if (!Number.isInteger(model.year) || model.year < 2020 || model.year > 2035) {
    fail("d", `year ${model.year} is outside [2020,2035]`);
  }
}

// Parser structural markers that must never appear in a free-text identity field.
const MARKER_SCREENS: { re: RegExp; label: string }[] = [
  { re: /\bONLY\b/i, label: "ONLY" },
  { re: /\*/, label: "asterisk" },
  { re: /#/, label: "hash" },
  { re: /\d{1,2}\/\d{1,2}/, label: "date token" },
  { re: /[()]/, label: "parens" },
  { re: /&#10;/, label: "encoded newline" },
  { re: /[\t|]/, label: "tab/pipe" },
];

/**
 * (e) No marker literals. No generated identity string (crew/hotel/room/venue
 * names, hotel addresses, guest names) may embed a parser structural marker — such
 * a literal would derail tokenization and make the oracle dishonest.
 */
export function checkNoMarkerLiterals(model: ShowModel): void {
  for (const s of identityStrings(model)) {
    for (const { re, label } of MARKER_SCREENS) {
      if (re.test(s)) fail("e", `identity string "${s}" contains a ${label} marker`);
    }
  }
}

/**
 * (f) Presence/content coupling. `sections` always contains crew/venue/dates;
 * contains `hotels` IFF `hotels` is non-empty and `rooms` IFF `rooms` is non-empty;
 * carries no duplicates and no unknown kinds.
 */
export function checkSectionCoupling(model: ShowModel): void {
  const secs = model.sections;
  const set = new Set(secs);
  if (set.size !== secs.length) fail("f", "sections contains duplicate entries");
  for (const s of secs) {
    if (!SECTION_KINDS.includes(s)) fail("f", `sections contains unknown kind "${s}"`);
  }
  for (const required of ["crew", "venue", "dates"] as const) {
    if (!set.has(required)) fail("f", `sections must contain "${required}"`);
  }
  if (set.has("hotels") !== model.hotels.length > 0) {
    fail(
      "f",
      `"hotels" section presence (${set.has("hotels")}) must match hotels.length>0 (${model.hotels.length > 0})`,
    );
  }
  if (set.has("rooms") !== model.rooms.length > 0) {
    fail(
      "f",
      `"rooms" section presence (${set.has("rooms")}) must match rooms.length>0 (${model.rooms.length > 0})`,
    );
  }
}

/**
 * (g) Date distinctness & ordering. travelIn + showDays + travelOut are distinct
 * calendar days in strictly-increasing order, and their ISO / `M/D` / every
 * rendered-format tokens are all pairwise unique.
 */
export function checkDateDistinctness(model: ShowModel): void {
  const all = [model.dates.travelIn, ...model.dates.showDays, model.dates.travelOut];
  if (all.length < 3) fail("g", "expected at least travelIn + one showDay + travelOut");
  for (let i = 1; i < all.length; i++) {
    if (!(all[i - 1]! < all[i]!)) {
      fail("g", `dates not strictly increasing at index ${i}: "${all[i - 1]}" !< "${all[i]}"`);
    }
  }
  const formats: DialChoices["dateFormat"][] = ["slash", "dash", "iso", "longMDY", "longDMY"];
  const tokenSets: { label: string; tokens: string[] }[] = [
    { label: "iso", tokens: all },
    { label: "M/D", tokens: all.map(mdToken) },
    ...formats.map((f) => ({ label: f, tokens: all.map((d) => renderDateToken(d, f)) })),
  ];
  for (const { label, tokens } of tokenSets) {
    if (new Set(tokens).size !== tokens.length)
      fail("g", `${label} date tokens are not all unique`);
  }
}

/**
 * Alphanumeric-boundary containment — mirrors the oracle's
 * `containsDelimitedIdentity` (groundTruth.ts:104-125): a needle counts as
 * contained only when the characters immediately before/after it are NOT
 * alphanumeric, so `"Ann"` ⊄ `"Annette"` and a serial `"QAA"` ⊄ `"QAABC"`.
 * Kept LOCAL (not imported from groundTruth) so model.ts — the soundness
 * boundary render.ts trusts — has no dependency on the oracle module.
 */
function containsIdentityDelimited(hay: string, needle: string): boolean {
  if (needle.length === 0) return false;
  const boundary = /[A-Za-z0-9]/;
  let from = 0;
  for (;;) {
    const idx = hay.indexOf(needle, from);
    if (idx < 0) return false;
    const before = idx > 0 ? hay[idx - 1]! : "";
    const after = idx + needle.length < hay.length ? hay[idx + needle.length]! : "";
    if ((before === "" || !boundary.test(before)) && (after === "" || !boundary.test(after))) {
      return true;
    }
    from = idx + 1;
  }
}

/**
 * Per-entity identity strings + non-identity field values, used by invariant (h).
 * `identities` are the strings the oracle attributes/absolves BY (a NAME and its
 * fixed-width serial); `fields` are the free-text NON-identity values a
 * same-section warning might echo (crew role/phone/email, hotel & venue address,
 * room dims). Hotel `guests` are deliberately EXCLUDED from `fields` — they are
 * OTHER crew members' identity strings by design (the guest partition, invariant
 * b), not a non-identity field, so echoing a guest name is legitimate.
 */
function entityFieldTable(
  model: ShowModel,
): { owner: string; identities: string[]; fields: string[] }[] {
  const out: { owner: string; identities: string[]; fields: string[] }[] = [];
  model.crew.forEach((c, i) => {
    const fields = [c.role, c.phone];
    if (c.email !== undefined) fields.push(c.email);
    out.push({ owner: `crew[${i}]`, identities: [c.name, serial("Q", i)], fields });
  });
  model.hotels.forEach((h, i) => {
    out.push({ owner: `hotels[${i}]`, identities: [h.name, serial("H", i)], fields: [h.address] });
  });
  model.rooms.forEach((r, i) => {
    out.push({
      owner: `rooms[${i}]`,
      identities: [r.name, serial("R", i)],
      fields: [`${r.dims.w} x ${r.dims.d}`],
    });
  });
  out.push({
    owner: "venue",
    identities: [model.venue.name, serial("V", 0)],
    fields: [model.venue.address],
  });
  return out;
}

/**
 * (h) Cross-entity field containment (defensive soundness guard). No entity's
 * identity string — a crew/hotel/room/venue NAME or its fixed-width serial — may
 * appear as a boundary-delimited substring of ANY OTHER entity's NON-identity
 * field value (crew role/phone/email, hotel/venue address, room dims). If it did,
 * a non-fatal warning attributed to the FIELD's owner whose message/rawSnippet
 * echoes that field could spuriously ABSOLVE the IDENTITY's owner's silent miss
 * via the oracle's t2/t3 value-containment channel (groundTruth.ts:202,212) —
 * e.g. crew A's role carrying crew B's name lets an A-warning blanket-absolve B.
 * Currently UNREACHABLE (roles are the fixed recognized vocab with no names;
 * phones/emails/addresses/dims are digit/lowercase/street-word shaped) — but this
 * gate is the soundness boundary and must fail-closed against a future generator
 * edit, exactly like the compile-time key witness in dials.ts. Uses the SAME
 * alphanumeric-boundary matcher discipline as the oracle (so `Ann` ⊄ `Annette`).
 */
export function checkCrossEntityFieldContainment(model: ShowModel): void {
  const table = entityFieldTable(model);
  for (const src of table) {
    for (const dst of table) {
      if (src.owner === dst.owner) continue;
      for (const id of src.identities) {
        for (const field of dst.fields) {
          if (containsIdentityDelimited(field, id)) {
            fail(
              "h",
              `identity "${id}" of ${src.owner} appears as a boundary-delimited substring of ${dst.owner}'s non-identity field "${field}"`,
            );
          }
        }
      }
    }
  }
}

/**
 * The single honesty gate. Runs every invariant a–h in order and, defensively,
 * re-checks the headerless/headerTypo cross-dial exclusion `normalizeCombo`
 * resolves by construction. Throws `GeneratorInvariantViolation` on the first
 * violation.
 */
export function validateGeneratedCase(model: ShowModel, dials: DialChoices): void {
  checkIdentityDisjointness(model); // (a)
  checkGuestPartition(model); // (b)
  checkRoleScreen(model); // (c)
  checkYearRange(model); // (d)
  checkNoMarkerLiterals(model); // (e)
  checkSectionCoupling(model); // (f)
  checkDateDistinctness(model); // (g)
  checkCrossEntityFieldContainment(model); // (h)

  // Cross-dial exclusion (not an a–h model invariant; defense-in-depth for the
  // one dial combination normalizeCombo forbids by construction).
  if (dials.crewHeader === "headerless" && dials.headerTypo !== null) {
    throw new GeneratorInvariantViolation(
      "dials",
      "headerless crewHeader must not compose with a non-null headerTypo",
    );
  }
}
