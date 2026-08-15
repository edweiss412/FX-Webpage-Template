// tests/parser/venueSignalParity.test.ts
// Spec §7.2(a): the venue-scope hoist must not change ONE emission on the unreordered
// corpus. Multiset of signal keys per fixture, snapshot-pinned. Failure mode caught:
// the refactor silently widening or narrowing the unknown-field coverage window.
import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { parseSheet } from "@/lib/parser";
import { signalKeys } from "@/tests/parser/mutation/oracle";
import { FIXTURES } from "@/tests/parser/mutation/fixtures";

const multiset = (md: string, name: string): string =>
  [...signalKeys(parseSheet(md, name)).entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, n]) => `${k}x${n}`)
    .join("\n");

// r1 F8: an EXPLICIT committed baseline, not toMatchSnapshot() - a missing snapshot
// (or any -u run) silently re-pins, which is the exact failure mode this gate exists
// to prevent. Regenerate deliberately: UPDATE_VENUE_PARITY_BASELINE=1 vitest run <this file>.
const BASELINE = "tests/parser/__fixtures__/venueSignalParity.baseline.json";

// The corpus is FIXTURES (the mutation harness's own 17-fixture source of truth), NOT a
// readdirSync walk of the two fixture directories: that walk also picks up
// fixtures/shows/exporter-xlsx/README.md, pinning a non-fixture document into the baseline
// (the same inflation the exhaustive sweep in 05-section-order.md Task 3 Step 3 calls out).
describe("venue signal parity (spec §7.2a)", () => {
  const actual: Record<string, string> = {};
  for (const fixture of FIXTURES) {
    actual[fixture.path] = multiset(readFileSync(fixture.path, "utf8"), fixture.path);
  }
  if (process.env["UPDATE_VENUE_PARITY_BASELINE"]) {
    mkdirSync(dirname(BASELINE), { recursive: true }); // retro F5: tests/parser/__fixtures__/ does not exist yet
    // Trailing newline so the committed artifact is prettier-clean: this path is NOT in
    // .prettierignore, so without it `prettier --check .` (the `pnpm format:check` gate)
    // fails on the generated file. Written by the generator rather than added by hand, or
    // the next regen would silently dirty the tree again.
    writeFileSync(BASELINE, `${JSON.stringify(actual, null, 2)}\n`);
  }

  it("covers every fixture in the harness corpus", () => {
    expect(Object.keys(actual)).toHaveLength(FIXTURES.length);
    expect(FIXTURES.length).toBe(17);
  });

  it("baseline file exists and covers every fixture, and every multiset matches it", () => {
    const pinned = JSON.parse(readFileSync(BASELINE, "utf8")) as Record<string, string>;
    expect(Object.keys(pinned).sort()).toEqual(Object.keys(actual).sort());
    for (const [path, m] of Object.entries(actual)) {
      expect(m, path).toBe(pinned[path]);
    }
  });
});
