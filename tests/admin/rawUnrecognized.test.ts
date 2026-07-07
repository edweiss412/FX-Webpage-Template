/**
 * tests/admin/rawUnrecognized.test.ts (spec 2026-07-07 §C.3/§C.4)
 *
 * Fail-closed sanitize + group + 50-cap of the persisted `raw_unrecognized`
 * jsonb. Every expectation is derived from the crafted fixture, never a
 * hardcoded total the fixture can't reach.
 */
import { describe, expect, test } from "vitest";
import {
  sanitizeRawUnrecognized,
  buildRawUnrecognizedView,
  RAW_UNRECOGNIZED_CAP,
  RAW_UNRECOGNIZED_FIELD_CAP,
} from "@/lib/admin/rawUnrecognized";

describe("sanitizeRawUnrecognized (fail-closed)", () => {
  test("coalesces non-array/null/undefined to []", () => {
    expect(sanitizeRawUnrecognized(null)).toEqual([]);
    expect(sanitizeRawUnrecognized(undefined)).toEqual([]);
    expect(sanitizeRawUnrecognized("nope")).toEqual([]);
    expect(sanitizeRawUnrecognized({})).toEqual([]);
    expect(sanitizeRawUnrecognized(42)).toEqual([]);
  });

  test("drops null/array/primitive/empty-key/non-string-key entries, no coercion", () => {
    const raw = [
      null,
      [1, 2],
      42,
      "str",
      { block: "hotels", key: "", value: "x" }, // empty key → drop
      { block: "hotels", key: "   ", value: "x" }, // whitespace key → drop
      { block: "hotels", key: 5, value: "x" }, // non-string key → drop
      { block: "hotels", key: "Room Block", value: "Hilton" }, // keep
    ];
    expect(sanitizeRawUnrecognized(raw)).toEqual([
      { block: "hotels", key: "Room Block", value: "Hilton" },
    ]);
  });

  test("falls back block→Other and value→'' for missing/non-string, never coerced noise", () => {
    const raw = [
      { block: "", key: "K1", value: "V1" },
      { block: 9, key: "K2", value: "V2" },
      { block: null, key: "K3", value: null },
      { key: "K4" },
      { block: "hotels", key: "K5", value: { a: 1 } },
    ];
    expect(sanitizeRawUnrecognized(raw)).toEqual([
      { block: "Other", key: "K1", value: "V1" },
      { block: "Other", key: "K2", value: "V2" },
      { block: "Other", key: "K3", value: "" },
      { block: "Other", key: "K4", value: "" },
      { block: "hotels", key: "K5", value: "" },
    ]);
  });
});

describe("buildRawUnrecognizedView (group + cap + order)", () => {
  test("groups by first-appearance in emission order, stable rows", () => {
    const raw = [
      { block: "hotels", key: "a", value: "1" },
      { block: "event", key: "b", value: "2" },
      { block: "hotels", key: "c", value: "3" },
    ];
    const v = buildRawUnrecognizedView(raw);
    expect(v.total).toBe(3);
    expect(v.groups.map((g) => g.block)).toEqual(["hotels", "event"]);
    expect(v.groups[0]!.rows).toEqual([
      { key: "a", value: "1" },
      { key: "c", value: "3" },
    ]);
    expect(v.groups[1]!.rows).toEqual([{ key: "b", value: "2" }]);
    expect(v.hiddenCount).toBe(0);
  });

  test("caps shown rows at 50 while total reflects the true sanitized count", () => {
    const raw = Array.from({ length: 60 }, (_, i) => ({
      block: "b",
      key: `k${i}`,
      value: `v${i}`,
    }));
    const v = buildRawUnrecognizedView(raw);
    expect(v.total).toBe(60);
    const shown = v.groups.reduce((n, g) => n + g.rows.length, 0);
    expect(shown).toBe(RAW_UNRECOGNIZED_CAP);
    expect(v.hiddenCount).toBe(10);
    expect(v.groups[0]!.rows[0]!.key).toBe("k0"); // first-50 in emission order
    expect(v.groups[0]!.rows.at(-1)?.key).toBe("k49");
  });

  test("total 0 when everything is dropped", () => {
    expect(buildRawUnrecognizedView([null, { key: "" }])).toEqual({
      total: 0,
      groups: [],
      hiddenCount: 0,
    });
  });
});

describe("cleanField hardening (untrusted sheet content)", () => {
  test("removes zero-width and bidi-override characters", () => {
    const zeroWidth = "LOD\u200Bomsg\u200DGING"; // zero-width space + joiner
    const bidi = "\u202Eabc\u202C"; // RLO + PDF
    const out = sanitizeRawUnrecognized([{ block: "b", key: zeroWidth, value: bidi }]);
    expect(out[0]!.key).toBe("LODomsgGING");
    expect(out[0]!.value).toBe("abc");
  });

  test("control characters become a space (word boundaries kept), then collapse", () => {
    const out = sanitizeRawUnrecognized([{ block: "b", key: "A\x07B\tC", value: "x" }]);
    expect(out[0]!.key).toBe("A B C");
  });

  test("caps each field at RAW_UNRECOGNIZED_FIELD_CAP with an ellipsis", () => {
    const huge = "z".repeat(RAW_UNRECOGNIZED_FIELD_CAP + 500);
    const out = sanitizeRawUnrecognized([{ block: "b", key: "K", value: huge }]);
    expect(out[0]!.value.length).toBe(RAW_UNRECOGNIZED_FIELD_CAP + 1); // + the "…"
    expect(out[0]!.value.endsWith("…")).toBe(true);
    expect(out[0]!.value.startsWith("z")).toBe(true);
  });

  test("a key that is only invisible/control chars is dropped (unshowable)", () => {
    expect(sanitizeRawUnrecognized([{ block: "b", key: "\u200B\u200C", value: "x" }])).toEqual([]);
  });
});
