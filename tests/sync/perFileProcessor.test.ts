import { beforeEach, describe, expect, test, vi } from "vitest";
import type { DriveListedFile } from "@/lib/drive/list";

type Row = Record<string, unknown>;

type FakeDb = {
  shows: Row[];
  pending_syncs: Row[];
  deferred_ingestions: Row[];
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

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: supabaseMock.create,
}));

function fileMeta(modifiedTime: string): DriveListedFile {
  return {
    driveFileId: "file-1",
    name: "Show Sheet",
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime,
    parents: ["folder-1"],
    headRevisionId: "head-1",
  };
}

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every((filter) => {
    if (filter.kind === "eq") return row[filter.column] === filter.value;
    if (filter.value === null) return row[filter.column] === null || row[filter.column] === undefined;
    return row[filter.column] === filter.value;
  });
}

function createFakeSupabase(seed: Partial<FakeDb> = {}) {
  const db: FakeDb = {
    shows: [...(seed.shows ?? [])],
    pending_syncs: [...(seed.pending_syncs ?? [])],
    deferred_ingestions: [...(seed.deferred_ingestions ?? [])],
  };
  const calls: Array<{ table: keyof FakeDb; op: "select" | "delete"; filters: Filter[] }> = [];

  class QueryBuilder {
    private filters: Filter[] = [];
    private op: "select" | "delete" = "select";

    constructor(private readonly table: keyof FakeDb) {}

    select() {
      this.op = "select";
      return this;
    }

    delete() {
      this.op = "delete";
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
      calls.push({ table: this.table, op: this.op, filters: [...this.filters] });
      const row = db[this.table].find((candidate) => matches(candidate, this.filters)) ?? null;
      return { data: row, error: null };
    }

    then(
      resolve: (value: { data: null; error: null }) => void,
      reject?: (reason: unknown) => void,
    ) {
      calls.push({ table: this.table, op: this.op, filters: [...this.filters] });
      if (this.op === "delete") {
        db[this.table] = db[this.table].filter((candidate) => !matches(candidate, this.filters));
      }
      return Promise.resolve({ data: null, error: null }).then(resolve, reject);
    }
  }

  return {
    db,
    calls,
    client: {
      from(table: keyof FakeDb) {
        return new QueryBuilder(table);
      },
    },
  };
}

async function importProcessor() {
  vi.resetModules();
  return import("@/lib/sync/perFileProcessor");
}

