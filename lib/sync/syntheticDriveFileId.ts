/**
 * lib/sync/syntheticDriveFileId.ts
 *
 * A `drive_file_id` that no real Google Drive file could ever own — the synthetic
 * shape produced by the test-seed helpers:
 *   - `tests/db/_mi11Helpers.ts` seedShow → `drv-<uuid>`
 *   - `tests/db/_b2Helpers.ts`             → `drive-<uuid>`
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
 * (8-4-4-4-12 hex). This is a strong shape filter, NOT a proof of impossibility:
 * `[A-Za-z0-9_-]` (the Drive-id charset) does admit hyphens and hex, so a real
 * Drive id COULD in principle land on this exact hyphenated-UUID shape. The cron
 * caller therefore does not treat a shape match as sufficient on its own — it
 * ANDs this predicate with `lastSeenModifiedTime === null` (a leaked seed never
 * synced; a genuine gone-show synced at least once), so a coincidental real match
 * is still reconciled. `picker-e2e:` is matched literally (a `:` never appears in
 * a real Drive id). (Codex R1 MEDIUM.)
 */
const SYNTHETIC_DRIVE_FILE_ID =
  /^(?:drv|drive)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$|^picker-e2e:/i;

export function isSyntheticDriveFileId(driveFileId: string): boolean {
  return SYNTHETIC_DRIVE_FILE_ID.test(driveFileId);
}
