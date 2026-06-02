import { beforeEach, describe, expect, test, vi } from "vitest";
import type { DriveListedFile } from "@/lib/drive/list";
import type { RunPushSyncForShowDeps } from "@/lib/sync/runPushSyncForShow";

type Row = Record<string, unknown>;

type FakeDb = {
  shows: Row[];
  pending_syncs: Row[];
};

type Filter = {
  kind: "eq" | "is";
  column: string;
  value: unknown;
};

const supabaseMock = vi.hoisted(() => ({
  client: null as unknown,
  create: vi.fn(() => supabaseMock.client),
}));

const syncLogMock = vi.hoisted(() => ({
  writeSyncLog: vi.fn(async () => undefined),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: supabaseMock.create,
}));

vi.mock("@/lib/sync/syncLog", () => ({
  writeSyncLog: syncLogMock.writeSyncLog,
}));

function fileMeta(
  driveFileId = "file-1",
  modifiedTime = "2026-05-08T12:05:00.000Z",
): DriveListedFile {
  return {
    driveFileId,
    name: `${driveFileId} Sheet`,
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime,
    parents: ["folder-1"],
    headRevisionId: "head-1",
  };
}

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every((filter) => {
    if (filter.kind === "eq") return row[filter.column] === filter.value;
    if (filter.value === null) {
      return row[filter.column] === null || row[filter.column] === undefined;
    }
    return row[filter.column] === filter.value;
  });
}

function createFakeSupabase(seed: Partial<FakeDb> = {}) {
  const db: FakeDb = {
    shows: [...(seed.shows ?? [])],
    pending_syncs: [...(seed.pending_syncs ?? [])],
  };
  const calls: Array<{ table: keyof FakeDb; filters: Filter[] }> = [];

  class QueryBuilder {
    private filters: Filter[] = [];

    constructor(private readonly table: keyof FakeDb) {}

    select() {
      return this;
    }

    eq(column: string, value: unknown) {
      this.filters.push({ kind: "eq", column, value });
      return this;
    }

    is(column: string, value: unknown) {
      this.filters.push({ kind: "is", column, value });
      return this;
    }

    async maybeSingle() {
      calls.push({ table: this.table, filters: [...this.filters] });
      const row = db[this.table].find((candidate) => matches(candidate, this.filters)) ?? null;
      return { data: row, error: null };
    }
  }

  return {
    calls,
    db,
    client: {
      from(table: keyof FakeDb) {
        return new QueryBuilder(table);
      },
    },
  };
}

async function importPushSync() {
  vi.resetModules();
  return import("@/lib/sync/runPushSyncForShow");
}

// A fake per-show pipeline lock: provides a tx whose queryOne answers the archived re-read
// (readShowArchived_unlocked → "select archived from public.shows where drive_file_id = $1").
function lockWithArchived(
  archived: boolean,
): NonNullable<RunPushSyncForShowDeps["withPipelineLock"]> {
  return async (_id, fn) =>
    fn({
      async queryOne(sql: string) {
        if (/select archived from public\.shows/i.test(sql)) return { archived } as never;
        throw new Error(`unexpected SQL in lock tx: ${sql}`);
      },
    } as never);
}

describe("runPushSyncForShow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("same-modtime duplicate push no-ops before invoking the locked shared pipeline", async () => {
    const fake = createFakeSupabase({
      shows: [
        {
          drive_file_id: "file-1",
          last_seen_modified_time: "2026-05-08T12:00:00.000Z",
        },
      ],
    });
    supabaseMock.client = fake.client;
    const meta = fileMeta();
    const processOneFile = vi.fn(async () => {
      const show = fake.db.shows[0];
      if (!show) throw new Error("missing show fixture");
      show.last_seen_modified_time = meta.modifiedTime;
      return { outcome: "applied" as const, showId: "show-1" };
    });
    const { runPushSyncForShow } = await importPushSync();

    await expect(
      runPushSyncForShow("file-1", {
        fileMeta: meta,
        processOneFile,
        isShowArchived: async () => false,
        withPipelineLock: lockWithArchived(false),
      }),
    ).resolves.toEqual({ outcome: "applied", showId: "show-1" });
    await expect(
      runPushSyncForShow("file-1", {
        fileMeta: meta,
        processOneFile,
        isShowArchived: async () => false,
        withPipelineLock: lockWithArchived(false),
      }),
    ).resolves.toEqual({ outcome: "skipped", reason: "WEBHOOK_NOOP_ALREADY_SYNCED" });

    expect(processOneFile).toHaveBeenCalledTimes(1);
    expect(syncLogMock.writeSyncLog).toHaveBeenCalledWith({
      driveFileId: "file-1",
      outcome: "skipped",
      code: "WEBHOOK_NOOP_ALREADY_SYNCED",
    });
    expect(fake.calls).toEqual([
      {
        table: "shows",
        filters: [{ kind: "eq", column: "drive_file_id", value: "file-1" }],
      },
      {
        table: "pending_syncs",
        filters: [
          { kind: "eq", column: "drive_file_id", value: "file-1" },
          { kind: "is", column: "wizard_session_id", value: null },
        ],
      },
      {
        table: "shows",
        filters: [{ kind: "eq", column: "drive_file_id", value: "file-1" }],
      },
      {
        table: "pending_syncs",
        filters: [
          { kind: "eq", column: "drive_file_id", value: "file-1" },
          { kind: "is", column: "wizard_session_id", value: null },
        ],
      },
    ]);
  });

  test("R9 DEF-4 TOCTOU: an Archive landing after the preflight (locked re-read=true) skips silently — NO sync_log, NO apply", async () => {
    // Preflight sees archived=false and proceeds; the duplicate-skip branch would log
    // WEBHOOK_NOOP_ALREADY_SYNCED. But the authoritative re-read UNDER the per-show lock sees archived=true
    // (an admin archived the show in the gap), so the push must return ARCHIVED_SKIP_REASON silently and
    // write NO sync_log. Before the fix, the stale preflight let the duplicate-skip log through.
    const fake = createFakeSupabase({
      shows: [{ drive_file_id: "file-1", last_seen_modified_time: "2026-05-08T12:05:00.000Z" }],
    });
    supabaseMock.client = fake.client;
    const meta = fileMeta(); // modifiedTime == watermark → duplicate-skip branch
    const processOneFile = vi.fn();
    const { runPushSyncForShow } = await importPushSync();

    const res = await runPushSyncForShow("file-1", {
      fileMeta: meta,
      processOneFile,
      isShowArchived: async () => false, // preflight: not archived
      withPipelineLock: lockWithArchived(true), // but an Archive committed before the locked re-read
    });

    expect(res).toEqual({ outcome: "skipped", reason: "archived" }); // ARCHIVED_SKIP_REASON
    expect(syncLogMock.writeSyncLog).not.toHaveBeenCalled(); // no misleading duplicate-skip log
    expect(processOneFile).not.toHaveBeenCalled();
  });
});
