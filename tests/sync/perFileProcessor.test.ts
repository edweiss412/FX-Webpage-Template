import { beforeEach, describe, expect, test, vi } from "vitest";
import type { DriveListedFile } from "@/lib/drive/list";
import { ARCHIVED_SKIP_REASON } from "@/lib/sync/lifecycleGuards";

type Row = Record<string, unknown>;

type FakeDb = {
  shows: Row[];
  pending_syncs: Row[];
  deferred_ingestions: Row[];
  pending_ingestions: Row[];
  app_settings: Row[];
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
    pending_ingestions: [...(seed.pending_ingestions ?? [])],
    // The wizard-ownership gate fail-louds on a missing 'default' singleton, so
    // pre-existing tests (which never seed app_settings) get the no-session
    // default. An explicitly-seeded EMPTY array models the corrupted install.
    app_settings: [...(seed.app_settings ?? [{ id: "default", pending_wizard_session_id: null }])],
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

    limit(_count: number) {
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

  // F5b Task 5.4 — inertness half of the two-half weakened guarantee (spec §7
  // R5-2). The fake honors `.is("wizard_session_id", null)` filtering
  // (matches() above), so this is a faithful pin of the production query, not
  // a tautology.
  test("a wizard-scoped deferral residue row can NEVER suppress live sync (F5 inertness proof)", async () => {
    // Residue shape from the F5 commit window: deferral row with NON-NULL
    // wizard_session_id (the stale session that lost the CAS turnover race).
    const fake = createFakeSupabase({
      deferred_ingestions: [
        {
          drive_file_id: "file-1",
          wizard_session_id: "f5f5f5f5-0001-4001-8001-f5f5f5f5f5f5",
          deferred_kind: "permanent_ignore",
          deferred_at_modified_time: null,
        },
      ],
    });
    supabaseMock.client = fake.client;
    const { perFileProcessor } = await importProcessor();

    // Concrete failure mode: if readLiveDeferral (lib/sync/perFileProcessor.ts)
    // ever drops its `.is("wizard_session_id", null)` filter, the residue
    // matches deferred_kind "permanent_ignore" and this returns
    // { outcome: "skip", reason: "deferred_permanent" } — a live show
    // permanently un-syncable because of wizard debris.
    await expect(
      perFileProcessor("file-1", "cron", fileMeta("2026-06-11T00:00:00.000Z")),
    ).resolves.toEqual({ outcome: "proceed", mode: "cron" });
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

  // Role-vocab convergence-window pin (role-vocab-mapping-convergence spec 2026-07-16 §3.3 /
  // §6.3; staging-overlay spec §3.4). A role_token_mappings edit never advances any sheet's
  // Drive modifiedTime, so an unmodified sheet is watermark-skipped by cron. This feature
  // BOUNDS that window: the drift pre-pass marks affected published shows eligible, and the
  // gate rescues exactly the plain cron watermark skip for a marked file (no live pending
  // review). The window is now "until the next cron tick" for drift-eligible published shows,
  // not "until the next sheet edit or manual sync." The three legs this pins:
  //   (a) cron at-watermark WITHOUT the flag still skips (`watermark`) — the default hold, so
  //       an unmarked/unaffected show is never re-processed for free;
  //   (b) cron at-watermark WITH the flag proceeds and marks the run `driftResync: true` — the
  //       bounded convergence path;
  //   (c) manual mode still bypasses the watermark unconditionally — the deterministic lever.
  // Failure modes caught: someone re-tightens the gate and silently reopens the indefinite
  // drift window (leg b regresses to skip); or breaks the manual bypass that makes downward
  // convergence (revoked grants) reachable at all (leg c).
  test("role-vocab drift window: unchanged modtime → cron skips without flag, proceeds+driftResync with flag, manual always proceeds", async () => {
    const fake = createFakeSupabase({
      shows: [
        {
          drive_file_id: "file-1",
          last_sync_status: "ok",
          last_seen_modified_time: "2026-07-16T12:00:00.000Z",
          diagrams: { current: { snapshot_status: "complete" } },
        },
      ],
    });
    supabaseMock.client = fake.client;
    const { perFileProcessor } = await importProcessor();

    // (a) Publish happened at 12:00; a mapping narrow/delete after it changes NO sheet bytes.
    // Without drift eligibility, cron holds the watermark skip.
    await expect(
      perFileProcessor("file-1", "cron", fileMeta("2026-07-16T12:00:00.000Z")),
    ).resolves.toEqual({ outcome: "skip", reason: "watermark" });
    // (b) Marked drift-eligible → the same at-watermark file rescues into a normal cron run,
    // flagged driftResync so the locked apply relaxes its stale guard.
    await expect(
      perFileProcessor("file-1", "cron", fileMeta("2026-07-16T12:00:00.000Z"), {
        roleVocabDriftEligible: true,
      }),
    ).resolves.toEqual({ outcome: "proceed", mode: "cron", driftResync: true });
    // (c) Manual sync is the deterministic convergence lever: unconditional proceed.
    await expect(
      perFileProcessor("file-1", "manual", fileMeta("2026-07-16T12:00:00.000Z")),
    ).resolves.toEqual({ outcome: "proceed", mode: "manual" });
  });

  describe("role-vocab drift rescue (spec 2026-07-16-role-vocab-mapping-convergence §3.3)", () => {
    const publishedShowAt = (last_seen_modified_time: string) => ({
      drive_file_id: "file-1",
      last_sync_status: "ok",
      last_seen_modified_time,
      diagrams: { current: { snapshot_status: "complete" } },
    });

    test("cron + at-watermark + eligible + no live pending row → proceed with driftResync", async () => {
      const fake = createFakeSupabase({ shows: [publishedShowAt("2026-07-16T12:00:00.000Z")] });
      supabaseMock.client = fake.client;
      const { perFileProcessor } = await importProcessor();

      await expect(
        perFileProcessor("file-1", "cron", fileMeta("2026-07-16T12:00:00.000Z"), {
          roleVocabDriftEligible: true,
        }),
      ).resolves.toEqual({ outcome: "proceed", mode: "cron", driftResync: true });
    });

    // R1 F1: a live pending_syncs row means a staged parse awaits admin review; drift must
    // NEVER mutate live state out from under it. modifiedTime == staged_modified_time so the
    // effective watermark still triggers a skip, and the pendingSync != null guard blocks the
    // rescue.
    test("cron + eligible + live pending row at/after modifiedTime → STILL watermark skip", async () => {
      const fake = createFakeSupabase({
        shows: [publishedShowAt("2026-07-16T11:00:00.000Z")],
        pending_syncs: [
          {
            drive_file_id: "file-1",
            wizard_session_id: null,
            staged_modified_time: "2026-07-16T12:00:00.000Z",
          },
        ],
      });
      supabaseMock.client = fake.client;
      const { perFileProcessor } = await importProcessor();

      await expect(
        perFileProcessor("file-1", "cron", fileMeta("2026-07-16T12:00:00.000Z"), {
          roleVocabDriftEligible: true,
        }),
      ).resolves.toEqual({ outcome: "skip", reason: "watermark" });
    });

    test("eligible flag does NOT override a live permanent deferral", async () => {
      const fake = createFakeSupabase({
        deferred_ingestions: [
          { drive_file_id: "file-1", wizard_session_id: null, deferred_kind: "permanent_ignore" },
        ],
      });
      supabaseMock.client = fake.client;
      const { perFileProcessor } = await importProcessor();

      await expect(
        perFileProcessor("file-1", "cron", fileMeta("2026-07-16T12:00:00.000Z"), {
          roleVocabDriftEligible: true,
        }),
      ).resolves.toEqual({ outcome: "skip", reason: "deferred_permanent" });
    });

    test("eligible flag does NOT override an archived show silent-skip", async () => {
      const fake = createFakeSupabase({
        shows: [{ ...publishedShowAt("2026-07-16T12:00:00.000Z"), archived: true }],
      });
      supabaseMock.client = fake.client;
      const { perFileProcessor } = await importProcessor();

      await expect(
        perFileProcessor("file-1", "cron", fileMeta("2026-07-16T12:00:00.000Z"), {
          roleVocabDriftEligible: true,
        }),
      ).resolves.toEqual({ outcome: "skip", reason: ARCHIVED_SKIP_REASON });
    });

    test("eligible flag does NOT override partial_failure_restage_required", async () => {
      const fake = createFakeSupabase({
        shows: [
          {
            drive_file_id: "file-1",
            last_sync_status: "ok",
            last_seen_modified_time: "2026-07-16T12:00:00.000Z",
            diagrams: { current: { snapshot_status: "partial_failure_restage_required" } },
          },
        ],
      });
      supabaseMock.client = fake.client;
      const { perFileProcessor } = await importProcessor();

      await expect(
        perFileProcessor("file-1", "cron", fileMeta("2026-07-16T12:00:00.000Z"), {
          roleVocabDriftEligible: true,
        }),
      ).resolves.toEqual({ outcome: "skip", reason: "partial_failure_restage_required" });
    });

    // The flag is threaded only on the cron path; push carries it never, but even if it did the
    // rescue is cron-only, so push keeps its canonical duplicate-watermark reason.
    test("push mode + eligible flag ignored → WEBHOOK_NOOP_ALREADY_SYNCED", async () => {
      const fake = createFakeSupabase({ shows: [publishedShowAt("2026-07-16T12:00:00.000Z")] });
      supabaseMock.client = fake.client;
      const { perFileProcessor } = await importProcessor();

      await expect(
        perFileProcessor("file-1", "push", fileMeta("2026-07-16T12:00:00.000Z"), {
          roleVocabDriftEligible: true,
        }),
      ).resolves.toEqual({ outcome: "skip", reason: "WEBHOOK_NOOP_ALREADY_SYNCED" });
    });

    // Above the watermark (a genuine sheet edit), an eligible file proceeds as a normal cron
    // run WITHOUT driftResync — the marker only rides the rescued equal-watermark path.
    test("cron + eligible + modtime past watermark → normal proceed, no driftResync marker", async () => {
      const fake = createFakeSupabase({ shows: [publishedShowAt("2026-07-16T12:00:00.000Z")] });
      supabaseMock.client = fake.client;
      const { perFileProcessor } = await importProcessor();

      await expect(
        perFileProcessor("file-1", "cron", fileMeta("2026-07-16T12:05:00.000Z"), {
          roleVocabDriftEligible: true,
        }),
      ).resolves.toEqual({ outcome: "proceed", mode: "cron" });
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

describe("wizard-ownership skip", () => {
  const SESSION = "11111111-1111-4111-8111-111111111111";
  const OTHER_SESSION = "22222222-2222-4222-8222-222222222222";
  const MODIFIED = "2026-05-08T12:00:00.000Z";
  const settingsWithSession = { id: "default", pending_wizard_session_id: SESSION };

  test("cron skips a file the active wizard session has staged (pending_syncs arm)", async () => {
    const fake = createFakeSupabase({
      app_settings: [settingsWithSession],
      pending_syncs: [{ drive_file_id: "file-1", wizard_session_id: SESSION }],
    });
    supabaseMock.client = fake.client;
    const { perFileProcessor } = await importProcessor();

    await expect(perFileProcessor("file-1", "cron", fileMeta(MODIFIED))).resolves.toEqual({
      outcome: "skip",
      reason: "wizard_owned",
    });
  });

  test("push mode is gated too (pending_syncs arm)", async () => {
    const fake = createFakeSupabase({
      app_settings: [settingsWithSession],
      pending_syncs: [{ drive_file_id: "file-1", wizard_session_id: SESSION }],
    });
    supabaseMock.client = fake.client;
    const { perFileProcessor } = await importProcessor();

    await expect(perFileProcessor("file-1", "push", fileMeta(MODIFIED))).resolves.toEqual({
      outcome: "skip",
      reason: "wizard_owned",
    });
  });

  test("pending_ingestions arm: a wizard hard-fail row owns the file", async () => {
    const fake = createFakeSupabase({
      app_settings: [settingsWithSession],
      pending_ingestions: [{ drive_file_id: "file-1", wizard_session_id: SESSION }],
    });
    supabaseMock.client = fake.client;
    const { perFileProcessor } = await importProcessor();

    await expect(perFileProcessor("file-1", "cron", fileMeta(MODIFIED))).resolves.toEqual({
      outcome: "skip",
      reason: "wizard_owned",
    });
  });

  test("deferred_ingestions arm: a wizard-deferred row owns the file", async () => {
    const fake = createFakeSupabase({
      app_settings: [settingsWithSession],
      deferred_ingestions: [
        {
          drive_file_id: "file-1",
          wizard_session_id: SESSION,
          deferred_kind: "defer_until_modified",
        },
      ],
    });
    supabaseMock.client = fake.client;
    const { perFileProcessor } = await importProcessor();

    await expect(perFileProcessor("file-1", "cron", fileMeta(MODIFIED))).resolves.toEqual({
      outcome: "skip",
      reason: "wizard_owned",
    });
  });

  test("no pending session: proceeds and issues NO ownership probes", async () => {
    const fake = createFakeSupabase({
      app_settings: [{ id: "default", pending_wizard_session_id: null }],
      pending_syncs: [{ drive_file_id: "file-1", wizard_session_id: SESSION }],
    });
    supabaseMock.client = fake.client;
    const { perFileProcessor } = await importProcessor();

    await expect(perFileProcessor("file-1", "cron", fileMeta(MODIFIED))).resolves.toEqual({
      outcome: "proceed",
      mode: "cron",
    });
    const probeCalls = fake.calls.filter((call) =>
      call.filters.some((f) => f.kind === "eq" && f.column === "wizard_session_id"),
    );
    expect(probeCalls).toEqual([]);
  });

  test("rows belonging to a DIFFERENT session do not own the file", async () => {
    const fake = createFakeSupabase({
      app_settings: [settingsWithSession],
      pending_syncs: [{ drive_file_id: "file-1", wizard_session_id: OTHER_SESSION }],
      pending_ingestions: [{ drive_file_id: "file-1", wizard_session_id: OTHER_SESSION }],
      deferred_ingestions: [
        {
          drive_file_id: "file-1",
          wizard_session_id: OTHER_SESSION,
          deferred_kind: "defer_until_modified",
        },
      ],
    });
    supabaseMock.client = fake.client;
    const { perFileProcessor } = await importProcessor();

    await expect(perFileProcessor("file-1", "cron", fileMeta(MODIFIED))).resolves.toEqual({
      outcome: "proceed",
      mode: "cron",
    });
  });

  test("missing app_settings singleton → SyncInfraError (fail-loud, not fail-open)", async () => {
    const fake = createFakeSupabase({ app_settings: [] });
    supabaseMock.client = fake.client;
    const { perFileProcessor, SyncInfraError } = await importProcessor();

    await expect(perFileProcessor("file-1", "cron", fileMeta(MODIFIED))).rejects.toBeInstanceOf(
      SyncInfraError,
    );
  });

  test("ownership beats watermark: an up-to-date show row still yields wizard_owned", async () => {
    const fake = createFakeSupabase({
      app_settings: [settingsWithSession],
      pending_syncs: [{ drive_file_id: "file-1", wizard_session_id: SESSION }],
      shows: [
        {
          drive_file_id: "file-1",
          last_sync_status: "synced",
          last_seen_modified_time: MODIFIED, // watermark would skip: not isAfter
          diagrams: null,
          archived: false,
        },
      ],
    });
    supabaseMock.client = fake.client;
    const { perFileProcessor } = await importProcessor();

    await expect(perFileProcessor("file-1", "cron", fileMeta(MODIFIED))).resolves.toEqual({
      outcome: "skip",
      reason: "wizard_owned",
    });
    // §2.3 ordering: the gate must RETURN before the watermark reads — not
    // read them and override. No shows read; no live-scoped pending_syncs read.
    expect(fake.calls.filter((c) => c.table === "shows")).toEqual([]);
    const liveWatermarkReads = fake.calls.filter(
      (c) =>
        c.table === "pending_syncs" &&
        c.filters.some((f) => f.kind === "is" && f.column === "wizard_session_id"),
    );
    expect(liveWatermarkReads).toEqual([]);
  });

  test("manual and onboarding_scan modes return proceed BEFORE any wizard reads", async () => {
    for (const mode of ["manual", "onboarding_scan"] as const) {
      const fake = createFakeSupabase({
        app_settings: [settingsWithSession],
        pending_syncs: [{ drive_file_id: "file-1", wizard_session_id: SESSION }],
      });
      supabaseMock.client = fake.client;
      const { perFileProcessor } = await importProcessor();

      await expect(perFileProcessor("file-1", mode, fileMeta(MODIFIED))).resolves.toEqual({
        outcome: "proceed",
        mode,
      });
      // §2.2: non-automatic modes return before ANY read — zero queries issued.
      expect(fake.calls).toEqual([]);
    }
  });

  test("live permanent_ignore beats wizard ownership (deferral priority a)", async () => {
    const fake = createFakeSupabase({
      app_settings: [settingsWithSession],
      pending_syncs: [{ drive_file_id: "file-1", wizard_session_id: SESSION }],
      deferred_ingestions: [
        { drive_file_id: "file-1", wizard_session_id: null, deferred_kind: "permanent_ignore" },
      ],
    });
    supabaseMock.client = fake.client;
    const { perFileProcessor } = await importProcessor();

    await expect(perFileProcessor("file-1", "cron", fileMeta(MODIFIED))).resolves.toEqual({
      outcome: "skip",
      reason: "deferred_permanent",
    });
  });

  test("live defer_until_modified (unmodified) beats wizard ownership (deferral priority b)", async () => {
    const fake = createFakeSupabase({
      app_settings: [settingsWithSession],
      pending_syncs: [{ drive_file_id: "file-1", wizard_session_id: SESSION }],
      deferred_ingestions: [
        {
          drive_file_id: "file-1",
          wizard_session_id: null,
          deferred_kind: "defer_until_modified",
          deferred_at_modified_time: MODIFIED, // fileMeta(MODIFIED) is NOT after → deferral holds
        },
      ],
    });
    supabaseMock.client = fake.client;
    const { perFileProcessor } = await importProcessor();

    await expect(perFileProcessor("file-1", "cron", fileMeta(MODIFIED))).resolves.toEqual({
      outcome: "skip",
      reason: "deferred_modtime",
    });
  });

  test("deferral priority holds even on a corrupted install (empty app_settings)", async () => {
    const fake = createFakeSupabase({
      app_settings: [],
      deferred_ingestions: [
        { drive_file_id: "file-1", wizard_session_id: null, deferred_kind: "permanent_ignore" },
      ],
    });
    supabaseMock.client = fake.client;
    const { perFileProcessor } = await importProcessor();

    // Live-deferral short-circuits BEFORE the app_settings read (spec §2.3) —
    // no SyncInfraError despite the missing singleton.
    await expect(perFileProcessor("file-1", "cron", fileMeta(MODIFIED))).resolves.toEqual({
      outcome: "skip",
      reason: "deferred_permanent",
    });
  });

  test("no stale-clock: a 25h-old pending_wizard_session_at still owns (gate reads no timestamp)", async () => {
    const fake = createFakeSupabase({
      app_settings: [
        {
          id: "default",
          pending_wizard_session_id: SESSION,
          // 25h before the file's modifiedTime — irrelevant to the gate by contract.
          pending_wizard_session_at: "2026-05-07T11:00:00.000Z",
        },
      ],
      pending_syncs: [{ drive_file_id: "file-1", wizard_session_id: SESSION }],
    });
    supabaseMock.client = fake.client;
    const { perFileProcessor } = await importProcessor();

    await expect(perFileProcessor("file-1", "cron", fileMeta(MODIFIED))).resolves.toEqual({
      outcome: "skip",
      reason: "wizard_owned",
    });
  });
});

describe("incident-shape integration: cron pipeline honors wizard ownership", () => {
  test("wizard-staged file with no shows row → skipped:wizard_owned, sync_log entry written", async () => {
    const SESSION = "11111111-1111-4111-8111-111111111111";
    const MODIFIED = "2026-05-08T12:00:00.000Z";
    const fake = createFakeSupabase({
      app_settings: [{ id: "default", pending_wizard_session_id: SESSION }],
      pending_syncs: [{ drive_file_id: "file-1", wizard_session_id: SESSION }],
      // no shows row — the validation-incident shape (post-reset first-seen)
    });
    supabaseMock.client = fake.client;
    vi.resetModules();
    const { processOneFile } = await import("@/lib/sync/runScheduledCronSync");

    const logged: unknown[] = [];
    const result = await processOneFile("file-1", "cron", fileMeta(MODIFIED), {
      logSync: async (entry: unknown) => {
        logged.push(entry);
      },
      // Non-archived under-lock re-read (DEF-4 relabel branch not taken).
      withShowLock: (async (_driveFileId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          async queryOne(sql: string) {
            if (/select archived from public\.shows/i.test(sql)) return { archived: false };
            // Non-error skip advances last_checked_at inside the same lock tx (spec 2026-07-16-last-checked-at §4).
            if (/update public\.shows set last_checked_at/i.test(sql)) return { updated: true };
            throw new Error(`unexpected SQL in lock tx: ${sql}`);
          },
        })) as never,
    });

    expect(result).toEqual({ outcome: "skipped", reason: "wizard_owned" });
    // reason → SyncLogEntry.code at the boundary (runScheduledCronSync.ts:2197-2198).
    expect(logged).toEqual([{ driveFileId: "file-1", outcome: "skipped", code: "wizard_owned" }]);
  });
});
