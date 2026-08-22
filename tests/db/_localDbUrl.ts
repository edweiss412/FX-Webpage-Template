/**
 * tests/db/_localDbUrl.ts
 * (spec docs/superpowers/specs/2026-07-24-test-safety-hardening-batch.md §2.3)
 *
 * The module-eval loopback guard for db suites. A suite that resolves its
 * connection URL from LOCAL_TEST_DATABASE_URL is declaring "I run local-only" —
 * this refuses, BEFORE any postgres handle exists, to hand that suite a remote
 * host. In this repo TEST_DATABASE_URL is the VALIDATION project, one variable
 * name away, and these suites DELETE/UPDATE in teardown.
 *
 * SIDE-EFFECT FREE BY CONTRACT: 50+ test files import this at module eval. Never
 * add an env read, a postgres client, a filesystem touch, or any other top-level
 * work here. (It was extracted out of tests/db/_remediationHelpers.ts, which does
 * open clients at eval and whose message named the F2/F4 remediation migration.)
 *
 * Credential hygiene: a DSN carries a password and these messages land in Vitest
 * and CI logs, so nothing here ever echoes the raw value — only the parsed
 * hostname, or a redacted/content-free rendering.
 */

export const ACCEPTED_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

/**
 * `scheme://user:pass@host/db` → `scheme://***@host/db`. Never returns the userinfo.
 *
 * Greedy to the LAST `@` in the authority: a password may legitimately contain an
 * unescaped `@` (`postgres:sup3r@secret@host`), and a lazy match would echo the tail
 * of the password into CI logs (whole-diff R2 finding 1).
 */
function redactDsn(url: string): string {
  return url.replace(/\/\/[^/\s]*@/, "//***@");
}

function refuseUnparseable(url: string): never {
  // The value did not parse, so we cannot trust ANY structure in it — including
  // where the userinfo ends. Report shape only, never content.
  throw new Error(
    `assertLocalDbUrl: unparseable database URL (${url.length} chars). ` +
      "Set LOCAL_TEST_DATABASE_URL to a 127.0.0.1/localhost connection string, or leave it " +
      "unset to use the loopback default.",
  );
}

/**
 * Returns `url` unchanged when it points at loopback; throws otherwise.
 *
 * Host matching is EQUALITY against the accepted set, never a substring test:
 * `127.0.0.1.evil.example` contains "127.0.0.1" and is remote.
 */
export function assertLocalDbUrl(url: string): string {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    refuseUnparseable(url);
  }
  // `new URL("postgresql://…@[::1]:5432/x").hostname` yields "[::1]" (brackets kept),
  // so both spellings are in the accepted set.
  if (!ACCEPTED_HOSTS.has(host)) {
    throw new Error(
      `assertLocalDbUrl: REFUSING non-local database host "${host}" (from ${redactDsn(url)}). ` +
        "This suite mutates and deletes rows, so it runs against local Supabase only. " +
        "Set LOCAL_TEST_DATABASE_URL to a 127.0.0.1/localhost URL. " +
        "TEST_DATABASE_URL is the validation project and is intentionally ignored here.",
    );
  }
  return url;
}

/**
 * The optional-value form, for a suite that legitimately accepts a NON-local URL
 * through a different variable (today: tests/sync/qualityRegressionLifecycle.test.ts,
 * which prefers TEST_DATABASE_URL). `undefined` passes through so "unset" still
 * falls back to the caller's default; any SET value is guarded, including `""`,
 * which `??` would not have replaced.
 */
export function assertLocalDbUrlIfSet(url: string | undefined): string | undefined {
  return url === undefined ? undefined : assertLocalDbUrl(url);
}
