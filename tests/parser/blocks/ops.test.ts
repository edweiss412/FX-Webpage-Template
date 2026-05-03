import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseOps } from "@/lib/parser/blocks/ops";
import { detectVersion } from "@/lib/parser/schema";

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

  it("invoiceNotes is 'Add parking receipts and Zoom'", () => {
    expect(ops.invoiceNotes).toBe("Add parking receipts and Zoom");
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

// ── Corpus-coverage test ──────────────────────────────────────────────────────
describe("parseOps — corpus coverage", () => {
  for (const path of ALL_FIXTURES) {
    it(`${path} returns valid ops shape`, () => {
      const md = readFileSync(path, "utf8");
      const version = detectVersion(md);
      const ops = parseOps(md, version);
      // All fields must be string | null
      expect(typeof ops.coi_status === "string" || ops.coi_status === null).toBe(true);
      expect(typeof ops.proposal === "string" || ops.proposal === null).toBe(true);
      expect(typeof ops.po === "string" || ops.po === null).toBe(true);
      expect(typeof ops.invoice === "string" || ops.invoice === null).toBe(true);
      expect(typeof ops.invoiceNotes === "string" || ops.invoiceNotes === null).toBe(true);
    });
  }
});
