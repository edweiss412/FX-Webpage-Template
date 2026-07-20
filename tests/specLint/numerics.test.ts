import { describe, expect, it } from "vitest";
import { checkCitations } from "../../lib/specLint/citations";
import { checkNumerics } from "../../lib/specLint/numerics";
import { parseDoc, splitLines } from "../../lib/specLint/parse";
import type { FileResolver } from "../../lib/specLint/types";

const emptyResolver: FileResolver = {
  listTrackedFiles: () => ["lib/x.ts"],
  readFileLines: () => splitLines("a\nb\nc\nd\ne\nf\ng\nh\ni\nj\nk\nl\n"),
};

function run(docText: string) {
  const model = parseDoc(docText);
  const { candidateSpans } = checkCitations(model, emptyResolver);
  return { model, ...checkNumerics(model, candidateSpans) };
}

/** The spec §7 snippet formula, applied to the fixture's own line (anti-tautology: derived, not hardcoded). */
function expectedSnippet(line: string, column: number): string {
  return line.slice(Math.max(0, column - 41), column + 40);
}

describe("checkNumerics — lexicon exclusions (spec §5)", () => {
  it.each([
    ["ISO date", "released 2026-07-19 today\n"],
    ["version with v", "using v1.2.3 now\n"],
    ["bare version", "using 1.2.3 now\n"],
    ["clock time", "at 12:30 sharp\n"],
    ["hex literal", "mask 0xFF applied\n"],
  ])("%s excluded from inventory", (_label, doc) => {
    expect(run(doc).inventory).toEqual([]);
  });

  it("number inside a citation-candidate span excluded", () => {
    const { inventory } = run("see `lib/x.ts:12` here\n");
    expect(inventory).toEqual([]);
  });

  it("fenced lines not scanned", () => {
    const { inventory } = run(["```", "45 codes", "```"].join("\n"));
    expect(inventory).toEqual([]);
  });
});

describe("checkNumerics — noun-anchored mismatch (spec §5)", () => {
  it("distinct raws for one noun → ONE advisory at first occurrence, all occurrences in detail", () => {
    const { findings } = run("there are 45 codes\nbut later 44 codes\n");
    expect(findings).toEqual([
      expect.objectContaining({
        check: "numerics",
        code: "NUMERIC_NOUN_MISMATCH",
        severity: "advisory",
        docLine: 1,
        column: 11,
      }),
    ]);
    expect(findings[0]!.detail).toContain('doc line 1: "45 codes"');
    expect(findings[0]!.detail).toContain('doc line 2: "44 codes"');
  });

  it("same number twice → no mismatch", () => {
    expect(run("3 rounds first\n3 rounds again\n").findings).toEqual([]);
  });

  it("singular/plural normalize to the same noun", () => {
    const { findings } = run("1 code here\n44 codes there\n");
    expect(findings.map((f) => f.code)).toEqual(["NUMERIC_NOUN_MISMATCH"]);
  });

  it("advisories only — never fail severity", () => {
    const { findings } = run("2 things\n3 things\n");
    expect(findings.every((f) => f.severity === "advisory")).toBe(true);
  });
});

describe("checkNumerics — inventory (spec §5/§7)", () => {
  it("groups by RAW text; 1 vs 1.0 distinct; ordered by Number(raw) then raw", () => {
    const { inventory } = run("1.0 units and 1 unit and 2 units\n");
    expect(inventory.map((g) => g.raw)).toEqual(["1", "1.0", "2"]);
  });

  it("occurrences within a group ordered by (docLine, column)", () => {
    const { inventory } = run("7 alpha then 7 beta\nand 7 gamma\n");
    expect(inventory).toHaveLength(1);
    const occ = inventory[0]!.occurrences;
    expect(occ.map((o) => [o.docLine, o.column])).toEqual([
      [1, 1],
      [1, 14],
      [2, 5],
    ]);
  });

  it("snippet at line start, middle, and end — derived from fixture line", () => {
    const long = "x".repeat(60) + " 42 " + "y".repeat(60);
    const { inventory } = run(["5 start", long, "tail ends with 9"].join("\n") + "\n");
    const flat = inventory.flatMap((g) => g.occurrences);
    for (const o of flat) {
      const line = [["5 start"], [long], ["tail ends with 9"]][o.docLine - 1]![0]!;
      expect(o.snippet).toBe(expectedSnippet(line, o.column));
    }
  });

  it("astral: column and snippet slice in UTF-16 units", () => {
    const line = "💥 42 items";
    const { inventory } = run(line + "\n");
    expect(inventory).toHaveLength(1);
    const occ = inventory[0]!.occurrences[0]!;
    expect(occ.column).toBe(4); // emoji = 2 units, space = 1
    expect(occ.snippet).toBe(expectedSnippet(line, 4));
  });

  it("inventory is NOT findings", () => {
    const { findings, inventory } = run("42 wonders\n");
    expect(inventory).toHaveLength(1);
    expect(findings).toEqual([]);
  });
});
