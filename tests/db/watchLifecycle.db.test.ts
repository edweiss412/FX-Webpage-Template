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

  test("the PRODUCTION promoteSettings carries both statements, inside the settings-swap transaction", async () => {
    // The behavioural tests below run COPIED SQL, so deleting the production
    // statements, changing their scope, or moving them outside the transaction
    // would leave them green (whole-diff finding 4). This pins the real source:
    // both updates must appear inside promoteSettings, between its
    // `update public.app_settings` and the function's close.
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("app/api/admin/onboarding/finalize-cas/route.ts", "utf8");
    const body = src.slice(
      src.indexOf("async function promoteSettings"),
      src.indexOf("async function markFinalCasDone"),
    );
    expect(body).not.toBe("");
    expect(body).toMatch(/update public\.app_settings/);
    expect(body).toMatch(
      /update public\.drive_watch_channels[\s\S]*?set status = 'superseded'[\s\S]*?watched_folder_id is distinct from/,
    );
    expect(body).toMatch(
      /update public\.drive_watch_channels[\s\S]*?set status = 'orphaned'[\s\S]*?watched_folder_id is distinct from/,
    );
    // And the BINDING: production could pass null, the old folder, or anything
    // else to $1 while every textual assertion above still matched, retiring
    // the promoted folder's own channels.
    expect(body.match(/\[promoted\]/g) ?? []).toHaveLength(2);
    // ...and the placeholder each array actually FILLS. Counting `[promoted]`
    // twice proves only that two single-element arrays are passed somewhere;
    // changing either predicate to `$2` left every assertion above green while
    // the live route threw on an unbound parameter (whole-diff R5 finding 3).
    const statements = body
      .split("update public.drive_watch_channels")
      .slice(1)
      .map((chunk) => chunk.slice(0, chunk.indexOf("[promoted]")));
    expect(statements).toHaveLength(2);
    for (const statement of statements) {
      expect(statement).toMatch(/watched_folder_id is distinct from \$1\b/);
      // Exactly one placeholder, so $1 is unambiguously the one `[promoted]` fills.
      expect(statement.match(/\$\d+/g)).toEqual(["$1"]);
    }
  });

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

describe("the alert raise is atomic with the channel mutation (spec §3.4)", () => {
  const FOLDER = `${PREFIX}atomic`;

  afterEach(async () => {
    await cleanup();
    await sql`delete from public.admin_alerts where code = 'WATCH_CHANNEL_ORPHANED' and show_id is null`;
  });

  async function unresolvedAlert(): Promise<{
    t: string;
    folder: string | null;
    occurrence_count: number;
  } | null> {
    const rows = await sql<{ t: string; folder: string | null; occurrence_count: number }[]>`
      select jsonb_typeof(context) as t,
             context->>'watched_folder_id' as folder,
             occurrence_count
        from public.admin_alerts
       where code = 'WATCH_CHANNEL_ORPHANED' and show_id is null and resolved_at is null
    `;
    return rows[0] ?? null;
  }

  test("a rollback after the raise leaves NO alert row and the channel still `pending`", async () => {
    await sql`
      insert into public.drive_watch_channels (id, status, watched_folder_id, webhook_secret)
      values (${PREFIX + "atomic-ch"}, 'pending', ${FOLDER}, 'secret')
    `;
    const { markWatchOrphanedWithTx, createPostgresWatchTx } = await import("@/lib/drive/watch");

    await expect(
      sql.begin(async (tx) => {
        await markWatchOrphanedWithTx(createPostgresWatchTx(tx as never), `${PREFIX}atomic-ch`, {
          watched_folder_id: FOLDER,
          channel_id: `${PREFIX}atomic-ch`,
          error_class: "drive_api",
        });
        throw new Error("transaction failed after the alert was raised");
      }),
    ).rejects.toThrow(/after the alert was raised/);

    // Fails before this change: the alert committed over its own connection and
    // survived the rollback.
    expect(await unresolvedAlert()).toBeNull();
    // The seeded status must be `pending` — production's markOrphaned filters on
    // it, so an `active` or absent row would prove no channel rollback at all.
    const rows = await sql<{ status: string }[]>`
      select status from public.drive_watch_channels where id = ${PREFIX + "atomic-ch"}
    `;
    expect(rows[0]?.status).toBe("pending");
  });

  test("a committed raise stores context as a jsonb OBJECT whose keys are readable", async () => {
    const { markWatchOrphanedWithTx, createPostgresWatchTx } = await import("@/lib/drive/watch");
    await sql.begin(async (tx) => {
      await markWatchOrphanedWithTx(createPostgresWatchTx(tx as never), `${PREFIX}absent`, {
        watched_folder_id: FOLDER,
        channel_id: `${PREFIX}absent`,
        error_class: "drive_api",
      });
    });

    // Both halves are load-bearing: JSON.stringify would store a jsonb STRING
    // that passes a "a row exists" assertion while every context->> read returns
    // NULL, and nothing errors.
    const alert = await unresolvedAlert();
    expect(alert?.t).toBe("object");
    expect(alert?.folder).toBe(FOLDER);
  });

  test("a second raise increments occurrence_count, proving the RPC's on-conflict body ran", async () => {
    const { markWatchOrphanedWithTx, createPostgresWatchTx } = await import("@/lib/drive/watch");
    const ctx = { watched_folder_id: FOLDER, channel_id: `${PREFIX}twice` };
    for (let i = 0; i < 2; i += 1) {
      await sql.begin(async (tx) => {
        await markWatchOrphanedWithTx(createPostgresWatchTx(tx as never), `${PREFIX}twice`, ctx);
      });
    }
    expect((await unresolvedAlert())?.occurrence_count).toBe(2);
  });
});

