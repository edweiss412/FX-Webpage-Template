import { relative } from "node:path";

import { BaseSequencer } from "vitest/node";
import type { TestSpecification } from "vitest/node";

import { DEFAULT_WEIGHT, FILE_WEIGHTS } from "./lib/test/vitest.weights";

// LPT (longest-processing-time) greedy bin-packing, generic over the item type.
// Pure + exported so the balance meta-test can exercise the real algorithm.
// Operates on the ITEMS directly (never collapses by key) so it is a clean cover
// even if two items share a tieKey. `tieKey` gives a total order on equal weights
// → deterministic across the two separate CI runners.
export function lptShard<T>(
  items: T[],
  count: number,
  weigh: (item: T) => number,
  tieKey: (item: T) => string,
): T[][] {
  const sorted = [...items].sort((a, b) => {
    const dw = weigh(b) - weigh(a);
    if (dw !== 0) return dw;
    const ka = tieKey(a);
    const kb = tieKey(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
  const bins = Array.from({ length: Math.max(1, count) }, () => ({
    load: 0,
    items: [] as T[],
  }));
  for (const item of sorted) {
    // place into the currently-lightest bin (iterate bin objects, not indices,
    // to stay clean under noUncheckedIndexedAccess)
    let target = bins[0]!;
    for (const bin of bins) if (bin.load < target.load) target = bin;
    target.load += weigh(item);
    target.items.push(item);
  }
  return bins.map((b) => b.items);
}

// Repo-relative, forward-slashed key for FILE_WEIGHTS lookup + the LPT tie-break.
function specKey(spec: TestSpecification, root: string): string {
  return relative(root, spec.moduleId).split("\\").join("/");
}

export class WeightBalancedSequencer extends BaseSequencer {
  // shard() is called ONLY when --shard is set (vitest gates it on
  // config.shard), once, with the union of specs across both projects.
  override async shard(specs: TestSpecification[]): Promise<TestSpecification[]> {
    const shard = this.ctx.config.shard;
    if (!shard) return specs; // unreachable (vitest gates shard() on config.shard); satisfies tsc
    const { index, count } = shard; // index 1-based
    const root = this.ctx.config.root;
    const bins = lptShard(
      specs,
      count,
      (s) => FILE_WEIGHTS[specKey(s, root)] ?? DEFAULT_WEIGHT,
      (s) => specKey(s, root),
    );
    return bins[index - 1] ?? [];
  }
  // sort() inherited from BaseSequencer → project grouping + fileParallelism:false untouched.
}
