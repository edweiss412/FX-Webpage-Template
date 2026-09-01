/**
 * Emits, for every REPAIRED row of the forced-colors collapse census, the two
 * class strings Arm 1 found sharing a forced projection.
 *
 * WHY A SUBPROCESS. Arm 1 parses the TSX corpus with the TypeScript compiler and
 * loads Tailwind's design system, neither of which belongs inside a Playwright
 * worker. The step-3 layout spec uses the same shape for the same reason
 * (tests/e2e/step3-review-modal.layout.spec.ts:133): run it under `tsx`, write
 * JSON, read the JSON from the spec.
 *
 * WHY THE PAIRS ARE DERIVED RATHER THAN TYPED. A class string typed into the
 * census would be a fixture testing itself: the component could change and the
 * fixture would keep passing. Deriving them from the live tree means a component
 * edit changes what this harness emits, and the census assertion in
 * tests/styles/_metaForcedColors.test.ts fails if the SITE set moves. Neither the
 * pair nor the site can drift silently.
 *
 * Usage: `tsx tests/e2e/_forcedColorsPairsHarness.ts <out.json>`
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { COLLAPSE_CENSUS } from "../styles/forcedColorsCensus";
import { findCollisions, loadTokenSurvival } from "../styles/forcedColorsProjection";
import { scanInteractiveElements } from "../styles/interactiveScanCore";

export type RepairPair = {
  readonly site: string;
  /** The two class strings that share a forced projection. */
  readonly a: string;
  readonly b: string;
  /**
   * The state marker the REAL component sets at this site, or null when it sets
   * none. Derived from the source, never assumed.
   *
   * This field exists because its absence made AC-4 tautological. A first version
   * of the page stamped `aria-current` and `aria-pressed` on every "on" element,
   * so all fourteen pairs passed against a rule keyed on ARIA — including the four
   * sites whose components set no ARIA at all, where the rule cannot fire. The
   * fixture was testing the fixture.
   */
  readonly stateAttribute: string | null;
};

/** Ordered by specificity: the first match is the marker the site actually uses. */
const STATE_ATTRIBUTES: readonly (readonly [RegExp, string])[] = [
  [/aria-current=\{[^}]*"step"/, 'aria-current="step"'],
  [/aria-current=\{[^}]*"page"/, 'aria-current="page"'],
  [/aria-current=\{[^}]*"true"/, 'aria-current="true"'],
  [/aria-current=/, 'aria-current="page"'],
  [/aria-pressed=/, 'aria-pressed="true"'],
  // Hooks this pass added, for states no ARIA describes. Detected the same way as
  // the ARIA markers — read out of the component's own source — so a hook that is
  // renamed or removed drops out of the page and AC-4 goes red on that site rather
  // than passing against an attribute the component no longer sets.
  [/"data-lead"/, "data-lead"],
  [/"data-quiet"/, "data-quiet"],
];

/** Read the element's own opening tag region for the marker it sets. */
function stateAttributeAt(root: string, site: string): string | null {
  const [file, lineText] = [
    site.slice(0, site.lastIndexOf(":")),
    site.slice(site.lastIndexOf(":") + 1),
  ];
  const line = Number(lineText);
  const lines = readFileSync(join(root, file), "utf8").split("\n");
  const window = lines.slice(Math.max(0, line - 2), line + 18).join("\n");
  for (const [pattern, attribute] of STATE_ATTRIBUTES) {
    if (pattern.test(window)) return attribute;
  }
  return null;
}

async function main(): Promise<void> {
  const out = process.argv[2];
  if (out === undefined) throw new Error("usage: _forcedColorsPairsHarness.ts <out.json>");

  const root = join(__dirname, "..", "..");
  const elements = scanInteractiveElements(root, { textEntry: true, paintedChildren: true });
  const survival = await loadTokenSurvival(elements, join(root, "app", "globals.css"));
  const collisions = findCollisions(elements, survival);

  const repaired = new Set(
    COLLAPSE_CENSUS.filter((row) => row.disposition === "repaired").map((row) => row.site),
  );
  const pairs: RepairPair[] = [];
  for (const collision of collisions) {
    const site = `${collision.file}:${collision.line}`;
    if (!repaired.has(site)) continue;
    if (pairs.some((p) => p.site === site)) continue; // one pair per site is enough
    pairs.push({
      site,
      a: collision.pair[0],
      b: collision.pair[1],
      stateAttribute: stateAttributeAt(root, site),
    });
  }

  writeFileSync(out, JSON.stringify({ pairs }, null, 2));
}

void main();
