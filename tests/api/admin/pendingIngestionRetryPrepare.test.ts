/**
 * Spec §3.1 (docs/superpowers/specs/observability/2026-08-14-sync-observability-gaps-design.md):
 * the live pending-ingestion retry route prepares its own `PreparedProcessOneFile` inside its held
 * row lock and threads it through the required sixth parameter — and BOTH of its prepare failure
 * paths record a `parse_error` row instead of terminating silently.
 *
 * The defect these pin (`BL-PENDING-RETRY-EXISTING-SHOW-THROWS`) survived because the shipped tests
 * inject `processOneFile_unlocked` itself, so the missing sixth argument was never exercised. Every
 * case here asserts through the route's own seams.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { resetLogSink, setLogSink } from "@/lib/log";
import type { LogRecord } from "@/lib/log/types";
import type {
  LivePendingIngestionRouteDeps,
  LivePendingIngestionRouteTx,
} from "@/app/api/admin/pending-ingestions/[id]/retry/route";
import {
  FirstSeenStagePrepareError,
  handleLivePendingIngestionRetry,
} from "@/app/api/admin/pending-ingestions/[id]/retry/route";
import {
  classifySyncFailure,
  errorPayload,
  type SyncLogEntry,
} from "@/lib/sync/runScheduledCronSync";
import { readyPrepared } from "@/tests/_shared/preparedProcessOneFile";
import { premiseHolds } from "@/tests/_shared/premise";

const ID1 = "55555555-5555-4555-8555-555555555555";
const FILE_ID = "file-1";
const FOLDER = "folder-1";

class FakeLivePendingTx {
  row = {
    id: ID1,
    drive_file_id: FILE_ID,
    wizard_session_id: null,
    last_seen_modified_time: "2026-08-14T12:00:00.000Z",
  };
  showExists = false;

  async queryOne<T>(sql: string): Promise<T> {
    const normalized = sql.replace(/\s+/g, " ").trim();
    if (/pg_locks/i.test(normalized)) return { held: true } as T;
    if (normalized.startsWith("select id, drive_file_id")) return this.row as T;
    if (normalized.startsWith("select exists")) return { exists: this.showExists } as T;
    if (normalized.startsWith("select archived from public.shows")) return { archived: false } as T;
    if (normalized.startsWith("select watched_folder_id")) {
      return { watched_folder_id: FOLDER } as T;
    }
    if (normalized.startsWith("select slug")) return { slug: "show-slug" } as T;
    throw new Error(`Unhandled live pending SQL: ${normalized}`);
  }
}

function metadataFixture() {
  return {
    driveFileId: FILE_ID,
    name: `${FILE_ID}.xlsx`,
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime: "2026-08-14T12:00:00.000Z",
    parents: [FOLDER],
  };
}

function deps(
  tx: FakeLivePendingTx,
  overrides: Partial<LivePendingIngestionRouteDeps> = {},
): LivePendingIngestionRouteDeps {
  return {
    requireAdminIdentity: vi.fn(async () => ({ email: "doug@example.com" })),
    readDriveFileIdForPendingIngestion: vi.fn(async () => tx.row.drive_file_id),
    withRowTryLock: vi.fn(async (_driveFileId, fn) =>
      fn(tx as unknown as LivePendingIngestionRouteTx),
    ),
    fetchDriveFileMetadata: vi.fn(async () => metadataFixture()),
    readFinalizeOwnershipGuardUnlocked: vi.fn(async () => false),
    // Every case injects this: without it the route would run REAL preparation (Drive I/O) ahead
    // of the runner double (spec §5 census class d).
    prepareProcessOneFile: vi.fn(async () => readyPrepared()),
    runManualSyncForShowUnlocked: vi.fn(async () => ({
      outcome: "applied" as const,
      showId: "show-1",
      parseWarnings: [],
      appliedRoleMappings: [],
    })) as unknown as NonNullable<LivePendingIngestionRouteDeps["runManualSyncForShowUnlocked"]>,
    logSyncSink: vi.fn(async () => {}) as unknown as NonNullable<
      LivePendingIngestionRouteDeps["logSyncSink"]
    >,
    ...overrides,
  } as LivePendingIngestionRouteDeps;
}

const req = () => new Request("http://x", { method: "POST" });
const context = { params: Promise.resolve({ id: ID1 }) };

function capture(): LogRecord[] {
  const records: LogRecord[] = [];
  setLogSink((record) => {
    records.push(record);
  });
  return records;
}

afterEach(() => resetLogSink());

describe("pending-ingestion retry: existing-show prepare (spec §3.1, AC-1/AC-3)", () => {
  test("prepares in-route and forwards the prepared value as the sixth argument", async () => {
    const tx = new FakeLivePendingTx();
    tx.showExists = true;
    const prepared = readyPrepared();
    const prepareProcessOneFile = vi.fn(async () => prepared);
    const runManualSyncForShowUnlocked = vi.fn(async () => ({
      outcome: "applied" as const,
      showId: "show-1",
      parseWarnings: [],
      appliedRoleMappings: [],
    }));

    const response = await handleLivePendingIngestionRetry(
      req(),
      context,
      deps(tx, {
        prepareProcessOneFile: prepareProcessOneFile as never,
        runManualSyncForShowUnlocked: runManualSyncForShowUnlocked as never,
      }),
    );

    premiseHolds(
      "the existing-show branch is the one under test",
      tx.showExists && response.status === 200,
    );
    expect(prepareProcessOneFile).toHaveBeenCalledWith(
      FILE_ID,
      "manual",
      expect.objectContaining({ driveFileId: FILE_ID }),
      expect.any(Object),
    );
    const call = runManualSyncForShowUnlocked.mock.calls[0] as unknown[];
    expect(call).toHaveLength(6);
    // Identity, not shape: the runner must receive THIS prepared value, unchanged.
    expect(call[5]).toBe(prepared);
  });

  test("a throwing prepare records one parse_error row, keeps the 500, and breadcrumbs", async () => {
    const records = capture();
    const tx = new FakeLivePendingTx();
    tx.showExists = true;
    const thrown = new Error("probe-prepare-explosion");
    const entries: SyncLogEntry[] = [];

    await expect(
      handleLivePendingIngestionRetry(
        req(),
        context,
        deps(tx, {
          prepareProcessOneFile: (async () => {
            throw thrown;
          }) as never,
          logSyncSink: (async (entry: SyncLogEntry) => {
            entries.push(entry);
          }) as never,
        }),
      ),
      // The outer guard rethrows rather than constructing a Response; the framework maps the
      // rejection to the 500 this route already returned.
    ).rejects.toBe(thrown);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      driveFileId: FILE_ID,
      outcome: "parse_error",
      code: classifySyncFailure(thrown),
      // Payload too (tests review R1 F4): the forensic cause is the point of the row.
      payload: errorPayload(thrown),
    });
    expect(records.some((r) => r.code === "PENDING_INGESTION_RETRY_FAILED")).toBe(true);
  });

  test("a sink failure in the existing-show catch still surfaces the ORIGINAL error", async () => {
    // Distinct catch from the first-seen one below (tests review R1 F5): removing this catch's
    // inner sink guard would let the sink error replace the prepare error, and no other case here
    // exercises this surface.
    const records = capture();
    const tx = new FakeLivePendingTx();
    tx.showExists = true;
    const thrown = new Error("probe-prepare-explosion");

    await expect(
      handleLivePendingIngestionRetry(
        req(),
        context,
        deps(tx, {
          prepareProcessOneFile: (async () => {
            throw thrown;
          }) as never,
          logSyncSink: (async () => {
            throw new Error("probe-sink-down");
          }) as never,
        }),
      ),
    ).rejects.toBe(thrown);

    expect(records.filter((r) => r.code === "SYNC_LOG_EMIT_FAILED")).toHaveLength(1);
  });
});

describe("pending-ingestion retry: first-seen prepare failures (spec §3.1, AC-8)", () => {
  test("records the FirstSeenStagePrepareError code while the typed 409 still returns", async () => {
    const tx = new FakeLivePendingTx();
    tx.showExists = false;
    const cause = new Error("probe-staged-parse-failure");
    const entries: SyncLogEntry[] = [];

    const response = await handleLivePendingIngestionRetry(
      req(),
      context,
      deps(tx, {
        prepareFirstSeenStage: (async () => {
          throw new FirstSeenStagePrepareError("STAGED_PARSE_FAILED", cause);
        }) as never,
        logSyncSink: (async (entry: SyncLogEntry) => {
          entries.push(entry);
        }) as never,
      }),
    );

    premiseHolds("the first-seen branch is the one under test", !tx.showExists);
    // The response contract outranks the recording — it is unchanged by this arc.
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ ok: false, code: "STAGED_PARSE_FAILED" });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      driveFileId: FILE_ID,
      outcome: "parse_error",
      code: "STAGED_PARSE_FAILED",
      // The payload carries the CAUSE, not the wrapper (spec §3.1): a FirstSeenStagePrepareError's
      // message is just its code, so recording the wrapper would lose the real failure.
      payload: errorPayload(cause),
    });
  });

  test("a sink failure keeps the typed response and escalates SYNC_LOG_EMIT_FAILED", async () => {
    const records = capture();
    const tx = new FakeLivePendingTx();
    tx.showExists = false;

    const response = await handleLivePendingIngestionRetry(
      req(),
      context,
      deps(tx, {
        prepareFirstSeenStage: (async () => {
          throw new FirstSeenStagePrepareError("DRIVE_FETCH_FAILED", new Error("probe-drive-down"));
        }) as never,
        logSyncSink: (async () => {
          throw new Error("probe-sink-down");
        }) as never,
      }),
    );

    // Fail-open: recording must never turn a typed response into something else.
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ ok: false, code: "DRIVE_FETCH_FAILED" });
    expect(records.filter((r) => r.code === "SYNC_LOG_EMIT_FAILED")).toHaveLength(1);
  });
});
