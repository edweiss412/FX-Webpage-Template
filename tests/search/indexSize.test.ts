/**
 * Index size (spec §3 "Size"; plan Task 13): the serialized index for the seed
 * fixture (`makeShowForViewer()`) and for the largest matrix fixture
 * (`overCaps`, every list past its cap), written to
 * test-results/search-index-size.json for the closeout to record. Vitest
 * swallows console output, so the numbers go to a file. There is no size cap
 * to assert; this measures.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "vitest";

import type { Viewer } from "@/lib/data/getShowForViewer";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import { buildSearchIndex } from "@/lib/search/buildSearchIndex";
import type { SectionBuildInput } from "@/lib/search/sections";
import { financialsVisible } from "@/lib/visibility/scopeTiles";
import { premise } from "@/tests/_shared/premise";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";
import { MATRIX_TODAY, overCaps } from "@/tests/search/_viewerMatrix";

const OUT = join(process.cwd(), "test-results/search-index-size.json");

/** The seed fixture, seen by its default crew row (`c1`) as `CrewShell` would see it. */
function seedInput(): SectionBuildInput {
  const data = makeShowForViewer();
  const viewer: Viewer = { kind: "crew", crewMemberId: "c1" };
  const ctx = resolveViewerContext(viewer, data);
  return {
    data,
    viewer,
    today: MATRIX_TODAY,
    budgetVisible: financialsVisible(ctx.viewerFlags, ctx.isAdmin),
    staticPreview: false,
  };
}

test("records entries and serialized bytes for the seed and the over-cap fixtures", () => {
  const measured = [
    { case: "makeShowForViewer()", input: seedInput() },
    { case: overCaps.name, input: overCaps },
  ].map(({ case: name, input }) => {
    const index = buildSearchIndex(input);
    return {
      case: name,
      entries: index.entries.length,
      bytes: Buffer.byteLength(JSON.stringify(index), "utf8"),
    };
  });
  const [seed, over] = measured;
  // overCaps is the largest fixture only if it out-measures the seed.
  premise("overCaps entries over the seed fixture's", over!.entries, seed!.entries);

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(measured, null, 2)}\n`);

  expect(JSON.parse(readFileSync(OUT, "utf8"))).toEqual(measured);
});
