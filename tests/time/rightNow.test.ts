/**
 * Tests for `lib/time/rightNow.ts` — pure state-machine selector that
 * powers the Right Now card (M4 Task 4.11; spec §8.2; AC-4.3).
 *
 * The function is intentionally pure — `today: Date`, show `dates`, and
 * `viewerDateRestriction` go in; a discriminated-union `RightNowState`
 * comes out. No `Date.now()`, no `new Date()`, no I/O — every branch is
 * deterministic from the inputs.
 *
 * Cases below mirror the §8.2 precedence table verbatim. The two
 * regression cases the spec explicitly calls out:
 *
 *   1. `viewer_unconfirmed` replaces every show-wide state EXCEPT
 *      `dateless` / `unknown` (date-data fallbacks override per
 *      spec line 2414).
 *   2. `viewer_after_last_day` is evaluated BEFORE `viewer_off_day`,
 *      so a restricted crew member never sees "Your next assigned
 *      day: ???" pointing at nothing.
 *
 * Plus a timezone-edge regression — `today` evaluated in
 * `America/New_York`, NOT UTC — because PackList shipped the same
 * class of bug once and the same class is easy to repeat here.
 */
import { describe, expect, test } from "vitest";
import { selectRightNowState } from "@/lib/time/rightNow";
import type { DateRestriction } from "@/lib/parser/types";

/** Default fixture: a 5-day Waldorf-shaped show. */
const DATES = {
  travelIn: "2026-06-01",
  set: "2026-06-02",
  showDays: ["2026-06-03", "2026-06-04", "2026-06-05"],
  travelOut: "2026-06-06",
};

/**
 * Build a Date that, when formatted in America/New_York via
 * Intl.DateTimeFormat('en-CA', ...), yields the given ISO string. We
 * pick noon UTC for the date so DST shifts in NY can never push us
 * across midnight.
 */
