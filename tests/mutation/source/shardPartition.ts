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
import { loadAnchor } from "../../../scripts/probes/2026-09-01-mutation-shard-figures-anchor";
import { GUARD_SURFACES, type GuardSurface } from "./registry";

/**
 * Twelve, and the count is a lever for ENROLMENT RUNWAY rather than for makespan.
 *
 * That distinction is the whole of this block, and it has been got backwards twice. This
 * line used to read "Ten, and the count is now FINISHED as a lever" -- a summary that was
 * false about the number and, more expensively, right about the makespan and wrong about
 * what anyone raises the count FOR. The refutation is four paragraphs down; a reader who
 * only sees the first line should not have to reach it to avoid the same conclusion.
 *
 * The history in one line: four was chosen on the premise that max load is pinned by the
 * heaviest surface, enrolment falsified it, and eight restored it. Eight then failed for
 * a different reason -- one surface cost 4,413 s of child time and sat alone on a leg, so
 * LPT had already isolated it and no larger count could move it. That is the state the
 * 2026-08-16 wall-clock design's L-2 predicted, and the way out was making the unit
 * smaller, not the count larger.
 *
 * So `controlOutlineResidue` was split in two (2026-09-01), and at ten the MAKESPAN reaches the
 * floor no count can go below -- the heaviest single remaining part. Eleven and twelve give the
 * same makespan. **A future over-budget leg is therefore NOT a count problem**: it is a surface
 * that outgrew a leg, and the repair is another split or a cheaper deciding suite. That is
 * enforced now rather than remembered: `checkBudget`'s modelled-fit arm names the floor surface
 * and says so.
 *
 * WHAT THE PARAGRAPH ABOVE USED TO CONCLUDE, AND WHY IT WAS WRONG. It said ten was "finished as a
 * lever" because eleven and twelve give the same number. True of the makespan. False of the thing
 * the count is actually for. Once the binding leg holds a SINGLE surface, enrolment growth does
 * not land on it -- LPT gives that leg no company until every other leg reaches the floor -- so
 * the fuse is not headroom-over-growth, it is WHEN THE AVERAGE LEG REACHES THE FLOOR. The count
 * buys exactly that, and `runwayDays` measures it.
 *
 * Twelve is the smallest count carrying `REQUIRED_RUNWAY_DAYS`, at 24.0 days against the
 * recalibrated registry; ten carries 11.7 and eight was already negative on 2026-08-31, which is
 * the night the budget job discovered it by crossing 3600 s.
 *
 * THE RATES ARE NO LONGER WRONG, which this comment used to say they were. All sixty were
 * recalibrated on 2026-09-01 to what GitHub Actions run 33404224554 measured (48 up, 12
 * down). The budget still bounds a leg's whole ELAPSED time rather than its child
 * seconds, so the modelled makespan runs about 205 s under what a leg costs.
 *
 * Every figure above is emitted, not typed:
 * `node --import tsx scripts/probes/2026-09-01-mutation-shard-figures.ts`.
 */
export const SOURCE_SHARD_COUNT = 12;

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
  // Milliseconds, not boots. A boot count prices every surface's boot identically
  // and the measured rates do not agree: at 52 enrolled surfaces they span 762 to
  // 18212 ms per modelled boot, a factor of 23.9, none of which the count can see.
  // So the heaviest leg was being chosen by a number uncorrelated with what the leg
  // actually costs.
  //
  // THOSE TWO NUMBERS ROT, and this comment has already rotted once: it read "935 to
  // 4963 ms per modelled boot -- a 5.3x spread", which was the min and max of the
  // surfaces enrolled the day it was written. Four later enrolments moved the max by
  // 3.7x and nobody moved the sentence, so it understated the very problem it exists
  // to justify. Treat the figures above as dated rather than current, and re-derive:
  //
  //   pnpm tsx -e 'import {GUARD_SURFACES} from "./tests/mutation/source/registry.ts";
  //     const r = GUARD_SURFACES.map((s) => s.millisPerBoot).sort((a, b) => a - b);
  //     console.log(r[0], r.at(-1), (r.at(-1) / r[0]).toFixed(2) + "x");'
  //
  // Integral by construction rather than by rounding: `bootsOf` is a count, and
  // `validateSurface` rejects a non-integer rate, so the product is an integer and
  // `lptAssign`'s documented integer arithmetic stays true. A rounding step here
  // would be dead code, and the gate would eventually say so.
  return bootsOf(surface) * surface.millisPerBoot;
}

/**
 * The per-leg overhead the modelled numbers cannot see, DERIVED from the recalibration block.
 *
 * `weightOf` is child milliseconds; `SHARD_BUDGET_SECONDS` bounds a leg's whole ELAPSED time. The
 * difference is per-leg setup — checkout, install, browser, database — and it is the reason a
 * comparison of the first against the second is short by a constant nobody wrote down. The MEDIAN
 * of the block's ten legs, not the max: one slow leg's setup should not price every other leg's.
 *
 * Measured rather than chosen, and re-derived from the file rather than typed, so a later
 * recalibration moves it without anyone remembering to.
 */
