import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseClient } from "@/lib/parser/blocks/client";
import { detectVersion } from "@/lib/parser/schema";
import { newAggregator } from "@/lib/parser/warnings";

// ── Fixture paths ────────────────────────────────────────────────────────────
// 2026-03: v4. CLIENT block at lines 1–7:
//   line 1: | CLIENT | Institutional Investor | ... |
//   line 3: | (blank)| MAIN | ... |
//   line 4: | Contact | Ashley Morgan | ... |
//   line 5: | Contact Cell | 845-270-1900 | ... |
//   line 6: | Contact Office | (empty) | ... |   ← v4 marker
//   line 7: | Contact Email | ashley.morgan@institutionalinvestor.com | ... |
// No SECONDARY data in this fixture (SECONDARY column is blank).
const FIXTURE_V4 = "fixtures/shows/raw/2026-03-rpas-central-four-seasons.md";

// 2025-03: v2. CLIENT block at lines 1–5:
//   line 1: | CLIENT | Institutional Investor |
//   line 3: | Client Contact | Maria Ferrer |
//   line 4: | Client Phone | 917-301-0121 |
//   line 5: | Client Email | mferrer@institutionalinvestor.com |
const FIXTURE_V2 = "fixtures/shows/raw/2025-03-dci-rpas-central.md";

// 2024-05: v1 fallback (no v4/v2 markers except "Hotal Contact Info" which IS v2 — actually v2)
// Actually detectVersion returns v2 for 2024-05 because it has "Hotal Contact Info".
// The v1 fixture uses merged "CLIENT /Institutional Investor" + "Client Contact/Maria Ferrer" cells.
// We test this as v1 shape (forced v1) using synthetic markdown.

// 2026-05: v4 with SECONDARY populated:
//   line 3: | (blank) | MAIN | SECONDARY | ... |
//   line 4: | Contact | Ashley Morgan | Lew Knox | ... |
//   line 5: | Contact Cell | 845-270-1900 | (empty) | ... |
//   line 7: | Contact Email | ashley.morgan@institutionalinvestor.com | (empty) | ... |
const FIXTURE_V4_SECONDARY = "fixtures/shows/raw/2026-05-fintech-forum-cto-summit.md";

const ALL_FIXTURES = [
  "fixtures/shows/raw/2024-05-east-coast-family-office.md",
  "fixtures/shows/raw/2025-03-dci-rpas-central.md",
  "fixtures/shows/raw/2025-04-asset-mgmt-cfo-coo.md",
  "fixtures/shows/raw/2025-05-redefining-fixed-income-private-credit.md",
  "fixtures/shows/raw/2025-06-ria-investment-forum.md",
  "fixtures/shows/raw/2025-10-consultants-roundtable.md",
  "fixtures/shows/raw/2025-10-fixed-income-trading-summit.md",
  "fixtures/shows/raw/2026-03-rpas-central-four-seasons.md",
  "fixtures/shows/raw/2026-04-asset-mgmt-cfo-coo-waldorf.md",
  "fixtures/shows/raw/2026-05-fintech-forum-cto-summit.md",
] as const;

// ── v4 tests ─────────────────────────────────────────────────────────────────
describe("parseClient — v4 shape (2026-03 fixture)", () => {
  const md = readFileSync(FIXTURE_V4, "utf8");

  it("extracts client_label = 'Institutional Investor'", () => {
    const r = parseClient(md, "v4");
    expect(r.client_label).toBe("Institutional Investor");
  });

  it("extracts MAIN contact name = 'Ashley Morgan'", () => {
    const r = parseClient(md, "v4");
    expect(r.client_contact?.name).toBe("Ashley Morgan");
  });

  it("extracts MAIN contact phone = '845-270-1900'", () => {
    const r = parseClient(md, "v4");
    expect(r.client_contact?.phone).toBe("845-270-1900");
  });

  it("extracts MAIN contact email in canonical (lowercase) form", () => {
    const r = parseClient(md, "v4");
    // Fixture value: ashley.morgan@institutionalinvestor.com (already lowercase)
    expect(r.client_contact?.email).toBe("ashley.morgan@institutionalinvestor.com");
  });

  it("returns no secondary contact when SECONDARY column is blank", () => {
    const r = parseClient(md, "v4");
    // The 2026-03 SECONDARY column has no data — secondary should be absent/null
    const secondary = r.client_contact?.secondary;
    expect(secondary == null || secondary === undefined).toBe(true);
  });
});

