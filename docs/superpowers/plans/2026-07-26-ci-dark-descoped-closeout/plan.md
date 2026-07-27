# CI-Dark Descoped Items Close-Out — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the four descoped CI-dark backlog items (plus the env-narrowing ceiling) with observation-based guards and a directive-based harness resolver, shipped as three PRs.

**Architecture:** Three independent PRs. PR-A adds two guards over Playwright config membership (a registration detector unioning all three configs, and a committed baseline compared against the CI run's own JSON report). PR-B proves every `ENV_BOUND_EXCLUDES` entry executes somewhere, using the runner as the oracle. PR-C replaces path-heuristic/regex server-module stubbing with one shared `"use server"`-directive esbuild plugin (TypeScript-parse, cooked-text, zero-diagnostics) and restores the packlist spec to CI.

**Tech Stack:** vitest, Playwright `--list`/JSON reporter, esbuild JS API (child `node` scripts), TypeScript compiler API, YAML parsing via the existing `tests/ci/_workflowCoverageScan.ts` machinery.

**Spec (canonical):** `docs/superpowers/specs/ci/2026-07-26-ci-dark-descoped-closeout-design.md` — adversarially APPROVED at R8 (verdicts 12/5/7/2/1/2/1/0 findings). Where this plan and the spec disagree, the spec wins.

## Global Constraints

- Every task follows TDD: failing test → minimal implementation → passing test → commit (AGENTS.md invariant 1); one conventional-commit per task (invariant 6, scope `ci`, `e2e`, or `infra`).
- All work in isolated worktrees off `origin/main` (invariant 11). PR-A continues in `/Users/ericweiss/FX-worktrees/ci-dark-descoped` (branch `feat/ci-dark-descoped-guards`, already carries the spec). PR-B and PR-C each get a fresh worktree created at their start.
- The `standalone-e2e.yml` run literal stays byte-identical: `pnpm exec playwright test --config tests/e2e/standalone.config.ts` (`WHOLE_CONFIG_RE` at `tests/ci/_workflowCoverageScan.ts:74`).
- Playwright's default test-file matcher, embedded where the spec requires it: `**/*.@(spec|test).?(c|m)[jt]s?(x)` (verified at the installed playwright 1.59.1 common/config.js line 164).
- Counts (30 standalone files / 423 tests, 62 default, 7 screenshots, 91 disk) are provenance from 2026-07-26 and WILL be stale at implementation time (PR #616 added tests/e2e/screenshots-gallery-capture.spec.ts already). Every guard derives membership at runtime; the committed baseline is regenerated, never hand-copied.
- PR sequencing: PR-A first (its baseline test forces PR-C's baseline regen). #613 merged 2026-07-27, so PR-B has no remaining external dependency. PR-B and PR-C are independent of each other.
- No writes to any other session's worktrees. The autonomous pipeline gates (whole-diff cross-model review → real CI green → merge → ff main to `0 0`) close each PR.
- Em-dash ban applies to user-visible copy only; these are tests/scripts/docs — not applicable. No UI files are touched (impeccable gate not applicable).

## Meta-test inventory (declared per docs/agents/writing-plans.md)

**Creates:** tests/ci/\_metaSpecRegistration.test.ts (PR-A), tests/scripts/checkStandaloneBaseline.test.ts (PR-A), tests/ci/\_metaEnvBoundExclusionCoverage.test.ts (PR-B), tests/scripts/runExcludedTest.test.ts (PR-B), tests/e2e/helpers/useServerDirectivePlugin.test.ts (PR-C).
**Extends:** `tests/ci/_metaE2eWorkflowCoverage.test.ts` (row edits, PR-A/PR-C), `tests/e2e/_metaLiveEntryToolchain.test.ts` (child-script move + exemption text, PR-C), `tests/ci/_standaloneConfigProbe.ts` (reporter observation, PR-A).
**Registry rows:** none of the AGENTS.md invariant-9/10 registries apply — no Supabase call sites, no mutation surfaces (declared: none applies because the diff is tests, scripts, workflow steps, and one Playwright config reporter entry).
**Advisory locks:** not touched.

## File structure

```
scripts/check-standalone-baseline.mjs        PR-A  compare committed baseline vs run report; --write regen
tests/e2e/standalone-baseline.json           PR-A  { "files": [...], "totalTests": N }
tests/scripts/checkStandaloneBaseline.test.ts PR-A behavioral rejection tests (4 classes + pass)
tests/ci/_metaSpecRegistration.test.ts       PR-A  universe walk + tri-config union + tripwire + baseline==local + workflow pinning
.github/workflows/standalone-e2e.yml         PR-A  post-run comparison step
tests/e2e/standalone.config.ts               PR-A  add json reporter (and PR-C: testMatch member)
tests/ci/_standaloneConfigProbe.ts           PR-A  expose evaluated reporter
scripts/run-excluded-test.mjs                PR-B  vitest child + JSON report oracle
tests/scripts/runExcludedTest.test.ts        PR-B  behavioral rejection tests (5 classes + pass) + alias pin
tests/ci/_metaEnvBoundExclusionCoverage.test.ts PR-B registry totality + workflow qualification
vitest.projects.ts                           PR-B  ENV_BOUND_EXCLUDES shrinks; ENV_BOUND_COVERAGE_REGISTRY added
.github/workflows/x-audits.yml               PR-B  x5 gains the verbatim run-excluded step
tests/admin/test-auth-gate.test.ts           PR-B  unchanged content; exclusion row deleted
tests/e2e/helpers/useServerDirectivePlugin.mjs PR-C shared plugin: parse, directive, stub, zero-diagnostics
tests/e2e/helpers/_bundleLiveEntryChild.mjs  PR-C  esbuild.build + plugin, argv contract
tests/e2e/helpers/liveEntryToolchain.ts      PR-C  execFileSync target: node child script
tests/e2e/helpers/useServerDirectivePlugin.test.ts PR-C fixtures (a)-(h)
tests/e2e/helpers/__fixtures__/directive/*   PR-C  one fixture module per contract case
tests/e2e/_step3ReviewModalBundle.mjs        PR-C  regex useServerElision deleted; imports shared plugin
tests/e2e/_metaLiveEntryToolchain.test.ts    PR-C  assertions re-pointed; exemption text rewritten
tests/e2e/packlist-rescan-recovery.spec.ts   PR-C  bundleLiveEntry gains node:crypto alias
BACKLOG.md + parent spec                     A/B/C close-out edits per PR
```

---

# PR-A — registration detector + run-report baseline

Branch `feat/ci-dark-descoped-guards` in `/Users/ericweiss/FX-worktrees/ci-dark-descoped` (exists; spec committed; `pnpm install`, `worktree:link-env`, `preflight` already done).

### Task A1: check-standalone-baseline script, behaviorally pinned

**Files:**
- Create: scripts/check-standalone-baseline.mjs
- Test: tests/scripts/checkStandaloneBaseline.test.ts

**Interfaces:**
- Produces: CLI `node scripts/check-standalone-baseline.mjs --report <path>` (exit 0 iff report matches tests/e2e/standalone-baseline.json), `--write` (regenerate baseline from a local `--list` run), `--list-check` (exit 0 iff local `--list` resolution matches baseline — used by A4's meta-test via child process).
- Baseline shape: `{ "files": string[] (sorted, repo-relative posix), "totalTests": number }`.
- Report shape consumed: Playwright JSON reporter output — spec files are the set of `spec.file` values walked from `suites[]` recursively; total tests = count of spec entries (each spec = one test title; a spec with N projects appears N times as `tests[]` entries — count `tests[]` entries, matching what the run executes).

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

/** Run the script; return exit code (execFileSync throws on non-zero). */
function run(args: string[], env: Record<string, string> = {}): number {
  try {
    execFileSync("node", [SCRIPT, ...args], {
      cwd: ROOT,
      stdio: "pipe",
      env: { ...process.env, ...env },
    });
    return 0;
  } catch (e) {
    const status = (e as { status?: number }).status;
    return typeof status === "number" ? status : -1;
  }
}

/** Minimal Playwright-JSON-shaped report: one suite per file, one test per spec. */
function report(files: string[], testsPerFile: number): string {
  const dir = mkdtempSync(join(tmpdir(), "baseline-fixture-"));
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
  writeFileSync(p, JSON.stringify({ suites }));
  return p;
}

function baseline(files: string[], totalTests: number): string {
  const dir = mkdtempSync(join(tmpdir(), "baseline-file-"));
  const p = join(dir, "standalone-baseline.json");
  writeFileSync(p, JSON.stringify({ files: [...files].sort(), totalTests }));
  return p;
}

describe("check-standalone-baseline behavioral contract (spec §4.1)", () => {
  const A = "tests/e2e/a.spec.ts";
  const B = "tests/e2e/b.spec.ts";

  it("exits zero on a full match", () => {
    const bl = baseline([A, B], 4);
    expect(run(["--report", report([A, B], 2), "--baseline", bl])).toBe(0);
  });

  it("rejects a baseline spec the report lacks", () => {
    const bl = baseline([A, B], 4);
    expect(run(["--report", report([A], 2), "--baseline", bl])).not.toBe(0);
  });

  it("rejects a report spec the baseline lacks", () => {
    const bl = baseline([A], 2);
    expect(run(["--report", report([A, B], 2), "--baseline", bl])).not.toBe(0);
  });

  it("rejects matching files with a mismatched total test count", () => {
    const bl = baseline([A, B], 5);
    expect(run(["--report", report([A, B], 2), "--baseline", bl])).not.toBe(0);
  });

  it("rejects a missing report file", () => {
    const bl = baseline([A], 2);
    expect(run(["--report", "/nonexistent/report.json", "--baseline", bl])).not.toBe(0);
  });

  it("rejects a malformed report file", () => {
    const bl = baseline([A], 2);
    const dir = mkdtempSync(join(tmpdir(), "bad-report-"));
    const bad = join(dir, "report.json");
    writeFileSync(bad, "not json {");
    expect(run(["--report", bad, "--baseline", bl])).not.toBe(0);
  });
});
```

The `--baseline <path>` override exists so fixtures never touch the committed baseline; without the flag the script uses tests/e2e/standalone-baseline.json.

- [ ] **Step 2: Run to verify failure** — `pnpm vitest run tests/scripts/checkStandaloneBaseline.test.ts`. Expected: FAIL (script does not exist).

- [ ] **Step 3: Implement the script**

```js
// scripts/check-standalone-baseline.mjs
// Compares the standalone Playwright config's membership against the
// committed baseline (spec 2026-07-26-ci-dark-descoped-closeout §4).
//   --report <path>    compare a Playwright JSON reporter file (CI post-run step)
//   --list-check       compare a fresh local `--list` resolution (meta-test)
//   --write            regenerate the baseline from a local `--list` resolution
//   --baseline <path>  override baseline location (fixtures only)
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : (args[i + 1] ?? "");
};
const BASELINE = flag("--baseline") ?? join(ROOT, "tests/e2e/standalone-baseline.json");

function fail(msg) {
  console.error(`check-standalone-baseline: ${msg}`);
  process.exit(1);
}

function walkSuites(suites, files, counter) {
  for (const s of suites ?? []) {
    walkSuites(s.suites, files, counter);
    for (const spec of s.specs ?? []) {
      files.add(spec.file);
      counter.n += (spec.tests ?? []).length || 1;
    }
  }
}

function membership(json) {
  const files = new Set();
  const counter = { n: 0 };
  walkSuites(json.suites, files, counter);
  return { files: [...files].sort(), totalTests: counter.n };
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
        `  not in baseline: ${extra.join(", ") || "-"}\n  Regenerate with: node scripts/check-standalone-baseline.mjs --write`,
    );
  }
  if (actual.totalTests !== base.totalTests) {
    fail(
      `${label} total test count ${actual.totalTests} != baseline ${base.totalTests}. ` +
        `Regenerate with: node scripts/check-standalone-baseline.mjs --write`,
    );
  }
}

if (args.includes("--write")) {
  const m = listResolution();
  writeFileSync(BASELINE, `${JSON.stringify(m, null, 2)}\n`);
  console.log(`wrote ${BASELINE}: ${m.files.length} files, ${m.totalTests} tests`);
} else if (flag("--report") !== undefined) {
  let json;
  try {
    json = JSON.parse(readFileSync(flag("--report"), "utf8"));
  } catch (e) {
    fail(`cannot read report: ${e}`);
  }
  compare(membership(json), "run report");
} else if (args.includes("--list-check")) {
  compare(listResolution(), "local --list resolution");
} else {
  fail("usage: --report <path> | --list-check | --write [--baseline <path>]");
}
```

Note the fixture report format in Step 1 counts `tests[]` entries per spec; the standalone config has a single project, so spec count == executed-test count — but the counter reads `tests[].length` so a second project would be counted honestly.

- [ ] **Step 4: Run tests to verify pass** — `pnpm vitest run tests/scripts/checkStandaloneBaseline.test.ts`. Expected: PASS (6/6).

- [ ] **Step 5: Commit** — `git add scripts/check-standalone-baseline.mjs tests/scripts/checkStandaloneBaseline.test.ts && git commit -m "feat(ci): standalone baseline comparator, behaviorally pinned"`

### Task A2: json reporter in the standalone config + probe observation + committed baseline

**Files:**
- Modify: `tests/e2e/standalone.config.ts:88` (`reporter: "list"` today)
- Modify: `tests/ci/_standaloneConfigProbe.ts` (expose evaluated `reporter`)
- Create: tests/e2e/standalone-baseline.json (via `--write`)

**Interfaces:**
- Produces: config `reporter: [["list"], ["json", { outputFile: "test-results/standalone-report.json" }]]`; probe result gains `reporter: unknown` (the evaluated `config.reporter` value, JSON-serialized by the child).

- [ ] **Step 1: Write the failing test** — add to tests/ci/\_metaSpecRegistration.test.ts (created fully in A4; for TDD ordering this case starts the file):

```ts
// tests/ci/_metaSpecRegistration.test.ts (first case; A4 adds the rest)
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { probeConfig } from "./_standaloneConfigProbe";

const ROOT = process.cwd();

describe("standalone config json reporter (spec §4.1 structural pinning)", () => {
  it("declares the json reporter with the pinned outputFile, observed by evaluation", () => {
    const probe = probeConfig([], {}, true);
    const reporters = JSON.stringify(probe.reporter ?? "");
    expect(reporters).toContain("json");
    expect(reporters).toContain("test-results/standalone-report.json");
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm vitest run tests/ci/_metaSpecRegistration.test.ts`. Expected: FAIL (`probe.reporter` undefined — probe does not expose it; config has no json reporter).

- [ ] **Step 3: Implement** — in `_standaloneConfigProbe.ts`, add `reporter: unknown` to `ConfigProbe` and have the child process include `config.reporter` in its emitted JSON (same child-import mechanism the probe already uses; additive field, existing callers unaffected). In `standalone.config.ts` replace `reporter: "list"` with:

```ts
  reporter: [["list"], ["json", { outputFile: "test-results/standalone-report.json" }]],
```

- [ ] **Step 4: Run to verify pass**, then regenerate the baseline: `node scripts/check-standalone-baseline.mjs --write` and `node scripts/check-standalone-baseline.mjs --list-check` (exit 0). Also re-run the existing probe consumers: `pnpm vitest run tests/ci/`. Expected: all green.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(ci): json run report for the standalone config + committed baseline"`

### Task A3: post-run comparison step in standalone-e2e.yml, structurally pinned

**Files:**
- Modify: `.github/workflows/standalone-e2e.yml` (one step after the run step)
- Modify: tests/ci/\_metaSpecRegistration.test.ts (workflow pinning cases)

**Interfaces:**
- Consumes: A1's script, A2's report path.
- Produces: workflow step `run: node scripts/check-standalone-baseline.mjs --report test-results/standalone-report.json` — wait: the pinned literal per spec §4.1(a) is exactly `node scripts/check-standalone-baseline.mjs`; the script defaults `--report`? No — spec pins the literal `node scripts/check-standalone-baseline.mjs`. Resolution: the script, when invoked with NO arguments in CI, must default to `--report test-results/standalone-report.json`. Amend A1's script: the no-args branch becomes that default instead of usage-fail, and the usage error moves to unknown-flag handling. The A1 behavioral test adds one case: no-args with a missing default report exits non-zero.

- [ ] **Step 1: Write the failing workflow-pinning cases** (append to the registration meta-test):

```ts
import { readFileSync } from "node:fs";
import { parse } from "yaml";

describe("standalone-e2e.yml baseline step (spec §4.1 structural pinning)", () => {
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

  it("neither step carries step-level context (if/env/continue-on-error/shell/working-directory)", () => {
    for (const s of [steps[runIdx], steps[cmpIdx]]) {
      expect(s).toBeDefined();
      for (const k of ["if", "env", "continue-on-error", "shell", "working-directory"]) {
        expect(s ?? {}, `step must not carry ${k}`).not.toHaveProperty(k);
      }
    }
  });

  it("workflow trigger is bare pull_request; job carries no needs/matrix/continue-on-error/environment/defaults", () => {
    const pr = wf.on?.pull_request ?? wf[true]?.pull_request; // yaml lib may key `on` as boolean true
    expect(pr === null || pr === undefined || Object.keys(pr ?? {}).length === 0).toBe(true);
    for (const k of ["needs", "strategy", "continue-on-error", "environment", "defaults"]) {
      expect(job).not.toHaveProperty(k);
    }
    expect(wf).not.toHaveProperty("defaults");
  });
});
```

(The `wf[true]` fallback: YAML 1.1 parses bare `on:` as boolean `true` in some parsers; the implementer verifies which key the repo's `yaml` version produces and keeps ONE of the two accessors, deleting the other — do not ship the `??` guess.)

- [ ] **Step 2: Run to verify failure** — comparison step absent. Expected: FAIL.

- [ ] **Step 3: Implement** — in `standalone-e2e.yml`, directly after the run step:

```yaml
      - name: Compare the run's own report against the committed baseline
        run: node scripts/check-standalone-baseline.mjs
```

And in scripts/check-standalone-baseline.mjs, make the zero-args branch default to `--report test-results/standalone-report.json` (add the A1 test case first, watch it fail, then implement). Verify the scanner still qualifies the workflow: `pnpm vitest run tests/ci/_metaE2eWorkflowCoverage.test.ts` must stay green (the new step names no spec and carries no pipe).

- [ ] **Step 4: Run to verify pass** — `pnpm vitest run tests/ci/ tests/scripts/checkStandaloneBaseline.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit** — `git commit -am "feat(ci): pinned post-run baseline comparison in standalone-e2e"`

### Task A4: the registration detector

**Files:**
- Modify: tests/ci/\_metaSpecRegistration.test.ts (the main body)

**Interfaces:**
- Consumes: Playwright `--list --reporter=json` on the three configs: `playwright.config.ts` (default), `tests/e2e/standalone.config.ts`, `playwright.screenshots.config.ts`.
- Produces: `DARK_SPEC_ALLOWLIST` record (exported for PR-C to edit): `{ "tests/e2e/packlist-rescan-recovery.spec.ts": "BL-HARNESS-PACKLIST-SERVER-GRAPH" }`.

- [ ] **Step 1: Write the failing detector cases**

```ts
const CONFIGS = [
  "playwright.config.ts",
  "tests/e2e/standalone.config.ts",
  "playwright.screenshots.config.ts",
] as const;

export const DARK_SPEC_ALLOWLIST: Record<string, string> = {
  "tests/e2e/packlist-rescan-recovery.spec.ts": "BL-HARNESS-PACKLIST-SERVER-GRAPH",
};

/** Playwright's OWN default matcher (config.js:164), .spec/.test both sides. */
const PW_DEFAULT_MATCHER = /\.(?:spec|test)\.(?:c|m)?[jt]sx?$/;
/** Extensions the Vitest projects claim (vitest.projects.ts:34); excluded with a drift tie. */
const VITEST_CLAIMED = /\.test\.tsx?$/;

function resolvedFiles(config: string): Set<string> {
  const out = execFileSync(
    "pnpm",
    ["exec", "playwright", "test", "--config", config, "--list", "--reporter=json"],
    { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], timeout: 120_000 },
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
    const disk = globSync("tests/e2e/**/*", { cwd: ROOT, nodir: true })
      .map((p) => p.split(sep).join("/"))
      .filter((p) => PW_DEFAULT_MATCHER.test(p) && !VITEST_CLAIMED.test(p));
    const dark = disk.filter((p) => !union.has(p) && !(p in DARK_SPEC_ALLOWLIST));
    expect(dark, `unregistered specs (add to a config, or allowlist with a backlog ref): ${dark.join(", ")}`).toEqual([]);
  });

  it("no allowlist row shadows a resolved spec, and none is stale", () => {
    const shadowing = Object.keys(DARK_SPEC_ALLOWLIST).filter((p) => union.has(p));
    const stale = Object.keys(DARK_SPEC_ALLOWLIST).filter((p) => !existsSync(join(ROOT, p)));
    expect(shadowing).toEqual([]);
    expect(stale).toEqual([]);
  });

  it("drift tie: the Vitest project globs still claim exactly .test.ts/.test.tsx", () => {
    // Value import, not source scan (observe-the-module discipline).
    // PARALLEL_TEST_GLOBS + the serial include set cover tests/** with .test.{ts,tsx} suffixes.
    const suffixes = new Set(
      [...PARALLEL_TEST_GLOBS, ...SERIAL_TEST_GLOBS].map((g) => g.slice(g.lastIndexOf(".test."))),
    );
    expect([...suffixes].sort()).toEqual([".test.{ts,tsx}"]);
  });

  it("config-set tripwire: invocation census + filename belt both equal the known trio", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    const texts: string[] = Object.values(pkg.scripts as Record<string, string>);
    for (const wf of globSync(".github/workflows/*.yml", { cwd: ROOT })) {
      const doc = parse(readFileSync(join(ROOT, wf), "utf8"));
      for (const job of Object.values((doc.jobs ?? {}) as Record<string, { steps?: Array<{ run?: string }> }>)) {
        for (const step of job.steps ?? []) if (typeof step.run === "string") texts.push(step.run);
      }
    }
    const invoked = new Set<string>();
    for (const t of texts) {
      for (const m of t.matchAll(/playwright test(?:.*?)(?:--config|-c)[ =](\S+)/g)) {
        if (m[1] !== undefined) invoked.add(m[1]);
      }
      if (/playwright test(?!.*(?:--config|-c)[ =])/.test(t)) invoked.add("playwright.config.ts");
    }
    expect([...invoked].sort()).toEqual([...CONFIGS].sort());

    const belt = globSync("**/playwright*.config.*", { cwd: ROOT, ignore: ["node_modules/**", "**/node_modules/**"] })
      .map((p) => p.split(sep).join("/"))
      .sort();
    expect(belt).toEqual(["playwright.config.ts", "playwright.screenshots.config.ts"]);
  });
});
```

Implementation notes the engineer must follow: `SERIAL_TEST_GLOBS` is whatever `vitest.projects.ts` actually exports for the serial include set — verify the export name by reading the file (the drift-tie assertion is written against real exports, adjust the property access, NOT the assertion's meaning). The suffix-derivation in the drift tie must fail loudly if a glob does not end in a `.test.` suffix pattern (that IS the drift being detected). `globSync` comes from the repo's existing glob dependency — check `package.json` and use the same import other meta-tests use (e.g. how `tests/log/_metaMutationSurfaceObservability.test.ts` walks the filesystem) rather than adding a dependency.

- [ ] **Step 2: Run to verify failure** — Expected: FAIL naming `tests/e2e/report-modal.spec.ts` (in no config, not allowlisted). This failure is the live instance from spec §2.1 — it is the detector working.

- [ ] **Step 3: The report-modal disposition (spec §3.2).** Primary branch: boot a dev server (`pnpm dev`, port 3000) and run `pnpm exec playwright test report-modal --config playwright.config.ts --list` — it resolves nothing today (member of no project), so first add its `testMatch` branch to the default-config project that carries the crew app-dependent specs (read `playwright.config.ts:63` / `playwright.config.ts:77` and add `report-modal` to the alternation that already carries crew-page specs). Then run the spec against the dev server: `pnpm exec playwright test report-modal`. If GREEN: keep the registration, keep the `UNSEEN` row at `tests/ci/_metaE2eWorkflowCoverage.test.ts:85` (its premise is now true). If RED for reasons that are not quick fixture drift: revert the registration, move the file into `DARK_SPEC_ALLOWLIST` with a NEW backlog entry `BL-E2E-REPORT-MODAL-UNRUNNABLE` recording the measured failure output, and file that entry in BACKLOG.md in this commit. Either branch ends with Step 4 green.

- [ ] **Step 4: Run to verify pass** — `pnpm vitest run tests/ci/_metaSpecRegistration.test.ts`. Expected: PASS.

- [ ] **Step 5: AC-1 mutation check** (spec §8 AC-1, three temp files): create tests/e2e/zz-mutation.spec.ts, tests/e2e/zz-mutation.spec.cts, tests/e2e/zz-mutation.test.mjs (each containing `import { test } from "@playwright/test"; test("x", () => {});`), re-run the detector, confirm THREE failures naming the three files, delete them, re-run green. Record the transcript in the PR body.

- [ ] **Step 6: Commit** — `git commit -am "feat(ci): spec registration detector over all three Playwright configs"`

### Task A5: CI-side mutation verification + close-out docs

- [ ] **Step 1: Push the branch** (`git push -u origin feat/ci-dark-descoped-guards`) and confirm `standalone-e2e` goes green on the PR (this exercises report + comparison in the real environment).
- [ ] **Step 2: AC-2 mutation (spec §8 AC-2):** create scratch branch `scratch/ci-dark-ac2-mutation` off the PR head; edit `tests/e2e/standalone.config.ts` to add `grep: process.env.GITHUB_EVENT_NAME === "pull_request" ? /skeletonBandParity/ : undefined,` (the file-preserving narrowing class — under Actions PR events it narrows to one spec); push; `gh workflow run standalone-e2e.yml --ref scratch/ci-dark-ac2-mutation`; expect the run RED at the comparison step (report missing almost every baseline file). Attach the run URL to the PR body; delete the scratch branch. NOTE: `workflow_dispatch` does not set `GITHUB_EVENT_NAME=pull_request` — use `process.env.GITHUB_ACTIONS === "true" ? ... : undefined` for the scratch mutation instead, which manifests under ANY Actions run; that is the same locally-invisible class.
- [ ] **Step 3: Docs:** BACKLOG.md — mark `BL-CI-UNREGISTERED-SELF-CONTAINED-SPEC` and `BL-CI-ENV-DEPENDENT-CONFIG-NARROWING` ✅ RESOLVED with one-paragraph mechanism summaries citing the spec §3/§4 and the shipped test paths; parent spec `2026-07-26-ci-dark-coverage-design.md` §10b gains a two-line supersession note pointing at this spec §4. Run `pnpm spec:lint` on both edited docs.
- [ ] **Step 4: Commit** — `git commit -am "docs(ci): close the two PR-A backlog items; supersede the parent §10b ceiling"`

### Task A6: PR-A close-out gates

- [ ] Full local suite `pnpm test` (~16 min; NO path args — memory: path args do not filter); `pnpm typecheck` (both configs), `pnpm lint`, `pnpm format:check`.
- [ ] Whole-diff cross-model review via codex-guard (REVIEWER ONLY brief, fresh out dir, tree frozen during review) to APPROVE; repair rounds as needed with class-sweeps.
- [ ] Push; open PR (title `feat(ci): registration detector + run-report baseline for the standalone config`); real CI green including all twelve required contexts; `gh pr merge --merge`; ff main checkout; verify `git -C /Users/ericweiss/FX-Webpage-Template rev-list --left-right --count main...origin/main` == `0  0`.

---

# PR-B — vitest exclusion coverage

New worktree: `git worktree add -b feat/ci-dark-vitest-exclusion ../FX-worktrees/ci-dark-vitest-excl origin/main` (AFTER PR-A merges); `pnpm install && pnpm worktree:link-env && pnpm preflight`.

### Task B1: run-excluded-test script + alias, behaviorally pinned

**Files:**
- Create: scripts/run-excluded-test.mjs
- Modify: `package.json` (add `"run-excluded": "node scripts/run-excluded-test.mjs"` to scripts)
- Test: tests/scripts/runExcludedTest.test.ts

**Interfaces:**
- Produces: CLI `pnpm run-excluded <test-file>` — spawns `pnpm vitest run <file> --reporter=json --outputFile=<tmpfile>`; exits 0 IFF (child exit 0) AND (report shows ≥1 passed test) AND (0 failed). Test seam: env `RUN_EXCLUDED_CMD_OVERRIDE` replaces the spawned command line (fixtures substitute a stub that emits a canned report and exit code); the override is refused when `GITHUB_ACTIONS` is set, so CI always runs the real vitest.

- [ ] **Step 1: Write the failing behavioral test** — six cases mirroring A1's pattern (execFileSync, exit-code capture): (1) passing report + exit 0 → 0; (2) zero-passed report + exit 0 → non-zero; (3) all-skipped report (`numPassedTests: 0, numPendingTests: N`) + exit 0 → non-zero; (4) report with failures → non-zero; (5) missing/malformed report → non-zero; (6) **child exit 1 with a passing report → non-zero** (the R3-F5 class). Plus: (7) alias pin — `JSON.parse(readFileSync("package.json")).scripts["run-excluded"] === "node scripts/run-excluded-test.mjs"`. Fixture stubs: tiny `node -e` scripts written to a temp dir by the test, passed via `RUN_EXCLUDED_CMD_OVERRIDE`. Vitest JSON reporter fields to read: `numPassedTests`, `numFailedTests` (top level) — the implementer verifies against a real `vitest run --reporter=json` output on any quick file and uses those exact field names in both script and fixtures.
- [ ] **Step 2: Verify failure.**
- [ ] **Step 3: Implement the script** (~50 lines, mirror A1's structure: spawn, read report, three-condition gate, loud one-line failure naming which condition broke).
- [ ] **Step 4: Verify pass**, and run the real path once: `pnpm run-excluded tests/cross-cutting/email-canonicalization.test.ts` (local, TEST_DATABASE_URL linked → expect exit 0).
- [ ] **Step 5: Commit** — `feat(ci): run-excluded execution oracle`

### Task B2: the exclusion-coverage registry meta-test

**Files:**
- Modify: `vitest.projects.ts` (export `ENV_BOUND_COVERAGE_REGISTRY`)
- Create: tests/ci/\_metaEnvBoundExclusionCoverage.test.ts

**Interfaces:**
- Produces: `export const ENV_BOUND_COVERAGE_REGISTRY: Record<string, { workflow: string; job: string }> = { "tests/cross-cutting/email-canonicalization.test.ts": { workflow: ".github/workflows/x-audits.yml", job: "x5-email-canonicalization" } };` (dark-row shape `{ dark: true; backlogRef: string }` allowed by type but asserted ABSENT — a dark row is a red test naming the backlog ref).

- [ ] **Step 1: Failing test cases:** (1) totality — every `ENV_BOUND_EXCLUDES` entry (glob prefix `**/` stripped) has exactly one registry row and vice versa (stale check); (2) each `{workflow, job}` row: parsed YAML contains a step with `run:` EXACTLY `pnpm run-excluded <file>`; step has no `if:`/`continue-on-error`/`working-directory` and its run contains no `|`; (3) workflow qualification: bare `pull_request` key (no paths/paths-ignore/types/branches/branches-ignore); job-level `if:` absent or exactly `github.event_name != 'schedule'`; no `needs`, no `strategy`, no `continue-on-error`, no `environment`, no `defaults` at job or workflow level; (4) any `dark: true` row fails with a message quoting its `backlogRef`. Where the checks overlap `scanWorkflowCoverage`'s disqualifiers, call the exported helpers from `tests/ci/_workflowCoverageScan.ts:171` if their shapes fit; otherwise assert directly on parsed YAML (do NOT fork a second copy of the scanner — direct YAML assertions in this one test are fine, a wrapper module is not needed).
- [ ] **Step 2: Verify failure** (registry does not exist; and once it does, the x5 step does not exist yet → the workflow-step case fails).
- [ ] **Step 3: Implement:** registry export in `vitest.projects.ts`; the x5 step lands in B4 — for TDD ordering implement B4's workflow edit as part of this task's green step OR temporarily register only after B4; simplest: do B4's one-line workflow edit here (the step is meaningless without the alias from B1, which exists). Add to `.github/workflows/x-audits.yml` in the `x5-email-canonicalization` job, after the existing audit step:

```yaml
      - name: Prove the excluded email-canonicalization file executes here
        run: pnpm run-excluded tests/cross-cutting/email-canonicalization.test.ts
```

- [ ] **Step 4: Verify pass:** `pnpm vitest run tests/ci/_metaEnvBoundExclusionCoverage.test.ts`. Also confirm the x5 job's OTHER contract still holds: `pnpm vitest run tests/ci/` green. Skip audit (spec §6.1 honest ceiling): x5's steps carry no `TEST_DATABASE_URL` env (verified 2026-07-26: no `env:` on the audit step at `x-audits.yml:227-231`), so the three `livePsqlReachable` rows (`email-canonicalization.test.ts:313` and two siblings) SKIP in x5; the oracle still proves ≥1 passed. Record this in the test's header comment as the documented CI shape.
- [ ] **Step 5: Commit** — `feat(ci): exclusion-coverage registry with the runner as the oracle`

### Task B3: test-auth-gate returns to unit-suite

- [ ] **Step 1: Failing state:** delete `"**/tests/admin/test-auth-gate.test.ts"` from `ENV_BOUND_EXCLUDES` (`vitest.projects.ts:49`). Run `pnpm vitest run tests/ci/_metaEnvBoundExclusionCoverage.test.ts` — the stale-row check fails if a registry row for it exists (there is none — totality passes with the single email-canon row). Run the CI-shaped proof: `VITEST_EXCLUDE_ENV_BOUND=1 pnpm vitest run tests/admin/test-auth-gate.test.ts --project serial` — the file now RESOLVES (24 pass / 3 skip), where before this change the same command printed "No test files found".
- [ ] **Step 2: Stability run:** repeat the file 5× serverless (spec §6.2): `for i in 1 2 3 4 5; do VITEST_EXCLUDE_ENV_BOUND=1 pnpm vitest run tests/admin/test-auth-gate.test.ts --project serial || exit 1; done`. Session measurement already shows 3× at 0.7-1.6 s; this re-confirms post-edit. If flake appears (it did not locally), the fallback is spec §6.2's port-to-Playwright branch — STOP and re-plan that task; do not ship a flaky required-context member.
- [ ] **Step 3: Full serial-project run** (`VITEST_EXCLUDE_ENV_BOUND=1 pnpm vitest run --project serial`) to prove the returning file breaks nothing beside it.
- [ ] **Step 4: Commit** — `fix(ci): return test-auth-gate to unit-suite; its HTTP layer already self-skips`

### Task B4: PR-B docs + close-out gates

- [ ] BACKLOG.md: `BL-CI-VITEST-EXCLUSION-COVERAGE` ✅ RESOLVED (mechanism summary + test paths + the x5 skip-shape note). `pnpm spec:lint` on the edited doc.
- [ ] Same close-out gates as Task A6 (full suite, typecheck, lint, format, whole-diff review APPROVE, push, CI green — note `unit-suite` now runs test-auth-gate in every shard-set, watch its timing in the PR run — merge, ff to `0 0`).

---

# PR-C — directive resolver + packlist restore

New worktree: `git worktree add -b feat/ci-dark-directive-resolver ../FX-worktrees/ci-dark-resolver origin/main` (after PR-A merges; independent of PR-B); `pnpm install && pnpm worktree:link-env && pnpm preflight`.

### Task C1: the shared directive plugin, contract-tested

**Files:**
- Create: tests/e2e/helpers/useServerDirectivePlugin.mjs
- Create: `tests/e2e/helpers/__fixtures__/directive/` (one module per case)
- Test: tests/e2e/helpers/useServerDirectivePlugin.test.ts

**Interfaces:**
- Produces: `export function useServerDirectivePlugin(): import("esbuild").Plugin` and `export function analyzeModule(path, source): { directive: boolean; stub?: string; error?: string }` — `analyzeModule` is the pure core (parse → directive decision → stub source or error), the plugin is a thin `onLoad` wrapper; tests exercise BOTH (the pure core for cases, one real esbuild build for integration).
- Contract (spec §5.1-§5.2): TypeScript `createSourceFile` parse; directive = prologue `ExpressionStatement` string literal with cooked text `use server` (any quote/escape spelling); ZERO parse diagnostics required — any diagnostic on a directive module → `error`; supported exports: named async function declaration, named/anonymous default async function, `export const f = async …` (arrow or function expression); type-only exports ignored; EVERYTHING else → `error` naming the shape; no substring prefilter exists.

- [ ] **Step 1: Write the failing contract test** — fixtures and assertions, cases (a)-(h) from spec §5.5:

```
__fixtures__/directive/namedDecl.ts          "use server"; export async function f() {...}
__fixtures__/directive/defaultNamed.ts       "use server"; export default async function g() {...}
__fixtures__/directive/defaultAnon.ts        "use server"; export default async function () {...}
__fixtures__/directive/arrowConst.ts         "use server"; export const h = async () => {...}
__fixtures__/directive/fnExprConst.ts        "use server"; export const k = async function () {...}
__fixtures__/directive/typeOnly.ts           "use server"; export type T = { x: number };
__fixtures__/directive/singleQuote.ts        'use server'; export async function f() {...}
__fixtures__/directive/escapedSpace.ts       "use\x20server"; export async function f() {...}
__fixtures__/directive/noDirective.ts        export const plain = 1;
__fixtures__/directive/nestedString.ts       export const s = '"use server"'; // comment mentions "use server"
__fixtures__/directive/reexportFrom.ts       "use server"; export { f } from "./namedDecl";
__fixtures__/directive/starExport.ts         "use server"; export * from "./namedDecl";
__fixtures__/directive/aliasedLocal.ts       "use server"; async function f() {...}; export { f as g };
__fixtures__/directive/syncConst.ts          "use server"; export const n = 1;
__fixtures__/directive/classDecl.ts          "use server"; export class C {}
__fixtures__/directive/syncFn.ts             "use server"; export function s() {...}
__fixtures__/directive/octalEscape.ts        "use\040server"; export async function f() {...}   (diagnostic-bearing)
__fixtures__/directive/trailingGarbage.ts    "use server"; export async function f() {...}; @@@  (diagnostic-bearing)
```

Assertions per case: (a) six supported fixtures → `directive: true`, `stub` whose export names exactly match, stub functions THROW with a message containing the export name; typeOnly → stub `export {};` (empty module, not an error); (b) six unsupported fixtures → `error` naming the shape; (c)+(d) noDirective/nestedString → `directive: false`; (e) singleQuote → stubs; (g) escapedSpace → stubs (cooked text); (h) octalEscape + trailingGarbage → `error` (diagnostics). Integration: one esbuild `build()` over a tiny entry importing `namedDecl` with the plugin, assert the bundle contains the throw message and NOT the fixture body; mutation check — a plugin variant with stubbing disabled makes this integration assertion fail (implemented as: assert the bundle does NOT contain a sentinel string from the fixture body).

- [ ] **Step 2: Verify failure.** **Step 3: Implement** (the session prototype at scratchpad directive-resolver-prototype.mjs is the starting skeleton: extend directive detection to cooked-text + all quote/escape forms via `ts.isStringLiteral(st.expression) && st.expression.text === "use server"`, add `(sourceFile as { parseDiagnostics?: unknown[] }).parseDiagnostics?.length` zero-check, add the three extra supported shapes, drop the prefilter). **Step 4: Verify pass.** **Step 5: Commit** — `feat(e2e): shared use-server directive plugin (parse, cooked-text, zero-diagnostics)`

### Task C2: bundleLiveEntry moves to a plugin-capable child script

**Files:**
- Create: tests/e2e/helpers/\_bundleLiveEntryChild.mjs
- Modify: `tests/e2e/helpers/liveEntryToolchain.ts` (execFileSync target, `tests/e2e/helpers/liveEntryToolchain.ts:69`)
- Modify: `tests/e2e/_metaLiveEntryToolchain.test.ts`

**Interfaces:**
- Consumes: C1's plugin.
- Produces: child argv contract `node _bundleLiveEntryChild.mjs <entryAbs> <outFileAbs> <tsconfigAbs> <aliasesJson> <externalsJson>`; `bundleLiveEntry` signature and sync-void behavior UNCHANGED (spec §5.3). Child mirrors today's flags exactly: `bundle, format iife, jsx automatic, loader .tsx=tsx, define NODE_ENV, external node:fs+externals, alias map, tsconfig, banner window.process, outfile` — copied from `liveEntryToolchain.ts:73-85` — plus `plugins: [useServerDirectivePlugin()]`, with alias-covered specifiers skipped by the plugin (esbuild applies `alias` before `onLoad`, so this is automatic — verify with the crypto alias case in the existing bundle test).

- [ ] **Step 1: Failing state** — existing `tests/e2e/helpers/liveEntryToolchain.bundle.test.ts:14` must keep passing (it is the harness-contract regression net), plus a NEW case in it: bundling `_compactAlertCardLiveEntry.tsx` (which reaches `UseRawControlBoundary`? verify; if not, use a micro-entry fixture importing `namedDecl`-style directive module) produces a bundle containing the plugin's throw message. Write the case, watch it fail (CLI path has no plugin).
- [ ] **Step 2: Implement** child script + retarget `execFileSync("node", [CHILD, ...])`. `_metaLiveEntryToolchain.test.ts` edits: the helper still names no forbidden binary (esbuild moves from a CLI token to a JS import in the CHILD — confirm the guard's rule set treats imports as allowed for the helper family; extend its EXEMPT map with the child bundler script if the guard keys on file paths — read `tests/e2e/_metaLiveEntryToolchain.test.ts:37` and follow its existing exemption shape).
- [ ] **Step 3: Verify:** `pnpm vitest run tests/e2e/helpers/ tests/e2e/_metaLiveEntryToolchain.test.ts` green; then run TWO real harness specs end-to-end locally as the integration net: `pnpm exec playwright test --config tests/e2e/standalone.config.ts compact-alert-card-layout resolve-label-layout`. Expected: green (aliases still win; no behavior change for entries that never hit a directive module).
- [ ] **Step 4: Commit** — `refactor(e2e): bundleLiveEntry builds via a plugin-capable child, contract unchanged`

### Task C3: consolidate the step3 bundler onto the shared plugin

**Files:**
- Modify: `tests/e2e/_step3ReviewModalBundle.mjs` (delete regex useServerElision block starting at `tests/e2e/_step3ReviewModalBundle.mjs:51`; import C1's plugin; keep `emptyNodeBuiltins` and the argv contract at `tests/e2e/_step3ReviewModalBundle.mjs:41`)
- Modify: `tests/e2e/_metaLiveEntryToolchain.test.ts:37` exemption rationale text

- [ ] **Step 1:** Failing check first: add a case to the plugin contract test asserting `_step3ReviewModalBundle.mjs`'s source contains `useServerDirectivePlugin` and does NOT contain `LEADING_NONCODE` (the regex resolver's signature identifier) — this is a consolidation pin, red before the edit. (Source-scan is acceptable here: the property is "this file imports the shared module", a wiring fact, not a semantics fact.)
- [ ] **Step 2:** Implement the swap; run the spec that consumes it: `pnpm exec playwright test --config tests/e2e/standalone.config.ts step3-review-modal.interactions`. Expected: green.
- [ ] **Step 3: Commit** — `refactor(e2e): step3 bundler consumes the shared directive plugin; regex resolver class ends`

### Task C4: packlist restore

**Files:**
- Modify: `tests/e2e/packlist-rescan-recovery.spec.ts:69-72` (add `aliases: { "node:crypto": join(REPO_ROOT, "tests", "e2e", "_nodeCryptoStub.ts") }` — the `compact-alert-card-layout.spec.ts:67` precedent)
- Modify: `tests/e2e/standalone.config.ts:83` (add `packlist-rescan-recovery` to the testMatch alternation)
- Modify: tests/ci/\_metaSpecRegistration.test.ts (delete the `DARK_SPEC_ALLOWLIST` row)
- Modify: `tests/ci/_metaE2eWorkflowCoverage.test.ts:75` (delete the `LOCAL_ONLY_ALLOWLIST` row)
- Regenerate: tests/e2e/standalone-baseline.json (`--write`)

**Import-graph reality check FIRST (spec §5.4):** re-run the metafile measurement with the SHIPPED plugin (not the prototype): a scratch node script calling the child bundler on `_packListRescanLiveEntry.tsx` with `metafile: true`; assert zero inputs under `node_modules/googleapis`, `node_modules/postgres`, `node_modules/google-auth-library`. Session measurement (spec §2.6): 1908 inputs, 0 offending, 6 modules stubbed. If an offending input appears with the shipped plugin, STOP: trace the edge in the metafile; if it is a one-line import split in app code, fix it in this PR; otherwise keep the spec dark, keep both allowlist rows, file the metafile trace in BACKLOG.md, and descope this task (spec §5.4's explicit branch).

- [ ] **Step 1:** Detector red first: delete the `DARK_SPEC_ALLOWLIST` row → `_metaSpecRegistration` fails (spec unregistered). **Step 2:** Add the testMatch member + crypto alias; run the spec in a real browser: `pnpm exec playwright test --config tests/e2e/standalone.config.ts packlist-rescan-recovery`. Expected: green (S5 rescan flow drives UI only; the stubbed actions are never invoked — and if one ever is, the throw is the loud failure we want). **Step 3:** `node scripts/check-standalone-baseline.mjs --write`; delete the `LOCAL_ONLY_ALLOWLIST:75` row; full `pnpm vitest run tests/ci/` green. **Step 4:** Metafile assertion becomes a permanent case in the plugin contract test (bundle the packlist entry with metafile, assert the server-package criterion — this is AC-4's executable form). **Step 5: Commit** — `feat(e2e): packlist-rescan-recovery returns to CI under the directive resolver`

### Task C5: PR-C docs + close-out gates

- [ ] `liveEntryToolchain.ts:15-23` header rewritten: the "DELIBERATELY NOT a resolver policy" paragraph is replaced with the directive-rule contract and a pointer to the spec + plugin (the §1.1 ratified supersession).
- [ ] BACKLOG.md: `BL-HARNESS-RESOLVER-POLICY` and `BL-HARNESS-PACKLIST-SERVER-GRAPH` ✅ RESOLVED, citing the plugin contract, the measured metafile, and the consolidation (no regex directive detection remains under `tests/e2e/` — include the `rg -n "use.?server" tests/e2e --glob '*.mjs'` sweep output). Parent spec §10.1/§10.2 supersession notes.
- [ ] Same close-out gates as A6 (full suite, typecheck, lint, format, whole-diff review APPROVE — brief must include the REVIEWER ONLY line and the do-not-relitigate table — push, CI green, merge, ff to `0 0`).

---

## Execution notes

- Plan adversarial review (cross-model, mandatory) happens BEFORE any implementation task, per the pipeline. Repair rounds sweep the whole plan per finding class.
- Each PR's whole-diff review brief inlines: REVIEWER ONLY; fresh-eyes; the spec §1.1 do-not-relitigate table; the split-tight-scope rule if the diff exceeds a handful of files (PR-C likely: dispatch two scoped reviews — helpers/plugin surface, config/meta-test surface).
- If `standalone-e2e` CI timing degrades measurably from the json reporter (expected: negligible), that is a finding to record, not silently absorb.
- The `yaml` import in meta-tests: use the same YAML library `tests/ci/_workflowCoverageScan.ts` already uses (read its imports; do not add a new dependency).
