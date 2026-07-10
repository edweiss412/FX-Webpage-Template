// tests/parser/fuzz/groundTruth.ts
//
// The Tier-2 plant-and-find ORACLE (spec §4.2). This module is the soundness
// boundary of the whole fuzz layer: given the ground-truth `ShowModel` (Task 5),
// the `DialChoices` it was rendered under (Task 4/6), and the `ParsedSheet` the
// production parser produced, it decides — for EVERY planted entity — whether the
// parser either round-tripped it correctly OR fired an ATTRIBUTABLE non-fatal
// signal that legitimately explains its absence/mismatch.
//
// Two-sided honesty is the entire point:
//   - NO vacuous absolution: a hardError, a bare `blockRef.index`, an unrelated
//     same-section warning, or a signal in a DIFFERENT section NEVER absolves a
//     miss (that would let one noisy signal mask a silent drop).
//   - NO spurious miss: a genuine round-trip, or a genuinely entity-identifying /
//     section-structural signal, is accepted.
//
// The oracle derives ground truth from the MODEL, never from a second parse — so
// its own tests (groundTruth.test.ts) feed HAND-BUILT `ParsedSheet` objects and
// assert the oracle's SPEC, not the parser's behaviour (anti-tautology).
//
// Live-code field names this oracle reads (verified against lib/parser/types.ts):
//   - crew  (CrewMemberRow):  name, role, phone, email, date_restriction  (:84-93)
//   - hotel (HotelReservationRow): hotel_name, hotel_address, names        (:150-159)
//   - room  (RoomRow): name, dimensions  (kind is NOT matched — LUNCH ROOM
//                       normalizes to internal kind `breakout`, rooms.ts:1220-1236) (:161-179)
//   - venue (ShowRow.venue): name, address  (:108-119)
//   - dates (ShowRow.dates): travelIn, showDays, travelOut  (:120-131)
//   - DateRestriction: {kind:'explicit', days: string[]} raw `M/D` tokens |
//     {kind:'none'}  (:31-34; personalization.ts:59 DATE_TOKEN_PATTERN, :142-145)
//   - empty-section warn code SECTION_HEADER_NO_FIELDS, blockRef {kind:<section>}
//     (warnings.ts:33,42-50) — the ONLY section-structural (t2) code.

import type { ParsedSheet, CrewMemberRow, ParseWarning } from "@/lib/parser/types";
import { canonicalize } from "@/lib/email/canonicalize";
import type { ShowModel, SectionKind, CrewModel } from "./model";
import { mdToken, renderDateToken } from "./model";
import type { DialChoices } from "./dials";

export type PlantAndFindResult = { ok: true } | { ok: false; misses: string[] };

// ---------------------------------------------------------------------------
// Section membership. Maps a parser `blockRef.kind` / `raw_unrecognized.block`
// string to one of the five MODELED section kinds. Derived from the live
// KIND_TO_SECTION table (lib/admin/step3SectionStatus.ts:22-45), narrowed to the
// modeled sections: crew (+ travel/flights aliases), hotels (+ hotel_reservations),
// rooms (+ gear_scope), venue, dates. A kind outside this set → `null` (an
// unrelated block; never counts as "same section").
// ---------------------------------------------------------------------------

const BLOCK_KIND_TO_SECTION: Record<string, SectionKind> = {
  crew: "crew",
  travel: "crew",
  flights: "crew",
  hotels: "hotels",
  hotel_reservations: "hotels",
  rooms: "rooms",
  gear_scope: "rooms",
  venue: "venue",
  dates: "dates",
};

function sectionOfBlock(kind: string | undefined | null): SectionKind | null {
  if (!kind) return null;
  return BLOCK_KIND_TO_SECTION[kind] ?? null;
}

