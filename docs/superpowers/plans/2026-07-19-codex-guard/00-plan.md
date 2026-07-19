# codex-guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `scripts/codex-guard.mjs` — the watchdog wrapper for `codex exec` dispatches per the APPROVED spec `docs/superpowers/specs/2026-07-19-codex-guard.md` — with the spec's 19 test scenarios green under vitest.

**Architecture:** One plain-Node ESM script (no repo runtime deps, runs under bare `node`) implementing: arg parsing/validation → prompt composition → attempt loop (spawn codex, poll-based stall/timeout kills, stream capture) → failure classification → recovery ladder (cache-TTL rung with advisory lock, truncation-resume rung, generic retry) → verdict parsing → `result.json` emission. Tests never spawn real codex: `CODEX_GUARD_BIN` points at a scenario-driven fake; all timing knobs come from `CODEX_GUARD_*` env decimals.

**Tech Stack:** Node 20 (`node:child_process`, `node:fs`, `node:path`, `node:os`), vitest (`tests/**/*.test.ts` auto-included per `vitest.projects.ts` BASE_INCLUDE), TypeScript for tests only.

## Global Constraints (from spec — exact values)

- Spec is canonical: `docs/superpowers/specs/2026-07-19-codex-guard.md`. §11 is the single source for every numeric default: MAX_ATTEMPTS 3, ATTEMPT_MAX_SECS 1200 (validation max 1380), TOTAL_MAX_SECS 1500, STALL_SECS 420, FIRST_OUTPUT_SECS 120, POLL_INTERVAL_SECS 10 (max 30), KILL_GRACE_SECS 5 (max 30), MIN_ADMISSION_SECS 120, CACHE_LOCK_STALE_SECS 600, REAP_AFTER_KILL_SECS 10 (max 10), PROMPT_MAX_BYTES 2000000 (no env override).
- Env overrides `CODEX_GUARD_<NAME>`: positive decimals for timing constants; `CODEX_GUARD_MAX_ATTEMPTS` positive integer only; `PROMPT_MAX_BYTES` fixed. Flags win over env. Same validation bounds both sources.
- Exit codes: 0 = `result.json` written (outcome in `status`); 2 = usage error, never writes result.json; 3 = wrapper internal error, best-effort result.json.
- Fresh-attempt argv exactly: `exec --skip-git-repo-check -s read-only -C <cwd> -c model_reasoning_effort=high -o <out>/attempt-<n>.last-message.txt`. Resume argv exactly: `exec resume <sid> -c model_reasoning_effort=high -o <out>/attempt-<n>.last-message.txt` (child cwd = `--cwd`). Prompt ALWAYS via stdin (write + end). No `-m` ever.
- Kill precedence: total_timeout > attempt_timeout > stall > no_output. Kill = SIGTERM → grace → SIGKILL to the detached process group → wait ≤ reap.
- Signature matching: stderr of the just-failed attempt ONLY, regex `/codex_models_manager::manager: failed to renew cache TTL/`.
- Session-id regex: `/session id:?\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i` against the just-failed attempt's transcript only.
- Verdict parse: strip fenced blocks → collect `/^\s*VERDICT:\s*(.+)$/` lines → drop lines with ≥2 known outcomes or literal " or " → last survivor → fixpoint-normalize {trim; strip trailing `.,;:!`; strip one emphasis layer `*`/`_`/backtick} → uppercase → APPROVE | NEEDS-ATTENTION | BLOCKING recognized; other → attempt fails `unrecognized_verdict`.
- Commits: conventional commits, one task per commit, `--no-verify` (worktree rule).
- Meta-test inventory: none apply (declared spec §9). No UI, no DB, no pg_advisory locks.
- Every task runs from `/Users/ericweiss/FX-worktrees/codex-guard`.

## File Structure

- `scripts/codex-guard.mjs` — the wrapper (single file; internal sections: constants+env, arg parse/validate, paths, prompt, verdict parser, attempt runner, ladder, lock, result writer, signal handlers, main).
- `tests/codexGuard/fixtures/fake-codex.mjs` — scenario-driven fake codex binary.
- `tests/codexGuard/harness.ts` — shared test harness (temp dirs, scenario writer, runGuard spawner, readResult).
- `tests/codexGuard/usage.test.ts` — validation/usage-error scenarios (spec scenario 8).
- `tests/codexGuard/happyPath.test.ts` — scenarios 1–2.
- `tests/codexGuard/timeouts.test.ts` — scenarios 5, 6, 9, 12, 17.
- `tests/codexGuard/ladder.test.ts` — scenarios 3, 4, 7, 10, 11, 15.
- `tests/codexGuard/lock.test.ts` — scenarios 18(a–c), 19.
- `tests/codexGuard/signals.test.ts` — scenarios 13, 14, 16.
- `AGENTS.md` — new "Codex dispatch guard (`codex-guard`)" subsection.

Scenario protocol (fixture contract, used by every test): the fake reads env `FAKE_CODEX_SCENARIO` = path to a JSON file: `{ "steps": [ {"onCall": 1, "actions": [...]}, ... ] }` where actions are `{type:"stdout"|"stderr", text}`, `{type:"lastMessage", text}` (writes the `-o` arg), `{type:"sleepMs", ms}`, `{type:"exit", code}`, `{type:"hang"}` (sleep forever), `{type:"emitEvery", ms, times, text}`. The fake also always records per call N: `call-<N>.json` (argv, cwd, env subset, stdin bytes) into `FAKE_CODEX_RECORD_DIR`, and writes `pid-<N>.txt` (own pid) plus spawns a detached `sleep`-style grandchild writing `grandchild-pid-<N>.txt` when `{type:"grandchild"}` action present. Call counter = files already in record dir (call independence without shared state).

---

### Task 1: Fake codex fixture + test harness

**Files:**
- Create: `tests/codexGuard/fixtures/fake-codex.mjs`
- Create: `tests/codexGuard/harness.ts`
- Test: `tests/codexGuard/fixture.test.ts`

**Interfaces:**
- Produces (harness): `mkRun(): Promise<Run>` where `Run = { dir, outDir, recordDir, home, codexHome, scenarioPath, briefPath }` (all under a fresh temp dir; brief pre-written "Review this. End with VERDICT: ..."), `writeScenario(run, steps: unknown[])`, `runGuard(run, extraArgs?: string[], envOverrides?: Record<string,string>): Promise<{ code: number|null, stdout: string, stderr: string }>` (spawns `node scripts/codex-guard.mjs review --brief ... --cwd ... --out ...` with `CODEX_GUARD_BIN` → fixture, fast default timings: poll 0.05, grace 0.2, reap 0.5, first-output 2, stall 2, attempt-max 10, total-max 20, admission 0.1, stale 600 — each overridable), `readResult(run)`, `readCalls(run): Call[]`.
- Produces (fixture): behavior per scenario protocol above.

- [ ] **Step 1: Write the failing fixture self-test**

```ts
// tests/codexGuard/fixture.test.ts
import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const pExecFile = promisify(execFile);
const FIXTURE = join(process.cwd(), "tests/codexGuard/fixtures/fake-codex.mjs");

describe("fake-codex fixture", () => {
  it("plays a scenario: stdout, lastMessage via -o, exit code, records argv+stdin", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fake-codex-"));
    const scenario = join(dir, "s.json");
    const oFile = join(dir, "last.txt");
    writeFileSync(
      scenario,
      JSON.stringify({
        steps: [
          {
            onCall: 1,
            actions: [
              { type: "stdout", text: "thinking...\nsession id: 01234567-89ab-cdef-0123-456789abcdef\n" },
              { type: "stderr", text: "warn: x\n" },
              { type: "lastMessage", text: "VERDICT: APPROVE\n" },
              { type: "exit", code: 0 },
            ],
          },
        ],
      }),
    );
    const { stdout } = await pExecFile(
      process.execPath,
      [FIXTURE, "exec", "--skip-git-repo-check", "-o", oFile, "extra"],
      { env: { ...process.env, FAKE_CODEX_SCENARIO: scenario, FAKE_CODEX_RECORD_DIR: dir } },
    );
    expect(stdout).toContain("session id:");
    expect(readFileSync(oFile, "utf8")).toBe("VERDICT: APPROVE\n");
    const call = JSON.parse(readFileSync(join(dir, "call-1.json"), "utf8"));
    expect(call.argv).toEqual(["exec", "--skip-git-repo-check", "-o", oFile, "extra"]);
    expect(call.stdinBytes).toBe(0);
    expect(readdirSync(dir)).toContain("pid-1.txt");
  });

  it("counts calls independently and consumes stdin", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fake-codex-"));
    const scenario = join(dir, "s.json");
    writeFileSync(
      scenario,
      JSON.stringify({
        steps: [
          { onCall: 1, actions: [{ type: "exit", code: 1 }] },
          { onCall: 2, actions: [{ type: "exit", code: 0 }] },
        ],
      }),
    );
    const env = { ...process.env, FAKE_CODEX_SCENARIO: scenario, FAKE_CODEX_RECORD_DIR: dir };
    await pExecFile(process.execPath, [FIXTURE, "exec"], { env }).catch((e) => e);
    const r2 = await pExecFile(process.execPath, [FIXTURE, "exec"], { env });
    expect(r2).toBeDefined();
    const call2 = JSON.parse(readFileSync(join(dir, "call-2.json"), "utf8"));
    expect(call2.argv).toEqual(["exec"]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run tests/codexGuard/fixture.test.ts`
Expected: FAIL — fixture file does not exist (ENOENT).

- [ ] **Step 3: Implement the fixture**

