#!/usr/bin/env node
// scripts/codex-guard.mjs — watchdog wrapper for direct Codex CLI dispatches.
// Spec: docs/superpowers/specs/2026-07-19-codex-guard.md (canonical; §11 = numeric authority).
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";

const GUARD_VERSION = 1;

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
  ATTEMPT_MAX_SECS: 1380,
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
  if (!Number.isFinite(v) || v <= 0)
    usageError(`${name} must be a positive ${integer ? "integer" : "number"}: ${raw}`);
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
  const flags = { artifacts: [], lintDocs: [] };
  const takesValue = new Set([
    "--brief",
    "--cwd",
    "--out",
    "--artifact",
    "--lint-doc",
    "--label",
    "--max-attempts",
    "--attempt-max-secs",
    "--total-max-secs",
    "--stall-secs",
    "--first-output-secs",
  ]);
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--fallback") {
      flags.fallback = true;
      continue;
    }
    if (!takesValue.has(a)) usageError(`unknown flag: ${a}`);
    const v = argv[++i];
    if (v === undefined) usageError(`${a} requires a value`);
    if (a === "--artifact") flags.artifacts.push(v);
    else if (a === "--lint-doc") flags.lintDocs.push(v);
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
  if (cfg.firstOutputSecs >= cfg.attemptMaxSecs)
    usageError(`FIRST_OUTPUT_SECS must be < ATTEMPT_MAX_SECS`);
  if (cfg.label !== null && !/^[A-Za-z0-9_-]{1,64}$/.test(cfg.label)) usageError(`invalid --label`);

  if (!flags.brief) usageError("--brief is required");
  if (!flags.cwd) usageError("--cwd is required");
  if (!flags.out) usageError("--out is required");
  cfg.brief = expandPath(flags.brief);
  cfg.cwd = expandPath(flags.cwd);
  cfg.out = expandPath(flags.out);
  cfg.artifacts = flags.artifacts.map(expandPath);
  cfg.lintBudgetBytes = Number(process.env.CODEX_GUARD_LINT_BUDGET_BYTES ?? 200000);
  cfg.lintCliArgs = [
    resolve(process.env.CODEX_GUARD_TSX ?? join(process.cwd(), "node_modules/tsx/dist/cli.mjs")),
    resolve(process.env.CODEX_GUARD_SPEC_LINT ?? join(process.cwd(), "scripts/spec-lint.ts")),
  ];
  cfg.codexHome = expandPath(process.env.CODEX_HOME || join(homedir(), ".codex"));

  try {
    cfg.briefText = readFileSync(cfg.brief, "utf8");
  } catch (e) {
    usageError(`--brief unreadable: ${e.message}`);
  }
  if (cfg.briefText.length === 0) usageError(`--brief is empty`);
  if (!existsSync(cfg.cwd) || !statSync(cfg.cwd).isDirectory())
    usageError(`--cwd is not a directory: ${cfg.cwd}`);
  if (cfg.artifacts.length > 0 && !cfg.fallback) usageError("--artifact requires --fallback");

  // §2.2.1 — a relative --lint-doc resolves against --cwd, never the wrapper's
  // launch cwd. Invariant 11 makes those differ on every worktree run, so
  // inheriting the launch cwd breaks the feature in normal use.
  cfg.lintDocs = flags.lintDocs.map((d) => {
    const abs = isAbsolute(d) ? resolve(d) : resolve(cfg.cwd, d);
    const root = resolve(cfg.cwd);
    if (abs !== root && !abs.startsWith(root + "/")) {
      usageError(`--lint-doc is outside the repository: ${abs} (repo root: ${root})`);
    }
    return abs;
  });
  cfg.artifactTexts = [];
  for (const a of cfg.artifacts) {
    try {
      cfg.artifactTexts.push(readFileSync(a, "utf8"));
    } catch (e) {
      usageError(`--artifact unreadable: ${e.message}`);
    }
  }
  try {
    mkdirSync(cfg.out, { recursive: true });
    const probe = join(cfg.out, ".codex-guard-write-probe");
    writeFileSync(probe, "");
    unlinkSync(probe);
  } catch (e) {
    usageError(`--out not writable: ${e.message}`);
  }
  if (existsSync(join(cfg.out, "result.json")))
    usageError(`--out already contains result.json (any size): refuse reuse`);

  const cmd = process.env.CODEX_GUARD_BIN || "codex";
  let leadingArgs = [];
  if (process.env.CODEX_GUARD_BIN_ARGS) {
    try {
      leadingArgs = JSON.parse(process.env.CODEX_GUARD_BIN_ARGS);
      if (!Array.isArray(leadingArgs) || !leadingArgs.every((s) => typeof s === "string"))
        throw new Error("not a string array");
    } catch (e) {
      usageError(`CODEX_GUARD_BIN_ARGS must be a JSON string array: ${e.message}`);
    }
  }
  cfg.bin = { cmd, leadingArgs };
  // The `codex` entrypoint on npm is a Node shim that spawns the native Rust binary.
  // On a SIGINT/SIGTERM/SIGHUP death of that binary the shim re-raises the signal at
  // itself while its OWN handlers for those signals are still installed, so the handler
  // runs instead of the default terminate, Node falls off the event loop, and the shim
  // exits 0 (@openai/codex bin/codex.js:224 registers, :246 re-raises). Every signal
  // death is laundered into "exit 0, no -o file" — indistinguishable from a clean run
  // that produced nothing. Invoking the native binary directly removes the laundering
  // layer so `signal` survives into the attempt record and classification is honest.
  cfg.nativeBin = process.env.CODEX_GUARD_NO_NATIVE === "1" ? null : resolveNativeBinary(cfg.bin);
  if (cfg.nativeBin) cfg.bin = { cmd: cfg.nativeBin, leadingArgs: [] };
  return cfg;
}

