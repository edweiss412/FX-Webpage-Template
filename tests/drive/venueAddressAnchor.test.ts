// tests/drive/venueAddressAnchor.test.ts
//
// warning-card-fixes §4.2 item 3: VENUE_ADDRESS_MISSING links the empty value cell of the
// venue block's one address row, on both venue layouts, and falls back to the venue region
// otherwise. Every expected cell is DERIVED from the workbook (the label cell's row, its
// column + 1), never typed: a fixture edit moves the expectation with the fixture.
import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extractVenueAddressAnchor, resolveVenueAddressCell } from "@/lib/drive/venueAddressAnchor";
import { synthesizeMarkdownFromXlsx, type GridBlock } from "@/lib/drive/exportSheetToMarkdown";
import { attachSourceCellAnchors } from "@/lib/drive/showDayTimeAnchors";
import { parseSheet } from "@/lib/parser";
import { attachWarningAnchors } from "@/lib/sync/attachWarningAnchors";
import { premiseHolds } from "@/tests/_shared/premise";

const CODE = "VENUE_ADDRESS_MISSING";

/** Read a committed workbook as a standalone ArrayBuffer. `readFileSync(...).buffer` is a
 *  POOLED allocation for small files and would carry a byteOffset; slice it. */
function fixtureBuffer(relative: string): ArrayBuffer {
  const b = readFileSync(join(process.cwd(), relative));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

function load(file: string) {
  const buffer = fixtureBuffer(`fixtures/shows/exporter-xlsx/${file}`);
  const wb = XLSX.read(buffer, { type: "array" });
  const gids = new Map(wb.SheetNames.map((n, i) => [n, i] as const));
  return { buffer, wb, gids };
}

/** Write an edited workbook back to bytes, as the unknownFieldAnchors suite's
 *  `buildWorkbook` does. */
function rewrite(wb: XLSX.WorkBook): ArrayBuffer {
  const out: unknown = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return out instanceof Uint8Array
    ? (out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer)
    : (out as ArrayBuffer);
}

/** Every cell on `tab` whose trimmed text equals `text`. Independent of the code under test. */
function hitsOf(wb: XLSX.WorkBook, tab: string, text: string): XLSX.CellAddress[] {
  const ws = wb.Sheets[tab];
  if (!ws || !ws["!ref"]) throw new Error(`no ${tab} tab`);
  const range = XLSX.utils.decode_range(ws["!ref"]);
  const hits: XLSX.CellAddress[] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const v: unknown = ws[XLSX.utils.encode_cell({ r, c })]?.v;
      if (typeof v === "string" && v.trim() === text) hits.push({ r, c });
    }
  }
  return hits;
}

/** The one cell on `tab` whose trimmed text equals `text`. */
function cellOf(wb: XLSX.WorkBook, tab: string, text: string): XLSX.CellAddress {
  const hits = hitsOf(wb, tab, text);
  premiseHolds(`${tab}!${text} occurs exactly once`, hits.length === 1);
  return hits[0]!;
}

function valueAt(wb: XLSX.WorkBook, tab: string, at: XLSX.CellAddress): unknown {
  return wb.Sheets[tab]?.[XLSX.utils.encode_cell(at)]?.v;
}

const isBlankOrAbsent = (v: unknown) =>
  v === undefined || v === null || (typeof v === "string" && !/\S/.test(v));

function venueWarnings(buffer: ArrayBuffer) {
  const parsed = parseSheet(synthesizeMarkdownFromXlsx(buffer).markdown, "probe.md");
  return { parsed, venue: parsed.warnings.filter((w) => w.code === CODE) };
}

/** The value cell right of `label`, as the anchor the rule must produce. */
function expectedCell(gids: Map<string, number>, label: XLSX.CellAddress) {
  return {
    title: "INFO",
    gid: gids.get("INFO"),
    a1: XLSX.utils.encode_cell({ r: label.r, c: label.c + 1 }),
    scope: "cell",
  };
}

/** fintech.xlsx with the row below `VENUE ADDRESS` relabelled, so the venue block holds two
 *  address rows. */
function twoAddressFintech() {
  const { wb, gids } = load("fintech.xlsx");
  const label = cellOf(wb, "INFO", "VENUE ADDRESS");
  const below = { r: label.r + 1, c: label.c };
  premiseHolds(
    "the row below VENUE ADDRESS reads LOADING DOCK",
    valueAt(wb, "INFO", below) === "LOADING DOCK",
  );
  wb.Sheets.INFO![XLSX.utils.encode_cell(below)] = { t: "s", v: "VENUE ADDRESS" };
  premiseHolds(
    "two INFO cells now read VENUE ADDRESS",
    hitsOf(wb, "INFO", "VENUE ADDRESS").length === 2,
  );
  return { buffer: rewrite(wb), wb, gids };
}

