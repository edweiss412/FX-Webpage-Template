import { describe, expect, it } from "vitest";
import { groupIgnorableByCode } from "@/lib/dataQuality/bulkIgnoreGroups";
import type { ParseWarning } from "@/lib/parser/types";

const w = (code: string, rawSnippet?: string): ParseWarning => ({
  severity: "warn",
  code,
  message: "m",
  ...(rawSnippet !== undefined ? { rawSnippet } : {}),
});

// Failure mode this guards: a bulk "Ignore all N of this type" that either
// (a) inserts a coarse code-level row (masking future distinct rows), or
// (b) double-counts identical-content cards that share ONE fingerprint, or
// (c) offers a bulk action for a single warning (no clicks saved).
describe("groupIgnorableByCode", () => {
  it("groups >=2 distinct-content ignorable warnings of the same code", () => {
    const groups = groupIgnorableByCode([
      w("UNKNOWN_FIELD", "Storage | dock"),
      w("UNKNOWN_FIELD", "Floor Plan | link"),
      w("UNKNOWN_FIELD", "Podium | acrylic"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.code).toBe("UNKNOWN_FIELD");
    expect(groups[0]!.items).toEqual([
      { code: "UNKNOWN_FIELD", rawSnippet: "Storage | dock" },
      { code: "UNKNOWN_FIELD", rawSnippet: "Floor Plan | link" },
      { code: "UNKNOWN_FIELD", rawSnippet: "Podium | acrylic" },
    ]);
  });

  it("dedups identical content within a code (identical rows share one fingerprint) → below threshold", () => {
    const groups = groupIgnorableByCode([
      w("UNKNOWN_FIELD", "Storage | dock"),
      w("UNKNOWN_FIELD", "  Storage |   dock "), // normalizes to the same content key
    ]);
    expect(groups).toHaveLength(0);
  });

  it("excludes warnings without a rawSnippet (not fingerprintable, e.g. BLOCK_DISAPPEARED)", () => {
    const groups = groupIgnorableByCode([
      w("BLOCK_DISAPPEARED", undefined),
      w("BLOCK_DISAPPEARED", undefined),
    ]);
    expect(groups).toHaveLength(0);
  });

  it("excludes a lone ignorable warning (needs >=2 distinct to save clicks)", () => {
    expect(groupIgnorableByCode([w("UNKNOWN_FIELD", "Storage | dock")])).toHaveLength(0);
  });

  it("one group per code when several codes each have >=2 distinct contents", () => {
    const groups = groupIgnorableByCode([
      w("UNKNOWN_FIELD", "Storage | dock"),
      w("UNKNOWN_FIELD", "Floor Plan | link"),
      w("UNKNOWN_SECTION_HEADER", "Craft Services"),
      w("UNKNOWN_SECTION_HEADER", "Green Room"),
    ]);
    expect(groups.map((g) => g.code).sort()).toEqual(["UNKNOWN_FIELD", "UNKNOWN_SECTION_HEADER"]);
    for (const g of groups) expect(g.items).toHaveLength(2);
  });
});
