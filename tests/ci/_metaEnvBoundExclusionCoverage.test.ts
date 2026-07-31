/**
 * tests/ci/_metaEnvBoundExclusionCoverage.test.ts
 *
 * Structural guard (spec 2026-07-26-ci-dark-descoped-closeout §6): every
 * `ENV_BOUND_EXCLUDES` entry — a file the unit-suite deliberately does not
 * run under `VITEST_EXCLUDE_ENV_BOUND=1` — must EXECUTE somewhere on every
 * PR, proven by the runner itself, or the build is red. Three prior attempts
 * PREDICTED execution by reading shell and each fell to an adversarial round;
 * this one verifies a registry against the parsed workflow: the covering step
 * must be EXACTLY `pnpm run-excluded <file>` (string equality after trim, the
 * WHOLE_CONFIG_RE exact-literal posture — any decoration makes it not the
 * literal), the oracle behind that alias is behaviorally pinned at
 * tests/scripts/runExcludedTest.test.ts, and the workflow/job/step carry none
 * of the execution-override classes the coverage scanner already refuses
 * (plus `environment:`, which its disqualifier set omits — adversarial R6
 * F2). Command text alone proves nothing about whether the job runs, or runs
 * where it claims (R1 F10 / R2 F3), so qualification is checked on the
 * PARSED YAML, never on shell semantics.
 *
 * Honest ceiling (spec §6.1): a green `pnpm run-excluded <file>` step proves
 * the file resolved, executed, and passed >=1 test under THAT job's
 * environment. x5's steps carry no TEST_DATABASE_URL, so the three
 * `livePsqlReachable`-guarded suites inside email-canonicalization SKIP
 * there — documented CI shape; the oracle still requires >=1 passed and the
 * remaining suites execute (19 passed locally, child exit 0).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { ENV_BOUND_COVERAGE_REGISTRY, ENV_BOUND_EXCLUDES } from "../../vitest.projects";

const ROOT = process.cwd();

type StepShape = Record<string, unknown> & { run?: unknown };
type JobShape = Record<string, unknown> & { steps?: StepShape[] };
type WorkflowShape = {
  on?: Record<string, unknown> | string | string[];
  defaults?: unknown;
  jobs?: Record<string, JobShape>;
};

/** The one job-level `if:` the spec permits: schedule exclusion, verbatim. */
const SCHEDULE_EXCLUSION = "github.event_name != 'schedule'";

describe("env-bound exclusion coverage (spec §6)", () => {
  const files = ENV_BOUND_EXCLUDES.map((g) => g.replace(/^\*\*\//, ""));

  it("registry totality: every exclusion has exactly one row, every row names a live exclusion", () => {
    const uncovered = files.filter((f) => !(f in ENV_BOUND_COVERAGE_REGISTRY));
    expect(
      uncovered,
      "ENV_BOUND_EXCLUDES entries with no coverage row — a file the unit suite " +
        "skips and no workflow proves: add a verified {workflow, job} row " +
        "(or delete the exclusion so the file runs in unit-suite)",
    ).toEqual([]);
    const stale = Object.keys(ENV_BOUND_COVERAGE_REGISTRY).filter((f) => !files.includes(f));
    expect(stale, "registry rows whose file is no longer excluded — delete them").toEqual([]);
  });

  it("no dark rows: an acknowledged-unrun exclusion is a RED build, not a pass", () => {
    for (const [file, row] of Object.entries(ENV_BOUND_COVERAGE_REGISTRY)) {
      if ("dark" in row) {
        expect.fail(
          `${file} is excluded from unit-suite and RUNS NOWHERE (dark row, ${row.backlogRef}) — ` +
            "this row exists only to name the backlog entry; wire a workflow to clear it",
        );
      }
    }
  });

  it("every {workflow, job} row is a verbatim, unconditioned run-excluded step on a bare-PR workflow", () => {
    for (const [file, row] of Object.entries(ENV_BOUND_COVERAGE_REGISTRY)) {
      if ("dark" in row) continue;
      const raw = readFileSync(join(ROOT, row.workflow), "utf8");
      const wf = parse(raw) as WorkflowShape;

      // Workflow qualification: the pull_request KEY exists and is bare. A
      // types:/branches:-filtered trigger passes a paths-only check while
      // never running on ordinary PRs (R3 F4); other triggers may coexist.
      const on = wf.on;
      expect(
        on !== null && typeof on === "object" && !Array.isArray(on) && "pull_request" in on,
        `${row.workflow}: on.pull_request key must exist (mapping form)`,
      ).toBe(true);
      const pr = (on as Record<string, unknown>).pull_request;
      expect(
        pr === null || pr === undefined,
        `${row.workflow}: pull_request must be BARE — found filters: ${JSON.stringify(pr)}`,
      ).toBe(true);
      expect(wf.defaults, `${row.workflow}: workflow-level defaults:`).toBeUndefined();

      const job = wf.jobs?.[row.job];
      expect(job, `${row.workflow}: job ${row.job} must exist`).toBeDefined();
      const jobIf = job!.if;
      expect(
        jobIf === undefined || String(jobIf).trim() === SCHEDULE_EXCLUSION,
        `${row.workflow}#${row.job}: job if: must be absent or exactly \`${SCHEDULE_EXCLUSION}\` — found ${JSON.stringify(jobIf)}`,
      ).toBe(true);
      for (const key of ["needs", "strategy", "continue-on-error", "environment", "defaults"]) {
        expect(job![key], `${row.workflow}#${row.job}: job-level ${key}:`).toBeUndefined();
      }

      // The covering step: run EXACTLY the literal, and the STEP itself
      // undecorated. A step-level `shell: bash -c ":" {0}` consumes the
      // literal without executing it (plan R3 F1).
      const literal = `pnpm run-excluded ${file}`;
      const matches = (job!.steps ?? []).filter(
        (s) => typeof s.run === "string" && s.run.trim() === literal,
      );
      expect(
        matches.length,
        `${row.workflow}#${row.job}: exactly one step whose run: is verbatim \`${literal}\``,
      ).toBe(1);
      const step = matches[0]!;
      for (const key of ["if", "continue-on-error", "working-directory", "shell"]) {
        expect(step[key], `${row.workflow}#${row.job} run-excluded step: ${key}:`).toBeUndefined();
      }
      expect(
        (step.run as string).includes("|"),
        `${row.workflow}#${row.job} run-excluded step: no pipes`,
      ).toBe(false);
    }
  });
});
