/**
 * tests/cross-cutting/pgCronSmokes.ts — per-job pg-cron FIRING smokes
 * (BL-PG-CRON-COVERAGE-UNRUN residual, M-wave 2 W-E2E Task E3, spec §2.4).
 *
 * The suite's text assertions read `cron.job.command` verbatim, and PostgreSQL
 * stores comments verbatim too — so a command whose `net.http_get(` body is
 * commented out satisfies every text pin while performing no request (the
 * suite's own R19 note). The firing smoke closes that: it EXECUTES each job's
 * stored command inside one transaction and reads back the request row the
 * live `net.http_get` call queued — then ROLLS BACK, so nothing is ever
 * dispatched (pg_net's worker consumes only committed queue rows).
 *
 * Race-free by transaction identity, not by max-id arithmetic: the queued
 * row's `xmin` equals THIS transaction's xid, so a concurrently-firing real
 * cron (both the local stack and the validation project run these jobs every
 * minute) can never satisfy the probe, and the probe can never miss its own
 * row. A commented-out body queues nothing under this xid and returns the
 * empty string — the planted-mutant premise the suite asserts.
 *
 * DOCUMENTED LIMIT (the spec's consequence bound, stated rather than silent):
 * this proves the SCHEDULED COMMAND live-issues an HTTP request to its
 * canonical route. The ROUTE HANDLER's own effect (what the request does on
 * arrival) is each route's own suite's territory — auth, outcomes, and
 * telemetry for every `/api/cron/*` handler are pinned by their route tests,
 * and re-driving deployed handlers from this suite would be a side-effecting
 * cross-system call, not a cheap observable. No job is silently untested:
 * all nine canonical jobs run the SAME firing smoke, and the route-effect
 * half is covered by name here, uniformly.
 */

/** One transaction: execute the stored command, read back OUR queued row, roll back. */
export function firingSmokeSql(command: string): string {
  return [
    "BEGIN;",
    `${command.trim().replace(/;\s*$/, "")};`,
    // Only a row inserted by THIS transaction can match (xmin = our xid). The
    // sentinel prefix makes the probe line findable regardless of what the
    // command itself printed (a request id, the mutant's bare 1, ...).
    "SELECT 'SMOKE_URL:' || coalesce((SELECT url FROM net.http_request_queue WHERE xmin = pg_current_xact_id()::xid ORDER BY id DESC LIMIT 1), '');",
    "ROLLBACK;",
  ].join("\n");
}

/**
 * The planted no-op mutant (the entry's own RED): a job body with its
 * `net.http_get` commented out and `select 1;` in its place — the exact shape
 * the text pins cannot catch. The firing smoke MUST come back empty on it.
 */
export const NO_OP_MUTANT_COMMAND = `
    select
      -- net.http_get(
      --   url := 'https://example.test/api/cron/sync',
      --   headers := jsonb_build_object('Authorization', 'Bearer mutant'),
      --   timeout_milliseconds := 300000
      -- )
      1
`;

/** The smoke's verdict: the sentinel-prefixed probe line's payload ('' = nothing queued). */
export function queuedUrlFromSmokeOutput(raw: string): string {
  const probe = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("SMOKE_URL:"))
    .at(-1);
  if (probe === undefined) {
    throw new Error(
      "pgCronSmokes: the smoke output carries no SMOKE_URL probe line — the smoke SQL did not run to its probe statement",
    );
  }
  return probe.slice("SMOKE_URL:".length);
}
