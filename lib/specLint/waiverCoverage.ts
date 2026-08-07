/**
 * lib/specLint/waiverCoverage.ts — waiver TARGETING and fence COVERAGE, one
 * definition each.
 *
 * Lifted verbatim in behavior from the closures inside `runLint` (`run.ts`), so
 * `lib/planFences` can honor an existing `spec-lint: ignore` stack over a fence
 * without re-deriving the grammar (arc B spec §2.1: "the gate REUSES
 * lib/specLint's waiver parsing rather than re-implementing it"). Re-deriving it
 * is how two linters end up disagreeing about which lines a waiver covers, and
 * the disagreement shows up as one of them silently not firing.
 *
 * Pure: no I/O, no module state.
 */

/**
 * The line a waiver targets: the next line that is neither blank nor itself
 * waiver-shaped. `null` when the stack runs to EOF (a waiver with no target).
 */
export function waiverTarget(
  lines: string[],
  isWaiverShaped: (lineNo: number) => boolean,
  waiverLine: number,
): number | null {
  for (let l = waiverLine + 1; l <= lines.length; l++) {
    if (isWaiverShaped(l) || (lines[l - 1] ?? "").trim() === "") continue;
    return l;
  }
  return null;
}

/**
 * The lines a waiver covers, given its target. A target that OPENS a fence
 * covers the whole block through its closer (or EOF); anything else covers just
 * itself. `isFenceDelimiter` decides which lines are delimiters, so a caller
 * with its own container-aware extractor can supply that view rather than
 * inherit this module's idea of a fence.
 */
export function fenceCoverage(
  lines: string[],
  isFenceDelimiter: (lineNo: number) => boolean,
  target: number,
): Set<number> {
  const cov = new Set<number>([target]);
  if (!isFenceDelimiter(target)) return cov;
  for (let l = target + 1; l <= lines.length; l++) {
    cov.add(l);
    if (isFenceDelimiter(l)) break;
  }
  return cov;
}
