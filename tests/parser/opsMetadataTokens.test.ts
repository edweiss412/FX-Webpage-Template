// tests/parser/opsMetadataTokens.test.ts
import { describe, it, expect } from "vitest";
import * as ops from "@/lib/parser/blocks/ops";
import { normalizeHeader } from "@/lib/parser/knownSections";

describe("ops METADATA_FIELD_TOKENS", () => {
  it("exports the 5 scalar metadata field tokens", () => {
    expect([...ops.METADATA_FIELD_TOKENS].sort()).toEqual(
      ["COI", "INVOICE", "INVOICE NOTES", "PO", "PROPOSAL"].sort(),
    );
  });
  it("exports NO SECTION_HEADER_TOKENS (ops opens no section)", () => {
    expect("SECTION_HEADER_TOKENS" in ops).toBe(false);
  });
  it("metadata tokens are DISJOINT from ops' section-opener tokens (spec §6.8 disjointness)", () => {
    // NOTE: metadata tokens need NOT be disjoint from KNOWN_SECTION_HEADERS — COI
    // IS a registered header that ops consumes as a scalar field (plan R4). The
    // spec §6.8 disjointness is SECTION_HEADER_TOKENS ∩ METADATA_FIELD_TOKENS per
    // file; ops exports no SECTION_HEADER_TOKENS, so the intersection is empty.
    const sectionTokens = new Set(
      ((ops as Record<string, unknown>).SECTION_HEADER_TOKENS as string[] | undefined ?? []).map(normalizeHeader),
    );
    for (const t of ops.METADATA_FIELD_TOKENS) {
      expect(sectionTokens.has(normalizeHeader(t))).toBe(false);
    }
  });
});
