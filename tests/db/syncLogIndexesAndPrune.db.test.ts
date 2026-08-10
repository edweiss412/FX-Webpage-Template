/**
 * tests/db/syncLogIndexesAndPrune.db.test.ts (Task 5, 2026-08-09)
 *
 * Indexes, the retention function, and the cron row that calls it.
 *
 * The prune assertions run inside an ALWAYS-ROLLED-BACK transaction. An uncommitted
 * prune cannot permanently delete unrelated old rows from the local database; a
 * committing one can, and asserting only `>= 1` on the return leaves that invisible.
 *
 * The returned count is asserted against a MEASURED BASELINE, not a fixture-scoped
 * count. `prune_sync_log` returns a GLOBAL count and the suite cannot know how many
 * unrelated old rows exist, so the baseline is read inside the same transaction
 * immediately before the prune. Survival assertions stay scoped to the fixture marker,
 * where scoping is correct.
 */
import { afterAll, describe, expect, test } from "vitest";
import postgres, { type Sql } from "postgres";
import { assertLocalDbUrl } from "./_localDbUrl";

const DB_URL = assertLocalDbUrl(
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
);
const sql: Sql = postgres(DB_URL, { max: 2, prepare: false });

afterAll(async () => {
  await sql.end({ timeout: 5 });
});