// ── v4 with SECONDARY populated (2026-05 fixture) ────────────────────────────
describe("parseClient — v4 SECONDARY populated (2026-05 fixture)", () => {
  const md = readFileSync(FIXTURE_V4_SECONDARY, "utf8");

  it("extracts client_label = 'Institutional Investor'", () => {
    const r = parseClient(md, "v4");
    expect(r.client_label).toBe("Institutional Investor");
  });

  it("extracts MAIN contact name = 'Ashley Morgan'", () => {
    const r = parseClient(md, "v4");
    expect(r.client_contact?.name).toBe("Ashley Morgan");
  });

  it("extracts SECONDARY contact name = 'Lew Knox'", () => {
    const r = parseClient(md, "v4");
    expect(r.client_contact?.secondary?.name).toBe("Lew Knox");
  });

  it("MAIN email is canonicalized (lowercase)", () => {
    const r = parseClient(md, "v4");
    expect(r.client_contact?.email).toBe("ashley.morgan@institutionalinvestor.com");
  });
});

// ── v2 tests ─────────────────────────────────────────────────────────────────
describe("parseClient — v2 shape (2025-03 fixture)", () => {
  const md = readFileSync(FIXTURE_V2, "utf8");

  it("extracts client_label = 'Institutional Investor'", () => {
    const r = parseClient(md, "v2");
    expect(r.client_label).toBe("Institutional Investor");
  });

  it("extracts contact name = 'Maria Ferrer'", () => {
    const r = parseClient(md, "v2");
    expect(r.client_contact?.name).toBe("Maria Ferrer");
  });

  it("extracts contact phone = '917-301-0121'", () => {
    const r = parseClient(md, "v2");
    expect(r.client_contact?.phone).toBe("917-301-0121");
  });

  it("extracts contact email in canonical form", () => {
    const r = parseClient(md, "v2");
    // Fixture: mferrer@institutionalinvestor.com (already lowercase)
    expect(r.client_contact?.email).toBe("mferrer@institutionalinvestor.com");
  });

  it("returns no secondary in v2", () => {
    const r = parseClient(md, "v2");
    expect(r.client_contact?.secondary).toBeUndefined();
  });
});

// ── v1 fallback (synthetic) ───────────────────────────────────────────────────
describe("parseClient — v1 fallback (synthetic merged-cell shape)", () => {
  // v1 uses merged "CLIENT /Org" + "Client Contact/Name" + "Client Email/email" cells
  const v1md = [
    "| East Coast Family Office Wealth Conference |     |     |",
    "| :--: | :--: | :--: |",
    "| CLIENT /Test Client |     |     |",
    "| Client Contact/Jane Smith |     |     |",
    "| Client Email/Jane@TESTCLIENT.COM |     |     |",
  ].join("\n");

  it("extracts client_label from merged CLIENT /Org cell", () => {
    const r = parseClient(v1md, "v1");
    expect(r.client_label).toBe("Test Client");
  });

  it("extracts contact name from merged Client Contact/Name cell", () => {
    const r = parseClient(v1md, "v1");
    expect(r.client_contact?.name).toBe("Jane Smith");
  });

  it("canonicalizes email (uppercase → lowercase) in v1", () => {
    const r = parseClient(v1md, "v1");
    // Fixture has mixed-case Jane@TESTCLIENT.COM — parser must canonicalize
    expect(r.client_contact?.email).toBe("jane@testclient.com");
  });
});

