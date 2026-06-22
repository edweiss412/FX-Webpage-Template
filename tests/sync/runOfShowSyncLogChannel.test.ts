import { describe, it, expect, vi } from "vitest";
import {
  emitSuccessfulPhase2Tail,
  makeSyncPipelineTx,
  type ProcessOneFileResult,
  type SyncLogEntry,
} from "@/lib/sync/runScheduledCronSync";
import type { DriveListedFile } from "@/lib/drive/list";

const EMPTIED = {
  severity: "warn" as const,
  code: "AGENDA_DAY_EMPTIED",
  message: "d2 went read-empty",
};

function fileMeta(): DriveListedFile {
  return {
    driveFileId: "file-1",
    name: "S",
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime: "2026-05-08T12:00:00.000Z",
    parents: ["f"],
  };
}
// emitSuccessfulPhase2Tail only calls tx.deleteRevisionRaceCooldowns?(); a no-op stub satisfies the Pick<> param.
const fakeTailTx = { deleteRevisionRaceCooldowns: async () => {} };
// minimal parseResult — the tail forwards it but logSync(result) is the channel under test.
const parseResult = { warnings: [EMPTIED] } as unknown as Parameters<
  typeof emitSuccessfulPhase2Tail
>[0]["parseResult"];

describe("D-7 sync_log channel — AGENDA_DAY_EMPTIED reaches sync_log via emitSuccessfulPhase2Tail (R7)", () => {
  it("the applied-success tail logs an entry whose parseWarnings INCLUDES AGENDA_DAY_EMPTIED", async () => {
    const logSync = vi.fn(async (_entry: SyncLogEntry) => {});
    const result: Extract<ProcessOneFileResult, { outcome: "applied" }> = {
      outcome: "applied",
      showId: "show-1",
      parseWarnings: [EMPTIED],
    };
    await emitSuccessfulPhase2Tail({
      tx: fakeTailTx,
      result,
      deps: { logSync, upsertAdminAlert: vi.fn(async () => null) },
      driveFileId: "file-1",
      fileMeta: fileMeta(),
      parseResult,
    });
    const entry = logSync.mock.calls.at(-1)![0] as SyncLogEntry;
    expect(entry.outcome).toBe("applied");
    expect((entry.parseWarnings ?? []).some((w) => w.code === "AGENDA_DAY_EMPTIED")).toBe(true);
    // RED before impl: the :1750 logSync call passes no warnings → entry.parseWarnings is undefined.
  });
  it("a clean applied tail (no AGENDA_* warnings) logs an entry whose parseWarnings has NO AGENDA_DAY_EMPTIED", async () => {
    const logSync = vi.fn(async (_entry: SyncLogEntry) => {});
    const result: Extract<ProcessOneFileResult, { outcome: "applied" }> = {
      outcome: "applied",
      showId: "show-1",
      parseWarnings: [],
    };
    await emitSuccessfulPhase2Tail({
      tx: fakeTailTx,
      result,
      deps: { logSync, upsertAdminAlert: vi.fn(async () => null) },
      driveFileId: "file-1",
      fileMeta: fileMeta(),
      parseResult: { warnings: [] } as unknown as typeof parseResult,
    });
    const entry = logSync.mock.calls.at(-1)![0] as SyncLogEntry;
    expect((entry.parseWarnings ?? []).some((w) => w.code === "AGENDA_DAY_EMPTIED")).toBe(false);
  });
});

// Mock the snapshot-asset factory (the auto_publish_ready tail path reads it via tx.insertPendingSnapshotUpload).
// Lifted from tests/sync/runManualStageForFirstSeen.test.ts:6-32 — required for the manual path to run end-to-end.
vi.mock("@/lib/sync/defaultSnapshotAssetsForApply", () => ({
  makeSnapshotAssetsForApply: vi.fn(() => async (args: { diagrams: unknown }) => ({
    snapshotRevisionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    runUuid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    tempPrefix: "diagram-snapshots/shows/show-1/_pending/run-1/",
    warnings: [],
    pending: {
      revision_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      snapshot_revision_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      snapshot_status: "complete",
      linkedFolder: (args.diagrams as { linkedFolder: unknown }).linkedFolder,
      embeddedImages: [],
      linkedFolderItems: [],
    },
  })),
}));

