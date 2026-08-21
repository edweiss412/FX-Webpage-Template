/**
 * THE PROBE INSTRUMENT — an ATTRIBUTING re-run of the shipped per-mutant loop.
 *
 * Records, per suite-child: siteId, suite, outcome KIND (exit | timeout | infra),
 * exit code, and wall-clock. The shipped runner records (siteId, verdict) and
 * nothing else, which is probe 1's finding; this adds the evidence WITHOUT
 * changing any verdict.
 *
 * NOT shipped source. This is spec-time measurement instrumentation, COMMITTED
 * alongside the probe record it produced so the measurements are regenerable. It mirrors `runSuite`/`runAllSuites`/`runSurface` (runner.ts:87-181)
 * and is a SECOND DEFINITION of that loop, so `selfCheck` below compares its
 * verdicts against the shipped `runSurface` on a real surface. A reimplementation
 * that agrees by luck is rule 84's defect; this makes the agreement checked.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { generateMutants } from "../../../../../../tests/mutation/source/generate";
import { classify } from "../../../../../../tests/mutation/source/oracle";
import { enumerateSites, siteId } from "../../../../../../tests/mutation/source/operators";
import { MUTANT_TIMEOUT_EXIT, runSurface } from "../../../../../../tests/mutation/source/runner";
import { MUTANT_TIMEOUT_MS, spawnBounded } from "../../../../../../tests/mutation/source/spawnBounded";
import type { GuardSurface } from "../../../../../../tests/mutation/source/registry";

const CONFIG = "tests/mutation/source/mutantOverlay.config.ts";
const CHILD_ARGS = ["exec", "vitest", "run", "--config", CONFIG] as const;

export type ChildRecord = {
  siteId: string;
  suite: string;
  kind: "exit" | "timeout" | "infra";
  code: number | null;
  durationMs: number;
};

/** Mirrors runner.ts:87-115, plus the record. Verdict mapping is UNCHANGED. */
export function runSuiteRecorded(
  root: string,
  target: string,
  mutantFile: string,
  suite: string,
  id: string,
  sink: ChildRecord[],
): number {
  const env = {
    ...process.env,
    MUTATION_ROOT: root,
    MUTATION_TARGET: target,
    MUTATION_MUTANT: mutantFile,
    MUTATION_SUITE: suite,
  };
  const t0 = Date.now();
  const { outcome } = spawnBounded(["pnpm", ...CHILD_ARGS], {
    cwd: root,
    env,
    timeoutMs: MUTANT_TIMEOUT_MS,
  });
  const durationMs = Date.now() - t0;
  if (outcome.kind === "timeout") {
    sink.push({ siteId: id, suite, kind: "timeout", code: null, durationMs });
    return MUTANT_TIMEOUT_EXIT;
  }
  if (outcome.kind === "exit") {
    sink.push({ siteId: id, suite, kind: "exit", code: outcome.code, durationMs });
    return outcome.code;
  }
  sink.push({ siteId: id, suite, kind: "infra", code: null, durationMs });
  throw new Error(`infra fault for ${id} [${suite}]: signal=${outcome.signal} code=${outcome.code}`);
}

/** Mirrors runner.ts:127-139 — short-circuits on first rejection, same as shipped. */
function runAllSuitesRecorded(
  root: string,
  target: string,
  mutantFile: string,
  suites: readonly string[],
  id: string,
  sink: ChildRecord[],
): number {
  for (const suite of suites) {
    const code = runSuiteRecorded(root, target, mutantFile, suite, id, sink);
    if (code !== 0) return code;
  }
  return 0;
}

export type RecordedRun = {
  surfaceId: string;
  mutantCount: number;
  killed: number;
  survivors: string[];
  outcomes: { siteId: string; verdict: string }[];
  records: ChildRecord[];
};

/** Mirrors runner.ts:141-181. */
export function runSurfaceRecorded(root: string, surface: GuardSurface): RecordedRun {
  const target = resolve(root, surface.sourcePath);
  const text = readFileSync(target, "utf8");
  const scratch = mkdtempSync(join(tmpdir(), "fx-probe-"));
  const mutantFile = join(scratch, "mutant.ts");
  const records: ChildRecord[] = [];
  try {
    writeFileSync(mutantFile, text);
    const base = runAllSuitesRecorded(root, target, mutantFile, surface.suitePaths, "BASELINE", records);
    if (base !== 0) throw new Error(`baseline not green for ${surface.id} (exit ${base})`);

    const sites = enumerateSites(target, text, surface.operators);
    const { mutants } = generateMutants(target, text, surface.operators, sites);
    const outcomes: { siteId: string; verdict: string }[] = [];
    for (const m of mutants) {
      const id = siteId(m.site);
      writeFileSync(mutantFile, m.text);
      outcomes.push({
        siteId: id,
        verdict: classify(runAllSuitesRecorded(root, target, mutantFile, surface.suitePaths, id, records)),
      });
    }
    return {
      surfaceId: surface.id,
      mutantCount: mutants.length,
      killed: outcomes.filter((o) => o.verdict === "KILLED").length,
      survivors: outcomes.filter((o) => o.verdict === "SURVIVED").map((o) => o.siteId),
      outcomes,
      records,
    };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/**
 * POSITIVE CONTROL against rule-84 drift: the instrument and the SHIPPED runner
 * must agree on verdicts for the same surface. Agreement of numerals is not
 * agreement of semantics, so this compares the survivor SETS and killed counts.
 */
export function selfCheck(root: string, surface: GuardSurface): boolean {
  const shipped = runSurface(root, surface);
  const mine = runSurfaceRecorded(root, surface);
  const same =
    shipped.mutantCount === mine.mutantCount &&
    shipped.killed === mine.killed &&
    JSON.stringify([...shipped.survivors].sort()) === JSON.stringify([...mine.survivors].sort());
  console.log(`SELF-CHECK ${surface.id}: shipped killed=${shipped.killed}/${shipped.mutantCount} survivors=${JSON.stringify(shipped.survivors)}`);
  console.log(`SELF-CHECK ${surface.id}: probe   killed=${mine.killed}/${mine.mutantCount} survivors=${JSON.stringify(mine.survivors)}`);
  console.log(`SELF-CHECK ${surface.id}: AGREE=${same}`);
  return same;
}
