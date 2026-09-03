// scripts/probes/2026-09-01-mutation-shard-figures-anchor.ts
//
// The measurement anchor and the gate that licenses it, split out of the figures probe
// so the licence has a DECIDING SUITE instead of a hand probe.
//
// Rounds 1, 2 and 3 each closed one hole in this gate by hand, and round 4 found another:
// `observedPerBoot` was validated as positive and finite and then used as the partition
// weight, so deleting one digit from `connectionCensus` (6842 to 684) passed every check
// and reported N=10 elapsed at 2694.859 s while the same assignment at the measured rate
// puts leg 3 at 4348.508 s. Positivity cannot see a wrong number; a reconciliation can.
// The gate was unreachable from a test while it lived inside a CLI-shaped script, which
// is why three rounds of it were proved by hand and the fourth hole survived all three.
// Deciding suite: tests/mutation/figuresAnchorReconciliation.test.ts.
// DOCUMENTED LIMIT, ruled 2026-09-01 by bl-orch on the round-4 escalation: this gate
// reconciles the DECISION-BEARING tables and does not pin the descriptive ones.
//
// Sweeping every single-digit deletion of every numeric leaf OUTSIDE the three
// reconciled tables produces 391 mutants, of which 266 render a figure rather than
// refusing. The consequence was measured, not argued. The 234 in
// `rates.*.declaredAtRun`, `splitSurfaceOutcomes` and `priorRun.surfaces` reach only
// descriptive lines -- the rate-direction count and two parentheticals -- and never
// the partition, the makespan or the budget. The 32 in `legs.*.elapsedS` do reach the
// reported elapsed, through the overhead median, and move family N=10 by at most 6 s
// (2695 to 2689, headroom 905 to 911); ZERO of them cross the 3600 s budget, because
// the overhead is a median of eight legs and one corrupted leg cannot move it far.
// A worst case of a number still honest to within noise is the filing bar's demotion
// shape, so this is a limit rather than a finding, and it is written here on the
// surface that owns it rather than filed as a row.
//
// RE-FILE TRIGGER, two arms, either one sufficient. Re-measure this sweep whenever the
// anchor is regenerated. And any survivor that either moves a candidate family across
// the 3600 s budget or feeds a partition decision is a FINDING, not a limit -- that is
// the consequence the bound forbids, and it comes to the orchestrator before a repair.
//
// SECOND DOCUMENTED LIMIT, ruled 2026-09-01 by bl-orch: THE RATES ARE PROVEN, THE BALANCE IS NOT.
//
// The figures this anchor produces are a prediction, and run 33501574343 measured how good a one.
// The corrected rates are broadly right: predicted total 24944 s against 27097 s measured, within
// 8.6%. What the model does NOT predict is the LPT SPREAD. It expects every leg within 235 s of
// the others and they landed within 1042 s, so the binding leg came in at 3307 s against a
// predicted 2695 s, a factor of 1.227.
//
//   leg     0     1     2     3     4     5     6     7     8     9
//   pred 2695  2538  2462  2468  2464  2468  2467  2461  2461  2460
//   meas 3236  2306  2957  2465  3307  2504  2791  2265  2785  2481
//
// CONSEQUENCE FOR EVERY FIGURE DOWNSTREAM OF `headroom`. Measured headroom against the 3600 s
// budget is 293 s, not the 905 s this probe prints, so the fuse is roughly a third of the printed
// one: about six days, not eighteen. The printed numbers are the MODEL's and must never be quoted
// as measurements. The old model understated the binding leg by 1.77x and that was the defect this
// arc repaired; the corrected model still understates it by 1.227x, which is smaller, real, and
// somebody else's to close.
//
// RE-MEASURE TRIGGER: re-run this comparison against the elapsed-source-shards artifacts of any
// full harness run at a new head. If the binding leg's ratio exceeds the 1.227 measured here, or
// measured headroom falls under 120 s, the balance gap has become a budget breach and is a finding
// rather than a limit. Assigned with B and D to the successor arc, because a six-day fuse with
// nobody holding it is a timer on the next red night.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { GUARD_SURFACES } from "../../tests/mutation/source/registry";

