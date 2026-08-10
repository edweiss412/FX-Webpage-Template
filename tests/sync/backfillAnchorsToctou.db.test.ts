// TOCTOU stamp guard for the validation anchor backfill (spec 2026-08-09-m-wave-2
// §2.3, review r5 F1). The script fetches Drive bytes BEFORE its transaction; a
// sync committing a new revision in that window must NOT let the old anchors carry
// a fresh-matching stamp. Unraced → stamp = the watermark (deep links serve);
// raced (W1 ≠ W2) → NULL stamp + a surfaced warning (readers demote to #gid=0).
//
// Local Supabase DB, real writeBackfilledAnchors (the exported locked-write core;
// the module's direct-run guard keeps the import from firing the whole backfill).
import { afterEach, describe, expect, test } from "vitest";
import postgres from "postgres";

import { assertLocalDbUrl } from "@/tests/db/_localDbUrl";
import { writeBackfilledAnchors } from "@/scripts/backfill-validation-source-anchors";

const DB = assertLocalDbUrl(
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
);
const loopback = /@(127\.0\.0\.1|localhost|postgres)([:/?]|$)/.test(DB);
const d = loopback ? describe : describe.skip;

const DRIVE_ID = "backfill-toctou-fixture";
const W1 = "2026-08-01T00:00:00.000Z";
const W2 = "2026-08-02T00:00:00.000Z";
const ANCHORS = { crew: { title: "INFO", gid: 3 } };

d("writeBackfilledAnchors TOCTOU guard", () => {
  const sql = postgres(DB!, { prepare: false, max: 1 });

  afterEach(async () => {
    await sql.unsafe("delete from public.shows where drive_file_id = $1", [DRIVE_ID]);
  });

  async function seed(lastSeen: string): Promise<{ id: string; slug: string }> {
    const rows = (await sql.unsafe(
      `insert into public.shows (drive_file_id, slug, title, client_label, template_version,
         last_seen_modified_time, last_synced_at, last_sync_status, last_sync_error)
       values ($1, $2, 'TOCTOU Fixture', 'T Corp', 'v4', $3::timestamptz, now(), 'ok', null)
       returning id, slug`,
      [DRIVE_ID, `toctou-${crypto.randomUUID().slice(0, 8)}`, lastSeen],
    )) as { id: string; slug: string }[];
    return rows[0]!;
  }

  test("UNRACED: watermark unchanged, anchors stamped with it (deep link serves)", async () => {
    const { id, slug } = await seed(W1);
    const warnings: string[] = [];
    const { raced } = await writeBackfilledAnchors(
      sql,
      { id, slug, drive_file_id: DRIVE_ID },
      ANCHORS,
      W1,
      (m) => warnings.push(m),
    );
    expect(raced).toBe(false);
    expect(warnings).toEqual([]);
    const rows = (await sql.unsafe(
      `select source_anchors, source_anchors_modified_time, last_seen_modified_time
         from public.shows where id = $1`,
      [id],
    )) as Array<{
      source_anchors: unknown;
      source_anchors_modified_time: string | Date | null;
      last_seen_modified_time: string | Date;
    }>;
    expect(rows[0]!.source_anchors).toEqual(ANCHORS);
    expect(new Date(rows[0]!.source_anchors_modified_time as string).toISOString()).toBe(W1);
  });

  test("RACED: watermark moved between fetch and write → NULL stamp + surfaced warning", async () => {
    const { id, slug } = await seed(W2); // the DB already advanced to W2
    const warnings: string[] = [];
    const { raced } = await writeBackfilledAnchors(
      sql,
      { id, slug, drive_file_id: DRIVE_ID },
      ANCHORS,
      W1, // ...but the script fetched against W1
      (m) => warnings.push(m),
    );
    expect(raced).toBe(true);
    expect(warnings.some((w) => w.includes("RACED") && w.includes("re-run"))).toBe(true);
    const rows = (await sql.unsafe(
      `select source_anchors, source_anchors_modified_time from public.shows where id = $1`,
      [id],
    )) as Array<{ source_anchors: unknown; source_anchors_modified_time: string | null }>;
    // Conservative demote: the anchors land (they are still the best available map)
    // but with NO freshness claim — readers serve the #gid=0 fallback, never a
    // fresh-stamped stale map.
    expect(rows[0]!.source_anchors).toEqual(ANCHORS);
    expect(rows[0]!.source_anchors_modified_time).toBeNull();
  });
});
