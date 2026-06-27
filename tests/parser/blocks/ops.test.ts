import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseOps } from "@/lib/parser/blocks/ops";
import { detectVersion } from "@/lib/parser/schema";
import { newAggregator } from "@/lib/parser/warnings";

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

// ── v4 ops (2026-04-waldorf) ──────────────────────────────────────────────────
// Fixture lines 25-29:
//   | COI | SENT |
//   | Proposal | SENT |
//   | PO\# | PO-IIL007576 |
//   | Invoice | SENT |
//   | Invoice Notes | Add parking receipts and Zoom |

describe("parseOps — v4 waldorf (2026-04)", () => {
  const md = readFileSync("fixtures/shows/raw/2026-04-asset-mgmt-cfo-coo-waldorf.md", "utf8");
  const ops = parseOps(md, "v4");

  it("coi_status is 'SENT'", () => {
    expect(ops.coi_status).toBe("SENT");
  });

  it("proposal is 'SENT'", () => {
    expect(ops.proposal).toBe("SENT");
  });

  it("po is 'PO-IIL007576'", () => {
    expect(ops.po).toBe("PO-IIL007576");
  });

  it("invoice is 'SENT'", () => {
    expect(ops.invoice).toBe("SENT");
  });

  it("invoice_notes is 'Add parking receipts and Zoom'", () => {
    expect(ops.invoice_notes).toBe("Add parking receipts and Zoom");
  });
});

// ── v4 ops (2026-05-fintech) ──────────────────────────────────────────────────
describe("parseOps — v4 fintech (2026-05)", () => {
  const md = readFileSync("fixtures/shows/raw/2026-05-fintech-forum-cto-summit.md", "utf8");
  const ops = parseOps(md, "v4");

  it("coi_status is 'IN PROCESS'", () => {
    expect(ops.coi_status).toBe("IN PROCESS");
  });

  it("proposal is 'IN PROCESS'", () => {
    expect(ops.proposal).toBe("IN PROCESS");
  });

  it("po is null (blank in fixture)", () => {
    expect(ops.po).toBeNull();
  });
});

// ── v2 ops (2025-10-fixed-income-trading-summit) ─────────────────────────────
// Fixture lines 52-54: | COI | SENT | | Proposal | SENT | | PO\# |  |
describe("parseOps — v2 trading summit (2025-10)", () => {
  const md = readFileSync("fixtures/shows/raw/2025-10-fixed-income-trading-summit.md", "utf8");
  const ops = parseOps(md, "v2");

  it("coi_status is 'SENT'", () => {
    expect(ops.coi_status).toBe("SENT");
  });

  it("proposal is 'SENT'", () => {
    expect(ops.proposal).toBe("SENT");
  });

  it("po is null (blank in fixture)", () => {
    expect(ops.po).toBeNull();
  });

  it("invoice is null (not present in v2)", () => {
    expect(ops.invoice).toBeNull();
  });
});

// ── v2 ops with PO# (2025-06-ria-investment-forum) ───────────────────────────
// Fixture lines 14-16: | COI | SENT | | Proposal | SENT | | PO\# | PO-IIL007064 18k |
describe("parseOps — v2 RIA forum (2025-06)", () => {
  const md = readFileSync("fixtures/shows/raw/2025-06-ria-investment-forum.md", "utf8");
  const ops = parseOps(md, "v2");

  it("po is 'PO-IIL007064 18k'", () => {
    expect(ops.po).toBe("PO-IIL007064 18k");
  });

  it("coi_status is 'SENT'", () => {
    expect(ops.coi_status).toBe("SENT");
  });
});

// ── v2 ops with PO# (2025-04-asset-mgmt-cfo-coo) ─────────────────────────────
describe("parseOps — v2 asset mgmt (2025-04)", () => {
  const md = readFileSync("fixtures/shows/raw/2025-04-asset-mgmt-cfo-coo.md", "utf8");
  const ops = parseOps(md, "v2");

  it("po is 'PO-IIL006967 17k'", () => {
    expect(ops.po).toBe("PO-IIL006967 17k");
  });
});

