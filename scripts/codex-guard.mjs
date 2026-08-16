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

import { emitRow, resolveArc } from "./reviewRoundEmit.mjs";

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
  // SAFE integer, not merely integral: `Number()` has already ROUNDED an unsafe
  // literal by the time this runs, so `Number.isInteger` is true for a value the
  // caller never wrote (probed 2026-08-05: 9007199254740993 accepted as
  // 9007199254740992). Same class as the declared-count repair, on the flag.
  if (integer && !Number.isSafeInteger(v)) usageError(`${name} must be a positive integer: ${raw}`);
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
    "--stage",
    "--round",
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

  // §5.1 - closed accept-set, keyed on value, never coerced. An `unknown`
  // bucket would be a silent exemption from the filing gate, which is exactly
  // the failure this design refuses. `task` is recorded and never counted.
  const STAGES = new Set(["spec", "plan", "diff", "task"]);
  if (flags.stage === undefined) usageError("--stage is required (spec|plan|diff|task)");
  if (!STAGES.has(flags.stage))
    usageError(`--stage must be one of spec|plan|diff|task: ${flags.stage}`);
  cfg.stage = flags.stage;
  if (flags.round === undefined) usageError("--round is required (integer >= 1)");
  cfg.round = num("--round", flags.round, { integer: true });

  if (!flags.brief) usageError("--brief is required");
  if (!flags.cwd) usageError("--cwd is required");
  if (!flags.out) usageError("--out is required");
  cfg.brief = expandPath(flags.brief);
  cfg.cwd = expandPath(flags.cwd);
  cfg.out = expandPath(flags.out);
  cfg.artifacts = flags.artifacts.map(expandPath);
  cfg.lintBudgetBytes = Number(process.env.CODEX_GUARD_LINT_BUDGET_BYTES ?? 200000);
  // Resolve the child against --cwd, NEVER the guard's launch cwd. Invariant 11
  // makes them differ on every worktree run, and defaulting to the launch
  // checkout lints the target with MAIN's older linter: the report is
  // well-formed, the dispatch looks armed, and any check the target adds is
  // silently absent. That is the exact silent-corruption shape this arm exists
  // to prevent, committed inside the arm itself.
  cfg.lintCliArgs = [
    resolve(process.env.CODEX_GUARD_TSX ?? join(cfg.cwd, "node_modules/tsx/dist/cli.mjs")),
    resolve(process.env.CODEX_GUARD_SPEC_LINT ?? join(cfg.cwd, "scripts/spec-lint.ts")),
  ];
  cfg.codexHome = expandPath(process.env.CODEX_HOME || join(homedir(), ".codex"));

  try {
    cfg.briefText = readFileSync(cfg.brief, "utf8");
  } catch (e) {
    usageError(`--brief unreadable: ${e.message}`);
  }
  if (cfg.briefText.length === 0) usageError(`--brief is empty`);
  checkGuardSurfaceDeclarations(cfg);
  if (!existsSync(cfg.cwd) || !statSync(cfg.cwd).isDirectory())
    usageError(`--cwd is not a directory: ${cfg.cwd}`);
  // A detached HEAD is a LIVE arc whose identity cannot be determined; silently
  // under-recording it is the §8.2 failure, so refuse the dispatch up front
  // rather than after the review has already been paid for. Every other refusal
  // (not a repo, on main, no merge base) warns and skips at emit time.
  const arc = resolveArc(cfg.cwd);
  if (!arc.ok && arc.kind === "detached_head") usageError(arc.problem);
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
  // The span must match the INVENTORY grammar EXACTLY (scripts/spec-lint.ts:62-63):
  // `  <raw>: <n> occurrence(s)` and `    <line>:<col> <snippet>`. An
  // indentation-only test is not an allowlist — every evidence class the
  // renderer emits is also indented, so a finding, a `detail:` line or a
  // section label can sit there, validate, and vanish from the prompt while the
  // surviving summary still counts it.
  const INV_GROUP = /^ {2}\S.*: \d+ occurrences?$/;
  const INV_OCCURRENCE = /^ {4}\d+:\d+ /;
  const discardClean =
    inv === -1 ||
    lines.slice(inv + 1, sum).every((l) => l === "" || INV_GROUP.test(l) || INV_OCCURRENCE.test(l));
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
  // N and M must be measured the SAME way, or the notice reports a pair
  // matching neither convention. `totalBody` is a join, so the retained count is
  // a join too — not a running sum of per-line lengths plus a separator each.
  const kept = [];
  for (const l of body) {
    const trial = Buffer.byteLength([...kept, l].join("\n"));
    if (frameBytes(trial) + trial > allowance) break;
    kept.push(l);
  }
  const keptBytes = Buffer.byteLength(kept.join("\n"));
  return { block: [...head, ...kept, notice(keptBytes), summary].join("\n"), truncated: true };
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

/** A CommonMark list marker and the whitespace that opens its content. */
const MARKER_HEAD = /^([-*+]|\d{1,9}[.)])([ \t]+|$)/;
/** A fence, once the container prefix has been peeled off the line. */
const FENCE_OPEN = /^(`{3,}|~{3,})(.*)$/;
/** A closing fence: its own leading whitespace, then nothing but the run. */
const FENCE_CLOSE = /^([ \t]*)(`{3,}|~{3,})[ \t]*$/;
const TAB_STOP = 4;

/** The column reached by advancing over `s` from `col`, tabs to the next stop. */
function advance(s, col) {
  let c = col;
  for (const ch of s) c += ch === "\t" ? TAB_STOP - (c % TAB_STOP) : 1;
  return c;
}

/** A line's leading whitespace measured in COLUMNS, so a tab counts as four. */
function indentColumns(line) {
  let c = 0;
  for (const ch of line) {
    if (ch !== " " && ch !== "\t") break;
    c = advance(ch, c);
  }
  return c;
}

/**
 * Where a line's content begins once the list containers it opens are peeled.
 *
 * CommonMark measures a fence opener's indentation, and the four columns that
 * make a line indented code, RELATIVE to the innermost container's content
 * column — never absolutely. Probed 2026-08-05: an absolute three-column cap
 * missed every fence opened inside a nested list item (18/18 shapes leaked
 * their example, plus 2/2 where the opener sat on a marker line indented four),
 * because a reviewer quoting an example under a sub-bullet of a numbered
 * finding writes the opener well past column 3. The indented-code fallback did
 * not catch them either: that rule requires a preceding blank line and a quoted
 * example follows its lead-in directly.
 *
 * `base` is the innermost item's content column — the origin every measurement
 * below is taken from. `col`/`idx` locate the first character that is not
 * container prefix. This tracks ONE content column rather than a container
 * stack: a dedent re-derives from the root instead of popping, and block quotes
 * are not containers here at all (§8.3 documented limit 12).
 */
