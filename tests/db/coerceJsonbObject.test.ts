import { describe, expect, test } from "vitest";

import {
  asParseResult,
  coerceJsonbArray,
  coerceJsonbObject,
  decodeJsonbColumn,
  JsonbCoercionError,
} from "@/lib/db/coerceJsonbObject";

/**
 * Read-side coercer for jsonb columns read through postgres.js.
 *
 * Root cause of the M12 Phase 0.F smoke-3 finalize 500 (5th onboarding defect):
 * the WRITE side double-encoded `parse_result` into a jsonb STRING SCALAR
 * (postgres.js serialized an already-`JSON.stringify`'d string a second time),
 * so postgres.js READ it back as a JS string. `parseResult.show.title` then
 * threw an UNCAUGHT `TypeError: Cannot read properties of undefined` → empty
 * 500 body → `SyntaxError: Unexpected end of JSON input` on the client.
 *
 * This coercer is the single read boundary that tolerates BOTH shapes — a real
 * object (a correctly-encoded row) and a JSON-string-of-object (a legacy
 * double-encoded row already in the DB) — and converts genuinely-malformed data
 * into a TYPED, catchable error instead of a raw TypeError that 500s with an
 * empty body. Mirrors `parseTriggeredReviewItems`.
 */
describe("coerceJsonbObject", () => {
  test("returns a real object unchanged (correctly-encoded jsonb)", () => {
    const obj = { show: { title: "T" }, diagrams: {} };
    expect(coerceJsonbObject(obj)).toBe(obj);
  });

  test("decodes a JSON-string-of-object (legacy double-encoded jsonb scalar)", () => {
    // This is EXACTLY what postgres.js returns for a double-encoded row: a string.
    const scalar = JSON.stringify({ show: { title: "T" } });
    expect(coerceJsonbObject(scalar)).toEqual({ show: { title: "T" } });
  });

  test("throws a typed JsonbCoercionError on null (not a TypeError)", () => {
    // Failure mode: a NULL jsonb column must not become `null.show` → TypeError.
    expect(() => coerceJsonbObject(null)).toThrow(JsonbCoercionError);
  });

  test("throws a typed JsonbCoercionError on an array", () => {
    expect(() => coerceJsonbObject([1, 2, 3])).toThrow(JsonbCoercionError);
  });

  test("throws a typed JsonbCoercionError on a bare scalar string", () => {
    // A jsonb string scalar whose decoded value is NOT an object.
    expect(() => coerceJsonbObject(JSON.stringify("just a string"))).toThrow(JsonbCoercionError);
  });

  test("throws a typed JsonbCoercionError on an unparseable string", () => {
    expect(() => coerceJsonbObject("{not json")).toThrow(JsonbCoercionError);
  });

  test("throws a typed JsonbCoercionError on a number", () => {
    expect(() => coerceJsonbObject(42)).toThrow(JsonbCoercionError);
  });
});

describe("coerceJsonbArray", () => {
  test("returns a real array unchanged", () => {
    const arr = [{ a: 1 }];
    expect(coerceJsonbArray(arr)).toBe(arr);
  });

  test("decodes a JSON-string-of-array (legacy double-encoded jsonb scalar)", () => {
    // The reviewer_choices legacy shape: postgres.js returns the scalar as a string.
    expect(coerceJsonbArray(JSON.stringify([{ a: 1 }]))).toEqual([{ a: 1 }]);
  });

  test("null and undefined are legitimately empty (not corrupt)", () => {
    expect(coerceJsonbArray(null)).toEqual([]);
    expect(coerceJsonbArray(undefined)).toEqual([]);
  });

  test("throws a typed JsonbCoercionError on a JSON-string-of-object (not an array)", () => {
    expect(() => coerceJsonbArray(JSON.stringify({ a: 1 }))).toThrow(JsonbCoercionError);
  });

  test("throws a typed JsonbCoercionError on a non-array object", () => {
    expect(() => coerceJsonbArray({ a: 1 })).toThrow(JsonbCoercionError);
  });

  test("throws a typed JsonbCoercionError on an unparseable string", () => {
    expect(() => coerceJsonbArray("{not json")).toThrow(JsonbCoercionError);
  });
});

describe("decodeJsonbColumn (lenient READ-side decoder for Supabase-JS readers)", () => {
  test("passes a real object/array through unchanged (no-op for correctly-encoded rows)", () => {
    const obj = { a: 1 };
    const arr = [1, 2];
    expect(decodeJsonbColumn(obj)).toBe(obj);
    expect(decodeJsonbColumn(arr)).toBe(arr);
  });

  test("decodes a legacy string-scalar (the value a crew-page reader gets for a double-encoded row)", () => {
    expect(decodeJsonbColumn(JSON.stringify({ showDays: ["d1"] }))).toEqual({ showDays: ["d1"] });
    expect(decodeJsonbColumn(JSON.stringify([{ label: "x" }]))).toEqual([{ label: "x" }]);
  });

  test("returns null (fail-soft) for null/undefined/unparseable so the caller's ?? default applies", () => {
    expect(decodeJsonbColumn(null)).toBeNull();
    expect(decodeJsonbColumn(undefined)).toBeNull();
    expect(decodeJsonbColumn("{not json")).toBeNull();
  });
});

