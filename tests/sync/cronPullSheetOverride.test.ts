import { describe, expect, it } from "vitest";
import { synthesizeMarkdownFromXlsx } from "@/lib/drive/exportSheetToMarkdown";
import { parseSheet as realParseSheet } from "@/lib/parser";
import type { DriveListedFile } from "@/lib/drive/list";
import type { ParseResult, ParsedSheet } from "@/lib/parser/types";
import type { PullSheetOverride } from "@/lib/sync/pullSheetOverride";
import {
  prepareProcessOneFile,
  processOneFile_unlocked,
  type ProcessOneFileDeps,
  type SyncPipelineTx,
} from "@/lib/sync/runScheduledCronSync";
import type { LockedShowTx } from "@/lib/sync/lockedShowTx";
import { buildXlsx } from "../helpers/buildXlsx";

/**
 * §5.2/§5.3 cron override reconcile (GAP 1), pre-lock stage. Proves the SHARED discard-and-rerun
 * fires on the durable-override cron path: content drift / vanished tab → applied=null, override
 * cleared, changed OLD gear absent, current non-OLD gear preserved.
 */

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

const FILE: DriveListedFile = {
  driveFileId: "cron-drive-1",
  name: "II - Live Show",
  mimeType: "application/vnd.google-apps.spreadsheet",
  modifiedTime: "2026-06-01T00:00:00.000Z",
  parents: ["folder"],
};
const TOKEN = "tok-1";

function oldFingerprint(bytes: ArrayBuffer): string {
  const t = synthesizeMarkdownFromXlsx(bytes).archivedPullSheetTabs.find(
    (x) => x.tabName === "OLD PULL SHEET",
  );
  if (!t) throw new Error("no OLD tab");
  return t.fingerprint;
}

function deps(bytes: ArrayBuffer, override: PullSheetOverride | null): ProcessOneFileDeps {
  const binding = { bindingToken: TOKEN, modifiedTime: FILE.modifiedTime };
  return {
    perFileProcessor: async () => ({ outcome: "proceed" as const, mode: "cron" as const }),
    captureBinding: async () => binding,
    readShowPullSheetOverride: async () => override,
    // Mirror the real path: the export threads includePullSheetFromTab when an override is set.
    fetchMarkdownAtRevision: async () =>
      synthesizeMarkdownFromXlsx(
        bytes,
        override ? { includePullSheetFromTab: override.tabName } : {},
      ).markdown,
    fetchXlsxBytes: async () => bytes,
    parseSheet: (md: string, name?: string) => realParseSheet(md, name),
    enrichWithDrivePins: async (parsed: ParsedSheet) =>
      ({
        ...parsed,
        diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
        openingReel: null,
      }) as unknown as ParseResult,
  };
}

async function prepareReady(bytes: ArrayBuffer, override: PullSheetOverride | null) {
  const prepared = await prepareProcessOneFile("cron-drive-1", "cron", FILE, deps(bytes, override));
  if (prepared.kind !== "ready") throw new Error(`expected ready, got ${prepared.kind}`);
  return prepared;
}

const mixedBytes = () =>
  buildXlsx([
    { name: "PULL SHEET", grid: currentRegion },
    { name: "OLD PULL SHEET", grid: oldRegion },
  ]);
const oldOnlyBytes = () => buildXlsx([{ name: "OLD PULL SHEET", grid: oldRegion }]);
const currentOnlyBytes = () => buildXlsx([{ name: "PULL SHEET", grid: currentRegion }]);

const mkOverride = (fingerprint: string): PullSheetOverride => ({
  tabName: "OLD PULL SHEET",
  fingerprint,
  acceptedBy: "doug@fxav.com",
  acceptedAt: "2026-06-01T00:00:00.000Z",
});

