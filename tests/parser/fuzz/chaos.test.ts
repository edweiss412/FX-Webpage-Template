// tests/parser/fuzz/chaos.test.ts
//
// Cap-enforcement test for `chaosMarkdown` (chaos.ts). This is NOT a
// property test against parseSheet — it proves the GENERATOR ITSELF stays
// inside the structural byte/shape budget over a fixed, reproducible sample
// (fc.sample with an explicit seed, spec §5's replay-coordinate discipline).
//
// Four caps enforced per-sample (task-3 brief step 1):
//   1. Buffer.byteLength(s) <= 262144         (the fuzz-corpus byte cap)
//   2. s.split("\n").length <= 400            (line-count cap)
//   3. every line's split("|").length-1 <= 121 (pipe/cell-count cap per line)
//   4. no cell (line.split("|") segment) > 10000 chars
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { chaosMarkdown } from "./chaos";

describe("chaosMarkdown — structural byte/shape caps (task-3 brief step 1)", () => {
  it("respects the byte, line-count, pipe-count, and cell-length caps over 200 fixed samples", () => {
    const samples = fc.sample(chaosMarkdown, { numRuns: 200, seed: 1 });
    expect(samples.length).toBe(200);

    for (const s of samples) {
      expect(Buffer.byteLength(s)).toBeLessThanOrEqual(262_144);

      const lines = s.split("\n");
      expect(lines.length).toBeLessThanOrEqual(400);

      for (const line of lines) {
        const cells = line.split("|");
        expect(cells.length - 1).toBeLessThanOrEqual(121);
        for (const cell of cells) {
          expect(cell.length).toBeLessThanOrEqual(10_000);
        }
      }
    }
  });
});