// ── v1 ops (2024-05-east-coast-family-office) ─────────────────────────────────
describe("parseOps — v1 (2024-05-east-coast-family-office)", () => {
  const md = readFileSync("fixtures/shows/raw/2024-05-east-coast-family-office.md", "utf8");
  const ops = parseOps(md, "v1");

  it("coi_status is 'Sent' (verbatim, no normalization)", () => {
    expect(ops.coi_status).toBe("Sent");
  });

  it("proposal is 'Sent - Budget $17,500'", () => {
    expect(ops.proposal).toBe("Sent - Budget $17,500");
  });
});

// ── coi_status verbatim (no enum normalization) ───────────────────────────────
describe("parseOps — coi_status verbatim preservation", () => {
  it("does not normalize 'Sent' to 'SENT'", () => {
    const md = `| COI | Sent |
| :---: | :---: |`;
    const ops = parseOps(md, "v2");
    expect(ops.coi_status).toBe("Sent");
  });

  it("does not normalize 'IN PROCESS' to any other form", () => {
    const md = `| COI | IN PROCESS |
| :---: | :---: |`;
    const ops = parseOps(md, "v4");
    expect(ops.coi_status).toBe("IN PROCESS");
  });
});

// ── Codex round-7: first-match-wins + placeholder rejection ──────────────────
describe("parseOps — Codex round-7 regression", () => {
  it("blank PO# in real ops block is preserved as null even when later admin table has PO # | FALSE", () => {
    // 2025-03-dci-rpas-central.md line 234: blank | PO# | | (real ops row)
    // line 541: | PO # | FALSE | (admin/reference table)
    // Expected: po === null, NOT po === "FALSE"
    const md = readFileSync("fixtures/shows/raw/2025-03-dci-rpas-central.md", "utf8");
    const ops = parseOps(md, "v2");
    expect(ops.po).toBeNull();
  });

  it("rejects FALSE/TRUE/N/A/TBD/— placeholders for any ops field", () => {
    const md = [
      "| PO#           | FALSE |",
      "| Proposal      | TRUE |",
      "| Invoice       | N/A |",
      "| Invoice Notes | TBD |",
      "| COI           | — |",
    ].join("\n");
    const ops = parseOps(md, "v2");
    expect(ops.po).toBeNull();
    expect(ops.proposal).toBeNull();
    expect(ops.invoice).toBeNull();
    expect(ops.invoice_notes).toBeNull();
    expect(ops.coi_status).toBeNull();
  });

  it("real ops field values still pass through — no false rejections", () => {
    const md = [
      "| PO#       | PO-12345 |",
      "| Proposal  | proposal-abc |",
      "| COI       | Sent |",
      "| Invoice   | SENT |",
      "| Invoice Notes | Add parking receipts |",
    ].join("\n");
    const ops = parseOps(md, "v2");
    expect(ops.po).toBe("PO-12345");
    expect(ops.proposal).toBe("proposal-abc");
    expect(ops.coi_status).toBe("Sent");
    expect(ops.invoice).toBe("SENT");
    expect(ops.invoice_notes).toBe("Add parking receipts");
  });

  it("first-match-wins: real blank value locks the field; subsequent non-placeholder row is ignored", () => {
    // First PO# row is blank → po stays null; second row with real value is ignored
    const md = ["| PO# |  |", "| PO# | PO-SHOULD-NOT-APPEAR |"].join("\n");
    const ops = parseOps(md, "v2");
    expect(ops.po).toBeNull();
  });

  it("first-match-wins: real blank value locks field even when second row is a placeholder", () => {
    const md = ["| PO# |  |", "| PO # | FALSE |"].join("\n");
    const ops = parseOps(md, "v2");
    expect(ops.po).toBeNull();
  });
});