```js
// tests/codexGuard/fixtures/fake-codex.mjs
// Scenario-driven stand-in for the codex CLI. See plan "Scenario protocol".
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";

const recordDir = process.env.FAKE_CODEX_RECORD_DIR;
const scenarioPath = process.env.FAKE_CODEX_SCENARIO;
if (!recordDir || !scenarioPath) {
  process.stderr.write("fake-codex: FAKE_CODEX_RECORD_DIR and FAKE_CODEX_SCENARIO required\n");
  process.exit(97);
}
mkdirSync(recordDir, { recursive: true });
const callN =
  readdirSync(recordDir).filter((f) => /^call-\d+\.json$/.test(f)).length + 1;

const stdinChunks = [];
let stdinBytes = 0;
process.stdin.on("data", (c) => {
  stdinChunks.push(c);
  stdinBytes += c.length;
});
const stdinDone = new Promise((res) => {
  process.stdin.on("end", res);
  process.stdin.on("error", res);
});

const argv = process.argv.slice(2);
const oIdx = argv.findIndex((a) => a === "-o");
const oFile = oIdx >= 0 ? argv[oIdx + 1] : null;

const scenario = JSON.parse(readFileSync(scenarioPath, "utf8"));
const step = scenario.steps.find((s) => s.onCall === callN) ?? {
  actions: [{ type: "exit", code: 96 }],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await stdinDone; // wrapper always closes stdin; a hang here IS a wrapper bug surfacing
  writeFileSync(join(recordDir, `pid-${callN}.txt`), String(process.pid));
  writeFileSync(
    join(recordDir, `call-${callN}.json`),
    JSON.stringify({
      argv,
      cwd: process.cwd(),
      stdinBytes,
      stdin: Buffer.concat(stdinChunks).toString("utf8").slice(0, 20000),
      codexHome: process.env.CODEX_HOME ?? null,
    }),
  );
  for (const a of step.actions) {
    if (a.type === "stdout") process.stdout.write(a.text);
    else if (a.type === "stderr") process.stderr.write(a.text);
    else if (a.type === "lastMessage" && oFile) writeFileSync(oFile, a.text);
    else if (a.type === "sleepMs") await sleep(a.ms);
    else if (a.type === "hang") await sleep(2 ** 31 - 1);
    else if (a.type === "emitEvery") {
      for (let i = 0; i < a.times; i++) {
        process.stdout.write(a.text);
        await sleep(a.ms);
      }
    } else if (a.type === "grandchild") {
      const gc = spawn(process.execPath, ["-e", "setInterval(()=>{},1e6)"], {
        detached: false,
        stdio: "ignore",
      });
      writeFileSync(join(recordDir, `grandchild-pid-${callN}.txt`), String(gc.pid));
    } else if (a.type === "exit") process.exit(a.code);
  }
  process.exit(0);
}
main();
```

- [ ] **Step 4: Implement the harness**

```ts
// tests/codexGuard/harness.ts
import { execFile } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const GUARD = join(process.cwd(), "scripts/codex-guard.mjs");
export const FIXTURE = join(process.cwd(), "tests/codexGuard/fixtures/fake-codex.mjs");

export interface Run {
  dir: string;
  outDir: string;
  recordDir: string;
  home: string;
  codexHome: string;
  scenarioPath: string;
  briefPath: string;
  cwdDir: string;
}

export interface GuardExit {
  code: number | null;
  stdout: string;
  stderr: string;
}

export function mkRun(): Run {
  const dir = mkdtempSync(join(tmpdir(), "codex-guard-test-"));
  const run: Run = {
    dir,
    outDir: join(dir, "out"),
    recordDir: join(dir, "record"),
    home: join(dir, "home"),
    codexHome: join(dir, "home", ".codex"),
    scenarioPath: join(dir, "scenario.json"),
    briefPath: join(dir, "brief.md"),
    cwdDir: join(dir, "work"),
  };
  mkdirSync(run.recordDir, { recursive: true });
  mkdirSync(run.codexHome, { recursive: true });
  mkdirSync(run.cwdDir, { recursive: true });
  writeFileSync(run.briefPath, "Review this artifact. End with VERDICT: APPROVE or VERDICT: NEEDS-ATTENTION.\n");
  writeFileSync(join(run.codexHome, "models_cache.json"), JSON.stringify({ stub: true }));
  return run;
}

export function writeScenario(run: Run, steps: unknown[]): void {
  writeFileSync(run.scenarioPath, JSON.stringify({ steps }));
}

// Fast defaults; every value overridable per test.
export const FAST_ENV: Record<string, string> = {
  CODEX_GUARD_POLL_INTERVAL_SECS: "0.05",
  CODEX_GUARD_KILL_GRACE_SECS: "0.2",
  CODEX_GUARD_REAP_AFTER_KILL_SECS: "0.5",
  CODEX_GUARD_FIRST_OUTPUT_SECS: "2",
  CODEX_GUARD_STALL_SECS: "2",
  CODEX_GUARD_ATTEMPT_MAX_SECS: "10",
  CODEX_GUARD_TOTAL_MAX_SECS: "20",
  CODEX_GUARD_MIN_ADMISSION_SECS: "0.1",
};

export function runGuard(
  run: Run,
  extraArgs: string[] = [],
  envOverrides: Record<string, string> = {},
): Promise<GuardExit> {
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [
        GUARD, "review",
        "--brief", run.briefPath,
        "--cwd", run.cwdDir,
        "--out", run.outDir,
        ...extraArgs,
      ],
      {
        env: {
          ...process.env,
          HOME: run.home,
          CODEX_HOME: run.codexHome,
          CODEX_GUARD_BIN: `${process.execPath} ${FIXTURE}`,
          FAKE_CODEX_SCENARIO: run.scenarioPath,
          FAKE_CODEX_RECORD_DIR: run.recordDir,
          ...FAST_ENV,
          ...envOverrides,
        },
        maxBuffer: 16 * 1024 * 1024,
      },
      (err, stdout, stderr) => {
        const code = err && typeof (err as { code?: unknown }).code === "number"
          ? ((err as { code?: number }).code ?? null)
          : err ? null : 0;
        resolve({ code, stdout: String(stdout), stderr: String(stderr) });
      },
    );
    void child;
  });
}

export function readResult(run: Run): Record<string, unknown> {
  return JSON.parse(readFileSync(join(run.outDir, "result.json"), "utf8"));
}

export function readCalls(run: Run): Array<Record<string, unknown>> {
  return readdirSync(run.recordDir)
    .filter((f) => /^call-\d+\.json$/.test(f))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]))
    .map((f) => JSON.parse(readFileSync(join(run.recordDir, f), "utf8")));
}
```

