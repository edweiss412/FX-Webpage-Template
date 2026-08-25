/**
 * The suites' door to the AC coverage view.
 *
 * A thin re-export plus a parse convenience, NOT a second builder: the adapter
 * and the suites call the same `blocksFrom`, so they cannot drift about what a
 * view is (spec §8.3).
 */
import { remark } from "remark";
import remarkGfm from "remark-gfm";

import type { AcBlocks } from "../../lib/specLint/types";
import { blocksFrom } from "../../scripts/lib/acCoverageBlocks";

const parser = remark().use(remarkGfm);

export { blocksFrom };

/** Parse markdown into the injected view. */
export function viewOf(text: string): AcBlocks {
  return blocksFrom(parser.parse(text));
}
