import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The state carrier of the manufactured mechanism.
 *
 * A directory named by an env var the harness sets per SCOPE: per-process in
 * across-process mode, shared in the deliberately-provided in-process
 * comparison mode this control's own proof uses. Serial same-scope runs flip
 * the verdict at a known index; fresh-scope runs are stable.
 */
export const STATE_DIR_ENV = "FX_PROCESS_PROBE_STATE_DIR";

/**
 * The authored flip index, chosen against the FULL observation sequence.
 *
 * Each trial runs suite 2 twice — once for the green-baseline check and once
 * for the mutant — so a shared scope reaches this index during the THIRD
 * trial's baseline (5) and the flip lands on that trial's target (6). The
 * baseline at 5 stays green because the boundary genuinely holds on unmutated
 * source: the schedule must survive the baseline consuming state, or a flip
 * caused by baseline consumption proves the wrong thing while rendering the
 * same verdicts.
 */
export const FLIP_AT_RUN = 5;

/** Runs per trial in the observation sequence: one baseline, one mutant. */
export const RUNS_PER_TRIAL = 2;

export function observeRun(
  /**
   * A plain string map rather than `NodeJS.ProcessEnv`: this reads ONE key, and
   * the narrower type lets a caller hand it a scope without casting through the
   * process-wide environment type.
   */
  env: Readonly<Record<string, string | undefined>> = process.env,
): {
  index: number;
  scope: string;
} {
  const dir = env[STATE_DIR_ENV];
  if (dir === undefined || dir === "") {
    throw new Error(
      `${STATE_DIR_ENV} is required: this control's mechanism IS its scope, and a run with no ` +
        `scope would silently behave like a fresh one.`,
    );
  }
  mkdirSync(dir, { recursive: true });
  const counter = join(dir, "runs.count");
  const previous = existsSync(counter) ? Number(readFileSync(counter, "utf8")) : 0;
  const index = previous + 1;
  writeFileSync(counter, String(index), "utf8");
  return { index, scope: dir };
}

/** WHICH RULE decides an observation: the accumulated run index, nothing else. */
export function boundaryCheckActive(index: number): boolean {
  return index >= FLIP_AT_RUN;
}
