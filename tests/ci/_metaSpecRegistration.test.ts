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
import {
  ENV_KEY_ALLOWLIST,
  offAllowlistEnvKeys,
  usesKind,
  validRunsOn,
  validWorkflowShape,
  validatedCompositeSteps,
  type EnvKeyAllowlist,
} from "./_workflowCoverageScan";

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

// Empty: packlist-rescan-recovery returned to CI under the PR-C directive
// resolver (BL-HARNESS-PACKLIST-SERVER-GRAPH graduated). A row here means a spec
// resolves in NO Playwright config — register it in a config, or add a row with
// a backlog ref.
export const DARK_SPEC_ALLOWLIST: Record<string, string> = {};

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
 *    invocations are recognized only at COMMAND POSITION (optional `pnpm
 *    exec `/`npx ` runner prefixes — env-assignment prefixes are shell STATE
 *    and refused since R12); within one the LAST config flag
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
 * forwarded config flag is a loud problem — including through runner GLOBAL
 * options (`pnpm --silent test:e2e --config x`), which defeat the strict
 * forwarding regex: any line naming a runner AND a playwright-wrapping
 * script AND a config flag is loud. Full-line comments never execute and are
 * skipped.
 *
 * 3. RUNTIME-COMPOSED forms (R6): brace expansion (`--confi{g..g}`,
 *    `playwri{g..g}ht`), inline comments (hide trailing text from the shell
 *    but not from a token scan), backslash-newline continuation (joined
 *    faithfully — bash removes the pair without inserting a space — then
 *    refused auto-classification), alternate CLI entries
 *    (`node .../@playwright/test/cli.js test`), and glob-constructed command
 *    words (`.bin/playwrigh?`) all compose an invocation the literal scan
 *    cannot see. Each routes to the SAME complex-registry path as axis 2: a
 *    human-declared row classifies it, anything else is loud. The gate that
 *    feeds these checks matches the lowercase substring `playwr` (raw or
 *    after single-level brace reduction) — perfect obfuscation detection is
 *    impossible by the axiom above; the enumerated families are the ones
 *    review produced.
 */
/**
 * Every `run:` block a parsed GitHub YAML doc can execute: workflow jobs
 * (`jobs.*.steps[].run`) AND composite-action steps (`runs.steps[].run`).
 * One collector for both shapes so the census universe cannot silently
 * exclude local actions the workflows `uses:` (R7 F4 — the PLAYWRIGHT_
 * raw-text sweep already treats .github/actions as execution surface).
 * `guarded` marks a block whose step (or containing job) carries `if:` —
 * conditionally executed regardless of shell content (R9 G1).
 */
export type RunBlock = { run: string; guarded: boolean; poisoned: boolean };
type StepShape = { run?: unknown; if?: unknown; shell?: unknown; uses?: unknown; env?: unknown };
// bash and sh are the semantics the census models; any other shell
// reinterprets the block (R10 — `shell: python {0}` can discard it).
const customShell = (s: StepShape) =>
  s.shell !== undefined && !/^(?:bash|sh)$/.test(String(s.shell).trim());
/**
 * Cross-step env-state predicate (spec §2.0, BL-CI-GITHUB-ENV-CROSS-STEP-STATE
 * graduated): a step whose run text mentions GITHUB_ENV or GITHUB_PATH outside
 * full-line comments mutates the environment of every LATER step in the same
 * job — `echo "PATH=/fake:$PATH" >> "$GITHUB_PATH"` makes a textually clean
 * downstream `pnpm exec playwright test` run a fake pnpm that exits 0. No
 * write-shape grammar (>> vs > vs tee): distinguishing writes from reads is
 * shell modeling, the losing game; mention = poison, case-sensitive (the
 * runner exports exactly these names). Constructed-name evasions are the
 * ratified perfect-obfuscation-impossible axiom (spec §5 L2).
 */
/**
 * The env-file mention family (R31): the uppercase variables AND the
 * documented `github.env` / `github.path` context properties, which name
 * the same files — a step writing through either mutates every later
 * step in the job, so recognizing only the variables missed a real
 * charter-surface vector (not a constructed-name obfuscation). R32: GitHub
 * documents INDEX syntax as equivalent to property dereference, so
 * `github['env']` / `github["path"]` are first-class spellings too.
 */
