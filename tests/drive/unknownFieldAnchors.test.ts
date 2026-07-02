import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  extractUnknownFieldAnchors,
  resolveUnknownFieldCell,
  normalizeCellKey,
} from "@/lib/drive/unknownFieldAnchors";

// Build a minimal INFO sheet from an array-of-arrays; returns bytes + gid map.
// Row/col are 0-based; A1 is derived by the code under test.
function buildInfoWorkbook(rows: (string | null)[][]): {
  buffer: ArrayBuffer;
  gids: Map<string, number>;
} {
  const ws = XLSX.utils.aoa_to_sheet(rows.map((r) => r.map((c) => c ?? "")));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "INFO");
  const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return { buffer, gids: new Map([["INFO", 0]]) };
}

describe("extractUnknownFieldAnchors", () => {
  it("anchors each venue/details row to its LABEL cell keyed by (kind,label,value)", () => {
    const { buffer, gids } = buildInfoWorkbook([
      ["DATES", ""],
      ["", ""],
      ["VENUE", ""],
      ["Where", "Four Seasons Hotel"],
      ["", ""],
      ["DETAILS", ""],
      ["Floor Plan", "LINK"],
      ["GS Podium Type", "(2) Acrylic Podium"],
    ]);
    const anchors = extractUnknownFieldAnchors(buffer, gids);
    expect(anchors.find((a) => a.kind === "venue" && a.label === "where")?.anchor.a1).toBe("A4");
    const podium = anchors.find((a) => a.kind === "details" && a.label === "gs podium type");
    expect(podium?.anchor.a1).toBe("A8");
    expect(podium?.value).toBe(normalizeCellKey("(2) Acrylic Podium"));
  });

  it("resolves exactly-one (kind,label,value) match to the cell", () => {
    const { buffer, gids } = buildInfoWorkbook([
      ["DETAILS", ""],
      ["GS Podium Type", "(2) Acrylic Podium"],
    ]);
    const anchors = extractUnknownFieldAnchors(buffer, gids);
    expect(
      resolveUnknownFieldCell(anchors, "details", "GS Podium Type", "(2) Acrylic Podium")?.a1,
    ).toBe("A2");
  });

  it("PROVENANCE: same label, different value → matches the correct row (never the impostor)", () => {
    const { buffer, gids } = buildInfoWorkbook([
      ["DETAILS", ""],
      ["Notes", "real note"],
      ["Notes", "other note"],
    ]);
    const anchors = extractUnknownFieldAnchors(buffer, gids);
    expect(resolveUnknownFieldCell(anchors, "details", "Notes", "other note")?.a1).toBe("A3");
  });

  it("PROVENANCE across bound divergence: outside-bound label + inside impostor sharing the label but not the value → never anchors to the impostor", () => {
    const { buffer, gids } = buildInfoWorkbook([
      ["DETAILS", ""],
      ["Notes", "inside-val"],
      ["", ""],
      ["CONTACTS", ""],
      ["Notes", "outside-val"],
    ]);
    const anchors = extractUnknownFieldAnchors(buffer, gids);
    expect(resolveUnknownFieldCell(anchors, "details", "Notes", "outside-val")).toBeNull();
  });

  it("same label AND same value (true duplicate) → null (never a wrong cell)", () => {
    const { buffer, gids } = buildInfoWorkbook([
      ["DETAILS", ""],
      ["Notes", "dup"],
      ["Notes", "dup"],
    ]);
    const anchors = extractUnknownFieldAnchors(buffer, gids);
    expect(resolveUnknownFieldCell(anchors, "details", "Notes", "dup")).toBeNull();
  });

  it("kind-scoping: same label in venue and details does not cross-collide", () => {
    const { buffer, gids } = buildInfoWorkbook([
      ["VENUE", ""],
      ["Notes", "venue note"],
      ["", ""],
      ["DETAILS", ""],
      ["Notes", "details note"],
    ]);
    const anchors = extractUnknownFieldAnchors(buffer, gids);
    expect(resolveUnknownFieldCell(anchors, "venue", "Notes", "venue note")?.a1).toBe("A2");
    expect(resolveUnknownFieldCell(anchors, "details", "Notes", "details note")?.a1).toBe("A5");
  });

  it("no match → null; wrong/absent inputs → null; missing gid → []", () => {
    const { buffer, gids } = buildInfoWorkbook([
      ["DETAILS", ""],
      ["Floor Plan", "LINK"],
    ]);
    const anchors = extractUnknownFieldAnchors(buffer, gids);
    expect(resolveUnknownFieldCell(anchors, "details", "Nonexistent", "x")).toBeNull();
    expect(resolveUnknownFieldCell(anchors, undefined, "Floor Plan", "LINK")).toBeNull();
    expect(extractUnknownFieldAnchors(buffer, new Map())).toEqual([]);
  });

  it("over-inclusive: does NOT stop at an internal blank row within the block", () => {
    const { buffer, gids } = buildInfoWorkbook([
      ["DETAILS", ""],
      ["Floor Plan", "LINK"],
      ["", ""],
      ["Notes", "kept"],
    ]);
    const anchors = extractUnknownFieldAnchors(buffer, gids);
    expect(anchors.find((a) => a.label === "notes")?.anchor.a1).toBe("A4");
  });

  it("EXACT header: a field row starting with 'Details' is NOT mistaken for the DETAILS header (never a false-early scan)", () => {
    const { buffer, gids } = buildInfoWorkbook([
      ["Details Notes", "some note"], // prefix-only regex would false-match this as the header
      ["", ""],
      ["DETAILS", ""], // the real header
      ["Floor Plan", "LINK"],
    ]);
    const anchors = extractUnknownFieldAnchors(buffer, gids);
    // The real detail row anchors to its real cell (A4) — proving the scan started at
    // the real DETAILS header, not the "Details Notes" field row above it.
    expect(resolveUnknownFieldCell(anchors, "details", "Floor Plan", "LINK")?.a1).toBe("A4");
    // "Details Notes" (above the header) is never scanned as a details row.
    expect(resolveUnknownFieldCell(anchors, "details", "Details Notes", "some note")).toBeNull();
  });
});
