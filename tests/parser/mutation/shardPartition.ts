// tests/parser/mutation/shardPartition.ts
// Deterministic LPT shard partition for the mutation-harness corpus (sharding spec §3.1).
// Weighted, not hashed: measured djb2 % 8 left the heaviest shard at 1.65× mean
// (21,012 mutants) because pair weights are heavy-tailed; LPT over runtime
// generation counts measures max/mean 1.000 (12,721–12,729). Pure function of the
// committed fixtures + operators — every consumer recomputes the identical map, so
// there is NO committed weight table to go stale (the class this arc repairs).
import { boundedMutants, OPERATOR_NAMES } from "./operators";
import { FIXTURES, readFixture } from "./fixtures";

export const SHARD_COUNT = 8;
export type ShardAssignment = ReadonlyMap<string, number>; // pairKey → shard index

export const pairKey = (op: string, slug: string): string => `${op}:${slug}`;

/** Deterministic LPT: sort by (weight desc, key asc), assign each pair to the
 *  currently-least-loaded shard (tie → lowest index). Integer arithmetic +
 *  lexicographic ties only — platform-independent. */
export function lptAssign(
  weights: readonly { key: string; w: number }[],
  shardCount: number,
): ShardAssignment {
  const sorted = [...weights].sort((a, b) => b.w - a.w || (a.key < b.key ? -1 : 1));
  const loads = new Array<number>(shardCount).fill(0);
  const assign = new Map<string, number>();
  for (const p of sorted) {
    let best = 0;
    for (let i = 1; i < shardCount; i++) if (loads[i]! < loads[best]!) best = i;
    assign.set(p.key, best);
    loads[best] = loads[best]! + p.w;
  }
  return assign;
}

/** Weigh every OPERATOR_NAMES × FIXTURES pair by generated mutant count (streamed,
 *  generation only — NO parse; ~18 s for the full 153-pair corpus) and LPT-pack
 *  into SHARD_COUNT shards. */
export function computeShardAssignment(): ShardAssignment {
  const weights: { key: string; w: number }[] = [];
  for (const f of FIXTURES) {
    const md = readFixture(f);
    for (const op of OPERATOR_NAMES) {
      let n = 0;
      for (const _ of boundedMutants(op, md)) n++;
      weights.push({ key: pairKey(op, f.slug), w: n });
    }
  }
  return lptAssign(weights, SHARD_COUNT);
}

/** Resolve a siteId's shard under an assignment. siteIds are
 *  "<op>:<slug>:B..:L..:X.." and <op> itself may contain a colon
 *  ("blank-row:inject"), so the op CANNOT be recovered by naive split(":"). A pair
 *  key "<op>:<slug>" is itself a prefix of every siteId that pair produced
 *  ("<op>:<slug>:B…"), so the LONGEST assignment-key prefix (with a ":" terminator,
 *  which also makes slug prefix-collisions impossible — slugs contain no colons) IS
 *  the (op, slug) resolution, preferring "blank-row:inject:east-coast" over any
 *  shorter sibling key (same longest-prefix discipline as findingFor,
 *  tests/parser/mutation/knownHoles.ts:48-51). Throws on an unresolvable operator
 *  prefix or a pair missing from the assignment — a ledger row that can't be
 *  sharded is corrupt data, not a skippable row. */
export function shardOfSiteId(siteId: string, assignment: ShardAssignment): number {
  const matches = [...assignment.keys()]
    .filter((k) => siteId.startsWith(k + ":"))
    .sort((a, b) => b.length - a.length);
  const best = matches[0];
  if (best === undefined) {
    // Distinguish the two failure modes for a precise error: does ANY known
    // operator (derived from pair keys by stripping the slug segment) prefix this
    // siteId?
    const opMatch = [...new Set([...assignment.keys()].map((k) => k.slice(0, k.lastIndexOf(":"))))]
      .filter((op) => siteId.startsWith(op + ":"))
      .sort((a, b) => b.length - a.length)[0];
    if (opMatch === undefined) {
      throw new Error(`shardOfSiteId: no operator prefix matches siteId ${siteId}`);
    }
    throw new Error(`shardOfSiteId: pair for siteId ${siteId} is absent from the assignment`);
  }
  return assignment.get(best)!;
}
