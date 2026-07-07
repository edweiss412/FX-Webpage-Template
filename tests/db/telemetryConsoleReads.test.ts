/**
 * tests/db/telemetryConsoleReads.test.ts
 *
 * Behavioral + existence + privilege coverage for the two read-only telemetry
 * aggregate functions (migration 20260706120000). Direct postgres.js only (no
 * Supabase REST creds) → runs in unit-suite against LOCAL (bootstrap-applied
 * migration) and is correct against validation too.
 *
 * The real service_role rpc() PostgREST smoke lives in the sibling
 * telemetryConsoleReads.rpc.test.ts (validation-scoped, gated by
 * RUN_VALIDATION_RPC_SMOKE) — see spec §14.
 *
 * Behavioral cases run inside a ROLLBACK'd transaction (Symbol sentinel), so no
 * fixture is ever committed to the persistent DB. admin_event_stats_24h uses a
 * pinned 2020 window (asserted empty before seeding); admin_alert_summary uses
 * synthetic test-only codes so persistent alerts can't pollute the counts.
 */
import { afterAll, describe, expect, it } from "vitest";
import postgres, { type Sql } from "postgres";

const DB_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const sql: Sql = postgres(DB_URL, { max: 2, prepare: false });

afterAll(async () => {
  await sql.end({ timeout: 5 });
});

const ROLLBACK = Symbol("rollback");
const STATS_SIG = "public.admin_event_stats_24h(timestamptz)";
const SUMMARY_SIG = "public.admin_alert_summary(text[],text[])";

describe("telemetry console reads — DB functions", () => {
  it("both functions exist and are service_role-executable, not public", async () => {
    for (const sig of [STATS_SIG, SUMMARY_SIG]) {
      const [{ oid }] = await sql`select to_regprocedure(${sig})::text as oid`;
      expect(oid, `${sig} must exist`).not.toBeNull();
      const [{ svc }] = await sql`select has_function_privilege('service_role', ${sig}, 'EXECUTE') as svc`;
      expect(svc, `${sig} EXECUTE granted to service_role`).toBe(true);
      for (const role of ["anon", "authenticated"]) {
        const [{ ok }] = await sql`select has_function_privilege(${role}, ${sig}, 'EXECUTE') as ok`;
        expect(ok, `${sig} not executable by ${role}`).toBe(false);
      }
    }
  });

  it("admin_event_stats_24h buckets/levels are correct in an isolated 2020 window", async () => {
    const NOW = "2020-01-02T05:30:00Z"; // pinned historical hour
    try {
      await sql.begin(async (tx) => {
        const [{ n }] = await tx`
          select count(*)::int as n from public.app_events
          where occurred_at >= (date_trunc('hour', ${NOW}::timestamptz) - interval '23 hours')
            and occurred_at <  (date_trunc('hour', ${NOW}::timestamptz) + interval '1 hour')`;
        expect(n, "pinned 2020 window must be empty before seeding").toBe(0);

        const cur = "2020-01-02T05:10:00Z"; // current hour → bucket 23
        const older = "2020-01-02T00:15:00Z"; // 5h before cur hour → bucket 18
        const outside = "2019-12-30T00:00:00Z"; // out of window
        const rows: Array<[string, string]> = [
          [cur, "error"],
          [cur, "error"],
          [cur, "warn"],
          [older, "info"],
          [outside, "error"],
        ];
        for (const [ts, lvl] of rows) {
          await tx`
            insert into public.app_events (occurred_at, level, source, message, context)
            values (${ts}::timestamptz, ${lvl}, 'test.stats', 'x', '{}'::jsonb)`;
        }

        const [row] = await tx`select * from public.admin_event_stats_24h(${NOW}::timestamptz)`;
        expect(Number(row.total)).toBe(4);
        expect(Number(row.error_count)).toBe(2);
        expect(Number(row.warn_count)).toBe(1);
        expect(Number(row.info_count)).toBe(1);
        const buckets = (row.buckets as number[]).map(Number);
        expect(buckets.length).toBe(24);
        expect(buckets.reduce((a, b) => a + b, 0)).toBe(4);
        expect(buckets[23]).toBe(3); // current hour: 2 errors + 1 warn
        expect(buckets[18]).toBe(1); // 5h ago: 1 info
        throw ROLLBACK;
      });
    } catch (err) {
      if (err !== ROLLBACK) throw err;
    }
  });

  it("admin_alert_summary counts only fixtures via synthetic codes", async () => {
    const H = ["__ts_h1__", "__ts_h2__", "__ts_deg__"];
    const D = ["__ts_deg__"];
    try {
      await sql.begin(async (tx) => {
        // 3 unresolved health (h1, h2, deg) + 1 RESOLVED health + 1 unlisted code
        await tx`insert into public.admin_alerts (code, context) values ('__ts_h1__', '{}'::jsonb)`;
        await tx`insert into public.admin_alerts (code, context) values ('__ts_h2__', '{}'::jsonb)`;
        await tx`insert into public.admin_alerts (code, context) values ('__ts_deg__', '{}'::jsonb)`;
        await tx`insert into public.admin_alerts (code, context, resolved_at) values ('__ts_h1__', '{}'::jsonb, now())`;
        await tx`insert into public.admin_alerts (code, context) values ('__ts_unlisted__', '{}'::jsonb)`;

        const [row] = await tx`select * from public.admin_alert_summary(${H}::text[], ${D}::text[])`;
        expect(Number(row.total)).toBe(3); // h1, h2, deg unresolved; resolved h1 + unlisted excluded
        expect(Number(row.degraded)).toBe(1); // deg only
        expect(Number(row.total) - Number(row.degraded)).toBeGreaterThanOrEqual(0);
        throw ROLLBACK;
      });
    } catch (err) {
      if (err !== ROLLBACK) throw err;
    }
  });
});
