import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { generateMutants } from "./generate";
import { type Verdict, assertCleanBaseline, classify } from "./oracle";
import { enumerateSites, siteId } from "./operators";
import type { GuardSurface } from "./registry";

/**
 * The per-mutant runner (spec §3.3/§3.4).
 *
 * Serial by design (spec R6 / limit L-4): one `vitest` child per mutant, ~0.75 s
 * each, 102 mutants on the first enrolled surface.
 *
 * The mutant is written to a TEMP directory and served to Vite from memory by
 * the overlay's `load` hook. The tracked source file is never written, so a
 * crashed or killed run cannot leave a mutant on disk.
 */
export type MutantOutcome = { siteId: string; verdict: Verdict };

export type RunResult = {
  surfaceId: string;
  mutantCount: number;
  noOps: string[];
  baselineGreen: boolean;
  killed: number;
  survivors: string[];
  outcomes: MutantOutcome[];
};

const CONFIG = "tests/mutation/source/mutantOverlay.config.ts";

/**
 * Wall-clock ceiling for ONE suite run against ONE mutant.
 *
 * A mutation operator can produce a mutant that never TERMINATES rather than one
 * that fails: `statement-removal` of a loop's advance statement is the plain
 * case, and `tests/styles/interactiveScanCore.ts` supplied a real one — dropping
 * `cursor = cursor.parent;` inside `while (cursor)`. With no ceiling the child
 * runs forever, the harness scores NOTHING, and the run has to be killed by
 * hand: measured 1h48m on a single mutant with 0 of 207 scored, and four wedged
 * `mutantOverlay.config.ts` children from OTHER arcs alive on the same machine
 * at that moment (2h28m, 2h55m, 3h53m, 5h43m).
 *
 * 180s against a ~2s healthy suite run locally is generous enough that a timeout
 * means a hang rather than a slow machine.
 */
export const MUTANT_TIMEOUT_MS = 180_000;

/**
 * The exit code a timed-out run reports.
 *
 * 124 is `timeout(1)`'s convention; all that matters mechanically is non-zero,
 * which `classify` reads as KILLED. That is the right verdict and the standard
 * one (Stryker and PIT both count a timeout as detected): a mutant that stops
 * the guard terminating cannot ship silently, because the suite never goes green
 * again. It is detection by a different mechanism, not a missed mutant.
 */
export const MUTANT_TIMEOUT_EXIT = 124;

/**
 * A child that produced NO numeric exit status — a signal death, an OOM kill, or
 * a spawn failure.
 *
 * This is fatal to the run, and deliberately NOT folded into `KILLED`. A compile
 * failure is a real non-zero exit from a real process and legitimately counts as
 * detection (limit L-3); a signalled death is the HARNESS failing, and scoring it
 * as detection inflates the score with a kill the suite never earned. On this
 * machine that is not hypothetical — an idle-process reaper has been observed
 * SIGTERM-ing long-running children
 * (`docs/agents/codex-silent-death-2026-07-24.md`).
 */
export class MutantRunInfraError extends Error {
  constructor(
    readonly context: string,
    readonly signal: NodeJS.Signals | null,
    readonly code: string | undefined,
  ) {
    super(
      `mutation run produced no exit status for ${context} ` +
        `(signal=${signal ?? "none"}, code=${code ?? "none"}). ` +
        `This is an infrastructure fault, not a KILLED mutant — scoring it as detection ` +
        `would inflate the mutation score with a kill the suite never earned.`,
    );
    this.name = "MutantRunInfraError";
  }
}

/**
 * Run one suite with `mutantFile` overlaid.
 *
 * Returns the numeric exit code, or throws `MutantRunInfraError` when the child
 * died without one.
 */
export function runSuite(
  root: string,
  target: string,
  mutantFile: string,
  suite: string,
  context: string,
): number {
  const env = {
    ...process.env,
    MUTATION_ROOT: root,
    MUTATION_TARGET: target,
    MUTATION_MUTANT: mutantFile,
    MUTATION_SUITE: suite,
  };
  const { result, ownGroup } = spawnChild(root, env);

  // A timeout kill and this machine's idle-process reaper arrive in the SAME
  // shape — no exit status, a signal — so the code is the only thing that tells
  // them apart, and they must not share a verdict. The reaper steals a run that
  // would have finished, and folding it into KILLED would score a kill the suite
  // never earned; a timeout is the mutant's own doing (see MUTANT_TIMEOUT_EXIT).
  if (result.error && (result.error as { code?: string }).code === "ETIMEDOUT") {
    killProcessGroup(result.pid, ownGroup);
    return MUTANT_TIMEOUT_EXIT;
  }
  if (typeof result.status === "number") return result.status;
  // Every remaining shape is a child that produced no exit status. The group
  // kill runs here too: a signalled or failed-to-spawn child can still have left
  // descendants, and this run is about to abort rather than reap them later.
  killProcessGroup(result.pid, ownGroup);
  throw new MutantRunInfraError(
    `${context} [${suite}]`,
    result.signal ?? null,
    (result.error as { code?: string } | undefined)?.code,
  );
}

