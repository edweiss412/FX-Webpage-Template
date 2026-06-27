/**
 * Corpus regression: extractSourceAnchors resolves each region to the right
 * tab+region across BOTH sheet-format eras (spec §8.1).
 *
 * Two synthetic fixtures drawn from real East Coast (legacy single-INFO) and
 * RPAS (standardized multitab) layouts, built in-test via XLSX.utils.
 */
import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { extractSourceAnchors } from "@/lib/drive/sourceAnchors";
import { SOURCE_LINK_ALLOWLIST, REGION_IDS } from "@/lib/sheet-links/buildSheetDeepLink";

// ── fixture builder ───────────────────────────────────────────────────────────

function makeWorkbookBuffer(sheets: Array<{ name: string; rows: unknown[][] }>): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s.rows), s.name);
  }
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

// ── Fixture 1: Legacy single-INFO (East Coast-style) ─────────────────────────
//
// One INFO tab containing VENUE, CREW(TECH), HOTEL, TRANSPORTATION, COI/Proposal/PO
// rows plus GS scope rows; an AGENDA tab; a PULL SHEET tab.
// No GEAR tab.  Non-allowlisted tab CLIENT also present (should produce no anchor).

const LEGACY_INFO_ROWS: unknown[][] = [
  // --- VENUE block ---
  ["VENUE", "Marriott Marquis"],
  ["Hotel Address", "1535 Broadway, NY"],
  ["Loading Dock", "West 45th"],
  // --- CREW / TECH block ---
  ["CREW", "PHONE"],
  ["Doug - Lead", "917-555-0001"],
  ["Eric - A1", "508-555-0002"],
  // --- HOTEL block ---
  ["HOTEL", "Four Seasons"],
  ["Hotel Address", "57 E 57th St"],
  // --- TRANSPORTATION block ---
  ["TRANSPORTATION", "Van"],
  ["Driver", "James"],
  ["Parking", "#45"],
  // --- GS scope rows (rooms) ---
  ["GS Audio", "(1) QU32 SB168"],
  ["GS Video", "(2) Eiki EK-G5900"],
  ["BO Audio", "NONE"],
  // --- Contact info ---
  ["Contact Info", "ashley@venue.com"],
  ["In House AV", "mark@venue.com"],
  // --- Financials: COI + Proposal + PO union ---
  ["COI", "Sent"],
  ["Proposal", "Sent - $17,500"],
  ["PO#", "4521"],
  // --- CLIENT block (PR-D4 client RegionId, appended at the END so existing row indices
  //     above are unchanged) ---
  ["CLIENT", "Institutional Investor"],
  ["Client Contact", "Maria Ferrer"],
];

const LEGACY_AGENDA_ROWS: unknown[][] = [
  ["NAME", "START", "FINISH"],
  ["GS Setup", "7:00 AM", "8:00 AM"],
  ["GS Rehearsal", "8:00 AM", "10:00 AM"],
  ["GS Show", "10:00 AM", "12:00 PM"],
];

const LEGACY_PULL_SHEET_ROWS: unknown[][] = [
  ["QTY", "ITEM", "SERIAL"],
  ["1", "QU32", "SN001"],
  ["2", "Eiki EK-G5900", "SN002"],
];

// CLIENT tab — NOT in allowlist; no anchor should be produced
const LEGACY_CLIENT_ROWS: unknown[][] = [
  ["CLIENT", "Acme Corp"],
  ["Contact", "Jane Doe"],
];

// ── Fixture 2: Standardized multitab (RPAS-style) ────────────────────────────
//
// INFO tab with CREW, VENUE, DATES, HOTEL blocks; AGENDA tab; GEAR tab (no PULL SHEET).
// A master-library tab "TECH" (NOT in allowlist) — must produce no anchor.

const STANDARDIZED_INFO_ROWS: unknown[][] = [
  // --- CREW block ---
  ["CREW", "PHONE"],
  ["Doug - Lead", "917-555-0001"],
  ["Sarah - PM", "617-555-0003"],
  // --- VENUE block ---
  ["VENUE", "Gaylord Rockies"],
  ["Hotel Address", "6700 N Gaylord Rockies Blvd"],
  ["Google", "https://maps.google.com/?q=Gaylord+Rockies"],
  // --- HOTEL block ---
  ["HOTEL", "Gaylord Rockies"],
  ["Hotel Address", "6700 N Gaylord Rockies Blvd"],
  // --- TRANSPORTATION block ---
  ["TRANSPORTATION", "Shuttle"],
  ["Driver", "Marcus"],
  // --- GS scope rows (rooms) ---
  ["GS Audio", "(2) QU32"],
  ["GS Video", "(3) Eiki"],
  ["BREAKOUT 1", "Pikes Peak A"],
  // --- Financials ---
  ["COI", "Pending"],
  ["Proposal", "Approved"],
  ["Invoice", "#INV-2026-042"],
  // --- DATES (should NOT become the schedule anchor) ---
  ["DATES", ""],
  ["Travel In", "2026-06-10"],
  ["Travel Out", "2026-06-14"],
];

