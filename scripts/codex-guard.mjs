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
void GUARD_VERSION;
void KNOWN_OUTCOMES;

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