/** east-coast.xlsx with the value right of `Hotel Address` deleted. */
function blankedEastCoast() {
  const { wb, gids } = load("east-coast.xlsx");
  const label = cellOf(wb, "INFO", "Hotel Address");
  const value = { r: label.r, c: label.c + 1 };
  const held = valueAt(wb, "INFO", value);
  premiseHolds(
    "the cell right of Hotel Address held a non-empty string",
    typeof held === "string" && /\S/.test(held),
  );
  delete wb.Sheets.INFO![XLSX.utils.encode_cell(value)];
  return { buffer: rewrite(wb), wb, gids, label };
}

const THREE_COLUMN = ["fintech.xlsx", "rpas.xlsx", "fixed-income.xlsx"] as const;

describe("extractVenueAddressAnchor on the committed workbooks", () => {
  it("3-column layout: every emitting workbook links the empty cell right of VENUE ADDRESS", () => {
    premiseHolds("the 3-column workbook list is non-empty", THREE_COLUMN.length > 0);
    for (const file of THREE_COLUMN) {
      const { buffer, wb, gids } = load(file);
      premiseHolds(`${file} emits exactly one ${CODE}`, venueWarnings(buffer).venue.length === 1);
      const label = cellOf(wb, "INFO", "VENUE ADDRESS");
      premiseHolds(
        `${file}: the label sits in column B, the scope row's second column`,
        label.c === 1,
      );
      premiseHolds(
        `${file}: the cell right of the label is empty or absent`,
        isBlankOrAbsent(valueAt(wb, "INFO", { r: label.r, c: label.c + 1 })),
      );
      expect(extractVenueAddressAnchor(buffer, gids), file).toEqual(expectedCell(gids, label));
    }
  });

  it("2-column layout: east-coast with its address value deleted links that cell", () => {
    const { buffer, gids, label } = blankedEastCoast();
    premiseHolds("the 2-column label sits in column A", label.c === 0);
    expect(extractVenueAddressAnchor(buffer, gids)).toEqual(expectedCell(gids, label));
  });

  it("negative twin of the 2-column case: unedited east-coast (address present) gives null", () => {
    const { buffer, wb, gids } = load("east-coast.xlsx");
    const label = cellOf(wb, "INFO", "Hotel Address");
    premiseHolds(
      "the address value is present",
      !isBlankOrAbsent(valueAt(wb, "INFO", { r: label.r, c: label.c + 1 })),
    );
    expect(extractVenueAddressAnchor(buffer, gids)).toBeNull();
  });

  it("negative twin of the 3-column case: two address rows in the venue block give null", () => {
    const { buffer, gids } = twoAddressFintech();
    expect(extractVenueAddressAnchor(buffer, gids)).toBeNull();
  });
});

