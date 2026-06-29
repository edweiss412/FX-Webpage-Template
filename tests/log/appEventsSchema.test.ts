import { afterAll, describe, expect, test } from "vitest";
import postgres from "postgres";

const url =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
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
    await sql`insert into public.app_events (level, source, message, occurred_at)
              values ('info','prune-test','old', now() - interval '90 days'),
                     ('info','prune-test','new', now())`;
    const deleted = await sql<{ n: number }[]>`select public.prune_app_events(interval '60 days') as n`;
    expect(Number(deleted[0]!.n)).toBeGreaterThanOrEqual(1);
    const remaining = await sql<{ message: string }[]>`
      select message from public.app_events where source = 'prune-test'`;
    expect(remaining.map((r) => r.message)).toEqual(["new"]);
    await sql`delete from public.app_events where source = 'prune-test'`;
  });

  test("prune cron job is registered", async () => {
    const jobs = await sql<{ jobname: string }[]>`
      select jobname from cron.job where jobname = 'app_events_prune'`;
    expect(jobs.length).toBe(1);
  });
});
