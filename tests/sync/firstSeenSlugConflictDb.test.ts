/**
 * REAL-Postgres regression for the first-seen slug-collision transaction abort
 * (live-reproduced on validation by an onboarding drill, 2026-06-12).
 *
 * Bug: `insertFirstSeenShowWithSlugRetry` caught 23505 (`shows_slug_key`,
 * UNIQUE (slug) — supabase/migrations/20260501000000_initial_public_schema.sql:6)
 * and RETRIED inside the SAME transaction without a SAVEPOINT. On real Postgres
 * the transaction is aborted after the first error, so attempt 2 fails with
 * 25P02 `in_failed_sql_transaction`, which is not 23505 → rethrow →
 * Phase2InfraError(applyShowSnapshot) → wizard finalize 500s with
 * ONBOARDING_FINALIZE_INTERNAL_ERROR. The cron first-seen path shares the same
 * helper via PostgresPipelineTx.applyShowSnapshot, so colliding titles broke
 * cron ingestion identically. Mocked inserts (plain throwing stubs) cannot see
 * the abort — only a real transaction does; this is exactly the "mocked-only
 * tests invite tautological APPROVE" class.
 *
 * Trigger: a first-seen sheet whose derived slug collides with an existing show
 * (e.g. Doug duplicates last year's sheet — same title, same year-month).
 *
 * DB-connection convention (mirrors tests/onboarding/wizardSessionCasRaceDb.test.ts):
 * LOCAL-ONLY. `withPostgresSyncPipelineLock`'s databaseUrl() resolves
 * TEST_DATABASE_URL ?? DATABASE_URL at call time, and in this repo
 * TEST_DATABASE_URL is the VALIDATION project (.env.local) — so BOTH env vars
 * are pinned to the assertLocalDbUrl-validated loopback URL for the whole
 * suite (originals restored in teardown).
 */
import { afterAll, afterEach, beforeEach, expect, test } from "vitest";
import postgres from "postgres";

import { assertLocalDbUrl } from "../db/_remediationHelpers";
import { withPostgresSyncPipelineLock } from "@/lib/sync/runScheduledCronSync";
import type { ParseResult } from "@/lib/parser/types";

const DB_URL = assertLocalDbUrl(
  process.env.LOCAL_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
);

const ORIGINAL_ENV = {
  TEST_DATABASE_URL: process.env.TEST_DATABASE_URL,
  DATABASE_URL: process.env.DATABASE_URL,
};
process.env.TEST_DATABASE_URL = DB_URL;
process.env.DATABASE_URL = DB_URL;

const EXISTING_FILE = "slug-conflict-db-existing";
const EXISTING_FILE_2 = "slug-conflict-db-existing-2";
const NEW_FILE = "slug-conflict-db-first-seen";
const BASE_SLUG = "2026-06-slug-conflict-db-fixture";
const MODIFIED_TIME = "2026-06-11T12:00:00.000Z";
const TITLE = "Slug Conflict DB Fixture";

const PARSE_RESULT = {
  show: {
    title: TITLE,
    client_label: "Acme Corp",
    client_contact: null,
    template_version: "v4",
    venue: { name: "Grand Hall" },
    dates: {
      travelIn: "2026-06-09",
      set: "2026-06-10",
      showDays: ["2026-06-11"],
      travelOut: "2026-06-12",
    },
    event_details: null,
    agenda_links: [],
    coi_status: null,
  },
  crewMembers: [],
  hotelReservations: [],
  rooms: [],
  transportation: null,
  contacts: [],
  pullSheet: null,
  diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
  openingReel: null,
  raw_unrecognized: [],
  warnings: [],
  hardErrors: [],
} as unknown as ParseResult;

// Probe at module top-level: `test.skipIf` is evaluated at collection time.
let sql: ReturnType<typeof postgres> | null = null;
let dbUp = false;
try {
  const probe = postgres(DB_URL, { max: 1, idle_timeout: 2, connect_timeout: 3, prepare: false });
  await probe.unsafe("select 1", []);
  sql = probe;
  dbUp = true;
} catch {
  if (sql) await (sql as ReturnType<typeof postgres>).end().catch(() => {});
  sql = null;
  dbUp = false;
}

async function cleanup(): Promise<void> {
  if (!sql) return;
  await sql
    .unsafe(`delete from public.shows where drive_file_id = any($1)`, [
      [EXISTING_FILE, EXISTING_FILE_2, NEW_FILE],
    ])
    .catch(() => {});
}

async function seedShow(driveFileId: string, slug: string): Promise<void> {
  await sql!.unsafe(
    `insert into public.shows (drive_file_id, slug, title, client_label, template_version)
     values ($1, $2, $3, 'Acme Corp', 'v4')`,
    [driveFileId, slug, TITLE],
  );
}

async function applyFirstSeen(): Promise<unknown> {
  return await withPostgresSyncPipelineLock(NEW_FILE, async (lockedTx) =>
    lockedTx.applyShowSnapshot({
      driveFileId: NEW_FILE,
      modifiedTime: MODIFIED_TIME,
      staleGuard: "less_than_or_equal",
      parseResult: PARSE_RESULT,
      slug: BASE_SLUG,
    }),
  );
}

beforeEach(async () => {
  if (!dbUp) return;
  await cleanup();
});

afterEach(async () => {
  if (!dbUp) return;
  await cleanup();
});

afterAll(async () => {
  process.env.TEST_DATABASE_URL = ORIGINAL_ENV.TEST_DATABASE_URL;
  process.env.DATABASE_URL = ORIGINAL_ENV.DATABASE_URL;
  if (ORIGINAL_ENV.TEST_DATABASE_URL === undefined) delete process.env.TEST_DATABASE_URL;
  if (ORIGINAL_ENV.DATABASE_URL === undefined) delete process.env.DATABASE_URL;
  if (sql) await sql.end().catch(() => {});
});

test.skipIf(!dbUp)(
  "first-seen insert with a colliding slug succeeds with a deduped slug inside ONE real transaction (no 25P02 abort)",
  async () => {
    await seedShow(EXISTING_FILE, BASE_SLUG);

    // Failure mode (pre-fix): the first INSERT raises 23505 on shows_slug_key,
    // the catch-and-retry issues attempt 2 on the SAME aborted transaction, and
    // real Postgres rejects it with 25P02 in_failed_sql_transaction → rethrow.
    const result = await applyFirstSeen();

    expect(result).toMatchObject({ outcome: "updated" });

    const rows = (await sql!.unsafe(`select slug from public.shows where drive_file_id = $1`, [
      NEW_FILE,
    ])) as Array<{ slug: string }>;
    expect(rows.length).toBe(1);
    expect(rows[0]!.slug).toBe(`${BASE_SLUG}-2`);
  },
);

test.skipIf(!dbUp)(
  "multiple committed collisions walk the suffix ladder without aborting the transaction",
  async () => {
    await seedShow(EXISTING_FILE, BASE_SLUG);
    await seedShow(EXISTING_FILE_2, `${BASE_SLUG}-2`);

    const result = await applyFirstSeen();

    expect(result).toMatchObject({ outcome: "updated" });

    const rows = (await sql!.unsafe(`select slug from public.shows where drive_file_id = $1`, [
      NEW_FILE,
    ])) as Array<{ slug: string }>;
    expect(rows.length).toBe(1);
    expect(rows[0]!.slug).toBe(`${BASE_SLUG}-3`);
  },
);
