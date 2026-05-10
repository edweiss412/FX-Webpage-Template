import { describe, expect, test, vi } from "vitest";
import type { DriveListedFile } from "@/lib/drive/list";
import type { ParsedSheet, ParseResult } from "@/lib/parser/types";
import type { LockedShowTx } from "@/lib/sync/lockedShowTx";
import type { Phase1Binding, Phase1Tx } from "@/lib/sync/phase1";
import type { Phase2Tx } from "@/lib/sync/phase2";
import {
  processOneFile,
  processOneFile_unlocked,
  type ProcessOneFileDeps,
  runScheduledCronSync,
  STAGED_PARSE_REVISION_RACE,
  STAGED_PARSE_SOURCE_GONE,
  SYNC_INFRA_ERROR,
} from "@/lib/sync/runScheduledCronSync";
import { SyncInfraError } from "@/lib/sync/perFileProcessor";

type PipelineTx = Phase1Tx &
  Phase2Tx & {
    operations: string[];
    shows?: Map<
      string,
      {
        showId: string;
        driveFileId: string;
        lastSeenModifiedTime: string | null;
        lastSyncStatus: string | null;
        lastSyncError: string | null;
      }
    >;
    syncLog?: Array<{
      driveFileId: string | null;
      outcome: string;
      code?: string;
      payload?: Record<string, unknown>;
      showId?: string | null;
    }>;
    pendingIngestions?: Array<{
      driveFileId: string;
      driveFileName: string;
      lastErrorCode: string;
      lastErrorMessage: string;
      lastSeenModifiedTime: string;
    }>;
    alerts?: Array<{ showId: string | null; code: string; context: Record<string, unknown> }>;
    queryOne<T>(sql: string, params: unknown[]): Promise<T>;
    markShowSheetUnavailable(
      driveFileId: string,
      code: string,
    ): Promise<{ showId: string | null; lastSeenModifiedTime: string | null }>;
    markShowDriveError(
      driveFileId: string,
      code: string,
    ): Promise<{ showId: string | null; lastSeenModifiedTime: string | null }>;
    insertSyncLog(
      entry: {
        driveFileId: string | null;
        outcome: string;
        code?: string;
        payload?: Record<string, unknown>;
      },
      showId?: string | null,
    ): Promise<void>;
    upsertAdminAlert(input: {
      showId: string | null;
      code: string;
      context: Record<string, unknown>;
    }): Promise<string | null>;
  };

function fileMeta(id: string, modifiedTime = "2026-05-08T12:00:00.000Z"): DriveListedFile {
  return {
    driveFileId: id,
    name: `${id} Sheet`,
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime,
    parents: ["folder-1"],
    headRevisionId: "head-1",
  };
}

function parsedSheet(): ParsedSheet {
  return {
    show: {
      title: "Show",
      client_label: "Client",
      client_contact: null,
      template_version: "v4",
      venue: null,
      dates: {
        travelIn: "2026-05-07",
        set: "2026-05-08",
        showDays: ["2026-05-09"],
        travelOut: "2026-05-10",
      },
      schedule_phases: {},
      event_details: {},
      agenda_links: [],
      coi_status: null,
      po: null,
      proposal: null,
      invoice: null,
      invoice_notes: null,
    },
    crewMembers: [
      {
        name: "Alice",
        email: "alice@example.com",
        phone: null,
        role: "A1",
        role_flags: ["A1"],
        date_restriction: { kind: "none" },
        stage_restriction: { kind: "none" },
        flight_info: null,
      },
    ],
    hotelReservations: [],
    rooms: [
      {
        kind: "gs",
        name: "General Session",
        dimensions: null,
        floor: null,
        setup: null,
        set_time: null,
        show_time: null,
        strike_time: null,
        audio: null,
        video: null,
        lighting: null,
        scenic: null,
        power: null,
        digital_signage: null,
        other: null,
        notes: null,
      },
    ],
    transportation: null,
    contacts: [],
    pullSheet: null,
    diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
    openingReel: null,
    raw_unrecognized: [],
    warnings: [],
    hardErrors: [],
  };
}

function parseResult(): ParseResult {
  return {
    ...parsedSheet(),
    diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
    openingReel: null,
  };
}

