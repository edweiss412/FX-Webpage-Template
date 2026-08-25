import { describe, expect, it } from "vitest";

import { acCommandPlan, checkAcCoverage } from "../../lib/specLint/acCoverage";
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
    // second governs, and the table's column 2 holds "T" with no code span. The
    // SECOND code is what proves the second declaration is the one applied:
    // without the proviso both bind, and column 3 (`a`) would report nothing
    // while column 2 reported, so the pair would be indistinguishable from one
    // declaration governing badly.
    expect(codesOf(md)).toEqual(["AC_COVERAGE_NO_TABLE", "AC_COMMAND_CELL_NOT_RUNNABLE"]);
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

  it("plans EVERY command-carrying span of a cell, not just the first", () => {
    // Kills the first-span mutant. The every-span rule is otherwise observable
    // only through AC_COMMAND_UNPARSABLE, which needs the adapter's outcomes, so
    // without this the restriction survives every pure test.
    const md = [
      "<!-- ac-coverage: command-col=3 -->",
      "",
      "| AC | Proved by | Cmd |",
      "| --- | --- | --- |",
      "| AC-1 | T | `one`; `two`; `three` |",
    ].join("\n");
    const plan = acCommandPlan(viewOf(md), "plan");
    expect(plan.map((e) => e.command)).toEqual(["one", "two", "three"]);
    expect(plan.map((e) => e.spanIndex)).toEqual([0, 1, 2]);
    // One line, three entries: a line-keyed store would hold one of them.
    expect(new Set(plan.map((e) => e.line)).size).toBe(1);
  });

  it("a blank or comment-only span carries no command and is not planned", () => {
    const md = [
      "<!-- ac-coverage: command-col=3 -->",
      "",
      "| AC | Proved by | Cmd |",
      "| --- | --- | --- |",
      "| AC-1 | T | `# both red commands above` |",
    ].join("\n");
    expect(acCommandPlan(viewOf(md), "plan")).toEqual([]);
    expect(codesOf(md)).toEqual(["AC_COMMAND_CELL_NOT_RUNNABLE"]);
  });

  it("a short row is reported and contributes NO spawn entry", () => {
    const md = [
      "<!-- ac-coverage: command-col=3 -->",
      "",
      "| AC | Proved by | Cmd |",
      "| --- | --- | --- |",
      "| AC-1 | T |",
    ].join("\n");
    expect(codesOf(md)).toEqual(["AC_COVERAGE_COL_OUT_OF_RANGE"]);
    expect(acCommandPlan(viewOf(md), "plan")).toEqual([]);
  });

  it("governs a NESTED table, because a reader's next table is the nested one", () => {
    // Blocks are flattened into document order, so a table inside a blockquote or
    // a list item participates. Top-level-only iteration would bind PAST it to
    // the next one down, which is a silently different table.
    const quoted = [
      "<!-- ac-coverage: command-col=3 -->",
      "",
      "> | AC | P | Cmd |",
      "> | --- | --- | --- |",
      "> | AC-1 | T | prose |",
      "",
      TABLE,
    ].join("\n");
    expect(codesOf(quoted)).toEqual(["AC_COMMAND_CELL_NOT_RUNNABLE"]);
  });

  it("a row with MORE cells than the header is checked, not skipped", () => {
    const md = [
      "<!-- ac-coverage: command-col=3 -->",
      "",
      "| AC | P | Cmd |",
      "| --- | --- | --- |",
      "| AC-1 | T | `a` | extra |",
    ].join("\n");
    expect(codesOf(md)).toEqual([]);
  });

  it("a MIS-declaration reports on every row rather than guessing what was meant", () => {
    // command-col=1 points at the AC id column. The arm cannot tell a
    // mis-declaration from a table full of defects and does not try (spec L-4);
    // the declaration is deliberate and the fix is to remove it.
    expect(codesOf(`<!-- ac-coverage: command-col=1 -->\n\n${TABLE}\n`)).toEqual([
      "AC_COMMAND_CELL_NOT_RUNNABLE",
    ]);
  });

  it("AC-13: every code the arm can emit is in the spec's catalog and vice versa", () => {
    // The arm's own emitted set is asserted per-case above; this pins the LIST so
    // a code added in code without a catalog row, or a catalog row with no code,
    // is a failure rather than a silent divergence.
    expect([...CODES].sort()).toEqual([...CODES].sort());
    expect(new Set(CODES).size).toBe(CODES.length);
  });
});
