/**
 * Task 1.10 — Soft warnings: TYPO_NORMALIZED, UNKNOWN_FIELD, UNKNOWN_ROLE_TOKEN
 *
 * Tests all three warning categories plus a no-false-positives check using a
 * real corpus fixture.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { newAggregator } from "@/lib/parser/warnings";
import { parseVenue } from "@/lib/parser/blocks/venue";
import { parseCrew } from "@/lib/parser/blocks/crew";
import { detectVersion } from "@/lib/parser/schema";

// ── 1. TYPO_NORMALIZED ────────────────────────────────────────────────────────
//
// "Hotal Contact Info" is a known typo of "Hotel Contact Info".
// The venue parser resolves it via resolveAliasFull → isTypo=true.
// Note: venue.ts emits TYPO_NORMALIZED for col0 matches. "Hotal Contact Info"
// resolves to "venue.contact_info" which is NOT a venue field key (it's consumed
// by the contacts parser). But it still triggers the alias resolution path in
// venue.ts when scanned. We need a label that resolves to a venue.* canonical
// and is a typo. "Hotal Contact Info" → venue.contact_info — the block is "venue".

describe("TYPO_NORMALIZED warning", () => {
  it("emits TYPO_NORMALIZED for 'Hotal Contact Info' typo in venue context", () => {
    // "Hotal Contact Info" resolves to venue.contact_info via the TYPO_ALIASES set.
    // We set up a venue block first so the UNKNOWN_FIELD guard (name !== null) passes,
    // then add the typo row.
    const md = [
      "| VENUE NAME | Test Venue |",
      "| VENUE ADDRESS | 123 Main St |",
      "| Hotal Contact Info | Some Contact |",
    ].join("\n");

    const agg = newAggregator();
    parseVenue(md, "v4", agg);

    const typoWarnings = agg.warnings.filter((w) => w.code === "TYPO_NORMALIZED");
    expect(typoWarnings.length).toBeGreaterThanOrEqual(1);

    const w = typoWarnings[0]!;
    expect(w.severity).toBe("info");
    expect(w.code).toBe("TYPO_NORMALIZED");
    expect(w.rawSnippet).toBe("Hotal Contact Info");
    expect(w.blockRef?.kind).toBe("venue");
  });

  it("does NOT emit TYPO_NORMALIZED for correct spelling 'Hotel Contact Info'", () => {
    const md = [
      "| VENUE NAME | Test Venue |",
      "| VENUE ADDRESS | 123 Main St |",
      "| Hotel Contact Info | Some Contact |",
    ].join("\n");

    const agg = newAggregator();
    parseVenue(md, "v4", agg);

    const typoWarnings = agg.warnings.filter((w) => w.code === "TYPO_NORMALIZED");
    expect(typoWarnings.length).toBe(0);
  });
});

// ── 2. UNKNOWN_FIELD + raw_unrecognized ────────────────────────────────────────
//
// A row label that doesn't resolve to any canonical fires UNKNOWN_FIELD and
// populates agg.rawUnrecognized. The guard requires at least one known venue
// field to already be set (prevents false positives from other blocks).

describe("UNKNOWN_FIELD warning + raw_unrecognized capture", () => {
  it("emits UNKNOWN_FIELD for unrecognized label in venue block", () => {
    const md = [
      "| VENUE NAME | Acme Hall |",
      "| VENUE ADDRESS | 456 Oak Ave |",
      "| FOO BAR | some value |",
    ].join("\n");

    const agg = newAggregator();
    parseVenue(md, "v4", agg);

    const unknownWarnings = agg.warnings.filter((w) => w.code === "UNKNOWN_FIELD");
    expect(unknownWarnings.length).toBeGreaterThanOrEqual(1);

    const w = unknownWarnings[0]!;
    expect(w.severity).toBe("warn");
    expect(w.code).toBe("UNKNOWN_FIELD");
    expect(w.blockRef?.kind).toBe("venue");
    expect(w.rawSnippet).toContain("FOO BAR");
  });

  it("populates rawUnrecognized for unrecognized venue row", () => {
    const md = [
      "| VENUE NAME | Acme Hall |",
      "| VENUE ADDRESS | 456 Oak Ave |",
      "| FOO BAR | some value |",
    ].join("\n");

    const agg = newAggregator();
    parseVenue(md, "v4", agg);

    expect(agg.rawUnrecognized.length).toBeGreaterThanOrEqual(1);

    const entry = agg.rawUnrecognized.find((r) => r.key === "FOO BAR");
    expect(entry).toBeDefined();
    expect(entry?.block).toBe("venue");
    expect(entry?.key).toBe("FOO BAR");
    expect(entry?.value).toBe("some value");
  });

  it("does NOT emit UNKNOWN_FIELD before any venue field is seen (avoids false positives from other blocks)", () => {
    // A row with an unknown label BEFORE any venue field is resolved should not fire
    const md = ["| FOO BAR | some value |", "| VENUE NAME | Acme Hall |"].join("\n");

    const agg = newAggregator();
    parseVenue(md, "v4", agg);

    const unknownWarnings = agg.warnings.filter((w) => w.code === "UNKNOWN_FIELD");
    expect(unknownWarnings.length).toBe(0);
  });
});

// ── 3. UNKNOWN_ROLE_TOKEN ──────────────────────────────────────────────────────
//
// "RIGGER" is not in the canonical RoleFlag union. It should:
//   - Fire UNKNOWN_ROLE_TOKEN warning
//   - Be dropped from role_flags
//   - Be preserved in the raw `role` display string

describe("UNKNOWN_ROLE_TOKEN warning", () => {
  const md = [
    "| CREW | NAME | ROLE | PHONE | EMAIL |",
    "| :--: | :--: | :--: | :--: | :--: |",
    "| | John Smith | RIGGER | 555-1234 | john@example.com |",
  ].join("\n");

  it("emits UNKNOWN_ROLE_TOKEN for non-canonical role token 'RIGGER'", () => {
    const agg = newAggregator();
    parseCrew(md, "v4", agg);

    const unknownRoleWarnings = agg.warnings.filter((w) => w.code === "UNKNOWN_ROLE_TOKEN");
    expect(unknownRoleWarnings.length).toBeGreaterThanOrEqual(1);

    const w = unknownRoleWarnings[0]!;
    expect(w.severity).toBe("warn");
    expect(w.code).toBe("UNKNOWN_ROLE_TOKEN");
    expect(w.rawSnippet).toContain("RIGGER");
  });

  it("drops 'RIGGER' from role_flags", () => {
    const agg = newAggregator();
    const crew = parseCrew(md, "v4", agg);

    expect(crew.length).toBe(1);
    const member = crew[0]!;
    expect(member.role_flags).not.toContain("RIGGER");
    expect(member.role_flags.length).toBe(0);
  });

  it("preserves 'RIGGER' in the raw role display string", () => {
    const agg = newAggregator();
    const crew = parseCrew(md, "v4", agg);

    expect(crew.length).toBe(1);
    const member = crew[0]!;
    // role is the cleaned display string — RIGGER should remain verbatim
    expect(member.role).toBe("RIGGER");
  });
});

// ── 4. No false positives — clean corpus fixture ───────────────────────────────
//
// Verified clean properties of 2026-03 corpus fixture:
//   - TYPO_NORMALIZED: no known-typo aliases appear in its rows (Hotal/DIagrams etc.)
//   - UNKNOWN_ROLE_TOKEN: all role tokens are canonical RoleFlag values
//
// NOTE: UNKNOWN_FIELD fires for hotel-reference rows that appear between the
// real venue fields and the TRANSPORTATION header in this fixture (lines 46-50:
// "HOTELS FOR DOUG'S DRIVE BACK", "Holiday Inn Express..." etc.). These ARE
// genuinely unrecognized rows within the venue field scope — correct behavior.
// The no-false-positives invariant only covers TYPO_NORMALIZED and
// UNKNOWN_ROLE_TOKEN for this fixture; UNKNOWN_FIELD is tested separately above.

describe("No false positives on clean corpus fixture (2026-03)", () => {
  const FIXTURE = "fixtures/shows/raw/2026-03-rpas-central-four-seasons.md";

  it("emits no TYPO_NORMALIZED warnings on clean fixture", () => {
    const md = readFileSync(FIXTURE, "utf8");
    const version = detectVersion(md) ?? "v4";
    const agg = newAggregator();

    parseVenue(md, version, agg);
    parseCrew(md, version, agg);

    const typoWarnings = agg.warnings.filter((w) => w.code === "TYPO_NORMALIZED");
    expect(typoWarnings).toEqual([]);
  });

  it("emits no UNKNOWN_ROLE_TOKEN warnings on clean fixture", () => {
    const md = readFileSync(FIXTURE, "utf8");
    const version = detectVersion(md) ?? "v4";
    const agg = newAggregator();

    parseCrew(md, version, agg);

    const unknownRoleWarnings = agg.warnings.filter((w) => w.code === "UNKNOWN_ROLE_TOKEN");
    expect(unknownRoleWarnings).toEqual([]);
  });

  // NOTE: The 2024-05 fixture contains "Load In/Set/Strke/Load Out - A1" (corpus typo:
  // "Strke" instead of "Strike") which prevents FULL_STAGE_PATTERN from matching and
  // correctly emits UNKNOWN_ROLE_TOKEN for the misspelled tokens. That is correct
  // behavior — the fixture itself is malformed. Only fixtures with clean role cells
  // are tested for zero UNKNOWN_ROLE_TOKEN.
});
