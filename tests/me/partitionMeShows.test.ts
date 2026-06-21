/**
 * tests/me/partitionMeShows.test.ts — pure partition helper for /me page
 * (M9 C3 / M5-D1) per shape brief 2026-05-14-auth-flow-polish.md §5.1.
 *
 * Grouping rules (verbatim from brief):
 *   "Most soonest" = the show with the earliest `dates.set ?? dates.travelIn ??
 *      dates.showDays[0]` that is >= today.
 *   "Upcoming" = all shows future-dated, sorted ascending, EXCLUDING featured.
 *   "Past" = all shows ended (display date < today), sorted descending.
 *   If all shows are in the past → featured = most recent past, no upcoming.
 *   Empty input → all three buckets empty.
 *
 * The helper returns three buckets so the page renders NEXT UP + UPCOMING +
 * PAST sections cleanly. Bucket order is the only source of truth for what
 * renders where; no other partition logic in the page.
 */
import { describe, expect, it } from "vitest";

import { partitionMeShows, resolveDisplayDate } from "@/lib/me/partitionMeShows";
import type { CrewShowSummary } from "@/lib/data/listShowsForCrew";

const today = new Date(Date.UTC(2026, 4, 15)); // May 15 2026

function show(id: string, dateIso: string | null, title?: string): CrewShowSummary {
  return {
    id,
    slug: `slug-${id}`,
    title: title ?? `Show ${id}`,
    shareToken: `${id.padEnd(64, "0").slice(0, 64)}`,
    venue: null,
    dates:
      dateIso === null ? null : { set: dateIso, travelIn: null, showDays: [], travelOut: null },
  };
}

