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
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SAMPLING_PERIOD_MS } from "@/lib/drive/watchErrors";
import { effectiveScheduleBlock, migrationFilesInApplyOrder } from "../helpers/cronSchedules";

const REGISTRY = join(
  process.cwd(),
  "docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-26-pg-cron-pivot/pg-cron-jobs.json",
);

const JOB_NAME = "fxav_cron_refresh_watch";

/**
 * The schedule a job is ACTUALLY given, from its last live `cron.schedule` call
 * across ALL migrations.
 *
 * Whole-diff R9 finding 1: the registry JSON alone was not enough. The existing
 * migration check (`tests/cross-cutting/pg-cron-coverage.test.ts:156`) asserts
 * `scheduledSql.toContain(job.schedule)` against the CONCATENATED file text, and
 * `fxav_cron_notify_digest` also runs `0 * * * *` — so changing refresh-watch's
 * migration schedule to a three-hourly one leaves that assertion green (the
 * string is still present, from the other job) and leaves the registry
 * comparison green (the JSON was not touched). Verified by mutation: that check
 * passes 7/7 under exactly that change. Production would then sample every three
 * hours while SAMPLING_PERIOD_MS, the renewal lead, and the short-grant heuristic
 * all stayed hourly.
 *
 * Whole-diff R10: discovery must not name migration files. A cadence change lands
 * as a NEW migration, which a hard-coded path list would never read.
 */
function scheduleFromMigrations(jobName: string): string {
  const block = effectiveScheduleBlock(jobName);
  const match = new RegExp(`cron\\.schedule\\('${jobName}'\\s*,\\s*'([^']*)'`).exec(block);
  if (!match) throw new Error(`${jobName}: schedule literal not found in its own block`);
  return match[1]!;
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

  test("schedule discovery scans every migration, so a NEW one cannot be missed", () => {
    // Whole-diff R10: this guard and the T_EXEC_BUDGET_MS guard both named
    // migration files explicitly. Migrations are immutable by convention, so a
    // cadence change arrives as a NEW file and a hard-coded list would keep
    // reading the superseded value and pass. Pin the discovery itself: if anyone
    // narrows it back to a fixed list, this fails.
    const scanned = migrationFilesInApplyOrder();
    const all = readdirSync(join(process.cwd(), "supabase/migrations"))
      .filter((n: string) => n.endsWith(".sql"))
      .sort();
    expect(scanned).toEqual(all);
    expect(scanned.length).toBeGreaterThan(100);
    // apply order, not directory order
    expect([...scanned]).toEqual([...scanned].sort());
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
