import { afterEach, describe, expect, test, vi } from "vitest";

import type { DriveListedFile } from "@/lib/drive/list";
import type { ParseResult } from "@/lib/parser/types";
import type { LockedShowTx } from "@/lib/sync/lockedShowTx";
import { setLogSink, resetLogSink } from "@/lib/log";
import type { LogRecord } from "@/lib/log/types";
import {
  prepareProcessOneFile,
  processOneFile_unlocked,
  type ProcessOneFileDeps,
  type SyncPipelineTx,
} from "@/lib/sync/runScheduledCronSync";

function fileMeta(id: string): DriveListedFile {
  return {
    driveFileId: id,
    name: `${id} Sheet`,
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime: "2026-05-08T12:00:00.000Z",
    parents: ["folder-1"],
    headRevisionId: "head-1",
  };
}

// Passthrough enrich: forward whatever ParsedSheet the (guarded) parse produced, unchanged.
const passthroughEnrich = vi.fn(async (parsed: unknown) => parsed as ParseResult);

function baseDeps(overrides: Partial<ProcessOneFileDeps> = {}): ProcessOneFileDeps {
  return {
    perFileProcessor: vi.fn(async () => ({ outcome: "proceed" as const, mode: "cron" as const })),
    captureBinding: vi.fn(async () => ({
      bindingToken: "binding-1",
      modifiedTime: "2026-05-08T12:00:00.000Z",
    })),
    fetchMarkdownAtRevision: vi.fn(async () => "# something the parser will choke on"),
    enrichWithDrivePins: passthroughEnrich,
    ...overrides,
  } as unknown as ProcessOneFileDeps;
}

afterEach(() => {
  resetLogSink();
  vi.clearAllMocks();
});

