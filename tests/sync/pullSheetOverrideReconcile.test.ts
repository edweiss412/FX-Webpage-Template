import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { synthesizeMarkdownFromXlsx } from "@/lib/drive/exportSheetToMarkdown";
import { parseSheet } from "@/lib/parser";
import type { ArchivedPullSheetTab, ParseResult, ParseWarning } from "@/lib/parser/types";
import { premiseHolds } from "@/tests/_shared/premise";
import {
  discardAndRerun,
  emitArchivedTabWarnings,
  finalizeArchivedTabs,
  overrideSnapshot,
  reconcileIncludedTab,
} from "@/lib/sync/pullSheetOverride";

const emptyParse = (): ParseResult =>
  ({
    show: {} as never,
    crewMembers: [],
    hotelReservations: [],
    rooms: [],
    transportation: null,
    contacts: [],
    pullSheet: null,
    diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
    openingReel: null,
    raw_unrecognized: [],
    warnings: [],
    archivedPullSheetTabs: [],
    hardErrors: [],
  }) as unknown as ParseResult;

describe("overrideSnapshot", () => {
  it("drops audit fields", () => {
    expect(
      overrideSnapshot({
        tabName: "OLD PULL SHEET",
        fingerprint: "ff",
        acceptedBy: "a@b.com",
        acceptedAt: "2026-07-06T00:00:00.000Z",
      }),
    ).toEqual({ tabName: "OLD PULL SHEET", fingerprint: "ff" });
    expect(overrideSnapshot(null)).toBeNull();
  });
});

describe("emitArchivedTabWarnings", () => {
  it("emits one PULL_SHEET_ON_ARCHIVED_TAB per included:false tab, rawSnippet = joined previews", () => {
    const warns = emitArchivedTabWarnings([
      {
        tabName: "OLD PULL SHEET",
        headerPreviews: ["RIA - CHICAGO", "MIAMI"],
        fingerprint: "ff",
        included: false,
        contentChangedSinceAccept: false,
      },
    ]);
    expect(warns).toHaveLength(1);
    expect(warns[0]).toMatchObject({
      severity: "warn",
      code: "PULL_SHEET_ON_ARCHIVED_TAB",
      rawSnippet: "RIA - CHICAGO | MIAMI",
      blockRef: { kind: "pull_sheet_archived_tab", name: "OLD PULL SHEET" },
    });
  });

  it("never warns an included:true (accepted) tab", () => {
    const warns = emitArchivedTabWarnings([
      {
        tabName: "OLD PULL SHEET",
        headerPreviews: ["RIA"],
        fingerprint: "ff",
        included: true,
        contentChangedSinceAccept: false,
      },
    ]);
    expect(warns).toHaveLength(0);
  });
});

describe("reconcileIncludedTab", () => {
  const base = {
    tabName: "OLD PULL SHEET",
    headerPreviews: ["RIA"],
    included: true,
    contentChangedSinceAccept: false,
  };
  const override = {
    tabName: "OLD PULL SHEET",
    fingerprint: "ff",
    acceptedBy: "a",
    acceptedAt: "t",
  };

  it("match / content_changed / tab_missing / no_override", () => {
    expect(reconcileIncludedTab({ tabs: [{ ...base, fingerprint: "ff" }], override }).kind).toBe(
      "match",
    );
    expect(reconcileIncludedTab({ tabs: [{ ...base, fingerprint: "ee" }], override }).kind).toBe(
      "content_changed",
    );
    // Override tab renamed/deleted server-side → NO entry for override.tabName:
    expect(reconcileIncludedTab({ tabs: [], override }).kind).toBe("tab_missing");
    expect(
      reconcileIncludedTab({
        tabs: [{ ...base, tabName: "OTHER OLD", included: false, fingerprint: "zz" }],
        override,
      }).kind,
    ).toBe("tab_missing");
    expect(reconcileIncludedTab({ tabs: [], override: null }).kind).toBe("no_override");
  });

  it("content_changed carries the drifted tab as changedTab", () => {
    const res = reconcileIncludedTab({ tabs: [{ ...base, fingerprint: "ee" }], override });
    expect(res.kind).toBe("content_changed");
    if (res.kind === "content_changed") {
      expect(res.changedTab.fingerprint).toBe("ee");
    }
  });
});

