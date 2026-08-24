import { afterAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { assertLocalDbUrl } from "../db/_localDbUrl";

// This file executes public.prune_app_events(), and it resolved its URL from
// TEST_DATABASE_URL - which is the VALIDATION project in this repo's .env.local. A
// plain `pnpm test` therefore pruned live validation history. Repaired 2026-08-09
// when the destructive-target guard was extended to discover prune calls; this was a
// real, present hazard independent of that change.
const url = assertLocalDbUrl(
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
);
const sql = postgres(url, { max: 1 });
afterAll(async () => {
  await sql.end();
});

describe("app_events schema", () => {
  test("table + columns exist with the expected names", async () => {
    const cols = await sql<{ column_name: string }[]>`
      select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'app_events' order by column_name`;
    const names = cols.map((c) => c.column_name).sort();
    expect(names).toEqual(
      [
        "actor_hash",
        "code",
        "context",
        "drive_file_id",
        "id",
        "level",
        "message",
        "occurred_at",
        "request_id",
        "show_id",
        "source",
      ].sort(),
    );
  });

  test("level CHECK accepts info/warn/error and rejects debug", async () => {
    for (const level of ["info", "warn", "error"]) {
      await sql`insert into public.app_events (level, source, message) values (${level}, 't', ${level})`;
    }
    const accepted = await sql<{ level: string }[]>`
      select level from public.app_events where source = 't' order by level`;
    expect(accepted.map((r) => r.level)).toEqual(["error", "info", "warn"]);
    await expect(
      sql`insert into public.app_events (level, source, message) values ('debug','t','m')`,
    ).rejects.toThrow();
    await sql`delete from public.app_events where source = 't'`;
  });

  test("anon + authenticated have no DML; service_role retains all", async () => {
    const rows = await sql<{ g: string; p: string; ok: boolean }[]>`
      select grantee g, privilege_type p,
             has_table_privilege(grantee, 'public.app_events', privilege_type) ok
      from (values ('anon','INSERT'),('authenticated','DELETE'),
                   ('service_role','DELETE'),('service_role','INSERT')) as e(grantee, privilege_type)`;
    const map = Object.fromEntries(rows.map((r) => [`${r.g}:${r.p}`, r.ok]));
    expect(map["anon:INSERT"]).toBe(false);
    expect(map["authenticated:DELETE"]).toBe(false);
    expect(map["service_role:DELETE"]).toBe(true);
    expect(map["service_role:INSERT"]).toBe(true);
  });

  test("prune_app_events deletes only rows older than retain", async () => {
    // Pinning the URL to loopback stops the VALIDATION project being pruned; it does
    // nothing about the LOCAL database, where this test used to COMMIT a global prune
    // and accept `>= 1`. Old unrelated local rows were deleted permanently on every
    // run, and a prune returning a wrong count stayed green. Both are closed here.
    class Rollback extends Error {}
    await sql
      .begin(async (tx) => {
        await tx`insert into public.app_events (level, source, message, occurred_at)
                 values ('info','prune-test','old', now() - interval '90 days'),
                        ('info','prune-test','new', now())`;

        // The returned count is GLOBAL, so a fixture-scoped number is the wrong
        // oracle for it. Measure the baseline inside this same transaction,
        // immediately before the prune, and assert equality - not `>= 1`, which any
        // over-deletion also satisfies.
        const [expectedRow] = await tx<{ n: number }[]>`
          select count(*)::int as n from public.app_events
          where occurred_at < now() - interval '60 days'`;
        const [returnedRow] = await tx<
          { n: number }[]
        >`select public.prune_app_events(interval '60 days') as n`;
        expect(Number(returnedRow!.n)).toBe(expectedRow!.n);

        // Survival stays fixture-scoped, where scoping IS correct.
        const remaining = await tx<{ message: string }[]>`
          select message from public.app_events where source = 'prune-test'`;
        expect(remaining.map((r) => r.message)).toEqual(["new"]);

        throw new Rollback();
      })
      .catch((e: unknown) => {
        if (!(e instanceof Rollback)) throw e;
      });

    // Proof the rollback happened, rather than proof it was requested.
    const [outsideRow] = await sql<{ n: number }[]>`
      select count(*)::int as n from public.app_events where source = 'prune-test'`;
    expect(outsideRow!.n).toBe(0);
  });

  test("prune cron job is registered, active, and calls the no-argument form", async () => {
    const jobs = await sql<
      { jobname: string; command: string; schedule: string; active: boolean }[]
    >`
      select jobname, command, schedule, active from cron.job where jobname = 'app_events_prune'`;
    expect(jobs.length).toBe(1);
    // The posture gate has NO opinion about the argument. A row rewritten to
    // prune_app_events(interval '5 days') refuses on validation exactly as
    // designed and silently deletes production events aged 5 to 60 days, so the
    // argument needs its own pin. Mirrors the sync_log_prune assertions at
    // tests/db/syncLogIndexesAndPrune.db.test.ts:219-223.
    expect(jobs[0]!.command).toBe("select public.prune_app_events();");
    expect(jobs[0]!.schedule).toBe("17 4 * * *");
    // Its twin: a correct command on a disabled job, where retention never runs.
    expect(jobs[0]!.active).toBe(true);
  });
});