describe("R16 — the MANUAL first-seen caller of emitSuccessfulPhase2Tail threads parseWarnings to sync_log (runtime sourcing)", () => {
  // Caller #2 (runManualStageForFirstSeen.ts:113-121). The REAL emitSuccessfulPhase2Tail runs (NOT injected — injecting it
  // would bypass the very `applied.parseWarnings → tail → logSync` wiring under test); we spy ONLY deps.logSync.
  // FakeManualStageTx satisfies assertShowLockHeld (queryOne→{held:true}) + the apply surface. runPhase2 is injected so
  // applyShowSnapshot is never reached; the test isolates the manual caller's applied-result sourcing.
  class FakeManualStageTx {
    held = true;
    async queryOne<T>() {
      return { held: this.held } as T;
    } // assertShowLockHeld reads this
    async upsertAdminAlert() {
      return "alert-1";
    }
    async deleteLivePendingIngestion() {}
    async upsertLivePendingSync() {
      return { stagedId: "staged-forced" };
    }
    async readShowId() {
      return null;
    }
    async insertPendingSnapshotUpload() {}
    async applyDiagramSnapshot() {}
    async applyShowSnapshot() {
      return {
        outcome: "updated" as const,
        showId: "show-1",
        previousCrewNames: [],
        priorRunOfShow: null,
      };
    }
    async deleteCrewMembersNotIn() {}
    async upsertCrewMembers() {}
    async provisionAddedCrewAuth() {}
    async revokeRemovedCrewAuth() {}
    async replaceHotelReservations() {}
    async replaceRooms() {}
    async replaceTransportation() {}
    async replaceContacts() {}
    async upsertShowsInternal() {}
  }
  // Minimal first-seen ParseResult (only fields the path reads).
  const firstSeenParseResult = () => ({
    show: {
      title: "First Seen",
      client_label: "c",
      client_contact: null,
      template_version: "v4",
      venue: null,
      dates: { travelIn: null, set: "2026-05-08", showDays: [], travelOut: null },
      schedule_phases: {},
      event_details: {},
      agenda_links: [],
      coi_status: null,
      po: null,
      proposal: null,
      invoice: null,
      invoice_notes: null,
    },
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
    hardErrors: [],
  });
  const fmeta = () => ({
    driveFileId: "file-1",
    name: "S",
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime: "2026-05-08T12:00:00.000Z",
    parents: ["f"],
  });

  it("a manual first-seen auto_publish_ready apply whose runPhase2 returns AGENDA_DAY_EMPTIED logs it to sync_log", async () => {
    const { runManualStageForFirstSeen } = await import("@/lib/sync/runManualStageForFirstSeen");
    const logSync = vi.fn(async (_entry: SyncLogEntry) => {});
    const result = await runManualStageForFirstSeen(new FakeManualStageTx() as never, "file-1", {
      fileMeta: fmeta() as never,
      parseResult: firstSeenParseResult() as never,
      binding: { bindingToken: "tok-b", modifiedTime: "2026-05-08T12:00:00.000Z" }, // REQUIRED — omitting it throws the precondition (wrong-reason red)
      runPhase1: vi.fn(async () => ({ outcome: "auto_publish_ready" as const })) as never,
      runPhase2: vi.fn(async () => ({
        outcome: "applied" as const,
        showId: "show-1",
        parseWarnings: [EMPTIED],
      })) as never,
      logSync,
      createUnpublishToken: () => "tok-u",
      now: () => new Date("2026-05-08T12:00:00.000Z"),
      upsertAdminAlert: vi.fn(async () => undefined) as never,
    });
    expect((result as { outcome: string }).outcome).toBe("applied");
    const entry = logSync.mock.calls.at(-1)![0] as SyncLogEntry;
    expect((entry.parseWarnings ?? []).some((w) => w.code === "AGENDA_DAY_EMPTIED")).toBe(true);
    // EXPECTED RED (propagation, NOT precondition): with binding/fileMeta/parseResult all supplied the precondition
    //   passes and runPhase1→auto_publish_ready reaches the tail; before impl, the manual `applied` (runManualStageForFirstSeen.ts:113-116)
    //   omits parseWarnings, so the REAL tail's logSync entry has NO AGENDA_DAY_EMPTIED → this assertion fails for the RIGHT reason.
  });
});

describe("D-7 sync_log structural pin — insertSyncLog unions entry.parseWarnings into the persisted $5 JSONB (R7)", () => {
  // insertSyncLog is a METHOD on the concrete PostgresPipelineTx (runScheduledCronSync.ts:794), surfaced only via
  // the UNEXPORTED CronRecoveryTx type (:214-229). makeSyncPipelineTx returns the concrete instance but DECLARES
  // SyncPipelineTx (:124-129), which OMITS insertSyncLog — so a plain pipe.insertSyncLog(...) fails tsc
  // (property-does-not-exist). The method exists at runtime; a test-only local interface narrows it back for the cast.
  // (CronRecoveryTx is not exported, so we re-declare just the surface this pin needs.)
  type SyncLogWriter = {
    insertSyncLog(entry: SyncLogEntry, showId?: string | null): Promise<void>;
  };

  function capturingTx() {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    return {
      tx: {
        unsafe: async (sql: string, params: unknown[] = []) => {
          calls.push({ sql, params });
          return [];
        },
      },
      calls,
    };
  }
  it("insertSyncLog writes entry.parseWarnings into the parse_warnings $5 array", async () => {
    const { tx, calls } = capturingTx();
    const pipe = makeSyncPipelineTx(tx) as unknown as SyncLogWriter; // test-only cast: method exists at runtime, hidden by SyncPipelineTx
    await pipe.insertSyncLog(
      { driveFileId: "file-1", outcome: "applied", parseWarnings: [EMPTIED] },
      "show-1",
    );
    const syncLogCall = calls.find((c) => c.sql.includes("insert into public.sync_log"))!;
    const fifth = syncLogCall.params[4] as Array<{ code?: string }>;
    expect(fifth.some((w) => w.code === "AGENDA_DAY_EMPTIED")).toBe(true);
    // RED before impl: insertSyncLog does NOT union entry.parseWarnings → $5 omits AGENDA_DAY_EMPTIED (the real behavior under test).
  });
  it("insertSyncLog keeps the per-outcome payload row when BOTH payload and parseWarnings are present", async () => {
    const { tx, calls } = capturingTx();
    const pipe = makeSyncPipelineTx(tx) as unknown as SyncLogWriter; // test-only cast (see note above)
    await pipe.insertSyncLog(
      {
        driveFileId: "file-1",
        outcome: "applied",
        payload: { kind: "x" },
        parseWarnings: [EMPTIED],
      },
      "show-1",
    );
    const fifth = calls.find((c) => c.sql.includes("insert into public.sync_log"))!
      .params[4] as Array<Record<string, unknown>>;
    expect(fifth.some((e) => e.kind === "x")).toBe(true); // the payload row survives
    expect(fifth.some((e) => e.code === "AGENDA_DAY_EMPTIED")).toBe(true); // and the warning is unioned
  });
});
