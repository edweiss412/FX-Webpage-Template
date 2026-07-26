/**
 * tests/agenda/agendaViewerDays.test.ts — plan T1.
 *
 * The matcher answers ONE question: which rows of ONE extraction belong to this viewer,
 * or "all of them" when that cannot be established completely. Every case below names
 * the failure mode it catches, and several exist because a probe of the rule (spec §3)
 * disagreed with prose that five review rounds had accepted.
 *
 * Node environment is correct: this is a pure function, no DOM.
 */
import { describe, expect, test } from "vitest";

import { visibleAgendaDaysForViewer } from "@/lib/crew/agendaViewerDays";
import type { AgendaExtraction, AgendaSession } from "@/lib/agenda/types";

const sess = (time: string, title = "S"): AgendaSession => ({
  time,
  title,
  room: null,
  tracks: [],
  drift: null,
});

/** Mirrors tests/crew/agendaDayForToday.test.ts's builder: date is ALWAYS null, as the
 *  live extractor writes it (spec §2.5 fact 1). */
const ext = (labels: string[]): AgendaExtraction => ({
  confidence: "high",
  corrections: 0,
  extractorVersion: 2,
  days: labels.map((dayLabel) => ({ dayLabel, date: null, sessions: [sess("9:00am")] })),
});

/** The show's aggregate dates: travel-in + three show days. */
const AGG = ["2026-05-04", "2026-05-05", "2026-05-06", "2026-05-07"];

/** The caller passes R pre-intersected (spec §2), so the fixtures do that intersection here
 *  rather than making the matcher recompute it. */
const viewerDates = (restriction: readonly string[]): string[] =>
  AGG.filter((d) => restriction.includes(d));

describe("visibleAgendaDaysForViewer — completeness and fail-open", () => {
  test("every restriction day located → those row indices", () => {
    const r = visibleAgendaDaysForViewer(
      ext(["Tuesday, May 5, 2026", "Wednesday, May 6, 2026", "Thursday, May 7, 2026"]),
      viewerDates(["2026-05-05", "2026-05-06"]),
      ["2026-05-05", "2026-05-06"],
    );
    // Catches a matcher that returns every row and leaves filtering to the caller.
    expect(r).toEqual({ kind: "subset", rows: new Set([0, 1]) });
  });

  test("PARTIAL location fails open — the worst outcome this feature can produce", () => {
    // May 5 parses; May 6's label is positional; a THIRD label parses, so
    // `!someDateParsed` is false and the positional fallback cannot fire.
    const r = visibleAgendaDaysForViewer(
      ext(["Monday, May 4, 2026", "Tuesday, May 5, 2026", "Day 3"]),
      viewerDates(["2026-05-05", "2026-05-06"]),
      ["2026-05-05", "2026-05-06"],
    );
    // Catches folding May 6 — a day the viewer works — while the page looks normal.
    expect(r).toEqual({ kind: "all" });
  });

  test("completeness compares distinct DATES, not located rows", () => {
    // Two May 5 blocks + an unparseable May 6. Counting ROWS gives 2 == 2 and would
    // wrongly declare completeness; counting DATES gives 1 != 2 and fails open.
    const r = visibleAgendaDaysForViewer(
      ext(["Tuesday, May 5, 2026", "Tuesday, May 5, 2026", "Day 3"]),
      viewerDates(["2026-05-05", "2026-05-06"]),
      ["2026-05-05", "2026-05-06"],
    );
    expect(r).toEqual({ kind: "all" });
  });

  test("a date appearing twice, both the viewer's → both rows returned", () => {
    const r = visibleAgendaDaysForViewer(
      ext(["Tuesday, May 5, 2026", "Tuesday, May 5, 2026"]),
      viewerDates(["2026-05-05"]),
      ["2026-05-05"],
    );
    // Catches count-based completeness, which would make |located| > |R| and fail open
    // on an extraction that was in fact understood completely.
    expect(r).toEqual({ kind: "subset", rows: new Set([0, 1]) });
  });

  test("a travel-day assignment FOLDS the travel row too", () => {
    const r = visibleAgendaDaysForViewer(
      ext(["Monday, May 4, 2026", "Tuesday, May 5, 2026", "Wednesday, May 6, 2026"]),
      viewerDates(["2026-05-04", "2026-05-05"]),
      ["2026-05-04", "2026-05-05"],
    );
    // Catches an R narrowed to visibleShowDays' show-day-only output. Note the symptom:
    // that narrowing does NOT fail open, it returns a subset that folds the assigned
    // travel row — so asserting { kind: "all" } here would pass while preserving the bug.
    expect(r).toEqual({ kind: "subset", rows: new Set([0, 1]) });
  });

  test("sheet/PDF date disagreement fails open", () => {
    // The viewer works June 25, the extraction HAS a June 25 block, but the show's
    // aggregate does not contain that date. Found by spiking the rule, not by review.
    const r = visibleAgendaDaysForViewer(
      ext(["Tuesday, May 5, 2026", "Wednesday , June 2 5 , 202 6"]),
      viewerDates(["2026-05-05", "2026-06-25"]),
      ["2026-05-05", "2026-06-25"],
    );
    // Catches completeness passing on May 5 alone and folding the June 25 row.
    expect(r).toEqual({ kind: "all" });
  });

  test("a restriction date in NEITHER the aggregate nor the extraction still folds", () => {
    const r = visibleAgendaDaysForViewer(
      ext(["Tuesday, May 5, 2026", "Wednesday, May 6, 2026"]),
      viewerDates(["2026-05-05", "2026-06-25"]),
      ["2026-05-05", "2026-06-25"],
    );
    // Catches an over-broad disagreement guard, which would fail open forever for any
    // viewer whose assignment mentions a date the PDF never covers.
    expect(r).toEqual({ kind: "subset", rows: new Set([0]) });
  });

  test("nothing parses and the positional fallback is unavailable → fail open", () => {
    const r = visibleAgendaDaysForViewer(ext(["Day 1", "Day 2"]), viewerDates(["2026-05-05"]), [
      "2026-05-05",
    ]);
    expect(r).toEqual({ kind: "all" });
  });

  test("never returns an empty subset", () => {
    // The empty subset is the dangerous value: "fold iff my index is absent" would fold
    // every day including the viewer's. The matcher must return { kind: "all" } instead.
    for (const restriction of [[], ["2026-12-31"]]) {
      const r = visibleAgendaDaysForViewer(ext(["Day 1"]), viewerDates(restriction), restriction);
      expect(r.kind === "subset" && r.rows.size === 0).toBe(false);
    }
  });

  test("expected indices derive from the fixture, not from literals", () => {
    // A 2-day fixture must be unable to satisfy a 4-day assertion.
    const labels = ["Tuesday, May 5, 2026", "Wednesday, May 6, 2026"];
    const restriction = ["2026-05-05", "2026-05-06"];
    const r = visibleAgendaDaysForViewer(ext(labels), viewerDates(restriction), restriction);
    expect(r).toEqual({ kind: "subset", rows: new Set(labels.map((_, i) => i)) });
  });
});
