import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  renderRow,
  synthesizeBlocksFromXlsx,
  synthesizeMarkdownFromXlsx,
} from "@/lib/drive/exportSheetToMarkdown";
import { buildXlsx } from "../helpers/buildXlsx";

// Verbatim copy of `regionA` from tests/drive/exportSheetArchivedPullSheet.test.ts lines
// 7-13 (module-local there, not exported): five rows, which that suite proves yield
// exactly one archived pull-sheet region.
const regionA: string[][] = [
  ["PULL SHEET", "PULL SHEET"],
  ["RIA - CHICAGO, IL"],
  [], // separator -> collectDataBlock scans forward
  ["QTY", "ITEM"],
  ["2", "Shure SM58"],
];

function workbook(tabs: Record<string, string[][]>): ArrayBuffer {
  return buildXlsx(Object.entries(tabs).map(([name, grid]) => ({ name, grid })));
}

describe("synthesizeBlocksFromXlsx carries coordinates the markdown loses (spec §2.2)", () => {
  it("splits at blank rows, keeps each row's absolute sheet row, and records the block's first column", () => {
    // Row 0 blank, rows 1-2 a block starting in column B, row 3 blank, rows 4-5 a block in column A.
    const buf = workbook({
      INFO: [
        [],
        ["", "Timestamp", "t"],
        ["", "Backdrop", ""],
        [],
        ["Console", "QU-16"],
        ["Speaker", "KLA"],
      ],
    });
    const { blocks } = synthesizeBlocksFromXlsx(buf);
    const grids = blocks.filter((b) => b.kind === "grid");
    expect(
      grids.map((b) => ({ sheet: b.sheetName, col: b.absCol0, rows: b.rows.map((r) => r.absRow) })),
    ).toEqual([
      { sheet: "INFO", col: 1, rows: [1, 2] },
      { sheet: "INFO", col: 0, rows: [4, 5] },
    ]);
    expect(grids[0]!.rows[1]!.cells).toEqual(["Backdrop", ""]);
  });

  it("the synthesized PULL SHEET title row has no source row (absRow null); the data rows keep theirs", () => {
    const buf = workbook({
      "PULL SHEET": [
        ["Show Title", ""],
        ["", ""],
        ["1", "Cable", "x"],
        ["2", "Stand", "y"],
      ],
    });
    const { blocks } = synthesizeBlocksFromXlsx(buf);
    const grid = blocks.find((b) => b.kind === "grid" && b.sheetName === "PULL SHEET");
    expect(grid && grid.kind === "grid" ? grid.rows.map((r) => r.absRow) : null).toEqual([
      null,
      2,
      3,
    ]);
  });

  it("a non-included OLD tab yields no block; an included OLD pull-sheet region is opaque", () => {
    const none = synthesizeBlocksFromXlsx(
      buildXlsx([
        { name: "INFO", grid: [["Show", "X"]] },
        { name: "OLD PULL SHEET", grid: regionA },
      ]),
    );
    expect(none.archivedPullSheetTabs).toHaveLength(1);
    expect(none.blocks.every((b) => b.kind === "grid" && b.sheetName === "INFO")).toBe(true);
    const included = synthesizeBlocksFromXlsx(
      buildXlsx([
        { name: "INFO", grid: [["Show", "X"]] },
        { name: "OLD PULL SHEET", grid: regionA },
      ]),
      { includePullSheetFromTab: "OLD PULL SHEET" },
    );
    expect(
      included.blocks.some((b) => b.kind === "opaque" && b.markdown.includes("Shure SM58")),
    ).toBe(true);
  });

  it("renderRow pads to the width and escapes exactly as tableMarkdown does", () => {
    expect(renderRow(["a#b", "c|d"], 3)).toBe("| a\\#b | c\\|d |  |");
    // trimBlock slices the all-blank third column, so the rendered width is 2 - derived
    // from the fixture, not chosen.
    const buf = workbook({
      INFO: [
        ["a#b", "c|d", ""],
        ["x", "", ""],
      ],
    });
    expect(synthesizeMarkdownFromXlsx(buf).markdown.split("\n")[0]).toBe(
      renderRow(["a#b", "c|d"], 2),
    );
  });
});
