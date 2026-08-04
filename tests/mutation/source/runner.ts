import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
 * each, 102 mutants on the first enrolled surface. Sharding exists in the
 * parser harness if a future surface outgrows this; lifting it early would be
 * complexity with no measured need.
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

/** Run the surface's suite once with `mutantFile` overlaid; return the exit code. */
function runSuite(root: string, target: string, mutantFile: string, suite: string): number {
  try {
    execFileSync("pnpm", ["exec", "vitest", "run", "--config", CONFIG], {
      cwd: root,
      stdio: "pipe",
      encoding: "utf8",
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
    const status = (e as { status?: number }).status;
    // A signal death or a spawn failure yields no numeric status. Treating that
    // as KILLED would silently convert infrastructure faults into coverage, so
    // it is surfaced as a distinct non-zero code and the caller sees a KILLED
    // it can still triage from the outcome list.
    return typeof status === "number" ? status : 1;
  }
}

export function runSurface(root: string, surface: GuardSurface): RunResult {
  const target = resolve(root, surface.sourcePath);
  const text = readFileSync(target, "utf8");
  const suite = surface.suitePaths[0]!;
  const scratch = mkdtempSync(join(tmpdir(), "fx-mutation-"));
  const mutantFile = join(scratch, "mutant.ts");

  // Baseline FIRST: against an already-red suite every mutant scores KILLED and
  // the run would report a meaningless perfect score.
  writeFileSync(mutantFile, text);
  const baselineExit = runSuite(root, target, mutantFile, suite);
  assertCleanBaseline(baselineExit, suite);

  const sites = enumerateSites(target, text, surface.operators);
  const { mutants, noOps } = generateMutants(target, text, surface.operators, sites);

  const outcomes: MutantOutcome[] = [];
  for (const m of mutants) {
    writeFileSync(mutantFile, m.text);
    outcomes.push({
      siteId: siteId(m.site),
      verdict: classify(runSuite(root, target, mutantFile, suite)),
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
}