describe("orphaning persists the Drive resourceId (whole-diff R2 finding 1)", () => {
  afterEach(cleanup);

  test("a row promotion already orphaned still records the resourceId", async () => {
    // Reproduces promotion's ACTUAL state: the row is `orphaned` BEFORE the
    // activation failure reaches markOrphaned. A pending-only UPDATE matches
    // zero rows here, so the resourceId files.watch returned is never stored —
    // and GC then hands null to channels.stop, exits early, and marks the row
    // stopped while the Drive channel stays live.
    const id = `${PREFIX}orphan-resource`;
    await sql`
      insert into public.drive_watch_channels (id, status, watched_folder_id, webhook_secret)
      values (${id}, 'orphaned', ${PREFIX + "f"}, 's')
    `;
    const { createPostgresWatchTx } = await import("@/lib/drive/watch");
    await sql.begin(async (tx) => {
      await createPostgresWatchTx(tx as never).markOrphaned(id, "google-resource-9");
    });

    const rows = await sql<{ status: string; resource_id: string | null }[]>`
      select status, resource_id from public.drive_watch_channels where id = ${id}
    `;
    expect(rows[0]).toMatchObject({ status: "orphaned", resource_id: "google-resource-9" });
  });

  test("re-orphaning without a resourceId never CLEARS one already stored", async () => {
    const id = `${PREFIX}orphan-keep`;
    await sql`
      insert into public.drive_watch_channels (id, status, watched_folder_id, webhook_secret, resource_id)
      values (${id}, 'orphaned', ${PREFIX + "f"}, 's', 'kept-resource')
    `;
    const { createPostgresWatchTx } = await import("@/lib/drive/watch");
    await sql.begin(async (tx) => {
      await createPostgresWatchTx(tx as never).markOrphaned(id);
    });

    const rows = await sql<{ resource_id: string | null }[]>`
      select resource_id from public.drive_watch_channels where id = ${id}
    `;
    expect(rows[0]?.resource_id).toBe("kept-resource");
  });
});

describe("a stopped row that never reached Drive stays recordable (R5 finding 1)", () => {
  afterEach(cleanup);

  test("null resource id: the row reopens to orphaned and stores the late id", async () => {
    const id = `${PREFIX}reopen`;
    await sql`
      insert into public.drive_watch_channels (id, status, watched_folder_id, webhook_secret, resource_id)
      values (${id}, 'stopped', ${PREFIX + "f"}, 's', null)
    `;
    const { createPostgresWatchTx } = await import("@/lib/drive/watch");
    await sql.begin(async (tx) => {
      await createPostgresWatchTx(tx as never).markOrphaned(id, "late-resource");
    });

    const rows = await sql<{ status: string; resource_id: string | null }[]>`
      select status, resource_id from public.drive_watch_channels where id = ${id}
    `;
    expect(rows[0]).toMatchObject({ status: "orphaned", resource_id: "late-resource" });
  });

  test("a stopped row that already HAS a resource id is not reopened", async () => {
    const id = `${PREFIX}really-stopped`;
    await sql`
      insert into public.drive_watch_channels (id, status, watched_folder_id, webhook_secret, resource_id)
      values (${id}, 'stopped', ${PREFIX + "g"}, 's', 'stopped-at-drive')
    `;
    const { createPostgresWatchTx } = await import("@/lib/drive/watch");
    await sql.begin(async (tx) => {
      await createPostgresWatchTx(tx as never).markOrphaned(id, "late-resource");
    });

    const rows = await sql<{ status: string; resource_id: string | null }[]>`
      select status, resource_id from public.drive_watch_channels where id = ${id}
    `;
    expect(rows[0]).toMatchObject({ status: "stopped", resource_id: "stopped-at-drive" });
  });
});

