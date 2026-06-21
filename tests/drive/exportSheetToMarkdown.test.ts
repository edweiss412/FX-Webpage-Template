import { describe, expect, test } from "vitest";
import * as XLSX from "xlsx";
import { synthesizeMarkdownFromXlsx } from "@/lib/drive/exportSheetToMarkdown";

function workbookBuffer(
  sheets: Array<{
    name: string;
    rows: unknown[][];
    merges?: XLSX.Range[];
  }>,
): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const worksheet = XLSX.utils.aoa_to_sheet(sheet.rows);
    if (sheet.merges) worksheet["!merges"] = sheet.merges;
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
  }
  return XLSX.write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
}

describe("synthesizeMarkdownFromXlsx", () => {
  test("emits a single GFM table with centered alignment delimiters", () => {
    const markdown = synthesizeMarkdownFromXlsx(
      workbookBuffer([
        {
          name: "INFO",
          rows: [
            ["CLIENT", "EVENT"],
            ["ACME", "Forum"],
          ],
        },
      ]),
    );

    expect(markdown).toBe(
      ["| CLIENT | EVENT |", "| :---: | :---: |", "| ACME | Forum |"].join("\n"),
    );
  });

  test("keeps tabs and blank-row-separated blocks as separate table blocks", () => {
    const markdown = synthesizeMarkdownFromXlsx(
      workbookBuffer([
        {
          name: "INFO",
          rows: [
            ["CLIENT", "EVENT"],
            ["ACME", "Forum"],
            [],
            ["DATE", "VENUE"],
            ["5/1/25", "Ballroom"],
          ],
        },
        {
          name: "CONTACTS",
          rows: [
            ["NAME", "EMAIL"],
            ["Doug", "doug@example.com"],
          ],
        },
      ]),
    );

    expect(markdown).toBe(
      [
        "| CLIENT | EVENT |",
        "| :---: | :---: |",
        "| ACME | Forum |",
        "",
        "| DATE | VENUE |",
        "| :---: | :---: |",
        "| 5/1/25 | Ballroom |",
        "",
        "| NAME | EMAIL |",
        "| :---: | :---: |",
        "| Doug | doug@example.com |",
      ].join("\n"),
    );
  });

  test("expands merged cells across the merged range", () => {
    const markdown = synthesizeMarkdownFromXlsx(
      workbookBuffer([
        {
          name: "PULL SHEET",
          rows: [
            ["OLD PULL SHEET", "", ""],
            ["ITEM", "QTY", "NOTES"],
            ["Monitor", 2, ""],
          ],
          merges: [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }],
        },
      ]),
    );

    expect(markdown).toBe(
      [
        "| OLD PULL SHEET | OLD PULL SHEET | OLD PULL SHEET |",
        "| :---: | :---: | :---: |",
        "| ITEM | QTY | NOTES |",
        "| Monitor | 2 |  |",
      ].join("\n"),
    );
  });

  test("collapses legacy pull-sheet title bands into the parser-facing case header", () => {
    const markdown = synthesizeMarkdownFromXlsx(
      workbookBuffer([
        {
          name: "PULL SHEET",
          rows: [
            ["PULL SHEET", "", "", "", ""],
            [],
            [],
            [],
            ["RIA - CHICAGO, IL\nLakeview - 7th Floor\nSet: 4/15/24 - 7:00am", "", "", "", ""],
            [],
            [],
            [],
            [1, "FOH Rack", "", "FOH", false],
          ],
          merges: [
            { s: { r: 0, c: 0 }, e: { r: 3, c: 4 } },
            { s: { r: 4, c: 0 }, e: { r: 7, c: 4 } },
          ],
        },
      ]),
    );

    expect(markdown).toBe(
      [
        "| PULL SHEET/RIA - CHICAGO, IL&#10;Lakeview - 7th Floor&#10;Set: 4/15/24 - 7:00am | PULL SHEET/RIA - CHICAGO, IL&#10;Lakeview - 7th Floor&#10;Set: 4/15/24 - 7:00am | PULL SHEET/RIA - CHICAGO, IL&#10;Lakeview - 7th Floor&#10;Set: 4/15/24 - 7:00am | PULL SHEET/RIA - CHICAGO, IL&#10;Lakeview - 7th Floor&#10;Set: 4/15/24 - 7:00am | PULL SHEET/RIA - CHICAGO, IL&#10;Lakeview - 7th Floor&#10;Set: 4/15/24 - 7:00am |",
        "| :---: | :---: | :---: | :---: | :---: |",
        "| 1 | FOH Rack |  | FOH | FALSE |",
      ].join("\n"),
    );
  });

  test("skips archived 'OLD …' tabs entirely (stale prior-show data)", () => {
    const markdown = synthesizeMarkdownFromXlsx(
      workbookBuffer([
        { name: "INFO", rows: [["CLIENT", "ACME Forum"]] },
        {
          name: "OLD PULL SHEET",
          rows: [
            ["PULL SHEET", ""],
            [1, "Stale Prior-Show Gear"],
          ],
        },
      ]),
    );
    // The OLD tab contributes nothing; only INFO survives.
    expect(markdown).toContain("ACME Forum");
    expect(markdown).not.toContain("Stale Prior-Show Gear");
    expect(markdown).not.toContain("PULL SHEET");
  });

  test("preserves the DETAILS value column (col B) — label-only collapse removed", () => {
    // The live source sheets populate col B for DETAILS (Stage Size, Opening
    // Reel, Polling, Power, ...). The value column must survive so
    // parseEventDetails fills event_details. Previously collapsed to label-only
    // on a false premise (a Drive-MCP rendering artifact); see the 2026-06-18
    // grounding audit / DEFERRED AUDIT-2026-06-18-PARSE-FIDELITY-DEF-1.
    const markdown = synthesizeMarkdownFromXlsx(
      workbookBuffer([
        {
          name: "INFO",
          rows: [
            ["DETAILS", ""],
            ["Floor Plan", "LINK"],
            ["Room Diagram", "LINK"],
          ],
        },
      ]),
    );

    expect(markdown).toBe(
      [
        "| DETAILS |  |",
        "| :---: | :---: |",
        "| Floor Plan | LINK |",
        "| Room Diagram | LINK |",
      ].join("\n"),
    );
  });

  test("drops merged room-title rows before GS/BO equipment tables", () => {
    const markdown = synthesizeMarkdownFromXlsx(
      workbookBuffer([
        {
          name: "INFO",
          rows: [
            ["GENERAL SESSION\nLAKEVIEW BALLROOM\n61' x 55' x 11'\n7th Floor"],
            ["GS Setup", "Pods"],
            ["GS Set Time", "5/12 @ 6:30 AM"],
          ],
        },
      ]),
    );

    expect(markdown).toBe(
      ["| GS Setup | Pods |", "| :---: | :---: |", "| GS Set Time | 5/12 @ 6:30 AM |"].join("\n"),
    );
  });

  test("escapes parser-significant characters and converts embedded newlines", () => {
    const markdown = synthesizeMarkdownFromXlsx(
      workbookBuffer([
        {
          name: "LIST",
          rows: [
            ["A|B", "#NUM!", "PATH", "NOTES"],
            ["x\\y", "ok!", "C:\\Temp", "line one\nline two"],
          ],
        },
      ]),
    );

    expect(markdown).toBe(
      [
        "| A\\|B | \\#NUM\\! | PATH | NOTES |",
        "| :---: | :---: | :---: | :---: |",
        "| x\\\\y | ok! | C:\\\\Temp | line one&#10;line two |",
      ].join("\n"),
    );
  });
});
