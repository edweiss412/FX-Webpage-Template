// tests/admin/bellFeed.test.ts
//
// `shapeBellEntries` is pure — fed hand-built RPC-row fixtures mirroring
// get_bell_feed_rows' RETURNS TABLE shape (supabase/migrations/
// 20260705100001_get_bell_feed_rows.sql:12-29). `loadBellFeed`/
// `loadBellUnseenCount` are exercised with a mocked Supabase client chain,
// following the mocked-loader pattern in
// tests/app/api/needsAttentionCountRoute.test.ts.
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AUTO_RESOLVING_CODES, HEALTH_CODES, autoResolveNote } from "@/lib/adminAlerts/audience";
import { ALERT_ACTION_CODES, resolveAlertActions } from "@/lib/adminAlerts/alertActions";
import { BELL_LIMITS } from "@/lib/admin/bellConfig";

type Row = {
  is_meta: boolean;
  seen_through: string | null;
  active_hit_cap: boolean | null;
  history_hit_cap: boolean | null;
  viewer_opened_at: string | null;
  id: string | null;
  code: string | null;
  show_id: string | null;
  slug: string | null;
  context: Record<string, unknown> | null;
  occurrence_count: number | null;
  raised_at: string | null;
  last_seen_at: string | null;
  resolved_at: string | null;
  resolved_occurrence_sum: number | null;
  is_active: boolean | null;
  viewer_read_at: string | null;
};

function metaRow(overrides: Partial<Row> = {}): Row {
  return {
    is_meta: true,
    seen_through: "2026-07-05T12:00:00.000Z",
    active_hit_cap: false,
    history_hit_cap: false,
    viewer_opened_at: null,
    id: null,
    code: null,
    show_id: null,
    slug: null,
    context: null,
    occurrence_count: null,
    raised_at: null,
    last_seen_at: null,
    resolved_at: null,
    resolved_occurrence_sum: null,
    is_active: null,
    viewer_read_at: null,
    ...overrides,
  };
}

function activeRow(overrides: Partial<Row> = {}): Row {
  return {
    is_meta: false,
    seen_through: null,
    active_hit_cap: null,
    history_hit_cap: null,
    viewer_opened_at: null,
    id: "alert-1",
    code: "SOME_CODE",
    show_id: null,
    slug: null,
    context: null,
    occurrence_count: 1,
    raised_at: "2026-07-01T00:00:00.000Z",
    last_seen_at: "2026-07-01T00:00:00.000Z",
    resolved_at: null,
    resolved_occurrence_sum: 0,
    is_active: true,
    viewer_read_at: null,
    ...overrides,
  };
}

function historyRow(overrides: Partial<Row> = {}): Row {
  return {
    is_meta: false,
    seen_through: null,
    active_hit_cap: null,
    history_hit_cap: null,
    viewer_opened_at: null,
    id: "alert-h1",
    code: "SOME_CODE",
    show_id: null,
    slug: null,
    context: null,
    occurrence_count: null,
    raised_at: "2026-06-01T00:00:00.000Z",
    last_seen_at: "2026-06-01T00:00:00.000Z",
    resolved_at: "2026-06-02T00:00:00.000Z",
    resolved_occurrence_sum: 3,
    is_active: false,
    viewer_read_at: null,
    ...overrides,
  };
}

