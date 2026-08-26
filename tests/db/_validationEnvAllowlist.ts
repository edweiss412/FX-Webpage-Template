/**
 * tests/db/_validationEnvAllowlist.ts
 *
 * The closed list of files allowed to open a connection whose URL comes from
 * `TEST_DATABASE_URL` — the REMOTE validation project (`.env.local` sets it to the
 * validation session pooler on purpose, because the schema-parity and PostgREST
 * lockdown gates need a validation credential and it is the only one that exists as
 * a repo secret).
 *
 * Every OTHER file under `tests/` resolves its connection locally. That is the whole
 * point: a suite that seeds and publishes a show on the validation deployment trips
 * that project's notify cron, which sends REAL email to Doug's address. Nine such
 * alerts landed on 2026-08-26 between 01:10 and 03:10 CDT before anyone traced them
 * back to `tests/db/_b2Helpers.ts` resolving `TEST_DATABASE_URL ?? DATABASE_URL ??
 * loopback` and winning the first leg in any shell that had exported the variable for
 * parity work.
 *
 * A row is keyed on the FILE, not on a site's source text: what makes these two
 * legitimate is the job they run in, which is a property of the file. The row goes
 * STALE — and reds — the moment its file stops having a validation-env site, so a
 * repaired or moved file cannot leave a permanent hole behind it.
 */

export type ValidationEnvAllowRow = {
  /** Repo-relative path. */
  file: string;
  /** Which CI job points this file at validation, and why that is correct. */
  reason: string;
};

export const VALIDATION_ENV_ALLOWLIST: readonly ValidationEnvAllowRow[] = [
  {
    file: "tests/db/validation-schema-parity.test.ts",
    reason:
      "the validation-schema-parity gate (.github/workflows/x-audits.yml, TEST_DATABASE_URL = " +
      "secrets.SUPABASE_TEST_DATABASE_URL): Layer 2 introspects the validation project and " +
      "asserts it is a superset of the committed manifest. Reads only — it opens no write path.",
  },
  {
    file: "tests/db/telemetryConsoleReads.test.ts",
    reason:
      "the telemetry-rpc-smoke job (.github/workflows/x-audits.yml, same secret) proves the " +
      "telemetry functions are deployed to validation with the right signature and grant. " +
      "Every call runs inside a transaction that is always rolled back, so nothing commits.",
  },
];
