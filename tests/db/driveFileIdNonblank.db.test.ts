/**
 * tests/db/driveFileIdNonblank.db.test.ts
 *
 * Behavioral proof (local Postgres) that the `<table>_drive_file_id_nonblank`
 * CHECK constraints (migration 20260702120200) actually REJECT empty/whitespace
 * drive_file_id writes. The static-parse test (tests/db/schema.test.ts) proves the
 * DDL is DECLARED; this proves the predicate BEHAVES (anti-tautology split).
 *
 * Every mutating probe runs inside a transaction that is always rolled back (either
 * by the 23514 abort or by a sentinel throw), so the test leaves ZERO residue — no
 * blank row can survive into the §6 detector / migration-apply step even while RED.
 *
 * Skips when the local stack is unreachable (mirror of other *.db.test.ts).
 */
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, test } from "vitest";
import postgres from "postgres";

const LOCAL_URL =
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// All 14 public columns named exactly `drive_file_id` that get a nonblank CHECK.
const PUBLIC_NONBLANK_TABLES = [
  "shows",
  "pending_syncs",
  "pending_ingestions",
  "sync_audit",
  "deferred_ingestions",
  "onboarding_scan_manifest",
  "pending_snapshot_uploads",
  "revision_race_cooldowns",
  "shows_pending_changes",
  "show_change_log",
  "sync_holds",
  "agenda_extract_leases",
  "sync_log",
  "app_events",
];

let sql: ReturnType<typeof postgres> | null = null;
let dbUp = false;
try {
  const probe = postgres(LOCAL_URL, {
    max: 4,
    idle_timeout: 2,
    connect_timeout: 3,
    prepare: false,
  });
  await probe.unsafe("select 1", []);
  sql = probe;
  dbUp = true;
} catch {
  if (sql) await (sql as ReturnType<typeof postgres>).end().catch(() => {});
  sql = null;
  dbUp = false;
}

afterAll(async () => {
  if (sql) await sql.end().catch(() => {});
});

/** Assert a mutation is rejected with SQLSTATE 23514 (check_violation). Always rolls back. */
async function expectRejected(query: string, params: (string | null)[]): Promise<void> {
  let rejected = false;
  try {
    await sql!.begin(async (tx) => {
      await tx.unsafe(query, params);
      // Insert unexpectedly succeeded → force rollback so no blank row persists.
      throw new Error("__no_violation__");
    });
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (err?.code === "23514") rejected = true;
    else if (err?.message !== "__no_violation__") throw e;
  }
  expect(rejected, `expected 23514 check_violation for: ${query}`).toBe(true);
}

/** Assert a mutation is accepted (no 23514). Always rolls back (no residue). */
async function expectAccepted(query: string, params: (string | null)[]): Promise<void> {
  let violated = false;
  try {
    await sql!.begin(async (tx) => {
      await tx.unsafe(query, params);
      throw new Error("__rollback__");
    });
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (err?.code === "23514") violated = true;
    else if (err?.message !== "__rollback__") throw e;
  }
  expect(violated, `unexpected 23514 check_violation for: ${query}`).toBe(false);
}

describe("drive_file_id nonblank CHECK — behavioral (local Postgres)", () => {
  test.skipIf(!dbUp)(
    "agenda_extract_leases rejects '', '   ', '\\t' and accepts a valid id",
    async () => {
      const insert = `insert into public.agenda_extract_leases
          (wizard_session_id, drive_file_id, owner, expires_at)
        values (gen_random_uuid(), $1, 'owner', now() + interval '5 minutes')`;
      for (const blank of ["", "   ", "\t"]) {
        await expectRejected(insert, [blank]);
      }
      await expectAccepted(insert, [`dfidnb-lease-${randomUUID()}`]);
    },
  );

  test.skipIf(!dbUp)("shows rejects a blank drive_file_id and accepts a valid one", async () => {
    // Reuse the held-show insert shape from tests/onboarding/finalizeHeldCreation.db.test.ts.
    const insert = `insert into public.shows
        (drive_file_id, slug, title, client_label, template_version,
         published, last_seen_modified_time, last_sync_status)
      values ($1, $2, 'Nonblank Test', 'Acme Corp', 'v4', true, now(), 'ok')`;
    await expectRejected(insert, ["   ", `dfidnb-shows-slug-${randomUUID()}`]);
    await expectAccepted(insert, [
      `dfidnb-shows-${randomUUID()}`,
      `dfidnb-shows-slug-${randomUUID()}`,
    ]);
  });

  test.skipIf(!dbUp)(
    "app_events (nullable) accepts NULL, rejects '', accepts a valid id",
    async () => {
      const insert = `insert into public.app_events (level, source, message, drive_file_id)
        values ('info', 'test.nonblank', 'msg', $1)`;
      await expectAccepted(insert, [null]); // NULL → ok (nullable column)
      await expectRejected(insert, [""]); // '' → 23514
      await expectAccepted(insert, [`dfidnb-appevents-${randomUUID()}`]); // valid → ok
    },
  );

  test.skipIf(!dbUp)("all 14 public *_drive_file_id_nonblank CHECK constraints exist", async () => {
    const rows = await sql!.unsafe(
      `select conname from pg_constraint
          where contype = 'c'
            and connamespace = 'public'::regnamespace
            and conname like '%_drive_file_id_nonblank'`,
      [],
    );
    const found = new Set((rows as unknown as { conname: string }[]).map((r) => r.conname));
    for (const t of PUBLIC_NONBLANK_TABLES) {
      expect(found.has(`${t}_drive_file_id_nonblank`), `missing constraint for ${t}`).toBe(true);
    }
    expect(PUBLIC_NONBLANK_TABLES.length).toBe(14);
  });
});