describe("sync_log indexes (spec §3.4)", () => {
  test("both public indexes exist with the queried column order and DESC", async () => {
    const rows = await sql<{ indexname: string; indexdef: string }[]>`
      select indexname, indexdef from pg_indexes
      where schemaname = 'public' and tablename = 'sync_log'
        and indexname in ('sync_log_show_id_idx', 'sync_log_drive_file_id_idx')
      order by indexname
    `;
    expect(rows.map((r) => r.indexname)).toEqual([
      "sync_log_drive_file_id_idx",
      "sync_log_show_id_idx",
    ]);
    // Column ORDER and direction, not mere existence: an index on (occurred_at,
    // show_id) exists under the same name and does not serve the per-show read, and
    // an ASC index forces a sort the query's own `order by occurred_at desc` avoids.
    const byName = Object.fromEntries(rows.map((r) => [r.indexname, r.indexdef]));
    expect(byName["sync_log_show_id_idx"]).toMatch(/\(show_id,\s*occurred_at DESC\)/i);
    expect(byName["sync_log_drive_file_id_idx"]).toMatch(/\(drive_file_id,\s*occurred_at DESC\)/i);
  });

  test("the dev-schema index creation is guarded by to_regclass in the migration text", async () => {
    // A source assertion, because the guard's whole purpose is what happens on a
    // project where `dev.sync_log` does NOT exist — which is not this database. An
    // ungated form would abort the migration on validation and production, and no
    // local query can observe that.
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const migration = readFileSync(
      join(process.cwd(), "supabase/migrations/20260809000000_sync_log_show_attribution.sql"),
      "utf8",
    );
    expect(migration).toMatch(/to_regclass\('dev\.sync_log'\) is not null/);
    // And the dev index must sit INSIDE that guard, not merely somewhere in the file.
    const guarded = migration.match(
      /if to_regclass\('dev\.sync_log'\) is not null then[\s\S]*?end if;/,
    );
    expect(guarded).not.toBeNull();
    expect(guarded![0]).toMatch(/on dev\.sync_log \(show_id/);
    expect(guarded![0]).toMatch(/on dev\.sync_log \(drive_file_id/);
  });

  test("when dev.sync_log exists locally, its indexes were created too", async () => {
    const [present] = await sql<{ exists: boolean }[]>`
      select to_regclass('dev.sync_log') is not null as exists
    `;
    if (!present!.exists) {
      // Premise false here: state it rather than passing silently, so a reader cannot
      // mistake this for a verified claim about the dev schema.
      expect(present!.exists).toBe(false);
      return;
    }
    const rows = await sql<{ indexname: string }[]>`
      select indexname from pg_indexes where schemaname = 'dev' and tablename = 'sync_log'
      order by indexname
    `;
    expect(rows.map((r) => r.indexname)).toEqual(
      expect.arrayContaining(["sync_log_drive_file_id_idx", "sync_log_show_id_idx"]),
    );
  });
});

describe("prune_sync_log (spec §3.5)", () => {
  test("exists with the prune_app_events security posture", async () => {
    const [fn] = await sql<{ prosecdef: boolean; config: string[] | null; args: string }[]>`
      select p.prosecdef,
             p.proconfig as config,
             pg_get_function_arguments(p.oid) as args
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'prune_sync_log'
    `;
    expect(fn, "prune_sync_log does not exist").toBeDefined();
    expect(fn!.prosecdef).toBe(true);
    expect(fn!.config).toEqual(["search_path=public, pg_temp"]);
    // The DEFAULT is what actually ships: the cron command calls prune_sync_log()
    // with no argument, so a mutant changing the default satisfies every
    // explicit-cutoff assertion below while production retention silently changes.
    expect(fn!.args).toMatch(/retain interval DEFAULT '60 days'/i);
  });

  test("executable by service_role, not by anon or authenticated", async () => {
    const [grants] = await sql<{ service: boolean; anon: boolean; auth: boolean }[]>`
      select has_function_privilege('service_role', 'public.prune_sync_log(interval)', 'execute') as service,
             has_function_privilege('anon',         'public.prune_sync_log(interval)', 'execute') as anon,
             has_function_privilege('authenticated','public.prune_sync_log(interval)', 'execute') as auth
    `;
    expect(grants!.service).toBe(true);
    expect(grants!.anon).toBe(false);
    expect(grants!.auth).toBe(false);
  });

  test("deletes exactly the rows past the cutoff, and the count equals a measured baseline", async () => {
    const MARKER = `prune-fixture-${process.pid}`;
    await sql
      .begin(async (tx) => {
        await tx`
        insert into public.sync_log (drive_file_id, status, message, occurred_at)
        values (${`${MARKER}-old`},   'x', 'old',   now() - interval '90 days'),
               (${`${MARKER}-edge`},  'x', 'edge',  now() - interval '61 days'),
               (${`${MARKER}-fresh`}, 'x', 'fresh', now() - interval '1 day')
      `;

        // The oracle: a GLOBAL count read inside this same transaction, immediately
        // before the prune. Equality against a measured number, not `>= 1`, so an
        // off-by-one or a wrong cutoff fails.
        const [{ n: expected }] = await tx<{ n: number }[]>`
        select count(*)::int as n from public.sync_log
        where occurred_at < now() - interval '60 days'
      `;
        const [{ prune_sync_log: returned }] = await tx<{ prune_sync_log: number }[]>`
        select public.prune_sync_log()
      `;
        expect(returned).toBe(expected);

        // Survival, scoped to the fixture marker - where scoping IS correct.
        const survivors = await tx<{ drive_file_id: string }[]>`
        select drive_file_id from public.sync_log
        where drive_file_id like ${`${MARKER}%`} order by drive_file_id
      `;
        expect(survivors.map((r) => r.drive_file_id)).toEqual([`${MARKER}-fresh`]);

        // ALWAYS rolled back: a committing prune deletes unrelated old local rows
        // permanently, and nothing above would notice.
        throw new RollbackSignal();
      })
      .catch((e: unknown) => {
        if (!(e instanceof RollbackSignal)) throw e;
      });

    // Proof the rollback happened, not just that it was requested.
    const [{ n }] = await sql<{ n: number }[]>`
      select count(*)::int as n from public.sync_log where drive_file_id like ${`${MARKER}%`}
    `;
    expect(n).toBe(0);
  });

  test("an explicit cutoff is honoured, distinct from the default", async () => {
    const MARKER = `prune-explicit-${process.pid}`;
    await sql
      .begin(async (tx) => {
        await tx`
        insert into public.sync_log (drive_file_id, status, message, occurred_at)
        values (${`${MARKER}-a`}, 'x', 'a', now() - interval '10 days')
      `;
        // 10 days old: retained by the 60-day default, deleted by a 5-day cutoff. That
        // difference is what proves the parameter is read rather than ignored.
        const [{ n: before }] = await tx<{ n: number }[]>`
        select count(*)::int as n from public.sync_log where drive_file_id = ${`${MARKER}-a`}
      `;
        expect(before).toBe(1);
        await tx`select public.prune_sync_log(interval '5 days')`;
        const [{ n: after }] = await tx<{ n: number }[]>`
        select count(*)::int as n from public.sync_log where drive_file_id = ${`${MARKER}-a`}
      `;
        expect(after).toBe(0);
        throw new RollbackSignal();
      })
      .catch((e: unknown) => {
        if (!(e instanceof RollbackSignal)) throw e;
      });
  });
});

describe("sync_log_prune cron row (spec §3.5)", () => {
  test("is scheduled, active, and calls the no-argument form", async () => {
    const [job] = await sql<{ schedule: string; command: string; active: boolean }[]>`
      select schedule, command, active from cron.job where jobname = 'sync_log_prune'
    `;
    expect(job, "sync_log_prune is not scheduled").toBeDefined();
    expect(job!.command).toBe("select public.prune_sync_log();");
    expect(job!.schedule).toBe("23 4 * * *");
    // A migration that schedules the correct command and then disables the job
    // satisfies every other assertion here while retention never runs.
    expect(job!.active).toBe(true);
  });
});

class RollbackSignal extends Error {
  constructor() {
    super("intentional rollback");
    this.name = "RollbackSignal";
  }
}
