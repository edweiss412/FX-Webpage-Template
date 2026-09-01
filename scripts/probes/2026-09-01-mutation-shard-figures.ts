// scripts/probes/2026-09-01-mutation-shard-figures.ts
//
// Emits every load-bearing figure the mutation-harness-main-schedule plan states.
//
// WHY IT EXISTS. All four findings of that plan's third review round, and six of the
// second round's eleven instances, were ONE defect: a number produced by a probe,
// transcribed into prose, and then wrong or stale. A cost that subtracted a PART from
// a MAKESPAN and so compared nothing. Two rates divided from child totals already
// rounded to whole seconds. A median taken as the fifth of eight values instead of the
// mean of the middle pair. Repairing that class twice did not close it; it closes by
// the numbers not being prose.
//
// THE MEASUREMENTS ARE AN IMMUTABLE ANCHOR, not a live read. `figures-input.json`
// holds what GitHub Actions run 33404224554 measured on main at 47e9544e6, so this
// script answers the same way in a year, when those artifacts have expired. Everything
// else -- boots, mutant counts, the partition -- is computed against the LIVE registry,
// which is what makes a drifted figure show up as a changed line rather than as
// nothing at all.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { SHARD_BUDGET_SECONDS as BUDGET } from "../../tests/mutation/source/budget";
import { generateMutants } from "../../tests/mutation/source/generate";
import { type OperatorName, enumerateSites } from "../../tests/mutation/source/operators";
import { GUARD_SURFACES } from "../../tests/mutation/source/registry";
import { bootsOf } from "../../tests/mutation/source/shardPartition";
import { lptAssign } from "../../tests/parser/mutation/shardPartition";

// The anchor and the gate that licenses it live in their own module so the gate has a
// deciding suite. Three rounds of anchor holes were proved by hand because nothing could
// import this file; tests/mutation/figuresAnchorReconciliation.test.ts imports that one.
import {
  SPLIT_SOURCE,
  SPLIT_SURFACE,
  loadAnchor,
  validateAnchor,
} from "./2026-09-01-mutation-shard-figures-anchor";

const A = loadAnchor();
const text = readFileSync(join(__dirname, "..", "..", SPLIT_SOURCE), "utf8");
validateAnchor(A, text);

// The two candidate splits, as OPERATOR SETS only. Every number about either is derived.
const CANDIDATES: Record<string, Record<string, readonly OperatorName[]>> = {
  family: {
    Rewrites: ["equality-flip", "statement-removal", "regex-quantifier-bound"],
    Boundaries: ["integer-literal", "relational-boundary", "logical-connector"],
  },
  balanced: {
    balA: ["equality-flip", "integer-literal", "regex-quantifier-bound"],
    balB: ["relational-boundary", "logical-connector", "statement-removal"],
  },
};

/** Mean of the middle pair on an even sample, the way lib/mutationWeight/weights.ts does.
 *  Taking the upper middle instead is exactly the error round 3 caught. */
