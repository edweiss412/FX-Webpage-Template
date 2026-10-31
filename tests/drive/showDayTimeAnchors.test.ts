import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  attachSourceCellAnchors,
  extractShowDayTimeAnchors,
  hasCellAnchoredWarning,
  resolveSourceCell,
  CELL_ANCHORED_CODES,
  HOTEL_REGION_ANCHORED,
  LINK_ONLY_ANCHORED,
  type ShowDayTimeAnchor,
  type WarningAnchorSources,
} from "@/lib/drive/showDayTimeAnchors";
import type { ContentAnchors } from "@/lib/drive/contentAnchors";
import { OPERATOR_ACTIONABLE_ANCHORED } from "@/lib/parser/dataGaps";
import { buildSheetDeepLink, type SourceAnchor } from "@/lib/sheet-links/buildSheetDeepLink";
import { normalizeDate } from "@/lib/parser/blocks/_helpers";
import { operatorActionableWarnings } from "@/lib/parser/dataGaps";
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

  it("idx32/#154: DISTINCT crew rows get per-row FIELD_UNREADABLE anchors and survive dedup", () => {
    // Two crew members, each with an unreadable field → two FIELD_UNREADABLE warnings. Pre-fix,
    // both resolved to the SINGLE crew region anchor (A2:D5) and collapsed to one row in
    // operatorActionableWarnings, hiding the second unreadable field.
    const twoCrew = [
      { name: "jane doe", anchor: { title: "INFO", gid: 0, a1: "C3" } },
      { name: "john roe", anchor: { title: "INFO", gid: 0, a1: "C4" } },
    ];
    const warnings: ParseWarning[] = [
      {
        severity: "warn",
        code: "FIELD_UNREADABLE",
        message: "phone",
        blockRef: { kind: "crew", index: 0, name: "Jane Doe" },
      },
      {
        severity: "warn",
        code: "FIELD_UNREADABLE",
        message: "email",
        blockRef: { kind: "crew", index: 1, name: "John Roe" },
      },
    ];
    attachSourceCellAnchors(warnings, { showDay: [], crewRole: twoCrew, region: regionAnchors });
    // Each row resolves to its OWN crew cell (not both collapsed to the region rect).
    expect(warnings[0]!.sourceCell).toEqual({ title: "INFO", gid: 0, a1: "C3" });
    expect(warnings[1]!.sourceCell).toEqual({ title: "INFO", gid: 0, a1: "C4" });
    expect(warnings[0]!.sourceCell!.a1).not.toEqual(warnings[1]!.sourceCell!.a1);
    // Distinct a1 → both survive dedup. Count derived from the fixture: 2 distinct crew rows.
    expect(operatorActionableWarnings(warnings)).toHaveLength(2);
  });

  it("idx32/#154: FIELD_UNREADABLE with a name but no crew-anchor match falls back to the region", () => {
    const ws: ParseWarning[] = [
      {
        severity: "warn",
        code: "FIELD_UNREADABLE",
        message: "x",
        blockRef: { kind: "crew", index: 0, name: "Nobody Here" },
      },
    ];
    attachSourceCellAnchors(ws, { showDay: [], crewRole: crewAnchors, region: regionAnchors });
    expect(ws[0]!.sourceCell).toEqual({ title: "INFO", gid: 0, a1: "A2:D5" });
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

  it("resolves ROLE_TOKEN_AUTOCORRECTED by blockRef.name (crew cell)", () => {
    const ws: ParseWarning[] = [
      {
        severity: "warn",
        code: "ROLE_TOKEN_AUTOCORRECTED",
        message: "x",
        blockRef: { kind: "crew", index: 0, name: "Jane Doe" },
      },
    ];
    attachSourceCellAnchors(ws, { showDay: [], crewRole: crewAnchors, region: {} });
    expect(ws[0]!.sourceCell).toEqual({ title: "INFO", gid: 0, a1: "C3" });
  });

  it("resolves COLUMN_HEADER_AUTOCORRECTED by its crew region (blockRef.kind='crew')", () => {
    const ws: ParseWarning[] = [
      {
        severity: "warn",
        code: "COLUMN_HEADER_AUTOCORRECTED",
        message: "x",
        blockRef: { kind: "crew", index: 0 },
      },
    ];
    attachSourceCellAnchors(ws, {
      showDay: [],
      crewRole: [],
      region: { crew: { title: "INFO", gid: 0, a1: "A2:D5" } },
    });
    expect(ws[0]!.sourceCell).toEqual({ title: "INFO", gid: 0, a1: "A2:D5" });
  });

  it("resolves SECTION_HEADER_AUTOCORRECTED by its section region (blockRef.kind=RegionId)", () => {
    const ws: ParseWarning[] = [
      {
        severity: "warn",
        code: "SECTION_HEADER_AUTOCORRECTED",
        message: "x",
        blockRef: { kind: "transportation", index: 0 },
      },
    ];
    attachSourceCellAnchors(ws, {
      showDay: [],
      crewRole: [],
      region: { transportation: { title: "INFO", gid: 9, a1: "A40" } },
    });
    expect(ws[0]!.sourceCell).toEqual({ title: "INFO", gid: 9, a1: "A40" });
  });

  it("resolves FIELD_LABEL_AUTOCORRECTED by its venue region (blockRef.kind='venue')", () => {
    const ws: ParseWarning[] = [
      {
        severity: "warn",
        code: "FIELD_LABEL_AUTOCORRECTED",
        message: "x",
        blockRef: { kind: "venue", index: 0 },
      },
    ];
    attachSourceCellAnchors(ws, {
      showDay: [],
      crewRole: [],
      region: { venue: { title: "INFO", gid: 0, a1: "A5" } },
    });
    expect(ws[0]!.sourceCell).toEqual({ title: "INFO", gid: 0, a1: "A5" });
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

  it("resolves SCHEDULE_STRIKE_DATE_OFF_SCHEDULE by its rooms region (blockRef.kind='rooms')", () => {
    const ws: ParseWarning[] = [
      {
        severity: "warn",
        code: "SCHEDULE_STRIKE_DATE_OFF_SCHEDULE",
        message: "x",
        blockRef: { kind: "rooms", iso: "2025-05-20" },
      },
    ];
    attachSourceCellAnchors(ws, {
      showDay: [],
      crewRole: [],
      region: { rooms: { title: "INFO", gid: 0, a1: "A30" } },
    });
    expect(ws[0]!.sourceCell).toEqual({ title: "INFO", gid: 0, a1: "A30" });
  });

  it("SCHEDULE_STRIKE_DATE_OFF_SCHEDULE with no rooms region → no link", () => {
    const ws: ParseWarning[] = [
      {
        severity: "warn",
        code: "SCHEDULE_STRIKE_DATE_OFF_SCHEDULE",
        message: "x",
        blockRef: { kind: "rooms", iso: "2025-05-20" },
      },
    ];
    attachSourceCellAnchors(ws, { showDay: [], crewRole: [], region: {} });
    expect(ws[0]!.sourceCell).toBeUndefined();
  });

  it("UNKNOWN_FIELD no longer region-falls-back: with no per-row anchor source it stays link-less (never the venue region)", () => {
    // Behavior change (row-precise anchoring): UNKNOWN_FIELD resolves per-row via
    // sources.unknownField, NOT to the whole-block venue region. A no-match leaves
    // sourceCell undefined (spec §5.1.1: correct cell or null, never a block link).
    const ws: ParseWarning[] = [
      {
        severity: "warn",
        code: "UNKNOWN_FIELD",
        message: "x",
        blockRef: { kind: "venue", name: "Foo" },
        rawSnippet: "Foo | bar",
      },
    ];
    attachSourceCellAnchors(ws, {
      showDay: [],
      crewRole: [],
      unknownField: [],
      region: { venue: { title: "INFO", gid: 0, a1: "A5" } },
    });
    expect(ws[0]!.sourceCell).toBeUndefined();
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

  it("hasCellAnchoredWarning is TRUE for all nineteen anchored codes (INVERTED for UNKNOWN_ROLE_TOKEN)", () => {
    for (const code of [
      "SCHEDULE_TIME_UNPARSED",
      "SCHEDULE_STRIKE_DATE_OFF_SCHEDULE",
      "UNKNOWN_ROLE_TOKEN",
      "UNKNOWN_DAY_RESTRICTION",
      "UNKNOWN_FIELD",
      "STAGE_WORD_AUTOCORRECTED",
      "ROLE_TOKEN_AUTOCORRECTED",
      "COLUMN_HEADER_AUTOCORRECTED",
      "SECTION_HEADER_AUTOCORRECTED",
      "FIELD_LABEL_AUTOCORRECTED",
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
    // BLOCK_DISAPPEARED names a block that is gone, so it has no link target.
    expect(
      hasCellAnchoredWarning([{ severity: "warn", code: "BLOCK_DISAPPEARED", message: "x" }]),
    ).toBe(false);
    expect(hasCellAnchoredWarning([])).toBe(false);
  });
});

describe("attachSourceCellAnchors — UNKNOWN_FIELD per-row anchor", () => {
  it("UNKNOWN_FIELD resolves to the per-row cell, not the block region", () => {
    const warnings = [
      {
        severity: "warn",
        code: "UNKNOWN_FIELD",
        message: "x",
        blockRef: { kind: "details", name: "GS Podium Type" },
        rawSnippet: "GS Podium Type | (2) Acrylic Podium",
      },
    ] as ParseWarning[];
    attachSourceCellAnchors(warnings, {
      showDay: [],
      crewRole: [],
      unknownField: [
        {
          kind: "details",
          label: "gs podium type",
          value: "(2) acrylic podium",
          anchor: { title: "INFO", gid: 0, a1: "A8" },
        },
      ],
      region: { details: { title: "INFO", gid: 0, a1: "A55:B74" } },
    });
    expect(warnings[0]!.sourceCell).toEqual({ title: "INFO", gid: 0, a1: "A8" });
  });

  it("UNKNOWN_FIELD with no matching per-row anchor gets NO region fallback", () => {
    const warnings = [
      {
        severity: "warn",
        code: "UNKNOWN_FIELD",
        message: "x",
        blockRef: { kind: "details", name: "Mystery" },
        rawSnippet: "Mystery | val",
      },
    ] as ParseWarning[];
    attachSourceCellAnchors(warnings, {
      showDay: [],
      crewRole: [],
      unknownField: [],
      region: { details: { title: "INFO", gid: 0, a1: "A55:B74" } },
    });
    expect(warnings[0]!.sourceCell).toBeUndefined();
  });

  it("FIELD_UNREADABLE still uses the region fallback (unchanged)", () => {
    const warnings = [
      { severity: "warn", code: "FIELD_UNREADABLE", message: "x", blockRef: { kind: "details" } },
    ] as ParseWarning[];
    attachSourceCellAnchors(warnings, {
      showDay: [],
      crewRole: [],
      unknownField: [],
      region: { details: { title: "INFO", gid: 0, a1: "A55:B74" } },
    });
    expect(warnings[0]!.sourceCell).toEqual({ title: "INFO", gid: 0, a1: "A55:B74" });
  });
});

// Spec 2026-07-27-export-blank-row-segmentation §6 T10 — ORPHANED_CREW_ROWS anchor
// dispatch. Failure mode: the code silently falling through the dispatch chain
// (no arm) would leave the card link-less even when a crew region anchor exists.
describe("attachSourceCellAnchors — ORPHANED_CREW_ROWS crew-region fallback", () => {
  const orphanWarning = (): ParseWarning => ({
    severity: "warn",
    code: "ORPHANED_CREW_ROWS",
    message: "o",
    blockRef: { kind: "crew" },
    rawSnippet: "Doug Larson",
  });

  it("resolves the crew REGION anchor when the region source exists", () => {
    const region = { crew: { title: "INFO", gid: 0, a1: "A10:D20" } };
    const warnings: ParseWarning[] = [orphanWarning()];
    attachSourceCellAnchors(warnings, { showDay: [], crewRole: [], region });
    expect(warnings[0]!.sourceCell).toEqual(region.crew);
  });

  it("stays link-less (no sourceCell) when no crew region source exists", () => {
    const warnings: ParseWarning[] = [orphanWarning()];
    attachSourceCellAnchors(warnings, { showDay: [], crewRole: [], region: {} });
    expect(warnings[0]!.sourceCell).toBeUndefined();
  });
});

describe("attachSourceCellAnchors: HOTEL ambiguity codes region-anchor to the hotels block (spec 2026-08-27 §3)", () => {
  const hotels = { title: "INFO", gid: 0, a1: "A40:C46" };
  const hotel = (code: string): ParseWarning => ({
    severity: "warn",
    code,
    message: "m",
    blockRef: { kind: "hotels", field: "guests", index: 0, name: "Park Hyatt Chicago" },
    rawSnippet: "Park Hyatt Chicago | ...",
  });

  // The five codes as LITERALS, never derived from the set under test: a set that dropped
  // HOTEL_CARDINALITY_EXCEEDED, or gained a sixth for a bogus name, must fail here.
  const HOTEL_CODES = [
    "HOTEL_GUEST_SPLIT_AMBIGUOUS",
    "HOTEL_ADDRESS_SPLIT_AMBIGUOUS",
    "HOTEL_CARDINALITY_EXCEEDED",
    "HOTEL_INLINE_GROUP_OWN_HOTEL",
    "HOTEL_INLINE_GROUP_HOTEL_SUSPECTED",
  ] as const;

  it("HOTEL_REGION_ANCHORED is exactly the five ambiguity codes", () => {
    expect([...HOTEL_REGION_ANCHORED].sort()).toEqual([...HOTEL_CODES].sort());
  });

  it("every one of the five codes gets the hotels region, and nothing else", () => {
    const warnings = HOTEL_CODES.map(hotel);
    attachSourceCellAnchors(warnings, {
      showDay: [],
      crewRole: [],
      region: { hotels, crew: { title: "INFO", gid: 0, a1: "A2:D5" } },
    });
    for (const w of warnings) expect(w.sourceCell, w.code).toEqual(hotels);
  });

  it("no hotels region -> link-less, never another section's range", () => {
    const w = hotel("HOTEL_GUEST_SPLIT_AMBIGUOUS");
    attachSourceCellAnchors([w], {
      showDay: [],
      crewRole: [],
      region: { crew: { title: "INFO", gid: 0, a1: "A2:D5" } },
    });
    expect(w.sourceCell ?? null).toBeNull();
  });

  it("the gid-fetch gate sees a hotel warning; it is a POPULATION gate, not the render gate", () => {
    expect(hasCellAnchoredWarning([hotel("HOTEL_ADDRESS_SPLIT_AMBIGUOUS")])).toBe(true);
    for (const code of HOTEL_CODES) expect(CELL_ANCHORED_CODES.has(code), code).toBe(true);
  });
});

describe("attachSourceCellAnchors: link-only codes outside the render gate (Sheet warnings deep links)", () => {
  const region = (a1: string): SourceAnchor => ({ title: "INFO", gid: 0, a1 });
  const cellAt = (title: string, gid: number, a1: string): SourceAnchor => ({
    title,
    gid,
    a1,
    scope: "cell",
  });
  const regions: Record<string, SourceAnchor> = {
    rooms: region("A60:C70"),
    crew: region("A2:D5"),
    transportation: region("A20:D25"),
    venue: region("A8:B12"),
    dates: region("A30:E36"),
    hotels: region("A40:C46"),
    contacts: region("A50:B55"),
    details: region("A13:B19"),
    gear_packlist: { title: "PULL SHEET", gid: 2, a1: "A1:C9" },
  };
  const noContent: ContentAnchors = {
    rowLabels: [],
    agendaLinks: [],
    travelHeaders: [],
    visibleTabs: new Map(),
  };
  const sources = (
    content: Partial<ContentAnchors> = {},
    region: Record<string, SourceAnchor> = regions,
  ): WarningAnchorSources => ({
    showDay: [],
    crewRole: [],
    region,
    content: { ...noContent, ...content },
  });
  const w = (code: string, extra: Partial<ParseWarning> = {}): ParseWarning => ({
    severity: "warn",
    code,
    message: "m",
    ...extra,
  });
  const run = (warning: ParseWarning, src: WarningAnchorSources): SourceAnchor | null => {
    attachSourceCellAnchors([warning], src);
    return warning.sourceCell ?? null;
  };

  // Literal, never derived from the set under test: a set that dropped a code, or gained one
  // without a branch below, must fail here.
  const LINK_ONLY = [
    "AGENDA_LINK_NOT_CLICKABLE",
    "CREW_COLUMN_POSITIONAL_FALLBACK",
    "DATE_ORDER_SUGGESTS_DMY",
    "PULL_SHEET_ON_ARCHIVED_TAB",
    "ROOM_HEADER_SPLIT_AMBIGUOUS",
    "SECTION_HEADER_NO_FIELDS",
    "TRAVEL_FLIGHT_AMBIGUOUS_TABLE",
    "TRAVEL_FLIGHT_NAME_UNMATCHED",
    "TRAVEL_FLIGHT_UNPARSEABLE",
    "TRAVEL_TRANSPORT_NAME_UNMATCHED",
    "UNKNOWN_SECTION_HEADER",
    "VENUE_ADDRESS_MISSING",
    "VENUE_GEOCODE_UNRESOLVED",
    "VENUE_TIMEZONE_UNRESOLVED",
  ];

  it("LINK_ONLY_ANCHORED is exactly these fourteen codes: population-gated, never render-gated", () => {
    expect([...LINK_ONLY_ANCHORED].sort()).toEqual(LINK_ONLY);
    for (const code of LINK_ONLY) {
      expect(CELL_ANCHORED_CODES.has(code), code).toBe(true);
      expect(hasCellAnchoredWarning([w(code)]), code).toBe(true);
      expect(OPERATOR_ACTIONABLE_ANCHORED.has(code), code).toBe(false);
      expect(HOTEL_REGION_ANCHORED.has(code), code).toBe(false);
    }
  });

  it.each([
    ["ROOM_HEADER_SPLIT_AMBIGUOUS", "rooms"],
    ["CREW_COLUMN_POSITIONAL_FALLBACK", "crew"],
    ["TRAVEL_TRANSPORT_NAME_UNMATCHED", "transportation"],
    ["VENUE_GEOCODE_UNRESOLVED", "venue"],
    ["VENUE_TIMEZONE_UNRESOLVED", "venue"],
    ["DATE_ORDER_SUGGESTS_DMY", "dates"],
  ])("%s links to the %s region, and is link-less without it", (code, id) => {
    expect(run(w(code), sources())).toEqual(regions[id]);
    const rest = Object.fromEntries(Object.entries(regions).filter(([k]) => k !== id));
    expect(run(w(code), sources({}, rest))).toBeNull();
  });

  it.each([
    ["hotels", "hotels"],
    ["contacts", "contacts"],
    ["transportation", "transportation"],
    ["rooms", "rooms"],
    ["event_details", "details"],
    ["dates", "dates"],
  ])("SECTION_HEADER_NO_FIELDS of kind %s links to the %s region", (kind, id) => {
    expect(run(w("SECTION_HEADER_NO_FIELDS", { blockRef: { kind } }), sources())).toEqual(
      regions[id],
    );
  });

  it("SECTION_HEADER_NO_FIELDS of a kind with no region, or with no kind, stays link-less", () => {
    expect(
      run(w("SECTION_HEADER_NO_FIELDS", { blockRef: { kind: "dress" } }), sources()),
    ).toBeNull();
    expect(run(w("SECTION_HEADER_NO_FIELDS"), sources())).toBeNull();
  });

  const header = cellAt("INFO", 0, "A40");
  it("UNKNOWN_SECTION_HEADER links to the one cell holding its header text", () => {
    const src = sources({
      rowLabels: [
        { label: "mystery section", anchor: header },
        { label: "crew", anchor: cellAt("INFO", 0, "A2") },
      ],
    });
    const warning = w("UNKNOWN_SECTION_HEADER", {
      blockRef: { kind: "unknown_section" },
      rawSnippet: "  Mystery   SECTION ",
    });
    expect(run(warning, src)).toEqual(header);
  });

  it("UNKNOWN_SECTION_HEADER with two matching cells, no match, or no snippet stays link-less", () => {
    const twice = sources({
      rowLabels: [
        { label: "mystery section", anchor: header },
        { label: "mystery section", anchor: cellAt("GEAR", 3, "A1") },
      ],
    });
    expect(run(w("UNKNOWN_SECTION_HEADER", { rawSnippet: "MYSTERY SECTION" }), twice)).toBeNull();
    const once = sources({ rowLabels: [{ label: "mystery section", anchor: header }] });
    expect(run(w("UNKNOWN_SECTION_HEADER", { rawSnippet: "Nowhere" }), once)).toBeNull();
    // An empty snippet must not match an empty label (the extractor skips blank cells, but
    // the router must not rely on that).
    const blank = sources({ rowLabels: [{ label: "", anchor: header }] });
    expect(run(w("UNKNOWN_SECTION_HEADER"), blank)).toBeNull();
  });

  it("AGENDA_LINK_NOT_CLICKABLE links to the agenda-link row only when the sheet has exactly one", () => {
    const row = cellAt("INFO", 0, "A22");
    expect(run(w("AGENDA_LINK_NOT_CLICKABLE"), sources({ agendaLinks: [row] }))).toEqual(row);
    const two = sources({ agendaLinks: [row, cellAt("INFO", 0, "A23")] });
    expect(run(w("AGENDA_LINK_NOT_CLICKABLE"), two)).toBeNull();
    expect(run(w("AGENDA_LINK_NOT_CLICKABLE"), sources())).toBeNull();
  });

  it.each([
    "TRAVEL_FLIGHT_UNPARSEABLE",
    "TRAVEL_FLIGHT_NAME_UNMATCHED",
    "TRAVEL_FLIGHT_AMBIGUOUS_TABLE",
  ])(
    "%s: one TRAVEL header gives its cell, several on one tab give the tab, several tabs or none give nothing",
    (code) => {
      const a = cellAt("TRAVEL", 7, "A1");
      const b = cellAt("TRAVEL", 7, "A30");
      const elsewhere = cellAt("INFO", 0, "A80");
      const tw = () => w(code, { blockRef: { kind: "travel", index: 0 } });
      expect(run(tw(), sources({ travelHeaders: [a] }))).toEqual(a);
      expect(run(tw(), sources({ travelHeaders: [a, b] }))).toEqual({
        title: "TRAVEL",
        gid: 7,
        scope: "tab",
      });
      expect(run(tw(), sources({ travelHeaders: [a, elsewhere] }))).toBeNull();
      expect(run(tw(), sources())).toBeNull();
    },
  );

  it("PULL_SHEET_ON_ARCHIVED_TAB links to its own tab when visible, which the builder opens at that gid", () => {
    const arch = (name?: string) =>
      w("PULL_SHEET_ON_ARCHIVED_TAB", {
        blockRef: { kind: "pull_sheet_archived_tab", ...(name ? { name } : {}) },
      });
    const src = sources({ visibleTabs: new Map([["OLD PULL SHEET", 12]]) });
    const anchor = run(arch("OLD PULL SHEET"), src);
    expect(anchor).toEqual({ title: "OLD PULL SHEET", gid: 12, scope: "tab" });
    // Not on the allowlist, so only the tab scope lets the builder honour the gid.
    expect(buildSheetDeepLink("dfid", anchor)).toMatch(/\/d\/dfid\/edit#gid=12$/);
    // A hidden tab is absent from visibleTabs; an unnamed one has nothing to look up. Neither
    // falls back to the live PULL SHEET region.
    expect(run(arch("OLD GEAR"), src)).toBeNull();
    expect(run(arch(), src)).toBeNull();
  });
});
