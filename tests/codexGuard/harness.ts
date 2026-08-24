import { execFile } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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
export interface AttemptRecord {
  n: number;
  kind: "exec" | "resume";
  pid: number | null;
  exitCode: number | null;
  signal: string | null;
  killedReason:
    | "no_output"
    | "stall"
    | "attempt_timeout"
    | "total_timeout"
    | "external_signal"
    | null;
  failureShape:
    | "no_o_file"
    | "empty_o_file"
    | "no_marker"
    | "unrecognized_verdict"
    | "nonzero_exit"
    | "killed"
    | "spawn_error"
    | null;
  recovery: "cache_ttl" | "cache_ttl_skipped" | "resume" | "retry" | null;
  /** Session id scraped from THIS attempt's stderr banner (null when absent). */
  sessionId: string | null;
  transcriptPath: string;
  stderrPath: string;
  lastMessagePath: string;
  durationSecs: number;
}
export interface GuardResult {
  guardVersion: number;
  label: string | null;
  status: "verdict" | "no_verdict";
  verdict: "APPROVE" | "NEEDS-ATTENTION" | "BLOCKING" | null;
  verdictLine: string | null;
  lastMessagePath: string | null;
  attempts: AttemptRecord[];
  failureReason: "attempts_exhausted" | "total_timeout" | "wrapper_error" | "interrupted" | null;
  error: string | null;
  /** Set when a verdict was salvaged from the session rollout after the -o write never landed. */
  recoveredFrom: "rollout_scrape" | null;
  /** Vendored native codex binary the guard invoked instead of the Node shim, if resolved. */
  nativeBinaryResolved: string | null;
  /**
   * Whether the dispatch carried at least one `--lint-doc` (design §2.4).
   * Written by BOTH result writers: a wrapper fault after a valid lint run must
   * still record it, or the machine-visibility promise fails in exactly the
   * case an orchestrator most needs it.
   */
  lintArm: "present" | "absent";
  /**
   * The count the reviewer DECLARED, or null for "not declared". Written by
   * every terminal writer including `main().catch`, so a test may assert it on
   * a wrapper-fault result without going through the corpus row.
   */
  findingCount: number | null;
  startedAt: string | null;
  endedAt: string;
}
export interface CallRecord {
  argv: string[];
  cwd: string;
  stdinBytes: number;
  stdin: string;
  codexHome: string | null;
}
export interface GuardExit {
  code: number | null;
  stdout: string;
  stderr: string;
}

const RUNS: string[] = [];
export function cleanupRuns(): void {
  for (const d of RUNS.splice(0)) {
    // best-effort: kill any fake/grandchild processes recorded in this run before deleting it
    const rec = join(d, "record");
    try {
      for (const f of readdirSync(rec).filter((x) => /^(grandchild-)?pid-\d+\.txt$/.test(x))) {
        try {
          process.kill(Number(readFileSync(join(rec, f), "utf8")), "SIGKILL");
        } catch {
          /* gone */
        }
      }
    } catch {
      /* record dir gone */
    }
    rmSync(d, { recursive: true, force: true });
  }
}

export function mkRun(): Run {
  // realpathSync: macOS tmpdir lives behind the /var -> /private/var symlink; the
  // fixture records its realpath cwd, so canonicalize here or cwd asserts mismatch.
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "codex-guard-test-")));
  RUNS.push(dir);
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
  writeFileSync(
    run.briefPath,
    "Review this artifact. End with VERDICT: APPROVE or VERDICT: NEEDS-ATTENTION.\n",
  );
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
  run: Run,
  extraArgs: string[] = [],
  envOverrides: Record<string, string> = {},
  opts: { injectDefaults?: boolean } = {},
): Promise<GuardExit> {
  // The review-round flags are REQUIRED at the CLI (spec §5.1, hard cutover).
  // Every pre-existing scenario test predates them, so the harness supplies a
  // default pair unless the caller already passed one - a test exercising flag
  // validation opts out with { injectDefaults: false } or passes its own value.
  const inject = opts.injectDefaults ?? true;
  const defaults = inject
    ? [
        ...(extraArgs.includes("--stage") ? [] : ["--stage", "spec"]),
        ...(extraArgs.includes("--round") ? [] : ["--round", "1"]),
      ]
    : [];
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [
        GUARD,
        "review",
        "--brief",
        run.briefPath,
        "--cwd",
        run.cwdDir,
        "--out",
        run.outDir,
        ...defaults,
        ...extraArgs,
      ],
      // timeout: a hung guard (red-state TDD runs!) is SIGTERMed — its own handler cleans the
      // child group — instead of leaking past a vitest timeout. SIGTERM, not SIGKILL, on purpose.
      {
        env: guardEnv(run, envOverrides),
        maxBuffer: 16 * 1024 * 1024,
        timeout: 25000,
        killSignal: "SIGTERM",
      },
      (err, stdout, stderr) => {
        const code = err
          ? typeof (err as { code?: unknown }).code === "number"
            ? ((err as { code?: number }).code ?? null)
            : null
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
  // The derived cover for a whole class of vacuous assertions. The fake codex
  // reads its scenario BEFORE recording a call and exits without one, so on a
  // scenario-less run `readCalls` returns [] whether or not the wrapper
  // dispatched, and every `toHaveLength(0)` on such a run holds for the wrong
  // reason. Throwing here fails the next one loudly instead of passing it
  // (jurisdiction plan Task 1, plan review round 3).
  if (!existsSync(run.scenarioPath)) {
    throw new Error(
      "readCalls: no scenario was written for this run, so an empty call list proves nothing " +
        "(the fake codex exits before recording). Call writeScenario(run, [APPROVE_STEP]) first.",
    );
  }
  return readdirSync(run.recordDir)
    .filter((f) => /^call-\d+\.json$/.test(f))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]))
    .map((f) => JSON.parse(readFileSync(join(run.recordDir, f), "utf8")) as CallRecord);
}