export function medianOverheadSeconds(
  legs: readonly { elapsedS: number; childMs: number }[],
): number {
  if (legs.length === 0) {
    // A block with no legs would otherwise yield a median of NaN or 0, and a zero overhead makes
    // every fit trivially generous — the exact direction a missing figure must not fail in.
    throw new Error("medianOverheadSeconds: no legs to take a median of");
  }
  const deltas = legs.map((l) => l.elapsedS - Math.round(l.childMs / 1000)).sort((a, b) => a - b);
  const mid = Math.floor(deltas.length / 2);
  return deltas.length % 2 === 1 ? deltas[mid]! : Math.round((deltas[mid - 1]! + deltas[mid]!) / 2);
}

/** The committed block's overhead. The DECISION is `medianOverheadSeconds`, which takes its legs
 *  and is therefore pinnable at its boundaries; this is the one-line read of the anchor. */
export function legOverheadSeconds(): number {
  return medianOverheadSeconds(Object.values(loadAnchor().recalibration.legs));
}

/** The heaviest SINGLE surface, in modelled child seconds, and which one it is. No shard count
 *  puts a makespan below this: a surface is indivisible by the partition. */
export function modelledFloor(surfaces: readonly GuardSurface[] = GUARD_SURFACES): {
  seconds: number;
  surface: string;
} {
  if (surfaces.length === 0) {
    // A sentinel `{ seconds: -1 }` stood here, and a NEGATIVE floor satisfies every budget
    // comparison it is handed -- the same direction `medianOverheadSeconds` refuses to fail in.
    // It was also unreachable from any constructed case, so the gate could not tell -1 from -2.
    throw new Error("modelledFloor: no surfaces to take a maximum over");
  }
  const priced = surfaces.map((s) => ({ seconds: weightOf(s) / 1000, surface: s.id }));
  // A TIE keeps the FIRST, and that is observable rather than incidental: the budget failure
  // names this surface, so the operator sent to the wrong one of two equals opens the wrong file.
  return priced.reduce((best, x) => (x.seconds > best.seconds ? x : best));
}

/**
 * Whole-matrix growth, in elapsed seconds per day, DERIVED from the anchor's two committed points.
 *
 * The 2026-08-26 validation run at 52 surfaces and the 2026-08-31 nightly at 60: 22158 s to
 * 24616 s over five days. Both totals and both dates are already in the anchor and already
 * reconciled by its gate, so this is a reading of committed measurements rather than a figure
 * anyone chose.
 */
export function growthPerDay(
  later: { totalS: number; dateISO: string },
  earlier: { totalS: number; dateISO: string },
): number {
  const days = (Date.parse(later.dateISO) - Date.parse(earlier.dateISO)) / 86_400_000;
  if (!(days > 0)) {
    // Equal or absent dates would divide by zero and report infinite runway, which is the one
    // direction a missing figure must not fail in.
    throw new Error("growthPerDay: the two runs carry no positive day gap");
  }
  return (later.totalS - earlier.totalS) / days;
}

/**
 * The block's total elapsed leg seconds.
 *
 * A third DECISION that was living inline in the wrapper below, where nothing constructed could
 * reach it -- the gate found its reduce seed unkillable for exactly that reason, the same shape
 * as the three functions this file already extracted. Taking its legs makes the seed and the
 * accumulator both reachable from a case.
 */
export function totalElapsedSeconds(legs: readonly { elapsedS: number }[]): number {
  return legs.reduce((n, l) => n + l.elapsedS, 0);
}

/** The committed anchor's two points. The DECISION is `growthPerDay`, which takes them. */
export function growthSecondsPerDay(): number {
  const A = loadAnchor();
  return growthPerDay(
    {
      totalS: totalElapsedSeconds(Object.values(A.legs)),
      dateISO: A.thisRunDateISO,
    },
    { totalS: A.priorRun.legsElapsedTotalS, dateISO: A.priorRun.dateISO },
  );
}

/**
 * How many days of enrolment growth the count has left, and it is NOT headroom over growth.
 *
 * WHAT N IS ACTUALLY A LEVER FOR, which this file used to get wrong. Once the binding leg holds a
 * SINGLE surface, the makespan equals that surface and no larger count lowers it -- true, and the
 * reason the old comment called ten "finished as a lever". But enrolment growth does not land on
 * that leg either: LPT gives it no company until every OTHER leg reaches the floor. So the count
 * does not buy makespan, it buys the number of enrolments before the AVERAGE leg reaches the
 * floor, and that is a lever with plenty of travel left.
 *
 * `N * floor - total`, over the derived growth. Negative means the average leg has already passed
 * the floor and the count is behind, which is what N = 8 measured on 2026-08-31.
 */
export function runwayDays(
  count: number = SOURCE_SHARD_COUNT,
  surfaces: readonly GuardSurface[] = GUARD_SURFACES,
): number {
  const total = surfaces.reduce((n, x) => n + weightOf(x), 0) / 1000;
  return (count * modelledFloor(surfaces).seconds - total) / growthSecondsPerDay();
}

/**
 * The runway the count must carry, in days.
 *
 * Three weeks, the low end of the ruled 3-to-4-week range, and the assertion on it is ONE-SIDED:
 * a larger count is permitted, a smaller one is a red. Twelve is the smallest count that satisfies
 * it against the recalibrated registry, at 24.0 days; ten carries 11.7.
 */
export const REQUIRED_RUNWAY_DAYS = 3 * 7;

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
