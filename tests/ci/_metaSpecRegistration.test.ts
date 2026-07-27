/**
 * tests/ci/_metaSpecRegistration.test.ts
 *
 * Guards from spec docs/superpowers/specs/ci/2026-07-26-ci-dark-descoped-closeout-design.md:
 *
 *   §4.1 — the standalone config's json reporter is pinned by OBSERVATION
 *   (child-process evaluation, the _standaloneConfigProbe posture), and the
 *   committed baseline (files + totalTests) must equal the local `--list`
 *   resolution — the unit-suite tripwire that forces a regen whenever
 *   standalone membership changes.
 *
 *   Tasks A3/A4 extend this file with the workflow structural pinning and the
 *   registration detector.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { BASE_INCLUDE, MUTATION_TEST_GLOBS, PARALLEL_TEST_GLOBS } from "../../vitest.projects";
import { probeConfig } from "./_standaloneConfigProbe";

const ROOT = process.cwd();
// Playwright resolves a reporter's relative `outputFile` against the CONFIG
// directory, not the invocation cwd (playwright 1.59.1
// lib/reporters/base.js `resolveOutputFile`: `path.resolve(options.configDir,
// options.outputFile)`). The config lives in tests/e2e/, so the literal must
// climb to the repo root — a bare "test-results/standalone-report.json" lands
// at tests/e2e/test-results/ and the CI comparator (zero-args default: cwd's
// test-results/) dies ENOENT, which is exactly how the first real Actions run
// of the comparison step failed.
const JSON_OUTPUT = "../../test-results/standalone-report.json";

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

  it("reporter output path pinned by OBSERVATION: a real --list run writes the comparator's exact read path", () => {
    // A Node-side `resolve(CONFIG_DIR, outputFile)` assertion only MODELS
    // playwright's configDir-relative resolution: with the dependency on a
    // caret range, a playwright update changing resolution semantics would
    // leave a modelled pin green while re-splitting the reporter/comparator
    // path pair. Observe instead: run the config's OWN reporters (no
    // --reporter override) under --list — the json reporter writes its
    // outputFile even when nothing executes — and require the file to land at
    // the exact path the comparator's zero-args branch reads. Ambient
    // PLAYWRIGHT_* is stripped so a dev-shell export cannot redirect the
    // write; CI carries none by the sweep in the workflow describe below.
    const target = resolve(ROOT, "test-results", "standalone-report.json");
    rmSync(target, { force: true });
    const env = { ...process.env };
    for (const k of Object.keys(env)) if (k.startsWith("PLAYWRIGHT_")) delete env[k];
    execFileSync(
      "pnpm",
      ["exec", "playwright", "test", "--config", "tests/e2e/standalone.config.ts", "--list"],
      { cwd: ROOT, stdio: "pipe", timeout: 180_000, env },
    );
    expect(existsSync(target), `json reporter did not write ${target}`).toBe(true);
    const written = JSON.parse(readFileSync(target, "utf8"));
    expect(written.config?.rootDir).toBeDefined();
  }, 180_000);

  it("committed baseline matches the local --list resolution (forces regen on membership change)", () => {
    execFileSync("node", [join(ROOT, "scripts/check-standalone-baseline.mjs"), "--list-check"], {
      cwd: ROOT,
      stdio: "pipe",
      timeout: 180_000,
    });
  }, 120_000);
});

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
    const on = wf.on as Record<string, unknown> | undefined;
    expect(on, "workflow must keep a pull_request trigger").toBeDefined();
    expect(Object.prototype.hasOwnProperty.call(on ?? {}, "pull_request")).toBe(true);
    const pr = (on ?? {})["pull_request"];
    // null (bare key) is the ONLY non-object acceptable form; booleans and
    // arrays are malformed/disabled triggers and must FAIL.
    const bare =
      pr === null ||
      (typeof pr === "object" &&
        pr !== undefined &&
        !Array.isArray(pr) &&
        Object.keys(pr).length === 0);
    expect(bare, "pull_request trigger must be bare (no filters, not disabled)").toBe(true);
    for (const k of ["needs", "strategy", "continue-on-error", "environment", "defaults"]) {
      expect(job).not.toHaveProperty(k);
    }
    expect(wf).not.toHaveProperty("defaults");
  });

  it("no env: at any level, and no PLAYWRIGHT_* text anywhere (reporter-path integrity)", () => {
    // PLAYWRIGHT_JSON_OUTPUT_FILE takes precedence over the config's
    // outputFile and resolves from the CWD (1.59.1 lib/reporters/base.js,
    // resolveFromEnv before the configDir branch), so an env block anywhere
    // in this workflow could re-split the reporter/comparator path pair the
    // resolution pin above guards. Step-level env on the two pinned steps is
    // already forbidden; this closes the workflow- and job-level routes, and
    // the raw-text sweep catches an override smuggled through any other step.
    expect(wf).not.toHaveProperty("env");
    for (const j of Object.values(wf.jobs as Record<string, unknown>)) {
      expect(j).not.toHaveProperty("env");
    }
    for (const s of steps) expect(s).not.toHaveProperty("env");
    const raw = readFileSync(join(ROOT, ".github/workflows/standalone-e2e.yml"), "utf8");
    expect(raw).not.toMatch(/PLAYWRIGHT_/);
    // The workflow-file sweep cannot see a LOCAL COMPOSITE ACTION exporting
    // PLAYWRIGHT_JSON_OUTPUT_FILE through GITHUB_ENV at runtime: `uses:
    // ./.github/actions/setup` executes file content this workflow never
    // textually contains. Sweep every file under .github/actions so any local
    // action the workflow uses now or later stays PLAYWRIGHT_-free too.
    for (const p of walkFiles(join(ROOT, ".github", "actions"))) {
      expect(
        readFileSync(p, "utf8"),
        `${relative(ROOT, p)} must not touch PLAYWRIGHT_ (GITHUB_ENV route into the pinned steps)`,
      ).not.toMatch(/PLAYWRIGHT_/);
    }
  });
});

/**
 * §3.1 — registration by observation. The universe is Playwright's OWN
 * default matcher (installed 1.59.1, common/config.js:164) restricted to its
 * two name families, MINUS exactly the pair the Vitest include globs claim
 * (test.ts / test.tsx run in unit-suite; three live instances sit under
 * tests/e2e today). Membership comes from `--list` on each config —
 * observation, never a model of harness shape: page.setContent harnesses,
 * data: navigation, and every future shape are covered identically because
 * the detector never inspects a spec at all.
 */
