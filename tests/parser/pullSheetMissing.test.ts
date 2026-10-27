// PULL_SHEET_MISSING: the sheet yields no pack list, so crew cannot look up which case gear is in.
// Spec docs/superpowers/specs/parser/2026-10-26-pack-list-missing-warning-design.md §4.
//
// The notice reads the PARSED pullSheet, so every expectation here is computed from
// `parsed.pullSheet` and never typed. The archived-tab suppression lives in sync
// (finalizeArchivedTabs) and is pinned in tests/sync/pullSheetOverrideReconcile.test.ts.
import { describe, expect, it, vi } from "vitest";

import { parseSheet } from "@/lib/parser";
import type { ParseWarning } from "@/lib/parser/types";
import { hasIgnorableSnippet } from "@/lib/dataQuality/ignorableSnippet";
import { warningFingerprint } from "@/lib/dataQuality/warningFingerprint";
import { sectionForWarning } from "@/lib/admin/step3SectionStatus";
import { premiseHolds } from "@/tests/_shared/premise";
import { FIXTURES, readFixture } from "@/tests/parser/mutation/fixtures";

const FINTECH_XLSX = FIXTURES.find((f) => f.path === "fixtures/shows/exporter-xlsx/fintech.md")!;

const notices = (warnings: readonly ParseWarning[]): ParseWarning[] =>
  warnings.filter((w) => w.code === "PULL_SHEET_MISSING");

const corpus = FIXTURES.map((f) => {
  const parsed = parseSheet(readFixture(f), f.path);
  return { path: f.path, expected: parsed.pullSheet === null, notices: notices(parsed.warnings) };
});

describe("PULL_SHEET_MISSING over the corpus (AC-1)", () => {
  it("fires exactly once where the parsed pullSheet is null, and never elsewhere", () => {
    // Both directions must be reachable on this corpus, or the loop below passes on a
    // notice that always fires or never does.
    premiseHolds(
      "some fixture parses no pack list",
      corpus.some((c) => c.expected),
    );
    premiseHolds(
      "some fixture parses a pack list",
      corpus.some((c) => !c.expected),
    );

    for (const c of corpus) expect(c.notices.length, c.path).toBe(c.expected ? 1 : 0);
  });
});

describe("PULL_SHEET_MISSING on one warning (AC-2)", () => {
  it("is a warn routed to the Pack list section, with a constant ignorable snippet", () => {
    const firing = corpus.filter((c) => c.expected);
    premiseHolds("at least two fixtures fire the notice", firing.length >= 2);
    const [w] = firing[0]!.notices;
    expect(w).toBeDefined();
    expect(w!.severity).toBe("warn");
    expect(w!.blockRef).toEqual({ kind: "pull_sheet" });
    expect(w!.rawSnippet).toBe("no pack list");
    expect(w!.message).toBe("We didn't find a pack list we could read in this sheet.");
    expect(w!.sourceCell).toBeUndefined();
    expect(hasIgnorableSnippet(w!)).toBe(true);
    expect(sectionForWarning(w!)).toBe("packlist");

    // The Ignore fingerprint is the same on every show, so one Ignore covers the notice for as
    // long as it keeps firing on that show (ignores are stored per show).
    const fingerprints = firing.map((c) => warningFingerprint(c.notices[0]!));
    expect(fingerprints[0]).not.toBeNull();
    expect(new Set(fingerprints).size).toBe(1);
  });
});

describe("the parser's early-return stub never carries the notice (AC-3)", () => {
  it("a sheet that fails version detection has no pack list and no notice", () => {
    const stub = parseSheet("");
    premiseHolds(
      "the empty sheet takes the MI-1 early return",
      stub.hardErrors.some((e) => e.code === "MI-1_VERSION_DETECTION_FAILED"),
    );
    premiseHolds("the stub has no pack list", stub.pullSheet === null);
    expect(notices(stub.warnings)).toEqual([]);
  });
});

describe("a pack list with cases but no items is not a missing pack list (spec §7 item 1)", () => {
  it("stays quiet when parsePullSheet returns one itemless case", async () => {
    premiseHolds(
      "the unmocked fintech parse fires the notice",
      notices(parseSheet(readFixture(FINTECH_XLSX), FINTECH_XLSX.path).warnings).length === 1,
    );
    vi.resetModules();
    vi.doMock("@/lib/parser/pull-sheet", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@/lib/parser/pull-sheet")>()),
      parsePullSheet: () => ({ pullSheet: [{ caseLabel: "Case 1", items: [] }], warnings: [] }),
    }));
    try {
      const { parseSheet: parseMocked } = await import("@/lib/parser");
      const r = parseMocked(readFixture(FINTECH_XLSX), FINTECH_XLSX.path);
      expect(r.pullSheet).toEqual([{ caseLabel: "Case 1", items: [] }]);
      expect(notices(r.warnings)).toEqual([]);
    } finally {
      vi.doUnmock("@/lib/parser/pull-sheet");
      vi.resetModules();
    }
  });
});

describe("the notice never changes the parse result (AC-6)", () => {
  it("every firing fixture parses to the same result, warnings aside, with the emitter a no-op", async () => {
    const firing = FIXTURES.filter((f) => corpus.find((c) => c.path === f.path)?.expected);
    premiseHolds("some corpus fixture fires the notice", firing.length > 0);
    const real = firing.map((f) => parseSheet(readFixture(f), f.path));
    for (const r of real)
      premiseHolds("the real parse emitted the notice", notices(r.warnings).length === 1);

    vi.resetModules();
    vi.doMock("@/lib/parser/warnings", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@/lib/parser/warnings")>()),
      emitPullSheetMissing: () => {},
    }));
    try {
      const { parseSheet: parseSilenced } = await import("@/lib/parser");
      firing.forEach((f, i) => {
        const silenced = parseSilenced(readFixture(f), f.path);
        premiseHolds(
          "the silenced parse emitted no notice",
          notices(silenced.warnings).length === 0,
        );
        const { warnings: _silencedWarnings, ...silencedRest } = silenced;
        const { warnings: _realWarnings, ...realRest } = real[i]!;
        expect(silencedRest, f.path).toEqual(realRest);
      });
    } finally {
      vi.doUnmock("@/lib/parser/warnings");
      vi.resetModules();
    }
  });
});
