/**
 * Tests for `lib/visibility/packList.ts` — the canonical PackListTile
 * visibility predicate (M4 Task 4.9, plan lines 412-471, spec §8.1, §6.10,
 * AC-4.7..4.12).
 *
 * The predicate combines:
 *
 *   1. Today's work-phase set, derived directly from
 *      `ShowRow.schedule_phases[isoDate]` for the show's venue timezone.
 *      NO re-derivation from `show.dates + show.schedule` (verbatim plan
 *      correction #2).
 *   2. The PACK_LIST_VISIBLE_PHASES set: { Set, Strike, Load Out }.
 *      Load In is INTENTIONALLY EXCLUDED per spec §8.1 (verbatim plan
 *      correction #3).
 *   3. The viewer's stage_restriction (§6.6 discriminated union):
 *      `{ kind: 'none' }` or `{ kind: 'explicit'; stages: WorkPhase[] }`.
 *
 * Cases enumerated below cover:
 *   - Every WorkPhase × {none, explicit-Load-In-Set, explicit-Load-Out-Strike,
 *     explicit-Set-Strike} matrix (per dispatch self-review).
 *   - Compound days (e.g., Show + Strike) where today's set has both a
 *     visible phase AND a non-visible phase.
 *   - Empty schedule_phases entry (today not in the map).
 *   - Timezone boundary (a date that flips between UTC midnight and the
 *     show's `America/New_York` zone).
 *   - venue.timezone null fallback to 'America/New_York'.
 */
import { describe, expect, test } from "vitest";
import { isPackListVisibleToday, todayWorkPhases } from "@/lib/visibility/packList";
import type { ShowRow, StageRestriction, WorkPhase } from "@/lib/parser/types";

/** Build a minimal ShowRow shaped to drive `todayWorkPhases`. */
function makeShow(opts: {
  schedulePhases: Record<string, WorkPhase[]>;
  timezone?: string | null;
}): Pick<ShowRow, "schedule_phases" | "venue"> {
  return {
    schedule_phases: opts.schedulePhases,
    venue:
      opts.timezone === undefined
        ? null
        : ({
            name: "Test Venue",
            address: "Test",
            // The ShowRow.venue type does not currently include a `timezone`
            // field (see lib/parser/types.ts:85-91). The predicate reads
            // `(venue as any)?.timezone ?? 'America/New_York'` to gracefully
            // accept a future timezone field while defaulting to the FXAV
            // domestic-US default per dispatch instructions §1.
            timezone: opts.timezone,
          } as unknown as ShowRow["venue"]),
  };
}

