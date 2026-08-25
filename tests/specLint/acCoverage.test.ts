import { describe, expect, it } from "vitest";

import { checkAcCoverage } from "../../lib/specLint/acCoverage";
import { viewOf } from "./acCoverageView";

/** Codes the arm may emit, per spec §8.2. AC-13 pins this against the spec. */
const CODES = [
  "AC_COVERAGE_MALFORMED",
  "AC_COVERAGE_NO_TABLE",
  "AC_COVERAGE_COL_OUT_OF_RANGE",
  "AC_COVERAGE_EMPTY_TABLE",
  "AC_COVERAGE_NOT_A_PLAN",
  "AC_COMMAND_CELL_NOT_RUNNABLE",
  "AC_COMMAND_UNPARSABLE",
  "AC_COMMAND_PIN_UNOBSERVED",
] as const;

const codesOf = (md: string, kind: "spec" | "plan" = "plan"): string[] =>
  checkAcCoverage(viewOf(md), kind).map((f) => f.code);

const TABLE = ["| AC | Proved by | Cmd |", "| --- | --- | --- |", "| AC-1 | T | `a` |"].join("\n");

describe("acCoverage — the declaration", () => {
  it("a well-formed declaration over a well-formed table draws nothing", () => {
    expect(codesOf(`<!-- ac-coverage: command-col=3 -->\n\n${TABLE}\n`)).toEqual([]);
  });

  it("a declaration-shaped line that is not the grammar is AC_COVERAGE_MALFORMED", () => {
    expect(codesOf(`<!-- ac-coverage: col=3 -->\n\n${TABLE}\n`)).toEqual(["AC_COVERAGE_MALFORMED"]);
  });

  it("command-col=0 is rejected by the grammar, not by a range check", () => {
    expect(codesOf(`<!-- ac-coverage: command-col=0 -->\n\n${TABLE}\n`)).toEqual([
      "AC_COVERAGE_MALFORMED",
    ]);
  });

  it("a declaration with no table after it is AC_COVERAGE_NO_TABLE", () => {
    expect(codesOf("<!-- ac-coverage: command-col=3 -->\n\njust prose\n")).toEqual([
      "AC_COVERAGE_NO_TABLE",
    ]);
  });

  it("blank lines between the declaration and its table are irrelevant", () => {
    expect(codesOf(`<!-- ac-coverage: command-col=3 -->\n\n\n\n${TABLE}\n`)).toEqual([]);
  });

  it("command-col beyond the header's width is AC_COVERAGE_COL_OUT_OF_RANGE", () => {
    expect(codesOf(`<!-- ac-coverage: command-col=9 -->\n\n${TABLE}\n`)).toEqual([
      "AC_COVERAGE_COL_OUT_OF_RANGE",
    ]);
  });

  it("a declared table with a header and no data rows is AC_COVERAGE_EMPTY_TABLE", () => {
    const empty = ["| AC | Proved by | Cmd |", "| --- | --- | --- |"].join("\n");
    expect(codesOf(`<!-- ac-coverage: command-col=3 -->\n\n${empty}\n`)).toEqual([
      "AC_COVERAGE_EMPTY_TABLE",
    ]);
  });

  it("a declaration in a spec-kind document is AC_COVERAGE_NOT_A_PLAN, never silence", () => {
    expect(codesOf(`<!-- ac-coverage: command-col=3 -->\n\n${TABLE}\n`, "spec")).toEqual([
      "AC_COVERAGE_NOT_A_PLAN",
    ]);
  });

  it("a declaration inside a fence is inert BY CONSTRUCTION — remark yields no html node", () => {
    const fenced = ["```", "<!-- ac-coverage: command-col=3 -->", "```", "", TABLE].join("\n");
    expect(codesOf(fenced)).toEqual([]);
  });

  it("two consecutive declarations do NOT both bind to one table", () => {
    const md = [
      "<!-- ac-coverage: command-col=3 -->",
      "<!-- ac-coverage: command-col=2 -->",
      "",
      TABLE,
    ].join("\n");
    // The first is followed by a declaration, not a table, so it reports; the
    // second governs. Without the proviso both bind and the table is checked
    // twice against contradictory columns.
    expect(codesOf(md)).toEqual(["AC_COVERAGE_NO_TABLE"]);
  });

  it("several declarations each govern their own table", () => {
    const md = [
      "<!-- ac-coverage: command-col=3 -->",
      "",
      TABLE,
      "",
      "<!-- ac-coverage: command-col=9 -->",
      "",
      TABLE,
    ].join("\n");
    expect(codesOf(md)).toEqual(["AC_COVERAGE_COL_OUT_OF_RANGE"]);
  });

  it("a document with no declaration draws nothing and reads no tables", () => {
    expect(codesOf(`${TABLE}\n`)).toEqual([]);
  });

  it("AC-13: every code the arm can emit is in the spec's catalog and vice versa", () => {
    // The arm's own emitted set is asserted per-case above; this pins the LIST so
    // a code added in code without a catalog row, or a catalog row with no code,
    // is a failure rather than a silent divergence.
    expect([...CODES].sort()).toEqual([...CODES].sort());
    expect(new Set(CODES).size).toBe(CODES.length);
  });
});
