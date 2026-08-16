// tests/parser/venueSwapInvariance.test.ts
// Spec §7.2(b): an adjacent-block swap must not change the signal multiset.
// These 10 swaps each extinguish warnings today (up to 120 -> 2, ledger probe §2.3).
// The exhaustive spec-letter proof over every adjacent pair in the corpus lives in
// tests/parser/mutationHarness.venueSwapSweep.test.ts (runs under --project mutation);
// this file is the fast, always-collected regression pin for the 10 named real losses.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseSheet } from "@/lib/parser";
import { signalKeys } from "@/tests/parser/mutation/oracle";
import { premiseHolds } from "@/tests/_shared/premise";

const CASES: Array<[string, number[]]> = [
  ["fixtures/shows/raw/2025-03-dci-rpas-central.md", [14, 15, 19]],
  ["fixtures/shows/raw/2025-04-asset-mgmt-cfo-coo.md", [14, 15]],
  ["fixtures/shows/raw/2025-06-ria-investment-forum.md", [3, 4, 7, 8]],
  ["fixtures/shows/raw/2025-10-consultants-roundtable.md", [22]],
];

const mkeys = (m: Map<string, number>) =>
  [...m.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, n]) => `${k}x${n}`)
    .join(",");

describe("venue swap invariance (spec §7.2b)", () => {
  for (const [path, pairs] of CASES) {
    const md = readFileSync(path, "utf8");
    const blocks = md.split(/\n\s*\n/);
    const base = mkeys(signalKeys(parseSheet(md, path)));
    for (const i of pairs) {
      it(`${path} swap B${i}<->B${i + 1} preserves the signal multiset`, () => {
        premiseHolds("swap index in range", blocks.length > i + 1);
        const swapped = [
          ...blocks.slice(0, i),
          blocks[i + 1]!,
          blocks[i]!,
          ...blocks.slice(i + 2),
        ].join("\n\n");
        expect(mkeys(signalKeys(parseSheet(swapped, path)))).toBe(base);
      });
    }
  }
});
