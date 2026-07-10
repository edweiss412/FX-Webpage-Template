// tests/parser/fuzz/model.test.ts
//
// Task 5 — the semantic-core honesty gate. Two kinds of proof per invariant
// (a)–(g):
//   1. POSITIVE: `fc.sample(showModel, {seed:1, numRuns:25})` — every generated
//      case passes `validateGeneratedCase(model, defaultDials())` (the generator
//      never emits a dishonest case).
//   2. NEGATIVE: one hand-built model with exactly ONE invariant broken; the gate
//      throws `GeneratorInvariantViolation` whose message names that letter.
//
// The role-vocabulary screen (invariant c) is asserted PROGRAMMATICALLY against
// the live `parseStageClause` grammar + the ONLY/date/paren regex screens — not
// eyeballed — so a future edit to the clean role list that sneaks in a stage word
// fails here.

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { parseStageClause } from "@/lib/parser/stageClause";
import {
  showModel,
  caseArb,
  validateGeneratedCase,
  GeneratorInvariantViolation,
  CLEAN_ROLE_VOCAB,
  mdToken,
  renderDateToken,
  type ShowModel,
  type SectionKind,
} from "./model";
import type { DialChoices } from "./dials";

// The all-dials-off baseline the positive samples validate against.
function defaultDials(): DialChoices {
  return {
    dateFormat: "slash",
    dimsFormat: "unit",
    crewSectionToken: "CREW",
    crewHeader: "labeled",
    sectionOrder: 0,
    blankPadding: 1,
    headerTypo: null,
    dayRestrictionOn: false,
  };
}

// A known-good model. Each negative test deep-clones this and breaks ONE thing.
function validBase(): ShowModel {
  return {
    version: "v4",
    year: 2026,
    dates: {
      travelIn: "2026-03-20",
      showDays: ["2026-03-21", "2026-03-22"],
      travelOut: "2026-03-23",
    },
    crew: [
      {
        name: "Amara QAA Quinn",
        role: "Video Engineer",
        phone: "555-100-2000",
        email: "q0@fuzz.example",
      },
      {
        name: "Boris QAB Stone",
        role: "Audio A2",
        phone: "555-100-2001",
        email: "q1@fuzz.example",
      },
    ],
    hotels: [{ name: "Harborview HAA Hotel", address: "483 Main St", guests: ["Amara QAA Quinn"] }],
    rooms: [{ kind: "GENERAL SESSION", name: "ALPINE RAA", dims: { w: 40, d: 30 } }],
    venue: { name: "Vantage VAA Center", address: "12 Oak Ave" },
    sections: ["crew", "dates", "venue", "hotels", "rooms"],
  };
}

function clone(m: ShowModel): ShowModel {
  return JSON.parse(JSON.stringify(m)) as ShowModel;
}

describe("validateGeneratedCase — positive (generator honesty)", () => {
  it("every sampled showModel passes the gate under default dials", () => {
    const samples = fc.sample(showModel, { seed: 1, numRuns: 25 });
    expect(samples.length).toBe(25);
    for (const model of samples) {
      expect(() => validateGeneratedCase(model, defaultDials())).not.toThrow();
    }
  });

  it("validBase() is itself honest", () => {
    expect(() => validateGeneratedCase(validBase(), defaultDials())).not.toThrow();
  });
});

describe("CLEAN_ROLE_VOCAB screen (invariant c, asserted programmatically)", () => {
  it("no clean role carries a stage clause, ONLY, ***, date token, or parens", () => {
    for (const role of CLEAN_ROLE_VOCAB) {
      const clause = parseStageClause(role);
      expect(clause.stages, `role "${role}" must carry no stage token`).toHaveLength(0);
      expect(
        clause.unrecognizedRestriction,
        `role "${role}" must not read as a malformed stage clause`,
      ).toBe(false);
      expect(/\bONLY\b/i.test(role), `role "${role}" must not contain ONLY`).toBe(false);
      expect(/\*/.test(role), `role "${role}" must not contain an asterisk`).toBe(false);
      expect(/\d{1,2}\/\d{1,2}/.test(role), `role "${role}" must not contain a date token`).toBe(
        false,
      );
      expect(/[()]/.test(role), `role "${role}" must not contain parens`).toBe(false);
      expect(
        /\b(?:LOAD\s+IN|LOAD\s+OUT|SET|SHOW|STRIKE)\b/i.test(role),
        `role "${role}" must not contain a bare stage word`,
      ).toBe(false);
    }
  });
});

