# codex-guard Implementation Plan (R1 revision)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `scripts/codex-guard.mjs` — the watchdog wrapper for `codex exec` dispatches per the APPROVED spec `docs/superpowers/specs/2026-07-19-codex-guard.md` — with the spec's 19 test scenarios green under vitest.

**Architecture:** One plain-Node ESM script (no repo runtime deps): arg parsing/validation → prompt composition → attempt loop (spawn codex, poll-based stall/timeout kills, stream capture) → failure classification → recovery ladder (cache-TTL rung with advisory lock, truncation-resume rung, generic retry) → verdict parsing → `result.json`. Function bodies GROW across tasks — each task's tests land FIRST, then the minimal code for that task's scenarios. Tests never spawn real codex: `CODEX_GUARD_BIN` (+ `CODEX_GUARD_BIN_ARGS`) points at a scenario-driven fake; all timing from `CODEX_GUARD_*` env decimals.

**Tech Stack:** Node 20 (`node:child_process`, `node:fs`, `node:path`, `node:os`), vitest, TypeScript for tests only (repo strict + `noUncheckedIndexedAccess` — index reads use `!` after length assertions, and harness returns TYPED shapes).

## Global Constraints (from spec — exact values)

- Spec canonical: `docs/superpowers/specs/2026-07-19-codex-guard.md`; §11 numeric authority: MAX_ATTEMPTS 3, ATTEMPT_MAX_SECS 1200 (max 1380), TOTAL_MAX_SECS 1500, STALL_SECS 420, FIRST_OUTPUT_SECS 120, POLL_INTERVAL_SECS 10 (max 30), KILL_GRACE_SECS 5 (max 30), MIN_ADMISSION_SECS 120, CACHE_LOCK_STALE_SECS 600, REAP_AFTER_KILL_SECS 10 (max 10), PROMPT_MAX_BYTES 2000000 (no env override).
- **Numeric domains:** CLI flags = positive INTEGERS only. Env `CODEX_GUARD_<NAME>` = positive decimals for timing constants, positive integer for MAX_ATTEMPTS, nothing for PROMPT_MAX_BYTES. Flags win. Same bounds both sources.
- Exit codes: 0 = result.json written; 2 = usage error (incl. unreadable inputs, unwritable out — probed at validation), no result.json; 3 = wrapper internal error, best-effort result.json PRESERVING all prior attempts.
- Fresh argv exactly: `exec --skip-git-repo-check -s read-only -C <cwd> -c model_reasoning_effort=high -o <out>/attempt-<n>.last-message.txt`. Resume argv exactly: `exec resume <sid> -c model_reasoning_effort=high -o <out>/attempt-<n>.last-message.txt`, child cwd = `--cwd`. Prompt always via stdin. No `-m`.
- Kill precedence total > attempt > stall > no_output; kill = group SIGTERM → grace → group SIGKILL (unconditional sweep — helpers may outlive the leader) → reap ≤ REAP_AFTER_KILL_SECS. Wrapper-signal path: immediate group TERM + KILL sweep (no grace — emergency exit), release held lock, best-effort result, exit 3.
- Stream integrity: classification/rung-matching reads files only after child `close` (stdio flushed) AND both write-streams `finish`.
- `CODEX_GUARD_BIN` = executable path ONLY; `CODEX_GUARD_BIN_ARGS` = JSON array of leading args. No string splitting.
- Verdict: strip fenced blocks → `/^\s*VERDICT:\s*\S/` lines → discard lines with ≥2 known-outcome OCCURRENCES (same outcome twice counts) or literal " or " → LAST survivor → `verdictLine` = RAW untrimmed line → payload fixpoint {trim; strip trailing `.,;:!`; strip one `*`/`_`/backtick layer} → uppercase → APPROVE|NEEDS-ATTENTION|BLOCKING else `unrecognized_verdict` failure.
- Commits: conventional, one task per commit, `--no-verify`. Worktree `/Users/ericweiss/FX-worktrees/codex-guard`.
- Meta-test inventory: none apply (spec §9). No UI/DB/pg_advisory.
- Hygiene: every test file calls the harness `afterAll` cleanup; intervals/killers cleared in `finally`; fixture cache-recreation is a deterministic fixture ACTION, never a test-side watcher.

## File Structure

- `scripts/codex-guard.mjs` — the wrapper.
- `tests/codexGuard/fixtures/fake-codex.mjs` — scenario-driven fake codex.
- `tests/codexGuard/harness.ts` — temp-run factory, typed result readers, guard spawner, cleanup.
- `tests/codexGuard/fixture.test.ts`, `usage.test.ts`, `happyPath.test.ts`, `timeouts.test.ts`, `ladder.test.ts`, `lock.test.ts`, `signals.test.ts`.
- `AGENTS.md` — "Codex dispatch guard (`codex-guard`)" subsection.

**Fixture scenario protocol:** env `FAKE_CODEX_SCENARIO` = JSON `{steps:[{onCall:N, actions:[...]}]}`. Actions: `{type:"stdout"|"stderr",text}`, `{type:"lastMessage",text}` (writes `-o` arg), `{type:"sleepMs",ms}`, `{type:"hang"}`, `{type:"emitEvery",ms,times,text}`, `{type:"exit",code}`, `{type:"grandchild"}` (spawns non-detached SIGTERM-IGNORING helper, records `grandchild-pid-<N>.txt`), `{type:"writeFile",path,text}` (path supports `$CODEX_HOME` substitution — deterministic cache recreation). Always records `call-<N>.json` {argv, cwd, stdinBytes, stdin, codexHome} + `pid-<N>.txt` to `FAKE_CODEX_RECORD_DIR`. Call N = count of existing call files + 1.

---

### Task 1: Fake codex fixture + typed test harness

**Files:**
- Create: `tests/codexGuard/fixtures/fake-codex.mjs`
- Create: `tests/codexGuard/harness.ts`
- Test: `tests/codexGuard/fixture.test.ts`

**Interfaces (produced — consumed by every later task):**

```ts
// harness.ts exports
export const GUARD: string; export const FIXTURE: string;
export interface Run { dir; outDir; recordDir; home; codexHome; scenarioPath; briefPath; cwdDir; } // all string
export interface AttemptRecord {
  n: number; kind: "exec" | "resume"; pid: number | null; exitCode: number | null;
  signal: string | null;
  killedReason: "no_output" | "stall" | "attempt_timeout" | "total_timeout" | "external_signal" | null;
  failureShape: "no_o_file" | "empty_o_file" | "no_marker" | "unrecognized_verdict" | "nonzero_exit" | "killed" | "spawn_error" | null;
  recovery: "cache_ttl" | "cache_ttl_skipped" | "resume" | "retry" | null;
  transcriptPath: string; stderrPath: string; lastMessagePath: string; durationSecs: number;
}
export interface GuardResult {
  guardVersion: number; label: string | null; status: "verdict" | "no_verdict";
  verdict: "APPROVE" | "NEEDS-ATTENTION" | "BLOCKING" | null; verdictLine: string | null;
  lastMessagePath: string | null; attempts: AttemptRecord[];
  failureReason: "attempts_exhausted" | "total_timeout" | "wrapper_error" | "interrupted" | null;
  error: string | null; startedAt: string | null; endedAt: string;
}
export interface CallRecord { argv: string[]; cwd: string; stdinBytes: number; stdin: string; codexHome: string | null; }
export interface GuardExit { code: number | null; stdout: string; stderr: string; }
export function mkRun(): Run;                       // registers dir for cleanup
export function cleanupRuns(): void;                // rm -rf every registered dir — call in afterAll
export function writeScenario(run: Run, steps: unknown[]): void;
export const FAST_ENV: Record<string, string>;      // poll .05, grace .2, reap .5, first-output 2, stall 2, attempt 10, total 20, admission .1
export function guardEnv(run: Run, envOverrides?: Record<string, string>): NodeJS.ProcessEnv; // full env incl. BIN/BIN_ARGS/HOME/CODEX_HOME/scenario/record
export function runGuard(run: Run, extraArgs?: string[], envOverrides?: Record<string, string>): Promise<GuardExit>;
export function readResult(run: Run): GuardResult;
export function readCalls(run: Run): CallRecord[];
```

`guardEnv` sets `CODEX_GUARD_BIN: process.execPath` and `CODEX_GUARD_BIN_ARGS: JSON.stringify([FIXTURE])` — no space-joined strings, space-safe on any path. `mkRun` seeds brief ("Review this artifact. End with VERDICT: APPROVE or VERDICT: NEEDS-ATTENTION.\n") and `models_cache.json` (`{"stub":true}`) under a fresh `mkdtempSync` tree, and pushes the tree onto a module-level list consumed by `cleanupRuns()`.