function tx(): PipelineTx {
  return {
    operations: [],
    async queryOne<T>() {
      return { held: true, locked: true } as T;
    },
    async readShowForPhase1() {
      this.operations.push("readShowForPhase1");
      return {
        driveFileId: "file-1",
        lastSeenModifiedTime: "2026-05-08T11:00:00.000Z",
        lastSyncStatus: "ok",
        lastSyncError: null,
        priorParseResult: parseResult(),
      };
    },
    async readLivePendingSync() {
      this.operations.push("readLivePendingSync");
      return null;
    },
    async upsertLivePendingIngestion(row) {
      this.operations.push("upsertLivePendingIngestion");
      this.pendingIngestions?.push({
        driveFileId: row.driveFileId,
        driveFileName: row.driveFileName,
        lastErrorCode: row.lastErrorCode,
        lastErrorMessage: row.lastErrorMessage,
        lastSeenModifiedTime: row.lastSeenModifiedTime,
      });
    },
    async deleteLivePendingIngestion() {
      this.operations.push("deleteLivePendingIngestion");
    },
    async upsertLivePendingSync() {
      this.operations.push("upsertLivePendingSync");
      return { stagedId: "staged-1" };
    },
    async updateShowParseError() {
      this.operations.push("updateShowParseError");
    },
    async updateShowPendingReview() {
      this.operations.push("updateShowPendingReview");
    },
    async deleteWizardPendingSyncsExcept() {
      this.operations.push("deleteWizardPendingSyncsExcept");
    },
    async applyShowSnapshot() {
      this.operations.push("applyShowSnapshot");
      return { outcome: "updated", showId: "show-1", previousCrewNames: [] };
    },
    async deleteCrewMembersNotIn() {
      this.operations.push("deleteCrewMembersNotIn");
    },
    async upsertCrewMembers() {
      this.operations.push("upsertCrewMembers");
    },
    async provisionAddedCrewAuth() {
      this.operations.push("provisionAddedCrewAuth");
    },
    async revokeRemovedCrewAuth() {
      this.operations.push("revokeRemovedCrewAuth");
    },
    async replaceHotelReservations() {
      this.operations.push("replaceHotelReservations");
    },
    async replaceRooms() {
      this.operations.push("replaceRooms");
    },
    async replaceTransportation() {
      this.operations.push("replaceTransportation");
    },
    async replaceContacts() {
      this.operations.push("replaceContacts");
    },
    async upsertShowsInternal() {
      this.operations.push("upsertShowsInternal");
    },
    async markShowSheetUnavailable(driveFileId: string, code: string) {
      this.operations.push(`markShowSheetUnavailable:${driveFileId}`);
      const show = this.shows?.get(driveFileId);
      if (!show) return { showId: null, lastSeenModifiedTime: null };
      show.lastSyncStatus = "sheet_unavailable";
      show.lastSyncError = code;
      return { showId: show.showId, lastSeenModifiedTime: show.lastSeenModifiedTime };
    },
    async markShowDriveError(driveFileId: string, code: string) {
      this.operations.push(`markShowDriveError:${driveFileId}`);
      const show = this.shows?.get(driveFileId);
      if (!show) return { showId: null, lastSeenModifiedTime: null };
      show.lastSyncStatus = "drive_error";
      show.lastSyncError = code;
      return { showId: show.showId, lastSeenModifiedTime: show.lastSeenModifiedTime };
    },
    async insertSyncLog(
      entry: {
        driveFileId: string | null;
        outcome: string;
        code?: string;
        payload?: Record<string, unknown>;
      },
      showId?: string | null,
    ) {
      this.operations.push(`insertSyncLog:${entry.driveFileId ?? "global"}`);
      this.syncLog?.push(showId === undefined ? entry : { ...entry, showId });
    },
    async upsertAdminAlert(input: {
      showId: string | null;
      code: string;
      context: Record<string, unknown>;
    }) {
      this.operations.push(`upsertAdminAlert:${input.code}`);
      this.alerts?.push(input);
      return "alert-1";
    },
  };
}

function deps(overrides: Partial<ProcessOneFileDeps> = {}) {
  const binding: Phase1Binding = {
    bindingToken: "token-1",
    modifiedTime: "2026-05-08T12:00:00.000Z",
  };
  const base = {
    perFileProcessor: vi.fn(async () => ({ outcome: "proceed" as const, mode: "cron" as const })),
    captureBinding: vi.fn(async () => binding),
    fetchMarkdownAtRevision: vi.fn(async () => "# v4\nShow"),
    parseSheet: vi.fn(() => parsedSheet()),
    enrichWithDrivePins: vi.fn(async () => parseResult()),
    runPhase1: vi.fn(async (lockedTx: Phase1Tx) => {
      (lockedTx as PipelineTx).operations.push("runPhase1");
      return { outcome: "pass" as const };
    }),
    runPhase2: vi.fn(async (lockedTx: Phase2Tx) => {
      (lockedTx as PipelineTx).operations.push("runPhase2");
      return { outcome: "applied" as const, showId: "show-1" };
    }),
    logSync: vi.fn(async () => undefined),
    publishShowInvalidation: vi.fn(async () => undefined),
  } satisfies ProcessOneFileDeps;

  return { ...base, ...overrides };
}

