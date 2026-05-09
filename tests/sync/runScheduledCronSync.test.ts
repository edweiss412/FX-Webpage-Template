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
  SYNC_INFRA_ERROR,
} from "@/lib/sync/runScheduledCronSync";
import { SyncInfraError } from "@/lib/sync/perFileProcessor";

type PipelineTx = Phase1Tx & Phase2Tx & {
  operations: string[];
  queryOne<T>(sql: string, params: unknown[]): Promise<T>;
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
    async upsertLivePendingIngestion() {
      this.operations.push("upsertLivePendingIngestion");
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
  };
}

function deps(overrides: Partial<ProcessOneFileDeps> = {}) {
  const binding: Phase1Binding = {
    headRevisionId: "head-1",
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
    const withShowLock = vi.fn(async (driveFileId, fn) => {
      expect(driveFileId).toBe("file-1");
      return fn(fakeTx as LockedShowTx<PipelineTx>);
    });
    const syncDeps = deps({ withShowLock });

    const result = await processOneFile("file-1", "cron", fileMeta("file-1"), syncDeps);

    expect(result).toEqual({ outcome: "applied", showId: "show-1" });
    expect(withShowLock).toHaveBeenCalledOnce();
    expect(vi.mocked(syncDeps.runPhase1)).toHaveBeenCalledBefore(vi.mocked(syncDeps.runPhase2));
  });

  test("same revision binding gates parse/enrich/phase1/phase2 and publishes after apply", async () => {
    const fakeTx = tx() as LockedShowTx<PipelineTx>;
    const syncDeps = deps();

    const result = await processOneFile_unlocked(fakeTx, "file-1", "cron", fileMeta("file-1"), syncDeps);

    expect(result).toEqual({ outcome: "applied", showId: "show-1" });
    expect(syncDeps.fetchMarkdownAtRevision).toHaveBeenCalledWith("file-1", "head-1");
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

  test("head revision drift after enrichment emits STAGED_PARSE_REVISION_RACE before Phase 1 writes", async () => {
    const syncDeps = deps({
      captureBinding: vi
        .fn()
        .mockResolvedValueOnce({
          headRevisionId: "head-before",
          modifiedTime: "2026-05-08T12:00:00.000Z",
        })
        .mockResolvedValueOnce({
          headRevisionId: "head-after",
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

  test("missing markdown export link at the bound revision is STAGED_PARSE_REVISION_RACE", async () => {
    const syncDeps = deps({
      fetchMarkdownAtRevision: vi.fn(async () => {
        throw new Error("Drive revision rev-1 for file-1 did not include a markdown export link");
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

  test("404 while fetching the bound markdown export URL is STAGED_PARSE_REVISION_RACE", async () => {
    const syncDeps = deps({
      fetchMarkdownAtRevision: vi.fn(async () => {
        throw new Error("Drive revision markdown export failed with HTTP 404");
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
});

describe("runScheduledCronSync", () => {
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
    expect(result.processed[1]).toMatchObject({ driveFileId: "file-b", result: { outcome: "applied" } });
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
});
