/**
 * tests/db/_validationTargetIdentity.ts
 *
 * Target binding for every suite that talks to the persistent validation Supabase project
 * (spec docs/superpowers/specs/data-quality/2026-07-26-driveid-guard-cluster-design.md §3.1).
 *
 * A libpq DSN's authority is NOT its effective target — `?host=`/`hostaddr=`/duplicate keyword
 * fields override it — so nothing here ever parses the DSN to decide trust. The identity fact is
 * the CONNECTED cluster's `pg_control_system().system_identifier`, checked per connection.
 */
import { execFileSync } from "node:child_process";

/**
 * The validation cluster's initdb-time identifier, measured through the session pooler
 * 2026-07-26. If validation is ever re-provisioned this constant must be updated in a reviewed
 * diff; until then every validation-targeting job is red, loudly.
 */
export const VALIDATION_SYSTEM_IDENTIFIER = "7642734024280108049";

/** The local Supabase stack. The ONLY dbUrl local pg-cron mode will ever use. */
export const LOCAL_LOOPBACK_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const REDACTION = "<TEST_DATABASE_URL redacted>";

/** Same bounded-wait posture as tests/db/validation-schema-parity.test.ts:95-96. */
const PSQL_CONNECT_TIMEOUT_S = "10";
const PSQL_PROCESS_TIMEOUT_MS = 30_000;

/** Replace every occurrence of the DSN in a message. Pure; used by thrown errors AND built copy. */
export function redactDsn(message: string, dbUrl: string): string {
  return message.split(dbUrl).join(REDACTION);
}

/**
 * The bare identity-guard block. `DO` emits no rows (no -qAt pollution) and aborts the script
 * under ON_ERROR_STOP, so every guarded statement proves its OWN connection before its payload.
 */
export function identityGuardSql(): string {
  return `do $$ begin
  if (select system_identifier::text from pg_control_system())
     <> '${VALIDATION_SYSTEM_IDENTIFIER}' then
    raise exception 'validation identity guard: connected cluster is not validation';
  end if;
end $$;`;
}

export function withValidationIdentityGuard(sql: string): string {
  return `${identityGuardSql()}\n${sql}`;
}

/**
 * The ONE psql runner for validation-targeting calls. `execFileSync` errors embed every argv
 * verbatim — including a credential-bearing DSN — so any failure is rethrown redacted (R2-1).
 */
export function execPsqlRedacted(dbUrl: string, args: string[], input?: string): string {
  try {
    return execFileSync("psql", [dbUrl, "-X", "-v", "ON_ERROR_STOP=1", ...args], {
      encoding: "utf8",
      timeout: PSQL_PROCESS_TIMEOUT_MS,
      env: { ...process.env, PGCONNECT_TIMEOUT: PSQL_CONNECT_TIMEOUT_S },
      ...(input === undefined ? {} : { input }),
    });
  } catch (e) {
    const err = e as Error & { stderr?: unknown };
    const stderr = typeof err.stderr === "string" ? err.stderr : "";
    throw new Error(
      redactDsn(`psql invocation failed: ${err.message}${stderr ? `\n${stderr}` : ""}`, dbUrl),
    );
  }
}

/**
 * Identity assertion with two DISCRIMINABLE failure shapes: an infra fault (cannot connect /
 * query failed) must never masquerade as "wrong database", and vice versa.
 */
export function assertValidationIdentity(dbUrl: string): void {
  let observed: string;
  try {
    observed = execPsqlRedacted(dbUrl, [
      "-qAtc",
      "select system_identifier from pg_control_system()",
    ]).trim();
  } catch (e) {
    throw new Error(
      `validation identity probe FAILED (infra, not a mismatch): ${(e as Error).message}`,
    );
  }
  if (observed !== VALIDATION_SYSTEM_IDENTIFIER) {
    throw new Error(
      `validation identity MISMATCH: connected cluster reports system_identifier ${observed}, ` +
        `pinned ${VALIDATION_SYSTEM_IDENTIFIER}. If the validation project was re-provisioned, ` +
        `update VALIDATION_SYSTEM_IDENTIFIER in a reviewed diff; otherwise the job is pointed ` +
        `at the wrong database and the DSN must be fixed.`,
    );
  }
}

/** pg-cron's CI-unreachable message, built here so the redaction is structural (R3-1). */
export function buildPgCronUnreachableMessage(dbUrl: string): string {
  return redactDsn(
    `pg-cron-coverage: psql is unreachable at ${dbUrl} but CI is set — refusing to report ` +
      `success without asserting anything about a live database. unit-suite-db boots Postgres ` +
      `and applies the pg_cron migrations, so this means the job is broken.`,
    dbUrl,
  );
}

export type PgCronMode = { mode: "validation"; dbUrl: string } | { mode: "local"; dbUrl: string };

/**
 * Mode from the TARGET alone — never from the DSN (spec §3.1, R4-1). Local mode reads only the
 * loopback-guarded override or the loopback constant; TEST_DATABASE_URL is ignored there, so an
 * ambient remote DSN can never be reached unguarded. Unknown targets throw: no silent downgrade.
 */
export function resolvePgCronMode(opts: {
  target: string | undefined;
  testDatabaseUrl: string | undefined;
  localTestDatabaseUrl: string | undefined;
}): PgCronMode {
  const { target, testDatabaseUrl, localTestDatabaseUrl } = opts;
  if (target === "validation") {
    if (testDatabaseUrl === undefined || testDatabaseUrl.trim() === "") {
      throw new Error(
        "pg-cron-coverage: PG_CRON_COVERAGE_TARGET=validation requires TEST_DATABASE_URL — refusing to run.",
      );
    }
    return { mode: "validation", dbUrl: testDatabaseUrl };
  }
  if (target === undefined || target === "" || target === "local") {
    return { mode: "local", dbUrl: localTestDatabaseUrl ?? LOCAL_LOOPBACK_URL };
  }
  throw new Error(
    `pg-cron-coverage: unknown PG_CRON_COVERAGE_TARGET ${JSON.stringify(target)} — ` +
      `refusing to guess a mode. Use "validation" or "local"/unset.`,
  );
}
