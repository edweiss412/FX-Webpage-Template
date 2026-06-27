import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  extractCrewRoleAnchors,
  resolveCrewRoleCell,
  normalizeCrewNameKey,
} from "@/lib/drive/crewRoleAnchors";

function xlsxBuffer(sheets: Record<string, string[][]>): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
  }
  const u8 = new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayLike<number>);
  return u8.buffer as ArrayBuffer;
}

const GID = new Map([["INFO", 0]]);

// New template: dedicated ROLE column (col C, index 2). NAME at col B (index 1).
const NEW_TPL = {
  INFO: [
    ["CLIENT", "Inst Investor"],
    ["CREW", "NAME", "ROLE", "PHONE"],
    ["", "Doug Larson", "- Load In / Set / Strike / Load Out - LEAD", "917"],
    ["", "Calvin Saller (10/7 and 10/9 ONLY)", "- Load In / Set / Strike / Load Out - BO", "480"],
    ["DRESS", "Black"],
  ],
};

// Old TECH template: name+schedule+role merged in col B (index 1). No ROLE column.
const TECH_TPL = {
  INFO: [
    ["", "TECH", "PHONE", "ARRIVAL", "DEPARTURE"],
    ["", "Eric Weiss - Load In/Set/Strke/Load Out - A1", "508", "", ""],
  ],
};

describe("extractCrewRoleAnchors", () => {
  it("new template → anchors the ROLE-column cell, keyed by normalized NAME", () => {
    const anchors = extractCrewRoleAnchors(xlsxBuffer(NEW_TPL), GID);
    // Doug Larson row = grid row index 2; ROLE column = index 2 → C3.
    expect(resolveCrewRoleCell(anchors, "Doug Larson")).toEqual({ title: "INFO", gid: 0, a1: "C3" });
  });

  it("strips the day-restriction parenthetical from the NAME key (matches blockRef.name)", () => {
    const anchors = extractCrewRoleAnchors(xlsxBuffer(NEW_TPL), GID);
    // blockRef.name is the RAW name cell incl. parenthetical; resolver normalizes both sides.
    expect(resolveCrewRoleCell(anchors, "Calvin Saller (10/7 and 10/9 ONLY)")).toEqual({
      title: "INFO",
      gid: 0,
      a1: "C4",
    });
  });

  it("old TECH template → anchors the compound col-B cell; name = segment before ' - '", () => {
    const anchors = extractCrewRoleAnchors(xlsxBuffer(TECH_TPL), GID);
    // Eric Weiss row = grid row index 1; compound cell = col B (index 1) → B2.
    expect(resolveCrewRoleCell(anchors, "Eric Weiss")).toEqual({ title: "INFO", gid: 0, a1: "B2" });
  });

  it("old TECH template terminates on a section label in ANY column (no wrong-cell past the block)", () => {
    const tpl = {
      INFO: [
        ["", "TECH", "PHONE", "ARRIVAL", "DEPARTURE"],
        ["", "Eric Weiss - Load In/Set/Strke/Load Out - A1", "508", "", ""],
        ["TRANSPORTATION", "", "", "", ""], // terminator in col A (not techCol)
        ["", "Van Co - rental - X", "999", "", ""], // stray "X - Y" compound AFTER the block
      ],
    };
    const anchors = extractCrewRoleAnchors(xlsxBuffer(tpl), GID);
    expect(anchors).toHaveLength(1); // only Eric Weiss; post-terminator row excluded
    expect(resolveCrewRoleCell(anchors, "Van Co")).toBeNull();
  });

  it("ambiguous (two rows clean to same name) → null", () => {
    const dup = {
      INFO: [
        ["CREW", "NAME", "ROLE", "PHONE"],
        ["", "Sam Vale", "- A1", "1"],
        ["", "Sam Vale", "- V1", "2"],
      ],
    };
    const anchors = extractCrewRoleAnchors(xlsxBuffer(dup), GID);
    expect(resolveCrewRoleCell(anchors, "Sam Vale")).toBeNull();
  });

  it("no match → null; non-crew sheet → empty", () => {
    const anchors = extractCrewRoleAnchors(xlsxBuffer(NEW_TPL), GID);
    expect(resolveCrewRoleCell(anchors, "Nobody Here")).toBeNull();
    expect(extractCrewRoleAnchors(xlsxBuffer({ INFO: [["VENUE", "x"]] }), GID)).toEqual([]);
  });

  it("sheet with no gid → no anchors (degrade, never wrong)", () => {
    expect(extractCrewRoleAnchors(xlsxBuffer(NEW_TPL), new Map())).toEqual([]);
  });

  it("normalizeCrewNameKey strips parens, collapses whitespace, lowercases", () => {
    expect(normalizeCrewNameKey("  Doug   Larson (X ONLY) ")).toBe("doug larson");
  });
});
