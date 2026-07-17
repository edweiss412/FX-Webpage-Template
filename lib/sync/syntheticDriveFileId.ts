/**
 * lib/sync/syntheticDriveFileId.ts
 *
 * A `drive_file_id` that no real Google Drive file could ever own — the synthetic
 * shape produced by the test-seed helpers:
 *   - `tests/db/_mi11Helpers.ts` seedShow → `drv-<uuid>`
 *   - other db-test seeders                → `drive-<uuid>`
 *   - `tests/e2e/helpers/seedShowWithCrew` → `picker-e2e:<uuid>` (default)
 *
 * Why cron cares (BL-CRON-SYNTHETIC-SHOW-SKIP): a db/e2e test run pointed at a
 * shared remote DB (e.g. validation via a stray `TEST_DATABASE_URL`) can COMMIT a
 * seeded `published=true` show and leave it behind (postgres.js `sql.begin`
 * commits on success; several seeders do no cleanup). The scheduled cron then
 * lists live shows, finds this row absent from the Drive folder listing, and
 * marks it `source_gone`/SHEET_UNAVAILABLE on EVERY run — forever — churning the
 * tick to `outcome: partial` and generating alert noise for a row that can never
 * resolve. Excluding these synthetic ids from the missing-shows reconciliation
 * closes that class regardless of test hygiene.
 *
 * Anchoring: `drv-`/`drive-` are matched ONLY when followed by a canonical UUID
 * (8-4-4-4-12 hex) so a real Drive id — 25-44 chars of [A-Za-z0-9_-], which never
 * contains the hyphenated-UUID shape after such a prefix — cannot false-positive.
 * `picker-e2e:` is matched literally (a `:` never appears in a real Drive id).
 */
const SYNTHETIC_DRIVE_FILE_ID =
  /^(?:drv|drive)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$|^picker-e2e:/i;

export function isSyntheticDriveFileId(driveFileId: string): boolean {
  return SYNTHETIC_DRIVE_FILE_ID.test(driveFileId);
}
