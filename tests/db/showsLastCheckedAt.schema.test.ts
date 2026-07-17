import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import postgres from "postgres";

// DB schema test (defaults to local 54322; CI sets TEST_DATABASE_URL=validation).
// Pins shows.last_checked_at: the "we successfully reached Drive and evaluated
// this show" timestamp (spec 2026-07-16-last-checked-at §3). Nullable timestamptz,
// backfilled to last_synced_at so no active row is orphaned post-migration.
const sql = postgres(
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
);

afterAll(async () => {
  await sql.end();
});

describe("shows.last_checked_at column", () => {
  it("exists as a nullable timestamptz", async () => {
    const rows = await sql<{ data_type: string; is_nullable: string }[]>`
      select data_type, is_nullable
      from information_schema.columns
      where table_schema = 'public' and table_name = 'shows' and column_name = 'last_checked_at'`;
    expect(rows.length).toBe(1);
    const col = rows[0]!;
    expect(col.data_type).toBe("timestamp with time zone");
    expect(col.is_nullable).toBe("YES");
  });

  it("migration backfill statement fills last_checked_at from last_synced_at (idempotent, self-contained)", async () => {
    // Self-contained: insert a controlled row mirroring the pre-migration shape
    // (last_synced_at set, last_checked_at NULL), run the migration's backfill
    // UPDATE, and assert it filled. Does NOT depend on global/seed state — the
    // seed legitimately inserts rows without last_checked_at, so a fleet-wide
    // "no orphans" assertion would be a false failure.
    const drive = `schema-test-backfill-${randomUUID()}`;
    const synced = "2026-07-16T17:00:00.000Z";
    try {
      await sql`
        insert into public.shows (drive_file_id, slug, title, client_label, template_version,
                                   last_synced_at, last_checked_at)
        values (${drive}, ${`slug-${drive}`}, 'Backfill Probe', 'Client', 'v4',
                ${synced}::timestamptz, null)`;
      // The migration's backfill statement (idempotent — WHERE last_checked_at is null).
      await sql`update public.shows set last_checked_at = last_synced_at where last_checked_at is null`;
      const rows = await sql<{ last_checked_at: string }[]>`
        select last_checked_at from public.shows where drive_file_id = ${drive}`;
      expect(new Date(rows[0]!.last_checked_at).toISOString()).toBe(synced);
    } finally {
      await sql`delete from public.shows where drive_file_id = ${drive}`;
    }
  });
});
