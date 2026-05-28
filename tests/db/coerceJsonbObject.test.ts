import { describe, expect, test } from "vitest";

import {
  asParseResult,
  coerceJsonbObject,
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

describe("asParseResult", () => {
  test("returns the parse result for a correctly-encoded object", () => {
    const pr = { show: { title: "T", client_label: "CL" }, diagrams: {} };
    expect(asParseResult(pr)).toBe(pr);
  });

  test("decodes a double-encoded parse_result string scalar (the production bug)", () => {
    const scalar = JSON.stringify({ show: { title: "T" } });
    expect(asParseResult(scalar)).toEqual({ show: { title: "T" } });
  });

  test("throws JsonbCoercionError when show is missing (would have been the TypeError)", () => {
    // The exact failure: parse_result decodes to an object with no `.show`.
    expect(() => asParseResult({ diagrams: {} })).toThrow(JsonbCoercionError);
  });

  test("throws JsonbCoercionError on a string scalar (not an object) instead of TypeError", () => {
    expect(() => asParseResult("hello")).toThrow(JsonbCoercionError);
  });
});
