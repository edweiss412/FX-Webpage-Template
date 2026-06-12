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
    if (filter.value === null)
      return row[filter.column] === null || row[filter.column] === undefined;
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

    await expect(
      perFileProcessor("file-1", "cron", fileMeta("2026-05-08T12:00:00.000Z")),
    ).resolves.toEqual({
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

    await expect(
      perFileProcessor("file-1", "manual", fileMeta("2026-05-08T12:00:00.000Z")),
    ).resolves.toEqual({
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

    await expect(
      perFileProcessor("file-1", "cron", fileMeta("2026-05-08T12:00:00.000Z")),
    ).resolves.toEqual({
      outcome: "proceed",
      mode: "cron",
    });
    expect(fake.calls.find((call) => call.table === "deferred_ingestions")?.filters).toContainEqual(
      {
        kind: "is",
        column: "wizard_session_id",
        value: null,
      },
    );
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

    await expect(
      perFileProcessor("file-1", "push", fileMeta("2026-05-08T12:00:00.000Z")),
    ).resolves.toEqual({
      outcome: "skip",
      reason: "deferred_modtime",
    });
  });

  test("advancing past a live defer-until-modified watermark leaves auto-clear for the locked phase", async () => {
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

    await expect(
      perFileProcessor("file-1", "cron", fileMeta("2026-05-08T12:05:00.000Z")),
    ).resolves.toEqual({
      outcome: "proceed",
      mode: "cron",
    });
    expect(fake.db.deferred_ingestions).toEqual([
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
    ]);
    expect(fake.calls).not.toContainEqual(
      expect.objectContaining({ table: "deferred_ingestions", op: "delete" }),
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

    await expect(
      perFileProcessor("file-1", "cron", fileMeta("2026-05-08T12:10:00.000Z")),
    ).resolves.toEqual({
      outcome: "skip",
      reason: "watermark",
    });
    await expect(
      perFileProcessor("file-1", "cron", fileMeta("2026-05-08T12:11:00.000Z")),
    ).resolves.toEqual({
      outcome: "proceed",
      mode: "cron",
    });
    expect(fake.calls.find((call) => call.table === "pending_syncs")?.filters).toContainEqual({
      kind: "is",
      column: "wizard_session_id",
      value: null,
    });
  });

  test("push duplicate watermark emits canonical WEBHOOK_NOOP_ALREADY_SYNCED reason", async () => {
    const fake = createFakeSupabase({
      shows: [
        {
          drive_file_id: "file-1",
          last_sync_status: "ok",
          last_seen_modified_time: "2026-05-08T12:00:00.000Z",
          diagrams: { current: { snapshot_status: "complete" } },
        },
      ],
    });
    supabaseMock.client = fake.client;
    const { perFileProcessor } = await importProcessor();

    await expect(
      perFileProcessor("file-1", "push", fileMeta("2026-05-08T12:00:00.000Z")),
    ).resolves.toEqual({
      outcome: "skip",
      reason: "WEBHOOK_NOOP_ALREADY_SYNCED",
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

    await expect(
      perFileProcessor("file-1", "cron", fileMeta("2026-05-08T12:00:00.000Z")),
    ).resolves.toEqual({
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

    await expect(
      perFileProcessor("file-1", "cron", fileMeta("2026-05-08T12:00:00.000Z")),
    ).resolves.toEqual({
      outcome: "proceed",
      mode: "asset_recovery",
    });
    await expect(
      perFileProcessor("file-1", "cron", fileMeta("2026-05-08T12:01:00.000Z")),
    ).resolves.toEqual({
      outcome: "proceed",
      mode: "cron",
    });
  });

  // §5.2 watermark equality boundary — spec pins `<=` (skip / recovery-route on EQUAL):
  //   "Auto-mode skip rule: mode IN ('cron','push') AND file.modifiedTime <= effective_watermark → skip"
  //   partial_failure: "... AND file.modifiedTime <= effective_watermark → enter mode: 'asset_recovery'"
  //   restage_required: "returns { outcome:'skip', reason:'partial_failure_restage_required' } while
  //   modtime ≤ effective_watermark" (docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md §5.2).
  // Each test pins the boundary at millisecond precision against the GREATEST(last_seen, live
  // staged_modified_time) effective watermark: EXACTLY EQUAL lands in the at-or-before branch;
  // +1ms proceeds as a normal sync. Flipping `<=` to `<` in isAtOrBefore fails every equality
  // assertion below (equal would fall through to `proceed`).
  describe("watermark equality boundary (modifiedTime EXACTLY EQUAL to effective watermark)", () => {
    const showAt = (snapshot_status: string) => ({
      drive_file_id: "file-1",
      last_sync_status: "ok",
      last_seen_modified_time: "2026-05-08T12:00:00.000Z",
      diagrams: { current: { snapshot_status } },
    });
    // Live pending_syncs row is the GREATEST input — equality must be evaluated against the
    // combined max, not shows.last_seen_modified_time alone.
    const livePendingAt = {
      drive_file_id: "file-1",
      wizard_session_id: null,
      staged_modified_time: "2026-05-08T12:10:00.000Z",
    };
    const equalToWatermark = "2026-05-08T12:10:00.000Z";
    const oneMsAfterWatermark = "2026-05-08T12:10:00.001Z";

    test("normal sync: equality skips (cron 'watermark'); +1ms proceeds", async () => {
      const fake = createFakeSupabase({
        shows: [showAt("complete")],
        pending_syncs: [livePendingAt],
      });
      supabaseMock.client = fake.client;
      const { perFileProcessor } = await importProcessor();

      await expect(perFileProcessor("file-1", "cron", fileMeta(equalToWatermark))).resolves.toEqual(
        { outcome: "skip", reason: "watermark" },
      );
      await expect(
        perFileProcessor("file-1", "cron", fileMeta(oneMsAfterWatermark)),
      ).resolves.toEqual({ outcome: "proceed", mode: "cron" });
    });

    test("partial_failure: equality routes to asset_recovery; +1ms proceeds as normal sync", async () => {
      const fake = createFakeSupabase({
        shows: [showAt("partial_failure")],
        pending_syncs: [livePendingAt],
      });
      supabaseMock.client = fake.client;
      const { perFileProcessor } = await importProcessor();

      await expect(perFileProcessor("file-1", "cron", fileMeta(equalToWatermark))).resolves.toEqual(
        { outcome: "proceed", mode: "asset_recovery" },
      );
      await expect(
        perFileProcessor("file-1", "cron", fileMeta(oneMsAfterWatermark)),
      ).resolves.toEqual({ outcome: "proceed", mode: "cron" });
    });

    test("partial_failure_restage_required: equality skips with the terminal reason; +1ms proceeds", async () => {
      const fake = createFakeSupabase({
        shows: [showAt("partial_failure_restage_required")],
        pending_syncs: [livePendingAt],
      });
      supabaseMock.client = fake.client;
      const { perFileProcessor } = await importProcessor();

      await expect(perFileProcessor("file-1", "cron", fileMeta(equalToWatermark))).resolves.toEqual(
        { outcome: "skip", reason: "partial_failure_restage_required" },
      );
      await expect(
        perFileProcessor("file-1", "cron", fileMeta(oneMsAfterWatermark)),
      ).resolves.toEqual({ outcome: "proceed", mode: "cron" });
    });

    test("push equality skips with WEBHOOK_NOOP_ALREADY_SYNCED (same <= rule as cron)", async () => {
      const fake = createFakeSupabase({
        shows: [showAt("complete")],
        pending_syncs: [livePendingAt],
      });
      supabaseMock.client = fake.client;
      const { perFileProcessor } = await importProcessor();

      await expect(perFileProcessor("file-1", "push", fileMeta(equalToWatermark))).resolves.toEqual(
        { outcome: "skip", reason: "WEBHOOK_NOOP_ALREADY_SYNCED" },
      );
      await expect(
        perFileProcessor("file-1", "push", fileMeta(oneMsAfterWatermark)),
      ).resolves.toEqual({ outcome: "proceed", mode: "push" });
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

    await expect(
      perFileProcessor("file-1", "cron", fileMeta("2026-05-08T12:00:00.000Z")),
    ).resolves.toEqual({
      outcome: "skip",
      reason: "partial_failure_restage_required",
    });
    await expect(
      perFileProcessor("file-1", "cron", fileMeta("2026-05-08T12:01:00.000Z")),
    ).resolves.toEqual({
      outcome: "proceed",
      mode: "cron",
    });
  });
});