// ── Corpus-coverage test ──────────────────────────────────────────────────────
describe("parseOps — corpus coverage", () => {
  for (const path of ALL_FIXTURES) {
    it(`${path} returns valid ops shape`, () => {
      const md = readFileSync(path, "utf8");
      const version = detectVersion(md);
      const ops = parseOps(md, version ?? "v2");
      // All fields must be string | null
      expect(typeof ops.coi_status === "string" || ops.coi_status === null).toBe(true);
      expect(typeof ops.proposal === "string" || ops.proposal === null).toBe(true);
      expect(typeof ops.po === "string" || ops.po === null).toBe(true);
      expect(typeof ops.invoice === "string" || ops.invoice === null).toBe(true);
      expect(typeof ops.invoice_notes === "string" || ops.invoice_notes === null).toBe(true);
    });
  }
});

// ── Fuzzy field-label recovery (PR-C Task 1) ──────────────────────────────────
// Scoped-alias fuzzy fallback: a misspelled ops field label (Invoice / Proposal /
// Invoice Notes) is recovered via resolveAliasScoped("...", "ops.") and the value
// is routed to the right field with a warn-severity FIELD_LABEL_AUTOCORRECTED.
describe("parseOps — fuzzy field-label recovery", () => {
  it("recovers misspelled Invoice and Proposal labels and warns once each", () => {
    const md = ["| Invoce | INV-123 |", "| Propsal | PROP-9 |"].join("\n");
    const agg = newAggregator();
    const ops = parseOps(md, "v2", agg);
    expect(ops.invoice).toBe("INV-123");
    expect(ops.proposal).toBe("PROP-9");
    const warns = agg.warnings.filter((w) => w.code === "FIELD_LABEL_AUTOCORRECTED");
    expect(warns).toHaveLength(2);
    for (const w of warns) {
      expect(w.severity).toBe("warn");
      expect(w.blockRef).toEqual({ kind: "financials" });
    }
  });

  it("anti-shadow: an exact label later in the block wins over an earlier typo, no warning", () => {
    // "Invoce" (typo) precedes the exact "Invoice" row; first-match-wins keeps the
    // real value and the post-loop fuzzy candidate is skipped because the field is seen.
    const md = ["| Invoce | TYPO-WRONG |", "| Invoice | REAL-456 |"].join("\n");
    const agg = newAggregator();
    const ops = parseOps(md, "v2", agg);
    expect(ops.invoice).toBe("REAL-456");
    expect(agg.warnings.filter((w) => w.code === "FIELD_LABEL_AUTOCORRECTED")).toHaveLength(0);
  });

  it("exact spellings still route with no fuzzy warning", () => {
    const md = ["| COI | Sent |", "| PO# | PO-1 |", "| Invoice Note | n |"].join("\n");
    const agg = newAggregator();
    const ops = parseOps(md, "v2", agg);
    expect(ops.coi_status).toBe("Sent");
    expect(ops.po).toBe("PO-1");
    expect(ops.invoice_notes).toBe("n");
    expect(agg.warnings.filter((w) => w.code === "FIELD_LABEL_AUTOCORRECTED")).toHaveLength(0);
  });

  it("VALUE-guard: a typo in the cell VALUE (not the label) is never fuzzed", () => {
    const md = ["| SomeForeignLabel | Invoce |"].join("\n");
    const agg = newAggregator();
    const ops = parseOps(md, "v2", agg);
    expect(ops.invoice).toBeNull();
    expect(agg.warnings.filter((w) => w.code === "FIELD_LABEL_AUTOCORRECTED")).toHaveLength(0);
  });

  it("below-minLen: very short labels (CO, P0) are not fuzz-corrected", () => {
    const md = ["| CO | x |", "| P0 | y |"].join("\n");
    const agg = newAggregator();
    const ops = parseOps(md, "v2", agg);
    expect(ops.coi_status).toBeNull();
    expect(ops.po).toBeNull();
    expect(agg.warnings.filter((w) => w.code === "FIELD_LABEL_AUTOCORRECTED")).toHaveLength(0);
  });
});