export type Anchor = {
  runId: string;
  /** The commit run `runId` ran on. `bootsAtRun` is that tree's boot count, not today's. */
  runHeadSha: string;
  legs: Record<string, { elapsedS: number; childMs: number }>;
  surfaceMs: Record<string, number>;
  splitSurfaceOperatorMs: Record<string, number>;
  splitSurfaceOutcomes: number;
  rates: Record<string, { declaredAtRun: number; observedPerBoot: number }>;
  /** `bootsOf` for every measured surface, evaluated on the tree at `runHeadSha`. The
   *  third, independently measured number that binds `surfaceMs` to `rates`. */
  bootsAtRun: Record<string, number>;
  splitSourceBlobSha: string;
  /**
   * A LATER full run, measured on its own head, from which the registry's rates are declared.
   *
   * Separate from the body above rather than replacing it: `splitSurfaceOperatorMs` prices
   * `controlOutlineResidue` as ONE registry row, and that row no longer exists as one, so a
   * regenerated anchor would destroy the record that licensed the split. The body is the
   * measurement that motivated a decision; this block is the measurement the rates follow.
   *
   * `rateExcluded` names surfaces this block MEASURED and does not declare from. Recording and
   * excluding are different acts, and omitting them would leave the exclusion invisible.
   */
  recalibration: {
    runId: string;
    runHeadSha: string;
    dateISO: string;
    legs: Record<string, { elapsedS: number; childMs: number }>;
    surfaceMs: Record<string, number>;
    bootsAtRun: Record<string, number>;
    rates: Record<string, { observedPerBoot: number }>;
    rateExcluded: string[];
  };
  priorRun: {
    runId: string;
    surfaces: number;
    legsElapsedS: number[];
    legsElapsedTotalS: number;
    dateISO: string;
  };
  thisRunDateISO: string;
};

export const SPLIT_SURFACE = "controlOutlineResidue";

/**
 * Surfaces enrolled AFTER the anchor run, each with the run that DID measure it.
 *
 * The anchor is a frozen measurement of one run, so a surface enrolled later can
 * never appear in it and no later branch may append to it. The split halves were
 * already exempt for exactly this reason, by a prefix test on their shared id.
 * That test only works because the two of them happen to share a prefix, which is
 * a property of one historical event and not a rule, so a third post-anchor
 * surface had nowhere to go and read as "the anchor cannot price the partition".
 *
 * Naming them individually keeps the exemption auditable: an entry states which
 * run measured that surface, so "we never measured it" and "we measured it
 * elsewhere" stay distinguishable. An id added here without a real run is the
 * failure this list exists to make visible rather than easy.
 */
export const MEASURED_AFTER_ANCHOR: ReadonlyArray<{ id: string; measuredByRun: string }> = [
  // Enrolled by feat/forced-colors-pass, and RE-SCORED after enrolment. The
  // enrolment run read 32/32 at 1472 ms/boot; a later repair added branches to the
  // surface and moved the mutant population to 34, so the declared rate comes from
  // the re-score — 34/34 with zero unaccepted survivors at 1533 ms/boot. Both runs
  // postdate the anchor and neither is part of it.
  { id: "forcedColorsScan", measuredByRun: "re-score at 6f2766520, feat/forced-colors-pass" },
];
export const SPLIT_SOURCE = "tests/styles/controlOutlineResidue.ts";
export const ANCHOR_PATH = join(__dirname, "2026-09-01-mutation-shard-figures-input.json");

export const loadAnchor = (): Anchor => JSON.parse(readFileSync(ANCHOR_PATH, "utf8")) as Anchor;

