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
// The DETECTOR universe must align with Playwright's own collector, which
// hard-skips only node_modules and does not honor .gitignore — a test-shaped
// file under tests/e2e/test-results/ (or any artifact dir) is
// Playwright-visible and must not be excluded from the universe, or it could
// go dark undetected. Artifact noise that ever surfaces here reds the
// detector and gets a deliberate disposition, not a silent skip.
const DETECTOR_SKIP = new Set([".git", "node_modules"]);

/** Recursive readdirSync walk (the _metaMutationSurfaceObservability pattern). */
function walkFiles(dir: string, skip: Set<string> = WALK_SKIP): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(p, skip));
    else out.push(p);
  }
  return out;
}

/**
 * Invocation census core (pure — the fixtures `it` below pins every
 * adversarial form). Shell cannot be faithfully parsed by regex, so the
 * design is FAIL-CLOSED along two axes:
 *
 * 1. PLAIN lines (no quote, backslash, `$`, or backtick) are auto-classified:
 *    invocations are recognized only at COMMAND POSITION (optional env-var
 *    prefixes, optional `pnpm exec `/`npx `); within one the LAST config flag
 *    wins (commander semantics, empirically verified: bogus first --config +
 *    real second lists the full standalone suite); a `playwright test` token
 *    outside command position, a config flag orphaned from every recognized
 *    invocation (redirections re-splitting the line), or a heredoc in
 *    playwright-test-mentioning text is a loud problem.
 * 2. COMPLEX lines — any quote, backslash, `$`, or backtick on a line that
 *    mentions the word `playwright` at all — are NEVER auto-classified:
 *    quoting can hide a flag from any regex the classifier AND its orphan
 *    accounting share (`"--config=x"`), expansion can synthesize one at
 *    runtime ($VAR, $(...), backticks), and token construction can disguise
 *    the command word itself (`"playwright" test`). Each such line must
 *    appear VERBATIM (whitespace-normalized) in the registry with its
 *    human-declared config contributions; an unregistered complex line and a
 *    stale registry row are both loud problems.
 *
 * Package-script forwarding (`pnpm|npm|yarn|bun [run] <script> ... --config
 * other.ts` where <script> transitively invokes `playwright test`) composes
 * an invocation across two strings the per-string census cannot join, so a
 * forwarded config flag is a loud problem. Full-line comments never execute
 * and are skipped.
 */
