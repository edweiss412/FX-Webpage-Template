import { describe, expect, test } from "vitest";

import {
  asTriggeredReviewItems,
  parseTriggeredReviewItems,
} from "@/lib/staging/triggeredReviewItems";
import type { TriggeredReviewItem } from "@/lib/parser/types";

const VALID: TriggeredReviewItem[] = [
  { id: "a", invariant: "FIRST_SEEN_REVIEW" },
  { id: "b", invariant: "MI-8", field: "po" },
];

describe("parseTriggeredReviewItems (gate boundary — fail closed on corrupt)", () => {
  // The fail-OPEN this guards (Codex R2): a corrupt non-array review gate must
  // NOT be silently treated as "no review required" — that would let a row
  // requiring review (e.g. MI-11 crew-email change) be applied unreviewed.
  test("legitimate empty: null / undefined / [] are ok with empty items", () => {
    expect(parseTriggeredReviewItems(null)).toEqual({ ok: true, items: [] });
    expect(parseTriggeredReviewItems(undefined)).toEqual({ ok: true, items: [] });
    expect(parseTriggeredReviewItems([])).toEqual({ ok: true, items: [] });
  });

  test("valid array is ok and passed through", () => {
    expect(parseTriggeredReviewItems(VALID)).toEqual({ ok: true, items: VALID });
  });

  test("double-encoded JSON-string array is ok and parsed", () => {
    expect(parseTriggeredReviewItems(JSON.stringify(VALID))).toEqual({ ok: true, items: VALID });
  });

  test("corrupt: a non-array object is NOT ok (fails closed)", () => {
    expect(parseTriggeredReviewItems({ id: "x", invariant: "MI-8" })).toEqual({ ok: false });
  });

  test("corrupt: scalar, JSON-string-of-object, and garbage string are NOT ok", () => {
    expect(parseTriggeredReviewItems(3)).toEqual({ ok: false });
    expect(parseTriggeredReviewItems(true)).toEqual({ ok: false });
    expect(parseTriggeredReviewItems('{"id":"x"}')).toEqual({ ok: false });
    expect(parseTriggeredReviewItems("not json {")).toEqual({ ok: false });
  });
});

describe("asTriggeredReviewItems", () => {
  // The crash this guards (M12 Phase 0.F smoke 3): StagedReviewCard calls
  // .some()/.map()/.length/for-of on row.triggeredReviewItems. The staged
  // pages used `?? []`, which only catches null/undefined — a non-array jsonb
  // value (object, JSON string, or malformed data left by the earlier
  // broken-code scans) sailed through and crashed the client render with
  // "triggeredReviewItems.some is not a function". The coercer is the single
  // boundary that guarantees an array.

  test("passes a real array through unchanged", () => {
    expect(asTriggeredReviewItems(VALID)).toEqual(VALID);
  });

  test("returns [] for null (normal empty — no review items)", () => {
    expect(asTriggeredReviewItems(null)).toEqual([]);
  });

  test("returns [] for undefined", () => {
    expect(asTriggeredReviewItems(undefined)).toEqual([]);
  });

  // The exact crash: a non-array object reached .some().
  test("returns [] for a non-array object (the crash input)", () => {
    expect(asTriggeredReviewItems({ id: "x", invariant: "MI-8" })).toEqual([]);
  });

  test("returns [] for a number / boolean", () => {
    expect(asTriggeredReviewItems(3)).toEqual([]);
    expect(asTriggeredReviewItems(true)).toEqual([]);
  });

  // Double-encoded jsonb defense: a value stored/returned as a JSON STRING
  // of an array should be parsed and used, not treated as a non-array.
  test("parses a double-encoded JSON-string array", () => {
    const encoded = JSON.stringify(VALID);
    expect(asTriggeredReviewItems(encoded)).toEqual(VALID);
  });

  test("returns [] for a JSON-string of a non-array (object literal string)", () => {
    expect(asTriggeredReviewItems('{"id":"x","invariant":"MI-8"}')).toEqual([]);
  });

  test("returns [] for an unparseable garbage string", () => {
    expect(asTriggeredReviewItems("not json at all {")).toEqual([]);
  });

  test("returns a NEW array, never the caller's reference, for the empty cases", () => {
    const a = asTriggeredReviewItems(null);
    const b = asTriggeredReviewItems(null);
    expect(a).not.toBe(b);
  });
});
