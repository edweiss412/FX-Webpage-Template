import { describe, it, expect } from "vitest";
import { synthesizeMarkdownFromXlsx } from "@/lib/drive/exportSheetToMarkdown";
import { parsePullSheet } from "@/lib/parser/pull-sheet";
import { buildXlsx } from "../helpers/buildXlsx";

// Region: header row all-cells "PULL SHEET", then item rows in a LATER block (Codex R7).
const regionA = [
  ["PULL SHEET", "PULL SHEET"],
  ["RIA - CHICAGO, IL"],
  [], // separator -> collectDataBlock scans forward
  ["QTY", "ITEM"],
  ["2", "Shure SM58"],
];

describe("synthesizeMarkdownFromXlsx archived-tab detection", () => {
  it("records one ArchivedPullSheetTab for an OLD tab with a pull-sheet region (included:false by default)", () => {
    const buf = buildXlsx([
      { name: "INFO", grid: [["Show", "X"]] },
      { name: "OLD PULL SHEET", grid: regionA },
    ]);
    const { markdown, archivedPullSheetTabs } = synthesizeMarkdownFromXlsx(buf);
    expect(archivedPullSheetTabs).toHaveLength(1);
    const t = archivedPullSheetTabs[0]!;
    expect(t.tabName).toBe("OLD PULL SHEET");
    expect(t.included).toBe(false);
    expect(t.contentChangedSinceAccept).toBe(false);
    expect(t.headerPreviews).toEqual(["RIA - CHICAGO, IL"]); // header-line preview, not the "PULL SHEET" row
    expect(t.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    // included:false => tab dropped from markdown (default anti-contamination)
    expect(markdown).not.toContain("Shure SM58");
  });

  it("stray-mention OLD tab (one cell mentions 'pull sheet', no all-cells header row) yields NO entry", () => {
    const buf = buildXlsx([
      {
        name: "OLD NOTES",
        grid: [
          ["see pull sheet tab", "notes"],
          ["misc", "x"],
        ],
      },
    ]);
    const { archivedPullSheetTabs } = synthesizeMarkdownFromXlsx(buf);
    expect(archivedPullSheetTabs).toHaveLength(0);
  });

  it("cosmetic reformat => same fingerprint; QTY edit => different; header-only edit => different", () => {
    const base = synthesizeMarkdownFromXlsx(buildXlsx([{ name: "OLD PULL SHEET", grid: regionA }]))
      .archivedPullSheetTabs[0]!.fingerprint;
    const reformatted = regionA.map((r) => [...r]);
    reformatted.splice(2, 0, []); // extra blank row
    expect(
      synthesizeMarkdownFromXlsx(buildXlsx([{ name: "OLD PULL SHEET", grid: reformatted }]))
        .archivedPullSheetTabs[0]!.fingerprint,
    ).toBe(base);
    const qty = regionA.map((r) => [...r]);
    qty[4] = ["3", "Shure SM58"];
    expect(
      synthesizeMarkdownFromXlsx(buildXlsx([{ name: "OLD PULL SHEET", grid: qty }]))
        .archivedPullSheetTabs[0]!.fingerprint,
    ).not.toBe(base);
    const hdr = regionA.map((r) => [...r]);
    hdr[1] = ["MIAMI, FL"]; // header-only (Codex R5)
    expect(
      synthesizeMarkdownFromXlsx(buildXlsx([{ name: "OLD PULL SHEET", grid: hdr }]))
        .archivedPullSheetTabs[0]!.fingerprint,
    ).not.toBe(base);
  });

  it("multi-case tab: previews list every case, fingerprint spans all, 2nd-case edit changes it", () => {
    const two = [
      ...regionA,
      [],
      ["PULL SHEET", "PULL SHEET"],
      ["MIAMI, FL"],
      ["QTY", "ITEM"],
      ["1", "DI Box"],
    ];
    const base = synthesizeMarkdownFromXlsx(buildXlsx([{ name: "OLD PULL SHEET", grid: two }]))
      .archivedPullSheetTabs[0]!;
    expect(base.headerPreviews).toEqual(["RIA - CHICAGO, IL", "MIAMI, FL"]); // I2 all cases reviewed
    const edited = two.map((r) => [...r]);
    edited[edited.length - 1] = ["2", "DI Box"]; // 2nd case item
    expect(
      synthesizeMarkdownFromXlsx(buildXlsx([{ name: "OLD PULL SHEET", grid: edited }]))
        .archivedPullSheetTabs[0]!.fingerprint,
    ).not.toBe(base.fingerprint);
  });

  it("includePullSheetFromTab un-skips ONLY pull-sheet regions; rooms/other blocks discarded", () => {
    const withRooms = [...regionA, [], ["ROOMS"], ["Ballroom A"]];
    const { markdown, archivedPullSheetTabs } = synthesizeMarkdownFromXlsx(
      buildXlsx([{ name: "OLD PULL SHEET", grid: withRooms }]),
      { includePullSheetFromTab: "OLD PULL SHEET" },
    );
    expect(markdown).toContain("Shure SM58"); // pull-sheet region emitted
    expect(markdown).not.toContain("Ballroom A"); // DEF-2: rooms NOT leaked
    expect(archivedPullSheetTabs[0]!.included).toBe(true);
    expect(archivedPullSheetTabs[0]!.fingerprint).toMatch(/^[0-9a-f]{64}$/); // still returned for compare (5.2)
  });

  it("parse-through (single source of truth): previews carry show identity AND parsePullSheet gets the items (Codex plan-R3-2)", () => {
    // Parser-compatible pull sheet: title/show-identity rows, then variant-B 5-col rows [qty,item,subcat,cat,packed].
    const grid = [
      ["PULL SHEET"],
      ["RIA - CHICAGO, IL"],
      ["Lakeview - 7th Floor"],
      ["Set: 4/15/24"],
      ["QTY", "ITEM", "SUB CAT", "CAT", "PACKED"],
      ["2", "Shure SM58", "Mic", "AUDIO", "FALSE"],
    ];
    const { markdown, archivedPullSheetTabs } = synthesizeMarkdownFromXlsx(
      buildXlsx([{ name: "OLD PULL SHEET", grid }]),
      { includePullSheetFromTab: "OLD PULL SHEET" },
    );
    // I2: the admin-reviewed preview carries the show identity (not item rows, not the bare "PULL SHEET" token)
    expect(archivedPullSheetTabs[0]!.headerPreviews[0]).toContain("RIA - CHICAGO, IL");
    expect(archivedPullSheetTabs[0]!.headerPreviews[0]).not.toMatch(/^PULL SHEET$/);
    // I1: parsePullSheet of the emitted markdown recovers the item — same bytes hashed/emitted/parsed
    const parsed = parsePullSheet(markdown).pullSheet;
    expect(
      parsed?.flatMap((c) => c.items).some((i) => i.item === "Shure SM58" && i.qty === 2),
    ).toBe(true);
  });
});
