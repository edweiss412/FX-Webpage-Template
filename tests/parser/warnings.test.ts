/**
 * Task 1.10 — Soft warnings: TYPO_NORMALIZED, UNKNOWN_FIELD, UNKNOWN_ROLE_TOKEN
 *
 * Tests all three warning categories plus a no-false-positives check using a
 * real corpus fixture.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  newAggregator,
  emitFieldUnreadable,
  emitUnknownSection,
  emitUnknownField,
  FIELD_UNREADABLE,
  UNKNOWN_SECTION_HEADER,
  BLOCK_DISAPPEARED,
} from "@/lib/parser/warnings";
import { parseSheet } from "@/lib/parser";
import { parseVenue } from "@/lib/parser/blocks/venue";
import { parseCrew } from "@/lib/parser/blocks/crew";
import { detectVersion } from "@/lib/parser/schema";

// ── Data-quality warning codes + emitters (parse-data-quality-warnings Task 1) ──

describe("data-quality warning code literals", () => {
  it("exports the three new codes as their own string literals", () => {
    expect(FIELD_UNREADABLE).toBe("FIELD_UNREADABLE");
    expect(UNKNOWN_SECTION_HEADER).toBe("UNKNOWN_SECTION_HEADER");
    expect(BLOCK_DISAPPEARED).toBe("BLOCK_DISAPPEARED");
  });
});

describe("emitFieldUnreadable", () => {
  it("pushes a warn-severity FIELD_UNREADABLE warning carrying the raw snippet", () => {
    const agg = newAggregator();
    emitFieldUnreadable(agg, {
      section: "crew",
      field: "phone",
      rawSnippet: "call John",
      index: 0,
      name: "John Smith",
    });

    expect(agg.warnings.length).toBe(1);
    const w = agg.warnings[0]!;
    expect(w.severity).toBe("warn");
    expect(w.code).toBe("FIELD_UNREADABLE");
    // idx32/#154: carry the crew member's name so the resolver can anchor per-ROW
    // (distinct rows → distinct source cells → survive operatorActionableWarnings dedup).
    expect(w.blockRef).toEqual({ kind: "crew", index: 0, name: "John Smith", field: "phone" });
    expect(w.rawSnippet).toBe("call John");
    // message must surface the raw snippet so the operator sees what dropped
    expect(w.message).toContain("call John");
  });

  it("no-ops when the aggregator is undefined", () => {
    expect(() =>
      emitFieldUnreadable(undefined, {
        section: "crew",
        field: "phone",
        rawSnippet: "x",
        index: 0,
        name: "Someone",
      }),
    ).not.toThrow();
  });

  it("stores the field discriminator on blockRef; message + rawSnippet unchanged (phone and email)", () => {
    const agg = newAggregator();
    emitFieldUnreadable(agg, {
      section: "crew",
      field: "phone",
      rawSnippet: "call me",
      index: 3,
      name: "Jordan Ellis",
    });
    emitFieldUnreadable(agg, {
      section: "crew",
      field: "email",
      rawSnippet: "jordan-at",
      index: 3,
      name: "Jordan Ellis",
    });
    expect(agg.warnings[0]?.blockRef).toEqual({
      kind: "crew",
      index: 3,
      name: "Jordan Ellis",
      field: "phone",
    });
    expect(agg.warnings[1]?.blockRef).toEqual({
      kind: "crew",
      index: 3,
      name: "Jordan Ellis",
      field: "email",
    });
    expect(agg.warnings[0]?.rawSnippet).toBe("call me");
    expect(agg.warnings[1]?.rawSnippet).toBe("jordan-at");
    expect(agg.warnings[0]?.message).toBe(
      `Crew phone for row 4 couldn't be read as a phone number ("call me"); check the sheet.`,
    );
    expect(agg.warnings[1]?.message).toBe(
      // "a email address" is the LIVE producer grammar (spec §2.1 pins message unchanged);
      // grammar fix is a separate copy change, deliberately not smuggled into this diff.
      `Crew email for row 4 couldn't be read as a email address ("jordan-at"); check the sheet.`,
    );
  });
});

describe("emitUnknownSection", () => {
  it("pushes a warn-severity UNKNOWN_SECTION_HEADER warning carrying the header text", () => {
    const agg = newAggregator();
    emitUnknownSection(agg, "CATERING");

    expect(agg.warnings.length).toBe(1);
    const w = agg.warnings[0]!;
    expect(w.severity).toBe("warn");
    expect(w.code).toBe("UNKNOWN_SECTION_HEADER");
    expect(w.blockRef).toEqual({ kind: "unknown_section" });
    expect(w.rawSnippet).toBe("CATERING");
    expect(w.message).toContain("CATERING");
  });

  it("no-ops when the aggregator is undefined", () => {
    expect(() => emitUnknownSection(undefined, "CATERING")).not.toThrow();
  });
});

describe("emitUnknownField", () => {
  it("pushes an UNKNOWN_FIELD warning + a raw_unrecognized entry", () => {
    const agg = newAggregator();
    emitUnknownField(agg, {
      block: "event_details",
      kind: "details",
      key: " Rigging ",
      value: "2 motors",
    });
    expect(agg.warnings).toEqual([
      {
        severity: "warn",
        code: "UNKNOWN_FIELD",
        message: "Unrecognized event_details row label: 'Rigging'",
        blockRef: { kind: "details", name: "Rigging" },
        rawSnippet: "Rigging | 2 motors",
      },
    ]);
    expect(agg.rawUnrecognized).toEqual([
      { block: "event_details", key: "Rigging", value: "2 motors" },
    ]);
  });
  it("no-ops on an undefined aggregator (no throw)", () => {
    expect(() =>
      emitUnknownField(undefined, { block: "x", kind: "x", key: "k", value: "v" }),
    ).not.toThrow();
  });
});

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
  it("emits TYPO_NORMALIZED for 'Hotal Contact Info' typo inside the venue block", () => {
    // "Hotal Contact Info" resolves to venue.contact_info via the TYPO_ALIASES set.
    // The gate is VENUE-BLOCK MEMBERSHIP (field-near-miss spec §2.1) since the positional
    // scope window was retired, so the table has to OPEN on a `VENUE` cell — the v2
    // three-column shape. A v4 two-column table opens on `VENUE NAME`, which is a
    // different namespace, and a typo row there is deliberately silent.
    const md = [
      "| VENUE | VENUE NAME | Test Venue |",
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
    // Byte-identical to the case above apart from the spelling, so the silence is the
    // typo-alias arm of the gate and not the block-membership arm.
    const md = [
      "| VENUE | VENUE NAME | Test Venue |",
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
// `parseVenue` no longer emits either. The positional scope window it used to carry was
// replaced by the content-keyed near-miss detector, which runs ONCE at the `parseSheet`
// document seam (field-near-miss spec §2.1/§2.2), so a DIRECT block-parser call receives
// no replacement emission and both assertions below are ZERO. The positive coverage lives
// at the seam — the two full-parse cases in this describe — and, corpus-wide, in
// tests/parser/fieldNearMissBaseline.test.ts.

const VENUE_JUNK_DOC = [
  "| VENUE NAME | Acme Hall |",
  "| VENUE ADDRESS | 456 Oak Ave |",
  "| FOO BAR | some value |",
].join("\n");

describe("UNKNOWN_FIELD warning + raw_unrecognized capture", () => {
  it("parseVenue alone emits no UNKNOWN_FIELD — the detector owns the code", () => {
    const agg = newAggregator();
    const venue = parseVenue(VENUE_JUNK_DOC, "v4", agg);

    // Non-vacuity: the venue block really parsed, so silence is the removed emitter and
    // not a document the parser ignored wholesale.
    expect(venue?.name).toBe("Acme Hall");
    expect(agg.warnings.filter((w) => w.code === "UNKNOWN_FIELD")).toHaveLength(0);
  });

  it("parseVenue alone pushes no rawUnrecognized entry", () => {
    // The `raw_unrecognized` push lives INSIDE emitUnknownField, so it moved with it.
    const agg = newAggregator();
    const venue = parseVenue(VENUE_JUNK_DOC, "v4", agg);
    // Non-vacuity in its OWN body, not borrowed from the sibling case above: without it this
    // passes against a parser that ignored the document wholesale.
    expect(venue?.name).toBe("Acme Hall");
    expect(agg.rawUnrecognized).toEqual([]);
  });

  it("the full parse is SILENT on 'FOO BAR' — office-side junk has no near-miss target", () => {
    // The designed outcome, not a regression (spec §1.1.1 + §1.1.8): `FOO BAR` matches no
    // vocabulary entry, and reporting vocabulary-less rows is the rejected coverage-audit
    // product. The next case proves the seam still emits when there IS a target.
    const parsed = parseSheet(VENUE_JUNK_DOC, "constructed-venue-junk.md");
    expect(parsed.warnings.filter((w) => w.code === "UNKNOWN_FIELD")).toHaveLength(0);
    expect(parsed.raw_unrecognized).toEqual([]);
  });

  it("the full parse emits exactly one UNKNOWN_FIELD for a genuine near-miss row", () => {
    // `Address:` is the corpus's own colon-contact shape and nearly matches VENUE ADDRESS.
    // It sits in an UNRECOGNIZED block (`Timestamp`), which the retired positional window
    // could only have reached by accident of position. That the emission carries a
    // `candidate` is what proves it came from the detector: the removed emitters never
    // supplied one.
    const md = [
      "| VENUE NAME | Acme Hall |",
      "| VENUE ADDRESS | 456 Oak Ave |",
      "",
      "| Timestamp | 1/7/2025 0:00 |",
      "| Address: | 123 Main St |",
    ].join("\n");

    const parsed = parseSheet(md, "constructed-near-miss.md");
    const uf = parsed.warnings.filter((w) => w.code === "UNKNOWN_FIELD");
    expect(uf).toHaveLength(1);
    expect(uf[0]!.blockRef?.name).toBe("Address:");
    expect(uf[0]!.blockRef?.kind).toBe("timestamp");
    expect(uf[0]!.candidate).toBe("VENUE ADDRESS");
    expect(parsed.raw_unrecognized).toEqual([
      { block: "timestamp", key: "Address:", value: "123 Main St" },
    ]);
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
// NOTE: UNKNOWN_FIELD used to fire for the hotel-reference rows sitting between the real
// venue fields and the TRANSPORTATION header in this fixture ("HOTELS FOR DOUG'S DRIVE
// BACK", "Holiday Inn Express...") — swept in by the positional venue scope window, which
// has since been retired. Those rows match no vocabulary entry, so the content-keyed
// detector is silent on them and this fixture's UNKNOWN_FIELD set is now pinned corpus-wide
// in tests/parser/fieldNearMissBaseline.test.ts. The no-false-positives invariant here still
// covers only TYPO_NORMALIZED and UNKNOWN_ROLE_TOKEN.

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
