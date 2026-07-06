// tests/parser/mutation/rows.test.ts
import { describe, it, expect } from "vitest";
import { splitCells, classifyRow, segment } from "./rows";
import { splitRow } from "@/lib/parser/blocks/_helpers";

const isHeader = (cells: string[]) => /^(DATES|CREW|DRESS|HOTEL|GENERAL SESSION)/.test((cells[0] ?? "").trim());

describe("row taxonomy", () => {
  it("splits a pipe row into trimmed cells (drops leading/trailing pipe framing)", () => {
    expect(splitCells("|  A | B  | C |")).toEqual(["A", "B", "C"]);
  });
  it("mirrors the parser's splitRow on an ESCAPED-PIPE row (\\| fragments, same as parser) (plan-R11)", () => {
    // Real fixture shape: a hotel cell containing "... \| Events ...". The live parser splits
    // on the raw pipe too (splitRow), so the harness must fragment IDENTICALLY — a mutation on
    // any fragment is then a single-site change in parser-space, not a false alarm.
    const line = "| Hilton | Gabriella Decker \\| Events gd@hilton.com | Austin |";
    expect(splitCells(line)).toEqual(splitRow(line));           // byte-for-byte parser parity
    expect(splitCells(line).length).toBe(4);                    // \| fragments the middle cell into 2
  });
  it("matches parser splitRow on a MISSING trailing pipe (drops final cell) (plan-R13)", () => {
    // parser: "| A | B".split("|").slice(1,-1) === ["A"] — the final segment is dropped.
    expect(splitCells("| A | B")).toEqual(splitRow("| A | B"));
    expect(splitCells("| A | B")).toEqual(["A"]);
    expect(splitCells("| A")).toEqual(splitRow("| A"));          // ["", " A"].slice(1,-1) === []
    expect(splitCells("| A")).toEqual([]);
  });
  it("classifies alignment / spacer / header / data rows", () => {
    expect(classifyRow([":---:", ":---"]).valueOf()).toBe("alignment");
    expect(classifyRow(["", "", ""]).valueOf()).toBe("spacer");
    expect(classifyRow(["DATES", "", "DAY"], isHeader)).toBe("header");
    expect(classifyRow(["", "Doug Larson", "917-..."], isHeader)).toBe("data");
  });
});

describe("logical-section segmentation (Codex R10)", () => {
  it("splits one pipe run holding DATES/CREW/DRESS into distinct header-anchored sections", () => {
    const md = [
      "| DATES | DAY |",
      "| :---: | :---: |",
      "|  | Tuesday |",
      "|  |  |",
      "| CREW | NAME |",
      "|  | Doug Larson |",
      "|  |  |",
      "| DRESS | Black |",
    ].join("\n");
    const seg = segment(md, isHeader);
    expect(seg.sections.map((s) => (s.headerRow?.cells[0] ?? "").trim())).toEqual(["DATES", "CREW", "DRESS"]);
    // all three sections belong to ONE run (no blank line separates them)
    expect(new Set(seg.sections.map((s) => s.runIndex)).size).toBe(1);
  });
  it("rows before the first header in a run form a headerless section (headerRow null)", () => {
    const md = ["|  | orphan data |", "| CREW | NAME |", "|  | Doug |"].join("\n");
    const seg = segment(md, isHeader);
    expect(seg.sections[0]!.headerRow).toBeNull();
    expect(seg.sections[1]!.headerRow!.cells[0]!.trim()).toBe("CREW");
  });
  it("a blank line starts a new run", () => {
    const md = ["| CREW | NAME |", "|  | Doug |", "", "| HOTEL | X |"].join("\n");
    const seg = segment(md, isHeader);
    expect(seg.runs).toHaveLength(2);
  });
});