describe("todayWorkPhases (Task 4.9, §6.10)", () => {
  test("returns the schedule_phases entry for today's ISO date in the venue timezone", () => {
    // 2026-04-15 noon UTC is 2026-04-15 in both UTC and America/New_York
    // (NY is UTC-4 during DST; 12:00 UTC = 08:00 NYC).
    const today = new Date(Date.UTC(2026, 3, 15, 12, 0, 0));
    const show = makeShow({
      schedulePhases: {
        "2026-04-14": ["Load In"],
        "2026-04-15": ["Set"],
        "2026-04-16": ["Show"],
      },
    });
    expect(todayWorkPhases(show, today)).toEqual(["Set"]);
  });

  test("returns [] when today's date is not in schedule_phases", () => {
    const today = new Date(Date.UTC(2026, 3, 20, 12, 0, 0));
    const show = makeShow({
      schedulePhases: { "2026-04-15": ["Set"] },
    });
    expect(todayWorkPhases(show, today)).toEqual([]);
  });

  test("returns [] when schedule_phases is empty", () => {
    const today = new Date(Date.UTC(2026, 3, 15, 12, 0, 0));
    const show = makeShow({ schedulePhases: {} });
    expect(todayWorkPhases(show, today)).toEqual([]);
  });

  test("compound days: returns full WorkPhase[] (e.g., Show + Strike)", () => {
    const today = new Date(Date.UTC(2026, 3, 17, 18, 0, 0));
    const show = makeShow({
      schedulePhases: { "2026-04-17": ["Show", "Strike"] },
    });
    expect(todayWorkPhases(show, today)).toEqual(["Show", "Strike"]);
  });

  test("timezone boundary: 03:00 UTC on Apr 16 maps to Apr 15 in America/New_York", () => {
    // 03:00 UTC = 23:00 previous-day in NYC during DST (UTC-4).
    const today = new Date(Date.UTC(2026, 3, 16, 3, 0, 0));
    const show = makeShow({
      schedulePhases: {
        "2026-04-15": ["Set"],
        "2026-04-16": ["Show"],
      },
    });
    // Default tz is America/New_York; 03:00 UTC Apr 16 → Apr 15 NYC.
    expect(todayWorkPhases(show, today)).toEqual(["Set"]);
  });

  test("explicit timezone override on venue", () => {
    // 03:00 UTC = 19:00 previous-day in Pacific/Honolulu (UTC-10).
    const today = new Date(Date.UTC(2026, 3, 16, 3, 0, 0));
    const show = makeShow({
      schedulePhases: {
        "2026-04-15": ["Strike"],
        "2026-04-16": ["Load Out"],
      },
      timezone: "Pacific/Honolulu",
    });
    expect(todayWorkPhases(show, today)).toEqual(["Strike"]);
  });

  test("venue null falls back to America/New_York", () => {
    const today = new Date(Date.UTC(2026, 3, 16, 3, 0, 0));
    const show: Pick<ShowRow, "schedule_phases" | "venue"> = {
      venue: null,
      schedule_phases: { "2026-04-15": ["Strike"] },
    };
    expect(todayWorkPhases(show, today)).toEqual(["Strike"]);
  });
});

describe("isPackListVisibleToday — PACK_LIST_VISIBLE_PHASES gate", () => {
  // Visibility set per spec §8.1 / verbatim plan correction #3:
  //   Set, Strike, Load Out   → tile visible
  //   Load In, Show           → tile NOT visible (Load In intentionally excluded)
  const NONE: StageRestriction = { kind: "none" };

  test("Load In day → tile hidden (Load In intentionally NOT in PACK_LIST_VISIBLE_PHASES)", () => {
    const show = makeShow({ schedulePhases: { "2026-04-14": ["Load In"] } });
    const today = new Date(Date.UTC(2026, 3, 14, 14, 0, 0));
    expect(isPackListVisibleToday({ show, restriction: NONE, today })).toBe(false);
  });

  test("Set day → tile visible", () => {
    const show = makeShow({ schedulePhases: { "2026-04-15": ["Set"] } });
    const today = new Date(Date.UTC(2026, 3, 15, 14, 0, 0));
    expect(isPackListVisibleToday({ show, restriction: NONE, today })).toBe(true);
  });

  test("Show day → tile hidden (Show is not a pack-list phase)", () => {
    const show = makeShow({ schedulePhases: { "2026-04-16": ["Show"] } });
    const today = new Date(Date.UTC(2026, 3, 16, 14, 0, 0));
    expect(isPackListVisibleToday({ show, restriction: NONE, today })).toBe(false);
  });

  test("Strike day → tile visible", () => {
    const show = makeShow({ schedulePhases: { "2026-04-17": ["Strike"] } });
    const today = new Date(Date.UTC(2026, 3, 17, 18, 0, 0));
    expect(isPackListVisibleToday({ show, restriction: NONE, today })).toBe(true);
  });

  test("Load Out day → tile visible", () => {
    const show = makeShow({ schedulePhases: { "2026-04-18": ["Load Out"] } });
    const today = new Date(Date.UTC(2026, 3, 18, 14, 0, 0));
    expect(isPackListVisibleToday({ show, restriction: NONE, today })).toBe(true);
  });

  test("compound Show + Strike → tile visible (intersection contains Strike)", () => {
    const show = makeShow({ schedulePhases: { "2026-04-17": ["Show", "Strike"] } });
    const today = new Date(Date.UTC(2026, 3, 17, 18, 0, 0));
    expect(isPackListVisibleToday({ show, restriction: NONE, today })).toBe(true);
  });

  test("today not in schedule_phases → tile hidden", () => {
    const show = makeShow({ schedulePhases: { "2026-04-15": ["Set"] } });
    const today = new Date(Date.UTC(2026, 3, 20, 14, 0, 0));
    expect(isPackListVisibleToday({ show, restriction: NONE, today })).toBe(false);
  });
});

