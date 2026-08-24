/**
 * tests/db/pruneGate.db.test.ts (Task 1, 2026-08-22)
 *
 * The database-side posture gate on public.prune_sync_log / public.prune_app_events.
 *
 * Both prunes delete GLOBALLY by time window, so a suite written to catch a missing
 * or inverted gate is a suite that performs that deletion when the gate is broken.
 * Spec §6 answers that structurally: EVERY call to either function here runs inside a
 * transaction that is always rolled back — including the marker-`false` cases that are
 * supposed to delete, and including AC-3's deletion of the marker row itself. No call
 * is exempted by an argument that it cannot delete; spec rounds 3 and 4 each found one
 * such argument to be wrong.
 *
 * Expected exceptions are isolated in SAVEPOINTs rather than sharing the enclosing
 * transaction (spec §6 rule 2). An uncaught error aborts a Postgres transaction, so a
 * naive shared transaction would make AC-2's read-back — the assertion that carries the
 * non-deletion claim — vacuous rather than failing.
 *
 * Every refusal assertion fails when the call SUCCEEDS, not merely when it errors
 * wrongly: `rejects.toThrow(...)` fails on a resolved promise by construction.
 */
import { afterAll, describe, expect, test } from "vitest";
import postgres, { type Sql, type TransactionSql } from "postgres";
import { assertLocalDbUrl } from "./_localDbUrl";

// SAFETY: this suite flips destructive_reset_gate and calls two global DELETE
// functions. TEST_DATABASE_URL is the validation project in this repo and is
// deliberately NOT honored here — see tests/db/_localDbUrl.ts.
const DB_URL = assertLocalDbUrl(
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
);
const sql: Sql = postgres(DB_URL, { max: 2, prepare: false });

afterAll(async () => {
  await sql.end({ timeout: 5 });
});

class RollbackSignal extends Error {
  constructor() {
    super("intentional rollback");
    this.name = "RollbackSignal";
  }
}

/**
 * Runs `body` in a transaction that is ALWAYS rolled back (spec §6 rule 1).
 * The RollbackSignal is thrown after the body and swallowed here.
 */
async function rolledBack(body: (tx: TransactionSql) => Promise<void>): Promise<void> {
  await sql
    .begin(async (tx) => {
      await body(tx);
      throw new RollbackSignal();
    })
    .catch((e: unknown) => {
      if (!(e instanceof RollbackSignal)) throw e;
    });
}

/**
 * Forces the posture marker to a known state and restores it to `false` in a
 * `finally` (spec §6 rule 3). These writes COMMIT — the marker is the one thing
 * that safely may, and leaving it `true` would disable the reset gate's own suite.
 */
async function withPosture<T>(enabled: boolean, body: () => Promise<T>): Promise<T> {
  await sql`update public.destructive_reset_gate set enabled = ${enabled} where id = 'default'`;
  try {
    return await body();
  } finally {
    await sql`update public.destructive_reset_gate set enabled = false where id = 'default'`;
  }
}

type Target = {
  fn: "prune_sync_log" | "prune_app_events";
  table: "sync_log" | "app_events";
  seedOld: (tx: TransactionSql, marker: string) => Promise<unknown>;
  countMarker: (tx: TransactionSql, marker: string) => Promise<{ n: number }[]>;
  callDefault: (tx: TransactionSql) => Promise<Record<string, number>[]>;
  callExplicit: (tx: TransactionSql) => Promise<unknown>;
  countPastDefaultCutoff: (tx: TransactionSql) => Promise<{ n: number }[]>;
};