describe("discardAndRerun (shared single-source contract)", () => {
  it("content_changed: clears override, flags S4 tab, applied=null, warning fired, current gear preserved", async () => {
    const clearOverride = vi.fn(async () => {});
    const emit = vi.fn();
    const reparsed = emptyParse();
    // No-override re-parse PRESERVES a current non-OLD pull sheet and drops the OLD gear.
    reparsed.pullSheet = [
      { header: "Current", items: [{ item: "Current DI Box" }] },
    ] as unknown as ParseResult["pullSheet"];
    finalizeArchivedTabs(reparsed, [
      {
        tabName: "OLD PULL SHEET",
        headerPreviews: ["NEW"],
        fingerprint: "ee",
        included: false,
        contentChangedSinceAccept: false,
      },
    ]);
    const reparseNoOverride = vi.fn(async () => reparsed);

    const { parseResult, appliedSnapshot } = await discardAndRerun({
      reconcile: {
        kind: "content_changed",
        changedTab: {
          tabName: "OLD PULL SHEET",
          headerPreviews: ["NEW"],
          fingerprint: "ee",
          included: true,
          contentChangedSinceAccept: false,
        },
      },
      overrideTabName: "OLD PULL SHEET",
      reparseNoOverride,
      clearOverride,
      emit,
    });

    expect(clearOverride).toHaveBeenCalledOnce();
    expect(emit).toHaveBeenCalledOnce();
    expect(appliedSnapshot).toBeNull();
    const tab = parseResult.archivedPullSheetTabs.find((t) => t.tabName === "OLD PULL SHEET");
    expect(tab?.contentChangedSinceAccept).toBe(true);
    expect(tab?.fingerprint).toBe("ee");
    expect(parseResult.warnings.some((w) => w.code === "PULL_SHEET_OVERRIDE_CONTENT_CHANGED")).toBe(
      true,
    );
    const items = (parseResult.pullSheet ?? []).flatMap((c) => c.items).map((i) => i.item);
    expect(items).toContain("Current DI Box"); // current gear NOT force-emptied
  });

  it("tab_missing: clears override, applied=null, no offer entry, warning fired (S1)", async () => {
    const reparsed = finalizeArchivedTabs(emptyParse(), []); // tab gone → no offer
    const { parseResult, appliedSnapshot } = await discardAndRerun({
      reconcile: { kind: "tab_missing" },
      overrideTabName: "OLD PULL SHEET",
      reparseNoOverride: async () => reparsed,
      clearOverride: async () => {},
    });
    expect(appliedSnapshot).toBeNull();
    expect(parseResult.archivedPullSheetTabs).toHaveLength(0);
    expect(parseResult.warnings.some((w) => w.code === "PULL_SHEET_OVERRIDE_CONTENT_CHANGED")).toBe(
      true,
    );
  });
});

