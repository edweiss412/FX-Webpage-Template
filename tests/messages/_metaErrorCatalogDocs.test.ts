import { describe, it, expect } from "vitest";
import { type MessageCatalogEntry } from "@/lib/messages/catalog";
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
    expect(contractViolations(entry)).toEqual([
      "predicate entry: longExplanation is null",
    ]);
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
    expect(contractViolations(entry)).toEqual([
      "non-predicate entry: helpHref must be null",
    ]);
  });

  it("crew-only entry with stray title has the exact non-predicate title violation", () => {
    const entry = makeEntry({
      crewFacing: "Crew message.",
      title: "Stray title",
    });
    expect(predicate(entry)).toBe(false);
    expect(contractViolations(entry)).toEqual([
      "non-predicate entry: title must be null",
    ]);
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