describe("perFileProcessor gating phase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("cron skips a live permanent deferral", async () => {
    const fake = createFakeSupabase({
      deferred_ingestions: [
        { drive_file_id: "file-1", wizard_session_id: null, deferred_kind: "permanent_ignore" },
      ],
    });
    supabaseMock.client = fake.client;
    const { perFileProcessor } = await importProcessor();

    await expect(perFileProcessor("file-1", "cron", fileMeta("2026-05-08T12:00:00.000Z"))).resolves.toEqual({
      outcome: "skip",
      reason: "deferred_permanent",
    });
  });

  test("manual and onboarding modes ignore live permanent deferrals", async () => {
    const fake = createFakeSupabase({
      deferred_ingestions: [
        { drive_file_id: "file-1", wizard_session_id: null, deferred_kind: "permanent_ignore" },
      ],
    });
    supabaseMock.client = fake.client;
    const { perFileProcessor } = await importProcessor();

    await expect(perFileProcessor("file-1", "manual", fileMeta("2026-05-08T12:00:00.000Z"))).resolves.toEqual({
      outcome: "proceed",
      mode: "manual",
    });
    await expect(
      perFileProcessor("file-1", "onboarding_scan", fileMeta("2026-05-08T12:00:00.000Z")),
    ).resolves.toEqual({ outcome: "proceed", mode: "onboarding_scan" });
  });

  test("wizard-scoped deferrals never suppress live cron processing", async () => {
    const fake = createFakeSupabase({
      deferred_ingestions: [
        {
          drive_file_id: "file-1",
          wizard_session_id: "11111111-1111-4111-8111-111111111111",
          deferred_kind: "permanent_ignore",
        },
      ],
    });
    supabaseMock.client = fake.client;
    const { perFileProcessor } = await importProcessor();

    await expect(perFileProcessor("file-1", "cron", fileMeta("2026-05-08T12:00:00.000Z"))).resolves.toEqual({
      outcome: "proceed",
      mode: "cron",
    });
    expect(fake.calls.find((call) => call.table === "deferred_ingestions")?.filters).toContainEqual({
      kind: "is",
      column: "wizard_session_id",
      value: null,
    });
  });

  test("defer-until-modified skips until Drive modifiedTime advances past the live deferral watermark", async () => {
    const fake = createFakeSupabase({
      deferred_ingestions: [
        {
          drive_file_id: "file-1",
          wizard_session_id: null,
          deferred_kind: "defer_until_modified",
          deferred_at_modified_time: "2026-05-08T12:00:00.000Z",
        },
      ],
    });
    supabaseMock.client = fake.client;
    const { perFileProcessor } = await importProcessor();

    await expect(perFileProcessor("file-1", "push", fileMeta("2026-05-08T12:00:00.000Z"))).resolves.toEqual({
      outcome: "skip",
      reason: "deferred_modtime",
    });
  });

  test("advancing past a live defer-until-modified watermark deletes only the live deferral", async () => {
    const fake = createFakeSupabase({
      deferred_ingestions: [
        {
          drive_file_id: "file-1",
          wizard_session_id: null,
          deferred_kind: "defer_until_modified",
          deferred_at_modified_time: "2026-05-08T12:00:00.000Z",
        },
        {
          drive_file_id: "file-1",
          wizard_session_id: "11111111-1111-4111-8111-111111111111",
          deferred_kind: "defer_until_modified",
          deferred_at_modified_time: "2026-05-08T12:00:00.000Z",
        },
      ],
    });
    supabaseMock.client = fake.client;
    const { perFileProcessor } = await importProcessor();

    await expect(perFileProcessor("file-1", "cron", fileMeta("2026-05-08T12:05:00.000Z"))).resolves.toEqual({
      outcome: "proceed",
      mode: "cron",
    });
    expect(fake.db.deferred_ingestions).toEqual([
      {
        drive_file_id: "file-1",
        wizard_session_id: "11111111-1111-4111-8111-111111111111",
        deferred_kind: "defer_until_modified",
        deferred_at_modified_time: "2026-05-08T12:00:00.000Z",
      },
    ]);
    expect(fake.calls.find((call) => call.table === "deferred_ingestions" && call.op === "delete")?.filters).toContainEqual(
      { kind: "is", column: "wizard_session_id", value: null },
    );
  });

  test("cron watermark uses greatest of show last_seen and live pending staged_modified_time", async () => {
    const fake = createFakeSupabase({
      shows: [
        {
          drive_file_id: "file-1",
          last_sync_status: "ok",
          last_seen_modified_time: "2026-05-08T12:00:00.000Z",
          diagrams: { current: { snapshot_status: "complete" } },
        },
      ],
      pending_syncs: [
        {
          drive_file_id: "file-1",
          wizard_session_id: null,
          staged_modified_time: "2026-05-08T12:10:00.000Z",
        },
        {
          drive_file_id: "file-1",
          wizard_session_id: "11111111-1111-4111-8111-111111111111",
          staged_modified_time: "2026-05-08T13:00:00.000Z",
        },
      ],
    });
    supabaseMock.client = fake.client;
    const { perFileProcessor } = await importProcessor();

    await expect(perFileProcessor("file-1", "cron", fileMeta("2026-05-08T12:10:00.000Z"))).resolves.toEqual({
      outcome: "skip",
      reason: "watermark",
    });
    await expect(perFileProcessor("file-1", "cron", fileMeta("2026-05-08T12:11:00.000Z"))).resolves.toEqual({
      outcome: "proceed",
      mode: "cron",
    });
    expect(fake.calls.find((call) => call.table === "pending_syncs")?.filters).toContainEqual({
      kind: "is",
      column: "wizard_session_id",
      value: null,
    });
  });

  test("sheet_unavailable recovery proceeds regardless of watermark", async () => {
    const fake = createFakeSupabase({
      shows: [
        {
          drive_file_id: "file-1",
          last_sync_status: "sheet_unavailable",
          last_seen_modified_time: "2026-05-08T12:00:00.000Z",
          diagrams: { current: { snapshot_status: "complete" } },
        },
      ],
    });
    supabaseMock.client = fake.client;
    const { perFileProcessor } = await importProcessor();

    await expect(perFileProcessor("file-1", "cron", fileMeta("2026-05-08T12:00:00.000Z"))).resolves.toEqual({
      outcome: "proceed",
      mode: "recovery",
    });
  });

  test("partial_failure routes unchanged automatic runs to asset_recovery but newer sheet edits to normal sync", async () => {
    const fake = createFakeSupabase({
      shows: [
        {
          drive_file_id: "file-1",
          last_sync_status: "ok",
          last_seen_modified_time: "2026-05-08T12:00:00.000Z",
          diagrams: { current: { snapshot_status: "partial_failure" } },
        },
      ],
    });
    supabaseMock.client = fake.client;
    const { perFileProcessor } = await importProcessor();

    await expect(perFileProcessor("file-1", "cron", fileMeta("2026-05-08T12:00:00.000Z"))).resolves.toEqual({
      outcome: "proceed",
      mode: "asset_recovery",
    });
    await expect(perFileProcessor("file-1", "cron", fileMeta("2026-05-08T12:01:00.000Z"))).resolves.toEqual({
      outcome: "proceed",
      mode: "cron",
    });
  });

  test("partial_failure_restage_required skips unchanged automatic runs but allows newer sheet edits", async () => {
    const fake = createFakeSupabase({
      shows: [
        {
          drive_file_id: "file-1",
          last_sync_status: "ok",
          last_seen_modified_time: "2026-05-08T12:00:00.000Z",
          diagrams: { current: { snapshot_status: "partial_failure_restage_required" } },
        },
      ],
    });
    supabaseMock.client = fake.client;
    const { perFileProcessor } = await importProcessor();

    await expect(perFileProcessor("file-1", "cron", fileMeta("2026-05-08T12:00:00.000Z"))).resolves.toEqual({
      outcome: "skip",
      reason: "partial_failure_restage_required",
    });
    await expect(perFileProcessor("file-1", "cron", fileMeta("2026-05-08T12:01:00.000Z"))).resolves.toEqual({
      outcome: "proceed",
      mode: "cron",
    });
  });
});
