/**
 * Scoped score for the two BL-ADMIN-LOADER-CI-TRANSIENT surfaces.
 *
 * Runs the GATE'S OWN code path (runSurface + evaluateGate) over just these two rows, so the
 * fleet-wide heavy slot is held for minutes rather than a full-registry run. This produces the
 * numbers for the round-1 GUARD SURFACE: lines. It does NOT establish that the whole gate is
 * green — a scoped substitute cannot make that claim, and the PR's own mutation-harness job is
 * what settles it.
 */
import { GUARD_SURFACES } from "../tests/mutation/source/registry";
import { runSurface } from "../tests/mutation/source/runner";
import { evaluateGate } from "../tests/mutation/source/gate";

const WANTED = new Set(["supabaseRetryingFetch", "retryableRpcVolatilityScan"]);
const root = process.cwd();

for (const surface of GUARD_SURFACES.filter((s) => WANTED.has(s.id))) {
  const started = Date.now();
  const run = runSurface(root, surface);
  const gate = evaluateGate({
    surfaceId: run.surfaceId,
    mutantCount: run.mutantCount,
    noOps: run.noOps,
    baselineGreen: run.baselineGreen,
    killed: run.killed,
    survivors: run.survivors,
    ledger: surface.accepted,
    scoreFloor: surface.scoreFloor,
    outcomes: run.outcomes,
  });
  console.log("=".repeat(72));
  console.log(`surface        ${run.surfaceId}`);
  console.log(`sourcePath     ${surface.sourcePath}`);
  console.log(`operators      ${surface.operators.join(", ")}`);
  console.log(`baselineGreen  ${run.baselineGreen}`);
  console.log(`mutants        ${run.mutantCount}   noOps ${run.noOps.length}`);
  console.log(`SCORE          ${run.killed}/${run.mutantCount}`);
  console.log(`survivors      ${run.survivors.length}`);
  for (const s of run.survivors) console.log(`   SURVIVOR  ${s}`);
  console.log(`gate.passed    ${gate.passed}`);
  for (const f of gate.failures) console.log(`   FAIL  ${f.condition}: ${f.detail}`);
  for (const n of gate.notices) console.log(`   NOTE  ${JSON.stringify(n)}`);
  console.log(`elapsed        ${Math.round((Date.now() - started) / 1000)}s`);
}