describe("partitionMeShows", () => {
  it("empty input → empty buckets", () => {
    const out = partitionMeShows([], today);
    expect(out.featured).toBeNull();
    expect(out.upcoming).toEqual([]);
    expect(out.past).toEqual([]);
  });

  it("single future show → featured only, no upcoming, no past", () => {
    const shows = [show("a", "2026-05-20")];
    const out = partitionMeShows(shows, today);
    expect(out.featured?.show.id).toBe("a");
    expect(out.upcoming).toEqual([]);
    expect(out.past).toEqual([]);
  });

  it("single past show → featured = that past show, no upcoming, no past list", () => {
    const shows = [show("a", "2026-05-01")];
    const out = partitionMeShows(shows, today);
    expect(out.featured?.show.id).toBe("a");
    expect(out.upcoming).toEqual([]);
    expect(out.past).toEqual([]);
  });

  it("today's show counts as future (not past)", () => {
    // Brief: 'most soonest' = earliest >= today.
    const shows = [show("a", "2026-05-15")];
    const out = partitionMeShows(shows, today);
    expect(out.featured?.show.id).toBe("a");
    expect(out.past).toEqual([]);
  });

  it("two future + one past → featured = nearest future, upcoming = remainder, past listed", () => {
    const shows = [
      show("near", "2026-05-20"),
      show("far", "2026-06-15"),
      show("done", "2026-04-10"),
    ];
    const out = partitionMeShows(shows, today);
    expect(out.featured?.show.id).toBe("near");
    expect(out.upcoming.map((p) => p.show.id)).toEqual(["far"]);
    expect(out.past.map((p) => p.show.id)).toEqual(["done"]);
  });

  it("upcoming sorted ascending; past sorted descending", () => {
    const shows = [
      show("u3", "2026-07-15"),
      show("u1", "2026-05-25"),
      show("u2", "2026-06-10"),
      show("p1", "2026-05-01"),
      show("p3", "2026-03-01"),
      show("p2", "2026-04-01"),
    ];
    const out = partitionMeShows(shows, today);
    expect(out.featured?.show.id).toBe("u1"); // earliest future
    expect(out.upcoming.map((p) => p.show.id)).toEqual(["u2", "u3"]); // ascending
    expect(out.past.map((p) => p.show.id)).toEqual(["p1", "p2", "p3"]); // descending
  });

  it("all-past → featured = most recent past, past list excludes the featured", () => {
    const shows = [show("p1", "2026-04-15"), show("p2", "2026-03-15"), show("p3", "2026-02-15")];
    const out = partitionMeShows(shows, today);
    expect(out.featured?.show.id).toBe("p1"); // most recent past
    expect(out.upcoming).toEqual([]);
    expect(out.past.map((p) => p.show.id)).toEqual(["p2", "p3"]); // older past, excluding featured
  });

  it("R11: show with null dates → surfaced in undated bucket (NOT silently dropped)", () => {
    // Pre-R11 the partition silently dropped undated shows. R11 fix:
    // preserve them in their own bucket so the page renders a
    // "Date pending" section with the show link still reachable.
    const shows = [show("a", "2026-05-20"), show("b", null, "No-date show")];
    const out = partitionMeShows(shows, today);
    expect(out.featured?.show.id).toBe("a");
    expect(out.upcoming).toEqual([]);
    expect(out.past).toEqual([]);
    expect(out.undated.map((s) => s.id)).toEqual(["b"]);
  });

  it("R11: only-undated shows → featured null, undated bucket carries them", () => {
    const shows = [show("a", null, "Show A no date"), show("b", null, "Show B no date")];
    const out = partitionMeShows(shows, today);
    expect(out.featured).toBeNull();
    expect(out.upcoming).toEqual([]);
    expect(out.past).toEqual([]);
    expect(out.undated.map((s) => s.id).sort()).toEqual(["a", "b"]);
  });

  it("R11: empty input → empty undated bucket too", () => {
    const out = partitionMeShows([], today);
    expect(out.undated).toEqual([]);
  });

  it("R12 F1: malformed date strings (TBD, N/A, empty) → undated, NOT dated", () => {
    // Pre-R12 the partition accepted any non-empty string as dated.
    // A row with set="TBD" landed in dated → relativeDayChip(NaN) →
    // "Ended NaN weeks ago" rendered to crew. Strict ISO gating now
    // routes these into the undated bucket so the user sees the
    // "Date pending" section instead of broken chip copy.
    const shows: CrewShowSummary[] = [
      {
        id: "tbd-set",
        slug: "tbd-set",
        title: "TBD set",
        shareToken: "tbd-set",
        venue: null,
        dates: { set: "TBD", travelIn: null, showDays: [], travelOut: null },
      },
      {
        id: "tbd-traveldays",
        slug: "tbd-traveldays",
        title: "TBD travel + show days",
        shareToken: "tbd-traveldays",
        venue: null,
        dates: { set: null, travelIn: "TBA", showDays: ["N/A", ""], travelOut: null },
      },
      {
        id: "valid",
        slug: "valid",
        title: "Valid future",
        shareToken: "valid",
        venue: null,
        dates: { set: "2026-08-01", travelIn: null, showDays: [], travelOut: null },
      },
    ];
    const out = partitionMeShows(shows, today);
    expect(out.featured?.show.id).toBe("valid");
    expect(out.upcoming).toEqual([]);
    expect(out.past).toEqual([]);
    expect(out.undated.map((s) => s.id).sort()).toEqual(["tbd-set", "tbd-traveldays"]);
  });

  it("R12 F1: valid YYYY-MM-DD survives the ISO gate", () => {
    // Defensive: confirm the gate doesn't false-reject valid input.
    const shows = [show("a", "2026-05-20"), show("b", "2026-04-01")];
    const out = partitionMeShows(shows, today);
    expect(out.featured?.show.id).toBe("a");
    expect(out.past.map((p) => p.show.id)).toEqual(["b"]);
    expect(out.undated).toEqual([]);
  });

  it("R13: calendar-impossible dates that JS rolls over (2026-02-31, 2026-04-31, 2026-02-29 non-leap) are rejected", () => {
    // Pre-R13 these passed the gate because Date.parse silently
    // normalizes (2026-02-31 → 2026-03-03), so a corrupt row would
    // render the wrong date that Doug never typed. The round-trip
    // check rejects normalization-rewritten values.
    const cases = ["2026-02-31", "2026-04-31", "2026-02-29"]; // 2026 is not a leap year
    for (const bad of cases) {
      const shows: CrewShowSummary[] = [
        {
          id: `bad-${bad}`,
          slug: `bad-${bad}`,
          title: `Bad ${bad}`,
          shareToken: `bad${bad}`.padEnd(64, "0").slice(0, 64),
          venue: null,
          dates: { set: bad, travelIn: null, showDays: [], travelOut: null },
        },
      ];
      const out = partitionMeShows(shows, today);
      expect(out.featured, `${bad} must NOT be featured (rolls over silently)`).toBeNull();
      expect(
        out.undated.map((s) => s.id),
        `${bad} must land in undated`,
      ).toEqual([`bad-${bad}`]);
    }
  });

  it("R14: resolveDisplayDate falls through invalid earlier field to valid fallback", () => {
    // Pre-R14 split-brain: partition uses fallback (showDays[0]),
    // render uses set (invalid → normalized → wrong date). Confirm
    // the shared resolver picks the valid fallback so render +
    // partition agree.
    expect(
      resolveDisplayDate({
        set: "2026-02-31", // calendar-impossible
        travelIn: null,
        showDays: ["2026-03-05"],
        travelOut: null,
      }),
    ).toBe("2026-03-05");
    expect(
      resolveDisplayDate({
        set: "TBD",
        travelIn: "2026-04-01",
        showDays: [],
        travelOut: null,
      }),
    ).toBe("2026-04-01");
  });

  it("R13: leap-year valid dates (2024-02-29) survive the round-trip check", () => {
    // Defensive: 2024 IS a leap year, so 2024-02-29 round-trips
    // cleanly. The gate must not over-reject valid leap dates.
    const shows: CrewShowSummary[] = [
      {
        id: "leap",
        slug: "leap",
        title: "Leap day",
        shareToken: "leap",
        venue: null,
        dates: { set: "2024-02-29", travelIn: null, showDays: [], travelOut: null },
      },
    ];
    const out = partitionMeShows(shows, today);
    expect(out.featured?.show.id).toBe("leap");
    expect(out.past.map((p) => p.show.id)).toEqual([]); // featured = leap, no remaining past
    expect(out.undated).toEqual([]);
  });

  it("R12 F1: invalid ISO format (2026-13-99) is rejected", () => {
    const shows: CrewShowSummary[] = [
      {
        id: "bad-month",
        slug: "bad",
        title: "Bad month",
        shareToken: "bad",
        venue: null,
        dates: { set: "2026-13-99", travelIn: null, showDays: [], travelOut: null },
      },
    ];
    const out = partitionMeShows(shows, today);
    // 2026-13-99 doesn't match the regex AND fails Date.parse — undated.
    expect(out.featured).toBeNull();
    expect(out.undated.map((s) => s.id)).toEqual(["bad-month"]);
  });

  it("R1 F1: multi-day show whose set day was yesterday but showDays includes today is NOT past", () => {
    // Brief §5.1 Past rule: "all shows ended (`dates.set < today` AND no
    // upcoming show-day)". A show with set=yesterday, showDays=[today,
    // tomorrow] is STILL ACTIVE — it must NOT land in past. Multi-show
    // scenario forces the divergence: a separate truly-future show
    // (Aug 1) becomes featured; the active multi-day MUST land in
    // upcoming (since it's not ended), NOT in past.
    const shows: CrewShowSummary[] = [
      {
        id: "future",
        slug: "future",
        title: "Future Show",
        shareToken: "future",
        venue: null,
        dates: { set: "2026-08-01", travelIn: null, showDays: [], travelOut: null },
      },
      {
        id: "active",
        slug: "active",
        title: "Active Multi-day",
        shareToken: "active",
        venue: null,
        dates: {
          set: "2026-05-14", // yesterday
          travelIn: "2026-05-13",
          showDays: ["2026-05-15", "2026-05-16"], // today + tomorrow
          travelOut: "2026-05-17",
        },
      },
    ];
    const out = partitionMeShows(shows, today);
    expect(out.featured?.show.id).toBe("active"); // Active show is "soonest"
    expect(out.upcoming.map((p) => p.show.id)).toEqual(["future"]);
    expect(out.past).toEqual([]);
  });

  it("R1 F1: show with set+travelIn before today and travelOut tomorrow is NOT past", () => {
    // Travel-out in the future also indicates the show isn't ended.
    const shows: CrewShowSummary[] = [
      {
        id: "wrap",
        slug: "wrap",
        title: "Wrap-up day",
        shareToken: "wrap",
        venue: null,
        dates: {
          set: "2026-05-12",
          travelIn: "2026-05-11",
          showDays: ["2026-05-13", "2026-05-14"], // both past
          travelOut: "2026-05-16", // future
        },
      },
    ];
    const out = partitionMeShows(shows, today);
    expect(out.featured?.show.id).toBe("wrap");
    expect(out.past).toEqual([]);
  });

  it("R1 F1: truly-ended show (all dates past) IS past", () => {
    const shows: CrewShowSummary[] = [
      {
        id: "active",
        slug: "active",
        title: "Active",
        shareToken: "active",
        venue: null,
        dates: { set: "2026-05-20", travelIn: null, showDays: [], travelOut: null },
      },
      {
        id: "ended",
        slug: "ended",
        title: "Truly ended",
        shareToken: "ended",
        venue: null,
        dates: {
          set: "2026-04-10",
          travelIn: "2026-04-09",
          showDays: ["2026-04-11", "2026-04-12"],
          travelOut: "2026-04-13",
        },
      },
    ];
    const out = partitionMeShows(shows, today);
    expect(out.featured?.show.id).toBe("active");
    expect(out.past.map((p) => p.show.id)).toEqual(["ended"]);
  });

  it("R2 F1: active multi-day show's chipAnchor is the earliest known date >= today (NOT display date)", () => {
    // The whole point of the R2 F1 fix: an active multi-day show with
    // set=2026-05-14 + showDays=[2026-05-15] + travelOut=2026-05-16 on
    // today=2026-05-15 must chip as "Today" (anchor=2026-05-15), not
    // "Ended" (anchor=2026-05-14, the display date). Pre-fix, the chip
    // helper read display date and rendered Ended for an actively-on-
    // site crew member.
    const shows: CrewShowSummary[] = [
      {
        id: "active",
        slug: "active",
        title: "Active Multi-day",
        shareToken: "active",
        venue: null,
        dates: {
          set: "2026-05-14",
          travelIn: "2026-05-13",
          showDays: ["2026-05-15", "2026-05-16"],
          travelOut: "2026-05-17",
        },
      },
    ];
    const out = partitionMeShows(shows, today);
    expect(out.featured?.show.id).toBe("active");
    // Earliest known date >= today (2026-05-15). That'll chip as "Today".
    expect(out.featured?.chipAnchor).toBe("2026-05-15");
  });

  it("R2 F1: ended show's chipAnchor is the most recent known date (for 'Ended N days ago')", () => {
    const shows: CrewShowSummary[] = [
      {
        id: "ended",
        slug: "ended",
        title: "Ended",
        shareToken: "ended",
        venue: null,
        dates: {
          set: "2026-05-08",
          travelIn: "2026-05-07",
          showDays: ["2026-05-09", "2026-05-10"],
          travelOut: "2026-05-11", // most recent of the past dates
        },
      },
    ];
    const out = partitionMeShows(shows, today);
    expect(out.featured?.show.id).toBe("ended");
    expect(out.featured?.chipAnchor).toBe("2026-05-11");
  });

  it("R6: ended shows sorted by chipAnchor (actual end date) descending, NOT by display date", () => {
    // Brief §5.1 all-past branch: featured = most recent past show.
    // For multi-day shows the "most recent" must be measured by the
    // ACTUAL END date (most recent known date), not by the display
    // date (set ?? travelIn ?? showDays[0]). Pre-fix: ended shows
    // sorted by display date — a long multi-day show that started
    // earlier but ended LATER lost to a shorter show with a later set.
    //
    // showLong: set=2026-04-01 (earlier display); travelOut=2026-05-10
    //           (most recent ending; chipAnchor=2026-05-10).
    // showShort: set=2026-04-20 (later display); travelOut=2026-04-21
    //            (chipAnchor=2026-04-21).
    //
    // showLong ended MORE RECENTLY (May 10 > Apr 21); brief contract
    // says it features. Pre-fix sorted by display date → showShort
    // (Apr 20 > Apr 1) — WRONG.
    const shows: CrewShowSummary[] = [
      {
        id: "showLong",
        slug: "long",
        title: "Long Multi-day",
        shareToken: "long",
        venue: null,
        dates: {
          set: "2026-04-01",
          travelIn: "2026-03-31",
          showDays: ["2026-04-15", "2026-05-08"],
          travelOut: "2026-05-10", // most recent end
        },
      },
      {
        id: "showShort",
        slug: "short",
        title: "Short Show",
        shareToken: "short",
        venue: null,
        dates: {
          set: "2026-04-20",
          travelIn: "2026-04-19",
          showDays: ["2026-04-20"],
          travelOut: "2026-04-21",
        },
      },
    ];
    const out = partitionMeShows(shows, today);
    expect(out.featured?.show.id).toBe("showLong"); // Most recent end wins
    expect(out.past.map((p) => p.show.id)).toEqual(["showShort"]);
  });

  it("R5 F2: two future shows ordered by display date, NOT by chipAnchor (when display date >= today)", () => {
    // Brief §5.1 "Most soonest" = earliest display date (set ??
    // travelIn ?? showDays[0]) >= today. For purely-future shows, the
    // sort key MUST be display date, NOT chipAnchor — otherwise a show
    // whose travelIn is earlier (chipAnchor) but whose set/display is
    // later would incorrectly feature ahead of a show with an earlier
    // set date.
    //
    // showA: set=2026-05-20, travelIn=2026-05-16. Display=set=2026-05-20.
    //         chipAnchor=earliest known >= today = travelIn=2026-05-16.
    // showB: set=2026-05-18, travelIn=2026-05-18. Display=set=2026-05-18.
    //         chipAnchor=2026-05-18.
    //
    // Brief contract: showB features (set=May 18) ahead of showA
    // (set=May 20). Pre-fix sort by chipAnchor would feature showA
    // (chipAnchor=May 16) — WRONG.
    const shows: CrewShowSummary[] = [
      {
        id: "showA",
        slug: "a",
        title: "Show A — early travel-in",
        shareToken: "a",
        venue: null,
        dates: {
          set: "2026-05-20",
          travelIn: "2026-05-16",
          showDays: ["2026-05-21"],
          travelOut: "2026-05-22",
        },
      },
      {
        id: "showB",
        slug: "b",
        title: "Show B — earlier set",
        shareToken: "b",
        venue: null,
        dates: {
          set: "2026-05-18",
          travelIn: "2026-05-18",
          showDays: ["2026-05-19"],
          travelOut: "2026-05-20",
        },
      },
    ];
    const out = partitionMeShows(shows, today);
    expect(out.featured?.show.id).toBe("showB"); // Earlier display date wins.
    expect(out.upcoming.map((p) => p.show.id)).toEqual(["showA"]);
  });

  it("R2 F1: purely-future show's chipAnchor matches its earliest known date (set in this case)", () => {
    const shows: CrewShowSummary[] = [
      {
        id: "future",
        slug: "future",
        title: "Future",
        shareToken: "future",
        venue: null,
        dates: {
          set: "2026-05-20",
          travelIn: "2026-05-19", // earliest >= today
          showDays: ["2026-05-21"],
          travelOut: "2026-05-22",
        },
      },
    ];
    const out = partitionMeShows(shows, today);
    expect(out.featured?.show.id).toBe("future");
    expect(out.featured?.chipAnchor).toBe("2026-05-19");
  });

  it("R1 F1: featured for an active multi-day show uses the future-most relevant date for chip math", () => {
    // The featured card sorts by display date (set ?? travelIn ?? showDays[0]).
    // For an active show with set=yesterday + showDays=[today,…], display
    // date stays as set (yesterday); the chip will read "Ended" if we
    // computed against display date. Brief §8 chip rules: an active show
    // with set < today should still chip per its FUTURE anchor (the
    // earliest future show day OR travelOut). The featured-pick contract
    // is what this test pins; chip-tone is a downstream concern for the
    // page's chipToneClass to handle separately.
    const shows: CrewShowSummary[] = [
      {
        id: "active",
        slug: "active",
        title: "Active Multi-day",
        shareToken: "active",
        venue: null,
        dates: {
          set: "2026-05-14",
          travelIn: null,
          showDays: ["2026-05-15"],
          travelOut: "2026-05-16",
        },
      },
    ];
    const out = partitionMeShows(shows, today);
    expect(out.featured?.show.id).toBe("active");
    expect(out.upcoming).toEqual([]);
    expect(out.past).toEqual([]);
  });

  it("falls back through dates.set → dates.travelIn → dates.showDays[0]", () => {
    // dates.set absent → use travelIn.
    const shows: CrewShowSummary[] = [
      {
        id: "a",
        slug: "a",
        title: "A",
        shareToken: "a".repeat(64),
        venue: null,
        dates: { set: null, travelIn: "2026-05-20", showDays: [], travelOut: null },
      },
      // dates.set + travelIn absent → use showDays[0].
      {
        id: "b",
        slug: "b",
        title: "B",
        shareToken: "b".repeat(64),
        venue: null,
        dates: { set: null, travelIn: null, showDays: ["2026-06-01"], travelOut: null },
      },
    ];
    const out = partitionMeShows(shows, today);
    expect(out.featured?.show.id).toBe("a"); // earliest future via travelIn
    expect(out.upcoming.map((p) => p.show.id)).toEqual(["b"]); // showDays[0] sort
  });
});
