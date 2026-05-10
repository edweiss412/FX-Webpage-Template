import { beforeEach, describe, expect, test, vi } from "vitest";
import type { DriveListedFile } from "@/lib/drive/list";

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
      }),
    ).resolves.toEqual({ outcome: "applied", showId: "show-1" });
    await expect(
      runPushSyncForShow("file-1", {
        fileMeta: meta,
        processOneFile,
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
});
