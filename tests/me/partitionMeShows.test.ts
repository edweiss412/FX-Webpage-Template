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

import { partitionMeShows } from "@/lib/me/partitionMeShows";
import type { CrewShowSummary } from "@/lib/data/listShowsForCrew";

const today = new Date(Date.UTC(2026, 4, 15)); // May 15 2026

function show(id: string, dateIso: string | null, title?: string): CrewShowSummary {
  return {
    id,
    slug: `slug-${id}`,
    title: title ?? `Show ${id}`,
    crewMemberId: `cm-${id}`,
    dates:
      dateIso === null
        ? null
        : { set: dateIso, travelIn: null, showDays: [], travelOut: null },
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
    expect(out.featured?.id).toBe("a");
    expect(out.upcoming).toEqual([]);
    expect(out.past).toEqual([]);
  });

  it("single past show → featured = that past show, no upcoming, no past list", () => {
    const shows = [show("a", "2026-05-01")];
    const out = partitionMeShows(shows, today);
    expect(out.featured?.id).toBe("a");
    expect(out.upcoming).toEqual([]);
    expect(out.past).toEqual([]);
  });

  it("today's show counts as future (not past)", () => {
    // Brief: 'most soonest' = earliest >= today.
    const shows = [show("a", "2026-05-15")];
    const out = partitionMeShows(shows, today);
    expect(out.featured?.id).toBe("a");
    expect(out.past).toEqual([]);
  });

  it("two future + one past → featured = nearest future, upcoming = remainder, past listed", () => {
    const shows = [
      show("near", "2026-05-20"),
      show("far", "2026-06-15"),
      show("done", "2026-04-10"),
    ];
    const out = partitionMeShows(shows, today);
    expect(out.featured?.id).toBe("near");
    expect(out.upcoming.map((s) => s.id)).toEqual(["far"]);
    expect(out.past.map((s) => s.id)).toEqual(["done"]);
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
    expect(out.featured?.id).toBe("u1"); // earliest future
    expect(out.upcoming.map((s) => s.id)).toEqual(["u2", "u3"]); // ascending
    expect(out.past.map((s) => s.id)).toEqual(["p1", "p2", "p3"]); // descending
  });

  it("all-past → featured = most recent past, past list excludes the featured", () => {
    const shows = [
      show("p1", "2026-04-15"),
      show("p2", "2026-03-15"),
      show("p3", "2026-02-15"),
    ];
    const out = partitionMeShows(shows, today);
    expect(out.featured?.id).toBe("p1"); // most recent past
    expect(out.upcoming).toEqual([]);
    expect(out.past.map((s) => s.id)).toEqual(["p2", "p3"]); // older past, excluding featured
  });

  it("show with null dates → excluded from all buckets (no display date to sort by)", () => {
    const shows = [
      show("a", "2026-05-20"),
      show("b", null, "No-date show"),
    ];
    const out = partitionMeShows(shows, today);
    expect(out.featured?.id).toBe("a");
    expect(out.upcoming).toEqual([]);
    expect(out.past).toEqual([]);
  });

  it("falls back through dates.set → dates.travelIn → dates.showDays[0]", () => {
    // dates.set absent → use travelIn.
    const shows: CrewShowSummary[] = [
      { id: "a", slug: "a", title: "A", crewMemberId: "cma",
        dates: { set: null, travelIn: "2026-05-20", showDays: [], travelOut: null } },
      // dates.set + travelIn absent → use showDays[0].
      { id: "b", slug: "b", title: "B", crewMemberId: "cmb",
        dates: { set: null, travelIn: null, showDays: ["2026-06-01"], travelOut: null } },
    ];
    const out = partitionMeShows(shows, today);
    expect(out.featured?.id).toBe("a"); // earliest future via travelIn
    expect(out.upcoming.map((s) => s.id)).toEqual(["b"]); // showDays[0] sort
  });
});
