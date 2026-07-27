// Spec: docs/superpowers/specs/observability/2026-07-25-watch-lease-slack-design.md §2, §4
//
// SAMPLING_PERIOD_MS duplicates a fact that lives in two other places: the
// canonical registry JSON, and the `cron.job` row PostgreSQL actually runs.
// Nothing tied them together, so a cadence change could update the existing
// cron-parity surfaces while silently leaving the renewal lead and the
// short-grant heuristic computed against the OLD period — both would still
// "pass" while being arithmetically wrong.
//
// SCOPE, after whole-diff rounds R8-R16. This file pins the constant against the
// REGISTRY only. It is pinned against what production actually runs in
// `tests/cross-cutting/pg-cron-coverage.test.ts`, which introspects `cron.job`
// live.
//
// Why it is split that way: an earlier version read the schedule out of the
// migration SQL by hand. Nine consecutive review rounds each found another
// lexical corner that made it silently read the wrong value — block comments,
// dollar-quoted bodies, hard-coded file paths, `cron.unschedule`, multiline
// calls, `cron.schedule (` spacing, case folding, quoted identifiers,
// `mycron.schedule`, `search_path`, and stored function bodies. Each fix widened
// a regex and exposed the next corner, which is the signature of a wrong
// mechanism rather than an incomplete one: a regex is not a PostgreSQL parser and
// does not converge on becoming one. PostgreSQL resolves the OUTER cron.schedule
// call — schema/name resolution, quoting, dollar quoting, which schedule wins —
// and `cron.job` holds that result, so the schedule is read from there instead.
//
// Precisely what that does NOT buy (whole-diff R18): `cron.job.command` is stored
// verbatim, comments included. PostgreSQL has not resolved anything INSIDE the
// job body, so any assertion about the command text remains text matching. The
// live check therefore verifies the DECLARED timeout, and does not prove the
// command executes — that is a smoke test's job (see BL-PG-CRON-COVERAGE-UNRUN).
//
// DB-free: reads one committed JSON file.
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SAMPLING_PERIOD_MS, T_EXEC_BUDGET_MS } from "@/lib/drive/watchErrors";
import { cronPeriodMs } from "../helpers/cronPeriod";

const REGISTRY = join(
  process.cwd(),
  "docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-26-pg-cron-pivot/pg-cron-jobs.json",
);

const JOB_NAME = "fxav_cron_refresh_watch";

describe("SAMPLING_PERIOD_MS agrees with the canonical refresh-watch schedule", () => {
  test("the constant matches the registry's schedule for the renewal job", () => {
    const registry = JSON.parse(readFileSync(REGISTRY, "utf8")) as {
      jobs: Array<{ jobname: string; schedule: string; route: string }>;
    };
    const job = registry.jobs.find((j) => j.jobname === JOB_NAME);
    expect(job, `${JOB_NAME} missing from the canonical cron registry`).toBeDefined();

    expect(cronPeriodMs(job!.schedule)).toBe(SAMPLING_PERIOD_MS);
  });

  test("T_EXEC_BUDGET_MS matches the registry's declared pg_net timeout", () => {
    // Whole-diff R17: the descope that moved this assertion onto the live
    // `cron.job` row left T_EXEC_BUDGET_MS with no guard that ran in CI. That
    // is FIXED as of 2026-07-26 — pg-cron-coverage is no longer excluded from
    // unit-suite-db and also runs against the validation project via x-audit
    // (filed as BL-PG-CRON-COVERAGE-UNRUN), and every other test derives its
    // expectation from the constant itself, so mutating it stayed green.
    //
    // Pinned against the canonical registry rather than the migration text: the
    // registry is the machine-readable contract, JSON.parse is not a lexing
    // problem, and this runs on every PR.
    const registry = JSON.parse(readFileSync(REGISTRY, "utf8")) as { timeoutMs: number };
    expect(
      registry.timeoutMs,
      "pg-cron-jobs.json must declare the pg_net timeout the constant is derived from",
    ).toBeTypeOf("number");
    expect(T_EXEC_BUDGET_MS).toBe(registry.timeoutMs);
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