function scanContainers(line, entering) {
  let base = entering;
  let idx = 0;
  let col = 0;
  let sawMarker = false;
  for (;;) {
    let j = idx;
    let c = col;
    while (j < line.length && (line[j] === " " || line[j] === "\t")) {
      c = advance(line[j], c);
      j += 1;
    }
    // A dedent past the container we believed open: re-derive from the root.
    if (c < base) base = 0;
    // Four or more columns past the content column is indented code, never a
    // marker — stop peeling and let the caller classify what it found.
    if (c > base + 3) return { base, col: c, idx: j, sawMarker };
    const m = MARKER_HEAD.exec(line.slice(j));
    if (m === null) return { base, col: c, idx: j, sawMarker };
    sawMarker = true;
    const markerEnd = c + m[1].length;
    const afterWs = advance(m[2], markerEnd);
    // Five or more columns of whitespace after a marker is indented code INSIDE
    // the item, whose content column is then the marker plus one (CommonMark
    // 5.2) — the rule that makes `-     VERDICT: …` a code block, not text.
    base = afterWs - markerEnd >= 5 ? markerEnd + 1 : afterWs;
    idx = j + m[1].length + m[2].length;
    col = afterWs;
  }
}

/**
 * The score arm's canonical anchored grammar (enforcement-pair spec §2.1):
 * marker, fraction, and survivor phrase bound ADJACENTLY on one line. Adjacency
 * is load-bearing — a floating fraction elsewhere ("last run 12/12") cannot
 * satisfy the arm — and the survivor phrase is bound to the SAME declaring
 * line, so a declared non-empty set ("1 unaccepted survivor") never passes.
 */
const MUTATION_SCORE_ARM =
  /MUTATION SCORE:\s*(\d+)\s*\/\s*(\d+)\s*[,;—–-]?\s*(?:0|no)\s+unaccepted\s+survivors?\b/i;

/**
 * Enrolment precedes review (enforcement-pair spec §2.1): a round-1 diff brief
 * that declares a `GUARD SURFACE:` line must carry, on that same line, either a
 * canonical mutation score with an empty unaccepted-survivor set or a
 * `CANNOT-EXPRESS:` probe citation. Per line, never brief-global — probed on
 * this rule's own arc, a global check let one surface's CANNOT-EXPRESS absorb a
 * deleted score line and one surface's score cover a second enrolled surface.
 *
 * Runs in the pre-dispatch validation phase alongside the other exit-2 usage
 * guards: a rejected brief takes no lock, writes no result artifact, and
 * appends no corpus row. Markers are matched over `stripCodeBlocks` output, so
 * a brief QUOTING the marker in a fence neither triggers nor satisfies the
 * gate (use-vs-mention), and a fenced conforming line satisfies nothing.
 *
 * The gate checks the declaration EXISTS in canonical form; it does not judge
 * the declared value against the registry floor (documented limit §5.8 — a
 * below-floor "0/1" is loud in the brief the reviewer reads) and does not
 * infer undeclared guard surfaces (documented limit §5.1).
 */
function checkGuardSurfaceDeclarations(cfg) {
  if (cfg.stage !== "diff" || cfg.round !== 1) return;
  const lines = stripCodeBlocks(cfg.briefText).split("\n");
  const bad = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = /^\s*GUARD SURFACE:(.*)$/.exec(line);
    if (m === null) continue;
    const remainder = m[1];
    const score = MUTATION_SCORE_ARM.exec(remainder);
    if (score !== null) {
      const killed = Number(score[1]);
      const total = Number(score[2]);
      // The shipped authority's no-mutants and unaccounted-mutants conditions
      // (tests/mutation/source/gate.ts): 0/0 and 2/1 are declarations of
      // nothing, not evidence.
      if (total >= 1 && killed <= total) continue;
    }
    if (/CANNOT-EXPRESS:\s*\S/.test(remainder)) continue;
    bad.push(`  line ${i + 1}: ${line.trim().slice(0, 80)}`);
  }
  if (bad.length > 0) {
    usageError(
      `round-1 diff brief declares guard surfaces without dispatchable evidence:\n${bad.join("\n")}\n` +
        `each GUARD SURFACE: line in a round-1 diff brief must carry its own MUTATION SCORE ` +
        `(<killed>/<total> plus "0 unaccepted survivors") or CANNOT-EXPRESS: <probe citation> — ` +
        `see AGENTS.md convergence-criterion bullet 4`,
    );
  }
}

/**
 * Every CommonMark code block the document CLOSES, removed — in ONE place,
 * because both readers below need the same answer and two copies of this
 * normalizer is precisely how the class recurs. Probed 2026-08-05: earlier
 * copies covered only the closed BACKTICK fence at the start of a line, so a
 * tilde fence, an indented block, and any block opened on a LIST-MARKER line
 * (`- ```, `1.     ` — how a reviewer quotes an example inside a numbered
 * finding; 15/15 marker × block-kind combinations leaked) each fed a reviewer's
 * EXAMPLE to both readers at once, read as a real verdict AND a real count.
 *
 * Deliberately not a full block parser. Lines are blanked rather than deleted,
 * so line positions survive the pass.
 *
 * ONLY A BLOCK WHOSE END THE DOCUMENT STATES IS STRIPPED. A block still open at
 * EOF strips NOTHING, and that asymmetry is the whole design. The opposite rule
 * — "an unclosed fence runs to end of document", which is what CommonMark 4.5
 * actually says — shipped for one round and cost a real review live on this
 * branch: a reviewer wrapped a nested ``` example in a ```markdown block, the
 * inner run closed the outer fence, and the stray final ``` opened a fence that
 * swallowed the reviewer's own trailing `VERDICT: NEEDS-ATTENTION`. A COMPLETED
 * review was filed as `no_marker` / `attempts_exhausted`, indistinguishable in
 * result.json from a reaped dispatch — spec §3 consequence 3, the defect this
 * wrapper exists to remove. The two errors are not symmetric: admitting one
 * example line from a malformed or truncated document is visible afterwards
 * (`verdictLine` keeps the raw line), while discarding a finished review leaves
 * nothing to inspect and buys a whole new dispatch. So on ambiguity, ADMIT.
 *
 * The rule also makes the contract structurally safe rather than probabilistically
 * safe: briefs mandate a final `VERDICT:` line, and a closed fence is followed by
 * its closing line while a terminated indented block is followed by the
 * non-indented line that ended it — so under this rule NO stripped block can
 * hold the document's last non-empty line. Note what the rule is NOT: it never
 * consults the outcome. "Strip unless it would remove the verdict" would rot.
 *
 * - Fenced (CommonMark 4.5): ``` or ~~~, opened at most 3 columns past its
 *   container's content column and closed by a fence of the SAME character at
 *   least as long, itself at most 3 columns past that same origin. The closer's
 *   cap is what makes an over-indented run inside the block CONTENT rather than
 *   the end of it: probed 2026-08-05, an unbounded closer let a nested example's
 *   fence end the outer block four lines early and leak everything after it
 *   (4/4 shapes). Capping it can only ever strip MORE, so it cannot resurrect
 *   the regression above — a block that closes later still states its end after
 *   whatever it holds, and one that stops closing strips nothing at all.
 * - Indented (CommonMark 4.4): 4 columns past the content column. These may not
 *   interrupt a paragraph, so one starts only after a blank line — without that
 *   rule an over-indented continuation line carrying the verdict would be eaten
 *   — or on a list-marker line, where the marker plays the part of the blank.
 */
