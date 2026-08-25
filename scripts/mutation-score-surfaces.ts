// scripts/mutation-score-surfaces.ts
//
// Score named guard surfaces and report the number an enrolling author needs.
//
// Two things a scoped run has to produce, and the second is the one no existing
// tool prints: the SCORE with its survivors, and the measured milliseconds per
// MODELLED boot, which is what `GuardSurface.millisPerBoot` declares. Without the
// second, the bootstrap in the weight-model spec's §2.4.1 -- add the row, run it,
// read the rate, replace the placeholder -- has no step 3.
//
// Enters through `runSurface` + `evaluateGate`, never `surfaceCases.evaluateSurface`:
// the gate's own conditions are what decide pass or fail, and a scoped substitute
// that re-implements them measures a different thing from the gate it stands in for.
//
// HEAVY. This spawns one vitest child per mutant, so it is a mutation-class phase
// and runs under `pnpm heavy` at the OUTERMOST entry:
//
//   VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm heavy pnpm tsx \
//     scripts/mutation-score-surfaces.ts mutationWeightRecords mutationWeightWeights
//
// The env prefix is load-bearing and is not decoration copied from a sibling: the
// mutation vitest project is opt-in, and without it the run dies on "no projects
// matched" a second after a queue wait that can be hours.
import { evaluateGate } from "../tests/mutation/source/gate";
import { GUARD_SURFACES } from "../tests/mutation/source/registry";
import { runSurface } from "../tests/mutation/source/runner";
import { bootsOf } from "../tests/mutation/source/shardPartition";

const wanted = process.argv.slice(2);
if (wanted.length === 0) {
  process.stderr.write("usage: pnpm tsx scripts/mutation-score-surfaces.ts <surfaceId> [...]\n");
  process.exit(2);
}

const unknown = wanted.filter((id) => !GUARD_SURFACES.some((s) => s.id === id));
if (unknown.length > 0) {
  // Named and refused rather than skipped. A typo that silently scores nothing
  // reports a clean run over an empty set, which is the shape of every vacuous pass.
  process.stderr.write(`unknown surface id(s): ${unknown.join(", ")}\n`);
  process.exit(2);
}

let failed = false;
for (const surface of GUARD_SURFACES.filter((s) => wanted.includes(s.id))) {
  const result = runSurface(process.cwd(), surface);
  const gate = evaluateGate({
    surfaceId: result.surfaceId,
    mutantCount: result.mutantCount,
    noOps: result.noOps,
    baselineGreen: result.baselineGreen,
    killed: result.killed,
    survivors: result.survivors,
    ledger: surface.accepted,
    scoreFloor: surface.scoreFloor,
    outcomes: result.outcomes,
  });

  const millis = result.outcomes
    .flatMap((o) => [...(o.children ?? [])])
    .reduce((a, c) => a + c.durationMs, 0);
  // MODELLED boots, which is what the rate is calibrated against: the product
  // `bootsOf * millisPerBoot` is then a prediction of the surface's seconds, and
  // the count's systematic bias -- 1.31x corpus-wide -- is absorbed rather than
  // left sitting between what was measured and what is used.
  const boots = bootsOf(surface);
  const score = result.mutantCount === 0 ? NaN : result.killed / result.mutantCount;

  console.log(
    `${surface.id}: ${String(result.killed)}/${String(result.mutantCount)} ` +
      `score ${score.toFixed(3)} floor ${surface.scoreFloor.toFixed(2)} ` +
      `survivors ${String(result.survivors.length)} passed=${String(gate.passed)}`,
  );
  console.log(
    `  ${String(Math.round(millis / 1000))}s of child wall clock over ${String(boots)} MODELLED boots ` +
      `-> millisPerBoot: ${String(Math.round(millis / boots))}`,
  );
  if (result.survivors.length > 0)
    console.log(`  survivors:\n    ${result.survivors.join("\n    ")}`);
  if (gate.failures.length > 0) console.log(`  gate failures: ${JSON.stringify(gate.failures)}`);
  if (!gate.passed) failed = true;
}
if (failed) process.exit(1);