- [ ] **Step 1: Write failing fixture self-test** — same two tests as the protocol demands: (a) scenario playback records argv/stdin/pid, honors `-o`, exit code; (b) independent call counting across two invocations; PLUS (c) `writeFile` action with `$CODEX_HOME` substitution writes the file; (d) `grandchild` action records a pid that survives SIGTERM (send SIGTERM to it, assert still alive after 200ms, then SIGKILL it in `finally`). Test code mirrors Task 1 of Appendix A with the two extra cases:

```ts
it("writeFile action substitutes $CODEX_HOME", async () => {
  const dir = mkdtempSync(join(tmpdir(), "fake-codex-"));
  const ch = join(dir, "codexhome"); mkdirSync(ch);
  const scenario = join(dir, "s.json");
  writeFileSync(scenario, JSON.stringify({ steps: [{ onCall: 1, actions: [
    { type: "writeFile", path: "$CODEX_HOME/models_cache.json", text: "{\"recreated\":true}" },
    { type: "exit", code: 0 },
  ]}]}));
  await pExecFile(process.execPath, [FIXTURE, "exec"], { env: { ...process.env, FAKE_CODEX_SCENARIO: scenario, FAKE_CODEX_RECORD_DIR: dir, CODEX_HOME: ch } });
  expect(JSON.parse(readFileSync(join(ch, "models_cache.json"), "utf8"))).toEqual({ recreated: true });
});

it("grandchild ignores SIGTERM (pin for scenario 16's KILL-fallback proof)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "fake-codex-"));
  const scenario = join(dir, "s.json");
  writeFileSync(scenario, JSON.stringify({ steps: [{ onCall: 1, actions: [{ type: "grandchild" }, { type: "exit", code: 0 }] }] }));
  await pExecFile(process.execPath, [FIXTURE, "exec"], { env: { ...process.env, FAKE_CODEX_SCENARIO: scenario, FAKE_CODEX_RECORD_DIR: dir } });
  const gcPid = Number(readFileSync(join(dir, "grandchild-pid-1.txt"), "utf8"));
  try {
    process.kill(gcPid, "SIGTERM");
    await new Promise((r) => setTimeout(r, 200));
    let alive = true; try { process.kill(gcPid, 0); } catch { alive = false; }
    expect(alive).toBe(true);
  } finally { try { process.kill(gcPid, "SIGKILL"); } catch { /* done */ } }
});
```

All fixture tests end the file with `afterAll(() => { /* rm the mkdtemp dirs made locally */ });` (fixture tests manage their own dirs; guard tests use `cleanupRuns`).

- [ ] **Step 2: Run — expect FAIL (fixture missing)**: `pnpm vitest run tests/codexGuard/fixture.test.ts`

- [ ] **Step 3: Implement fixture** — Appendix A's `fake-codex.mjs` PLUS: `writeFile` action (`writeFileSync(a.path.replace("$CODEX_HOME", process.env.CODEX_HOME ?? ""), a.text)`), and the grandchild spawns `process.execPath ["-e", "process.on('SIGTERM',()=>{}); setInterval(()=>{},1e6)"]` with `detached: false, stdio: "ignore"`.

- [ ] **Step 4: Implement harness** — Appendix A's `harness.ts` reshaped to the typed interface block above: `guardEnv()` extracted (signals test spawns the guard itself and needs the env without `runGuard`'s execFile), `CODEX_GUARD_BIN`/`CODEX_GUARD_BIN_ARGS` split, `readResult(run): GuardResult` typed cast, module-level `const RUNS: string[] = []` + `cleanupRuns()` doing `rmSync(dir, { recursive: true, force: true })`.

- [ ] **Step 5: Run — expect PASS**: `pnpm vitest run tests/codexGuard/fixture.test.ts`

- [ ] **Step 6: Commit**: `git add tests/codexGuard && git commit --no-verify -m "test(infra): fake-codex fixture + typed codex-guard harness"`

---

### Task 2: CLI parsing, validation, usage errors (spec §3, §7; scenario 8)

**Files:** Create `scripts/codex-guard.mjs`; Test `tests/codexGuard/usage.test.ts`.

**Interfaces:** exit 2 + `codex-guard: <msg>` stderr on §7 violations; valid input → exit 3 `not implemented` (replaced in Task 3). Internal `CFG` as in Appendix A plus `bin: { cmd: string, leadingArgs: string[] }` from `CODEX_GUARD_BIN`/`CODEX_GUARD_BIN_ARGS` (JSON-parsed; parse failure = usage error).

- [ ] **Step 1: Failing tests** — Appendix A's table PLUS these rows/cases, all expecting exit 2 and no result.json:
  - `--stall-secs 0.5` (decimal CLI flag — flags are integer-only),
  - `--attempt-max-secs 0.5` (same),
  - unreadable brief: `writeFileSync(run.briefPath, "x"); chmodSync(run.briefPath, 0o000)` (restore perms in `finally`),
  - unreadable artifact with `--fallback`,
  - unwritable `--out`: pre-create `run.outDir` then `chmodSync(run.outDir, 0o500)` (restore in `finally`),
  - `CODEX_GUARD_BIN_ARGS` invalid JSON (`"not-json"`).
  Each test uses `afterAll(cleanupRuns)` (file-level).

- [ ] **Step 2: Run — expect FAIL** (script missing).

