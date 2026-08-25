// tests/mutation/source/shardPartition.ts
// Deterministic partition of the enrolled source-mutation surfaces
// (spec docs/superpowers/specs/ci/2026-08-16-mutation-gate-wallclock-design.md §3.1).
//
// The PACKING is not ours: `lptAssign` is imported from the parser harness and
// reused as-is. Two implementations of one algorithm drift, and the drift is
// silent -- the copy that missed a tie-break simply partitions differently.
//
// What IS ours is the weight. Weighted by MODELLED CHILD BOOTS, not by mutant
// count and not by mutants*suites: `runAllSuites` short-circuits on the first
// suite that rejects (tests/mutation/source/runner.ts:216-228), so a KILLED
// mutant costs one boot however many suites a surface declares, while a SURVIVOR
// pays every suite. In a green run every survivor is a ledgered `accepted` row,
// because an unaccepted survivor fails the gate.
//
// Pure function of the registry and the sources it names: every shard recomputes
// the identical map on its own runner, so there is NO committed weight table.
import { readFileSync } from "node:fs";

import { type ShardAssignment, lptAssign } from "../../parser/mutation/shardPartition";
import { generateMutants } from "./generate";
import { enumerateSites } from "./operators";
import { GUARD_SURFACES, type GuardSurface } from "./registry";

/** Four: max load is pinned by the heaviest surface from n=4 on (spec §2.4). */
export const SOURCE_SHARD_COUNT = 4;

// Re-exported from its leaf module so every existing importer is untouched. It moved
// because the registry now needs it to bound `millisPerBoot`, and this file imports the
// registry -- see the note in `budget.ts` for why that cycle would have failed silently.
export { SHARD_BUDGET_SECONDS } from "./budget";

/**
 * MODELLED child boots for one surface.
 *
 * Extracted from `weightOf` VERBATIM. The expression is also
 * `sourceShardPartition`'s own control anchor in the guard-surface registry, and
 * `validateSurface` rejects a row whose anchor does not occur exactly once, so
 * reformatting this line breaks enrolment and the failure reads as an unrelated
 * registry error.
 *
 * Separate from `weightOf` because the count and the cost are different questions:
 * the drift report and the seeding emitter both need boots WITHOUT a rate applied,
 * and a caller that wanted the count and got a cost would be wrong by whatever the
 * rate happens to be.
 */
export function bootsOf(surface: GuardSurface): number {
  const text = readFileSync(surface.sourcePath, "utf8");
  const sites = enumerateSites(surface.sourcePath, text, surface.operators);
  const { mutants } = generateMutants(surface.sourcePath, text, surface.operators, sites);
  const suites = surface.suitePaths.length;
  return mutants.length + surface.accepted.length * (suites - 1) + suites;
}

export function weightOf(surface: GuardSurface): number {
  // Milliseconds, not boots. A boot count prices every surface's boot identically,
  // and the measured rates span 935 to 4963 ms per modelled boot -- a 5.3x spread
  // that the count cannot see, so the heaviest leg was being chosen by a number
  // uncorrelated with what the leg actually costs.
  //
  // Integral by construction rather than by rounding: `bootsOf` is a count, and
  // `validateSurface` rejects a non-integer rate, so the product is an integer and
  // `lptAssign`'s documented integer arithmetic stays true. A rounding step here
  // would be dead code, and the gate would eventually say so.
  return bootsOf(surface) * surface.millisPerBoot;
}

export function sourceShardAssignment(
  surfaces: readonly GuardSurface[] = GUARD_SURFACES,
): ShardAssignment {
  return lptAssign(
    surfaces.map((s) => ({ key: s.id, w: weightOf(s) })),
    SOURCE_SHARD_COUNT,
  );
}

/** Throws on an unknown id: a surface that cannot be sharded is corrupt data,
 *  not a row to skip. Skipping would drop it from every shard silently. */
export function shardOfSurface(id: string, assignment: ShardAssignment): number {
  const shard = assignment.get(id);
  if (shard === undefined) {
    throw new Error(`shardOfSurface: surface ${id} is absent from the assignment`);
  }
  return shard;
}

/** The slice a shard file runs. One definition, so a shard file cannot filter
 *  differently from what the gates file proves total. */
export function surfacesForShard(
  shard: number,
  surfaces: readonly GuardSurface[] = GUARD_SURFACES,
): GuardSurface[] {
  const assignment = sourceShardAssignment(surfaces);
  return surfaces.filter((s) => shardOfSurface(s.id, assignment) === shard);
}