const CONFIGS = [
  "playwright.config.ts",
  "tests/e2e/standalone.config.ts",
  "playwright.screenshots.config.ts",
  "tests/e2e/visual.config.ts",
] as const;

export const DARK_SPEC_ALLOWLIST: Record<string, string> = {
  "tests/e2e/packlist-rescan-recovery.spec.ts": "BL-HARNESS-PACKLIST-SERVER-GRAPH",
};

/** Playwright's own default matcher (config.js:164), both name families. */
const PW_TEST_FILE = /\.(?:spec|test)\.(?:c|m)?[jt]sx?$/;
/** The exact pair the Vitest include globs claim; drift-tied below. */
const VITEST_CLAIMED = /\.test\.tsx?$/;

const WALK_SKIP = new Set([".git", "node_modules", "test-results", ".next", "playwright-report"]);

/** Recursive readdirSync walk (the _metaMutationSurfaceObservability pattern). */
function walkFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (WALK_SKIP.has(entry.name)) continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(p));
    else out.push(p);
  }
  return out;
}

function probeEnv(config: string): NodeJS.ProcessEnv {
  const { SECTION_HEADER_VISUAL_CONTAINER: _ambient, ...stripped } = process.env;
  return config === "tests/e2e/visual.config.ts"
    ? { ...stripped, SECTION_HEADER_VISUAL_CONTAINER: "1" }
    : stripped;
}

