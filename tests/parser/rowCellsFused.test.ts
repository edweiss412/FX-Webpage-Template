// Spec §5: a merged cell exports as a DELETED PIPE, leaving the row one cell short of
// its section's modal data-row width. Two adjacent values fuse into one, and every
// column index to their right shifts within that row — each individual value still looks
// well-formed, which is why nothing downstream notices.
//
// Failure modes these arms catch: a detector that counts alignment or header rows into
// the modal; one that fires on legitimately ragged authoring; one that CORRECTS the
// fusion instead of reporting it.
//
// Fixtures come from the mutation harness's registry rather than a readdir of the corpus
// directory: a directory listing in the parallel project races a serial test's synthetic
// `_temp-*` fixture (tests/cross-cutting/corpus-temp-prefix.test.ts) and also sweeps up
// non-fixture markdown such as exporter-xlsx/README.md. Branch 1 of this wave shipped
// that bug and had it caught in review; there is no reason to repeat it.
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { parseSheet } from "@/lib/parser";
import { KNOWN_SECTION_HEADERS } from "@/lib/parser/knownSections";
import { detectFusedRows, scanFusedRows } from "@/lib/parser/rowWidthDiscriminator";
import { isRoutingKey } from "@/lib/parser/sectionKind";
import { premise, premiseHolds } from "@/tests/_shared/premise";
import { FIXTURES, readFixture } from "@/tests/parser/mutation/fixtures";
import { payloadOf } from "@/tests/parser/mutation/oracle";

const fused = (md: string, name: string) =>
  parseSheet(md, name).warnings.filter((w) => w.code === "ROW_CELLS_FUSED");

/**
 * Fuse a data row inside a section with >= 3 SAME-WIDTH data rows of >= 3 cells.
 *
 * The width and count requirements are what make the modal well-defined, so the
 * discriminator CAN fire: the first eligible row by line order is the one-data-row TITLE
 * section, where a modal over fewer than 3 data rows is meaningless. The MIDDLE row is
 * fused so its two siblings keep the modal anchored where it was.
 */
function fuseEligibleRow(md: string): { mutated: string; line: number } {
  const lines = md.split("\n");
  const isRow = (l: string) => l.trimStart().startsWith("|");
  const isAlign = (l: string) => /^\s*\|\s*:?-+/.test(l);
  let start = -1;
  for (let i = 0; i <= lines.length; i++) {
    const row = i < lines.length && isRow(lines[i]!);
    if (row && start === -1) start = i;
    if (!row && start !== -1) {
      const dataIdx: number[] = [];
      for (let j = start; j < i; j++) if (!isAlign(lines[j]!)) dataIdx.push(j);
      const widths = dataIdx.map((j) => lines[j]!.split("|").length);
      // >= 4 non-alignment rows, because the FIRST is the table header and the detector
      // measures DATA rows only -- a run of exactly 3 leaves 2 data rows, under the floor,
      // and the section is skipped. Fuse dataIdx[2]: a middle DATA row, so its siblings
      // keep the modal anchored where it was.
      if (dataIdx.length >= 4 && widths[0]! - 2 >= 3 && widths.every((w) => w === widths[0])) {
        const t = dataIdx[2]!;
        const cells = lines[t]!.split("|");
        lines[t] = ["", cells[1]! + " " + cells[2]!, ...cells.slice(3)].join("|");
        return { mutated: lines.join("\n"), line: t };
      }
      start = -1;
    }
  }
  throw new Error("no eligible section - premise violated");
}