/**
 * The anchor must describe the tree it is being applied to, and it must be WHOLE.
 *
 * WHY THIS IS A GATE AND NOT A HANDFUL OF GUARDS. The first draft checked one thing --
 * that an operator's milliseconds were present and finite -- and a review swept the
 * omission class around it: deleting leg 0 dropped a 4,624 s leg and still reported the
 * partition within budget; deleting one `surfaceMs` row printed 59 surfaces beside a
 * 60-row rate table; deleting a prior-run leg moved 22,158 s to 18,993 and roughly
 * halved every fuse; and a measured cost of zero or below passed the finite check and
 * underpriced Boundaries by half. Every one of those exited 0. A probe whose purpose is
 * that figures are derived rather than typed cannot have a path where a MISSING figure
 * reads as a real one, so the anchor is judged once, as a whole, before a figure exists.
 *
 * The two totals are the load-bearing part and neither is a checksum I invented. Every
 * surface ran on exactly one leg, so the legs' child milliseconds and the per-surface
 * milliseconds are two independent measurements of one quantity; requiring them equal
 * catches a deletion from EITHER table, which no per-table count can do. The blob sha
 * does the same job across time: `splitSurfaceOperatorMs` prices operators against one
 * exact text, so against a different text those milliseconds answer a question nobody
 * asked -- which is how a moved mutation site was repriced silently instead of refused.
 */
