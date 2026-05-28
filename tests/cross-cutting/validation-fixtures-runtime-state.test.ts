/**
 * tests/cross-cutting/validation-fixtures-runtime-state.test.ts —
 * Codex Phase 0.C R13-F1 structural defense (same-vector class as R8).
 *
 * Each fixture in scripts/lib/validation-fixtures.ts is paired with an
 * expected Right Now state per spec §3.3 + §3.3.1. The check-seed
 * predicate (o) verifies the DB content matches the fixture build, but
 * does NOT run the runtime selector. R13 surfaced that SW-SHOW_1's
 * dates (set=today AND showDays[0]=today) made the runtime return
 * set_day instead of show_day_n, leaving the show_day_1 walk branch
 * unreachable while check-seed reported green.
 *
 * This meta-test runs every fixture through `selectRightNowState` and
 * asserts the resolved `kind` matches the canonical expectation. Adding
 * a new SW-* combo or changing fixture dates requires the matrix below
 * to stay consistent — drift trips CI at the meta-test layer instead of
 * surfacing during a Phase 1 walk.
 */
import { describe, expect, test } from "vitest";

import { selectRightNowState } from "@/lib/time/rightNow";
import {
  buildFixtures,
  R_COMBOS,
  SW_COMBOS,
  type Combo,
} from "@/scripts/lib/validation-fixtures";

// Use a midday UTC instant to avoid TZ-midnight edge cases — the
// fixtures themselves are TZ-pinned to UTC via venue.timezone in the
// mint RPC, so the runtime resolves today via UTC.
const TODAY_ISO = "2026-05-27";
const TODAY = new Date(`${TODAY_ISO}T12:00:00Z`);

// venue.timezone='UTC' per the mint RPC R7-F1 contract.
const SELECTOR_OPTIONS = { timezone: "UTC" } as const;

// Canonical expected Right Now state per combo.
// For R-combos: viewer-restriction states dominate. For SW-combos: the
// show-wide ladder runs.
const EXPECTED_KIND_BY_COMBO: Record<Combo, string> = {
  // R-combos — driven by viewerDateRestriction OR the show-wide ladder
  // when restriction.kind = none. Today is set day in most.
  R1: "set_day",
  R2: "set_day", // restriction includes today → falls through to ladder, today=set
  R3: "viewer_off_day",
  R4: "viewer_unconfirmed",
  R5: "viewer_off_day_pre",
  R6: "viewer_after_last_day",
  R7a: "set_day",
  R7b: "show_day_n", // today on showDays[last] — Strike day per R8-F1
  R8a: "show_day_n",
  R8b: "set_day",
  // SW combos — drive the show-wide ladder explicitly.
  "SW-PRE_TRAVEL": "pre_travel",
  "SW-TRAVEL_IN": "travel_in_day",
  "SW-SHOW_1": "show_day_n",
  "SW-SHOW_INTERIOR": "show_day_n",
  "SW-SHOW_LAST": "show_day_n",
  "SW-POST_SHOW": "post_show",
};

const ALL_COMBOS: Combo[] = [...R_COMBOS, ...SW_COMBOS];

describe("validation fixtures resolve to the expected runtime Right Now state (R13-F1 structural defense)", () => {
  // buildFixtures requires VALIDATION_J3_CLAIM_EMAIL — set a placeholder
  // real-domain value at test-suite scope so the fixture-build guard passes.
  process.env.VALIDATION_J3_CLAIM_EMAIL = "test.validation.user@gmail.com";
  const fixtures = buildFixtures(TODAY_ISO);

  for (const combo of ALL_COMBOS) {
    test(`${combo} resolves to ${EXPECTED_KIND_BY_COMBO[combo]}`, () => {
      const fx = fixtures.find((f) => f.combo === combo);
      expect(fx, `Missing fixture for ${combo}`).toBeDefined();
      const result = selectRightNowState(
        TODAY,
        fx!.dates,
        fx!.dateRestriction,
        SELECTOR_OPTIONS,
      );
      expect(
        result.kind,
        `${combo}: expected runtime kind '${EXPECTED_KIND_BY_COMBO[combo]}' but selector returned '${result.kind}'. ` +
          `Fixture dates: ${JSON.stringify(fx!.dates)}. ` +
          `This is the R13-F1 class: check-seed predicate (o) verifies DB↔fixture parity but doesn't run the selector; ` +
          `fixture dates that diverge from the spec's intended runtime state would silently leave a walk branch unreachable.`,
      ).toBe(EXPECTED_KIND_BY_COMBO[combo]);
    });
  }

  test("R13-F1 — SW-SHOW_1 specifically resolves to show_day_n with n=0 / total=3 / isLast=false", () => {
    const fx = fixtures.find((f) => f.combo === "SW-SHOW_1")!;
    const result = selectRightNowState(
      TODAY,
      fx.dates,
      fx.dateRestriction,
      SELECTOR_OPTIONS,
    );
    expect(result.kind).toBe("show_day_n");
    if (result.kind === "show_day_n") {
      // n is 1-indexed (matches the "show_day_1" prose); SW-SHOW_1 has
      // 3 showDays; today is the first → n=1, isLast=false.
      expect(result.n).toBe(1);
      expect(result.total).toBe(3);
      expect(result.isLast).toBe(false);
    }
  });

  test("R13-F1 — SW-SHOW_LAST resolves to show_day_n with isLast=true", () => {
    const fx = fixtures.find((f) => f.combo === "SW-SHOW_LAST")!;
    const result = selectRightNowState(
      TODAY,
      fx.dates,
      fx.dateRestriction,
      SELECTOR_OPTIONS,
    );
    expect(result.kind).toBe("show_day_n");
    if (result.kind === "show_day_n") {
      expect(result.isLast).toBe(true);
      // n is 1-indexed; last show day has n === total.
      expect(result.n).toBe(result.total);
    }
  });

  test("R13-F1 — SW-SHOW_INTERIOR resolves to show_day_n with neither first nor last", () => {
    const fx = fixtures.find((f) => f.combo === "SW-SHOW_INTERIOR")!;
    const result = selectRightNowState(
      TODAY,
      fx.dates,
      fx.dateRestriction,
      SELECTOR_OPTIONS,
    );
    expect(result.kind).toBe("show_day_n");
    if (result.kind === "show_day_n") {
      expect(result.n).toBeGreaterThan(0);
      expect(result.isLast).toBe(false);
    }
  });
});
