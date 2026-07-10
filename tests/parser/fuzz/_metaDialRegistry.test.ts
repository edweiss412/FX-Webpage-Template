// tests/parser/fuzz/_metaDialRegistry.test.ts
//
// Structural walker meta-test for `DIAL_REGISTRY` (dials.ts). Fails by
// default in both directions the registry can rot:
//   1. A row cites a `contractFile`/`contractSymbol` that doesn't exist (or
//      no longer exists — declaration-matched, not a loose string search) as
//      a real live-code declaration.
//   2. `DialChoices` gains/loses a field without a matching registry row
//      (new dial key -> no row = fail; stale row -> removed key = fail).
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  DIAL_CHOICES_KEYS,
  DIAL_REGISTRY,
  buildDialChoices,
  dialChoices,
  type DialChoices,
} from "./dials";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Declaration-matched, not a loose string mention: requires the symbol to
 * appear as an actual `const`/`let`/`function`/`class`/`type` declaration
 * (optionally `export`ed) at the start of a line (module-level). */
function declaredInFile(fileContent: string, symbol: string): boolean {
  const re = new RegExp(
    String.raw`^\s*(export\s+)?(const|let|function|class|type)\s+${escapeRegExp(symbol)}\b`,
    "m",
  );
  return re.test(fileContent);
}

describe("DIAL_REGISTRY — every row cites a real, currently-declared contract symbol", () => {
  for (const row of DIAL_REGISTRY) {
    describe(`row "${row.name}"`, () => {
      it(`${row.contractFile} exists`, () => {
        expect(existsSync(row.contractFile)).toBe(true);
      });

      it(`declares ${row.contractSymbol}`, () => {
        const content = readFileSync(row.contractFile, "utf8");
        expect(declaredInFile(content, row.contractSymbol)).toBe(true);
      });

      if (row.contractSymbol === "parseSheet") {
        it("has a non-empty note (parseSheet-anchored rows must justify why parseSheet itself is the contract)", () => {
          expect(row.note).toBeTruthy();
          expect((row.note ?? "").length).toBeGreaterThan(0);
        });
      }
    });
  }
});

describe("DIAL_REGISTRY <-> DialChoices — bidirectional key coverage", () => {
  it("DIAL_CHOICES_KEYS matches Object.keys of a real DialChoices sample (both directions, no drift)", () => {
    const [sample] = fc.sample(dialChoices, 1);
    const sampleKeys = Object.keys(sample as DialChoices).sort();
    const literalKeys = [...DIAL_CHOICES_KEYS].sort();
    expect(sampleKeys).toEqual(literalKeys);
  });

  it("every DialChoices key is covered by at least one registry row's `key`", () => {
    const coveredKeys = new Set(
      DIAL_REGISTRY.map((row) => row.key).filter((k): k is keyof DialChoices => k !== null),
    );
    for (const key of DIAL_CHOICES_KEYS) {
      expect(coveredKeys.has(key), `no DIAL_REGISTRY row has key "${key}"`).toBe(true);
    }
  });

  it("every non-null registry row `key` is a real DialChoices key (no stale row)", () => {
    const validKeys = new Set<string>(DIAL_CHOICES_KEYS);
    for (const row of DIAL_REGISTRY) {
      if (row.key === null) continue;
      expect(validKeys.has(row.key), `row "${row.name}" has stale key "${row.key}"`).toBe(true);
    }
  });

  it("every keyed row has a non-null arbitrary", () => {
    for (const row of DIAL_REGISTRY) {
      if (row.key === null) continue;
      expect(row.arbitrary, `row "${row.name}" (key "${row.key}") has a null arbitrary`).not.toBe(
        null,
      );
    }
  });
});

describe("dialChoices is composed FROM the registry via buildDialChoices", () => {
  it("buildDialChoices(DIAL_REGISTRY) produces a working fc.Arbitrary<DialChoices>", () => {
    const built = buildDialChoices(DIAL_REGISTRY);
    const [sample] = fc.sample(built, 1);
    expect(Object.keys(sample as DialChoices).sort()).toEqual([...DIAL_CHOICES_KEYS].sort());
  });

  it("throws if a keyed group is empty (no rows supply a required key)", () => {
    const withoutSectionOrder = DIAL_REGISTRY.filter((row) => row.name !== "sectionOrder");
    expect(() => buildDialChoices(withoutSectionOrder)).toThrow(/sectionOrder/);
  });

  it("throws if a keyed row's arbitrary is null", () => {
    const corrupted = DIAL_REGISTRY.map((row) =>
      row.name === "dateFormat" ? { ...row, arbitrary: null } : row,
    );
    expect(() => buildDialChoices(corrupted)).toThrow(/dateFormat/);
  });

  it("duplicate-key rows (headerTypo) are unioned, not overwritten: both null and typo values are reachable", () => {
    const samples = fc.sample(dialChoices, { numRuns: 200, seed: 1 });
    const sawNull = samples.some((s) => s.headerTypo === null);
    const sawTypo = samples.some((s) => s.headerTypo !== null);
    expect(sawNull).toBe(true);
    expect(sawTypo).toBe(true);
  });
});
