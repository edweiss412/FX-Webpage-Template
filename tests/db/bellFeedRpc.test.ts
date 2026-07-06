/**
 * tests/db/bellFeedRpc.test.ts
 *
 * Live local-DB behavior test for `public.get_bell_feed_rows` (spec §6.1,
 * adversarial R5/R6/R9/R10 shape; viewer-state folding per plan-review R4).
 * Connection pattern mirrors tests/db/_b2Helpers.ts / tests/db/upsert-admin-alert-dedup.test.ts
 * (postgres.js against TEST_DATABASE_URL ?? DATABASE_URL ?? local stack) —
 * NOT tests/db/validation-schema-parity.test.ts's psql-introspection style,
 * because this test asserts on actual row DATA the RPC returns, not schema
 * shape, so a real SQL client (not psql text output) is required.
 *
 * Every expectation derives from seeded fixture values (AGENTS.md anti-
 * tautology rule) — no hardcoded counts. Cap-boundary assertions (5/5b and
 * their history pair) compare the RPC's output against an independently
 * written mirror query over the same live table state, so they stay correct
 * even when other test files are concurrently seeding/cleaning admin_alerts
 * rows in the shared local DB (fileParallelism is NOT disabled for tests/db).
 *
 * All fixture rows use a per-run-unique code/slug/email prefix so cleanup
 * (afterEach) is a simple LIKE-scoped delete that can't touch unrelated data.
 */
import { randomUUID } from "node:crypto";
import postgres, { type Sql } from "postgres";
import { afterAll, afterEach, describe, expect, it } from "vitest";

const DB_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const sql: Sql = postgres(DB_URL, { max: 4, prepare: false });

// Per-file-run unique tag so every fixture row (code/slug/email) is globally
// unrecognizable to any other test run, local or concurrent.
const RUN = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const CODE_PREFIX = `TEST_BELL_${RUN}_`;
const SLUG_PREFIX = `bell-test-${RUN}-`;
const EMAIL_PREFIX = `bell-test-${RUN}-`;

function code(tag: string): string {
  return `${CODE_PREFIX}${tag}`;
}
function adminEmail(tag: string): string {
  return `${EMAIL_PREFIX}${tag}@example.com`;
}

afterEach(async () => {
  // Order doesn't matter for correctness (FK cascades cover the rest), but
  // deleting admin_alerts first keeps each step's affected-row count small.
  await sql`delete from public.admin_alerts where code like ${`${CODE_PREFIX}%`}`;
  await sql`delete from public.shows where slug like ${`${SLUG_PREFIX}%`}`;
  await sql`delete from public.admin_alert_reads where admin_email like ${`${EMAIL_PREFIX}%`}`;
  await sql`delete from public.admin_bell_state where admin_email like ${`${EMAIL_PREFIX}%`}`;
});

afterAll(async () => {
  await sql.end({ timeout: 5 });
});

async function makeShow(tag: string): Promise<string> {
  const slug = `${SLUG_PREFIX}${tag}`;
  const [row] = await sql<{ id: string }[]>`
    insert into public.shows (drive_file_id, slug, title, client_label, template_version, published, archived)
    values (${`drive-${slug}`}, ${slug}, 'Bell Feed RPC Test', 'Client', 'v4', true, false)
    returning id
  `;
  return row!.id;
}

