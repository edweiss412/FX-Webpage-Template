import { describe, expect, it } from "vitest";
import { parseDoc } from "../../lib/specLint/parse";
import { checkTaskContract } from "../../lib/specLint/taskContract";

/** Codes only, sorted — the shape every case asserts as a FULL list. */
const codes = (text: string): string[] =>
  checkTaskContract(parseDoc(text), "plan")
    .map((f) => f.code)
    .sort();

const OPEN = "<!-- tasks: depth=2 -->";
const END = "<!-- tasks: end -->";
const WELL = "<!-- task: red=`pnpm test` ac=AC-1 -->";
const doc = (...lines: string[]) => lines.join("\n");

describe("checkTaskContract — enrollment (design §3.2)", () => {
  it("M1/AC-7: a plan that never attempts enrollment yields zero findings, even carrying headings and a stray marker", () => {
    // AC-7's "regardless" is a fixture requirement: without the heading and the
    // stray marker, this passes against an implementation that fires on
    // unenrolled plans.
    expect(codes(doc("# Plan", "## A", "<!-- task: red=x ac=AC-1 -->", "prose"))).toEqual([]);
  });

  it("M3/AC-23: every non-conforming depth is TASK_ENROLL_MALFORMED, never a silent opt-out", () => {
    for (const bad of [
      "depth=0",
      "depth=7",
      "depth=x",
      "depth=",
      "depth=3 extra=x",
      "depth=3 depth=4",
    ]) {
      expect(codes(doc(`<!-- tasks: ${bad} -->`, "## A"))).toEqual(["TASK_ENROLL_MALFORMED"]);
    }
  });

  it("M2/AC-26/AC-30: duplicate openings report exactly [TASK_ENROLL_DUPLICATE] and skip task-level checks", () => {
    // The first region holds a MARKER-LESS task. With a well-formed task here
    // both the correct implementation and one that wrongly enrols report [],
    // and the case proves nothing.
    expect(codes(doc(OPEN, "## A", "prose, no marker", END, OPEN, "## B", END))).toEqual([
      "TASK_ENROLL_DUPLICATE",
    ]);
  });

  it("M14/AC-16: a close with no preceding open is malformed, not a silent no-op", () => {
    expect(codes(doc(END, "## A"))).toEqual(["TASK_ENROLL_MALFORMED"]);
  });

  it("M37: a surplus close after a completed region is malformed", () => {
    expect(codes(doc(OPEN, "## A", WELL, "AC-1 here.", END, END))).toEqual([
      "TASK_ENROLL_MALFORMED",
    ]);
  });

  it("M27/AC-30: a rejected duplicate's close is consumed silently — one authoring error, one finding", () => {
    expect(codes(doc(OPEN, "## A", WELL, "AC-1 here.", END, OPEN, END))).toEqual([
      "TASK_ENROLL_DUPLICATE",
    ]);
  });

  it("M16/AC-22: an enrolled region selecting zero tasks is TASK_ENROLL_EMPTY, by wrong depth and by placement", () => {
    expect(codes(doc(OPEN, "### deeper only", END))).toEqual(["TASK_ENROLL_EMPTY"]);
    expect(codes(doc("## A", "## B", OPEN, END))).toEqual(["TASK_ENROLL_EMPTY"]);
  });

  it("M4/AC-9: a fenced enrollment line is inert — the depth-2 heading below it is not a task", () => {
    // The heading carries no marker, so a fence-blind implementation enrols and
    // reports TASK_MARKER_MISSING against an expected empty list.
    expect(codes(doc("```", OPEN, "```", "## A", "prose"))).toEqual([]);
  });

  it("M36/AC-39: 1-3 spaces of indentation are recognised, 4 are not", () => {
    expect(codes(doc("   " + OPEN, "## A", "   " + WELL, "AC-1 here.", "   " + END))).toEqual([]);
    // Four spaces is an indented code block: inert, so the marker-less heading
    // draws nothing. An over-permissive grammar enrols and reports MISSING.
    expect(codes(doc("    " + OPEN, "## A", "prose"))).toEqual([]);
  });

  it("M40/AC-43: end of document closes an unclosed region and its tasks are still checked", () => {
    // Marker-less final task: correct reports MISSING, an implementation that
    // drops the unterminated region reports [].
    expect(codes(doc(OPEN, "## A", "prose, no marker"))).toEqual(["TASK_MARKER_MISSING"]);
  });

  it("M29/AC-32/AC-45: a failed enrollment keeps its line-pass finding and discards recorded markers unjudged", () => {
    const BAD = "<!-- task: red=x ac=AC-1 -->";
    expect(codes(doc("<!-- tasks: depth=x -->", "## A", BAD))).toEqual(["TASK_ENROLL_MALFORMED"]);
    expect(codes(doc(END, "## A", BAD))).toEqual(["TASK_ENROLL_MALFORMED"]);
    expect(codes(doc(OPEN, "## A", BAD, END, OPEN, END))).toEqual(["TASK_ENROLL_DUPLICATE"]);
  });
});