const NATIVE_TRIPLE_BY_PLATFORM = {
  "darwin-arm64": ["codex-darwin-arm64", "aarch64-apple-darwin"],
  "darwin-x64": ["codex-darwin-x64", "x86_64-apple-darwin"],
  "linux-arm64": ["codex-linux-arm64", "aarch64-unknown-linux-musl"],
  "linux-x64": ["codex-linux-x64", "x86_64-unknown-linux-musl"],
};

/**
 * Resolve the vendored native codex binary that the Node shim would spawn.
 * Returns null (caller keeps the configured bin) whenever the layout is not the
 * recognised npm one — a custom entrypoint, a non-`codex` command, or a missing vendor
 * tree. Never throws: failing to resolve is a soft downgrade, not an error.
 */
function resolveNativeBinary({ cmd, leadingArgs }) {
  if (leadingArgs.length > 0) return null; // custom entrypoint (e.g. `node <fixture>`)
  const entry = NATIVE_TRIPLE_BY_PLATFORM[`${process.platform}-${process.arch}`];
  if (!entry) return null;
  const [pkg, triple] = entry;

  // Locate the shim on disk. An absolute path is used as-is; the bare name is resolved by
  // scanning PATH directly. No shell is involved — `cmd` comes from CODEX_GUARD_BIN and
  // must never reach a shell for interpolation.
  let shimPath = null;
  try {
    if (isAbsolute(cmd)) {
      shimPath = existsSync(cmd) ? realpathSync(cmd) : null;
    } else if (cmd === "codex") {
      for (const dir of (process.env.PATH || "").split(":")) {
        if (!dir) continue;
        const p = join(dir, "codex");
        if (existsSync(p)) {
          shimPath = realpathSync(p);
          break;
        }
      }
    }
  } catch {
    return null;
  }
  if (!shimPath) return null;
  // Only ever redirect a Node shim. A path that already IS the native binary, or any
  // other executable, is left alone.
  if (basename(shimPath) !== "codex.js") return null;

  const pkgRoot = join(shimPath, "..", ".."); // <root>/bin/codex.js -> <root>
  for (const cand of [
    join(pkgRoot, "node_modules", "@openai", pkg, "vendor", triple, "bin", "codex"),
    join(pkgRoot, "vendor", triple, "bin", "codex"),
  ]) {
    try {
      if (existsSync(cand) && statSync(cand).isFile()) return resolve(cand);
    } catch {
      /* keep looking */
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Prompt composition (§4) — composed ONCE at startup; cap violation = exit 2.
// ---------------------------------------------------------------------------

/**
 * §2.2.2 — the embedded block, by construction:
 *   head (first three lines) / body prefix / notice if shortened / summary last.
 * `body` is positional — everything after the head up to the bare INVENTORY
 * line or `summary:` — so check-section labels are inside it by definition
 * rather than by enumeration.
 */
function embedReport(raw, requestedRel, allowance) {
  const lines = raw.split("\n");
  let sum = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].startsWith("summary:")) {
      sum = i;
      break;
    }
  }
  // §2.3 frame validation — all five clauses. The fifth is about what the
  // transform DISCARDS: a bare INVENTORY or a non-final summary: before a later
  // finding section passes the two ends and then loses real findings.
  const firstOk = lines[0] === `spec:lint ${requestedRel}`;
  const kindOk = (lines[1] ?? "").startsWith("kind: ");
  const blankOk = (lines[2] ?? "") === "";
  const sumOk = sum >= 3;
  const oneSummary = lines.filter((l) => l.startsWith("summary:")).length === 1;
  // `summary:` must be the LAST content line — anything after it sits outside
  // the construction and would be silently dropped.
  const summaryFinal = lines.slice(sum + 1).every((l) => l.trim() === "");
  const inv = lines.indexOf("INVENTORY");
  const invBeforeSummary = inv === -1 || inv < sum;
  // ALLOWLIST over the discard span, not a denylist of finding-shaped lines. A
  // renderer can move a section label or a subordinate `detail:` line in there
  // while leaving the primary finding above it, and both are then discarded
  // with every clause still green. Only indented inventory entries and blanks
  // may sit between INVENTORY and summary.
  const discardClean =
    inv === -1 || lines.slice(inv + 1, sum).every((l) => l === "" || /^ {2,}\S/.test(l));
  if (
    !firstOk ||
    !kindOk ||
    !blankOk ||
    !sumOk ||
    !oneSummary ||
    !summaryFinal ||
    !invBeforeSummary ||
    !discardClean
  ) {
    return null;
  }

  const head = lines.slice(0, 3);
  const body = lines.slice(3, inv === -1 ? sum : inv);
  const summary = lines[sum];

  const whole = [...head, ...body, summary].join("\n");
  if (Buffer.byteLength(whole) <= allowance) return { block: whole, truncated: false };

  const totalBody = Buffer.byteLength(body.join("\n"));
  const notice = (n) => `[truncated: ${n} of ${totalBody} bytes shown]`;
  const frameBytes = (n) => Buffer.byteLength([...head, notice(n), summary].join("\n"));
  const kept = [];
  let acc = 0;
  for (const l of body) {
    const trial = acc + Buffer.byteLength(l) + 1;
    if (frameBytes(trial) + trial > allowance) break;
    kept.push(l);
    acc = trial;
  }
  return { block: [...head, ...kept, notice(acc), summary].join("\n"), truncated: true };
}

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
  if (cfg.lintReports && cfg.lintReports.length > 0) {
    for (const r of cfg.lintReports) {
      prompt += `\n===== SPEC-LINT: ${r.rel} =====\n`;
      prompt += r.block;
      prompt += `\n===== END SPEC-LINT =====\n`;
    }
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
  // Markdown fences may be indented up to 3 spaces (CommonMark) — strip those too.
  const noFences = text.replace(/^ {0,3}```[^\n]*\n[\s\S]*?^ {0,3}```[^\n]*$/gm, "");
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
    "exec",
    "--skip-git-repo-check",
    "-s",
    "read-only",
    "-C",
    cfg.cwd,
    "-c",
    "model_reasoning_effort=high",
    "-o",
    join(cfg.out, `attempt-${n}.last-message.txt`),
  ];
}