// ---------------------------------------------------------------------------
// t2 section-structural allowlist — codes whose DOCUMENTED meaning is "this whole
// section is unreadable", so one instance absolves every planted entity of that
// section. Each entry carries a justification comment (spec §4.2 tier 2).
//
// CREW_COLUMN_POSITIONAL_FALLBACK is DELIBERATELY ABSENT: it means "columns were
// read by position", NOT "section unreliable" — the headerless-crew dial renders
// values in positional-default order, so the parse MUST still round-trip every
// crew entity. That dial's oracle requires the warning fires AND every crew member
// is found (no absolution). Adding it here would be a soundness hole.
// ---------------------------------------------------------------------------

const T2_SECTION_STRUCTURAL_ALLOWLIST: Readonly<Record<string, string>> = {
  // emitEmptySection (warnings.ts:42-50): "recognized this section's header but
  // parsed ZERO fields — section dropped." Whole-section unreadable ⇒ absolves
  // every planted entity of the section named by blockRef.kind. The ONLY Phase-1
  // code with whole-section semantics.
  SECTION_HEADER_NO_FIELDS: "empty section: header recognized, zero fields parsed, section dropped",
};

// ---------------------------------------------------------------------------
// Boundary-delimited containment (spec §3.1 "belt and suspenders" + §4.2). A
// needle counts as CONTAINED only when it appears as a whole delimited token: the
// characters immediately before and after must NOT be continuation characters of
// the needle's domain. This is what makes value-containment attribution sound —
// a prefix collision (identity "Ann QAB Roe" inside "Ann QAB Roeder") or a date
// collision (`M/D` "3/24" inside "3/24/2026") does NOT match.
// ---------------------------------------------------------------------------

function containsDelimited(hay: string, needle: string, boundary: RegExp): boolean {
  if (needle.length === 0) return false;
  let from = 0;
  for (;;) {
    const idx = hay.indexOf(needle, from);
    if (idx < 0) return false;
    const before = idx > 0 ? hay[idx - 1]! : "";
    const after = idx + needle.length < hay.length ? hay[idx + needle.length]! : "";
    const okBefore = before === "" || !boundary.test(before);
    const okAfter = after === "" || !boundary.test(after);
    if (okBefore && okAfter) return true;
    from = idx + 1;
  }
}

/**
 * Identity (name) containment. Boundary = alphanumeric — so "Ann QAB Roe" is NOT
 * found inside "Ann QAB Roeder" (the trailing "d" is a boundary char).
 */
export function containsDelimitedIdentity(hay: string, needle: string): boolean {
  return containsDelimited(hay, needle, /[A-Za-z0-9]/);
}

/**
 * Date-token containment. Boundary = digit / `/` / `-` (every date-continuation
 * char) — so the `M/D` token "3/24" is NOT found inside "3/24/2026" (the trailing
 * "/" is a boundary char), and a full token "3/24/2026" is not found inside
 * "3/24/20261". Domain-aware per spec §3.1 / §4.2 step 5.
 */
export function containsDelimitedDateToken(hay: string, token: string): boolean {
  return containsDelimited(hay, token, /[0-9/-]/);
}

// ---------------------------------------------------------------------------
// Field-comparison primitives.
// ---------------------------------------------------------------------------