describe("cron pull-sheet override reconcile (pre-lock)", () => {
  it("no override: archivedPullSheetTabs surfaced, applied=null, not cleared", async () => {
    const prepared = await prepareReady(oldOnlyBytes(), null);
    expect(prepared.parseResult.archivedPullSheetTabs).toEqual([
      expect.objectContaining({ tabName: "OLD PULL SHEET", included: false }),
    ]);
    expect(prepared.pullSheetOverrideApplied ?? null).toBeNull();
    expect(prepared.pullSheetOverrideCleared ?? false).toBe(false);
  });

  it("match: OLD gear included, applied=snapshot, not cleared", async () => {
    const bytes = oldOnlyBytes();
    const fp = oldFingerprint(bytes);
    const prepared = await prepareReady(bytes, mkOverride(fp));
    const items = (prepared.parseResult.pullSheet ?? [])
      .flatMap((c) => c.items)
      .map((i) => i.item)
      .join(" ");
    expect(items).toContain("Shure SM58");
    expect(prepared.pullSheetOverrideApplied).toEqual({
      tabName: "OLD PULL SHEET",
      fingerprint: fp,
    });
    expect(prepared.pullSheetOverrideCleared ?? false).toBe(false);
  });

  it("content_changed: override cleared, applied=null, changed OLD gear absent, current gear preserved, S4 flag", async () => {
    const bytes = mixedBytes();
    const prepared = await prepareReady(bytes, mkOverride("stale-ff"));
    expect(prepared.pullSheetOverrideCleared).toBe(true);
    expect(prepared.pullSheetOverrideClearedTab).toBe("OLD PULL SHEET");
    expect(prepared.pullSheetOverrideApplied ?? null).toBeNull();
    const items = (prepared.parseResult.pullSheet ?? [])
      .flatMap((c) => c.items)
      .map((i) => i.item)
      .join(" ");
    expect(items).toContain("Current DI Box"); // current gear preserved
    expect(items).not.toContain("Shure SM58"); // changed OLD gear absent (I5)
    const tab = prepared.parseResult.archivedPullSheetTabs.find(
      (t) => t.tabName === "OLD PULL SHEET",
    );
    expect(tab?.contentChangedSinceAccept).toBe(true);
    expect(
      prepared.parseResult.warnings.some((w) => w.code === "PULL_SHEET_OVERRIDE_CONTENT_CHANGED"),
    ).toBe(true);
  });

  it("tab_missing: override cleared, applied=null, no OLD offer, current gear preserved", async () => {
    const bytes = currentOnlyBytes(); // OLD tab gone
    const prepared = await prepareReady(bytes, mkOverride("stale-ff"));
    expect(prepared.pullSheetOverrideCleared).toBe(true);
    expect(prepared.pullSheetOverrideApplied ?? null).toBeNull();
    expect(
      prepared.parseResult.archivedPullSheetTabs.some((t) => t.tabName === "OLD PULL SHEET"),
    ).toBe(false);
    const items = (prepared.parseResult.pullSheet ?? [])
      .flatMap((c) => c.items)
      .map((i) => i.item)
      .join(" ");
    expect(items).toContain("Current DI Box");
  });
});

/**
 * §5.7/I5a locked-snapshot protocol on the cron apply path. prepareProcessOneFile reads
 * shows.pull_sheet_override + parses BEFORE the per-show lock; a concurrent finalize propagation can
 * change the durable override in the TOCTOU window. processOneFile_unlocked re-reads it under the
 * lock and REFUSES (skipped, no apply/clear) when it no longer matches the pre-lock snapshot.
 */
describe("cron pull-sheet override locked-snapshot protocol (§5.7)", () => {
  function lockedTx(underLockOverride: PullSheetOverride | null, seen: string[]) {
    return {
      async queryOne<T>(sql: string) {
        seen.push(sql);
        if (/pg_locks/i.test(sql)) return { held: true } as T;
        if (/select archived from public\.shows/i.test(sql)) return { archived: false } as T;
        if (/select pull_sheet_override from public\.shows/i.test(sql))
          return { pull_sheet_override: underLockOverride } as T;
        throw new Error(`unexpected SQL past the §5.7 guard: ${sql}`);
      },
    } as unknown as LockedShowTx<SyncPipelineTx>;
  }

  it("durable override CLEARED under the lock after a matching pre-lock parse => refuse-and-retry (skipped, no apply)", async () => {
    const bytes = oldOnlyBytes();
    const prepared = await prepareReady(bytes, mkOverride(oldFingerprint(bytes))); // match => ready, snapshot carried
    const seen: string[] = [];
    const result = await processOneFile_unlocked(
      lockedTx(null, seen), // concurrently cleared under the lock (null != {tabName,fingerprint})
      "cron-drive-1",
      "cron",
      FILE,
      {},
      prepared,
    );
    expect(result).toEqual({
      outcome: "skipped",
      reason: "pull_sheet_override_changed_under_lock",
    });
    // proves the guard actually re-read the durable override before refusing
    expect(seen.some((s) => /select pull_sheet_override from public\.shows/i.test(s))).toBe(true);
  });

  it("durable override CHANGED to a different fingerprint under the lock => refuse-and-retry", async () => {
    const bytes = oldOnlyBytes();
    const prepared = await prepareReady(bytes, mkOverride(oldFingerprint(bytes)));
    const seen: string[] = [];
    const result = await processOneFile_unlocked(
      lockedTx(mkOverride("different-fingerprint"), seen),
      "cron-drive-1",
      "cron",
      FILE,
      {},
      prepared,
    );
    expect(result).toEqual({
      outcome: "skipped",
      reason: "pull_sheet_override_changed_under_lock",
    });
  });
});
