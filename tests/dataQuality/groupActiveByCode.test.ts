import { describe, expect, it } from "vitest";
import { groupActiveByCode } from "@/lib/dataQuality/groupActiveByCode";
import type { ParseWarning } from "@/lib/parser/types";

// Minimal ParseWarning factory — only fields groupActiveByCode reads (code) matter;
// the rest satisfy the type. rawSnippet distinguishes items within a code.
const w = (code: string, rawSnippet: string): ParseWarning =>
  ({ code, message: code, severity: "warn", rawSnippet }) as unknown as ParseWarning;

describe("groupActiveByCode", () => {
  it("returns [] for empty input", () => {
    expect(groupActiveByCode([])).toEqual([]);
  });

  it("groups by code in first-appearance order across digest + actionable codes", () => {
    // Mixed set: a digest code (UNKNOWN_SECTION_HEADER), a non-ignorable digest code
    // (BLOCK_DISAPPEARED), an operator-actionable code (UNKNOWN_FIELD), and a second
    // digest code beyond the two historical examples (SECTION_HEADER_NO_FIELDS) —
    // proves the helper is code-set-agnostic (spec §2; Codex spec R1 finding 2).
    const input = [
      w("UNKNOWN_SECTION_HEADER", "Rigging"),
      w("UNKNOWN_FIELD", "Storage | dock"),
      w("UNKNOWN_SECTION_HEADER", "Catering"), // interleaved same-code → collapses UP into its group
      w("BLOCK_DISAPPEARED", "Hotels"),
      w("SECTION_HEADER_NO_FIELDS", "Notes"),
      w("UNKNOWN_FIELD", "Floor Plan | link"),
    ];
    const groups = groupActiveByCode(input);
    expect(groups.map((g) => g.code)).toEqual([
      "UNKNOWN_SECTION_HEADER",
      "UNKNOWN_FIELD",
      "BLOCK_DISAPPEARED",
      "SECTION_HEADER_NO_FIELDS",
    ]);
    // interleaved same-code warnings collapse into one group, intra-group order preserved
    expect(groups[0]!.items.map((i) => i.rawSnippet)).toEqual(["Rigging", "Catering"]);
    expect(groups[1]!.items.map((i) => i.rawSnippet)).toEqual([
      "Storage | dock",
      "Floor Plan | link",
    ]);
    // singleton codes get their own single-item group
    expect(groups[2]!.items).toHaveLength(1);
    expect(groups[3]!.items).toHaveLength(1);
  });
});
