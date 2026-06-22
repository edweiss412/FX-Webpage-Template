/**
 * tests/db/_validation-cleanup-helpers.ts — Codex Phase 0.C R20-F1.
 *
 * Centralized safe cleanup for validation-tooling tests. Two safety
 * properties enforced:
 *   1. Target guard — destructive cleanup fails closed unless the
 *      TEST_DATABASE_URL points at localhost (127.0.0.1 / localhost /
 *      [::1]). Running these tests against a shared/prod-equivalent DB
 *      with the broad pre-R20 predicate (drive_file_id LIKE
 *      'validation_%' — unescaped underscore wildcard) could DELETE
 *      real/imported shows whose Drive IDs collide.
 *   2. Ownership sentinel — `drive_file_id LIKE 'validation\_%' ESCAPE
 *      '\'` (literal underscore) PLUS `client_label = 'M12 Validation'`
 *      (the mint RPC's fixture-ownership marker). Mirrors the production
 *      finalize prune predicate (R19-F1).
 *
 * Use cleanup() from every validation test's afterEach / afterAll.
 */
import { execFileSync } from "node:child_process";

const LOCAL_DB_URL_REGEX =
  /^postgres(?:ql)?:\/\/[^@]+@(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\//i;

function resolveDatabaseUrl(): string {
  const raw = process.env.TEST_DATABASE_URL;
  if (raw === undefined) {
    return "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  }
  if (raw.trim() === "") {
    throw new Error("TEST_DATABASE_URL is set but empty — refuse to run destructive cleanup.");
  }
  return raw;
}

const databaseUrl = resolveDatabaseUrl();

function assertSafeDestructiveTarget(): void {
  if (!LOCAL_DB_URL_REGEX.test(databaseUrl)) {
    throw new Error(
      `R20-F1 — destructive validation cleanup refused: TEST_DATABASE_URL='${databaseUrl}' is not a local DB. ` +
        "These cleanup queries DELETE validation_state + crew_members + show_share_tokens + shows " +
        "scoped to 'validation_' + client_label='M12 Validation'. Even with the sentinel, the " +
        "test harness MUST NOT run against shared/prod-equivalent DBs because mint integration " +
        "tests create their own throwaway fixtures that aren't part of the canonical reseed.",
    );
  }
}

function runPsqlInternal(sql: string): string {
  return execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-At", "-F", "\t"], {
    input: sql,
    encoding: "utf8",
  }).trim();
}

/**
 * Safe cleanup — DELETEs only fixture-owned rows. Same predicate as the
 * production finalize prune (R19-F1):
 *   drive_file_id LIKE 'validation\_%' ESCAPE '\'  AND
 *   client_label = 'M12 Validation'
 *
 * crew_members + show_share_tokens are deleted via the shows DELETE
 * cascade (ON DELETE CASCADE FK).
 *
 * validation_state is unconditionally deleted (single-row singleton; key
 * = 'validation_seed' has no production-collision risk).
 */
export function safeValidationCleanup(): void {
  assertSafeDestructiveTarget();
  runPsqlInternal(`
    DELETE FROM public.validation_state WHERE key = 'validation_seed';
    DELETE FROM public.shows
      WHERE drive_file_id LIKE 'validation\\_%' ESCAPE '\\'
        AND client_label = 'M12 Validation';
  `);
}
