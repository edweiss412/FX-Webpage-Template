/**
 * tests/db/resetValidationDataConcurrency.test.ts (Task 2)
 *
 * In-flight serialization test for public.reset_validation_data() (invariant 2:
 * per-show advisory lock).
 *
 * T2 opens a transaction, takes pg_advisory_xact_lock(hashtext('show:'||did))
 * for an existing show and begins an UPDATE on that show (holding the lock).
 * T1 calls reset_validation_data(): because the RPC acquires the per-show
 * advisory lock for that drive_file_id BEFORE any delete, T1 BLOCKS — it must
 * NOT return while T2 holds the lock. We poll pg_stat_activity until T1 is
 * genuinely Lock-waiting, assert T1 has not returned, then release T2. After
 * T1 commits, every row that existed when the reset ran is deleted.
 *
 * Per spec D10 we assert in-flight serialization + deletion of the
 * pre-existing rows — NOT "stays empty" (a concurrent insert after the reset
 * commits is allowed and out of scope).
 */
import { afterAll, describe, expect, test } from "vitest";
import postgres, { type Sql } from "postgres";
import { randomUUID } from "node:crypto";

const DB_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// Shared client for seed/poll/read; the race uses dedicated single connections.
const sql: Sql = postgres(DB_URL, { max: 4, prepare: false });
const newConn = (): Sql => postgres(DB_URL, { max: 1, prepare: false });

const ADMIN_CLAIMS = JSON.stringify({
  sub: "00000000-0000-0000-0000-000000000020",
  email: "dlarson@fxav.net",
  app_metadata: { role: "admin" },
});

async function seedShow(): Promise<{ showId: string; driveFileId: string }> {
  const showId = randomUUID();
  const driveFileId = `drive-${randomUUID()}`;
  await sql`
    insert into public.shows (id, drive_file_id, slug, title, client_label, template_version,
                              archived, published, picker_epoch)
    values (${showId}::uuid, ${driveFileId}, ${`slug-${showId.slice(0, 8)}`}, 'Concurrency Show',
            'Client', 'v1', false, true, 1)`;
  return { showId, driveFileId };
}

afterAll(async () => {
  await sql`update public.destructive_reset_gate set enabled = false where id = 'default'`;
  await sql.end({ timeout: 5 });
});

describe("reset_validation_data() — in-flight advisory-lock serialization", () => {
  test("BLOCKS while another tx holds the per-show advisory lock, then deletes the pre-existing rows after that tx releases", async () => {
    await sql`update public.destructive_reset_gate set enabled = true where id = 'default'`;

    const { showId, driveFileId } = await seedShow();

    const a = newConn(); // T2: holds the show lock + an open UPDATE
    const b = newConn(); // T1: reset_validation_data(), must block on the lock
    let resetReturned = false;
    let resetThrew = false;

    try {
      let signalT2Locked!: () => void;
      const t2Locked = new Promise<void>((r) => (signalT2Locked = r));
      let releaseT2!: () => void;
      const t2MayCommit = new Promise<void>((r) => (releaseT2 = r));

      // T2: take the per-show advisory lock, begin an UPDATE, then hold the tx open.
      const t2 = a.begin(async (tx) => {
        await tx`select pg_advisory_xact_lock(hashtext('show:' || ${driveFileId}))`;
        await tx`update public.shows set title = 'held-by-t2' where id = ${showId}::uuid`;
        signalT2Locked();
        await t2MayCommit; // keep the lock until released
      });
      await t2Locked;

      // T1: reset_validation_data() — should block trying to acquire the same lock.
      const t1 = b
        .begin(async (tx) => {
          await tx`select set_config('role', 'authenticated', true)`;
          await tx`select set_config('request.jwt.claims', ${ADMIN_CLAIMS}, true)`;
          await tx`select public.reset_validation_data()`;
        })
        .then(() => {
          resetReturned = true;
        })
        .catch(() => {
          resetThrew = true;
        });

      // Wait until T1 is genuinely Lock-waiting on the advisory lock (bounded; fail loud).
      const deadline = 5_000;
      for (let waited = 0; ; waited += 25) {
        const [row] = await sql`
          select count(*)::int n from pg_stat_activity
           where wait_event_type = 'Lock'
             and state = 'active'
             and query ilike '%reset_validation_data%'`;
        if (!row) throw new Error("concurrency: pg_stat_activity count query returned no row");
        if ((row as { n: number }).n >= 1) break;
        if (waited >= deadline) {
          throw new Error("concurrency: reset_validation_data never reached Lock-wait");
        }
        await new Promise((r) => setTimeout(r, 25));
      }

      // Assert T1 has NOT returned while T2 still holds the lock.
      expect(resetReturned, "reset must NOT return while another tx holds the show lock").toBe(
        false,
      );
      expect(resetThrew, "reset must not have thrown while blocked").toBe(false);

      // Release T2 → T1 proceeds.
      releaseT2();
      await Promise.all([t2, t1]);

      expect(resetThrew, "reset must not throw after the lock is released").toBe(false);
      expect(resetReturned, "reset must return after the lock is released").toBe(true);
    } finally {
      await a.end({ timeout: 5 });
      await b.end({ timeout: 5 });
    }

    // After T1 commits: the show that existed when the reset ran is deleted.
    const [shows] = await sql`select count(*)::int n from public.shows where id = ${showId}::uuid`;
    expect((shows as { n: number }).n).toBe(0);
  });
});
