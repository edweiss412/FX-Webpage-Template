// tests/scripts/validation-fixtures.test.ts — M12 Phase 0.C Task 0.C.3.
// Per master spec §3.3 + §3.3.1 + plan 03 Task 0.C.3.
import { describe, it, expect, beforeEach, afterEach } from "vitest";

const R_COMBOS = ["R1", "R2", "R3", "R4", "R5", "R6", "R7a", "R7b", "R8a", "R8b"] as const;

const SW_COMBOS = [
  "SW-PRE_TRAVEL",
  "SW-TRAVEL_IN",
  "SW-SHOW_1",
  "SW-SHOW_INTERIOR",
  "SW-SHOW_LAST",
  "SW-POST_SHOW",
] as const;

const ROLE_VARIANT_ALIASES = [
  "alias_5a_lead",
  "alias_5b_lead_a1",
  "alias_5c_bo_lead",
  "alias_6a_a1",
  "alias_6b_v1",
  "alias_6c_l1",
  "alias_6d_bo",
  "alias_6e_a1_l1",
  "alias_6f_empty",
] as const;

const REAL_GOOGLE_EMAIL = "test.validation.user@gmail.com";
const TODAY = "2026-05-27";

describe("buildFixtures (validation-fixtures)", () => {
  beforeEach(() => {
    process.env.VALIDATION_J3_CLAIM_EMAIL = REAL_GOOGLE_EMAIL;
  });
  afterEach(() => {
    delete process.env.VALIDATION_J3_CLAIM_EMAIL;
  });

  it("returns exactly 16 combos", async () => {
    const { buildFixtures } = await import("@/lib/validation/fixtures");
    const fixtures = buildFixtures(TODAY);
    expect(fixtures).toHaveLength(16);
  });

  it("R-combos each have 9 crew_members; SW-* each have 1", async () => {
    const { buildFixtures } = await import("@/lib/validation/fixtures");
    const fixtures = buildFixtures(TODAY);
    for (const fx of fixtures) {
      if ((R_COMBOS as readonly string[]).includes(fx.combo)) {
        expect(fx.crewMembers, `${fx.combo} should have 9 crew_members`).toHaveLength(9);
      } else {
        expect(fx.crewMembers, `${fx.combo} should have 1 crew_member (LEAD only)`).toHaveLength(1);
      }
    }
  });

  it("total leaf aliases = 96 (10 × 9 + 6 × 1)", async () => {
    const { buildFixtures } = await import("@/lib/validation/fixtures");
    const fixtures = buildFixtures(TODAY);
    const total = fixtures.reduce((sum, fx) => sum + fx.crewMembers.length, 0);
    expect(total).toBe(96);
  });

  it("every R-combo's crew_members includes all 9 role-variant aliases", async () => {
    const { buildFixtures } = await import("@/lib/validation/fixtures");
    const fixtures = buildFixtures(TODAY);
    for (const fx of fixtures) {
      if (!(R_COMBOS as readonly string[]).includes(fx.combo)) continue;
      const aliases = fx.crewMembers.map((c) => c.alias).sort();
      expect(aliases).toEqual([...ROLE_VARIANT_ALIASES].sort());
    }
  });

  it("every SW-* combo's crew_members is exactly [alias_5a_lead]", async () => {
    const { buildFixtures } = await import("@/lib/validation/fixtures");
    const fixtures = buildFixtures(TODAY);
    for (const fx of fixtures) {
      if (!(SW_COMBOS as readonly string[]).includes(fx.combo)) continue;
      expect(fx.crewMembers.map((c) => c.alias)).toEqual(["alias_5a_lead"]);
    }
  });

  it("R1.alias_5a_lead.email reads from VALIDATION_J3_CLAIM_EMAIL (canonicalized)", async () => {
    process.env.VALIDATION_J3_CLAIM_EMAIL = "Test.Validation.User@GMAIL.com";
    const { buildFixtures } = await import("@/lib/validation/fixtures");
    const fixtures = buildFixtures(TODAY);
    const r1 = fixtures.find((f) => f.combo === "R1");
    expect(r1).toBeDefined();
    const r1Lead = r1!.crewMembers.find((c) => c.alias === "alias_5a_lead");
    expect(r1Lead?.email).toBe("test.validation.user@gmail.com");
  });

  it("every alias EXCEPT R1.alias_5a_lead uses synthesized validation+...@example.com", async () => {
    const { buildFixtures } = await import("@/lib/validation/fixtures");
    const fixtures = buildFixtures(TODAY);
    for (const fx of fixtures) {
      for (const c of fx.crewMembers) {
        if (fx.combo === "R1" && c.alias === "alias_5a_lead") {
          // The R1 special case carries the dev's real email.
          expect(c.email).not.toMatch(/@example\.com$/);
          continue;
        }
        expect(
          c.email,
          `${fx.combo}.${c.alias}.email should be a synthesized example.com address`,
        ).toMatch(/^validation\+.+@example\.com$/);
      }
    }
  });

  describe("VALIDATION_J3_CLAIM_EMAIL guard", () => {
    it("aborts when VALIDATION_J3_CLAIM_EMAIL is unset", async () => {
      delete process.env.VALIDATION_J3_CLAIM_EMAIL;
      const { buildFixtures } = await import("@/lib/validation/fixtures");
      expect(() => buildFixtures(TODAY)).toThrow(/VALIDATION_J3_CLAIM_EMAIL/);
    });

    const rejected = [
      "fake@example.com",
      "fake@example.org",
      "fake@example.net",
      "fake@sub.test",
      "fake@sub.invalid",
      "fake@localhost",
      "fake@sub.localhost",
      "fake@sub.local",
      "fake@dev.local",
    ];
    for (const bad of rejected) {
      it(`aborts on canonical rejected-domain set: ${bad}`, async () => {
        process.env.VALIDATION_J3_CLAIM_EMAIL = bad;
        const { buildFixtures } = await import("@/lib/validation/fixtures");
        expect(() => buildFixtures(TODAY)).toThrow(/placeholder\/dev-only reserved domain/);
      });
    }
  });

  describe("R23-F1 — real-email-shape guard", () => {
    const malformed = [
      "not-an-email",
      "missing-tld@gmail",
      "missing-local@.com",
      "no-at-sign.example.com",
      "trailing.dot@gmail.com.",
      "double@@gmail.com",
    ];
    for (const bad of malformed) {
      it(`aborts on malformed shape: ${bad}`, async () => {
        process.env.VALIDATION_J3_CLAIM_EMAIL = bad;
        const { buildFixtures } = await import("@/lib/validation/fixtures");
        expect(() => buildFixtures(TODAY)).toThrow(/real-email shape/);
      });
    }

    it("accepts a canonicalized real-email-shape value (Gmail)", async () => {
      process.env.VALIDATION_J3_CLAIM_EMAIL = "real.dev@gmail.com";
      const { buildFixtures } = await import("@/lib/validation/fixtures");
      expect(() => buildFixtures(TODAY)).not.toThrow();
    });
  });
});