function stripCodeBlocks(text) {
  // Normalize CRLF first. Splitting on "\n" alone leaves a trailing "\r" that
  // FENCE_CLOSE rejects, so every fenced block in a CRLF message stayed open and
  // its example stayed live (diff review R1 finding 5). Callers only regex-match
  // lines, so returning normalized text costs nothing.
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out = lines.slice();

  // The container stack. Each frame owns the column its CONTENT starts at, and
  // every indentation test below is taken from the innermost frame's column
  // rather than from the left margin. A stack is what retires the single-column
  // approximation: a dedent POPS to the frame that still matches instead of
  // re-deriving from the root, and a block quote is a frame like any other.
  let stack = [];
  // The open leaf block, if any. `at` collects its lines so they can be blanked
  // when — and only when — the block states where it ends.
  let block = null;
  let prevBlank = true;
  let paragraphOpen = false;

  const closeBlock = () => {
    for (const i of block.at) out[i] = "";
    block = null;
  };

  /**
   * Walk `line` against the open containers.
   *
   * Returns the offset and column where content begins, how many frames the line
   * actually matched, and whether it opened new ones. A line that matches fewer
   * frames than are open is either a dedent (pop) or a LAZY continuation — the
   * caller decides, because only it knows whether a paragraph is open.
   */
  const matchContainers = (line) => {
    let idx = 0;
    let col = 0;
    let matched = 0;
    for (const frame of stack) {
      let j = idx;
      let c = col;
      while (j < line.length && (line[j] === " " || line[j] === "\t") && c < frame.col) {
        c = advance(line[j], c);
        j += 1;
      }
      if (frame.kind === "quote") {
        // Up to three spaces, then `>`, then an optional single space.
        if (c - col <= 3 && line[j] === ">") {
          j += 1;
          c += 1;
          if (line[j] === " ") {
            j += 1;
            c += 1;
          }
          idx = j;
          col = c;
          matched += 1;
          continue;
        }
        break;
      }
      // A list frame is matched by indentation alone once its marker line is past.
      if (c >= frame.col) {
        idx = j;
        col = c;
        matched += 1;
        continue;
      }
      break;
    }
    return { idx, col, matched };
  };

  /** New containers this line opens, appended to the stack. */
  const openContainers = (line, idx, col) => {
    let i = idx;
    let c = col;
    let sawMarker = false;
    for (;;) {
      let j = i;
      let cc = c;
      while (j < line.length && (line[j] === " " || line[j] === "\t") && cc - c < 4) {
        cc = advance(line[j], cc);
        j += 1;
      }
      if (cc - c > 3) break;
      if (line[j] === ">") {
        j += 1;
        cc += 1;
        if (line[j] === " ") {
          j += 1;
          cc += 1;
        }
        stack.push({ kind: "quote", col: cc });
        i = j;
        c = cc;
        continue;
      }
      const marker = MARKER_HEAD.exec(line.slice(j));
      if (marker) {
        const markerEnd = cc + marker[1].length;
        const afterWs = advance(marker[2], markerEnd);
        // CommonMark 5.2: FIVE or more columns of whitespace after a marker is
        // indented code INSIDE the item, whose content column is then the marker
        // plus one — the rule that makes `-     VERDICT: …` a code block rather
        // than item text. Taking the column after ALL the whitespace instead
        // made every one of the 15 marker-line shapes read as prose.
        stack.push({ kind: "list", col: afterWs - markerEnd >= 5 ? markerEnd + 1 : afterWs });
        i = j + marker[1].length + marker[2].length;
        c = afterWs;
        sawMarker = true;
        continue;
      }
      break;
    }
    // Consume the leading whitespace that remains once no further container
    // opens, so the returned column is where CONTENT begins. Without this the
    // caller measures indentation from before the spaces and every root-level
    // indented code block reads as relative 0 — caught by the G2a pins.
    let j = i;
    let cc = c;
    while (j < line.length && (line[j] === " " || line[j] === "\t")) {
      cc = advance(line[j], cc);
      j += 1;
    }
    return { idx: j, col: cc, sawMarker };
  };

  // HTML block openers, CommonMark 4.6. Types 1-5 end on their own condition;
  // types 6 and 7 end at a blank line. Covering these is what closes the arc's
  // only MEASURED live miss: `<pre>` and `<div>` content was read as prose, so a
  // VERDICT line inside one was taken as the reviewer's own.
  const HTML_TYPE_1 = /^<(pre|script|style|textarea)(\s|>|$)/i;
  const HTML_TYPE_1_END = /<\/(pre|script|style|textarea)>/i;
  const HTML_TYPE_2 = /^<!--/;
  const HTML_TYPE_3 = /^<\?/;
  const HTML_TYPE_4 = /^<![A-Za-z]/;
  const HTML_TYPE_5 = /^<!\[CDATA\[/;
  const HTML_BLOCK_NAMES =
    "address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h1|h2|h3|h4|h5|h6|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|source|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul";
  const HTML_TYPE_6 = new RegExp(`^</?(?:${HTML_BLOCK_NAMES})(?:\\s|/?>|$)`, "i");
  // Attribute VALUES may contain `>` when quoted, so `[^<>]*` was too strict and
  // under-classified valid type-7 blocks (diff review R1 finding 6). This matches
  // an attribute list of quoted values, unquoted values, and bare names.
  const HTML_ATTR = /(?:\s+[A-Za-z_:][A-Za-z0-9_.:-]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*/
    .source;
  const HTML_TYPE_7 = new RegExp(`^</?[A-Za-z][A-Za-z0-9-]*${HTML_ATTR}\\s*/?>\\s*$`);

  const htmlOpener = (rest) => {
    if (HTML_TYPE_1.test(rest)) return { end: "tag" };
    if (HTML_TYPE_2.test(rest)) return { end: "comment" };
    if (HTML_TYPE_3.test(rest)) return { end: "pi" };
    if (HTML_TYPE_4.test(rest)) return { end: "decl" };
    if (HTML_TYPE_5.test(rest)) return { end: "cdata" };
    if (HTML_TYPE_6.test(rest)) return { end: "blank" };
    // Type 7 may not interrupt a paragraph.
    if (!paragraphOpen && HTML_TYPE_7.test(rest)) return { end: "blank" };
    return null;
  };

  const htmlCloses = (kind, rest) =>
    kind === "tag"
      ? HTML_TYPE_1_END.test(rest)
      : kind === "comment"
        ? rest.includes("-->")
        : kind === "pi"
          ? rest.includes("?>")
          : kind === "decl"
            ? rest.includes(">")
            : kind === "cdata"
              ? rest.includes("]]>")
              : false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    // Container-relative: `>` alone is a BLANK line inside its quote. Testing
    // the raw line left the quote frame and the paragraph open, so the root
    // indented block after it was read as prose (R5 parser finding 2).
    const blank = line.trim() === "" || /^[ \t]*(?:>[ \t]*)+$/.test(line);

    // ── an open FENCE swallows everything until its own closer ───────────────
    if (block !== null && block.kind === "fence") {
      block.at.push(i);
      const m = matchContainers(line);
      const rest = line.slice(m.idx);
      // A container ending CLOSES the block it holds. Waiting only for an
      // explicit closer meant a list dedent left the fence open to EOF, where
      // the admit rule then read the example (R6 parser finding 4). This is a
      // real close, so the block's lines are blanked — the tail is not
      // discarded, because the line that ended the container is not part of it.
      if (block.depth > 0 && m.matched < block.depth && line.trim() !== "") {
        block.at.pop();
        closeBlock();
        prevBlank = false;
        paragraphOpen = false;
        // Do NOT consume the line. It ended the container, but it may also OPEN
        // something — a root fence written right after a dedent was missed
        // entirely, and its example verdict stayed live (R7 parser finding 1).
        // Re-processing it costs one iteration and closes that whole class.
        i -= 1;
        continue;
      }
      const close = FENCE_CLOSE.exec(rest);
      if (
        m.matched >= block.depth &&
        close !== null &&
        close[2][0] === block.char &&
        close[2].length >= block.len &&
        advance(close[1], m.col) - m.col <= 3
      ) {
        closeBlock();
        prevBlank = true;
        paragraphOpen = false;
      }
      continue;
    }

    // ── an open HTML block ───────────────────────────────────────────────────
    if (block !== null && block.kind === "html") {
      // A container ending closes the block it holds — the same rule already
      // applied to fences, and HTML blocks were left out of it (R8 parser
      // finding 1). Without this the block stayed open to EOF, stripped
      // nothing, and the example verdict inside it was read.
      const hm = matchContainers(line);
      if (block.depth > 0 && hm.matched < block.depth && line.trim() !== "") {
        closeBlock();
        prevBlank = true;
        paragraphOpen = false;
        i -= 1;
        continue;
      }
      if (block.end === "blank") {
        if (blank) {
          closeBlock();
          prevBlank = true;
          paragraphOpen = false;
          continue;
        }
        block.at.push(i);
        continue;
      }
      block.at.push(i);
      if (htmlCloses(block.end, line)) {
        closeBlock();
        // A block BOUNDARY, so indented code may begin on the next line
        // (R8 parser finding 2).
        prevBlank = true;
        paragraphOpen = false;
      }
      continue;
    }

    const m = matchContainers(line);

    // ── an open INDENTED block ───────────────────────────────────────────────
    if (block !== null) {
      const contentCol = stack.length > 0 ? stack[stack.length - 1].col : 0;
      // Measure where CONTENT starts, not where container matching stopped.
      // `matchContainers` never advances past an empty stack, so reading its
      // column here made every root-level indented block end after one line —
      // its first line blanked, its second read as prose. Caught by the shipped
      // 4-space and tab fixtures.
      let wj = m.idx;
      let wc = m.col;
      while (wj < line.length && (line[wj] === " " || line[wj] === "\t")) {
        wc = advance(line[wj], wc);
        wj += 1;
      }
      if (blank || (m.matched === stack.length && wc >= contentCol + 4)) {
        block.at.push(i);
        prevBlank = blank;
        continue;
      }
      closeBlock();
    }

    if (blank) {
      // Pop to what this line actually matched. A bare `>` after a list item is
      // blank INSIDE its quote, but it is not inside the list — returning here
      // without popping left the stale list frame, and the root indented block
      // after it stayed live (R6 parser finding 3).
      if (m.matched < stack.length) stack = stack.slice(0, m.matched);
      prevBlank = true;
      paragraphOpen = false;
      // A blank line closes any container whose content has ended; the next
      // non-blank line re-derives what is still open.
      continue;
    }

    // A line matching fewer frames than are open either DEDENTS or continues a
    // paragraph lazily. Only the second must not pop — the paragraph is still
    // inside its container, so popping would measure the next fence from the
    // wrong origin.
    //
    // Refusing to pop whenever a paragraph was open conflated the two: a root
    // fence written directly after `- item`, with no blank line, kept the stale
    // list frame, so its root closer could not match the stored depth and the
    // closed fence stripped nothing (diff review R1 finding 4). Lazy
    // continuation is by definition a PARAGRAPH line; a line that starts an
    // interrupting block is a dedent no matter what preceded it.
    if (m.matched < stack.length) {
      const tail = line.slice(m.idx).replace(/^[ \t]*/, "");
      // Everything CommonMark lets interrupt a paragraph. ATX headings and
      // thematic breaks were missing, so `- item` / `# heading` / `<x-tag>` kept
      // a stale list frame and left the example verdict live (R2 finding 4).
      const interrupts =
        FENCE_OPEN.test(tail) ||
        // Only an ordered list starting at 1 may interrupt a paragraph
        // (CommonMark 5.2). `2.` mid-paragraph is ordinary text, and reading it
        // as a marker built a stale frame (R6 parser finding 2).
        (MARKER_HEAD.test(tail) && !/^\d/.test(tail)) ||
        /^1[.)][ \t]/.test(tail) ||
        tail.startsWith(">") ||
        /^#{1,6}(?:\s|$)/.test(tail) ||
        /^(?:\*[ \t]*){3,}$|^(?:-[ \t]*){3,}$|^(?:_[ \t]*){3,}$/.test(tail) ||
        htmlOpener(tail) !== null;
      if (interrupts || !paragraphOpen) stack = stack.slice(0, m.matched);
    }

    // THEMATIC BREAK FIRST. `- - -` is a break, not three nested list markers,
    // and letting `openContainers` peel it built a bogus container stack that
    // mismeasured everything after it (R5 parser finding 1).
    // Measure the leading run in COLUMNS, not characters: a tab is four, so a
    // tab-indented line is indented CODE and never a thematic break
    // (R6 parser finding 5).
    const preIndent = /^[ \t]*/.exec(line.slice(m.idx))[0];
    const preRest =
      advance(preIndent, m.col) - m.col > 3 ? "\u0000" : line.slice(m.idx + preIndent.length);
    // An EMPTY list item — a bare marker with nothing after it — ends the list
    // rather than opening a frame. Pushing one made it swallow the indentation
    // of everything that followed (R5 parser finding 5).
    if (/^(?:[-*+]|\d{1,9}[.)])[ \t]*$/.test(preRest)) {
      stack = stack.slice(0, m.matched);
      prevBlank = true;
      paragraphOpen = false;
      continue;
    }
    if (/^(?:\*[ \t]*){3,}$|^(?:-[ \t]*){3,}$|^(?:_[ \t]*){3,}$/.test(preRest)) {
      if (m.matched < stack.length) stack = stack.slice(0, m.matched);
      prevBlank = false;
      paragraphOpen = false;
      continue;
    }

    const after = openContainers(line, m.idx, m.col);
    // A newly opened container starts a FRESH content context: the outer
    // paragraph does not reach inside it. Leaving `paragraphOpen` set made
    // `htmlOpener` reject a type-7 tag written as the first thing in a new list
    // item (R8 parser finding 3).
    if (after.idx > m.idx && after.sawMarker) paragraphOpen = false;
    const contentCol = stack.length > 0 ? stack[stack.length - 1].col : 0;
    const rest = line.slice(after.idx);
    const relative = after.col - contentCol;

    const open = relative <= 3 ? FENCE_OPEN.exec(rest) : null;
    // A BACKTICK fence's info string may not contain a backtick (CommonMark
    // 4.5) — the rule that keeps an inline `code span` from opening a block.
    if (open && !(open[1][0] === "`" && open[2].includes("`"))) {
      block = {
        kind: "fence",
        char: open[1][0],
        len: open[1].length,
        depth: stack.length,
        at: [i],
      };
      prevBlank = false;
      paragraphOpen = false;
      continue;
    }

    if (relative <= 3) {
      const html = htmlOpener(rest);
      if (html) {
        block = { kind: "html", end: html.end, depth: stack.length, at: [i] };
        // A comment that opens and closes on ONE line is a complete block, so it
        // is a boundary too — the close branch below sets `prevBlank`, but this
        // path never reaches it (R8 parser finding 2).
        let closedSameLine = false;
        if (html.end !== "blank" && htmlCloses(html.end, line)) {
          closeBlock();
          paragraphOpen = false;
          closedSameLine = true;
        }
        prevBlank = closedSameLine;
        continue;
      }
    }

    // Indented code may not interrupt a paragraph, so it starts only after a
    // blank line — or on a list-marker line, where the marker plays that part.
    if (relative >= 4 && (prevBlank || after.sawMarker)) {
      block = { kind: "indented", at: [i] };
      prevBlank = false;
      paragraphOpen = false;
      continue;
    }

    // An ATX heading or a thematic break is a LEAF block, not a paragraph: it
    // ends any paragraph it follows. Leaving `paragraphOpen` true after one kept
    // type-7 HTML from opening on the next line — which is why widening the
    // interrupting set alone did not fix R2 finding 4, and why the fixture that
    // proves it had to be written before the repair was believed.
    if (
      /^#{1,6}(?:\s|$)/.test(rest) ||
      /^(?:\*[ \t]*){3,}$|^(?:-[ \t]*){3,}$|^(?:_[ \t]*){3,}$/.test(rest)
    ) {
      // A leaf block ends the paragraph, and indented code MAY begin directly
      // after one — so it behaves like a blank line here, not like prose
      // (R6 parser finding 1).
      prevBlank = true;
      paragraphOpen = false;
      continue;
    }

    prevBlank = false;
    paragraphOpen = true;
  }

  // EOF with a block still open: the document never said where it ends, so
  // nothing is blanked. See the asymmetry above.
  return out.join("\n");
}