// ── loadBellFeed/loadBellUnseenCount mock client ────────────────────────────
const state = vi.hoisted(() => ({
  throwOnConstruct: false,
  appSettingsRow: null as { bell_history_days: number | null; bell_feed_cap: number | null } | null,
  appSettingsError: null as { message: string } | null,
  appSettingsThrows: false,
  rpcRows: [] as unknown[],
  rpcError: null as { message: string } | null,
  rpcThrows: false,
  crewMembersThrows: false,
  rpcCalls: [] as unknown[],
  showsRow: null as { id: string; slug: string; title: string } | null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => {
    if (state.throwOnConstruct) throw new Error("META: construction threw");
    return {
      from(table: string) {
        if (table === "app_settings") {
          return {
            select: () => ({
              eq: () => ({
                limit: async () => {
                  if (state.appSettingsThrows) throw new Error("META: app_settings threw");
                  if (state.appSettingsError) return { data: null, error: state.appSettingsError };
                  return { data: state.appSettingsRow ? [state.appSettingsRow] : [], error: null };
                },
              }),
            }),
          };
        }
        if (table === "crew_members") {
          return {
            select: () => ({
              in: () => ({
                limit: async () => {
                  if (state.crewMembersThrows) throw new Error("META: crew_members threw");
                  return { data: [], error: null };
                },
              }),
            }),
          };
        }
        if (table === "shows") {
          return {
            select: () => ({
              in: () => ({
                limit: async () => ({
                  data: state.showsRow ? [state.showsRow] : [],
                  error: null,
                }),
              }),
            }),
          };
        }
        // any other table the identity resolver may touch: harmless empty.
        return {
          select: () => ({
            in: () => ({
              limit: async () => ({ data: [], error: null }),
            }),
          }),
        };
      },
      rpc: async (_fn: string, args: unknown) => {
        state.rpcCalls.push(args);
        if (state.rpcThrows) throw new Error("META: rpc threw");
        if (state.rpcError) return { data: null, error: state.rpcError };
        return { data: state.rpcRows, error: null };
      },
    };
  },
}));

import {
  shapeBellEntries,
  BellFeedShapeError,
  loadBellFeed,
  loadBellUnseenCount,
} from "@/lib/admin/bellFeed";

beforeEach(() => {
  state.throwOnConstruct = false;
  state.appSettingsRow = null;
  state.appSettingsError = null;
  state.appSettingsThrows = false;
  state.rpcRows = [];
  state.rpcError = null;
  state.rpcThrows = false;
  state.crewMembersThrows = false;
  state.rpcCalls = [];
  state.showsRow = null;
});

