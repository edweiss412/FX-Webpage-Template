import { describe, expect, test } from "vitest";
import * as XLSX from "xlsx";
import { synthesizeMarkdownFromXlsx } from "@/lib/drive/exportSheetToMarkdown";
import { parseSheet } from "@/lib/parser";

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
    const { markdown } = synthesizeMarkdownFromXlsx(
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
    const { markdown } = synthesizeMarkdownFromXlsx(
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
    const { markdown } = synthesizeMarkdownFromXlsx(
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
    const { markdown } = synthesizeMarkdownFromXlsx(
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
    const { markdown } = synthesizeMarkdownFromXlsx(
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
    const { markdown } = synthesizeMarkdownFromXlsx(
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

  test("PRESERVES the fused GS/BO room-title header before equipment tables", () => {
    // This header row was previously DROPPED (block.slice(1)) as a pre-parser
    // workaround. Since #1a the parser's parseGsRoom + splitRoomHeader read the fused
    // `GENERAL SESSION␊NAME␊DIMS␊FLOOR` header directly, so dropping it silently lost
    // the v2 GS room's dims + floor (and, for ria/redefining, its NAME → generic
    // "General Session"). Keep it — the multi-line cell space-joins per normalizeNewlines.
    const { markdown } = synthesizeMarkdownFromXlsx(
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
      [
        "| GENERAL SESSION LAKEVIEW BALLROOM 61' x 55' x 11' 7th Floor |  |",
        "| :---: | :---: |",
        "| GS Setup | Pods |",
        "| GS Set Time | 5/12 @ 6:30 AM |",
      ].join("\n"),
    );
  });

  test("FLATTENS a short 2-line fused GS header (dims/floor unfilled) — never emits &#10;", () => {
    // A GS room named but with dims + floor not yet recorded is a 2-LINE header cell.
    // shouldPreserveNewlines default-preserves a <3-line cell as &#10;; rooms.ts's v4 GS
    // guard (`!col0.includes("&#10;")`) then SKIPS it, silently dropping the entire
    // General Session room (exporter-gap audit, HIGH). Fused room/section headers must
    // flatten regardless of line count so splitRoomHeader can read them.
    const { markdown } = synthesizeMarkdownFromXlsx(
      workbookBuffer([
        {
          name: "INFO",
          rows: [
            ["GENERAL SESSION\nGRAND BALLROOM"],
            ["Setup", "Theater for 200"],
            ["Audio", "(2) Shure QLXD Handhelds"],
          ],
        },
      ]),
    );

    expect(markdown).not.toContain("&#10;");
    expect(markdown).toContain("| GENERAL SESSION GRAND BALLROOM |");
  });

  test("a 2-line GS header still yields a parsed General Session room (not dropped)", () => {
    const { markdown } = synthesizeMarkdownFromXlsx(
      workbookBuffer([
        {
          name: "INFO",
          rows: [
            ["GENERAL SESSION\nGRAND BALLROOM"],
            ["Setup", "Theater for 200"],
            ["Audio", "(2) Shure QLXD Handhelds"],
            ["Video", "Dual 16:9 screens"],
          ],
        },
      ]),
    );
    const gs = parseSheet(markdown, "synthetic.md").rooms.find((r) => r.kind === "gs");
    expect(gs?.name).toBe("GRAND BALLROOM");
    expect(gs?.setup).toBe("Theater for 200");
  });

  test("escapes parser-significant characters and converts embedded newlines", () => {
    const { markdown } = synthesizeMarkdownFromXlsx(
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

// Spec 2026-07-27-export-blank-row-segmentation §6 T3 — header-aware splitBlocks.
// Failure modes pinned: a stray spacer-row value fusing two sections into one
// table (the audit-#10 fuse), and a regression that splits on excluded/mixed-case
// labels or breaks the blank-row path.
describe("splitBlocks header-aware segmentation (spec §2.2)", () => {
  const fusedRows = [
    ["DATES", "5/13/24 - 5/15/24"],
    ["", "stray note"], // spacer row carrying one stray value — previously fused A+B
    ["HOTEL", "NAME", "CONF"],
    ["Four Seasons", "Doug Larson", "ABC123"],
  ];

  test("a stray spacer-row value no longer fuses the next uppercase-known section", () => {
    const { markdown } = synthesizeMarkdownFromXlsx(
      workbookBuffer([{ name: "INFO", rows: fusedRows }]),
    );
    const tables = markdown.split("\n\n");
    expect(tables).toHaveLength(2);
    expect(tables[1]!.split("\n")[0]).toBe("| HOTEL | NAME | CONF |");
    // the stray row stays in section A's table
    expect(tables[0]).toContain("| stray note |");
  });

  test("a true blank spacer still splits (blank-row path unchanged)", () => {
    const { markdown } = synthesizeMarkdownFromXlsx(
      workbookBuffer([
        {
          name: "INFO",
          rows: [
            ["DATES", "5/13/24 - 5/15/24"],
            ["", ""],
            ["HOTEL", "NAME", "CONF"],
            ["Four Seasons", "Doug Larson", "ABC123"],
          ],
        },
      ]),
    );
    expect(markdown.split("\n\n")).toHaveLength(2);
  });

  test("CLIENT is excluded from mid-block splitting (corpus-verified label)", () => {
    const { markdown } = synthesizeMarkdownFromXlsx(
      workbookBuffer([
        {
          name: "INFO",
          rows: [
            ["DATES", "5/13/24 - 5/15/24"],
            ["", "#NUM!"],
            ["CLIENT", "Institutional Investor"],
          ],
        },
      ]),
    );
    expect(markdown.split("\n\n")).toHaveLength(1);
  });

  test("OLD-tab fused HOTEL block is excluded from the pull-sheet region and its fingerprint (spec §1.1 OLD-tab semantic)", async () => {
    const { createHash } = await import("node:crypto");
    const { archivedPullSheetTabs } = synthesizeMarkdownFromXlsx(
      workbookBuffer([
        {
          name: "OLD PULL SHEET",
          rows: [
            ["PULL SHEET", "PULL SHEET"],
            ["East Coast Symposium", ""],
            ["QTY", "ITEM"],
            ["2", "DLP DATA PROJECTOR"],
            ["", "stray"], // stray spacer fuses the HOTEL block into the region pre-fix
            ["HOTEL", "NAME"],
            ["Four Seasons", "Doug Larson"],
          ],
        },
      ]),
    );
    expect(archivedPullSheetTabs).toHaveLength(1);
    const tab = archivedPullSheetTabs[0]!;
    // Re-derive the expected fingerprint from the tab's own region markdown shape:
    // synthesize the SAME grid without the fused HOTEL rows; the fingerprints must
    // match, proving the HOTEL rows are not hashed into the region.
    const { archivedPullSheetTabs: cleanTabs } = synthesizeMarkdownFromXlsx(
      workbookBuffer([
        {
          name: "OLD PULL SHEET",
          rows: [
            ["PULL SHEET", "PULL SHEET"],
            ["East Coast Symposium", ""],
            ["QTY", "ITEM"],
            ["2", "DLP DATA PROJECTOR"],
            ["", "stray"],
          ],
        },
      ]),
    );
    expect(cleanTabs).toHaveLength(1);
    expect(tab.fingerprint).toBe(cleanTabs[0]!.fingerprint);
    // and the fingerprint is a real sha256 hex (sanity, not tautology: the equality
    // above is between two INDEPENDENT syntheses)
    expect(tab.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    void createHash;
  });
});
