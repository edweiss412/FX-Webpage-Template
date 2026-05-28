/**
 * tests/scripts/validation-check-seed-freshness-skew.test.ts
 *
 * M12 Phase 0.C follow-up (Phase 0.E close-out §6 finding 4) — the
 * `validation:check-seed` freshness gate flaked across the UTC-midnight
 * boundary: reseed at 23:59 UTC (stamps day N) + check-seed at 00:01 UTC
 * (real today = day N+1) made predicates (b/b'/i) false-fail with strict
 * equality even though the seed was fresh.
 *
 * The fix bounds the freshness gate to a ±1-day UTC skew and pins the rest
 * of the run's "today" to the SEED's recorded stamp (so freshness AND
 * date-relative expected-state computation stay mutually consistent).
 *
 * Hard constraints preserved (do NOT relitigate):
 *   • R24-F1 (check-seed.ts:832-835) — no operator-supplied today; the
 *     comparison basis derives from the real clock + the seed's own stamp,
 *     never an operator argument. The clock seam here is test-only.
 *   • Genuinely stale seeds (>1 day skew) STILL fail — the bounded-skew
 *     guard mirrors mint_validation_fixture_atomic's R11 F9 pattern
 *     (abs(stamp::date - current_date) > 1).
 *
 * These are pure unit tests against the exported `resolveEffectiveToday`
 * seam with an injected real-clock value — no DB, no real midnight crossing.
 */
import { describe, expect, test } from "vitest";

import {
  CheckSeedFailure,
  nowUtcDateIso,
  resolveEffectiveToday,
} from "@/scripts/validation-check-seed";

import { R_COMBOS } from "@/scripts/lib/validation-fixtures";

const R1 = R_COMBOS[0];

function allRow(lastSeedDate: string | null) {
  return {
    last_seed_date: lastSeedDate,
    combos_seeded_dates: {} as Record<string, string>,
  };
}

function singleRow(stamps: Record<string, string>) {
  return {
    last_seed_date: null,
    combos_seeded_dates: stamps,
  };
}

describe("nowUtcDateIso — injectable real-clock seam", () => {
  test("formats an injected Date as a UTC YYYY-MM-DD with no operator flag", () => {
    expect(nowUtcDateIso(new Date("2026-05-28T00:01:00Z"))).toBe("2026-05-28");
  });

  test("defaults to the real clock when no Date is injected", () => {
    expect(nowUtcDateIso()).toBe(new Date().toISOString().slice(0, 10));
  });
});

describe("resolveEffectiveToday — bounded-skew freshness gate (--combo all)", () => {
  test("midnight crossing: seed=day N, real today=day N+1 (skew 1) is FRESH and resolves to the seed's stamp", () => {
    // The flake case. reseed stamped 2026-05-27 at 23:59 UTC; check-seed runs
    // at 00:01 UTC on 2026-05-28. Strict equality false-failed (b); bounded
    // skew accepts it and pins effectiveToday to the materialized day.
    const effective = resolveEffectiveToday(
      "all",
      allRow("2026-05-27"),
      "2026-05-28",
    );
    expect(effective).toBe("2026-05-27");
  });

  test("same-day: seed=real today (skew 0) resolves to today", () => {
    expect(resolveEffectiveToday("all", allRow("2026-05-28"), "2026-05-28")).toBe(
      "2026-05-28",
    );
  });

  test("reverse boundary: seed=day N, real today=day N-1 (clock-behind, skew 1) is FRESH", () => {
    expect(resolveEffectiveToday("all", allRow("2026-05-28"), "2026-05-27")).toBe(
      "2026-05-28",
    );
  });

  test("genuinely stale: seed=day N-3, real today=day N (skew 3) FAILS predicate (b) — R24-F1 anti-stale intent preserved", () => {
    expect(() =>
      resolveEffectiveToday("all", allRow("2026-05-25"), "2026-05-28"),
    ).toThrowError(CheckSeedFailure);
    try {
      resolveEffectiveToday("all", allRow("2026-05-25"), "2026-05-28");
    } catch (e) {
      expect((e as CheckSeedFailure).predicate).toBe("b");
      expect((e as Error).message).toMatch(/2026-05-25/);
    }
  });

  test("NULL last_seed_date FAILS predicate (b) (finalizer never ran)", () => {
    try {
      resolveEffectiveToday("all", allRow(null), "2026-05-28");
      throw new Error("expected throw");
    } catch (e) {
      expect((e as CheckSeedFailure).predicate).toBe("b");
      expect((e as Error).message).toMatch(/last_seed_date IS NULL/);
    }
  });
});

describe("resolveEffectiveToday — bounded-skew freshness gate (--combo <single>)", () => {
  test("midnight crossing for a single combo resolves to the per-combo stamp", () => {
    const effective = resolveEffectiveToday(
      { single: R1 },
      singleRow({ [R1]: "2026-05-27" }),
      "2026-05-28",
    );
    expect(effective).toBe("2026-05-27");
  });

  test("genuinely stale single-combo stamp FAILS predicate (b')", () => {
    try {
      resolveEffectiveToday(
        { single: R1 },
        singleRow({ [R1]: "2020-01-01" }),
        "2026-05-28",
      );
      throw new Error("expected throw");
    } catch (e) {
      expect((e as CheckSeedFailure).predicate).toBe("b'");
      expect((e as Error).message).toMatch(/2020-01-01/);
    }
  });

  test("absent per-combo stamp FAILS predicate (b')", () => {
    try {
      resolveEffectiveToday({ single: R1 }, singleRow({}), "2026-05-28");
      throw new Error("expected throw");
    } catch (e) {
      expect((e as CheckSeedFailure).predicate).toBe("b'");
      expect((e as Error).message).toMatch(/<absent>/);
    }
  });
});

describe("date-relative expected-state consistency", () => {
  test("the resolved basis is the SEED's stamp, not the runtime clock — buildFixtures(effectiveToday) computes date-restricted state for the materialized day", () => {
    // A date-restricted combo's today-state (datesRelative / dateRestriction
    // per spec §3.3.1) differs between day N and day N+1. If check-seed fed
    // the runtime clock (N+1) into buildFixtures while the data was
    // materialized for N, the expected-state predicates (e)/(o) could
    // false-fail (or false-pass). Pinning the basis to the seed's stamp keeps
    // freshness AND expected-state on the SAME today.
    const realToday = "2026-05-28";
    const seedDay = "2026-05-27";
    const effective = resolveEffectiveToday("all", allRow(seedDay), realToday);
    expect(effective).toBe(seedDay);
    expect(effective).not.toBe(realToday);
  });
});
