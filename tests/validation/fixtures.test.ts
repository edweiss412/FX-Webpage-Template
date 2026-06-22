// tests/validation/fixtures.test.ts — Task 3 promotion test.
//
// Verifies that buildFixtures, R_COMBOS, and SW_COMBOS are importable from
// the app-importable path @/lib/validation/fixtures (not scripts/lib).
// VALIDATION_J3_CLAIM_EMAIL must be set to a real-email-shaped non-reserved
// address for buildFixtures to succeed.

import { describe, it, expect, beforeAll } from "vitest";
import { buildFixtures, R_COMBOS, SW_COMBOS } from "@/lib/validation/fixtures";

const TODAY = "2026-06-22";

describe("@/lib/validation/fixtures — promoted module", () => {
  beforeAll(() => {
    // buildFixtures aborts if VALIDATION_J3_CLAIM_EMAIL is unset or reserved.
    // Set a real-email-shaped address for the test run.
    if (!process.env.VALIDATION_J3_CLAIM_EMAIL) {
      process.env.VALIDATION_J3_CLAIM_EMAIL = "test@fxav-validation.dev";
    }
  });

  it("R_COMBOS + SW_COMBOS total 16", () => {
    expect(R_COMBOS.length + SW_COMBOS.length).toBe(16);
  });

  it("buildFixtures returns one row per combo (R + SW)", () => {
    const fixtures = buildFixtures(TODAY);
    const expectedCount = R_COMBOS.length + SW_COMBOS.length;
    expect(fixtures).toHaveLength(expectedCount);
  });

  it("every fixture row has a combo, showName, and at least one crewMember", () => {
    const fixtures = buildFixtures(TODAY);
    for (const row of fixtures) {
      expect(row.combo).toBeTruthy();
      expect(row.showName).toBeTruthy();
      expect(row.crewMembers.length).toBeGreaterThanOrEqual(1);
    }
  });
});
