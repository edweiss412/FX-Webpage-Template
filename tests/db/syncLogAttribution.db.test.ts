/**
 * tests/db/syncLogAttribution.db.test.ts (Task 1, 2026-08-09 sync-log show attribution)
 *
 * The executable form of the probe that opened this arc. `sync_log.show_id` and
 * `duration_ms` are declared in the ratified master spec and were populated by no
 * routine writer, so `pnpm observe synclog --show <uuid>` returned nothing for every
 * show — an empty result indistinguishable from health. Probe before the change:
 * 5073 rows, `count(show_id) = 0`.
 *
 * Why this suite is a real DB test and not a unit mock:
 *
 *   - The `show_id` subselect resolves inside the INSERT. A mock observes the SQL
 *     string; only Postgres observes what the subselect RESOLVES to, which is the
 *     whole claim (spec §3.1).
 *   - `entry.durationMs ?? null` is load-bearing against the DRIVER, not the schema.
 *     postgres.js raises UNDEFINED_VALUE for an undefined bind parameter, so a bare
 *     `entry.durationMs` makes every §3.3.1 NULL-duration writer throw rather than
 *     persist. A `vi.fn()` accepts `undefined` happily and proves nothing.
 *   - No FK violation and no blocking wait for a `drive_file_id` with no `shows` row
 *     is a property of the statement running against a live table (spec §3.1.1).
 *
 * Reads go through `querySyncLog`, which opens its OWN Supabase REST connection and
 * therefore cannot see an uncommitted row. Fixtures are COMMITTED and removed in a
 * `finally`, keyed by a per-run marker so a failure cannot strand another suite's data.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres, { type Sql } from "postgres";
import { assertLocalDbUrl } from "./_localDbUrl";
import { makePostgresSyncLogSink } from "@/lib/sync/syncLog";
import { querySyncLog } from "@/lib/observe/query/syncLog";

const DB_URL = assertLocalDbUrl(
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
);

const sql: Sql = postgres(DB_URL, { max: 2, prepare: false });
const sink = makePostgresSyncLogSink(
  sql as unknown as { unsafe(s: string, p?: unknown[]): Promise<unknown[]> },
);

/** Per-run marker. Every fixture row carries it, and every cleanup is scoped to it. */
const RUN = `synclogattr-${process.pid}-${process.hrtime()[1]}`;
const FILE_WITH_SHOW = `${RUN}-with-show`;
const FILE_NO_SHOW = `${RUN}-no-show`;
const FILE_NULL_DURATION = `${RUN}-null-duration`;

let showId = "";
let otherShowId = "";
let nullDurationShowId = "";

beforeAll(async () => {
  const [row] = await sql<{ id: string }[]>`
    insert into public.shows (drive_file_id, slug, title, client_label, template_version)
    values (${FILE_WITH_SHOW}, ${`${RUN}-slug`}, ${"Attribution fixture"}, ${RUN}, 1)
    returning id
  `;
  showId = row!.id;
  const [other] = await sql<{ id: string }[]>`
    insert into public.shows (drive_file_id, slug, title, client_label, template_version)
    values (${`${RUN}-other`}, ${`${RUN}-other-slug`}, ${"Negative control"}, ${RUN}, 1)
    returning id
  `;
  otherShowId = other!.id;
  const [nd] = await sql<{ id: string }[]>`
    insert into public.shows (drive_file_id, slug, title, client_label, template_version)
    values (${FILE_NULL_DURATION}, ${`${RUN}-nd-slug`}, ${"Null-duration fixture"}, ${RUN}, 1)
    returning id
  `;
  nullDurationShowId = nd!.id;
});

afterAll(async () => {
  try {
    await sql`delete from public.sync_log where drive_file_id like ${`${RUN}%`}`;
    // The NULL-drive_file_id fixture cannot be matched by the LIKE above, so it is
    // reached through its show_id — but only once the shows insert actually landed.
    if (showId && otherShowId && nullDurationShowId) {
      await sql`delete from public.sync_log where show_id in (${showId}, ${otherShowId}, ${nullDurationShowId})`;
    }
    await sql`delete from public.sync_log where drive_file_id is null and duration_ms = 5 and status = 'skipped'`;
    await sql`delete from public.shows where client_label = ${RUN}`;
  } finally {
    await sql.end({ timeout: 5 });
  }
});

