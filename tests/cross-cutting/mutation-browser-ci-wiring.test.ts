import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";

import { premiseHolds } from "../_shared/premise";
import { BROWSER_SURFACES } from "../mutation/browser/registry";

/**
 * Keeps .github/workflows/mutation-browser.yml wired to what it is supposed to
 * watch (mutation-browser spec §5, AC-5).
 *
 * The path filter is the load-bearing part and the part that rots. Its static
 * entries are checkable one by one; its per-file MUTANT TARGET entries are an
 * enumeration that would go stale the moment a registry row is added — so the
 * assertion below derives them FROM THE REGISTRY instead of restating them. A
 * new mutant naming a file the filter does not list fails here rather than
 * surfacing as a nightly-only regression weeks later.
 */
const ROOT = process.cwd();
const WORKFLOW = ".github/workflows/mutation-browser.yml";
const COMMAND = "pnpm mutation:browser";

type Step = { name?: string; run?: string; uses?: string; env?: Record<string, string> };
type Job = {
  "runs-on"?: string;
  "timeout-minutes"?: number;
  permissions?: Record<string, string>;
  steps?: Step[];
};
type Workflow = {
  on?: {
    schedule?: Array<{ cron?: string }>;
    workflow_dispatch?: unknown;
    pull_request?: { paths?: string[] };
  };
  jobs?: Record<string, Job>;
};

const raw = readFileSync(join(ROOT, WORKFLOW), "utf8");
const workflow = parseYaml(raw) as Workflow;
const job = Object.values(workflow.jobs ?? {})[0]!;
const paths = workflow.on?.pull_request?.paths ?? [];
const steps = job?.steps ?? [];
const runSteps = steps.filter((s) => typeof s.run === "string");

/** A `paths:` entry covers a file when it equals it or is a prefix glob over it. */
const filterCovers = (file: string): boolean =>
  paths.some((p) => p === file || (p.endsWith("/**") && file.startsWith(p.slice(0, -2))));

describe("mutation-browser workflow — triggers", () => {
  it("runs nightly on the offset schedule, off the parser harness's slot", () => {
    // 07:00 UTC belongs to mutation-harness.yml; these two must never contend
    // for the same runner window (spec §5).
    expect(workflow.on?.schedule?.map((s) => s.cron)).toEqual(["17 8 * * *"]);
  });

  it("accepts workflow_dispatch", () => {
    expect(workflow.on).toHaveProperty("workflow_dispatch");
  });

  it("fires on path-filtered pull_request, which is the only pre-merge proof available", () => {
    // workflow_dispatch on a NEW workflow only works once the file is on the
    // default branch, so it cannot validate the PR that introduces it.
    premiseHolds("the workflow declares a pull_request trigger", paths.length > 0);
    expect(filterCovers(WORKFLOW)).toBe(true);
  });
});

describe("mutation-browser workflow — the path filter", () => {
  it("watches every surface whose edit can change a verdict", () => {
    for (const file of [
      "tests/mutation/browser/runner.ts",
      "tests/mutation/source/gate.ts",
      "tests/mutation/source/ledger.ts",
      "tests/e2e/_tapTargetFloorBundle.mjs",
      "tests/e2e/tap-target-floor.layout.spec.ts",
      "tests/e2e/standalone.config.ts",
      "tests/components/admin/wizard/Step3Review.test.tsx",
      "vitest.projects.ts",
      "package.json",
    ]) {
      expect(filterCovers(file), `${file} must be watched`).toBe(true);
    }
  });

  it("watches every file any enrolled mutant or control edits — derived, not enumerated", () => {
    const targets = [
      ...new Set(
        BROWSER_SURFACES.flatMap((s) =>
          [...s.mutants, s.control].flatMap((m) => m.edits.map((e) => e.file)),
        ),
      ),
    ];
    premiseHolds(
      "the registry names mutant targets at all; an empty list would assert nothing",
      targets.length > 0,
    );
    expect(targets.filter((f) => !filterCovers(f))).toEqual([]);
  });
});

describe("mutation-browser workflow — the job", () => {
  it("runs the gate through its own command", () => {
    const gate = runSteps.filter((s) => s.run!.includes(COMMAND));
    expect(gate).toHaveLength(1);
    // Exactly the command, nothing appended: a `run: |` block exits with its
    // LAST command's status, so a diagnostic echo underneath — or a `|| true` —
    // would turn every red gate green.
    expect(gate[0]!.run!.trim()).toBe(COMMAND);
  });

  it("installs chromium and ONLY chromium", () => {
    // The surface's playwright suite runs in the standalone-chromium project;
    // installing webkit would add minutes per run for an engine nothing uses.
    const installs = runSteps.filter((s) => s.run!.includes("playwright install"));
    premiseHolds("the job installs a browser at all", installs.length > 0);
    for (const step of installs) {
      expect(step.run).toMatch(/chromium/);
      expect(step.run, "no other engine may be installed").not.toMatch(/webkit|firefox|msedge/);
    }
  });

  it("caps the job at 60 minutes", () => {
    // The measured surface is ~20-30 min (spec §4); 60 leaves room for a slower
    // runner without letting a wedged run hold a runner for hours.
    expect(job["timeout-minutes"]).toBe(60);
  });

  it("holds no write permission — it runs untrusted PR code", () => {
    const permissions = job.permissions ?? {};
    premiseHolds("the job declares a permissions block", Object.keys(permissions).length > 0);
    expect(Object.entries(permissions).filter(([, v]) => v !== "none" && v !== "read")).toEqual([]);
  });
});
