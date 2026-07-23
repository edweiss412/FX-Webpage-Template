/**
 * tests/db/_assertLocalDestructiveTarget.ts
 *
 * Loopback assert for tests that execute `public.reset_validation_data()` — a
 * SECURITY DEFINER RPC that DELETEs every row in `public.shows` and its cascade
 * children.
 *
 * WHY THIS IS NOT OPTIONAL: in this repo `TEST_DATABASE_URL` is DELIBERATELY
 * the validation project (scripts/preflight-env.mjs:97, AGENTS.md), and
 * `pnpm worktree:link-env` symlinks that `.env.local` into every worktree. A
 * wipe test that honors `TEST_DATABASE_URL` therefore wipes LIVE validation on
 * a plain `pnpm test`. Observed 2026-07-23: four separate wipes, each followed
 * by the cron sync re-ingesting all shows from Drive as brand-new rows, which
 * re-fired the auto-publish undo email for every show (new `show_id:mintId`
 * dedup key each time, so idempotency correctly let each batch through).
 *
 * The resolution below deliberately IGNORES `TEST_DATABASE_URL` /
 * `DATABASE_URL` and honors only `LOCAL_TEST_DATABASE_URL` (for a non-default
 * local port), mirroring tests/db/_remediationHelpers.ts. The assert runs on
 * the URL string BEFORE any connection is opened — a refusal never touches the
 * network.
 */

export const LOCAL_DEFAULT_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

/**
 * Returns `url` when it points at loopback; throws otherwise.
 *
 * @param url    database URL to validate (parsed, never connected to)
 * @param what   short description of the destructive operation, for the error
 */
export function assertLocalDestructiveTarget(url: string, what = "a whole-database wipe"): string {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error(`assertLocalDestructiveTarget: unparseable database URL (${url})`);
  }
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new Error(
      `REFUSING non-local database host "${host}" for ${what}. ` +
        "TEST_DATABASE_URL is the VALIDATION project in this repo's .env.local and is " +
        "intentionally ignored here; set LOCAL_TEST_DATABASE_URL to a 127.0.0.1/localhost " +
        "URL if your local Postgres is on a non-default port.",
    );
  }
  return url;
}

/**
 * Canonical resolution for every wipe-executing test file: loopback-only, with
 * the assert applied. Use this instead of reading `TEST_DATABASE_URL`.
 */
export function localDestructiveDbUrl(what?: string): string {
  return assertLocalDestructiveTarget(
    process.env.LOCAL_TEST_DATABASE_URL ?? LOCAL_DEFAULT_DB_URL,
    what,
  );
}