function resolvedFiles(config: string): Set<string> {
  const out = execFileSync(
    "pnpm",
    ["exec", "playwright", "test", "--config", config, "--list", "--reporter=json"],
    {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 180_000,
      maxBuffer: 64 * 1024 * 1024,
      encoding: "utf8",
      // visual.config.ts refuses to LOAD on a bare host (its byte-pinned
      // baselines are container-only; tests/e2e/visual.config.ts:25). --list
      // executes nothing and compares no bytes, so satisfying the gate FOR
      // THAT CONFIG ONLY keeps membership observation total without weakening
      // the run-time refusal. Every other config probes with the marker
      // STRIPPED (not merely un-set: an ambient export would leak in through
      // process.env): membership observed here must match what the config's
      // real invocation sees, and none of the other invocations carry the
      // marker — a config that conditioned membership on it would otherwise
      // appear registered while running dark.
      env: probeEnv(config),
    },
  );
  const json = JSON.parse(out.slice(out.indexOf("{")));
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
  }, 300_000);

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
    // The VITEST_CLAIMED subtraction is sound iff the serial include set still
    // claims exactly tests/**/*.test.{ts,tsx}. Pin BASE_INCLUDE VERBATIM, and
    // keep a suffix-claim sweep over the other glob families
    // (tests/sample.test.ts, a literal PARALLEL member, ends in .test.ts and passes).
    expect(BASE_INCLUDE).toEqual(["tests/**/*.test.ts", "tests/**/*.test.tsx"]);
    const globs = [...PARALLEL_TEST_GLOBS, ...MUTATION_TEST_GLOBS];
    const offenders = globs.filter(
      (g) => !(g.endsWith(".test.ts") || g.endsWith(".test.tsx") || g.endsWith(".test.{ts,tsx}")),
    );
    expect(
      offenders,
      "a Vitest glob now claims a non-ts test shape; re-derive VITEST_CLAIMED",
    ).toEqual([]);
  });

  it("config-set tripwire: invocation census + filename belt both equal the known config set", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    const texts: string[] = Object.values(pkg.scripts as Record<string, string>);
    const wfDir = join(ROOT, ".github", "workflows");
    for (const wfPath of readdirSync(wfDir).filter(
      (f) => f.endsWith(".yml") || f.endsWith(".yaml"),
    )) {
      const doc = parse(readFileSync(join(wfDir, wfPath), "utf8"));
      for (const j of Object.values(
        (doc.jobs ?? {}) as Record<string, { steps?: Array<{ run?: string }> }>,
      )) {
        for (const step of j.steps ?? []) if (typeof step.run === "string") texts.push(step.run);
      }
    }
    const invoked = new Set<string>();
    for (const raw of texts) {
      // Normalize shell line continuations so a multiline invocation reads as
      // one line, then split each line on SHELL separators — [;&|]+ covers
      // `;`, `|`, `&&`, `||`, AND a single `&` (background job), any of which
      // starts a new invocation — so a compound line contributes every
      // invocation it carries, not just the first. The config flag must parse
      // in EVERY form playwright's commander accepts — `--config PATH`,
      // `--config=PATH`, `-c PATH`, `-c=PATH`, and the attached short form
      // `-cPATH` (verified against the installed playwright: -cPATH lists the
      // full standalone suite) — because any unparsed form records the segment
      // as the default config, a fail-open census row that set equality can
      // never catch. `(?:^|\s)` anchors the flag to a token boundary so `-c`
      // inside a word or another flag cannot match.
      for (const line of raw.replace(/\\\n/g, " ").split("\n")) {
        for (const segment of line.split(/[;&|]+/)) {
          if (!/\bplaywright\s+test\b/.test(segment)) continue;
          const m = segment.match(/(?:^|\s)(?:--config(?:=|\s+)|-c(?:=|\s+)?)(\S+)/);
          invoked.add(m?.[1] ?? "playwright.config.ts");
        }
      }
    }
    expect([...invoked].sort()).toEqual([...CONFIGS].sort());

    const belt = walkFiles(ROOT)
      .map((p) => relative(ROOT, p).split(sep).join("/"))
      .filter((p) => /(^|\/)playwright[^/]*\.config\.[^/]+$/.test(p))
      .sort();
    expect(belt).toEqual(["playwright.config.ts", "playwright.screenshots.config.ts"]);
  });
});
