// probe/jurisdiction-census.mts
//
// Census for docs/superpowers/specs/ci/2026-08-22-mutation-score-jurisdiction-gap.md §1.0
// and §1.3. Generation-only: enumerates sites and computes shard weights through the
// SHIPPED functions; spawns no child and runs no mutant, so it is not a heavy phase.
//
//   pnpm exec tsx probe/jurisdiction-census.mts
//
// Prints, for `psqlStartupScan`: each operator's file-wide site count and whether it
// reaches either `$((` arm (a per-arm predicate over the arm's statement extent, NOT an
// in-branch count -- the row deleted those as boundary-dependent); the partition today;
// and the partition under the two widenings §1.3 prices. Every number in the spec's
// tables comes from this output.
import { readFileSync } from "node:fs";

import {
  enumerateSites,
  OPERATOR_NAMES,
  type OperatorName,
} from "../tests/mutation/source/operators";
import { GUARD_SURFACES, type GuardSurface } from "../tests/mutation/source/registry";
import {
  SOURCE_SHARD_COUNT,
  sourceShardAssignment,
  weightOf,
} from "../tests/mutation/source/shardPartition";

const SURFACE_ID = "psqlStartupScan";
const ANCHORS = [
  'if (character === "$" && text[i + 1] === "(" && text[i + 2] === "(")',
  'if (text[i] === "$" && text[i + 1] === "(" && text[i + 2] === "(")',
] as const;

const surface = GUARD_SURFACES.find((s) => s.id === SURFACE_ID);
if (surface === undefined) throw new Error(`${SURFACE_ID} is not enrolled`);
const text = readFileSync(surface.sourcePath, "utf8");
const lines = text.split("\n");

/** Statement extent of the arm opened on `start` (1-based): its guard line through the
 *  closing brace at the guard's own indentation. */
function extent(start: number): readonly [number, number] {
  const indent = /^\s*/.exec(lines[start - 1] ?? "")?.[0] ?? "";
  for (let k = start; k < lines.length; k += 1) {
    if (lines[k] === `${indent}}`) return [start, k + 1];
  }
  throw new Error(`no closing brace for the arm at line ${start}`);
}

const arms = ANCHORS.map((anchor) => {
  const occurrences = text.split(anchor).length - 1;
  if (occurrences !== 1) throw new Error(`anchor occurs ${occurrences} times: ${anchor}`);
  const line = lines.findIndex((l) => l.includes(anchor)) + 1;
  return { anchor, extent: extent(line) };
});
console.log("surface", SURFACE_ID, "declared", surface.operators, "floor", surface.scoreFloor);
for (const arm of arms) console.log("arm", arm.extent, arm.anchor);

console.log("\noperator                  declared  file-wide  reaches arm 1  reaches arm 2");
for (const op of OPERATOR_NAMES) {
  const sites = enumerateSites(surface.sourcePath, text, [op]);
  const reaches = (e: readonly [number, number]): boolean =>
    sites.some((s) => s.line >= e[0] && s.line <= e[1]);
  console.log(
    op.padEnd(26),
    String(surface.operators.includes(op)).padEnd(9),
    String(sites.length).padStart(9),
    String(reaches(arms[0]!.extent)).padStart(14),
    String(reaches(arms[1]!.extent)).padStart(14),
  );
}
console.log(
  "declared-set sites",
  enumerateSites(surface.sourcePath, text, surface.operators).length,
);

function partition(surfaces: readonly GuardSurface[], label: string): Map<string, number> {
  const assignment = sourceShardAssignment(surfaces);
  const loads = new Array<number>(SOURCE_SHARD_COUNT).fill(0);
  for (const s of surfaces) loads[assignment.get(s.id)!] += weightOf(s);
  const mine = surfaces.find((s) => s.id === SURFACE_ID)!;
  console.log(
    `\n${label}: surfaces=${surfaces.length} totalBoots=${loads.reduce((a, b) => a + b, 0)} ` +
      `loads=[${loads.join(", ")}] ${SURFACE_ID} weight=${weightOf(mine)} shard=${assignment.get(SURFACE_ID)}`,
  );
  return assignment;
}

const today = partition(GUARD_SURFACES, "today");
const widenings: OperatorName[][] = [
  ["logical-connector"],
  ["logical-connector", "equality-flip", "integer-literal", "statement-removal"],
];
for (const extra of widenings) {
  const hypothetical = GUARD_SURFACES.map((s) =>
    s.id === SURFACE_ID ? { ...s, operators: [...s.operators, ...extra] } : s,
  );
  const after = partition(hypothetical, `widen +${extra.join(",")}`);
  const moved = GUARD_SURFACES.filter((s) => today.get(s.id) !== after.get(s.id)).map((s) => s.id);
  console.log(`  surfaces changing shard: ${moved.length}`);
}