describe("sync_log attribution — write through the real sink, read through querySyncLog", () => {
  test("a drive_file_id with a committed shows row lands that show's id, with the injected duration", async () => {
    // Against a known delta, not `> 0` — `> 0` passes for any positive number a
    // buggy implementation might compute, including an epoch-sized one.
    const INJECTED_MS = 4242;

    await sink({
      driveFileId: FILE_WITH_SHOW,
      outcome: "applied",
      durationMs: INJECTED_MS,
    } as never);

    // sinceHours: null EXPLICITLY. The 24h default returns [] for old rows, which is
    // byte-identical to the bug this suite exists to catch.
    const result = await querySyncLog({ showId, sinceHours: null });
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;

    const mine = result.rows.filter((r) => r.driveFileId === FILE_WITH_SHOW);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.showId).toBe(showId);
    expect(mine[0]!.durationMs).toBe(INJECTED_MS);
  });

  test("negative control — the same query for an unrelated show returns none of these rows", async () => {
    const result = await querySyncLog({ showId: otherShowId, sinceHours: null });
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.rows.filter((r) => r.driveFileId === FILE_WITH_SHOW)).toHaveLength(0);
  });

  test("a drive_file_id with NO shows row lands show_id NULL — no FK violation, no blocking wait", async () => {
    await expect(
      sink({ driveFileId: FILE_NO_SHOW, outcome: "parse_error", durationMs: 11 } as never),
    ).resolves.toBeUndefined();

    const [row] = await sql<{ show_id: string | null; duration_ms: number | null }[]>`
      select show_id, duration_ms from public.sync_log where drive_file_id = ${FILE_NO_SHOW}
    `;
    expect(row).toBeDefined();
    expect(row!.show_id).toBeNull();
    expect(row!.duration_ms).toBe(11);
  });

  test("a NULL drive_file_id lands show_id NULL and does not throw", async () => {
    // Paired with the positive case above deliberately: today's sink never binds
    // show_id at all, so a NULL readback ALONE proves nothing. A sink that always
    // writes NULL fails the positive case; one that rejects NULL fails this one.
    await expect(
      sink({ driveFileId: null, outcome: "skipped", durationMs: 5 } as never),
    ).resolves.toBeUndefined();

    const [row] = await sql<{ show_id: string | null }[]>`
      select l.show_id from public.sync_log l
      where l.drive_file_id is null and l.duration_ms = 5 and l.status = 'skipped'
      order by l.occurred_at desc limit 1
    `;
    expect(row).toBeDefined();
    expect(row!.show_id).toBeNull();
  });

  test("an entry with no durationMs persists NULL — the ?? null bind, against the real driver", async () => {
    // THE case a unit mock cannot express. postgres.js raises UNDEFINED_VALUE for an
    // undefined bind parameter, so `entry.durationMs` without `?? null` throws here
    // and every §3.3.1 NULL-duration writer stops persisting rows entirely.
    await expect(
      sink({ driveFileId: FILE_NULL_DURATION, outcome: "skipped" } as never),
    ).resolves.toBeUndefined();

    const [row] = await sql<{ duration_ms: number | null; show_id: string | null }[]>`
      select duration_ms, show_id from public.sync_log where drive_file_id = ${FILE_NULL_DURATION}
    `;
    expect(row).toBeDefined();
    expect(row!.duration_ms).toBeNull();
    // Anti-tautology: a NULL duration_ms alone is ALSO what the old four-column sink
    // produced, because it never bound the column at all — so this case would have
    // passed against the very bug it is meant to exclude. Pinning show_id to the
    // resolved id proves the six-column statement is the one that ran, and keeps the
    // `resolves` above meaningful as the UNDEFINED_VALUE guard.
    expect(row!.show_id).toBe(nullDurationShowId);
  });
});