const ENV_FILE_MENTION =
  // The quote class tolerates a leading backslash: the census and the
  // scanner both test JSON-serialized step values, where an inner quote
  // arrives escaped (`github[\\"path\\"]`).
  /GITHUB_ENV|GITHUB_PATH|github\s*(?:\.\s*(?:env|path)\b|\[\s*\\?['"](?:env|path)\\?['"]\s*\])/i;

const writesJobEnv = (text: string): boolean =>
  ENV_FILE_MENTION.test(
    text
      .split(/\r?\n/)
      .filter((l) => !/^[ \t]*#/.test(l))
      .join("\n"),
  );
export function runBlocksOf(
  doc: unknown,
  localActions: Record<string, unknown> = {},
  envKeyAllowlist: EnvKeyAllowlist = ENV_KEY_ALLOWLIST,
): RunBlock[] {
  const out: RunBlock[] = [];
  // Static-env spec §2.2: an off-allowlist (key, value) pair in a static
  // env: block. Scope decides the effect below — workflow root seeds every
  // job, job env seeds its job, a workflow run-step's env poisons its own
  // block only, and uses-/composite-step env poisons onward (LS3 coarse).
  const envDirty = (env: unknown): boolean => offAllowlistEnvKeys(env, envKeyAllowlist).length > 0;
  // A local action is walkable ONLY when it declares `using: composite` —
  // a javascript (node20/node16) or docker action has no runs.steps, and its
  // ENTRY CODE can mutate the caller's env (core.addPath /
  // core.exportVariable / direct env-file writes) with nothing for a YAML
  // walk to see. Spec R1 demonstrated the escaping mutant: presence in the
  // map is NOT "modeled". Non-composite => null => opaque, fail-closed.
  // R8: ONE shared validator with the scanner — the layers had drifted and
  // twelve invalid step shapes escaped one or both. An invalid manifest
  // fails the job at the use site, so downstream steps never run: null =>
  // opaque, fail-closed.
  const compositeStepsOf = (action: unknown): StepShape[] | null =>
    validatedCompositeSteps(action) as StepShape[] | null;
  // R11: the walker's own uses-branch routes through the SHARED classifier
  // too — treating any non-`./` value as neutral let a REFLESS remote ref
  // (which GitHub rejects before any step runs) pass silently here while the
  // scanner and the manifest profile both refused it. "invalid" poisons.
  const localRef = (s: StepShape): string | null =>
    usesKind(s.uses) === "local" ? (s.uses as string).trim() : null;
  /**
   * One walker for workflow jobs, spliced composite actions, and the
   * standalone composite-doc entry: per job, IN ORDER, an earlier
   * GITHUB_ENV/GITHUB_PATH write poisons every later block — and only this
   * job (env state does not cross jobs; over-poisoning forces reason-free
   * registry rows). A local composite action's steps execute in the CALLER's
   * job env, so they are spliced at the use site and poison flows BOTH
   * directions; nesting recurses (a composite may `uses:` another local
   * composite — spec R1's second escaping mutant), with a PATH-scoped cycle
   * guard (sequential reuse of one action is legit; a cycle is fail-closed
   * poison). Unknown or non-composite local refs poison fail-closed.
   * PINNED marketplace refs (usesKind === "remote") stay trusted; every
   * other non-local value — refless, docker, Git-invalid — is INVALID and
   * poisons (spec §5 L8). (§5 L1: setup-node writes
   * GITHUB_PATH by design).
   */
  const walkSteps = (
    steps: StepShape[],
    outerGuard: boolean,
    state: { poisoned: boolean },
    seen: ReadonlySet<string>,
    inComposite: boolean,
  ): void => {
    for (const s of steps) {
      // R15: a step carrying BOTH run: and uses: is schema-invalid — the
      // runner defines a step as one or the other, so GitHub rejects the
      // workflow and nothing in it runs. Emitting the run block as clean
      // also bypassed every usesKind refusal. Poison and emit nothing.
      if (typeof s.run === "string" && "uses" in s) {
        state.poisoned = true;
        continue;
      }
      if (typeof s.run === "string") {
        // Static-env spec §2.2: a workflow run-step's dirty env is BLOCK-
        // local (GitHub scoping — step env does not leak to siblings, and
        // over-poisoning forces reason-free rows). Inside a composite the
        // dirt poisons onward too (LS3 coarse — same treatment as the
        // uses-step that invoked the action).
        const stepDirty = envDirty(s.env);
        out.push({
          run: s.run,
          guarded: outerGuard || s.if !== undefined || customShell(s),
          poisoned: state.poisoned || stepDirty,
        });
        if (stepDirty && inComposite) state.poisoned = true;
        if (writesJobEnv(s.run)) state.poisoned = true;
        continue;
      }
      // Static-env spec §2.2 (LS3): a uses: step handed a dirty env is an
      // untrusted action invocation — poison BEFORE resolution so spliced
      // blocks and every later same-job block read poisoned.
      if ("uses" in s && envDirty(s.env)) state.poisoned = true;
      const ref = localRef(s);
      if (ref === null) {
        // Remote refs are trusted; an INVALID uses value (refless remote,
        // non-string, malformed) fails the job at this step, so everything
        // after it is unreachable — poison fail-closed.
        if ("uses" in s && usesKind(s.uses) === "invalid") state.poisoned = true;
        continue;
      }
      const action = localActions[ref];
      const inner = action === undefined ? null : compositeStepsOf(action);
      if (inner === null || seen.has(ref)) {
        state.poisoned = true;
      } else {
        walkSteps(inner, outerGuard || s.if !== undefined, state, new Set(seen).add(ref), true);
      }
    }
  };
  const jobs = (
    doc as {
      jobs?: Record<
        string,
        { if?: unknown; needs?: unknown; strategy?: unknown; env?: unknown; steps?: StepShape[] }
      >;
    }
  )?.jobs;
  // Static-env spec §2.2: workflow-root env governs every job in the file.
  const wfEnvDirty = envDirty((doc as { env?: unknown } | null)?.env);
  // R15, corrected to FILE level at whole-diff R3: a step carrying BOTH
  // `run:` and `uses:` is schema-invalid, so GitHub rejects the WHOLE
  // workflow — every job in it is unreachable, not just the steps after the
  // offending one.
  // R19: a workflow whose SHAPE is schema-invalid (unknown root/job/step
  // keys, `with:` on a run step, non-numeric timeouts) is rejected by
  // GitHub, so nothing in it runs — same narrow-accept posture as the
  // manifest profile, shared with the scanner.
  const schemaInvalid = jobs !== undefined && !validWorkflowShape(doc);
  const mixedStepAnywhere = Object.values(jobs ?? {}).some((jb) =>
    (jb.steps ?? []).some((st) => "run" in st && "uses" in st),
  );
  for (const j of Object.values(jobs ?? {})) {
    // needs: a failed/skipped dependency skips the whole job; strategy: an
    // empty matrix executes nothing — both are execution context (R10).
    const jobGuarded = j.if !== undefined || j.needs !== undefined || j.strategy !== undefined;
    // R16/R17: `runs-on` decided by the SHARED TYPED validator, so both
    // layers accept exactly the schedulable shapes (the R16 per-layer
    // heuristics diverged: non-string sequence members and wrong-typed
    // group/labels mappings were accepted census-side).
    const validRunsOnJob = validRunsOn((j as { "runs-on"?: unknown })["runs-on"]);
    walkSteps(
      j.steps ?? [],
      jobGuarded,
      {
        poisoned:
          !validRunsOnJob || mixedStepAnywhere || schemaInvalid || wfEnvDirty || envDirty(j.env),
      },
      new Set(),
      false,
    );
  }
  // Standalone composite-doc walk: same walker, same in-order threading
  // (nested local uses: resolve through the map; absent => fail-closed).
  // R19: validated through the SAME narrow-accept profile as a spliced
  // manifest — walking raw `runs.steps` let an OFF-PROFILE standalone action
  // emit clean blocks, which the spec never claimed and the splice path has
  // refused since R8.
  if ((doc as { runs?: unknown })?.runs !== undefined) {
    const standaloneSteps = compositeStepsOf(doc);
    if (standaloneSteps !== null) {
      walkSteps(standaloneSteps, false, { poisoned: false }, new Set(), true);
    }
  }
  return out;
}

/**
 * Bash removes a backslash-newline PAIR without inserting a space (R6) —
 * logical lines are the shell's parse unit, so the census AND the closure's
 * registry seeding must join identically (R9 G3 pinned a physical/logical
 * divergence between them).
 */
export function logicalLinesOf(text: string): Array<{ line: string; continued: boolean }> {
  const out: Array<{ line: string; continued: boolean }> = [];
  const rawLines = text.split(/\r?\n/);
  for (let i = 0; i < rawLines.length; i++) {
    let line = rawLines[i] ?? "";
    let continued = false;
    while (/\\$/.test(line) && i + 1 < rawLines.length) {
      line = line.slice(0, -1) + (rawLines[++i] ?? "");
      continued = true;
    }
    out.push({ line, continued });
  }
  return out;
}

/**
 * True when the line ENDS inside an unterminated quote — the next physical
 * lines are string data, not shell, so nothing in that text may
 * auto-classify (R10: a playwright line inside a multiline quoted string or
 * array literal never executes as an invocation).
 */
export function endsInOpenQuote(line: string): boolean {
  let quote: string | null = null;
  let escaped = false;
  for (const ch of line) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote !== "'" && ch === "\\") {
      escaped = true;
      continue;
    }
    if (quote !== null) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') quote = ch;
  }
  return quote !== null;
}

/**
 * Whitespace collapse OUTSIDE quotes only (R9 G4): inside single/double
 * quotes every character is semantic — `-g "a  b"` and `-g "a b"` name
 * DIFFERENT greps, so a registry key must never match across them.
 * Backslash escapes the next character everywhere except inside single
 * quotes (bash semantics).
 */
export function normalizeInvocation(s: string): string {
  let out = "";
  let ws = false;
  let quote: string | null = null;
  let escaped = false;
  for (const ch of s.trim()) {
    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }
    if (quote !== "'" && ch === "\\") {
      out += ch;
      escaped = true;
      continue;
    }
    if (quote !== null) {
      if (ch === quote) quote = null;
      out += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      out += ch;
      ws = false;
      continue;
    }
    if (/\s/.test(ch)) {
      if (!ws) {
        out += " ";
        ws = true;
      }
      continue;
    }
    out += ch;
    ws = false;
  }
  return out.trimEnd();
}

const escRe = (n: string) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * `runner [options...] [run|run-script] script` — option tokens BEFORE the
 * script name are part of the grammar (R7 F3: `pnpm --silent test:e2e`
 * forwards exactly like `pnpm test:e2e`; `npm run-script x` runs like
 * `npm run x`). A value-taking option's value is not modeled — a coincidental
 * name match there only ADDS loudness, never removes it (fail-closed).
 */
const runnerScriptRe = (names: string[], tail = "") =>
  new RegExp(
    `\\b(?:pnpm|npm|yarn|bun)\\s+(?:(?:-{1,2}[^\\s]+|run|run-script)\\s+)*(?:${names
      .map(escRe)
      .join("|")})(?:\\s|$)${tail}`,
  );

/**
 * REACHABILITY grammar for the closure (R8): runner word, then ANY tokens
 * within the same shell segment (no ;/&/| crossed), then the script name.
 * Deliberately WIDER than runnerScriptRe — a value-taking option's bare
 * value ("yarn --cwd . base") must not hide the name. Over-inclusion is
 * safe in this direction: closure membership only ever ADDS census
 * loudness, never removes it.
 */
const runnerReachRe = (names: string[]) =>
  new RegExp(
    `\\b(?:pnpm|npm|yarn|bun)\\s+(?:[^\\s;&|]+\\s+)*?(?:${names.map(escRe).join("|")})(?:\\s|$)`,
  );

/**
 * Fixpoint closure over package.json script bodies: a script whose body
 * invokes another playwright-wrapping script (via any runner form) is
 * itself playwright-wrapping (R7 F3 pulled this out of the tripwire body so
 * the closure grammar is unit-testable). Seeds (R8): a literal `playwright
 * test` body, OR a body whose normalized line is REGISTERED with declared
 * config contributions — a registry row the census trusts as an invocation
 * is an invocation for reachability too.
 */
export function transitivePwScriptNames(
  scripts: Record<string, string>,
  complexRegistry: Record<string, readonly string[]> = {},
): string[] {
  const registryInvokes = (body: string) =>
    logicalLinesOf(body).some(
      ({ line }) => (complexRegistry[normalizeInvocation(line)]?.length ?? 0) > 0,
    );
  const names = Object.keys(scripts).filter(
    (n) => /\bplaywright\s+test\b/.test(scripts[n] ?? "") || registryInvokes(scripts[n] ?? ""),
  );
  for (;;) {
    const re = runnerReachRe(names);
    const next = Object.keys(scripts).filter(
      (n) => !names.includes(n) && names.length > 0 && re.test(scripts[n] ?? ""),
    );
    if (next.length === 0) break;
    names.push(...next);
  }
  return names;
}

export function censusInvocations(
  texts: Array<string | { text: string; guarded?: boolean; poisoned?: boolean }>,
  pwScriptNames: string[],
  complexRegistry: Record<string, readonly string[]> = {},
): { invoked: Set<string>; problems: string[] } {
  const invoked = new Set<string>();
  const problems: string[] = [];
  const configFlags = (s: string) => [
    ...s.matchAll(/(?:^|\s)(?:--config(?:=|\s+)|-c(?:=|\s+)?)(\S+)/g),
  ];
  // R12: no env-assignment prefix group here — `PATH=fixtures/fake pnpm exec
  // playwright test` runs a FAKE pnpm that exits 0 (green step, no tests), so
  // an assignment-prefixed invocation is refused, not admitted as command
  // position. The state-changer context below refuses it first; failing
  // command position here is the belt to that suspender.
  const cmdPos = /^(?:pnpm\s+exec\s+|npx\s+)?playwright\s+test\b/;
  const mentionsRe = /\bplaywright\s+test\b/;
  const complexRe = /['"\\$`]/;
  // Deliberately case-sensitive, matching the classifier's lowercase-shell
  // posture (mentionsRe/cmdPos are lowercase too): the substring `playwr`
  // widens the old \bplaywright\b gate to catch constructed command words
  // without pulling PLAYWRIGHT_* env-var prose into the census.
  const fuzzy = /playwr/;
  const braceRe = /\{[^{}\s]*(?:,|\.\.)[^{}\s]*\}/;
  // Single-level reduction to the FIRST alternative — enough for the gate to
  // see through `playw{r..r}ight`; classification of any braced line is
  // refused regardless (suspicion below), so this never needs full bash
  // brace semantics.
  const reduceBraces = (s: string) =>
    s.replace(/\{([^{},\s]+)\.\.[^{}\s]*\}/g, "$1").replace(/\{([^{}\s]*),[^{}\s]*\}/g, "$1");
  const suspicion = (line: string): string | null => {
    if (braceRe.test(line)) return "brace expansion";
    if (/#/.test(line)) return "inline comment";
    if (/\/cli\.js(?:\s|$)/.test(line) || /[\\/]\.bin[\\/]playwr/.test(line))
      return "alternate playwright CLI entry";
    // JS \s treats NBSP/U+2028/etc. as token boundaries; bash treats them as
    // ordinary word characters — the classifier and the shell would tokenize
    // DIFFERENT commands (R7 F2).
    if (/[^\S \t]/.test(line)) return "non-shell whitespace character";
    for (const tok of line.split(/\s+/)) {
      if (fuzzy.test(tok) && /[?*[]/.test(tok) && !/\bplaywright\b/.test(tok))
        return `glob-constructed token "${tok}"`;
    }
    return null;
  };
  const usedKeys = new Set<string>();
  const routeRegistry = (line: string, why: string) => {
    const key = normalizeInvocation(line);
    const declared = complexRegistry[key];
    if (declared === undefined) {
      problems.push(
        `complex shell construct (${why}) — declare it in the complex-invocation registry: ${key}`,
      );
    } else {
      usedKeys.add(key);
      for (const c of declared) invoked.add(c);
    }
  };
  // Shell control flow makes EXECUTION of any line state-dependent in ways a
  // line-classifier cannot model — a dead `playwright test --config x` would
  // still record x (R9 G1). R10 additions: every function-definition
  // spelling, block/array openers-closers, a trailing && / || (split-line
  // short-circuit), and execution-neutering commands (exec/set/eval).
  // exit/return/exec/set/eval — and the state-changers, which can neuter a
  // LATER literal invocation — count only at COMMAND POSITION: `pnpm exec
  // playwright` is a runner subcommand, not bash exec. R12 widened both
  // sides of that rule. The state-changer list grew from R11's
  // hash/alias/unalias/shopt/trap/unset to the full shell-state class:
  // variable assignment in every form (`PATH=fixtures/fake` inline or
  // standalone, `+=` append, `A[i]=` array — a fake PATH makes a literal
  // `pnpm exec playwright test` run a fake pnpm that exits 0), the
  // assignment builtins (export/declare/typeset/readonly/local/let/read/
  // mapfile/readarray/getopts), source/dot scripts, directory changes
  // (cd/pushd/popd — relative config paths re-resolve), and
  // builtin/command/enable wrappers around any of these. And command
  // position itself now includes `;`, `&`, `|`, `(`, `{` — a state changer
  // reached through && or a subshell open mutates state all the same.
  // Function definitions match brace AND subshell bodies (`playwright() (:)`
  // shadows the command word itself). R13: bash function NAMES are any word
  // free of metacharacters, not \w — `foo-bar ( ) {` with padded parens is a
  // valid definition — so the name class is [^\s;&|(){}]+ and the parens may
  // carry whitespace; brace group tokens `{` / `}` at command position are
  // control flow too (an uncalled body's opener/closer can sit mid-line:
  // `a && { true`). printf (-v writes a variable) joins the state-changer
  // keywords, and `(( ))` arithmetic at command position assigns.
  const controlFlowRe =
    /(?:^|\s)(?:if|then|else|elif|fi|case|esac|while|until|for|done)(?:\s|;|$)|\bfunction\s+[^\s;&|(){}]+|[^\s;&|(){}]+\s*\(\s*\)|\(\s*\)\s*[({]|[({]\s*$|^\s*[)}]|(?:&&|\|\|)\s*$|(?:^|[;&|])\s*[{}]|(?:^|[;&|({])\s*(?:(?:exit|return|exec|set|eval|hash|alias|unalias|shopt|trap|unset|export|declare|typeset|readonly|local|source|cd|pushd|popd|builtin|command|enable|let|read|mapfile|readarray|getopts|printf)\b|\.(?=\s)|\(\(|[A-Za-z_][A-Za-z0-9_]*(?:\[[^\]]*\])?\+?=)/;
  const fwd = pwScriptNames.length > 0 ? runnerScriptRe(pwScriptNames, "([^\\n]*)") : null;
  for (const item of texts) {
    const raw = typeof item === "string" ? item : item.text;
    const guarded = typeof item !== "string" && item.guarded === true;
    const poisoned = typeof item !== "string" && item.poisoned === true;
    if (fuzzy.test(raw) && raw.includes("<<")) {
      problems.push(`heredoc in a text mentioning playwright: ${raw.slice(0, 120)}`);
      continue;
    }
    // Bash removes a backslash-newline PAIR — no space is inserted, so a
    // config path split mid-token rejoins into one token. The old space-join
    // re-tokenized it and recorded the wrong config (R6). Join faithfully,
    // PER LOGICAL LINE (a plain sibling line in the same run step must not
    // inherit the flag), and refuse to auto-classify any joined line:
    // continuation is a complex construct, so it takes the registry path
    // below (registered docker/regen lines keep matching — their
    // pre-backslash spaces survive the join and normalize to the same key).
    const logical = logicalLinesOf(raw);
    // A guarded step (if:/needs/strategy/custom shell) is conditionally
    // executed regardless of shell content; in-text control flow conditions
    // every playwright line in the SAME text (R9 G1); a line ending inside
    // an open quote makes the FOLLOWING lines string data, not shell (R10).
    // Either way: registry-or-loud, never auto-classified.
    // R13: `${VAR:=default}` assigns DURING expansion on any command's
    // arguments (`: ${NODE_OPTIONS:=…}`, `echo ${PATH:=…}`), and $(…) /
    // backticks splice arbitrary state — so an expansion-capable character
    // on ANY non-comment sibling line is execution context for the text's
    // classifying lines, not just on the classifying line itself (where
    // complexRe already refuses it).
    // Spec §2.1: cross-step env poison is execution context exactly like a
    // guarded step — the mutated environment governs every line in the block.
    const contextWhy = guarded
      ? "context-guarded step (if:/needs/strategy/custom shell)"
      : poisoned
        ? "environment poisoned by a same-job GITHUB_ENV/GITHUB_PATH write or an unmodelled static env: key"
        : logical.some(({ line }) => controlFlowRe.test(line))
          ? "shell control-flow or state-change context"
          : logical.some(({ line }) => endsInOpenQuote(line))
            ? "multiline lexical context"
            : logical.some(({ line }) => !/^\s*#/.test(line) && /[$`]/.test(line))
              ? "expansion-capable sibling line"
              : null;
    for (const { line, continued } of logical) {
      if (/^\s*#/.test(line)) continue;
      const forwarded = fwd?.exec(line);
      if (forwarded && configFlags(forwarded[1] ?? "").length > 0) {
        problems.push(`config flag forwarded through a package script: ${line.trim()}`);
        continue;
      }
      if (!fuzzy.test(line) && !fuzzy.test(reduceBraces(line))) {
        const flagCount = configFlags(line).length;
        // R9 G2 / R10: a config flag whose target command is COMPOSED at
        // runtime — expansion, quote/backslash splicing of the command word
        // itself (play""wright, play\wright), glob/class splicing
        // (.bin/play?right), quoted script tokens — can invoke playwright
        // while the line mentions it nowhere. ANY shell metacharacter
        // alongside a config flag on a no-mention line: registry-or-loud.
        if (flagCount > 0 && (complexRe.test(line) || /[?*[\]{}()]/.test(line))) {
          routeRegistry(
            line,
            "config flag with shell metacharacters and no literal playwright mention",
          );
          continue;
        }
        // Runner GLOBAL options before the script name (`pnpm --silent
        // test:e2e --config x`) defeat the strict forwarding regex above
        // while still forwarding the flag into a playwright invocation (R6).
        if (
          flagCount > 0 &&
          /\b(?:pnpm|npm|yarn|bun)\b/.test(line) &&
          line.split(/\s+/).some((t) => pwScriptNames.includes(t.replace(/^['"]|['"]$/g, "")))
        ) {
          problems.push(
            `config flag on a runner line naming a playwright-wrapping script: ${line.trim()}`,
          );
        }
        continue;
      }
      // contextWhy applies only to lines that would otherwise CLASSIFY
      // (a `playwright test` mention or a config flag) — a `playwright
      // install` line in a control-flow block contributes nothing either
      // way and stays silent, exactly as it does outside one.
      const why =
        (complexRe.test(line) ? "quote/backslash/$/backtick" : null) ??
        suspicion(line) ??
        (continued ? "backslash-newline continuation" : null) ??
        (mentionsRe.test(line) || configFlags(line).length > 0 ? contextWhy : null);
      if (why) {
        routeRegistry(line, why);
        continue;
      }
      if (!mentionsRe.test(line)) continue;
      // R7 F2 / R10: ANY short-circuit chain is loud — bash -e exempts a
      // failing command inside a && list (set -e; false && x; echo ok →
      // exits 0 without running x), so even an "unconditional-looking" &&
      // can silently skip the invocation while the step stays green. Guard
      // commands (true/false/:/[/test/exit/return/exec/set/eval/negation)
      // reachable via ;/| splits are loud for the same reason.
      if (/\|\||&&/.test(line)) {
        problems.push(`short-circuit chain around a playwright invocation: ${line.trim()}`);
        continue;
      }
      // R11: backgrounding (bare &) and piping (bare |) — text cannot prove
      // the invocation COMPLETES (kill $! reaps a backgrounded run; a closed
      // pipe SIGPIPEs it). The presence layer refuses both; completion of
      // live configs is owned by the OBSERVATION layer (spec §4 run-report
      // comparator for standalone, real CI greenness for the rest).
      // Redirection fds (2>&1) are not backgrounding: `&` preceded by > or
      // digit-> stays clean.
      if (/(^|[^|&])\|([^|]|$)/.test(line) || /(^|[^&>])&([^&]|$)/.test(line)) {
        problems.push(`backgrounded or piped playwright invocation: ${line.trim()}`);
        continue;
      }
      const guard = line
        .split(/[;&|]+/)
        .map((s) => s.trim())
        .find((s) =>
          /^(?:true$|false$|:$|\[|test\s|exit\b|return\b|exec\b|set\b|eval\b|!)/.test(s),
        );
      if (guard !== undefined) {
        problems.push(
          `guard command "${guard}" conditions a playwright invocation: ${line.trim()}`,
        );
        continue;
      }
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
          // Whitespace-aware, not space-aware: a TAB boundary must find the
          // same preceding token a space would (R6 — commander consumes
          // `--config` as `--grep`'s value regardless of separator).
          const prevToken = before.split(/\s+/).filter(Boolean).pop() ?? "";
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
    // The private-image-pipeline variant geometry + no-optimizer network gate. Its
    // OWN step for the same reason as the rows around it: the T-NOPHANTOM-CREW
    // filter selects none of these cases, so without a step of its own the file
    // would be present in the workflow and the cases would run nowhere.
    //
    // TWO projects and a json reporter since the zoom-gate arc (spec
    // 2026-08-10-diagram-viewing-polish §6): the family split on capability, so
    // desktop-chromium carries the network-order gate and mobile-safari the
    // CDP-free tier assertion. The json report feeds
    // scripts/check-phantom-gap-executed.mjs, the per-(case, project) oracle that
    // keeps the added project honest: the three pre-existing cases were converted
    // from bare early returns to DECLARED skips in the same arc, and the oracle is
    // what stops a bare return reintroduced later from being credited as desktop
    // coverage.
    'pnpm exec playwright test --reporter=list,json --project=mobile-safari --project=desktop-chromium tests/e2e/crew-layout-dimensions.spec.ts -g "T-DIAGRAM-VARIANTS"':
      ["playwright.config.ts"],
    'pnpm exec playwright test --reporter=list --project=desktop-chromium tests/e2e/admin-layout-dimensions.spec.ts -g "width chain"':
      ["playwright.config.ts"],
    // The freshness-cue geometry probe (spec 2026-08-03-modal-freshness-cue §11.5).
    // Its OWN step because the two filters above select neither: a case matched by
    // a project but selected by no `-g` runs nowhere, which is the failure this
    // whole workflow's header comment documents.
    'pnpm exec playwright test --reporter=list --project=desktop-chromium tests/e2e/admin-layout-dimensions.spec.ts -g "T-FRESHNESS-GEOMETRY"':
      ["playwright.config.ts"],
    'pnpm exec playwright test --project=mobile-safari tests/e2e/admin-lifecycle-transitions.spec.ts -g "Published toggle round-trip" --repeat-each="$REPEATS" --retries=0 --trace=on':
      ["playwright.config.ts"],
    // The plain branch of the same if/fi step (lifecycle-layout-e2e.yml):
    // in-text control flow forces every playwright line in that run block
    // through the registry (R9 G1).
    "pnpm exec playwright test --project=mobile-safari tests/e2e/admin-lifecycle-transitions.spec.ts":
      ["playwright.config.ts"],
    // R12: env-assignment prefixes are shell state (a PATH= prefix runs a
    // fake binary that exits 0), so command position no longer admits them
    // and these two package-script bodies route here. Human declaration:
    // ENABLE_TEST_AUTH / TEST_AUTH_SECRET are harness toggles, not
    // resolution state — each line's one direct invocation names its config
    // with -c.
    "ENABLE_TEST_AUTH=true TEST_AUTH_SECRET=test-secret-fixture playwright test -c playwright.screenshots.config.ts --project=screenshots-gallery":
      ["playwright.screenshots.config.ts"],
    "ENABLE_TEST_AUTH=true TEST_AUTH_SECRET=test-secret-fixture playwright test -c playwright.screenshots.config.ts --project=screenshots-help --project=screenshots-help-capture":
      ["playwright.screenshots.config.ts"],
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
    // Attached short form still classifies; the single-& compound FLIPPED in
    // R11 — `&` BACKGROUNDS the first command (kill $! can reap it before it
    // completes), it does not sequence, so text cannot prove completion.
    expect([...c("playwright test -ca.ts").invoked]).toEqual(["a.ts"]);
    {
      const bg = c("playwright test -ca.ts & playwright test");
      expect(bg.problems).not.toEqual([]);
      expect(bg.invoked.size).toBe(0);
    }
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
    // R6 families: constructs that COMPOSE the invocation or its flag at
    // runtime from text a literal scan cannot see — brace expansion, inline
    // comments, backslash-newline continuation (a config path split
    // mid-token rejoins into one token bash-side, so a joined line is never
    // auto-classified), tab token boundaries, runner GLOBAL options before
    // the script name, alternate CLI entries, glob-constructed command
    // words. Every one is loud AND classifies nothing.
    const loudAndDark = (form: string, names: string[] = []) => {
      const r = censusInvocations([form], names);
      expect(r.problems, form).not.toEqual([]);
      expect(r.invoked.size, form).toBe(0);
    };
    loudAndDark("playwright test --confi{g..g} tests/e2e/standalone.config.ts");
    loudAndDark("playwri{g..g}ht test --config ghost.ts");
    loudAndDark("playw{r..r}ight test --config ghost.ts");
    loudAndDark(
      "playwright test --config tests/e2e/standalone.config.ts # --config playwright.config.ts",
    );
    loudAndDark(
      "playwright test --config playwright.config.ts\\\n/../tests/e2e/standalone.config.ts",
    );
    loudAndDark("playwright test\t--grep\t--config tests/e2e/standalone.config.ts");
    loudAndDark("pnpm --silent test:e2e --config tests/e2e/standalone.config.ts", ["test:e2e"]);
    loudAndDark("pnpm --filter . test:e2e --config=ghost.ts", ["test:e2e"]);
    loudAndDark(
      "node node_modules/@playwright/test/cli.js test --config tests/e2e/standalone.config.ts",
    );
    loudAndDark("./node_modules/.bin/playwrigh? test --config ghost.ts");
    // R7 F2 families: conditional execution — a short-circuit chain or guard
    // command can make the recorded invocation DEAD at runtime, keeping
    // set-equality green while the named config runs nowhere. And non-shell
    // whitespace: JS \s treats NBSP as a token boundary, bash does not.
    loudAndDark("true || playwright test --config ghost.ts");
    loudAndDark("false && playwright test --config ghost.ts || true");
    loudAndDark("exit 0; playwright test --config ghost.ts");
    loudAndDark("[ -f cfg ] && playwright test --config ghost.ts");
    loudAndDark("playwright\u00A0test --config ghost.ts");
    // R9 G1: CROSS-LINE control flow \u2014 an earlier exit, an if/fi block, or
    // an uncalled function makes a later playwright line dead while a
    // line-classifier still records its config.
    loudAndDark("exit 0\nplaywright test --config ghost.ts");
    loudAndDark("if false; then\n  playwright test --config ghost.ts\nfi");
    loudAndDark("dead() {\n  playwright test --config ghost.ts\n}");
    // R9 G1: a step guarded by `if:` is conditionally executed regardless of
    // its shell content.
    {
      const g = censusInvocations(
        [{ text: "playwright test --config ghost.ts", guarded: true }],
        [],
      );
      expect(g.problems).not.toEqual([]);
      expect(g.invoked.size).toBe(0);
    }
    // Spec §2.1: a block whose job env was mutated by an EARLIER same-job
    // GITHUB_ENV/GITHUB_PATH write is execution context exactly like a
    // guarded step — a textually clean invocation may run a fake pnpm that
    // exits 0. Registry-or-loud, never auto-classified.
    {
      const p = censusInvocations(
        [{ text: "pnpm exec playwright test --config ghost.ts", poisoned: true }],
        [],
      );
      expect(p.problems).not.toEqual([]);
      expect(p.invoked.size).toBe(0);
    }
    // …a poisoned NON-classifying block stays silent (same rule as guarded).
    {
      const p = censusInvocations([{ text: "echo hi", poisoned: true }], []);
      expect(p.problems).toEqual([]);
      expect(p.invoked.size).toBe(0);
    }
    // …and a REGISTERED poisoned line contributes exactly its declared
    // configs — the human-declaration escape hatch every context shares.
    {
      const key = "pnpm exec playwright test --config known.ts";
      const p = censusInvocations([{ text: key, poisoned: true }], [], { [key]: ["known.ts"] });
      expect(p.problems).toEqual([]);
      expect([...p.invoked]).toEqual(["known.ts"]);
    }
    // R9 G2: runtime-composed command/script targets \u2014 expansion or quoting
    // hides the invocation from every literal scan while a config flag rides
    // along.
    loudAndDark("PW=playwright\n$PW test --config ghost.ts");
    loudAndDark('pnpm "test:e2e" --config ghost.ts', ["test:e2e"]);
    loudAndDark("S=test:e2e\npnpm $S --config ghost.ts", ["test:e2e"]);
    // R9 G4: whitespace INSIDE quotes is semantic \u2014 a registry key must not
    // match a source line whose quoted content differs by spacing.
    {
      const key = 'playwright test -g "a b" --config known.ts';
      const src = 'playwright test -g "a  b" --config known.ts';
      const r = censusInvocations([src], [], { [key]: ["known.ts"] });
      expect(r.problems).not.toEqual([]);
      expect([...r.invoked]).not.toContain("known.ts");
    }
    // R10: EVERY short-circuit chain is loud — R7's "unconditional && fails
    // the step loudly" premise was WRONG: bash -e exempts a failing command
    // inside a && list (set -e; false && x; echo ok → prints ok, exits 0),
    // so a failed predecessor silently skips the invocation while the step
    // stays green.
    loudAndDark("corepack enable && playwright test --config real.ts");
    loudAndDark("grep -q x f &&\nplaywright test --config ghost.ts\necho ok");
    loudAndDark("! true && playwright test --config ghost.ts");
    loudAndDark("(false) && playwright test --config ghost.ts");
    // R10: execution-neutering commands ahead of the invocation.
    loudAndDark("exec true\nplaywright test --config ghost.ts");
    loudAndDark("set -n\nplaywright test --config ghost.ts");
    // R10: command words spliced BEFORE the `playwr` substring — quote,
    // backslash, glob, and class splicing all execute playwright in bash
    // while containing no literal `playwr`.
    loudAndDark('play""wright test --config ghost.ts');
    loudAndDark("play\\wright test --config ghost.ts");
    loudAndDark("./node_modules/.bin/play?right test --config ghost.ts");
    loudAndDark("./node_modules/.bin/play[w]right test --config ghost.ts");
    // R10: multiline lexical context — a quoted string or array literal
    // spanning lines, and every function-definition spelling, must not let
    // the inner line classify as a live invocation.
    loudAndDark('echo "\nplaywright test --config ghost.ts\n"');
    loudAndDark("ARR=(\nplaywright test --config ghost.ts\n)");
    loudAndDark("function dead {\n  playwright test --config ghost.ts\n}");
    loudAndDark("function dead\n{\n  playwright test --config ghost.ts\n}");
    loudAndDark("dead()\n{\n  playwright test --config ghost.ts\n}");
    // R11: backgrounding and piping — the text cannot prove the invocation
    // COMPLETES (kill $! reaps it; a closed pipe SIGPIPEs it). Presence
    // layer refuses; completion of live configs belongs to the observation
    // layer (run-report comparator, real CI).
    loudAndDark("playwright test --config ghost.ts >/dev/null 2>&1 &\nkill $!");
    loudAndDark("playwright test --config ghost.ts | head -n 0");
    // R11: state-changing siblings neuter a later literal invocation —
    // hash/alias/trap/shopt/unset and function-shadowing (of playwright OR
    // of the runner) are execution context.
    loudAndDark("hash -p /usr/bin/true playwright\nplaywright test --config ghost.ts");
    loudAndDark(
      "shopt -s expand_aliases\nalias playwright=true\nplaywright test --config ghost.ts",
    );
    loudAndDark('trap "exit 0" DEBUG\nplaywright test --config ghost.ts');
    loudAndDark("playwright() (:)\nplaywright test --config ghost.ts");
    loudAndDark("pnpm() (:)\npnpm exec playwright test --config ghost.ts");
    // R12: env-assignment prefixes are STATE, not grammar — `PATH=fixtures/
    // fake pnpm exec playwright test` runs a fake pnpm that exits 0 while
    // running no tests, so command position no longer admits them (this
    // FLIPS the R2-era "still command position" assertion, exactly as R11
    // flipped single-&). Every shell-state mutation form — inline and
    // standalone assignment (plain/append/array), the assignment builtins,
    // source/dot, directory changes, and builtin/command wrappers around the
    // R11 blacklist — is execution context: registry-or-loud, never
    // auto-classified.
    loudAndDark("CI=1 FOO=bar playwright test -c x.ts");
    loudAndDark("PATH=fixtures/fake pnpm exec playwright test --config playwright.config.ts");
    loudAndDark("NODE_OPTIONS=--require=./evil.cjs playwright test --config ghost.ts");
    loudAndDark("PATH=fixtures/fake\nplaywright test --config ghost.ts");
    loudAndDark("PATH+=:/tmp/fake\nplaywright test --config ghost.ts");
    loudAndDark("FLAGS[0]=--config=ghost.ts\nplaywright test");
    loudAndDark("export PATH=fixtures/fake\nplaywright test --config ghost.ts");
    loudAndDark("declare -x PATH=fixtures/fake\nplaywright test --config ghost.ts");
    loudAndDark("typeset PW=fake\nplaywright test --config ghost.ts");
    loudAndDark("readonly CFG=ghost.ts\nplaywright test --config ghost.ts");
    loudAndDark("source ./env.sh\nplaywright test --config ghost.ts");
    loudAndDark(". ./env.sh\nplaywright test --config ghost.ts");
    loudAndDark("cd fixtures\nplaywright test --config ghost.ts");
    loudAndDark("pushd fixtures\nplaywright test --config ghost.ts");
    loudAndDark("popd\nplaywright test --config ghost.ts");
    loudAndDark("command unset -f playwright\nplaywright test --config ghost.ts");
    loudAndDark("builtin alias playwright=true\nplaywright test --config ghost.ts");
    loudAndDark("enable -f ./evil.so pw\nplaywright test --config ghost.ts");
    loudAndDark("read PW_CFG\nplaywright test --config ghost.ts");
    loudAndDark("let N=1\nplaywright test --config ghost.ts");
    loudAndDark("mapfile ARR\nplaywright test --config ghost.ts");
    // R12: the (?:^|;) command-position anchor was itself a hole — a state
    // changer reached through &&, a pipe, or a subshell open is still at
    // command position and still mutates state before a later invocation.
    loudAndDark("true && cd fixtures\nplaywright test --config ghost.ts");
    loudAndDark("true; PATH=fixtures/fake\nplaywright test --config ghost.ts");
    // `env VAR=x playwright test` is an external-command prefix, not shell
    // state — it fails command position and stays loud through that gate.
    loudAndDark("env PATH=fixtures/fake playwright test --config ghost.ts");
    // R13: bash function NAMES are not \w — hyphen/dot/colon names with
    // whitespace-padded parens and braces evade both the \w*\(\) spelling
    // and the line-boundary brace tripwires, hiding an invocation inside an
    // uncalled body that exits 0.
    loudAndDark("foo-bar ( ) { :\nplaywright test --config ghost.ts\n:; }");
    loudAndDark("function foo.bar {\nplaywright test --config ghost.ts\n}");
    loudAndDark("a && { true\nplaywright test --config ghost.ts\n}");
    // R13: three mutation families the R12 state-changer list missed —
    // printf -v writes a variable; ${VAR:=default} assigns during expansion
    // on ANY command's arguments (so ANY expansion-capable sibling line is
    // context); (( )) arithmetic assigns and can flip config-narrowing
    // state.
    loudAndDark("printf -v PATH fixtures/fake\nplaywright test --config ghost.ts");
    loudAndDark(": ${NODE_OPTIONS:=--require=./evil.cjs}\nplaywright test --config ghost.ts");
    loudAndDark("echo ${NODE_OPTIONS:=--require=./evil.cjs}\nplaywright test --config ghost.ts");
    loudAndDark("(( CI = 1 ))\nplaywright test --config ghost.ts");
    loudAndDark("(( ++CI ))\nplaywright test --config ghost.ts");
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

  it("runBlocksOf collects workflow jobs AND composite-action runs.steps (R7 F4)", () => {
    // A local composite action executes run blocks the workflow file never
    // textually contains (`uses: ./.github/actions/...`) — the PLAYWRIGHT_
    // raw-text sweep already treats actions as execution surface; the census
    // must see the same universe or the two guards disagree.
    const wfDoc = parse(
      "jobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo wf-step\n      - uses: x/y@v1\n      - run: echo guarded-step\n        if: failure()\n",
    );
    const actionDoc = parse(
      "name: setup\nruns:\n  using: composite\n  steps:\n    - run: echo action-step\n      shell: bash\n",
    );
    expect(runBlocksOf(wfDoc)).toEqual([
      { run: "echo wf-step", guarded: false, poisoned: false },
      { run: "echo guarded-step", guarded: true, poisoned: false },
    ]);
    expect(runBlocksOf(actionDoc)).toEqual([
      { run: "echo action-step", guarded: false, poisoned: false },
    ]);
    // Job-level if: guards every step in the job (R9 G1).
    const guardedJob = parse(
      "jobs:\n  j:\n    if: false\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo x\n",
    );
    expect(runBlocksOf(guardedJob)).toEqual([{ run: "echo x", guarded: true, poisoned: false }]);
    // R10: needs (dependency may fail → job skipped), strategy (matrix may
    // be empty), and a custom shell (reinterprets the block) are execution
    // context too. bash/sh shells stay unguarded; composite actions REQUIRE
    // an explicit shell, so bash there is not context.
    expect(
      runBlocksOf(
        parse(
          "jobs:\n  j:\n    needs: build\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo x\n",
        ),
      ),
    ).toEqual([{ run: "echo x", guarded: true, poisoned: false }]);
    expect(
      runBlocksOf(
        parse(
          "jobs:\n  j:\n    strategy:\n      matrix:\n        s: [1]\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo x\n",
        ),
      ),
    ).toEqual([{ run: "echo x", guarded: true, poisoned: false }]);
    expect(
      runBlocksOf(
        parse(
          "jobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo x\n        shell: python\n",
        ),
      ),
    ).toEqual([{ run: "echo x", guarded: true, poisoned: false }]);
    expect(
      runBlocksOf(
        parse(
          "jobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo x\n        shell: bash\n",
        ),
      ),
    ).toEqual([{ run: "echo x", guarded: false, poisoned: false }]);
    expect(
      runBlocksOf(
        parse(
          "runs:\n  using: composite\n  steps:\n    - run: echo a\n      shell: bash\n    - run: echo b\n      shell: python\n",
        ),
      ),
    ).toEqual([
      { run: "echo a", guarded: false, poisoned: false },
      { run: "echo b", guarded: true, poisoned: false },
    ]);
  });

  it("runBlocksOf models cross-step GITHUB_ENV/GITHUB_PATH state per job (spec §2.1)", () => {
    // F3 both directions: a write-first step poisons every LATER same-job
    // block; a write AFTER an invocation poisons nothing before it.
    // (Semantically real writes — R1 probe honesty: a GITHUB_PATH entry is a
    // PATH COMPONENT to prepend, so the corrupting form is a directory
    // holding a fake pnpm; a PATH= assignment corrupts via GITHUB_ENV.)
    const poisonFirst = parse(
      'jobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo "/fake-bin" >> "$GITHUB_PATH"\n      - run: echo later\n',
    );
    expect(runBlocksOf(poisonFirst)).toEqual([
      { run: 'echo "/fake-bin" >> "$GITHUB_PATH"', guarded: false, poisoned: false },
      { run: "echo later", guarded: false, poisoned: true },
    ]);
    const poisonLast = parse(
      'jobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo first\n      - run: echo "X=1" >> "$GITHUB_ENV"\n',
    );
    expect(runBlocksOf(poisonLast)).toEqual([
      { run: "echo first", guarded: false, poisoned: false },
      { run: 'echo "X=1" >> "$GITHUB_ENV"', guarded: false, poisoned: false },
    ]);
    // F2 census-side (R2): the predicate has NO write-shape grammar — tee and
    // single-`>` forms poison exactly like `>>`. A mutant narrowing the
    // census predicate to `>>` fails these two while the scanner twins stay
    // green, so the layers cannot drift apart silently.
    for (const write of [
      'echo "PATH=/fake-bin:$PATH" | tee -a "$GITHUB_ENV"',
      'echo "/fake-bin" > "$GITHUB_PATH"',
    ]) {
      expect(
        runBlocksOf(
          parse(
            `jobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: ${write}\n      - run: echo later\n`,
          ),
        ),
        write,
      ).toEqual([
        { run: write, guarded: false, poisoned: false },
        { run: "echo later", guarded: false, poisoned: true },
      ]);
    }
    // F1 precision twin: env state is JOB-scoped — a write in job a must not
    // poison job b (over-poisoning forces reason-free registry rows).
    const crossJob = parse(
      'jobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo "X=1" >> "$GITHUB_ENV"\n  b:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo clean\n',
    );
    expect(runBlocksOf(crossJob)).toEqual([
      { run: 'echo "X=1" >> "$GITHUB_ENV"', guarded: false, poisoned: false },
      { run: "echo clean", guarded: false, poisoned: false },
    ]);
    // F6: a full-line # comment mentioning GITHUB_ENV never executes and
    // must not poison (same non-execution rule as the census's comment skip).
    const commentOnly = parse(
      "jobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: |\n          # GITHUB_ENV is not written here\n          echo hi\n      - run: echo later\n",
    );
    expect(runBlocksOf(commentOnly)).toEqual([
      { run: "# GITHUB_ENV is not written here\necho hi\n", guarded: false, poisoned: false },
      { run: "echo later", guarded: false, poisoned: false },
    ]);
    // F4, all three directions. A local composite action's steps run in the
    // CALLER's job env: an action write poisons later workflow steps; an
    // earlier workflow write poisons the spliced action blocks; and inside
    // the action, step 1's write poisons step 2.
    const setupWrites = parse(
      'runs:\n  using: composite\n  steps:\n    - run: echo "X=1" >> "$GITHUB_ENV"\n      shell: bash\n    - run: echo action-second\n      shell: bash\n',
    );
    const actions = { "./.github/actions/w": setupWrites };
    const actionThenRun = parse(
      "jobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: ./.github/actions/w\n      - run: echo after-action\n",
    );
    expect(runBlocksOf(actionThenRun, actions)).toEqual([
      { run: 'echo "X=1" >> "$GITHUB_ENV"', guarded: false, poisoned: false },
      { run: "echo action-second", guarded: false, poisoned: true },
      { run: "echo after-action", guarded: false, poisoned: true },
    ]);
    const cleanAction = parse(
      "runs:\n  using: composite\n  steps:\n    - run: echo inside\n      shell: bash\n",
    );
    const writeThenAction = parse(
      'jobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo "X=1" >> "$GITHUB_ENV"\n      - uses: ./.github/actions/clean\n',
    );
    expect(runBlocksOf(writeThenAction, { "./.github/actions/clean": cleanAction })).toEqual([
      { run: 'echo "X=1" >> "$GITHUB_ENV"', guarded: false, poisoned: false },
      { run: "echo inside", guarded: false, poisoned: true },
    ]);
    // Spliced action steps compose guards: a use-site if: guards them the
    // same way a step-level if: guards a run step.
    const guardedUse = parse(
      "jobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: ./.github/actions/clean\n        if: failure()\n",
    );
    expect(runBlocksOf(guardedUse, { "./.github/actions/clean": cleanAction })).toEqual([
      { run: "echo inside", guarded: true, poisoned: false },
    ]);
    // F5: an unresolvable local action is an opaque same-env executor —
    // fail-closed, later steps are poisoned.
    const ghostUse = parse(
      "jobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: ./.github/actions/ghost\n      - run: echo after-ghost\n",
    );
    expect(runBlocksOf(ghostUse, {})).toEqual([
      { run: "echo after-ghost", guarded: false, poisoned: true },
    ]);
    // PINNED marketplace actions stay trusted (spec §1.1 / §5 L1); the
    // unpinned and docker shapes are refused as invalid (§5 L8):
    // setup-node writes GITHUB_PATH by DESIGN; poisoning on remote uses:
    // would darken every workflow.
    const marketplaceUse = parse(
      "jobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: echo after-checkout\n",
    );
    expect(runBlocksOf(marketplaceUse, {})).toEqual([
      { run: "echo after-checkout", guarded: false, poisoned: false },
    ]);
    // R11: a REFLESS remote ref is INVALID, not trusted — GitHub rejects it
    // before any step runs, so everything after is unreachable. The walker's
    // own uses-branch shares the classifier with the scanner and the
    // manifest profile, so all three agree.
    for (const ref of ["actions/checkout", "owner/repo/path"]) {
      expect(
        runBlocksOf(
          parse(
            `jobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: ${ref}\n      - run: echo after-refless\n`,
          ),
          {},
        ),
        ref,
      ).toEqual([{ run: "echo after-refless", guarded: false, poisoned: true }]);
    }
    // R16: a job without a valid runs-on never executes, so its blocks are
    // poisoned rather than clean; the valid runner shapes stay clean.
    for (const head of ["", "    runs-on:\n", "    runs-on: null\n", "    runs-on: []\n"]) {
      expect(
        runBlocksOf(parse(`jobs:\n  j:\n${head}    steps:\n      - run: echo no-runner\n`), {}),
        JSON.stringify(head),
      ).toEqual([{ run: "echo no-runner", guarded: false, poisoned: true }]);
    }
    for (const head of [
      "    runs-on: ubuntu-latest\n",
      "    runs-on:\n      - self-hosted\n",
      "    runs-on:\n      group: my-group\n",
    ]) {
      expect(
        runBlocksOf(parse(`jobs:\n  j:\n${head}    steps:\n      - run: echo runner-ok\n`), {}),
        head,
      ).toEqual([{ run: "echo runner-ok", guarded: false, poisoned: false }]);
    }
    // R19: a schema-invalid workflow shape poisons every block — GitHub
    // rejects the file, so nothing in it executes.
    for (const wf of [
      "bogus-root: 1\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo x\n",
      "jobs:\n  j:\n    runs-on: ubuntu-latest\n    bogus-job: 1\n    steps:\n      - run: echo x\n",
      "jobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo x\n        with:\n          a: b\n",
      "jobs:\n  j:\n    runs-on: ubuntu-latest\n    timeout-minutes: fast\n    steps:\n      - run: echo x\n",
    ]) {
      expect(runBlocksOf(parse(wf), {}), wf).toEqual([
        { run: "echo x", guarded: false, poisoned: true },
      ]);
    }
    // R18: mixed detection is key-presence based, so mapping ORDER cannot
    // hide it (run-first was invisible to a truncating text scan).
    expect(
      runBlocksOf(
        parse(
          "jobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo mixed\n        uses: actions/checkout@v4\n      - run: echo later\n",
        ),
        {},
      ),
    ).toEqual([{ run: "echo later", guarded: false, poisoned: true }]);
    // R17: the census shares the typed validator, so the same shapes that
    // the scanner refuses poison here (non-string sequence members and
    // wrong-typed/extra-keyed group-labels mappings were accepted before).
    for (const head of [
      "    runs-on: 42\n",
      "    runs-on:\n      - 42\n",
      "    runs-on:\n      group: []\n",
      "    runs-on:\n      bogus: x\n",
    ]) {
      expect(
        runBlocksOf(parse(`jobs:\n  j:\n${head}    steps:\n      - run: echo bad-runner\n`), {}),
        JSON.stringify(head),
      ).toEqual([{ run: "echo bad-runner", guarded: false, poisoned: true }]);
    }
    for (const head of [
      "    runs-on:\n      group: my-group\n      labels: gpu\n",
      "    runs-on:\n      labels:\n        - gpu\n",
    ]) {
      expect(
        runBlocksOf(parse(`jobs:\n  j:\n${head}    steps:\n      - run: echo good-runner\n`), {}),
        JSON.stringify(head),
      ).toEqual([{ run: "echo good-runner", guarded: false, poisoned: false }]);
    }
    // R15: a step carrying BOTH run: and uses: is schema-invalid — GitHub
    // rejects the workflow, so the run block must not be emitted clean (it
    // also bypassed every usesKind refusal that way).
    for (const ref of ["actions/checkout@v4", "actions/checkout", "./.github/actions/ghost"]) {
      expect(
        runBlocksOf(
          parse(
            `jobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: ${ref}\n        run: echo mixed\n      - run: echo later\n`,
          ),
          {},
        ),
        ref,
      ).toEqual([{ run: "echo later", guarded: false, poisoned: true }]);
    }
    // R31: github.env / github.path name the same env files, so a write
    // through either poisons later blocks census-side too.
    for (const prop of ["github.env", "github.path", "github['env']", 'github["path"]']) {
      expect(
        runBlocksOf(
          parse(
            `jobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo /fake-bin >> \${{ ${prop} }}\n      - run: echo later\n`,
          ),
          {},
        ),
        prop,
      ).toEqual([
        { run: `echo /fake-bin >> \${{ ${prop} }}`, guarded: false, poisoned: false },
        { run: "echo later", guarded: false, poisoned: true },
      ]);
    }
    // R13: the docker:// family is refused wholesale (spec §5 L8) — its
    // reference grammar is its own spec and two rounds of modelling it
    // produced escaping forms; zero live refs, so the refusal is free.
    expect(
      runBlocksOf(
        parse(
          "jobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: docker://alpine:3\n      - run: echo after-docker\n",
        ),
        {},
      ),
    ).toEqual([{ run: "echo after-docker", guarded: false, poisoned: true }]);
    // …and the pinned GitHub-action forms stay trusted.
    for (const ref of ["owner/repo/sub@v1", "actions/checkout@v4"]) {
      expect(
        runBlocksOf(
          parse(
            `jobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: ${ref}\n      - run: echo after-ok\n`,
          ),
          {},
        ),
        ref,
      ).toEqual([{ run: "echo after-ok", guarded: false, poisoned: false }]);
    }
    // Standalone composite walk threads the same internal ordering.
    expect(runBlocksOf(setupWrites)).toEqual([
      { run: 'echo "X=1" >> "$GITHUB_ENV"', guarded: false, poisoned: false },
      { run: "echo action-second", guarded: false, poisoned: true },
    ]);
    // F7 (R1 escaping mutant #1): a KNOWN javascript/docker action has no
    // runs.steps, and its ENTRY CODE can core.addPath / core.exportVariable
    // with nothing for a YAML walk to see — presence in the map is not
    // "modeled". Opaque, fail-closed.
    const jsAction = parse("runs:\n  using: node20\n  main: index.js\n");
    const jsUse = parse(
      "jobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: ./.github/actions/js\n      - run: echo after-js\n",
    );
    expect(runBlocksOf(jsUse, { "./.github/actions/js": jsAction })).toEqual([
      { run: "echo after-js", guarded: false, poisoned: true },
    ]);
    // Nested F7 (plan-review R4): a javascript action reached through a
    // composite PARENT is opaque there too, not just at the direct site.
    expect(
      runBlocksOf(
        parse(
          "jobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: ./.github/actions/pjs\n      - run: echo after-nested-js\n",
        ),
        {
          "./.github/actions/pjs": parse(
            "runs:\n  using: composite\n  steps:\n    - uses: ./.github/actions/js3\n",
          ),
          "./.github/actions/js3": parse("runs:\n  using: node20\n  main: index.js\n"),
        },
      ),
    ).toEqual([{ run: "echo after-nested-js", guarded: false, poisoned: true }]);
    // R7/R8: an INVALID composite manifest — no steps, or any step shape
    // GitHub's runner schema rejects — fails the job at the use site, so
    // downstream never runs. Clean-composite readings were false coverage;
    // the shared validator makes both layers agree shape-for-shape.
    for (const body of [
      "runs:\n  using: composite\n",
      "runs:\n  using: composite\n  steps: nope\n",
      "runs:\n  using: composite\n  steps:\n    a: b\n",
      "runs:\n  using: composite\n  steps:\n",
      "runs:\n  using: composite\n  steps:\n    - just-a-string\n",
      "runs:\n  using: composite\n  steps:\n    - run: echo hi\n",
      "runs:\n  using: composite\n  steps:\n    - name: idle\n",
      "runs:\n  using: composite\n  steps:\n    - run: echo hi\n      shell: bash\n      uses: ./x\n",
      "runs:\n  using: composite\n  steps:\n    - uses: ./x\n      shell: bash\n",
      "runs:\n  using: composite\n  steps:\n    - run: echo hi\n      shell: bash\n      bogus: 1\n",
      "runs:\n  using: composite\n  steps:\n    - run:\n      shell: bash\n",
      "runs:\n  using: composite\n  steps:\n    - run: echo hi\n      shell:\n",
      "runs:\n  using: composite\n  steps:\n    - uses:\n",
    ]) {
      expect(
        runBlocksOf(
          parse(
            "jobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: ./.github/actions/bad\n      - run: echo after-bad\n",
          ),
          { "./.github/actions/bad": parse(body) },
        ),
        body,
      ).toEqual([{ run: "echo after-bad", guarded: false, poisoned: true }]);
    }
    // F8 (R1 escaping mutant #2): a composite may `uses:` another LOCAL
    // composite — resolution recurses, so a writing grandchild poisons the
    // rest of the parent AND the rest of the workflow job; a clean chain
    // poisons nothing.
    const parentUsing = parse(
      "runs:\n  using: composite\n  steps:\n    - uses: ./.github/actions/child\n    - run: echo parent-after\n      shell: bash\n",
    );
    const childWrites = parse(
      'runs:\n  using: composite\n  steps:\n    - run: echo "X=1" >> "$GITHUB_ENV"\n      shell: bash\n',
    );
    const childClean = parse(
      "runs:\n  using: composite\n  steps:\n    - run: echo child-ok\n      shell: bash\n",
    );
    const nestedUse = parse(
      "jobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: ./.github/actions/parent\n      - run: echo wf-after\n",
    );
    expect(
      runBlocksOf(nestedUse, {
        "./.github/actions/parent": parentUsing,
        "./.github/actions/child": childWrites,
      }),
    ).toEqual([
      { run: 'echo "X=1" >> "$GITHUB_ENV"', guarded: false, poisoned: false },
      { run: "echo parent-after", guarded: false, poisoned: true },
      { run: "echo wf-after", guarded: false, poisoned: true },
    ]);
    expect(
      runBlocksOf(nestedUse, {
        "./.github/actions/parent": parentUsing,
        "./.github/actions/child": childClean,
      }),
    ).toEqual([
      { run: "echo child-ok", guarded: false, poisoned: false },
      { run: "echo parent-after", guarded: false, poisoned: false },
      { run: "echo wf-after", guarded: false, poisoned: false },
    ]);
    // F8 cycle: fail-closed (GitHub rejects cyclic actions; the walker must
    // not hang or fail open). PATH-scoped seen-set: sequential REUSE of one
    // action in a job is legit and stays clean.
    const selfCycle = parse(
      "runs:\n  using: composite\n  steps:\n    - uses: ./.github/actions/cycle\n    - run: echo after-cycle\n      shell: bash\n",
    );
    const cycleUse = parse(
      "jobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: ./.github/actions/cycle\n      - run: echo wf-after\n",
    );
    expect(runBlocksOf(cycleUse, { "./.github/actions/cycle": selfCycle })).toEqual([
      { run: "echo after-cycle", guarded: false, poisoned: true },
      { run: "echo wf-after", guarded: false, poisoned: true },
    ]);
    const reuse = parse(
      "jobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: ./.github/actions/clean\n      - uses: ./.github/actions/clean\n      - run: echo wf-after\n",
    );
    expect(runBlocksOf(reuse, { "./.github/actions/clean": cleanAction })).toEqual([
      { run: "echo inside", guarded: false, poisoned: false },
      { run: "echo inside", guarded: false, poisoned: false },
      { run: "echo wf-after", guarded: false, poisoned: false },
    ]);
  });

  it("runBlocksOf poisons blocks governed by an off-allowlist static env: pair (static-env spec §2.2)", () => {
    const ALLOW = {
      GOOD_KEY: { values: [{ text: "v", governs: [] }], reason: "fixture-reviewed test pair" },
    };
    const rb = (yamlText: string, actions: Record<string, unknown> = {}) =>
      runBlocksOf(parse(yamlText), actions, ALLOW);
    // Workflow-root env governs every job (S1).
    expect(
      rb(
        "env:\n  PATH: fixtures/fake\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo a\n",
      ),
    ).toEqual([{ run: "echo a", guarded: false, poisoned: true }]);
    // Job env governs its own job only (S1 + cross-job precision twin).
    expect(
      rb(
        "jobs:\n  a:\n    runs-on: ubuntu-latest\n    env:\n      PATH: fixtures/fake\n    steps:\n      - run: echo dirty\n  b:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo clean\n",
      ),
    ).toEqual([
      { run: "echo dirty", guarded: false, poisoned: true },
      { run: "echo clean", guarded: false, poisoned: false },
    ]);
    // A workflow run-step's env is BLOCK-local: GitHub scoping says step env
    // does not leak to siblings, and over-poisoning forces reason-free rows.
    expect(
      rb(
        "jobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo dirty\n        env:\n          PATH: fixtures/fake\n      - run: echo later\n",
      ),
    ).toEqual([
      { run: "echo dirty", guarded: false, poisoned: true },
      { run: "echo later", guarded: false, poisoned: false },
    ]);
    // A uses: step handed dirty env poisons from that step onward (LS3
    // coarse — the action can do unmodellable things with a hostile env).
    expect(
      rb(
        "jobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n        env:\n          PATH: fixtures/fake\n      - run: echo later\n",
      ),
    ).toEqual([{ run: "echo later", guarded: false, poisoned: true }]);
    // A LOCAL uses: invocation carrying dirty env poisons the same way (final
    // review (a) finding 1): the shipped cell above pins only a REMOTE ref, so
    // `usesKind(s.uses) !== "local"` on the poison condition escaped it. The
    // resolved manifest is CLEAN, so only the invoking step's env can poison.
    const cleanBody = parse(
      "runs:\n  using: composite\n  steps:\n    - run: echo inside\n      shell: bash\n",
    );
    expect(
      rb(
        "jobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: ./.github/actions/a\n        env:\n          PATH: fixtures/fake\n      - run: echo later\n",
        { "./.github/actions/a": cleanBody },
      ),
      "local-uses-invocation",
    ).toEqual([
      { run: "echo inside", guarded: false, poisoned: true },
      { run: "echo later", guarded: false, poisoned: true },
    ]);
    // Precision twin: an allowlisted pair on the same local invocation stays
    // clean, so the cell cannot be satisfied by darking local invocations.
    expect(
      rb(
        "jobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: ./.github/actions/a\n        env:\n          GOOD_KEY: v\n      - run: echo later\n",
        { "./.github/actions/a": cleanBody },
      ),
      "local-uses-invocation-clean",
    ).toEqual([
      { run: "echo inside", guarded: false, poisoned: false },
      { run: "echo later", guarded: false, poisoned: false },
    ]);
    // Same shape INSIDE a manifest: a composite step invoking a LOCAL action
    // while carrying dirty env, at direct and nested depth.
    expect(
      rb(
        "jobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: ./.github/actions/a\n      - run: echo after\n",
        {
          "./.github/actions/a": parse(
            "runs:\n  using: composite\n  steps:\n    - uses: ./.github/actions/b\n      env:\n        PATH: fixtures/fake\n",
          ),
          "./.github/actions/b": cleanBody,
        },
      ),
      "composite-direct-local-uses",
    ).toEqual([
      { run: "echo inside", guarded: false, poisoned: true },
      { run: "echo after", guarded: false, poisoned: true },
    ]);
    expect(
      rb(
        "jobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: ./.github/actions/a\n      - run: echo after\n",
        {
          "./.github/actions/a": parse(
            "runs:\n  using: composite\n  steps:\n    - uses: ./.github/actions/b\n",
          ),
          "./.github/actions/b": parse(
            "runs:\n  using: composite\n  steps:\n    - uses: ./.github/actions/c\n      env:\n        PATH: fixtures/fake\n",
          ),
          "./.github/actions/c": cleanBody,
        },
      ),
      "composite-nested-local-uses",
    ).toEqual([
      { run: "echo inside", guarded: false, poisoned: true },
      { run: "echo after", guarded: false, poisoned: true },
    ]);
    // Position matrix for the census's own iteration (final review (a) R4):
    // every dirty job / run-step / uses-step source above sits at position 0,
    // so a first-job-only or first-step-only check escaped them all.
    expect(
      rb(
        "jobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo clean\n  z:\n    runs-on: ubuntu-latest\n    env:\n      PATH: fixtures/fake\n    steps:\n      - run: echo dirty\n",
      ),
      "dirty-second-job",
    ).toEqual([
      { run: "echo clean", guarded: false, poisoned: false },
      { run: "echo dirty", guarded: false, poisoned: true },
    ]);
    // Dirty SECOND run-step — first step clean; step env stays block-local.
    expect(
      rb(
        "jobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo clean\n      - run: echo dirty\n        env:\n          PATH: fixtures/fake\n",
      ),
      "dirty-second-run-step",
    ).toEqual([
      { run: "echo clean", guarded: false, poisoned: false },
      { run: "echo dirty", guarded: false, poisoned: true },
    ]);
    // Dirty SECOND uses-step — first uses-step clean; poisons onward.
    expect(
      rb(
        "jobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/cache@v4\n        env:\n          PATH: fixtures/fake\n      - run: echo later\n",
      ),
      "dirty-second-uses-step",
    ).toEqual([{ run: "echo later", guarded: false, poisoned: true }]);
    // Dirt in a LATER composite sibling (final review (a) R3): every other
    // cell puts the dirty step first or alone, so a first-sibling-only
    // regression — or recursion into only the first `uses:` — passed them all.
    // Each fixture below has a CLEAN first sibling.
    expect(
      rb(
        "jobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: ./.github/actions/a\n      - run: echo after\n",
        {
          "./.github/actions/a": parse(
            "runs:\n  using: composite\n  steps:\n    - run: echo clean\n      shell: bash\n    - run: echo dirty\n      shell: bash\n      env:\n        PATH: fixtures/fake\n",
          ),
        },
      ),
      "late-run-sibling",
    ).toEqual([
      { run: "echo clean", guarded: false, poisoned: false },
      { run: "echo dirty", guarded: false, poisoned: true },
      { run: "echo after", guarded: false, poisoned: true },
    ]);
    expect(
      rb(
        "jobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: ./.github/actions/a\n      - run: echo after\n",
        {
          "./.github/actions/a": parse(
            "runs:\n  using: composite\n  steps:\n    - uses: actions/checkout@v4\n    - uses: actions/cache@v4\n      env:\n        PATH: fixtures/fake\n",
          ),
        },
      ),
      "late-uses-sibling",
    ).toEqual([{ run: "echo after", guarded: false, poisoned: true }]);
    // Dirt behind the SECOND `uses:`, one level down — kills first-use-only
    // recursion, which no direct cell can see.
    expect(
      rb(
        "jobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: ./.github/actions/a\n      - run: echo after\n",
        {
          "./.github/actions/a": parse(
            "runs:\n  using: composite\n  steps:\n    - uses: actions/checkout@v4\n    - uses: ./.github/actions/b\n",
          ),
          "./.github/actions/b": parse(
            "runs:\n  using: composite\n  steps:\n    - run: echo inside\n      shell: bash\n      env:\n        PATH: fixtures/fake\n",
          ),
        },
      ),
      "late-nested-local-uses",
    ).toEqual([
      { run: "echo inside", guarded: false, poisoned: true },
      { run: "echo after", guarded: false, poisoned: true },
    ]);
    // Precision twin: a clean LATER sibling must stay clean.
    expect(
      rb(
        "jobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: ./.github/actions/a\n      - run: echo after\n",
        {
          "./.github/actions/a": parse(
            "runs:\n  using: composite\n  steps:\n    - run: echo clean\n      shell: bash\n    - run: echo also-clean\n      shell: bash\n      env:\n        GOOD_KEY: v\n",
          ),
        },
      ),
      "clean-late-sibling",
    ).toEqual([
      { run: "echo clean", guarded: false, poisoned: false },
      { run: "echo also-clean", guarded: false, poisoned: false },
      { run: "echo after", guarded: false, poisoned: false },
    ]);
    // Composite matrix (spec §7 R1): direct/nested × run/uses cells.
    const directRun = parse(
      "runs:\n  using: composite\n  steps:\n    - run: echo inside\n      shell: bash\n      env:\n        PATH: fixtures/fake\n",
    );
    expect(
      rb(
        "jobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: ./.github/actions/a\n      - run: echo after\n",
        { "./.github/actions/a": directRun },
      ),
      "direct-run",
    ).toEqual([
      { run: "echo inside", guarded: false, poisoned: true },
      { run: "echo after", guarded: false, poisoned: true },
    ]);
    const directUses = parse(
      "runs:\n  using: composite\n  steps:\n    - uses: actions/checkout@v4\n      env:\n        PATH: fixtures/fake\n",
    );
    expect(
      rb(
        "jobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: ./.github/actions/a\n      - run: echo after\n",
        { "./.github/actions/a": directUses },
      ),
      "direct-uses",
    ).toEqual([{ run: "echo after", guarded: false, poisoned: true }]);
    const parentDoc = parse(
      "runs:\n  using: composite\n  steps:\n    - uses: ./.github/actions/b\n",
    );
    expect(
      rb(
        "jobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: ./.github/actions/a\n      - run: echo after\n",
        { "./.github/actions/a": parentDoc, "./.github/actions/b": directRun },
      ),
      "nested-run",
    ).toEqual([
      { run: "echo inside", guarded: false, poisoned: true },
      { run: "echo after", guarded: false, poisoned: true },
    ]);
    expect(
      rb(
        "jobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: ./.github/actions/a\n      - run: echo after\n",
        { "./.github/actions/a": parentDoc, "./.github/actions/b": directUses },
      ),
      "nested-uses",
    ).toEqual([{ run: "echo after", guarded: false, poisoned: true }]);
    // Standalone composite-doc entry — the ninth modeled site (spec §7 R1
    // class-sweep): a dirty step poisons itself AND the rest of the action.
    expect(
      rb(
        "runs:\n  using: composite\n  steps:\n    - run: echo x\n      shell: bash\n      env:\n        PATH: fixtures/fake\n    - run: echo y\n      shell: bash\n",
      ),
    ).toEqual([
      { run: "echo x", guarded: false, poisoned: true },
      { run: "echo y", guarded: false, poisoned: true },
    ]);
    // S2 prototype-named key; S7 novel value for an allowlisted key.
    expect(
      rb(
        "jobs:\n  j:\n    runs-on: ubuntu-latest\n    env:\n      constructor: v\n    steps:\n      - run: echo a\n",
      ),
      "constructor",
    ).toEqual([{ run: "echo a", guarded: false, poisoned: true }]);
    expect(
      rb(
        "jobs:\n  j:\n    runs-on: ubuntu-latest\n    env:\n      GOOD_KEY: other\n    steps:\n      - run: echo a\n",
      ),
      "novel value",
    ).toEqual([{ run: "echo a", guarded: false, poisoned: true }]);
    // Precision twins: the pinned pair at every scope stays clean —
    // root/job/run-step, uses:-step, and the composite cells (plan-R1 F1:
    // a missing clean cell lets a coarsening mutant escape at that scope).
    expect(
      rb(
        "env:\n  GOOD_KEY: v\njobs:\n  j:\n    runs-on: ubuntu-latest\n    env:\n      GOOD_KEY: v\n    steps:\n      - run: echo a\n        env:\n          GOOD_KEY: v\n",
      ),
      "pinned pair",
    ).toEqual([{ run: "echo a", guarded: false, poisoned: false }]);
    expect(
      rb(
        "jobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n        env:\n          GOOD_KEY: v\n      - run: echo later\n",
      ),
      "clean uses-step",
    ).toEqual([{ run: "echo later", guarded: false, poisoned: false }]);
    const cleanDirectRun = parse(
      "runs:\n  using: composite\n  steps:\n    - run: echo inside\n      shell: bash\n      env:\n        GOOD_KEY: v\n",
    );
    expect(
      rb(
        "jobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: ./.github/actions/a\n      - run: echo after\n",
        { "./.github/actions/a": cleanDirectRun },
      ),
      "clean direct-run",
    ).toEqual([
      { run: "echo inside", guarded: false, poisoned: false },
      { run: "echo after", guarded: false, poisoned: false },
    ]);
    const cleanDirectUses = parse(
      "runs:\n  using: composite\n  steps:\n    - uses: actions/checkout@v4\n      env:\n        GOOD_KEY: v\n",
    );
    expect(
      rb(
        "jobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: ./.github/actions/a\n      - run: echo after\n",
        { "./.github/actions/a": cleanDirectUses },
      ),
      "clean direct-uses",
    ).toEqual([{ run: "echo after", guarded: false, poisoned: false }]);
    expect(
      rb(
        "jobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: ./.github/actions/a\n      - run: echo after\n",
        { "./.github/actions/a": parentDoc, "./.github/actions/b": cleanDirectRun },
      ),
      "clean nested-run",
    ).toEqual([
      { run: "echo inside", guarded: false, poisoned: false },
      { run: "echo after", guarded: false, poisoned: false },
    ]);
    expect(
      rb(
        "jobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: ./.github/actions/a\n      - run: echo after\n",
        { "./.github/actions/a": parentDoc, "./.github/actions/b": cleanDirectUses },
      ),
      "clean nested-uses",
    ).toEqual([{ run: "echo after", guarded: false, poisoned: false }]);
  });

  it("a static-env-poisoned classifying line routes registry-or-loud with the generalized why-string (static-env spec §2.2)", () => {
    // Integration: runBlocksOf output feeds censusInvocations exactly as the
    // census does it — a dirty job's classifying line is a problem naming
    // the generalized why (not silently classified, not the write-only why).
    const ALLOW = {
      GOOD_KEY: { values: [{ text: "v", governs: [] }], reason: "fixture-reviewed test pair" },
    };
    const blocks = runBlocksOf(
      parse(
        "jobs:\n  j:\n    runs-on: ubuntu-latest\n    env:\n      PATH: fixtures/fake\n    steps:\n      - run: pnpm exec playwright test tests/e2e/foo.spec.ts\n",
      ),
      {},
      ALLOW,
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.poisoned).toBe(true);
    const { invoked, problems } = censusInvocations(
      blocks.map((b) => ({ text: b.run, guarded: b.guarded, poisoned: b.poisoned })),
      [],
    );
    expect(invoked.size).toBe(0);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(
      "environment poisoned by a same-job GITHUB_ENV/GITHUB_PATH write or an unmodelled static env: key",
    );
  });

  it("wrapper closure sees runner global options and run-script; forwarding through them is loud (R7 F3)", () => {
    const names = transitivePwScriptNames({
      base: "playwright test",
      wrap: "pnpm --silent base",
      wrap2: "npm run-script wrap",
      unrelated: "eslint .",
    });
    expect([...names].sort()).toEqual(["base", "wrap", "wrap2"]);
    for (const form of [
      "pnpm --silent wrap --config ghost.ts",
      "yarn --cwd . base --config=ghost.ts",
      "npm run-script wrap2 -- --config ghost.ts",
    ]) {
      const r = censusInvocations([form], names);
      expect(r.problems, form).not.toEqual([]);
      expect(r.invoked.size, form).toBe(0);
    }
  });

  it("closure reaches through value-taking runner options and registry-classified bodies (R8)", () => {
    // Value-taking options separate the runner from the script name with a
    // bare value token ("yarn --cwd . base") — the closure must still reach
    // the name. Over-inclusion is SAFE here: closure membership only ever
    // ADDS loudness.
    for (const wrap of [
      "yarn --cwd . base",
      "npm --prefix . run base",
      "pnpm --filter . base",
      "bun --cwd . run base",
    ]) {
      const names = transitivePwScriptNames({ base: "playwright test", wrap });
      expect([...names].sort(), wrap).toEqual(["base", "wrap"]);
    }
    // A REGISTERED body with declared config contributions is a playwright
    // invocation the census already trusts — it must seed the closure too,
    // or forwarding through its wrapper stays silent.
    const regLine = 'docker run img bash -lc "pnpm exec playwright test --config x.ts"';
    const names = transitivePwScriptNames(
      { reg: regLine, wrap: "pnpm --silent reg", inert: "git status" },
      { [regLine]: ["x.ts"] },
    );
    expect([...names].sort()).toEqual(["reg", "wrap"]);
    const r = censusInvocations(["pnpm wrap --config ghost.ts"], names);
    expect(r.problems).not.toEqual([]);
    expect(r.invoked.size).toBe(0);
    // R9 G3: registry seeding must join LOGICAL lines exactly as the census
    // does — a registered continuation body is a seed too.
    const contNames = transitivePwScriptNames(
      { reg: "playwright \\\ntest --config known.ts", wrap: "pnpm reg" },
      { "playwright test --config known.ts": ["known.ts"] },
    );
    expect([...contNames].sort()).toEqual(["reg", "wrap"]);
  });

  it("config-set tripwire: invocation census + filename belt both equal the known config set", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    const scripts = pkg.scripts as Record<string, string>;
    const texts: Array<string | { text: string; guarded?: boolean; poisoned?: boolean }> =
      Object.values(scripts);
    // Local composite actions execute run blocks no workflow file textually
    // contains — same universe, same census (R7 F4). Spec §2.1: their steps
    // are SPLICED at each use site (per-job guard + cross-step env-poison
    // state both compose there), so the map is built BEFORE the workflow
    // walk and the old separate used-action append is gone — appended-flat
    // blocks would have lost the job context the splice exists to model.
    //
    // ONLY the GitHub-recognized manifest keys the map (spec R2 BLOCKING):
    // keying every yml under an action dir let a supplemental clean YAML
    // OVERWRITE the parsed action.yml under the same directory key,
    // masquerading a javascript action as a clean composite. GitHub reads
    // action.yml (preferred) or action.yaml — nothing else executes.
    const actionDocs: Record<string, unknown> = {};
    const actionFiles = walkFiles(join(ROOT, ".github", "actions")).filter(
      (f) => f.endsWith(".yml") || f.endsWith(".yaml"),
    );
    const actionDirOf = (p: string) =>
      `./${relative(ROOT, p)
        .split(sep)
        .join("/")
        .replace(/\/[^/]+$/, "")}`;
    const manifestByDir = new Map<string, string>();
    for (const p of actionFiles) {
      if (!/(^|\/)action\.ya?ml$/.test(relative(ROOT, p).split(sep).join("/"))) continue;
      const dir = actionDirOf(p);
      const prev = manifestByDir.get(dir);
      if (prev === undefined || p.endsWith("action.yml")) manifestByDir.set(dir, p);
    }
    for (const [dir, p] of manifestByDir) {
      actionDocs[dir] = parse(readFileSync(p, "utf8"));
    }
    // Non-manifest YAML under an action dir never executes — playwright text
    // there is dead text posing as surface (same R9 G1 rule as unreferenced
    // actions), and it must not exist even in a USED action's directory.
    for (const p of actionFiles) {
      if (manifestByDir.get(actionDirOf(p)) === p) continue;
      expect(
        /playwr/.test(readFileSync(p, "utf8")),
        `non-manifest ${relative(ROOT, p)} under a local action dir mentions playwright — dead text posing as surface`,
      ).toBe(false);
    }
    const usedActionDirs = new Set<string>();
    const wfDir = join(ROOT, ".github", "workflows");
    for (const wfPath of readdirSync(wfDir).filter(
      (f) => f.endsWith(".yml") || f.endsWith(".yaml"),
    )) {
      const doc = parse(readFileSync(join(wfDir, wfPath), "utf8"));
      texts.push(
        ...runBlocksOf(doc, actionDocs).map((b) => ({
          text: b.run,
          guarded: b.guarded,
          poisoned: b.poisoned,
        })),
      );
      for (const j of Object.values(
        ((doc.jobs ?? {}) as Record<string, { steps?: Array<{ uses?: unknown }> }>) ?? {},
      )) {
        for (const s of j.steps ?? []) {
          if (typeof s.uses === "string" && s.uses.startsWith("./")) usedActionDirs.add(s.uses);
        }
      }
    }
    // An action NO workflow references cannot legitimately register a
    // playwright invocation — its contributions would be dead text posing as
    // live surface (R9 G1).
    for (const [dir] of manifestByDir) {
      if (usedActionDirs.has(dir)) continue;
      for (const b of runBlocksOf(actionDocs[dir])) {
        expect(
          /playwr/.test(b.run),
          `unreferenced local action ${dir} invokes playwright — reference it or remove it`,
        ).toBe(false);
      }
    }
    // Transitive closure: a script whose body invokes another playwright-
    // wrapping script (via any runner form, including runner global options)
    // is itself playwright-wrapping — the multi-hop forwarding route
    // composes the same way the one-hop route does.
    const pwScriptNames = transitivePwScriptNames(scripts, COMPLEX_INVOCATION_REGISTRY);
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
    // LAYERED CONTRACT (R11). This equality is a PRESENCE claim, not a
    // liveness claim: every config's invocation text survives somewhere
    // censusable, and no unknown config's text exists anywhere. That a
    // present invocation actually EXECUTES AND COMPLETES is unprovable from
    // text (the axiom above) and is owned by the OBSERVATION layer instead:
    //   - tests/e2e/standalone.config.ts → the §4 run-report comparator
    //     (executed-test identity multisets vs committed baseline) on every
    //     real standalone-e2e run;
    //   - playwright.config.ts → the required e2e workflows' pinned run
    //     steps going green on every PR;
    //   - visual/screenshots configs → the drift gates comparing committed
    //     bytes against pinned-container captures.
    // The census's job ends at: text present, nothing unknown, nothing
    // unclassifiable — every liveness-threatening construct (control flow,
    // guards, chains, backgrounding, piping, state-changers) is refused
    // above rather than modeled.
    expect([...invoked].sort()).toEqual([...CONFIGS].sort());

    const belt = walkFiles(ROOT)
      .map((p) => relative(ROOT, p).split(sep).join("/"))
      .filter((p) => /(^|\/)playwright[^/]*\.config\.[^/]+$/.test(p))
      .sort();
    expect(belt).toEqual(["playwright.config.ts", "playwright.screenshots.config.ts"]);
  });
});