describe("ROW_CELLS_FUSED (spec §5)", () => {
  const path = "fixtures/shows/exporter-xlsx/east-coast.md";
  const md = readFileSync(path, "utf8");

  it("premise: the fixture has a fusable section, and fires zero fused warnings clean", () => {
    // Both halves matter. Without a fusable section the arms below assert nothing; and if
    // the clean fixture already warned, "the mutation caused it" would be unprovable.
    premiseHolds(
      "fusable >=3-same-width-data-row section exists",
      fuseEligibleRow(md).mutated !== md,
    );
    expect(fused(md, path)).toEqual([]);
  });

  it("a deleted interior pipe fires exactly one warning, and the detector does not correct it", () => {
    const { mutated } = fuseEligibleRow(md);
    const w = fused(mutated, path);
    expect(w).toHaveLength(1);
    expect(w[0]!.severity).toBe("warn");
    expect(w[0]!.rawSnippet).toBeTruthy();
    // Canonical routing key or the generic fallback, never raw cell text (retro F2,
    // established by branch 2's `canonicalSectionKind`).
    const kind = w[0]!.blockRef?.kind;
    expect(kind).toBeTruthy();
    expect(isRoutingKey(kind!) || kind === "section").toBe(true);

    // DETECTION, NOT CORRECTION (spec §5.1). The fusion still absorbs into payload; the
    // detector's only job is to say so. The delta is scoped to the code under test
    // (r2 F9) because fusing a row can legitimately co-change OTHER warnings — an
    // UNKNOWN_FIELD on the now-unrecognized fused label, say — so a total warning count
    // is not a stable proxy for "this detector fired once".
    expect(fused(md, path)).toHaveLength(0);
    expect(payloadOf(parseSheet(mutated, path))).not.toEqual(payloadOf(parseSheet(md, path)));
  });

  it("zero warnings across the whole unmutated corpus (probe §13.B: no row sits at modal-1)", () => {
    premise("corpus fixtures discovered", FIXTURES.length, 16);
    const hits = FIXTURES.flatMap((f) => fused(readFixture(f), f.path).map(() => f.path));
    expect(hits).toEqual([]);
    // Explicit budget: this parses all 17 fixtures, which exceeds the 30s default on a
    // loaded machine. A timeout here is a machine fact, not a detector fact, and letting
    // it read as a failure wastes a triage cycle every time the box is busy.
  }, 180_000);
});