const TARGETS: Target[] = [
  {
    fn: "prune_sync_log",
    table: "sync_log",
    seedOld: (tx, marker) =>
      tx`insert into public.sync_log (drive_file_id, status, message, occurred_at)
         values (${marker}, 'x', 'old', now() - interval '90 days')`,
    countMarker: (tx, marker) =>
      tx<{ n: number }[]>`select count(*)::int as n from public.sync_log
                          where drive_file_id = ${marker}`,
    callDefault: (tx) => tx<Record<string, number>[]>`select public.prune_sync_log()`,
    callExplicit: (tx) => tx`select public.prune_sync_log(interval '5 days')`,
    countPastDefaultCutoff: (tx) =>
      tx<{ n: number }[]>`select count(*)::int as n from public.sync_log
                          where occurred_at < now() - interval '60 days'`,
  },
  {
    fn: "prune_app_events",
    table: "app_events",
    seedOld: (tx, marker) =>
      tx`insert into public.app_events (level, source, message, occurred_at)
         values ('info', ${marker}, 'old', now() - interval '90 days')`,
    countMarker: (tx, marker) =>
      tx<{ n: number }[]>`select count(*)::int as n from public.app_events
                          where source = ${marker}`,
    callDefault: (tx) => tx<Record<string, number>[]>`select public.prune_app_events()`,
    callExplicit: (tx) => tx`select public.prune_app_events(interval '5 days')`,
    countPastDefaultCutoff: (tx) =>
      tx<{ n: number }[]>`select count(*)::int as n from public.app_events
                          where occurred_at < now() - interval '60 days'`,
  },
];

for (const t of TARGETS) {
  describe(`${t.fn} — posture gate (spec §6)`, () => {
    // AC-1
    test("rejects under the validation posture", async () => {
      await withPosture(true, async () => {
        await rolledBack(async (tx) => {
          await expect(tx.savepoint((sp: TransactionSql) => t.callDefault(sp))).rejects.toThrow(
            /prune not enabled for this database/i,
          );
        });
      });
    });

    // AC-2 — the refusal is a NON-DELETION at the committed outcome.
    test("refusing leaves a row past the cutoff in place", async () => {
      const MARKER = `prune-gate-${t.table}-${process.pid}`;
      await withPosture(true, async () => {
        await rolledBack(async (tx) => {
          await t.seedOld(tx, MARKER);
          // The savepoint is load-bearing: without it the raise aborts the
          // enclosing transaction and the read-back below cannot run at all,
          // which would report as an error rather than as the non-deletion claim.
          await expect(tx.savepoint((sp: TransactionSql) => t.callDefault(sp))).rejects.toThrow(
            /prune not enabled for this database/i,
          );
          const [after] = await t.countMarker(tx, MARKER);
          expect(after!.n).toBe(1);
        });
      });
    });

    // AC-3 — every posture state, including the absent marker.
    test("marker false runs and returns the global count measured in the same transaction", async () => {
      const MARKER = `prune-gate-runs-${t.table}-${process.pid}`;
      await withPosture(false, async () => {
        await rolledBack(async (tx) => {
          // Seeding is load-bearing, not scene-setting. The local database holds
          // ZERO rows past the 60-day cutoff, so without a seeded row this case
          // compares 0 to 0 and passes against a prune that deletes nothing at
          // all — the tautology this suite exists to avoid.
          await t.seedOld(tx, MARKER);
          const [due] = await t.countPastDefaultCutoff(tx);
          expect(due!.n, "no row past the cutoff, so this case proves nothing").toBeGreaterThan(0);
          const [returned] = await t.callDefault(tx);
          expect(returned![t.fn]).toBe(due!.n);
          // and the seeded row is the one that went
          const [gone] = await t.countMarker(tx, MARKER);
          expect(gone!.n).toBe(0);
        });
      });
    });

    test("marker true rejects", async () => {
      await withPosture(true, async () => {
        await rolledBack(async (tx) => {
          await expect(tx.savepoint((sp: TransactionSql) => t.callDefault(sp))).rejects.toThrow(
            /prune not enabled for this database/i,
          );
        });
      });
    });

    test("an ABSENT marker row rejects, which a coalesce(..., false) read would wave through", async () => {
      await withPosture(false, async () => {
        await rolledBack(async (tx) => {
          // Deleted INSIDE the rolled-back transaction, so the rollback restores
          // the row as surely as withPosture's finally does.
          await tx`delete from public.destructive_reset_gate where id = 'default'`;
          const [gone] = await tx<{ n: number }[]>`
            select count(*)::int as n from public.destructive_reset_gate where id = 'default'`;
          expect(gone!.n, "the marker row was not actually deleted").toBe(0);
          await expect(tx.savepoint((sp: TransactionSql) => t.callDefault(sp))).rejects.toThrow(
            /prune not enabled for this database/i,
          );
        });
      });
    });

    // AC-4 — the explicit-cutoff form is gated too.
    test("the explicit-cutoff form rejects under the validation posture", async () => {
      await withPosture(true, async () => {
        await rolledBack(async (tx) => {
          await expect(tx.savepoint((sp: TransactionSql) => t.callExplicit(sp))).rejects.toThrow(
            /prune not enabled for this database/i,
          );
        });
      });
    });

    // AC-5 — the pinned function properties survive. Reads the catalog, calls nothing.
    test("keeps its security posture, pinned search_path, shipped default and grants", async () => {
      const [fn] = await sql<
        { prosecdef: boolean; config: string[] | null; args: string; lang: string }[]
      >`
        select p.prosecdef,
               p.proconfig as config,
               pg_get_function_arguments(p.oid) as args,
               l.lanname as lang
        from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
          join pg_language l on l.oid = p.prolang
        where n.nspname = 'public' and p.proname = ${t.fn}
      `;
      expect(fn, `${t.fn} does not exist`).toBeDefined();
      expect(fn!.prosecdef).toBe(true);
      expect(fn!.config).toEqual(["search_path=public, pg_temp"]);
      expect(fn!.args).toMatch(/retain interval DEFAULT '60 days'/i);
      // Declared, not incidental: a language that cannot raise cannot carry the gate.
      expect(fn!.lang).toBe("plpgsql");

      const [grants] = await sql<{ service: boolean; anon: boolean; auth: boolean }[]>`
        select has_function_privilege('service_role',  ${`public.${t.fn}(interval)`}, 'execute') as service,
               has_function_privilege('anon',          ${`public.${t.fn}(interval)`}, 'execute') as anon,
               has_function_privilege('authenticated', ${`public.${t.fn}(interval)`}, 'execute') as auth
      `;
      expect(grants!.service).toBe(true);
      expect(grants!.anon).toBe(false);
      expect(grants!.auth).toBe(false);
    });

    // AC-9 (half) — the gate is reached before any delete, in the shipped body.
    test("calls the assert ahead of its delete, so no channel can walk past it", async () => {
      const [fn] = await sql<{ prosrc: string }[]>`
        select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = ${t.fn}
      `;
      expect(fn, `${t.fn} does not exist`).toBeDefined();
      const src = fn!.prosrc;
      const assertAt = src.indexOf("perform public.assert_prune_enabled();");
      const deleteAt = src.toLowerCase().indexOf("delete from");
      expect(assertAt, "the assert call is absent from the shipped body").toBeGreaterThanOrEqual(0);
      expect(deleteAt, "the delete is absent from the shipped body").toBeGreaterThanOrEqual(0);
      expect(assertAt).toBeLessThan(deleteAt);
    });
  });
}