describe("validateGeneratedCase — negative (one broken invariant each)", () => {
  it("(a) duplicate crew name", () => {
    const m = clone(validBase());
    m.crew[1]!.name = m.crew[0]!.name;
    expect(() => validateGeneratedCase(m, defaultDials())).toThrow(GeneratorInvariantViolation);
    expect(() => validateGeneratedCase(m, defaultDials())).toThrow(/invariant \(a\)/);
  });

  it("(b) guest appears in two hotels", () => {
    const m = clone(validBase());
    m.hotels = [
      { name: "Harborview HAA Hotel", address: "483 Main St", guests: ["Amara QAA Quinn"] },
      { name: "Bayside HAB Hotel", address: "77 Oak Ave", guests: ["Amara QAA Quinn"] },
    ];
    expect(() => validateGeneratedCase(m, defaultDials())).toThrow(/invariant \(b\)/);
  });

  it("(c) role carries a date token + ONLY", () => {
    const m = clone(validBase());
    m.crew[0]!.role = "Rigger 4/7 ONLY";
    expect(() => validateGeneratedCase(m, defaultDials())).toThrow(/invariant \(c\)/);
  });

  it("(c) role carries a live stage token", () => {
    const m = clone(validBase());
    m.crew[0]!.role = "Load In / Set";
    expect(() => validateGeneratedCase(m, defaultDials())).toThrow(/invariant \(c\)/);
  });

  it("(d) year out of [2020,2035]", () => {
    const m = clone(validBase());
    m.year = 2050;
    expect(() => validateGeneratedCase(m, defaultDials())).toThrow(/invariant \(d\)/);
  });

  it("(e) marker literal in a free-text identity field", () => {
    const m = clone(validBase());
    m.venue.name = "Vantage VAA ONLY Center";
    expect(() => validateGeneratedCase(m, defaultDials())).toThrow(/invariant \(e\)/);
  });

  it("(f) hotels non-empty but sections omits hotels", () => {
    const m = clone(validBase());
    m.sections = ["crew", "dates", "venue", "rooms"] as SectionKind[];
    expect(() => validateGeneratedCase(m, defaultDials())).toThrow(/invariant \(f\)/);
  });

  it("(g) two dates fall on the same calendar day", () => {
    const m = clone(validBase());
    m.dates.travelOut = m.dates.travelIn;
    expect(() => validateGeneratedCase(m, defaultDials())).toThrow(/invariant \(g\)/);
  });
});

describe("date token renderers", () => {
  it("mdToken is yearless M/D with no leading zeros", () => {
    expect(mdToken("2026-03-07")).toBe("3/7");
    expect(mdToken("2026-11-24")).toBe("11/24");
  });

  it("renderDateToken covers all five parser-accepted shapes", () => {
    expect(renderDateToken("2026-03-07", "slash")).toBe("3/7/2026");
    expect(renderDateToken("2026-03-07", "dash")).toBe("3-7-2026");
    expect(renderDateToken("2026-03-07", "iso")).toBe("2026-03-07");
    expect(renderDateToken("2026-03-07", "longMDY")).toBe("March 7, 2026");
    expect(renderDateToken("2026-03-07", "longDMY")).toBe("7 March 2026");
  });
});

describe("caseArb — cross-dial exclusion resolved by construction", () => {
  it("headerless crewHeader never composes with a non-null headerTypo", () => {
    const pairs = fc.sample(caseArb, { seed: 3, numRuns: 200 });
    for (const [, dials] of pairs) {
      if (dials.crewHeader === "headerless") {
        expect(dials.headerTypo).toBeNull();
      }
    }
  });

  it("every caseArb pair is an honest model", () => {
    const pairs = fc.sample(caseArb, { seed: 5, numRuns: 25 });
    for (const [model, dials] of pairs) {
      expect(() => validateGeneratedCase(model, dials)).not.toThrow();
    }
  });
});
