import { describe, expect, test, vi } from "vitest";

import type { DriveListedFile } from "@/lib/drive/list";
import type { ParseResult } from "@/lib/parser/types";
import type { LockedShowTx } from "@/lib/sync/lockedShowTx";
import { runManualSyncForShow } from "@/lib/sync/runManualSyncForShow";
import {
  prepareProcessOneFile,
  processOneFile_unlocked,
  type ProcessOneFileDeps,
  type SyncPipelineTx,
} from "@/lib/sync/runScheduledCronSync";

type AlertRow = {
  showId: string;
  code: "DRIVE_FETCH_FAILED" | "PARSE_ERROR_LAST_GOOD" | "SHEET_UNAVAILABLE";
  resolved: boolean;
};

const parseResult = {
  show: { title: "FXAV Spring Tour" },
  crewMembers: [],
  warnings: [],
} as unknown as ParseResult;

function fileMeta(id = "drive-file-1"): DriveListedFile {
  return {
    driveFileId: id,
    name: "Recovery Fixture",
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime: "2026-05-08T12:00:00.000Z",
    parents: ["folder-1"],
    headRevisionId: "head-1",
  };
}

function fakeTx(alerts: AlertRow[] = []) {
  const tx = {
    alerts,
    async queryOne<T>(sql: string, params: unknown[]) {
      if (sql.includes("update public.admin_alerts")) {
        const [showId, codes, currentCode] = params as [string, string[], string | null];
        for (const alert of alerts) {
          if (alert.showId !== showId) continue;
          if (alert.resolved) continue;
          if (!codes.includes(alert.code)) continue;
          if (alert.code === (currentCode ?? "")) continue;
          alert.resolved = true;
        }
        return { resolved: true } as T;
      }
      if (sql.includes("from public.shows where drive_file_id")) return { archived: false } as T;
      if (sql.includes("first_seen_owned")) {
        return { first_seen_owned: false, existing_show_owned: false } as T;
      }
      return { held: true } as T;
    },
    async readShowForPhase1() {
      return {
        showId: "show-1",
        driveFileId: "drive-file-1",
        lastSeenModifiedTime: "2026-05-08T11:00:00.000Z",
        lastSyncStatus: "ok",
        lastSyncError: null,
        priorParseResult: parseResult,
      };
    },
    async readLivePendingSync() {
      return null;
    },
    async deleteLiveDeferral() {},
    async deleteLivePendingIngestion() {},
    async upsertLivePendingIngestion() {},
    async upsertLivePendingSync() {
      return { stagedId: "staged-1" };
    },
    async updateShowParseError() {},
    async updateShowPendingReview() {},
    async deleteWizardPendingSyncsExcept() {},
    async markShowSheetUnavailable() {
      return {
        showId: "show-1",
        lastSeenModifiedTime: "2026-05-08T11:00:00.000Z",
        title: "FXAV Spring Tour",
      };
    },
    async markShowDriveError() {
      return {
        showId: "show-1",
        lastSeenModifiedTime: "2026-05-08T11:00:00.000Z",
        title: "FXAV Spring Tour",
      };
    },
    async insertSyncLog() {},
    async upsertAdminAlert(input: { showId: string | null; code: AlertRow["code"] }) {
      if (input.showId) {
        const existing = alerts.find(
          (alert) => alert.showId === input.showId && alert.code === input.code && !alert.resolved,
        );
        if (!existing) alerts.push({ showId: input.showId, code: input.code, resolved: false });
      }
      return "alert-1";
    },
  } as unknown as LockedShowTx<SyncPipelineTx> & { alerts: AlertRow[] };
  return tx;
}

function deps(overrides: Partial<ProcessOneFileDeps> = {}): ProcessOneFileDeps {
  return {
    perFileProcessor: vi.fn(async () => ({ outcome: "proceed" as const, mode: "cron" as const })),
    captureBinding: vi.fn(async () => ({
      bindingToken: "binding-1",
      modifiedTime: "2026-05-08T12:00:00.000Z",
    })),
    fetchMarkdownAtRevision: vi.fn(async () => "# v4\nShow"),
    parseSheet: vi.fn(() => parseResult as never),
    enrichWithDrivePins: vi.fn(async () => parseResult),
    runPhase1: vi.fn(async () => ({ outcome: "pass" as const })),
    runPhase2: vi.fn(async () => ({ outcome: "applied" as const, showId: "show-1" })),
    ...overrides,
  };
}

async function preparedProcess(syncDeps: ProcessOneFileDeps, file = fileMeta()) {
  return await prepareProcessOneFile("drive-file-1", "cron", file, syncDeps, async () => null);
}

