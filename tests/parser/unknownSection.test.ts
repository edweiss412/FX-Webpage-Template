/**
 * Class B — UNKNOWN_SECTION_HEADER (parse-data-quality-warnings §5.2, VB09).
 *
 * An unknown section appended to a sheet (e.g. `CATERING | NAME | PHONE`) is
 * silently dropped today — its rows never reach output and nothing is captured.
 * Class B scans the markdown after block parsers run and emits
 * UNKNOWN_SECTION_HEADER for a section-header-shaped row whose col0 matches no
 * known-section-header registry entry.
 *
 * Detection contract (§5.2): registry-miss + header-band shape, NOT span
 * position. The grounding incident appends CATERING immediately after
 * TRANSPORTATION with no blank separator, so adjacency must be irrelevant.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { parseSheet } from "@/lib/parser";
import { isKnownSectionHeader } from "@/lib/parser/knownSections";

function unknownSectionWarnings(md: string) {
  return parseSheet(md).warnings.filter((w) => w.code === "UNKNOWN_SECTION_HEADER");
}

// A minimal-but-valid v4 sheet head so detectVersion passes and the parsers run.
const SHEET_HEAD = [
  "| CLIENT | Institutional Investor |",
  "| VENUE | VENUE NAME | Test Venue |",
  "| DATES |  | DAY | DATE | TIME |",
  "| CREW | NAME | ROLE | PHONE | EMAIL |",
  "| | John Smith | A1 | 917-331-4885 | john@example.com |",
  "",
  "| TRANSPORTATION | NAME | PHONE | EMAIL |",
  "| | Acme Cars | 555-1212 | acme@example.com |",
].join("\n");

describe("Class B — UNKNOWN_SECTION_HEADER detection", () => {
  it("fires for an unknown CATERING band after TRANSPORTATION (with blank separator)", () => {
    const md = [
      SHEET_HEAD,
      "",
      "| CATERING | NAME | PHONE |",
      "| | Joe's Catering | 555-9999 |",
    ].join("\n");
    const warns = unknownSectionWarnings(md);
    expect(warns.length).toBe(1);
    expect(warns[0]!.rawSnippet).toContain("CATERING");
  });

  it("STILL fires when CATERING immediately follows TRANSPORTATION with NO blank separator (the literal VB09 shape)", () => {
    // No blank line between the last TRANSPORTATION row and CATERING — transport's
    // contiguous-table slice would swallow it, recreating the silent drop. The
    // registry+shape gate is span-independent, so it must still fire.
    const md = [
      "| CLIENT | Institutional Investor |",
      "| VENUE | VENUE NAME | Test Venue |",
      "| DATES |  | DAY | DATE | TIME |",
      "| CREW | NAME | ROLE | PHONE | EMAIL |",
      "| | John Smith | A1 | 917-331-4885 | john@example.com |",
      "",
      "| TRANSPORTATION | NAME | PHONE | EMAIL |",
      "| | Acme Cars | 555-1212 | acme@example.com |",
      "| CATERING | NAME | PHONE |",
      "| | Joe's Catering | 555-9999 |",
    ].join("\n");
    const warns = unknownSectionWarnings(md);
    expect(warns.length).toBe(1);
    expect(warns[0]!.rawSnippet).toContain("CATERING");
  });

  it("does NOT fire for a recognized header (TRANSPORTATION)", () => {
    expect(unknownSectionWarnings(SHEET_HEAD)).toEqual([]);
  });

  it("does NOT fire for a recognized-but-empty section (SECTION_HEADER_NO_FIELDS owns it, no double-fire)", () => {
    const md = [
      "| CLIENT | Institutional Investor |",
      "| VENUE | VENUE NAME | Test Venue |",
      "| DATES |  | DAY | DATE | TIME |",
      "| CREW | NAME | ROLE | PHONE | EMAIL |",
      "| | John Smith | A1 | 917-331-4885 | john@example.com |",
      "",
      "| HOTEL | RESERVATION \\#1 |",
      "",
    ].join("\n");
    const all = parseSheet(md).warnings;
    expect(all.filter((w) => w.code === "UNKNOWN_SECTION_HEADER")).toEqual([]);
  });

  it("does NOT fire for a lone all-caps GEAR row (only 1 header-word band — <2 field-header columns)", () => {
    const md = [
      SHEET_HEAD,
      "",
      "| DLP DATA PROJECTOR | DLP DATA PROJECTOR | | | 1 | 1 |",
      "| WIRELESS REMOTE/GREEN LASER POINTER | WIRELESS REMOTE/GREEN LASER POINTER | | | 1 | 1 |",
    ].join("\n");
    expect(unknownSectionWarnings(md)).toEqual([]);
  });

  it("does NOT fire for a value cell that happens to be all-caps free text", () => {
    const md = [SHEET_HEAD, "", "| LED | NO LED WALL |"].join("\n");
    expect(unknownSectionWarnings(md)).toEqual([]);
  });
});

describe("Class B — corpus regression (zero false positives on the 7 real exporter fixtures)", () => {
  const dir = "fixtures/shows/exporter-xlsx";
  // The 7 real production show fixtures (README.md is documentation, not a sheet).
  const fixtures = readdirSync(dir).filter((f) => f.endsWith(".md") && f !== "README.md");

  it("scans every committed real fixture and finds zero UNKNOWN_SECTION_HEADER", () => {
    expect(fixtures.length).toBe(7);
    for (const f of fixtures) {
      const md = readFileSync(`${dir}/${f}`, "utf8");
      const warns = unknownSectionWarnings(md);
      expect(
        warns,
        `${f} should produce no UNKNOWN_SECTION_HEADER, got: ${JSON.stringify(warns)}`,
      ).toEqual([]);
    }
  });
});

describe("Class B — generic-label prefix false-negative (whole-diff review R1 [medium])", () => {
  // A dropped section whose col0 SHARES A KNOWN GENERIC LABEL'S PREFIX (CLIENT, HOTEL)
  // must still fire: generic labels are exact-match, only room families prefix-match.
  // Failure mode caught: the silent-drop where "CLIENT SERVICES | NAME | PHONE" was
  // inferred "known" because it startsWith "CLIENT" → detector stayed silent.
  it("FIRES for an unknown section that prefixes a generic known label (CLIENT SERVICES)", () => {
    const md = [SHEET_HEAD, "", "| CLIENT SERVICES | NAME | PHONE |"].join("\n");
    const warns = unknownSectionWarnings(md);
    expect(warns.length).toBe(1);
    expect(warns[0]!.rawSnippet).toContain("CLIENT SERVICES");
  });

  it("FIRES for an unknown section that prefixes a generic known label (HOTEL STAFF)", () => {
    const md = [SHEET_HEAD, "", "| HOTEL STAFF | NAME | PHONE |"].join("\n");
    const warns = unknownSectionWarnings(md);
    expect(warns.length).toBe(1);
    expect(warns[0]!.rawSnippet).toContain("HOTEL STAFF");
  });

  it("FIRES for a dropped section with multi-word / punctuated field headers (R2 [medium])", () => {
    // countFieldHeaderWords must tokenize cells: "Contact Name"→NAME, "Phone #"→PHONE,
    // "Email Address"→EMAIL. Exact-cell matching scored 0 → this common vendor-table
    // shape was silently dropped with no UNKNOWN_SECTION_HEADER.
    const md = [SHEET_HEAD, "", "| CATERING | Contact Name | Phone \\# | Email Address |"].join(
      "\n",
    );
    const warns = unknownSectionWarnings(md);
    expect(warns.length).toBe(1);
    expect(warns[0]!.rawSnippet).toContain("CATERING");
  });

  it("does NOT fire a multi-word header band that carries NO field-header word", () => {
    // A genuine non-header all-caps row whose cells tokenize to zero header words
    // stays unflagged (the ≥2-labelled-column gate holds).
    const md = [SHEET_HEAD, "", "| DLP DATA PROJECTOR | DLP DATA PROJECTOR | | | 1 | 1 |"].join(
      "\n",
    );
    expect(unknownSectionWarnings(md)).toEqual([]);
  });

  it("isKnownSectionHeader: generic labels exact-only; room families still prefix-match", () => {
    // Generic labels: bare form known, suffixed form NOT known (would-be silent drop).
    expect(isKnownSectionHeader("CLIENT")).toBe(true);
    expect(isKnownSectionHeader("HOTEL")).toBe(true);
    expect(isKnownSectionHeader("DATES")).toBe(true);
    expect(isKnownSectionHeader("DETAILS")).toBe(true);
    expect(isKnownSectionHeader("CLIENT SERVICES")).toBe(false);
    expect(isKnownSectionHeader("HOTEL STAFF")).toBe(false);
    expect(isKnownSectionHeader("DATES OF NOTE")).toBe(false);
    // Room families: bare AND suffixed forms both known (real room-name/ordinal suffix).
    expect(isKnownSectionHeader("GENERAL SESSION")).toBe(true);
    expect(isKnownSectionHeader("GENERAL SESSION - GRAND BALLROOM A/B")).toBe(true);
    expect(isKnownSectionHeader("ADDITIONAL ROOM 2")).toBe(true);
    expect(isKnownSectionHeader("BREAKOUT 3 - SALON C")).toBe(true);
  });
});
