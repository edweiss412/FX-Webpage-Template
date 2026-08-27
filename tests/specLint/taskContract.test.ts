import { describe, expect, it } from "vitest";
import { parseDoc } from "../../lib/specLint/parse";
import { acAnalysis, checkTaskContract } from "../../lib/specLint/taskContract";

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

  it("M2/AC-2: sequential reopen enrolls both regions and both are checked", () => {
    // Was: duplicate openings -> exactly [TASK_ENROLL_DUPLICATE]. Under the
    // multi-region spec (§2.2) this is two regions; both marker-less tasks
    // report. Marker-less tasks kept deliberately: with well-formed tasks both
    // the correct implementation and one that ignores region 2 report [].
    expect(codes(doc(OPEN, "## A", "prose, no marker", END, OPEN, "## B", END))).toEqual([
      "TASK_MARKER_MISSING",
      "TASK_MARKER_MISSING",
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

  it("M27/AC-10: a reopened-then-closed empty region is EMPTY, not a consumed close", () => {
    // Was: rejected duplicate's close consumed silently. The sequential shape
    // now enrolls region 2, which holds no task. The consumed-close behavior
    // itself is re-pinned by the nested-shape cases (AC-3 and AC-10(b) below,
    // which share one fixture) and by M36d.
    expect(codes(doc(OPEN, "## A", WELL, "AC-1 here.", END, OPEN, END))).toEqual([
      "TASK_ENROLL_EMPTY",
    ]);
  });

  it("M16/AC-22: an enrolled region selecting zero tasks is TASK_ENROLL_EMPTY, by wrong depth and by placement", () => {
    expect(codes(doc(OPEN, "### deeper only", END))).toEqual(["TASK_ENROLL_EMPTY"]);
    expect(codes(doc("## A", "## B", OPEN, END))).toEqual(["TASK_ENROLL_EMPTY"]);
  });

  it("M88: an empty region still classifies its markers — EMPTY and ORPHANED are independent", () => {
    // With zero extents every marker lies outside all of them. A marker-free
    // fixture cannot see the difference, which is how the early return that
    // silently dropped markers before, inside and after the region survived.
    for (const d of [
      doc(WELL, OPEN, "### deep", END),
      doc(OPEN, WELL, "### deep", END),
      doc(OPEN, "### deep", END, WELL),
    ]) {
      expect(codes(d)).toEqual(["TASK_ENROLL_EMPTY", "TASK_MARKER_ORPHANED"]);
    }
  });

  it("AC-9/M4: a FENCED task marker is inert — it cannot resolve a real marker's ac=", () => {
    // Both CommonMark fence dialects. A documentation example must not silently
    // satisfy a citation that has no genuine occurrence in the plan.
    for (const fence of ["```", "~~~"]) {
      expect(
        codes(
          doc(
            OPEN,
            "## A",
            "<!-- task: red=`x` ac=AC-99 -->",
            fence,
            "<!-- task: red=`y` ac=AC-99 -->",
            fence,
            END,
          ),
        ),
      ).toEqual(["TASK_AC_UNRESOLVED"]);
    }
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

    // The two cases below extend this one rather than sitting apart, because
    // this test's NAME already claims them. Mutation group A: the 4-space case
    // above exercises only OPEN, so widening END's or MARKER_ANY's `{0,3}` to
    // `{0,4}` survived the whole suite. The 3-space case cannot catch it
    // either — 3 <= 4 matches under both the clean bound and the widened one.

    // A 4-space END must NOT close the region, so `## After` stays enrolled as
    // a second, marker-less task. Widening END's bound closes the region and
    // this finding disappears.
    expect(codes(doc("# P", OPEN, "## T", WELL, "    " + END, "## After", "AC-1 here."))).toEqual([
      "TASK_MARKER_MISSING",
    ]);

    // A 4-space marker is inert, so its task has no marker at all. Widening
    // MARKER_ANY's bound recognises it and this finding disappears.
    expect(codes(doc("# P", OPEN, "## T", "    " + WELL, END, "AC-1 here."))).toEqual([
      "TASK_MARKER_MISSING",
    ]);
  });

  it("M36b: an ac= id resolves when its only occurrence is on document line 1", () => {
    // Mutation group B: `resolvesId` scans from index 0. Starting at 1 skips
    // document line 1, and nothing in the suite placed an id there — though a
    // plan title is a perfectly ordinary home for one.
    expect(
      codes(doc("# Plan for AC-7", OPEN, "## T", "<!-- task: red=`x` ac=AC-7 -->", END)),
    ).toEqual([]);
  });

  it("M36c: every finding reports column 1", () => {
    // Mutation group D: nothing asserted `column`, so `column: 1` -> `2` was
    // invisible to the entire suite.
    const findings = checkTaskContract(parseDoc(doc("# P", OPEN, "## T", END)), "plan");
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((f) => f.column === 1)).toBe(true);
  });

  it("M36d: a rejected duplicate consumes exactly ONE surplus close, not every later one", () => {
    // Mutation group E. The existing M27 case uses a single surplus close, so
    // deleting `rejectedOpens--` is invisible to it: the counter is never read
    // a second time. With TWO surplus closes the missing decrement silently
    // swallows the second, which is a real authoring error going unreported.
    expect(codes(doc("# P", OPEN, "## T", WELL, OPEN, END, END, END, "AC-1 here."))).toEqual([
      "TASK_ENROLL_DUPLICATE",
      "TASK_ENROLL_MALFORMED",
    ]);
  });

  it("M40/AC-43: end of document closes an unclosed region and its tasks are still checked", () => {
    // Marker-less final task: correct reports MISSING, an implementation that
    // drops the unterminated region reports [].
    expect(codes(doc(OPEN, "## A", "prose, no marker"))).toEqual(["TASK_MARKER_MISSING"]);
  });

  it("M29/AC-32: a failed enrollment keeps its line-pass finding and discards recorded markers unjudged", () => {
    const BAD = "<!-- task: red=x ac=AC-1 -->";
    expect(codes(doc("<!-- tasks: depth=x -->", "## A", BAD))).toEqual(["TASK_ENROLL_MALFORMED"]);
    expect(codes(doc(END, "## A", BAD))).toEqual(["TASK_ENROLL_MALFORMED"]);
    // Third assertion migrated (spec §6): both regions enroll; region 1's BAD
    // marker is judged, region 2 is empty. codes() sorts alphabetically.
    expect(codes(doc(OPEN, "## A", BAD, END, OPEN, END))).toEqual([
      "TASK_ENROLL_EMPTY",
      "TASK_MARKER_MALFORMED",
    ]);
  });
});

const OPEN3 = "<!-- tasks: depth=3 -->";

describe("checkTaskContract: sequential multi-region (2026-08-09 design §2.2-§2.3)", () => {
  it("AC-1: two depths, both checked", () => {
    // (a) Shape-A: d2 region, close, d3 region, close, d2 region; all marked.
    expect(
      codes(
        doc(
          OPEN,
          "## T6",
          WELL,
          "AC-1 here.",
          END,
          "## Tasks 7-16 group header",
          OPEN3,
          "### T7",
          WELL,
          "### T8",
          WELL,
          END,
          OPEN,
          "## T17",
          WELL,
          END,
        ),
      ),
    ).toEqual([]);
    // (b) one d3 child marker-less -> exactly [TASK_MARKER_MISSING] at it.
    expect(
      codes(
        doc(
          OPEN,
          "## T6",
          WELL,
          "AC-1 here.",
          END,
          "## Tasks 7-16 group header",
          OPEN3,
          "### T7",
          WELL,
          "### T8",
          "prose, no marker",
          END,
          OPEN,
          "## T17",
          WELL,
          END,
        ),
      ),
    ).toEqual(["TASK_MARKER_MISSING"]);
  });

  it("AC-2: reopen after close is not an error, and the second region is genuinely checked", () => {
    expect(codes(doc(OPEN, "## A", WELL, "AC-1 here.", END, OPEN, "## B", WELL, END))).toEqual([]);
    expect(
      codes(doc(OPEN, "## A", WELL, "AC-1 here.", END, OPEN, "## B", "prose, no marker", END)),
    ).toEqual(["TASK_MARKER_MISSING"]);
  });

  it("AC-3: a nested open is loud, inert, and non-disqualifying", () => {
    expect(codes(doc(OPEN, "## A", WELL, "AC-1 here.", OPEN3, END, END))).toEqual([
      "TASK_ENROLL_DUPLICATE",
    ]);
    // Outer task marker-less: outer region is checked, not skipped.
    // Report order [MISSING@2, DUPLICATE@4]; codes() sorts alphabetically.
    expect(codes(doc(OPEN, "## A", "prose, no marker", OPEN3, END, END))).toEqual([
      "TASK_ENROLL_DUPLICATE",
      "TASK_MARKER_MISSING",
    ]);
  });

  it("AC-4: a marker between regions is orphaned, not assigned", () => {
    expect(
      codes(doc(OPEN, "## A", WELL, "AC-1 here.", END, WELL, OPEN, "## B", WELL, END)),
    ).toEqual(["TASK_MARKER_ORPHANED"]);
  });

  it("AC-5: per-region EMPTY independence", () => {
    expect(
      codes(doc(OPEN, "### deep only", END, OPEN, "## B", "prose, no marker", END, "AC-1 here.")),
    ).toEqual(["TASK_ENROLL_EMPTY", "TASK_MARKER_MISSING"]);
  });

  it("AC-6: EOF closes the last region in a multi-region document", () => {
    expect(
      codes(doc(OPEN, "## A", WELL, "AC-1 here.", END, OPEN, "## B", "prose, no marker")),
    ).toEqual(["TASK_MARKER_MISSING"]);
  });

  it("AC-7: same-depth split around an interloper", () => {
    expect(
      codes(
        doc(
          OPEN3,
          "### T1",
          WELL,
          "AC-1 here.",
          END,
          "### PROC interloper",
          OPEN3,
          "### T3",
          WELL,
          END,
        ),
      ),
    ).toEqual([]);
    expect(
      codes(
        doc(
          OPEN3,
          "### T1",
          WELL,
          "AC-1 here.",
          END,
          "### PROC interloper",
          OPEN3,
          "### T3",
          "prose, no marker",
          END,
        ),
      ),
    ).toEqual(["TASK_MARKER_MISSING"]);
  });

  it("AC-8: zero well-formed regions still discards; defective marker unjudged", () => {
    // The FULL-LIST form is what discriminates. An implementation that judges
    // recorded markers after failed enrollment reports
    // [TASK_ENROLL_MALFORMED, TASK_MARKER_ORPHANED] — with zero regions there
    // are no extents, so every recorded marker is orphaned — and the whole-array
    // equality catches the extra code.
    //
    // NOT because the marker is form-defective. An earlier wording here claimed
    // the empty `red=` was load-bearing and a valid marker would prove nothing;
    // probed against this implementation both forms behave identically (clean
    // [TASK_ENROLL_MALFORMED], marker-judging mutant [TASK_ENROLL_MALFORMED,
    // TASK_MARKER_ORPHANED]), because the orphan path classifies no marker and
    // resolves no ids (M56). Corrected at whole-diff R1 finding 1. The empty
    // `red=` marker stays: it is a strictly stronger input, additionally killing
    // any implementation that classifies a recorded marker WITHOUT the orphan
    // check, which is the only way TASK_RED_EMPTY could ever appear here.
    expect(
      codes(doc("<!-- tasks: depth=7 -->", "## A", "<!-- task: red=`` ac=AC-1 -->", "AC-1 here.")),
    ).toEqual(["TASK_ENROLL_MALFORMED"]);
  });

  it("AC-9: extents clip at the region close, even with a following region to leak into", () => {
    // Region 1's task is marker-less; the stray marker sits after its close.
    // A close-leaking implementation assigns it and reports []. AC-28 pattern
    // across a region boundary.
    expect(
      codes(
        doc(OPEN, "## A", "prose, no marker", END, WELL, OPEN, "## B", WELL, END, "AC-1 here."),
      ),
    ).toEqual(["TASK_MARKER_MISSING", "TASK_MARKER_ORPHANED"]);
  });

  it("AC-10: close pairing unchanged; surplus close after a completed region", () => {
    expect(codes(doc(OPEN, "## A", WELL, "AC-1 here.", END, END))).toEqual([
      "TASK_ENROLL_MALFORMED",
    ]);
    // Nested variant (= AC-3 first fixture; kept adjacent for the pairing story):
    expect(codes(doc(OPEN, "## A", WELL, "AC-1 here.", OPEN3, END, END))).toEqual([
      "TASK_ENROLL_DUPLICATE",
    ]);
  });

  it("AC-11: every region is checked; first and third region defects both report", () => {
    expect(
      codes(
        doc(
          OPEN,
          "## A",
          "prose, no marker",
          END,
          OPEN,
          "## B",
          WELL,
          "AC-1 here.",
          END,
          OPEN,
          "## C",
          "prose, no marker",
          END,
        ),
      ),
    ).toEqual(["TASK_MARKER_MISSING", "TASK_MARKER_MISSING"]);
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

/** One task, its marker under test, with `AC-1` resolvable in the prose. */
const withMarker = (marker: string, prose = "AC-1 here.") => doc(OPEN, "## A", marker, prose, END);

describe("checkTaskContract — marker grammar and codes (design §3.3)", () => {
  it("M8/M18/AC-11/AC-31: any form that is not the marker exactly is TASK_MARKER_MALFORMED", () => {
    const malformed = [
      "<!-- task: red=`x` ac=AC-1 foo=bar -->", // unknown key
      "<!-- task: ac=AC-1 red=`x` -->", // reordered
      "<!-- task: red=x ac=AC-1 -->", // unbackticked red
      "<!-- task: red=`x` ac=AC-1,,AC-2 -->", // empty list element
      "<!-- task: red=`x` ac=NOTANID -->", // id not matching the grammar
      "<!-- task: red=`a` red=`b` ac=AC-1 -->", // repeated red
      "<!-- task: red=`x` ac=AC-1 ac=AC-2 -->", // repeated ac
    ];
    for (const m of malformed) {
      expect(codes(withMarker(m))).toEqual(["TASK_MARKER_MALFORMED"]);
    }
  });

  it("M9/AC-27: an empty or whitespace-only red is TASK_RED_EMPTY — both spellings, one code", () => {
    expect(codes(withMarker("<!-- task: red=`` ac=AC-1 -->"))).toEqual(["TASK_RED_EMPTY"]);
    expect(codes(withMarker("<!-- task: red=`  ` ac=AC-1 -->"))).toEqual(["TASK_RED_EMPTY"]);
  });

  it("M8/AC-27: an absent OR EXPLICITLY EMPTY ac list is TASK_AC_MISSING", () => {
    expect(codes(withMarker("<!-- task: red=`x` -->"))).toEqual(["TASK_AC_MISSING"]);
    // The explicit-empty spelling is the same authoring slip and draws the same
    // code; testing only the omitted form leaves it unclassified.
    expect(codes(withMarker("<!-- task: red=`x` ac= -->"))).toEqual(["TASK_AC_MISSING"]);
  });

  it("M55: AC_MISSING requires an OTHERWISE well-formed marker — an empty red too is malformed", () => {
    // Precedence rule 2 names a marker that matches in every other respect. A
    // line carrying two defects at once is malformed, or the catch-all is
    // unreachable for anything overlapping.
    expect(codes(withMarker("<!-- task: red=`` -->"))).toEqual(["TASK_MARKER_MALFORMED"]);
    expect(codes(withMarker("<!-- task: red=`  ` -->"))).toEqual(["TASK_MARKER_MALFORMED"]);
  });

  it("M55: a specific code requires an OTHERWISE well-formed marker — junk makes it malformed", () => {
    // Empty red AND an unknown key: precedence rule 3 wins, not RED_EMPTY.
    expect(codes(withMarker("<!-- task: red=`` ac=AC-1 foo=x -->"))).toEqual([
      "TASK_MARKER_MALFORMED",
    ]);
    expect(codes(withMarker("<!-- task: red=`cmd` foo=x -->"))).toEqual(["TASK_MARKER_MALFORMED"]);
  });

  it("M67/AC-27: a defective marker occupies the slot — never also TASK_MARKER_MISSING", () => {
    for (const m of [
      "<!-- task: red=`` ac=AC-1 -->",
      "<!-- task: red=`x` -->",
      "<!-- task: red=x ac=AC-1 -->",
      "<!-- task: red=`x` ac=AC-99 -->",
    ]) {
      expect(codes(withMarker(m))).not.toContain("TASK_MARKER_MISSING");
    }
  });

  it("M11/AC-13: an id cited only inside markers is TASK_AC_UNRESOLVED — it cannot satisfy itself", () => {
    expect(codes(doc(OPEN, "## A", WELL, END))).toEqual(["TASK_AC_UNRESOLVED"]);
  });

  it("M19/AC-24: no prefix family resolves a shorter id", () => {
    for (const near of ["AC-10", "AC-1a", "AC-1.1", "AC-1-child"]) {
      expect(codes(withMarker(WELL, `only ${near} here`))).toEqual(["TASK_AC_UNRESOLVED"]);
    }
  });

  it("M35/AC-42: the LEFT boundary is load-bearing — a prefixed occurrence does not resolve", () => {
    for (const near of ["XAC-1", "0AC-1", ".AC-1", "MY-AC-1"]) {
      expect(codes(withMarker(WELL, `prose ${near} here`))).toEqual(["TASK_AC_UNRESOLVED"]);
    }
  });

  it("M31/AC-34: a sentence-final citation resolves — `.` is punctuation, not id continuation", () => {
    expect(codes(withMarker("<!-- task: red=`x` ac=AC-14 -->", "**Verify.** AC-14."))).toEqual([]);
  });

  it("M34/AC-38: ids may not trail or repeat punctuation", () => {
    for (const bad of ["AC-1.", "AC-1..1", "AC-1.-child", "AC-1-"]) {
      expect(codes(withMarker(`<!-- task: red=\`x\` ac=${bad} -->`))).toEqual([
        "TASK_MARKER_MALFORMED",
      ]);
    }
  });

  it("M79/M85: resolution covers EVERY id, both endpoints", () => {
    const two = "<!-- task: red=`x` ac=AC-1,AC-2 -->";
    // Only the last unresolvable: kills a first-id-only implementation.
    expect(codes(withMarker(two, "Implements AC-1."))).toEqual(["TASK_AC_UNRESOLVED"]);
    // Mirror — only the first unresolvable: kills a last-id-only implementation.
    expect(codes(withMarker(two, "Implements AC-2."))).toEqual(["TASK_AC_UNRESOLVED"]);
    // Both resolvable: clean.
    expect(codes(withMarker(two, "Implements AC-1 and AC-2."))).toEqual([]);
  });

  it("M63/M73/M74/M86/AC-44: duplication is cardinality, independent of classification", () => {
    const RE = "<!-- task: red=`` ac=AC-1 -->";
    const AM = "<!-- task: red=`x` -->";
    // defect + well-formed: both codes.
    expect(codes(doc(OPEN, "## A", RE, WELL, "AC-1 here.", END))).toEqual([
      "TASK_MARKER_DUPLICATE",
      "TASK_RED_EMPTY",
    ]);
    // three well-formed markers: kills `length === 2`.
    expect(codes(doc(OPEN, "## A", WELL, WELL, WELL, "AC-1 here.", END))).toEqual([
      "TASK_MARKER_DUPLICATE",
    ]);
    // two defectives, cross-class: kills `some(isWellFormed)`.
    expect(codes(doc(OPEN, "## A", RE, AM, "AC-1 here.", END))).toEqual([
      "TASK_AC_MISSING",
      "TASK_MARKER_DUPLICATE",
      "TASK_RED_EMPTY",
    ]);
    // two defectives, SAME class: kills dedupe-by-classification. The repeated
    // code is the assertion, so this can never be a set comparison.
    expect(codes(doc(OPEN, "## A", RE, RE, "AC-1 here.", END))).toEqual([
      "TASK_MARKER_DUPLICATE",
      "TASK_RED_EMPTY",
      "TASK_RED_EMPTY",
    ]);
  });

  it("M56: an orphan's ids are never resolved — ORPHANED alone, no UNRESOLVED", () => {
    expect(
      codes(doc(OPEN, "<!-- task: red=`x` ac=AC-99 -->", "## A", WELL, "AC-1 here.", END)),
    ).toEqual(["TASK_MARKER_ORPHANED"]);
  });

  it("M28/AC-31: the red command may not span a backtick — greedy escapes are rejected", () => {
    // Each of these parses under a greedy `(.*)` group and must not here.
    for (const m of [
      "<!-- task: red=`` ac=AC-1 -->` ac=AC-2 -->",
      "<!-- task: red=`x` ac=AC-1 --> extra `y` -->",
    ]) {
      expect(codes(withMarker(m))).toEqual(["TASK_MARKER_MALFORMED"]);
    }
  });
});

describe("checkTaskContract — mutation-gate repayments (groups F-J)", () => {
  it("M36e/AC-17: a SAME-depth sibling heading ends a task's extent", () => {
    // Mutation group F. The existing M15/AC-17 case uses a strictly SHALLOWER
    // heading, which ends the extent under both `h.depth <= depth` and the
    // mutant `h.depth < depth` — so the "or shallower" half of the rule was
    // never pinned. With two depth-2 siblings each owning its own marker, the
    // mutant runs T1's extent past T2, `extents.find` hands BOTH markers to T1,
    // and T2 is left bare.
    expect(
      codes(
        doc("# P", OPEN, "## T1", WELL, "## T2", "<!-- task: red=`y` ac=AC-1 -->", END, "AC-1"),
      ),
    ).toEqual([]);
  });

  it("M36f: TASK_MARKER_DUPLICATE is reported on the SECOND marker's line", () => {
    // Mutation group G. `ms[1]` -> `ms[2]` leaves docLine undefined for a
    // two-marker extent; only an assertion on the LINE can see it, since the
    // code is unchanged either way.
    const findings = checkTaskContract(
      parseDoc(doc("# P", OPEN, "## T", WELL, "<!-- task: red=`y` ac=AC-1 -->", END, "AC-1")),
      "plan",
    );
    const dup = findings.filter((f) => f.code === "TASK_MARKER_DUPLICATE");
    expect(dup).toHaveLength(1);
    expect(dup[0]!.docLine).toBe(5);
  });

  it("M36g: a TASK_RED_EMPTY marker draws exactly one code, even with an unresolved ac id", () => {
    // Mutation group H. Precedence (§3.3) is first-match-wins, one code per
    // line. Removing the `continue` lets the same marker ALSO draw
    // TASK_AC_UNRESOLVED — invisible unless the fixture's ac id is unresolved,
    // which no existing case combined with an empty red.
    expect(codes(doc("# P", OPEN, "## T", "<!-- task: red=`` ac=AC-99 -->", END))).toEqual([
      "TASK_RED_EMPTY",
    ]);
  });

  it("M36h: findings are ordered by docLine, not by emission order", () => {
    // Mutation group I. Pass 1 emits enrollment findings before pass 2 emits
    // marker findings, so a LATE malformed tasks-line and an EARLY marker
    // finding come out reversed unless the sort runs. Deleting
    // `findings.sort(...)` outright survived the entire suite before this.
    // A malformed `<!-- tasks: ... -->` line is a pass-1 finding that still
    // leaves a well-formed region behind, so a pass-1 and a pass-2 finding
    // coexist and the sort is observable. A document with NO well-formed region
    // returns before any marker finding exists (2026-08-09 design §2.2).
    const findings = checkTaskContract(
      parseDoc(
        doc(
          "# P",
          OPEN,
          "## T1",
          "<!-- task: red=`` ac=AC-1 -->",
          "## T2",
          WELL,
          "<!-- tasks: bogus -->",
          END,
          "AC-1 here.",
        ),
      ),
      "plan",
    );
    expect(findings.map((f) => f.docLine)).toEqual([4, 7]);
    expect(findings.map((f) => f.code)).toEqual(["TASK_RED_EMPTY", "TASK_ENROLL_MALFORMED"]);
  });

  it("M36i: two findings sharing (docLine, code) keep their relative order", () => {
    // Mutation group J. `a.code < b.code` -> `<=` returns -1 for an equal pair
    // and V8 reverses it. The two findings differ ONLY in `message`, so an
    // assertion on codes or lines cannot see it — which is exactly why an
    // earlier probe over identical elements wrongly reported this mutant
    // unobservable (spec limit L-8).
    const findings = checkTaskContract(
      parseDoc(doc("# P", OPEN, "## T", "<!-- task: red=`x` ac=AC-90,AC-91 -->", END)),
      "plan",
    );
    expect(findings.map((f) => f.code)).toEqual(["TASK_AC_UNRESOLVED", "TASK_AC_UNRESOLVED"]);
    expect(findings.map((f) => /AC-\d+/.exec(f.message)?.[0])).toEqual(["AC-90", "AC-91"]);
  });
});

describe("checkTaskContract — the unclaimed direction (spec §4.1, §4.3)", () => {
  // OPEN=1, ""=2, "## Task 1"=3, ""=4, WELL=5, ""=6, so body[0] is line 7.
  const plan = (...body: string[]) => doc(OPEN, "", "## Task 1", "", WELL, "", ...body, "", END);
  const CLAIMED = "- AC-1 the one the marker claims.";

  it("AC-4/unclaimed: a declared id no marker claims reports on its DECLARING line", () => {
    // The line is half the assertion. A mutant reporting the marker's line, or
    // line 1, still emits one finding with the right code; the pair is what
    // discriminates it.
    const findings = checkTaskContract(
      parseDoc(plan(CLAIMED, "- AC-2 nobody claims this one.")),
      "plan",
    );
    expect(findings.map((f) => [f.code, f.docLine])).toEqual([["TASK_AC_UNCLAIMED", 8]]);
  });

  it("unclaimed: a disposition exempts that id and nothing else on the line's own evidence", () => {
    expect(codes(plan(CLAIMED, "- AC-2 elsewhere (discharged by Task 4)", "- AC-3 bare."))).toEqual(
      ["TASK_AC_UNCLAIMED"],
    );
  });

  it("unclaimed: every ACCEPTED disposition form exempts, each asserted on its own", () => {
    for (const d of [
      "(RETIRED)",
      "(RETIRED: superseded by AC-4)",
      "(discharged by Task 10)",
      "(discharged by Task 3 and Task 6)",
      "(discharged by Task 3, Task 6)",
      "(discharged by Task 3 + 6)",
      "(discharged by Task N2b)",
      "(discharged by closeout)",
      "(discharged by the closeout)",
      "(discharged by the PR's last commit)",
    ]) {
      expect(`${d} => ${codes(plan(CLAIMED, `- AC-2 elsewhere ${d}`)).join(",")}`).toBe(`${d} => `);
    }
  });

  it("unclaimed: every NEAR MISS still reports — the set is an accept-set, never a deny-set", () => {
    // Enumerated rather than described. "Every near-miss form reports" is not a
    // case specification, and an implementation tolerating one of them passes a
    // list that never names it (plan review R4 finding 2). The first entry is
    // the one an ordinary contributor writes starting from the live DISCHARGED
    // line at docs/superpowers/plans/2026-08-21-app-e2e-batch2.md:28, and the
    // bare `Task 10.` witness below does NOT cover it: that one tests the
    // parenthesis requirement, this one tests end anchoring AFTER an otherwise
    // valid disposition.
    for (const d of [
      "(discharged by Task 10).",
      "(retired)",
      "(RETIRED)!",
      "(discharged by the closeout, not by a task).",
      "(discharged by a later arc)",
      "(handled by Task 10)",
      "discharged by Task 10",
      "— Task 10.",
    ]) {
      expect(`${d} => ${codes(plan(CLAIMED, `- AC-2 elsewhere ${d}`)).join(",")}`).toBe(
        `${d} => TASK_AC_UNCLAIMED`,
      );
    }
  });

  it("unclaimed: a declaring line carrying more than one id is AMBIGUOUS — declined BOTH ways", () => {
    expect(codes(plan(CLAIMED, "- AC-2 transient; AC-2b the sibling clear."))).toEqual([]);
    // And a disposition on such a line disposes nothing, because the line is not
    // a declaring line at all (spec §4.2.1).
    expect(codes(plan(CLAIMED, "- AC-2 transient; AC-2b sibling (discharged by Task 4)"))).toEqual(
      [],
    );
  });

  it("unclaimed: the count is DISTINCT ids, so one id written twice on a line still declares", () => {
    // Live witness: docs/superpowers/plans/2026-08-07-ops-log-code-emits.md:56
    // writes AC-2 twice while explaining its proof, and that line is one
    // criterion. Counting occurrences would decline it and exempt a real id.
    expect(
      codes(plan(CLAIMED, "- AC-2 holds, and AC-2 is asserted by the task that could break it.")),
    ).toEqual(["TASK_AC_UNCLAIMED"]);
  });

  it("unclaimed: an id declared twice and disposed ONCE is disposed, globally", () => {
    // Spec §4.2.1. Live after Task 4 disposes app-e2e-batch2 AC-3 at line 28
    // while the id is still declared at line 306; a per-line implementation
    // keeps reporting it.
    expect(
      codes(plan(CLAIMED, "- AC-2 first statement.", "- AC-2 again (discharged by Task 4)")),
    ).toEqual([]);
    // Order must not matter: disposed first, restated after.
    expect(
      codes(plan(CLAIMED, "- AC-2 again (discharged by Task 4)", "- AC-2 first statement.")),
    ).toEqual([]);
  });

  it("unclaimed: the range form declares nothing and a coverage MAP is not a declaration", () => {
    // v3 passed on this: the character after `AC-1` is a dot followed by another
    // dot rather than by an alphanumeric.
    expect(codes(plan(CLAIMED, "- AC-1..AC-7 all covered: AC-2 (Task 1), AC-3 (Task 2)."))).toEqual(
      [],
    );
  });

  it("unclaimed: the `**AC-2.**` spelling DOES declare — the boundary rejects a CONTINUING dot", () => {
    // Rejecting every following dot drops real declarations in four live plans,
    // which is v3's silent-loss defect under a different rule.
    expect(codes(plan(CLAIMED, "- **AC-2.** Marker true, and the read-back."))).toEqual([
      "TASK_AC_UNCLAIMED",
    ]);
  });

  it("unclaimed: a POSSESSIVE head id is a line ABOUT a criterion, not a declaration of one", () => {
    // Corpus-forced narrowing. Five live lines open `- **AC-5's digest cannot
    // move.**`, whose real criteria sit in a table elsewhere; disposing one
    // would have written a disposition mid-sentence into a wrapped bullet. The
    // rule is that the head id must be a standalone token, not a special case
    // for apostrophes, and it loses no real declaration on the live corpus.
    expect(
      codes(plan(CLAIMED, "- **AC-2's digest cannot move.** Every one of the named mutants")),
    ).toEqual([]);
    // The delimiters that DO declare, each on its own, so the narrowing cannot
    // quietly widen into "any punctuation ends a declaration".
    for (const decl of [
      "- AC-2 plain space.",
      "- AC-2: colon form.",
      "- **AC-2** emphasis close.",
      "- AC-2, comma form.",
      "- **AC-2.** period inside the emphasis.",
      "- AC-2",
    ]) {
      expect(`${decl} => ${codes(plan(CLAIMED, decl)).join(",")}`).toBe(
        `${decl} => TASK_AC_UNCLAIMED`,
      );
    }
  });

  it("unclaimed: a fenced declaration is inert, and so is a fenced marker's claim", () => {
    // Witness for the first: control-outline-forward-guard.md:326, a shell
    // comment beginning `# AC-10:` inside a fence.
    expect(codes(plan(CLAIMED, "```sh", "# AC-2: no UI surface in the diff", "```"))).toEqual([]);
    expect(
      codes(
        doc(
          OPEN,
          "",
          "## Task 1",
          "",
          WELL,
          "",
          CLAIMED,
          "- AC-2 nobody claims this one.",
          "",
          "```",
          "<!-- task: red=`x` ac=AC-2 -->",
          "```",
          "",
          END,
        ),
      ),
    ).toEqual(["TASK_AC_UNCLAIMED"]);
  });

  it("unclaimed: an ATX heading declares, and so does an ordered list item", () => {
    expect(codes(plan(CLAIMED, "### AC-2 the heading form"))).toEqual(["TASK_AC_UNCLAIMED"]);
    expect(codes(plan(CLAIMED, "2. AC-2 the ordered form"))).toEqual(["TASK_AC_UNCLAIMED"]);
  });

  it("unclaimed: a disposition on a line declaring nothing is inert, not an error", () => {
    expect(codes(plan(CLAIMED, "- ordinary prose (discharged by Task 4)"))).toEqual([]);
  });

  it("unclaimed: a cited id that is ALSO disposed is claimed, and the redundancy is not an error", () => {
    expect(codes(plan("- AC-1 claimed and redundantly disposed (discharged by Task 9)"))).toEqual(
      [],
    );
  });

  it("unclaimed: the arm is inert in a plan that never attempts enrollment", () => {
    expect(codes(doc("# Plan", "## A", "- AC-2 declared, and nothing claims it."))).toEqual([]);
  });

  it("unclaimed: taskContract never fires for kind === 'spec', on byte-identical text", () => {
    const text = plan(CLAIMED, "- AC-2 nobody claims this one.");
    expect(checkTaskContract(parseDoc(text), "spec")).toEqual([]);
    expect(codes(text)).toEqual(["TASK_AC_UNCLAIMED"]);
  });
});

describe("checkTaskContract — the undeclared direction and the three-code partition (spec §4.3)", () => {
  const marker = (ac: string) => `<!-- task: red=\`pnpm test\` ac=${ac} -->`;
  // OPEN=1, ""=2, "## Task 1"=3, ""=4, marker=5, ""=6, so body[0] is line 7.
  const MARKER_LINE = 5;
  const plan = (ac: string, ...body: string[]) =>
    doc(OPEN, "", "## Task 1", "", marker(ac), "", ...body, "", END);
  const DECLARED = "- AC-1 declared as a criterion of this plan.";

  it("AC-5/undeclared: a marker citing an id the plan only MENTIONS reports on the marker line", () => {
    // resolvesId accepts any prose occurrence, so today `ac=AC-2` is satisfied
    // by a passing sentence and the criterion is never declared at all.
    const findings = checkTaskContract(
      parseDoc(plan("AC-1,AC-2", DECLARED, "AC-2 is mentioned in this sentence and nowhere else.")),
      "plan",
    );
    expect(findings.map((f) => [f.code, f.docLine])).toEqual([["TASK_AC_UNDECLARED", MARKER_LINE]]);
  });

  it("undeclared: OPT-IN BY SHAPE — a plan that declares nothing is untouched", () => {
    // 42 of the enrolled plans carry their criteria in the sibling spec and a
    // coverage map only (spec §7 limit 5). Requiring a body declaration for
    // every cited id would red most of the corpus.
    expect(codes(plan("AC-2", "AC-2 is mentioned in this sentence and nowhere else."))).toEqual([]);
  });

  it("undeclared: the count cut applies SYMMETRICALLY — an id on a DECLINED line is neither", () => {
    // Each body below is a line the arm declines: a table row, a line carrying
    // more than one id, and a list item whose content does not begin with the
    // id. Without this cut the code reds 9 plans / 71 ids on the live corpus,
    // because one incidental list item beginning with an id opts a whole plan
    // in while its real criteria sit in a table.
    for (const declined of [
      "| AC-2 | the criterion, in a table | Task 3 |",
      "AC-2 and AC-3 are both covered by the sibling spec.",
      "- the second half of the work covers AC-2 as well.",
      "### Task 4 closes AC-2 and nothing else",
    ]) {
      expect(`${declined} => ${codes(plan("AC-1,AC-2", DECLARED, declined)).join(",")}`).toBe(
        `${declined} => `,
      );
    }
  });

  it("undeclared: an id whose only declaring line is AMBIGUOUS draws neither code", () => {
    expect(codes(plan("AC-1,AC-2", DECLARED, "- AC-2 with AC-2b, its sibling."))).toEqual([]);
  });

  it("undeclared: a cited id that IS declared draws nothing", () => {
    expect(codes(plan("AC-1", DECLARED))).toEqual([]);
  });

  it("undeclared: the DECLINE PATH must be live — a prose-only occurrence still reports", () => {
    // The discriminator Task 4's empty-set assertion rests on. An implementation
    // whose decline predicate is unconditionally true satisfies the corpus
    // equality, the empty undeclared set and a non-zero declined count all at
    // once; this case is the only thing that fails against it.
    expect(
      codes(plan("AC-1,AC-2", DECLARED, "The work for AC-2 is done by the same pass.")),
    ).toEqual(["TASK_AC_UNDECLARED"]);
  });

  it("AC-5/partition: no id ever draws two of the three codes", () => {
    // AC-1 declared and claimed; AC-2 mentioned in prose; AC-3 nowhere at all.
    const findings = checkTaskContract(
      parseDoc(plan("AC-1,AC-2,AC-3", DECLARED, "AC-2 appears in this sentence.")),
      "plan",
    );
    expect(findings.map((f) => f.code).sort()).toEqual([
      "TASK_AC_UNDECLARED",
      "TASK_AC_UNRESOLVED",
    ]);
    // Asserted per ID, not per code: a fixture can produce the right code set
    // while one id draws two of them.
    for (const id of ["AC-1", "AC-2", "AC-3"]) {
      const drawn = findings.filter((f) => f.message.includes(`\`${id}\``)).map((f) => f.code);
      expect(`${id} drew ${drawn.length}`).toBe(`${id} drew ${id === "AC-1" ? 0 : 1}`);
    }
  });

  it("partition: UNRESOLVED needs NO occurrence, UNDECLARED needs one that is not a declaration", () => {
    expect(codes(plan("AC-1,AC-9", DECLARED))).toEqual(["TASK_AC_UNRESOLVED"]);
    expect(codes(plan("AC-1,AC-9", DECLARED, "AC-9 is discussed here."))).toEqual([
      "TASK_AC_UNDECLARED",
    ]);
  });

  it("undeclared: an id whose only occurrence is inside a FENCE is UNDECLARED, not declined", () => {
    // `resolvesId` has always counted a fenced occurrence, so this stays out of
    // UNRESOLVED's case — and it is not a decline either, since a fence is inert
    // for declaring and for declining alike. UNDECLARED is the right answer and
    // the purest form of the defect this code exists for: the plan cites AC-9
    // and its only appearance anywhere is a code sample.
    expect(codes(plan("AC-1,AC-9", DECLARED, "```", "AC-9 in a code sample", "```"))).toEqual([
      "TASK_AC_UNDECLARED",
    ]);
  });

  it("undeclared: never fires for kind === 'spec', on byte-identical text", () => {
    const text = plan("AC-1,AC-2", DECLARED, "AC-2 appears in this sentence.");
    expect(checkTaskContract(parseDoc(text), "spec")).toEqual([]);
    expect(codes(text)).toEqual(["TASK_AC_UNDECLARED"]);
  });
});

describe("checkTaskContract — the AC classification's own structure (spec §4.1)", () => {
  // Every case here exists to kill a mutant the source-mutation gate left
  // surviving. `tests/specLint/taskContract.test.ts` is one of three deciding
  // suites the registry runs, and the corpus tests are not among them, so
  // behaviour asserted only there is unscored — which is exactly how the
  // declined and ambiguous accumulators could be deleted with the gate green.
  const marker = (ac: string) => `<!-- task: red=\`pnpm test\` ac=${ac} -->`;
  const MARKER_LINE = 5;
  const plan = (ac: string, ...body: string[]) =>
    doc(OPEN, "", "## Task 1", "", marker(ac), "", ...body, "", END);
  const DECLARED = "- AC-1 declared as a criterion of this plan.";
  const analysisOf = (text: string) => acAnalysis(parseDoc(text));

  it("structure: the AMBIGUOUS list is populated, and each row carries its own line and ids", () => {
    const ac = analysisOf(plan("AC-1", DECLARED, "- AC-2 with AC-2b, its sibling."));
    expect(ac.ambiguous).toEqual([{ line: 8, ids: ["AC-2", "AC-2b"] }]);
  });

  it("structure: the DECLINED list is populated, and each row carries its own line and ids", () => {
    // Task 4's corpus premise rests on this list being non-empty, and that
    // premise lives in an unscored suite. Asserted here on its own line number,
    // so neither deleting the push nor moving the row off its line survives.
    const ac = analysisOf(plan("AC-1", DECLARED, "| AC-2 | in a table | Task 3 |"));
    expect(ac.declined).toEqual([{ line: 8, ids: ["AC-2"] }]);
  });

  it("structure: an unestablished enrollment classifies NOTHING, even with a declaration present", () => {
    // `sawTasksLine` is true and `enrolled` is false. The arm must return early:
    // a plan whose region never opened has no markers to claim with, so reading
    // its declarations would report every criterion it has.
    const text = doc("<!-- tasks: depth=x -->", "", "## A", "", "- AC-2 declared.", "");
    expect(analysisOf(text).certain.size).toBe(0);
    expect(codes(text)).toEqual(["TASK_ENROLL_MALFORMED"]);
  });

  it("structure: a declaration on DOCUMENT LINE 1 is read", () => {
    const text = doc(
      "- AC-2 declared on the very first line.",
      OPEN,
      "",
      "## Task 1",
      "",
      marker("AC-1"),
      "",
      DECLARED,
      "",
      END,
    );
    const found = checkTaskContract(parseDoc(text), "plan");
    expect(found.map((f) => [f.code, f.docLine])).toEqual([["TASK_AC_UNCLAIMED", 1]]);
  });

  it("boundary: 1-3 spaces of indentation declare, 4 do not — and the same for the decline", () => {
    expect(codes(plan("AC-1", DECLARED, "   - AC-2 three spaces."))).toEqual(["TASK_AC_UNCLAIMED"]);
    expect(codes(plan("AC-1", DECLARED, "    - AC-2 four spaces."))).toEqual([]);
    // The decline path carries its own copy of the bound, so it needs its own
    // case: at four spaces the table row is not structured, the id is not
    // declined, and the citation reports.
    expect(codes(plan("AC-1,AC-2", DECLARED, "   | AC-2 | three spaces |"))).toEqual([]);
    expect(codes(plan("AC-1,AC-2", DECLARED, "    | AC-2 | four spaces |"))).toEqual([
      "TASK_AC_UNDECLARED",
    ]);
  });

  it("boundary: an ordered marker of 9 digits declares, 10 does not — and the same for the decline", () => {
    expect(codes(plan("AC-1", DECLARED, "123456789. AC-2 nine digits."))).toEqual([
      "TASK_AC_UNCLAIMED",
    ]);
    expect(codes(plan("AC-1", DECLARED, "1234567890. AC-2 ten digits."))).toEqual([]);
    expect(codes(plan("AC-1,AC-2", DECLARED, "123456789. mentions AC-2 in nine digits."))).toEqual(
      [],
    );
    expect(codes(plan("AC-1,AC-2", DECLARED, "1234567890. mentions AC-2 in ten digits."))).toEqual([
      "TASK_AC_UNDECLARED",
    ]);
  });

  it("boundary: a 6-hash heading declares, 7 do not — and the same for the decline", () => {
    expect(codes(plan("AC-1", DECLARED, "###### AC-2 six hashes"))).toEqual(["TASK_AC_UNCLAIMED"]);
    expect(codes(plan("AC-1", DECLARED, "####### AC-2 seven hashes"))).toEqual([]);
    // The decline path gets no companion case for the heading bound, and that
    // is a fact about the code rather than an omission: `STRUCTURED` ends in
    // `[ \t]?`, which is OPTIONAL, so a run of six or more hashes is structured
    // whether the bound reads six or seven. The mutant is equivalent there and
    // carries a registry row saying so.
    expect(codes(plan("AC-1,AC-2", DECLARED, "###### heading mentioning AC-2"))).toEqual([]);
    expect(codes(plan("AC-1,AC-2", DECLARED, "####### heading mentioning AC-2"))).toEqual([]);
  });

  it("disposal: an id declared TWICE and disposed NEITHER time still reports", () => {
    // The disposed flag is OR'd across a criterion's declaring lines. A mutant
    // that ORs the wrong operands marks a twice-declared id disposed and the
    // finding vanishes.
    expect(codes(plan("AC-1", DECLARED, "- AC-2 first statement.", "- AC-2 restated."))).toEqual([
      "TASK_AC_UNCLAIMED",
    ]);
  });

  it("undeclared: a MALFORMED marker in a declaring plan is skipped, not dereferenced", () => {
    const text = doc(
      OPEN,
      "",
      "## Task 1",
      "",
      "<!-- task: red=`x` ac= -->",
      "",
      DECLARED,
      "",
      END,
    );
    // `ac=` present but empty is TASK_AC_MISSING, and AC-1 is then claimed by
    // nothing. What matters for the mutant is that the undeclared loop SKIPS a
    // marker with no `ac=` list rather than dereferencing it.
    expect(codes(text).sort()).toEqual(["TASK_AC_MISSING", "TASK_AC_UNCLAIMED"]);
  });

  it("undeclared: one finding per (id, marker) — a duplicated citation reports ONCE", () => {
    const found = checkTaskContract(
      parseDoc(plan("AC-1,AC-2,AC-2", DECLARED, "AC-2 appears in this sentence.")),
      "plan",
    );
    expect(found.map((f) => [f.code, f.docLine])).toEqual([["TASK_AC_UNDECLARED", MARKER_LINE]]);
  });

  it("undeclared: two DIFFERENT undeclared ids on one marker report TWICE", () => {
    // The companion to the case above, and the one that discriminates the
    // dedup's conjunction: a mutant matching on line alone would collapse these
    // two into one.
    const found = checkTaskContract(
      // On SEPARATE lines deliberately: two ids on one line is a multi-id line,
      // which the symmetric cut declines, and both would be exempt.
      parseDoc(
        plan("AC-1,AC-2,AC-3", DECLARED, "AC-2 is discussed here.", "AC-3 is discussed here."),
      ),
      "plan",
    );
    expect(found.map((f) => f.code)).toEqual(["TASK_AC_UNDECLARED", "TASK_AC_UNDECLARED"]);
  });
});
