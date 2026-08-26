/**
 * The §14 dimensional pairs the real-browser spec cannot reach, pinned at their
 * source.
 *
 * Spec: docs/superpowers/specs/2026-08-26-control-outline-cover-widening-design.md
 * §14, AC-13.
 *
 * WHAT THIS IS AND IS NOT. Four of §14's five pairs are measured in a REAL
 * BROWSER: two on `/admin` (`tests/e2e/control-outline-dimensions.layout.spec.ts`)
 * and two in the mounted step-3 tree
 * (`tests/e2e/control-outline-contrast.live.spec.ts`, which asserts computed
 * border contrast at the 3:1 non-text floor in both themes and REDS when the
 * pre-sweep tokens are planted back).
 *
 * An earlier revision of this file claimed the step-3 route was closed because
 * `CrewRowActions` transitively imports `lib/auth/requireAdmin.ts`. That was
 * wrong twice over and is corrected here rather than quietly dropped: the
 * bundle helper `tests/e2e/_step3ReviewModalBundle.mjs` stubs `"use server"`
 * modules by class, which is exactly that edge, and the import failure that
 * prompted the claim was a MISSING E2E ENV (`HASH_FOR_LOG_PEPPER`) under a bare
 * `tsx` invocation, not a property of the graph.
 *
 * ONE pair genuinely cannot mount there, and its probe is
 * `docs/superpowers/specs/probes/2026-08-26-crewrowactions-not-in-step3-tree.txt`:
 * `CrewRowActions` is passed its `actions` prop only on step3ReviewSections'
 * `isPublished(s)` branch, so it mounts on the published-show surface and not in
 * the wizard tree.
 *
 * So this file is the CHEAP layer: it asserts the class strings that CREATE
 * each relationship still sit on the elements §14 names. That is weaker than a
 * rendered rect and it is stated as weaker. `scripts/ac15-width-parity.mts` is
 * the third layer, comparing the border-WIDTH multiset of every element in the
 * corpus before and after the sweep (767 elements, 0 differences).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { premise } from "../_shared/premise";
import { stripCommentsForFile } from "../_shared/stripComments";

const ROOT = process.cwd();

function code(file: string): string {
  return stripCommentsForFile(readFileSync(join(ROOT, file), "utf8"), file);
}

/**
 * Each row is one §14 pair: an anchor that locates the PARENT, the class the
 * parent must carry to be the tap target, a MARKER that identifies the painted
 * child's recipe, and the dimension class every one of that child's arms must
 * carry.
 *
 * `childMarker` exists because the first draft of this file did not have it and
 * a planted defect walked straight through: `CrewRowActions`' visual is a
 * two-arm ternary, both arms carrying `size-8`, so deleting it from ONE arm left
 * the other in the window and `toContain` passed. Asserting over EVERY string
 * that carries the marker is what makes the pin about the child rather than
 * about the window.
 */
const PAIRS: ReadonlyArray<{
  readonly label: string;
  readonly file: string;
  readonly anchor: string;
  readonly window: number;
  readonly parentClass: string;
  readonly childMarker: string;
  readonly childClass: string;
}> = [
  {
    label: "CrewRowActions: 32px visual inside the 44px trigger",
    file: "components/admin/wizard/CrewRowActions.tsx",
    anchor: "data-testid={`crew-row-menu-button-${crewId}`}",
    window: 700,
    parentClass: "size-tap-min",
    childMarker: "place-items-center",
    childClass: "size-8",
  },
  {
    label: "step3 contact icon: 32px visual inside the 44px link",
    file: "components/admin/wizard/step3ReviewSections.tsx",
    anchor: "aria-label={`${action} ${displayName}`}",
    window: 500,
    parentClass: "size-tap-min",
    childMarker: "place-items-center",
    childClass: "size-8",
  },
  {
    label: "VenueMapTile: the CHILD is the 44px target in the tile's bottom band",
    file: "components/admin/wizard/VenueMapTile.tsx",
    anchor: 'data-testid="venue-directions"',
    window: 400,
    parentClass: "absolute inset-x-2.5 bottom-2.5",
    childMarker: "inline-flex",
    childClass: "min-h-tap-min",
  },
];

describe("§14 dimensional pairs the browser spec cannot reach", () => {
  it.each(PAIRS.map((p) => [p.label, p] as const))("%s", (_label, pair) => {
    const src = code(pair.file);
    const at = src.indexOf(pair.anchor);
    // The anchor moving is a DIFFERENT failure from the class going away, and
    // conflating them would let a rename read as a passing repair.
    premise(`the anchor is still in ${pair.file}`, at + 1, 0);
    const window = src.slice(at, at + pair.window);
    expect(window, `${pair.label}: parent class`).toContain(pair.parentClass);

    // EVERY string in the window that carries the child's marker must carry the
    // dimension class. One arm of a two-arm ternary losing it is the defect this
    // shape exists to catch.
    const arms = [...window.matchAll(/"([^"]*)"/g)]
      .map((m) => m[1] ?? "")
      .filter((str) => str.includes(pair.childMarker));
    premise(`${pair.label}: the window holds at least one child arm`, arms.length, 0);
    expect(
      arms.filter((str) => !str.includes(pair.childClass)),
      `${pair.label}: every arm carrying ${pair.childMarker} also carries ${pair.childClass}`,
    ).toEqual([]);
  });

  it("every pair's window is small enough to be about ONE control", () => {
    // Without this the windows could grow until they catch a class from an
    // unrelated element further down the file, which is how a source pin stops
    // being about the thing it names.
    for (const pair of PAIRS) expect(pair.window).toBeLessThanOrEqual(700);
  });
});
