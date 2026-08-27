import { type StdioOptions, spawnSync } from "node:child_process";

/**
 * The perl supervisor program: process-group leader, parent-death watchdog,
 * status/signal-transparent wait. Spec §5.1 pins this text; wrapper-internal
 * failures die by SELF-SIGNAL (SIGUSR2, SIGKILL fallback), never by a numeric
 * exit, so no wrapper failure can alias a child exit code (spec review R1).
 *
 * Reading order inside the loop is load-bearing: the child's exit is checked
 * BEFORE the parent's death, so a normally-completed run is never converted
 * into a group kill by a racing harness death. The signal re-raise resets the
 * disposition to DEFAULT first — an inherited-ignored disposition would
 * otherwise swallow it — and falls back to SIGKILL, so the signal path can
 * never fall through to a numeric exit. That is what keeps
 * `MutantRunInfraError` honest.
 */
export const WATCHDOG_SCRIPT = [
  "use POSIX qw(WNOHANG);",
  "use Config;",
  "setpgrp;",
  "my $pid = fork() // do { kill('USR2', $$); kill('KILL', $$) };",
  "if ($pid == 0) { exec @ARGV; kill('USR2', $$); kill('KILL', $$) }",
  "my @signame = split ' ', $Config{sig_name};",
  "for (;;) {",
  "  my $r = waitpid($pid, WNOHANG);",
  "  if ($r > 0) {",
  "    my $s = $?;",
  "    if ($s & 127) {",
  "      my $sig = $s & 127;",
  "      $SIG{$signame[$sig]} = 'DEFAULT' if defined $signame[$sig];",
  "      kill($sig, $$);",
  "      kill('KILL', $$);",
  "    }",
  "    exit($s >> 8);",
  "  }",
  "  if (getppid() == 1) { kill('KILL', -$$) }",
  "  select(undef, undef, undef, 0.5);",
  "}",
].join("\n");

/**
 * Argv prefix that runs a command under the supervisor.
 *
 * `setpgrp` puts the supervisor in a new group whose id is its own pid, and the
 * forked child inherits it. A process group outlives its leader; a parent link
 * does not — which is the only reason the reap below can work at all, because
 * `spawnSync` returns only after killing the process it spawned and by then
 * every descendant has been reparented.
 */
export const WATCHDOG_ARGV = ["-e", WATCHDOG_SCRIPT, "--"] as const;

/**
 * Wall-clock ceiling for ONE bounded child run.
 *
 * A mutation operator can produce a mutant that never TERMINATES rather than
 * one that fails: `statement-removal` of a loop's advance statement is the
 * plain case, and `tests/styles/interactiveScanCore.ts` supplied a real one —
 * dropping `cursor = cursor.parent;` inside `while (cursor)`. With no ceiling
 * the child runs forever, the harness scores NOTHING, and the run has to be
 * killed by hand: measured 1h48m on a single mutant with 0 of 207 scored, and
 * four wedged `mutantOverlay.config.ts` children from OTHER arcs alive on the
 * same machine at that moment (2h28m, 2h55m, 3h53m, 5h43m).
 *
 * 180s against a ~2s healthy suite run locally is generous enough that a
 * timeout means a hang rather than a slow machine.
 *
 * ---------------------------------------------------------------------------
 * MEASURED 2026-08-26, and the measurement REFUSED a proposal to lower this.
 *
 * The proposal was 30s, argued from a bimodal distribution with an empty gulf:
 * on `connectionCensus`, eight TIMEOUT-KILLs at the ceiling, 325 non-timeout
 * kills at median 1586ms / p95 2102ms / max 3691ms, and nothing between 10s and
 * 180s. That is true OF THAT SURFACE and false of the pool. Over the 50 records
 * run 32958581720 uploaded (6961 non-timeout children, 16 timeouts):
 *
 *     pooled median 1519ms   p95 4523ms   MAX 103,143ms
 *     children in the 10s..180s "gulf": 215
 *     children above 30s: 128, of which 51 EXITED ZERO
 *     `psqlStartupScan` alone has a MEDIAN of 31,054ms
 *
 * A 30s ceiling would not merely blur 77 genuine kills into timeouts; it would
 * convert 51 genuine SURVIVORS into false kills, and a false kill is a survivor
 * the gate stops reporting. `gate.ts` says what a timeout is worth in its own
 * TIMEOUT-KILL notice: it "scores KILLED, which is the standard verdict, but it
 * is NOT evidence the suite rejected the mutant." Lowering the ceiling would
 * therefore hide real coverage gaps behind a perfect-looking score.
 *
 * DOCUMENTED LIMIT L-2, so the thin margin is on the record rather than
 * rediscovered: 180,000ms is 1.75x the pooled measured maximum, where the
 * browser-side constant is pinned at >= 10x its own pool
 * (`tests/mutation/browser/timeout.test.ts`). If this constant is wrong it is
 * wrong by being TIGHT, not loose. The source side has no executable derivation
 * pin — `childRun.test.ts` only asserts the timeout exceeds zero. Baseline
 * 1.75x; re-file if the ratio falls below 1.5x, which means the pooled max
 * crossing 120,000ms or someone lowering this number.
 *
 * DOCUMENTED LIMIT L-3: sixteen non-terminating mutants per nightly each burn
 * the full 180s — eight on `connectionCensus`, four on `sendAuthScan`, one each
 * on `acCoverage`, `interactiveScanCore`, `modal-wait-helper-scan` and
 * `mutationSurfaceEnumerate`. Measured share of leg elapsed time: shard 1
 * 57.8%, shard 4 25.1%, shard 5 19.8%, shard 7 5.8%, the rest zero. The cheap
 * lever is recognising a removed sole loop advance at GENERATION time, which is
 * a generator change and not this constant's business. Baseline is those four
 * figures; re-file when the timeout count exceeds 20 in one run, when any leg's
 * timeout share exceeds 65%, or when a leg's timeout seconds alone would breach
 * SHARD_BUDGET_SECONDS.
 *
 * Neither limit is a fidelity defect, which is why recording is the honest
 * disposition rather than a dodge: a TIMEOUT-KILL emits its own notice naming
 * the mutant and the deciding suite, so a triager can act on it. What these
 * record is COST, not a wrong verdict.
 * ---------------------------------------------------------------------------
 */
