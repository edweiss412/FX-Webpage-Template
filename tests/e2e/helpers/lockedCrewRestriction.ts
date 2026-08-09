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
 * ONE transaction shape, written once. `runLockedCrewUpdate` below owns the
 * whole begin/lock/update/returning/commit block; each exported helper
 * supplies ONLY its SET fragment. That is deliberate and it is the reason the
 * structural guard can be short: arc C's diff review spent rounds 4, 5 and 6
 * on three different ways a PER-HELPER copy of that block can be subtly wrong
 * (lock missing, lock after the update, `commit;` between the two) while a
 * lexical guard over the source still passed. Each repair recognized one more
 * paraphrase. There is no fourth paraphrase to find here, because there is no
 * second copy of the shape to get wrong.
 *
 * The UPDATE is additionally scoped to the locked show's show_id, so a
 * stale/cross-show crew id can never mutate a row the held lock doesn't
 * cover — the no-row RETURNING guard makes any mismatch THROW instead.
 * `restriction === null/undefined` writes SQL NULL (matching the prior
 * PostgREST `.update({ date_restriction: null })` semantics); objects are
 * written as jsonb.
 *
 * Consumers: tests/e2e/helpers/rightNow.ts (right-now-transitions suite) and
 * tests/e2e/published-review-modal.realtime.spec.ts. (tests/e2e/schedule-tile.spec.ts
 * was a third consumer until it was deleted 2026-08-09 as superseded — spec
 * docs/superpowers/specs/ci/2026-08-09-resurrect-mobile-safari-e2e-design.md §2.3.)
 * The e2e-wide structural guard at
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

/**
 * The ONE locked-update transaction. Callers supply a SET fragment; everything
 * that makes the write safe lives here and nowhere else:
 *
 *   begin -> advisory lock on the show -> UPDATE scoped to that same show ->
 *   returning id -> commit
 *
 * The lock is taken BEFORE the update and released only by the commit AFTER it,
 * so it is held FOR the update rather than merely acquired near it. The
 * show-scoped WHERE means a stale or cross-show crew id cannot mutate a row the
 * held lock does not cover, and the no-row RETURNING guard makes any mismatch
 * throw instead of passing quietly.
 *
 * `setClause` is interpolated, so every caller escapes its own value with
 * `sqlString` (or builds a literal like `null` / a jsonb cast).
 */
function runLockedCrewUpdate(driveFileId: string, crewId: string, setClause: string): void {
  const sql = `
    begin;
    select pg_advisory_xact_lock(hashtext('show:' || ${sqlString(driveFileId)}));
    update public.crew_members
       set ${setClause}
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
      `lockedCrewRestriction: locked crew_members update failed (set ${setClause}): ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!stdout.includes(crewId)) {
    throw new Error(
      `lockedCrewRestriction: update matched no crew row (id=${crewId}, drive_file_id=${driveFileId} — run \`pnpm db:seed\`?)`,
    );
  }
}

export async function setDateRestrictionLocked(
  driveFileId: string,
  crewId: string,
  restriction: unknown,
): Promise<void> {
  const restrictionSql =
    restriction == null ? "null" : `${sqlString(JSON.stringify(restriction))}::jsonb`;
  runLockedCrewUpdate(driveFileId, crewId, `date_restriction = ${restrictionSql}`);
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
  runLockedCrewUpdate(driveFileId, crewId, `role = ${sqlString(role)}`);
}
