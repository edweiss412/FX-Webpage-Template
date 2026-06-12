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
import { daysBetween, formatIsoForTimezone, selectRightNowState } from "@/lib/time/rightNow";
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

  test("Codex round-22 MEDIUM — travelIn+travelOut WITHOUT showDays renders unknown (showDays empty = broken sheet data)", () => {
    // Pre-fix, hasFullDates returned true when only travelIn +
    // travelOut were non-null; the state machine then resolved to
    // confident states (pre_travel / travel_in_day / post_show)
    // even though showDays were missing. Spec §8.2 line 2414 says
    // unknown / dateless are date-data fallbacks that override
    // everything else; an empty showDays is exactly that — the
    // sheet's show-day cells failed to parse, so the state machine
    // can't answer "is today a show day?" Render the unknown
    // fallback instead of authoritative-looking confident copy.
    const partialDates = {
      travelIn: "2026-04-20",
      set: "2026-04-21",
      showDays: [], // sheet's show-day cells failed to parse
      travelOut: "2026-04-23",
    };
    // today happens to fall on a "show day" if showDays were
    // populated — but they're empty, so the state machine cannot
    // tell. Pre-fix would render pre_travel or travel_in_day or
    // post_show; post-fix renders unknown.
    const state = selectRightNowState(todayInNY("2026-04-22"), partialDates, { kind: "none" });
    expect(state.kind).toBe("unknown");
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
    const state = selectRightNowState(todayInNY("2026-05-30"), DATES, explicit("2026-06-02"));
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

  test("show_day_n parameterized (n=1 of total, not last)", () => {
    const today = "2026-06-03";
    const state = selectRightNowState(todayInNY(today), DATES, NONE);
    expect(state.kind).toBe("show_day_n");
    if (state.kind === "show_day_n") {
      expect(state.n).toBe(DATES.showDays.indexOf(today) + 1);
      expect(state.total).toBe(DATES.showDays.length);
      expect(state.isLast).toBe(false);
    }
  });

  test("show_day_n parameterized (n=2 of total, not last)", () => {
    const today = "2026-06-04";
    const state = selectRightNowState(todayInNY(today), DATES, NONE);
    expect(state.kind).toBe("show_day_n");
    if (state.kind === "show_day_n") {
      expect(state.n).toBe(DATES.showDays.indexOf(today) + 1);
      expect(state.total).toBe(DATES.showDays.length);
      expect(state.isLast).toBe(false);
    }
  });

  test("show_day_n parameterized (n=total, isLast=true)", () => {
    const today = "2026-06-05";
    const state = selectRightNowState(todayInNY(today), DATES, NONE);
    expect(state.kind).toBe("show_day_n");
    if (state.kind === "show_day_n") {
      expect(state.n).toBe(DATES.showDays.indexOf(today) + 1);
      expect(state.total).toBe(DATES.showDays.length);
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
    const state = selectRightNowState(todayInNY("2026-06-04"), DATES, explicit("2026-06-04"));
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
    const state = selectRightNowState(todayInNY("2026-06-04"), DATES, explicit("2026-06-02"));
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
    const state = selectRightNowState(new Date("2026-06-01T03:00:00Z"), DATES, NONE);
    expect(state.kind).toBe("pre_travel");
  });
});

describe("formatIsoForTimezone — module-scope formatter cache", () => {
  test("returns the same ISO string on repeat calls for the same timezone (cache hit)", () => {
    const instant = new Date("2026-06-01T16:00:00Z");
    const a = formatIsoForTimezone(instant, "America/New_York");
    const b = formatIsoForTimezone(instant, "America/New_York");
    expect(a).toBe("2026-06-01");
    expect(b).toBe("2026-06-01");
    expect(a).toBe(b);
  });

  test("formats the same instant differently across distinct timezones (separate cache entries)", () => {
    // 02:00 UTC on June 2 → June 1 in NY (22:00 EDT) but June 2 in Tokyo (11:00 JST).
    // Verifies the cache is keyed by timezone (not shared) and that distinct
    // timezones produce distinct cached formatter outputs.
    const instant = new Date("2026-06-02T02:00:00Z");
    const ny = formatIsoForTimezone(instant, "America/New_York");
    const tokyo = formatIsoForTimezone(instant, "Asia/Tokyo");
    expect(ny).toBe("2026-06-01");
    expect(tokyo).toBe("2026-06-02");
    expect(ny).not.toBe(tokyo);
  });
});

describe("selectRightNowState — single-day show (travelIn === travelOut === showDays[0]) [pinned]", () => {
  // Spec §8.2 has no row for the degenerate single-day show where every
  // named date collapses onto one calendar day. Per AGENTS.md invariant 7
  // (spec is canonical; where silent, pin current behavior) these tests
  // PIN the ladder outcome: travel_in_day wins on the day itself because
  // row 6 (rightNow.ts:323) is evaluated before set_day (row 7), show_day_n
  // (row 8), and travel_out_day (row 9). A branch-order swap that lets
  // show_day_n or travel_out_day win flips these assertions.
  const SINGLE_DAY = {
    travelIn: "2026-06-15",
    set: null,
    showDays: ["2026-06-15"],
    travelOut: "2026-06-15",
  };

  test("crew assigned that day → travel_in_day (row 6 beats show_day_n row 8 and travel_out_day row 9)", () => {
    const state = selectRightNowState(todayInNY("2026-06-15"), SINGLE_DAY, explicit("2026-06-15"));
    expect(state.kind).toBe("travel_in_day");
  });

  test("unrestricted viewer that day → travel_in_day (same winner without a restriction)", () => {
    const state = selectRightNowState(todayInNY("2026-06-15"), SINGLE_DAY, NONE);
    expect(state.kind).toBe("travel_in_day");
  });

  test("day before — crew assigned to the single day → viewer_off_day_pre {daysAway: 1}", () => {
    // Row 4 (rightNow.ts:276-295) fires: today < viewer's first assigned
    // day AND today < travelIn — the explicit restriction wins over the
    // unrestricted pre_travel shape.
    const state = selectRightNowState(todayInNY("2026-06-14"), SINGLE_DAY, explicit("2026-06-15"));
    expect(state.kind).toBe("viewer_off_day_pre");
    if (state.kind === "viewer_off_day_pre") {
      expect(state.firstAssignedDay).toBe("2026-06-15");
      expect(state.daysAway).toBe(1);
    }
  });

  test("day before — unrestricted viewer → pre_travel {daysAway: 1}", () => {
    const state = selectRightNowState(todayInNY("2026-06-14"), SINGLE_DAY, NONE);
    expect(state.kind).toBe("pre_travel");
    if (state.kind === "pre_travel") {
      expect(state.travelIn).toBe("2026-06-15");
      expect(state.daysAway).toBe(1);
    }
  });

  test("day after — crew assigned to the single day → viewer_after_last_day (row 2 beats post_show row 10)", () => {
    const state = selectRightNowState(todayInNY("2026-06-16"), SINGLE_DAY, explicit("2026-06-15"));
    expect(state.kind).toBe("viewer_after_last_day");
    if (state.kind === "viewer_after_last_day") {
      expect(state.travelOut).toBe("2026-06-15");
    }
  });

  test("day after — unrestricted viewer → post_show {wrappedAt}", () => {
    const state = selectRightNowState(todayInNY("2026-06-16"), SINGLE_DAY, NONE);
    expect(state.kind).toBe("post_show");
    if (state.kind === "post_show") {
      expect(state.wrappedAt).toBe("2026-06-15");
    }
  });
});

describe("selectRightNowState — set === travelIn evaluation order (rows 6 vs 7) [pinned]", () => {
  test("today === set === travelIn → travel_in_day wins (FAILS if travel_in_day/set_day branches are swapped)", () => {
    // rightNow.ts evaluates travel_in_day (line 323) BEFORE set_day
    // (line 328). When the sheet puts set on the same day as travel-in,
    // the card leads with travel copy. If a refactor reorders the two
    // branches, this resolves to set_day and the assertion fails — the
    // test is order-sensitive by construction.
    const dates = {
      travelIn: "2026-06-01",
      set: "2026-06-01",
      showDays: ["2026-06-02", "2026-06-03"],
      travelOut: "2026-06-04",
    };
    const state = selectRightNowState(todayInNY("2026-06-01"), dates, NONE);
    expect(state.kind).toBe("travel_in_day");
  });
});

describe("selectRightNowState — inverted range (travelOut < travelIn) [pinned nonsense-tolerance]", () => {
  // The parser should never emit travelOut < travelIn and spec §8.2 is
  // silent on the shape, so per AGENTS.md invariant 7 these tests PIN
  // what the ladder currently returns rather than adding validation (no
  // caller crashes on these outputs — they render as ordinary, if
  // nonsensical, card copy). Documented behavior: pre_travel (row 5,
  // daysBetween >= 1) swallows every day strictly before travelIn —
  // including the show day and travelOut itself — and post_show compares
  // only against travelOut, so any day past travelIn reports the show as
  // wrapped at a date before it "started".
  const INVERTED = {
    travelIn: "2026-06-10",
    set: null,
    showDays: ["2026-06-05"],
    travelOut: "2026-06-01",
  };

  test("today between travelOut and travelIn — even ON the show day — → pre_travel (row 5 fires before show_day_n)", () => {
    const state = selectRightNowState(todayInNY("2026-06-05"), INVERTED, NONE);
    expect(state).toEqual({ kind: "pre_travel", travelIn: "2026-06-10", daysAway: 5 });
  });

  test("today === travelOut (still before travelIn) → pre_travel, NOT travel_out_day", () => {
    const state = selectRightNowState(todayInNY("2026-06-01"), INVERTED, NONE);
    expect(state).toEqual({ kind: "pre_travel", travelIn: "2026-06-10", daysAway: 9 });
  });

  test("today after travelIn (and after travelOut) → post_show with wrappedAt = the inverted travelOut", () => {
    const state = selectRightNowState(todayInNY("2026-06-15"), INVERTED, NONE);
    expect(state).toEqual({ kind: "post_show", wrappedAt: "2026-06-01" });
  });
});

describe("daysBetween — exported helper", () => {
  test("positive delta when b is later than a", () => {
    expect(daysBetween("2026-06-01", "2026-06-04")).toBe(3);
  });

  test("zero delta when same day", () => {
    expect(daysBetween("2026-06-01", "2026-06-01")).toBe(0);
  });

  test("negative delta when b is earlier than a", () => {
    expect(daysBetween("2026-06-04", "2026-06-01")).toBe(-3);
  });
});