describe("processOneFile", () => {
  test("locked wrapper is the only advisory-lock holder and passes a branded tx to the unlocked pipeline", async () => {
    const fakeTx = tx();
    const events: string[] = [];
    const withShowLock = vi.fn(async (driveFileId, fn) => {
      expect(driveFileId).toBe("file-1");
      events.push("lock:start");
      const result = await fn(fakeTx as LockedShowTx<PipelineTx>);
      events.push("lock:commit");
      return result;
    });
    const upsertAdminAlert = vi.fn(async () => {
      events.push("alert:upsert");
      return "alert-1";
    });
    const syncDeps = deps({
      withShowLock,
      upsertAdminAlert,
      runPhase2: vi.fn(async (lockedTx: Phase2Tx) => {
        (lockedTx as PipelineTx).operations.push("runPhase2");
        return {
          outcome: "applied" as const,
          showId: "show-1",
          roleFlagsNotice: {
            showId: "show-1",
            code: "ROLE_FLAGS_NOTICE" as const,
            context: { drive_file_id: "file-1", changes: [] },
          },
        };
      }),
    });

    const result = await processOneFile("file-1", "cron", fileMeta("file-1"), syncDeps);

    expect(result).toEqual({
      outcome: "applied",
      showId: "show-1",
      roleFlagsNotice: {
        showId: "show-1",
        code: "ROLE_FLAGS_NOTICE",
        context: { drive_file_id: "file-1", changes: [] },
      },
    });
    expect(withShowLock).toHaveBeenCalledOnce();
    expect(upsertAdminAlert).toHaveBeenCalledWith({
      showId: "show-1",
      code: "ROLE_FLAGS_NOTICE",
      context: { drive_file_id: "file-1", changes: [] },
    });
    expect(events).toEqual(["lock:start", "lock:commit", "alert:upsert"]);
    expect(vi.mocked(syncDeps.runPhase1)).toHaveBeenCalledBefore(vi.mocked(syncDeps.runPhase2));
  });

  test("same revision binding gates parse/enrich/phase1/phase2 and publishes after apply", async () => {
    const fakeTx = tx() as LockedShowTx<PipelineTx>;
    const syncDeps = deps();

    const result = await processOneFile_unlocked(
      fakeTx,
      "file-1",
      "cron",
      fileMeta("file-1"),
      syncDeps,
    );

    expect(result).toEqual({ outcome: "applied", showId: "show-1" });
    expect(syncDeps.fetchMarkdownAtRevision).toHaveBeenCalledWith("file-1", "token-1");
    expect(vi.mocked(syncDeps.parseSheet)).toHaveBeenCalledAfter(
      vi.mocked(syncDeps.fetchMarkdownAtRevision),
    );
    expect(vi.mocked(syncDeps.enrichWithDrivePins)).toHaveBeenCalledAfter(
      vi.mocked(syncDeps.parseSheet),
    );
    expect(vi.mocked(syncDeps.runPhase1)).toHaveBeenCalledAfter(
      vi.mocked(syncDeps.enrichWithDrivePins),
    );
    expect(vi.mocked(syncDeps.runPhase2)).toHaveBeenCalledAfter(vi.mocked(syncDeps.runPhase1));
    expect(syncDeps.publishShowInvalidation).toHaveBeenCalledWith("show-1");
    expect(syncDeps.logSync).toHaveBeenCalledWith(
      expect.objectContaining({ driveFileId: "file-1", outcome: "applied" }),
    );
  });

  test("Phase 1 MI-8 debounce defer logs a skip without Phase 2 or watermark writes", async () => {
    const fakeTx = tx() as LockedShowTx<PipelineTx>;
    const syncDeps = deps({
      runPhase1: vi.fn(async (lockedTx: Phase1Tx) => {
        (lockedTx as PipelineTx).operations.push("runPhase1");
        return { outcome: "defer" as const, reason: "mi8_modtime_unstable" as const };
      }),
    });

    const result = await processOneFile_unlocked(
      fakeTx,
      "file-1",
      "cron",
      fileMeta("file-1"),
      syncDeps,
    );

    expect(result).toEqual({ outcome: "skipped", reason: "mi8_modtime_unstable" });
    expect(syncDeps.runPhase2).not.toHaveBeenCalled();
    expect(fakeTx.operations).toEqual(["runPhase1"]);
    expect(syncDeps.logSync).toHaveBeenCalledWith({
      driveFileId: "file-1",
      outcome: "skipped",
      code: "mi8_modtime_unstable",
      payload: { kind: "mi8_debounce_skip", reason: "mi8_modtime_unstable" },
    });
  });

  test("post-enrichment spreadsheet binding-token drift emits STAGED_PARSE_REVISION_RACE before Phase 1 writes", async () => {
    const syncDeps = deps({
      captureBinding: vi
        .fn()
        .mockResolvedValueOnce({
          bindingToken: "token-before",
          modifiedTime: "2026-05-08T12:00:00.000Z",
        })
        .mockResolvedValueOnce({
          bindingToken: "token-after",
          modifiedTime: "2026-05-08T12:01:00.000Z",
        }),
    });

    const result = await processOneFile_unlocked(
      tx() as LockedShowTx<PipelineTx>,
      "file-1",
      "cron",
      fileMeta("file-1"),
      syncDeps,
    );

    expect(result).toEqual({ outcome: "revision_race", code: STAGED_PARSE_REVISION_RACE });
    expect(syncDeps.runPhase1).not.toHaveBeenCalled();
    expect(syncDeps.runPhase2).not.toHaveBeenCalled();
  });

  test("post-fetch spreadsheet binding-token mismatch is STAGED_PARSE_REVISION_RACE", async () => {
    const syncDeps = deps({
      fetchMarkdownAtRevision: vi.fn(async () => {
        throw new Error("Drive revision token for file-1 changed during xlsx export");
      }),
    });

    const result = await processOneFile_unlocked(
      tx() as LockedShowTx<PipelineTx>,
      "file-1",
      "cron",
      fileMeta("file-1"),
      syncDeps,
    );

    expect(result).toEqual({ outcome: "revision_race", code: STAGED_PARSE_REVISION_RACE });
    expect(syncDeps.parseSheet).not.toHaveBeenCalled();
  });

  test("missing xlsx export link is STAGED_PARSE_REVISION_RACE", async () => {
    const syncDeps = deps({
      fetchMarkdownAtRevision: vi.fn(async () => {
        throw new Error(
          "Drive revision token head-1 for file-1 did not include an xlsx export link",
        );
      }),
    });

    const result = await processOneFile_unlocked(
      tx() as LockedShowTx<PipelineTx>,
      "file-1",
      "cron",
      fileMeta("file-1"),
      syncDeps,
    );

    expect(result).toEqual({ outcome: "revision_race", code: STAGED_PARSE_REVISION_RACE });
    expect(syncDeps.parseSheet).not.toHaveBeenCalled();
  });

  test("404 while fetching the xlsx export URL is STAGED_PARSE_REVISION_RACE", async () => {
    const syncDeps = deps({
      fetchMarkdownAtRevision: vi.fn(async () => {
        throw new Error("Drive revision xlsx export failed with HTTP 404");
      }),
    });

    const result = await processOneFile_unlocked(
      tx() as LockedShowTx<PipelineTx>,
      "file-1",
      "cron",
      fileMeta("file-1"),
      syncDeps,
    );

    expect(result).toEqual({ outcome: "revision_race", code: STAGED_PARSE_REVISION_RACE });
    expect(syncDeps.parseSheet).not.toHaveBeenCalled();
  });

  test("spreadsheet file gone during xlsx fetch is STAGED_PARSE_SOURCE_GONE, not a race", async () => {
    const gone = new Error("Drive file file-1 not found") as Error & { code: number };
    gone.code = 404;
    const syncDeps = deps({
      fetchMarkdownAtRevision: vi.fn(async () => {
        throw gone;
      }),
    });

    const result = await processOneFile_unlocked(
      tx() as LockedShowTx<PipelineTx>,
      "file-1",
      "cron",
      fileMeta("file-1"),
      syncDeps,
    );

    expect(result).toEqual({ outcome: "source_gone", code: STAGED_PARSE_SOURCE_GONE });
    expect(syncDeps.parseSheet).not.toHaveBeenCalled();
    expect(syncDeps.runPhase1).not.toHaveBeenCalled();
  });

  test("spreadsheet file gone during final binding reverify is STAGED_PARSE_SOURCE_GONE", async () => {
    const gone = new Error("Drive file file-1 not found") as Error & { code: number };
    gone.code = 404;
    const syncDeps = deps({
      captureBinding: vi
        .fn()
        .mockResolvedValueOnce({
          bindingToken: "token-1",
          modifiedTime: "2026-05-08T12:00:00.000Z",
        })
        .mockRejectedValueOnce(gone),
    });

    const result = await processOneFile_unlocked(
      tx() as LockedShowTx<PipelineTx>,
      "file-1",
      "cron",
      fileMeta("file-1"),
      syncDeps,
    );

    expect(result).toEqual({ outcome: "source_gone", code: STAGED_PARSE_SOURCE_GONE });
    expect(syncDeps.runPhase1).not.toHaveBeenCalled();
    expect(syncDeps.runPhase2).not.toHaveBeenCalled();
  });

  test("legacy markdown export failures become locked fetch failures, not spreadsheet revision races", async () => {
    const syncDeps = deps({
      fetchMarkdownAtRevision: vi.fn(async () => {
        throw new Error("Drive revision markdown export failed with HTTP 404");
      }),
    });

    await expect(
      processOneFile_unlocked(
        tx() as LockedShowTx<PipelineTx>,
        "file-1",
        "cron",
        fileMeta("file-1"),
        syncDeps,
      ),
    ).resolves.toEqual({ outcome: "parse_error", code: "SYNC_FILE_FAILED" });
    expect(syncDeps.parseSheet).not.toHaveBeenCalled();
    expect(syncDeps.runPhase1).not.toHaveBeenCalled();
  });

  test("existing show source-gone during fetch is handled inside the lock as sheet_unavailable", async () => {
    const fakeTx = tx() as LockedShowTx<PipelineTx>;
    fakeTx.shows = new Map([
      [
        "file-1",
        {
          showId: "show-1",
          driveFileId: "file-1",
          lastSeenModifiedTime: "2026-05-08T11:00:00.000Z",
          lastSyncStatus: "ok",
          lastSyncError: null,
        },
      ],
    ]);
    fakeTx.syncLog = [];
    fakeTx.alerts = [];
    const gone = new Error("Drive file file-1 not found") as Error & { code: number };
    gone.code = 404;
    const syncDeps = deps({
      fetchMarkdownAtRevision: vi.fn(async () => {
        throw gone;
      }),
    });

    const result = await processOneFile_unlocked(fakeTx, "file-1", "cron", fileMeta("file-1"), syncDeps);

    expect(result).toEqual({ outcome: "source_gone", code: STAGED_PARSE_SOURCE_GONE });
    expect(fakeTx.shows.get("file-1")).toMatchObject({
      lastSeenModifiedTime: "2026-05-08T11:00:00.000Z",
      lastSyncStatus: "sheet_unavailable",
      lastSyncError: STAGED_PARSE_SOURCE_GONE,
    });
    expect(fakeTx.syncLog).toEqual([
      expect.objectContaining({
        showId: "show-1",
        driveFileId: "file-1",
        outcome: "error",
        code: STAGED_PARSE_SOURCE_GONE,
      }),
    ]);
    expect(fakeTx.alerts).toEqual([
      {
        showId: "show-1",
        code: "SHEET_UNAVAILABLE",
        context: {
          drive_file_id: "file-1",
          failure_code: STAGED_PARSE_SOURCE_GONE,
          previous_last_seen_modified_time: "2026-05-08T11:00:00.000Z",
        },
      },
    ]);
  });

  test("first-seen source-gone during fetch writes live pending_ingestions", async () => {
    const fakeTx = tx() as LockedShowTx<PipelineTx>;
    fakeTx.readShowForPhase1 = vi.fn(async () => null);
    fakeTx.pendingIngestions = [];
    const gone = new Error("Drive file file-new not found") as Error & { code: number };
    gone.code = 404;
    const syncDeps = deps({
      fetchMarkdownAtRevision: vi.fn(async () => {
        throw gone;
      }),
    });

    const result = await processOneFile_unlocked(
      fakeTx,
      "file-new",
      "cron",
      fileMeta("file-new", "2026-05-08T12:00:00.000Z"),
      syncDeps,
    );

    expect(result).toEqual({ outcome: "source_gone", code: STAGED_PARSE_SOURCE_GONE });
    expect(fakeTx.pendingIngestions).toEqual([
      {
        driveFileId: "file-new",
        driveFileName: "file-new Sheet",
        lastErrorCode: STAGED_PARSE_SOURCE_GONE,
        lastErrorMessage: "Drive file file-new not found",
        lastSeenModifiedTime: "2026-05-08T12:00:00.000Z",
      },
    ]);
  });

  test("existing show non-gone Drive fetch failure becomes drive_error inside the lock", async () => {
    const fakeTx = tx() as LockedShowTx<PipelineTx>;
    fakeTx.shows = new Map([
      [
        "file-1",
        {
          showId: "show-1",
          driveFileId: "file-1",
          lastSeenModifiedTime: "2026-05-08T11:00:00.000Z",
          lastSyncStatus: "ok",
          lastSyncError: null,
        },
      ],
    ]);
    fakeTx.syncLog = [];
    const syncDeps = deps({
      fetchMarkdownAtRevision: vi.fn(async () => {
        throw new Error("Drive revision markdown export failed with HTTP 500");
      }),
    });

    const result = await processOneFile_unlocked(fakeTx, "file-1", "cron", fileMeta("file-1"), syncDeps);

    expect(result).toEqual({ outcome: "parse_error", code: "SYNC_FILE_FAILED" });
    expect(fakeTx.shows.get("file-1")).toMatchObject({
      lastSeenModifiedTime: "2026-05-08T11:00:00.000Z",
      lastSyncStatus: "drive_error",
      lastSyncError: "SYNC_FILE_FAILED",
    });
    expect(fakeTx.syncLog).toEqual([
      expect.objectContaining({
        showId: "show-1",
        driveFileId: "file-1",
        outcome: "error",
        code: "SYNC_FILE_FAILED",
      }),
    ]);
  });

  test("first-seen non-gone Drive fetch failure writes live pending_ingestions", async () => {
    const fakeTx = tx() as LockedShowTx<PipelineTx>;
    fakeTx.readShowForPhase1 = vi.fn(async () => null);
    fakeTx.pendingIngestions = [];
    const syncDeps = deps({
      fetchMarkdownAtRevision: vi.fn(async () => {
        throw new Error("Drive revision markdown export failed with HTTP 500");
      }),
    });

    const result = await processOneFile_unlocked(fakeTx, "file-new", "cron", fileMeta("file-new"), syncDeps);

    expect(result).toEqual({ outcome: "parse_error", code: "SYNC_FILE_FAILED" });
    expect(fakeTx.pendingIngestions).toEqual([
      expect.objectContaining({
        driveFileId: "file-new",
        driveFileName: "file-new Sheet",
        lastErrorCode: "SYNC_FILE_FAILED",
        lastErrorMessage: "Drive revision markdown export failed with HTTP 500",
      }),
    ]);
  });

  test("live pending_syncs stage wins over fetch-failure state", async () => {
    const fakeTx = tx() as LockedShowTx<PipelineTx>;
    fakeTx.shows = new Map([
      [
        "file-1",
        {
          showId: "show-1",
          driveFileId: "file-1",
          lastSeenModifiedTime: "2026-05-08T11:00:00.000Z",
          lastSyncStatus: "pending_review",
          lastSyncError: null,
        },
      ],
    ]);
    fakeTx.pendingIngestions = [];
    fakeTx.syncLog = [];
    fakeTx.readLivePendingSync = vi.fn(async () => ({
      driveFileId: "file-1",
      wizardSessionId: null,
      baseModifiedTime: "2026-05-08T11:00:00.000Z",
      stagedModifiedTime: "2026-05-08T12:00:00.000Z",
      parseResult: parseResult(),
      triggeredReviewItems: [],
      priorLastSyncStatus: "ok",
      priorLastSyncError: null,
      stagedId: "staged-1",
      sourceKind: "cron",
      warningSummary: "",
    }));
    const syncDeps = deps({
      fetchMarkdownAtRevision: vi.fn(async () => {
        throw new Error("Drive revision markdown export failed with HTTP 500");
      }),
    });

    const result = await processOneFile_unlocked(fakeTx, "file-1", "cron", fileMeta("file-1"), syncDeps);

    expect(result).toEqual({ outcome: "parse_error", code: "SYNC_FILE_FAILED" });
    expect(fakeTx.operations).not.toContain("markShowDriveError:file-1");
    expect(fakeTx.operations).not.toContain("upsertLivePendingIngestion");
    expect(fakeTx.pendingIngestions).toEqual([]);
  });
});