- [ ] **Step 3: Implement** — Appendix A's skeleton with these corrections:
  - `num()` used for ALL CLI numeric flags with `integer: true`; env timing values keep decimals (`readEnvNum` unchanged).
  - Readability probes: `readFileSync(cfg.brief, "utf8")` inside try/catch → usage error (covers perms, not just existence); same per artifact (content cached for Task 3's composePrompt — store on `cfg.briefText` / `cfg.artifactTexts` so validation read = the read).
  - Out-dir writability probe: after `mkdirSync`, `writeFileSync(join(cfg.out, ".codex-guard-write-probe"), "")` + `unlinkSync` in try/catch → usage error.
  - Bin: `const cmd = process.env.CODEX_GUARD_BIN || "codex"; let leadingArgs = []; if (process.env.CODEX_GUARD_BIN_ARGS) { try { leadingArgs = JSON.parse(...); if (!Array.isArray(leadingArgs) || !leadingArgs.every(s => typeof s === "string")) throw 0; } catch { usageError("CODEX_GUARD_BIN_ARGS must be a JSON string array"); } }`
  - `CODEX_HOME` empty-string treated as unset: `process.env.CODEX_HOME || join(homedir(), ".codex")` before `expandPath`.

- [ ] **Step 4: Run — expect PASS**: `pnpm vitest run tests/codexGuard/usage.test.ts`

- [ ] **Step 5: Commit**: `git add scripts/codex-guard.mjs tests/codexGuard/usage.test.ts && git commit --no-verify -m "feat(infra): codex-guard CLI parsing + §7 validation"`

---

### Task 3: Single-attempt runner + verdict parser + happy path (spec §4, §6-parse; scenarios 1, 2)

**Files:** Modify `scripts/codex-guard.mjs`; Test `tests/codexGuard/happyPath.test.ts`.

No timers yet (Task 4). This task: spawn with exact argv, stdin prompt, stream capture with FLUSH-SAFE completion, spawn-`error`-event handling, verdict parse, single-attempt main, result writer, wrapper_error catch preserving attempt history.

- [ ] **Step 1: Failing tests** — Appendix A's two tests with these strengthenings:
  - scenario 1 additionally asserts `calls[0]!.cwd === run.cwdDir` (child cwd pin, not just `-C` argv) and uses typed access: `const calls = readCalls(run); expect(calls).toHaveLength(1); const c0 = calls[0]!;`
  - scenario 2's last message keeps the fence + emphasis cases and ADDS a duplicate-outcome exclusion line and raw-verdictLine pin:

```ts
const lastMessage = [
  "The brief says: end with `VERDICT: APPROVE or VERDICT: NEEDS-ATTENTION`",
  "VERDICT: APPROVE APPROVE",             // two occurrences of one outcome → excluded
  "```",
  "VERDICT: APPROVE",
  "```",
  "Findings: one HIGH.",
  "  VERDICT: **NEEDS-ATTENTION**.  ",    // survivor; verdictLine must be THIS raw line
  "",
].join("\n");
// ...
expect(result.verdict).toBe("NEEDS-ATTENTION");
expect(result.verdictLine).toBe("  VERDICT: **NEEDS-ATTENTION**.  ");
```

- [ ] **Step 2: Run — expect FAIL** (exit 3 not-implemented).

- [ ] **Step 3: Implement** — Appendix A's Task 3 code with these corrections (full replacement bodies):

`parseVerdict` — occurrence counting + raw line:

```js
function parseVerdict(text) {
  const noFences = text.replace(/^```[^\n]*\n[\s\S]*?^```[^\n]*$/gm, "");
  const lines = noFences.split("\n").filter((l) => /^\s*VERDICT:\s*\S/.test(l));
  const survivors = lines.filter((l) => {
    const upper = l.toUpperCase();
    let occurrences = 0;
    for (const o of KNOWN_OUTCOMES) occurrences += upper.split(o).length - 1;
    // NEEDS-ATTENTION does not contain APPROVE/BLOCKING as substrings; counts are exact
    return occurrences < 2 && !/ or /i.test(l);
  });
  if (survivors.length === 0) return { verdict: null, verdictLine: null, shape: "no_marker" };
  const raw = survivors[survivors.length - 1]; // RAW, untrimmed (§6 schema)
  let payload = raw.replace(/^\s*VERDICT:\s*/, "");
  for (;;) {
    const before = payload;
    payload = payload.trim().replace(/[.,;:!]+$/, "");
    payload = payload.replace(/^(\*+|_+|`+)(.*?)\1$/, "$2");
    if (payload === before) break;
  }
  payload = payload.trim().toUpperCase();
  if (KNOWN_OUTCOMES.includes(payload)) return { verdict: payload, verdictLine: raw, shape: "ok" };
  return { verdict: null, verdictLine: raw, shape: "unrecognized_verdict" };
}
```

`runAttempt` — spawn-error event + flush-safe completion (no timers in this task; the poll loop arrives in Task 4):

```js
async function runAttempt(cfg, n, kind, argvAfterExec, state) {
  const transcriptPath = join(cfg.out, `attempt-${n}.transcript.txt`);
  const stderrPath = join(cfg.out, `attempt-${n}.stderr.txt`);
  const lastMessagePath = join(cfg.out, `attempt-${n}.last-message.txt`);
  const attempt = { n, kind, pid: null, exitCode: null, signal: null,
    killedReason: null, failureShape: null, recovery: null,
    transcriptPath, stderrPath, lastMessagePath, durationSecs: 0 };
  const t0 = nowSecs();
  const fail = (msg) => Object.assign(new Error(msg), { attempt });

  const child = spawn(cfg.bin.cmd, [...cfg.bin.leadingArgs, ...argvAfterExec], {
    cwd: cfg.cwd, detached: true, stdio: ["pipe", "pipe", "pipe"],
  });
  // spawn failures surface via the async "error" event, NOT try/catch
  const spawnError = new Promise((res) => child.on("error", (e) => res(e)));
  const exited = new Promise((res) => child.on("exit", (code, signal) => res({ code, signal })));
  const closed = new Promise((res) => child.on("close", res)); // stdio fully flushed

  const first = await Promise.race([
    spawnError.then((e) => ({ kind: "error", e })),
    new Promise((res) => child.on("spawn", () => res({ kind: "spawned" }))),
  ]);
  if (first.kind === "error") {
    attempt.failureShape = "spawn_error";
    attempt.durationSecs = nowSecs() - t0;
    throw fail(`spawn failed: ${first.e.message}`);
  }
  attempt.pid = child.pid ?? null;
  state.liveChild = child;

  const tOut = createWriteStream(transcriptPath);
  const tErr = createWriteStream(stderrPath);
  const streamErr = new Promise((_, rej) => {
    tOut.on("error", (e) => rej(fail(`transcript write failed: ${e.message}`)));
    tErr.on("error", (e) => rej(fail(`stderr write failed: ${e.message}`)));
  });
  child.stdout.pipe(tOut);
  child.stderr.pipe(tErr);
  const finished = Promise.all([
    new Promise((res) => tOut.on("finish", res)),
    new Promise((res) => tErr.on("finish", res)),
  ]);

  const prompt = kind === "resume"
    ? "Output your final findings list and the mandatory final line now: VERDICT: ...\n"
    : composePrompt(cfg);
  child.stdin.on("error", () => {});
  child.stdin.end(prompt);

  const exitInfo = await Promise.race([exited, streamErr]);
  await closed;      // stdio flushed
  await finished;    // files durable
  state.liveChild = null;
  attempt.exitCode = exitInfo.code;
  attempt.signal = exitInfo.signal;
  if (exitInfo.signal !== null) attempt.killedReason = "external_signal";
  attempt.durationSecs = nowSecs() - t0;
  classifyAttempt(attempt);
  return attempt;
}

function classifyAttempt(attempt) {
  if (attempt.killedReason !== null) { attempt.failureShape = "killed"; return; }
  if (attempt.exitCode !== 0) { attempt.failureShape = "nonzero_exit"; return; }
  if (!existsSync(attempt.lastMessagePath)) { attempt.failureShape = "no_o_file"; return; }
  const msg = readFileSync(attempt.lastMessagePath, "utf8");
  if (msg.trim() === "") { attempt.failureShape = "empty_o_file"; return; }
  const parsed = parseVerdict(msg);
  attempt.parsed = parsed;
  if (parsed.shape !== "ok") attempt.failureShape = parsed.shape;
}
```

`composePrompt` uses `cfg.briefText`/`cfg.artifactTexts` from Task 2 validation (no second read). `writeResult` as Appendix A. Single-attempt `main()` as Appendix A. Top-level catch preserves history:

```js
main().catch((e) => {
  const state = globalThis.__guardState;
  const attempts = [
    ...(state?.attempts ?? []).map(({ parsed, ...a }) => a),
    ...(e?.attempt && !(state?.attempts ?? []).includes(e.attempt) ? [(({ parsed, ...a }) => a)(e.attempt)] : []),
  ];
  try {
    writeFileSync(join(cfg.out, "result.json"), JSON.stringify({
      guardVersion: GUARD_VERSION, label: cfg.label, status: "no_verdict",
      verdict: null, verdictLine: null, lastMessagePath: null,
      attempts, failureReason: "wrapper_error", error: String(e?.message ?? e),
      startedAt: state?.startedAtIso ?? null, endedAt: new Date().toISOString(),
    }, null, 2) + "\n");
  } catch { /* stderr only */ }
  process.stderr.write(`codex-guard: wrapper_error: ${e?.message ?? e}\n`);
  process.exit(3);
});
```

(`main()` sets `globalThis.__guardState = state` FIRST — required by this catch and Task 7's handlers.)

- [ ] **Step 4: Run — expect PASS**: `pnpm vitest run tests/codexGuard/happyPath.test.ts tests/codexGuard/usage.test.ts`

- [ ] **Step 5: Commit**: `git add scripts/codex-guard.mjs tests/codexGuard/happyPath.test.ts && git commit --no-verify -m "feat(infra): codex-guard attempt runner + verdict parser + happy path"`

---

### Task 4: Timers + kills + precedence (spec §5; scenarios 5, 6, 12, 17; scenario 9 armed)

**Files:** Modify `scripts/codex-guard.mjs` (ADD the poll loop to `runAttempt`); Test `tests/codexGuard/timeouts.test.ts`.

- [ ] **Step 1: Failing tests** — Appendix A's five tests with typed access (`(readResult(run).attempts[0]!)`), file-level `afterAll(cleanupRuns)`, and scenario 9 written as `it.fails` (multi-attempt — armed for real in Task 5; comment says so). Timer-less Task 3 code makes 5/6/12/17a/17b FAIL (hang until vitest timeout on 5/6; no kills on 17) — that is the red state.

- [ ] **Step 2: Run — expect FAIL** on 5, 6, 17a, 17b (12 may pass trivially — acceptable: it pins the non-kill).

- [ ] **Step 3: Implement the poll loop inside `runAttempt`** — replace `const exitInfo = await Promise.race([exited, streamErr]);` with byte-counting listeners (`child.stdout.on("data", c => { bytesOut += c.length; })` alongside the pipes — pipes keep writing files; counters drive timers) and the §5 loop:

```js
  let exitInfo = null;
  exited.then((v) => { exitInfo = v; });
  let streamFailure = null;
  streamErr.catch((e) => { streamFailure = e; });

  let firstByteAt = null, lastGrowthAt = t0, lastBytes = 0;
  while (exitInfo === null) {
    if (streamFailure) throw streamFailure;
    await sleep(cfg.pollIntervalSecs * 1000);
    if (exitInfo !== null) break;
    const now = nowSecs();
    if (bytesOut > lastBytes) {
      lastBytes = bytesOut; lastGrowthAt = now;
      if (firstByteAt === null) firstByteAt = now;
    }
    let reason = null;                                     // §5 precedence
    if (now - state.startedAt > cfg.totalMaxSecs) reason = "total_timeout";
    else if (now - t0 > cfg.attemptMaxSecs) reason = "attempt_timeout";
    else if (firstByteAt !== null && now - lastGrowthAt > cfg.stallSecs) reason = "stall";
    else if (firstByteAt === null && now - t0 > cfg.firstOutputSecs) reason = "no_output";
    if (reason) {
      attempt.killedReason = reason;
      killGroup(child.pid, "SIGTERM");
      const graceEnd = nowSecs() + cfg.killGraceSecs;
      while (exitInfo === null && nowSecs() < graceEnd) await sleep(50);
      killGroup(child.pid, "SIGKILL");                     // UNCONDITIONAL group sweep (§ helpers may survive leader)
      const reapEnd = nowSecs() + cfg.reapAfterKillSecs;
      while (exitInfo === null && nowSecs() < reapEnd) await sleep(50);
      if (exitInfo === null) throw fail("unkillable child");
      break;
    }
  }
```

(`classifyAttempt` unchanged: killedReason set → `killed`; external `exitInfo.signal` with killedReason null → `external_signal` — set that in the post-loop block from Task 3, but only when `attempt.killedReason === null`.)

- [ ] **Step 4: Run — expect PASS** (scenario 9 still `it.fails`): `pnpm vitest run tests/codexGuard/timeouts.test.ts tests/codexGuard/happyPath.test.ts`

- [ ] **Step 5: Commit**: `git add scripts/codex-guard.mjs tests/codexGuard/timeouts.test.ts && git commit --no-verify -m "feat(infra): codex-guard §5 timers, kill precedence, group sweep"`

---

### Task 5: Ladder loop — generic retry, exhaustion, admission (spec §6 loop; scenarios 7, 15, 9-enable)

**Files:** Modify `scripts/codex-guard.mjs` (multi-attempt `main`, `selectRung` with ONLY the generic branch); Test `tests/codexGuard/ladder.test.ts` (scenarios 7 + 15), flip scenario 9 to `it`.

- [ ] **Step 1: Failing tests:** scenario 7 (Appendix A, typed access, `afterAll(cleanupRuns)`); scenario 15 DETERMINISTIC — no sleeps, no watcher:

```ts
const TTL_LINE = "ERROR codex_models_manager::manager: failed to renew cache TTL: missing field 'supports_reasoning_summaries'\n";

it("scenario 15: admission gate blocks rung side effects — cache intact, no backup", async () => {
  const run = mkRun();
  // attempt 1 fails FAST with the TTL signature on stderr; remaining budget (≈ total 20? no—)
  writeScenario(run, [{ onCall: 1, actions: [{ type: "stderr", text: TTL_LINE }, { type: "exit", code: 1 }] }]);
  // admission demands more seconds than can remain after ANY attempt: minAdmission > total
  const res = await runGuard(run, [], { CODEX_GUARD_MIN_ADMISSION_SECS: "30", CODEX_GUARD_TOTAL_MAX_SECS: "20" });
  expect(res.code).toBe(0);
  const r = readResult(run);
  expect(r.failureReason).toBe("total_timeout");
  expect(r.attempts).toHaveLength(1);
  expect(r.attempts[0]!.recovery).toBeNull();            // rung never selected
  expect(existsSync(join(run.codexHome, "models_cache.json"))).toBe(true);
  expect(existsSync(join(run.outDir, "models_cache.bak.json"))).toBe(false);
});
```

(minAdmission 30 > total 20 makes the gate close deterministically after attempt 1 regardless of speed — no timing race; TTL signature present proves the gate blocked a WOULD-fire rung. Note: minAdmission has no upper-bound validation — spec bounds only poll/grace/reap/attempt-max.)

- [ ] **Step 2: Run — expect FAIL** (single-attempt main).

- [ ] **Step 3: Implement** multi-attempt `main()` exactly as Appendix A's loop, except `selectRung` contains ONLY:

```js
function selectRung(cfg, attempt, state) {
  attempt.recovery = "retry";
  return "retry";
}
```

(the cache/resume branches are ADDED test-first in Tasks 6/7 — the loop's `nextKind = rung === "resume" ? "resume" : "exec"` and admission/exhaustion ordering land now, fully final).

- [ ] **Step 4: Run — expect PASS incl. scenario 9 now real**: `pnpm vitest run tests/codexGuard/`

- [ ] **Step 5: Commit**: `git add scripts/codex-guard.mjs tests/codexGuard && git commit --no-verify -m "feat(infra): codex-guard ladder loop, admission gate, exhaustion"`

---

### Task 6: Cache-TTL rung + lock lifecycle + homedir (scenarios 3, 11, 18a-c, 19)

**Files:** Modify `scripts/codex-guard.mjs` (add cache branch + `tryCacheRung` + `releaseOwnLock`); Modify `tests/codexGuard/ladder.test.ts` (3, 3b, 11); Create `tests/codexGuard/lock.test.ts` (18a–c, 19a/b).

- [ ] **Step 1: Failing tests.** Scenario 3 — deterministic recreation via fixture `writeFile` (NO test-side watcher):

```ts
it("scenario 3: TTL stderr fires rung once; cap holds even with cache recreated", async () => {
  const run = mkRun();
  writeScenario(run, [
    { onCall: 1, actions: [{ type: "stderr", text: TTL_LINE }, { type: "exit", code: 0 }] },     // no -o → failed
    { onCall: 2, actions: [
      { type: "writeFile", path: "$CODEX_HOME/models_cache.json", text: "{\"recreated\":true}" }, // deterministic
      { type: "stderr", text: TTL_LINE }, { type: "exit", code: 0 },
    ]},
    { onCall: 3, actions: [{ type: "lastMessage", text: "VERDICT: APPROVE\n" }, { type: "exit", code: 0 }] },
  ]);
  const res = await runGuard(run);
  expect(res.code).toBe(0);
  const r = readResult(run);
  expect(r.status).toBe("verdict");
  expect(r.attempts.map((a) => a.recovery)).toEqual(["cache_ttl", "retry", null]);   // cap: 2nd TTL → retry
  expect(readFileSync(join(run.outDir, "models_cache.bak.json"), "utf8")).toContain("stub");
  expect(JSON.parse(readFileSync(join(run.codexHome, "models_cache.json"), "utf8"))).toEqual({ recreated: true }); // recreated file NOT deleted again
});
```

Scenario 3b (stdout-only signature → retry, no backup) and 11 (cache absent → `cache_ttl_skipped` consumes cap; TTL again next failure would NOT shadow resume — exercised in Task 7's scenario 10/11 combo; here assert skip + cap via recoveries `["cache_ttl_skipped","retry",null]` with two TTL failures then success). `lock.test.ts` — Appendix A's 18a (chmod-000 unreadable cache → backup fails → skip → lock released; perms restored in `finally`), 18b (stale lock broken AND cleaned, rung skipped), 18c (fresh foreign lock survives wrapper exit), 19a (literal-tilde CODEX_HOME), 19b (`CODEX_HOME: ""` → HOME/.codex) — all with typed access + `afterAll(cleanupRuns)`.

- [ ] **Step 2: Run — expect FAIL** (`selectRung` knows only retry).

- [ ] **Step 3: Implement** — add to `selectRung` (before the generic branch):

```js
  let stderrText = "";
  try { stderrText = readFileSync(attempt.stderrPath, "utf8"); } catch { /* spawn_error */ }
  if (!state.cacheRungUsed && TTL_SIGNATURE.test(stderrText)) return tryCacheRung(cfg, attempt, state);
```

plus `tryCacheRung`/`releaseOwnLock` verbatim from Appendix A (already advisory + break-then-defer + tombstone cleanup + finally release). Init `state.cacheRungUsed = false`, `state.heldLockDir = null` in `main`.

- [ ] **Step 4: Run — expect PASS**: `pnpm vitest run tests/codexGuard/`

- [ ] **Step 5: Commit**: `git add scripts/codex-guard.mjs tests/codexGuard && git commit --no-verify -m "feat(infra): codex-guard cache-TTL rung + advisory lock lifecycle"`

---

### Task 7: Resume rung + wrapper signals + spawn-error history (scenarios 4, 10, 13, 14 + 14b, 16)

**Files:** Modify `scripts/codex-guard.mjs` (resume branch, signal handlers); Modify `tests/codexGuard/ladder.test.ts` (4, 10); Create `tests/codexGuard/signals.test.ts` (13, 14, 14b, 16).

- [ ] **Step 1: Failing tests.** Scenarios 4 and 10 from Appendix A (typed access; scenario 4 keeps decoy-sid-in-earlier-attempt + decoy sessions dir + exact resume argv + `calls[2]!.cwd === run.cwdDir`). Signals file — Appendix A's 13 and 16 with two changes, plus 14 and NEW 14b:
  - 16: grandchild now IGNORES SIGTERM (fixture pin from Task 1) — the group-KILL fallback is what the dead-grandchild assertion proves; imports `guardEnv` instead of hand-building env; killer/cleanup in `finally`.
  - 14: `CODEX_GUARD_BIN: "/nonexistent/codex-binary"` → exit 3, `failureReason:"wrapper_error"`, `attempts[0]!.failureShape === "spawn_error"`.
  - 14b (history preservation): attempt 1 fails normally (exit 1), then bin swap impossible mid-run — instead scenario: `CODEX_GUARD_MAX_ATTEMPTS: "2"` with call-2 reached but the FIXTURE deleted between calls? Non-deterministic. Deterministic approach: fixture action `{type:"exit",code:1}` for call 1 and the harness passes `CODEX_GUARD_BIN_ARGS` pointing at a fixture path that the SCENARIO for call 2 cannot serve (fake exits 96 on missing step — a normal nonzero). That doesn't produce spawn_error. INSTEAD: pin history via the interrupted path — scenario 16 ALREADY asserts `result.json` written on signal with `attempts` non-empty; extend 16's assertions: `expect(r.attempts.length).toBeGreaterThanOrEqual(1)` and `expect(r.attempts[0]!.n).toBe(1)`. That pins history preservation on the exit-3 path (finding 9's interface break) without an artificial mid-run spawn failure. 14b is therefore folded into 16's assertions; note this in the test comment.

- [ ] **Step 2: Run — expect FAIL** (no resume branch, no handlers).

- [ ] **Step 3: Implement.** Resume branch in `selectRung` (after cache branch, before generic) verbatim from Appendix A. Signal handlers — emergency TERM+KILL sweep (no grace), lock release, result, exit:

```js
function onSignal(sig) {
  const state = globalThis.__guardState;
  try {
    const pid = state?.liveChild?.pid;
    if (pid) { killGroup(pid, "SIGTERM"); killGroup(pid, "SIGKILL"); }  // emergency: no grace window
    if (state?.heldLockDir) releaseOwnLock(state, state.heldLockDir);
    if (state) writeResult(cfg, state, { failureReason: "interrupted", error: `signal ${sig}` });
  } catch { /* best-effort */ }
  process.exit(3);
}
process.on("SIGINT", () => onSignal("SIGINT"));
process.on("SIGTERM", () => onSignal("SIGTERM"));
```

- [ ] **Step 4: Run FULL guard suite — expect ALL 19 scenarios PASS**: `pnpm vitest run tests/codexGuard/`

- [ ] **Step 5: Commit**: `git add scripts/codex-guard.mjs tests/codexGuard && git commit --no-verify -m "feat(infra): codex-guard resume rung + signal cleanup + history preservation"`

---

### Task 8: AGENTS.md docs + full repo gates

Same as Appendix A: add the §10 subsection verbatim to the end of "## Codex-specific notes"; then the pre-push gate battery — `pnpm vitest run tests/codexGuard/`, `pnpm test` (full), `pnpm typecheck`, `pnpm lint`, `pnpm format:check` (run `pnpm format` on failure). Commit: `docs: codex-guard dispatch contract in AGENTS.md`.

---

### Task 9: Close-out (ship pipeline Stage 4 — reference)

Whole-diff Codex review (fresh-eyes, REVIEWER ONLY) → push → PR → real CI green → `gh pr merge --merge` → ff-sync main → post-merge machine shim install (§10 one-liner against the MAIN checkout) + sanity: `~/.claude/bin/codex-guard review --brief /dev/null` exits 2.

## Self-Review

1. **Spec coverage:** §3 (T2), §4 (T3, T7), §5 (T4), §6 (T3 parse; T5 loop; T6 cache; T7 resume), §7 (T2), §9 scenarios: 1→T3, 2→T3, 3/3b→T6, 4→T7, 5→T4, 6→T4, 7→T5, 8→T2, 9→T4(armed)/T5(real), 10→T7, 11→T6, 12→T4, 13→T7, 14(+14b-folded-into-16)→T7, 15→T5, 16→T7, 17→T4, 18→T6, 19→T6, §10 (T8). No gaps.
2. **TDD ordering:** every task = tests (Step 1) → red run (Step 2) → minimal implementation for THOSE tests (Step 3) → green (Step 4) → commit. No task implements behavior another task's tests own (timers wait for T4, rungs wait for T6/T7).
3. **Placeholder scan:** all function bodies complete; "Appendix A" references resolve within this document's own code blocks (parseVerdict, runAttempt, poll loop, tryCacheRung/releaseOwnLock in T6 verbatim-inline requirement, loop in T5, handlers in T7) — the executing engineer works from THIS file top-to-bottom; each referenced block appears in full at its first-use task.
4. **Type consistency:** harness interfaces (Task 1) are the single source for test-side types; attempt keys match spec §6 verbatim; `guardEnv` shared by runGuard and scenario 16.

---

## Appendix A — carried-forward code blocks (authoritative, R1-corrected)

Every task reference to "Appendix A" resolves here. These blocks are the single source; where a task body shows a corrected fragment (parseVerdict, poll loop, selectRung branches, onSignal), the task body wins for that fragment.

### A1 — `tests/codexGuard/fixtures/fake-codex.mjs` (complete)

```js
// Scenario-driven stand-in for the codex CLI. See plan "Fixture scenario protocol".
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
const callN = readdirSync(recordDir).filter((f) => /^call-\d+\.json$/.test(f)).length + 1;

const stdinChunks = [];
let stdinBytes = 0;
process.stdin.on("data", (c) => { stdinChunks.push(c); stdinBytes += c.length; });
const stdinDone = new Promise((res) => { process.stdin.on("end", res); process.stdin.on("error", res); });

const argv = process.argv.slice(2);
const oIdx = argv.findIndex((a) => a === "-o");
const oFile = oIdx >= 0 ? argv[oIdx + 1] : null;

const scenario = JSON.parse(readFileSync(scenarioPath, "utf8"));
const step = scenario.steps.find((s) => s.onCall === callN) ?? { actions: [{ type: "exit", code: 96 }] };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await stdinDone; // wrapper always closes stdin; a hang here IS a wrapper bug surfacing
  writeFileSync(join(recordDir, `pid-${callN}.txt`), String(process.pid));
  writeFileSync(join(recordDir, `call-${callN}.json`), JSON.stringify({
    argv, cwd: process.cwd(), stdinBytes,
    stdin: Buffer.concat(stdinChunks).toString("utf8").slice(0, 20000),
    codexHome: process.env.CODEX_HOME ?? null,
  }));
  for (const a of step.actions) {
    if (a.type === "stdout") process.stdout.write(a.text);
    else if (a.type === "stderr") process.stderr.write(a.text);
    else if (a.type === "lastMessage" && oFile) writeFileSync(oFile, a.text);
    else if (a.type === "sleepMs") await sleep(a.ms);
    else if (a.type === "hang") await sleep(2 ** 31 - 1);
    else if (a.type === "emitEvery") {
      for (let i = 0; i < a.times; i++) { process.stdout.write(a.text); await sleep(a.ms); }
    } else if (a.type === "writeFile") {
      writeFileSync(a.path.replace("$CODEX_HOME", process.env.CODEX_HOME ?? ""), a.text);
    } else if (a.type === "grandchild") {
      const gc = spawn(process.execPath, ["-e", "process.on('SIGTERM',()=>{}); setInterval(()=>{},1e6)"], {
        detached: false, stdio: "ignore",
      });
      writeFileSync(join(recordDir, `grandchild-pid-${callN}.txt`), String(gc.pid));
    } else if (a.type === "exit") process.exit(a.code);
  }
  process.exit(0);
}
main();
```

### A2 — `tests/codexGuard/harness.ts` (complete)

```ts
import { execFile } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const GUARD = join(process.cwd(), "scripts/codex-guard.mjs");
export const FIXTURE = join(process.cwd(), "tests/codexGuard/fixtures/fake-codex.mjs");

export interface Run {
  dir: string; outDir: string; recordDir: string; home: string; codexHome: string;
  scenarioPath: string; briefPath: string; cwdDir: string;
}
export interface AttemptRecord {
  n: number; kind: "exec" | "resume"; pid: number | null; exitCode: number | null;
  signal: string | null;
  killedReason: "no_output" | "stall" | "attempt_timeout" | "total_timeout" | "external_signal" | null;
  failureShape: "no_o_file" | "empty_o_file" | "no_marker" | "unrecognized_verdict" | "nonzero_exit" | "killed" | "spawn_error" | null;
  recovery: "cache_ttl" | "cache_ttl_skipped" | "resume" | "retry" | null;
  transcriptPath: string; stderrPath: string; lastMessagePath: string; durationSecs: number;
}
export interface GuardResult {
  guardVersion: number; label: string | null; status: "verdict" | "no_verdict";
  verdict: "APPROVE" | "NEEDS-ATTENTION" | "BLOCKING" | null; verdictLine: string | null;
  lastMessagePath: string | null; attempts: AttemptRecord[];
  failureReason: "attempts_exhausted" | "total_timeout" | "wrapper_error" | "interrupted" | null;
  error: string | null; startedAt: string | null; endedAt: string;
}
export interface CallRecord { argv: string[]; cwd: string; stdinBytes: number; stdin: string; codexHome: string | null; }
export interface GuardExit { code: number | null; stdout: string; stderr: string; }

const RUNS: string[] = [];
export function cleanupRuns(): void {
  for (const d of RUNS.splice(0)) rmSync(d, { recursive: true, force: true });
}

export function mkRun(): Run {
  const dir = mkdtempSync(join(tmpdir(), "codex-guard-test-"));
  RUNS.push(dir);
  const run: Run = {
    dir, outDir: join(dir, "out"), recordDir: join(dir, "record"),
    home: join(dir, "home"), codexHome: join(dir, "home", ".codex"),
    scenarioPath: join(dir, "scenario.json"), briefPath: join(dir, "brief.md"),
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

export function guardEnv(run: Run, envOverrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    HOME: run.home,
    CODEX_HOME: run.codexHome,
    CODEX_GUARD_BIN: process.execPath,
    CODEX_GUARD_BIN_ARGS: JSON.stringify([FIXTURE]),
    FAKE_CODEX_SCENARIO: run.scenarioPath,
    FAKE_CODEX_RECORD_DIR: run.recordDir,
    ...FAST_ENV,
    ...envOverrides,
  };
}

export function runGuard(
  run: Run, extraArgs: string[] = [], envOverrides: Record<string, string> = {},
): Promise<GuardExit> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [GUARD, "review", "--brief", run.briefPath, "--cwd", run.cwdDir, "--out", run.outDir, ...extraArgs],
      { env: guardEnv(run, envOverrides), maxBuffer: 16 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const code = err
          ? (typeof (err as { code?: unknown }).code === "number" ? ((err as { code?: number }).code ?? null) : null)
          : 0;
        resolve({ code, stdout: String(stdout), stderr: String(stderr) });
      },
    );
  });
}

export function readResult(run: Run): GuardResult {
  return JSON.parse(readFileSync(join(run.outDir, "result.json"), "utf8")) as GuardResult;
}

export function readCalls(run: Run): CallRecord[] {
  return readdirSync(run.recordDir)
    .filter((f) => /^call-\d+\.json$/.test(f))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]))
    .map((f) => JSON.parse(readFileSync(join(run.recordDir, f), "utf8")) as CallRecord);
}
```

### A3 — Task 2 CLI skeleton (`scripts/codex-guard.mjs` at end of Task 2; complete)

```js
#!/usr/bin/env node
// scripts/codex-guard.mjs — watchdog wrapper for direct Codex CLI dispatches.
// Spec: docs/superpowers/specs/2026-07-19-codex-guard.md (canonical; §11 = numeric authority).
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

const GUARD_VERSION = 1;

const DEFAULTS = {
  MAX_ATTEMPTS: 3, ATTEMPT_MAX_SECS: 1200, TOTAL_MAX_SECS: 1500,
  STALL_SECS: 420, FIRST_OUTPUT_SECS: 120, POLL_INTERVAL_SECS: 10,
  KILL_GRACE_SECS: 5, MIN_ADMISSION_SECS: 120, CACHE_LOCK_STALE_SECS: 600,
  REAP_AFTER_KILL_SECS: 10,
};
const BOUNDS = {
  ATTEMPT_MAX_SECS: 1380, POLL_INTERVAL_SECS: 30, KILL_GRACE_SECS: 30, REAP_AFTER_KILL_SECS: 10,
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

function readEnvNum(name, { integer = false } = {}) {
  const raw = process.env[`CODEX_GUARD_${name}`];
  if (raw === undefined || raw === "") return undefined;
  return num(`CODEX_GUARD_${name}`, raw, { integer });
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
  // CLI flags: positive INTEGERS. Env timing: positive decimals. Flags win. (§3/§11)
  const pick = (flagVal, envName, flagName) =>
    flagVal !== undefined
      ? num(flagName, flagVal, { integer: true })
      : (readEnvNum(envName, { integer: envName === "MAX_ATTEMPTS" }) ?? DEFAULTS[envName]);

  const cfg = {
    maxAttempts: pick(flags.maxAttempts, "MAX_ATTEMPTS", "--max-attempts"),
    attemptMaxSecs: pick(flags.attemptMaxSecs, "ATTEMPT_MAX_SECS", "--attempt-max-secs"),
    totalMaxSecs: pick(flags.totalMaxSecs, "TOTAL_MAX_SECS", "--total-max-secs"),
    stallSecs: pick(flags.stallSecs, "STALL_SECS", "--stall-secs"),
    firstOutputSecs: pick(flags.firstOutputSecs, "FIRST_OUTPUT_SECS", "--first-output-secs"),
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
  cfg.codexHome = expandPath(process.env.CODEX_HOME || join(homedir(), ".codex"));

  try { cfg.briefText = readFileSync(cfg.brief, "utf8"); }
  catch (e) { usageError(`--brief unreadable: ${e.message}`); }
  if (cfg.briefText.length === 0) usageError(`--brief is empty`);
  if (!existsSync(cfg.cwd) || !statSync(cfg.cwd).isDirectory()) usageError(`--cwd is not a directory: ${cfg.cwd}`);
  if (cfg.artifacts.length > 0 && !cfg.fallback) usageError("--artifact requires --fallback");
  cfg.artifactTexts = [];
  for (const a of cfg.artifacts) {
    try { cfg.artifactTexts.push(readFileSync(a, "utf8")); }
    catch (e) { usageError(`--artifact unreadable: ${e.message}`); }
  }
  try {
    mkdirSync(cfg.out, { recursive: true });
    const probe = join(cfg.out, ".codex-guard-write-probe");
    writeFileSync(probe, "");
    unlinkSync(probe);
  } catch (e) {
    usageError(`--out not writable: ${e.message}`);
  }
  if (existsSync(join(cfg.out, "result.json"))) usageError(`--out already contains result.json (any size): refuse reuse`);

  const cmd = process.env.CODEX_GUARD_BIN || "codex";
  let leadingArgs = [];
  if (process.env.CODEX_GUARD_BIN_ARGS) {
    try {
      leadingArgs = JSON.parse(process.env.CODEX_GUARD_BIN_ARGS);
      if (!Array.isArray(leadingArgs) || !leadingArgs.every((s) => typeof s === "string")) throw new Error("not a string array");
    } catch (e) {
      usageError(`CODEX_GUARD_BIN_ARGS must be a JSON string array: ${e.message}`);
    }
  }
  cfg.bin = { cmd, leadingArgs };
  return cfg;
}

const cfg = buildConfig(parseArgs(process.argv.slice(2)));
void cfg;
process.stderr.write("codex-guard: not implemented\n");
process.exit(3);
```

### A4 — `tests/codexGuard/happyPath.test.ts` (complete)

```ts
import { afterAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanupRuns, mkRun, readCalls, readResult, runGuard, writeScenario } from "./harness";

afterAll(cleanupRuns);

describe("codex-guard happy path", () => {
  it("scenario 1: exact argv, stdin prompt, child cwd, result.json contract", async () => {
    const run = mkRun();
    writeScenario(run, [
      { onCall: 1, actions: [
        { type: "stdout", text: "working\n" },
        { type: "lastMessage", text: "All good.\n\nVERDICT: APPROVE\n" },
        { type: "exit", code: 0 },
      ]},
    ]);
    const res = await runGuard(run, ["--label", "spec-r1"]);
    expect(res.code).toBe(0);

    const calls = readCalls(run);
    expect(calls).toHaveLength(1);
    const c0 = calls[0]!;
    expect(c0.argv).toEqual([
      "exec", "--skip-git-repo-check", "-s", "read-only", "-C", run.cwdDir,
      "-c", "model_reasoning_effort=high",
      "-o", join(run.outDir, "attempt-1.last-message.txt"),
    ]);
    expect(c0.cwd).toBe(run.cwdDir);
    const briefText = readFileSync(run.briefPath, "utf8");
    expect(c0.stdinBytes).toBe(Buffer.byteLength(briefText));
    expect(c0.stdin).toBe(briefText);

    const result = readResult(run);
    expect(result.status).toBe("verdict");
    expect(result.verdict).toBe("APPROVE");
    expect(result.verdictLine).toBe("VERDICT: APPROVE");
    expect(result.label).toBe("spec-r1");
    expect(result.guardVersion).toBe(1);
    expect(result.lastMessagePath).toBe(join(run.outDir, "attempt-1.last-message.txt"));
    expect(result.failureReason).toBeNull();
    expect(result.attempts).toHaveLength(1);
    const a = result.attempts[0]!;
    expect(a).toMatchObject({
      n: 1, kind: "exec", exitCode: 0, signal: null,
      killedReason: null, failureShape: null, recovery: null,
    });
    expect(typeof a.pid).toBe("number");
    expect(typeof a.durationSecs).toBe("number");
    expect(readFileSync(join(run.outDir, "attempt-1.transcript.txt"), "utf8")).toContain("working");
  });

  it("scenario 2: echo/fence/duplicate-outcome exclusions + normalization + raw verdictLine", async () => {
    const run = mkRun();
    const lastMessage = [
      "The brief says: end with `VERDICT: APPROVE or VERDICT: NEEDS-ATTENTION`",
      "VERDICT: APPROVE APPROVE",
      "```",
      "VERDICT: APPROVE",
      "```",
      "Findings: one HIGH.",
      "  VERDICT: **NEEDS-ATTENTION**.  ",
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
    expect(result.verdictLine).toBe("  VERDICT: **NEEDS-ATTENTION**.  ");
  });
});
```

### A5 — `tests/codexGuard/timeouts.test.ts` (complete)

```ts
import { afterAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanupRuns, mkRun, readResult, runGuard, writeScenario } from "./harness";

afterAll(cleanupRuns);
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
    expect(r.attempts[0]!).toMatchObject({ killedReason: "stall", failureShape: "killed" });
  }, 30000);

  it("scenario 6: no first byte → no_output kill", async () => {
    const run = mkRun();
    writeScenario(run, [{ onCall: 1, actions: [{ type: "hang" }] }]);
    const res = await runGuard(run, [], ONE_ATTEMPT);
    expect(res.code).toBe(0);
    expect(readResult(run).attempts[0]!.killedReason).toBe("no_output");
  }, 30000);

  it("scenario 12: periodic output resets the stall clock — no kill", async () => {
    const run = mkRun();
    writeScenario(run, [
      { onCall: 1, actions: [
        { type: "emitEvery", ms: 400, times: 20, text: "tick\n" },
        { type: "lastMessage", text: "VERDICT: APPROVE\n" },
        { type: "exit", code: 0 },
      ]},
    ]);
    const res = await runGuard(run, [], {
      ...ONE_ATTEMPT, CODEX_GUARD_ATTEMPT_MAX_SECS: "15", CODEX_GUARD_TOTAL_MAX_SECS: "18",
    });
    expect(res.code).toBe(0);
    expect(readResult(run).status).toBe("verdict");
  }, 30000);

  // Multi-attempt: armed as a real `it` by Task 5 (ladder loop); it.fails until then.
  it.fails("scenario 9: total timeout mid-attempt actively kills (pidfile dead)", async () => {
    const run = mkRun();
    writeScenario(run, [
      { onCall: 1, actions: [{ type: "stdout", text: "a" }, { type: "exit", code: 1 }] },
      { onCall: 2, actions: [{ type: "emitEvery", ms: 200, times: 100, text: "t" }] },
    ]);
    const res = await runGuard(run, [], {
      CODEX_GUARD_TOTAL_MAX_SECS: "3", CODEX_GUARD_ATTEMPT_MAX_SECS: "10",
      CODEX_GUARD_STALL_SECS: "8", CODEX_GUARD_FIRST_OUTPUT_SECS: "8",
    });
    expect(res.code).toBe(0);
    const r = readResult(run);
    expect(r.failureReason).toBe("total_timeout");
    expect(r.attempts[1]!.killedReason).toBe("total_timeout");
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
    expect(readResult(run).attempts[0]!.killedReason).toBe("attempt_timeout");
  }, 30000);

  it("scenario 17b: attempt-max and total-max expire together → total_timeout wins", async () => {
    const run = mkRun();
    writeScenario(run, [{ onCall: 1, actions: [{ type: "emitEvery", ms: 200, times: 200, text: "t" }] }]);
    const res = await runGuard(run, [], {
      ...ONE_ATTEMPT, CODEX_GUARD_ATTEMPT_MAX_SECS: "2", CODEX_GUARD_TOTAL_MAX_SECS: "2",
      CODEX_GUARD_STALL_SECS: "1.5", CODEX_GUARD_FIRST_OUTPUT_SECS: "1.5",
    });
    expect(res.code).toBe(0);
    expect(readResult(run).attempts[0]!.killedReason).toBe("total_timeout");
  }, 30000);
});
```

### A6 — scenario 7 test (in `tests/codexGuard/ladder.test.ts`; file has `afterAll(cleanupRuns)`)

```ts
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
  expect(r.attempts.map((a) => a.recovery)).toEqual(["retry", "retry", null]);
  expect(readCalls(run)).toHaveLength(3);
  for (const a of r.attempts) expect(a.failureShape).toBe("nonzero_exit");
});
```

### A7 — `tests/codexGuard/lock.test.ts` (complete; scenarios 18a-c, 19a/b)

```ts
import { afterAll, describe, expect, it } from "vitest";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanupRuns, mkRun, readResult, runGuard, writeScenario } from "./harness";

