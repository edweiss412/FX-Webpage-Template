// tests/parser/travelFlights.test.ts
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { parseSheet } from "@/lib/parser";

function flightOf(md: string, name: string) {
  const r = parseSheet(md, "t.md");
  return { crew: r.crewMembers, warnings: r.warnings, row: r.crewMembers.find((m) => (m.name ?? "").includes(name)) };
}

// ── minimal TRAVEL-block builder ────────────────────────────────────────────
// Produces a minimal markdown string with the full TRAVEL header signature
// plus the given data rows.
function makeTravelMd(dataRows: string[], extraBlocks: string[] = []): string {
  const header = "| NAME | ROLE |  | CONFIRMED | FLIGHT BOOKED |  | OK to BOOK? | NOTES | FLIGHT DETAILS | FLIGHT DETAILS |";
  const sep    = "| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |";
  return [header, sep, ...dataRows, "", ...extraBlocks].join("\n");
}

// Build a data row with exact column count (10 cells)
function row(
  name: string,
  role = "",
  col2 = "",
  confirmed = "",
  flightBooked = "",
  col5 = "",
  okToBook = "",
  notes = "",
  flightDetails = "",
  flightDetails2 = "",
): string {
  return `| ${name} | ${role} | ${col2} | ${confirmed} | ${flightBooked} | ${col5} | ${okToBook} | ${notes} | ${flightDetails} | ${flightDetails2} |`;
}

// Build a crew section so parseSheet picks up crew members.
// parseCrew requires "| CREW |" as the block header (CREW_HEADER_RE = /^\|\s*CREW\s*\|/m).
function crewSection(names: string[]): string {
  const lines = [
    "| CREW | NAME | ROLE | PHONE | EMAIL |",
    "| :--- | :--- | :--- | :--- | :--- |",
    ...names.map((n) => `|  | ${n} | CREW MEMBER |  |  |`),
  ];
  return lines.join("\n");
}

describe("parseTravelFlights — fixtures", () => {
  it("rpas.md → John Carleo flight_info derived from source cell; ZERO TRAVEL_FLIGHT_* warnings", () => {
    const md = readFileSync("fixtures/shows/exporter-xlsx/rpas.md", "utf8");
    const { crew, warnings, row: r } = flightOf(md, "John Carleo");
    // anti-tautology: assert specific tokens that come from the fixture cell
    expect(r?.flight_info).toContain("GEUZAB 3/22 AA3002");
    expect(r?.flight_info).toContain(" | 3/26 AA2723");
    // no OTHER crew row gains a flight; no travel warning on a real show
    expect(crew.filter((m) => m.flight_info != null).map((m) => m.name)).toEqual(["John Carleo"]);
    expect(warnings.filter((w) => w.code.startsWith("TRAVEL_FLIGHT_"))).toEqual([]);
  });

  it("fintech.md → John Carleo flight_info (no conf), zero travel warnings", () => {
    const md = readFileSync("fixtures/shows/exporter-xlsx/fintech.md", "utf8");
    const { warnings, row: r } = flightOf(md, "John Carleo");
    expect(r?.flight_info).toBe("5/2 AA1080 LGA - ORD 12:00pm - 1:00pm | 5/7 AA3237 ORD - LGA 10:02am - 1:17pm");
    expect(warnings.filter((w) => w.code.startsWith("TRAVEL_FLIGHT_"))).toEqual([]);
  });
});