describe("runScheduledCronSync", () => {
  const originalGoogleDriveFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  const originalDriveFolderId = process.env.DRIVE_FOLDER_ID;

  function restoreFolderEnv() {
    if (originalGoogleDriveFolderId === undefined) delete process.env.GOOGLE_DRIVE_FOLDER_ID;
    else process.env.GOOGLE_DRIVE_FOLDER_ID = originalGoogleDriveFolderId;
    if (originalDriveFolderId === undefined) delete process.env.DRIVE_FOLDER_ID;
    else process.env.DRIVE_FOLDER_ID = originalDriveFolderId;
  }

  test("uses app_settings watched_folder_id instead of env folder overrides", async () => {
    process.env.GOOGLE_DRIVE_FOLDER_ID = "env-folder-x";
    delete process.env.DRIVE_FOLDER_ID;
    const listFolder = vi.fn(async () => [fileMeta("file-a")]);
    const processOneFile = vi.fn(async () => ({ outcome: "applied" as const, showId: "show-a" }));
    const getActiveWatchedFolderId = vi.fn(async () => ({ folderId: "settings-folder-y" }));

    try {
      await runScheduledCronSync({
        listFolder,
        processOneFile,
        getActiveWatchedFolderId,
      } as unknown as Parameters<typeof runScheduledCronSync>[0]);
    } finally {
      restoreFolderEnv();
    }

    expect(getActiveWatchedFolderId).toHaveBeenCalledOnce();
    expect(listFolder).toHaveBeenCalledWith("settings-folder-y");
    expect(listFolder).not.toHaveBeenCalledWith("env-folder-x");
  });

  test("no app_settings folder and no first-boot env fallback is a typed cron no-op", async () => {
    delete process.env.GOOGLE_DRIVE_FOLDER_ID;
    delete process.env.DRIVE_FOLDER_ID;
    const logSync = vi.fn(async () => undefined);
    const listFolder = vi.fn(async () => [fileMeta("file-a")]);
    const processOneFile = vi.fn(async () => ({ outcome: "applied" as const, showId: "show-a" }));

    try {
      const result = await runScheduledCronSync({
        listFolder,
        processOneFile,
        logSync,
        getActiveWatchedFolderId: vi.fn(async () => ({ kind: "no_folder_configured" })),
      } as unknown as Parameters<typeof runScheduledCronSync>[0]);

      expect(result).toEqual({
        processed: [],
        summary: { outcome: "skipped", skipReason: "no_folder_configured" },
      });
    } finally {
      restoreFolderEnv();
    }

    expect(listFolder).not.toHaveBeenCalled();
    expect(processOneFile).not.toHaveBeenCalled();
    expect(logSync).toHaveBeenCalledWith({
      driveFileId: null,
      outcome: "skipped",
      code: "no_folder_configured",
      payload: {
        kind: "cron_no_folder_configured",
        skip_reason: "no_folder_configured",
      },
    });
  });

  test("processes every listed Sheet and keeps per-file failures isolated", async () => {
    const processOneFile = vi
      .fn()
      .mockResolvedValueOnce({ outcome: "parse_error", code: "MI-1_VERSION_DETECTION_FAILED" })
      .mockResolvedValueOnce({ outcome: "applied", showId: "show-b" });

    const result = await runScheduledCronSync({
      folderId: "folder-1",
      listFolder: vi.fn(async () => [fileMeta("file-a"), fileMeta("file-b")]),
      processOneFile,
    });

    expect(result.processed).toHaveLength(2);
    expect(processOneFile).toHaveBeenCalledTimes(2);
    expect(result.processed[0]).toMatchObject({ driveFileId: "file-a" });
    expect(result.processed[1]).toMatchObject({
      driveFileId: "file-b",
      result: { outcome: "applied" },
    });
  });

  test("passes the configured sync_log sink into each cron file pipeline", async () => {
    const logSync = vi.fn(async () => undefined);
    const file = fileMeta("file-a");
    const processOneFile = vi.fn(async () => ({ outcome: "applied" as const, showId: "show-a" }));

    await runScheduledCronSync({
      folderId: "folder-1",
      listFolder: vi.fn(async () => [file]),
      processOneFile,
      logSync,
    });

    expect(processOneFile).toHaveBeenCalledWith("file-a", "cron", file, { logSync });
  });

  test("classifies and logs per-file infrastructure failures without flattening to a generic code", async () => {
    const logSync = vi.fn(async () => undefined);
    const processOneFile = vi.fn(async () => {
      throw new SyncInfraError("readShowGateRow", "returned_error", new Error("db offline"));
    });

    const result = await runScheduledCronSync({
      folderId: "folder-1",
      listFolder: vi.fn(async () => [fileMeta("file-a")]),
      processOneFile,
      logSync,
    });

    expect(result.processed).toEqual([
      { driveFileId: "file-a", result: { outcome: "parse_error", code: SYNC_INFRA_ERROR } },
    ]);
    expect(logSync).toHaveBeenCalledWith(
      expect.objectContaining({
        driveFileId: "file-a",
        outcome: "parse_error",
        code: SYNC_INFRA_ERROR,
        payload: expect.objectContaining({
          name: "SyncInfraError",
          operation: "readShowGateRow",
          source: "returned_error",
        }),
      }),
    );
  });

  test("marks live shows missing from the watched folder as sheet_unavailable without advancing watermark", async () => {
    const fakeTx = tx();
    fakeTx.shows = new Map([
      [
        "file-a",
        {
          showId: "show-a",
          driveFileId: "file-a",
          lastSeenModifiedTime: "2026-05-08T11:00:00.000Z",
          lastSyncStatus: "ok",
          lastSyncError: null,
        },
      ],
    ]);
    fakeTx.syncLog = [];
    fakeTx.alerts = [];
    const lockEvents: string[] = [];
    const withShowLock = vi.fn(async (driveFileId, fn) => {
      lockEvents.push(`lock:${driveFileId}`);
      return await fn(fakeTx as LockedShowTx<PipelineTx>);
    });
    const processOneFile = vi.fn(async () => ({ outcome: "applied" as const, showId: "show-b" }));

    const result = await runScheduledCronSync({
      folderId: "folder-1",
      listFolder: vi.fn(async () => [fileMeta("file-b")]),
      processOneFile,
      withShowLock,
      listLiveShows: vi.fn(async () => [
        {
          showId: "show-a",
          driveFileId: "file-a",
          lastSeenModifiedTime: "2026-05-08T11:00:00.000Z",
          wizardSessionId: null,
        },
      ]),
    });

    expect(result.processed).toEqual([
      { driveFileId: "file-a", result: { outcome: "source_gone", code: "SHEET_UNAVAILABLE" } },
      { driveFileId: "file-b", result: { outcome: "applied", showId: "show-b" } },
    ]);
    expect(lockEvents).toEqual(["lock:file-a"]);
    expect(fakeTx.shows.get("file-a")).toMatchObject({
      lastSeenModifiedTime: "2026-05-08T11:00:00.000Z",
      lastSyncStatus: "sheet_unavailable",
      lastSyncError: "SHEET_UNAVAILABLE",
    });
    expect(fakeTx.syncLog).toEqual([
      {
        driveFileId: "file-a",
        outcome: "error",
        code: "SHEET_UNAVAILABLE",
        payload: {
          driveFileId: "file-a",
          previousLastSeenModifiedTime: "2026-05-08T11:00:00.000Z",
        },
        showId: "show-a",
      },
    ]);
    expect(fakeTx.alerts).toEqual([
      {
        showId: "show-a",
        code: "SHEET_UNAVAILABLE",
        context: {
          drive_file_id: "file-a",
          previous_last_seen_modified_time: "2026-05-08T11:00:00.000Z",
        },
      },
    ]);
  });

  test("folder diff ignores wizard-scoped rows when detecting removed live sheets", async () => {
    const fakeTx = tx();
    fakeTx.shows = new Map();
    fakeTx.syncLog = [];
    fakeTx.alerts = [];
    const withShowLock = vi.fn(async (driveFileId, fn) => {
      return await fn(fakeTx as LockedShowTx<PipelineTx>);
    });

    await runScheduledCronSync({
      folderId: "folder-1",
      listFolder: vi.fn(async () => [fileMeta("file-b")]),
      processOneFile: vi.fn(async () => ({ outcome: "applied" as const, showId: "show-b" })),
      withShowLock,
      listLiveShows: vi.fn(async () => [
        {
          showId: "wizard-show",
          driveFileId: "wizard-file",
          lastSeenModifiedTime: "2026-05-08T10:00:00.000Z",
          wizardSessionId: "11111111-1111-4111-8111-111111111111",
        },
      ]),
    });

    expect(withShowLock).not.toHaveBeenCalledWith(
      "wizard-file",
      expect.any(Function),
      expect.anything(),
    );
    expect(fakeTx.operations).not.toContain("markShowSheetUnavailable:wizard-file");
    expect(fakeTx.syncLog).toEqual([]);
    expect(fakeTx.alerts).toEqual([]);
  });
});