export const MUTANT_TIMEOUT_MS = 180_000;

export type SpawnOutcome =
  | { kind: "exit"; code: number }
  | { kind: "timeout" }
  | { kind: "infra"; signal: NodeJS.Signals | null; code: string | undefined };

/**
 * PURE interpreter over a spawnSync-shaped result.
 *
 * A timeout kill and this machine's idle-process reaper arrive in the SAME
 * shape — no exit status, a signal — so the errno is the only thing that tells
 * them apart, and they must not share a verdict. The caller decides what each
 * kind MEANS; this only says which one happened.
 */
export function interpretSpawnOutcome(result: {
  status: number | null;
  signal: NodeJS.Signals | null;
  error?: Error & { code?: string };
}): SpawnOutcome {
  if (result.error && result.error.code === "ETIMEDOUT") return { kind: "timeout" };
  if (typeof result.status === "number") return { kind: "exit", code: result.status };
  return { kind: "infra", signal: result.signal ?? null, code: result.error?.code };
}

/**
 * SIGKILL the child's whole process group, tolerating one that is already gone.
 *
 * The group id IS the leader's pid, and the group stays valid while any member
 * lives — which is why this reaches a grandchild that has already outlived its
 * parent. Without `ownGroup` the negative-pid form would signal THIS process's
 * group, so it is not attempted: the child is already dead and there is nothing
 * safe left to do.
 */
export function killGroup(pid: number | undefined, ownGroup: boolean): void {
  if (pid === undefined || !ownGroup) return;
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    // already gone
  }
}

export type BoundedRun = { outcome: SpawnOutcome; ownGroup: boolean };

/**
 * Run `argv` bounded in both directions: by a wall-clock ceiling while this
 * process lives, and by the supervisor's parent-death watchdog once it does
 * not.
 *
 * `perl` ships with macOS and every CI image this runs on. If it is missing the
 * command is spawned directly and `ownGroup` is false: the run still works and
 * the timeout still bounds it, but a hung grandchild survives — degraded, and
 * reported by shape rather than silently assumed.
 */
export function spawnBounded(
  argv: readonly [string, ...string[]],
  options: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs?: number },
): BoundedRun {
  const spawnOptions = {
    cwd: options.cwd,
    // DISCARDED, not captured. Nothing here ever reads the child's output — the
    // callers consume only `status`, `signal` and `error.code` — and piping it
    // buffers against Node's 1 MB `maxBuffer` default, which is a cap on how
    // LOUDLY a mutant may fail rather than on anything meaningful. Probing the
    // psql startup-file scanner reached it: one mutant reds enough of that
    // surface's 789-case suite that the failure dump alone overruns 1 MB, the
    // child dies with no exit status, and the run aborts through the infra path
    // having scored NO mutant — making any high-output surface unenrollable.
    // Discarding removes the cap outright instead of trading it for a bigger
    // number to outgrow later, and costs nothing observable because the output
    // was already invisible.
    stdio: ["ignore", "ignore", "ignore"] as StdioOptions,
    timeout: options.timeoutMs ?? MUTANT_TIMEOUT_MS,
    // SIGTERM is what vitest's own watchdogs and this machine's idle-process
    // reaper use, and a vitest child can trap it; SIGKILL cannot be trapped, so
    // the ceiling is a ceiling.
    killSignal: "SIGKILL" as const,
    env: options.env,
  };
  const grouped = spawnSync("perl", [...WATCHDOG_ARGV, ...argv], spawnOptions);
  const fellBack = (grouped.error as { code?: string } | undefined)?.code === "ENOENT";
  const result = fellBack ? spawnSync(argv[0], argv.slice(1), spawnOptions) : grouped;
  const ownGroup = !fellBack;
  const outcome = interpretSpawnOutcome(result);
  if (outcome.kind !== "exit") killGroup(result.pid, ownGroup);
  return { outcome, ownGroup };
}
