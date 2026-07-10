// tests/parser/fuzz/robustness.fuzz.test.ts
//
// Tier-1 robustness property (spec §4.1): over model-free hostile markdown
// (chaos.ts — no assumption about FXAV's sheet shape), `parseSheet`:
//   1. never throws (a thrown exception fails the fast-check property);
//   2. is deterministic (same input -> same output, checked via the oracle's
//      boolean canon-based comparators, NOT `fingerprint` — see below);
//   3. always returns a structurally valid `ParsedSheet`
//      (assertParsedSheetShape, Task 2) that is JSON-round-trippable.
import fc from "fast-check";
import { describe, it } from "vitest";
import { parseSheet } from "@/lib/parser";
import { fuzzRunConfig } from "./seeds";
import { assertParsedSheetShape } from "./shape";
import { payloadChanged, signalEq } from "../mutation/oracle";
import { chaosMarkdown } from "./chaos";
import { caseArb, validateGeneratedCase } from "./model";
import { renderCase } from "./render";

const { seed, numRuns } = fuzzRunConfig();

// Replay coordinates — the deep-job summary greps this exact prefix (spec §5:
// seed + numRuns + fast-check version must be recoverable from CI output).
// ESM: no bare `require` — use createRequire for the version lookup.
import { createRequire } from "node:module";
const fcVersion = createRequire(import.meta.url)("fast-check/package.json").version as string;
console.log(`FUZZ-CONFIG seed=${seed} numRuns=${numRuns} fast-check=${fcVersion}`);

/**
 * The Tier-1 property runner (spec §4.1), factored out so Task 8's
 * model-rendered Tier-1 block (over `caseArb` -> `renderCase`, same file)
 * can reuse the exact same assertions instead of re-deriving them — see
 * task-3-brief.md's Interfaces line ("the Tier-1 property runner
 * `runTier1(input: string)` reused by Task 8"). Throws on any violation;
 * `fc.property`'s callback throwing is what fails the property.
 */
export function runTier1(input: string): void {
  const a = parseSheet(input, "fuzz.md"); // never throws (property fails on throw)
  const b = parseSheet(input, "fuzz.md");
  assertParsedSheetShape(a);
  assertParsedSheetShape(b);
  JSON.stringify(a); // JSON-round-trippable (also checked inside assertParsedSheetShape)

  // Determinism via the oracle's boolean canon-based comparators
  // (tests/parser/mutation/oracle.ts:45-48). `payloadChanged` diffs the
  // ParsedSheet payload (everything minus the three signal channels);
  // `signalEq` diffs the three signal channels (warnings/hardErrors/
  // raw_unrecognized) directly. Both use the toEqual-parity `canon()` under
  // the hood.
  //
  // Deliberately NOT using `fingerprint()` here: fingerprint(b, m) returns a
  // diff-descriptor string for a PAIR of ParsedSheets, and that string is
  // non-empty (a hash/descriptor) even when b and m are identical — it was
  // designed to describe HOW two parses differ, not to answer a plain "are
  // these equal?" boolean. Using it as an equality check would be
  // meaningless (see tests/parser/mutation/oracle.ts:103-133).
  if (payloadChanged(a, b) || !signalEq(a, b)) {
    throw new Error("parseSheet nondeterministic on identical input");
  }
}

describe("Tier 1 robustness — chaos inputs", () => {
  it("parseSheet never throws, is deterministic, and returns a structurally valid ParsedSheet", () => {
    fc.assert(fc.property(chaosMarkdown, runTier1), { seed, numRuns, verbose: 2 });
  }, 120_000);
});

// Tier-1 over model-rendered (in-contract) markdown. Same three assertions as the
// chaos block above (never throws / deterministic / structurally valid + JSON-
// round-trippable), but the input is a `renderCase(model, dials)` v4 sheet derived
// from a validated `ShowModel`. Chaos proves the parser survives HOSTILE bytes;
// this proves the same robustness invariants hold on the WELL-FORMED-sheet
// distribution the Tier-2 oracle also drives (a nondeterminism or shape violation
// on an honest sheet is just as much a bug). `caseArb` normalizes cross-dial
// exclusions by construction, so `validateGeneratedCase` never legitimately throws
// here — a throw is a generator bug, not a parser finding (spec §3.1 / §4.1).
describe("Tier 1 robustness — model-rendered inputs", () => {
  it("parseSheet never throws, is deterministic, and returns a structurally valid ParsedSheet", () => {
    fc.assert(
      fc.property(caseArb, ([model, dials]) => {
        validateGeneratedCase(model, dials);
        runTier1(renderCase(model, dials));
      }),
      { seed, numRuns, verbose: 2 },
    );
  }, 120_000);
});
