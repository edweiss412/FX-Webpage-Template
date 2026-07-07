import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { describe, expect, test } from "vitest";

/**
 * set_pull_sheet_override RPC authorization contract (spec §5.4, Codex R1-3):
 * a SECURITY DEFINER write to pending_syncs is a privileged surface independent
 * of the route. Two belt-and-suspenders guarantees are proven against a real
 * Postgres (TEST_DATABASE_URL = the validation project; migration pre-applied):
 *
 *  1. GRANT LOCKDOWN — execute is revoked from anon/authenticated/public and
 *     granted only to service_role, so a non-service (authenticated-role) direct
 *     `select set_pull_sheet_override(...)` is denied (SQLSTATE 42501).
 *  2. IN-RPC ACTIVE-SESSION GUARD — a call with a forged/stale p_wizard_session_id
 *     (not the live app_settings.pending_wizard_session_id) raises (SQLSTATE 22023)
 *     BEFORE any write, so a stale/forged session cannot mutate an unrelated show.
 *
 * Gated on TEST_DATABASE_URL (unset locally → skip; set in CI / when validation
 * creds are sourced from .env.local).
 */
const databaseUrl = process.env.TEST_DATABASE_URL;

function runPsql(sql: string): string {
  return execFileSync("psql", [databaseUrl as string, "-v", "ON_ERROR_STOP=1", "-qAt"], {
    input: sql,
    encoding: "utf8",
  }).trim();
}

/** Run SQL that MUST raise; return the psql stderr so the SQLSTATE/message can be asserted. */
function expectPsqlRaise(sql: string): string {
  try {
    runPsql(sql);
  } catch (err) {
    const e = err as { stderr?: Buffer | string; message?: string };
    return String(e.stderr ?? e.message ?? "");
  }
  throw new Error("expected the RPC call to raise, but it succeeded");
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

describe.skipIf(!databaseUrl)("set_pull_sheet_override RPC authorization", () => {
  test("grant lockdown: an authenticated-role direct call is denied (42501)", () => {
    const session = randomUUID();
    const stderr = expectPsqlRaise(`
      begin;
      set local role authenticated;
      select public.set_pull_sheet_override(
        ${sqlString("auth-denied-" + session)},
        ${sqlString(session)}::uuid,
        ${sqlString("OLD PULL SHEET")},
        ${sqlString("ff")},
        ${sqlString("admin@example.com")},
        null
      );
      rollback;
    `);
    // PostgreSQL surfaces a missing EXECUTE privilege as SQLSTATE 42501 /
    // "permission denied for function set_pull_sheet_override".
    expect(stderr).toMatch(/permission denied for function set_pull_sheet_override|42501/i);
  });

  test("in-RPC guard: a forged/stale wizard session raises (22023) and writes nothing", () => {
    const forgedSession = randomUUID();
    const driveFileId = `forged-${forgedSession}`;
    const stderr = expectPsqlRaise(`
      begin;
      select public.set_pull_sheet_override(
        ${sqlString(driveFileId)},
        ${sqlString(forgedSession)}::uuid,
        ${sqlString("OLD PULL SHEET")},
        ${sqlString("ff")},
        ${sqlString("admin@example.com")},
        null
      );
      rollback;
    `);
    expect(stderr).toMatch(/stale or forged wizard session|22023/i);

    // No write landed: there is no pending_syncs row for the forged (session, drive_file_id).
    const rows = runPsql(`
      select count(*) from public.pending_syncs
       where drive_file_id = ${sqlString(driveFileId)};
    `);
    expect(rows).toBe("0");
  });
});
