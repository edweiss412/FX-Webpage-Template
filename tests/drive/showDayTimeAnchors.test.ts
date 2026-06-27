import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  attachSourceCellAnchors,
  extractShowDayTimeAnchors,
  hasCellAnchoredWarning,
  resolveSourceCell,
  type ShowDayTimeAnchor,
} from "@/lib/drive/showDayTimeAnchors";
import { normalizeDate } from "@/lib/parser/blocks/_helpers";
import type { ParseWarning } from "@/lib/parser/types";

// Build an .xlsx ArrayBuffer from an array-of-arrays for one named sheet.
function xlsxBuffer(sheets: Record<string, string[][]>): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
  }
  const written = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayLike<number>;
  // type:"array" may yield a Uint8Array or a plain number[]; normalize to a fresh
  // (offset-0) ArrayBuffer for the locator's XLSX.read.
  const u8 = new Uint8Array(written);
  return u8.buffer as ArrayBuffer;
}

// A DATES block whose layout mirrors readShowDayTimeCells: col0 = "DATES" label,
// col1 = SHOW DAY, col3 = date, col4 = TIME. Row indices below are 0-based.
const DATES_AOA: string[][] = [
  ["DATES", "", "", "", ""], // row 0
  ["", "SHOW DAY 1", "", "5/11/2026", "8:00 AM - Registration"], // row 1
  ["", "SHOW DAY 2", "", "5/12/2026", "GS: ... - 6:00 PM"], // row 2 (unparseable time)
  ["CREW", "", "", "", ""], // row 3 — block ends
];

describe("extractShowDayTimeAnchors", () => {
  it("returns a TIME-cell anchor per SHOW DAY row, keyed by ISO date", () => {
    const buffer = xlsxBuffer({ Main: DATES_AOA });
    const anchors = extractShowDayTimeAnchors(buffer, new Map([["Main", 4242]]));

    // Two SHOW DAY rows → two anchors. ISO derived from the fixture via normalizeDate.
    const iso1 = normalizeDate("5/11/2026")!;
    const iso2 = normalizeDate("5/12/2026")!;
    expect(anchors.map((a) => a.iso).sort()).toEqual([iso1, iso2].sort());

    // The TIME cell A1 is column index 4 (the 5th col) of the SHOW DAY row.
    // Derived from the fixture's own coordinates, not hardcoded "E2".
    const a1Row1 = XLSX.utils.encode_cell({ r: 1, c: 4 });
    const a1Row2 = XLSX.utils.encode_cell({ r: 2, c: 4 });
    const byIso = (iso: string) => anchors.find((a) => a.iso === iso)!.anchor;
    expect(byIso(iso1)).toEqual({ title: "Main", gid: 4242, a1: a1Row1 });
    expect(byIso(iso2)).toEqual({ title: "Main", gid: 4242, a1: a1Row2 });
  });

  it("skips a sheet with no gid (no anchor possible)", () => {
    const buffer = xlsxBuffer({ Main: DATES_AOA });
    expect(extractShowDayTimeAnchors(buffer, new Map())).toEqual([]);
  });

  it("skips archived 'OLD ...' tabs", () => {
    const buffer = xlsxBuffer({ "OLD PULL SHEET": DATES_AOA });
    expect(extractShowDayTimeAnchors(buffer, new Map([["OLD PULL SHEET", 7]]))).toEqual([]);
  });

  it("skips a SHOW DAY row whose date cell isn't a readable date", () => {
    const buffer = xlsxBuffer({
      Main: [
        ["DATES", "", "", "", ""],
        ["", "SHOW DAY 1", "", "TBD", "9:00 AM"],
      ],
    });
    expect(extractShowDayTimeAnchors(buffer, new Map([["Main", 1]]))).toEqual([]);
  });
});

describe("resolveSourceCell", () => {
  const anchors: ShowDayTimeAnchor[] = [
    { iso: "2026-05-11", anchor: { title: "Main", gid: 1, a1: "E2" } },
    { iso: "2026-05-12", anchor: { title: "Main", gid: 1, a1: "E3" } },
  ];

  it("returns the unique anchor matching the date", () => {
    expect(resolveSourceCell(anchors, "2026-05-12")).toEqual(anchors[1]!.anchor);
  });

  it("returns null when no anchor matches", () => {
    expect(resolveSourceCell(anchors, "2026-05-13")).toBeNull();
    expect(resolveSourceCell(anchors, undefined)).toBeNull();
  });

  it("returns null when the date is ambiguous (never a wrong-cell link)", () => {
    const dup: ShowDayTimeAnchor[] = [
      { iso: "2026-05-11", anchor: { title: "Main", gid: 1, a1: "E2" } },
      { iso: "2026-05-11", anchor: { title: "Main", gid: 1, a1: "E9" } },
    ];
    expect(resolveSourceCell(dup, "2026-05-11")).toBeNull();
  });
});

