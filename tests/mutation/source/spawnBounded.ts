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