function wsCanon(s: string | null | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

function multisetEqualCanon(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const norm = (xs: readonly string[]) => xs.map(wsCanon).sort();
  const A = norm(a);
  const B = norm(b);
  return A.every((v, i) => v === B[i]);
}

/** Ordered integer operands in a dims string, e.g. "40' x 30'" → [40, 30]. */
function dimsInts(s: string | null): number[] {
  if (!s) return [];
  return (s.match(/\d+/g) ?? []).map((n) => Number.parseInt(n, 10));
}

// ---------------------------------------------------------------------------
// Missed-entity descriptor + attribution (spec §4.2 tiers 1/2/3).
// ---------------------------------------------------------------------------

type MissedEntity =
  | { section: SectionKind; kind: "identity"; identityValue: string }
  | { section: "dates"; kind: "date"; iso: string; tokens: string[] };

function warningText(w: ParseWarning): string {
  return `${w.message} ${w.rawSnippet ?? ""}`;
}

/**
 * Does ANY attributable non-fatal signal legitimately explain this miss?
 *   t2 (section-structural): an allowlisted whole-section-unreadable code in the
 *       entity's section absolves it.
 *   t1 (entity-attributable warning): SAME section AND identifies the entity via
 *       blockRef.iso (dates), blockRef.name exact identity, or boundary-delimited
 *       identity-value containment in message+rawSnippet. Bare blockRef.index NEVER
 *       attributes (header rows reuse index 0).
 *   t3 (raw_unrecognized): SAME block AND boundary-delimited identity/date-token
 *       containment.
 * hardErrors are NOT an absolution channel (handled by the precondition upstream).
 */
function isAttributed(entity: MissedEntity, parsed: ParsedSheet): boolean {
  // t2 — section-structural.
  for (const w of parsed.warnings) {
    if (!w.code || !(w.code in T2_SECTION_STRUCTURAL_ALLOWLIST)) continue;
    if (sectionOfBlock(w.blockRef?.kind) === entity.section) return true;
  }

  // t1 — entity-attributable warning (same section, identifies the entity).
  for (const w of parsed.warnings) {
    if (sectionOfBlock(w.blockRef?.kind) !== entity.section) continue;
    const hay = warningText(w);
    if (entity.kind === "date") {
      if (w.blockRef?.iso && w.blockRef.iso === entity.iso) return true;
      if (entity.tokens.some((t) => containsDelimitedDateToken(hay, t))) return true;
    } else {
      // blockRef.name is an EXACT identity match (never a substring), and only
      // identity-VALUE containment absolves — non-identity field values (role,
      // phone, dims, address) are never passed here, so they can never absolve.
      if (w.blockRef?.name && w.blockRef.name === entity.identityValue) return true;
      if (containsDelimitedIdentity(hay, entity.identityValue)) return true;
    }
  }

  // t3 — raw_unrecognized (same block, identity/date-token containment).
  for (const r of parsed.raw_unrecognized) {
    if (sectionOfBlock(r.block) !== entity.section) continue;
    const hay = `${r.key} ${r.value}`;
    if (entity.kind === "date") {
      if (entity.tokens.some((t) => containsDelimitedDateToken(hay, t))) return true;
    } else if (containsDelimitedIdentity(hay, entity.identityValue)) {
      return true;
    }
  }

  return false;
}

function dateEntity(iso: string, dials: DialChoices): MissedEntity {
  return {
    section: "dates",
    kind: "date",
    iso,
    // Every domain the parser could echo the date in: structured ISO, the yearless
    // `M/D` restriction token, and the dialed full render.
    tokens: [iso, mdToken(iso), renderDateToken(iso, dials.dateFormat)],
  };
}

// ---------------------------------------------------------------------------
// Per-section field matchers. Each consumes matched parsed rows (one-to-one) and
// pushes an unabsolved-miss description into `misses`.
// ---------------------------------------------------------------------------

/** Returns the first field-mismatch reason, or null when every field matches. */
function crewFieldMismatch(
  planted: CrewModel,
  row: CrewMemberRow,
  dials: DialChoices,
): string | null {
  if (wsCanon(row.role) !== wsCanon(planted.role)) {
    return `role "${wsCanon(row.role)}" != "${wsCanon(planted.role)}"`;
  }
  if (wsCanon(row.phone) !== wsCanon(planted.phone)) {
    return `phone "${wsCanon(row.phone)}" != "${wsCanon(planted.phone)}"`;
  }
  const expectedEmail = canonicalize(planted.email ?? null);
  if (row.email !== expectedEmail) {
    return `email "${row.email}" != "${expectedEmail}"`;
  }
  // date_restriction: explicit IFF the dial is on AND a restriction was planted;
  // otherwise `{kind:'none'}`.
  const expectRestriction =
    dials.dayRestrictionOn && !!planted.dayRestriction && planted.dayRestriction.length > 0;
  if (expectRestriction) {
    if (row.date_restriction.kind !== "explicit") {
      return `date_restriction kind "${row.date_restriction.kind}" != "explicit"`;
    }
    const expectedDays = planted.dayRestriction!.map(mdToken);
    if (!multisetEqualCanon(row.date_restriction.days, expectedDays)) {
      return `date_restriction days [${row.date_restriction.days}] != [${expectedDays}]`;
    }
  } else if (row.date_restriction.kind !== "none") {
    return `date_restriction kind "${row.date_restriction.kind}" != "none" (no restriction planted)`;
  }
  return null;
}

function checkCrew(
  model: ShowModel,
  dials: DialChoices,
  parsed: ParsedSheet,
  misses: string[],
): void {
  const pool = [...parsed.crewMembers];
  for (const planted of model.crew) {
    const idx = pool.findIndex((r) => wsCanon(r.name) === wsCanon(planted.name));
    const entity: MissedEntity = {
      section: "crew",
      kind: "identity",
      identityValue: planted.name,
    };
    if (idx < 0) {
      if (!isAttributed(entity, parsed)) {
        misses.push(`crew "${planted.name}" not found and no attributable signal`);
      }
      continue;
    }
    const row = pool.splice(idx, 1)[0]!;
    const reason = crewFieldMismatch(planted, row, dials);
    if (reason && !isAttributed(entity, parsed)) {
      misses.push(`crew "${planted.name}" field mismatch (${reason}) and no attributable signal`);
    }
  }
}

function checkHotels(model: ShowModel, parsed: ParsedSheet, misses: string[]): void {
  const pool = [...parsed.hotelReservations];
  for (const planted of model.hotels) {
    const idx = pool.findIndex((r) => wsCanon(r.hotel_name) === wsCanon(planted.name));
    const entity: MissedEntity = {
      section: "hotels",
      kind: "identity",
      identityValue: planted.name,
    };
    if (idx < 0) {
      if (!isAttributed(entity, parsed)) {
        misses.push(`hotel "${planted.name}" not found and no attributable signal`);
      }
      continue;
    }
    const row = pool.splice(idx, 1)[0]!;
    let reason: string | null = null;
    if (row.hotel_address === null || wsCanon(row.hotel_address) !== wsCanon(planted.address)) {
      reason = `address "${row.hotel_address}" != "${planted.address}" (must be non-null + split)`;
    } else if (!multisetEqualCanon(row.names, planted.guests)) {
      reason = `guests [${row.names}] != [${planted.guests}]`;
    }
    if (reason && !isAttributed(entity, parsed)) {
      misses.push(`hotel "${planted.name}" field mismatch (${reason}) and no attributable signal`);
    }
  }
}

function checkRooms(model: ShowModel, parsed: ParsedSheet, misses: string[]): void {
  // Match by NAME + numeric dims ONLY — NOT kind (LUNCH ROOM → internal `breakout`).
  const pool = [...parsed.rooms];
  for (const planted of model.rooms) {
    const idx = pool.findIndex((r) => wsCanon(r.name) === wsCanon(planted.name));
    const entity: MissedEntity = {
      section: "rooms",
      kind: "identity",
      identityValue: planted.name,
    };
    if (idx < 0) {
      if (!isAttributed(entity, parsed)) {
        misses.push(`room "${planted.name}" not found and no attributable signal`);
      }
      continue;
    }
    const row = pool.splice(idx, 1)[0]!;
    const got = dimsInts(row.dimensions);
    const want = [planted.dims.w, planted.dims.d];
    const dimsOk = got.length === want.length && got.every((v, i) => v === want[i]);
    if (!dimsOk && !isAttributed(entity, parsed)) {
      misses.push(
        `room "${planted.name}" dims mismatch ([${got}] != [${want}]) and no attributable signal`,
      );
    }
  }
}

function checkVenue(model: ShowModel, parsed: ParsedSheet, misses: string[]): void {
  const v = parsed.show.venue;
  const entity: MissedEntity = {
    section: "venue",
    kind: "identity",
    identityValue: model.venue.name,
  };
  let reason: string | null = null;
  if (v === null) {
    reason = "venue is null";
  } else if (wsCanon(v.name) !== wsCanon(model.venue.name)) {
    reason = `name "${v.name}" != "${model.venue.name}"`;
  } else if (wsCanon(v.address) !== wsCanon(model.venue.address)) {
    reason = `address "${v.address}" != "${model.venue.address}"`;
  }
  if (reason && !isAttributed(entity, parsed)) {
    misses.push(`venue "${model.venue.name}" mismatch (${reason}) and no attributable signal`);
  }
}

function checkDates(
  model: ShowModel,
  dials: DialChoices,
  parsed: ParsedSheet,
  misses: string[],
): void {
  const pd = parsed.show.dates;
  const checkOne = (label: string, plantedIso: string, parsedVal: string | null): void => {
    if (parsedVal === plantedIso) return;
    if (!isAttributed(dateEntity(plantedIso, dials), parsed)) {
      misses.push(
        `dates.${label} expected ${plantedIso}, got ${parsedVal ?? "null"} and no attributable signal`,
      );
    }
  };
  checkOne("travelIn", model.dates.travelIn, pd.travelIn);
  checkOne("travelOut", model.dates.travelOut, pd.travelOut);

  const pool = [...pd.showDays];
  for (const iso of model.dates.showDays) {
    const idx = pool.indexOf(iso);
    if (idx >= 0) {
      pool.splice(idx, 1);
      continue;
    }
    if (!isAttributed(dateEntity(iso, dials), parsed)) {
      misses.push(`dates.showDay ${iso} missing and no attributable signal`);
    }
  }
}

/**
 * Zero-fabrication (spec §7). A MODELED section with ZERO planted entities MUST
 * have an empty parsed payload — there is nothing a signal could legitimately
 * explain, so NO absolution applies. Crew/venue/dates are always planted, so only
 * hotels/rooms can be empty. Version-scaffold sections (contacts/transportation)
 * are non-modeled and exempt — they legitimately parse into payload.
 */
function checkZeroFabrication(model: ShowModel, parsed: ParsedSheet, misses: string[]): void {
  if (model.crew.length === 0 && parsed.crewMembers.length > 0) {
    misses.push(`fabrication: 0 crew planted but parsed ${parsed.crewMembers.length} crew`);
  }
  if (model.hotels.length === 0 && parsed.hotelReservations.length > 0) {
    misses.push(
      `fabrication: 0 hotels planted but parsed ${parsed.hotelReservations.length} reservations`,
    );
  }
  if (model.rooms.length === 0 && parsed.rooms.length > 0) {
    misses.push(`fabrication: 0 rooms planted but parsed ${parsed.rooms.length} rooms`);
  }
}

// ---------------------------------------------------------------------------
// The oracle (spec §4.2).
// ---------------------------------------------------------------------------

/**
 * For every planted entity, assert it either round-tripped correctly OR an
 * attributable non-fatal signal fired. Returns `{ok:true}` when every planted
 * entity is accounted for AND no fabrication occurred; otherwise `{ok:false}` with
 * a human-readable `misses` list.
 */
export function checkPlantAndFind(
  model: ShowModel,
  dials: DialChoices,
  parsed: ParsedSheet,
): PlantAndFindResult {
  // Step 1 — precondition. hardErrors NEVER absolve; their presence on
  // model-rendered (in-contract) input is itself a failure (spec §4.2 precondition).
  if (parsed.hardErrors.length > 0) {
    return { ok: false, misses: parsed.hardErrors.map((e) => `hardError:${e.code}`) };
  }

  const misses: string[] = [];
  checkCrew(model, dials, parsed, misses);
  checkHotels(model, parsed, misses);
  checkRooms(model, parsed, misses);
  checkVenue(model, parsed, misses);
  checkDates(model, dials, parsed, misses);
  checkZeroFabrication(model, parsed, misses);

  return misses.length === 0 ? { ok: true } : { ok: false, misses };
}
