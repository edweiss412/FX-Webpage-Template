import { execFileSync } from "node:child_process";
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
  try {
    execFileSync("pnpm", ["exec", "vitest", "run", "--config", CONFIG], {
      cwd: root,
      // DISCARDED, not captured. The exit status is the entire signal — nothing
      // here ever reads the child's output — and `stdio: "pipe"` buffered it
      // against Node's 1 MB `maxBuffer` default, which is a cap on how loudly a
      // mutant may fail rather than on anything meaningful. Enrolling
      // `psqlStartupFileScan` proved that is reachable: one mutant reds enough
      // of that surface's 789-case suite that the failure dump alone overruns
      // 1 MB, Node SIGTERMs the child, and the run dies with
      // `MutantRunInfraError (signal=SIGTERM, code=ENOBUFS)` — no mutant
      // scored, the whole surface unenrollable. Discarding removes the cap
      // outright instead of trading it for a bigger number to outgrow later.
      stdio: ["ignore", "ignore", "ignore"],
      env: {
        ...process.env,
        MUTATION_ROOT: root,
        MUTATION_TARGET: target,
        MUTATION_MUTANT: mutantFile,
        MUTATION_SUITE: suite,
      },
    });
    return 0;
  } catch (e) {
    const err = e as { status?: number | null; signal?: NodeJS.Signals | null; code?: string };
    if (typeof err.status === "number") return err.status;
    throw new MutantRunInfraError(`${context} [${suite}]`, err.signal ?? null, err.code);
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
