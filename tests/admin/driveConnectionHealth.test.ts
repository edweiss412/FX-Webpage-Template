/**
 * tests/admin/driveConnectionHealth.test.ts (M12.2 Phase B1 Task 5.3)
 *
 * fetchDriveConnectionHealth() — worst-of-active-fleet Drive connection health
 * via UNTRUNCATABLE head:true count queries (spec §3.1, plan Task 5.3).
 *
 * Anti-tautology: every expected reason/health/attentionCount is DERIVED from
 * the seeded per-predicate counts + the seeded watch row this test feeds the
 * mock — never hardcoded against the helper's own output. The mock lets each
 * per-predicate head:true count and the watch-row read be independently
 * seedable, so worst-first tier precedence is genuinely exercised.
 *
 * The mock classifies each `shows` count query by the PostgREST filters it
 * accumulates (a deterministic label) so a test can say "the drive_error count
 * is 1, everything else is 0" and the helper's tier walk decides the winner.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---- nowDate mock: single fixed instant for all interval boundaries --------
const NOW_ISO = "2026-06-01T12:00:00.000Z";
const NOW_MS = Date.parse(NOW_ISO);
vi.mock("@/lib/time/now", () => ({
  nowDate: async () => new Date(NOW_ISO),
  now: async () => NOW_ISO,
}));

// ---- getActiveWatchedFolder mock -------------------------------------------
const folderMock = vi.hoisted(() => ({
  result: { folderId: "folder-1", folderName: "Doug's Shows" } as unknown,
}));
vi.mock("@/lib/appSettings/getWatchedFolderId", () => ({
  getActiveWatchedFolder: async () => folderMock.result,
}));

// ---- Supabase client mock --------------------------------------------------
// Each `shows` head:true count query is classified into a label by the filters
// it accumulates. The test seeds `counts[label]`. The watch row read is seeded
// via `watchRow`. `lastSyncedAtRow` seeds the max-last_synced_at display read.
type CountLabel =
  | "active" // syncingCount: archived=false, no other predicate
  | "drive_error"
  | "sheet_unavailable"
  | "parse_error"
  | "unknown_status" // unrecognized non-null status
  | "null_status_fresh_ts" // null status AND non-null timestamp
  | "stale_severe"
  | "stale_moderate";

const sbMock = vi.hoisted(() => ({
  throwOnConstruct: false,
  throwOnFromTable: null as string | null,
  errorOnLabel: null as string | null, // a count query whose label matches returns { error }
  errorOnWatch: false,
  watchQueryCalls: 0,
  counts: {} as Partial<Record<CountLabel, number>>,
  watchRow: null as null | {
    status: string;
    expires_at: string | null;
    activated_at: string | null;
  },
  lastSyncedAtRow: null as null | { last_synced_at: string | null },
}));

function classifyShowsCount(filters: Array<{ op: string; args: unknown[] }>): CountLabel {
  // archived=false is always present. Inspect the discriminating filters.
  const has = (op: string, pred: (args: unknown[]) => boolean) =>
    filters.some((f) => f.op === op && pred(f.args));

  if (has("eq", (a) => a[0] === "last_sync_status" && a[1] === "drive_error")) return "drive_error";
  if (has("eq", (a) => a[0] === "last_sync_status" && a[1] === "sheet_unavailable"))
    return "sheet_unavailable";
  if (has("eq", (a) => a[0] === "last_sync_status" && a[1] === "parse_error")) return "parse_error";

  // unknown-status count: .not(last_sync_status,'in',...) + .not(last_sync_status,'is',null)
  if (
    has("not", (a) => a[0] === "last_sync_status" && a[1] === "in") &&
    has("not", (a) => a[0] === "last_sync_status" && a[1] === "is")
  ) {
    return "unknown_status";
  }
  // null-status-fresh-ts count: .is(last_sync_status,null) + .not(last_synced_at,'is',null)
  if (
    has("is", (a) => a[0] === "last_sync_status" && a[1] === null) &&
    has("not", (a) => a[0] === "last_synced_at" && a[1] === "is")
  ) {
    return "null_status_fresh_ts";
  }
  // stale_severe: an .or(...) clause referencing 6 hours / null last_synced_at
  if (
    has(
      "or",
      (a) =>
        typeof a[0] === "string" &&
        /last_synced_at/.test(a[0]) &&
        /is\.null|06:00:00|6 hour|21600|2026-06-01T06/.test(a[0]),
    )
  ) {
    return "stale_severe";
  }
  // stale_moderate: lt last_synced_at < now-1h AND gte >= now-6h (two range filters, no or())
  if (
    has("lt", (a) => a[0] === "last_synced_at") &&
    (has("gte", (a) => a[0] === "last_synced_at") || has("gt", (a) => a[0] === "last_synced_at")) &&
    !has("or", () => true)
  ) {
    return "stale_moderate";
  }
  // Otherwise the plain active-count (only archived=false).
  return "active";
}

function makeShowsBuilder(isHeadCount: boolean) {
  const filters: Array<{ op: string; args: unknown[] }> = [];
  let selectIsHead = isHeadCount;
  let orderApplied = false;
  void orderApplied;

  const builder: Record<string, unknown> = {};
  const record =
    (op: string) =>
    (...args: unknown[]) => {
      filters.push({ op, args });
      return builder;
    };
  builder.select = (_cols: unknown, opts?: { count?: string; head?: boolean }) => {
    selectIsHead = Boolean(opts?.head);
    return builder;
  };
  builder.eq = record("eq");
  builder.lt = record("lt");
  builder.lte = record("lte");
  builder.gt = record("gt");
  builder.gte = record("gte");
  builder.is = record("is");
  builder.not = record("not");
  builder.in = record("in");
  builder.or = record("or");
  builder.order = (...args: unknown[]) => {
    orderApplied = true;
    filters.push({ op: "order", args });
    return builder;
  };
  builder.limit = (...args: unknown[]) => {
    filters.push({ op: "limit", args });
    return builder;
  };

  const resolve = () => {
    if (selectIsHead) {
      const label = classifyShowsCount(filters);
      if (sbMock.errorOnLabel === label) {
        return { data: null, count: null, error: { message: `seeded error on ${label}` } };
      }
      const count = sbMock.counts[label] ?? 0;
      return { data: null, count, error: null };
    }
    // Non-head select → the lastReadAt display read (order + limit, returns rows).
    const row = sbMock.lastSyncedAtRow;
    return { data: row ? [row] : [], count: null, error: null };
  };

  (builder as { then: unknown }).then = (onfulfilled?: ((v: unknown) => unknown) | null) =>
    onfulfilled ? onfulfilled(resolve()) : undefined;

  return builder;
}

function makeWatchBuilder() {
  const builder: Record<string, unknown> = {};
  const passthrough = () => builder;
  builder.select = passthrough;
  builder.eq = passthrough;
  builder.order = passthrough;
  builder.limit = passthrough;
  builder.maybeSingle = async () => {
    if (sbMock.errorOnWatch) return { data: null, error: { message: "seeded watch error" } };
    return { data: sbMock.watchRow, error: null };
  };
  (builder as { then: unknown }).then = (onfulfilled?: ((v: unknown) => unknown) | null) =>
    onfulfilled
      ? onfulfilled({ data: sbMock.watchRow, error: sbMock.errorOnWatch ? { message: "x" } : null })
      : undefined;
  return builder;
}

function makeClient() {
  return {
    from: (table: string) => {
      if (sbMock.throwOnFromTable === table) {
        throw new Error(`META: simulated from('${table}') fault`);
      }
      if (table === "drive_watch_channels") {
        sbMock.watchQueryCalls += 1;
        return makeWatchBuilder();
      }
      // shows: head:true counts AND the non-head lastReadAt read both arrive
      // here; the builder distinguishes via .select(..., { head }).
      return makeShowsBuilder(false);
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => {
    if (sbMock.throwOnConstruct) throw new Error("META: construction fault");
    return makeClient();
  },
}));

import { fetchDriveConnectionHealth } from "@/lib/admin/driveConnectionHealth";

beforeEach(() => {
  folderMock.result = { folderId: "folder-1", folderName: "Doug's Shows" };
  sbMock.throwOnConstruct = false;
  sbMock.throwOnFromTable = null;
  sbMock.errorOnLabel = null;
  sbMock.errorOnWatch = false;
  sbMock.watchQueryCalls = 0;
  sbMock.counts = {};
  sbMock.watchRow = null;
  sbMock.lastSyncedAtRow = null;
});

// Helper: a live, unexpired active watch row (so watch tiers don't fire).
const liveWatch = {
  status: "active",
  expires_at: new Date(NOW_MS + 24 * 3_600_000).toISOString(), // +24h, unexpired
  activated_at: new Date(NOW_MS - 3_600_000).toISOString(),
};

describe("fetchDriveConnectionHealth", () => {
  it("(a) overflow regression — active=501, only 1 row drive_error → Warn/sync_drive_error (count catches the overflow row)", async () => {
    sbMock.watchRow = liveWatch;
    sbMock.counts = { active: 501, drive_error: 1 };
    const r = await fetchDriveConnectionHealth();
    expect(r).toMatchObject({
      health: "warn",
      reason: "sync_drive_error",
      code: "DRIVE_FETCH_FAILED",
    });
    // attentionCount = winning predicate count (1), NOT syncingCount (501).
    expect((r as { attentionCount: number }).attentionCount).toBe(1);
    expect((r as { syncingCount: number }).syncingCount).toBe(501);
  });

  it("(b) mixed fleet — one fresh-ok + one 7h-stale → Warn/stale_severe, attentionCount=1", async () => {
    sbMock.watchRow = liveWatch;
    sbMock.counts = { active: 2, stale_severe: 1 };
    const r = await fetchDriveConnectionHealth();
    expect(r).toMatchObject({
      health: "warn",
      reason: "stale_severe",
      code: "SYNC_DELAYED_SEVERE",
    });
    expect((r as { attentionCount: number }).attentionCount).toBe(1);
  });

  it("(c) active-but-expired watch (status='active', expires_at <= now) → Warn/watch_expired", async () => {
    sbMock.watchRow = {
      status: "active",
      expires_at: new Date(NOW_MS - 60_000).toISOString(), // 1 min past → expired
      activated_at: new Date(NOW_MS - 3_600_000).toISOString(),
    };
    sbMock.counts = { active: 5 };
    const r = await fetchDriveConnectionHealth();
    expect(r).toMatchObject({
      health: "warn",
      reason: "watch_expired",
      code: "WATCH_CHANNEL_ORPHANED",
    });
    // watch_* attentionCount = whole fleet (syncingCount).
    expect((r as { attentionCount: number }).attentionCount).toBe(5);
  });

  it("(d) precedence — watch inactive + a stale show → watch_inactive wins (not stale)", async () => {
    sbMock.watchRow = {
      status: "orphaned",
      expires_at: null,
      activated_at: new Date(NOW_MS - 3_600_000).toISOString(),
    };
    sbMock.counts = { active: 3, stale_severe: 1, stale_moderate: 1 };
    const r = await fetchDriveConnectionHealth();
    expect(r).toMatchObject({ health: "warn", reason: "watch_inactive" });
  });

  it("(e) enum-drift across age bands — unrecognized status at <1h, 2h, AND 7h each → Warn/sync_unknown (status tier preempts age tiers)", async () => {
    // The unknown_status predicate count is age-independent; assert that whatever
    // the (synthetic) age of the offending row, the unknown count is what wins
    // — never stale_*. We exercise three configs where stale_* counts are ALSO
    // positive to prove status-tier-5 preempts age-tiers-6/7.
    for (const stale of [
      { stale_severe: 0, stale_moderate: 0 }, // <1h
      { stale_severe: 0, stale_moderate: 1 }, // 2h
      { stale_severe: 1, stale_moderate: 0 }, // 7h
    ]) {
      sbMock.watchRow = liveWatch;
      sbMock.counts = { active: 1, unknown_status: 1, ...stale };
      const r = await fetchDriveConnectionHealth();
      expect(r).toMatchObject({
        health: "warn",
        reason: "sync_unknown",
        code: "SYNC_STATUS_UNKNOWN",
      });
    }
  });

  it("(f) null status + fresh timestamp → Warn/sync_unknown (partially-written row)", async () => {
    sbMock.watchRow = liveWatch;
    sbMock.counts = { active: 1, null_status_fresh_ts: 1 };
    const r = await fetchDriveConnectionHealth();
    expect(r).toMatchObject({
      health: "warn",
      reason: "sync_unknown",
      code: "SYNC_STATUS_UNKNOWN",
    });
  });

  it("(g) watch-any-status read — folder with ONLY an orphaned/stopped row → Warn/watch_inactive (NOT not_configured)", async () => {
    sbMock.watchRow = {
      status: "stopped",
      expires_at: null,
      activated_at: new Date(NOW_MS - 7_200_000).toISOString(),
    };
    sbMock.counts = { active: 4 };
    const r = await fetchDriveConnectionHealth();
    expect(r).toMatchObject({
      health: "warn",
      reason: "watch_inactive",
      code: "WATCH_CHANNEL_ORPHANED",
    });
  });

  it("(h) folder configured but no watch row at all → Warn/not_configured", async () => {
    sbMock.watchRow = null;
    sbMock.counts = { active: 4 };
    const r = await fetchDriveConnectionHealth();
    expect(r).toMatchObject({
      health: "warn",
      reason: "not_configured",
      code: "WATCH_CHANNEL_ORPHANED",
    });
    // the watch table WAS read (folder is configured)
    expect(sbMock.watchQueryCalls).toBe(1);
  });

  it("(h2) no_folder_configured (folderId null) → Warn/not_configured WITHOUT any drive_watch_channels read", async () => {
    folderMock.result = { kind: "no_folder_configured" };
    // Make any watch read explode — it must NEVER be called.
    sbMock.throwOnFromTable = "drive_watch_channels";
    sbMock.counts = { active: 2 };
    const r = await fetchDriveConnectionHealth();
    expect(r).toMatchObject({
      health: "warn",
      reason: "not_configured",
      code: "WATCH_CHANNEL_ORPHANED",
    });
    expect(sbMock.watchQueryCalls).toBe(0);
    expect((r as { folderId: string | null }).folderId).toBeNull();
  });

  it("(i) 7-hour-old successful sync → Warn/stale_severe, never Healthy", async () => {
    sbMock.watchRow = liveWatch;
    sbMock.counts = { active: 1, stale_severe: 1 };
    const r = await fetchDriveConnectionHealth();
    expect(r).toMatchObject({
      health: "warn",
      reason: "stale_severe",
      code: "SYNC_DELAYED_SEVERE",
    });
  });

  it("(j) 1h-6h ok → Warn/stale_moderate; <1h all-ok → positive", async () => {
    sbMock.watchRow = liveWatch;
    sbMock.counts = { active: 1, stale_moderate: 1 };
    const moderate = await fetchDriveConnectionHealth();
    expect(moderate).toMatchObject({
      health: "warn",
      reason: "stale_moderate",
      code: "SYNC_DELAYED_MODERATE",
    });

    sbMock.counts = { active: 1 }; // nothing stale/failing
    const fresh = await fetchDriveConnectionHealth();
    expect(fresh).toMatchObject({ health: "positive" });
    expect((fresh as { reason?: string }).reason).toBeUndefined();
  });

  it("(k) attentionCount = winning-reason predicate count, NOT syncingCount (1 stale among 501 active → attentionCount=1)", async () => {
    sbMock.watchRow = liveWatch;
    sbMock.counts = { active: 501, stale_severe: 1 };
    const r = await fetchDriveConnectionHealth();
    expect((r as { attentionCount: number }).attentionCount).toBe(1);
    expect((r as { syncingCount: number }).syncingCount).toBe(501);
  });

  it("(l) any count read returns error → infra_error; watch read error → infra_error; thrown from() → infra_error; construction throw → infra_error", async () => {
    sbMock.watchRow = liveWatch;
    sbMock.counts = { active: 5 };
    sbMock.errorOnLabel = "active";
    expect(await fetchDriveConnectionHealth()).toEqual({ kind: "infra_error" });

    sbMock.errorOnLabel = null;
    sbMock.errorOnWatch = true;
    expect(await fetchDriveConnectionHealth()).toEqual({ kind: "infra_error" });

    sbMock.errorOnWatch = false;
    sbMock.throwOnFromTable = "shows";
    expect(await fetchDriveConnectionHealth()).toEqual({ kind: "infra_error" });

    sbMock.throwOnFromTable = null;
    sbMock.throwOnConstruct = true;
    expect(await fetchDriveConnectionHealth()).toEqual({ kind: "infra_error" });
  });

  it("(m) hard-failure precedence within tier 4: drive_error → sheet_unavailable → parse_error", async () => {
    sbMock.watchRow = liveWatch;
    sbMock.counts = { active: 3, drive_error: 1, sheet_unavailable: 1, parse_error: 1 };
    expect(await fetchDriveConnectionHealth()).toMatchObject({ reason: "sync_drive_error" });

    sbMock.counts = { active: 3, sheet_unavailable: 1, parse_error: 1 };
    expect(await fetchDriveConnectionHealth()).toMatchObject({
      reason: "sync_sheet_unavailable",
      code: "SHEET_UNAVAILABLE",
    });

    sbMock.counts = { active: 3, parse_error: 1 };
    expect(await fetchDriveConnectionHealth()).toMatchObject({
      reason: "sync_parse_error",
      code: "PARSE_ERROR_LAST_GOOD",
    });
  });

  it("(n) each Warn reason carries the correct catalog code (exhaustive map)", async () => {
    const expectations: Array<[() => void, string, string]> = [
      [
        () => {
          sbMock.watchRow = null;
        },
        "not_configured",
        "WATCH_CHANNEL_ORPHANED",
      ],
      [
        () => {
          sbMock.watchRow = { status: "stopped", expires_at: null, activated_at: NOW_ISO };
        },
        "watch_inactive",
        "WATCH_CHANNEL_ORPHANED",
      ],
      [
        () => {
          sbMock.watchRow = {
            status: "active",
            expires_at: new Date(NOW_MS - 1000).toISOString(),
            activated_at: NOW_ISO,
          };
        },
        "watch_expired",
        "WATCH_CHANNEL_ORPHANED",
      ],
      [
        () => {
          sbMock.watchRow = liveWatch;
          sbMock.counts = { active: 1, drive_error: 1 };
        },
        "sync_drive_error",
        "DRIVE_FETCH_FAILED",
      ],
      [
        () => {
          sbMock.watchRow = liveWatch;
          sbMock.counts = { active: 1, sheet_unavailable: 1 };
        },
        "sync_sheet_unavailable",
        "SHEET_UNAVAILABLE",
      ],
      [
        () => {
          sbMock.watchRow = liveWatch;
          sbMock.counts = { active: 1, parse_error: 1 };
        },
        "sync_parse_error",
        "PARSE_ERROR_LAST_GOOD",
      ],
      [
        () => {
          sbMock.watchRow = liveWatch;
          sbMock.counts = { active: 1, unknown_status: 1 };
        },
        "sync_unknown",
        "SYNC_STATUS_UNKNOWN",
      ],
      [
        () => {
          sbMock.watchRow = liveWatch;
          sbMock.counts = { active: 1, stale_severe: 1 };
        },
        "stale_severe",
        "SYNC_DELAYED_SEVERE",
      ],
      [
        () => {
          sbMock.watchRow = liveWatch;
          sbMock.counts = { active: 1, stale_moderate: 1 };
        },
        "stale_moderate",
        "SYNC_DELAYED_MODERATE",
      ],
    ];
    for (const [seed, reason, code] of expectations) {
      sbMock.watchRow = null;
      sbMock.counts = { active: 1 };
      seed();
      const r = await fetchDriveConnectionHealth();
      expect(r, `reason ${reason}`).toMatchObject({ health: "warn", reason, code });
    }
  });

  it("(o) lastReadAt = max last_synced_at (display only); positive requires all-ok <1h + active unexpired watch", async () => {
    const maxTs = new Date(NOW_MS - 5 * 60_000).toISOString(); // 5 min ago
    sbMock.watchRow = liveWatch;
    sbMock.counts = { active: 7 };
    sbMock.lastSyncedAtRow = { last_synced_at: maxTs };
    const r = await fetchDriveConnectionHealth();
    expect(r).toMatchObject({ health: "positive" });
    expect((r as { lastReadAt: string | null }).lastReadAt).toBe(maxTs);
    expect((r as { syncingCount: number }).syncingCount).toBe(7);
    expect((r as { folderName: string | null }).folderName).toBe("Doug's Shows");
  });

  it("infra_error short-circuit — getActiveWatchedFolder infra_error → infra_error", async () => {
    folderMock.result = {
      kind: "infra_error",
      operation: "readActiveWatchedFolderId",
      source: "thrown_error",
      cause: new Error("x"),
    };
    expect(await fetchDriveConnectionHealth()).toEqual({ kind: "infra_error" });
  });
});
