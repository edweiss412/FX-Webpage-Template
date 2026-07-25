// Spec: docs/superpowers/specs/observability/2026-07-25-watch-lease-slack-design.md §2, §4
//
// SAMPLING_PERIOD_MS duplicates a fact that already lives in two other places:
// the `cron.schedule` call in the migration and the canonical registry JSON.
// Nothing tied them together, so a future cadence change could update the
// existing cron-parity surfaces (tests/cross-cutting/pg-cron-coverage.test.ts)
// while silently leaving the renewal guarantee and the short-grant anomaly
// boundary computed against the OLD period — the guarantee would still "pass"
// while being arithmetically wrong.
//
// DB-free: reads committed files only.
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SAMPLING_PERIOD_MS } from "@/lib/drive/watchErrors";

const REGISTRY = join(
  process.cwd(),
  "docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-26-pg-cron-pivot/pg-cron-jobs.json",
);

const JOB_NAME = "fxav_cron_refresh_watch";

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
