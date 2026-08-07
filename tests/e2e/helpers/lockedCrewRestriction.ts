/**
 * tests/e2e/helpers/lockedCrewRestriction.ts — shared LOCKED mutation path
 * for `crew_members` fixture writes (M12.12-DEF-2 + Codex R2 class-sweep).
 *
 * The filename is historical: `date_restriction` was the first field to need
 * this, and `role` joined it in arc C (2026-08-07). The file is not renamed
 * because the guard prose below, and two consumers, cite it by name.
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
 * Consumers: tests/e2e/helpers/rightNow.ts (right-now-transitions suite),
 * tests/e2e/schedule-tile.spec.ts, and
 * tests/e2e/published-review-modal.realtime.spec.ts. The e2e-wide structural guard at
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
    stdout = execFileSync("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-At", databaseUrl], {
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

/**
 * Locked `crew_members.role` UPDATE — the realtime specs' broadcast stimulus.
 *
 * Same transaction shape as `setDateRestrictionLocked` above, and same reason:
 * invariant 2 admits no exception for fixture writes, and the e2e-wide
 * structural guard rejects unlocked PostgREST DML on locked tables. Raising
 * that guard's frozen count instead was the wrong repair and was reverted
 * (arc C diff review R3, P0).
 *
 * The broadcast survives the transport change because the AFTER UPDATE
 * statement trigger fires for ANY sql UPDATE, not for a particular client; the
 * `realtime.send` row lands with the commit. That is asserted rather than
 * assumed — the specs' phase (i) waits for the invalidation frame on the wire
 * and fails without it.
 */
export async function setCrewRoleLocked(
  driveFileId: string,
  crewId: string,
  role: string,
): Promise<void> {
  const sql = `
    begin;
    select pg_advisory_xact_lock(hashtext('show:' || ${sqlString(driveFileId)}));
    update public.crew_members
       set role = ${sqlString(role)}
     where id = ${sqlString(crewId)}::uuid
       and show_id = (select id from public.shows where drive_file_id = ${sqlString(driveFileId)})
    returning id;
    commit;
  `;
  let stdout: string;
  try {
    stdout = execFileSync("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-At", databaseUrl], {
      input: sql,
      encoding: "utf8",
    });
  } catch (err) {
    throw new Error(
      `lockedCrewRestriction: update role failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!stdout.includes(crewId)) {
    throw new Error(
      `lockedCrewRestriction: role update matched no crew row (id=${crewId}, drive_file_id=${driveFileId})`,
    );
  }
}