export function anchorProblems(A: Anchor, text: string): string[] {
  const bad: string[] = [];
  /**
   * A leg's ELAPSED time contains its CHILD time, so elapsed can never be less.
   *
   * Positivity alone accepted a dropped digit in either table, and both are now read by gates:
   * the body's elapsed feeds `growthSecondsPerDay` (2912 -> 912 moved growth from 491.6 to 91.6
   * s/day and inflated every runway fivefold) and the block's feeds `legOverheadSeconds` (3236 ->
   * 236 moved the median overhead 195 -> 185). Measured by whole-diff round 4 as ordinary
   * dropped-digit transcription errors, which is squarely inside the threat fence.
   *
   * The bound is physical rather than chosen: the children ran inside the leg, serially, so
   * `elapsedS >= childMs / 1000` for any honest pair, with the difference being setup.
   */
  const elapsedCoversChild = (label: string, elapsedS: unknown, childMs: unknown) => {
    if (typeof elapsedS !== "number" || typeof childMs !== "number") return;
    if (!Number.isFinite(elapsedS) || !Number.isFinite(childMs)) return;
    if (elapsedS < childMs / 1000) {
      bad.push(
        `${label} reports ${elapsedS}s elapsed but ${childMs}ms of child time (${(
          childMs / 1000
        ).toFixed(1)}s); a leg cannot finish before the children it ran`,
      );
    }
  };

  const positive = (label: string, v: unknown) => {
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) {
      bad.push(`${label} is ${JSON.stringify(v)}; a measurement must be a positive finite number`);
      return false;
    }
    return true;
  };

  if (!/^\d+$/.test(A.runId)) bad.push(`runId ${JSON.stringify(A.runId)} is not a run id`);

  // Legs are a CONTIGUOUS matrix from 0, so a hole is a dropped leg rather than a
  // shorter matrix. Deleting leg 0 is the case that reported negative growth.
  const legIdx = Object.keys(A.legs)
    .map(Number)
    .sort((x, y) => x - y);
  const contiguous = legIdx.every((n, i) => n === i);
  if (legIdx.length === 0 || !contiguous) {
    bad.push(`legs are [${legIdx.join(", ")}], not a contiguous matrix 0..n-1`);
  }
  for (const [n, leg] of Object.entries(A.legs)) {
    positive(`legs[${n}].elapsedS`, leg?.elapsedS);
    positive(`legs[${n}].childMs`, leg?.childMs);
    elapsedCoversChild(`legs[${n}]`, leg?.elapsedS, leg?.childMs);
  }

  const surfaceIds = Object.keys(A.surfaceMs).sort();
  const rateIds = Object.keys(A.rates).sort();
  if (surfaceIds.join("\u0000") !== rateIds.join("\u0000")) {
    const only = (xs: string[], ys: string[]) => xs.filter((x) => !ys.includes(x));
    bad.push(
      `surfaceMs and rates describe different surfaces: ` +
        `only in surfaceMs [${only(surfaceIds, rateIds).join(", ")}], ` +
        `only in rates [${only(rateIds, surfaceIds).join(", ")}]`,
    );
  }
  for (const id of surfaceIds) positive(`surfaceMs.${id}`, A.surfaceMs[id]);
  for (const id of rateIds) {
    positive(`rates.${id}.declaredAtRun`, A.rates[id]?.declaredAtRun);
    positive(`rates.${id}.observedPerBoot`, A.rates[id]?.observedPerBoot);
  }

  // The cross-check. Two tables, one quantity, measured independently.
  const legChild = Object.values(A.legs).reduce((a, l) => a + (l?.childMs ?? 0), 0);
  const surfChild = Object.values(A.surfaceMs).reduce((a, b) => a + (b ?? 0), 0);
  if (legChild !== surfChild) {
    bad.push(
      `the legs' child milliseconds total ${legChild} but the per-surface table totals ` +
        `${surfChild}; every surface ran on exactly one leg, so a difference means one ` +
        `table lost a row`,
    );
  }

  // Operator costs: present values must be real costs. Zero passed the finite check and
  // halved the split's price. Absence stays legitimate ONLY where the operator has no
  // sites, which weightsFor derives from the source rather than assuming.
  for (const [op, ms] of Object.entries(A.splitSurfaceOperatorMs)) {
    positive(`splitSurfaceOperatorMs.${op}`, ms);
  }
  positive("splitSurfaceOutcomes", A.splitSurfaceOutcomes);

  // THE PARTITION INVARIANT, and it is the one that makes a WRONG cost visible rather
  // than merely a missing one. Positivity accepts any plausible number: changing
  // `integer-literal` from 1269906 to 269906 kept every per-field check happy and moved
  // family N=10 from 2490.111 s to 2333.122 s -- a figure that is wrong and looks right,
  // which is the exact outcome the consequence bound forbids. The operators PARTITION the
  // surface's measured time, so their costs must sum to what the per-surface table
  // independently recorded for it. Two tables again, one quantity, and a single digit
  // edited in either is now a mismatch rather than a plausible answer.
  const opSum = Object.values(A.splitSurfaceOperatorMs).reduce((a, b) => a + (b ?? 0), 0);
  const surfaceTotal = A.surfaceMs[SPLIT_SURFACE];
  if (opSum !== surfaceTotal) {
    bad.push(
      `the split surface's per-operator costs sum to ${opSum} but the per-surface table ` +
        `records ${surfaceTotal} for ${SPLIT_SURFACE}; the operators partition that time, so ` +
        `a difference means one of the two was edited`,
    );
  }

  // The text the operator costs were measured against.
  const blob = createHash("sha1")
    .update(`blob ${Buffer.byteLength(text)}\u0000`)
    .update(text)
    .digest("hex");
  if (blob !== A.splitSourceBlobSha) {
    bad.push(
      `${SPLIT_SOURCE} is blob ${blob} but the anchor measured ${A.splitSourceBlobSha}; ` +
        `splitSurfaceOperatorMs prices operators against that exact text, so this run would ` +
        `reprice a source nobody measured. Re-measure, or state the figures from a run on ` +
        `this text.`,
    );
  }

  // THE RECALIBRATION BLOCK, judged on the SAME footing and by the same shapes. It is the block
  // the registry's declared rates come from, so a hole here is a rate nobody measured, which is
  // exactly the defect the body above is judged whole to prevent -- and a validator that knew only
  // about tables written before it was added would return clean for an invalid block. Measured
  // 2026-09-01: it did.
  const R = A.recalibration;
  if (!/^\d+$/.test(R.runId))
    bad.push(`recalibration.runId ${JSON.stringify(R.runId)} is not a run id`);
  if (!/^[0-9a-f]{40}$/.test(R.runHeadSha)) {
    bad.push(`recalibration.runHeadSha ${JSON.stringify(R.runHeadSha)} is not a commit sha`);
  }
  // A DIFFERENT, LATER run than the body, not merely a well-formed identity.
  //
  // Whole-diff review round 1 probed this: relabelling the block with the body's own runId, or
  // with its runHeadSha, passed every check while the block claimed `psqlStartupScan` at 25952
  // ms/boot and the body records the same run measuring 16462. Syntax cannot see a figure
  // attributed to a run that demonstrably measured something else, and the declared-rate checks
  // cannot either, since they read the block alone.
  // LATER THAN EVERY RUN THE ANCHOR NAMES, derived rather than enumerated.
  //
  // An earlier version of this check rejected the body's exact runId and head sha, and whole-diff
  // round 2 walked straight past it by relabelling the block with the anchor's PRIOR run
  // (32958581720) instead. Two equality checks close two relabels; a run id must simply be the
  // largest the file names, which closes the class -- GitHub's run ids are monotonic, so a later
  // run always carries a larger one, and every id the anchor already holds is a lower bound.
  const otherRunIds = [A.runId, A.priorRun.runId];
  for (const other of otherRunIds) {
    if (!/^\d+$/.test(other)) continue;
    if (BigInt(R.runId) <= BigInt(other)) {
      bad.push(
        `recalibration.runId ${R.runId} is not later than ${other}, which this anchor also ` +
          `names; the recalibration is the NEWEST measurement, and a block relabelled with an ` +
          `earlier run's identity claims figures that run did not produce`,
      );
    }
  }
  if (R.runHeadSha === A.runHeadSha) {
    bad.push(
      `recalibration.runHeadSha is the body's own head; the two runs ran on different trees, and ` +
        `bootsAtRun is evaluated on the block's tree rather than the body's`,
    );
  }
  // DOCUMENTED LIMIT: PROVENANCE IS BOUNDED, AND THIS IS WHERE IT STOPS.
  //
  // These checks answer "is this identity plausible for a later run", never "is this identity the
  // run that produced these tables". They catch what an ordinary contributor gets wrong -- the
  // body's identity copied by mistake, an earlier run's, a malformed sha, a date out of order --
  // and they cannot catch a deliberate relabel. Whole-diff round 3 demonstrated both remaining
  // shapes with single-field edits: `runId` one higher than the real one, and `runHeadSha` set to
  // another commit that genuinely exists.
  //
  // Neither is closable from inside this file, and widening again would not help. The anchor's
  // own contents cannot witness which run produced them; only GitHub can, and this function is
  // pure and offline by design so that it runs where the suite runs. The real closure is a
  // network check of the declared runId's head sha against the Actions API, which belongs to
  // whatever process regenerates the block rather than to the gate that reads it.
  //
  // That places it OUTSIDE this arc's stated threat fence -- ordinary contributor error, not an
  // author constructing an anchor to deceive -- so it is written here, on the surface that owns
  // it, rather than chased one edit at a time. RE-FILE TRIGGER: a recalibration block whose
  // figures are found to disagree with the run it names, on any real run.
  //
  // The sha's EXISTENCE, separately, is checkable and is checked -- in the deciding suite, which
  // can ask git: see the "names a commit that exists" case in
  // tests/mutation/figuresAnchorReconciliation.test.ts. Round 2 demonstrated that gap with a
  // one-character typo. Splitting it that way is deliberate rather than a shortfall.
  const bodyDate = Date.parse(A.thisRunDateISO);
  const blockDate = Date.parse(R.dateISO);
  if (!Number.isFinite(blockDate)) {
    bad.push(`recalibration.dateISO ${JSON.stringify(R.dateISO)} is not a date`);
  } else if (Number.isFinite(bodyDate) && blockDate < bodyDate) {
    bad.push(
      `recalibration.dateISO ${R.dateISO} is BEFORE the body's ${A.thisRunDateISO}; the ` +
        `recalibration is the newer measurement, and declaring rates from the older one silently ` +
        `undoes it`,
    );
  }
  const rLegIdx = Object.keys(R.legs)
    .map(Number)
    .sort((x, y) => x - y);
  if (rLegIdx.length === 0 || !rLegIdx.every((n, i) => n === i)) {
    bad.push(`recalibration legs are [${rLegIdx.join(", ")}], not a contiguous matrix 0..n-1`);
  }
  for (const [n, leg] of Object.entries(R.legs)) {
    positive(`recalibration.legs[${n}].elapsedS`, leg?.elapsedS);
    positive(`recalibration.legs[${n}].childMs`, leg?.childMs);
    elapsedCoversChild(`recalibration.legs[${n}]`, leg?.elapsedS, leg?.childMs);
  }
  const rSurfaceIds = Object.keys(R.surfaceMs).sort();
  for (const [label, table] of [
    ["rates", Object.keys(R.rates).sort()],
    ["bootsAtRun", Object.keys(R.bootsAtRun).sort()],
  ] as const) {
    if (table.join("\u0000") !== rSurfaceIds.join("\u0000")) {
      bad.push(`recalibration.${label} describes different surfaces from recalibration.surfaceMs`);
    }
  }
  for (const id of rSurfaceIds) {
    positive(`recalibration.surfaceMs.${id}`, R.surfaceMs[id]);
    positive(`recalibration.bootsAtRun.${id}`, R.bootsAtRun[id]);
    positive(`recalibration.rates.${id}.observedPerBoot`, R.rates[id]?.observedPerBoot);
  }
  // The same two-tables-one-quantity cross-check the body gets: every surface ran on exactly one
  // leg, so a difference means one table lost a row.
  const rLegChild = Object.values(R.legs).reduce((a, l) => a + (l?.childMs ?? 0), 0);
  const rSurfChild = Object.values(R.surfaceMs).reduce((a, b) => a + (b ?? 0), 0);
  if (rLegChild !== rSurfChild) {
    bad.push(
      `recalibration legs total ${rLegChild} child ms but the per-surface table totals ` +
        `${rSurfChild}; every surface ran on exactly one leg`,
    );
  }
  // THE RATE RELATION, and it ROUNDS. `observedPerBoot` is an integer and `surfaceMs` is a
  // measurement, so an exact product rejects ordinary rounding: 56 of the body's own 60 rows fail
  // it. This is the relation the anchor already satisfies, stated so the block cannot drift into a
  // rate nobody derived.
  for (const id of rSurfaceIds) {
    const b = R.bootsAtRun[id];
    const ms = R.surfaceMs[id];
    const rate = R.rates[id]?.observedPerBoot;
    if (b === undefined || ms === undefined || rate === undefined || b <= 0) continue;
    if (rate !== Math.round(ms / b)) {
      bad.push(
        `recalibration.rates.${id} declares ${rate} ms/boot, but ${ms} ms over ${b} boots ` +
          `rounds to ${Math.round(ms / b)}`,
      );
    }
  }
  for (const id of R.rateExcluded) {
    if (R.rates[id] === undefined) {
      bad.push(
        `recalibration.rateExcluded names ${id}, which the block does not measure; excluding a ` +
          `surface means RECORDING it and not declaring from it, so an unmeasured id is a typo`,
      );
    }
  }

  const priorSum = A.priorRun.legsElapsedS.reduce((a, b) => a + b, 0);
  if (A.priorRun.legsElapsedS.length === 0 || priorSum !== A.priorRun.legsElapsedTotalS) {
    bad.push(
      `priorRun legs sum to ${priorSum} but the run declares ${A.priorRun.legsElapsedTotalS}`,
    );
  }
  for (const [i, s] of A.priorRun.legsElapsedS.entries())
    positive(`priorRun.legsElapsedS[${i}]`, s);
  positive("priorRun.surfaces", A.priorRun.surfaces);

  // The growth line divides by the gap between these two dates. An absent date makes that
  // gap NaN, and equal dates make it zero -- which prints `Infinity s/day` and a zero-day
  // fuse, a figure that is not merely wrong but reads as an emergency. Both are ordinary
  // one-edit mutations of the committed anchor, so both are refused rather than rendered.
  const priorAt = Date.parse(A.priorRun.dateISO ?? "");
  const thisAt = Date.parse(A.thisRunDateISO ?? "");
  if (!Number.isFinite(priorAt) || !Number.isFinite(thisAt)) {
    bad.push(
      `the run dates do not both parse (priorRun.dateISO ${JSON.stringify(A.priorRun.dateISO)}, ` +
        `thisRunDateISO ${JSON.stringify(A.thisRunDateISO)}); the growth figure is measured ` +
        `between them`,
    );
  } else if (!(thisAt > priorAt)) {
    bad.push(
      `thisRunDateISO ${A.thisRunDateISO} is not strictly after priorRun.dateISO ` +
        `${A.priorRun.dateISO}; growth per day over a zero or negative span is not a rate`,
    );
  }

  // Every live surface the split did not create must have a measurement. Without this the
  // `!` below turns a newly enrolled surface into a crash on an undefined rate.
  const exemptAfterAnchor = new Set(MEASURED_AFTER_ANCHOR.map((e) => e.id));
  const unmeasured = GUARD_SURFACES.filter(
    (s) => !s.id.startsWith(SPLIT_SURFACE) && !exemptAfterAnchor.has(s.id),
  )
    .filter((s) => A.rates[s.id] === undefined)
    .map((s) => s.id);
  if (unmeasured.length > 0) {
    bad.push(
      `the live registry enrols [${unmeasured.join(", ")}], which run ${A.runId} never ` +
        `measured; this anchor cannot price today's partition`,
    );
  }

  // CONDITION SEVEN, and the one that makes a wrong RATE visible rather than only a
  // missing or negative one. `observedPerBoot` prices the entire partition, and every
  // check above accepted any plausible positive number for it: 6842 and 684 were equally
  // welcome, and the second reported the partition inside budget while a real leg ran at
  // 4348.508 s. The rate and the per-surface milliseconds are two measurements of one
  // run related by that run's boot count, so the anchor records the count too -- taken
  // from the tree at `runHeadSha`, which is independent of both tables. Recovering it as
  // `surfaceMs / observedPerBoot` instead would be circular and very nearly vacuous,
  // because for almost any mutated rate v there is an integer b with round(ms/b) === v.
  //
  // The count is the RUN's, deliberately, not today's `bootsOf`: the boot count moves
  // with the source, which is how `controlOutlineScan` (66 boots at 47e9544e6, 64 today)
  // put 5.8 s between two earlier corpus totals. Dividing today's count into that run's
  // milliseconds answers a question the run never asked.
  if (!/^[0-9a-f]{40}$/.test(A.runHeadSha ?? "")) {
    bad.push(
      `runHeadSha ${JSON.stringify(A.runHeadSha)} is not a commit sha; bootsAtRun is a ` +
        `property of one tree and is meaningless without naming it`,
    );
  }
  const bootIds = Object.keys(A.bootsAtRun ?? {}).sort();
  if (bootIds.join("\u0000") !== rateIds.join("\u0000")) {
    const only = (xs: string[], ys: string[]) => xs.filter((x) => !ys.includes(x));
    bad.push(
      `bootsAtRun and rates describe different surfaces: ` +
        `only in bootsAtRun [${only(bootIds, rateIds).join(", ")}], ` +
        `only in rates [${only(rateIds, bootIds).join(", ")}]`,
    );
  }
  for (const id of bootIds) {
    const boots = A.bootsAtRun[id];
    if (!positive(`bootsAtRun.${id}`, boots) || !Number.isInteger(boots)) {
      if (Number.isFinite(boots) && !Number.isInteger(boots)) {
        bad.push(`bootsAtRun.${id} is ${boots}; a boot count is an integer`);
      }
      continue;
    }
    const ms = A.surfaceMs[id];
    const rate = A.rates[id]?.observedPerBoot;
    if (typeof ms !== "number" || typeof rate !== "number") continue;
    const derived = Math.round(ms / boots!);
    if (derived !== rate) {
      bad.push(
        `${id} does not reconcile: ${ms} ms over ${boots} boots is ${derived} ms per boot, ` +
          `but the anchor records ${rate}; the two tables measured one run, so a ` +
          `difference means one of them was edited`,
      );
    }
  }

  return bad;
}

export function validateAnchor(A: Anchor, text: string): void {
  const bad = anchorProblems(A, text);
  if (bad.length > 0) {
    throw new Error(
      `the measurement anchor cannot be used as it stands:\n` +
        bad.map((m) => `  - ${m}\n`).join(""),
    );
  }
}
