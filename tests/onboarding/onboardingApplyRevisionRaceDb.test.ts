import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";

import {
  mapPendingSyncRowForApply,
  revisionTimesMatch,
  type PendingSyncForApplyRow,
} from "@/lib/sync/applyStaged";

/**
 * REAL-DB integration test for the onboarding apply revision-race FALSE POSITIVE
 * (M12 Phase 0.F smoke 3, 4th onboarding defect — launch blocker).
 *
 * The mocked tests in this repo all passed `staged_modified_time` as a STRING,
 * which is exactly why the bug slipped through end-to-end: in production the DB
 * layer is postgres.js, which parses a `timestamptz` column into a JS `Date`,
 * NOT an ISO string. The apply revision guard then compared the live Drive
 * `modifiedTime` (an ISO string with milliseconds) against that `Date` and ran
 * `Date.parse(<Date>)`, which DROPS the milliseconds, so an UNEDITED sheet
 * mis-compared (".040" vs ".000") and tripped a deterministic 409
 * STAGED_PARSE_REVISION_RACE.
 *
 * This test seeds a real `pending_syncs` row with a millisecond-precise
 * timestamptz, reads it back through the EXACT SELECT the production reader uses
 * (so the real postgres.js Date coercion happens), runs it through the REAL
 * `mapPendingSyncRowForApply`, and asserts the REAL `revisionTimesMatch`
 * predicate the guard calls:
 *   - the raw column is a Date (documents the coercion that caused the bug),
 *   - the mapper normalizes it to a full-ms ISO string,
 *   - an unedited sheet (same instant) does NOT trip a revision race,
 *   - a genuine edit (later instant) DOES (guard preserved).
 *
 * It runs against local Supabase (the established DB-integration pattern). If
 * Postgres is unreachable the suite skips with a clear message rather than
 * failing in environments without a local stack.
 */
const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// Mirrors defaultReadWizardPendingSyncForApply's SELECT exactly so the read
// boundary (and thus the postgres.js timestamptz->Date coercion) is identical.
const READER_SELECT = `
  select drive_file_id, staged_id, source_kind, wizard_session_id,
         base_modified_time, staged_modified_time, parse_result,
         triggered_review_items, prior_last_sync_status,
         prior_last_sync_error, warning_summary
    from public.pending_syncs
   where drive_file_id = $1
     and wizard_session_id = $2::uuid
   limit 1
`;

const DRIVE_FILE_ID = "revision-race-db-fixture-file";
const WIZARD_SESSION_ID = "9c9c9c9c-1111-4111-8111-9c9c9c9c9c9c";
// The bug's trigger: a modifiedTime with nonzero milliseconds (".040").
const STAGED_INSTANT = "2026-05-09T03:44:06.040Z";

// Probe the connection at module top-level: `test.skipIf` is evaluated at
// collection time (before beforeAll), so `dbUp` must be settled before then.
let sql: ReturnType<typeof postgres> | null = null;
let dbUp = false;
try {
  const probe = postgres(databaseUrl, { max: 1, idle_timeout: 2, connect_timeout: 3 });
  await probe.unsafe("select 1", []);
  sql = probe;
  dbUp = true;
} catch {
  if (sql) await (sql as ReturnType<typeof postgres>).end().catch(() => {});
  sql = null;
  dbUp = false;
}

beforeAll(async () => {
  if (!dbUp || !sql) return;
  // Clean any prior fixture row, then seed one wizard-scoped staged row whose
  // staged_modified_time carries sub-second milliseconds.
  await sql.unsafe(
    `delete from public.pending_syncs where drive_file_id = $1 and wizard_session_id = $2::uuid`,
    [DRIVE_FILE_ID, WIZARD_SESSION_ID],
  );
  await sql.unsafe(
    `insert into public.pending_syncs
       (drive_file_id, staged_modified_time, parse_result, source_kind,
        warning_summary, wizard_session_id, triggered_review_items)
     values ($1, $2::timestamptz, $3::jsonb, 'onboarding_scan', '', $4::uuid, '[]'::jsonb)`,
    [DRIVE_FILE_ID, STAGED_INSTANT, JSON.stringify({ show: { title: "Fixture" } }), WIZARD_SESSION_ID],
  );
});

afterAll(async () => {
  if (sql && dbUp) {
    await sql
      .unsafe(`delete from public.pending_syncs where drive_file_id = $1 and wizard_session_id = $2::uuid`, [
        DRIVE_FILE_ID,
        WIZARD_SESSION_ID,
      ])
      .catch(() => {});
  }
  if (sql) await sql.end().catch(() => {});
});

describe("onboarding apply revision-race — real postgres.js read boundary", () => {
  test.skipIf(!dbUp)(
    "the raw timestamptz column comes back as a JS Date (the coercion that caused the bug)",
    async () => {
      const rows = await sql!.unsafe(READER_SELECT, [DRIVE_FILE_ID, WIZARD_SESSION_ID]);
      expect(rows.length).toBe(1);
      const row = rows[0] as unknown as { staged_modified_time: unknown };
      // This is the production reality the string-based mocks never exercised.
      expect(row.staged_modified_time instanceof Date).toBe(true);
    },
  );

  test.skipIf(!dbUp)(
    "the real read boundary + mapper normalizes the Date to a full-ms ISO string and does NOT false-race an unedited sheet",
    async () => {
      const rows = await sql!.unsafe(READER_SELECT, [DRIVE_FILE_ID, WIZARD_SESSION_ID]);
      const mapped = mapPendingSyncRowForApply(rows[0] as unknown as PendingSyncForApplyRow);

      // Normalized to a string with the milliseconds preserved.
      expect(typeof mapped.stagedModifiedTime).toBe("string");
      expect(new Date(mapped.stagedModifiedTime).toISOString()).toBe(STAGED_INSTANT);

      // The guard predicate, fed the live Drive modifiedTime (ISO string, same
      // instant) against the staged value read from the DB: must MATCH — no
      // false revision race. This is the exact comparison that 409'd before.
      expect(revisionTimesMatch(STAGED_INSTANT, mapped.stagedModifiedTime)).toBe(true);
    },
  );

  test.skipIf(!dbUp)(
    "a genuinely edited sheet (later Drive modifiedTime) still trips the guard (true-positive preserved)",
    async () => {
      const rows = await sql!.unsafe(READER_SELECT, [DRIVE_FILE_ID, WIZARD_SESSION_ID]);
      const mapped = mapPendingSyncRowForApply(rows[0] as unknown as PendingSyncForApplyRow);
      // A real edit one minute later must NOT match -> revision_race fires.
      expect(revisionTimesMatch("2026-05-09T03:45:06.040Z", mapped.stagedModifiedTime)).toBe(false);
      // Even a millisecond-only difference (the precision the old path lost).
      expect(revisionTimesMatch("2026-05-09T03:44:06.041Z", mapped.stagedModifiedTime)).toBe(false);
    },
  );
});