const STANDARDIZED_AGENDA_ROWS: unknown[][] = [
  ["NAME", "START", "FINISH"],
  ["Load In", "6:00 AM", "9:00 AM"],
  ["Sound Check", "9:00 AM", "10:00 AM"],
  ["Keynote", "10:00 AM", "12:00 PM"],
];

const STANDARDIZED_GEAR_ROWS: unknown[][] = [
  ["QTY", "ITEM", "NOTES"],
  ["2", "QU32", "FOH"],
  ["3", "Eiki EK-G5900", "Projection"],
];

// TECH tab — NOT in allowlist; no anchor should be produced
const STANDARDIZED_TECH_ROWS: unknown[][] = [
  ["ITEM", "OWNER", "NOTES"],
  ["QU32", "FXAV", "Rack mount"],
];

// ── tests ─────────────────────────────────────────────────────────────────────

describe("Legacy single-INFO fixture (East Coast-style)", () => {
  const buffer = makeWorkbookBuffer([
    { name: "INFO", rows: LEGACY_INFO_ROWS },
    { name: "AGENDA", rows: LEGACY_AGENDA_ROWS },
    { name: "PULL SHEET", rows: LEGACY_PULL_SHEET_ROWS },
    { name: "CLIENT", rows: LEGACY_CLIENT_ROWS },
  ]);

  const titleToGid = new Map<string, number>([
    ["INFO", 0],
    ["AGENDA", 1],
    ["PULL SHEET", 2],
    ["CLIENT", 99],
  ]);

  const anchors = extractSourceAnchors(buffer, titleToGid);

  it("every produced anchor's title is in SOURCE_LINK_ALLOWLIST", () => {
    const allowlist: readonly string[] = SOURCE_LINK_ALLOWLIST;
    for (const regionId of REGION_IDS) {
      const anchor = anchors[regionId];
      if (anchor) {
        expect(
          allowlist,
          `Region "${regionId}" produced anchor with title "${anchor.title}" which is not in SOURCE_LINK_ALLOWLIST`,
        ).toContain(anchor.title);
      }
    }
  });

  it("crew → INFO tab", () => {
    expect(anchors.crew?.title).toBe("INFO");
  });

  it("venue → INFO tab", () => {
    expect(anchors.venue?.title).toBe("INFO");
  });

  it("venue a1 does NOT overreach into CREW block (header-block stops at CREW terminator)", () => {
    // LEGACY_INFO_ROWS: VENUE header at row 0, Hotel Address at row 1, Loading Dock at row 2,
    // then CREW header at row 3 (terminator). venue must end at row 2 (index 2), i.e. A1:B3.
    expect(anchors.venue).toBeDefined();
    const range = XLSX.utils.decode_range(anchors.venue!.a1!);
    expect(
      range.e.r,
      "venue must not overreach past row 2 (before CREW at row 3)",
    ).toBeLessThanOrEqual(2);
  });

  it("hotels → INFO tab", () => {
    expect(anchors.hotels?.title).toBe("INFO");
  });

  it("transportation → INFO tab", () => {
    expect(anchors.transportation?.title).toBe("INFO");
  });

  it("rooms → INFO tab", () => {
    expect(anchors.rooms?.title).toBe("INFO");
  });

  it("contacts → INFO tab", () => {
    expect(anchors.contacts?.title).toBe("INFO");
  });

  it("client → INFO tab (PR-D4: header-block resolves the CLIENT row in INFO, not the CLIENT tab)", () => {
    // Real extraction (not a prebuilt anchor): the client RegionId's header-block /^CLIENT$/i
    // resolves to the CLIENT block within the allowlisted INFO tab — NOT the non-allowlisted
    // legacy CLIENT master-library tab (which produces no anchor).
    expect(anchors.client?.title).toBe("INFO");
  });

  it("financials → INFO tab (multi-label union: COI + Proposal + PO)", () => {
    expect(anchors.financials?.title).toBe("INFO");
  });

  it("financials union: a1 spans all three matched rows (COI, Proposal, PO#)", () => {
    // COI is row 17 (0-indexed), PO# is row 19 → bounding range must span all 3
    const anchor = anchors.financials;
    expect(anchor).toBeDefined();
    // Decode the a1 range and confirm it spans at least 3 rows
    const range = XLSX.utils.decode_range(anchor!.a1!);
    expect(range.e.r - range.s.r + 1).toBeGreaterThanOrEqual(3);
  });

  it("schedule → AGENDA tab (cross-tab: INFO DATES rows do NOT produce schedule)", () => {
    expect(anchors.schedule?.title).toBe("AGENDA");
    expect(anchors.schedule?.gid).toBe(1);
  });

  it("gear_packlist → PULL SHEET tab", () => {
    expect(anchors.gear_packlist?.title).toBe("PULL SHEET");
    expect(anchors.gear_packlist?.gid).toBe(2);
  });

  it("CLIENT tab produces NO anchor (not in allowlist)", () => {
    // No region should have title === "CLIENT"
    for (const regionId of REGION_IDS) {
      expect(anchors[regionId]?.title).not.toBe("CLIENT");
    }
  });

  it("flights aliases the crew anchor (same gid + a1)", () => {
    expect(anchors.flights).toEqual(anchors.crew);
  });
});