describe("shapeBellEntries", () => {
  test("1. meta-row split: missing is_meta row → throws BellFeedShapeError (fail-closed)", () => {
    expect(() => shapeBellEntries([activeRow()], 50)).toThrow(BellFeedShapeError);
  });

  test("2. unread absence: no read row → unread true", () => {
    const { entries } = shapeBellEntries([metaRow(), activeRow({ viewer_read_at: null })], 50);
    expect(entries[0]?.unread).toBe(true);
  });

  test("3. unread stale: read_at < last_seen_at (re-bump) → unread true", () => {
    const { entries } = shapeBellEntries(
      [
        metaRow(),
        activeRow({
          raised_at: "2026-07-01T00:00:00.000Z",
          last_seen_at: "2026-07-03T00:00:00.000Z",
          viewer_read_at: "2026-07-02T00:00:00.000Z",
        }),
      ],
      50,
    );
    expect(entries[0]?.unread).toBe(true);
  });

  test("4. unread fresh: read_at >= activityAt → unread false", () => {
    const { entries } = shapeBellEntries(
      [
        metaRow(),
        activeRow({
          raised_at: "2026-07-01T00:00:00.000Z",
          last_seen_at: "2026-07-01T00:00:00.000Z",
          viewer_read_at: "2026-07-01T00:00:00.000Z",
        }),
      ],
      50,
    );
    expect(entries[0]?.unread).toBe(false);
  });

  test("4b. raised_at NEWER than last_seen_at (backfill edge): stamp/comparison both key on activityAt=raised_at", () => {
    // last_seen_at is an older backfilled value; raised_at is the true (newer)
    // activity. A read stamped BETWEEN the two must still read unread=true —
    // an implementation comparing against last_seen_at alone would wrongly
    // say "read".
    const { entries: midRead } = shapeBellEntries(
      [
        metaRow(),
        activeRow({
          raised_at: "2026-07-05T00:00:00.000Z",
          last_seen_at: "2026-07-01T00:00:00.000Z",
          viewer_read_at: "2026-07-03T00:00:00.000Z",
        }),
      ],
      50,
    );
    expect(midRead[0]?.unread).toBe(true);

    // A read stamped exactly at raised_at (the true activityAt) reads caught up.
    const { entries: caughtUpRead } = shapeBellEntries(
      [
        metaRow(),
        activeRow({
          raised_at: "2026-07-05T00:00:00.000Z",
          last_seen_at: "2026-07-01T00:00:00.000Z",
          viewer_read_at: "2026-07-05T00:00:00.000Z",
        }),
      ],
      50,
    );
    expect(caughtUpRead[0]?.unread).toBe(false);
  });

  test("5. READ RACE (R4.1): read stamped at prior activity, row re-bumped after → unread true", () => {
    const { entries } = shapeBellEntries(
      [
        metaRow(),
        activeRow({
          raised_at: "2026-07-01T00:00:00.000Z",
          last_seen_at: "2026-07-02T00:00:00.000Z", // re-bumped after the read
          viewer_read_at: "2026-07-01T00:00:00.000Z", // read stamped at the old activity
        }),
      ],
      50,
    );
    expect(entries[0]?.unread).toBe(true);
  });

  test("6. occurrences: active = occurrence_count + resolved_occurrence_sum; history = resolved_occurrence_sum", () => {
    const { entries } = shapeBellEntries(
      [
        metaRow(),
        activeRow({ id: "a1", occurrence_count: 3, resolved_occurrence_sum: 2 }),
        historyRow({ id: "h1", occurrence_count: null, resolved_occurrence_sum: 7 }),
      ],
      50,
    );
    const active = entries.find((e) => e.alertId === "a1");
    const history = entries.find((e) => e.alertId === "h1");
    expect(active?.occurrences).toBe(5);
    expect(history?.occurrences).toBe(7);
  });

  test("7. ordering: active first (activityAt desc), then history (resolvedAt desc)", () => {
    const aOld = activeRow({
      id: "a-old",
      raised_at: "2026-07-01T00:00:00.000Z",
      last_seen_at: "2026-07-01T00:00:00.000Z",
    });
    const aNew = activeRow({
      id: "a-new",
      raised_at: "2026-07-02T00:00:00.000Z",
      last_seen_at: "2026-07-02T00:00:00.000Z",
    });
    const hOld = historyRow({ id: "h-old", resolved_at: "2026-06-01T00:00:00.000Z" });
    const hNew = historyRow({ id: "h-new", resolved_at: "2026-06-02T00:00:00.000Z" });
    const { entries } = shapeBellEntries([metaRow(), hOld, aOld, hNew, aNew], 50);
    expect(entries.map((e) => e.alertId)).toEqual(["a-new", "a-old", "h-new", "h-old"]);
  });

  test("8. truncation: sliced to feedCap total, active first; truncated when the TS slice drops rows", () => {
    const rows = [
      metaRow(),
      activeRow({
        id: "a1",
        raised_at: "2026-07-01T00:00:00.000Z",
        last_seen_at: "2026-07-01T00:00:00.000Z",
      }),
      activeRow({
        id: "a2",
        raised_at: "2026-07-02T00:00:00.000Z",
        last_seen_at: "2026-07-02T00:00:00.000Z",
      }),
      activeRow({
        id: "a3",
        raised_at: "2026-07-03T00:00:00.000Z",
        last_seen_at: "2026-07-03T00:00:00.000Z",
      }),
      historyRow({ id: "h1" }),
    ];
    const { entries, truncated } = shapeBellEntries(rows, 2);
    expect(entries.map((e) => e.alertId)).toEqual(["a3", "a2"]);
    expect(truncated).toBe(true);
  });

  test("8b. truncated = true when meta cap flag is set even with no TS-level slice", () => {
    const { truncated } = shapeBellEntries([metaRow({ active_hit_cap: true }), activeRow()], 50);
    expect(truncated).toBe(true);
  });

  test("8c. truncated = false when neither meta flags nor a TS slice apply", () => {
    const { truncated } = shapeBellEntries([metaRow(), activeRow()], 50);
    expect(truncated).toBe(false);
  });

  test("8d. activeTruncated tracks active_hit_cap INDEPENDENTLY of history_hit_cap (spec §1.1 R4)", () => {
    // Active complete, history capped: global truncated true, activeTruncated FALSE.
    const historyOnly = shapeBellEntries(
      [metaRow({ active_hit_cap: false, history_hit_cap: true }), activeRow()],
      50,
    );
    expect(historyOnly.activeTruncated).toBe(false);
    expect(historyOnly.truncated).toBe(true);

    // Active capped: activeTruncated TRUE.
    const activeCapped = shapeBellEntries(
      [metaRow({ active_hit_cap: true, history_hit_cap: false }), activeRow()],
      50,
    );
    expect(activeCapped.activeTruncated).toBe(true);

    // Neither capped: activeTruncated FALSE.
    const neither = shapeBellEntries([metaRow(), activeRow()], 50);
    expect(neither.activeTruncated).toBe(false);
  });

  test("9. unseenCount: activityAt > openedAt entries only; openedAt null → all count", () => {
    const rows = [
      metaRow({ viewer_opened_at: "2026-07-02T00:00:00.000Z" }),
      activeRow({
        id: "a1",
        raised_at: "2026-07-01T00:00:00.000Z",
        last_seen_at: "2026-07-01T00:00:00.000Z",
      }), // before opened
      activeRow({
        id: "a2",
        raised_at: "2026-07-03T00:00:00.000Z",
        last_seen_at: "2026-07-03T00:00:00.000Z",
      }), // after opened
      activeRow({
        id: "a3",
        raised_at: "2026-07-04T00:00:00.000Z",
        last_seen_at: "2026-07-04T00:00:00.000Z",
      }), // after opened
    ];
    const { unseenCount } = shapeBellEntries(rows, 50);
    expect(unseenCount).toBe(2);

    const rowsNullOpened = rows.map((r) => (r.is_meta ? metaRow({ viewer_opened_at: null }) : r));
    const { unseenCount: unseenAll } = shapeBellEntries(rowsNullOpened, 50);
    expect(unseenAll).toBe(3);
  });

  test("9b. CAP BOUNDARY (R4.2): oldest excluded from entries+count; re-bumped it enters sliced set unread", () => {
    const a = activeRow({
      id: "a-oldest",
      raised_at: "2026-07-01T00:00:00.000Z",
      last_seen_at: "2026-07-01T00:00:00.000Z",
    });
    const b = activeRow({
      id: "b-mid",
      raised_at: "2026-07-02T00:00:00.000Z",
      last_seen_at: "2026-07-02T00:00:00.000Z",
    });
    const c = activeRow({
      id: "c-newest",
      raised_at: "2026-07-03T00:00:00.000Z",
      last_seen_at: "2026-07-03T00:00:00.000Z",
    });
    const meta = metaRow({ viewer_opened_at: "2026-06-30T00:00:00.000Z" });

    const first = shapeBellEntries([meta, a, b, c], 2);
    expect(first.entries.map((e) => e.alertId)).toEqual(["c-newest", "b-mid"]);
    expect(first.unseenCount).toBe(2); // a-oldest neither entered nor counted

    const aRebumped = activeRow({
      id: "a-oldest",
      raised_at: "2026-07-01T00:00:00.000Z",
      last_seen_at: "2026-07-04T00:00:00.000Z", // re-bump makes it the newest activity
      viewer_read_at: null,
    });
    const second = shapeBellEntries([meta, aRebumped, b, c], 2);
    expect(second.entries.map((e) => e.alertId)).toEqual(["a-oldest", "c-newest"]);
    expect(second.entries.find((e) => e.alertId === "a-oldest")?.unread).toBe(true);
  });

  test("10. isAutoResolving/autoResolveNote/actions/isHealth from catalog-derived helpers", () => {
    expect(AUTO_RESOLVING_CODES.length).toBeGreaterThan(0);
    expect(ALERT_ACTION_CODES.length).toBeGreaterThan(0);
    expect(HEALTH_CODES.length).toBeGreaterThan(0);

    const autoCode = AUTO_RESOLVING_CODES[0]!;
    const actionCode = ALERT_ACTION_CODES[0]!;
    const healthCode = HEALTH_CODES[0]!;

    const { entries } = shapeBellEntries(
      [
        metaRow(),
        activeRow({ id: "auto", code: autoCode }),
        activeRow({ id: "action", code: actionCode, slug: "east-coast" }),
        activeRow({ id: "health", code: healthCode }),
        activeRow({ id: "plain", code: "SOME_UNCATALOGED_CODE" }),
      ],
      50,
    );
    const auto = entries.find((e) => e.alertId === "auto")!;
    const action = entries.find((e) => e.alertId === "action")!;
    const health = entries.find((e) => e.alertId === "health")!;
    const plain = entries.find((e) => e.alertId === "plain")!;

    expect(auto.isAutoResolving).toBe(true);
    expect(auto.autoResolveNote).toBe(autoResolveNote(autoCode));
    expect(action.actions).toEqual(resolveAlertActions(actionCode, null, { slug: "east-coast" }));
    expect(health.isHealth).toBe(true);
    expect(plain.isHealth).toBe(false);
  });

  test("11. context passthrough: producer context rides onto shaped entries (active + history); null → null", () => {
    const activeCtx = { "sheet-name": "East Coast" };
    const historyCtx = { email: "doug@fxav.test" };
    const { entries } = shapeBellEntries(
      [
        metaRow(),
        activeRow({ id: "a1", context: activeCtx }),
        historyRow({ id: "h1", context: historyCtx }),
        activeRow({ id: "a2", context: null }),
      ],
      50,
    );
    expect(entries.find((e) => e.alertId === "a1")?.context).toEqual(activeCtx);
    expect(entries.find((e) => e.alertId === "h1")?.context).toEqual(historyCtx);
    // A null-context row carries an explicit null (never undefined) so the
    // interpolation call site receives the same shape the banner did.
    expect(entries.find((e) => e.alertId === "a2")?.context).toBeNull();
  });
});