function todayInNY(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

const NONE: DateRestriction = { kind: "none" };
const ASTERISK: DateRestriction = { kind: "unknown_asterisk", days: null };
function explicit(...days: string[]): DateRestriction {
  return { kind: "explicit", days };
}

describe("selectRightNowState — viewer_unconfirmed precedence (§8.2 row 1)", () => {
  test("unknown_asterisk wins over show_day_n", () => {
    const state = selectRightNowState(
      todayInNY("2026-06-03"), // would be Show Day 1
      DATES,
      ASTERISK,
    );
    expect(state.kind).toBe("viewer_unconfirmed");
  });

  test("unknown_asterisk wins over travel_in_day", () => {
    const state = selectRightNowState(
      todayInNY("2026-06-01"), // would be travel_in_day
      DATES,
      ASTERISK,
    );
    expect(state.kind).toBe("viewer_unconfirmed");
  });

  test("dateless overrides viewer_unconfirmed (spec line 2414)", () => {
    const dateless = {
      travelIn: null,
      set: null,
      showDays: [],
      travelOut: null,
    };
    const state = selectRightNowState(todayInNY("2026-06-03"), dateless, ASTERISK);
    expect(state.kind).toBe("dateless");
  });
});

describe("selectRightNowState — viewer_after_last_day precedence (§8.2 row 2)", () => {
  test("today after viewer's last assigned day → viewer_after_last_day, NOT viewer_off_day (regression)", () => {
    // Explicit days: ['2026-06-02']; today: 2026-06-05; show span:
    // travelIn 2026-06-01 / travelOut 2026-06-07. Without the
    // ordering rule the ladder would emit viewer_off_day pointing at
    // a missing nextAssignedDay.
    const state = selectRightNowState(
      todayInNY("2026-06-05"),
      {
        travelIn: "2026-06-01",
        set: "2026-06-02",
        showDays: ["2026-06-03", "2026-06-04"],
        travelOut: "2026-06-07",
      },
      explicit("2026-06-02"),
    );
    expect(state.kind).toBe("viewer_after_last_day");
    if (state.kind === "viewer_after_last_day") {
      expect(state.travelOut).toBe("2026-06-07");
    }
  });
});

describe("selectRightNowState — viewer_off_day (§8.2 row 3)", () => {
  test("today not in days, before max(days), within span → viewer_off_day with nextAssignedDay", () => {
    const state = selectRightNowState(
      todayInNY("2026-06-03"),
      DATES,
      explicit("2026-06-02", "2026-06-04"),
    );
    expect(state.kind).toBe("viewer_off_day");
    if (state.kind === "viewer_off_day") {
      expect(state.nextAssignedDay).toBe("2026-06-04");
    }
  });
});

describe("selectRightNowState — viewer_off_day_pre (§8.2 row 4)", () => {
  test("today before viewer's first assigned day AND before travelIn", () => {
    const state = selectRightNowState(
      todayInNY("2026-05-30"),
      DATES,
      explicit("2026-06-02"),
    );
    expect(state.kind).toBe("viewer_off_day_pre");
    if (state.kind === "viewer_off_day_pre") {
      expect(state.firstAssignedDay).toBe("2026-06-02");
      expect(state.daysAway).toBe(3);
    }
  });
});

describe("selectRightNowState — pre_travel (§8.2 row 5)", () => {
  test("unrestricted viewer, today < travelIn − 1", () => {
    const state = selectRightNowState(todayInNY("2026-05-28"), DATES, NONE);
    expect(state.kind).toBe("pre_travel");
    if (state.kind === "pre_travel") {
      expect(state.travelIn).toBe("2026-06-01");
      expect(state.daysAway).toBe(4);
    }
  });
});

describe("selectRightNowState — show-wide states gated on viewer membership", () => {
  test("travel_in_day for unrestricted viewer", () => {
    const state = selectRightNowState(todayInNY("2026-06-01"), DATES, NONE);
    expect(state.kind).toBe("travel_in_day");
  });

  test("set_day for unrestricted viewer", () => {
    const state = selectRightNowState(todayInNY("2026-06-02"), DATES, NONE);
    expect(state.kind).toBe("set_day");
  });

  test("show_day_n parameterized (n=1 of 3, not last)", () => {
    const state = selectRightNowState(todayInNY("2026-06-03"), DATES, NONE);
    expect(state.kind).toBe("show_day_n");
    if (state.kind === "show_day_n") {
      expect(state.n).toBe(1);
      expect(state.total).toBe(3);
      expect(state.isLast).toBe(false);
    }
  });

  test("show_day_n parameterized (n=2 of 3, not last)", () => {
    const state = selectRightNowState(todayInNY("2026-06-04"), DATES, NONE);
    expect(state.kind).toBe("show_day_n");
    if (state.kind === "show_day_n") {
      expect(state.n).toBe(2);
      expect(state.total).toBe(3);
      expect(state.isLast).toBe(false);
    }
  });

  test("show_day_n parameterized (n=3 of 3, isLast=true)", () => {
    const state = selectRightNowState(todayInNY("2026-06-05"), DATES, NONE);
    expect(state.kind).toBe("show_day_n");
    if (state.kind === "show_day_n") {
      expect(state.n).toBe(3);
      expect(state.total).toBe(3);
      expect(state.isLast).toBe(true);
    }
  });

  test("travel_out_day for unrestricted viewer", () => {
    const state = selectRightNowState(todayInNY("2026-06-06"), DATES, NONE);
    expect(state.kind).toBe("travel_out_day");
  });

  test("restricted viewer with today IN days resolves the show-wide state", () => {
    // Explicit days = ['2026-06-04']; today = '2026-06-04'. That's
    // showDays[1] → Show Day 2 of 3. Verifies the OR gate fires when
    // the viewer IS scheduled for today.
    const state = selectRightNowState(
      todayInNY("2026-06-04"),
      DATES,
      explicit("2026-06-04"),
    );
    expect(state.kind).toBe("show_day_n");
    if (state.kind === "show_day_n") {
      expect(state.n).toBe(2);
      expect(state.total).toBe(3);
      expect(state.isLast).toBe(false);
    }
  });
});

describe("selectRightNowState — post_show (§8.2 row 10)", () => {
  test("today > travelOut, unrestricted viewer", () => {
    const state = selectRightNowState(todayInNY("2026-06-10"), DATES, NONE);
    expect(state.kind).toBe("post_show");
    if (state.kind === "post_show") {
      expect(state.wrappedAt).toBe("2026-06-06");
    }
  });

  test("today > viewer's last assigned day but before travelOut → viewer_after_last_day, not post_show", () => {
    // viewer_after_last_day takes precedence (row 2 above row 10).
    const state = selectRightNowState(
      todayInNY("2026-06-04"),
      DATES,
      explicit("2026-06-02"),
    );
    expect(state.kind).toBe("viewer_after_last_day");
  });
});

describe("selectRightNowState — unknown / dateless fallbacks (§8.2 rows 11-12)", () => {
  test("unknown — only travelIn parseable", () => {
    const state = selectRightNowState(
      todayInNY("2026-06-03"),
      {
        travelIn: "2026-06-01",
        set: null,
        showDays: [],
        travelOut: null,
      },
      NONE,
    );
    expect(state.kind).toBe("unknown");
  });

  test("dateless — every show date is null/empty (overrides viewer_unconfirmed too)", () => {
    const state = selectRightNowState(
      todayInNY("2026-06-03"),
      {
        travelIn: null,
        set: null,
        showDays: [],
        travelOut: null,
      },
      NONE,
    );
    expect(state.kind).toBe("dateless");
  });
});

describe("selectRightNowState — timezone-aware date comparison (regression)", () => {
  test("3am UTC on 2026-06-01 in America/New_York is still May 31 → pre_travel, NOT travel_in_day", () => {
    // 03:00 UTC on June 1 → 23:00 EDT on May 31 (UTC-4 in June). The
    // travelIn date is '2026-06-01'. A naive UTC comparison would
    // see "today === travelIn"; the timezone-aware comparison sees
    // May 31 < June 1 and falls through to pre_travel.
    const state = selectRightNowState(
      new Date("2026-06-01T03:00:00Z"),
      DATES,
      NONE,
    );
    expect(state.kind).toBe("pre_travel");
  });
});
