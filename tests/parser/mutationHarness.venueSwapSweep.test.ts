// tests/parser/mutationHarness.venueSwapSweep.test.ts
// Spec §7.2(b) in its LETTER: "the multiset is preserved under ANY adjacent-block swap",
// not merely under the ten swaps the ledger probe happened to name. This file sweeps
// every adjacent pair in the 17-fixture harness corpus (497 swaps) and asserts the signal
// multiset is unchanged.
//
// Why it lives here and not beside venueSwapInvariance.test.ts: the `mutation` vitest
// project collects `tests/parser/mutationHarness.*.test.ts` (vitest.projects.ts
// MUTATION_TEST_GLOBS) and the serial/parallel projects exclude that same glob
// unconditionally, so the name IS the env gate — a differently-named file would never
// execute under `--project mutation`, and this sweep is far too broad for a merge-gating
// leg. The ten named real-loss swaps stay in the ungated fast file
// tests/parser/venueSwapInvariance.test.ts; this is the spec-letter proof, run with the
// harness project at branch close-out.
//
// The mutation harness itself is NOT equivalent to this sweep: its oracle accepts a
// changed multiset when a STRONGER signal fires, so a swap that trades UNKNOWN_FIELD
// emissions for one louder warning passes there and fails here. Here, parity is parity.
//
// Corpus is FIXTURES, never a readdirSync walk of the fixture directories: that walk also
// picks up fixtures/shows/exporter-xlsx/README.md and inflates the sweep to 508.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseSheet } from "@/lib/parser";
import { signalKeys } from "@/tests/parser/mutation/oracle";
import { FIXTURES } from "@/tests/parser/mutation/fixtures";

const mkeys = (m: Map<string, number>): string =>
  [...m.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, n]) => `${k}x${n}`)
    .join(",");

const blocksOf = (md: string): string[] => md.split(/\n\s*\n/);
const swapCount = (md: string): number => Math.max(0, blocksOf(md).length - 1);

/** Corpus-wide adjacent-swap total. A tripwire, not an input: if a fixture is added,
 *  removed, or reflowed this number moves and the sweep's coverage claim changes with
 *  it. Update deliberately, alongside the fixture change that moved it. */
const EXPECTED_TOTAL_SWAPS = 497;

describe("venue swap sweep — every adjacent pair in the corpus (spec §7.2b)", () => {
  const perFixture = FIXTURES.map((f) => ({ ...f, md: readFileSync(f.path, "utf8") }));

  it("the sweep actually sweeps: 17 fixtures, every one contributing swaps, 497 total", () => {
    // Premise guard: an assertion over an empty sweep passes for the wrong reason.
    expect(perFixture).toHaveLength(17);
    for (const f of perFixture) {
      expect(swapCount(f.md), `${f.path} contributes no adjacent pair`).toBeGreaterThan(0);
    }
    expect(perFixture.reduce((n, f) => n + swapCount(f.md), 0)).toBe(EXPECTED_TOTAL_SWAPS);
  });

  for (const f of perFixture) {
    it(`${f.path} — all ${swapCount(f.md)} adjacent swaps preserve the signal multiset`, () => {
      const blocks = blocksOf(f.md);
      const base = mkeys(signalKeys(parseSheet(f.md, f.path)));
      const broken: string[] = [];
      for (let i = 0; i + 1 < blocks.length; i++) {
        const swapped = [
          ...blocks.slice(0, i),
          blocks[i + 1]!,
          blocks[i]!,
          ...blocks.slice(i + 2),
        ].join("\n\n");
        if (mkeys(signalKeys(parseSheet(swapped, f.path))) !== base)
          broken.push(`B${i}<->B${i + 1}`);
      }
      expect(broken, `swaps that changed the signal multiset in ${f.path}`).toEqual([]);
    });
  }
});