function resumeArgv(cfg, sid, n) {
  return [
    "exec",
    "resume",
    sid,
    "-c",
    "model_reasoning_effort=high",
    "-o",
    join(cfg.out, `attempt-${n}.last-message.txt`),
  ];
}

// ---------------------------------------------------------------------------
// Liveness heartbeat.
//
// ROOT CAUSE of the 2026-07-24 silent deaths: the machine-local hook
// ~/.claude/hooks/reap-idle-codex.sh (Stop / SubagentStop) SIGTERMs every codex process
// tree older than CODEX_REAP_MIN_AGE (120s) whenever its liveness gate sees no recent
// activity. That gate watches ~/.codex/log, the companion plugin state dir, and
// session_index.jsonl / history.jsonl — but deliberately NOT ~/.codex/sessions, which is
// the only place a running `codex exec` writes. A non-interactive dispatch is therefore
// invisible to the gate and gets reaped mid-turn on the next turn boundary.
//
// The correct fix is in that hook (add a scoped ~/.codex/sessions freshness check); it is
// per-machine config and out of this repo's scope. This is the in-repo self-defense: emit
// a real liveness signal into a path the gate already watches, refreshed ONLY when the
// child actually produces output. A genuinely wedged child stops beating and stays
// reapable — and the guard's own stall/attempt/total timers still bound it either way.
// ---------------------------------------------------------------------------

