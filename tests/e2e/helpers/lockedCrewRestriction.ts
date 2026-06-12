/**
 * tests/e2e/helpers/lockedCrewRestriction.ts — shared LOCKED mutation path
 * for `crew_members.date_restriction` (M12.12-DEF-2 + Codex R2 class-sweep).
 *
 * Plan-wide invariant 2: every code path that mutates `crew_members` runs
 * inside the per-show advisory lock. E2e fixture toggles are no exception —
 * this helper shells out to psql and performs the UPDATE inside ONE
 * transaction holding `pg_advisory_xact_lock(hashtext('show:' ||
 * drive_file_id))` (admin/blocking form), the locked-fixture pattern
 * established by supabase/seedWalkerFixtures.ts.
 *
 * Single-holder rule: this transaction is the ONLY lock holder on this code
 * path — no JS-side wrapper or RPC wraps the call, so nothing nests.
 *
 * The UPDATE is additionally scoped to the locked show's show_id, so a
 * stale/cross-show crew id can never mutate a row the held lock doesn't
 * cover — the no-row RETURNING guard makes any mismatch THROW instead.
 * `restriction === null/undefined` writes SQL NULL (matching the prior
 * PostgREST `.update({ date_restriction: null })` semantics); objects are
 * written as jsonb.
 *
 * Consumers: tests/e2e/helpers/rightNow.ts (right-now-transitions suite) and
 * tests/e2e/schedule-tile.spec.ts. The e2e-wide structural guard at
 * tests/help/walker-routes.test.ts forbids unlocked PostgREST DML on locked
 * tables anywhere under tests/e2e/ — new fixture mutations on locked tables
 * go through THIS file (or a sibling following the same pattern), never
 * through the service-role PostgREST client.
 */
import { execFileSync } from "node:child_process";

// Same databaseUrl resolution as supabase/seedWalkerFixtures.ts:25-28 /
// supabase/seed.ts:11-13 — psql is the locked-fixture transport for both.
const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export async function setDateRestrictionLocked(
  driveFileId: string,
  crewId: string,
  restriction: unknown,
): Promise<void> {
  const restrictionSql =
    restriction == null ? "null" : `${sqlString(JSON.stringify(restriction))}::jsonb`;
  const sql = `
    begin;
    select pg_advisory_xact_lock(hashtext('show:' || ${sqlString(driveFileId)}));
    update public.crew_members
       set date_restriction = ${restrictionSql}
     where id = ${sqlString(crewId)}::uuid
       and show_id = (select id from public.shows where drive_file_id = ${sqlString(driveFileId)})
    returning id;
    commit;
  `;
  let stdout: string;
  try {
    stdout = execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-At"], {
      input: sql,
      encoding: "utf8",
    });
  } catch (err) {
    throw new Error(
      `lockedCrewRestriction: update date_restriction failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!stdout.includes(crewId)) {
    throw new Error(
      `lockedCrewRestriction: update matched no crew row (id=${crewId}, drive_file_id=${driveFileId} — run \`pnpm db:seed\`?)`,
    );
  }
}
