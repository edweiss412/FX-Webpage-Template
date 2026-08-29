import { describe, expect, it } from "vitest";
import { scanBlockCells, scanRowsWithOpener } from "@/lib/parser/blocks/_rowScan";
import { clean } from "@/lib/parser/blocks/_helpers";
import { premiseHolds } from "@/tests/_shared/premise";

describe("scanBlockCells", () => {
  it("takes the opener from row 0 cell 0, skips alignment-shaped rows, and keeps each row's input index", () => {
    const rows = [
      ["Timestamp", "6/1/2025"],
      [":---:", ":---:"],
      ["Room Diagram", ""],
      ["", ""], // alignment-shaped (every cell matches /^[\s:|*-]*$/) -> skipped
      ["Backdrop", "x"],
    ];
    // Value cells per KEPT row, after column 0: 1 ("6/1/2025"), 0 (""), 1 ("x"). Minimum 0.
    expect(scanBlockCells(rows)).toEqual([
      { cells: ["Timestamp", "6/1/2025"], opener: "Timestamp", index: 0, blockMinValueCells: 0 },
      { cells: ["Room Diagram", ""], opener: "Timestamp", index: 2, blockMinValueCells: 0 },
      { cells: ["Backdrop", "x"], opener: "Timestamp", index: 4, blockMinValueCells: 0 },
    ]);
  });

  it("an alignment row as row 0 still supplies the opener text, exactly as the markdown shell does today", () => {
    // `clean` does not rewrite `:---:` (probed 2026-08-27 against the live shell:
    // scanRowsWithOpener("| :---: |\n| A | 1 |") yields opener ":---:"). The shell's
    // doc comment's "normalizes to the empty string" is about the CALLER's namespace
    // derivation (anchorNamespace), not about `clean`. Pinned here so the extraction
    // cannot quietly change the opener a degenerate table reports.
    // One kept row, one value cell ("1"), so the block minimum is 1.
    expect(scanBlockCells([[":---:"], ["A", "1"]])).toEqual([
      { cells: ["A", "1"], opener: ":---:", index: 1, blockMinValueCells: 1 },
    ]);
  });

  it("empty input yields no rows", () => {
    expect(scanBlockCells([])).toEqual([]);
  });
});

describe("blockMinValueCells is the block's MINIMUM value-cell count", () => {
  // A value cell is a non-empty CLEANED cell after column 0. The statistic is the
  // minimum over the block's KEPT rows, which is what separates an inventory matrix
  // (uniformly wide, every row a grid line) from a field list (always holding at least
  // one narrow label-and-value row, however wide its other rows are). See
  // docs/superpowers/specs/parser/2026-08-28-nearmiss-candidacy-field-lists-design.md
  // section 3.1.

  it("a two-column field list reports 1", () => {
    const rows = [
      ["VENUE", "Hilton"],
      ["Address", "1 Main"],
    ];
    expect(scanBlockCells(rows).map((r) => r.blockMinValueCells)).toEqual([1, 1]);
  });

  it("a uniformly wide grid reports its true width, not a constant", () => {
    // Every row carries six value cells, so the minimum IS six. A skeleton returning a
    // fixed 0, and a count that forgot to skip column 0 (which would report 7), both fail.
    const rows = [
      ["Console", "a", "b", "c", "d", "e", "f"],
      ["Speaker", "g", "h", "i", "j", "k", "l"],
      ["Mic", "m", "n", "o", "p", "q", "r"],
    ];
    expect(scanBlockCells(rows).map((r) => r.blockMinValueCells)).toEqual([6, 6, 6]);
  });

  it("a block mixing wide and narrow rows reports the NARROW row", () => {
    // The discriminating case for the statistic's IDENTITY. Value cells: 8 then 1.
    // Minimum 1 (correct); maximum would be 8; mean would be 4.5; the first row's own
    // count would be 8. Only the minimum passes, so a max, a mean, a first-row read and
    // a last-row read each fail here.
    const rows = [
      ["client", "a", "b", "c", "d", "e", "f", "g", "h"],
      ["Room Diagram", "yes"],
    ];
    const scanned = scanBlockCells(rows);
    premiseHolds("the block really does hold a row at 8 value cells", scanned.length === 2);
    expect(scanned.map((r) => r.blockMinValueCells)).toEqual([1, 1]);
  });

  it("alignment rows are dropped BEFORE the minimum is taken", () => {
    // The alignment row carries zero value cells after column 0, so counting it would
    // drag every block's minimum to 0 and the matrix arm would never fire on anything.
    const rows = [["A", "1", "2"], [":---:"], ["B", "3", "4"]];
    expect(scanBlockCells(rows).map((r) => r.blockMinValueCells)).toEqual([2, 2]);
  });

  it("a cell that is non-empty RAW but empty once cleaned is not a value cell", () => {
    // No corpus input distinguishes the raw definition from the cleaned one (measured:
    // 0 of 44,446 value cells), so the witness is constructed. Its premise is that the
    // construction actually differs under the two definitions.
    const invisible = "\u200B"; // ZWSP, the class `clean` strips
    premiseHolds("the constructed cell is non-empty raw", invisible.length > 0);
    premiseHolds("and empty once cleaned", clean(invisible) === "");
    const rows = [
      ["A", invisible, "x"],
      ["B", "y", "z"],
    ];
    // Cleaned: row A has 1 value cell, row B has 2, so the minimum is 1. Counting raw
    // non-empty cells would make both rows 2 and report 2.
    expect(scanBlockCells(rows).map((r) => r.blockMinValueCells)).toEqual([1, 1]);
  });
});

