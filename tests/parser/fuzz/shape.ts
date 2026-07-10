// tests/parser/fuzz/shape.ts
//
// Tier-1 structural property assertion for the fuzz layer (spec §4.1): a
// plain hand-rolled guard mirroring `ParsedSheet` (lib/parser/types.ts:378-402)
// field-by-field. No zod — the repo has no runtime-validation dependency and
// this is a small, closed shape (YAGNI). Every property fuzz test in this
// directory calls `assertParsedSheetShape(parseSheet(markdown))` before
// asserting anything deeper, so a parser regression that corrupts the
// top-level contract fails fast with a path-labeled message instead of a
// confusing downstream crash.
//
// Deliberately scoped to the ParsedSheet contract itself (top-level fields +
// the two error/warning array element shapes the spec calls out explicitly).
// Nested row types (ShowRow, CrewMemberRow, RoomRow, ...) are NOT deep-
// validated field-by-field here — that is out of scope for "ParsedSheet
// structural validator" and would duplicate the TypeScript compiler's job
// for shapes the parser itself never emits with an unknown container type.

import type { ParsedSheet, ParseError, ParseWarning } from "@/lib/parser/types";

function fail(path: string, message: string): never {
  throw new Error(`assertParsedSheetShape: ${path} ${message}`);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// ParseWarning (types.ts:7-10): { severity: "info"|"warn"; code: string; message: string; ...optional }
function assertWarningShape(w: unknown, path: string): void {
  if (!isPlainObject(w)) fail(path, "must be an object");
  const rec = w as Record<string, unknown>;
  if (typeof rec.code !== "string" || rec.code.length === 0) {
    fail(`${path}.code`, "must be a non-empty string");
  }
  if (rec.severity !== "info" && rec.severity !== "warn") {
    fail(`${path}.severity`, 'must be "info" or "warn"');
  }
  if (typeof rec.message !== "string" || rec.message.length === 0) {
    fail(`${path}.message`, "must be a non-empty string");
  }
}

// ParseError (types.ts:29): { code: string; message: string; blockRef?: { kind: string } }
function assertHardErrorShape(e: unknown, path: string): void {
  if (!isPlainObject(e)) fail(path, "must be an object");
  const rec = e as Record<string, unknown>;
  if (typeof rec.code !== "string" || rec.code.length === 0) {
    fail(`${path}.code`, "must be a non-empty string");
  }
  if (typeof rec.message !== "string" || rec.message.length === 0) {
    fail(`${path}.message`, "must be a non-empty string");
  }
}

/**
 * Structural property assertion for pure-parser output (`ParsedSheet`,
 * `lib/parser/types.ts:378-402`). Throws an `Error` with a JSON-path-labeled
 * message on the FIRST violation encountered (fields are checked in the
 * order they're declared on the type). Used by fast-check fuzz properties as
 * the Tier-1 structural gate — cheaper and more specific than letting a
 * malformed shape surface as an unrelated TypeError downstream.
 */
export function assertParsedSheetShape(p: unknown): asserts p is ParsedSheet {
  if (!isPlainObject(p)) fail("$", "must be an object");
  const rec = p as Record<string, unknown>;

  // show: ShowRow (types.ts:379)
  if (!isPlainObject(rec.show)) fail("$.show", "must be an object");

  // crewMembers: CrewMemberRow[] (types.ts:380)
  if (!Array.isArray(rec.crewMembers)) fail("$.crewMembers", "must be an array");

  // hotelReservations: HotelReservationRow[] (types.ts:381)
  if (!Array.isArray(rec.hotelReservations)) fail("$.hotelReservations", "must be an array");

  // rooms: RoomRow[] (types.ts:382)
  if (!Array.isArray(rec.rooms)) fail("$.rooms", "must be an array");

  // transportation: TransportationRow | null (types.ts:383) — CAUTION: not an array.
  if (rec.transportation !== null && !isPlainObject(rec.transportation)) {
    fail("$.transportation", "must be an object or null");
  }

  // contacts: ContactRow[] (types.ts:384)
  if (!Array.isArray(rec.contacts)) fail("$.contacts", "must be an array");

  // pullSheet: PullSheetCase[] | null (types.ts:385)
  if (rec.pullSheet !== null && !Array.isArray(rec.pullSheet)) {
    fail("$.pullSheet", "must be an array or null");
  }

  // diagrams: { linkedFolder, embeddedImages, linkedFolderItems } (types.ts:386-390) — an OBJECT, not an array.
  if (!isPlainObject(rec.diagrams)) {
    fail("$.diagrams", "must be an object");
  } else {
    const diagrams = rec.diagrams;
    if (diagrams.linkedFolder !== null && !isPlainObject(diagrams.linkedFolder)) {
      fail("$.diagrams.linkedFolder", "must be an object or null");
    }
    if (!Array.isArray(diagrams.embeddedImages)) {
      fail("$.diagrams.embeddedImages", "must be an array");
    }
    if (!Array.isArray(diagrams.linkedFolderItems)) {
      fail("$.diagrams.linkedFolderItems", "must be an array");
    }
  }

  // openingReel: OpeningReelRef | null (types.ts:391)
  if (rec.openingReel !== null && !isPlainObject(rec.openingReel)) {
    fail("$.openingReel", "must be an object or null");
  }

  // raw_unrecognized: { block: string; key: string; value: string }[] (types.ts:392)
  if (!Array.isArray(rec.raw_unrecognized)) fail("$.raw_unrecognized", "must be an array");

  // warnings: ParseWarning[] (types.ts:393); each entry validated per types.ts:7-10.
  if (!Array.isArray(rec.warnings)) {
    fail("$.warnings", "must be an array");
  } else {
    (rec.warnings as unknown[]).forEach((w, i) => assertWarningShape(w, `$.warnings[${i}]`));
  }

  // archivedPullSheetTabs: ArchivedPullSheetTab[] (types.ts:397)
  if (!Array.isArray(rec.archivedPullSheetTabs)) {
    fail("$.archivedPullSheetTabs", "must be an array");
  }

  // runOfShow?: RunOfShow (types.ts:400) — OPTIONAL; validated only when present.
  if (rec.runOfShow !== undefined && !isPlainObject(rec.runOfShow)) {
    fail("$.runOfShow", "must be an object when present");
  }

  // hardErrors: ParseError[] (types.ts:401); each entry validated per types.ts:29.
  if (!Array.isArray(rec.hardErrors)) {
    fail("$.hardErrors", "must be an array");
  } else {
    (rec.hardErrors as unknown[]).forEach((e, i) => assertHardErrorShape(e, `$.hardErrors[${i}]`));
  }

  // Whole value must be JSON-round-trippable (spec §4.1 fuzz oracle canon).
  try {
    JSON.parse(JSON.stringify(p));
  } catch (err) {
    fail("$", `must be JSON round-trippable: ${(err as Error).message}`);
  }
}

// Re-exported purely for callers that want the element-shape checks in isolation
// (e.g. a future warnings-only property). Not part of the Task 2 brief's public
// surface, but harmless and avoids duplicating the guard logic elsewhere.
export type { ParseWarning, ParseError };