describe("resolveVenueAddressCell: the pure rule on constructed blocks", () => {
  const grid = (sheetName: string, absCol0: number, rows: GridBlock["rows"]): GridBlock => ({
    kind: "grid",
    sheetName,
    sheetHidden: false,
    absCol0,
    rows,
  });
  const INFO_GIDS = new Map([["INFO", 7]]);
  const threeColumn = (sheetName = "INFO") =>
    grid(sheetName, 2, [
      { absRow: 12, cells: ["VENUE", "VENUE NAME", "Kimpton Gray"] },
      { absRow: 13, cells: ["", "VENUE ADDRESS", ""] },
    ]);
  // absCol0 2 + i 1 + 1 → column 4, row 13.
  const THREE_COLUMN_CELL = {
    title: "INFO",
    gid: 7,
    a1: XLSX.utils.encode_cell({ r: 13, c: 4 }),
    scope: "cell",
  };

  it("positive: the 3-column continuation row links its empty value cell", () => {
    expect(resolveVenueAddressCell([threeColumn()], INFO_GIDS)).toEqual(THREE_COLUMN_CELL);
  });

  it("no gid for INFO gives null", () => {
    expect(resolveVenueAddressCell([threeColumn()], new Map([["GEAR", 1]]))).toBeNull();
  });

  it("a block on a tab outside SOURCE_LINK_ALLOWLIST gives null", () => {
    const gids = new Map([
      ["INFO", 7],
      ["OLD INFO", 8],
    ]);
    expect(resolveVenueAddressCell([threeColumn("OLD INFO")], gids)).toBeNull();
  });

  it("a table with no VENUE header row (the v4 VENUE NAME-opened table, L1) gives null", () => {
    const rows = [
      { absRow: 4, cells: ["VENUE NAME", "Kimpton Gray"] },
      { absRow: 5, cells: ["VENUE ADDRESS", ""] },
    ];
    expect(resolveVenueAddressCell([grid("INFO", 0, rows)], INFO_GIDS)).toBeNull();
    // Twin: the same table under a VENUE header links its empty value cell (i = 0).
    const headed = [{ absRow: 3, cells: ["VENUE", ""] }, ...rows];
    expect(resolveVenueAddressCell([grid("INFO", 0, headed)], INFO_GIDS)).toEqual({
      title: "INFO",
      gid: 7,
      a1: XLSX.utils.encode_cell({ r: 5, c: 1 }),
      scope: "cell",
    });
  });

  it("a row whose cells[0] and cells[1] both resolve uses i = 0", () => {
    // With i = 0 the value cell is cells[1], which holds the second label, so nothing links.
    // An implementation that took i = 1 would link the blank cells[2].
    const both = grid("INFO", 2, [
      { absRow: 12, cells: ["VENUE", "VENUE NAME", "Kimpton Gray"] },
      { absRow: 13, cells: ["Hotel Address", "VENUE ADDRESS", ""] },
    ]);
    expect(resolveVenueAddressCell([both], INFO_GIDS)).toBeNull();
  });

  it("a row with absRow null is skipped", () => {
    // Two address rows, one with no sheet row: skipping it leaves exactly one, which links.
    const block = grid("INFO", 2, [
      { absRow: 12, cells: ["VENUE", "VENUE NAME", "Kimpton Gray"] },
      { absRow: null, cells: ["", "VENUE ADDRESS", ""] },
      { absRow: 13, cells: ["", "VENUE ADDRESS", ""] },
    ]);
    expect(resolveVenueAddressCell([block], INFO_GIDS)).toEqual(THREE_COLUMN_CELL);
  });
});

describe("the ingestion seam", () => {
  it("attachWarningAnchors gives the warning the value cell, and a region-only pass keeps it", async () => {
    const fintech = load("fintech.xlsx");
    const eastCoast = blankedEastCoast();
    const cases = [
      {
        name: "fintech.xlsx",
        buffer: fintech.buffer,
        gids: fintech.gids,
        expected: expectedCell(fintech.gids, cellOf(fintech.wb, "INFO", "VENUE ADDRESS")),
      },
      {
        name: "east-coast.xlsx, address blanked",
        buffer: eastCoast.buffer,
        gids: eastCoast.gids,
        expected: expectedCell(eastCoast.gids, eastCoast.label),
      },
    ];
    for (const c of cases) {
      const { parsed, venue } = venueWarnings(c.buffer);
      premiseHolds(`${c.name} emits exactly one ${CODE}`, venue.length === 1);
      await attachWarningAnchors(parsed.warnings, c.buffer, () => Promise.resolve(c.gids));
      const w = parsed.warnings.find((x) => x.code === CODE);
      expect(w?.sourceCell, c.name).toEqual(c.expected);
      // The cron's later region-only pass cannot demote the cell to a range.
      attachSourceCellAnchors(parsed.warnings, {
        showDay: [],
        crewRole: [],
        region: { venue: { title: "INFO", gid: 0, a1: "A1:C20" } },
      });
      expect(w?.sourceCell?.a1, c.name).toBe(c.expected.a1);
    }
  });

  it("two address rows fall back to the venue region through the seam", async () => {
    const { buffer, wb, gids } = twoAddressFintech();
    const { parsed, venue } = venueWarnings(buffer);
    premiseHolds(`the two-address variant emits exactly one ${CODE}`, venue.length === 1);
    await attachWarningAnchors(parsed.warnings, buffer, () => Promise.resolve(gids));
    const a1 = parsed.warnings.find((x) => x.code === CODE)?.sourceCell?.a1;
    expect(a1).toContain(":");
    const range = XLSX.utils.decode_range(a1!);
    const header = cellOf(wb, "INFO", "VENUE");
    expect(
      header.r >= range.s.r &&
        header.r <= range.e.r &&
        header.c >= range.s.c &&
        header.c <= range.e.c,
      `${a1} contains the VENUE header cell`,
    ).toBe(true);
  });
});
