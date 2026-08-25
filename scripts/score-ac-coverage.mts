#!/usr/bin/env tsx
/**
 * Score ONE enrolled surface through the harness's own path.
 *
 * Takes the same `runSurface` + `evaluateGate` route the shard suites take, so it
 * reports the same numbers. Scoped rather than sharded because holding the single
 * machine-wide heavy slot for ten unrelated surfaces to score one is the wrong
 * trade.
 *
 * It calls those two DIRECTLY rather than through `surfaceCases.evaluateSurface`,
 * which would be the tidier seam: that module imports `vitest` at module scope,
 * and plain tsx loads it as CJS, where vitest refuses to be required. The `--dry`
 * mode below caught that before a slot was taken, which is the whole point of it.
 *
 *   node --import tsx scripts/score-ac-coverage.mts --dry   # cold proof, no slot
 *   pnpm heavy node --import tsx scripts/score-ac-coverage.mts
 *
 * `--dry` resolves the module graph, finds the surface, and checks every declared
 * suite exists — every failure mode reachable in the first second — WITHOUT
 * spawning a mutant. A run queued behind a scarce slot pays the whole wait for a
 * crash it could have found cold.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { evaluateGate } from "../tests/mutation/source/gate";
import { emitRunRecord } from "../tests/mutation/source/records";
import { GUARD_SURFACES } from "../tests/mutation/source/registry";
import { runSurface } from "../tests/mutation/source/runner";

const SURFACE_ID = process.argv[2]?.startsWith("--")
  ? "acCoverage"
  : (process.argv[2] ?? "acCoverage");
const DRY = process.argv.includes("--dry");
const root = process.cwd();

const surface = GUARD_SURFACES.find((s) => s.id === SURFACE_ID);
if (surface === undefined) {
  console.error(`no enrolled surface with id ${SURFACE_ID}`);
  process.exit(2);
}

const missing = [surface.sourcePath, ...surface.suitePaths].filter(
  (p) => !existsSync(resolve(root, p)),
);
if (missing.length > 0) {
  console.error(`declared path(s) that do not exist: ${missing.join(", ")}`);
  process.exit(2);
}

console.log(`surface:    ${surface.id}`);
console.log(`source:     ${surface.sourcePath}`);
console.log(`suites:     ${surface.suitePaths.length}`);
for (const s of surface.suitePaths) console.log(`              ${s}`);
console.log(`operators:  ${surface.operators.join(", ")}`);
console.log(`scoreFloor: ${surface.scoreFloor}`);
console.log(`accepted:   ${surface.accepted.length}`);

if (DRY) {
  console.log("\nDRY: module graph resolved, surface found, every declared path exists.");
  console.log("No mutant was generated and no slot is required for this mode.");
  process.exit(0);
}

const run = runSurface(root, surface);
const result = evaluateGate({
  surfaceId: surface.id,
  mutantCount: run.mutantCount,
  noOps: run.noOps,
  baselineGreen: run.baselineGreen,
  killed: run.killed,
  survivors: run.survivors,
  ledger: surface.accepted,
  scoreFloor: surface.scoreFloor,
  outcomes: run.outcomes,
});
for (const notice of result.notices) process.stdout.write(`${notice.detail}\n`);
void emitRunRecord({
  surfaceId: surface.id,
  passed: result.passed,
  score: result.score.value,
  outcomes: run.outcomes,
});
// The unaccepted-SURVIVOR count, not the failure count. Counting failures gave
// "2 unaccepted survivors" against a gate reporting five — an UNDERSTATEMENT, and
// the direction nobody checks, because the wrapper validates the line's shape and
// never its truth. Read off the gate's own condition rather than inferred.
const unacceptedRow = result.failures.find((f) => f.condition === "unaccepted-survivor");
const unaccepted = unacceptedRow
  ? Number(/^(\d+) survivor/.exec(unacceptedRow.detail)?.[1] ?? "NaN")
  : 0;

console.log(`\nmutants:    ${run.mutantCount}`);
console.log(`killed:     ${run.killed}`);
console.log(`survivors:  ${run.survivors.length}`);
for (const s of run.survivors) console.log(`              ${s}`);
// `denominator`, not a `total` field — Score has none. killed/denominator is the
// harness's own ratio, and it may be NaN when a run produced no mutants, which is
// reported rather than coerced.
console.log(
  `score:      ${result.score.killed}/${result.score.denominator} = ${result.score.value}` +
    ` (counted survivors ${result.score.countedSurvivors}, excluded ${result.score.excluded})`,
);
console.log(`passed:     ${result.passed}`);
for (const f of result.failures) console.log(`  FAILURE  ${f.condition}: ${f.detail}`);
for (const n of result.notices) console.log(`  notice   ${JSON.stringify(n)}`);

// The GUARD SURFACE line, rendered from the RUN and the shipped registry row so
// neither the numerals nor the operator set is retyped from memory.
console.log(
  `\nGUARD SURFACE: ${surface.sourcePath} — MUTATION SCORE: ${result.score.killed}/${result.score.denominator}, ` +
    `${unaccepted} unaccepted survivors — ` +
    `OPERATORS: ${surface.operators.join(", ")}`,
);

process.exit(result.passed ? 0 : 1);