/**
 * The argv that makes the child a process-GROUP LEADER before it becomes the
 * command.
 *
 * `setpgrp` puts the process in a new group whose id is its own pid; `exec`
 * then replaces it with the real command, keeping that group. Node cannot do
 * this itself — `spawnSync` accepts no `detached` and there is no `setpgid`
 * binding — and it is the only way the reap below can work AT ALL: `spawnSync`
 * returns only after killing the process it spawned, so by then every
 * descendant has been reparented to init and no parent-based walk can find
 * them (whole-diff R3 F1). A process group outlives its leader; a parent link
 * does not.
 */
export const GROUP_LEADER_ARGV = ["-e", "setpgrp; exec @ARGV", "--"] as const;

const CHILD_ARGS = ["exec", "vitest", "run", "--config", CONFIG] as const;

/**
 * Spawn the suite child, in its own process group where the platform allows it.
 *
 * `perl` ships with macOS and every CI image this runs on. If it is missing the
 * child is spawned directly and `ownGroup` is false: the run still works and the
 * timeout still scores, but a hung grandchild survives — degraded, and reported
 * as such rather than silently assumed.
 */
function spawnChild(
  root: string,
  env: NodeJS.ProcessEnv,
): { result: ReturnType<typeof spawnSync>; ownGroup: boolean } {
  const options = {
    cwd: root,
    stdio: "pipe" as const,
    encoding: "utf8" as const,
    timeout: MUTANT_TIMEOUT_MS,
    // SIGTERM is what vitest's own watchdogs and this machine's idle-process
    // reaper use, and a vitest child can trap it; SIGKILL cannot be trapped,
    // so the ceiling is a ceiling.
    killSignal: "SIGKILL" as const,
    env,
  };
  const grouped = spawnSync("perl", [...GROUP_LEADER_ARGV, "pnpm", ...CHILD_ARGS], options);
  if ((grouped.error as { code?: string } | undefined)?.code !== "ENOENT") {
    return { result: grouped, ownGroup: true };
  }
  return { result: spawnSync("pnpm", [...CHILD_ARGS], options), ownGroup: false };
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
function killProcessGroup(pid: number | undefined, ownGroup: boolean): void {
  if (pid === undefined || !ownGroup) return;
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    // already gone
  }
}

/**
 * Run EVERY declared suite; the mutant is KILLED if any of them rejects it.
 *
 * Short-circuits on the first rejection: later suites cannot change the verdict
 * and each costs a full vitest boot. Running only `suitePaths[0]` would report a
 * mutant killed solely by a later suite as SURVIVED — a wrong verdict, and a
 * silent contradiction of the plural registry contract in spec §3.7.
 */
function runAllSuites(
  root: string,
  target: string,
  mutantFile: string,
  suites: readonly string[],
  context: string,
): number {
  for (const suite of suites) {
    const code = runSuite(root, target, mutantFile, suite, context);
    if (code !== 0) return code;
  }
  return 0;
}

export function runSurface(root: string, surface: GuardSurface): RunResult {
  const target = resolve(root, surface.sourcePath);
  const text = readFileSync(target, "utf8");
  const scratch = mkdtempSync(join(tmpdir(), "fx-mutation-"));
  const mutantFile = join(scratch, "mutant.ts");

  try {
    // Baseline FIRST, across EVERY suite: against an already-red suite every
    // mutant scores KILLED and the run would report a meaningless perfect score.
    writeFileSync(mutantFile, text);
    assertCleanBaseline(
      runAllSuites(root, target, mutantFile, surface.suitePaths, `${surface.id} baseline`),
      surface.suitePaths.join(", "),
    );

    const sites = enumerateSites(target, text, surface.operators);
    const { mutants, noOps } = generateMutants(target, text, surface.operators, sites);

    const outcomes: MutantOutcome[] = [];
    for (const m of mutants) {
      const id = siteId(m.site);
      writeFileSync(mutantFile, m.text);
      outcomes.push({
        siteId: id,
        verdict: classify(runAllSuites(root, target, mutantFile, surface.suitePaths, id)),
      });
    }

    return {
      surfaceId: surface.id,
      mutantCount: mutants.length,
      noOps,
      baselineGreen: true,
      killed: outcomes.filter((o) => o.verdict === "KILLED").length,
      survivors: outcomes.filter((o) => o.verdict === "SURVIVED").map((o) => o.siteId),
      outcomes,
    };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/**
 * Run ONE hand-written mutant against a surface's suites and return the child's
 * exit code. Non-zero means the suite noticed.
 *
 * The liveness control needs this because the declared operator set cannot
 * synthesize an arbitrary edit, and the control's whole point is an edit a
 * human chose BECAUSE the suite must obviously notice it. The version this
 * replaces computed the mutant text and then never ran it, so it asserted only
 * that a string occurred in a file.
 */
export function runControl(root: string, surface: GuardSurface, mutantText: string): number {
  const dir = mkdtempSync(join(tmpdir(), "mutation-control-"));
  try {
    const mutantFile = join(dir, "control.ts");
    writeFileSync(mutantFile, mutantText, "utf8");
    for (const suite of surface.suitePaths) {
      const code = runSuite(
        root,
        resolve(root, surface.sourcePath),
        mutantFile,
        suite,
        `${surface.id}:control`,
      );
      if (code !== 0) return code;
    }
    return 0;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
