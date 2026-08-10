// BL-CRON-WORKBOOK-FAULT-CODE (spec 2026-08-09-m-wave-2-design §2.3, ratified):
// a corrupt workbook on the cron path reports PARSE_ERROR_LAST_GOOD, keyed on the
// WorkbookSynthesisError type — not SYNC_FILE_FAILED with a DRIVE_FETCH_FAILED
// alert, which told Doug to check his share settings when the truth was that his
// latest edit could not be read and the previous version is still live.
//
// Synthesis happens INSIDE the Drive fetch (`fetchSheetMarkdownAndBytesAtRevision`),
// so the throw lands in the cron path's fetch wrapper (kind: "fetch_failure"), not
// the outer per-file catch. These rows mock at the Drive-BYTES boundary and run the
// REAL synthesis code on corrupt bytes, so the error identity under test is the one
// production produces.
import { describe, expect, test, vi } from "vitest";

import { synthesizeMarkdownFromXlsx } from "@/lib/drive/exportSheetToMarkdown";
import type { DriveListedFile } from "@/lib/drive/list";
import type { LockedShowTx } from "@/lib/sync/lockedShowTx";
import {
  prepareProcessOneFile,
  processOneFile_unlocked,
  type SyncPipelineTx,
} from "@/lib/sync/runScheduledCronSync";
import { premiseHolds } from "@/tests/_shared/premise";

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

/**
 * Corrupt xlsx bytes: a ZIP local-file-header signature followed by garbage, which
 * the REAL reader refuses ("Unsupported ZIP encryption") and the synthesis wrap
 * re-throws as WorkbookSynthesisError. Plain text does NOT work here: SheetJS
 * falls back to reading it as CSV without throwing (probed 2026-08-10).
 */
const CORRUPT_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5, 6, 7, 8])
  .buffer as ArrayBuffer;

function makeTx(overrides: Record<string, unknown> = {}) {
  const updateShowParseError = vi.fn(async () => "show-1");
  const markShowDriveError = vi.fn(async () => ({
    showId: "show-1",
    lastSeenModifiedTime: "2026-05-08T11:00:00.000Z",
    title: "FXAV Spring Tour",
  }));
  const insertSyncLog = vi.fn(async () => undefined);
  const upsertAdminAlert = vi.fn(async () => "alert-1");
  const upsertLivePendingIngestion = vi.fn(async () => undefined);
  const tx = {
    async queryOne<T>(sql: string) {
      if (sql.includes("from public.shows where drive_file_id")) {
        return { archived: false } as T;
      }
      return { held: true } as T;
    },
    async readLivePendingSync() {
      return null;
    },
    async readShowForPhase1() {
      return {
        driveFileId: "drive-file-1",
        lastSeenModifiedTime: "2026-05-08T11:00:00.000Z",
        lastSyncStatus: "ok",
        lastSyncError: null,
        priorParseResult: null,
        priorParseWarningsRaw: null,
        published: true,
        title: "FXAV Spring Tour",
      };
    },
    updateShowParseError,
    markShowDriveError,
    insertSyncLog,
    upsertAdminAlert,
    upsertLivePendingIngestion,
    ...overrides,
  } as unknown as LockedShowTx<SyncPipelineTx>;
  return {
    tx,
    updateShowParseError,
    markShowDriveError,
    insertSyncLog,
    upsertAdminAlert,
    upsertLivePendingIngestion,
  };
}

function synthesisDeps() {
  return {
    perFileProcessor: vi.fn(async () => ({ outcome: "proceed" as const, mode: "cron" as const })),
    captureBinding: vi.fn(async () => ({
      bindingToken: "binding-1",
      modifiedTime: "2026-05-08T12:00:00.000Z",
    })),
    // Drive-bytes boundary mock, REAL synthesis: the export "succeeded" and handed
    // back a corrupt workbook, exactly the production failure shape.
    fetchMarkdownAtRevision: vi.fn(async () => {
      const out = synthesizeMarkdownFromXlsx(CORRUPT_BYTES);
      return out.markdown;
    }),
  };
}