describe("attachSourceCellAnchors / hasCellAnchoredWarning", () => {
  const anchors: ShowDayTimeAnchor[] = [
    { iso: "2026-05-11", anchor: { title: "Main", gid: 1, a1: "E2" } },
    { iso: "2026-05-12", anchor: { title: "Main", gid: 1, a1: "E3" } },
  ];
  const crewAnchors = [{ name: "jane doe", anchor: { title: "INFO", gid: 0, a1: "C3" } }];
  const regionAnchors = { crew: { title: "INFO", gid: 0, a1: "A2:D5" } };

  it("sets sourceCell on a SCHEDULE_TIME_UNPARSED warning matching its blockRef.iso", () => {
    const warnings: ParseWarning[] = [
      {
        severity: "warn",
        code: "SCHEDULE_TIME_UNPARSED",
        message: "…",
        blockRef: { kind: "dates", index: 0, iso: "2026-05-12" },
      },
    ];
    attachSourceCellAnchors(warnings, { showDay: anchors, crewRole: [], region: {} });
    expect(warnings[0]!.sourceCell).toEqual(anchors[1]!.anchor);
  });

  it("dispatches by code: ISO→schedule, name→crew, kind→region", () => {
    const warnings: ParseWarning[] = [
      {
        severity: "warn",
        code: "SCHEDULE_TIME_UNPARSED",
        message: "t",
        blockRef: { kind: "dates", index: 0, iso: "2026-05-12" },
      },
      {
        severity: "warn",
        code: "UNKNOWN_ROLE_TOKEN",
        message: "r",
        blockRef: { kind: "crew", index: 0, name: "Jane Doe" },
      },
      {
        severity: "warn",
        code: "FIELD_UNREADABLE",
        message: "f",
        blockRef: { kind: "crew", index: 1 },
      },
    ];
    attachSourceCellAnchors(warnings, {
      showDay: anchors,
      crewRole: crewAnchors,
      region: regionAnchors,
    });
    expect(warnings[0]!.sourceCell).toEqual(anchors[1]!.anchor); // ISO match
    expect(warnings[1]!.sourceCell).toEqual({ title: "INFO", gid: 0, a1: "C3" }); // crew name match (INVERTED)
    expect(warnings[2]!.sourceCell).toEqual({ title: "INFO", gid: 0, a1: "A2:D5" }); // crew region
  });

  it("UNKNOWN_DAY_RESTRICTION resolves by crew name too", () => {
    const ws: ParseWarning[] = [
      {
        severity: "warn",
        code: "UNKNOWN_DAY_RESTRICTION",
        message: "d",
        blockRef: { kind: "crew", index: 0, name: "Jane Doe" },
      },
    ];
    attachSourceCellAnchors(ws, { showDay: [], crewRole: crewAnchors, region: {} });
    expect(ws[0]!.sourceCell).toEqual({ title: "INFO", gid: 0, a1: "C3" });
  });

  it("resolves STAGE_WORD_AUTOCORRECTED by blockRef.name (crew cell), like the other crew codes", () => {
    const ws: ParseWarning[] = [
      {
        severity: "warn",
        code: "STAGE_WORD_AUTOCORRECTED",
        message: "x",
        blockRef: { kind: "crew", index: 0, name: "Jane Doe" },
      },
    ];
    attachSourceCellAnchors(ws, { showDay: [], crewRole: crewAnchors, region: {} });
    expect(ws[0]!.sourceCell).toEqual({ title: "INFO", gid: 0, a1: "C3" });
  });

  it("FIELD_UNREADABLE with no region for its kind → null (no wrong-region link)", () => {
    const ws: ParseWarning[] = [
      {
        severity: "warn",
        code: "FIELD_UNREADABLE",
        message: "f",
        blockRef: { kind: "venue", index: 0 },
      },
    ];
    attachSourceCellAnchors(ws, { showDay: [], crewRole: [], region: {} });
    expect(ws[0]!.sourceCell).toBeUndefined();
  });

  it("resolves UNKNOWN_FIELD by its venue region (like FIELD_UNREADABLE)", () => {
    const ws: ParseWarning[] = [
      { severity: "warn", code: "UNKNOWN_FIELD", message: "x", blockRef: { kind: "venue" } },
    ];
    attachSourceCellAnchors(ws, {
      showDay: [],
      crewRole: [],
      region: { venue: { title: "INFO", gid: 0, a1: "A5" } },
    });
    expect(ws[0]!.sourceCell).toEqual({ title: "INFO", gid: 0, a1: "A5" });
  });

  it("UNKNOWN_FIELD with no venue region → no link", () => {
    const ws: ParseWarning[] = [
      { severity: "warn", code: "UNKNOWN_FIELD", message: "x", blockRef: { kind: "venue" } },
    ];
    attachSourceCellAnchors(ws, { showDay: [], crewRole: [], region: {} });
    expect(ws[0]!.sourceCell).toBeUndefined();
  });

  it.each([
    ["AGENDA_GRID_MALFORMED", "agenda", "schedule"],
    ["AGENDA_BLOCK_UNRESOLVED", "agenda", "schedule"],
    ["AGENDA_DAY_AMBIGUOUS", "agenda", "schedule"],
    ["AGENDA_DAY_TRUNCATED", "agenda", "schedule"],
    ["AGENDA_DAY_EMPTIED", "agenda", "schedule"],
    ["PULL_SHEET_PARSE_PARTIAL", "pull_sheet", "gear_packlist"],
    ["PULL_SHEET_AMBIGUOUS_FORMAT", "pull_sheet", "gear_packlist"],
    ["PULL_SHEET_UNKNOWN_VARIANT", "pull_sheet", "gear_packlist"],
  ] as const)("resolves %s by its tab region (kind %s → region %s)", (code, kind, regionId) => {
    const ws: ParseWarning[] = [
      { severity: "warn", code, message: "x", blockRef: { kind, index: 0 } },
    ];
    attachSourceCellAnchors(ws, {
      showDay: [],
      crewRole: [],
      region: { [regionId]: { title: "T", gid: 1, a1: "A1" } },
    });
    expect(ws[0]!.sourceCell).toEqual({ title: "T", gid: 1, a1: "A1" });
  });

  it("AGENDA/PULL warning with no tab region → no link", () => {
    const ws: ParseWarning[] = [
      {
        severity: "warn",
        code: "AGENDA_DAY_AMBIGUOUS",
        message: "x",
        blockRef: { kind: "agenda", index: 0 },
      },
    ];
    attachSourceCellAnchors(ws, { showDay: [], crewRole: [], region: {} });
    expect(ws[0]!.sourceCell).toBeUndefined();
  });

  it("leaves a warning link-less when its date has no (or an ambiguous) anchor", () => {
    const warnings: ParseWarning[] = [
      {
        severity: "warn",
        code: "SCHEDULE_TIME_UNPARSED",
        message: "…",
        blockRef: { kind: "dates", index: 0, iso: "2026-05-99" },
      },
    ];
    attachSourceCellAnchors(warnings, { showDay: anchors, crewRole: [], region: {} });
    expect(warnings[0]!.sourceCell).toBeUndefined();
  });

  it("hasCellAnchoredWarning is TRUE for all fourteen anchored codes (INVERTED for UNKNOWN_ROLE_TOKEN)", () => {
    for (const code of [
      "SCHEDULE_TIME_UNPARSED",
      "UNKNOWN_ROLE_TOKEN",
      "UNKNOWN_DAY_RESTRICTION",
      "UNKNOWN_FIELD",
      "STAGE_WORD_AUTOCORRECTED",
      "AGENDA_GRID_MALFORMED",
      "AGENDA_BLOCK_UNRESOLVED",
      "AGENDA_DAY_AMBIGUOUS",
      "AGENDA_DAY_TRUNCATED",
      "AGENDA_DAY_EMPTIED",
      "PULL_SHEET_PARSE_PARTIAL",
      "PULL_SHEET_AMBIGUOUS_FORMAT",
      "PULL_SHEET_UNKNOWN_VARIANT",
      "FIELD_UNREADABLE",
    ]) {
      expect(hasCellAnchoredWarning([{ severity: "warn", code, message: "x" }])).toBe(true);
    }
    expect(
      hasCellAnchoredWarning([{ severity: "warn", code: "UNKNOWN_SECTION_HEADER", message: "x" }]),
    ).toBe(false);
    expect(hasCellAnchoredWarning([])).toBe(false);
  });
});
