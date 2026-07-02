import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  extractUnknownFieldAnchors,
  resolveUnknownFieldCell,
} from "@/lib/drive/unknownFieldAnchors";

// Verbatim DETAILS block from the live "AII/III - Consultants Roundtable 2025"
// INFO tab (spreadsheet 1XQ44uxc44pToYxQnYw4OG9V6DjE7bC5EU08o5iFpxz4, gid 0),
// rows 55-76 read via gsheets MCP on 2026-07-01 — the reported repro sheet.
// Placed at the SAME absolute rows so resolved A1 matches the live sheet exactly
// (DETAILS header = A55, first field = A56, GS Podium Type = A65, Notes = A74).
const DETAILS_HEADER_ROW = 55; // 1-based; header cell A55 → 0-based r = 54
const DETAILS_ROWS: [string, string][] = [
  ["Floor Plan", "LINK"],
  ["Room Diagram", "LINK"],
  ["LED", "NO LED WALL"],
  ["Backdrop / Scenic", "(1) II Logo Spandex\n(4) Sections Grey Spandex"],
  ["Stage Size", "8' x 24' x 2'"],
  ["Opening Reel", "YES - LOOP VIDEO"],
  ["Keynote Requirements", "TBD"],
  ["Virtual Speaker", "N/A"],
  ["Virtual Audience", "N/A"],
  ["GS Podium Type", "(2) Acrylic Podium"],
  ["Record", "N/A"],
  ["Polling", "YES  "],
  ["Internet", "Wifi for Polling\n\nNetwork: Institutional Investor\r\nPasscode: Investor2025"],
  ["Power", "100-amp 3 phase service"],
  ["Equipment Storage", "Behind LED Wall"],
  ["Staff Office Room", "TBD"],
  ["Test Pattern", "16 x 9 Test Pattern"],
  ["Fonts", "Aptos Font Folder"],
  ["Notes", "N/A"],
];

function buildLiveInfo(): { buffer: ArrayBuffer; gids: Map<string, number> } {
  const aoa: string[][] = [];
  for (let r = 0; r < DETAILS_HEADER_ROW - 1; r++) aoa.push([""]); // pad to A55
  aoa.push(["DETAILS", ""]);
  for (const [label, value] of DETAILS_ROWS) aoa.push([label, value]);
  aoa.push([""]); // blank row 75
  aoa.push(["GENERAL SESSION\nGRAND BALLROOM A/B\nA/B: 82' x 63' x 14'\n8th Floor"]); // row 76 (terminator)
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "INFO");
  return {
    buffer: XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer,
    gids: new Map([["INFO", 0]]),
  };
}

describe("unknownFieldAnchors — live DETAILS block fidelity (AII/III Consultants Roundtable 2025)", () => {
  it("anchors every DETAILS row to a distinct label cell; scan stops at GENERAL SESSION", () => {
    const { buffer, gids } = buildLiveInfo();
    const anchors = extractUnknownFieldAnchors(buffer, gids).filter((a) => a.kind === "details");
    expect(anchors).toHaveLength(DETAILS_ROWS.length); // one per field row, no GENERAL SESSION
    expect(anchors.some((a) => a.label.startsWith("general session"))).toBe(false);
    const a1s = anchors.map((a) => a.anchor.a1);
    expect(new Set(a1s).size).toBe(a1s.length); // every row → a distinct cell
    // Expected A1 derived from fixture geometry (header row + offset), not hardcoded.
    DETAILS_ROWS.forEach(([label, value], i) => {
      const expectedA1 = XLSX.utils.encode_cell({ r: DETAILS_HEADER_ROW + i, c: 0 }); // A56, A57, ...
      expect(resolveUnknownFieldCell(anchors, "details", label, value)?.a1).toBe(expectedA1);
    });
  });

  it("the reported repro row 'GS Podium Type' resolves to A65 with its value", () => {
    const { buffer, gids } = buildLiveInfo();
    const anchors = extractUnknownFieldAnchors(buffer, gids);
    expect(resolveUnknownFieldCell(anchors, "details", "GS Podium Type", "(2) Acrylic Podium")).toEqual({
      title: "INFO",
      gid: 0,
      a1: "A65",
    });
  });
});
