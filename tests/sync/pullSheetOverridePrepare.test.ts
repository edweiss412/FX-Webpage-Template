import { describe, expect, it } from "vitest";
import { synthesizeMarkdownFromXlsx } from "@/lib/drive/exportSheetToMarkdown";
import type { DriveListedFile } from "@/lib/drive/list";
import type { ParseResult, ParsedSheet } from "@/lib/parser/types";
import type { PullSheetOverride } from "@/lib/sync/pullSheetOverride";
import { prepareOnboardingFiles, type RunOnboardingScanDeps } from "@/lib/sync/runOnboardingScan";
import { buildXlsx } from "../helpers/buildXlsx";

// A workbook with a CURRENT (non-OLD) pull sheet AND an archived OLD PULL SHEET tab.
const currentRegion = [
  ["PULL SHEET", "PULL SHEET"],
  ["CURRENT SHOW"],
  [],
  ["QTY", "ITEM"],
  ["1", "Current DI Box"],
];
const oldRegion = [
  ["PULL SHEET", "PULL SHEET"],
  ["RIA - CHICAGO, IL"],
  [],
  ["QTY", "ITEM"],
  ["2", "Shure SM58"],
];

function mixedWorkbookBytes(): ArrayBuffer {
  return buildXlsx([
    { name: "PULL SHEET", grid: currentRegion },
    { name: "OLD PULL SHEET", grid: oldRegion },
  ]);
}
function onlyOldWorkbookBytes(): ArrayBuffer {
  return buildXlsx([{ name: "OLD PULL SHEET", grid: oldRegion }]);
}
function onlyCurrentWorkbookBytes(): ArrayBuffer {
  return buildXlsx([{ name: "PULL SHEET", grid: currentRegion }]);
}

const FILE: DriveListedFile = {
  driveFileId: "drive-1",
  name: "II - Test Show",
  mimeType: "application/vnd.google-apps.spreadsheet",
  modifiedTime: "2026-07-06T00:00:00.000Z",
  parents: ["folder-1"],
};

// Deps that drive the REAL prepareOne: the fetch stub mirrors the real
// fetchSheetMarkdownWithBinding (synthesize WITH inclusion when includePullSheetFromTab
// is set, else WITHOUT); parse is the real parser; enrich is a passthrough (no Drive).
function deps(bytes: ArrayBuffer, override: PullSheetOverride | null): RunOnboardingScanDeps {
  return {
    listFolder: async () => [FILE],
    fetchMarkdownWithBinding: async (_id, opts) => {
      const out = opts?.includePullSheetFromTab
        ? synthesizeMarkdownFromXlsx(bytes, {
            includePullSheetFromTab: opts.includePullSheetFromTab,
          })
        : synthesizeMarkdownFromXlsx(bytes);
      return {
        binding: { bindingToken: "tok", modifiedTime: FILE.modifiedTime },
        markdown: out.markdown,
        bytes,
        archivedPullSheetTabs: out.archivedPullSheetTabs,
      };
    },
    enrichWithDrivePins: async (parsed: ParsedSheet) =>
      ({
        ...parsed,
        diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
        openingReel: null,
      }) as unknown as ParseResult,
    listSheetGids: async () => new Map<string, number>(),
    readPullSheetOverride: async () => override,
  };
}

async function prepareSheet(bytes: ArrayBuffer, override: PullSheetOverride | null) {
  const files = await prepareOnboardingFiles("folder-1", deps(bytes, override));
  const prepared = files[0]!;
  if (prepared.kind !== "sheet") throw new Error("expected sheet");
  return prepared;
}

function currentFingerprint(bytes: ArrayBuffer): string {
  const tab = synthesizeMarkdownFromXlsx(bytes).archivedPullSheetTabs.find(
    (t) => t.tabName === "OLD PULL SHEET",
  );
  if (!tab) throw new Error("no OLD tab");
  return tab.fingerprint;
}

