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
      if (dataIdx.length >= 3 && widths[0]! - 2 >= 3 && widths.every((w) => w === widths[0])) {
        const t = dataIdx[1]!;
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
  });
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

  it("DOCUMENTED EQUIVALENCE: the 3-row floor is redundant with the tie-guard", () => {
    // Stated because a reader (or a mutation run) will find that lowering
    // MIN_DATA_ROWS_FOR_MODAL to 1 changes no observable behavior, and should get an
    // answer here rather than file it as an untested constant.
    //
    // A section with ONE data row has modal == its own width, and no row can sit at
    // modal-1. A section with TWO either shares a width (same argument) or splits 1-1,
    // which the tie-guard skips. So no input separates the two settings; the constant is
    // an explicit restatement of the spec §5.3 floor, deliberately kept for that reason.
    const oneRow = "| CREW | Role | Call |\n| --- | --- | --- |\n";
    const twoRowsRagged = "| CREW | Role | Call |\n| --- | --- | --- |\n| Alice | A1 |\n";
    expect(fused(oneRow, "calibration.md")).toEqual([]);
    expect(fused(twoRowsRagged, "calibration.md")).toEqual([]);
  });
});