// Emphasis binds TIGHT to its text: `**VERDICT` is emphasis, `* VERDICT` is a
// LIST BULLET (CommonMark 6.2 — an opening delimiter run may not be followed by
// whitespace). Allowing the gap made a bullet match as though its marker were
// emphasis, and a bullet is exactly where a reviewer restates the brief's
// instruction: probed 2026-08-05, a trailing `* VERDICT: APPROVE` SHADOWED a
// real `VERDICT: BLOCKING` on the line above and filed the round as an
// infrastructure fault. One definition, shared by both markers AND by the
// trailing run, so no two readers can drift on what a marker looks like.
//
// A run is one to THREE delimiters, and they need not be identical. Requiring
// one or two IDENTICAL characters recognised only the simple forms and lost
// every CommonMark COMBINED one - `***…***`, `___…___`, `*__…__*`, `**_…_**`,
// `_**…**_`, `__*…*__` - which is strong-inside-emphasis, the ordinary way a
// reviewer bolds AND italicises its closing line. Probed 2026-08-05 and
// cross-checked with remark: all six are single emphasis nodes, and all six
// lost both markers - `***VERDICT: APPROVE***` recorded `no_marker` and
// `***FINDINGS: 3***` recorded `null`. Both are losses in the direction this
// surface exists to prevent: a spent review filed as an infrastructure fault,
// and a declared count recorded as "not declared".
//
// What the widening must NOT admit stays fixed by the ADJACENCY, not by the
// character set: no whitespace may sit between the run and the keyword, so the
// list bullet `* VERDICT: APPROVE` is still not a marker; and the backtick is
// still absent, so a code span quoting the brief's instruction is still not one
// either.
// UNBOUNDED, deliberately. Each earlier revision of this prefix picked a number
// - one delimiter, then two, then three - and each time the next reviewer wrote
// one more (probed 2026-08-05: `****VERDICT: APPROVE****` and four more shapes
// recorded `no_marker`/`null`). CommonMark bounds a delimiter run at nothing, so
// any cap is a shape that loses a real verdict. The length was never carrying
// the false-positive guard: ADJACENCY does (no whitespace between the run and
// the keyword, so `* VERDICT:` stays a list bullet), and the backtick's absence
// from the character class does (so a code span stays a code span).
const EMPHASIS_RUN = String.raw`[*_]*`;
// Emphasis may sit at any of FOUR positions, not only around the whole line:
// before the keyword, after it, after the colon, and around the value. Probed
// 2026-08-05 — `**VERDICT:** APPROVE` (the commonest markdown spelling of all)
// recorded `unrecognized_verdict` and `**FINDINGS:** 3` recorded `null`, while
// the whole-line forms worked, because every earlier revision assumed the
// emphasis WRAPPED the declaration. Four completed reviews in the 681-output
// corpus were excluded from counting this way.
//
// This is a different axis from the run length above — where the delimiters
// sit, not how many — and it is closed rather than enumerated: those four are
// every position a delimiter run can occupy in `LABEL : VALUE`.
//
// The false-positive guards are unchanged and still do not come from the run:
// there is no `\s*` between the LEADING run and the keyword, so `* VERDICT:`
// stays a list bullet, and the backtick stays out of the class, so a code span
// stays a code span.
const LABEL = (word) => `^\\s*${EMPHASIS_RUN}${word}${EMPHASIS_RUN}\\s*:${EMPHASIS_RUN}\\s*`;
const VERDICT_MARKER = new RegExp(`${LABEL("VERDICT")}${EMPHASIS_RUN}\\S`);
const FINDINGS_LINE = new RegExp(
  `${LABEL("FINDINGS")}${EMPHASIS_RUN}(\\d+)\\s*${EMPHASIS_RUN}\\s*$`,
);