describe("loadBellFeed", () => {
  test("ok: uses stored app_settings bounds, calls the RPC with them, shapes entries + identity", async () => {
    state.appSettingsRow = { bell_history_days: 45, bell_feed_cap: 20 };
    state.rpcRows = [
      metaRow(),
      activeRow({ id: "a1", code: "SHOW_FIRST_PUBLISHED", slug: "east-coast", context: null }),
    ];

    const result = await loadBellFeed("admin@fxav.test", false);

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") throw new Error("unreachable");
    expect(result.historyDays).toBe(45);
    expect(result.feedCap).toBe(20);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.actions).toEqual(
      resolveAlertActions("SHOW_FIRST_PUBLISHED", null, { slug: "east-coast" }),
    );
    // SHOW_FIRST_PUBLISHED is a { kind: "global" } identity-map entry — no
    // crew/show lookups needed, resolves to an empty-segments global identity.
    expect(result.entries[0]?.identity).toEqual({ segments: [], global: true });
    expect(state.rpcCalls[0]).toMatchObject({
      p_history_days: 45,
      p_cap: 20,
      p_admin_email: "admin@fxav.test",
    });
  });

  test("null app_settings columns → falls back to BELL_LIMITS defaults", async () => {
    state.appSettingsRow = { bell_history_days: null, bell_feed_cap: null };
    state.rpcRows = [metaRow()];

    const result = await loadBellFeed("admin@fxav.test", false);

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") throw new Error("unreachable");
    expect(result.historyDays).toBe(BELL_LIMITS.historyDays.default);
    expect(result.feedCap).toBe(BELL_LIMITS.feedCap.default);
    expect(state.rpcCalls[0]).toMatchObject({
      p_history_days: BELL_LIMITS.historyDays.default,
      p_cap: BELL_LIMITS.feedCap.default,
    });
  });

  test("app_settings returned error → infra_error", async () => {
    state.appSettingsError = { message: "boom" };
    const result = await loadBellFeed("admin@fxav.test", false);
    expect(result).toEqual({ kind: "infra_error" });
  });

  test("app_settings threw → infra_error", async () => {
    state.appSettingsThrows = true;
    const result = await loadBellFeed("admin@fxav.test", false);
    expect(result).toEqual({ kind: "infra_error" });
  });

  test("rpc returned error → infra_error", async () => {
    state.rpcError = { message: "boom" };
    const result = await loadBellFeed("admin@fxav.test", false);
    expect(result).toEqual({ kind: "infra_error" });
  });

  test("rpc threw → infra_error", async () => {
    state.rpcThrows = true;
    const result = await loadBellFeed("admin@fxav.test", false);
    expect(result).toEqual({ kind: "infra_error" });
  });

  test("client construction throw → infra_error", async () => {
    state.throwOnConstruct = true;
    const result = await loadBellFeed("admin@fxav.test", false);
    expect(result).toEqual({ kind: "infra_error" });
  });

  test("identity resolve fault is additive, never gating: entries still returned, faulted identity null", async () => {
    state.rpcRows = [
      metaRow(),
      activeRow({
        id: "a1",
        code: "OAUTH_IDENTITY_CLAIMED",
        context: { crew_member_id: "11111111-1111-1111-1111-111111111111" },
      }),
    ];
    state.crewMembersThrows = true;

    const result = await loadBellFeed("admin@fxav.test", false);

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") throw new Error("unreachable");
    expect(result.entries).toHaveLength(1);
    // resolveAlertIdentities still emits a (degraded, empty-segments) entry
    // per row on infra fault — identity is additive/never-gating, but the
    // row itself is never dropped nor does its identity become undefined.
    expect(result.entries[0]?.identity).toEqual({ segments: [], global: false });
  });

  test("attaches messageParams (identity-derived) and a single sheet-link action", async () => {
    state.rpcRows = [
      metaRow(),
      activeRow({
        id: "a1",
        code: "ROLE_FLAGS_NOTICE",
        slug: "ria-forum",
        show_id: "22222222-2222-2222-2222-222222222222",
        context: {
          drive_file_id: "df1",
          changes: [{ crew_name: "Doug Larson", prior_flags: ["A1"], new_flags: ["A1", "LEAD"] }],
        },
      }),
    ];
    state.showsRow = {
      id: "22222222-2222-2222-2222-222222222222",
      slug: "ria-forum",
      title: "II - RIA Investment Forum",
    };

    const result = await loadBellFeed("admin@fxav.test", false);

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") throw new Error("unreachable");
    const entry = result.entries.find((e) => e.code === "ROLE_FLAGS_NOTICE")!;
    expect(entry.messageParams["sheet-name"]).toBe("'II - RIA Investment Forum'");
    expect(entry.messageParams["role-changes"]).toBe(
      "Doug Larson's role changed from A1 to A1 + LEAD.",
    );
    expect(entry.messageParams["lead-hint"]).toBe(
      " Lead changes must be confirmed in the show page.",
    );
    expect(entry.actions.map((a) => a.label)).toEqual(["Open in Sheet"]);
    expect(entry).not.toHaveProperty("action");
  });
});

describe("loadBellUnseenCount", () => {
  test("ok: returns the same unseenCount the feed pipeline would compute", async () => {
    state.rpcRows = [
      metaRow({ viewer_opened_at: "2026-07-01T00:00:00.000Z" }),
      activeRow({
        id: "a1",
        raised_at: "2026-07-02T00:00:00.000Z",
        last_seen_at: "2026-07-02T00:00:00.000Z",
      }),
      activeRow({
        id: "a2",
        raised_at: "2026-06-01T00:00:00.000Z",
        last_seen_at: "2026-06-01T00:00:00.000Z",
      }),
    ];
    const result = await loadBellUnseenCount("admin@fxav.test", false);
    expect(result).toEqual({ kind: "ok", count: 1 });
  });

  test("infra_error passthrough", async () => {
    state.rpcError = { message: "boom" };
    const result = await loadBellUnseenCount("admin@fxav.test", false);
    expect(result).toEqual({ kind: "infra_error" });
  });
});
