import { describe, it, expect } from "vitest";
import {
  SELF_HEALING_CODES,
  NEEDS_LOOK_CODES,
  AUTO_RESOLVING_CODES,
  DOUG_EXCLUDED_CODES,
  isSelfHealing,
} from "@/lib/adminAlerts/audience";

// The universe reaching the show-modal attention menu: resolution:"auto" codes
// that are NOT excluded upstream (health/info). Derived from the live exports so
// it tracks catalog changes, not a hardcoded list.
const excluded = new Set(DOUG_EXCLUDED_CODES);
const autoResolvingDoug = AUTO_RESOLVING_CODES.filter((c) => !excluded.has(c));

describe("self-healing vs needs-look classification", () => {
  it("has a non-trivial universe of 15 (guards a filter that silently empties it)", () => {
    expect(autoResolvingDoug.length).toBe(15);
  });

  it("classifies every universe code into EXACTLY ONE positive set", () => {
    for (const code of autoResolvingDoug) {
      const inSelf = SELF_HEALING_CODES.has(code);
      const inLook = NEEDS_LOOK_CODES.has(code);
      expect(inSelf || inLook, `${code} is in neither set`).toBe(true);
      expect(inSelf && inLook, `${code} is in both sets`).toBe(false);
    }
  });

  it("both sets contain ONLY universe codes (no extras)", () => {
    const universe = new Set(autoResolvingDoug);
    for (const code of [...SELF_HEALING_CODES, ...NEEDS_LOOK_CODES]) {
      expect(universe.has(code), `${code} classified but not in universe`).toBe(true);
    }
  });

  it("is NOT tautological: the exhaustiveness predicate fails on neither and on both", () => {
    const classifiedOk = (inSelf: boolean, inLook: boolean) =>
      (inSelf ? 1 : 0) + (inLook ? 1 : 0) === 1;
    expect(classifiedOk(false, false)).toBe(false); // a new unclassified code
    expect(classifiedOk(true, true)).toBe(false);
    expect(classifiedOk(true, false)).toBe(true);
    const synthetic = "SYNTHETIC_NEW_AUTO_CODE";
    expect(classifiedOk(SELF_HEALING_CODES.has(synthetic), NEEDS_LOOK_CODES.has(synthetic))).toBe(false);
  });

  it("isSelfHealing matches the set", () => {
    expect(isSelfHealing("SYNC_STALLED")).toBe(true);
    expect(isSelfHealing("SHEET_UNAVAILABLE")).toBe(false);
  });
});