describe("markStopped is guarded by the resource id GC read (R6 finding 1)", () => {
  afterEach(cleanup);

  test("an unchanged row is marked stopped and reports one affected row", async () => {
    const id = `${PREFIX}stop-calm`;
    await sql`
      insert into public.drive_watch_channels (id, status, watched_folder_id, webhook_secret, resource_id)
      values (${id}, 'orphaned', ${PREFIX + "f"}, 's', 'steady')
    `;
    const { createPostgresWatchTx } = await import("@/lib/drive/watch");
    const count = await sql.begin(async (tx) =>
      createPostgresWatchTx(tx as never).markStopped(id, "steady"),
    );
    expect(count).toBe(1);
  });

  test("a resource id that landed mid-pass leaves the row untouched", async () => {
    // Against the DATABASE, not the fake. The DB-free test mirrors this guard in
    // the fake, so it stays green when the production predicate is deleted —
    // only this test observes the real statement.
    const id = `${PREFIX}stop-raced`;
    await sql`
      insert into public.drive_watch_channels (id, status, watched_folder_id, webhook_secret, resource_id)
      values (${id}, 'orphaned', ${PREFIX + "f"}, 's', 'landed-late')
    `;
    const { createPostgresWatchTx } = await import("@/lib/drive/watch");
    const count = await sql.begin(async (tx) =>
      // GC read null before the stalled subscriber committed the id.
      createPostgresWatchTx(tx as never).markStopped(id, null),
    );
    expect(count).toBe(0);

    const rows = await sql<{ status: string }[]>`
      select status from public.drive_watch_channels where id = ${id}
    `;
    // Still collectable, so the next pass stops it with the id it now has.
    expect(rows[0]?.status).toBe("orphaned");
  });

  test("null on both sides compares equal, so the ordinary null case still stops", async () => {
    const id = `${PREFIX}stop-null`;
    await sql`
      insert into public.drive_watch_channels (id, status, watched_folder_id, webhook_secret, resource_id)
      values (${id}, 'orphaned', ${PREFIX + "h"}, 's', null)
    `;
    const { createPostgresWatchTx } = await import("@/lib/drive/watch");
    const count = await sql.begin(async (tx) =>
      createPostgresWatchTx(tx as never).markStopped(id, null),
    );
    expect(count).toBe(1);
  });
});

describe("activatePending's COUNT comes from the production SQL (R6 finding 2)", () => {
  afterEach(cleanup);

  const row = (id: string) => ({
    id,
    watchedFolderId: `${PREFIX}f`,
    resourceId: "res",
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  });

  test("returns 1 when a pending row is promoted", async () => {
    const id = `${PREFIX}act-one`;
    await sql`
      insert into public.drive_watch_channels (id, status, watched_folder_id, webhook_secret)
      values (${id}, 'pending', ${PREFIX + "f"}, 's')
    `;
    const { createPostgresWatchTx } = await import("@/lib/drive/watch");
    const count = await sql.begin(async (tx) =>
      createPostgresWatchTx(tx as never).activatePending(row(id)),
    );
    expect(count).toBe(1);
  });

  test("returns 0 when promotion already orphaned the row", async () => {
    // The DB-free test overrides activatePending with a fake that returns 0, so
    // it cannot see the production statement returning a wrong count — an
    // adapter hardcoded to 1 would restore silent activation success.
    const id = `${PREFIX}act-zero`;
    await sql`
      insert into public.drive_watch_channels (id, status, watched_folder_id, webhook_secret)
      values (${id}, 'orphaned', ${PREFIX + "f"}, 's')
    `;
    const { createPostgresWatchTx } = await import("@/lib/drive/watch");
    const count = await sql.begin(async (tx) =>
      createPostgresWatchTx(tx as never).activatePending(row(id)),
    );
    expect(count).toBe(0);

    const rows = await sql<{ status: string }[]>`
      select status from public.drive_watch_channels where id = ${id}
    `;
    expect(rows[0]?.status).toBe("orphaned");
  });
});

