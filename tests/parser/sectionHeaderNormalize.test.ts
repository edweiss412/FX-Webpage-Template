import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeSectionHeaders } from "@/lib/parser/sectionHeaderNormalize";
import { parseTransportation } from "@/lib/parser/blocks/transport";
import { unambiguousTypos } from "@/tests/parser/_typoGenerator";

import { CORPUS_TEMP_PREFIX } from "../helpers/corpusTemp";

describe("normalizeSectionHeaders — gated long-section-header typo correction", () => {
  it("corrects a typo'd TRANSPORTATION header (field-band row) and the section then parses", () => {
    const md = ["| Transportaton | NAME | PHONE |", "| Pick Up Venue | 10/6/26 @ 12pm |"].join(
      "\n",
    );
    const r = normalizeSectionHeaders(md);
    expect(r.corrected).toContain("TRANSPORTATION");
    expect(r.warnings.filter((w) => w.code === "SECTION_HEADER_AUTOCORRECTED")).toHaveLength(1);
    // end-to-end: the corrected markdown now parses the transportation block (was null before)
    expect(parseTransportation(md, "v2")).toBeNull(); // typo'd → dropped today
    expect(parseTransportation(r.corrected, "v2")).not.toBeNull(); // recovered
  });

  it("corrects a typo'd EVENT DETALS header (label-only row)", () => {
    const md = ["| EVENT DETALS | |"].join("\n");
    const r = normalizeSectionHeaders(md);
    expect(r.corrected).toContain("EVENT DETAILS");
    expect(r.warnings).toHaveLength(1);
  });

  it("generator: every single-edit typo of each long header (in a header-shape row) corrects back", () => {
    const VOCAB = ["TRANSPORTATION", "EVENT DETAILS", "GS DETAILS"];
    for (const member of VOCAB) {
      for (const typo of unambiguousTypos(member, VOCAB, { minLen: 0 })) {
        const md = `| ${typo} | NAME | PHONE |`; // header-shape (field-band) row
        const r = normalizeSectionHeaders(md);
        expect(r.corrected, `typo '${typo}' of '${member}'`).toContain(member);
      }
    }
  });

  // ── HIGH-2 guards: never rewrite a non-header value cell ──
  it("does NOT rewrite a DATA row whose col0 is one edit from a long header", () => {
    // other cells are VALUES (a phone, an email), not field-header words, not empty → header-shape gate fails
    const md = ["| Transportaton | 555-1234 | john@example.com |"].join("\n");
    const r = normalizeSectionHeaders(md);
    expect(r.corrected).toBe(md);
    expect(r.warnings).toHaveLength(0);
  });

  it("does NOT fuzz a far cell ('Information') or bare 'DETAILS'", () => {
    expect(normalizeSectionHeaders("| Information | |").warnings).toHaveLength(0);
    expect(normalizeSectionHeaders("| DETAILS | |").corrected).toBe("| DETAILS | |");
  });

  it("CORPUS ZERO-CHANGE: the pre-pass is a no-op on every committed fixture (false-positive guard)", () => {
    const dir = "fixtures/shows/raw";
    for (const f of readdirSync(dir).filter(
      (n) => n.endsWith(".md") && !n.startsWith(CORPUS_TEMP_PREFIX),
    )) {
      const md = readFileSync(join(dir, f), "utf8");
      const r = normalizeSectionHeaders(md);
      expect(r.corrected, `${f} should be unchanged`).toBe(md);
      expect(r.warnings, `${f} should have no corrections`).toHaveLength(0);
    }
  });

  it("preserves the table row cell count on a corrected row", () => {
    const md = "| Transportaton | NAME | PHONE |";
    const r = normalizeSectionHeaders(md);
    expect(r.corrected.split("|").length).toBe(md.split("|").length);
  });
});

// ── C1: short-header (CREW/TECH) typo tolerance behind the field-band gate (spec §4/§9) ──
// CREW/TECH are 4-char collision-prone routers, so they are fuzzed ONLY when a
// ≥1 field-header-word band corroborates (never label-only), with minLen:4 and the
// CREWS/TECHS plurals explicitly excluded. HOTEL/VENUE/DATES are NOT added (spec §9).
describe("normalizeSectionHeaders — CREW/TECH short-header typo tolerance", () => {
  it("corrects TCEH → TECH and CRWE → CREW when a field-band corroborates", () => {
    const tech = normalizeSectionHeaders("| TCEH | NAME | ROLE | PHONE | EMAIL |");
    expect(tech.corrected).toContain("| TECH |");
    expect(tech.warnings.filter((w) => w.code === "SECTION_HEADER_AUTOCORRECTED")).toHaveLength(1);

    const crew = normalizeSectionHeaders("| CRWE | NAME | ROLE | PHONE | EMAIL |");
    expect(crew.corrected).toContain("| CREW |");
    expect(crew.warnings).toHaveLength(1);
  });

  it("does NOT fuzz a short header with no field band (label-only row)", () => {
    // Bare `| TCEH |` — collision-prone, no corroboration → left untouched (spec §4.3).
    expect(normalizeSectionHeaders("| TCEH | |").corrected).toBe("| TCEH | |");
    expect(normalizeSectionHeaders("| TCEH | |").warnings).toHaveLength(0);
  });

  it("EXCLUDES the CREWS / TECHS plurals (one edit from CREW/TECH but a real word)", () => {
    expect(normalizeSectionHeaders("| CREWS | NAME | PHONE |").corrected).toBe(
      "| CREWS | NAME | PHONE |",
    );
    expect(normalizeSectionHeaders("| TECHS | NAME | PHONE |").corrected).toBe(
      "| TECHS | NAME | PHONE |",
    );
  });

  it("does NOT rewrite a short-header-shaped DATA row (values, not field-header words)", () => {
    const md = "| TCEH | 555-1234 | john@example.com |";
    expect(normalizeSectionHeaders(md).corrected).toBe(md);
  });
});