function beatHeartbeat(cfg) {
  if (process.env.CODEX_GUARD_NO_HEARTBEAT === "1") return;
  try {
    const dir = join(cfg.codexHome, "log");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "codex-guard-heartbeat.log"),
      `${new Date().toISOString()} codex-guard pid=${process.pid} out=${cfg.out}\n`,
    );
  } catch {
    /* best-effort: never fail a dispatch over a heartbeat */
  }
}

function killGroup(pid, signal) {
  try {
    process.kill(-pid, signal);
  } catch {
    /* group gone */
  }
}

function classifyAttempt(attempt) {
  if (attempt.killedReason !== null) {
    attempt.failureShape = "killed";
    return;
  }
  if (attempt.exitCode !== 0) {
    attempt.failureShape = "nonzero_exit";
    return;
  }
  if (!existsSync(attempt.lastMessagePath)) {
    attempt.failureShape = "no_o_file";
    return;
  }
  const msg = readFileSync(attempt.lastMessagePath, "utf8");
  if (msg.trim() === "") {
    attempt.failureShape = "empty_o_file";
    return;
  }
  const parsed = parseVerdict(msg);
  attempt.parsed = parsed;
  if (parsed.shape !== "ok") attempt.failureShape = parsed.shape;
}

async function runAttempt(cfg, n, kind, argvAfterExec, state) {
  const transcriptPath = join(cfg.out, `attempt-${n}.transcript.txt`);
  const stderrPath = join(cfg.out, `attempt-${n}.stderr.txt`);
  const lastMessagePath = join(cfg.out, `attempt-${n}.last-message.txt`);
  const attempt = {
    n,
    kind,
    pid: null,
    exitCode: null,
    signal: null,
    killedReason: null,
    failureShape: null,
    recovery: null,
    sessionId: null,
    transcriptPath,
    stderrPath,
    lastMessagePath,
    durationSecs: 0,
  };
  const t0 = nowSecs();
  const fail = (msg) => Object.assign(new Error(msg), { attempt });

  const child = spawn(cfg.bin.cmd, [...cfg.bin.leadingArgs, ...argvAfterExec], {
    cwd: cfg.cwd,
    detached: true,
    stdio: ["pipe", "pipe", "pipe"],
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
  streamErr.catch((e) => {
    streamFailure = e;
  }); // latch: also swallows post-race rejection
  child.stdout.pipe(tOut);
  child.stderr.pipe(tErr);
  // settle on finish OR error — an errored stream never emits "finish" (no deadlock)
  const finished = Promise.all([
    new Promise((res) => {
      tOut.on("finish", res);
      tOut.on("error", res);
    }),
    new Promise((res) => {
      tErr.on("finish", res);
      tErr.on("error", res);
    }),
  ]);

  // Byte counters on BOTH streams drive the §5 timers (pipes keep writing files;
  // spec §5: "no growth in either" — stderr-only activity must reset the clocks too).
  let bytesOut = 0;
  child.stdout.on("data", (c) => {
    bytesOut += c.length;
  });
  child.stderr.on("data", (c) => {
    bytesOut += c.length;
  });

  const prompt =
    kind === "resume"
      ? "Output your final findings list and the mandatory final line now: VERDICT: ...\n"
      : cfg.prompt; // composed + cap-validated once at startup
  child.stdin.on("error", () => {});
  child.stdin.end(prompt);

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let exitInfo = null;
  exited.then((v) => {
    exitInfo = v;
  });
  // (streamFailure latch already declared above, next to streamErr)

  let firstByteAt = null,
    lastGrowthAt = t0,
    lastBytes = 0;
  beatHeartbeat(cfg); // arm before the first poll — reapers use a min-age, not a min-output
  while (exitInfo === null) {
    if (streamFailure) {
      killGroup(child.pid, "SIGKILL");
      state.currentAttempt = null;
      state.liveChild = null;
      throw streamFailure;
    }
    await sleep(cfg.pollIntervalSecs * 1000);
    if (exitInfo !== null) break;
    const now = nowSecs();
    if (bytesOut > lastBytes) {
      lastBytes = bytesOut;
      lastGrowthAt = now;
      if (firstByteAt === null) firstByteAt = now;
      beatHeartbeat(cfg); // only on REAL growth — a wedged child must stay reapable
    }
    let reason = null; // §5 precedence
    if (now - state.startedAt > cfg.totalMaxSecs) reason = "total_timeout";
    else if (now - t0 > cfg.attemptMaxSecs) reason = "attempt_timeout";
    else if (firstByteAt !== null && now - lastGrowthAt > cfg.stallSecs) reason = "stall";
    else if (firstByteAt === null && now - t0 > cfg.firstOutputSecs) reason = "no_output";
    if (reason) {
      attempt.killedReason = reason;
      killGroup(child.pid, "SIGTERM");
      const graceEnd = nowSecs() + cfg.killGraceSecs;
      while (exitInfo === null && nowSecs() < graceEnd) await sleep(50);
      killGroup(child.pid, "SIGKILL"); // UNCONDITIONAL group sweep (helpers may survive leader)
      const reapEnd = nowSecs() + cfg.reapAfterKillSecs;
      while (exitInfo === null && nowSecs() < reapEnd) await sleep(50);
      if (exitInfo === null) throw fail("unkillable child");
      break;
    }
  }
  // Leader exited (any path): unconditional group sweep — helpers may outlive the leader.
  // Without this, an externally-killed or normally-exiting leader leaks a live helper into
  // the flush wait (inherited pipes park `close` forever) or into the next attempt.
  killGroup(child.pid, "SIGKILL");
  await closed; // stdio flushed
  await finished; // files durable (or errored — settled either way)
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
  if (attempt.killedReason === null && exitInfo.signal !== null)
    attempt.killedReason = "external_signal";
  attempt.durationSecs = nowSecs() - t0;
  // Latch this attempt's session id (stderr banner) regardless of outcome — the rollout
  // scrape needs it even for attempts that never earn the resume rung.
  try {
    const m = SESSION_ID_RE.exec(readFileSync(stderrPath, "utf8"));
    if (m) {
      attempt.sessionId = m[1];
      if (!state.seenSids.includes(m[1])) state.seenSids.push(m[1]);
    }
  } catch {
    /* no stderr file */
  }
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
  const attempts = state.attempts.map(({ parsed: _parsed, ...a }) => a);
  const body = {
    guardVersion: GUARD_VERSION,
    label: cfg.label,
    status: "no_verdict",
    verdict: null,
    verdictLine: null,
    lastMessagePath: null,
    attempts,
    failureReason: null,
    error: null,
    recoveredFrom: null,
    nativeBinaryResolved: cfg.nativeBin ?? null,
    lintArm: (cfg.lintDocs ?? []).length > 0 ? "present" : "absent",
    startedAt: state.startedAtIso,
    endedAt: new Date().toISOString(),
    ...patch,
  };
  writeFileSync(join(cfg.out, "result.json"), JSON.stringify(body, null, 2) + "\n");
}

// ---------------------------------------------------------------------------
// Rollout scrape — last-resort verdict recovery.
//
// A session can emit its final assistant message and then die before the `-o` file is
// written, leaving a recoverable verdict on disk that the guard would otherwise discard.
// This is belt-and-braces: in the 2026-07-24 evidence set every rollout died mid-loop
// with no final message, so the scrape would NOT have rescued those runs. It closes the
// narrower window where the message exists but the `-o` write never landed.
// ---------------------------------------------------------------------------

function findRollout(cfg, sid) {
  const root = join(cfg.codexHome, "sessions");
  const hits = [];
  const walk = (dir, depth) => {
    if (depth > 5) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (e.name.endsWith(".jsonl") && e.name.includes(sid)) hits.push(p);
    }
  };
  walk(root, 0);
  return hits;
}

/** Last assistant message text in a rollout JSONL, or "" when the turn produced none. */
function lastAgentMessage(path) {
  let text = "";
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return "";
  }
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let o;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    const p = o?.payload;
    if (p?.type === "message" && p.role === "assistant" && Array.isArray(p.content)) {
      const joined = p.content
        .map((c) => (typeof c?.text === "string" ? c.text : ""))
        .join("")
        .trim();
      if (joined) text = joined;
    } else if (p?.type === "agent_message" && typeof p.message === "string") {
      if (p.message.trim()) text = p.message.trim();
    }
  }
  return text;
}

