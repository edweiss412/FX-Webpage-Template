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
 * rows. ALL rows queued under this xid come back, so a wrong request queued
 * alongside the canonical one is visible, not shadowed. A commented-out body
 * queues nothing under this xid and returns the empty list — the
 * planted-mutant premise the suite asserts.
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
import { PRODUCTION_HOST } from "@/scripts/lib/validation-smoke-target";

/** One transaction: execute the stored command, read back ALL rows WE queued, roll back. */
export function firingSmokeSql(command: string): string {
  return [
    "BEGIN;",
    `${command.trim().replace(/;\s*$/, "")};`,
    // Only rows inserted by THIS transaction can match (xmin = our xid). ALL of
    // them come back, unit-separator-joined in queue order — a command that
    // queues a wrong request AND the canonical one must not pass on the newest
    // row alone (review r2 F1). The sentinel prefix makes the probe line
    // findable regardless of what the command itself printed (a request id,
    // the mutant's bare 1, ...); chr(31) cannot appear in a URL.
    "SELECT 'SMOKE_URLS:' || coalesce((SELECT string_agg(url, chr(31) ORDER BY id) FROM net.http_request_queue WHERE xmin = pg_current_xact_id()::xid), '');",
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

/** The smoke's verdict: EVERY url this transaction queued, in queue order ([] = nothing). */
export function queuedUrlsFromSmokeOutput(raw: string): string[] {
  const probe = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("SMOKE_URLS:"))
    .at(-1);
  if (probe === undefined) {
    throw new Error(
      "pgCronSmokes: the smoke output carries no SMOKE_URLS probe line — the smoke SQL did not run to its probe statement",
    );
  }
  const payload = probe.slice("SMOKE_URLS:".length);
  return payload === "" ? [] : payload.split("\u001f");
}

/**
 * Appended to the smoke batch so the EXPECTED origin is read over the same psql
 * invocation — and therefore the same database — that reported the queued URL. A second
 * connection would reintroduce the gap the comparator exists to close: an expected value
 * sourced from somewhere other than the database whose command just ran.
 *
 * `current_setting(..., true)` is the missing-ok form: an unset GUC comes back NULL
 * rather than erroring, so the batch still reaches its probe line and the comparator gets
 * to fail loudly with a named reason instead of the psql call throwing.
 */
export const GUC_PROBE_SQL =
  "SELECT 'SMOKE_GUC:' || coalesce(current_setting('app.fxav_vercel_url', true), '');";

/** The GUC as this batch saw it: "" when unset, THROWS when the batch never got here. */
export function gucFromSmokeOutput(raw: string): string {
  const probe = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("SMOKE_GUC:"))
    .at(-1);
  if (probe === undefined) {
    throw new Error(
      "pgCronSmokes: the smoke output carries no SMOKE_GUC probe line — the batch did not run to its GUC statement",
    );
  }
  return probe.slice("SMOKE_GUC:".length);
}

export type CronDispatchMode = "local" | "validation";

/**
 * Is the URL this job's stored command actually QUEUED pointed at the right origin?
 *
 * The suite has parsed that URL since the firing smoke landed and asserted only its path
 * — protocol and host were in hand and discarded (BL-PG-CRON-HOST-ASSERTION). The host is
 * baked into `cron.job.command` at MIGRATION time from `app.fxav_vercel_url`, so a stale
 * bake is invisible to every text pin on the command.
 *
 * `URL.origin` does deliberate work against the entry's own objections: it carries the
 * protocol (so `http://` cannot pass against `https://`) and no path component at all (so
 * a trailing slash or a base path cannot reach the comparison — path stays the route
 * assertions' job). Neither leg keys off the target FLAG: the flag only selects which
 * contract applies, and both sides of the local comparison come from the database
 * actually connected.
 */
export function assertCronDispatchOrigin(
  url: URL,
  mode: CronDispatchMode,
  gucValue: string | null,
): { ok: true } | { ok: false; reason: string } {
  if (mode === "validation") {
    // `app.fxav_vercel_url` is UNREADABLE here — managed Postgres denies
    // `ALTER DATABASE … SET app.*`, so the migration's session-scoped set_config
    // evaporated with its session. Comparing against it would be vacuous exactly where a
    // stale baked host is reachable, so the expected value is the deployment contract.
    if (url.protocol !== "https:") {
      return { ok: false, reason: `scheme ${url.protocol} is not https:` };
    }
    if (url.port !== "") return { ok: false, reason: `explicit port ${url.port}` };
    if (url.hostname !== PRODUCTION_HOST) {
      return {
        ok: false,
        reason: `host ${url.hostname} is not the stable alias ${PRODUCTION_HOST}`,
      };
    }
    return { ok: true };
  }
  // Empty is a FAILURE, never a pass: the local bootstrap sets this database-wide, so an
  // empty value means that regressed. Absorbing it would make the check vacuous.
  if (gucValue === null || gucValue === "") {
    return { ok: false, reason: "app.fxav_vercel_url GUC is empty" };
  }
  let expected: URL;
  try {
    expected = new URL(gucValue);
  } catch {
    return { ok: false, reason: `GUC value ${gucValue} is not a URL` };
  }
  if (expected.origin !== url.origin) {
    return { ok: false, reason: `dispatch origin ${url.origin} != GUC origin ${expected.origin}` };
  }
  return { ok: true };
}
