# CI-Dark Descoped Items Close-Out — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the four descoped CI-dark backlog items (plus the env-narrowing ceiling) with observation-based guards and a directive-based harness resolver, shipped as three PRs.

**Architecture:** Three PRs. PR-A adds two guards over Playwright config membership (a registration detector unioning all three configs, and a committed baseline compared against the CI run's own JSON report). PR-B proves every `ENV_BOUND_EXCLUDES` entry executes somewhere, using the runner as the oracle. PR-C replaces path-heuristic/regex server-module stubbing with one shared `"use server"`-directive esbuild plugin (TypeScript-parse, cooked-text, zero-diagnostics) and restores the packlist spec to CI.

**Tech Stack:** vitest, Playwright `--list`/JSON reporter, esbuild JS API (child `node` scripts), TypeScript compiler API, `yaml` (NEW devDependency, added in Task A3 — see Global Constraints).

**Spec (canonical):** `docs/superpowers/specs/ci/2026-07-26-ci-dark-descoped-closeout-design.md` — adversarially APPROVED at R8 (finding counts 12/5/7/2/1/2/1/0). Where this plan and the spec disagree, the spec wins.

## Amendments (2026-07-27, during A6 — supersede the task bodies below where they conflict)

1. **Reporter `outputFile` is `"../../test-results/standalone-report.json"`, not the bare literal the A2/A3 bodies quote.** The first real Actions run of the comparison step (run 30295240580, and the PR-run rerun on eb4f282ce) failed ENOENT: Playwright resolves a relative reporter `outputFile` against the CONFIG directory (1.59.1 `lib/reporters/base.js` `resolveOutputFile`), so the bare literal wrote `tests/e2e/test-results/` while the comparator's zero-args default reads the repo-root `test-results/`. The `../../` prefix restores the intended repo-root path; `_metaSpecRegistration.test.ts` now pins the RESOLUTION (configDir-resolved reporter path === comparator default) alongside the literal, so the two sides cannot drift apart again. The comparator default and workflow step are unchanged. One more instance of the plan-wide "local-passes-CI-fails is its own bug class" rule (AGENTS.md): the local `--list-check` never exercises the reporter write, so only the real Actions run could surface it.
2. **The A6-adjacent "mark ✅ RESOLVED in BACKLOG.md" step is superseded by graduation.** Main's `tests/docs/_metaDeferralLedgerGraduation.test.ts` (merged into this branch at eb4f282ce) forbids terminal-status entries sitting in BACKLOG.md. `BL-CI-UNREGISTERED-SELF-CONTAINED-SPEC` and `BL-CI-ENV-DEPENDENT-CONFIG-NARROWING` therefore moved to `BACKLOG-archive.md` (substance intact, provenance `feat/ci-dark-descoped-guards`) and are registered in the test's `BACKLOG_GRADUATED` list.

## Global Constraints

- TDD per task: failing test → minimal implementation → passing test → commit (AGENTS.md invariant 1); one conventional commit per task (invariant 6; scopes `ci`, `e2e`).
- All work in isolated worktrees off `origin/main` (invariant 11). PR-A continues in `/Users/ericweiss/FX-worktrees/ci-dark-descoped` (branch `feat/ci-dark-descoped-guards`, already carries the spec). PR-B and PR-C each start with a fresh worktree.
- The `standalone-e2e.yml` run literal stays byte-identical: `pnpm exec playwright test --config tests/e2e/standalone.config.ts` (`WHOLE_CONFIG_RE`, `tests/ci/_workflowCoverageScan.ts:74`).
- Playwright's default test-file matcher: `**/*.@(spec|test).?(c|m)[jt]s?(x)` (verified at the installed playwright 1.59.1 common/config.js line 164).
- **NEW devDependency, ratified here: `yaml@^2` (dev-only).** The structural pins in A3/A4/B2 assert ABSENCE of keys (`env:`, `environment:`, `defaults:`, trigger filters) across workflow/job/step levels plus step adjacency. `tests/ci/_workflowCoverageScan.ts:24` is deliberately regex-on-YAML for its narrower question and stays untouched; key-absence assertions on a parsed document are exactly the observe-don't-parse posture this arc ships, and hand-rolled YAML regex for them would be the fail-open class the spec's R1-R2 killed. Filesystem walking uses a small `readdirSync` recursive helper inline in the meta-test (the `tests/log/_metaMutationSurfaceObservability.test.ts` pattern) — NO glob dependency.
- Counts (30 standalone files / 423 tests, 62 default, 7 screenshots, 91 disk) are provenance from 2026-07-26 and WILL be stale (PR #616 already added tests/e2e/screenshots-gallery-capture.spec.ts, registered in the screenshots config). Guards derive membership at runtime; the baseline is regenerated, never hand-copied.
- PR sequencing: PR-A first. #613 merged 2026-07-27, so PR-B has no external dependency left. PR-B and PR-C are mutually independent.
- Autonomous pipeline gates close each PR: whole-diff cross-model review APPROVE → push → real CI green → `gh pr merge --merge` → ff main checkout to `0  0`.
- No UI files touched (impeccable gate not applicable); em-dash ban is user-visible-copy only — the only copy this plan ships is test failure messages, which are developer-facing.

## Meta-test inventory (declared per docs/agents/writing-plans.md)

**Creates:** tests/ci/\_metaSpecRegistration.test.ts (A4), tests/scripts/checkStandaloneBaseline.test.ts (A1), tests/ci/\_metaEnvBoundExclusionCoverage.test.ts (B2), tests/scripts/runExcludedTest.test.ts (B1), tests/e2e/helpers/useServerDirectivePlugin.test.ts (C1), tests/e2e/directive-form-action.spec.ts (C4).
**Extends:** `tests/ci/_metaE2eWorkflowCoverage.test.ts` (row edits A4/C4), `tests/e2e/_metaLiveEntryToolchain.test.ts` (C1 exemption row, C2/C3), `tests/ci/_standaloneConfigProbe.ts` (reporter observation, A2), `tests/e2e/helpers/liveEntryToolchain.bundle.test.ts` (C2).
**Registry rows:** invariant-9/10 registries do not apply — no Supabase call sites, no mutation surfaces (diff is tests, scripts, workflow steps, config fields).
**Advisory locks:** not touched.

## File structure

```
scripts/check-standalone-baseline.mjs         PR-A  baseline comparator (--report/--list-check/--write); rootDir-resolved paths
tests/e2e/standalone-baseline.json            PR-A  { "files": [...], "totalTests": N }
tests/scripts/checkStandaloneBaseline.test.ts PR-A  behavioral rejection tests
tests/ci/_metaSpecRegistration.test.ts        PR-A  reporter pin; workflow pinning; detector; tripwire; baseline==local
.github/workflows/standalone-e2e.yml          PR-A  post-run comparison step
tests/e2e/standalone.config.ts                PR-A  json reporter; PR-C: two testMatch members
tests/ci/_standaloneConfigProbe.ts            PR-A  expose evaluated reporter
package.json + pnpm-lock.yaml                 PR-A  yaml devDep (+lockfile); PR-B: run-excluded alias
scripts/run-excluded-test.mjs                 PR-B  vitest child + JSON report + exit-status oracle
tests/scripts/runExcludedTest.test.ts         PR-B  behavioral rejection tests + alias pin
tests/ci/_metaEnvBoundExclusionCoverage.test.ts PR-B registry totality + workflow qualification
vitest.projects.ts                            PR-B  ENV_BOUND_EXCLUDES shrinks to one; ENV_BOUND_COVERAGE_REGISTRY added
.github/workflows/x-audits.yml                PR-B  x5 verbatim run-excluded step
tests/e2e/helpers/useServerDirectivePlugin.mjs PR-C shared plugin (plain JS + JSDoc types)
tests/e2e/helpers/_bundleLiveEntryChild.mjs   PR-C  esbuild.build + plugin; optional --metafile <path>
tests/e2e/helpers/liveEntryToolchain.ts       PR-C  execFileSync target: the child script
tests/e2e/helpers/useServerDirectivePlugin.test.ts PR-C every fixture case through a REAL build
tests/e2e/helpers/__fixtures__/directive/*    PR-C  fixture modules (a)-(h)
tests/e2e/_step3ReviewModalBundle.mjs         PR-C  regex useServerElision deleted; consumes shared plugin
tests/e2e/directive-form-action.spec.ts       PR-C  guard case (f): form action={stub} submit throws, real browser
tests/e2e/_directiveFormActionLiveEntry.tsx   PR-C  micro live entry for the form-action harness
tests/e2e/_metaLiveEntryToolchain.test.ts     PR-C  C1: contract-test exemption row; C2/C3: re-pointed + exemption text rewritten
tests/e2e/packlist-rescan-recovery.spec.ts    PR-C  node:crypto alias
BACKLOG.md + parent spec                      per-PR close-out edits
```

---

# PR-A — registration detector + run-report baseline

Branch `feat/ci-dark-descoped-guards` in `/Users/ericweiss/FX-worktrees/ci-dark-descoped` (exists; spec + plan committed; env linked; preflight green).

### Task A1: check-standalone-baseline script, behaviorally pinned

**Files:**
- Create: scripts/check-standalone-baseline.mjs
- Test: tests/scripts/checkStandaloneBaseline.test.ts

**Interfaces:**
- Produces: CLI modes `--report <path>`, `--list-check`, `--write`, `--baseline <path>` (fixture override). Zero-args behavior is amended by A3 (defaults to the CI report path); in THIS task zero args exits non-zero with usage.
- Baseline shape: `{ "files": string[], "totalTests": number }` — files are **repo-relative POSIX paths**, produced by resolving each `spec.file` against the report's `config.rootDir` (Playwright reports files relative to the config's rootDir, e.g. `agendaBreakdown.layout.spec.ts` relative to `tests/e2e`).
- Total tests = sum of `spec.tests[].length` over all specs (project-expanded, matching what the run executes; the standalone config has one project so this equals spec count today).

- [ ] **Step 1: Write the failing behavioral test**

```ts
// tests/scripts/checkStandaloneBaseline.test.ts
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const SCRIPT = join(ROOT, "scripts", "check-standalone-baseline.mjs");

function run(args: string[], cwd: string = ROOT): number {
  try {
    execFileSync("node", [SCRIPT, ...args], { cwd, stdio: "pipe" });
    return 0;
  } catch (e) {
    const status = (e as { status?: number }).status;
    return typeof status === "number" ? status : -1;
  }
}

/**
 * Playwright-JSON-shaped report. `config.rootDir` is set to ROOT/tests/e2e so
 * the script MUST resolve spec.file against it to produce repo-relative paths
 * (plan-R1 F17: raw spec.file values are rootDir-relative in real output).
 */
function report(files: string[], testsPerFile: number): string {
  const dir = mkdtempSync(join(tmpdir(), "baseline-report-"));
  const suites = files.map((file) => ({
    file,
    suites: [],
    specs: Array.from({ length: testsPerFile }, (_, i) => ({
      file,
      title: `t${i}`,
      tests: [{ status: "expected" }],
    })),
  }));
  const p = join(dir, "report.json");
  writeFileSync(
    p,
    JSON.stringify({ config: { rootDir: join(ROOT, "tests", "e2e") }, suites }),
  );
  return p;
}

function baseline(repoRelativeFiles: string[], totalTests: number): string {
  const dir = mkdtempSync(join(tmpdir(), "baseline-file-"));
  const p = join(dir, "standalone-baseline.json");
  writeFileSync(p, JSON.stringify({ files: [...repoRelativeFiles].sort(), totalTests }));
  return p;
}

// Report-side names are rootDir-relative; baseline-side are repo-relative.
const A_REPORT = "a.spec.ts";
const B_REPORT = "b.spec.ts";
const A = "tests/e2e/a.spec.ts";
const B = "tests/e2e/b.spec.ts";

describe("check-standalone-baseline behavioral contract (spec §4.1)", () => {
  it("exits zero on a full match, resolving report paths against config.rootDir", () => {
    const bl = baseline([A, B], 4);
    expect(run(["--report", report([A_REPORT, B_REPORT], 2), "--baseline", bl])).toBe(0);
  });

  it("rejects a baseline spec the report lacks", () => {
    const bl = baseline([A, B], 4);
    expect(run(["--report", report([A_REPORT], 2), "--baseline", bl])).not.toBe(0);
  });

  it("rejects a report spec the baseline lacks", () => {
    const bl = baseline([A], 2);
    expect(run(["--report", report([A_REPORT, B_REPORT], 2), "--baseline", bl])).not.toBe(0);
  });

  it("rejects matching files with a mismatched total test count", () => {
    const bl = baseline([A, B], 5);
    expect(run(["--report", report([A_REPORT, B_REPORT], 2), "--baseline", bl])).not.toBe(0);
  });

  it("counts a spec with an empty tests[] as zero executed tests (exact-sum contract)", () => {
    // plan-R2 F8: the sum is exact; no per-spec floor of 1.
    const dir = mkdtempSync(join(tmpdir(), "empty-tests-"));
    const p = join(dir, "report.json");
    writeFileSync(
      p,
      JSON.stringify({
        config: { rootDir: join(ROOT, "tests", "e2e") },
        suites: [
          { file: A_REPORT, suites: [], specs: [{ file: A_REPORT, title: "t", tests: [] }] },
          { file: B_REPORT, suites: [], specs: [{ file: B_REPORT, title: "t", tests: [{ status: "expected" }] }] },
        ],
      }),
    );
    expect(run(["--report", p, "--baseline", baseline([A, B], 1)])).toBe(0);
  });

  it("rejects a missing report file", () => {
    expect(run(["--report", "/nonexistent/report.json", "--baseline", baseline([A], 2)])).not.toBe(0);
  });

  it("rejects a malformed report file", () => {
    const dir = mkdtempSync(join(tmpdir(), "bad-report-"));
    const bad = join(dir, "report.json");
    writeFileSync(bad, "not json {");
    expect(run(["--report", bad, "--baseline", baseline([A], 2)])).not.toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm vitest run tests/scripts/checkStandaloneBaseline.test.ts`. Expected: FAIL (script missing).

- [ ] **Step 3: Implement the script**

```js
// scripts/check-standalone-baseline.mjs
// Compares standalone-config membership against the committed baseline
// (spec 2026-07-26-ci-dark-descoped-closeout §4).
//   --report <path>    compare a Playwright JSON reporter file (CI post-run step)
//   --list-check       compare a fresh local `--list` resolution (meta-test)
//   --write            regenerate the baseline from a local `--list` resolution
//   --baseline <path>  override baseline location (fixtures only)
// Zero args: usage error for now; Task A3 amends this branch to default to
// the CI report path (test-results/standalone-report.json).
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

const ROOT = process.cwd();
const args = process.argv.slice(2);
const flagValue = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : (args[i + 1] ?? "");
};
const BASELINE = flagValue("--baseline") ?? join(ROOT, "tests/e2e/standalone-baseline.json");

function fail(msg) {
  console.error(`check-standalone-baseline: ${msg}`);
  process.exit(1);
}

const toRepoPosix = (rootDir, file) => {
  const abs = isAbsolute(file) ? file : resolve(rootDir, file);
  return relative(ROOT, abs).split(sep).join("/");
};

function membership(json) {
  const rootDir = json?.config?.rootDir;
  if (typeof rootDir !== "string") fail("report has no config.rootDir");
  const files = new Set();
  let total = 0;
  const walk = (suites) => {
    for (const s of suites ?? []) {
      walk(s.suites);
      for (const spec of s.specs ?? []) {
        files.add(toRepoPosix(rootDir, spec.file));
        total += (spec.tests ?? []).length;
      }
    }
  };
  walk(json.suites);
  return { files: [...files].sort(), totalTests: total };
}

function listResolution() {
  const out = execFileSync(
    "pnpm",
    ["exec", "playwright", "test", "--config", "tests/e2e/standalone.config.ts", "--list", "--reporter=json"],
    { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], timeout: 120_000 },
  );
  return membership(JSON.parse(out.toString()));
}

function readBaseline() {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(BASELINE, "utf8"));
  } catch (e) {
    fail(`cannot read baseline ${BASELINE}: ${e}`);
  }
  if (!Array.isArray(parsed.files) || typeof parsed.totalTests !== "number") {
    fail(`malformed baseline ${BASELINE}`);
  }
  return { files: [...parsed.files].sort(), totalTests: parsed.totalTests };
}

function compare(actual, label) {
  const base = readBaseline();
  const missing = base.files.filter((f) => !actual.files.includes(f));
  const extra = actual.files.filter((f) => !base.files.includes(f));
  if (missing.length || extra.length) {
    fail(
      `${label} membership mismatch.\n  missing from ${label}: ${missing.join(", ") || "-"}\n` +
        `  not in baseline: ${extra.join(", ") || "-"}\n  regenerate: node scripts/check-standalone-baseline.mjs --write`,
    );
  }
  if (actual.totalTests !== base.totalTests) {
    fail(
      `${label} total test count ${actual.totalTests} != baseline ${base.totalTests}. ` +
        `regenerate: node scripts/check-standalone-baseline.mjs --write`,
    );
  }
}

function compareReport(path) {
  let json;
  try {
    json = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    fail(`cannot read report ${path}: ${e}`);
  }
  compare(membership(json), "run report");
}

if (args.includes("--write")) {
  const m = listResolution();
  writeFileSync(BASELINE, `${JSON.stringify(m, null, 2)}\n`);
  console.log(`wrote ${BASELINE}: ${m.files.length} files, ${m.totalTests} tests`);
} else if (flagValue("--report") !== undefined) {
  compareReport(flagValue("--report"));
} else if (args.includes("--list-check")) {
  compare(listResolution(), "local --list resolution");
} else {
  fail("usage: --report <path> | --list-check | --write [--baseline <path>]");
}
```

- [ ] **Step 4: Run to verify pass** — all cases green.
- [ ] **Step 5: Commit** — `git add scripts/check-standalone-baseline.mjs tests/scripts/checkStandaloneBaseline.test.ts && git commit -m "feat(ci): standalone baseline comparator, behaviorally pinned"`

### Task A2: json reporter in the standalone config, observed structurally + committed baseline

**Files:**
- Modify: `tests/e2e/standalone.config.ts:88` (`reporter: "list"` today)
- Modify: `tests/ci/_standaloneConfigProbe.ts` (expose evaluated `reporter` — additive `reporter: unknown` field, child emits `config.reporter` in its JSON)
- Create: tests/e2e/standalone-baseline.json (via `--write`)
- Test: tests/ci/\_metaSpecRegistration.test.ts (file starts here; A3/A4 extend it)

- [ ] **Step 1: Write the failing test** — STRUCTURAL reporter assertion (plan-R1 F3: substring checks can cross-match between entries and let `list` vanish):

```ts
// tests/ci/_metaSpecRegistration.test.ts (first cases; A3/A4 extend this file)
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { probeConfig } from "./_standaloneConfigProbe";

const ROOT = process.cwd();
const JSON_OUTPUT = "test-results/standalone-report.json";

describe("standalone config reporters (spec §4.1 structural pinning)", () => {
  it("evaluated reporter contains BOTH the list entry and the json entry with the exact outputFile", () => {
    const probe = probeConfig([], {}, true);
    const reporter = probe.reporter as Array<string | [string, { outputFile?: string }?]>;
    expect(Array.isArray(reporter)).toBe(true);
    const names = reporter.map((r) => (Array.isArray(r) ? r[0] : r));
    expect(names).toContain("list");
    const jsonEntry = reporter.find((r) => Array.isArray(r) && r[0] === "json") as
      | [string, { outputFile?: string }?]
      | undefined;
    expect(jsonEntry).toBeDefined();
    expect(jsonEntry?.[1]?.outputFile).toBe(JSON_OUTPUT);
  });

  it("committed baseline matches the local --list resolution (forces regen on any membership change)", () => {
    // plan-R1 F1: this is the unit-suite tripwire that forces PR-C's regen.
    execFileSync("node", [join(ROOT, "scripts/check-standalone-baseline.mjs"), "--list-check"], {
      cwd: ROOT,
      stdio: "pipe",
      timeout: 180_000,
    }); // throws (fails the test) on mismatch or missing baseline
  });
});
```

- [ ] **Step 2: Verify failure** — reporter case fails (`probe.reporter` undefined); baseline case fails (no baseline file).
- [ ] **Step 3: Implement** — probe: add `reporter: unknown` to `ConfigProbe`, child includes `config.reporter`; config: `reporter: [["list"], ["json", { outputFile: "test-results/standalone-report.json" }]],`; then `node scripts/check-standalone-baseline.mjs --write`.
- [ ] **Step 4: Verify pass** — this file green plus existing probe consumers: `pnpm vitest run tests/ci/`.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(ci): json run report + committed baseline, pinned by observation"`

### Task A3: post-run comparison step, structurally pinned; `yaml` devDependency

**Files:**
- Modify: `.github/workflows/standalone-e2e.yml` (one step after the run step)
- Modify: `package.json` + `pnpm-lock.yaml` (add `"yaml": "^2.8.0"` to devDependencies; the lockfile update commits with it)
- Modify: scripts/check-standalone-baseline.mjs (zero-args branch defaults to the CI report path)
- Test: extend tests/scripts/checkStandaloneBaseline.test.ts AND tests/ci/\_metaSpecRegistration.test.ts

- [ ] **Step 0 (setup, not behavior): `pnpm add -D yaml@^2.8.0`.** Installing the parser is scaffolding for the test that follows, not the behavior under test (plan-R2 F2); the behavioral red is the missing workflow step and the missing zero-args default, both observed in Step 2 with yaml already importable.

- [ ] **Step 1a: Failing script cases** (plan-R1 F2 — the no-args default must be PINNED, not inferred; the old usage-fail branch also exits non-zero, so the distinguishing case is the one that expects SUCCESS):

```ts
  it("zero args: reads test-results/standalone-report.json relative to cwd and compares (A3 amendment)", () => {
    // Self-contained (plan-R3 F5): the fixture report's rootDir points INSIDE the temp cwd,
    // because the script computes repo-relativity against ITS process.cwd().
    const cwd = mkdtempSync(join(tmpdir(), "default-report-"));
    mkdirSync(join(cwd, "test-results"), { recursive: true });
    writeFileSync(
      join(cwd, "test-results", "standalone-report.json"),
      JSON.stringify({
        config: { rootDir: join(cwd, "tests", "e2e") },
        suites: [
          {
            file: "a.spec.ts",
            suites: [],
            specs: [
              { file: "a.spec.ts", title: "t0", tests: [{ status: "expected" }] },
              { file: "a.spec.ts", title: "t1", tests: [{ status: "expected" }] },
            ],
          },
        ],
      }),
    );
    expect(run(["--baseline", baseline(["tests/e2e/a.spec.ts"], 2)], cwd)).toBe(0);
  });

  it("zero args with the default report absent exits non-zero", () => {
    const cwd = mkdtempSync(join(tmpdir(), "no-default-report-"));
    expect(run(["--baseline", baseline(["tests/e2e/a.spec.ts"], 2)], cwd)).not.toBe(0);
  });
```

(`mkdirSync` joins the existing `node:fs` import list in this file — the A1 header import line becomes `import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";`. The SUCCESS case is red before the amendment: the usage-fail branch exits 1, failing `toBe(0)`.)

- [ ] **Step 1b: Failing workflow-pinning cases** (extend tests/ci/\_metaSpecRegistration.test.ts):

```ts
import { parse } from "yaml";

describe("standalone-e2e.yml comparison step (spec §4.1 structural pinning)", () => {
  const wf = parse(readFileSync(join(ROOT, ".github/workflows/standalone-e2e.yml"), "utf8"));
  const job = wf.jobs["standalone-e2e"];
  const steps: Array<Record<string, unknown>> = job.steps;
  const runIdx = steps.findIndex(
    (s) => s.run === "pnpm exec playwright test --config tests/e2e/standalone.config.ts",
  );
  const cmpIdx = steps.findIndex((s) => s.run === "node scripts/check-standalone-baseline.mjs");

  it("comparison step exists and DIRECTLY FOLLOWS the run step", () => {
    expect(runIdx).toBeGreaterThan(-1);
    expect(cmpIdx).toBe(runIdx + 1);
  });

  it("neither step carries step-level context keys", () => {
    for (const s of [steps[runIdx], steps[cmpIdx]]) {
      expect(s).toBeDefined();
      for (const k of ["if", "env", "continue-on-error", "shell", "working-directory"]) {
        expect(s ?? {}, `step must not carry ${k}`).not.toHaveProperty(k);
      }
    }
  });

  it("pull_request trigger EXISTS and is bare; job/workflow carry no execution overrides", () => {
    // The yaml package parses `on:` as the string key "on".
    const on = wf.on as Record<string, unknown> | undefined;
    expect(on, "workflow must keep a pull_request trigger").toBeDefined();
    expect(Object.prototype.hasOwnProperty.call(on ?? {}, "pull_request")).toBe(true); // plan-R1 F4: absence must FAIL
    const pr = (on ?? {})["pull_request"];
    // plan-R2 F1: null (bare key) is the ONLY non-object acceptable form; booleans and
    // arrays are malformed/disabled triggers and must FAIL.
    const bare =
      pr === null ||
      (typeof pr === "object" && pr !== undefined && !Array.isArray(pr) && Object.keys(pr).length === 0);
    expect(bare, "pull_request trigger must be bare (no filters, not disabled)").toBe(true);
    for (const k of ["needs", "strategy", "continue-on-error", "environment", "defaults"]) {
      expect(job).not.toHaveProperty(k);
    }
    expect(wf).not.toHaveProperty("defaults");
  });
});
```

(Implementer verifies the `on` key shape once against the parsed object — the `yaml` package v2 yields string key `"on"`; if it yields boolean `true` instead, fix the accessor and DELETE the wrong branch; the EXISTENCE assertion stays either way.)

- [ ] **Step 2: Verify failure** — script SUCCESS case red (usage-fail branch exits 1); workflow cases red (comparison step absent).
- [ ] **Step 3: Implement** — script zero-args branch → `compareReport(join(ROOT, "test-results/standalone-report.json"))` guarded by existence (missing → fail loud, which the absent case pins); workflow step directly after the run step:

```yaml
      - name: Compare the run's own report against the committed baseline
        run: node scripts/check-standalone-baseline.mjs
```

- [ ] **Step 4: Verify** — both test files green; `pnpm vitest run tests/ci/_metaE2eWorkflowCoverage.test.ts` still green (scanner unaffected: new step names no spec, no pipe).
- [ ] **Step 5: Commit** — `git commit -am "feat(ci): pinned post-run baseline comparison; yaml devDependency for structural workflow pins"`

### Task A4: the registration detector

**Files:**
- Modify: tests/ci/\_metaSpecRegistration.test.ts (main body)
- Possibly modify: `playwright.config.ts` + `tests/ci/_metaE2eWorkflowCoverage.test.ts:85` (report-modal disposition)

**Interfaces:**
- Produces: `export const DARK_SPEC_ALLOWLIST: Record<string, string>` seeded `{ "tests/e2e/packlist-rescan-recovery.spec.ts": "BL-HARNESS-PACKLIST-SERVER-GRAPH" }` (PR-C deletes the row).

- [ ] **Step 1: Write the failing detector cases** (all additions to the same file; imports already present from A2/A3 — plus `PARALLEL_TEST_GLOBS`, `BASE_INCLUDE`, `MUTATION_TEST_GLOBS` from the vitest.projects module):

```ts
const CONFIGS = [
  "playwright.config.ts",
  "tests/e2e/standalone.config.ts",
  "playwright.screenshots.config.ts",
] as const;

export const DARK_SPEC_ALLOWLIST: Record<string, string> = {
  "tests/e2e/packlist-rescan-recovery.spec.ts": "BL-HARNESS-PACKLIST-SERVER-GRAPH",
};

/** Playwright's own default matcher (installed 1.59.1, common/config.js:164), split by side. */
const PW_TEST_FILE = /\.(?:spec|test)\.(?:c|m)?[jt]sx?$/;
/** The exact pair the Vitest include globs claim (vitest.projects.ts:34); drift-tied below. */
const VITEST_CLAIMED = /\.test\.tsx?$/;

/** Recursive readdirSync walk (the _metaMutationSurfaceObservability pattern; no glob dep). */
function walkFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(p));
    else out.push(p);
  }
  return out;
}

function resolvedFiles(config: string): Set<string> {
  const out = execFileSync(
    "pnpm",
    ["exec", "playwright", "test", "--config", config, "--list", "--reporter=json"],
    { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], timeout: 180_000 },
  );
  const json = JSON.parse(out.toString());
  const rootDir: string = json.config?.rootDir ?? ROOT;
  const files = new Set<string>();
  const walk = (suites: Array<{ suites?: unknown[]; specs?: Array<{ file: string }> }>) => {
    for (const s of suites ?? []) {
      walk((s.suites ?? []) as never);
      for (const spec of s.specs ?? []) {
        files.add(relative(ROOT, resolve(rootDir, spec.file)).split(sep).join("/"));
      }
    }
  };
  walk(json.suites ?? []);
  return files;
}

describe("spec registration detector (spec §3.1)", () => {
  const union = new Set<string>();
  beforeAll(() => {
    for (const c of CONFIGS) for (const f of resolvedFiles(c)) union.add(f);
  });

  it("every test-shaped file under tests/e2e is resolved by some config or dark-allowlisted", () => {
    const disk = walkFiles(join(ROOT, "tests", "e2e"))
      .map((p) => relative(ROOT, p).split(sep).join("/"))
      .filter((p) => PW_TEST_FILE.test(p) && !VITEST_CLAIMED.test(p));
    const dark = disk.filter((p) => !union.has(p) && !(p in DARK_SPEC_ALLOWLIST));
    expect(
      dark,
      `specs resolved by NONE of ${CONFIGS.join(", ")} and not dark-allowlisted ` +
        `(register in a config, or add a DARK_SPEC_ALLOWLIST row with a backlog ref): ${dark.join(", ")}`,
    ).toEqual([]);
  });

  it("no allowlist row shadows a resolved spec, and none is stale", () => {
    expect(Object.keys(DARK_SPEC_ALLOWLIST).filter((p) => union.has(p))).toEqual([]);
    expect(Object.keys(DARK_SPEC_ALLOWLIST).filter((p) => !existsSync(join(ROOT, p)))).toEqual([]);
  });

  it("drift tie: the subtraction's premise is pinned, not approximated", () => {
    // plan-R3 F2: the detector's VITEST_CLAIMED subtraction is sound iff the serial
    // include set still claims exactly tests/**/*.test.{ts,tsx}. Pin BASE_INCLUDE
    // VERBATIM (a narrowed dir, dropped suffix, or new shape re-opens the subtraction),
    // and keep the suffix-claim sweep over the remaining glob families.
    expect(BASE_INCLUDE).toEqual(["tests/**/*.test.ts", "tests/**/*.test.tsx"]);
    const globs = [...PARALLEL_TEST_GLOBS, ...MUTATION_TEST_GLOBS];
    const offenders = globs.filter(
      (g) => !(g.endsWith(".test.ts") || g.endsWith(".test.tsx") || g.endsWith(".test.{ts,tsx}")),
    );
    expect(offenders, "a Vitest glob now claims a non-ts test shape; re-derive VITEST_CLAIMED").toEqual([]);
  });

  it("config-set tripwire: invocation census + filename belt both equal the known trio", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    const texts: string[] = Object.values(pkg.scripts as Record<string, string>);
    const wfDir = join(ROOT, ".github", "workflows");
    for (const wfPath of readdirSync(wfDir).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))) {
      const doc = parse(readFileSync(join(wfDir, wfPath), "utf8"));
      for (const j of Object.values((doc.jobs ?? {}) as Record<string, { steps?: Array<{ run?: string }> }>)) {
        for (const step of j.steps ?? []) if (typeof step.run === "string") texts.push(step.run);
      }
    }
    const invoked = new Set<string>();
    for (const raw of texts) {
      // Normalize shell line continuations so a multiline invocation reads as one line (plan-R1 F7).
      for (const line of raw.replace(/\\\n/g, " ").split("\n")) {
        if (!/\bplaywright test\b/.test(line)) continue;
        const m = line.match(/(?:--config|-c)[ =](\S+)/);
        invoked.add(m?.[1] ?? "playwright.config.ts");
      }
    }
    expect([...invoked].sort()).toEqual([...CONFIGS].sort());

    const belt = walkFiles(ROOT)
      .map((p) => relative(ROOT, p).split(sep).join("/"))
      .filter((p) => !p.startsWith("node_modules/") && !p.includes("/node_modules/"))
      .filter((p) => /(^|\/)playwright[^/]*\.config\.[^/]+$/.test(p))
      .sort();
    expect(belt).toEqual(["playwright.config.ts", "playwright.screenshots.config.ts"]);
  });
});
```

(Walking ROOT for the belt: exclude `.git/`, `node_modules/`, `test-results/`, `.next/` inside `walkFiles` via a skip-list parameter — the implementer adds `const SKIP = new Set([".git", "node_modules", "test-results", ".next", "playwright-report"])` and skips those directory names; keep it in the shared helper.)

- [ ] **Step 2: Verify failure** — Expected: the detector case FAILS naming `tests/e2e/report-modal.spec.ts` (in no config, not allowlisted). That is the live instance from spec §2.1, caught by the new guard.

- [ ] **Step 3: report-modal disposition (spec §3.2).** Add `report-modal` to the default-config project alternation that carries the crew app-dependent specs — read `playwright.config.ts:63` / `playwright.config.ts:77` and pick the project whose members are crew-page specs; verify resolution: `pnpm exec playwright test report-modal --list`. Then run it against a dev server (`pnpm dev` on 3000, spec routes its own network via `page.route`): `pnpm exec playwright test report-modal`. GREEN → keep registration + the existing `UNSEEN` row (premise restored). RED beyond quick fixture drift → revert registration, add `DARK_SPEC_ALLOWLIST` row `"tests/e2e/report-modal.spec.ts": "BL-E2E-REPORT-MODAL-UNRUNNABLE"`, and file that backlog entry WITH the measured failure output in the same commit.

- [ ] **Step 4: Verify pass** — `pnpm vitest run tests/ci/_metaSpecRegistration.test.ts` green.

- [ ] **Step 5: AC-1 mutation check** — three temp files, each `import { test } from "@playwright/test"; test("x", () => {});`: tests/e2e/zz-mutation.spec.ts, tests/e2e/zz-mutation.spec.cts, tests/e2e/zz-mutation.test.mjs. Re-run the detector: ONE failing aggregate assertion naming ALL THREE files AND the three configs in its message (plan-R4 F2: the detector is a single test with one aggregate expectation; the transcript shows one red test whose diff lists all three paths). Delete the temp files; green again. Transcript into the PR body.

- [ ] **Step 6: Commit** — `git commit -am "feat(ci): spec registration detector over all three Playwright configs"`

### Task A5: CI-side mutation verification + close-out docs

- [ ] **Step 1:** Push branch; open PR; confirm `standalone-e2e` green (real report + comparison exercised in the real environment).
- [ ] **Step 2: AC-2 mutation:** `git checkout -b scratch/ci-dark-ac2-mutation`; edit `tests/e2e/standalone.config.ts` adding `repeatEach: process.env.GITHUB_ACTIONS === "true" ? 2 : 1,` (plan-R3 F3: the FILE-PRESERVING vector the spec's AC-2 names, expressed deterministically — every file stays in the report while the executed-test count shifts under the Actions env, and the comparator is an inequality so direction is irrelevant; `workflow_dispatch` does not set `GITHUB_EVENT_NAME=pull_request`, so the GITHUB_ACTIONS predicate stays in the locally-invisible class); **`git commit -am "scratch: ac2 mutation"` and `git push -u origin scratch/ci-dark-ac2-mutation`** (plan-R1 F9: the mutation must be committed to be observable); `gh workflow run standalone-e2e.yml --ref scratch/ci-dark-ac2-mutation`; expect RED at the comparison step. Record run URL in the PR body; then RETURN to the PR branch before any further work (plan-R2 F3): `git checkout feat/ci-dark-descoped-guards && git branch -D scratch/ci-dark-ac2-mutation && git push origin :scratch/ci-dark-ac2-mutation`.
- [ ] **Step 3: Docs:** BACKLOG.md — `BL-CI-UNREGISTERED-SELF-CONTAINED-SPEC` and `BL-CI-ENV-DEPENDENT-CONFIG-NARROWING` ✅ RESOLVED (mechanism + shipped test paths); parent spec §10b supersession note. `pnpm spec:lint` both docs.
- [ ] **Step 4: Commit** — `git commit -am "docs(ci): close the two PR-A backlog items; supersede the parent §10b ceiling"`

### Task A6: PR-A close-out gates

- [ ] Full `pnpm test` (no path args); `pnpm typecheck`; `pnpm lint`; `pnpm format:check`.
- [ ] Whole-diff cross-model review (codex-guard; REVIEWER ONLY; fresh-eyes; spec §1.1 do-not-relitigate table inlined) to APPROVE, class-sweeping repairs.
- [ ] Push → CI green (all twelve required contexts) → `gh pr merge --merge` → `git -C /Users/ericweiss/FX-Webpage-Template pull --ff-only` → `git -C /Users/ericweiss/FX-Webpage-Template rev-list --left-right --count main...origin/main` == `0  0`.

---

# PR-B — vitest exclusion coverage

New worktree AFTER PR-A merges: `git worktree add -b feat/ci-dark-vitest-exclusion ../FX-worktrees/ci-dark-vitest-excl origin/main && cd ../FX-worktrees/ci-dark-vitest-excl && pnpm install && pnpm worktree:link-env && pnpm preflight`.

### Task B1: run-excluded-test script + alias, behaviorally pinned

**Files:**
- Create: scripts/run-excluded-test.mjs
- Modify: `package.json` (`"run-excluded": "node scripts/run-excluded-test.mjs"`)
- Test: tests/scripts/runExcludedTest.test.ts

**Interfaces:**
- Produces: `pnpm run-excluded <test-file>` — spawns `pnpm vitest run <file> --reporter=json --outputFile=<tmpfile>`; exit 0 IFF child exit 0 AND report `numPassedTests >= 1` AND `numFailedTests === 0`. (Field names verified against real output before writing fixtures: run `pnpm vitest run tests/messages/lookup.test.ts --reporter=json --outputFile=/tmp/probe.json` once and confirm `numPassedTests`/`numFailedTests`/`numPendingTests` are top-level; adjust ONLY the field names if vitest 4's schema differs, never the three-condition gate.)
- Test seam: env `RUN_EXCLUDED_CMD_OVERRIDE` — a JSON `{ "cmd": string, "args": string[] }` replacing the spawned command; REFUSED (hard error) when `GITHUB_ACTIONS` is set, so CI always runs real vitest. The stub command still receives `--outputFile=<tmpfile>` as its final argument and must write the canned report there (the fixture stubs are tiny `node -e` scripts that copy a canned report to the path in their last argv and exit with a chosen code).

- [ ] **Step 1: Write the failing behavioral test** — the case checklist below (exit-code capture identical to A1's `run()` helper); cases 1-4 and 6 write canned reports via their stubs, case 5 deliberately writes none, case 5b writes malformed bytes:

```ts
// tests/scripts/runExcludedTest.test.ts: case inventory (full bodies follow the A1 pattern):
// 1. passing report (numPassedTests: 3, numFailedTests: 0) + stub exit 0        -> expect 0
// 2. zero-passed report (numPassedTests: 0, numFailedTests: 0) + exit 0         -> expect non-zero
// 3. all-skipped report (numPassedTests: 0, numPendingTests: 4) + exit 0        -> expect non-zero
// 4. failing report (numFailedTests: 2) + exit 1                                -> expect non-zero
// 5. stub writes NO report file + exit 0                                        -> expect non-zero
// 5b. stub writes MALFORMED JSON ("not json {") to the report path + exit 0     -> expect non-zero
// 6. passing report BUT stub exit 1 (R3-F5: run-level failure with green cases) -> expect non-zero
// 7. alias pin: package.json scripts["run-excluded"] === "node scripts/run-excluded-test.mjs"
```

Each case builds its stub script in a temp dir and sets `RUN_EXCLUDED_CMD_OVERRIDE`, and invokes the script via `execFileSync("node", [SCRIPT, "tests/whatever.test.ts"], { env: {...} })`. Case 6's stub writes the PASSING report then `process.exit(1)`. A final case: `RUN_EXCLUDED_CMD_OVERRIDE` set together with `GITHUB_ACTIONS: "true"` → non-zero (the seam is CI-refused).

- [ ] **Step 2: Verify failure.** **Step 3: Implement** (spawn via `execFileSync` with the override parsing, tmp report path via `mkdtempSync`, three-condition gate, one-line loud failure naming the violated condition). **Step 4: Verify pass** + one real run: `pnpm run-excluded tests/cross-cutting/email-canonicalization.test.ts` → exit 0 locally. **Step 5: Commit** — `feat(ci): run-excluded execution oracle`

### Task B2: registry meta-test + registry + row deletion + x5 step (ONE TDD cycle)

(plan-R1 F10/F12: the registry, the `test-auth-gate` row deletion, and the x5 step must land together or the totality assertion cannot go green; the deletion IS driven by a failing test — the totality case.)

**Files:**
- Modify: `vitest.projects.ts` (delete the test-auth-gate row from `ENV_BOUND_EXCLUDES:49`; add the registry export)
- Modify: `.github/workflows/x-audits.yml` (x5 verbatim step)
- Create: tests/ci/\_metaEnvBoundExclusionCoverage.test.ts

**Interfaces:**
- Produces:

```ts
export type EnvBoundCoverageRow =
  | { workflow: string; job: string }
  | { dark: true; backlogRef: string };
export const ENV_BOUND_COVERAGE_REGISTRY: Record<string, EnvBoundCoverageRow> = {
  "tests/cross-cutting/email-canonicalization.test.ts": {
    workflow: ".github/workflows/x-audits.yml",
    job: "x5-email-canonicalization",
  },
};
```

- [ ] **Step 1: Write the failing meta-test.** Cases: (1) totality both directions — every `ENV_BOUND_EXCLUDES` entry (strip the `**/` prefix) has exactly one registry row; every row's file is in the array (stale check); (2) for each `{workflow, job}` row, `yaml`-parse the workflow: some step in that job has `run` EXACTLY `pnpm run-excluded <file>`, and that step carries none of `if`/`continue-on-error`/`working-directory`/`shell` (plan-R3 F1: a step-level `shell: bash -c ":" {0}` override consumes the literal without executing it) and its run contains no `|`; (3) workflow qualification: `on.pull_request` key EXISTS and is bare (no paths/paths-ignore/types/branches/branches-ignore); job `if` absent or exactly `github.event_name != 'schedule'`; job and workflow carry none of `needs`/`strategy`/`continue-on-error`/`environment`/`defaults`; (4) any `dark: true` row → `expect.fail` quoting its `backlogRef`. Writing the failing test includes scaffolding an EMPTY registry export in `vitest.projects.ts` (`export const ENV_BOUND_COVERAGE_REGISTRY: Record<string, EnvBoundCoverageRow> = {};`) so the test COMPILES (plan-R3 F7) and then fails BEHAVIORALLY: totality (both remaining `ENV_BOUND_EXCLUDES` entries uncovered) and, once the email-canon row is drafted, the missing x5 step. That failing state DRIVES the row deletion and the workflow edit (TDD).
- [ ] **Step 2: Implement in one commit:** registry export; delete `"**/tests/admin/test-auth-gate.test.ts"` from `ENV_BOUND_EXCLUDES`; x5 step after the audit step:

```yaml
      - name: Prove the excluded email-canonicalization file executes here
        run: pnpm run-excluded tests/cross-cutting/email-canonicalization.test.ts
```

- [ ] **Step 3: Verify** — meta-test green; the CI-shaped resolution proof for the returned file: `VITEST_EXCLUDE_ENV_BOUND=1 pnpm vitest run tests/admin/test-auth-gate.test.ts --project serial` now resolves (24 passed / 3 skipped; before the deletion the same command reports no test files). `pnpm vitest run tests/ci/` green. Document in the test header: x5's steps carry no `TEST_DATABASE_URL`, so the three `livePsqlReachable` rows (`tests/cross-cutting/email-canonicalization.test.ts:313` + two siblings) SKIP there — documented CI shape, oracle still proves ≥1 passed (spec §6.1 honest ceiling).
- [ ] **Step 4: Commit** — `feat(ci): exclusion-coverage registry; test-auth-gate returns to unit-suite`

### Task B3: stability verification

- [ ] `for i in 1 2 3 4 5; do VITEST_EXCLUDE_ENV_BOUND=1 pnpm vitest run tests/admin/test-auth-gate.test.ts --project serial || exit 1; done` (spec §6.2; session baseline 3× at 0.7-1.6 s). Flake → STOP, replan to the spec's port-to-Playwright fallback; do not ship a flaky member into a required context.
- [ ] Full serial project once: `VITEST_EXCLUDE_ENV_BOUND=1 pnpm vitest run --project serial`.
- [ ] Commit any header-comment adjustments — `test(ci): stability evidence for the returned file`

### Task B4: PR-B docs + close-out gates

- [ ] BACKLOG.md: `BL-CI-VITEST-EXCLUSION-COVERAGE` ✅ RESOLVED (mechanism, test paths, x5 skip-shape note). `pnpm spec:lint` it.
- [ ] Same close-out gates as A6 (watch `unit-suite` timing with the returned file — expected +~1 s on one shard).

---

# PR-C — directive resolver + packlist restore

New worktree AFTER PR-A merges (independent of PR-B): `git worktree add -b feat/ci-dark-directive-resolver ../FX-worktrees/ci-dark-resolver origin/main && cd ../FX-worktrees/ci-dark-resolver && pnpm install && pnpm worktree:link-env && pnpm preflight`.

### Task C1: shared directive plugin — every contract case through a REAL build

**Files:**
- Create: tests/e2e/helpers/useServerDirectivePlugin.mjs (plain JS; JSDoc types; NO TypeScript syntax — plan-R1 F14)
- Create: tests/e2e/helpers/\_\_fixtures\_\_/directive/ (the 18 modules from the inventory below)
- Modify: `tests/e2e/_metaLiveEntryToolchain.test.ts` EXEMPT map (plan-R4 F1: the contract test imports esbuild directly to run its build-boundary cases; without its own exemption row the toolchain guard reds the suite — add the row in THIS task, rationale "the plugin contract test builds fixtures through the real esbuild API")
- Test: tests/e2e/helpers/useServerDirectivePlugin.test.ts

**Interfaces:**
- Produces: `useServerDirectivePlugin()` → esbuild Plugin; `analyzeModule(path, source)` → `{ directive: false } | { directive: true, stub: string } | { directive: true, error: string }` (pure core; plugin is a thin onLoad wrapper). Contract per spec §5.1-§5.2: `ts.createSourceFile` parse; directive = prologue ExpressionStatement string literal with COOKED text `use server` (`st.expression.text === "use server"` — cooked by construction); zero parse diagnostics (`sourceFile.parseDiagnostics.length === 0` — plain JS property access, no cast; verify the property exists on the parsed object with a one-line probe before relying on it, and if the public API hides it use `ts.createProgram`-free `ts.transpileModule` diagnostics instead — decide by probing, record which in the module header); supported exports exactly: named async function declaration, named/anonymous default async function, `export const f = async …` (arrow or function expression); type-only exports → empty stub; anything else → error naming module + shape. No substring prefilter (spec §5.1: none is sound).

- [ ] **Step 1: Write fixtures + the failing test.** Fixture inventory (each a small real module):

```
namedDecl.ts       "use server"; export async function f() { return "NAMED_BODY_SENTINEL"; }        -> stubs [f]
defaultNamed.ts    "use server"; export default async function g() { return "DEFN_BODY_SENTINEL"; }  -> stubs [default]
defaultAnon.ts     "use server"; export default async function () { return "DEFA_BODY_SENTINEL"; }   -> stubs [default]
arrowConst.ts      "use server"; export const h = async () => "ARROW_BODY_SENTINEL";                 -> stubs [h]
fnExprConst.ts     "use server"; export const k = async function () { return "FNEX_BODY_SENTINEL"; };-> stubs [k]
typeOnly.ts        "use server"; export type T = { x: number };                                      -> empty stub
singleQuote.ts     'use server'; export async function f() { return "SQ_BODY_SENTINEL"; }            -> stubs [f]  (case e)
escapedSpace.ts    "use\x20server"; export async function f() { return "ESC_BODY_SENTINEL"; }        -> stubs [f]  (case g)
noDirective.ts     export const plain = "PLAIN_BODY_SENTINEL";                      -> real body      (case c)
nestedString.ts    export const s = '"use server"' + "NESTED_BODY_SENTINEL"; // "use server" in a comment -> real body (case d)
reexportFrom.ts    "use server"; export { f } from "./namedDecl";                   -> build FAILS
starExport.ts      "use server"; export * from "./namedDecl";                       -> build FAILS
aliasedLocal.ts    "use server"; async function f() {} export { f as g };           -> build FAILS
syncConst.ts       "use server"; export const n = 1;                                -> build FAILS
classDecl.ts       "use server"; export class C {}                                  -> build FAILS
syncFn.ts          "use server"; export function s() {}                             -> build FAILS
octalEscape.ts     "use\040server"; export async function f() { return 1; }         -> build FAILS (case h: TS diagnostic)
trailingGarbage.ts "use server"; export async function f() { return 1; } @@@        -> build FAILS (case h)
```

The test builds EVERY fixture through a real `esbuild.build` (plan-R1 F13 — the build boundary is the contract, `analyzeModule` alone is not): a helper `bundleFixture(name)` writes a temp entry `import * as m from "<fixture>"; console.log(m);`, calls `build({ entryPoints, bundle: true, write: false, format: "iife", plugins: [useServerDirectivePlugin()], logLevel: "silent" })`, and returns `{ ok, output, errors }`. Assertions: the SEVEN throwing supported fixtures (five shapes + the single-quote and escaped-space spelling variants) → `ok`, output CONTAINS the throw message with each export name and NOT the fixture's body sentinel (each supported fixture body carries a unique `*_BODY_SENTINEL` string constant inside the function body for this purpose); typeOnly → `ok`, output contains neither; noDirective → `ok`, output CONTAINS `PLAIN_BODY_SENTINEL`; nestedString → `ok`, output CONTAINS `NESTED_BODY_SENTINEL` (each real body bundles, asserted by its OWN sentinel); the six unsupported + two diagnostic fixtures → `!ok` and `errors` text names the fixture path (and for shape errors, the shape). Mutation check: one case builds `namedDecl` with a plugin variant `useServerDirectivePlugin({ disabled: true })` (a test-only option that makes onLoad return null) and asserts the body sentinel LEAKS into the output — proving the positive assertions can fail.

- [ ] **Step 2: Verify failure** (module missing). **Step 3: Implement** the module: start from the session prototype (scratchpad directive-resolver-prototype.mjs of 2026-07-26 — its analyze loop, extended: cooked-text equality, zero-diagnostics gate, three added export shapes, `disabled` option, no prefilter, node_modules early-return in onLoad). **Step 4: Verify pass** (fixture cases + mutation case).

- [ ] **Step 5: IMPORT-GRAPH REALITY CHECK — the PR-C gate (spec §5.4; plan-R2 F4: it belongs in the FIRST PR-C task, before any consolidation lands).** A scratch node script (temp dir, not committed) calls `esbuild.build` directly on `tests/e2e/_packListRescanLiveEntry.tsx` with `plugins: [useServerDirectivePlugin()]`, `alias: { "node:crypto": <repo>/tests/e2e/_nodeCryptoStub.ts }`, `metafile: true`, and the same flag set as `tests/e2e/helpers/liveEntryToolchain.ts:73`. Assert: zero inputs under `node_modules/googleapis`, `node_modules/postgres`, `node_modules/google-auth-library`; total inputs > 500; at least one `node_modules/react/` input. Session prototype measured 1908 / 0 offending / 6 stubbed. GREEN → C2-C4 proceed. RED → trace the edge in the metafile; a one-line app-code import split is fixed here; anything larger keeps the packlist spec dark (both allowlist rows stay), the trace goes to BACKLOG.md, and C4 is descoped while C2/C3 (still independently valuable: sync-contract child + regex-resolver deletion) proceed. Record the measurement output in the task commit message body.

- [ ] **Step 6: Commit** — `feat(e2e): shared use-server directive plugin, contract-tested at the build boundary`

### Task C2: bundleLiveEntry via a plugin-capable child script

**Files:**
- Create: tests/e2e/helpers/\_bundleLiveEntryChild.mjs
- Modify: `tests/e2e/helpers/liveEntryToolchain.ts:69` (execFileSync target)
- Modify: `tests/e2e/_metaLiveEntryToolchain.test.ts` (exemption map row for the child)
- Modify: `tests/e2e/helpers/liveEntryToolchain.bundle.test.ts` (new directive case; metafile case)

**Interfaces:**
- Produces: child argv `node _bundleLiveEntryChild.mjs <entryAbs> <outFileAbs> <tsconfigAbs> <aliasesJson> <externalsJson> [--metafile <path>]` (plan-R1 F16: the optional flag writes `result.metafile` JSON to the path — C4's reality check consumes it). Child mirrors the CLI flags at `tests/e2e/helpers/liveEntryToolchain.ts:73` exactly (bundle, iife, jsx automatic, tsx loader, NODE_ENV define, node:fs + externals, aliases, tsconfig, window.process banner, outfile) plus `plugins: [useServerDirectivePlugin()]`. esbuild applies `alias` before plugins, so per-call-site aliases keep winning — asserted by the existing crypto-alias case staying green.
- `bundleLiveEntry` signature/sync-void behavior UNCHANGED; `BundleOptions` gains optional `metafilePath?: string`.

- [ ] **Step 1: Failing cases in liveEntryToolchain.bundle.test.ts:** (i) bundling a temp entry that imports the C1 `namedDecl` fixture produces a bundle containing the plugin throw message (red: CLI path has no plugin); (ii) `metafilePath` writes a JSON file that is a REAL esbuild metafile, not a fabricated stub (plan-R2 F5): `inputs` includes the entry, includes at least one path under `node_modules/react/` (the entry renders via createRoot, so react is always in the graph), and has more than 100 keys (red: option unknown).
- [ ] **Step 2: Implement** child + retarget: `execFileSync("node", [join(__dirname, "_bundleLiveEntryChild.mjs"), entry, outFile, join(REPO_ROOT, "tsconfig.json"), JSON.stringify(aliases), JSON.stringify(["node:fs", ...externals]), ...(metafilePath ? ["--metafile", metafilePath] : [])], ...)`. `_metaLiveEntryToolchain.test.ts`: add the child to the EXEMPT map (`tests/e2e/_metaLiveEntryToolchain.test.ts:37` shape) — it imports esbuild by name, which is the guard's concern; the helper row's rationale text updates to name the child.
- [ ] **Step 3: Verify:** helpers tests + toolchain meta-test green; integration net: `pnpm exec playwright test --config tests/e2e/standalone.config.ts compact-alert-card-layout resolve-label-layout` green.
- [ ] **Step 4: Commit** — `refactor(e2e): bundleLiveEntry builds via a plugin-capable child, call-site contract unchanged`

### Task C3: consolidate the step3 bundler — behavioral pin, not identifier pin

**Files:**
- Modify: `tests/e2e/_step3ReviewModalBundle.mjs` (delete the regex useServerElision block starting at `tests/e2e/_step3ReviewModalBundle.mjs:51`; import the shared plugin; keep `emptyNodeBuiltins` + argv contract at `tests/e2e/_step3ReviewModalBundle.mjs:41`)
- Modify: `tests/e2e/_metaLiveEntryToolchain.test.ts:37` exemption rationale
- Test: new case in the plugin contract test

- [ ] **Step 1: Failing BEHAVIORAL pin** (plan-R1 F15 — an identifier pin survives a rename): run the step3 child on a temp entry importing the escape-spelled directive fixture (escapedSpace) (`execFileSync("node", ["tests/e2e/_step3ReviewModalBundle.mjs", tempEntry, outFile, tsconfig])`) and assert the output bundle contains the shared plugin's throw message. The OLD regex resolver raw-matches `/^["']use server["']/` and does NOT stub the escape-spelled form, so this case is RED before the swap by construction — it distinguishes the mechanisms behaviorally.
- [ ] **Step 2: Implement the swap;** run `pnpm exec playwright test --config tests/e2e/standalone.config.ts step3-review-modal.interactions` green.
- [ ] **Step 3: Commit** — `refactor(e2e): step3 bundler consumes the shared directive plugin; regex resolver deleted`

### Task C4: packlist restore + guard case (f) + one baseline regen

**Files:**
- Modify: `tests/e2e/packlist-rescan-recovery.spec.ts:69` (add `aliases: { "node:crypto": join(REPO_ROOT, "tests", "e2e", "_nodeCryptoStub.ts") }` — the `tests/e2e/compact-alert-card-layout.spec.ts:67` precedent)
- Create: tests/e2e/directive-form-action.spec.ts (guard case f)
- Create: tests/e2e/_directiveFormActionLiveEntry.tsx (the micro live entry the spec bundles)
- Modify: `tests/e2e/standalone.config.ts:83` (TWO new testMatch members: `packlist-rescan-recovery`, `directive-form-action`)
- Modify: tests/ci/\_metaSpecRegistration.test.ts (delete the packlist DARK_SPEC_ALLOWLIST row)
- Modify: `tests/ci/_metaE2eWorkflowCoverage.test.ts:75` (delete the packlist LOCAL_ONLY_ALLOWLIST row)
- Regenerate: tests/e2e/standalone-baseline.json (once, `--write`)
- Test: metafile case in the plugin contract test

**Re-confirmation through the SHIPPED channel (the gate itself already ran in C1 Step 5):**
`bundleLiveEntry({ entry: _packListRescanLiveEntry.tsx, outFile: tmp, aliases: { "node:crypto": …stub }, metafilePath: tmp2 })` via the C2 flag; assert zero metafile inputs under `node_modules/googleapis`, `node_modules/postgres`, `node_modules/google-auth-library`, AND total inputs > 500 with at least one `node_modules/react/` path — a fabricated or truncated metafile fails the positive half (plan-R2 F5). This check BECOMES a permanent case in the plugin contract test (AC-4's executable form). If C1 Step 5 went RED and was resolved by descope, this task is already descoped and none of the below runs.

- [ ] **Step 1:** Delete the DARK_SPEC_ALLOWLIST row → detector RED (packlist unregistered). Write directive-form-action.spec.ts — a minimal standalone harness in the house pattern (mkdtemp + `bundleLiveEntry` on a micro live-entry _directiveFormActionLiveEntry.tsx (new) that renders `<form action={stubbedAction}><button type="submit">go</button></form>` via createRoot, importing the real `setUseRawDecisionAction` from `@/app/admin/show/[slug]/_actions/useRaw` so the REAL app boundary is exercised; `node:http` static server; Playwright clicks submit and asserts a page error / console error containing the plugin's throw message). Detector counts it once registered; RED until then.
- [ ] **Step 2:** Add both testMatch members; run both specs in a real browser: `pnpm exec playwright test --config tests/e2e/standalone.config.ts packlist-rescan-recovery directive-form-action` → green (packlist: stubs never invoked; form-action: invoked and LOUD).
- [ ] **Step 3:** `node scripts/check-standalone-baseline.mjs --write`; delete the LOCAL_ONLY_ALLOWLIST packlist row; `pnpm vitest run tests/ci/` green (baseline case forces exactly this regen — the PR-A guard working as designed).
- [ ] **Step 4: Commit** — `feat(e2e): packlist returns to CI under the directive resolver; form-action consumption measured`

### Task C5: PR-C docs + close-out gates

- [ ] `tests/e2e/helpers/liveEntryToolchain.ts:15` header: replace the "DELIBERATELY NOT a resolver policy" paragraph with the directive-rule contract + spec pointer (ratified supersession, spec §1.1 row 3).
- [ ] BACKLOG.md: `BL-HARNESS-RESOLVER-POLICY` ✅ RESOLVED, citing the plugin contract and the consolidation. `BL-HARNESS-PACKLIST-SERVER-GRAPH` ✅ RESOLVED ONLY IF C4 shipped (plan-R3 F4: under the C1 Step 5 descope branch it STAYS OPEN, updated with the fresh metafile trace and a pointer at the shipped resolver as the remaining path); the parent-spec §10.2 supersession note follows the same condition. Sweep evidence: `rg -n "use.?server" tests/e2e --iglob '!__fixtures__'` over ALL file types (plan-R1 F15: not just `.mjs`) — every hit is either the shared plugin, a fixture, or a comment; record the output. Parent spec §10.1/§10.2 supersession notes. `pnpm spec:lint` the edited docs.
- [ ] Close-out gates as A6. PR-C's diff is wide — dispatch TWO scoped reviews per the split-tight-scope default (surface 1: helpers/plugin/fixtures/child; surface 2: config/meta-tests/specs/workflow), both REVIEWER ONLY with the §1.1 table.

---

## Execution notes

- Project membership of the new tests: `tests/ci/**` and `tests/scripts/**` are NOT in `PARALLEL_TEST_GLOBS` (`vitest.projects.ts:64`), so they land in the serial project via `BASE_INCLUDE` (`vitest.projects.ts:34`) — same home as the existing `tests/ci/_metaE2eWorkflowCoverage.test.ts`. Cost note: the detector spawns three `playwright --list` children (~1-2 s each) in the serial leg; if `unit-suite` timing objects, the three resolutions can share one `beforeAll` cache — they already do in the A4 design.
- Plan adversarial review precedes ALL implementation. Repair rounds class-sweep.
- Review briefs: REVIEWER ONLY line, fresh-eyes posture, spec §1.1 do-not-relitigate table, verified citations (grep every file:line before dispatch).
- If `standalone-e2e` timing degrades from the json reporter, record the delta in the PR body rather than silently absorbing it.
