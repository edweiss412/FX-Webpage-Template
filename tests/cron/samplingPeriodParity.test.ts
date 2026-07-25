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
import {
  cronEventsForJob,
  effectiveScheduleBlock,
  effectiveScheduleBlockFrom,
  migrationFilesInApplyOrder,
  unattributableCronCalls,
} from "../helpers/cronSchedules";

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
  // Whitespace-tolerant everywhere the call is matched (whole-diff R12): two
  // migrations already write `cron.schedule(` with the arguments on their own
  // lines, and a literal-anchored regex silently matches none of them.
  const match = new RegExp(
    `"?cron"?\\s*\\.\\s*"?schedule"?\\s*\\(\\s*'${jobName}'\\s*,\\s*'([^']*)'`,
    "i",
  ).exec(block);
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

  describe("cron lifecycle replay (whole-diff R11)", () => {
    // An earlier version collected only `cron.schedule` and took the last one, so
    // a migration that unschedules the renewal job would stop renewals in
    // production while both parity guards kept reading the old block and passing.
    // Synthetic sources, so the ordering rules are tested without writing
    // migration files into the repo.
    const scheduleSql = (expr: string) =>
      `perform cron.schedule('fxav_cron_refresh_watch', '${expr}', format($body$ select 1; $body$));`;

    test("a later unschedule with no reschedule leaves the job ungoverned", () => {
      expect(
        effectiveScheduleBlockFrom("fxav_cron_refresh_watch", [
          scheduleSql("0 * * * *"),
          "perform cron.unschedule('fxav_cron_refresh_watch');",
        ]),
      ).toBeNull();
    });

    test("unschedule THEN reschedule within one migration is still scheduled", () => {
      // The real idempotency pattern at
      // supabase/migrations/20260602000005_b3_schedule_notify_cron.sql:27.
      const block = effectiveScheduleBlockFrom("fxav_cron_refresh_watch", [
        `perform cron.unschedule('fxav_cron_refresh_watch');\n${scheduleSql("*/15 * * * *")}`,
      ]);
      expect(block).toContain("*/15 * * * *");
    });

    test("schedule THEN unschedule within one migration is NOT scheduled", () => {
      // Ordering, not counting: both events exist in the same file.
      expect(
        effectiveScheduleBlockFrom("fxav_cron_refresh_watch", [
          `${scheduleSql("0 * * * *")}\nperform cron.unschedule('fxav_cron_refresh_watch');`,
        ]),
      ).toBeNull();
    });

    test("a non-literal unschedule clears the job conservatively", () => {
      // supabase/migrations/20260527000003_schedule_cron_jobs.sql:72 sweeps by
      // LIKE pattern, naming no job. It cannot be attributed statically, so it
      // clears — and because that migration reschedules immediately afterwards,
      // the real tree still resolves (asserted above).
      const sweep = "perform cron.unschedule(jobname) from cron.job where jobname like 'fxav%';";
      expect(
        effectiveScheduleBlockFrom("fxav_cron_refresh_watch", [scheduleSql("0 * * * *"), sweep]),
      ).toBeNull();
      expect(
        effectiveScheduleBlockFrom("fxav_cron_refresh_watch", [
          `${sweep}\n${scheduleSql("0 * * * *")}`,
        ]),
      ).toContain("0 * * * *");
    });

    test("a schedule block stops at its own closing paren, not the next statement", () => {
      // Self-review after R11: bounding at "next cron.schedule( or EOF" made the
      // LAST scheduled job in a migration own every trailing statement, so a
      // stray `timeout_milliseconds` after it would be read as refresh-watch's.
      const block = effectiveScheduleBlockFrom("fxav_cron_refresh_watch", [
        `perform cron.schedule('fxav_cron_refresh_watch', '0 * * * *', format($body$
           select net.http_get(url := %L, timeout_milliseconds := 300000);
         $body$, 'https://x.test/api/cron/refresh-watch'));
         perform some_other_call(timeout_milliseconds := 999999);`,
      ]);
      expect(block).toContain("300000");
      expect(block).not.toContain("999999");
    });

    test("the multiline call style is discovered — proved against REAL migrations", () => {
      // Whole-diff R12: discovery anchored on the literal `cron.schedule('name'`,
      // so a reschedule written across lines was invisible and the previous block
      // stayed effective while production used the new one. Two migrations
      // already use that style, so assert against them rather than a synthetic
      // string — a synthetic-only test is what let this through (the lifecycle
      // cases above all generate the one-line form).
      expect(scheduleFromMigrations("app_events_prune")).toBe("17 4 * * *");

      // And the real tree exercises the unschedule replay at the same time:
      // `cleanup-bootstrap-nonces` is scheduled in the multiline style at
      // 20260504000001_bootstrap_nonces_signing_key.sql:36 and then deliberately
      // retired at 20260527000003_schedule_cron_jobs.sql:85. Discovery must find
      // the multiline schedule AND still conclude the job no longer runs.
      expect(() => scheduleFromMigrations("cleanup-bootstrap-nonces")).toThrow(/not scheduled/);
      expect(
        cronEventsForJob("cleanup-bootstrap-nonces", [
          readFileSync(
            join(
              process.cwd(),
              "supabase/migrations/20260504000001_bootstrap_nonces_signing_key.sql",
            ),
            "utf8",
          ),
        ]).some((e) => e.kind === "schedule"),
        "the multiline schedule itself must be discovered, not merely outvoted",
      ).toBe(true);
    });

    test("multiline unschedule is discovered too", () => {
      expect(
        effectiveScheduleBlockFrom("fxav_cron_refresh_watch", [
          scheduleSql("0 * * * *"),
          "perform cron.unschedule(\n  'fxav_cron_refresh_watch'\n);",
        ]),
      ).toBeNull();
    });

    test("a multiline reschedule supersedes an earlier one-line schedule", () => {
      const block = effectiveScheduleBlockFrom("fxav_cron_refresh_watch", [
        scheduleSql("0 * * * *"),
        `perform cron.schedule(
           'fxav_cron_refresh_watch',
           '0 */3 * * *',
           format($body$ select 1; $body$)
         );`,
      ]);
      expect(block).toContain("0 */3 * * *");
    });

    test("every cron call in the tree is attributable — unknown forms fail LOUDLY", () => {
      // Whole-diff R13, and the structural answer to six rounds of the same
      // species. Each round found the strict matcher recognising less than SQL
      // allows (block comments, dollar bodies, hard-coded paths, unschedule,
      // multiline, then `cron.schedule (` with a space). Widening the pattern
      // per round is whack-a-mole; a regex is not a PostgreSQL parser. This
      // asserts the parser accounts for EVERY cron call a deliberately loose
      // scanner can find, so the next unhandled form fails here with the text it
      // choked on, instead of silently leaving a guard pinned to a stale block.
      const dir = join(process.cwd(), "supabase/migrations");
      const sources = migrationFilesInApplyOrder().map((n) => readFileSync(join(dir, n), "utf8"));
      expect(unattributableCronCalls(sources)).toEqual([]);
    });

    test("a spaced call form is discovered, not skipped", () => {
      // R13's exact report: `cron.schedule ('job', …)` is valid SQL.
      const block = effectiveScheduleBlockFrom("fxav_cron_refresh_watch", [
        scheduleSql("0 * * * *"),
        "perform cron.schedule ('fxav_cron_refresh_watch', '0 */3 * * *', format($body$ select 1; $body$));",
      ]);
      expect(block).toContain("0 */3 * * *");
      expect(
        effectiveScheduleBlockFrom("fxav_cron_refresh_watch", [
          scheduleSql("0 * * * *"),
          "perform cron . unschedule ('fxav_cron_refresh_watch');",
        ]),
      ).toBeNull();
    });

    test("a schedule whose job name is not a literal is reported, not ignored", () => {
      // The form the strict matcher genuinely cannot attribute. It must surface
      // rather than pass silently.
      expect(
        unattributableCronCalls(["perform cron.schedule(jobname, '0 * * * *', 'select 1;');"]),
      ).toHaveLength(1);
      expect(unattributableCronCalls([scheduleSql("0 * * * *")])).toEqual([]);
    });

    test("case variants and quoted identifiers are the same call (R14)", () => {
      // Unquoted identifiers fold to lower case in PostgreSQL, and
      // `"cron"."schedule"` is the quoted spelling of that same lower-case name.
      // All of these are the SAME function; a scanner that sees only one spelling
      // lets a reschedule through silently.
      for (const spelling of [
        `perform CRON.SCHEDULE('fxav_cron_refresh_watch', '0 */3 * * *', format($body$ select 1; $body$));`,
        `perform "cron"."schedule"('fxav_cron_refresh_watch', '0 */3 * * *', format($body$ select 1; $body$));`,
        `perform Cron.Schedule ('fxav_cron_refresh_watch', '0 */3 * * *', format($body$ select 1; $body$));`,
      ]) {
        expect(
          effectiveScheduleBlockFrom("fxav_cron_refresh_watch", [
            scheduleSql("0 * * * *"),
            spelling,
          ]),
          spelling,
        ).toContain("0 */3 * * *");
      }

      for (const spelling of [
        `perform CRON.UNSCHEDULE('fxav_cron_refresh_watch');`,
        `perform "cron"."unschedule"('fxav_cron_refresh_watch');`,
      ]) {
        expect(
          effectiveScheduleBlockFrom("fxav_cron_refresh_watch", [
            scheduleSql("0 * * * *"),
            spelling,
          ]),
          spelling,
        ).toBeNull();
      }

      // And the completeness scanner must see them too, or an unrecognised
      // spelling would pass BOTH scanners — the exact hole R14 reported.
      expect(
        unattributableCronCalls([`perform CRON.SCHEDULE(jobname, '0 * * * *', 'select 1;');`]),
      ).toHaveLength(1);
    });

    test("another schema's cron-suffixed name is NOT this schema (R15)", () => {
      // `mycron.schedule(...)` ends in "cron" but is a different schema. The
      // previous pattern had no left boundary and would have attributed it here.
      expect(
        effectiveScheduleBlockFrom("fxav_cron_refresh_watch", [
          scheduleSql("0 * * * *"),
          `perform mycron.schedule('fxav_cron_refresh_watch', '0 */3 * * *', format($body$ select 1; $body$));`,
        ]),
      ).toContain("0 * * * *");
      expect(
        effectiveScheduleBlockFrom("fxav_cron_refresh_watch", [
          scheduleSql("0 * * * *"),
          `perform mycron.unschedule('fxav_cron_refresh_watch');`,
        ]),
      ).toContain("0 * * * *");
    });

    test('a QUOTED identifier does not case-fold, so "CRON" is not this schema (R15)', () => {
      // Quoted identifiers are case-sensitive in PostgreSQL: "CRON"."SCHEDULE" is
      // not cron.schedule and would fail to resolve. An `i` flag treated them as
      // the same, which is why the case rules are in the pattern instead.
      expect(
        effectiveScheduleBlockFrom("fxav_cron_refresh_watch", [
          scheduleSql("0 * * * *"),
          `perform "CRON"."SCHEDULE"('fxav_cron_refresh_watch', '0 */3 * * *', format($body$ select 1; $body$));`,
        ]),
      ).toContain("0 * * * *");
    });

    test("putting cron on the search_path is reported, since bare schedule() is unresolvable", () => {
      // The one form no scanner can see. No migration does this today, so the
      // guard is silent — but it fires the moment one would.
      expect(
        unattributableCronCalls([
          "set search_path = cron, public;\nperform schedule('x', '0 * * * *', 'select 1;');",
        ]),
      ).not.toHaveLength(0);
      expect(unattributableCronCalls(["set search_path = public;"])).toEqual([]);
    });

    test("a commented-out unschedule does not count", () => {
      expect(
        effectiveScheduleBlockFrom("fxav_cron_refresh_watch", [
          `${scheduleSql("0 * * * *")}\n-- perform cron.unschedule('fxav_cron_refresh_watch');`,
        ]),
      ).toContain("0 * * * *");
    });
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