// ── Email canonicalization regression ────────────────────────────────────────
describe("parseClient — email canonicalization invariant", () => {
  it("lowercases a mixed-case email in v2 synthetic input", () => {
    const md = [
      "| CLIENT | Big Corp |",
      "| :--: | :--: |",
      "| Client Contact | Bob Smith |",
      "| Client Phone | 212-555-0100 |",
      "| Client Email | Bob.Smith@BigCorp.COM |",
      "| Hotal Contact Info | someone |",
    ].join("\n");
    const r = parseClient(md, "v2");
    expect(r.client_contact?.email).toBe("bob.smith@bigcorp.com");
  });

  it("returns null for blank email cell in v2", () => {
    const md = [
      "| CLIENT | Big Corp |",
      "| :--: | :--: |",
      "| Client Contact | Bob Smith |",
      "| Client Phone | 212-555-0100 |",
      "| Client Email |  |",
      "| Hotal Contact Info | someone |",
    ].join("\n");
    const r = parseClient(md, "v2");
    expect(r.client_contact?.email).toBeNull();
  });

  it("returns null client_contact when no contact rows found", () => {
    const md = ["| CLIENT | Mystery Corp |", "| :--: | :--: |", "| COI | Sent |"].join("\n");
    const r = parseClient(md, "v2");
    expect(r.client_label).toBe("Mystery Corp");
    expect(r.client_contact).toBeNull();
  });
});

// ── Corpus coverage ───────────────────────────────────────────────────────────
describe("parseClient — corpus coverage (all 10 fixtures)", () => {
  for (const fixturePath of ALL_FIXTURES) {
    it(`${fixturePath.split("/").pop()} → client_label.length > 0`, () => {
      const md = readFileSync(fixturePath, "utf8");
      const version = detectVersion(md);
      expect(version).not.toBeNull();

      const r = parseClient(md, version!);
      expect(r.client_label.length).toBeGreaterThan(0);
    });
  }
});

// ── PR-D4: v2 fuzzy client field-label recovery ──────────────────────────────
const FLA = (agg: ReturnType<typeof newAggregator>) =>
  agg.warnings.filter((w) => w.code === "FIELD_LABEL_AUTOCORRECTED");
function v2Client(rows: string[]): string {
  return ["| CLIENT | Acme |", ...rows].join("\n") + "\n";
}

describe("parseClient — v2 fuzzy field-label recovery (PR-D4)", () => {
  it("recovers a misspelled v2 label and warns once (kind=client)", () => {
    const agg = newAggregator();
    const r = parseClient(v2Client(["| Client Contct | Bob |"]), "v2", agg);
    expect(r.client_contact?.name).toBe("Bob");
    const warns = FLA(agg);
    expect(warns).toHaveLength(1);
    expect(warns[0]!.severity).toBe("warn");
    expect(warns[0]!.blockRef?.kind).toBe("client");
    expect(warns[0]!.rawSnippet).toBe("Client Contct");
  });

  it("exact-wins: an exact label beats a typo'd sibling, no warn", () => {
    const agg = newAggregator();
    const r = parseClient(
      v2Client(["| Client Contact | Alice |", "| Client Contct | Bob |"]),
      "v2",
      agg,
    );
    expect(r.client_contact?.name).toBe("Alice");
    expect(FLA(agg)).toHaveLength(0);
  });

  it("empty exact does NOT claim: a real typo sibling recovers and warns", () => {
    const agg = newAggregator();
    const r = parseClient(
      v2Client(["| Client Contact |  |", "| Client Contct | Dave |"]),
      "v2",
      agg,
    );
    expect(r.client_contact?.name).toBe("Dave");
    expect(FLA(agg)).toHaveLength(1);
  });

  it("the CLIENT org label is NOT fuzzed (typo'd org → no client block, no warn)", () => {
    const agg = newAggregator();
    const r = parseClient("| Clent | Acme |\n", "v2", agg);
    expect(r.client_label).toBe("");
    expect(FLA(agg)).toHaveLength(0);
  });

  it("v1 merged-cell slash variant is NOT recovered (deferred), no warn", () => {
    const agg = newAggregator();
    const r = parseClient(v2Client(["| Client Contct/Grace |"]), "v2", agg);
    expect(r.client_contact).toBeNull();
    expect(FLA(agg)).toHaveLength(0);
  });
});
