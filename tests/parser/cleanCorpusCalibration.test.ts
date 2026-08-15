// Spec §10: per-code clean-corpus expectations for every code this wave adds.
//
// WHAT THIS IS FOR. A detector's base rate on the UNMUTATED corpus is the number that
// says whether it is calibrated. A detector that fires 200 times on clean sheets is
// noise Doug learns to ignore; one that fires zero times where the corpus genuinely
// carries the defect is not detecting anything. Neither shows up in the mutation
// harness, which only ever asks about mutants — so it is pinned here, per code, per
// fixture.
//
// The expectations are EXACT rather than upper bounds, because "no more than N" cannot
// distinguish a fixed detector from a broken one, and a silent shift in the base rate is
// exactly the drift this file exists to catch.
//
// Fixtures come from the harness registry rather than a corpus directory listing: a
// listing in the parallel project would race a serial test's synthetic `_temp-*` fixture
// (tests/cross-cutting/corpus-temp-prefix.test.ts) and would also sweep up non-fixture
// markdown such as exporter-xlsx/README.md.
//
// BRANCHES 3-4 EXTEND `WAVE_CODES` with their own codes. A code whose expectation is
// "zero everywhere" still gets a row — an absent row asserts nothing, and this file is
// where the wave records that a detector is quiet on clean input.
import { describe, expect, it } from "vitest";

import { parseSheet } from "@/lib/parser";
import { premise } from "@/tests/_shared/premise";
import { FIXTURES, readFixture } from "@/tests/parser/mutation/fixtures";

/**
 * `REF_ERROR_LITERAL` on the clean corpus: the 24 committed `\#REF\!` occurrences
 * (probe §13.A). These are REAL broken references sitting in real exported sheets, which
 * is why the code exists — 3 of the 7 live shows carry them.
 */
const EXPECTED_REF: Record<string, number> = {
  "fixtures/shows/exporter-xlsx/consultants.md": 6,
  "fixtures/shows/exporter-xlsx/fintech.md": 5,
  "fixtures/shows/exporter-xlsx/fixed-income.md": 5,
  "fixtures/shows/exporter-xlsx/rpas.md": 5,
  "fixtures/shows/raw/2025-10-consultants-roundtable.md": 3,
};

/**
 * `zeroEverywhere` is a CLAIM, not a default.
 *
 * Branch 3's `ROW_CELLS_FUSED` is quiet on the whole clean corpus (probe §13.B: no data
 * row sits at its section's modal width minus one), which is the calibrated outcome —
 * every fixture is a real exported sheet with no merged cells. But "expected: {}" and
 * "this detector is broken and returns nothing" produce identical per-fixture arms, so
 * the flag makes the difference explicit and lets the premise below hold each code to
 * the rule that fits it: a declared-zero code must total zero, and every other code must
 * actually reach its pinned total somewhere.
 */
const WAVE_CODES: Array<{
  code: string;
  expected: Record<string, number>;
  zeroEverywhere?: true;
}> = [
  { code: "REF_ERROR_LITERAL", expected: EXPECTED_REF },
  { code: "ROW_CELLS_FUSED", expected: {}, zeroEverywhere: true },
  { code: "LEADING_COLUMN_AUTOCORRECTED", expected: {}, zeroEverywhere: true },
];

/** Parse once per fixture; each code's arm reads the same warning list. */
const parsed = FIXTURES.map((f) => ({
  path: f.path,
  warnings: parseSheet(readFixture(f), f.path).warnings,
}));

describe("clean-corpus calibration (spec §10)", () => {
  it("premise: the corpus was discovered, and the pinned totals are actually reachable", () => {
    // Guards the guard on both sides. An empty fixture list would make every per-fixture
    // arm below vacuous; and a pin table whose codes never appear anywhere would make
    // the "exact count" arms assert only zeroes without anyone noticing.
    premise("corpus fixtures discovered", parsed.length, 16);
    for (const { code, expected, zeroEverywhere } of WAVE_CODES) {
      const pinnedTotal = Object.values(expected).reduce((a, b) => a + b, 0);
      const actualTotal = parsed.reduce(
        (n, p) => n + p.warnings.filter((w) => w.code === code).length,
        0,
      );
      expect(actualTotal, `${code} clean-corpus total`).toBe(pinnedTotal);
      // The two claims are mutually exclusive by construction, so a row cannot sit in the
      // gap between them: a declared-zero code that starts firing has broken its
      // calibration, and a pinned code that totals zero is a detector that stopped
      // detecting while every per-fixture arm below kept passing.
      if (zeroEverywhere) expect(pinnedTotal, `${code} declares zeroEverywhere`).toBe(0);
      else expect(pinnedTotal, `${code} pins a reachable total`).toBeGreaterThan(0);
    }
  });

  for (const { path, warnings } of parsed) {
    it(`${path} matches every wave code's pinned base rate`, () => {
      for (const { code, expected } of WAVE_CODES) {
        const n = warnings.filter((w) => w.code === code).length;
        expect(n, `${code} on ${path}`).toBe(expected[path] ?? 0);
      }
    });
  }
});
