import { describe, expect, it } from "vitest";
import { scanBlockCells, scanRowsWithOpener } from "@/lib/parser/blocks/_rowScan";

describe("scanBlockCells", () => {
  it("takes the opener from row 0 cell 0, skips alignment-shaped rows, and keeps each row's input index", () => {
    const rows = [
      ["Timestamp", "6/1/2025"],
      [":---:", ":---:"],
      ["Room Diagram", ""],
      ["", ""], // alignment-shaped (every cell matches /^[\s:|*-]*$/) -> skipped
      ["Backdrop", "x"],
    ];
    expect(scanBlockCells(rows)).toEqual([
      { cells: ["Timestamp", "6/1/2025"], opener: "Timestamp", index: 0 },
      { cells: ["Room Diagram", ""], opener: "Timestamp", index: 2 },
      { cells: ["Backdrop", "x"], opener: "Timestamp", index: 4 },
    ]);
  });

  it("an alignment row as row 0 still supplies the opener text, exactly as the markdown shell does today", () => {
    // `clean` does not rewrite `:---:` (probed 2026-08-27 against the live shell:
    // scanRowsWithOpener("| :---: |\n| A | 1 |") yields opener ":---:"). The shell's
    // doc comment's "normalizes to the empty string" is about the CALLER's namespace
    // derivation (anchorNamespace), not about `clean`. Pinned here so the extraction
    // cannot quietly change the opener a degenerate table reports.
    expect(scanBlockCells([[":---:"], ["A", "1"]])).toEqual([
      { cells: ["A", "1"], opener: ":---:", index: 1 },
    ]);
  });

  it("empty input yields no rows", () => {
    expect(scanBlockCells([])).toEqual([]);
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
    expect(scanRowsWithOpener(md)).toEqual([
      { cells: ["VENUE", "Hilton"], opener: "VENUE" },
      { cells: ["Address", "1 Main"], opener: "VENUE" },
      { cells: ["Timestamp", "t"], opener: "Timestamp" },
      { cells: ["Backdrop", ""], opener: "Timestamp" },
    ]);
  });

  it("a SINGLE-row run is flushed at its boundary: the next run does not inherit its rows or its opener", () => {
    // The one-row run is the case a length-guarded flush gets wrong: skip the flush and
    // `run` is never reset, so the next table's rows join it under the FIRST opener.
    const md = ["| VENUE |", "", "| Timestamp | t |", "| Backdrop | |"].join("\n");
    expect(scanRowsWithOpener(md)).toEqual([
      { cells: ["VENUE"], opener: "VENUE" },
      { cells: ["Timestamp", "t"], opener: "Timestamp" },
      { cells: ["Backdrop", ""], opener: "Timestamp" },
    ]);
  });

  it("a document ending in a single-row run still emits that row", () => {
    expect(scanRowsWithOpener("| VENUE | Hilton |\n\n| Lone |")).toEqual([
      { cells: ["VENUE", "Hilton"], opener: "VENUE" },
      { cells: ["Lone"], opener: "Lone" },
    ]);
  });
});
