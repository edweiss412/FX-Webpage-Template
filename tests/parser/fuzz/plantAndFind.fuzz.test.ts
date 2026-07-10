// tests/parser/fuzz/plantAndFind.fuzz.test.ts
//
// Tier-2 plant-and-find property (spec §4.2) + oracle sabotage-sensitivity test
// (spec success criterion 3). The property drives the FULL pipeline:
//   caseArb  →  validateGeneratedCase (honesty gate)  →  renderCase (Task 6)
//            →  parseSheet (production parser)  →  checkPlantAndFind (Task 7 oracle).
// For every planted entity the oracle demands either a correct round-trip OR an
// attributable non-fatal signal — a silent drop / confident-wrong value with NO
// signal is the P0-class this whole layer exists to catch.
import fc from "fast-check";
import { describe, it, expect } from "vitest";
import type { ParsedSheet } from "@/lib/parser/types";
import { parseSheet } from "@/lib/parser";
import { fuzzRunConfig } from "./seeds";
import { caseArb, validateGeneratedCase, type ShowModel } from "./model";
import type { DialChoices } from "./dials";
import { renderCase } from "./render";
import { checkPlantAndFind } from "./groundTruth";

const { seed, numRuns } = fuzzRunConfig();

describe("Tier 2 plant-and-find", () => {
  it("every planted entity round-trips or an attributable signal fires", () => {
    fc.assert(
      fc.property(caseArb, ([model, dials]) => {
        // A throw here = generator bug, not a parser finding: caseArb normalizes
        // cross-dial exclusions by construction so validateGeneratedCase can never
        // legitimately fire in a property (spec §3.1 / model.ts:376-389).
        validateGeneratedCase(model, dials);
        const parsed = parseSheet(renderCase(model, dials), "fuzz.md");
        const verdict = checkPlantAndFind(model, dials, parsed);
        if (!verdict.ok) throw new Error(`plant-and-find misses:\n${verdict.misses.join("\n")}`);
      }),
      { seed, numRuns, verbose: 2 },
    );
  }, 300_000);
});

// ---------------------------------------------------------------------------
// Sabotage sensitivity (spec success criterion 3): proves the oracle is NOT
// tautological — that a confident WRONG value with ZERO attributable signal is
// actually caught. We sabotage the ORACLE'S INPUT (`parsed`), not the markdown:
// a cell-swap in the markdown could emit an attributable warning, which would let
// the oracle legitimately absolve the miss; corrupting the already-parsed
// `ParsedSheet` while leaving its `warnings` array UNTOUCHED simulates exactly the
// P0-2 class (parser confidently reports a wrong value and emits no signal) at the
// oracle boundary.
//
// CONCRETE FAILURE MODE THIS CATCHES: a future oracle refactor that stops comparing
// FIELD VALUES and matches planted entities on NAME ALONE would make Tier-2 vacuous
// (a confident-wrong phone or a dropped member would sail through). Both assertions
// below flip to green under that refactor, so this test fails loudly the moment the
// oracle's value/existence comparison is weakened.
// ---------------------------------------------------------------------------

// A fixed, hand-built 3-crew case: labeled crew header (no positional fallback),
// no typo, dayRestriction off, no hotels/rooms → the parse emits ZERO crew signals,
// so nothing could legitimately absolve a sabotaged crew miss. Roles are RECOGNIZED
// tokens (V1/A2/LED — ROLE_NORMALIZATIONS, personalization.ts:18-42): a descriptive
// role like "Video Engineer" would emit a per-member UNKNOWN_ROLE_TOKEN warning
// carrying the crew name in blockRef.name, which is itself an attributable t1 signal
// that would let the oracle absolve the sabotaged miss — defeating the test's point.
// Honesty is asserted two ways below: validateGeneratedCase passes AND the clean
// parse is ok:true with zero crew warnings.
const SABOTAGE_MODEL: ShowModel = {
  version: "v4",
  year: 2025,
  dates: { travelIn: "2025-04-01", showDays: ["2025-04-02"], travelOut: "2025-04-03" },
  crew: [
    { name: "Amara QAA Quinn", role: "V1", phone: "201-202-0001", email: "q0@fuzz.example" },
    { name: "Boris QAB Stone", role: "A2", phone: "203-204-0002", email: "q1@fuzz.example" },
    { name: "Clara QAC Vale", role: "LED", phone: "205-206-0003", email: "q2@fuzz.example" },
  ],
  hotels: [],
  rooms: [],
  venue: { name: "Vantage VAA Center", address: "123 Main St" },
  sections: ["crew", "dates", "venue"],
};

const SABOTAGE_DIALS: DialChoices = {
  dateFormat: "iso",
  dimsFormat: "unit",
  crewSectionToken: "CREW",
  crewHeader: "labeled",
  sectionOrder: 0,
  blankPadding: 1,
  headerTypo: null,
  dayRestrictionOn: false,
};

/** Assert the sabotaged `parsed` still carries NO crew warning — the sabotage must be
 *  SILENT so nothing in the attribution channels could legitimately absolve the miss. */
function assertNoCrewSignal(parsed: ParsedSheet): void {
  const crewWarn = parsed.warnings.some((w) => w.blockRef?.kind === "crew");
  expect(crewWarn).toBe(false);
  expect(parsed.hardErrors).toHaveLength(0);
}

describe("Tier 2 oracle sabotage sensitivity", () => {
  it("green path: the clean 3-crew case round-trips with zero crew signals", () => {
    // Honesty gate + clean-parse baseline. If EITHER of these regressed, the two
    // sabotage assertions below would be meaningless (a broken baseline could be
    // ok:false for an unrelated reason), so both are load-bearing preconditions.
    validateGeneratedCase(SABOTAGE_MODEL, SABOTAGE_DIALS);
    const parsed = parseSheet(renderCase(SABOTAGE_MODEL, SABOTAGE_DIALS), "sabotage.md");
    assertNoCrewSignal(parsed);
    expect(parsed.crewMembers).toHaveLength(3);
    expect(checkPlantAndFind(SABOTAGE_MODEL, SABOTAGE_DIALS, parsed).ok).toBe(true);
  });

  it("catches a confident-wrong phone value with NO attributable signal", () => {
    const parsed = parseSheet(renderCase(SABOTAGE_MODEL, SABOTAGE_DIALS), "sabotage.md");
    // Corrupt one parsed crew row's phone to a value NO planted member carries,
    // leaving warnings/hardErrors untouched (structuredClone copies the empty
    // warnings array verbatim). The oracle matches by name, so the planted twin of
    // this row now field-mismatches on phone with no signal to absolve it.
    const tampered = structuredClone(parsed);
    tampered.crewMembers[1]!.phone = "999-999-9999";
    assertNoCrewSignal(tampered); // sabotage is SILENT
    expect(checkPlantAndFind(SABOTAGE_MODEL, SABOTAGE_DIALS, tampered).ok).toBe(false);
  });

  it("catches a silently dropped crew member with NO attributable signal", () => {
    const parsed = parseSheet(renderCase(SABOTAGE_MODEL, SABOTAGE_DIALS), "sabotage.md");
    // Delete an entire parsed crew row (still no warnings) → the planted member is
    // now absent with nothing to attribute the absence to.
    const tampered = structuredClone(parsed);
    tampered.crewMembers.splice(2, 1);
    assertNoCrewSignal(tampered); // sabotage is SILENT
    expect(checkPlantAndFind(SABOTAGE_MODEL, SABOTAGE_DIALS, tampered).ok).toBe(false);
  });
});