export function censusInvocations(
  texts: string[],
  pwScriptNames: string[],
  complexRegistry: Record<string, readonly string[]> = {},
): { invoked: Set<string>; problems: string[] } {
  const invoked = new Set<string>();
  const problems: string[] = [];
  const configFlags = (s: string) => [
    ...s.matchAll(/(?:^|\s)(?:--config(?:=|\s+)|-c(?:=|\s+)?)(\S+)/g),
  ];
  const cmdPos = /^(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*(?:pnpm\s+exec\s+|npx\s+)?playwright\s+test\b/;
  const mentionsRe = /\bplaywright\s+test\b/;
  const complexRe = /['"\\$`]/;
  const normalize = (s: string) => s.trim().replace(/\s+/g, " ");
  const usedKeys = new Set<string>();
  const fwd =
    pwScriptNames.length > 0
      ? new RegExp(
          `\\b(?:pnpm|npm|yarn|bun)\\s+(?:run\\s+)?(?:${pwScriptNames
            .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
            .join("|")})(?:\\s|$)([^\\n]*)`,
        )
      : null;
  for (const raw of texts) {
    if (/\bplaywright\b/.test(raw) && raw.includes("<<")) {
      problems.push(`heredoc in a text mentioning playwright: ${raw.slice(0, 120)}`);
      continue;
    }
    for (const line of raw.replace(/\\\n/g, " ").split("\n")) {
      if (/^\s*#/.test(line)) continue;
      const forwarded = fwd?.exec(line);
      if (forwarded && configFlags(forwarded[1] ?? "").length > 0) {
        problems.push(`config flag forwarded through a package script: ${line.trim()}`);
        continue;
      }
      if (!/\bplaywright\b/.test(line)) continue;
      if (complexRe.test(line)) {
        const key = normalize(line);
        const declared = complexRegistry[key];
        if (declared === undefined) {
          problems.push(
            `complex shell construct (quote/backslash/$/backtick) on a playwright-mentioning ` +
              `line — declare it in the complex-invocation registry: ${key}`,
          );
        } else {
          usedKeys.add(key);
          for (const c of declared) invoked.add(c);
        }
        continue;
      }
      if (!mentionsRe.test(line)) continue;
      const lineFlagCount = configFlags(line).length;
      let consumed = 0;
      for (const segment of line.split(/[;&|]+/)) {
        const trimmed = segment.trim();
        if (!mentionsRe.test(trimmed)) continue;
        if (!cmdPos.test(trimmed)) {
          problems.push(`"playwright test" outside command position: ${trimmed}`);
          continue;
        }
        // A config-flag TOKEN is not always a config OPTION: after a bare
        // `--` terminator commander treats it as positional, a preceding bare
        // option (`--grep --config x`) may consume it as its value, and a
        // preceding redirection (`> --config x`) makes it a filename the
        // shell eats. Each of these silently loads the DEFAULT config while a
        // token-level scan records the named one — so all three are loud.
        if (/(?:^|\s)--(?:\s|$)/.test(trimmed) && configFlags(trimmed).length > 0) {
          problems.push(`config flag after a bare -- option terminator: ${trimmed}`);
          continue;
        }
        const flags = configFlags(segment);
        let neutralized = false;
        for (const m of flags) {
          const before = segment.slice(0, m.index ?? 0).trimEnd();
          const prevToken = before.slice(before.lastIndexOf(" ") + 1);
          if (/^--?[^=\s]+$/.test(prevToken) && !/^(?:--config|-c)/.test(prevToken)) {
            problems.push(
              `config flag may be consumed as the value of preceding bare option "${prevToken}": ${trimmed}`,
            );
            neutralized = true;
          } else if (/[<>]$/.test(prevToken)) {
            problems.push(`config flag is a redirection target, not an option: ${trimmed}`);
            neutralized = true;
          }
        }
        if (neutralized) {
          consumed += flags.length;
          continue;
        }
        consumed += flags.length;
        invoked.add(flags.at(-1)?.[1] ?? "playwright.config.ts");
      }
      if (consumed !== lineFlagCount) {
        problems.push(`config flag orphaned from every recognized invocation: ${line.trim()}`);
      }
    }
  }
  for (const key of Object.keys(complexRegistry)) {
    if (!usedKeys.has(key)) {
      problems.push(`stale complex-invocation registry row (no source line matches): ${key}`);
    }
  }
  return { invoked, problems };
}

// Hermetic probe environment: the probe's env must be a SUBSET of what every
// real invocation carries, or a config conditioned on probe-only state
// (Vitest worker vars, the unit-suite's GITHUB_* values, ambient dev-shell
// exports) could expose a spec to the detector's --list while the real
// invocation excludes it. Inheriting process.env hands the probe exactly that
// probe-only state, so it is rebuilt from a minimal allowlist instead; the
// visual-config load marker is the single deliberate addition. (A config
// branching on a variable only the real runner sets remains the ratified
// BL-CI-ENV-DEPENDENT-CONFIG-NARROWING acceptance, mitigated by the run-report
// comparator — this allowlist closes the OPPOSITE direction.)
const PROBE_ENV_ALLOWLIST = ["PATH", "HOME", "SHELL", "TMPDIR", "USER", "LOGNAME", "LANG"];

function probeEnv(config: string): NodeJS.ProcessEnv {
  const env = {} as NodeJS.ProcessEnv;
  for (const k of PROBE_ENV_ALLOWLIST) {
    const v = process.env[k];
    if (v !== undefined) env[k] = v;
  }
  if (config === "tests/e2e/visual.config.ts") env.SECTION_HEADER_VISUAL_CONTAINER = "1";
  return env;
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
    const disk = walkFiles(join(ROOT, "tests", "e2e"), DETECTOR_SKIP)
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

  /**
   * Complex-invocation registry: every source line that mentions the word
   * `playwright` AND carries a quote, backslash, `$`, or backtick, keyed by
   * its whitespace-normalized text, mapped to the configs the line's own
   * direct invocations contribute (script bodies reached via `pnpm <script>`
   * are censused separately from package.json, so wrapper lines declare []).
   * Fail-closed both ways: an unregistered complex line reds the census, and
   * a stale row (matching no source line) reds it too. When editing one of
   * these commands, update its row in the same commit.
   */
  const COMPLEX_INVOCATION_REGISTRY: Record<string, readonly string[]> = {
    'pnpm exec playwright test --reporter=list --project=desktop-chromium tests/e2e/admin-layout-dimensions.spec.ts -g "T-NOPHANTOM"':
      ["playwright.config.ts"],
    'pnpm exec playwright test --reporter=list --project=mobile-safari tests/e2e/crew-layout-dimensions.spec.ts -g "T-NOPHANTOM-CREW"':
      ["playwright.config.ts"],
    'pnpm exec playwright test --reporter=list --project=desktop-chromium tests/e2e/admin-layout-dimensions.spec.ts -g "width chain"':
      ["playwright.config.ts"],
    'pnpm exec playwright test --project=mobile-safari tests/e2e/admin-lifecycle-transitions.spec.ts -g "Published toggle round-trip" --repeat-each="$REPEATS" --retries=0 --trace=on':
      ["playwright.config.ts"],
    'docker run --rm --platform linux/amd64 --network host -v "$PWD:/work" -w /work -e CI=true mcr.microsoft.com/playwright:v1.59.1-jammy bash -lc "apt-get update && apt-get install -y postgresql-client && corepack enable && pnpm screenshot:help"':
      [],
    'git commit -m "test(infra): regen admin nav/settings screenshot baselines (amd64 CI runner)" -m "Regenerated from the pinned mcr.microsoft.com/playwright:v1.59.1-jammy image on a native-amd64 runner after the M12.2 B1 /admin chrome redesign (screenshots-regen workflow_dispatch job), so the bytes match the screenshots-drift gate capture environment."':
      [],
    'docker run --rm --platform linux/amd64 -v "$PWD:/work" -w /work -e CI=true -e SECTION_HEADER_VISUAL_CONTAINER=1 mcr.microsoft.com/playwright:v1.59.1-jammy bash -lc "corepack enable && pnpm exec playwright test --config tests/e2e/visual.config.ts tests/e2e/section-header-visual.spec.ts --update-snapshots"':
      ["tests/e2e/visual.config.ts"],
    'docker run --rm --platform linux/amd64 -v "$PWD:/work" -w /work -e CI=true -e SECTION_HEADER_VISUAL_CONTAINER=1 mcr.microsoft.com/playwright:v1.59.1-jammy bash -lc "corepack enable && pnpm exec playwright test --config tests/e2e/visual.config.ts tests/e2e/section-header-visual.spec.ts"':
      ["tests/e2e/visual.config.ts"],
    'git commit -m "test(admin): regen section-header visual baselines (amd64 CI runner)" -m "Regenerated from the pinned mcr.microsoft.com/playwright:v1.59.1-jammy image on a native-amd64 runner (section-header-visual-regen workflow_dispatch job), so the bytes match the section-header-visual gate capture environment. Push a validating commit to run the gate on these baselines."':
      [],
  };

  it("census core: adversarial forms either classify correctly or fail loud (never fail open)", () => {
    const c = (t: string, names: string[] = []) => censusInvocations([t], names);
    // Last config flag wins — commander semantics, empirically verified: a
    // bogus first --config followed by the real one lists the full suite.
    expect([...c("playwright test --config a.ts --config b.ts").invoked]).toEqual(["b.ts"]);
    // Attached short form + single-& compound (both R2 fail-open forms).
    expect([...c("playwright test -ca.ts & playwright test").invoked].sort()).toEqual([
      "a.ts",
      "playwright.config.ts",
    ]);
    // Env-var-prefixed command position is still command position.
    expect([...c("CI=1 FOO=bar playwright test -c x.ts").invoked]).toEqual(["x.ts"]);
    // A full-line comment never executes and contributes nothing.
    expect(c("# playwright test --config ghost.ts").invoked.size).toBe(0);
    expect(c("# playwright test --config ghost.ts").problems).toEqual([]);
    // Every construct the classifier cannot faithfully parse FAILS LOUD:
    expect(c("echo playwright test --config ghost.ts").problems).not.toEqual([]);
    expect(c("pnpm exec playwright test 2>&1 --config ghost.ts").problems).not.toEqual([]);
    expect(c("playwright test -g 'a|b' --config ghost.ts").problems).not.toEqual([]);
    expect(c("pnpm run test:e2e --config ghost.ts", ["test:e2e"]).problems).not.toEqual([]);
    expect(c("pnpm test:e2e --config=ghost.ts", ["test:e2e"]).problems).not.toEqual([]);
    expect(c("bash <<EOF\nplaywright test --config ghost.ts\nEOF").problems).not.toEqual([]);
    expect(c("playwright test tests/a.spec.ts \\; --config ghost.ts").problems).not.toEqual([]);
    // R4 families: quoting can hide a flag from the classifier AND its orphan
    // accounting; expansion synthesizes flags at runtime; token construction
    // disguises the command word; non-pnpm runners forward too. All loud.
    expect(c('playwright test --config a.ts "--config=ghost.ts"').problems).not.toEqual([]);
    expect(c("playwright test '-cghost.ts'").problems).not.toEqual([]);
    expect(c("playwright test $PWCFG").problems).not.toEqual([]);
    expect(c('playwright test "${ARGS[@]}"').problems).not.toEqual([]);
    expect(c("playwright test `cat cfg`").problems).not.toEqual([]);
    expect(c("playwright test --confi'g'=ghost.ts").problems).not.toEqual([]);
    expect(c('"playwright" test --config ghost.ts').problems).not.toEqual([]);
    expect(c("npm run test:e2e -- --config ghost.ts", ["test:e2e"]).problems).not.toEqual([]);
    expect(c("yarn test:e2e --config ghost.ts", ["test:e2e"]).problems).not.toEqual([]);
    expect(c("bun run test:e2e --config=ghost.ts", ["test:e2e"]).problems).not.toEqual([]);
    // A registered complex line contributes exactly its declared configs; a
    // stale registry row (matching no source line) is itself loud.
    const dockerLine =
      'docker run -e CI=true img bash -lc "pnpm exec playwright test --config x.ts"';
    const reg = censusInvocations([dockerLine], [], { [dockerLine]: ["x.ts"] });
    expect(reg.problems).toEqual([]);
    expect([...reg.invoked]).toEqual(["x.ts"]);
    expect(censusInvocations(["echo hi"], [], { [dockerLine]: ["x.ts"] }).problems).not.toEqual([]);
    // R5 families: a config-flag TOKEN neutralized by shell/commander context
    // (after a bare `--` terminator, consumed as a preceding bare option's
    // value, or a redirection target) loads the DEFAULT config at runtime —
    // each is loud AND never records the named config.
    for (const form of [
      "playwright test -- --config ghost.ts",
      "playwright test --grep --config ghost.ts",
      "playwright test > --config ghost.ts",
    ]) {
      expect(c(form).problems, form).not.toEqual([]);
      expect([...c(form).invoked], form).not.toContain("ghost.ts");
    }
    // Value-carrying predecessors (=-attached or already-consumed) do NOT
    // neutralize — the flag still classifies.
    expect(c("playwright test --project=x --config real.ts").problems).toEqual([]);
    expect([...c("playwright test --project=x --config real.ts").invoked]).toEqual(["real.ts"]);
    expect(c("playwright test --retries 0 --config real.ts").problems).toEqual([]);
    expect([...c("playwright test --retries 0 --config real.ts").invoked]).toEqual(["real.ts"]);
    // A bare -- with only positional args after it stays classifiable.
    expect(c("playwright test -- tests/a.spec.ts").problems).toEqual([]);
    expect([...c("playwright test -- tests/a.spec.ts").invoked]).toEqual(["playwright.config.ts"]);
    // Plain redirects with no config flag stay classifiable (default config).
    expect(c("playwright test > out.log 2>&1").problems).toEqual([]);
    expect([...c("playwright test > out.log 2>&1").invoked]).toEqual(["playwright.config.ts"]);
  });

  it("config-set tripwire: invocation census + filename belt both equal the known config set", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    const scripts = pkg.scripts as Record<string, string>;
    const texts: string[] = Object.values(scripts);
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
    // Transitive closure: a script whose body invokes another playwright-
    // wrapping script (via any runner) is itself playwright-wrapping — the
    // multi-hop forwarding route composes the same way the one-hop route does.
    const esc = (n: string) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pwScriptNames = Object.keys(scripts).filter((n) =>
      /\bplaywright\s+test\b/.test(scripts[n] ?? ""),
    );
    for (;;) {
      const re = new RegExp(
        `\\b(?:pnpm|npm|yarn|bun)\\s+(?:run\\s+)?(?:${pwScriptNames.map(esc).join("|")})(?:\\s|$)`,
      );
      const next = Object.keys(scripts).filter(
        (n) => !pwScriptNames.includes(n) && re.test(scripts[n] ?? ""),
      );
      if (next.length === 0) break;
      pwScriptNames.push(...next);
    }
    const { invoked, problems } = censusInvocations(
      texts,
      pwScriptNames,
      COMPLEX_INVOCATION_REGISTRY,
    );
    expect(
      problems,
      "shell constructs the census cannot faithfully classify — rewrite the invocation " +
        "or extend censusInvocations deliberately (fail-closed by design)",
    ).toEqual([]);
    expect([...invoked].sort()).toEqual([...CONFIGS].sort());

    const belt = walkFiles(ROOT)
      .map((p) => relative(ROOT, p).split(sep).join("/"))
      .filter((p) => /(^|\/)playwright[^/]*\.config\.[^/]+$/.test(p))
      .sort();
    expect(belt).toEqual(["playwright.config.ts", "playwright.screenshots.config.ts"]);
  });
});