describe("sync-path recovery-resolution for SYNC_PROBLEM_CODES", () => {
  test("cron OK resolves all open sync-problem alerts for the show", async () => {
    const tx = fakeTx([
      { showId: "show-1", code: "DRIVE_FETCH_FAILED", resolved: false },
      { showId: "show-1", code: "PARSE_ERROR_LAST_GOOD", resolved: false },
      { showId: "show-1", code: "SHEET_UNAVAILABLE", resolved: false },
    ]);
    const syncDeps = deps();
    const file = fileMeta();

    await processOneFile_unlocked(tx, "drive-file-1", "cron", file, syncDeps, await preparedProcess(syncDeps, file));

    expect(tx.alerts.every((alert) => alert.resolved)).toBe(true);
  });

  test("cron code-switch resolves old DRIVE_FETCH_FAILED and leaves new PARSE_ERROR_LAST_GOOD open", async () => {
    const tx = fakeTx([{ showId: "show-1", code: "DRIVE_FETCH_FAILED", resolved: false }]);
    const syncDeps = deps({
      runPhase1: vi.fn(async () => ({
        outcome: "hard_fail" as const,
        code: "MI-4_NO_CREW",
        failedCodes: ["MI-4_NO_CREW"],
        message: "Crew missing",
      })),
    });
    const file = fileMeta();

    await processOneFile_unlocked(tx, "drive-file-1", "cron", file, syncDeps, await preparedProcess(syncDeps, file));

    expect(tx.alerts).toEqual([
      { showId: "show-1", code: "DRIVE_FETCH_FAILED", resolved: true },
      { showId: "show-1", code: "PARSE_ERROR_LAST_GOOD", resolved: false },
    ]);
  });

  test("cron same-code drive_error keeps the current DRIVE_FETCH_FAILED alert open", async () => {
    const tx = fakeTx([{ showId: "show-1", code: "DRIVE_FETCH_FAILED", resolved: false }]);
    const syncDeps = deps({
      fetchMarkdownAtRevision: vi.fn(async () => {
        throw new Error("Drive export failed");
      }),
    });
    const file = fileMeta();

    await processOneFile_unlocked(tx, "drive-file-1", "cron", file, syncDeps, await preparedProcess(syncDeps, file));

    expect(tx.alerts).toEqual([{ showId: "show-1", code: "DRIVE_FETCH_FAILED", resolved: false }]);
  });

  test("manual OK resolves all open sync-problem alerts for the show", async () => {
    const tx = fakeTx([{ showId: "show-1", code: "SHEET_UNAVAILABLE", resolved: false }]);

    await runManualSyncForShow("drive-file-1", "manual", {
      withPipelineLock: vi.fn(async (_driveFileId, fn) => fn(tx)),
      getActiveWatchedFolderId: vi.fn(async () => ({ folderId: "folder-1" })),
      fetchDriveFileMetadata: vi.fn(async () => fileMeta()),
      processOneFile: vi.fn(async (_driveFileId, _mode, _fileMeta, processDeps) =>
        processDeps?.withShowLock?.("drive-file-1", async () => ({
          outcome: "applied" as const,
          showId: "show-1",
        })),
      ),
    });

    expect(tx.alerts).toEqual([{ showId: "show-1", code: "SHEET_UNAVAILABLE", resolved: true }]);
  });

  test("manual code-switch resolves old DRIVE_FETCH_FAILED and leaves new PARSE_ERROR_LAST_GOOD open", async () => {
    const tx = fakeTx([{ showId: "show-1", code: "DRIVE_FETCH_FAILED", resolved: false }]);

    await runManualSyncForShow("drive-file-1", "manual", {
      withPipelineLock: vi.fn(async (_driveFileId, fn) => fn(tx)),
      getActiveWatchedFolderId: vi.fn(async () => ({ folderId: "folder-1" })),
      fetchDriveFileMetadata: vi.fn(async () => fileMeta()),
      processOneFile: vi.fn(async (_driveFileId, _mode, _fileMeta, processDeps) =>
        processDeps?.withShowLock?.("drive-file-1", async () => ({
          outcome: "hard_fail" as const,
          code: "MI-4_NO_CREW",
        })),
      ),
    });

    expect(tx.alerts).toEqual([
      { showId: "show-1", code: "DRIVE_FETCH_FAILED", resolved: true },
      { showId: "show-1", code: "PARSE_ERROR_LAST_GOOD", resolved: false },
    ]);
  });
});
