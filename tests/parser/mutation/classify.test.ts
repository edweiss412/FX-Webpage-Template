// tests/parser/mutation/classify.test.ts
import { describe, it, expect } from "vitest";
import {
  KNOWN_SECTION_HEADERS,
  PREFIX_SECTION_FAMILIES,
  normalizeHeader,
} from "@/lib/parser/knownSections";
import { EXPECTED_HEADER_DOMAINS } from "./expectedDomains"; // SEPARATE hand-authored domain oracle (Step 3b)
import { resolveHeader, SECTION_DOMAIN_MAP, classifySection, RISK_CRITICAL } from "./classify";

describe("classifier parity (Codex R2/R4/R8)", () => {
  it("every KNOWN_SECTION_HEADERS entry maps to a non-other domain", () => {
    for (const h of KNOWN_SECTION_HEADERS) {
      const d = SECTION_DOMAIN_MAP[h];
      expect(d, `unmapped parser header: ${h}`).toBeDefined();
      expect(d, `${h} resolved to other`).not.toBe("other");
    }
  });
  it("resolves suffixed room headers via PREFIX_SECTION_FAMILIES → rooms (R4)", () => {
    for (const fam of PREFIX_SECTION_FAMILIES) {
      expect(SECTION_DOMAIN_MAP[resolveHeader(`${fam} GRAND BALLROOM`)!]).toBe("rooms");
    }
  });
  it("EXPECTED_HEADER_DOMAINS COVERS the live registry — a new parser header forces a row (R20)", () => {
    // Anchors the domain oracle to the EXTERNAL source of truth (knownSections.ts), not a private
    // subset. If KNOWN_SECTION_HEADERS gains a header, this fails until the oracle gets a row —
    // so the domain gate can't silently omit a new registry header (Codex plan-R20 [medium]).
    const covered = new Set(EXPECTED_HEADER_DOMAINS.map(([h]) => normalizeHeader(h)));
    for (const h of KNOWN_SECTION_HEADERS)
      expect(covered, `no expected-domain row for registry header ${h}`).toContain(h);
  });
  it("lockstep: SECTION_DOMAIN_MAP agrees with the independent EXPECTED_HEADER_DOMAINS oracle (R8/R20)", () => {
    // SECTION_DOMAIN_MAP and EXPECTED_HEADER_DOMAINS are two SEPARATELY hand-derived structures;
    // this asserts they AGREE, so a wrong domain (e.g. CREW→hotel) in one is caught by mismatch
    // with the other — not self-reference against a single table.
    for (const [header, domain] of EXPECTED_HEADER_DOMAINS) {
      expect(SECTION_DOMAIN_MAP[resolveHeader(header)!], header).toBe(domain);
    }
  });
  it("a genuinely-unknown header resolves to null → other", () => {
    expect(resolveHeader("CATERING")).toBeNull();
  });
  it("v4 TRANSPORTATION/<label> slash header → transportation (transport.ts:170, plan-R11)", () => {
    const h = resolveHeader("TRANSPORTATION/Equipment Transporter");
    expect(h).toBe("TRANSPORTATION");
    expect(SECTION_DOMAIN_MAP[h!]).toBe("transportation");
    expect(
      classifySection({
        index: 0,
        runIndex: 0,
        rows: [],
        headerRow: {
          line: 0,
          cls: "header" as const,
          cells: ["TRANSPORTATION/Equipment Transporter", "PHONE"],
        },
      }),
    ).toBe("transportation");
    // a space-suffixed (non-slash) form is NOT a v4 header → other (matches the parser regex)
    expect(resolveHeader("TRANSPORTATION SCHEDULE")).toBeNull();
  });
});

describe("classifySection", () => {
  const sec = (col0: string) => ({
    index: 0,
    runIndex: 0,
    rows: [],
    headerRow: { line: 0, cls: "header" as const, cells: [col0, "x"] },
  });
  it("classifies by the header row's col-0 token", () => {
    expect(classifySection(sec("CREW"))).toBe("crew");
    expect(classifySection(sec("GENERAL SESSION GRAND BALLROOM"))).toBe("rooms");
  });
  it("a headerless section is other", () => {
    expect(classifySection({ index: 0, runIndex: 0, rows: [], headerRow: null })).toBe("other");
  });
  it("RISK_CRITICAL is exactly the seven audit domains", () => {
    expect([...RISK_CRITICAL].sort()).toEqual(
      ["agenda", "crew", "dates", "event_details", "hotel", "rooms", "transportation"].sort(),
    );
  });
});
