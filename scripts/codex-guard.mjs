#!/usr/bin/env node
// scripts/codex-guard.mjs — watchdog wrapper for direct Codex CLI dispatches.
// Spec: docs/superpowers/specs/2026-07-19-codex-guard.md (canonical; §11 = numeric authority).
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";
import { spawn } from "node:child_process";

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

// ---------------------------------------------------------------------------
// Prompt composition (§4) — composed ONCE at startup; cap violation = exit 2.
// ---------------------------------------------------------------------------

function composePrompt(cfg) {
  let prompt = cfg.briefText;
  if (cfg.fallback) {
    for (let i = 0; i < cfg.artifacts.length; i++) {
      prompt += `\n===== ARTIFACT: ${basename(cfg.artifacts[i])} =====\n`;
      prompt += cfg.artifactTexts[i];
      prompt += `\n===== END ARTIFACT =====\n`;
    }
    prompt +=
      "\nCitations were pre-verified — do not re-read files needlessly. " +
      "REACH A VERDICT — budget your reading.\n";
  }
  if (Buffer.byteLength(prompt) > cfg.promptMaxBytes) {
    usageError(`composed prompt exceeds PROMPT_MAX_BYTES (${cfg.promptMaxBytes})`);
  }
  return prompt;
}

// ---------------------------------------------------------------------------
// Verdict parsing (§6)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Attempt runner (§4/§5)
// ---------------------------------------------------------------------------

const nowSecs = () => Date.now() / 1000;

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

function killGroup(pid, signal) {
  try { process.kill(-pid, signal); } catch { /* group gone */ }
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
  // On a successful spawn, child.pid is set SYNCHRONOUSLY by spawn(); register the live
  // attempt BEFORE the first await so a signal landing in the spawn-confirmation window
  // can both kill (pid known) and record (currentAttempt set) it. On spawn failure pid
  // is undefined and the error path below unregisters before throwing.
  attempt.pid = child.pid ?? null;
  state.liveChild = child;
  state.currentAttempt = attempt; // live-attempt snapshot for onSignal (cleared on every exit path)
  // spawn failures surface via the async "error" event, NOT try/catch
  const spawnError = new Promise((res) => child.on("error", (e) => res(e)));
  const exited = new Promise((res) => child.on("exit", (code, signal) => res({ code, signal })));
  const closed = new Promise((res) => child.on("close", res)); // stdio fully flushed

  const first = await Promise.race([
    spawnError.then((e) => ({ kind: "error", e })),
    new Promise((res) => child.on("spawn", () => res({ kind: "spawned" }))),
  ]);
  if (first.kind === "error") {
    state.currentAttempt = null;
    state.liveChild = null;
    attempt.failureShape = "spawn_error";
    attempt.durationSecs = nowSecs() - t0;
    throw fail(`spawn failed: ${first.e.message}`);
  }

  const tOut = createWriteStream(transcriptPath);
  const tErr = createWriteStream(stderrPath);
  const streamErr = new Promise((_, rej) => {
    tOut.on("error", (e) => rej(fail(`transcript write failed: ${e.message}`)));
    tErr.on("error", (e) => rej(fail(`stderr write failed: ${e.message}`)));
  });
  let streamFailure = null;
  streamErr.catch((e) => { streamFailure = e; }); // latch: also swallows post-race rejection
  child.stdout.pipe(tOut);
  child.stderr.pipe(tErr);
  // settle on finish OR error — an errored stream never emits "finish" (no deadlock)
  const finished = Promise.all([
    new Promise((res) => { tOut.on("finish", res); tOut.on("error", res); }),
    new Promise((res) => { tErr.on("finish", res); tErr.on("error", res); }),
  ]);

  // Byte counters on BOTH streams drive the §5 timers (pipes keep writing files;
  // spec §5: "no growth in either" — stderr-only activity must reset the clocks too).
  let bytesOut = 0;
  child.stdout.on("data", (c) => { bytesOut += c.length; });
  child.stderr.on("data", (c) => { bytesOut += c.length; });

  const prompt = kind === "resume"
    ? "Output your final findings list and the mandatory final line now: VERDICT: ...\n"
    : cfg.prompt; // composed + cap-validated once at startup
  child.stdin.on("error", () => {});
  child.stdin.end(prompt);

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let exitInfo = null;
  exited.then((v) => { exitInfo = v; });
  // (streamFailure latch already declared above, next to streamErr)

  let firstByteAt = null, lastGrowthAt = t0, lastBytes = 0;
  while (exitInfo === null) {
    if (streamFailure) { killGroup(child.pid, "SIGKILL"); state.currentAttempt = null; state.liveChild = null; throw streamFailure; }
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
      killGroup(child.pid, "SIGKILL");                     // UNCONDITIONAL group sweep (helpers may survive leader)
      const reapEnd = nowSecs() + cfg.reapAfterKillSecs;
      while (exitInfo === null && nowSecs() < reapEnd) await sleep(50);
      if (exitInfo === null) throw fail("unkillable child");
      break;
    }
  }
  await closed;      // stdio flushed
  await finished;    // files durable (or errored — settled either way)
  // Late stream failure — child exited BEFORE/WITH the write-stream error, so the race
  // above resolved on `exited` and never threw. Rethrow here: an attempt must never be
  // classified (least of all as success) against a torn transcript/stderr file.
  if (streamFailure) {
    killGroup(child.pid, "SIGKILL"); // group hygiene — helpers may outlive the leader
    state.currentAttempt = null;
    state.liveChild = null;
    throw streamFailure;
  }
  attempt.exitCode = exitInfo.code;
  attempt.signal = exitInfo.signal;
  // NOTE: external_signal classification (exitInfo.signal !== null → killedReason) is
  // deliberately NOT set here — Task 7 adds that line when scenario 13 (its owning test) lands.
  attempt.durationSecs = nowSecs() - t0;
  try {
    classifyAttempt(attempt);
  } catch (e) {
    state.currentAttempt = null;
    state.liveChild = null;
    throw fail(`classification failed: ${e.message}`); // fail() attaches attempt — history survives via e.attempt
  }
  state.liveChild = null;
  state.currentAttempt = null; // cleared only AFTER classification — a classify throw still reaches history
  return attempt;
}

// ---------------------------------------------------------------------------
// Result writer (§6)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Recovery ladder (§6) — Task 5 ships only the generic branch; cache (Task 6)
// and resume (Task 7) branches are added test-first.
// ---------------------------------------------------------------------------

const TTL_SIGNATURE = /codex_models_manager::manager: failed to renew cache TTL/;

// §6 rung 1. Advisory lock; matched-or-skipped consumes the cap.
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

function selectRung(cfg, attempt, state) {
  let stderrText = "";
  try { stderrText = readFileSync(attempt.stderrPath, "utf8"); } catch { /* spawn_error */ }
  if (!state.cacheRungUsed && TTL_SIGNATURE.test(stderrText)) return tryCacheRung(cfg, attempt, state);

  attempt.recovery = "retry";
  return "retry";
}

// ---------------------------------------------------------------------------
// Main — attempt loop with exhaustion-before-admission ordering (§6)
// ---------------------------------------------------------------------------

const cfg = buildConfig(parseArgs(process.argv.slice(2)));
cfg.prompt = composePrompt(cfg);

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
