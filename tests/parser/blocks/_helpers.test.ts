/**
 * Tests for shared block helpers (lib/parser/blocks/_helpers.ts).
 *
 * splitRow trailing-pipe pin: splitRow (_helpers.ts:39-42) slices
 * parts[1..length-2] after split("|"). For a well-formed row "|A|B|" the
 * leading/trailing empty strings are dropped, yielding ["A","B"]. For a row
 * MISSING the trailing pipe ("| A | B"), the final real cell occupies
 * parts[length-1] and is sliced away — the last cell is silently truncated.
 *
 * Corpus audit (2026-06-12, all 10 fixtures under fixtures/shows/raw/):
 * ZERO lines whose trimmed form starts with "|" lack a trailing "|" — the
 * Google Sheets → markdown export always emits balanced pipe rows, so no
 * real caller hits the truncation path. Behavior is therefore PINNED, not
 * fixed; the corpus sweep below turns that audit into a standing guard so a
 * future fixture that violates the assumption fails loudly here instead of
 * silently dropping its last column.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { splitRow } from "@/lib/parser/blocks/_helpers";

describe("splitRow — well-formed rows", () => {
  it("splits '| A | B |' into ['A', 'B'] (trimmed, outer empties dropped)", () => {
    expect(splitRow("| A | B |")).toEqual(["A", "B"]);
  });

  it("preserves interior empty cells: '| A |  | C |' → ['A', '', 'C']", () => {
    expect(splitRow("| A |  | C |")).toEqual(["A", "", "C"]);
  });
});

describe("splitRow — missing trailing pipe (edge-case pin)", () => {
  it("'| A | B' truncates the LAST cell — returns ['A'], not ['A', 'B']", () => {
    // Pinned current behavior: split("|") → ['', ' A ', ' B'];
    // slice(1, parts.length - 1) drops ' B' along with the (absent)
    // trailing-empty segment. The final cell is lost.
    expect(splitRow("| A | B")).toEqual(["A"]);
  });

  it("single-cell row without trailing pipe loses its only cell: '| A' → []", () => {
    expect(splitRow("| A")).toEqual([]);
  });
});

describe("splitRow truncation path is unreachable on the real corpus (standing audit)", () => {
  // Every parser call site gates on trimmed.startsWith("|") before calling
  // splitRow (e.g. pull-sheet.ts:43-48, ops.ts:63, contacts.ts:83). This sweep
  // applies the same trimmed-line predicate to every fixture and asserts the
  // row also ENDS with "|" — i.e., no real input can reach the truncation
  // behavior pinned above. If this ever fails, fix splitRow (or the exporter)
  // rather than relaxing this assertion.
  const dir = "fixtures/shows/raw";
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".md"))) {
    it(`${f}: every table row has a trailing pipe`, () => {
      const lines = readFileSync(`${dir}/${f}`, "utf8").split("\n");
      const unbalanced = lines
        .map((l, i) => ({ line: l.trim(), n: i + 1 }))
        .filter(({ line }) => line.startsWith("|") && !line.endsWith("|"));
      expect(unbalanced).toEqual([]);
    });
  }
});
