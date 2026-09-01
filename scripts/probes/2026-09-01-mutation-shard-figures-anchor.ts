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
  const unmeasured = GUARD_SURFACES.filter((s) => !s.id.startsWith(SPLIT_SURFACE))
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