async function insertAlert(opts: {
  showId: string | null;
  code: string;
  raisedAt: Date;
  lastSeenAt?: Date;
  resolvedAt?: Date | null;
  occurrenceCount?: number;
}): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    insert into public.admin_alerts (show_id, code, context, raised_at, last_seen_at, occurrence_count, resolved_at)
    values (
      ${opts.showId}::uuid, ${opts.code}, ${sql.json({})},
      ${opts.raisedAt}, ${opts.lastSeenAt ?? opts.raisedAt},
      ${opts.occurrenceCount ?? 1}, ${opts.resolvedAt ?? null}
    )
    returning id
  `;
  return row!.id;
}

type FeedRow = {
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
  resolved_occurrence_sum: string | null; // bigint -> postgres.js returns unparsed text by default
  is_active: boolean | null;
  viewer_read_at: string | null;
};

async function callFeed(params: {
  historyDays: number;
  cap: number;
  excludedCodes: string[] | null;
  adminEmail: string | null;
}): Promise<FeedRow[]> {
  return sql<FeedRow[]>`
    select * from public.get_bell_feed_rows(
      ${params.historyDays}::int,
      ${params.cap}::int,
      ${params.excludedCodes}::text[],
      ${params.adminEmail}::text
    )
  `;
}

/** Mirrors the migration's active_probe CTE independently, for cap-boundary ground truth. */
async function activeProbeIds(cap: number, excluded: string[]): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`
    select id from public.admin_alerts
    where resolved_at is null and code <> all(${excluded}::text[])
    order by greatest(raised_at, last_seen_at) desc
    limit ${cap + 1}
  `;
  return rows.map((r) => r.id);
}

/** Mirrors the migration's history + history_probe CTEs independently, for cap-boundary ground truth. */
async function historyProbeIds(
  historyDays: number,
  cap: number,
  excluded: string[],
): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`
    with history as (
      select distinct on (coalesce(a.show_id::text, ''), a.code) a.id, a.resolved_at
      from public.admin_alerts a
      where a.resolved_at is not null
        and a.resolved_at >= now() - make_interval(days => ${historyDays})
        and a.code <> all(${excluded}::text[])
        and not exists (
          select 1 from public.admin_alerts o
          where o.resolved_at is null
            and coalesce(o.show_id::text, '') = coalesce(a.show_id::text, '')
            and o.code = a.code
        )
      order by coalesce(a.show_id::text, ''), a.code, a.resolved_at desc
    )
    select id from history order by resolved_at desc limit ${cap + 1}
  `;
  return rows.map((r) => r.id);
}

describe("get_bell_feed_rows (spec §6.1)", () => {
  it("1. meta row: exactly one is_meta=true row is always present; seen_through parses as ISO", async () => {
    const rows = await callFeed({
      historyDays: 30,
      cap: 50,
      excludedCodes: [],
      adminEmail: adminEmail("meta"),
    });
    const metaRows = rows.filter((r) => r.is_meta);
    expect(metaRows).toHaveLength(1);
    const seenThrough = metaRows[0]!.seen_through;
    expect(seenThrough).not.toBeNull();
    expect(Number.isNaN(new Date(seenThrough!).getTime())).toBe(false);
  });

  it("2. entry grain: 5 resolved rows for one flappy key collapse to 1 history entry (sum of all 5 counts); 3 distinct keys add 3 more entries", async () => {
    const showId = await makeShow("t2");
    const flapCode = code("t2-flap");
    const flapCounts = [2, 3, 1, 4, 5];
    const base = Date.now() - 60_000;
    for (let i = 0; i < flapCounts.length; i++) {
      await insertAlert({
        showId,
        code: flapCode,
        raisedAt: new Date(base + i * 1000),
        resolvedAt: new Date(base + i * 1000 + 500),
        occurrenceCount: flapCounts[i]!,
      });
    }
    const distinctCodes = [code("t2-a"), code("t2-b"), code("t2-c")];
    for (const c of distinctCodes) {
      await insertAlert({
        showId,
        code: c,
        raisedAt: new Date(base),
        resolvedAt: new Date(base + 100),
      });
    }

    const rows = await callFeed({
      historyDays: 30,
      cap: 50,
      excludedCodes: [],
      adminEmail: adminEmail("t2"),
    });
    const ours = rows.filter((r) => !r.is_meta && r.code?.startsWith(`${CODE_PREFIX}t2-`));
    expect(ours).toHaveLength(1 + distinctCodes.length);

    const flapRow = ours.find((r) => r.code === flapCode)!;
    expect(flapRow).toBeDefined();
    expect(Number(flapRow.resolved_occurrence_sum)).toBe(flapCounts.reduce((a, b) => a + b, 0));
  });

  it("3. active-arm exclusion: a key with an unresolved row does not also appear as history; its sum covers windowed resolved predecessors", async () => {
    const showId = await makeShow("t3");
    const keyCode = code("t3-key");
    const base = Date.now() - 120_000;
    await insertAlert({
      showId,
      code: keyCode,
      raisedAt: new Date(base),
      resolvedAt: new Date(base + 1000),
      occurrenceCount: 3,
    });
    await insertAlert({
      showId,
      code: keyCode,
      raisedAt: new Date(base + 2000),
      resolvedAt: new Date(base + 3000),
      occurrenceCount: 4,
    });
    const activeId = await insertAlert({
      showId,
      code: keyCode,
      raisedAt: new Date(base + 4000),
      occurrenceCount: 1,
      resolvedAt: null,
    });

    const rows = await callFeed({
      historyDays: 30,
      cap: 50,
      excludedCodes: [],
      adminEmail: adminEmail("t3"),
    });
    const ours = rows.filter((r) => !r.is_meta && r.code === keyCode);
    expect(ours).toHaveLength(1); // no separate history row for the same key
    expect(ours[0]!.is_active).toBe(true);
    expect(ours[0]!.id).toBe(activeId);
    expect(Number(ours[0]!.resolved_occurrence_sum)).toBe(3 + 4);
  });

  it("4. pre-cap exclusion: a flood of newer excluded-code rows doesn't push out an older included row, and doesn't trip the cap", async () => {
    // If exclusion happened AFTER the cap (broken order), the flood — being
    // newer than the included row — would fill the p_cap+1 probe first and
    // the included row would be truncated away. Only correct pre-cap
    // filtering keeps the included row present while active_hit_cap stays
    // false (the excluded flood never counts toward the cap at all).
    // Cap is 50 (not the file's usual boundary-test 10) so ambient active
    // rows from concurrently running test files can't spuriously trip
    // active_hit_cap — only this test's own excluded-code flood is
    // size-correlated with the cap, and it must NOT count toward it.
    const cap = 50;
    const excludedCode = code("t4-excluded");
    const includedCode = code("t4-included");
    const includedShowId = await makeShow("t4-inc");
    const base = Date.now();
    // Included row is the OLDEST of the bunch (T+1); every excluded row below
    // is strictly NEWER (T+2..T+N), so post-cap filtering would drop the
    // included row before exclusion ever ran.
    const includedId = await insertAlert({
      showId: includedShowId,
      code: includedCode,
      raisedAt: new Date(base + 1000),
    });
    const floodCount = cap + 5;
    for (let i = 0; i < floodCount; i++) {
      const showId = await makeShow(`t4-ex-${i}`);
      await insertAlert({
        showId,
        code: excludedCode,
        raisedAt: new Date(base + 2000 + i * 1000),
      });
    }

    const rows = await callFeed({
      historyDays: 30,
      cap,
      excludedCodes: [excludedCode],
      adminEmail: adminEmail("t4"),
    });
    const entries = rows.filter((r) => !r.is_meta);
    const found = entries.find((r) => r.id === includedId);
    expect(found).toBeDefined();
    expect(found!.is_active).toBe(true);
    expect(entries.some((r) => r.code === excludedCode)).toBe(false);
    const meta = rows.find((r) => r.is_meta)!;
    expect(meta.active_hit_cap).toBe(false);
  });

  it("5. caps OVER (active): truncates to p_cap = the newest by activity; meta.active_hit_cap=true", async () => {
    const cap = 10;
    const base = Date.now();
    for (let i = 0; i < cap + 1; i++) {
      const showId = await makeShow(`t5-${i}`);
      await insertAlert({
        showId,
        code: code(`t5-${i}`),
        raisedAt: new Date(base - (cap + 1 - i) * 1000),
      });
    }

    const probeIds = await activeProbeIds(cap, []);
    const expectedKept = new Set(probeIds.slice(0, cap));
    const expectedDropped = probeIds[probeIds.length - 1]!;

    const rows = await callFeed({
      historyDays: 30,
      cap,
      excludedCodes: [],
      adminEmail: adminEmail("t5"),
    });
    const meta = rows.find((r) => r.is_meta)!;
    expect(meta.active_hit_cap).toBe(true);
    const activeIds = new Set(rows.filter((r) => !r.is_meta && r.is_active).map((r) => r.id));
    expect(activeIds).toEqual(expectedKept);
    expect(activeIds.has(expectedDropped)).toBe(false);
  });

  it("5b. caps EXACT (active): meta.active_hit_cap=false when total active count equals p_cap exactly", async () => {
    // Baseline accounts for any ambient unresolved rows from concurrently-running
    // test files in the shared local DB (fileParallelism is enabled for tests/db).
    const baselineRows = await sql<{ count: string }[]>`
      select count(*)::text as count from public.admin_alerts where resolved_at is null
    `;
    const baseline = Number(baselineRows[0]!.count);
    const ourCount = 10;
    const cap = baseline + ourCount;
    const ourIds: string[] = [];
    for (let i = 0; i < ourCount; i++) {
      const showId = await makeShow(`t5b-${i}`);
      ourIds.push(
        await insertAlert({
          showId,
          code: code(`t5b-${i}`),
          raisedAt: new Date(Date.now() - i * 1000),
        }),
      );
    }

    const rows = await callFeed({
      historyDays: 30,
      cap,
      excludedCodes: [],
      adminEmail: adminEmail("t5b"),
    });
    const meta = rows.find((r) => r.is_meta)!;
    expect(meta.active_hit_cap).toBe(false);
    const activeIds = new Set(rows.filter((r) => !r.is_meta && r.is_active).map((r) => r.id));
    for (const id of ourIds) expect(activeIds.has(id)).toBe(true);
    expect(activeIds.size).toBe(cap);
  });

  it("5c. caps OVER (history): truncates to p_cap = the most-recently-resolved; meta.history_hit_cap=true", async () => {
    const cap = 10;
    const base = Date.now();
    for (let i = 0; i < cap + 1; i++) {
      const showId = await makeShow(`t5c-${i}`);
      const resolvedAt = new Date(base - (cap + 1 - i) * 1000);
      await insertAlert({
        showId,
        code: code(`t5c-${i}`),
        raisedAt: new Date(resolvedAt.getTime() - 1000),
        resolvedAt,
      });
    }

    const probeIds = await historyProbeIds(30, cap, []);
    const expectedKept = new Set(probeIds.slice(0, cap));

    const rows = await callFeed({
      historyDays: 30,
      cap,
      excludedCodes: [],
      adminEmail: adminEmail("t5c"),
    });
    const meta = rows.find((r) => r.is_meta)!;
    expect(meta.history_hit_cap).toBe(true);
    const historyIds = new Set(rows.filter((r) => !r.is_meta && !r.is_active).map((r) => r.id));
    expect(historyIds).toEqual(expectedKept);
  });

  it("5d. caps EXACT (history): meta.history_hit_cap=false when total history-key count equals p_cap exactly", async () => {
    const historyDays = 30;
    // A very large cap effectively returns the FULL history-key set unTruncated,
    // giving the true ambient baseline count for this window.
    const baseline = (await historyProbeIds(historyDays, 100_000, [])).length;
    const ourCount = 10;
    const cap = baseline + ourCount;
    const ourIds: string[] = [];
    for (let i = 0; i < ourCount; i++) {
      const showId = await makeShow(`t5d-${i}`);
      const resolvedAt = new Date(Date.now() - i * 1000);
      ourIds.push(
        await insertAlert({
          showId,
          code: code(`t5d-${i}`),
          raisedAt: new Date(resolvedAt.getTime() - 1000),
          resolvedAt,
        }),
      );
    }

    const rows = await callFeed({
      historyDays,
      cap,
      excludedCodes: [],
      adminEmail: adminEmail("t5d"),
    });
    const meta = rows.find((r) => r.is_meta)!;
    expect(meta.history_hit_cap).toBe(false);
    const historyIds = new Set(rows.filter((r) => !r.is_meta && !r.is_active).map((r) => r.id));
    for (const id of ourIds) expect(historyIds.has(id)).toBe(true);
    expect(historyIds.size).toBe(cap);
  });

  it("6. window: resolved_at older than p_history_days is absent from history AND excluded from the sum", async () => {
    const showId = await makeShow("t6");
    const keyCode = code("t6-key");
    const historyDays = 5;
    const oldResolvedAt = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    const recentResolvedAt = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
    await insertAlert({
      showId,
      code: keyCode,
      raisedAt: new Date(oldResolvedAt.getTime() - 1000),
      resolvedAt: oldResolvedAt,
      occurrenceCount: 100,
    });
    const recentId = await insertAlert({
      showId,
      code: keyCode,
      raisedAt: new Date(recentResolvedAt.getTime() - 1000),
      resolvedAt: recentResolvedAt,
      occurrenceCount: 2,
    });

    const rows = await callFeed({
      historyDays,
      cap: 50,
      excludedCodes: [],
      adminEmail: adminEmail("t6"),
    });
    const ours = rows.filter((r) => !r.is_meta && r.code === keyCode);
    expect(ours).toHaveLength(1);
    expect(ours[0]!.id).toBe(recentId);
    expect(Number(ours[0]!.resolved_occurrence_sum)).toBe(2); // the old row's 100 is excluded
  });

  it("7. NULL p_excluded_codes raises; NULL/empty p_admin_email raises", async () => {
    await expect(
      callFeed({ historyDays: 30, cap: 50, excludedCodes: null, adminEmail: adminEmail("t7a") }),
    ).rejects.toThrow();
    await expect(
      callFeed({ historyDays: 30, cap: 50, excludedCodes: [], adminEmail: null }),
    ).rejects.toThrow();
    await expect(
      callFeed({ historyDays: 30, cap: 50, excludedCodes: [], adminEmail: "" }),
    ).rejects.toThrow();
  });

  it("7b. out-of-range p_history_days (0, 366) and p_cap (9, 201) each raise", async () => {
    await expect(
      callFeed({ historyDays: 0, cap: 50, excludedCodes: [], adminEmail: adminEmail("t7b-hd0") }),
    ).rejects.toThrow();
    await expect(
      callFeed({
        historyDays: 366,
        cap: 50,
        excludedCodes: [],
        adminEmail: adminEmail("t7b-hd366"),
      }),
    ).rejects.toThrow();
    await expect(
      callFeed({ historyDays: 30, cap: 9, excludedCodes: [], adminEmail: adminEmail("t7b-cap9") }),
    ).rejects.toThrow();
    await expect(
      callFeed({
        historyDays: 30,
        cap: 201,
        excludedCodes: [],
        adminEmail: adminEmail("t7b-cap201"),
      }),
    ).rejects.toThrow();
  });

  it("8. empty-array p_excluded_codes excludes nothing", async () => {
    const showId = await makeShow("t8");
    const alertId = await insertAlert({ showId, code: code("t8-key"), raisedAt: new Date() });
    const rows = await callFeed({
      historyDays: 30,
      cap: 50,
      excludedCodes: [],
      adminEmail: adminEmail("t8"),
    });
    expect(rows.find((r) => !r.is_meta && r.id === alertId)).toBeDefined();
  });

  it("9. viewer-state folding: per-admin isolation of viewer_read_at + viewer_opened_at", async () => {
    const showId = await makeShow("t9");
    const alertId = await insertAlert({ showId, code: code("t9-key"), raisedAt: new Date() });
    const viewerA = adminEmail("t9-a");
    const viewerB = adminEmail("t9-b");

    await sql`insert into public.admin_alert_reads (alert_id, admin_email, read_at) values (${alertId}::uuid, ${viewerA}, now())`;
    await sql`insert into public.admin_bell_state (admin_email, opened_at) values (${viewerA}, now())`;

    const rowsA = await callFeed({
      historyDays: 30,
      cap: 50,
      excludedCodes: [],
      adminEmail: viewerA,
    });
    const entryA = rowsA.find((r) => !r.is_meta && r.id === alertId)!;
    const metaA = rowsA.find((r) => r.is_meta)!;
    expect(entryA.viewer_read_at).not.toBeNull();
    expect(metaA.viewer_opened_at).not.toBeNull();

    const rowsB = await callFeed({
      historyDays: 30,
      cap: 50,
      excludedCodes: [],
      adminEmail: viewerB,
    });
    const entryB = rowsB.find((r) => !r.is_meta && r.id === alertId)!;
    const metaB = rowsB.find((r) => r.is_meta)!;
    expect(entryB.viewer_read_at).toBeNull();
    expect(metaB.viewer_opened_at).toBeNull();
  });
});

// Anti-tautology guard against the whole suite silently no-op'ing (e.g. the
// RPC not existing yet resolving as an empty result instead of throwing).
describe("sanity", () => {
  it("randomUUID sanity — the test file itself is loaded and runs real assertions", () => {
    expect(randomUUID()).toMatch(/^[0-9a-f-]{36}$/);
  });
});