describe("cron workbook-synthesis fault code (BL-CRON-WORKBOOK-FAULT-CODE)", () => {
  test("premise: real synthesis on the corrupt bytes throws a WorkbookSynthesisError", () => {
    let thrown: unknown;
    try {
      synthesizeMarkdownFromXlsx(CORRUPT_BYTES);
    } catch (err) {
      thrown = err;
    }
    premiseHolds(
      "corrupt bytes reach the WorkbookSynthesisError wrap",
      thrown instanceof Error && thrown.name === "WorkbookSynthesisError",
    );
  });

  test("an EXISTING show records PARSE_ERROR_LAST_GOOD with parse-family presentation, last-good untouched", async () => {
    const { tx, updateShowParseError, markShowDriveError, insertSyncLog, upsertAdminAlert } =
      makeTx();
    const file = fileMeta("drive-file-1");
    const deps = synthesisDeps();

    const prepared = await prepareProcessOneFile(
      "drive-file-1",
      "cron",
      file,
      deps,
      async () => null,
    );
    const result = await processOneFile_unlocked(tx, "drive-file-1", "cron", file, deps, prepared);

    // Code selection (the ratified decision): parse-error family, previous version stays live.
    expect(result).toEqual({
      outcome: "parse_error",
      code: "PARSE_ERROR_LAST_GOOD",
      showId: "show-1",
    });
    // Parse-family presentation: shows.last_sync_status='parse_error', NOT 'drive_error'.
    expect(updateShowParseError).toHaveBeenCalledTimes(1);
    expect(markShowDriveError).not.toHaveBeenCalled();
    // The recorded sync_log row carries the ratified code.
    // ONE argument since 2026-08-10: insertSyncLog's explicit show-id parameter was
    // retired, and show_id is resolved from drive_file_id by subselect inside the
    // statement. Whether the RIGHT show is attributed is asserted where it can be
    // observed - tests/db/syncLogAttribution.db.test.ts - not against a spy that could
    // only ever echo back what the caller handed it.
    expect(insertSyncLog).toHaveBeenCalledWith(
      expect.objectContaining({ code: "PARSE_ERROR_LAST_GOOD" }),
    );
    // The admin alert is the parse-family producer, not the Drive one.
    expect(upsertAdminAlert).toHaveBeenCalledWith(
      expect.objectContaining({ showId: "show-1", code: "PARSE_ERROR_LAST_GOOD" }),
    );
    expect(upsertAdminAlert).not.toHaveBeenCalledWith(
      expect.objectContaining({ code: "DRIVE_FETCH_FAILED" }),
    );
  });

  test("negative control: a NON-synthesis fetch throw still classifies via classifySyncFailure (unchanged)", async () => {
    const { tx, updateShowParseError, markShowDriveError, upsertAdminAlert } = makeTx();
    const file = fileMeta("drive-file-1");
    const deps = {
      ...synthesisDeps(),
      fetchMarkdownAtRevision: vi.fn(async () => {
        throw new Error("Drive revision markdown export failed with HTTP 500");
      }),
    };

    const prepared = await prepareProcessOneFile(
      "drive-file-1",
      "cron",
      file,
      deps,
      async () => null,
    );
    const result = await processOneFile_unlocked(tx, "drive-file-1", "cron", file, deps, prepared);

    expect(result).toEqual({ outcome: "parse_error", code: "SYNC_FILE_FAILED", showId: "show-1" });
    expect(markShowDriveError).toHaveBeenCalledTimes(1);
    expect(updateShowParseError).not.toHaveBeenCalled();
    expect(upsertAdminAlert).toHaveBeenCalledWith(
      expect.objectContaining({ code: "DRIVE_FETCH_FAILED" }),
    );
  });

  test("FIRST-SEEN + staged pending row: the early return carves too (review r1 F1)", async () => {
    // The existing-pending early return must not bypass the carve: a first-seen
    // file with a live pending_syncs row and a synthesis fault reports the generic
    // code, never PARSE_ERROR_LAST_GOOD's previous-version promise. No writes on
    // this path (the staged row already represents the file).
    const { tx, upsertLivePendingIngestion, updateShowParseError, markShowDriveError } = makeTx({
      async readLivePendingSync() {
        return { stagedId: "staged-1" };
      },
      async readShowForPhase1() {
        return null;
      },
    });
    const file = fileMeta("drive-file-1");
    const deps = synthesisDeps();

    const prepared = await prepareProcessOneFile(
      "drive-file-1",
      "cron",
      file,
      deps,
      async () => null,
    );
    const result = await processOneFile_unlocked(tx, "drive-file-1", "cron", file, deps, prepared);

    expect(result).toEqual({ outcome: "parse_error", code: "SYNC_FILE_FAILED" });
    expect(upsertLivePendingIngestion).not.toHaveBeenCalled();
    expect(updateShowParseError).not.toHaveBeenCalled();
    expect(markShowDriveError).not.toHaveBeenCalled();
  });

  test("EXISTING show + staged pending row: the early return keeps PARSE_ERROR_LAST_GOOD", async () => {
    // The show exists, so the code's copy is true; the early return stays a
    // no-write return (the staged row already represents the file).
    const { tx, upsertLivePendingIngestion, updateShowParseError } = makeTx({
      async readLivePendingSync() {
        return { stagedId: "staged-1" };
      },
    });
    const file = fileMeta("drive-file-1");
    const deps = synthesisDeps();

    const prepared = await prepareProcessOneFile(
      "drive-file-1",
      "cron",
      file,
      deps,
      async () => null,
    );
    const result = await processOneFile_unlocked(tx, "drive-file-1", "cron", file, deps, prepared);

    expect(result).toEqual({ outcome: "parse_error", code: "PARSE_ERROR_LAST_GOOD" });
    expect(upsertLivePendingIngestion).not.toHaveBeenCalled();
    expect(updateShowParseError).not.toHaveBeenCalled();
  });

  test("FIRST-SEEN carve: no show row means no last-good, so the ingestion row keeps SYNC_FILE_FAILED", async () => {
    // PARSE_ERROR_LAST_GOOD's copy promises "the previous version is still live";
    // a first-seen sheet has no previous version, so that code would be a wrong
    // instruction on the pending_ingestions panel. The carve keeps today's code
    // there, deliberately.
    const { tx, upsertLivePendingIngestion } = makeTx({
      async readShowForPhase1() {
        return null;
      },
    });
    const file = fileMeta("drive-file-1");
    const deps = synthesisDeps();

    const prepared = await prepareProcessOneFile(
      "drive-file-1",
      "cron",
      file,
      deps,
      async () => null,
    );
    const result = await processOneFile_unlocked(tx, "drive-file-1", "cron", file, deps, prepared);

    expect(result).toEqual({ outcome: "parse_error", code: "SYNC_FILE_FAILED" });
    expect(upsertLivePendingIngestion).toHaveBeenCalledWith(
      expect.objectContaining({ lastErrorCode: "SYNC_FILE_FAILED" }),
    );
  });
});
