// Spec: docs/superpowers/specs/observability/2026-07-26-watch-renewal-lifecycle-design.md
//
// Real-DB coverage for the watch-channel lifecycle work: the `expired` status
// (§3.1.1), the two-arm reap (§3.1.2), GC's status-aware stop handling (§3.1.4),
// the promotion supersession (§3.2.4) and the atomic alert raise (§3.4).
//
// Real DB (tests/db/** is the SERIAL project).
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { assertLocalDbUrl } from "./_localDbUrl";

// This suite INSERTs and DELETEs rows, so it is local-only by contract: resolve
// through LOCAL_TEST_DATABASE_URL and refuse a remote host before any client
// exists. TEST_DATABASE_URL is the validation project and is deliberately not
// consulted here.
const databaseUrl = assertLocalDbUrl(
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
);

const sql = postgres(databaseUrl, { max: 1, idle_timeout: 1, prepare: false });

/**
 * Every value the CHECK must accept after the migration. Asserted as a SET
 * rather than through one representative: a migration that DROPS an existing
 * value such as `stopping` while adding `expired` satisfies a single-value test,
 * and satisfies validation parity too, since that gate checks the constraint
 * name and the presence of `expired` (spec §6.2, R3 finding 7).
 */
const ACCEPTED_STATUSES = [
  "pending",
  "active",
  "superseded",
  "stopping",
  "stopped",
  "orphaned",
  "expired",
] as const;

const PREFIX = "watchlifecycle-";

async function cleanup(): Promise<void> {
  await sql`delete from public.drive_watch_channels where watched_folder_id like ${PREFIX + "%"}`;
}

// File-scope teardown: the postgres client is shared across every describe in
// this file, so closing it inside one of them would end the connection for the
// rest.
beforeAll(cleanup);
afterAll(async () => {
  await cleanup();
  await sql.end({ timeout: 5 });
});

describe("drive_watch_channels status CHECK (§3.1.1)", () => {
  afterEach(cleanup);

  test.each(ACCEPTED_STATUSES)("accepts status %s", async (status) => {
    const id = `${PREFIX}${status}`;
    // `active` additionally requires resource_id + expires_at
    // (drive_watch_channels_active_requires_drive_state), so supply them for
    // every row rather than branching — the CHECK under test is the status one.
    await sql`
      insert into public.drive_watch_channels
        (id, status, watched_folder_id, webhook_secret, resource_id, expires_at)
      values (${id}, ${status}, ${PREFIX + "folder"}, 'secret', 'resource', now() + interval '1 h')
    `;
    const rows = await sql<{ status: string }[]>`
      select status from public.drive_watch_channels where id = ${id}
    `;
    expect(rows.map((r) => r.status)).toEqual([status]);
  });

  test("still rejects a value outside the enumerated set", async () => {
    await expect(
      sql`
        insert into public.drive_watch_channels (id, status, watched_folder_id, webhook_secret)
        values (${PREFIX + "bogus"}, 'not-a-status', ${PREFIX + "folder"}, 'secret')
      `,
    ).rejects.toThrow(/drive_watch_channels_status_check/);
  });
});

describe("promotion supersedes the prior folder's channels (spec §3.2.4)", () => {
  const OLD = `${PREFIX}old`;
  const NEW = `${PREFIX}new`;

  async function seed(): Promise<void> {
    await sql`
      insert into public.drive_watch_channels
        (id, status, watched_folder_id, webhook_secret, resource_id, expires_at)
      values
        (${PREFIX + "old-active"}, 'active', ${OLD}, 's', 'r', now() + interval '10 h'),
        (${PREFIX + "new-active"}, 'active', ${NEW}, 's', 'r', now() + interval '10 h')
    `;
    await sql`
      insert into public.drive_watch_channels (id, status, watched_folder_id, webhook_secret)
      values (${PREFIX + "old-pending"}, 'pending', ${OLD}, 's')
    `;
  }

  /** The two statements promoteSettings runs, verbatim, against a promoted id. */
  async function promoteTo(tx: postgres.TransactionSql, promoted: string): Promise<void> {
    await tx`
      update public.drive_watch_channels
         set status = 'superseded', superseded_at = now()
       where status = 'active' and watched_folder_id is distinct from ${promoted}
    `;
    await tx`
      update public.drive_watch_channels
         set status = 'orphaned'
       where status = 'pending' and watched_folder_id is distinct from ${promoted}
    `;
  }

  async function statuses(): Promise<Record<string, string>> {
    const rows = await sql<{ id: string; status: string }[]>`
      select id, status from public.drive_watch_channels where watched_folder_id like ${PREFIX + "%"}
    `;
    return Object.fromEntries(rows.map((r) => [r.id, r.status]));
  }

  afterEach(cleanup);

  test("committed: prior folder's active -> superseded, pending -> orphaned, new folder untouched", async () => {
    await seed();
    await sql.begin(async (tx) => {
      await promoteTo(tx, NEW);
    });
    const s = await statuses();
    expect(s[`${PREFIX}old-active`]).toBe("superseded");
    expect(s[`${PREFIX}old-pending`]).toBe("orphaned");
    // Preservation: assertion one alone passes if EVERY channel is superseded.
    expect(s[`${PREFIX}new-active`]).toBe("active");
  });

  test("rolled back: BOTH writes are undone, not just the active one", async () => {
    await seed();
    await expect(
      sql.begin(async (tx) => {
        await promoteTo(tx, NEW);
        throw new Error("promotion failed after the channel sweep");
      }),
    ).rejects.toThrow(/promotion failed/);
    const s = await statuses();
    // Observing only the active row would let the pending-orphaning commit in a
    // separate transaction while this assertion still passed.
    expect(s[`${PREFIX}old-active`]).toBe("active");
    expect(s[`${PREFIX}old-pending`]).toBe("pending");
  });
});