// The corpus arm above is a CALIBRATION gate, not a discriminator, and it must not be
// mistaken for one. Both mutants below survive it: loosening the alignment test to the
// plan snippet's first-cell regex, and deleting the logical-opener boundary entirely,
// each leave all three arms above green. The corpus simply contains no row that
// separates those variants, so on that input the strict and loose detectors agree.
//
// A guard states its premise executably. These two fixtures ARE the premise — each is
// the minimal shape on which the two variants disagree, so each arm names a mutant it
// kills rather than a behavior it hopes is exercised.
describe("ROW_CELLS_FUSED calibration (hand-built shapes the corpus does not contain)", () => {
  it("does not read an ordinary dash-led row as an alignment row", () => {
    // KILLS: `isAlignmentRow` = /^\s*\|\s*:?-+/ (first cell only). Sheets write leading
    // dashes as bullets ("- Load in"), and under the loose test such a row is discarded
    // before the modal is computed. When the dash-led row is itself the FUSED one, the
    // loose variant drops the evidence and reports nothing at all.
    const md = [
      "| CREW | Role | Call | Out |",
      "| --- | --- | --- | --- |",
      "| Alice | A1 | 08:00 | 17:00 |",
      "| Bob | A2 | 08:00 | 17:00 |",
      "| Carla | A2 | 09:00 | 17:00 |",
      "| - Dana A2 | 09:00 | 17:00 |",
      "",
    ].join("\n");
    const w = fused(md, "calibration.md");
    expect(w).toHaveLength(1);
    expect(w[0]!.rawSnippet).toContain("Dana");
  });

  it("measures adjacent sections separately when no blank line divides them", () => {
    // KILLS: dropping the `opener !== null` boundary. Sheets butt one section against the
    // next with no blank row. Measured as ONE section these widths mix: five 5-cell rows
    // outnumber three 4-cell rows, so the modal is 5 and every DATES row lands at
    // modal-1 and is reported as a merged cell. That is a false positive on completely
    // well-formed input — the failure direction that matters, because it teaches an
    // operator to ignore the warning.
    //
    // The row counts are deliberately UNEQUAL. At 4-vs-4 the merged distribution ties and
    // the §5.3 tie-guard skips the section, so the mutant survives a balanced fixture for
    // a reason unrelated to the boundary — measured, on the first version of this arm.
    const md = [
      "| CREW | Role | Call | Out | Note |",
      "| --- | --- | --- | --- | --- |",
      "| Alice | A1 | 08:00 | 17:00 | x |",
      "| Bob | A2 | 08:00 | 17:00 | x |",
      "| Carla | A2 | 09:00 | 17:00 | x |",
      "| Dan | A3 | 09:00 | 17:00 | x |",
      "| DATES | Start | End | Note |",
      "| --- | --- | --- | --- |",
      "| Load in | 3/1 | 3/1 | x |",
      "| Show | 3/2 | 3/3 | x |",
      "",
    ].join("\n");
    expect(fused(md, "calibration.md")).toEqual([]);
  });

  it("closes the section at a prose line, not only at a blank one", () => {
    // KILLS: flushing only when the line is BLANK. Markdown ends a table at the first line
    // that is not part of it, and a paragraph between two tables is a common sheet-export
    // shape. Measured as one section, the four 5-cell rows set the modal and all three
    // 4-cell rows report as fused: three false positives on well-formed input.
    //
    // Re-verified after the boundary became structural.
    // The trailing run deliberately has NO alignment row of its own. With one, the
    // structural boundary would split it and the arm would pass whatever the prose rule
    // did -- measured: it survived the blank-line-only mutant that way. Stripped of its
    // alignment row, the prose flush is the only thing that can separate these.
    const md = [
      "| CREW | Role | Call | Out | Note |",
      "| --- | --- | --- | --- | --- |",
      "| Alice | A1 | 08:00 | 17:00 | x |",
      "| Bob | A2 | 08:00 | 17:00 | x |",
      "| Carla | A2 | 09:00 | 17:00 | x |",
      "| Dan | A3 | 09:00 | 17:00 | x |",
      "Note: load-in moved to the dock entrance.",
      "| Load in | 3/1 | 3/1 | x |",
      "| Show | 3/2 | 3/3 | x |",
      "| Out | 3/4 | 3/4 | x |",
      "",
    ].join("\n");
    expect(fused(md, "calibration.md")).toEqual([]);
  });

  it("stays silent when the section's widths TIE, since modal-1 has no referent", () => {
    // KILLS: deleting the §5.3 tie-guard. On a 2-2 split the sort still yields a "modal",
    // and the losing half is then reported wholesale. "Short by one against the section's
    // normal width" presupposes the section HAS a normal width; when the sheet is simply
    // ragged, the honest answer is to say nothing rather than to pick a winner by sort
    // order. This is a documented skip (spec §5.3 residue), not an undetected case.
    const md = [
      "| NOTES | A | B | C | D |",
      "| --- | --- | --- | --- | --- |",
      "| one | 1 | 2 | 3 | 4 |",
      "| two | 1 | 2 | 3 |",
      "| three | 1 | 2 | 3 |",
      "",
    ].join("\n");
    expect(fused(md, "calibration.md")).toEqual([]);
  });

  it("stays silent on tables butted together, whatever the heading says", () => {
    // WHAT THIS ACTUALLY PINS, stated precisely because an earlier version of this comment
    // claimed more: two butted tables carry TWO delimiter rows, so the run is ambiguous and
    // ABANDONED. Silence here is abstention, not segmentation. Cross-model review caught
    // the overclaim by mutating the (now removed) mid-run split and watching this arm stay
    // green — so the arm was renamed to say what it pins, and the dead split was deleted.
    //
    // It still earns its place: a LEXICAL boundary rule was wrong in both directions
    // (probed) — an unregistered heading (NOTES) or a colon-suffixed one (DATES:) failed to
    // separate tables, while a registered token in a data cell falsely separated one — and
    // this arm walks the whole registry PLUS the two forms no registry can cover, so any
    // future attempt to reintroduce label-driven segmentation has to face all of them.
    const wide = [
      "| CREW | Role | Call | Out | Note |",
      "| --- | --- | --- | --- | --- |",
      "| Alice | A1 | 08:00 | 17:00 | x |",
      "| Bob | A2 | 08:00 | 17:00 | x |",
      "| Carla | A2 | 09:00 | 17:00 | x |",
      "| Dan | A3 | 09:00 | 17:00 | x |",
    ];
    premise("registry is populated", KNOWN_SECTION_HEADERS.size, 20);
    const headings = [...KNOWN_SECTION_HEADERS, "NOTES", "DATES:", "Site notes"];
    const offenders = headings.filter((heading) => {
      // Butted straight against the wider block with no blank line, so ONLY the boundary
      // rule can separate them. The trailing table's three rows are all width 4 against
      // the leading block's 5: miss the boundary and all three sit at modal-1.
      const md = [
        ...wide,
        `| ${heading} | Start | End | Note |`,
        "| --- | --- | --- | --- |",
        "| one | 3/1 | 3/1 | x |",
        "| two | 3/2 | 3/3 | x |",
        "",
      ].join("\n");
      return fused(md, "calibration.md").length > 0;
    });
    expect(offenders).toEqual([]);
  });

  it("does not treat a registered word in a DATA cell as a new section", () => {
    // KILLS: the lexical boundary in its "not necessary" direction. TRANSPORTATION rows
    // legitimately hold a `Driver` cell, and `Driver` is a registered heading. Splitting
    // there cut this section in two and turned a tied, skipped width distribution into a
    // reported warning — a false positive produced by ordinary sheet content.
    //
    // The fixture must make the split CHANGE THE ANSWER, and an earlier version did not:
    // it returned [] both ways, for unrelated reasons, so it pinned nothing. Cross-model
    // review caught that. Here the widths tie 3-3 across the whole section, so the correct
    // reading skips it; splitting at the `Driver` row leaves 5,5,4 in the leading half,
    // where the 4 is modal-1 and is reported.
    const md = [
      "| TRANSPORTATION | A | B | C | D |",
      "| --- | --- | --- | --- | --- |",
      "| Greeter | 1 | 2 | 3 | 4 |",
      "| Greeter | 1 | 2 | 3 | 4 |",
      "| Shorty | 1 | 2 | 3 |",
      "| Driver | 1 | 2 | 3 | 4 |",
      "| Runner | 1 | 2 | 3 |",
      "| Helper | 1 | 2 | 3 |",
      "",
    ].join("\n");
    expect(fused(md, "calibration.md")).toEqual([]);
  });

  it("counts an escaped in-cell pipe as text, not as a column divider", () => {
    // KILLS: counting cells with the escape-blind `splitRow`. The exporter writes a
    // literal pipe inside a cell as `\|`; counted as a delimiter it inflates that row by
    // one, so a section where only SOME rows carry one goes bimodal and the rows WITHOUT
    // one land at modal-1. Probed by cross-model review against the shipped detector: the
    // perfectly ordinary `| Carla | A3 | Local | 17:00 |` was reported as fused.
    //
    // The HEADER carries an escaped pipe too, and that is load-bearing: with escaped
    // pipes only on the data rows the counts split 3-2 and the §5.3 tie-guard skips the
    // section, so the bug hides for a reason unrelated to escaping. Measured on the first
    // version of this arm, which passed against the escape-blind mutant.
    const md = [
      "| CREW | Role | Route \\| notes | Out |",
      "| --- | --- | --- | --- |",
      "| Alice | A1 | JFK \\| LAX | 17:00 |",
      "| Bob | A2 | EWR \\| ORD | 17:00 |",
      "| Carla | A3 | Local | 17:00 |",
      "",
    ].join("\n");
    expect(fused(md, "calibration.md")).toEqual([]);
  });

  it("does not read an ordinary row of dashes as a table boundary", () => {
    // KILLS: guarding the per-cell alignment check with `cells > 0`. `cells` increments
    // AFTER the check runs, so on the FIRST cell it was still 0 and the check was skipped
    // -- any row whose first cell was text and whose remaining cells were dashes passed as
    // an alignment row. Probed by cross-model review.
    //
    // The fixture is built so misclassification CHANGES THE ANSWER, which the reviewer's
    // original shape no longer does now that headers are excluded from the population:
    //   correct  -> one section; C is the lone row at modal-1 and is reported.
    //   mutant   -> the placeholder splits the table, C becomes the next section's HEADER,
    //               and the leading half drops to 2 data rows, under the floor. Silence.
    // So the arm fails on a SUPPRESSED true positive rather than on an extra false one,
    // and it names the row, so the detector cannot pass by warning about something else.
    const md = [
      "| CREW | Role | Call | Out | Note |",
      "| --- | --- | --- | --- | --- |",
      "| A | r | c | o | n |",
      "| B | r | c | o | n |",
      "| C | r | c | o |",
      "| Placeholder | --- | --- | --- | --- |",
      "| X | r | c | o | n |",
      "| Y | r | c | o | n |",
      "| Z | r | c | o | n |",
      "",
    ].join("\n");
    const w = fused(md, "calibration.md");
    expect(w).toHaveLength(1);
    expect(w[0]!.rawSnippet).toBe("| C | r | c | o |");
  });

  it("requires delimiter cells to be well FORMED, not merely dash-flavored", () => {
    // KILLS: validating alignment by character membership instead of grammar. Tracking
    // "saw a dash" / "saw a colon" accepts `--:--`, `::---` and `- - -`, none of which are
    // delimiters; a row of them became a false structural boundary, split the section, and
    // reported a valid row. Probed by cross-model review, which named all three shapes.
    //
    // The fixture makes the split OBSERVABLE: split, C lands at modal-1 in the leading
    // half and is reported; unsplit, the whole section ties and is skipped. Each shape is
    // asserted separately so a rule that fixes one and not the others still fails.
    for (const token of ["--:--", "::---", "- - -", ":-:-:", "---x"]) {
      const md = [
        "| CREW | Role | Call | Out | Note |",
        "| --- | --- | --- | --- | --- |",
        "| A | r | c | o | n |",
        "| B | r | c | o | n |",
        "| C | r | c | o |",
        "| P | r | c | o | n |",
        `| ${token} | ${token} | ${token} | ${token} | ${token} |`,
        "| Q | r | c | o |",
        "| R | r | c | o |",
        "| S | r | c | o |",
        "",
      ].join("\n");
      expect(fused(md, "calibration.md"), `token ${token}`).toEqual([]);
    }
  });

  it("does not let a stray cell-less pipe line become a boundary", () => {
    // KILLS: dropping `if (cells === 0) alignment = false`. A lone `|` closes no cell, so
    // a grammar check over zero cells is vacuously satisfied and the line would read as a
    // delimiter — splitting the table and promoting the row above it to a header. The
    // input is malformed, but it is reachable (any line starting with `|` is a row here),
    // and the failure it causes is a warning on well-formed rows around it.
    const md = [
      "| CREW | Role | Call | Out | Note |",
      "| --- | --- | --- | --- | --- |",
      "| A | r | c | o | n |",
      "| B | r | c | o | n |",
      "| C | r | c | o |",
      "| P | r | c | o | n |",
      "|",
      "| Q | r | c | o |",
      "| R | r | c | o |",
      "| S | r | c | o |",
      "",
    ].join("\n");
    expect(fused(md, "calibration.md")).toEqual([]);
  });

  it("abstains on a run holding a SECOND delimiter-shaped row", () => {
    // KILLS: treating every delimiter-shaped row as a table boundary. A markdown table has
    // exactly ONE delimiter, under its header, so a second one in the same run is ambiguous
    // by construction -- either a butted second table or an ordinary data row whose cells
    // all read `-`/`---`, which sheets do write as placeholders. Nothing in the text tells
    // them apart, and guessing split the section and reported a valid row. Probed by
    // cross-model review across every shape ALIGNMENT_CELL admits, which is why this arm
    // iterates them rather than picking one.
    //
    // Abstention costs nothing measurable: across the 17 registry fixtures there are 514
    // pipe runs and NONE holds two delimiter-shaped rows, because real sheets separate
    // tables with a blank line -- which starts a new run and leaves detection intact.
    for (const token of ["-", "---", ":---", "---:", ":---:"]) {
      const md = [
        "| CREW | Role | Call | Out | Note |",
        "| --- | --- | --- | --- | --- |",
        "| A | r | c | o | n |",
        "| B | r | c | o | n |",
        "| C | r | c | o |",
        "| P | r | c | o | n |",
        `| ${token} | ${token} | ${token} | ${token} | ${token} |`,
        "| Q | r | c | o |",
        "| R | r | c | o |",
        "| S | r | c | o |",
        "",
      ].join("\n");
      expect(fused(md, "calibration.md"), `placeholder ${token}`).toEqual([]);
    }
  });

  it("measures the modal over DATA rows, letting a narrower header be narrower", () => {
    // KILLS: including the table header in the measured population. A section title
    // spanning fewer cells than its columns is ordinary sheet authoring, and counted as
    // data it is the single row at modal-1 -- so the detector reported the HEADER as a
    // fused data row. Probed by cross-model review.
    //
    // The control matters: with a full-width header the same fixture must stay silent, so
    // the arm cannot pass by the detector having gone quiet altogether.
    const rows = (header: string) =>
      [
        header,
        "| --- | --- | --- | --- | --- |",
        "| A | r | c | o | n |",
        "| B | r | c | o | n |",
        "| C | r | c | o | n |",
        "",
      ].join("\n");
    expect(fused(rows("| CREW | Role | Call | Out |"), "calibration.md")).toEqual([]);
    expect(fused(rows("| CREW | Role | Call | Out | Note |"), "calibration.md")).toEqual([]);
  });

  it("DOCUMENTED EQUIVALENCE: the 3-row floor is redundant with the tie-guard", () => {
    // Stated because a reader (or a mutation run) will find that lowering
    // MIN_DATA_ROWS_FOR_MODAL to 1 changes no observable behavior, and should get an
    // answer here rather than file it as an untested constant.
    //
    // A section with ONE data row has modal == its own width, and no row can sit at
    // modal-1. A section with TWO either shares a width (same argument) or splits 1-1,
    // which the tie-guard skips. So no input separates the two settings; the constant is
    // an explicit restatement of the spec §5.3 floor, deliberately kept for that reason.
    //
    // The equivalence is about the VALUE, not the check. Measured: 3 -> 2 and 3 -> 1 both
    // leave every arm green, while DELETING the guard outright fails all of them, because
    // an empty section then reaches `sorted[0]!` and throws. The comparison is redundant;
    // the non-null guard underneath it is not.
    const oneRow = "| CREW | Role | Call |\n| --- | --- | --- |\n";
    const twoRowsRagged = "| CREW | Role | Call |\n| --- | --- | --- |\n| Alice | A1 |\n";
    expect(fused(oneRow, "calibration.md")).toEqual([]);
    expect(fused(twoRowsRagged, "calibration.md")).toEqual([]);
  });
});