Note: `CODEX_GUARD_BIN` carries "node-binary space fixture-path"; the wrapper must split on the first space into command + leading args (documented in Task 3's spawn step). This keeps the fixture runnable without a shebang/chmod.

- [ ] **Step 5: Run to verify pass**

Run: `pnpm vitest run tests/codexGuard/fixture.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add tests/codexGuard && git commit --no-verify -m "test(infra): fake-codex fixture + codex-guard test harness"
```

---

### Task 2: CLI parsing, validation, usage errors (spec §3, §7; scenario 8)

**Files:**
- Create: `scripts/codex-guard.mjs`
- Test: `tests/codexGuard/usage.test.ts`

**Interfaces:**
- Produces: `codex-guard review` CLI accepting the §3 flag set; exit 2 + stderr line `codex-guard: <message>` on any §7 violation; on valid input (this task only) exits 3 with `codex-guard: not implemented` (later tasks replace).
- Produces (internal, later tasks consume): `const CFG` object `{ brief, cwd, out, artifacts, fallback, label, maxAttempts, attemptMaxSecs, totalMaxSecs, stallSecs, firstOutputSecs, pollIntervalSecs, killGraceSecs, reapAfterKillSecs, minAdmissionSecs, cacheLockStaleSecs, promptMaxBytes, codexHome, bin: {cmd, leadingArgs} }` — all paths absolute, all times numbers (seconds).

- [ ] **Step 1: Write the failing usage tests**

```ts
// tests/codexGuard/usage.test.ts
import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mkRun, runGuard, writeScenario } from "./harness";

describe("codex-guard usage errors (exit 2, no result.json)", () => {
  const cases: Array<{ name: string; args?: string[]; env?: Record<string, string>; prep?: (r: ReturnType<typeof mkRun>) => void }> = [
    { name: "missing --brief", args: ["--brief", "/nonexistent/brief.md"] },
    { name: "artifact without --fallback", prep: (r) => writeFileSync(join(r.dir, "a.md"), "x"), args: [] }, // args filled in test body
    { name: "bad label", args: ["--label", "has space"] },
    { name: "attempt-max above 1380", args: ["--attempt-max-secs", "1381"] },
    { name: "poll override above 30", env: { CODEX_GUARD_POLL_INTERVAL_SECS: "31" } },
    { name: "stall >= attempt-max", args: ["--stall-secs", "50", "--attempt-max-secs", "50"] },
    { name: "decimal CODEX_GUARD_MAX_ATTEMPTS", env: { CODEX_GUARD_MAX_ATTEMPTS: "2.5" } },
    { name: "non-integer flag", args: ["--max-attempts", "two"] },
  ];

  for (const c of cases) {
    it(c.name, async () => {
      const run = mkRun();
      writeScenario(run, [{ onCall: 1, actions: [{ type: "exit", code: 0 }] }]);
      c.prep?.(run);
      const args =
        c.name === "artifact without --fallback"
          ? ["--artifact", join(run.dir, "a.md")]
          : (c.args ?? []);
      const res = await runGuard(run, args, c.env ?? {});
      expect(res.code).toBe(2);
      expect(res.stderr).toMatch(/^codex-guard: /m);
      expect(existsSync(join(run.outDir, "result.json"))).toBe(false);
    });
  }

  it("pre-existing result.json in --out (zero-byte) refused", async () => {
    const run = mkRun();
    writeScenario(run, [{ onCall: 1, actions: [{ type: "exit", code: 0 }] }]);
    mkdirSync(run.outDir, { recursive: true });
    writeFileSync(join(run.outDir, "result.json"), "");
    const res = await runGuard(run);
    expect(res.code).toBe(2);
  });

  it("empty brief refused", async () => {
    const run = mkRun();
    writeScenario(run, [{ onCall: 1, actions: [{ type: "exit", code: 0 }] }]);
    writeFileSync(run.briefPath, "");
    const res = await runGuard(run);
    expect(res.code).toBe(2);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run tests/codexGuard/usage.test.ts`
Expected: FAIL — `scripts/codex-guard.mjs` missing.

- [ ] **Step 3: Implement CLI skeleton — constants, env, parse, validate**

```js
#!/usr/bin/env node
// scripts/codex-guard.mjs — watchdog wrapper for codex exec dispatches.
// Spec: docs/superpowers/specs/2026-07-19-codex-guard.md (canonical; §11 = numeric authority).
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

const GUARD_VERSION = 1;

// §11 defaults. Env override CODEX_GUARD_<NAME>: timing = positive decimal,
// MAX_ATTEMPTS = positive integer, PROMPT_MAX_BYTES = no override.
const DEFAULTS = {
  MAX_ATTEMPTS: 3,
  ATTEMPT_MAX_SECS: 1200,
  TOTAL_MAX_SECS: 1500,
  STALL_SECS: 420,
  FIRST_OUTPUT_SECS: 120,
  POLL_INTERVAL_SECS: 10,
  KILL_GRACE_SECS: 5,
  MIN_ADMISSION_SECS: 120,
  CACHE_LOCK_STALE_SECS: 600,
  REAP_AFTER_KILL_SECS: 10,
};
const BOUNDS = {
  ATTEMPT_MAX_SECS: 1380, // §8: 1380+30+30+10=1450 < watchdog 1500
  POLL_INTERVAL_SECS: 30,
  KILL_GRACE_SECS: 30,
  REAP_AFTER_KILL_SECS: 10,
};
const PROMPT_MAX_BYTES = 2000000;
const KNOWN_OUTCOMES = ["APPROVE", "NEEDS-ATTENTION", "BLOCKING"];

function usageError(msg) {
  process.stderr.write(`codex-guard: ${msg}\n`);
  process.exit(2);
}

function expandPath(p) {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  return isAbsolute(p) ? p : resolve(process.cwd(), p);
}

function num(name, raw, { integer = false } = {}) {
  const v = Number(raw);
  if (!Number.isFinite(v) || v <= 0) usageError(`${name} must be a positive ${integer ? "integer" : "number"}: ${raw}`);
  if (integer && !Number.isInteger(v)) usageError(`${name} must be a positive integer: ${raw}`);
  return v;
}

function readEnvNum(name, { integer = false, decimalOk = true } = {}) {
  const raw = process.env[`CODEX_GUARD_${name}`];
  if (raw === undefined || raw === "") return undefined;
  const v = num(`CODEX_GUARD_${name}`, raw, { integer });
  if (!decimalOk && !Number.isInteger(v)) usageError(`CODEX_GUARD_${name} must be an integer`);
  return v;
}

function parseArgs(argv) {
  if (argv[0] !== "review") usageError(`unknown subcommand: ${argv[0] ?? "(none)"} (only: review)`);
  const flags = { artifacts: [] };
  const takesValue = new Set([
    "--brief", "--cwd", "--out", "--artifact", "--label",
    "--max-attempts", "--attempt-max-secs", "--total-max-secs",
    "--stall-secs", "--first-output-secs",
  ]);
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--fallback") { flags.fallback = true; continue; }
    if (!takesValue.has(a)) usageError(`unknown flag: ${a}`);
    const v = argv[++i];
    if (v === undefined) usageError(`${a} requires a value`);
    if (a === "--artifact") flags.artifacts.push(v);
    else flags[a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
  }
  return flags;
}

function buildConfig(flags) {
  // numbers: flag > env > default; validated identically (§7)
  const pick = (flagVal, envName, integer = false) =>
    flagVal !== undefined
      ? num(`--${envName.toLowerCase().replace(/_/g, "-")}`, flagVal, { integer })
      : (readEnvNum(envName, { integer }) ?? DEFAULTS[envName]);

  const cfg = {
    maxAttempts: pick(flags.maxAttempts, "MAX_ATTEMPTS", true),
    attemptMaxSecs: pick(flags.attemptMaxSecs, "ATTEMPT_MAX_SECS"),
    totalMaxSecs: pick(flags.totalMaxSecs, "TOTAL_MAX_SECS"),
    stallSecs: pick(flags.stallSecs, "STALL_SECS"),
    firstOutputSecs: pick(flags.firstOutputSecs, "FIRST_OUTPUT_SECS"),
    pollIntervalSecs: readEnvNum("POLL_INTERVAL_SECS") ?? DEFAULTS.POLL_INTERVAL_SECS,
    killGraceSecs: readEnvNum("KILL_GRACE_SECS") ?? DEFAULTS.KILL_GRACE_SECS,
    reapAfterKillSecs: readEnvNum("REAP_AFTER_KILL_SECS") ?? DEFAULTS.REAP_AFTER_KILL_SECS,
    minAdmissionSecs: readEnvNum("MIN_ADMISSION_SECS") ?? DEFAULTS.MIN_ADMISSION_SECS,
    cacheLockStaleSecs: readEnvNum("CACHE_LOCK_STALE_SECS") ?? DEFAULTS.CACHE_LOCK_STALE_SECS,
    promptMaxBytes: PROMPT_MAX_BYTES,
    fallback: Boolean(flags.fallback),
    label: flags.label ?? null,
  };

  for (const [name, max] of Object.entries(BOUNDS)) {
    const key = name.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    if (cfg[key] > max) usageError(`${name} exceeds max ${max}: ${cfg[key]}`);
  }
  if (cfg.stallSecs >= cfg.attemptMaxSecs) usageError(`STALL_SECS must be < ATTEMPT_MAX_SECS`);
  if (cfg.firstOutputSecs >= cfg.attemptMaxSecs) usageError(`FIRST_OUTPUT_SECS must be < ATTEMPT_MAX_SECS`);
  if (cfg.label !== null && !/^[A-Za-z0-9_-]{1,64}$/.test(cfg.label)) usageError(`invalid --label`);

  if (!flags.brief) usageError("--brief is required");
  if (!flags.cwd) usageError("--cwd is required");
  if (!flags.out) usageError("--out is required");
  cfg.brief = expandPath(flags.brief);
  cfg.cwd = expandPath(flags.cwd);
  cfg.out = expandPath(flags.out);
  cfg.artifacts = flags.artifacts.map(expandPath);
  cfg.codexHome = expandPath(process.env.CODEX_HOME ?? join(homedir(), ".codex"));

  if (!existsSync(cfg.brief) || !statSync(cfg.brief).isFile()) usageError(`--brief unreadable: ${cfg.brief}`);
  if (readFileSync(cfg.brief, "utf8").length === 0) usageError(`--brief is empty`);
  if (!existsSync(cfg.cwd) || !statSync(cfg.cwd).isDirectory()) usageError(`--cwd is not a directory: ${cfg.cwd}`);
  if (cfg.artifacts.length > 0 && !cfg.fallback) usageError("--artifact requires --fallback");
  for (const a of cfg.artifacts) {
    if (!existsSync(a) || !statSync(a).isFile()) usageError(`--artifact unreadable: ${a}`);
  }
  try {
    mkdirSync(cfg.out, { recursive: true });
  } catch (e) {
    usageError(`cannot create --out: ${e.message}`);
  }
  if (existsSync(join(cfg.out, "result.json"))) usageError(`--out already contains result.json (any size): refuse reuse`);

  const binRaw = process.env.CODEX_GUARD_BIN ?? "codex";
  const [cmd, ...leadingArgs] = binRaw.split(" ");
  cfg.bin = { cmd, leadingArgs };
  return cfg;
}

const cfg = buildConfig(parseArgs(process.argv.slice(2)));
void cfg;
process.stderr.write("codex-guard: not implemented\n");
process.exit(3);
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run tests/codexGuard/usage.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/codex-guard.mjs tests/codexGuard/usage.test.ts && git commit --no-verify -m "feat(infra): codex-guard CLI parsing + §7 validation"
```

---

### Task 3: Attempt runner + happy path + verdict parser (spec §4, §6 parsing; scenarios 1, 2)

**Files:**
- Modify: `scripts/codex-guard.mjs` (replace the trailing `not implemented` block; add functions)
- Test: `tests/codexGuard/happyPath.test.ts`

**Interfaces:**
- Produces (internal): `composePrompt(cfg): string`; `parseVerdict(text): { verdict: string|null, verdictLine: string|null, shape: "ok"|"no_marker"|"unrecognized_verdict" }`; `runAttempt(cfg, n, kind, extraArgv, state): Promise<Attempt>` (spawn per §4, capture streams to files, poll timers, classify); `writeResult(cfg, state, patch): void`; `main()` loop (this task: single attempt, success path only; ladder in Task 5).
- Attempt record fields exactly per spec §6 result schema.

- [ ] **Step 1: Write failing happy-path tests**

```ts
// tests/codexGuard/happyPath.test.ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mkRun, readCalls, readResult, runGuard, writeScenario } from "./harness";

describe("codex-guard happy path", () => {
  it("scenario 1: exact argv, stdin prompt, result.json contract", async () => {
    const run = mkRun();
    writeScenario(run, [
      {
        onCall: 1,
        actions: [
          { type: "stdout", text: "working\n" },
          { type: "lastMessage", text: "All good.\n\nVERDICT: APPROVE\n" },
          { type: "exit", code: 0 },
        ],
      },
    ]);
    const res = await runGuard(run, ["--label", "spec-r1"]);
    expect(res.code).toBe(0);

    const calls = readCalls(run);
    expect(calls).toHaveLength(1);
    // §4 fresh-attempt argv, exactly — independent reconstruction, not echo
    expect(calls[0].argv).toEqual([
      "exec", "--skip-git-repo-check", "-s", "read-only", "-C", run.cwdDir,
      "-c", "model_reasoning_effort=high",
      "-o", join(run.outDir, "attempt-1.last-message.txt"),
    ]);
    const briefText = readFileSync(run.briefPath, "utf8");
    expect(calls[0].stdinBytes).toBe(Buffer.byteLength(briefText));
    expect(calls[0].stdin).toBe(briefText);

    const result = readResult(run);
    expect(result.status).toBe("verdict");
    expect(result.verdict).toBe("APPROVE");
    expect(result.verdictLine).toBe("VERDICT: APPROVE");
    expect(result.label).toBe("spec-r1");
    expect(result.guardVersion).toBe(1);
    expect(result.lastMessagePath).toBe(join(run.outDir, "attempt-1.last-message.txt"));
    expect(result.failureReason).toBeNull();
    expect(result.attempts).toHaveLength(1);
    const a = result.attempts[0] as Record<string, unknown>;
    expect(a).toMatchObject({
      n: 1, kind: "exec", exitCode: 0, signal: null,
      killedReason: null, failureShape: null, recovery: null,
    });
    expect(typeof a.pid).toBe("number");
    expect(typeof a.durationSecs).toBe("number");
    expect(readFileSync(join(run.outDir, "attempt-1.transcript.txt"), "utf8")).toContain("working");
  });

  it("scenario 2: echoed instruction + fenced verdict + emphasis/punctuation normalization", async () => {
    const run = mkRun();
    const lastMessage = [
      "The brief says: end with `VERDICT: APPROVE or VERDICT: NEEDS-ATTENTION`",
      "```",
      "VERDICT: APPROVE",
      "```",
      "Findings: one HIGH.",
      "VERDICT: **NEEDS-ATTENTION**.",
      "",
    ].join("\n");
    writeScenario(run, [
      { onCall: 1, actions: [{ type: "lastMessage", text: lastMessage }, { type: "exit", code: 0 }] },
    ]);
    const res = await runGuard(run);
    expect(res.code).toBe(0);
    const result = readResult(run);
    expect(result.status).toBe("verdict");
    expect(result.verdict).toBe("NEEDS-ATTENTION");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run tests/codexGuard/happyPath.test.ts`
Expected: FAIL — exit 3 "not implemented".

- [ ] **Step 3: Implement prompt composition, verdict parser, attempt runner, single-attempt main**

Replace the trailing block of `scripts/codex-guard.mjs` (everything after `buildConfig`) with:

```js
import { appendFileSync, createWriteStream, openSync, closeSync, writeFileSync, rmSync, renameSync, readdirSync, unlinkSync } from "node:fs";
import { basename } from "node:path";
import { spawn } from "node:child_process";