afterAll(cleanupRuns);

const TTL_LINE = "ERROR codex_models_manager::manager: failed to renew cache TTL: missing field 'supports_reasoning_summaries'\n";
const TTL_FAIL = { onCall: 1, actions: [{ type: "stderr", text: TTL_LINE }, { type: "exit", code: 0 }] };
const THEN_OK = { onCall: 2, actions: [{ type: "lastMessage", text: "VERDICT: APPROVE\n" }, { type: "exit", code: 0 }] };

describe("codex-guard cache lock lifecycle (§6)", () => {
  it("18a: unreadable cache → backup fails → skipped, cache intact, lock released", async () => {
    const run = mkRun();
    const cache = join(run.codexHome, "models_cache.json");
    chmodSync(cache, 0o000);
    try {
      writeScenario(run, [TTL_FAIL, THEN_OK]);
      const res = await runGuard(run);
      expect(res.code).toBe(0);
      const r = readResult(run);
      expect(r.attempts[0]!.recovery).toBe("cache_ttl_skipped");
      expect(existsSync(cache)).toBe(true);
      expect(existsSync(join(run.codexHome, ".codex-guard-cache-lock"))).toBe(false);
    } finally {
      chmodSync(cache, 0o644);
    }
  });

  it("18b: stale lock → broken AND cleaned, rung skipped this run", async () => {
    const run = mkRun();
    const lock = join(run.codexHome, ".codex-guard-cache-lock");
    mkdirSync(lock);
    writeFileSync(join(lock, "owner"), "99999");
    const old = (Date.now() - 3600 * 1000) / 1000;
    utimesSync(lock, old, old);
    writeScenario(run, [TTL_FAIL, THEN_OK]);
    const res = await runGuard(run);
    expect(res.code).toBe(0);
    expect(readResult(run).attempts[0]!.recovery).toBe("cache_ttl_skipped");
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
    expect(readResult(run).attempts[0]!.recovery).toBe("cache_ttl_skipped");
    expect(existsSync(lock)).toBe(true);
    expect(readFileSync(join(lock, "owner"), "utf8")).toBe("99999");
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
    expect(readResult(run).attempts[0]!.recovery).toBe("cache_ttl");
    expect(existsSync(join(customHome, "models_cache.json"))).toBe(false);
    expect(existsSync(join(run.codexHome, "models_cache.json"))).toBe(true);
  });

  it("scenario 19b: unset CODEX_HOME falls back to HOME/.codex", async () => {
    const run = mkRun();
    writeScenario(run, [TTL_FAIL, THEN_OK]);
    const res = await runGuard(run, [], { CODEX_HOME: "" });
    expect(res.code).toBe(0);
    expect(readResult(run).attempts[0]!.recovery).toBe("cache_ttl");
    expect(existsSync(join(run.codexHome, "models_cache.json"))).toBe(false);
  });
});
```

(19a/b note: `guardEnv` sets `HOME: run.home`; Node's `os.homedir()` reads `process.env.HOME` on POSIX, so the wrapper's tilde-expansion and default both follow the test HOME.)

### A8 — scenarios 4, 10 (ladder.test.ts) + 13, 14, 16 (`tests/codexGuard/signals.test.ts` complete)

```ts
// ladder.test.ts additions
it("scenario 4: resume argv exact, cwd=--cwd, decoy sid in EARLIER attempt ignored", async () => {
  const run = mkRun();
  const decoySid = "00000000-0000-4000-8000-000000000000";
  const realSid = "12345678-90ab-4cde-8f01-234567890abc";
  mkdirSync(join(run.codexHome, "sessions", "zzz"), { recursive: true });
  writeScenario(run, [
    { onCall: 1, actions: [{ type: "stdout", text: `session id: ${decoySid}\n` }, { type: "stderr", text: "transient\n" }, { type: "exit", code: 1 }] },
    { onCall: 2, actions: [{ type: "stdout", text: `session id: ${realSid}\n` }, { type: "exit", code: 0 }] },
    { onCall: 3, actions: [{ type: "lastMessage", text: "VERDICT: APPROVE\n" }, { type: "exit", code: 0 }] },
  ]);
  const res = await runGuard(run);
  expect(res.code).toBe(0);
  const calls = readCalls(run);
  expect(calls).toHaveLength(3);
  const c2 = calls[2]!;
  expect(c2.argv).toEqual([
    "exec", "resume", realSid, "-c", "model_reasoning_effort=high",
    "-o", join(run.outDir, "attempt-3.last-message.txt"),
  ]);
  expect(c2.cwd).toBe(run.cwdDir);
  expect(c2.stdin).toContain("mandatory final line");
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
  expect(r.attempts.map((a) => a.recovery)).toEqual(["cache_ttl", "resume", null]);
  expect(r.attempts.map((a) => a.kind)).toEqual(["exec", "exec", "resume"]);
});
```

```ts
// tests/codexGuard/signals.test.ts (complete)
import { afterAll, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { GUARD, cleanupRuns, guardEnv, mkRun, readResult, runGuard, writeScenario } from "./harness";

afterAll(cleanupRuns);
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
    const killer = setInterval(() => {
      const f = join(run.recordDir, "pid-1.txt");
      if (existsSync(f)) {
        try { process.kill(Number(readFileSync(f, "utf8")), "SIGKILL"); } catch { /* raced */ }
        clearInterval(killer);
      }
    }, 50);
    try {
      const res = await runGuard(run);
      expect(res.code).toBe(0);
      const r = readResult(run);
      const a1 = r.attempts[0]!;
      expect(a1.killedReason).toBe("external_signal");
      expect(a1.signal).toBe("SIGKILL");
      expect(r.status).toBe("verdict");
    } finally {
      clearInterval(killer);
    }
  }, 30000);

  it("scenario 14: nonexistent CODEX_GUARD_BIN → exit 3, wrapper_error, spawn_error attempt", async () => {
    const run = mkRun();
    writeScenario(run, [{ onCall: 1, actions: [{ type: "exit", code: 0 }] }]);
    const res = await runGuard(run, [], { CODEX_GUARD_BIN: "/nonexistent/codex-binary", CODEX_GUARD_BIN_ARGS: "[]" });
    expect(res.code).toBe(3);
    const r = readResult(run);
    expect(r.failureReason).toBe("wrapper_error");
    expect(r.attempts).toHaveLength(1);
    expect(r.attempts[0]!.failureShape).toBe("spawn_error");
  });

  it("scenario 16 (+14b history pin): SIGTERM to wrapper → exit 3, interrupted, group dead incl. TERM-ignoring grandchild, attempts preserved", async () => {
    const run = mkRun();
    writeScenario(run, [
      { onCall: 1, actions: [{ type: "grandchild" }, { type: "stdout", text: "x" }, { type: "hang" }] },
    ]);
    const child = spawn(
      process.execPath,
      [GUARD, "review", "--brief", run.briefPath, "--cwd", run.cwdDir, "--out", run.outDir],
      { env: guardEnv(run, { CODEX_GUARD_STALL_SECS: "30", CODEX_GUARD_ATTEMPT_MAX_SECS: "60", CODEX_GUARD_TOTAL_MAX_SECS: "90" }) },
    );
    const exit = new Promise<number | null>((res) => child.on("exit", (c) => res(c)));
    try {
      for (let i = 0; i < 100 && !existsSync(join(run.recordDir, "pid-1.txt")); i++) await sleep(50);
      expect(existsSync(join(run.recordDir, "pid-1.txt"))).toBe(true);
      await sleep(200); // let the grandchild spawn
      child.kill("SIGTERM");
      const code = await exit;
      expect(code).toBe(3);
      const r = readResult(run);
      expect(r.failureReason).toBe("interrupted");
      // 14b folded here: history preserved on the exit-3 path
      expect(r.attempts.length).toBeGreaterThanOrEqual(1);
      expect(r.attempts[0]!.n).toBe(1);
      await sleep(700); // reap window
      expect(isDead(Number(readFileSync(join(run.recordDir, "pid-1.txt"), "utf8")))).toBe(true);
      expect(isDead(Number(readFileSync(join(run.recordDir, "grandchild-pid-1.txt"), "utf8")))).toBe(true);
    } finally {
      child.kill("SIGKILL");
    }
  }, 30000);
});
```

(scenario 16 note: the signal handler snapshots `state.currentAttempt` — the live, not-yet-returned attempt — into the written attempts. Task 3's `runAttempt` sets `state.currentAttempt = attempt` after constructing it and clears it before returning; `onSignal` (Task 7) appends it when set. That is what makes `attempts.length >= 1` pass while attempt 1 is still live.)

### A9 — ladder internals (final shapes; Task 5 installs loop + retry, Task 6 installs cache, Task 7 installs resume)

```js
const TTL_SIGNATURE = /codex_models_manager::manager: failed to renew cache TTL/;
const SESSION_ID_RE = /session id:?\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