describe("scanRowsWithOpener is the markdown shell over scanBlockCells", () => {
  it("two pipe runs separated by a blank line get their own openers and drop the delimiter rows", () => {
    const md = [
      "| VENUE | Hilton |",
      "| :---: | :---: |",
      "| Address | 1 Main |",
      "",
      "| Timestamp | t |",
      "| :---: | :---: |",
      "| Backdrop | |",
    ].join("\n");
    // Run 1 minimum 1 (both rows carry a value); run 2 minimum 0 (`| Backdrop | |`
    // carries none). The two differ, so the shell is carrying a PER-BLOCK statistic
    // rather than one number for the document.
    expect(scanRowsWithOpener(md)).toEqual([
      { cells: ["VENUE", "Hilton"], opener: "VENUE", blockMinValueCells: 1 },
      { cells: ["Address", "1 Main"], opener: "VENUE", blockMinValueCells: 1 },
      { cells: ["Timestamp", "t"], opener: "Timestamp", blockMinValueCells: 0 },
      { cells: ["Backdrop", ""], opener: "Timestamp", blockMinValueCells: 0 },
    ]);
  });

  it("a SINGLE-row run is flushed at its boundary: the next run does not inherit its rows or its opener", () => {
    // The one-row run is the case a length-guarded flush gets wrong: skip the flush and
    // `run` is never reset, so the next table's rows join it under the FIRST opener.
    const md = ["| VENUE |", "", "| Timestamp | t |", "| Backdrop | |"].join("\n");
    expect(scanRowsWithOpener(md)).toEqual([
      { cells: ["VENUE"], opener: "VENUE", blockMinValueCells: 0 },
      { cells: ["Timestamp", "t"], opener: "Timestamp", blockMinValueCells: 0 },
      { cells: ["Backdrop", ""], opener: "Timestamp", blockMinValueCells: 0 },
    ]);
  });

  it("a document ending in a single-row run still emits that row", () => {
    expect(scanRowsWithOpener("| VENUE | Hilton |\n\n| Lone |")).toEqual([
      { cells: ["VENUE", "Hilton"], opener: "VENUE", blockMinValueCells: 1 },
      { cells: ["Lone"], opener: "Lone", blockMinValueCells: 0 },
    ]);
  });
});
