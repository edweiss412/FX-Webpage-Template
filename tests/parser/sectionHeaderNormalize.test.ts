import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeSectionHeaders } from "@/lib/parser/sectionHeaderNormalize";
import { parseTransportation } from "@/lib/parser/blocks/transport";
import { unambiguousTypos } from "@/tests/parser/_typoGenerator";

describe("normalizeSectionHeaders — gated long-section-header typo correction", () => {
  it("corrects a typo'd TRANSPORTATION header (field-band row) and the section then parses", () => {
    const md = ["| Transportaton | NAME | PHONE |", "| Pick Up Venue | 10/6/26 @ 12pm |"].join("\n");
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
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".md"))) {
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
