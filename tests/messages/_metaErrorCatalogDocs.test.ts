import { describe, it, expect } from "vitest";
import { MESSAGE_CATALOG, type MessageCatalogEntry } from "@/lib/messages/catalog";
// r3 fix: import the single-source-of-truth validator from Phase B.4 instead
// of redefining the predicate inline. This keeps the live-catalog assertion
// in lockstep with B.4's forced fixtures — any update to the contract
// (e.g., adding a new M11 field) propagates to both surfaces automatically.
import {
  predicate,
  allM12FieldsNonNull,
  helpHrefShapeOk,
  contractViolations,
  HELP_HREF_RE,
} from "@/lib/messages/catalogDocsValidator";

function makeEntry(overrides: Partial<MessageCatalogEntry>): MessageCatalogEntry {
  return {
    code: "SYNTHETIC",
    dougFacing: null,
    crewFacing: null,
    followUp: null,
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
    ...overrides,
  };
}

describe("Catalog meta-test (test #2 — predicate-entry contract)", () => {
  it("predicate-entry with all three M11 fields populated + valid helpHref has no violations", () => {
    const entry = makeEntry({
      severity: "warning",
      dougFacing: "Refresh.",
      title: "Sync race",
      longExplanation: "A newer sync already won. Refresh.",
      helpHref: "/help/admin/parse-warnings#STALE",
    });
    expect(predicate(entry)).toBe(true);
    expect(contractViolations(entry)).toEqual([]);
  });

  it("predicate-entry missing title has the exact title violation", () => {
    const entry = makeEntry({
      severity: "warning",
      dougFacing: "Refresh.",
      longExplanation: "A newer sync already won.",
      helpHref: "/help/admin/parse-warnings#STALE",
    });
    expect(predicate(entry)).toBe(true);
    expect(contractViolations(entry)).toEqual(["predicate entry: title is null"]);
  });

  it("predicate-entry missing longExplanation has the exact longExplanation violation", () => {
    const entry = makeEntry({
      severity: "warning",
      dougFacing: "Refresh.",
      title: "Sync race",
      helpHref: "/help/admin/parse-warnings#STALE",
    });
    expect(predicate(entry)).toBe(true);
    expect(contractViolations(entry)).toEqual(["predicate entry: longExplanation is null"]);
  });

  it("predicate-entry missing helpHref has the exact helpHref-null violation", () => {
    const entry = makeEntry({
      severity: "warning",
      dougFacing: "Refresh.",
      title: "Sync race",
      longExplanation: "A newer sync already won.",
    });
    expect(predicate(entry)).toBe(true);
    expect(contractViolations(entry)).toEqual(["predicate entry: helpHref is null"]);
  });

  it("predicate-entry with invalid helpHref has the exact shape violation", () => {
    const entry = makeEntry({
      severity: "warning",
      dougFacing: "Refresh.",
      title: "Sync race",
      longExplanation: "A newer sync already won.",
      helpHref: "https://example.com/help/errors",
    });
    expect(predicate(entry)).toBe(true);
    expect(contractViolations(entry)).toEqual([
      'predicate entry: helpHref must match /help/* (got "https://example.com/help/errors")',
    ]);
  });

  it("severity-info entry is non-predicate and has no violations when all M11 fields are null", () => {
    const entry = makeEntry({ severity: "info", dougFacing: "FYI." });
    expect(predicate(entry)).toBe(false);
    expect(contractViolations(entry)).toEqual([]);
  });
});

describe("Catalog meta-test (test #2 — non-predicate-entry contract)", () => {
  it("crew-only entry with all three M11 fields null has no violations", () => {
    const entry = makeEntry({ crewFacing: "Crew message." });
    expect(predicate(entry)).toBe(false);
    expect(contractViolations(entry)).toEqual([]);
  });

  it("crew-only entry with stray helpHref has the exact non-predicate helpHref violation", () => {
    const entry = makeEntry({
      crewFacing: "Crew message.",
      helpHref: "/help/errors#X",
    });
    expect(predicate(entry)).toBe(false);
    expect(allM12FieldsNonNull(entry)).toBe(false);
    expect(contractViolations(entry)).toEqual(["non-predicate entry: helpHref must be null"]);
  });

  it("crew-only entry with stray title has the exact non-predicate title violation", () => {
    const entry = makeEntry({
      crewFacing: "Crew message.",
      title: "Stray title",
    });
    expect(predicate(entry)).toBe(false);
    expect(contractViolations(entry)).toEqual(["non-predicate entry: title must be null"]);
  });

  it("crew-only entry with stray longExplanation has the exact non-predicate longExplanation violation", () => {
    const entry = makeEntry({
      crewFacing: "Crew message.",
      longExplanation: "Stray long explanation.",
    });
    expect(predicate(entry)).toBe(false);
    expect(contractViolations(entry)).toEqual([
      "non-predicate entry: longExplanation must be null",
    ]);
  });

  it("admin-log-only entry with all M11 fields null has no violations", () => {
    const entry = makeEntry({ severity: "warning" });
    expect(predicate(entry)).toBe(false);
    expect(contractViolations(entry)).toEqual([]);
  });
});