describe("isPackListVisibleToday — stage_restriction intersection (AC-4.10)", () => {
  // AC-4.10 cases verbatim from dispatch:
  //   stage_restriction.stages = ['Load In', 'Set']
  //     → tile visible on Set day, hidden on Travel-Out + Strike.
  //   stage_restriction.stages = ['Load Out', 'Strike']
  //     → tile hidden on Set, visible on Travel-Out + Strike.
  //   stage_restriction.stages = ['Set', 'Strike']
  //     → tile visible on Set + Strike, hidden on Travel-Out.

  const SET = { "2026-04-15": ["Set"] as WorkPhase[] };
  const STRIKE = { "2026-04-17": ["Strike"] as WorkPhase[] };
  const LOAD_OUT = { "2026-04-18": ["Load Out"] as WorkPhase[] };

  test("explicit ['Load In','Set']: visible on Set day", () => {
    const show = makeShow({ schedulePhases: SET });
    const today = new Date(Date.UTC(2026, 3, 15, 14, 0, 0));
    const restriction: StageRestriction = {
      kind: "explicit",
      stages: ["Load In", "Set"],
    };
    expect(isPackListVisibleToday({ show, restriction, today })).toBe(true);
  });

  test("explicit ['Load In','Set']: hidden on Strike day (no overlap with restriction)", () => {
    const show = makeShow({ schedulePhases: STRIKE });
    const today = new Date(Date.UTC(2026, 3, 17, 14, 0, 0));
    const restriction: StageRestriction = {
      kind: "explicit",
      stages: ["Load In", "Set"],
    };
    expect(isPackListVisibleToday({ show, restriction, today })).toBe(false);
  });

  test("explicit ['Load In','Set']: hidden on Load Out day (no overlap)", () => {
    const show = makeShow({ schedulePhases: LOAD_OUT });
    const today = new Date(Date.UTC(2026, 3, 18, 14, 0, 0));
    const restriction: StageRestriction = {
      kind: "explicit",
      stages: ["Load In", "Set"],
    };
    expect(isPackListVisibleToday({ show, restriction, today })).toBe(false);
  });

  test("explicit ['Load Out','Strike']: hidden on Set day", () => {
    const show = makeShow({ schedulePhases: SET });
    const today = new Date(Date.UTC(2026, 3, 15, 14, 0, 0));
    const restriction: StageRestriction = {
      kind: "explicit",
      stages: ["Load Out", "Strike"],
    };
    expect(isPackListVisibleToday({ show, restriction, today })).toBe(false);
  });

  test("explicit ['Load Out','Strike']: visible on Strike day", () => {
    const show = makeShow({ schedulePhases: STRIKE });
    const today = new Date(Date.UTC(2026, 3, 17, 14, 0, 0));
    const restriction: StageRestriction = {
      kind: "explicit",
      stages: ["Load Out", "Strike"],
    };
    expect(isPackListVisibleToday({ show, restriction, today })).toBe(true);
  });

  test("explicit ['Load Out','Strike']: visible on Load Out day", () => {
    const show = makeShow({ schedulePhases: LOAD_OUT });
    const today = new Date(Date.UTC(2026, 3, 18, 14, 0, 0));
    const restriction: StageRestriction = {
      kind: "explicit",
      stages: ["Load Out", "Strike"],
    };
    expect(isPackListVisibleToday({ show, restriction, today })).toBe(true);
  });

  test("explicit ['Set','Strike']: visible on Set day", () => {
    const show = makeShow({ schedulePhases: SET });
    const today = new Date(Date.UTC(2026, 3, 15, 14, 0, 0));
    const restriction: StageRestriction = {
      kind: "explicit",
      stages: ["Set", "Strike"],
    };
    expect(isPackListVisibleToday({ show, restriction, today })).toBe(true);
  });

  test("explicit ['Set','Strike']: visible on Strike day", () => {
    const show = makeShow({ schedulePhases: STRIKE });
    const today = new Date(Date.UTC(2026, 3, 17, 14, 0, 0));
    const restriction: StageRestriction = {
      kind: "explicit",
      stages: ["Set", "Strike"],
    };
    expect(isPackListVisibleToday({ show, restriction, today })).toBe(true);
  });

  test("explicit ['Set','Strike']: hidden on Load Out day", () => {
    const show = makeShow({ schedulePhases: LOAD_OUT });
    const today = new Date(Date.UTC(2026, 3, 18, 14, 0, 0));
    const restriction: StageRestriction = {
      kind: "explicit",
      stages: ["Set", "Strike"],
    };
    expect(isPackListVisibleToday({ show, restriction, today })).toBe(false);
  });

  test("explicit []: tile hidden everywhere (degenerate empty restriction)", () => {
    const show = makeShow({ schedulePhases: { "2026-04-15": ["Set"] } });
    const today = new Date(Date.UTC(2026, 3, 15, 14, 0, 0));
    const restriction: StageRestriction = { kind: "explicit", stages: [] };
    expect(isPackListVisibleToday({ show, restriction, today })).toBe(false);
  });

  test("explicit ['Show']: tile hidden on Show day (Show not in PACK_LIST_VISIBLE_PHASES)", () => {
    // Even when the viewer is restricted to Show, the global gate excludes
    // Show from the pack-list visible set — the tile must remain hidden.
    const show = makeShow({ schedulePhases: { "2026-04-16": ["Show"] } });
    const today = new Date(Date.UTC(2026, 3, 16, 14, 0, 0));
    const restriction: StageRestriction = { kind: "explicit", stages: ["Show"] };
    expect(isPackListVisibleToday({ show, restriction, today })).toBe(false);
  });

  test("compound day Show+Strike with restriction ['Set','Strike']: visible (intersect on Strike)", () => {
    const show = makeShow({
      schedulePhases: { "2026-04-17": ["Show", "Strike"] },
    });
    const today = new Date(Date.UTC(2026, 3, 17, 18, 0, 0));
    const restriction: StageRestriction = {
      kind: "explicit",
      stages: ["Set", "Strike"],
    };
    expect(isPackListVisibleToday({ show, restriction, today })).toBe(true);
  });

  test("compound day Show+Strike with restriction ['Show']: visible (verbatim plan formula — Strike satisfies global gate, Show satisfies restriction)", () => {
    // Per the verbatim plan §8.1 example formula in dispatch instructions:
    //   visible iff (phases ∩ PACK_LIST_VISIBLE_PHASES) ≠ ∅
    //          AND (restriction.kind === 'none' OR phases ∩ stages ≠ ∅)
    // Today's phases = [Show, Strike]:
    //   - Strike is in PACK_LIST_VISIBLE_PHASES → global gate passes.
    //   - Show is in restriction.stages → per-viewer gate passes.
    // Both conjuncts true → tile visible. The two gates do not need to
    // intersect on the SAME phase; a Show-restricted viewer on a Show+Strike
    // compound day sees the tile because Strike happens "around" them.
    const show = makeShow({
      schedulePhases: { "2026-04-17": ["Show", "Strike"] },
    });
    const today = new Date(Date.UTC(2026, 3, 17, 18, 0, 0));
    const restriction: StageRestriction = { kind: "explicit", stages: ["Show"] };
    expect(isPackListVisibleToday({ show, restriction, today })).toBe(true);
  });
});
