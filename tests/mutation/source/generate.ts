import { type OperatorName, type Site, enumerateSites, siteId } from "./operators";

export type Mutant = {
  site: Site;
  /** Full source text with this site's mutation applied. */
  text: string;
};

export type Generation = {
  mutants: Mutant[];
  /**
   * Site ids whose mutant is byte-identical to the original. A no-op is a
   * GENERATOR defect, not a scoring outcome — it would sit in the denominator
   * as a guaranteed survivor while exercising nothing — so it is separated out
   * here and treated as a hard error by the gate (spec §3.4/§3.6 condition 1),
   * never silently dropped. Same posture as the parser harness
   * (`tests/parser/mutationHarness.shard0.test.ts:31-33`).
   */
  noOps: string[];
};

/** Splice one site's replacement into `source`. */
export const applyMutant = (source: string, site: Site): string =>
  source.slice(0, site.start) + site.replacement + source.slice(site.end);

/**
 * Build every mutant for `text`, partitioning off any that are byte-identical
 * to the original.
 *
 * `sites` is injectable so the no-op path is testable without having to find a
 * real operator that emits one — the shipped operators do not, and a detector
 * that can never be exercised is not a detector.
 */
export function generateMutants(
  sourcePath: string,
  text: string,
  operators: readonly OperatorName[],
  sites: readonly Site[] = enumerateSites(sourcePath, text, operators),
): Generation {
  const mutants: Mutant[] = [];
  const noOps: string[] = [];

  for (const site of sites) {
    const mutated = applyMutant(text, site);
    if (mutated === text) {
      noOps.push(siteId(site));
      continue;
    }
    mutants.push({ site, text: mutated });
  }

  return { mutants, noOps };
}
