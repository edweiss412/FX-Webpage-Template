/**
 * tests/scripts/validation-check-seed-freshness-skew.test.ts
 *
 * M12 Phase 0.C follow-up (Phase 0.E close-out §6 finding 4) — the
 * `validation:check-seed` freshness gate flaked across the UTC-midnight
 * boundary: reseed at 23:59 UTC (stamps day N) + check-seed at 00:01 UTC
 * (real today = day N+1) made predicates (b/b'/i) false-fail with strict
 * equality even though the seed was fresh.
 *
 * The fix accepts a previous-day stamp ONLY within a short post-midnight UTC
 * grace window (the reseed/check-straddling-midnight case), NOT for the whole
 * next calendar day, and pins the rest of the run's "today" to the SEED's
 * recorded stamp (so freshness AND date-relative expected-state computation
 * stay mutually consistent with the materialized day).
 *
 * Hard constraints preserved (do NOT relitigate):
 *   • R24-F1 (check-seed.ts) — no operator-supplied today; the comparison
 *     basis derives from the real clock + the seed's own stamp, never an
 *     operator argument. The clock seam here is test-only (an injected Date).
 *   • Genuinely stale seeds (>1 day, OR a previous-day seed checked outside
 *     the post-midnight grace window) STILL fail — adversarial R1 (HIGH)
 *     correctly flagged that a calendar-day-only tolerance let yesterday's
 *     seed pass all day; the grace window bounds it to the actual rollover.
 *
 * These are pure unit tests against the exported `resolveEffectiveToday`
 * seam with an injected real-clock Date — no DB, no real midnight crossing.
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

function expectThrows(fn: () => unknown, predicate: string, msgRx: RegExp) {
  try {
    fn();
    throw new Error("expected resolveEffectiveToday to throw");
  } catch (e) {
    expect(e, "should throw CheckSeedFailure").toBeInstanceOf(CheckSeedFailure);
    expect((e as CheckSeedFailure).predicate).toBe(predicate);
    expect((e as Error).message).toMatch(msgRx);
  }
}

describe("nowUtcDateIso — injectable real-clock seam", () => {
  test("formats an injected Date as a UTC YYYY-MM-DD with no operator flag", () => {
    expect(nowUtcDateIso(new Date("2026-05-28T00:01:00Z"))).toBe("2026-05-28");
  });

  test("defaults to the real clock when no Date is injected", () => {
    expect(nowUtcDateIso()).toBe(new Date().toISOString().slice(0, 10));
  });
});

describe("resolveEffectiveToday — post-midnight grace gate (--combo all)", () => {
  test("midnight crossing: seed=day N, real=00:01 UTC day N+1 is FRESH and resolves to the seed's stamp", () => {
    // The flake case. reseed stamped 2026-05-27 at 23:59 UTC; check-seed runs
    // at 00:01 UTC on 2026-05-28 — inside the post-midnight grace window.
    const effective = resolveEffectiveToday(
      "all",
      allRow("2026-05-27"),
      new Date("2026-05-28T00:01:00Z"),
    );
    expect(effective).toBe("2026-05-27");
  });

  test("grace boundary: previous-day seed at 01:59 UTC still FRESH", () => {
    expect(
      resolveEffectiveToday(
        "all",
        allRow("2026-05-27"),
        new Date("2026-05-28T01:59:00Z"),
      ),
    ).toBe("2026-05-27");
  });

  test("ADVERSARIAL R1 (HIGH): previous-day seed checked LATE (23:00 UTC) on the next day FAILS (b) — not an all-day pass", () => {
    // The R1 finding: a calendar-day-only tolerance let a 2026-05-27 seed
    // pass at 23:00 UTC on 2026-05-28 — ~24h stale, expected-state computed
    // for yesterday. The grace window must reject it.
    expectThrows(
      () =>
        resolveEffectiveToday(
          "all",
          allRow("2026-05-27"),
          new Date("2026-05-28T23:00:00Z"),
        ),
      "b",
      /2026-05-27/,
    );
  });

  test("grace boundary: previous-day seed at exactly 02:00 UTC FAILS (b) (grace window is [00:00, 02:00))", () => {
    expectThrows(
      () =>
        resolveEffectiveToday(
          "all",
          allRow("2026-05-27"),
          new Date("2026-05-28T02:00:00Z"),
        ),
      "b",
      /2026-05-27/,
    );
  });

  test("same-day: seed=real today at any time (15:00 UTC) resolves to today", () => {
    expect(
      resolveEffectiveToday(
        "all",
        allRow("2026-05-28"),
        new Date("2026-05-28T15:00:00Z"),
      ),
    ).toBe("2026-05-28");
  });

  test("genuinely stale: seed=day N-3 FAILS (b) even inside the grace window — grace only rescues a 1-day diff", () => {
    expectThrows(
      () =>
        resolveEffectiveToday(
          "all",
          allRow("2026-05-25"),
          new Date("2026-05-28T00:30:00Z"),
        ),
      "b",
      /2026-05-25/,
    );
  });

  test("future stamp: seed dated tomorrow relative to the check clock FAILS (b) (not a real rollover)", () => {
    expectThrows(
      () =>
        resolveEffectiveToday(
          "all",
          allRow("2026-05-28"),
          new Date("2026-05-27T00:30:00Z"),
        ),
      "b",
      /2026-05-28/,
    );
  });

  test("NULL last_seed_date FAILS (b) (finalizer never ran)", () => {
    expectThrows(
      () => resolveEffectiveToday("all", allRow(null), new Date("2026-05-28T00:01:00Z")),
      "b",
      /last_seed_date IS NULL/,
    );
  });
});

describe("resolveEffectiveToday — post-midnight grace gate (--combo <single>)", () => {
  test("midnight crossing for a single combo resolves to the per-combo stamp", () => {
    expect(
      resolveEffectiveToday(
        { single: R1 },
        singleRow({ [R1]: "2026-05-27" }),
        new Date("2026-05-28T00:01:00Z"),
      ),
    ).toBe("2026-05-27");
  });

  test("ADVERSARIAL R1 (HIGH): previous-day single-combo seed checked LATE (23:00 UTC) FAILS (b')", () => {
    expectThrows(
      () =>
        resolveEffectiveToday(
          { single: R1 },
          singleRow({ [R1]: "2026-05-27" }),
          new Date("2026-05-28T23:00:00Z"),
        ),
      "b'",
      /2026-05-27/,
    );
  });

  test("genuinely stale single-combo stamp FAILS (b')", () => {
    expectThrows(
      () =>
        resolveEffectiveToday(
          { single: R1 },
          singleRow({ [R1]: "2020-01-01" }),
          new Date("2026-05-28T00:30:00Z"),
        ),
      "b'",
      /2020-01-01/,
    );
  });

  test("absent per-combo stamp FAILS (b')", () => {
    expectThrows(
      () => resolveEffectiveToday({ single: R1 }, singleRow({}), new Date("2026-05-28T00:30:00Z")),
      "b'",
      /<absent>/,
    );
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
    const effective = resolveEffectiveToday(
      "all",
      allRow("2026-05-27"),
      new Date("2026-05-28T00:30:00Z"),
    );
    expect(effective).toBe("2026-05-27");
    expect(effective).not.toBe("2026-05-28");
  });
});