describe("checkTaskContract — segmentation (design §3.3)", () => {
  it("M5/AC-6: a task with no marker in its extent reports TASK_MARKER_MISSING at the heading line", () => {
    const f = checkTaskContract(parseDoc(doc(OPEN, "## A", "prose", END)), "plan");
    expect(f).toEqual([
      expect.objectContaining({
        check: "taskContract",
        code: "TASK_MARKER_MISSING",
        severity: "fail",
        docLine: 2,
      }),
    ]);
  });

  it("M13/AC-15: depth-N headings outside the region are not tasks, leading and trailing", () => {
    // Neither out-of-region heading carries a marker, so an implementation
    // treating them as tasks reports MISSING for each.
    expect(codes(doc("## Before", OPEN, "## A", WELL, "AC-1 here.", END, "## After"))).toEqual([]);
  });

  it("M10/AC-12: a deeper heading is not a task, and its content still belongs to the enclosing task", () => {
    expect(codes(doc(OPEN, "## A", "### RED", WELL, "AC-1 here.", END))).toEqual([]);
  });

  it("M15/AC-17: a shallower heading ends the extent — marker placed AFTER it is orphaned", () => {
    // Marker BEFORE the shallower heading cannot discriminate: correct and a
    // boundary-blind mutant both report [].
    expect(codes(doc(OPEN, "## A", "# Shallower", WELL, "AC-1 here.", END))).toEqual([
      "TASK_MARKER_MISSING",
      "TASK_MARKER_ORPHANED",
    ]);
  });

  it("M25/AC-28: a marker after the close is orphaned and its task still reports MISSING", () => {
    expect(codes(doc(OPEN, "## A", "prose", END, WELL, "AC-1 here."))).toEqual([
      "TASK_MARKER_MISSING",
      "TASK_MARKER_ORPHANED",
    ]);
  });

  it("M7/M30/AC-33/AC-46: an orphan reports TASK_MARKER_ORPHANED alone, whatever its form", () => {
    const forms = [
      "<!-- task: red=x ac=AC-1 -->", // malformed
      "<!-- task: red=`` ac=AC-1 -->", // empty red
      "<!-- task: red=`x` -->", // missing ac
      "<!-- task: red=`x` ac=AC-99 -->", // unresolved ac
      "<!-- task: red=`x` ac=AC-1 -->", // well-formed
    ];
    for (const m of forms) {
      expect(codes(doc(OPEN, m, "## A", WELL, "AC-1 here.", END))).toEqual([
        "TASK_MARKER_ORPHANED",
      ]);
    }
  });

  it("M6: two markers in one extent report TASK_MARKER_DUPLICATE", () => {
    expect(codes(doc(OPEN, "## A", WELL, WELL, "AC-1 here.", END))).toEqual([
      "TASK_MARKER_DUPLICATE",
    ]);
  });

  it("AC-10: taskContract never fires for kind === 'spec', on byte-identical text", () => {
    const text = doc(OPEN, "## A", "prose", END);
    expect(checkTaskContract(parseDoc(text), "plan").length).toBeGreaterThan(0);
    expect(checkTaskContract(parseDoc(text), "spec")).toEqual([]);
  });
});