// PULL_SHEET_MISSING (2026-10-26 pack-list-missing-warning §4.1 stage 2): the parser emits it
// whenever pullSheet is null; finalizeArchivedTabs removes it when ANY archived pull-sheet tab
// exists, because that tab's own warning, offer or note already speaks for the absence.
describe("finalizeArchivedTabs and PULL_SHEET_MISSING", () => {
  const notice = (): ParseWarning => ({
    severity: "warn",
    code: "PULL_SHEET_MISSING",
    message: "We didn't find a pack list we could read in this sheet.",
    blockRef: { kind: "pull_sheet" },
    rawSnippet: "no pack list",
  });
  const other = (code: string): ParseWarning => ({ severity: "warn", code, message: code });
  const tab = (included: boolean): ArchivedPullSheetTab => ({
    tabName: "OLD PULL SHEET",
    headerPreviews: ["RIA - CHICAGO"],
    fingerprint: "ff",
    included,
    contentChangedSinceAccept: false,
  });
  const withNotice = (): ParseResult => {
    const pr = emptyParse();
    pr.warnings = [other("REF_ERROR_LITERAL"), notice(), other("ROW_CELLS_FUSED")];
    return pr;
  };
  const codes = (pr: ParseResult) => pr.warnings.map((w) => w.code);

  it("removes the notice beside an offered tab, keeping every other warning in order", () => {
    const pr = withNotice();
    premiseHolds("the input carries the notice", codes(pr).includes("PULL_SHEET_MISSING"));
    finalizeArchivedTabs(pr, [tab(false)]);
    expect(codes(pr)).toEqual([
      "REF_ERROR_LITERAL",
      "ROW_CELLS_FUSED",
      "PULL_SHEET_ON_ARCHIVED_TAB",
    ]);
  });

  it("removes the notice beside an included tab too", () => {
    const pr = withNotice();
    finalizeArchivedTabs(pr, [tab(true)]);
    expect(codes(pr)).toEqual(["REF_ERROR_LITERAL", "ROW_CELLS_FUSED"]);
  });

  it("leaves the warnings exactly as they were when no archived tab exists", () => {
    const pr = withNotice();
    const before = structuredClone(pr.warnings);
    finalizeArchivedTabs(pr, []);
    expect(pr.warnings).toEqual(before);
  });

  it("content_changed rerun: the no-override parse's archived tab keeps the notice away", async () => {
    const changedTab = { ...tab(true), fingerprint: "ee" };
    const { parseResult } = await discardAndRerun({
      reconcile: { kind: "content_changed", changedTab },
      overrideTabName: "OLD PULL SHEET",
      // Mirrors the production closures (runScheduledCronSync, runOnboardingScan), which
      // finalize the no-override parse with its own archived tabs.
      reparseNoOverride: async () =>
        finalizeArchivedTabs(withNotice(), [{ ...changedTab, included: false }]),
      clearOverride: async () => {},
    });
    expect(codes(parseResult)).not.toContain("PULL_SHEET_MISSING");
    expect(codes(parseResult)).toContain("PULL_SHEET_OVERRIDE_CONTENT_CHANGED");
  });

  it("tab_missing rerun: no archived tab remains, so the notice stays", async () => {
    const { parseResult } = await discardAndRerun({
      reconcile: { kind: "tab_missing" },
      overrideTabName: "OLD PULL SHEET",
      reparseNoOverride: async () => finalizeArchivedTabs(withNotice(), []),
      clearOverride: async () => {},
    });
    expect(codes(parseResult).filter((c) => c === "PULL_SHEET_MISSING")).toHaveLength(1);
    expect(codes(parseResult)).toContain("PULL_SHEET_OVERRIDE_CONTENT_CHANGED");
  });

  it("end to end through the exporter: redefining-fi is suppressed, fintech fires (AC-5)", () => {
    const run = (slug: string) => {
      const bytes = readFileSync(`fixtures/shows/exporter-xlsx/${slug}.xlsx`);
      const buf = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer;
      const { markdown, archivedPullSheetTabs } = synthesizeMarkdownFromXlsx(buf);
      // Production runs `enrich` between parse and finalize; it resolves opening-reel and
      // diagram refs, neither of which finalizeArchivedTabs reads, so the bare parse stands in.
      const parsed = parseSheet(
        markdown,
        `fixtures/shows/exporter-xlsx/${slug}.md`,
      ) as unknown as ParseResult;
      const rawNotices = codes(parsed).filter((c) => c === "PULL_SHEET_MISSING").length;
      finalizeArchivedTabs(parsed, archivedPullSheetTabs);
      return {
        tabs: archivedPullSheetTabs.length,
        rawNotices,
        finalNotices: codes(parsed).filter((c) => c === "PULL_SHEET_MISSING").length,
      };
    };
    const redefining = run("redefining-fi");
    const fintech = run("fintech");
    premiseHolds("the exporter returns an archived tab for redefining-fi", redefining.tabs > 0);
    premiseHolds("the exporter returns no archived tab for fintech", fintech.tabs === 0);
    premiseHolds(
      "both parses carry the notice before finalize",
      redefining.rawNotices === 1 && fintech.rawNotices === 1,
    );
    expect(redefining.finalNotices).toBe(0);
    expect(fintech.finalNotices).toBe(1);
  });
});

// Shared type-guard so the empty-parse helper stays honest against the real type.
const _typecheck: ArchivedPullSheetTab | undefined = undefined;
void _typecheck;