// AC-9 (the other half) — the shipped bodies are pinned to LITERALS HELD HERE, not
// to whatever the migration currently says.
//
// The first version of this pinned prosrc against the body read out of the migration
// file, which is circular: adding channel-dependent logic to the migration moves BOTH
// sides of the comparison and the assertion still passes. Whole-diff review r1 found
// it, with a mutant that put the assert behind `current_setting('request.jwt.claims',
// true) is null` — textually still ahead of the delete, so the ordering check below
// passed too, every psql-driven refusal above kept passing, and both PostgREST RPCs
// would have gone on deleting. That is exactly the implementation spec R8 named and
// AC-9 exists to exclude.
//
// Pinning to a literal here gives the accept-set of exactly one the spec asked for: a
// change to any of these three bodies fails this file, and re-pinning is a deliberate
// edit someone has to make, in the diff, where review can see it.
//
// There is deliberately NO companion denylist over channel-discriminating constructs.
// One shipped briefly, rejecting `request.jwt.claims` and `current_setting`, and diff
// review r2 defeated it with `session_user = 'postgres'` — psql connects as postgres,
// PostgREST as authenticator, and security definer changes neither. That is an OPEN
// class (`current_user`, `inet_client_addr()`, `application_name`, and so on), and
// growing a denylist one construct per review round is the arms race this repo's
// round-economy rule exists to stop. The residue is recorded in spec §4.8 rather than
// chased here: it is a code-review boundary, not one a test file can hold.
const SHIPPED_BODIES = {
  assert_prune_enabled: `
declare
  v_validation boolean;
begin
  select enabled into v_validation from public.destructive_reset_gate where id = 'default';
  -- true => this database declares the validation posture (D4) => refuse
  -- null => no posture marker at all                           => refuse
  if v_validation is not false then
    raise exception 'prune not enabled for this database';
  end if;
end;
`,
  prune_sync_log: `
declare
  v_deleted integer;
begin
  perform public.assert_prune_enabled();
  with deleted as (
    delete from public.sync_log where occurred_at < now() - retain returning 1
  )
  select count(*)::int into v_deleted from deleted;
  return v_deleted;
end;
`,
  prune_app_events: `
declare
  v_deleted integer;
begin
  perform public.assert_prune_enabled();
  with deleted as (
    delete from public.app_events where occurred_at < now() - retain returning 1
  )
  select count(*)::int into v_deleted from deleted;
  return v_deleted;
end;
`,
} as const;