function freshArgv(cfg, n) {
  return [
    "exec", "--skip-git-repo-check", "-s", "read-only", "-C", cfg.cwd,
    "-c", "model_reasoning_effort=high",
    "-o", join(cfg.out, `attempt-${n}.last-message.txt`),
  ];
}

function resumeArgv(cfg, sid, n) {
  return ["exec", "resume", sid, "-c", "model_reasoning_effort=high",
    "-o", join(cfg.out, `attempt-${n}.last-message.txt`)];
}

function writeResult(cfg, state, patch) {
  const attempts = state.attempts.map(({ parsed, ...a }) => a);
  const body = {
    guardVersion: GUARD_VERSION, label: cfg.label,
    status: "no_verdict", verdict: null, verdictLine: null, lastMessagePath: null,
    attempts, failureReason: null, error: null,
    startedAt: state.startedAtIso, endedAt: new Date().toISOString(),
    ...patch,
  };
  writeFileSync(join(cfg.out, "result.json"), JSON.stringify(body, null, 2) + "\n");
}

// §6 rung 1 (Task 6). Advisory lock; matched-or-skipped consumes the cap.
function tryCacheRung(cfg, attempt, state) {
  state.cacheRungUsed = true;
  const lockDir = join(cfg.codexHome, ".codex-guard-cache-lock");
  const cachePath = join(cfg.codexHome, "models_cache.json");
  const skip = () => { attempt.recovery = "cache_ttl_skipped"; return "cache_ttl_skipped"; };

  if (!existsSync(cfg.codexHome) || !existsSync(cachePath)) return skip();

  if (existsSync(lockDir)) {
    let ageSecs = 0;
    try { ageSecs = (Date.now() - statSync(lockDir).mtimeMs) / 1000; } catch { return skip(); }
    if (ageSecs > cfg.cacheLockStaleSecs) {
      const tomb = join(cfg.codexHome, `.codex-guard-cache-lock.stale-${process.pid}-${Math.random().toString(36).slice(2, 8)}`);
      try { renameSync(lockDir, tomb); rmSync(tomb, { recursive: true, force: true }); } catch { /* sibling broke it */ }
      return skip(); // break-then-defer (§6)
    }
    return skip(); // fresh lock = live sibling
  }

  try { mkdirSync(lockDir); } catch { return skip(); }
  state.heldLockDir = lockDir;
  try {
    writeFileSync(join(lockDir, "owner"), String(process.pid));
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

// Final selectRung (after Tasks 6+7; Task 5 ships only the last two lines):
function selectRung(cfg, attempt, state) {
  let stderrText = "";
  try { stderrText = readFileSync(attempt.stderrPath, "utf8"); } catch { /* spawn_error */ }
  if (!state.cacheRungUsed && TTL_SIGNATURE.test(stderrText)) return tryCacheRung(cfg, attempt, state);   // Task 6

  if (!state.resumeRungUsed && attempt.exitCode === 0 &&
      ["no_o_file", "empty_o_file", "no_marker", "unrecognized_verdict"].includes(attempt.failureShape)) { // Task 7
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
  attempt.recovery = "retry";                                                                             // Task 5
  return "retry";
}

// Multi-attempt main (Task 5; final shape)
async function main() {
  const state = {
    startedAt: nowSecs(), startedAtIso: new Date().toISOString(),
    attempts: [], liveChild: null, currentAttempt: null,
    cacheRungUsed: false, resumeRungUsed: false, resumeSid: null, heldLockDir: null,
  };
  globalThis.__guardState = state;

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
    if (state.attempts.length >= cfg.maxAttempts) {  // exhaustion BEFORE admission (§6)
      writeResult(cfg, state, { failureReason: "attempts_exhausted", verdictLine: attempt.parsed?.verdictLine ?? null });
      process.exit(0);
    }
    const remaining = cfg.totalMaxSecs - (nowSecs() - state.startedAt);
    if (remaining < cfg.minAdmissionSecs) {          // admission gates rung side effects (§6)
      writeResult(cfg, state, { failureReason: "total_timeout", verdictLine: attempt.parsed?.verdictLine ?? null });
      process.exit(0);
    }
    const rung = selectRung(cfg, attempt, state);
    nextKind = rung === "resume" ? "resume" : "exec";
  }
}
```

(`runAttempt` — Task 3 body + Task 4 poll loop — additionally sets `state.currentAttempt = attempt` immediately after constructing `attempt` and clears it (`state.currentAttempt = null`) just before returning; `onSignal` (Task 7) includes `state.currentAttempt` in the written attempts when set. Imports consumed by A9's lock code: add `renameSync`, `rmSync`, `createWriteStream` (runner), `spawn` (`node:child_process`) as the owning tasks land.)
