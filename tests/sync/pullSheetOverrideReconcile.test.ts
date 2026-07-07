import { describe, expect, it, vi } from "vitest";
import type { ArchivedPullSheetTab, ParseResult } from "@/lib/parser/types";
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

// Shared type-guard so the empty-parse helper stays honest against the real type.
const _typecheck: ArchivedPullSheetTab | undefined = undefined;
void _typecheck;