const median = (xs: readonly number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

const legIds = Object.keys(A.legs).sort((a, b) => Number(a) - Number(b));
const overheads = legIds.map((n) => A.legs[n]!.elapsedS - A.legs[n]!.childMs / 1000);
const OV = median(overheads);

console.log(`RUN ${A.runId}`);
console.log(`legs elapsed    ${legIds.map((n) => A.legs[n]!.elapsedS).join(" ")}`);
console.log(
  `legs child s    ${legIds.map((n) => (A.legs[n]!.childMs / 1000).toFixed(0)).join(" ")}`,
);
console.log(
  `overheads       ${[...overheads]
    .sort((a, b) => a - b)
    .map((x) => x.toFixed(3))
    .join(", ")}`,
);
console.log(
  `overhead median ${OV.toFixed(3)} s   (mean of the middle pair of ${overheads.length})`,
);
console.log(
  `total child     ${(Object.values(A.surfaceMs).reduce((a, b) => a + b, 0) / 1000).toFixed(3)} s`,
);
console.log(
  `rate directions ${Object.values(A.rates).filter((r) => r.observedPerBoot > r.declaredAtRun).length} up, ` +
    `${Object.values(A.rates).filter((r) => r.observedPerBoot < r.declaredAtRun).length} down, ` +
    `${Object.values(A.rates).filter((r) => r.observedPerBoot === r.declaredAtRun).length} unchanged, of ${Object.keys(A.rates).length}`,
);

// ---- growth, from the only two points on record --------------------------------
const thisElapsed = legIds.reduce((a, n) => a + A.legs[n]!.elapsedS, 0);
const priorElapsed = A.priorRun.legsElapsedS.reduce((a, b) => a + b, 0);
const days = (Date.parse(A.thisRunDateISO) - Date.parse(A.priorRun.dateISO)) / 86_400_000;
const growthPerDay = (thisElapsed - priorElapsed) / days;

// STRUCTURAL BACKSTOP, deliberately downstream of validateAnchor rather than part of it.
// The checks above name the fields they know about, so each one closes the hole it was
// written for and none of them closes the CLASS: three review rounds in a row found one
// more anchor field whose absence or corruption reached the output as `NaN`, `Infinity`
// or `undefined` and exited 0. This asserts the property those findings actually share --
// that every derived scalar the report rests on is a real number -- so a field nobody has
// thought of yet fails here even when no per-field check names it. It is a net under the
// checks above, never a replacement: it says a figure is unusable, while they say why.
for (const [label, v] of [
  ["overhead median", OV],
  ["this run's elapsed total", thisElapsed],
  ["the prior run's elapsed total", priorElapsed],
  ["the day span between the runs", days],
  ["growth per day", growthPerDay],
] as const) {
  if (!Number.isFinite(v)) {
    throw new Error(
      `${label} computed to ${String(v)}, which is not a usable figure. The anchor passed ` +
        `validateAnchor, so this is a field it does not yet check -- fix the check, do not ` +
        `print the number.`,
    );
  }
}
console.log(
  `growth          ${priorElapsed} s at ${A.priorRun.surfaces} surfaces (${A.priorRun.dateISO}) -> ` +
    `${thisElapsed} s at ${Object.keys(A.surfaceMs).length} (${A.thisRunDateISO}) = ` +
    `${growthPerDay.toFixed(1)} s/day elapsed across the matrix`,
);

const weightsFor = (split: Record<string, readonly OperatorName[]>, announce: boolean) => {
  const out: { key: string; w: number }[] = [];
  let mutantTotal = 0;
  for (const [name, ops] of Object.entries(split)) {
    const sites = enumerateSites(SPLIT_SOURCE, text, ops);
    const { mutants } = generateMutants(SPLIT_SOURCE, text, ops, sites);
    const boots = mutants.length + 1;
    // NO SILENT ZERO. `?? 0` priced a missing measurement at nothing, so deleting any
    // one of the five measured operators from the anchor made this probe report a
    // DIFFERENT makespan -- 2333.122 s instead of 2490.111 -- and exit successfully.
    // A tool whose whole purpose is that figures are derived rather than typed cannot
    // have a path where an absent figure reads as a real one.
    const ms = ops.reduce((a, o) => {
      const v = A.splitSurfaceOperatorMs[o];
      if (typeof v === "number" && Number.isFinite(v)) return a + v;
      // An operator with NO SITES in this file legitimately has no measurement, and
      // zero is its true cost. An operator WITH sites and no measurement is a hole in
      // the anchor, and pricing it at zero silently changes every figure below --
      // deleting `integer-literal` made this probe report N=10 as 2333.122 s instead
      // of 2490.111 and exit successfully. So the zero is DERIVED from the source
      // rather than assumed from the operator's name.
      if (enumerateSites(SPLIT_SOURCE, text, [o]).length === 0) return a;
      throw new Error(
        `anchor has no measurement for operator "${o}", which HAS sites in ${SPLIT_SOURCE}; ` +
          `an absent measurement cannot be priced at zero`,
      );
    }, 0);
    const rate = Math.round(ms / boots);
    mutantTotal += mutants.length;
    out.push({ key: name, w: boots * rate });
    if (announce) {
      console.log(
        `part ${name.padEnd(11)} ops=${ops.join(",")} mutants=${mutants.length} boots=${boots} ms=${ms} rate=${rate}`,
      );
    }
  }
  if (announce) {
    console.log(`mutants summed  ${mutantTotal}   (whole surface: ${A.splitSurfaceOutcomes})`);
  }
  return out;
};

// EVERY id the split touches is excluded, by prefix rather than by exact match: once
// the split lands the registry holds `controlOutlineResidueBoundaries` and
// `controlOutlineResidueRewrites` instead of the original row, and neither is in the
// anchor -- the anchor measured the surface BEFORE it was split. The candidate parts
// below supply their weights. An exact-match filter worked until the split landed and
// then threw on an undefined rate, which is the sort of breakage a probe should not
// have on the day its subject changes.
const base = GUARD_SURFACES.filter((s) => !s.id.startsWith(SPLIT_SURFACE)).map((s) => ({
  key: s.id,
  w: bootsOf(s) * A.rates[s.id]!.observedPerBoot,
}));

for (const [label, split] of Object.entries(CANDIDATES)) {
  const parts = weightsFor(split, label === "family");
  for (const n of [8, 9, 10, 11, 12]) {
    const items = base.concat(parts);
    const assign = lptAssign(items, n);
    const legs = new Array<number>(n).fill(0);
    for (const it of items) legs[assign.get(it.key)!] = (legs[assign.get(it.key)!] ?? 0) + it.w;
    const mk = Math.max(...legs) / 1000;
    const el = mk + OV;
    console.log(
      `${label.padEnd(9)} N=${String(n).padEnd(2)} makespan ${mk.toFixed(3)} s  ` +
        `(${((mk / BUDGET) * 100).toFixed(1)}%)  elapsed ~${el.toFixed(0)} s  headroom ${(BUDGET - el).toFixed(0)} s` +
        `  fuse ~${(((BUDGET - el) * n) / growthPerDay).toFixed(0)} days`,
    );
  }
}