describe("Standardized multitab fixture (RPAS-style)", () => {
  const buffer = makeWorkbookBuffer([
    { name: "INFO", rows: STANDARDIZED_INFO_ROWS },
    { name: "AGENDA", rows: STANDARDIZED_AGENDA_ROWS },
    { name: "GEAR", rows: STANDARDIZED_GEAR_ROWS },
    { name: "TECH", rows: STANDARDIZED_TECH_ROWS },
  ]);

  const titleToGid = new Map<string, number>([
    ["INFO", 0],
    ["AGENDA", 1],
    ["GEAR", 2],
    ["TECH", 99],
  ]);

  const anchors = extractSourceAnchors(buffer, titleToGid);

  it("every produced anchor's title is in SOURCE_LINK_ALLOWLIST", () => {
    const allowlist: readonly string[] = SOURCE_LINK_ALLOWLIST;
    for (const regionId of REGION_IDS) {
      const anchor = anchors[regionId];
      if (anchor) {
        expect(
          allowlist,
          `Region "${regionId}" produced anchor with title "${anchor.title}" which is not in SOURCE_LINK_ALLOWLIST`,
        ).toContain(anchor.title);
      }
    }
  });

  it("crew → INFO tab", () => {
    expect(anchors.crew?.title).toBe("INFO");
  });

  it("venue → INFO tab", () => {
    expect(anchors.venue?.title).toBe("INFO");
  });

  it("venue a1 does NOT overreach into HOTEL block (header-block stops at HOTEL terminator)", () => {
    // STANDARDIZED_INFO_ROWS: CREW rows 0-2, VENUE header at row 3, Hotel Address row 4,
    // Google row 5, then HOTEL header at row 6 (terminator). venue must end at row 5 (index 5).
    expect(anchors.venue).toBeDefined();
    const range = XLSX.utils.decode_range(anchors.venue!.a1!);
    expect(
      range.e.r,
      "venue must not overreach past row 5 (before HOTEL at row 6)",
    ).toBeLessThanOrEqual(5);
  });

  it("hotels → INFO tab", () => {
    expect(anchors.hotels?.title).toBe("INFO");
  });

  it("transportation → INFO tab", () => {
    expect(anchors.transportation?.title).toBe("INFO");
  });

  it("rooms → INFO tab (GS scope + BREAKOUT rows)", () => {
    expect(anchors.rooms?.title).toBe("INFO");
  });

  it("financials → INFO tab (COI + Proposal + Invoice union)", () => {
    expect(anchors.financials?.title).toBe("INFO");
  });

  it("financials union spans all 3 matched rows", () => {
    const anchor = anchors.financials;
    expect(anchor).toBeDefined();
    const range = XLSX.utils.decode_range(anchor!.a1!);
    expect(range.e.r - range.s.r + 1).toBeGreaterThanOrEqual(3);
  });

  it("schedule → AGENDA tab (NOT INFO despite DATES block in INFO)", () => {
    expect(anchors.schedule?.title).toBe("AGENDA");
    expect(anchors.schedule?.gid).toBe(1);
  });

  it("gear_packlist → GEAR tab (PULL SHEET absent, falls back to GEAR)", () => {
    expect(anchors.gear_packlist?.title).toBe("GEAR");
    expect(anchors.gear_packlist?.gid).toBe(2);
  });

  it("TECH tab produces NO anchor (not in allowlist)", () => {
    for (const regionId of REGION_IDS) {
      expect(anchors[regionId]?.title).not.toBe("TECH");
    }
  });

  it("flights aliases the crew anchor", () => {
    expect(anchors.flights).toEqual(anchors.crew);
  });
});
