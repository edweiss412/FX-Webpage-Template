/**
 * Probe 5 (spec §2, added after spec review round 1): the report's trigger rate
 * under both accounting units.
 *
 * `triggerRateByMonth` buckets a `(branch, baseSha, stage)` pair by its first
 * counted row's month and calls it triggered when that ONE base file reaches
 * the threshold. Under the arc sum the population is `(branch directory, stage)`
 * and the test is the sum, so both the numerator and the denominator move. The
 * published rate therefore changes for a reason that is not a behavior change,
 * which is why the spec makes the report say so.
 */
import { ROUND_THRESHOLD, readBranchDirs, repoRoot, type CountedStage } from "./shared";

const dirs = readBranchDirs(repoRoot());

type Bucket = { population: number; triggered: number };
const perBase = new Map<string, Bucket>();
const perArc = new Map<string, Bucket>();

function bump(map: Map<string, Bucket>, month: string, triggered: boolean): void {
  const b = map.get(month) ?? { population: 0, triggered: 0 };
  b.population += 1;
  if (triggered) b.triggered += 1;
  map.set(month, b);
}

for (const dir of dirs) {
  // --- per base, the shipped unit -------------------------------------------
  for (const arc of dir.arcs) {
    const byStage = new Map<CountedStage, { rounds: Set<number>; first: string }>();
    for (const row of arc.rows) {
      if (row.status !== "verdict") continue;
      const stage = row.stage as CountedStage;
      if (!dir.arcPairs.has(stage)) continue;
      const seen = byStage.get(stage);
      const started = row.startedAt ?? "";
      if (seen === undefined) byStage.set(stage, { rounds: new Set([row.round]), first: started });
      else {
        seen.rounds.add(row.round);
        if (started !== "" && (seen.first === "" || started < seen.first)) seen.first = started;
      }
    }
    for (const [, v] of byStage) {
      bump(perBase, v.first.slice(0, 7), v.rounds.size >= ROUND_THRESHOLD);
    }
  }

  // --- per branch directory, the arc sum ------------------------------------
  for (const [stage, pairs] of dir.arcPairs) {
    let first = "";
    for (const arc of dir.arcs) {
      for (const row of arc.rows) {
        if (row.status !== "verdict" || row.stage !== stage) continue;
        const started = row.startedAt ?? "";
        if (started !== "" && (first === "" || started < first)) first = started;
      }
    }
    bump(perArc, first.slice(0, 7), pairs.size >= ROUND_THRESHOLD);
  }
}

function total(map: Map<string, Bucket>): Bucket {
  const out = { population: 0, triggered: 0 };
  for (const b of map.values()) {
    out.population += b.population;
    out.triggered += b.triggered;
  }
  return out;
}

const base = total(perBase);
const arc = total(perArc);
const pct = (b: Bucket): string => ((b.triggered / b.population) * 100).toFixed(1);

console.log(
  `per-base   (branch, baseSha, stage): ${base.triggered}/${base.population}  ${pct(base)}%`,
);
console.log(
  `per-arc    (branch directory, stage): ${arc.triggered}/${arc.population}  ${pct(arc)}%`,
);
console.log("");
console.log("per month, per-arc unit:");
for (const [month, b] of [...perArc].sort()) {
  console.log(
    `  ${month}  ${b.triggered}/${b.population}  ${((b.triggered / b.population) * 100).toFixed(1)}%`,
  );
}
