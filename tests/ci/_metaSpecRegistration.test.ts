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
export type RunBlock = { run: string; guarded: boolean };
type StepShape = { run?: unknown; if?: unknown; shell?: unknown };
// bash and sh are the semantics the census models; any other shell
// reinterprets the block (R10 — `shell: python {0}` can discard it).
const customShell = (s: StepShape) =>
  s.shell !== undefined && !/^(?:bash|sh)$/.test(String(s.shell).trim());
export function runBlocksOf(doc: unknown): RunBlock[] {
  const out: RunBlock[] = [];
  const jobs = (
    doc as {
      jobs?: Record<
        string,
        { if?: unknown; needs?: unknown; strategy?: unknown; steps?: StepShape[] }
      >;
    }
  )?.jobs;
  for (const j of Object.values(jobs ?? {})) {
    // needs: a failed/skipped dependency skips the whole job; strategy: an
    // empty matrix executes nothing — both are execution context (R10).
    const jobGuarded = j.if !== undefined || j.needs !== undefined || j.strategy !== undefined;
    for (const s of j.steps ?? []) {
      if (typeof s.run === "string")
        out.push({ run: s.run, guarded: jobGuarded || s.if !== undefined || customShell(s) });
    }
  }
  const actionSteps = (doc as { runs?: { steps?: StepShape[] } })?.runs?.steps;
  for (const s of actionSteps ?? []) {
    if (typeof s.run === "string")
      out.push({ run: s.run, guarded: s.if !== undefined || customShell(s) });
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
  texts: Array<string | { text: string; guarded?: boolean }>,
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
  // exit/return/exec/set/eval count only at COMMAND POSITION (line start or
  // after ;) — `pnpm exec playwright` is a runner subcommand, not bash exec.
  const controlFlowRe =
    /(?:^|\s)(?:if|then|else|elif|fi|case|esac|while|until|for|done)(?:\s|;|$)|\bfunction\s+\w+|\(\)\s*\{|[({]\s*$|^\s*[)}]|(?:&&|\|\|)\s*$|(?:^|;)\s*(?:exit|return|exec|set|eval)\b/;
  const fwd = pwScriptNames.length > 0 ? runnerScriptRe(pwScriptNames, "([^\\n]*)") : null;
  for (const item of texts) {
    const raw = typeof item === "string" ? item : item.text;
    const guarded = typeof item !== "string" && item.guarded === true;
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
    const contextWhy = guarded
      ? "context-guarded step (if:/needs/strategy/custom shell)"
      : logical.some(({ line }) => controlFlowRe.test(line))
        ? "shell control-flow context"
        : logical.some(({ line }) => endsInOpenQuote(line))
          ? "multiline lexical context"
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
    'pnpm exec playwright test --reporter=list --project=desktop-chromium tests/e2e/admin-layout-dimensions.spec.ts -g "width chain"':
      ["playwright.config.ts"],
    'pnpm exec playwright test --project=mobile-safari tests/e2e/admin-lifecycle-transitions.spec.ts -g "Published toggle round-trip" --repeat-each="$REPEATS" --retries=0 --trace=on':
      ["playwright.config.ts"],
    // The plain branch of the same if/fi step (lifecycle-layout-e2e.yml):
    // in-text control flow forces every playwright line in that run block
    // through the registry (R9 G1).
    "pnpm exec playwright test --project=mobile-safari tests/e2e/admin-lifecycle-transitions.spec.ts":
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
      "jobs:\n  j:\n    steps:\n      - run: echo wf-step\n      - uses: x/y\n      - run: echo guarded-step\n        if: failure()\n",
    );
    const actionDoc = parse(
      "name: setup\nruns:\n  using: composite\n  steps:\n    - run: echo action-step\n      shell: bash\n",
    );
    expect(runBlocksOf(wfDoc)).toEqual([
      { run: "echo wf-step", guarded: false },
      { run: "echo guarded-step", guarded: true },
    ]);
    expect(runBlocksOf(actionDoc)).toEqual([{ run: "echo action-step", guarded: false }]);
    // Job-level if: guards every step in the job (R9 G1).
    const guardedJob = parse("jobs:\n  j:\n    if: false\n    steps:\n      - run: echo x\n");
    expect(runBlocksOf(guardedJob)).toEqual([{ run: "echo x", guarded: true }]);
    // R10: needs (dependency may fail → job skipped), strategy (matrix may
    // be empty), and a custom shell (reinterprets the block) are execution
    // context too. bash/sh shells stay unguarded; composite actions REQUIRE
    // an explicit shell, so bash there is not context.
    expect(
      runBlocksOf(parse("jobs:\n  j:\n    needs: build\n    steps:\n      - run: echo x\n")),
    ).toEqual([{ run: "echo x", guarded: true }]);
    expect(
      runBlocksOf(
        parse(
          "jobs:\n  j:\n    strategy:\n      matrix:\n        s: [1]\n    steps:\n      - run: echo x\n",
        ),
      ),
    ).toEqual([{ run: "echo x", guarded: true }]);
    expect(
      runBlocksOf(parse("jobs:\n  j:\n    steps:\n      - run: echo x\n        shell: python\n")),
    ).toEqual([{ run: "echo x", guarded: true }]);
    expect(
      runBlocksOf(parse("jobs:\n  j:\n    steps:\n      - run: echo x\n        shell: bash\n")),
    ).toEqual([{ run: "echo x", guarded: false }]);
    expect(
      runBlocksOf(
        parse(
          "runs:\n  using: composite\n  steps:\n    - run: echo a\n      shell: bash\n    - run: echo b\n      shell: python\n",
        ),
      ),
    ).toEqual([
      { run: "echo a", guarded: false },
      { run: "echo b", guarded: true },
    ]);
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
    const texts: Array<string | { text: string; guarded?: boolean }> = Object.values(scripts);
    const usedActionDirs = new Set<string>();
    const wfDir = join(ROOT, ".github", "workflows");
    for (const wfPath of readdirSync(wfDir).filter(
      (f) => f.endsWith(".yml") || f.endsWith(".yaml"),
    )) {
      const doc = parse(readFileSync(join(wfDir, wfPath), "utf8"));
      texts.push(...runBlocksOf(doc).map((b) => ({ text: b.run, guarded: b.guarded })));
      for (const j of Object.values(
        ((doc.jobs ?? {}) as Record<string, { steps?: Array<{ uses?: unknown }> }>) ?? {},
      )) {
        for (const s of j.steps ?? []) {
          if (typeof s.uses === "string" && s.uses.startsWith("./")) usedActionDirs.add(s.uses);
        }
      }
    }
    // Local composite actions execute run blocks no workflow file textually
    // contains — same universe, same census (R7 F4). An action NO workflow
    // references cannot legitimately register a playwright invocation — its
    // contributions would be dead text posing as live surface (R9 G1).
    for (const p of walkFiles(join(ROOT, ".github", "actions")).filter(
      (f) => f.endsWith(".yml") || f.endsWith(".yaml"),
    )) {
      const actionDir = `./${relative(ROOT, p)
        .split(sep)
        .join("/")
        .replace(/\/[^/]+$/, "")}`;
      const blocks = runBlocksOf(parse(readFileSync(p, "utf8")));
      if (usedActionDirs.has(actionDir)) {
        texts.push(...blocks.map((b) => ({ text: b.run, guarded: b.guarded })));
      } else {
        for (const b of blocks) {
          expect(
            /playwr/.test(b.run),
            `unreferenced local action ${actionDir} invokes playwright — reference it or remove it`,
          ).toBe(false);
        }
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
    expect([...invoked].sort()).toEqual([...CONFIGS].sort());

    const belt = walkFiles(ROOT)
      .map((p) => relative(ROOT, p).split(sep).join("/"))
      .filter((p) => /(^|\/)playwright[^/]*\.config\.[^/]+$/.test(p))
      .sort();
    expect(belt).toEqual(["playwright.config.ts", "playwright.screenshots.config.ts"]);
  });
});