describe("the three shipped bodies are pinned to one exact program each", () => {
  // Line structure is SIGNIFICANT and must survive normalisation. Collapsing
  // newlines was diff review r3's finding: `--` runs to end of line, so pulling
  // the `if` block up onto a comment line comments the whole refusal out while
  // normalising to a byte-identical string. The pin accepted a body that only
  // read the marker and returned. So: trim each line's trailing whitespace and
  // drop leading/blank edges, and keep every newline.
  const normalise = (s: string) =>
    s
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((line) => line.trimEnd())
      .join("\n")
      .replace(/^\n+/, "")
      .replace(/\n+$/, "");

  for (const [name, expected] of Object.entries(SHIPPED_BODIES)) {
    test(`${name} prosrc equals its pinned body`, async () => {
      const [fn] = await sql<{ prosrc: string }[]>`
        select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = ${name}
      `;
      expect(fn, `${name} does not exist`).toBeDefined();
      expect(normalise(fn!.prosrc)).toBe(normalise(expected));
    });
  }
});

describe("assert_prune_enabled — posture", () => {
  test("is service_role-only, security definer, with the pinned search_path", async () => {
    const [fn] = await sql<{ prosecdef: boolean; config: string[] | null; lang: string }[]>`
      select p.prosecdef, p.proconfig as config, l.lanname as lang
      from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        join pg_language l on l.oid = p.prolang
      where n.nspname = 'public' and p.proname = 'assert_prune_enabled'
    `;
    expect(fn, "assert_prune_enabled does not exist").toBeDefined();
    expect(fn!.prosecdef).toBe(true);
    expect(fn!.config).toEqual(["search_path=public, pg_temp"]);
    expect(fn!.lang).toBe("plpgsql");

    const [grants] = await sql<{ service: boolean; anon: boolean; auth: boolean }[]>`
      select has_function_privilege('service_role',  'public.assert_prune_enabled()', 'execute') as service,
             has_function_privilege('anon',          'public.assert_prune_enabled()', 'execute') as anon,
             has_function_privilege('authenticated', 'public.assert_prune_enabled()', 'execute') as auth
    `;
    expect(grants!.service).toBe(true);
    expect(grants!.anon).toBe(false);
    expect(grants!.auth).toBe(false);
  });
});

// Spec §6 rule 1's own proof: the rollback HAPPENED, not merely was requested.
describe("rollback discipline", () => {
  test("a seeded row is gone outside the transaction that seeded it", async () => {
    const MARKER = `prune-gate-rollback-${process.pid}`;
    await rolledBack(async (tx) => {
      await tx`insert into public.sync_log (drive_file_id, status, message, occurred_at)
               values (${MARKER}, 'x', 'old', now() - interval '90 days')`;
      const [inside] = await tx<{ n: number }[]>`
        select count(*)::int as n from public.sync_log where drive_file_id = ${MARKER}`;
      expect(inside!.n).toBe(1);
    });
    const [outside] = await sql<{ n: number }[]>`
      select count(*)::int as n from public.sync_log where drive_file_id = ${MARKER}`;
    expect(outside!.n).toBe(0);
  });
});