describe("asParseResult", () => {
  // A COMPLETE ParseResult mirroring lib/parser/types (every non-optional field).
  // asParseResult validates the full contract, not a hand-picked subset.
  const validParseResult = () => ({
    show: {
      title: "T",
      client_label: "CL",
      dates: { showDays: ["2026-05-09"], set: "2026-05-08" },
    },
    crewMembers: [],
    hotelReservations: [],
    rooms: [],
    transportation: null,
    contacts: [],
    pullSheet: null,
    diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
    openingReel: null,
    raw_unrecognized: [],
    warnings: [],
    hardErrors: [],
  });

  test("returns the parse result for a correctly-encoded, complete object", () => {
    const pr = validParseResult();
    expect(asParseResult(pr)).toBe(pr);
  });

  test("decodes a double-encoded complete parse_result string scalar (the production bug)", () => {
    const scalar = JSON.stringify(validParseResult());
    expect(asParseResult(scalar)).toEqual(validParseResult());
  });

  test("throws JsonbCoercionError on a string scalar (not an object) instead of TypeError", () => {
    expect(() => asParseResult("hello")).toThrow(JsonbCoercionError);
  });

  // Codex R3→R4 contract: EVERY non-optional ParseResult field is validated, so a
  // corrupt-but-object row can never pass the gate and TypeError in any downstream
  // consumer (applyStaged, applyParseResult, finalize, deriveSlug). Each case
  // breaks exactly one required field. Mirrors lib/parser/types ParseResult.
  test.each([
    ["show missing", (pr: Record<string, unknown>) => delete pr.show],
    ["show not an object", (pr: Record<string, unknown>) => (pr.show = "x")],
    ["show.title missing", (pr: Record<string, unknown>) => delete (pr.show as Record<string, unknown>).title],
    ["show.dates missing", (pr: Record<string, unknown>) => delete (pr.show as Record<string, unknown>).dates],
    [
      "show.dates.showDays not an array",
      (pr: Record<string, unknown>) =>
        ((pr.show as { dates: Record<string, unknown> }).dates.showDays = "nope"),
    ],
    ["crewMembers not an array", (pr: Record<string, unknown>) => (pr.crewMembers = {})],
    ["hotelReservations missing", (pr: Record<string, unknown>) => delete pr.hotelReservations],
    ["rooms missing", (pr: Record<string, unknown>) => delete pr.rooms],
    ["contacts not an array", (pr: Record<string, unknown>) => (pr.contacts = "x")],
    ["raw_unrecognized missing", (pr: Record<string, unknown>) => delete pr.raw_unrecognized],
    ["warnings not an array", (pr: Record<string, unknown>) => (pr.warnings = null)],
    ["hardErrors missing", (pr: Record<string, unknown>) => delete pr.hardErrors],
    ["diagrams not an object", (pr: Record<string, unknown>) => (pr.diagrams = [])],
    [
      "diagrams.embeddedImages not an array",
      (pr: Record<string, unknown>) =>
        ((pr.diagrams as Record<string, unknown>).embeddedImages = {}),
    ],
    [
      "diagrams.linkedFolderItems missing (deref'd via .map)",
      (pr: Record<string, unknown>) =>
        delete (pr.diagrams as Record<string, unknown>).linkedFolderItems,
    ],
    ["transportation a scalar (not object|null)", (pr: Record<string, unknown>) => (pr.transportation = "x")],
    ["openingReel a scalar (not object|null)", (pr: Record<string, unknown>) => (pr.openingReel = 1)],
    ["pullSheet an object (not array|null)", (pr: Record<string, unknown>) => (pr.pullSheet = {})],
  ])("throws JsonbCoercionError when %s (no downstream TypeError)", (_label, mutate) => {
    const pr = validParseResult() as unknown as Record<string, unknown>;
    mutate(pr);
    expect(() => asParseResult(pr)).toThrow(JsonbCoercionError);
  });

  test("accepts transportation/openingReel as objects and pullSheet as an array (the non-null variants)", () => {
    const pr = validParseResult() as unknown as Record<string, unknown>;
    pr.transportation = { driver: "x" };
    pr.openingReel = { driveFileId: "f" };
    pr.pullSheet = [{ caseLabel: "C", items: [] }];
    expect(() => asParseResult(pr)).not.toThrow();
  });
});