describe("scanFusedRows reports the line of every hit; the emitter maps it (spec 2026-08-29 §2.3)", () => {
  // Four data rows, three of them three cells wide and one two cells wide: the modal is 3,
  // so the short row is at modal - 1 and is the only hit. Line indexes are the fixture's own.
  const md = [
    "| CREW | A | B |",
    "| :---: | :---: | :---: |",
    "| a | b | c |",
    "| d | e | f |",
    "| g | h |",
    "| i | j | k |",
  ].join("\n");

  it("positions: the short row's line index, and the emitter maps the same hits", () => {
    expect(scanFusedRows(md).map(({ line, kind }) => [line, kind])).toEqual([[4, "crew"]]);
    const hits = scanFusedRows(md);
    const warnings = detectFusedRows(md);
    expect(warnings.map((w) => [w.blockRef?.kind, w.rawSnippet])).toEqual(
      hits.map((h) => [h.kind, h.snippet]),
    );
    expect(warnings).toHaveLength(1);
  });

  it("an ambiguous run (two delimiter rows) yields no hits from either", () => {
    const ambiguous = [md, "| :---: | :---: | :---: |"].join("\n");
    expect(scanFusedRows(ambiguous)).toEqual([]);
    expect(detectFusedRows(ambiguous)).toEqual([]);
  });
});