/** Returns a patch that upgrades the result to a verdict, or null when nothing is recoverable. */
function tryRolloutScrape(cfg, state) {
  for (const sid of [...state.seenSids].reverse()) {
    for (const rollout of findRollout(cfg, sid)) {
      const msg = lastAgentMessage(rollout);
      if (!msg) continue;
      const parsed = parseVerdict(msg);
      if (parsed.shape !== "ok") continue;
      const path = join(cfg.out, "recovered-from-rollout.txt");
      try {
        writeFileSync(path, msg.endsWith("\n") ? msg : msg + "\n");
      } catch {
        continue;
      }
      return {
        status: "verdict",
        verdict: parsed.verdict,
        verdictLine: parsed.verdictLine,
        lastMessagePath: path,
        recoveredFrom: "rollout_scrape",
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Recovery ladder (§6) — Task 5 ships only the generic branch; cache (Task 6)
// and resume (Task 7) branches are added test-first.
// ---------------------------------------------------------------------------

const TTL_SIGNATURE = /codex_models_manager::manager: failed to renew cache TTL/;
const SESSION_ID_RE =
  /session id:?\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

// §6 rung 1. Advisory lock; matched-or-skipped consumes the cap.
function tryCacheRung(cfg, attempt, state) {
  state.cacheRungUsed = true;
  const lockDir = join(cfg.codexHome, ".codex-guard-cache-lock");
  const cachePath = join(cfg.codexHome, "models_cache.json");
  const skip = () => {
    attempt.recovery = "cache_ttl_skipped";
    return "cache_ttl_skipped";
  };

  if (!existsSync(cfg.codexHome) || !existsSync(cachePath)) return skip();

  if (existsSync(lockDir)) {
    let ageSecs = 0;
    try {
      ageSecs = (Date.now() - statSync(lockDir).mtimeMs) / 1000;
    } catch {
      return skip();
    }
    if (ageSecs > cfg.cacheLockStaleSecs) {
      const tomb = join(
        cfg.codexHome,
        `.codex-guard-cache-lock.stale-${process.pid}-${Math.random().toString(36).slice(2, 8)}`,
      );
      try {
        renameSync(lockDir, tomb);
        rmSync(tomb, { recursive: true, force: true });
      } catch {
        /* sibling broke it */
      }
      return skip(); // break-then-defer (§6)
    }
    return skip(); // fresh lock = live sibling
  }

  try {
    mkdirSync(lockDir);
  } catch {
    return skip();
  }
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
  } catch {
    /* owner-less or foreign: leave for stale-break */
  }
  if (state.heldLockDir === lockDir) state.heldLockDir = null;
}

function selectRung(cfg, attempt, state) {
  let stderrText = "";
  try {
    stderrText = readFileSync(attempt.stderrPath, "utf8");
  } catch {
    /* spawn_error */
  }
  if (!state.cacheRungUsed && TTL_SIGNATURE.test(stderrText))
    return tryCacheRung(cfg, attempt, state);

  if (
    !state.resumeRungUsed &&
    attempt.exitCode === 0 &&
    ["no_o_file", "empty_o_file", "no_marker", "unrecognized_verdict"].includes(
      attempt.failureShape,
    )
  ) {
    let transcript = "";
    try {
      transcript = readFileSync(attempt.transcriptPath, "utf8");
    } catch {
      /* none */
    }
    // The `session id:` banner is printed on STDERR, not stdout — with `-o`, stdout stays
    // empty (every preserved attempt transcript in the 2026-07-24 evidence set is 0 bytes),
    // so a transcript-only search made this rung unreachable in production while its own
    // tests passed on stdout-emitting fixtures. Search stderr first, transcript second;
    // both are THIS attempt's files only (§6 wrong-source guard).
    const m = SESSION_ID_RE.exec(stderrText) ?? SESSION_ID_RE.exec(transcript);
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

// ---------------------------------------------------------------------------
// Main — attempt loop with exhaustion-before-admission ordering (§6)
// ---------------------------------------------------------------------------

const cfg = buildConfig(parseArgs(process.argv.slice(2)));
// §2.2 — run spec:lint per --lint-doc BEFORE composing, so an infra fault
// refuses the dispatch instead of embedding a broken report. Seating is decided
// up front: each report's allowance reserves the floors of every report still
// to come, so an earlier one cannot expand into a later one's frame.
if (cfg.lintDocs.length > 0) {
  const FLOOR = 220; // head + a worst-case notice + summary
  if (FLOOR * cfg.lintDocs.length > cfg.lintBudgetBytes) {
    usageError(
      `${cfg.lintDocs.length} --lint-doc reports cannot be seated in ${cfg.lintBudgetBytes} bytes`,
    );
  }
  cfg.lintReports = [];
  let remaining = cfg.lintBudgetBytes;
  for (let i = 0; i < cfg.lintDocs.length; i++) {
    const abs = cfg.lintDocs[i];
    const rel = abs.startsWith(resolve(cfg.cwd) + "/")
      ? abs.slice(resolve(cfg.cwd).length + 1)
      : abs;
    const r = spawnSync(process.execPath, [cfg.lintCliArgs[0], cfg.lintCliArgs[1], rel], {
      cwd: cfg.cwd,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    // Exit 2 is an infra fault; a spawn failure or signal death gives no usable
    // code at all. None of them is a findings report.
    // The CLI defines exactly 0 and 1. Anything else — 2, a signal death, or an
    // undefined status 3..255 — means it is not the CLI, or not one this
    // contract knows, so refuse rather than dispatch an armed-looking report
    // built from whatever it happened to print.
    if (r.error || r.status === null || (r.status !== 0 && r.status !== 1)) {
      usageError(`spec:lint could not run for ${rel} (status ${r.status ?? "signal"})`);
    }
    const downstream = FLOOR * (cfg.lintDocs.length - i - 1);
    const embedded = embedReport(r.stdout ?? "", rel, remaining - downstream);
    if (!embedded) usageError(`spec:lint produced a malformed report for ${rel}`);
    cfg.lintReports.push({ rel, block: embedded.block });
    remaining -= Buffer.byteLength(embedded.block);
  }
}

cfg.prompt = composePrompt(cfg);

async function main() {
  const state = {
    startedAt: nowSecs(),
    startedAtIso: new Date().toISOString(),
    attempts: [],
    liveChild: null,
    currentAttempt: null,
    cacheRungUsed: false,
    resumeRungUsed: false,
    resumeSid: null,
    seenSids: [],
    heldLockDir: null,
  };
  globalThis.__guardState = state;

  let nextKind = "exec";
  for (let n = 1; ; n++) {
    const argv = nextKind === "resume" ? resumeArgv(cfg, state.resumeSid, n) : freshArgv(cfg, n);
    const attempt = await runAttempt(cfg, n, nextKind, argv, state);
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
    // Terminal no-verdict paths get one last-resort rollout scrape (never overrides a
    // real verdict — this only runs when the attempt loop has already given up).
    const giveUp = (failureReason) => {
      const base = { failureReason, verdictLine: attempt.parsed?.verdictLine ?? null };
      writeResult(cfg, state, { ...base, ...(tryRolloutScrape(cfg, state) ?? {}) });
      process.exit(0);
    };
    if (attempt.killedReason === "total_timeout") giveUp("total_timeout");
    // exhaustion BEFORE admission (§6)
    if (state.attempts.length >= cfg.maxAttempts) giveUp("attempts_exhausted");
    const remaining = cfg.totalMaxSecs - (nowSecs() - state.startedAt);
    // admission gates rung side effects (§6)
    if (remaining < cfg.minAdmissionSecs) giveUp("total_timeout");
    const rung = selectRung(cfg, attempt, state);
    nextKind = rung === "resume" ? "resume" : "exec";
  }
}

function onSignal(sig) {
  const state = globalThis.__guardState;
  try {
    const pid = state?.liveChild?.pid;
    if (pid) {
      killGroup(pid, "SIGTERM");
      killGroup(pid, "SIGKILL");
    } // emergency: no grace window
    if (state?.heldLockDir) releaseOwnLock(state, state.heldLockDir);
    if (state) {
      // snapshot the live attempt so the interrupted result preserves history (scenario 16 / 14b pin)
      if (state.currentAttempt && !state.attempts.includes(state.currentAttempt)) {
        state.attempts.push(state.currentAttempt);
      }
      writeResult(cfg, state, { failureReason: "interrupted", error: `signal ${sig}` });
    }
  } catch {
    /* best-effort */
  }
  process.exit(3);
}
process.on("SIGINT", () => onSignal("SIGINT"));
process.on("SIGTERM", () => onSignal("SIGTERM"));

main().catch((e) => {
  const state = globalThis.__guardState;
  const attempts = [
    ...(state?.attempts ?? []).map(({ parsed: _parsed, ...a }) => a),
    ...(e?.attempt && !(state?.attempts ?? []).includes(e.attempt)
      ? [(({ parsed: _parsed, ...a }) => a)(e.attempt)]
      : []),
  ];
  try {
    writeFileSync(
      join(cfg.out, "result.json"),
      JSON.stringify(
        {
          guardVersion: GUARD_VERSION,
          label: cfg.label,
          status: "no_verdict",
          verdict: null,
          verdictLine: null,
          lastMessagePath: null,
          lintArm: (cfg?.lintDocs ?? []).length > 0 ? "present" : "absent",
          attempts,
          failureReason: "wrapper_error",
          error: String(e?.message ?? e),
          startedAt: state?.startedAtIso ?? null,
          endedAt: new Date().toISOString(),
        },
        null,
        2,
      ) + "\n",
    );
  } catch {
    /* stderr only */
  }
  process.stderr.write(`codex-guard: wrapper_error: ${e?.message ?? e}\n`);
  process.exit(3);
});
