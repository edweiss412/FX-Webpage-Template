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
import { splitRow, clean, normalizeDate, inferShowYear } from "@/lib/parser/blocks/_helpers";

import { CORPUS_TEMP_PREFIX } from "../../helpers/corpusTemp";

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
  for (const f of readdirSync(dir).filter(
    (n) => n.endsWith(".md") && !n.startsWith(CORPUS_TEMP_PREFIX),
  )) {
    it(`${f}: every table row has a trailing pipe`, () => {
      const lines = readFileSync(`${dir}/${f}`, "utf8").split("\n");
      const unbalanced = lines
        .map((l, i) => ({ line: l.trim(), n: i + 1 }))
        .filter(({ line }) => line.startsWith("|") && !line.endsWith("|"));
      expect(unbalanced).toEqual([]);
    });
  }
});

describe("clean() — zero-width strip", () => {
  it("removes ZWSP / ZWNJ / ZWJ / BOM", () => {
    expect(clean("a\u200Bb\u200Cc\u200Dd\uFEFFe")).toBe("abcde");
  });
  it("a value that is entirely zero-width becomes empty", () => {
    expect(clean("\u200B\uFEFF")).toBe("");
  });
  it("still unescapes backslashes and does NOT touch smart-quotes", () => {
    expect(clean("\\-Load")).toBe("-Load");
    expect(clean("the \u201Cgreen\u201D room")).toBe("the \u201Cgreen\u201D room"); // quotes preserved
  });
});

describe("normalizeDate widened shapes (rec-6d)", () => {
  it.each([
    ["2026-07-04", "2026-07-04"], // ISO
    ["June 24, 2026", "2026-06-24"], // long-form full month
    ["24 Jun 2026", "2026-06-24"], // day-first 3-letter month
    ["6-24-2026", "2026-06-24"], // cell-only dash, 4-digit year
    ["7/4/2026", "2026-07-04"], // existing slash still works
    ["Wed 7/4/26", "2026-07-04"], // existing dow + 2-digit still works
  ])("accepts %s -> %s", (raw, iso) => {
    expect(normalizeDate(raw)).toBe(iso);
  });

  it.each([
    ["6-24", null], // dash, no year
    ["6-24-26", null], // dash, 2-digit year (ambiguous) rejected
    ["June 24, 26", null], // long-form 2-digit year rejected
    ["2026-02-30", null], // calendar-invalid ISO
    ["Feb 30 2026", null], // calendar-invalid long-form
    ["1999-01-01", null], // ISO year < 2000 bound (spec §A)
    ["2100-01-01", null], // ISO year > 2099 bound (spec §A)
    ["January 1, 2100", null], // long-form year > 2099 bound
    ["10:30", null], // time
    ["2026", null], // bare year
  ])("rejects %s", (raw) => {
    expect(normalizeDate(raw)).toBeNull();
  });
});

describe("inferShowYear slash-first fallback (rec-6d)", () => {
  it("infers from ISO when NO slash date exists", () => {
    expect(inferShowYear("Header\n2027-03-01 setup\nmore")).toBe("2027");
  });
  it("infers from long-form when NO slash date exists", () => {
    expect(inferShowYear("Show March 1, 2027 onward")).toBe("2027");
  });
  it("mixed sheet: an ISO date BEFORE the first slash still yields the SLASH year", () => {
    // ISO 2027 appears first in document order; slash date is 2025.
    // Slash-first fallback MUST return 2025 (no regression to a combined alternation).
    expect(inferShowYear("plan 2027-01-01 ... actual 3/15/2025 ...")).toBe("2025");
  });
  it("no-slash sheet: earliest date in DOCUMENT ORDER wins across ISO/long-form", () => {
    // long-form 2028 appears BEFORE ISO 2029 — must return 2028, not ISO-priority 2029.
    expect(inferShowYear("kickoff March 1, 2028 then rev 2029-06-01")).toBe("2028");
  });
  it("does NOT match an embedded ISO inside a longer digit run", () => {
    // 12026-07-04 must NOT yield 2026 (self-delimiting \b guard).
    expect(inferShowYear("code 12026-07-04 only")).toBeNull();
  });
  it("an INVALID slash token suppresses the ISO fallback (behavior-preserving)", () => {
    // A slash token EXISTS (13/45/2026) though calendar-invalid; old behavior returned
    // null and never scanned further — the ISO 2027 must NOT be picked up.
    expect(inferShowYear("bad 13/45/2026 then 2027-01-01")).toBeNull();
  });
  it("returns null when no date at all", () => {
    expect(inferShowYear("no dates here")).toBeNull();
  });
});