describe("parseSheet call-site guard (finding #17)", () => {
  test("a throwing parser does NOT crash prepare; synthesizes a fail-closed hardError sheet", async () => {
    // Without the guard this call throws and aborts the file's processing (the finding-#17 bug).
    const deps = baseDeps({
      parseSheet: vi.fn(() => {
        throw new Error("Cannot read properties of undefined (reading 'x')");
      }),
    });
    const prepared = await prepareProcessOneFile(
      "drive-file-1",
      "cron",
      fileMeta("drive-file-1"),
      deps,
      async () => null,
    );
    expect(prepared.kind).toBe("ready");
    if (prepared.kind === "ready") {
      expect(prepared.parseResult.hardErrors).toContainEqual(
        expect.objectContaining({ code: "MI-1_VERSION_DETECTION_FAILED" }),
      );
    }
  });

  test("emits a forensic PARSE_SHEET_THREW log with source and driveFileId", async () => {
    const records: LogRecord[] = [];
    setLogSink((record) => {
      records.push(record);
    });
    const deps = baseDeps({
      parseSheet: vi.fn(() => {
        throw new Error("boom");
      }),
    });
    await prepareProcessOneFile(
      "drive-file-9",
      "cron",
      fileMeta("drive-file-9"),
      deps,
      async () => null,
    );
    const rec = records.find((r) => r.code === "PARSE_SHEET_THREW");
    expect(rec, "a PARSE_SHEET_THREW record must be emitted").toBeDefined();
    expect(rec!.level).toBe("error");
    expect(rec!.source).toBe("sync");
    // driveFileId is the reserved correlation field (LogRecord.driveFileId), not free context.
    expect(rec!.driveFileId).toBe("drive-file-9");
  });

  test("a throwing/rejecting log sink does not break the guard", async () => {
    setLogSink(() => {
      throw new Error("sink is down");
    });
    const deps = baseDeps({
      parseSheet: vi.fn(() => {
        throw new Error("boom");
      }),
    });
    // parsed is synthesized BEFORE the log call and the log rejection is swallowed, so prepare
    // still reaches ready with the fail-closed hardError sheet.
    const prepared = await prepareProcessOneFile(
      "drive-file-2",
      "cron",
      fileMeta("drive-file-2"),
      deps,
      async () => null,
    );
    expect(prepared.kind).toBe("ready");
    if (prepared.kind === "ready") {
      expect(prepared.parseResult.hardErrors).toContainEqual(
        expect.objectContaining({ code: "MI-1_VERSION_DETECTION_FAILED" }),
      );
    }
  });

  test("a pathological throw value (throwing toString) does not break the guard", async () => {
    const hostile = {
      toString() {
        throw new Error("cannot stringify me");
      },
    };
    const deps = baseDeps({
      parseSheet: vi.fn(() => {
        throw hostile; // String(error) would throw; message-extraction try/catch must absorb it
      }),
    });
    const prepared = await prepareProcessOneFile(
      "drive-file-3",
      "cron",
      fileMeta("drive-file-3"),
      deps,
      async () => null,
    );
    expect(prepared.kind).toBe("ready");
    if (prepared.kind === "ready") {
      expect(prepared.parseResult.hardErrors).toContainEqual(
        expect.objectContaining({ code: "MI-1_VERSION_DETECTION_FAILED" }),
      );
    }
  });

  test("existing-show throw path reaches PARSE_ERROR_LAST_GOOD (wiring survives the throw)", async () => {
    // Wiring proof: a throw → PARSE_THREW-bearing prepared → hard_fail branch → alert. The REAL
    // PARSE_THREW→hard_fail decision is proven independently in tests/invariants/mi.test.ts; here
    // runPhase1 is stubbed to the hard_fail it would return, isolating the throw→alert wiring.
    const upsertAdminAlert = vi.fn(async () => "alert-1");
    const priorParseResult = {
      show: { title: "FXAV Spring Tour" },
      warnings: [],
    } as unknown as ParseResult;
    const tx = {
      async queryOne<T>(sql: string) {
        if (sql.includes("from public.shows where drive_file_id")) return { archived: false } as T;
        return { held: true } as T;
      },
      readShowForPhase1: vi.fn(async () => ({
        showId: "show-1",
        driveFileId: "drive-file-1",
        lastSeenModifiedTime: "2026-05-08T11:00:00.000Z",
        lastSyncStatus: "ok",
        lastSyncError: null,
        priorParseResult,
        priorParseWarningsRaw: null,
      })),
      upsertAdminAlert,
    } as unknown as LockedShowTx<SyncPipelineTx>;
    const deps = baseDeps({
      parseSheet: vi.fn(() => {
        throw new Error("boom");
      }),
      runPhase1: vi.fn(async () => ({
        outcome: "hard_fail" as const,
        code: "MI-1_VERSION_DETECTION_FAILED",
        failedCodes: ["MI-1_VERSION_DETECTION_FAILED"],
        message: "Parser error",
        showId: "show-1",
      })),
    });
    const file = fileMeta("drive-file-1");
    const prepared = await prepareProcessOneFile(
      "drive-file-1",
      "cron",
      file,
      deps,
      async () => null,
    );
    expect(prepared.kind).toBe("ready");
    if (prepared.kind === "ready") {
      expect(prepared.parseResult.hardErrors).toContainEqual(
        expect.objectContaining({ code: "MI-1_VERSION_DETECTION_FAILED" }),
      );
    }
    const result = await processOneFile_unlocked(tx, "drive-file-1", "cron", file, deps, prepared);
    expect(result).toMatchObject({ outcome: "hard_fail" });
    expect(upsertAdminAlert).toHaveBeenCalledWith({
      showId: "show-1",
      code: "PARSE_ERROR_LAST_GOOD",
      context: { drive_file_id: "drive-file-1", sheet_name: "FXAV Spring Tour" },
    });
  });

  test("first-seen throw path → hard_fail writes pending_ingestions, no shows row (REAL runPhase1)", async () => {
    // Full first-seen e2e (spec §4.2): throwing parser → guard synthesizes PARSE_THREW → REAL
    // runPhase1 (deps.runPhase1 omitted) → runInvariants(null, ...) hard_fails on the MI-1 hardError,��
    // no existing shows row → upsertLivePendingIngestion. Proves the guard, MI-1 routing,
    // pending-ingestion write, and null showId together — non-tautological (real runPhase1).
    const upsertLivePendingIngestion = vi.fn(async () => "pending-1");
    const updateShowParseError = vi.fn(async () => "show-x"); // must NOT be called (no shows row)
    const tx = {
      async queryOne<T>(sql: string) {
        if (sql.includes("from public.shows where drive_file_id")) return { archived: false } as T;
        return { held: true } as T;
      },
      readShowForPhase1: vi.fn(async () => null), // first-seen: no existing show
      upsertLivePendingIngestion,
      updateShowParseError,
    } as unknown as LockedShowTx<SyncPipelineTx>;
    const deps = baseDeps({
      parseSheet: vi.fn(() => {
        throw new Error("boom");
      }),
      // deps.runPhase1 intentionally omitted → runPhase1_unlocked uses the REAL runPhase1.
    });
    const file = fileMeta("drive-file-new");
    const prepared = await prepareProcessOneFile(
      "drive-file-new",
      "cron",
      file,
      deps,
      async () => null,
    );
    expect(prepared.kind).toBe("ready");
    const result = await processOneFile_unlocked(
      tx,
      "drive-file-new",
      "cron",
      file,
      deps,
      prepared,
    );
    expect(result).toMatchObject({ outcome: "hard_fail", showId: null });
    expect(updateShowParseError).not.toHaveBeenCalled();
    expect(upsertLivePendingIngestion).toHaveBeenCalledTimes(1);
    expect(upsertLivePendingIngestion).toHaveBeenCalledWith(
      expect.objectContaining({
        driveFileId: "drive-file-new",
        lastErrorCode: "MI-1_VERSION_DETECTION_FAILED",
      }),
    );
  });
});