function parseVerdict(text) {
  const noFences = stripCodeBlocks(text);
  // Leading markdown emphasis is stripped before the marker test: three real
  // dispatches in the 681-output probe corpus emitted `**VERDICT: …**` and were
  // filed as infrastructure faults - a full review spent and then discarded.
  // Fence stripping above still runs FIRST, so a fenced example is not a verdict,
  // and the line anchor still holds, so the brief's own instruction to emit a
  // verdict - text every brief in this repo carries - is never read as one.
  const lines = noFences.split("\n").filter((l) => VERDICT_MARKER.test(l));
  const survivors = lines.filter((l) => {
    const upper = l.toUpperCase();
    let occurrences = 0;
    for (const o of KNOWN_OUTCOMES) occurrences += upper.split(o).length - 1;
    // NEEDS-ATTENTION does not contain APPROVE/BLOCKING as substrings; counts are exact
    return occurrences < 2 && !/ or /i.test(l);
  });
  if (survivors.length === 0) return { verdict: null, verdictLine: null, shape: "no_marker" };
  const raw = survivors[survivors.length - 1]; // RAW, untrimmed (§6 schema)
  // EMPHASIS IS IRRELEVANT TO IDENTIFYING THE OUTCOME, so it is deleted rather
  // than parsed. Every value in `KNOWN_OUTCOMES` is letters and one hyphen — no
  // `*`, `_` or backtick appears in any of them — so removing an emphasis run is
  // lossless for any VALID outcome. What is left is a plain `VERDICT: <word>`.
  //
  // But NOT every occurrence: deleting them all FABRICATES a verdict.
  // `VERDICT: AP_PROVE` is not APPROVE and became APPROVE, with exit 0 and a
  // counted corpus row (probed 2026-08-05: all nine combinations of the three
  // characters inserted into the three outcomes returned `ok`). The direction
  // decides it — a LOST verdict is loud (exit 3, `no_verdict`, an operator
  // reading a result), a FABRICATED one is silent and lands in the committed
  // corpus as fact — so a run is deleted only when it is NOT flanked by word
  // characters on both sides, which is also CommonMark's own rule for
  // intraword `_`.
  //
  // Documented limit, in the surfaced direction: emphasis INSIDE the word
  // (`**APP**ROVE`) is no longer recovered and reports `no_verdict` rather than
  // inventing an answer.
  //
  // This replaces a hand-rolled markdown unwrapper that cost FOUR consecutive
  // review rounds, each one a real trailing verdict lost and filed as an
  // infrastructure fault: a delimiter run capped at three (round 2), emphasis on
  // the label rather than the line (round 4), a nested run that closes MIRRORED
  // rather than identically (round 5), and a closer read greedily where it was
  // ambiguous with the value's opener (round 6). Every one of those is a
  // question about emphasis STRUCTURE, and this parser no longer asks one.
  //
  // The guards that matter are unchanged and sit elsewhere: `stripCodeBlocks`
  // ran first, so a fenced example is not a verdict; `VERDICT_MARKER` is
  // line-anchored and excludes the backtick from its run, so neither the brief's
  // prose instruction nor a code span is a marker; and the ambiguity filter
  // above still rejects a line naming two outcomes. `verdictLine` still records
  // `raw`, untrimmed, per the §6 schema.
  // The hyphen counts as a word character here so `NEEDS-ATTENTION` cannot be
  // reassembled across its own separator either.
  const WORDISH = /[A-Za-z0-9-]/;
  let payload = raw
    .replace(/[*_`]+/g, (run, at, whole) => {
      const before = whole[at - 1];
      const after = whole[at + run.length];
      const intraword = before && after && WORDISH.test(before) && WORDISH.test(after);
      return intraword ? run : "";
    })
    .trim();
  payload = payload.replace(/^VERDICT\s*:\s*/, "").trim();
  payload = payload.replace(/[.,;:!]+$/, "");
  payload = payload.trim().toUpperCase();
  if (KNOWN_OUTCOMES.includes(payload)) return { verdict: payload, verdictLine: raw, shape: "ok" };
  return { verdict: null, verdictLine: raw, shape: "unrecognized_verdict" };
}

/**
 * The DECLARED count, never an inferred one (spec §3/§5.3). Returns null when
 * the line is absent or when two DIFFERENT counts are declared - `null` means
 * NOT DECLARED, and it must never be confused with a declared zero.
 */
function parseFindingCount(text) {
  const noFences = stripCodeBlocks(text);
  const seen = new Set();
  for (const line of noFences.split("\n")) {
    const m = FINDINGS_LINE.exec(line);
    if (!m) continue;
    const n = Number(m[1]);
    // A declaration outside the safe-integer range cannot be recorded
    // faithfully: `Number()` ROUNDS it, so two DIFFERENT declarations collapse
    // into one value and the "two different counts means not declared" rule
    // below reads them as agreeing; a larger one becomes `Infinity` and
    // serializes as `null` anyway. Unrepresentable is NOT DECLARED — the same
    // disposition an ambiguous declaration already gets, and the conservative
    // direction, since `null` understates where a rounded integer asserts.
    if (!Number.isSafeInteger(n)) return null;
    seen.add(n);
  }
  return seen.size === 1 ? [...seen][0] : null;
}

/**
 * The grain, in one place: the LAST NON-EMPTY terminal message wins. An empty
 * or absent message is not a declaration of nothing, so it never erases an
 * earlier one - which is why every read site can call this unconditionally,
 * above its own guards, without checking anything first.
 *
 * Returns whether it recorded. The two exit-3 writers need that answer to know
 * whether the attempt's `-o` file spoke at all: "absent, empty, or unreadable"
 * is exactly the condition under which the rollout is the only remaining copy
 * of the terminal message, and it is not distinguishable from "declared
 * nothing" by looking at `state.findingCount` afterwards.
 */
function recordDeclaredCount(state, text) {
  if (typeof text !== "string" || text.trim() === "") return false;
  state.findingCount = parseFindingCount(text);
  return true;
}

/**
 * The SAME grain, read backwards. "The last non-empty message wins" names the
 * newest one only for a caller that sees messages CHRONOLOGICALLY, which the
 * three attempt-side read sites do and the rollout scrape does NOT — it walks
 * sessions newest-first. Calling the primitive above on every message of a
 * reversed scan therefore let the OLDEST declaration win (probed 2026-08-05: a
 * newest message declaring nothing and an older one declaring 7 recorded 7 —
 * a number the terminal message never gave).
 *
 * So the DIRECTION is stated by the caller rather than the grain being
 * redefined underneath the sites that were already right: the first non-empty
 * message this recorder is offered wins, and it records whatever that message
 * declares — including `null`, which is the answer "not declared" and never a
 * hole to backfill from a session that ended earlier. (Within one session id
 * the rollout files are directory-ordered; a session with two rollout files is
 * a documented limit, not a case this distinguishes.)
 */
function newestFirstCountRecorder(state) {
  let recorded = false;
  return (text) => {
    if (recorded) return;
    if (typeof text !== "string" || text.trim() === "") return;
    recorded = true;
    state.findingCount = parseFindingCount(text);
  };
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

/**
 * Latch an attempt's session id (the stderr banner) regardless of outcome — the
 * rollout scrape needs it even for attempts that never earn the resume rung.
 *
 * Callable at any point after the stderr file exists, which is why it is a
 * function rather than the inline block it used to be: `runAttempt` latches on
 * the normal exit path, but the two exit-3 writers reach the rollout for an
 * attempt that never got there — one still LIVE (interrupted) and one that
 * threw before the latch line (a late stream failure). Without this the scrape
 * has no session id for the very attempt whose message it is trying to find.
 * Idempotent and non-throwing: a missing stderr file simply latches nothing.
 */
function latchSessionId(attempt, state) {
  try {
    const m = SESSION_ID_RE.exec(readFileSync(attempt.stderrPath, "utf8"));
    if (m) {
      attempt.sessionId = m[1];
      if (!state.seenSids.includes(m[1])) state.seenSids.push(m[1]);
    }
  } catch {
    /* no stderr file */
  }
}

function classifyAttempt(attempt, state) {
  // ONE read, TWO extractions, and this one runs ABOVE every guard below it.
  // A killed or nonzero-exit attempt can still have left a readable message,
  // and that message's declaration is a fact about the review whatever the
  // exit shape of the process that carried it was. `hasMsg` keeps absent and
  // empty distinguishable, which the two failure shapes below still need; the
  // read itself is the same call it always was, so a genuinely unreadable file
  // still throws to the caller's classification catch exactly as before.
  const hasMsg = existsSync(attempt.lastMessagePath);
  const msg = hasMsg ? readFileSync(attempt.lastMessagePath, "utf8") : "";
  // Whether it spoke is THIS read's answer, and not one `state.findingCount`
  // can be asked afterwards, since a message that declared nothing and no
  // message at all both leave it `null`. Recorded as the attempt's ORDINAL:
  // attempts are a clock, and sessions are not — the resume rung runs a later
  // attempt inside an earlier attempt's session, so one session id can cover
  // two turns. Kept on state rather than on the attempt record, whose shape is
  // pinned by spec §6.
  if (recordDeclaredCount(state, msg)) state.spokeN = attempt.n;

  if (attempt.killedReason !== null) {
    attempt.failureShape = "killed";
    return;
  }
  if (attempt.exitCode !== 0) {
    attempt.failureShape = "nonzero_exit";
    return;
  }
  if (!hasMsg) {
    attempt.failureShape = "no_o_file";
    return;
  }
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
  latchSessionId(attempt, state);
  try {
    classifyAttempt(attempt, state);
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

// A row is telemetry attached to a review that ALREADY HAPPENED. Losing it must
// never change the exit code or the result.json (spec §11.1) - except on a
// detached HEAD, which is a LIVE arc whose identity cannot be determined, and
// silently under-recording that is the §8.2 failure (refused in buildConfig).
// Outside a repo entirely there is no arc to record, so that one warns (plan R1).
//
// The latch matters because `onSignal` also calls `writeResult`: a SIGTERM
// arriving after a normal `writeResult` would otherwise append a SECOND row for
// one dispatch, which distinct-value counting would NOT collapse (both rows
// carry the same `round`) and which would make the report's row totals wrong.
let reviewRowWritten = false;
function emitReviewRoundRow(cfg, body) {
  if (reviewRowWritten) return;
  reviewRowWritten = true;
  const problem = emitRow(cfg, body);
  if (problem)
    process.stderr.write(`codex-guard: review-round row not written: ${problem.problem}\n`);
}

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
    // Serves writers 1, 2 and 3 - every path through writeResult - from the one
    // carrier. Placed above the `...patch` spread, so a patch may still override
    // it; none does today.
    findingCount: state.findingCount ?? null,
    nativeBinaryResolved: cfg.nativeBin ?? null,
    lintArm: (cfg.lintDocs ?? []).length > 0 ? "present" : "absent",
    startedAt: state.startedAtIso,
    endedAt: new Date().toISOString(),
    ...patch,
  };
  writeFileSync(join(cfg.out, "result.json"), JSON.stringify(body, null, 2) + "\n");
  emitReviewRoundRow(cfg, body);
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

/**
 * Returns a patch that upgrades the result to a verdict, or null when nothing is recoverable.
 *
 * `countOnly` takes the DECLARATION and stops — no verdict, no recovery file,
 * always `null`. Spec §3 pins an exit-3 result to `status:"no_verdict"`, so the
 * two exit-3 writers may not promote themselves on the strength of a scrape;
 * what they may do is stop recording `null` for a count the reviewer plainly
 * declared. Same scan, same recorder, same direction rule — one parsing path.
 *
 * The VERDICT errand is unconditional; the COUNT errand is bounded by recency,
 * and that bound lives HERE rather than at a call site because all three
 * terminal callers need it — two copies of this rule is how the exit-3 writers
 * kept the defect after it was fixed for `giveUp`. The scan finds the newest
 * rollout ON DISK, which is not the newest terminal message: a dispatch whose
 * `-o` write landed is exactly the case whose rollout is never reached, so the
 * first rollout FOUND can belong to a session that ended EARLIER than a message
 * already read. Such a rollout may not restate the count — not even to fill in a
 * `null`, which is a genuine "not declared" and not a hole.
 */
function tryRolloutScrape(cfg, state, { countOnly = false, attempt = null } = {}) {
  // This scan runs NEWEST-FIRST, so it takes the newest-first recorder — the
  // chronological primitive would hand the answer to the oldest session here.
  const recordCount = newestFirstCountRecorder(state);
  // ATTEMPTS are the clock; sessions are not. The resume rung runs a later
  // attempt INSIDE an earlier attempt's session (`resumeArgv`), so one session
  // id can cover two turns and cannot order them. A session's rollout holds the
  // last message of the LAST attempt that used it, so that attempt's ordinal IS
  // the rollout's recency. `attempt` is the caller's own in-flight or failing
  // attempt: `onSignal` pushes the live one into `attempts` before it scrapes
  // and `giveUp`'s is pushed by its caller, but `main().catch`'s is in NEITHER
  // — it is merged into the result body only after this runs, and `runAttempt`
  // nulls `currentAttempt` on the throw path. Unplaced, its session reads as
  // ordinal 0 and any earlier declaration outranks the newest turn.
  const lastNBySid = new Map();
  const placed = [...state.attempts];
  if (attempt && !placed.includes(attempt)) placed.push(attempt);
  for (const a of placed) {
    // A resume that printed no banner still has a session — the one the wrapper
    // chose to resume. Without this it reads as unplaceable and its strictly
    // newer turn is silently ignored.
    const sid = a.sessionId ?? (a.kind === "resume" ? state.resumeSid : null);
    if (sid) lastNBySid.set(sid, Math.max(lastNBySid.get(sid) ?? 0, a.n));
  }
  for (const sid of [...state.seenSids].reverse()) {
    for (const rollout of findRollout(cfg, sid)) {
      const msg = lastAgentMessage(rollout);
      if (!msg) continue;
      // ABOVE the guard below, for the same reason as site 1. A scraped message
      // is a terminal message this dispatch produced whether or not it carries
      // a verdict, and it replaces any EARLIER attempt's declaration -
      // including replacing a number with "not declared" when it declares none.
      // STRICTLY newer, so an attempt's own `-o` outranks its own rollout: two
      // copies of one turn, and the `-o` file is the copy the wrapper asked for.
      if (state.spokeN === 0 || (lastNBySid.get(sid) ?? 0) > state.spokeN) recordCount(msg);
      // The newest non-empty message has now answered, and under `countOnly`
      // its answer is the whole errand. Returning here also keeps the recorder's
      // direction rule visible: nothing older may speak after it, not even to
      // fill in a `null`, because `null` IS its answer.
      if (countOnly) return null;
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
  // A report's floor is its OWN frame, which scales with the document path — a
  // fixed constant under-counts long paths and lets the precheck pass while the
  // emitted total runs far over budget (measured: 909 docs at a 206-byte path
  // emitted 272,700 against a 200,000 budget).
  // Worst-case digits, not a synthetic minimum: a floor computed from "0 of 0"
  // and single-digit counts is SMALLER than the frame actually emitted, so a
  // request can pass seating and then have every block exceed its allowance
  // (measured: 1333 docs, floorSum 199,950, emitted 205,315).
  const D = "9".repeat(10);
  const floorFor = (rel) =>
    Buffer.byteLength(
      [
        `spec:lint ${rel}`,
        "kind: plan (inferred)",
        "",
        `[truncated: ${D} of ${D} bytes shown]`,
        `summary: ${D} hard, ${D} advisory`,
      ].join("\n"),
    );
  const relOf = (abs) =>
    abs.startsWith(resolve(cfg.cwd) + "/") ? abs.slice(resolve(cfg.cwd).length + 1) : abs;
  const floors = cfg.lintDocs.map((a) => floorFor(relOf(a)));
  const floorSum = floors.reduce((a, b) => a + b, 0);
  if (floorSum > cfg.lintBudgetBytes) {
    usageError(
      `${cfg.lintDocs.length} --lint-doc reports cannot be seated in ${cfg.lintBudgetBytes} bytes (frames alone need ${floorSum})`,
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
    const downstream = floors.slice(i + 1).reduce((a, b) => a + b, 0);
    const embedded = embedReport(r.stdout ?? "", rel, remaining - downstream);
    if (!embedded) usageError(`spec:lint produced a malformed report for ${rel}`);
    cfg.lintReports.push({ rel, block: embedded.block });
    remaining -= Buffer.byteLength(embedded.block);
  }
  // The seating precheck is a prediction; this is the invariant. Checking the
  // EMITTED total is what turns "should fit" into "did fit".
  const emitted = cfg.lintReports.reduce((a, r) => a + Buffer.byteLength(r.block), 0);
  if (emitted > cfg.lintBudgetBytes) {
    usageError(
      `embedded lint reports total ${emitted} bytes, over the ${cfg.lintBudgetBytes}-byte budget`,
    );
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
    // The declared count of the LAST non-empty terminal message this dispatch
    // produced. One carrier, so the four terminal writers cannot disagree.
    findingCount: null,
    // The ordinal of the newest attempt whose own terminal message spoke — the
    // one question `findingCount` cannot answer afterwards, since "spoke and
    // declared nothing" and "never spoke" both leave it `null`. `0` means no
    // attempt has spoken; ordinals start at 1.
    spokeN: 0,
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
      // The recency bound on the count errand lives inside the scrape, shared
      // with the two exit-3 writers, so this caller passes nothing for it.
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
      // The live attempt may have written its message and then hung, so this is
      // the FIRST read of it, not a second one. A hung attempt that wrote
      // nothing reads "" and changes nothing, so an earlier attempt's
      // declaration survives the interrupt untouched.
      let spoke = false;
      try {
        const livePath = state.currentAttempt?.lastMessagePath;
        if (livePath && existsSync(livePath)) {
          spoke = recordDeclaredCount(state, readFileSync(livePath, "utf8"));
        }
      } catch {
        /* an unreadable message is never a reason to lose the interrupted row */
      }
      // ...and when it did NOT speak, the rollout is where the message went.
      // An interrupt landing after the reviewer's final message but before the
      // `-o` write is the ORIGINAL silent-death shape, and reading only the
      // absent file recorded `null` — "not declared" — about a reviewer who
      // declared a number. `giveUp` already scrapes here; these were the two
      // writers that did not (probed 2026-08-05:
      // {"findingCount":null,"failureReason":"interrupted"} against a rollout
      // declaring 2). Count only: spec §3 keeps an exit-3 result a no-verdict
      // result. The live attempt's sid is latched first because `runAttempt`
      // latches on its EXIT path, which an interrupted attempt never reaches.
      // Best-effort throughout — a scrape that fails inside a signal handler
      // must not cost the row it was trying to improve.
      if (!spoke && state.currentAttempt) {
        try {
          latchSessionId(state.currentAttempt, state);
          tryRolloutScrape(cfg, state, { countOnly: true });
        } catch {
          /* the interrupted row is written either way */
        }
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
  // Writer 4's READ site. Every other writer runs after `classifyAttempt`, which
  // is the only place attempt messages are opened; the paths that reach HERE are
  // the ones that threw ABOVE it - the early and late transcript/stderr stream
  // errors and the unkillable-child throw - so the attempt's message is never
  // read at all and a plainly declared count is recorded as `null`, which means
  // NOT DECLARED and is false. The error carries the attempt, so the path is
  // known. Called through the SAME primitive as the other three sites and, like
  // them, unconditionally: the failing attempt is by construction the LAST one
  // this dispatch ran, so its terminal message is the latest, and an absent or
  // empty one declares nothing and therefore erases nothing.
  let spoke = false;
  try {
    const failedPath = e?.attempt?.lastMessagePath;
    if (state && failedPath && existsSync(failedPath)) {
      spoke = recordDeclaredCount(state, readFileSync(failedPath, "utf8"));
    }
  } catch {
    /* an unreadable message is never a reason to lose the wrapper_error row */
  }
  // The other half of the same fix as `onSignal`: the file this writer reads is
  // the one most likely never to have landed, since the throws that reach here
  // are the ones that happened around the write. When it did not speak - absent,
  // empty, or unreadable - the rollout is the only surviving copy of the
  // terminal message, and `null` would be a false claim that none was declared.
  // Gated on there BEING a failing attempt: a throw carrying no attempt has no
  // `-o` file to have missed, and scraping then could overwrite a count an
  // earlier attempt legitimately recorded. Count only (spec §3, exit 3 stays
  // `no_verdict`), and the sid is latched first because a late stream failure
  // throws ABOVE `runAttempt`'s own latch.
  if (!spoke && state && e?.attempt) {
    try {
      latchSessionId(e.attempt, state);
      // Passed explicitly: this attempt is in neither `state.attempts` nor
      // `state.currentAttempt` yet, so the scrape cannot otherwise place it.
      tryRolloutScrape(cfg, state, { countOnly: true, attempt: e.attempt });
    } catch {
      /* the wrapper_error row is written either way */
    }
  }
  const attempts = [
    ...(state?.attempts ?? []).map(({ parsed: _parsed, ...a }) => a),
    ...(e?.attempt && !(state?.attempts ?? []).includes(e.attempt)
      ? [(({ parsed: _parsed, ...a }) => a)(e.attempt)]
      : []),
  ];
  // ONE value, not two hand-synced copies: the result.json and the corpus row
  // must never disagree about what this dispatch was.
  const body = {
    guardVersion: GUARD_VERSION,
    label: cfg.label,
    status: "no_verdict",
    verdict: null,
    verdictLine: null,
    lastMessagePath: null,
    lintArm: (cfg?.lintDocs ?? []).length > 0 ? "present" : "absent",
    attempts,
    failureReason: "wrapper_error",
    // Writer 4. `state` is already read here (globalThis.__guardState), and the
    // optional chain matches the `state?.startedAtIso ?? null` line below: the
    // handler can run before main() ever set state.
    findingCount: state?.findingCount ?? null,
    error: String(e?.message ?? e),
    startedAt: state?.startedAtIso ?? null,
    endedAt: new Date().toISOString(),
  };
  try {
    writeFileSync(join(cfg.out, "result.json"), JSON.stringify(body, null, 2) + "\n");
  } catch {
    /* stderr only */
  }
  // Outside the try above: a result.json that could not be written is no reason
  // to lose the row too - the round still happened (spec §5.4).
  try {
    emitReviewRoundRow(cfg, body);
  } catch {
    /* telemetry never changes the exit code */
  }
  process.stderr.write(`codex-guard: wrapper_error: ${e?.message ?? e}\n`);
  process.exit(3);
});