describe("prepareOnboardingFiles pull-sheet override wiring (shared scan+rescan path)", () => {
  it("no override: archivedPullSheetTabs persisted + warning emitted, applied=null, not cleared", async () => {
    const prepared = await prepareSheet(onlyOldWorkbookBytes(), null);
    expect(prepared.parseResult.archivedPullSheetTabs).toEqual([
      expect.objectContaining({ tabName: "OLD PULL SHEET", included: false }),
    ]);
    expect(prepared.parseResult.warnings.some((w) => w.code === "PULL_SHEET_ON_ARCHIVED_TAB")).toBe(
      true,
    );
    expect(prepared.pullSheetOverrideApplied ?? null).toBeNull();
    expect(prepared.pullSheetOverrideCleared ?? false).toBe(false);
  });

  it("override + matching fingerprint: OLD gear included, applied=snapshot, not cleared", async () => {
    const bytes = onlyOldWorkbookBytes();
    const fp = currentFingerprint(bytes);
    const prepared = await prepareSheet(bytes, {
      tabName: "OLD PULL SHEET",
      fingerprint: fp,
      acceptedBy: "a@b.com",
      acceptedAt: "2026-07-06T00:00:00.000Z",
    });
    const itemsText = (prepared.parseResult.pullSheet ?? [])
      .flatMap((c) => c.items)
      .map((i) => i.item)
      .join(" ");
    expect(itemsText).toContain("Shure SM58"); // included gear
    expect(prepared.pullSheetOverrideApplied).toEqual({
      tabName: "OLD PULL SHEET",
      fingerprint: fp,
    });
    expect(prepared.pullSheetOverrideCleared ?? false).toBe(false);
  });

  it("mixed workbook, override + drifted fingerprint: discard-and-rerun preserves current gear, drops OLD, S4 flag, applied=null, cleared", async () => {
    const bytes = mixedWorkbookBytes();
    const prepared = await prepareSheet(bytes, {
      tabName: "OLD PULL SHEET",
      fingerprint: "stale-ff",
      acceptedBy: "a@b.com",
      acceptedAt: "2026-07-06T00:00:00.000Z",
    });
    const itemsText = (prepared.parseResult.pullSheet ?? [])
      .flatMap((c) => c.items)
      .map((i) => i.item)
      .join(" ");
    expect(itemsText).toContain("Current DI Box"); // current gear preserved
    expect(itemsText).not.toContain("Shure SM58"); // OLD gear dropped
    expect(prepared.pullSheetOverrideApplied ?? null).toBeNull();
    expect(prepared.pullSheetOverrideCleared).toBe(true);
    const tab = prepared.parseResult.archivedPullSheetTabs.find(
      (t) => t.tabName === "OLD PULL SHEET",
    );
    expect(tab?.contentChangedSinceAccept).toBe(true);
    expect(tab?.fingerprint).toBe(currentFingerprint(bytes)); // NEW fingerprint for re-review
    expect(
      prepared.parseResult.warnings.some((w) => w.code === "PULL_SHEET_OVERRIDE_CONTENT_CHANGED"),
    ).toBe(true);
  });

  it("override tab deleted server-side (tab_missing): override cleared, applied=null, no offer, S1", async () => {
    const bytes = onlyCurrentWorkbookBytes(); // OLD tab gone
    const prepared = await prepareSheet(bytes, {
      tabName: "OLD PULL SHEET",
      fingerprint: "stale-ff",
      acceptedBy: "a@b.com",
      acceptedAt: "2026-07-06T00:00:00.000Z",
    });
    expect(prepared.pullSheetOverrideCleared).toBe(true);
    expect(prepared.pullSheetOverrideApplied ?? null).toBeNull();
    expect(
      prepared.parseResult.archivedPullSheetTabs.some((t) => t.tabName === "OLD PULL SHEET"),
    ).toBe(false);
    const itemsText = (prepared.parseResult.pullSheet ?? [])
      .flatMap((c) => c.items)
      .map((i) => i.item)
      .join(" ");
    expect(itemsText).toContain("Current DI Box");
    expect(
      prepared.parseResult.warnings.some((w) => w.code === "PULL_SHEET_OVERRIDE_CONTENT_CHANGED"),
    ).toBe(true);
  });
});
