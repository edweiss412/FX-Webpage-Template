#!/usr/bin/env tsx
/**
 * Companion to line-key-census.mjs for the mutation accepted-survivor ledger.
 *
 * Separate script because it must IMPORT `GUARD_SURFACES` rather than parse it:
 * an earlier regex parse of the same registry undercounted every figure it
 * produced (57 surfaces read as 58, 268 rows as 265, and so on), which is the
 * defect the spec's §4.4 records. The import is the method, and this file is
 * the command that states it.
 */
import { GUARD_SURFACES } from "../tests/mutation/source/registry";

type Row = { siteId: string };
const surfaces = GUARD_SURFACES as unknown as { id: string; accepted?: Row[] }[];

let rows = 0;
let scopedDistinct = 0;
let uniquelyResolvable = 0;
const per: [string, number, number, number][] = [];

for (const s of surfaces) {
  const accepted = s.accepted ?? [];
  if (accepted.length === 0) continue;
  rows += accepted.length;
  const groups = new Map<string, number>();
  for (const r of accepted) {
    const parts = String(r.siteId).split(":");
    // The in-tree limit's prescribed repair: key by operator (KIND) + TEXT.
    const key = `${parts[0]}|${parts.slice(3).join(":")}`;
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  scopedDistinct += groups.size;
  const unique = [...groups.values()].filter((n) => n === 1).length;
  uniquelyResolvable += unique;
  per.push([s.id, accepted.length, groups.size, unique]);
}

console.log(`surfaces=${surfaces.length} surfacesWithRows=${per.length} rows=${rows}`);
console.log(`scopedDistinctKeys=${scopedDistinct} uniquelyResolvableRows=${uniquelyResolvable}`);
console.log(`expressible=${Math.round((100 * uniquelyResolvable) / rows)}%`);
console.log("# NOTE: expressibility is uniquelyResolvableRows/rows, NOT scopedDistinctKeys/rows.");
console.log("# Counting distinct keys keeps one representative per collision group and discards");
console.log("# the rest, which is the silent merge the consequence bound forbids.");
for (const p of per.sort((a, b) => b[1] - a[1]).slice(0, 3))
  console.log(`  ${p[0]}: rows=${p[1]} keys=${p[2]} unique=${p[3]}`);