describe("GC ordering drains no-Drive-call work first (whole-diff R2 finding 2)", () => {
  afterEach(cleanup);

  test("expired and orphaned rows sort ahead of superseded, regardless of age", async () => {
    // A poisoned `superseded` prefix used to be re-selected every pass, so
    // everything behind it was never collected. The ordering must put rows that
    // need no Drive call — or that resolve either way — first, even when the
    // superseded rows are OLDER.
    await sql`
      insert into public.drive_watch_channels
        (id, status, watched_folder_id, webhook_secret, resource_id, created_at, expires_at)
      values
        (${PREFIX + "old-sup"}, 'superseded', ${PREFIX + "a"}, 's', 'r', now() - interval '10 d', now()),
        (${PREFIX + "new-exp"}, 'expired',    ${PREFIX + "b"}, 's', 'r', now() - interval '1 h',  now()),
        (${PREFIX + "new-orp"}, 'orphaned',   ${PREFIX + "c"}, 's', 'r', now() - interval '1 h',  now())
    `;
    const { createPostgresWatchTx } = await import("@/lib/drive/watch");
    const ids = await sql.begin(async (tx) => {
      const rows = await createPostgresWatchTx(tx as never).listGcCandidates();
      return rows.filter((r) => r.id.startsWith(PREFIX)).map((r) => r.id);
    });

    // PRESENCE first. `indexOf` returns -1 for a missing row, so dropping
    // `expired` or `orphaned` from listGcCandidates would satisfy both
    // "less than" assertions while making those rows permanently uncollectable.
    expect(ids.sort()).toEqual([`${PREFIX}new-exp`, `${PREFIX}new-orp`, `${PREFIX}old-sup`].sort());
    const order = await sql.begin(async (tx) => {
      const { createPostgresWatchTx } = await import("@/lib/drive/watch");
      const rows = await createPostgresWatchTx(tx as never).listGcCandidates();
      return rows.filter((r) => r.id.startsWith(PREFIX)).map((r) => r.id);
    });
    expect(order.indexOf(`${PREFIX}new-exp`)).toBeLessThan(order.indexOf(`${PREFIX}old-sup`));
    expect(order.indexOf(`${PREFIX}new-orp`)).toBeLessThan(order.indexOf(`${PREFIX}old-sup`));
  });

  test("within a tier the order VARIES between passes, so no row is starved", async () => {
    // The previous revision of this test seeded ONE superseded row, so reverting
    // `random()` to `created_at` still passed it (whole-diff R4). Twelve rows
    // with distinct ages make a deterministic ordering emit the same sequence on
    // every pass; `random()` does not.
    const rows = Array.from({ length: 12 }, (_, i) => i);
    for (const i of rows) {
      await sql`
        insert into public.drive_watch_channels
          (id, status, watched_folder_id, webhook_secret, resource_id, created_at, expires_at)
        values (${`${PREFIX}rnd-${i}`}, 'superseded', ${`${PREFIX}f${i}`}, 's', 'r',
                now() - (${i} * interval '1 h'), now())
      `;
    }
    const { createPostgresWatchTx } = await import("@/lib/drive/watch");
    const passes: string[][] = [];
    for (let pass = 0; pass < 4; pass += 1) {
      passes.push(
        await sql.begin(async (tx) => {
          const got = await createPostgresWatchTx(tx as never).listGcCandidates();
          return got.filter((r) => r.id.startsWith(`${PREFIX}rnd-`)).map((r) => r.id);
        }),
      );
    }

    // Every pass still returns the full set — varying order must not drop rows.
    for (const pass of passes) expect(pass).toHaveLength(12);
    const distinct = new Set(passes.map((p) => p.join(",")));
    expect(distinct.size).toBeGreaterThan(1);
  });

  test("the limit argument bounds a pass, so one pass cannot run unbounded", async () => {
    for (const i of [0, 1, 2, 3, 4]) {
      await sql`
        insert into public.drive_watch_channels
          (id, status, watched_folder_id, webhook_secret, resource_id, expires_at)
        values (${`${PREFIX}cap-${i}`}, 'expired', ${`${PREFIX}c${i}`}, 's', 'r', now())
      `;
    }
    const { createPostgresWatchTx } = await import("@/lib/drive/watch");
    const got = await sql.begin(async (tx) =>
      createPostgresWatchTx(tx as never).listGcCandidates(3),
    );
    expect(got).toHaveLength(3);
  });
});