describe("parseTravelFlights — synthetic edge cases", () => {
  it("unmatched name: flyer not on roster → TRAVEL_FLIGHT_NAME_UNMATCHED, no mutation", () => {
    const dataRow = row("Jane Doe", "CREW", "", "TRUE", "TRUE", "", "TRUE", "", "3/15 AA123 JFK - LAX 8:00am - 11:00am");
    const md = crewSection(["Alice Smith"]) + "\n\n" + makeTravelMd([dataRow]);
    const { crew, warnings } = flightOf(md, "Jane Doe");
    expect(crew.every((m) => m.flight_info == null)).toBe(true);
    expect(warnings.filter((w) => w.code === "TRAVEL_FLIGHT_NAME_UNMATCHED")).toHaveLength(1);
  });

  it("ambiguous name: two roster entries with same name → TRAVEL_FLIGHT_NAME_UNMATCHED, no mutation", () => {
    const dataRow = row("John Carleo", "CREW", "", "TRUE", "TRUE", "", "TRUE", "", "3/15 AA123 JFK - LAX 8:00am - 11:00am");
    const md = crewSection(["John Carleo", "John Carleo"]) + "\n\n" + makeTravelMd([dataRow]);
    const r = parseSheet(md, "t.md");
    expect(r.crewMembers.every((m) => m.flight_info == null)).toBe(true);
    expect(r.warnings.filter((w) => w.code === "TRAVEL_FLIGHT_NAME_UNMATCHED")).toHaveLength(1);
  });

  it("format-drift: matched flyer, non-sentinel cell, no M/D → TRAVEL_FLIGHT_UNPARSEABLE, flight_info stays null", () => {
    const dataRow = row("Alice Smith", "CREW", "", "TRUE", "TRUE", "", "TRUE", "", "UNKNOWN FLIGHT INFO NO DATE");
    const md = crewSection(["Alice Smith"]) + "\n\n" + makeTravelMd([dataRow]);
    const r = parseSheet(md, "t.md");
    const alice = r.crewMembers.find((m) => (m.name ?? "").includes("Alice"));
    expect(alice?.flight_info).toBeNull();
    expect(r.warnings.filter((w) => w.code === "TRAVEL_FLIGHT_UNPARSEABLE")).toHaveLength(1);
  });

  it("named cell with date AND 'FLIGHT #' text → PARSES (not legend-dropped)", () => {
    // A real flight cell that happens to contain the text "FLIGHT #" — must parse
    const dataRow = row("Alice Smith", "CREW", "", "TRUE", "TRUE", "", "TRUE", "", "3/15 FLIGHT # AA123 JFK - LAX");
    const md = crewSection(["Alice Smith"]) + "\n\n" + makeTravelMd([dataRow]);
    const r = parseSheet(md, "t.md");
    const alice = r.crewMembers.find((m) => (m.name ?? "").includes("Alice"));
    // Should parse: there IS a date (3/15), so normalizeTravelCell returns non-null
    expect(alice?.flight_info).not.toBeNull();
    expect(r.warnings.filter((w) => w.code.startsWith("TRAVEL_FLIGHT_"))).toHaveLength(0);
  });

  it("blank-NAME legend row (CODE/XXX-XXX) → no flight, no warning", () => {
    // The fintech pattern: last row has blank NAME cell but flight-like content
    const legendRow = row("", "ROLE", "", "", "", "", "", "CODE DATE FLIGHT \\# XXX - XXX TIME", "CODE DATE FLIGHT \\# XXX - XXX TIME");
    const dataRow = row("Alice Smith", "CREW", "", "TRUE", "TRUE", "", "TRUE", "", "3/15 AA123 JFK - LAX 8:00am");
    const md = crewSection(["Alice Smith"]) + "\n\n" + makeTravelMd([dataRow, legendRow]);
    const r = parseSheet(md, "t.md");
    // Only Alice gets a flight; blank-name row triggers break → no warning for it
    const alice = r.crewMembers.find((m) => (m.name ?? "").includes("Alice"));
    expect(alice?.flight_info).not.toBeNull();
    expect(r.warnings.filter((w) => w.code.startsWith("TRAVEL_FLIGHT_"))).toHaveLength(0);
  });

  it("sentinel DRIVING → silent non-flyer (no warning)", () => {
    const dataRow = row("Alice Smith", "CREW", "", "TRUE", "N/A", "", "N/A", "DRIVING", "DRIVING");
    const md = crewSection(["Alice Smith"]) + "\n\n" + makeTravelMd([dataRow]);
    const r = parseSheet(md, "t.md");
    const alice = r.crewMembers.find((m) => (m.name ?? "").includes("Alice"));
    expect(alice?.flight_info).toBeNull();
    expect(r.warnings.filter((w) => w.code.startsWith("TRAVEL_FLIGHT_"))).toHaveLength(0);
  });

  it("sentinel LOCAL (mixed case) → silent non-flyer", () => {
    const dataRow = row("Alice Smith", "CREW", "", "TRUE", "N/A", "", "N/A", "Local", "Local");
    const md = crewSection(["Alice Smith"]) + "\n\n" + makeTravelMd([dataRow]);
    const r = parseSheet(md, "t.md");
    const alice = r.crewMembers.find((m) => (m.name ?? "").includes("Alice"));
    expect(alice?.flight_info).toBeNull();
    expect(r.warnings.filter((w) => w.code.startsWith("TRAVEL_FLIGHT_"))).toHaveLength(0);
  });

  it("precedence: crew row pre-set with flight_info != null → NOT overwritten by TRAVEL path", () => {
    // east-coast.md has TECH-path flights; it also should NOT be touched by TRAVEL path
    // We construct: a crew member with pre-existing flight_info (simulate via east-coast fixture)
    // The east-coast fixture has no TRAVEL table, so TRAVEL path is a no-op there.
    // For direct test: build a crew member and manually verify the TRAVEL path can't overwrite.
    // We do this by giving the same name two potential flight sources but the TRAVEL block only
    // runs after parseCrew. We can't directly pre-set flight_info, but we can use east-coast.md
    // which already tests TECH-path precedence (that fixture has no TRAVEL block).
    // More direct: build a markdown where the same "name" appears in a NOTES column with "DRIVING"
    // AND in a synthetic TRAVEL table with a real flight — the NOTES/DRIVING TECH-col would be null,
    // so we need another approach.
    // The cleanest way: ensure TRAVEL path assigns only once. Duplicate TRAVEL rows for same person.
    const dataRow = row("Alice Smith", "CREW", "", "TRUE", "TRUE", "", "TRUE", "", "3/15 AA123 JFK - LAX 8:00am");
    const dataRow2 = row("Alice Smith", "CREW", "", "TRUE", "TRUE", "", "TRUE", "", "3/20 AA999 LAX - JFK 9:00am");
    const md = crewSection(["Alice Smith"]) + "\n\n" + makeTravelMd([dataRow, dataRow2]);
    const r = parseSheet(md, "t.md");
    const alice = r.crewMembers.find((m) => (m.name ?? "").includes("Alice"));
    // First row wins (precedence: first assignment not overwritten)
    expect(alice?.flight_info).toBe("3/15 AA123 JFK - LAX 8:00am");
    // Second row: Alice already has flight_info != null → skip → TRAVEL_FLIGHT_NAME_UNMATCHED
    // Wait — Alice is matched (1 roster entry); precedence check skips the overwrite silently
    // No warning for the second row (it's a silent skip, not an unmatched)
    expect(r.warnings.filter((w) => w.code.startsWith("TRAVEL_FLIGHT_"))).toHaveLength(0);
  });

  it("escaped pipe in flight cell → column binding intact, leg count correct", () => {
    // A cell with literal \\| should be treated as a literal pipe (not column delimiter)
    // After clean(), \\| → | which becomes / via normalizeTravelCell
    // The column binding must remain correct (flight attaches to correct row).
    const flightCell = "3/15 AA123 JFK \\| LAX 8:00am - 11:00am";
    const dataRow = row("Alice Smith", "CREW", "", "TRUE", "TRUE", "", "TRUE", "", flightCell);
    const md = crewSection(["Alice Smith"]) + "\n\n" + makeTravelMd([dataRow]);
    const r = parseSheet(md, "t.md");
    const alice = r.crewMembers.find((m) => (m.name ?? "").includes("Alice"));
    // clean() unescapes \\| → |, then normalizeTravelCell replaces | with /
    expect(alice?.flight_info).not.toBeNull();
    // The result should contain the date leg
    expect(alice?.flight_info).toContain("3/15");
    expect(r.warnings.filter((w) => w.code.startsWith("TRAVEL_FLIGHT_"))).toHaveLength(0);
  });

  it("non-TRAVEL scoping: NAME…FLIGHT DETAILS table lacking FLIGHT BOOKED/OK TO BOOK? → not matched", () => {
    // A table with NAME and FLIGHT DETAILS but WITHOUT the sibling cols → not a TRAVEL block
    const nonTravelHeader = "| NAME | ROLE | NOTES | FLIGHT DETAILS |";
    const nonTravelSep    = "| :---: | :---: | :---: | :---: |";
    const nonTravelRow    = "| Alice Smith | CREW |  | 3/15 AA123 JFK - LAX 8:00am |";
    const md = crewSection(["Alice Smith"]) + "\n\n" + [nonTravelHeader, nonTravelSep, nonTravelRow].join("\n");
    const r = parseSheet(md, "t.md");
    const alice = r.crewMembers.find((m) => (m.name ?? "").includes("Alice"));
    expect(alice?.flight_info).toBeNull();
    expect(r.warnings.filter((w) => w.code.startsWith("TRAVEL_FLIGHT_"))).toHaveLength(0);
  });

  it("duplicate TRAVEL blocks → no mutation, one TRAVEL_FLIGHT_AMBIGUOUS_TABLE", () => {
    const dataRow = row("Alice Smith", "CREW", "", "TRUE", "TRUE", "", "TRUE", "", "3/15 AA123 JFK - LAX 8:00am");
    const block1 = makeTravelMd([dataRow]);
    const block2 = makeTravelMd([dataRow]);
    const md = crewSection(["Alice Smith"]) + "\n\n" + block1 + "\n\n" + block2;
    const r = parseSheet(md, "t.md");
    const alice = r.crewMembers.find((m) => (m.name ?? "").includes("Alice"));
    expect(alice?.flight_info).toBeNull();
    expect(r.warnings.filter((w) => w.code === "TRAVEL_FLIGHT_AMBIGUOUS_TABLE")).toHaveLength(1);
  });

  it("ADJACENT duplicate TRAVEL headers in ONE contiguous block (no blank line) → no mutation, one AMBIGUOUS_TABLE (R2 fail-safe)", () => {
    // A stale TRAVEL table pasted directly above the current one with NO blank line forms a
    // SINGLE contiguous pipe block holding two header-signature rows. The duplicate fail-safe
    // must still fire — otherwise the stale rows are processed first and attach the wrong flight
    // (TECH-style precedence then blocks the current row from overwriting it).
    const header = "| NAME | ROLE |  | CONFIRMED | FLIGHT BOOKED |  | OK to BOOK? | NOTES | FLIGHT DETAILS | FLIGHT DETAILS |";
    const sep = "| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |";
    const staleRow = row("Alice Smith", "CREW", "", "TRUE", "TRUE", "", "TRUE", "", "3/01 AA999 OLD - STALE 1:00am");
    const currentRow = row("Alice Smith", "CREW", "", "TRUE", "TRUE", "", "TRUE", "", "3/15 AA123 JFK - LAX 8:00am");
    // NO blank line anywhere → one contiguous pipe block with TWO TRAVEL headers.
    const adjacentDup = [header, sep, staleRow, header, sep, currentRow].join("\n");
    const md = crewSection(["Alice Smith"]) + "\n\n" + adjacentDup;
    const r = parseSheet(md, "t.md");
    const alice = r.crewMembers.find((m) => (m.name ?? "").includes("Alice"));
    expect(alice?.flight_info).toBeNull(); // fail-safe: neither the stale nor the current flight attaches
    expect(r.warnings.filter((w) => w.code === "TRAVEL_FLIGHT_AMBIGUOUS_TABLE")).toHaveLength(1);
  });

  it("following table after blank line with date cell → not scanned (TRAVEL block is contiguous)", () => {
    // The TRAVEL block ends at first non-pipe line; a second table after a blank line is NOT part of the TRAVEL block.
    // Build a TRAVEL block for Alice; after a blank line, a plain table with Bob (non-TRAVEL signature).
    // Bob should NOT have flight_info assigned (the second table lacks FLIGHT BOOKED/OK TO BOOK?).
    const dataRow = row("Alice Smith", "CREW", "", "TRUE", "TRUE", "", "TRUE", "", "3/15 AA123 JFK - LAX 8:00am");
    // Following table has NAME + FLIGHT DETAILS but no FLIGHT BOOKED sibling → not a TRAVEL block
    const followingTableHeader = "| NAME | NOTES | FLIGHT DETAILS |";
    const followingTableSep    = "| :---: | :---: | :---: |";
    const followingTableRow    = "| Bob Jones | note | 3/20 AA999 LAX - JFK 9:00am |";
    const followingTable = [followingTableHeader, followingTableSep, followingTableRow].join("\n");
    const md = crewSection(["Alice Smith", "Bob Jones"]) + "\n\n" + makeTravelMd([dataRow]) + "\n\n" + followingTable;
    const r = parseSheet(md, "t.md");
    // Only the real TRAVEL block is parsed; the following table (no FLIGHT BOOKED sibling) is ignored
    const bob = r.crewMembers.find((m) => (m.name ?? "").includes("Bob"));
    // Bob is found on the crew roster but NOT in the TRAVEL block
    expect(bob?.flight_info ?? null).toBeNull();
    // Alice gets her flight from the TRAVEL block
    const alice = r.crewMembers.find((m) => (m.name ?? "").includes("Alice"));
    expect(alice?.flight_info).not.toBeNull();
    expect(r.warnings.filter((w) => w.code.startsWith("TRAVEL_FLIGHT_"))).toHaveLength(0);
  });
});