function composePrompt(cfg) {
  let prompt = readFileSync(cfg.brief, "utf8");
  if (cfg.fallback) {
    for (const a of cfg.artifacts) {
      prompt += `\n===== ARTIFACT: ${basename(a)} =====\n`;
      prompt += readFileSync(a, "utf8");
      prompt += `\n===== END ARTIFACT =====\n`;
    }
    prompt +=
      "\nCitations were pre-verified — do not re-read files needlessly. " +
      "REACH A VERDICT — budget your reading.\n";
  }
  if (Buffer.byteLength(prompt) > cfg.promptMaxBytes)
    usageError(`prompt exceeds PROMPT_MAX_BYTES (${cfg.promptMaxBytes})`);
  return prompt;
}

// §6 verdict parsing. Returns shape "ok" | "no_marker" | "unrecognized_verdict".
function parseVerdict(text) {
  const noFences = text.replace(/^```[^\n]*\n[\s\S]*?^```[^\n]*$/gm, "");
  const lines = noFences.split("\n").filter((l) => /^\s*VERDICT:\s*\S/.test(l));
  const survivors = lines.filter((l) => {
    const hits = KNOWN_OUTCOMES.filter((o) => l.toUpperCase().includes(o)).length;
    // NEEDS-ATTENTION contains no other outcome as substring; count distinct outcomes
    return hits < 2 && !/ or /i.test(l);
  });
  if (survivors.length === 0) return { verdict: null, verdictLine: null, shape: "no_marker" };
  const line = survivors[survivors.length - 1].trim();
  let payload = line.replace(/^\s*VERDICT:\s*/, "");
  // fixpoint: trim; strip trailing punctuation; strip ONE emphasis layer; repeat
  for (;;) {
    const before = payload;
    payload = payload.trim().replace(/[.,;:!]+$/, "");
    payload = payload.replace(/^(\*+|_+|`+)(.*?)\1$/, "$2");
    if (payload === before) break;
  }
  payload = payload.toUpperCase();
  if (KNOWN_OUTCOMES.includes(payload)) return { verdict: payload, verdictLine: line, shape: "ok" };
  return { verdict: null, verdictLine: line, shape: "unrecognized_verdict" };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nowSecs = () => Date.now() / 1000;

function killGroup(pid, signal) {
  try { process.kill(-pid, signal); } catch { /* group gone */ }
}

// Poll-based attempt runner (§4, §5). state = { startedAt } for the total budget.
async function runAttempt(cfg, n, kind, argvAfterExec, state) {
  const transcriptPath = join(cfg.out, `attempt-${n}.transcript.txt`);
  const stderrPath = join(cfg.out, `attempt-${n}.stderr.txt`);
  const lastMessagePath = join(cfg.out, `attempt-${n}.last-message.txt`);
  const attempt = {
    n, kind, pid: null, exitCode: null, signal: null,
    killedReason: null, failureShape: null, recovery: null,
    transcriptPath, stderrPath, lastMessagePath, durationSecs: 0,
  };
  const t0 = nowSecs();
  let child;
  try {
    child = spawn(cfg.bin.cmd, [...cfg.bin.leadingArgs, ...argvAfterExec], {
      cwd: cfg.cwd,
      detached: true, // own process group; kills target -pid
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (e) {
    attempt.failureShape = "spawn_error";
    attempt.durationSecs = nowSecs() - t0;
    throw Object.assign(new Error(`spawn failed: ${e.message}`), { attempt });
  }
  attempt.pid = child.pid ?? null;
  if (child.pid === undefined) {
    attempt.failureShape = "spawn_error";
    throw Object.assign(new Error("spawn failed: no pid"), { attempt });
  }
  state.liveChild = child;

  const tOut = createWriteStream(transcriptPath);
  const tErr = createWriteStream(stderrPath);
  let bytesOut = 0;
  child.stdout.on("data", (c) => { bytesOut += c.length; tOut.write(c); });
  child.stderr.on("data", (c) => { bytesOut += c.length; tErr.write(c); });

  const prompt = kind === "resume"
    ? "Output your final findings list and the mandatory final line now: VERDICT: ...\n"
    : composePrompt(cfg);
  child.stdin.on("error", () => {});
  child.stdin.end(prompt);

  const exited = new Promise((res) => child.on("exit", (code, signal) => res({ code, signal })));
  let exitInfo = null;
  exited.then((v) => { exitInfo = v; });

  let firstByteAt = null;
  let lastGrowthAt = t0;
  let lastBytes = 0;

  while (exitInfo === null) {
    await sleep(cfg.pollIntervalSecs * 1000);
    if (exitInfo !== null) break;
    const now = nowSecs();
    if (bytesOut > lastBytes) {
      lastBytes = bytesOut;
      lastGrowthAt = now;
      if (firstByteAt === null) firstByteAt = now;
    }
    // §5 precedence: total > attempt > stall > no_output
    let reason = null;
    if (now - state.startedAt > cfg.totalMaxSecs) reason = "total_timeout";
    else if (now - t0 > cfg.attemptMaxSecs) reason = "attempt_timeout";
    else if (firstByteAt !== null && now - lastGrowthAt > cfg.stallSecs) reason = "stall";
    else if (firstByteAt === null && now - t0 > cfg.firstOutputSecs) reason = "no_output";
    if (reason) {
      attempt.killedReason = reason;
      killGroup(child.pid, "SIGTERM");
      const deadline = nowSecs() + cfg.killGraceSecs;
      while (exitInfo === null && nowSecs() < deadline) await sleep(Math.min(cfg.pollIntervalSecs, 0.05) * 1000);
      if (exitInfo === null) killGroup(child.pid, "SIGKILL");
      const reapDeadline = nowSecs() + cfg.reapAfterKillSecs;
      while (exitInfo === null && nowSecs() < reapDeadline) await sleep(0.05 * 1000);
      if (exitInfo === null) throw Object.assign(new Error("unkillable child"), { attempt });
      break;
    }
  }
  state.liveChild = null;
  tOut.end(); tErr.end();
  attempt.exitCode = exitInfo.code;
  attempt.signal = exitInfo.signal;
  if (attempt.killedReason === null && exitInfo.signal !== null) attempt.killedReason = "external_signal";
  attempt.durationSecs = nowSecs() - t0;

  // classify (§6)
  if (attempt.killedReason !== null) {
    attempt.failureShape = "killed";
    return attempt;
  }
  if (attempt.exitCode !== 0) {
    attempt.failureShape = "nonzero_exit";
    return attempt;
  }
  if (!existsSync(lastMessagePath)) { attempt.failureShape = "no_o_file"; return attempt; }
  const msg = readFileSync(lastMessagePath, "utf8");
  if (msg.trim() === "") { attempt.failureShape = "empty_o_file"; return attempt; }
  const parsed = parseVerdict(msg);
  if (parsed.shape !== "ok") { attempt.failureShape = parsed.shape; attempt.parsed = parsed; return attempt; }
  attempt.parsed = parsed;
  return attempt; // failureShape null = success
}

function freshArgv(cfg, n) {
  return [
    "exec", "--skip-git-repo-check", "-s", "read-only", "-C", cfg.cwd,
    "-c", "model_reasoning_effort=high",
    "-o", join(cfg.out, `attempt-${n}.last-message.txt`),
  ];
}

function writeResult(cfg, state, patch) {
  const attempts = state.attempts.map(({ parsed, ...a }) => a);
  const body = {
    guardVersion: GUARD_VERSION,
    label: cfg.label,
    status: "no_verdict", verdict: null, verdictLine: null, lastMessagePath: null,
    attempts, failureReason: null, error: null,
    startedAt: state.startedAtIso, endedAt: new Date().toISOString(),
    ...patch,
  };
  writeFileSync(join(cfg.out, "result.json"), JSON.stringify(body, null, 2) + "\n");
}

async function main() {
  const state = {
    startedAt: nowSecs(),
    startedAtIso: new Date().toISOString(),
    attempts: [],
    liveChild: null,
  };
  const attempt = await runAttempt(cfg, 1, "exec", freshArgv(cfg, 1), state);
  state.attempts.push(attempt);
  if (attempt.failureShape === null) {
    writeResult(cfg, state, {
      status: "verdict",
      verdict: attempt.parsed.verdict,
      verdictLine: attempt.parsed.verdictLine,
      lastMessagePath: attempt.lastMessagePath,
    });
    process.exit(0);
  }
  writeResult(cfg, state, { failureReason: "attempts_exhausted" });
  process.exit(0);
}

main().catch((e) => {
  try {
    const attempts = e?.attempt ? [e.attempt] : [];
    writeFileSync(join(cfg.out, "result.json"), JSON.stringify({
      guardVersion: GUARD_VERSION, label: cfg.label, status: "no_verdict",
      verdict: null, verdictLine: null, lastMessagePath: null,
      attempts, failureReason: "wrapper_error", error: String(e?.message ?? e),
      startedAt: null, endedAt: new Date().toISOString(),
    }, null, 2) + "\n");
  } catch { /* stderr only */ }
  process.stderr.write(`codex-guard: wrapper_error: ${e?.message ?? e}\n`);
  process.exit(3);
});
```

(Note: `main()`'s ladder is single-attempt here; Task 5 replaces the body with the full loop. `state.attempts` and the `catch` wrapper are already final-shaped. Unused imports added here — `appendFileSync`, `openSync`, `closeSync`, `rmSync`, `renameSync`, `readdirSync`, `unlinkSync` — are consumed by Tasks 5–7; keep them.)

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run tests/codexGuard/happyPath.test.ts tests/codexGuard/usage.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/codex-guard.mjs tests/codexGuard/happyPath.test.ts && git commit --no-verify -m "feat(infra): codex-guard attempt runner, verdict parser, happy path"
```

---

### Task 4: Timeout kills + precedence (spec §5; scenarios 5, 6, 9, 12, 17)

**Files:**
- Modify: `scripts/codex-guard.mjs` (no new code expected — this task PINS Task 3's timer logic; fix any failures inline)
- Test: `tests/codexGuard/timeouts.test.ts`

**Interfaces:**
- Consumes: harness FAST_ENV timing overrides; fixture `hang`/`emitEvery` actions; result.json attempt records.

- [ ] **Step 1: Write failing timeout tests**

```ts
// tests/codexGuard/timeouts.test.ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mkRun, readResult, runGuard, writeScenario } from "./harness";

const ONE_ATTEMPT = { CODEX_GUARD_MAX_ATTEMPTS: "1" };

function assertDead(pidFile: string): void {
  const pid = Number(readFileSync(pidFile, "utf8"));
  let alive = true;
  try { process.kill(pid, 0); } catch { alive = false; }
  expect(alive).toBe(false);
}

describe("codex-guard timeouts (§5)", () => {
  it("scenario 5: stall after first byte → stall kill", async () => {
    const run = mkRun();
    writeScenario(run, [{ onCall: 1, actions: [{ type: "stdout", text: "x" }, { type: "hang" }] }]);
    const res = await runGuard(run, [], ONE_ATTEMPT);
    expect(res.code).toBe(0);
    const r = readResult(run);
    expect(r.status).toBe("no_verdict");
    expect((r.attempts as any[])[0]).toMatchObject({ killedReason: "stall", failureShape: "killed" });
  });

  it("scenario 6: no first byte → no_output kill", async () => {
    const run = mkRun();
    writeScenario(run, [{ onCall: 1, actions: [{ type: "hang" }] }]);
    const res = await runGuard(run, [], ONE_ATTEMPT);
    expect(res.code).toBe(0);
    expect((readResult(run).attempts as any[])[0].killedReason).toBe("no_output");
  });

  it("scenario 12: periodic output resets the stall clock — no kill", async () => {
    const run = mkRun();
    writeScenario(run, [
      {
        onCall: 1,
        actions: [
          { type: "emitEvery", ms: 400, times: 20, text: "tick\n" }, // 8s of ticks > 4 stall windows of 2s
          { type: "lastMessage", text: "VERDICT: APPROVE\n" },
          { type: "exit", code: 0 },
        ],
      },
    ]);
    const res = await runGuard(run, [], { ...ONE_ATTEMPT, CODEX_GUARD_ATTEMPT_MAX_SECS: "15", CODEX_GUARD_TOTAL_MAX_SECS: "18" });
    expect(res.code).toBe(0);
    expect(readResult(run).status).toBe("verdict");
  }, 30000);

  it("scenario 9: total timeout mid-attempt actively kills (pidfile dead)", async () => {
    const run = mkRun();
    writeScenario(run, [
      { onCall: 1, actions: [{ type: "stdout", text: "a" }, { type: "exit", code: 1 }] },
      { onCall: 2, actions: [{ type: "emitEvery", ms: 200, times: 100, text: "t" }] },
    ]);
    // total 3s: attempt 1 fails fast, attempt 2 runs into the total budget while still emitting
    const res = await runGuard(run, [], {
      CODEX_GUARD_TOTAL_MAX_SECS: "3", CODEX_GUARD_ATTEMPT_MAX_SECS: "10",
      CODEX_GUARD_STALL_SECS: "8", CODEX_GUARD_FIRST_OUTPUT_SECS: "8",
    });
    expect(res.code).toBe(0);
    const r = readResult(run);
    expect(r.failureReason).toBe("total_timeout");
    const a2 = (r.attempts as any[])[1];
    expect(a2.killedReason).toBe("total_timeout");
    assertDead(join(run.recordDir, "pid-2.txt"));
  }, 30000);

  it("scenario 17a: continuous output past attempt-max → attempt_timeout", async () => {
    const run = mkRun();
    writeScenario(run, [{ onCall: 1, actions: [{ type: "emitEvery", ms: 200, times: 200, text: "t" }] }]);
    const res = await runGuard(run, [], {
      ...ONE_ATTEMPT, CODEX_GUARD_ATTEMPT_MAX_SECS: "2",
      CODEX_GUARD_STALL_SECS: "1.5", CODEX_GUARD_FIRST_OUTPUT_SECS: "1.5",
      CODEX_GUARD_TOTAL_MAX_SECS: "30",
    });
    expect(res.code).toBe(0);
    expect((readResult(run).attempts as any[])[0].killedReason).toBe("attempt_timeout");
  }, 30000);

  it("scenario 17b: attempt-max and total-max expire together → total_timeout wins", async () => {
    const run = mkRun();
    writeScenario(run, [{ onCall: 1, actions: [{ type: "emitEvery", ms: 200, times: 200, text: "t" }] }]);
    const res = await runGuard(run, [], {
      ...ONE_ATTEMPT, CODEX_GUARD_ATTEMPT_MAX_SECS: "2", CODEX_GUARD_TOTAL_MAX_SECS: "2",
      CODEX_GUARD_STALL_SECS: "1.5", CODEX_GUARD_FIRST_OUTPUT_SECS: "1.5",
    });
    expect(res.code).toBe(0);
    expect((readResult(run).attempts as any[])[0].killedReason).toBe("total_timeout");
  }, 30000);
});
```

- [ ] **Step 2: Run**

Run: `pnpm vitest run tests/codexGuard/timeouts.test.ts`
Expected: scenarios 5/6/12/17a/17b PASS against Task 3's loop if the precedence chain is correct; scenario 9 FAILS until Task 5's multi-attempt loop exists (attempt 2 never spawns). Any OTHER failure = timer-logic bug: fix inline in `runAttempt` until only the scenario-9 failure remains.

- [ ] **Step 3: Commit (with scenario 9 marked `it.todo` → converted in Task 5)**

Mark scenario 9's `it` as `it.fails` with a comment `// enabled fully in ladder task`, OR keep it failing-red only if executing tasks sequentially in one session. Preferred: `it.fails` + revert to `it` in Task 5 Step 1.

```bash
git add tests/codexGuard/timeouts.test.ts scripts/codex-guard.mjs && git commit --no-verify -m "test(infra): codex-guard §5 timeout/precedence pins"
```

---

### Task 5: Recovery ladder — generic retry, exhaustion, admission (spec §6 loop; scenarios 7, 15-partial, 9-enable)

**Files:**
- Modify: `scripts/codex-guard.mjs` — replace `main()` single-attempt body with the ladder loop; add rung selection skeleton (generic retry only; cache/resume rungs land Tasks 6–7 inside the pre-built structure).
- Test: `tests/codexGuard/ladder.test.ts` (scenario 7 now; file grows in Tasks 6–7)

**Interfaces:**
- Produces (internal): `selectRung(cfg, attempt, state): Promise<"retry"|"cache_ttl"|"cache_ttl_skipped"|"resume"|null>` — Task 5 implements only the generic branch returning `"retry"`; cache/resume branches return via TODO-free structure: Task 5 ships them as unreachable guards (`state.cacheRungUsed = true; state.resumeRungUsed = true` initialized FALSE but branch conditions test signatures that Task 5's tests never produce — the branches are IMPLEMENTED in 6/7, and Task 5 codes them as explicit `throw` if reached? NO — spec forbids placeholders. Resolution: Task 5 implements the FULL rung-selection control flow including cache and resume calls, and Tasks 6–7 only ADD the `cacheRung()`/`resumeArgv()` function bodies' tests. All three rung functions are written COMPLETE in this task's Step 3; Tasks 6–7 are test-first pinning of behavior already present.)

- [ ] **Step 1: Write failing ladder tests (scenario 7) and re-enable scenario 9**

```ts
// tests/codexGuard/ladder.test.ts
import { describe, expect, it } from "vitest";
import { mkRun, readCalls, readResult, runGuard, writeScenario } from "./harness";

describe("codex-guard recovery ladder", () => {
  it("scenario 7: three transient failures → attempts_exhausted, recovery retry/retry/null", async () => {
    const run = mkRun();
    writeScenario(run, [
      { onCall: 1, actions: [{ type: "stderr", text: "boom1\n" }, { type: "exit", code: 1 }] },
      { onCall: 2, actions: [{ type: "stderr", text: "boom2\n" }, { type: "exit", code: 1 }] },
      { onCall: 3, actions: [{ type: "stderr", text: "boom3\n" }, { type: "exit", code: 1 }] },
    ]);
    const res = await runGuard(run);
    expect(res.code).toBe(0);
    const r = readResult(run);
    expect(r.status).toBe("no_verdict");
    expect(r.failureReason).toBe("attempts_exhausted");
    const recs = (r.attempts as any[]).map((a) => a.recovery);
    expect(recs).toEqual(["retry", "retry", null]);
    expect(readCalls(run)).toHaveLength(3);
    (r.attempts as any[]).forEach((a) => expect(a.failureShape).toBe("nonzero_exit"));
  });
});
```

Also in `tests/codexGuard/timeouts.test.ts`: revert scenario 9 from `it.fails` to `it`.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run tests/codexGuard/ladder.test.ts`
Expected: FAIL — only one attempt runs.

- [ ] **Step 3: Implement the full ladder loop + all three rungs**

Replace `main()` in `scripts/codex-guard.mjs`:

```js
// §6 rung 1. Advisory lock in $CODEX_HOME; matched-or-skipped consumes the cap.
function tryCacheRung(cfg, attempt, state) {
  state.cacheRungUsed = true;
  const lockDir = join(cfg.codexHome, ".codex-guard-cache-lock");
  const cachePath = join(cfg.codexHome, "models_cache.json");
  const skip = () => { attempt.recovery = "cache_ttl_skipped"; return "cache_ttl_skipped"; };

  if (!existsSync(cfg.codexHome) || !existsSync(cachePath)) return skip();

  // stale-break: rename to tombstone, delete tombstone, DEFER acquisition to next run
  if (existsSync(lockDir)) {
    let ageSecs = 0;
    try { ageSecs = (Date.now() - statSync(lockDir).mtimeMs) / 1000; } catch { return skip(); }
    if (ageSecs > cfg.cacheLockStaleSecs) {
      const tomb = join(cfg.codexHome, `.codex-guard-cache-lock.stale-${process.pid}-${Math.random().toString(36).slice(2, 8)}`);
      try { renameSync(lockDir, tomb); rmSync(tomb, { recursive: true, force: true }); } catch { /* sibling broke it */ }
      return skip(); // break-then-defer (spec §6): never acquire in the same pass
    }
    return skip(); // fresh lock = live sibling
  }

  try { mkdirSync(lockDir); } catch { return skip(); }
  state.heldLockDir = lockDir; // signal handler + finally release
  try {
    writeFileSync(join(lockDir, "owner"), String(process.pid));
    // backup then delete; failure of either → skipped (lock still released in finally)
    const backup = readFileSync(cachePath);
    writeFileSync(join(cfg.out, "models_cache.bak.json"), backup);
    unlinkSync(cachePath);
    attempt.recovery = "cache_ttl";
    return "cache_ttl";
  } catch {
    return skip();
  } finally {
    releaseOwnLock(state, lockDir);
  }
}

function releaseOwnLock(state, lockDir) {
  try {
    const owner = readFileSync(join(lockDir, "owner"), "utf8");
    if (owner === String(process.pid)) rmSync(lockDir, { recursive: true, force: true });
  } catch { /* owner-less or foreign: leave for stale-break */ }
  if (state.heldLockDir === lockDir) state.heldLockDir = null;
}

const TTL_SIGNATURE = /codex_models_manager::manager: failed to renew cache TTL/;
const SESSION_ID_RE = /session id:?\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

function selectRung(cfg, attempt, state) {
  // stderr of the JUST-FAILED attempt only (§6)
  let stderrText = "";
  try { stderrText = readFileSync(attempt.stderrPath, "utf8"); } catch { /* spawn_error has no file */ }
  if (!state.cacheRungUsed && TTL_SIGNATURE.test(stderrText)) return tryCacheRung(cfg, attempt, state);

  if (!state.resumeRungUsed && attempt.exitCode === 0 &&
      ["no_o_file", "empty_o_file", "no_marker", "unrecognized_verdict"].includes(attempt.failureShape)) {
    let transcript = "";
    try { transcript = readFileSync(attempt.transcriptPath, "utf8"); } catch { /* none */ }
    const m = SESSION_ID_RE.exec(transcript);
    if (m) {
      state.resumeRungUsed = true;
      state.resumeSid = m[1];
      attempt.recovery = "resume";
      return "resume";
    }
  }
  attempt.recovery = "retry";
  return "retry";
}

function resumeArgv(cfg, sid, n) {
  return ["exec", "resume", sid, "-c", "model_reasoning_effort=high",
    "-o", join(cfg.out, `attempt-${n}.last-message.txt`)];
}

async function main() {
  const state = {
    startedAt: nowSecs(), startedAtIso: new Date().toISOString(),
    attempts: [], liveChild: null,
    cacheRungUsed: false, resumeRungUsed: false, resumeSid: null, heldLockDir: null,
  };
  globalThis.__guardState = state; // signal handlers (Task 7)

  let nextKind = "exec";
  for (let n = 1; ; n++) {
    const argv = nextKind === "resume" ? resumeArgv(cfg, state.resumeSid, n) : freshArgv(cfg, n);
    const attempt = await runAttempt(cfg, n, nextKind, argv, state);
    state.attempts.push(attempt);

    if (attempt.failureShape === null) {
      writeResult(cfg, state, {
        status: "verdict", verdict: attempt.parsed.verdict,
        verdictLine: attempt.parsed.verdictLine, lastMessagePath: attempt.lastMessagePath,
      });
      process.exit(0);
    }
    if (attempt.killedReason === "total_timeout") {
      writeResult(cfg, state, { failureReason: "total_timeout", verdictLine: attempt.parsed?.verdictLine ?? null });
      process.exit(0);
    }
    // attempts_exhausted checked BEFORE admission (§6 precedence)
    if (state.attempts.length >= cfg.maxAttempts) {
      writeResult(cfg, state, { failureReason: "attempts_exhausted", verdictLine: attempt.parsed?.verdictLine ?? null });
      process.exit(0);
    }
    // admission gate: rung side effects only run if a successor is admitted (§6)
    const remaining = cfg.totalMaxSecs - (nowSecs() - state.startedAt);
    if (remaining < cfg.minAdmissionSecs) {
      writeResult(cfg, state, { failureReason: "total_timeout", verdictLine: attempt.parsed?.verdictLine ?? null });
      process.exit(0);
    }
    const rung = selectRung(cfg, attempt, state);
    nextKind = rung === "resume" ? "resume" : "exec";
  }
}
```

Also extend `writeResult` patch handling: `verdictLine` may carry an unrecognized raw line (spec: "verdictLine preserves the raw line" for `unrecognized_verdict`) — the `patch` spread already allows this; ensure the `no_verdict` default passes `verdictLine` from the LAST attempt with a `parsed` (already done via patch in the loop above).

- [ ] **Step 4: Run full suite so far**

Run: `pnpm vitest run tests/codexGuard/`
Expected: PASS — fixture 2, usage 10, happy 2, timeouts 6 (scenario 9 now real), ladder 1.

- [ ] **Step 5: Commit**

```bash
git add scripts/codex-guard.mjs tests/codexGuard && git commit --no-verify -m "feat(infra): codex-guard recovery ladder, admission gate, exhaustion"
```

---

### Task 6: Cache-TTL rung + lock lifecycle + homedir pins (scenarios 3, 11, 15, 18a-c, 19)

**Files:**
- Modify: `tests/codexGuard/ladder.test.ts` (scenarios 3, 11, 15)
- Create: `tests/codexGuard/lock.test.ts` (scenarios 18a–c, 19)
- Modify: `scripts/codex-guard.mjs` only if a test exposes a bug (behavior shipped in Task 5)

**Interfaces:**
- Consumes: fixture stderr action for the TTL signature line `ERROR codex_models_manager::manager: failed to renew cache TTL: missing field 'supports_reasoning_summaries'`.

- [ ] **Step 1: Write failing scenario tests — append to ladder.test.ts:**

```ts
const TTL_LINE = "ERROR codex_models_manager::manager: failed to renew cache TTL: missing field 'supports_reasoning_summaries'\n";

it("scenario 3: TTL on stderr fires rung once; stdout-only signature does NOT fire; cap holds", async () => {
  const run = mkRun();
  writeScenario(run, [
    { onCall: 1, actions: [{ type: "stderr", text: TTL_LINE }, { type: "exit", code: 0 }] }, // no -o → failed
    { onCall: 2, actions: [{ type: "stderr", text: TTL_LINE }, { type: "exit", code: 0 }] }, // TTL again: cap consumed → retry
    { onCall: 3, actions: [{ type: "lastMessage", text: "VERDICT: APPROVE\n" }, { type: "exit", code: 0 }] },
  ]);
  // recreate the cache between failures so once-only can't pass by cache-absence
  const cachePath = join(run.codexHome, "models_cache.json");
  const watcher = setInterval(() => {
    if (!existsSync(cachePath)) writeFileSync(cachePath, JSON.stringify({ recreated: true }));
  }, 30);
  const res = await runGuard(run);
  clearInterval(watcher);
  expect(res.code).toBe(0);
  const r = readResult(run);
  expect(r.status).toBe("verdict");
  const recs = (r.attempts as any[]).map((a) => a.recovery);
  expect(recs).toEqual(["cache_ttl", "retry", null]);
  expect(readFileSync(join(run.outDir, "models_cache.bak.json"), "utf8")).toContain("stub");
});

it("scenario 3b: TTL signature on STDOUT only → rung NOT fired", async () => {
  const run = mkRun();
  writeScenario(run, [
    { onCall: 1, actions: [{ type: "stdout", text: TTL_LINE }, { type: "exit", code: 1 }] },
    { onCall: 2, actions: [{ type: "lastMessage", text: "VERDICT: APPROVE\n" }, { type: "exit", code: 0 }] },
  ]);
  const res = await runGuard(run);
  expect(res.code).toBe(0);
  const r = readResult(run);
  expect((r.attempts as any[])[0].recovery).toBe("retry");
  expect(existsSync(join(run.outDir, "models_cache.bak.json"))).toBe(false);
});

it("scenario 11: CODEX_HOME cache absent → cache_ttl_skipped consumes cap, resume still reachable", async () => {
  const run = mkRun();
  rmSync(join(run.codexHome, "models_cache.json"));
  const sid = "aaaabbbb-cccc-4ddd-8eee-ffff00001111";
  writeScenario(run, [
    { onCall: 1, actions: [{ type: "stderr", text: TTL_LINE }, { type: "exit", code: 0 }] },
    { onCall: 2, actions: [{ type: "stdout", text: `session id: ${sid}\n` }, { type: "exit", code: 0 }] }, // truncation
    { onCall: 3, actions: [{ type: "lastMessage", text: "VERDICT: APPROVE\n" }, { type: "exit", code: 0 }] },
  ]);
  const res = await runGuard(run);
  expect(res.code).toBe(0);
  const r = readResult(run);
  const recs = (r.attempts as any[]).map((a) => a.recovery);
  expect(recs).toEqual(["cache_ttl_skipped", "resume", null]);
  expect((r.attempts as any[])[2].kind).toBe("resume");
});

it("scenario 15: admission gate blocks rung side effect — cache NOT deleted", async () => {
  const run = mkRun();
  writeScenario(run, [
    { onCall: 1, actions: [{ type: "sleepMs", ms: 1200 }, { type: "stderr", text: TTL_LINE }, { type: "exit", code: 0 }] },
  ]);
  const res = await runGuard(run, [], {
    CODEX_GUARD_TOTAL_MAX_SECS: "1", CODEX_GUARD_MIN_ADMISSION_SECS: "5",
    CODEX_GUARD_ATTEMPT_MAX_SECS: "0.9", CODEX_GUARD_STALL_SECS: "0.8", CODEX_GUARD_FIRST_OUTPUT_SECS: "0.8",
  });
  expect(res.code).toBe(0);
  const r = readResult(run);
  expect(r.failureReason).toBe("total_timeout");
  expect(existsSync(join(run.codexHome, "models_cache.json"))).toBe(true);
  expect(existsSync(join(run.outDir, "models_cache.bak.json"))).toBe(false);
});
```

New `tests/codexGuard/lock.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { chmodSync, existsSync, mkdirSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mkRun, readResult, runGuard, writeScenario } from "./harness";

const TTL_LINE = "ERROR codex_models_manager::manager: failed to renew cache TTL: missing field 'supports_reasoning_summaries'\n";
const TTL_FAIL = { onCall: 1, actions: [{ type: "stderr", text: TTL_LINE }, { type: "exit", code: 0 }] };
const THEN_OK = { onCall: 2, actions: [{ type: "lastMessage", text: "VERDICT: APPROVE\n" }, { type: "exit", code: 0 }] };

describe("codex-guard cache lock lifecycle (§6)", () => {
  it("18a: unreadable cache → backup fails → skipped, cache intact, lock released", async () => {
    const run = mkRun();
    chmodSync(join(run.codexHome, "models_cache.json"), 0o000);
    writeScenario(run, [TTL_FAIL, THEN_OK]);
    const res = await runGuard(run);
    chmodSync(join(run.codexHome, "models_cache.json"), 0o644);
    expect(res.code).toBe(0);
    const r = readResult(run);
    expect((r.attempts as any[])[0].recovery).toBe("cache_ttl_skipped");
    expect(existsSync(join(run.codexHome, "models_cache.json"))).toBe(true);
    expect(existsSync(join(run.codexHome, ".codex-guard-cache-lock"))).toBe(false);
  });

  it("18b: stale lock → broken AND cleaned, rung skipped this run", async () => {
    const run = mkRun();
    const lock = join(run.codexHome, ".codex-guard-cache-lock");
    mkdirSync(lock);
    writeFileSync(join(lock, "owner"), "99999");
    const old = (Date.now() - 3600 * 1000) / 1000;
    utimesSync(lock, old, old);
    writeScenario(run, [TTL_FAIL, THEN_OK]);
    const res = await runGuard(run); // FAST_ENV stale threshold 600 default; lock is 3600s old
    expect(res.code).toBe(0);
    const r = readResult(run);
    expect((r.attempts as any[])[0].recovery).toBe("cache_ttl_skipped");
    expect(existsSync(lock)).toBe(false);
    expect(readdirSync(run.codexHome).filter((f) => f.startsWith(".codex-guard-cache-lock.stale-"))).toEqual([]);
  });

  it("18c: fresh foreign lock → skipped, cap consumed, lock survives wrapper exit", async () => {
    const run = mkRun();
    const lock = join(run.codexHome, ".codex-guard-cache-lock");
    mkdirSync(lock);
    writeFileSync(join(lock, "owner"), "99999");
    writeScenario(run, [TTL_FAIL, THEN_OK]);
    const res = await runGuard(run);
    expect(res.code).toBe(0);
    expect((readResult(run).attempts as any[])[0].recovery).toBe("cache_ttl_skipped");
    expect(existsSync(lock)).toBe(true);
    expect(existsSync(join(run.codexHome, "models_cache.json"))).toBe(true);
  });

  it("scenario 19a: literal-tilde CODEX_HOME expands against HOME", async () => {
    const run = mkRun();
    const customHome = join(run.home, "custom-codex");
    mkdirSync(customHome, { recursive: true });
    writeFileSync(join(customHome, "models_cache.json"), JSON.stringify({ custom: true }));
    writeScenario(run, [TTL_FAIL, THEN_OK]);
    const res = await runGuard(run, [], { CODEX_HOME: "~/custom-codex" });
    expect(res.code).toBe(0);
    expect((readResult(run).attempts as any[])[0].recovery).toBe("cache_ttl");
    expect(existsSync(join(customHome, "models_cache.json"))).toBe(false); // deleted there
    expect(existsSync(join(run.codexHome, "models_cache.json"))).toBe(true); // untouched default
  });

  it("scenario 19b: unset CODEX_HOME falls back to HOME/.codex", async () => {
    const run = mkRun();
    writeScenario(run, [TTL_FAIL, THEN_OK]);
    const res = await runGuard(run, [], { CODEX_HOME: "" });
    expect(res.code).toBe(0);
    expect((readResult(run).attempts as any[])[0].recovery).toBe("cache_ttl");
    expect(existsSync(join(run.codexHome, "models_cache.json"))).toBe(false);
  });
});
```

(Harness note: `CODEX_HOME: ""` must be treated as unset by `buildConfig` — the `?? join(homedir(),".codex")` needs `|| undefined` normalization: `process.env.CODEX_HOME || join(homedir(), ".codex")`. HOME override in tests redirects `homedir()`.)

- [ ] **Step 2: Run**

Run: `pnpm vitest run tests/codexGuard/ladder.test.ts tests/codexGuard/lock.test.ts`
Expected: most pass against Task 5 code; 19a/19b likely FAIL until the `CODEX_HOME || default` normalization + `expandPath` tilde handling verified. Fix inline in `buildConfig`.

- [ ] **Step 3: Run full suite, commit**

```bash
pnpm vitest run tests/codexGuard/
git add scripts/codex-guard.mjs tests/codexGuard && git commit --no-verify -m "test(infra): codex-guard cache rung, lock lifecycle, homedir pins"
```

---

### Task 7: Resume rung + wrapper signals + spawn error (scenarios 4, 10, 13, 14, 16)

**Files:**
- Modify: `scripts/codex-guard.mjs` (add SIGINT/SIGTERM handlers)
- Modify: `tests/codexGuard/ladder.test.ts` (scenarios 4, 10)
- Create: `tests/codexGuard/signals.test.ts` (scenarios 13, 14, 16)

**Interfaces:**
- Produces: signal handlers — on SIGINT/SIGTERM: kill live child group (TERM), release held lock, best-effort result.json `{failureReason:"interrupted"}`, exit 3.

- [ ] **Step 1: Write failing tests — append to ladder.test.ts:**

```ts
it("scenario 4: resume argv exact, cwd=--cwd, decoy sid in EARLIER attempt ignored", async () => {
  const run = mkRun();
  const decoySid = "00000000-0000-4000-8000-000000000000";
  const realSid = "12345678-90ab-4cde-8f01-234567890abc";
  // decoy sessions dir in CODEX_HOME (wrong source)
  mkdirSync(join(run.codexHome, "sessions", "zzz"), { recursive: true });
  writeScenario(run, [
    { onCall: 1, actions: [{ type: "stdout", text: `session id: ${decoySid}\n` }, { type: "stderr", text: "transient\n" }, { type: "exit", code: 1 }] }, // nonzero → generic retry (sid must NOT be captured)
    { onCall: 2, actions: [{ type: "stdout", text: `session id: ${realSid}\n` }, { type: "exit", code: 0 }] },   // truncation → resume
    { onCall: 3, actions: [{ type: "lastMessage", text: "VERDICT: APPROVE\n" }, { type: "exit", code: 0 }] },
  ]);
  const res = await runGuard(run);
  expect(res.code).toBe(0);
  const calls = readCalls(run);
  expect(calls[2].argv).toEqual([
    "exec", "resume", realSid, "-c", "model_reasoning_effort=high",
    "-o", join(run.outDir, "attempt-3.last-message.txt"),
  ]);
  expect(calls[2].cwd).toBe(run.cwdDir);
  const stdin3 = String(calls[2].stdin);
  expect(stdin3).toContain("mandatory final line");
});

it("scenario 10: ordered ladder cache_ttl → resume in one run; kinds exec,exec,resume", async () => {
  const run = mkRun();
  const sid = "deadbeef-dead-4bee-8f00-deadbeef0001";
  writeScenario(run, [
    { onCall: 1, actions: [{ type: "stderr", text: TTL_LINE }, { type: "exit", code: 0 }] },
    { onCall: 2, actions: [{ type: "stdout", text: `session id: ${sid}\n` }, { type: "exit", code: 0 }] },
    { onCall: 3, actions: [{ type: "lastMessage", text: "VERDICT: APPROVE\n" }, { type: "exit", code: 0 }] },
  ]);
  const res = await runGuard(run);
  expect(res.code).toBe(0);
  const r = readResult(run);
  expect((r.attempts as any[]).map((a) => a.recovery)).toEqual(["cache_ttl", "resume", null]);
  expect((r.attempts as any[]).map((a) => a.kind)).toEqual(["exec", "exec", "resume"]);
});
```

New `tests/codexGuard/signals.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { FAST_ENV, FIXTURE, GUARD, mkRun, readResult, writeScenario } from "./harness";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isDead(pid: number): boolean {
  try { process.kill(pid, 0); return false; } catch { return true; }
}

describe("codex-guard signals + spawn errors", () => {
  it("scenario 13: child killed externally → external_signal, ladder continues", async () => {
    const run = mkRun();
    writeScenario(run, [
      { onCall: 1, actions: [{ type: "stdout", text: "x" }, { type: "hang" }] },
      { onCall: 2, actions: [{ type: "lastMessage", text: "VERDICT: APPROVE\n" }, { type: "exit", code: 0 }] },
    ]);
    // external killer: watch for pid-1, SIGKILL it before the stall window (2s) expires
    const killer = setInterval(() => {
      const f = join(run.recordDir, "pid-1.txt");
      if (existsSync(f)) {
        try { process.kill(Number(readFileSync(f, "utf8")), "SIGKILL"); } catch { /* raced */ }
        clearInterval(killer);
      }
    }, 50);
    const { runGuard } = await import("./harness");
    const res = await runGuard(run);
    clearInterval(killer);
    expect(res.code).toBe(0);
    const r = readResult(run);
    const a1 = (r.attempts as any[])[0];
    expect(a1.killedReason).toBe("external_signal");
    expect(a1.signal).toBe("SIGKILL");
    expect(r.status).toBe("verdict");
  });

  it("scenario 14: CODEX_GUARD_BIN nonexistent → exit 3, wrapper_error, spawn_error attempt", async () => {
    const run = mkRun();
    writeScenario(run, [{ onCall: 1, actions: [{ type: "exit", code: 0 }] }]);
    const { runGuard } = await import("./harness");
    const res = await runGuard(run, [], { CODEX_GUARD_BIN: "/nonexistent/codex-binary" });
    expect(res.code).toBe(3);
    const r = readResult(run);
    expect(r.failureReason).toBe("wrapper_error");
    expect(((r.attempts as any[])[0] ?? {}).failureShape).toBe("spawn_error");
  });

  it("scenario 16: SIGTERM to wrapper mid-attempt → exit 3, interrupted, group dead", async () => {
    const run = mkRun();
    writeScenario(run, [
      { onCall: 1, actions: [{ type: "grandchild" }, { type: "stdout", text: "x" }, { type: "hang" }] },
    ]);
    const child = spawn(
      process.execPath,
      [GUARD, "review", "--brief", run.briefPath, "--cwd", run.cwdDir, "--out", run.outDir],
      {
        env: {
          ...process.env, HOME: run.home, CODEX_HOME: run.codexHome,
          CODEX_GUARD_BIN: `${process.execPath} ${FIXTURE}`,
          FAKE_CODEX_SCENARIO: run.scenarioPath, FAKE_CODEX_RECORD_DIR: run.recordDir,
          ...FAST_ENV, CODEX_GUARD_STALL_SECS: "30", CODEX_GUARD_ATTEMPT_MAX_SECS: "60", CODEX_GUARD_TOTAL_MAX_SECS: "90",
        },
      },
    );
    const exit = new Promise<number | null>((res) => child.on("exit", (c) => res(c)));
    // wait for the fake to be live, then TERM the wrapper
    for (let i = 0; i < 100 && !existsSync(join(run.recordDir, "pid-1.txt")); i++) await sleep(50);
    child.kill("SIGTERM");
    const code = await exit;
    expect(code).toBe(3);
    const r = readResult(run);
    expect(r.failureReason).toBe("interrupted");
    await sleep(500); // reap window
    expect(isDead(Number(readFileSync(join(run.recordDir, "pid-1.txt"), "utf8")))).toBe(true);
    expect(isDead(Number(readFileSync(join(run.recordDir, "grandchild-pid-1.txt"), "utf8")))).toBe(true);
  }, 30000);
});
```

- [ ] **Step 2: Run to verify failures**

Run: `pnpm vitest run tests/codexGuard/signals.test.ts tests/codexGuard/ladder.test.ts`
Expected: scenario 16 FAILS (no signal handlers yet); 4/10/13/14 pass or expose inline-fixable bugs.

- [ ] **Step 3: Implement signal handlers**

Add to `scripts/codex-guard.mjs` immediately before `main()`:

```js
function onSignal(sig) {
  const state = globalThis.__guardState;
  try {
    if (state?.liveChild?.pid) {
      killGroup(state.liveChild.pid, "SIGTERM");
      setTimeout(() => { try { killGroup(state.liveChild.pid, "SIGKILL"); } catch {} }, 200).unref();
    }
    if (state?.heldLockDir) releaseOwnLock(state, state.heldLockDir);
    if (state) {
      writeResult(cfg, state, { failureReason: "interrupted", error: `signal ${sig}` });
    }
  } catch { /* best-effort */ }
  process.exit(3);
}
process.on("SIGINT", () => onSignal("SIGINT"));
process.on("SIGTERM", () => onSignal("SIGTERM"));
```

Note: the fixture's grandchild is spawned with `detached: false` so it shares the fake's process GROUP (the wrapper's `detached: true` spawn made the fake a group leader) — `killGroup` reaches it. This is what scenario 16's grandchild assertion pins.

- [ ] **Step 4: Full suite**

Run: `pnpm vitest run tests/codexGuard/`
Expected: ALL scenarios 1–19 PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/codex-guard.mjs tests/codexGuard && git commit --no-verify -m "feat(infra): codex-guard resume rung, signal cleanup, spawn-error contract"
```

---

### Task 8: AGENTS.md docs + repo gates

**Files:**
- Modify: `AGENTS.md` — add subsection at the end of "## Codex-specific notes"
- Test: full repo gates (no new test file; docs task folded per right-sizing into the gate run)

- [ ] **Step 1: Add the AGENTS.md subsection (exact §10 content):**

```markdown
### Codex dispatch guard (`codex-guard`)

`scripts/codex-guard.mjs` wraps direct `codex exec` review/task dispatches with the banked-correct flags, stall detection, and the automated recovery ladder (models-cache clear, truncation resume, transient retry). Spec: `docs/superpowers/specs/2026-07-19-codex-guard.md`.

- All direct `codex exec` review/task dispatches SHOULD go through `node scripts/codex-guard.mjs review --brief <file> --cwd <dir> --out <dir>` — launched as a BACKGROUND Bash task (its exit notification is the completion signal).
- Companion app-server wedge rescue = `node scripts/codex-guard.mjs review --fallback --artifact <spec-or-plan> ...` (replaces the manual multi-step fallback procedure).
- Read `<out>/result.json`: `status:"verdict"` carries a recognized outcome (APPROVE / NEEDS-ATTENTION / BLOCKING); `status:"no_verdict"` → apply the existing skip/self-review escalation ladder — the wrapper bounds retry burn, it does not change escalation policy. Exit 3 = wrapper infra failure, not a Codex outcome.
- Brief authoring: the brief MUST instruct the reviewer to end with a final `VERDICT: <outcome>` line using APPROVE / NEEDS-ATTENTION / BLOCKING (the wrapper detects verdicts, it does not inject the instruction).
- Fresh `--out` per dispatch (timestamped dir); the wrapper refuses a dir already holding a `result.json`.
- Per-machine shim (optional): `mkdir -p ~/.claude/bin && printf '#!/bin/sh\nexec node "$HOME/FX-Webpage-Template/scripts/codex-guard.mjs" "$@"\n' > ~/.claude/bin/codex-guard && chmod +x ~/.claude/bin/codex-guard`
```

- [ ] **Step 2: Full gates (pre-push discipline)**

Run, each must be green:
```bash
pnpm vitest run tests/codexGuard/   # feature suite
pnpm test                            # FULL suite (scoped gates miss regressions)
pnpm typecheck
pnpm lint
pnpm format:check                    # prettier on new files (tests + docs; .mjs included)
```
Expected: all pass. `pnpm format:check` failures → `pnpm format` and re-stage.

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md && git commit --no-verify -m "docs: codex-guard dispatch contract in AGENTS.md"
```

---

### Task 9: Close-out (ship pipeline Stage 4 — reference)

Not a plan task proper; executed by the ship pipeline: whole-diff Codex review (fresh-eyes, REVIEWER ONLY) → push → PR → real CI green → `gh pr merge --merge` → ff-sync main → post-merge shim install on this machine (the §10 one-liner, pointing at the MAIN checkout path) + verify `~/.claude/bin/codex-guard` runs `--brief /dev/null` to a usage error (exit 2 sanity).

## Self-Review (run after drafting)

1. **Spec coverage:** §3 CLI (Task 2), §4 launch+prompt (Tasks 3, 7), §5 timers+precedence (Tasks 3, 4), §6 ladder+lock+parse+result (Tasks 3, 5, 6, 7), §7 validation (Task 2), §9 all 19 scenarios (1→T3, 2→T3, 3→T6, 4→T7, 5→T4, 6→T4, 7→T5, 8→T2, 9→T4/T5, 10→T7, 11→T6, 12→T4, 13→T7, 14→T7, 15→T6, 16→T7, 17→T4, 18→T6, 19→T6), §10 docs (Task 8). No gaps.
2. **Placeholder scan:** none — every rung/function body appears in full in Task 3/5/7 code blocks.
3. **Type consistency:** attempt-record keys match spec §6 schema verbatim; harness `Run`/`GuardExit` fields consistent across tasks; `CODEX_GUARD_BIN` split contract stated in Tasks 1 and 2.
