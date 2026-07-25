// Spec: docs/superpowers/specs/observability/2026-07-25-watch-lease-slack-design.md §2, §4
//
// SAMPLING_PERIOD_MS duplicates a fact that already lives in two other places:
// the `cron.schedule` call in the migration and the canonical registry JSON.
// Nothing tied them together, so a future cadence change could update the
// existing cron-parity surfaces (tests/cross-cutting/pg-cron-coverage.test.ts)
// while silently leaving the renewal lead and the short-grant heuristic
// computed against the OLD period — both would still "pass" while being
// arithmetically wrong.
//
// DB-free: reads committed files only.
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SAMPLING_PERIOD_MS } from "@/lib/drive/watchErrors";
import { stripSqlComments } from "../helpers/sqlComments";

const REGISTRY = join(
  process.cwd(),
  "docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-26-pg-cron-pivot/pg-cron-jobs.json",
);

const JOB_NAME = "fxav_cron_refresh_watch";

// Both migrations that schedule fxav_cron_* jobs, in apply order.
const SCHEDULE_MIGRATIONS = [
  "supabase/migrations/20260527000003_schedule_cron_jobs.sql",
  "supabase/migrations/20260602000005_b3_schedule_notify_cron.sql",
];

/**
 * The schedule a job is ACTUALLY given by the migrations, scoped to that job's
 * own `cron.schedule` call.
 *
 * Whole-diff R9 finding 1: the registry JSON alone was not enough. The existing
 * migration check (`tests/cross-cutting/pg-cron-coverage.test.ts:156`) asserts
 * `scheduledSql.toContain(job.schedule)` against the CONCATENATED file text, and
 * `fxav_cron_notify_digest` also runs `0 * * * *` — so changing refresh-watch's
 * migration schedule to a three-hourly one leaves that assertion green (the
 * string is still present, from the other job) and leaves this file's registry
 * comparison green (the JSON was not touched). Production would then sample every
 * three hours while SAMPLING_PERIOD_MS, the renewal lead, and the short-grant
 * heuristic all stayed hourly.
 *
 * Later migrations win, matching apply order. Comments are stripped first so a
 * commented-out schedule cannot supply the answer.
 */
function scheduleFromMigrations(jobName: string): string {
  const pattern = new RegExp(`cron\\.schedule\\('${jobName}'\\s*,\\s*'([^']*)'`, "g");
  let found: string | undefined;
  for (const relative of SCHEDULE_MIGRATIONS) {
    const sql = stripSqlComments(readFileSync(join(process.cwd(), relative), "utf8"));
    for (const match of sql.matchAll(pattern)) found = match[1];
  }
  if (found === undefined) {
    throw new Error(`${jobName} is not scheduled by any known migration`);
  }
  return found;
}

/**
 * Period of a 5-field cron expression whose minute field is one of the shapes
 * this repo actually uses, in ms. Deliberately narrow: an unrecognized shape
 * throws rather than guessing, so a future schedule this cannot reason about
 * fails loudly instead of silently returning a wrong number.
 */
function cronPeriodMs(expr: string): number {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) throw new Error(`unsupported cron arity: "${expr}"`);
  const [minute, hour, dom, month, dow] = fields as [string, string, string, string, string];
  if (hour !== "*" || dom !== "*" || month !== "*" || dow !== "*") {
    throw new Error(`only minute-field schedules are supported here: "${expr}"`);
  }
  // "0" — once per hour
  if (/^\d+$/.test(minute)) return 3_600_000;
  // "*/N" — every N minutes
  const step = /^\*\/(\d+)$/.exec(minute);
  if (step) return Number(step[1]) * 60_000;
  // "a,b,c,d" — evenly spaced list; assert the spacing is actually even so an
  // uneven list cannot masquerade as a fixed period.
  if (/^\d+(,\d+)+$/.test(minute)) {
    const mins = minute
      .split(",")
      .map(Number)
      .sort((a, b) => a - b);
    const gaps = mins.map((m, i) => (i === 0 ? m + 60 - mins[mins.length - 1]! : m - mins[i - 1]!));
    const first = gaps[0]!;
    if (!gaps.every((g) => g === first)) {
      throw new Error(`minute list is not evenly spaced: "${expr}"`);
    }
    return first * 60_000;
  }
  throw new Error(`unrecognized minute field: "${expr}"`);
}

describe("SAMPLING_PERIOD_MS agrees with the canonical refresh-watch schedule", () => {
  test("the constant matches the registry's schedule for the renewal job", () => {
    const registry = JSON.parse(readFileSync(REGISTRY, "utf8")) as {
      jobs: Array<{ jobname: string; schedule: string; route: string }>;
    };
    const job = registry.jobs.find((j) => j.jobname === JOB_NAME);
    expect(job, `${JOB_NAME} missing from the canonical cron registry`).toBeDefined();

    expect(cronPeriodMs(job!.schedule)).toBe(SAMPLING_PERIOD_MS);
  });

  test("the MIGRATION's own schedule for the renewal job agrees too (R9 finding 1)", () => {
    const registry = JSON.parse(readFileSync(REGISTRY, "utf8")) as {
      jobs: Array<{ jobname: string; schedule: string }>;
    };
    const job = registry.jobs.find((j) => j.jobname === JOB_NAME);
    expect(job, `${JOB_NAME} missing from the canonical cron registry`).toBeDefined();

    // The registry is documentation; the migration is what runs. Pin both, so a
    // change to either alone fails rather than silently splitting them.
    const live = scheduleFromMigrations(JOB_NAME);
    expect(live, "migration and registry disagree on the renewal cadence").toBe(job!.schedule);
    expect(cronPeriodMs(live)).toBe(SAMPLING_PERIOD_MS);
  });

  test("the schedule extractor is scoped to the named job, not the first in the file", () => {
    // Guards the guard: an unscoped match would return fxav_cron_sync's schedule
    // for every job, and this file's whole reason for existing is that the
    // existing whole-file `toContain` check cannot tell two jobs apart.
    expect(scheduleFromMigrations("fxav_cron_sync")).toBe("*/5 * * * *");
    expect(scheduleFromMigrations("fxav_cron_gc_watch")).toBe("15 * * * *");
    expect(scheduleFromMigrations("fxav_cron_report_reaper")).toBe("0 6 * * *");
    // and the one that makes the whole-file check blind — same expression as
    // refresh-watch, different job.
    expect(scheduleFromMigrations("fxav_cron_notify_digest")).toBe("0 * * * *");
    expect(() => scheduleFromMigrations("fxav_cron_not_a_job")).toThrow(/not scheduled/);
  });

  test("the period parser rejects shapes it cannot reason about", () => {
    // Guards the guard: a silently-wrong period here would defeat the whole test.
    expect(cronPeriodMs("0 * * * *")).toBe(3_600_000);
    expect(cronPeriodMs("*/15 * * * *")).toBe(900_000);
    expect(cronPeriodMs("7,22,37,52 * * * *")).toBe(900_000);
    expect(() => cronPeriodMs("0 6 * * *")).toThrow(/minute-field/);
    expect(() => cronPeriodMs("0,5,30 * * * *")).toThrow(/evenly spaced/);
    expect(() => cronPeriodMs("bogus * * * *")).toThrow(/unrecognized/);
  });
});