describe("Catalog meta-test (test #2 — helpHref shape sanity)", () => {
  it("invalid wrong-root helpHref has the exact shape violation", () => {
    const entry = makeEntry({
      severity: "warning",
      dougFacing: "Refresh.",
      title: "Sync race",
      longExplanation: "A newer sync already won.",
      helpHref: "/admin/help",
    });
    expect(helpHrefShapeOk(entry.helpHref)).toBe(false);
    expect(contractViolations(entry)).toEqual([
      'predicate entry: helpHref must match /help/* (got "/admin/help")',
    ]);
  });

  it("invalid anchor-only helpHref has the exact shape violation", () => {
    const entry = makeEntry({
      severity: "warning",
      dougFacing: "Refresh.",
      title: "Sync race",
      longExplanation: "A newer sync already won.",
      helpHref: "#STALE_WRITE",
    });
    expect(helpHrefShapeOk(entry.helpHref)).toBe(false);
    expect(contractViolations(entry)).toEqual([
      'predicate entry: helpHref must match /help/* (got "#STALE_WRITE")',
    ]);
  });

  it("valid /help/* helpHref shapes have no violations", () => {
    for (const helpHref of [
      "/help/errors",
      "/help/admin/parse-warnings#STALE_WRITE",
      "/help/onboarding?step=2",
    ]) {
      const entry = makeEntry({
        severity: "warning",
        dougFacing: "Refresh.",
        title: "Sync race",
        longExplanation: "A newer sync already won.",
        helpHref,
      });
      expect(helpHrefShapeOk(helpHref)).toBe(true);
      expect(contractViolations(entry)).toEqual([]);
    }
  });

  it("null helpHref is accepted for non-predicate entries and HELP_HREF_RE is exported", () => {
    const entry = makeEntry({ crewFacing: "Crew message." });
    expect(helpHrefShapeOk(null)).toBe(true);
    expect(contractViolations(entry)).toEqual([]);
    expect(HELP_HREF_RE).toBeInstanceOf(RegExp);
    expect("/help/x".match(HELP_HREF_RE)).not.toBeNull();
  });
});

describe("Catalog meta-test (test #2 — live-catalog full contract, added in E.13 per r6)", () => {
  it("every live entry satisfies the spec §5.2 full contract", () => {
    const lines: string[] = [];
    for (const [code, entry] of Object.entries(MESSAGE_CATALOG)) {
      const violations = contractViolations(entry);
      if (violations.length > 0) {
        for (const v of violations) lines.push(`${code}: ${v}`);
      }
    }
    expect(lines, lines.join("\n")).toEqual([]);
  });
});

// Codex R2 finding #1 — spec §5.6 carve-out: parse-warning catalog codes
// (code-name pattern WARN_ or PARSE_) MUST point at the parse-warnings page
// per the §5.6 matrix row for `/admin/show/<slug>` parse-warning rows. All
// other Doug-facing catalog entries follow the default `/help/errors#<code>`
// template-family target. This assertion catches target-class drift that the
// generic shape-only meta-test (above) does not pin.
describe("Catalog meta-test (helpHref target class — Codex R2 finding #1)", () => {
  const PARSE_CODE_PATTERN = /^(WARN_|PARSE_)/;

  it("every Doug-facing WARN_/PARSE_ catalog entry points at /help/admin/parse-warnings#<code>", () => {
    const offenders: string[] = [];
    for (const [code, entry] of Object.entries(MESSAGE_CATALOG)) {
      if (!predicate(entry)) continue;
      if (!PARSE_CODE_PATTERN.test(entry.code)) continue;
      if (!entry.helpHref?.startsWith("/help/admin/parse-warnings#")) {
        offenders.push(`${code}: helpHref=${JSON.stringify(entry.helpHref)}`);
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("every OTHER Doug-facing catalog entry points at /help/errors#<code> (preserves the canonical-for-default rule)", () => {
    const offenders: string[] = [];
    for (const [code, entry] of Object.entries(MESSAGE_CATALOG)) {
      if (!predicate(entry)) continue;
      if (PARSE_CODE_PATTERN.test(entry.code)) continue;
      if (!entry.helpHref?.startsWith("/help/errors#")) {
        offenders.push(`${code}: helpHref=${JSON.stringify(entry.helpHref)}`);
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});
