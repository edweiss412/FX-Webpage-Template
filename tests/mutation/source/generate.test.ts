import { describe, expect, it } from "vitest";
import { OPERATOR_NAMES, enumerateSites, siteId } from "./operators";
import { applyMutant, generateMutants } from "./generate";

const SRC = `export function f(n: number): number {
  let acc = 0;
  for (let i = 0; i < 3; i++) {
    if (i >= 1 && n !== 0) acc++;
  }
  return acc;
}
`;

describe("mutant construction (spec §3.2)", () => {
  it("splices exactly the site's span and leaves every other byte intact", () => {
    for (const site of enumerateSites("/virtual/f.ts", SRC, OPERATOR_NAMES)) {
      const mutant = applyMutant(SRC, site);
      // Derived from the site's own offsets rather than hardcoded, so a site
      // reporting wrong offsets cannot satisfy this by coincidence.
      expect(mutant).toBe(SRC.slice(0, site.start) + site.replacement + SRC.slice(site.end));
      expect(mutant.slice(0, site.start)).toBe(SRC.slice(0, site.start));
      expect(mutant.slice(mutant.length - (SRC.length - site.end))).toBe(SRC.slice(site.end));
    }
  });

  it("removes the whole statement for a statement-removal site, leaving no fragment behind", () => {
    const removals = enumerateSites("/virtual/f.ts", SRC, ["statement-removal"]);
    expect(removals.length).toBeGreaterThan(0);
    for (const site of removals) {
      const mutant = applyMutant(SRC, site);
      expect(mutant).not.toContain(site.from);
      expect(mutant.length).toBe(SRC.length - (site.end - site.start));
    }
  });
});

describe("no-op detection (spec §3.4, AC-5)", () => {
  it("produces zero no-ops for a real surface", () => {
    const { mutants, noOps } = generateMutants("/virtual/f.ts", SRC, OPERATOR_NAMES);
    expect(mutants.length).toBeGreaterThan(0);
    expect(noOps).toEqual([]);
  });

  it("reports a site whose replacement equals the original text as a no-op, by site id", () => {
    // A no-op is a generator defect, not a scoring outcome: it would sit in the
    // denominator as a guaranteed survivor while testing nothing. The gate
    // treats it as a hard error, so detection must name the offending site.
    const sites = enumerateSites("/virtual/f.ts", SRC, OPERATOR_NAMES);
    const victim = sites[0]!;
    const identity = { ...victim, replacement: SRC.slice(victim.start, victim.end) };
    const { mutants, noOps } = generateMutants("/virtual/f.ts", SRC, OPERATOR_NAMES, [
      ...sites.slice(1),
      identity,
    ]);
    expect(noOps).toEqual([siteId(identity)]);
    expect(mutants.map((m) => siteId(m.site))).not.toContain(siteId(identity));
  });

  it("keeps every non-no-op mutant when one no-op is present", () => {
    const sites = enumerateSites("/virtual/f.ts", SRC, OPERATOR_NAMES);
    const identity = { ...sites[0]!, replacement: SRC.slice(sites[0]!.start, sites[0]!.end) };
    const { mutants } = generateMutants("/virtual/f.ts", SRC, OPERATOR_NAMES, [
      ...sites.slice(1),
      identity,
    ]);
    expect(mutants).toHaveLength(sites.length - 1);
  });
});
