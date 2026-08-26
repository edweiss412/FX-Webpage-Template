/**
 * tests/e2e/helpers/lockedShowCopy.ts — LOCKED fixture path for whole-`shows`
 * copies and their cleanup.
 *
 * Plan-wide invariant 2: every code path that mutates `shows` runs inside
 * `pg_advisory_xact_lock(hashtext('show:' || drive_file_id))`. E2e fixture
 * writes are no exception, and `tests/help/walker-routes.test.ts` enforces it
 * structurally — no file under `tests/e2e/` may reach `shows` through the
 * service-role PostgREST client. This helper is the `shows` sibling of
 * `lockedCrewRestriction.ts`, which does the same job for `crew_members`.
 *
 * WHY A COPY RATHER THAN A MUTATION. The crew page reads through
 * `cachedShowData`, an `unstable_cache` entry tagged per show with
 * `revalidate: 300` (lib/data/showCacheTag.ts:6) that only the app's own write
 * paths bust. A test that mutates an already-rendered show is invisible to the
 * next render for up to five minutes; a show nothing has rendered yet has no
 * cache entry at all, so its first render is necessarily the state the copy
 * just wrote. Callers therefore make a disposable show per state instead of
 * driving one show through several.
 *
 * Single-holder rule: this transaction is the ONLY lock holder on this path.
 * No JS-side wrapper and no RPC wraps the call, so nothing nests.
 *
 * The clone is generic over the column list on purpose. `to_jsonb(s) ||
 * overrides` then `jsonb_populate_record` means a column added to `shows`
 * tomorrow is copied without touching this file, where an enumerated INSERT
 * would silently start dropping it.
 */
import { execFileSync } from "node:child_process";

import { psqlChildEnv, resolvePsqlTarget } from "./psqlTarget";

function psqlTarget(): string {
  return resolvePsqlTarget({
    caller: "lockedShowCopy",
    envVars: ["TEST_DATABASE_URL", "DATABASE_URL"],
    honorRemoteOptIn: true,
  });
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/** Run one locked statement block and return psql's tuple-only stdout. */
function runLocked(caller: string, driveFileId: string, body: string): string {
  const sql = `
    begin;
    select pg_advisory_xact_lock(hashtext('show:' || ${sqlString(driveFileId)}));
    ${body}
    commit;
  `;
  // Resolved HERE, at the spawn, not at import: a mistargeted DSN must be
  // refused before it reaches a database. See lockedCrewRestriction's header.
  const dsn = psqlTarget();
  try {
    return execFileSync("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-At", dsn], {
      input: sql,
      encoding: "utf8",
      env: psqlChildEnv({ honorRemoteOptIn: true }),
    });
  } catch (err) {
    throw new Error(
      `lockedShowCopy: ${caller} failed for ${driveFileId}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Clone the show identified by `templateDriveFileId` into a new row, applying
 * `overrides` (a plain object merged over the template's columns as jsonb).
 *
 * `overrides` MUST carry a fresh `id`, `slug` and `drive_file_id`; the lock is
 * taken on the NEW `drive_file_id`, which is the show this transaction writes.
 * The RETURNING guard throws when the template matched no row, so a missing or
 * renamed fixture fails by name instead of yielding an empty copy.
 */
export function copyShowLocked(
  templateDriveFileId: string,
  overrides: Record<string, unknown>,
): void {
  const newDriveFileId = overrides["drive_file_id"];
  if (typeof newDriveFileId !== "string" || newDriveFileId.length === 0) {
    throw new Error("lockedShowCopy: overrides must set a non-empty drive_file_id");
  }
  const newId = overrides["id"];
  if (typeof newId !== "string" || newId.length === 0) {
    throw new Error("lockedShowCopy: overrides must set a non-empty id");
  }
  const stdout = runLocked(
    "copyShowLocked",
    newDriveFileId,
    `insert into public.shows
       select (jsonb_populate_record(null::public.shows, to_jsonb(s) || ${sqlString(
         JSON.stringify(overrides),
       )}::jsonb)).*
         from public.shows s
        where s.drive_file_id = ${sqlString(templateDriveFileId)}
     returning id;`,
  );
  if (!stdout.includes(newId)) {
    throw new Error(
      `lockedShowCopy: template ${templateDriveFileId} matched no row (run \`pnpm db:seed\`?)`,
    );
  }
}

/**
 * Delete copied shows, one locked transaction per show, so each DELETE is
 * covered by the lock for the show it removes rather than by one lock standing
 * in for several.
 *
 * Errors are collected and rethrown together rather than thrown on the first
 * one: a cleanup that abandons the rest of its rows on a single failure leaves
 * more fixture residue behind than it removes.
 */
export function deleteShowsLocked(driveFileIds: readonly string[]): void {
  const failures: string[] = [];
  for (const dfid of driveFileIds) {
    try {
      runLocked(
        "deleteShowsLocked",
        dfid,
        `delete from public.shows where drive_file_id = ${sqlString(dfid)} returning id;`,
      );
    } catch (err) {
      failures.push(err instanceof Error ? err.message : String(err));
    }
  }
  if (failures.length > 0) {
    throw new Error(
      `lockedShowCopy: ${failures.length} cleanup failure(s):\n${failures.join("\n")}`,
    );
  }
}
