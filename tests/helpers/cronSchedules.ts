import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { stripSqlComments } from "./sqlComments";

const MIGRATIONS_DIR = "supabase/migrations";

/**
 * Every `.sql` migration, in apply order.
 *
 * Discovery is a directory scan, NOT a hard-coded list, and that is the whole
 * point (whole-diff R10). Migrations are immutable by convention: a cadence or
 * timeout change lands as a NEW file, not as an edit to the file that first
 * scheduled the job. Two guards previously named
 * `20260527000003_schedule_cron_jobs.sql` (and the notify migration) explicitly,
 * so a new `..._reschedule_refresh_watch.sql` would have changed production while
 * both guards kept reading the superseded values and passing.
 *
 * Filenames are timestamp-prefixed, so lexicographic order is apply order.
 */
export function migrationFilesInApplyOrder(): string[] {
  return readdirSync(join(process.cwd(), MIGRATIONS_DIR))
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

/**
 * One cron lifecycle event for a job, in apply order.
 *
 * `opaque-unschedule` is a `cron.unschedule(...)` whose argument is not a string
 * literal — the idempotency loop in `20260527000003_schedule_cron_jobs.sql:72`
 * (`perform cron.unschedule(jobname) from cron.job where jobname like
 * 'fxav\\_cron\\_%'`) is one. It cannot be attributed to a job name statically, so
 * it is treated as clearing EVERY job: conservative, and correct for that
 * migration, which reschedules all seven immediately afterwards.
 */
type CronEvent = { kind: "schedule"; block: string } | { kind: "unschedule" | "opaque-unschedule" };

/**
 * Every cron lifecycle event for `jobName` across `sources`, in order.
 *
 * Pure, so the ordering rules can be tested on synthetic SQL instead of by
 * writing migration files into the repo.
 *
 * Whole-diff R11: an earlier version collected only `cron.schedule` and returned
 * the last one. A migration that unschedules the job — with no reschedule, or
 * after scheduling it — would stop renewals in production while both parity
 * guards kept reading the old block and passing. Note this is not hypothetical
 * bookkeeping: `20260602000005_b3_schedule_notify_cron.sql:27` really does
 * unschedule a job and then reschedule it, so the events must be ordered rather
 * than merely counted.
 */
/**
 * The `cron.schedule(...)` call starting at `start`, bounded by its OWN closing
 * parenthesis.
 *
 * Self-review after R11: bounding a block at "the next `cron.schedule(`, or end
 * of file" meant the LAST scheduled job in a migration owned every trailing
 * statement. `T_EXEC_BUDGET_MS` is extracted by finding the first
 * `timeout_milliseconds` in the block, so a future migration that schedules
 * refresh-watch last and then issues any other statement carrying that parameter
 * would silently pin the constant against the wrong call. Bounding by the call's
 * own parentheses removes the possibility rather than relying on job ordering.
 *
 * Quote-aware: `$body$…$body$` and `'…'` can both contain parentheses.
 */
function scheduleCallAt(sql: string, start: number): string {
  let depth = 0;
  let i = sql.indexOf("(", start);
  if (i === -1) return sql.slice(start);
  for (; i < sql.length; i += 1) {
    const dollar = /^\$[A-Za-z_0-9]*\$/.exec(sql.slice(i));
    if (dollar) {
      const end = sql.indexOf(dollar[0], i + dollar[0].length);
      i = end === -1 ? sql.length : end + dollar[0].length - 1;
      continue;
    }
    if (sql[i] === "'") {
      i += 1;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") i += 2;
        else if (sql[i] === "'") break;
        else i += 1;
      }
      continue;
    }
    if (sql[i] === "(") depth += 1;
    else if (sql[i] === ")") {
      depth -= 1;
      if (depth === 0) return sql.slice(start, i + 1);
    }
  }
  return sql.slice(start); // unbalanced; caller's assertions will catch it
}

export function cronEventsForJob(jobName: string, sources: string[]): CronEvent[] {
  const scheduleAnchor = `cron.schedule('${jobName}'`;
  const unscheduleAnchor = `cron.unschedule('${jobName}'`;
  const events: CronEvent[] = [];

  for (const source of sources) {
    const sql = stripSqlComments(source);
    const found: Array<{ at: number; event: CronEvent }> = [];

    for (let i = sql.indexOf(scheduleAnchor); i !== -1; i = sql.indexOf(scheduleAnchor, i + 1)) {
      found.push({ at: i, event: { kind: "schedule", block: scheduleCallAt(sql, i) } });
    }
    for (
      let i = sql.indexOf(unscheduleAnchor);
      i !== -1;
      i = sql.indexOf(unscheduleAnchor, i + 1)
    ) {
      found.push({ at: i, event: { kind: "unschedule" } });
    }
    // Non-literal unschedules: `cron.unschedule(` not followed by a quote.
    for (
      let i = sql.indexOf("cron.unschedule(");
      i !== -1;
      i = sql.indexOf("cron.unschedule(", i + 1)
    ) {
      if (sql[i + "cron.unschedule(".length] === "'") continue; // literal, handled above
      found.push({ at: i, event: { kind: "opaque-unschedule" } });
    }

    found.sort((a, b) => a.at - b.at);
    events.push(...found.map((f) => f.event));
  }
  return events;
}

/**
 * The block that actually governs the job after replaying every event, or `null`
 * if the job ends up unscheduled.
 */
export function effectiveScheduleBlockFrom(jobName: string, sources: string[]): string | null {
  let current: string | null = null;
  for (const event of cronEventsForJob(jobName, sources)) {
    current = event.kind === "schedule" ? event.block : null;
  }
  return current;
}

/**
 * The block that actually governs the job across all committed migrations.
 *
 * Throws when the job ends up unscheduled — including "scheduled once, later
 * unscheduled" — so a constant can never be pinned against a job that no longer
 * runs.
 */
export function effectiveScheduleBlock(jobName: string): string {
  const dir = join(process.cwd(), MIGRATIONS_DIR);
  const sources = migrationFilesInApplyOrder()
    .map((name) => readFileSync(join(dir, name), "utf8"))
    // Most migrations touch no cron at all; skipping them avoids lexing ~100
    // files. Order of the remainder is unchanged, and a file with neither call
    // could not have contributed an event anyway.
    .filter((sql) => sql.includes("cron.schedule(") || sql.includes("cron.unschedule("));
  const block = effectiveScheduleBlockFrom(jobName, sources);
  if (block === null) {
    throw new Error(`${jobName} is not scheduled by any migration`);
  }
  return block;
}
