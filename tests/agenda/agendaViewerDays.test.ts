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

  test("an UNPARSEABLE row between parseable ones fails open", () => {
    // Whole-diff review, HIGH. Date-completeness alone passes here: May 5 is located at row 0,
    // so |L| == |R|. But row 1's ownership is unknown, and if it is a continuation of May 5 it
    // is the viewer's own day being folded and unmarked -- the worst outcome this feature has.
    const r = visibleAgendaDaysForViewer(
      ext(["Tuesday, May 5, 2026", "Day 1 continued", "Wednesday, May 6, 2026"]),
      viewerDates(["2026-05-05"]),
      ["2026-05-05"],
    );
    expect(r).toEqual({ kind: "all" });
  });

  test("a row naming TWO dates is unidentifiable, even though it parses", () => {
    // Whole-diff review R2, HIGH. parseIsoFromDayLabel calls .match() WITHOUT /g, so it
    // returns only the FIRST date in a label. A combined row therefore reports itself as
    // May 5 alone:
    //
    //   ["Tuesday, May 5, 2026 / Wednesday, May 6, 2026", "Wednesday, May 6, 2026"]
    //
    // With a May 6 assignment that yields { rows: [1] } and folds row 0 -- a row that
    // EXPLICITLY includes May 6, the viewer's own day. The null guard added for the last
    // HIGH cannot catch this: every row parses. Fourth distinct input shape in which this
    // rule folded a day the viewer works, so the guard is on ambiguity itself, not on this
    // particular label spelling.
    const r = visibleAgendaDaysForViewer(
      ext(["Tuesday, May 5, 2026 / Wednesday, May 6, 2026", "Wednesday, May 6, 2026"]),
      viewerDates(["2026-05-06"]),
      ["2026-05-06"],
    );
    expect(r).toEqual({ kind: "all" });
  });

  test("where the two label scans DISAGREE, the result is fail-open", () => {
    // `distinctLabelDates` re-implements parseIsoFromDayLabel's regex with /g rather than
    // calling it, so the two can disagree, and this pins that every disagreement lands safe.
    //
    // The disagreement case: the FIRST regex hit has an unknown month name. parseIsoFromDayLabel
    // takes that first hit, fails the MONTHS lookup and returns null WITHOUT trying the next
    // hit; the counter skips it and counts the later real date. So parse says "unidentifiable"
    // (null) while the counter says "exactly one" -- and the row must still fail open, which the
    // null guard delivers.
    //
    // Probed before being written: parseIso=null, counter=1, result=all.
    for (const label of [
      "Foo 5, 2026 / Wednesday, May 6, 2026",
      "Zebra 99, 2026 and May 6, 2026",
    ]) {
      const r = visibleAgendaDaysForViewer(
        ext([label, "Thursday, May 7, 2026"]),
        viewerDates(["2026-05-06"]),
        ["2026-05-06"],
      );
      expect(r, `disagreement on "${label}" must fail open`).toEqual({ kind: "all" });
    }
  });

  test("a label naming a second day WITHOUT a second full date is ambiguous", () => {
    // Whole-diff review R4, HIGH -- the fifth counterexample, and the one that showed a
    // date-shaped guard is not enough. "Wednesday the 6th" carries no Month-day-year token, so
    // counting full dates saw ONE unambiguous May 5 row and folded it for a Wednesday viewer,
    // while the label plainly covers their day.
    //
    // Worth recording: my own property test missed this too, because its ground-truth scanner
    // also only recognises full dates. An independent reimplementation is only as good as the
    // shapes it knows about.
    const r = visibleAgendaDaysForViewer(
      ext(["Tuesday, May 5, 2026 / Wednesday the 6th", "Wednesday, May 6, 2026"]),
      viewerDates(["2026-05-06"]),
      ["2026-05-06"],
    );
    expect(r).toEqual({ kind: "all" });
  });

  test("each ambiguity signal fires on its own", () => {
    // One case per signal, so deleting any single one reds a test rather than being masked by
    // the others -- the dead-guard failure this suite already hit once.
    const cases: [string, string][] = [
      // No weekday names and no ordinal, so the date-count signal is the ONLY one that can
      // fire. The obvious spelling ("Tuesday, May 5 / Wednesday, May 6") also trips the
      // weekday signal, which left the date-count guard deletable with every test still
      // green -- the same dead-guard shape this suite hit once already.
      ["May 5, 2026 / May 6, 2026", "two full dates, no weekday words"],
      // R5 HIGH, the sixth counterexample: a second day written WITHOUT a year. One full date,
      // one weekday, no ordinal -- invisible to all three signals until date counting dropped
      // the year requirement.
      ["Tuesday, May 5, 2026 / May 6", "a second month-day with no year"],
      // A plural day span must not be folded. Note precisely WHY this passes, because the
      // obvious reading is wrong: it is not the strip's singular `\bday\s` restriction doing
      // the work. Mutation-checked -- widening the strip to `days?` leaves this green, because
      // the residual "-2" is itself a day number and trips the leftover check anyway. The
      // singular form is kept as the more conservative choice, not as a pinned invariant.
      ["Days 1-2, May 5, 2026", "a plural day span"],
      // R6 HIGH: same month-day, different YEAR. One pair, and four-digit years evade the
      // day-number check because no word boundary exists inside them.
      ["May 5, 2026 / May 5, 2027", "the same month-day in two years"],
      // R7 HIGH: the ordinal-position strip was GLOBAL, so any number of "Day N" phrases
      // passed. One names a single day; two do not.
      ["Tuesday, May 5, 2026 — Day 1 / Day 2", "two ordinal-position phrases"],
      // R8 HIGH, all six. The first four are second DATES in shapes the month-name scan alone
      // did not read. The last two are why counting stopped being the mechanism: each contains
      // exactly ONE weekday / ONE Day-N, so a "more than one" threshold read them as single-day.
      // What separates them is position -- these sit AFTER the date, so they add a day rather
      // than qualify one.
      ["May 5, 2026 / May 6th, 2026", "an ordinal-suffixed second date"],
      ["May 5, 2026 / 05/06/2026", "a slash-format second date"],
      ["May 5, 2026 / 2026-05-06", "an ISO second date"],
      ["May 5, 2026 / 6 May 2026", "a day-first second date"],
      ["May 5, 2026 / Wednesday", "a trailing weekday, the label's only one"],
      ["May 5, 2026 / Day 2", "a trailing Day-N, the label's only one"],
      // LEADING second-day references. Found by sweeping the positional rule's blind side
      // before review reported it: examining only trailing text sees none of these.
      ["Wednesday / Tuesday, May 5, 2026", "a second weekday BEFORE the date"],
      ["Wed–Thu, Tuesday, May 5, 2026", "an abbreviated weekday span, leading"],
      ["Mon/Tue, May 5, 2026", "a slashed weekday pair, leading"],
      ["Wednesday the 6th / Tuesday, May 5, 2026", "a leading spoken ordinal date"],
      // The ordinal is the ONLY signal here: one weekday, no second date, nothing trailing.
      // Pins the whole-label ordinal scan, which the case above cannot (it is caught by the
      // two-weekday rule first).
      ["the 6th and Tuesday, May 5, 2026", "a leading ordinal, no other signal"],
      ["Tuesday, May 5, 2026 / Wednesday", "two weekday names, one date"],
      ["Tuesday, May 5, 2026 and the 6th", "an ordinal day reference"],
    ];
    for (const [label, why] of cases) {
      const r = visibleAgendaDaysForViewer(
        ext([label, "Thursday, May 7, 2026"]),
        viewerDates(["2026-05-05"]),
        ["2026-05-05"],
      );
      expect(r, `${why}: "${label}" must fail open`).toEqual({ kind: "all" });
    }
  });

  test("a single date repeated within one label is NOT ambiguous", () => {
    // The over-fire guard. "Tuesday, May 5, 2026 (May 5, 2026 rehearsal)" names one DATE
    // twice; treating any second regex hit as ambiguity would fail open on a row that is
    // perfectly identifiable, quietly disabling the feature for chatty labels.
    const r = visibleAgendaDaysForViewer(
      ext(["Tuesday, May 5, 2026 (May 5, 2026 rehearsal)", "Wednesday, May 6, 2026"]),
      viewerDates(["2026-05-05"]),
      ["2026-05-05"],
    );
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
    // Labels must PARSE. An unparseable fixture ("Day 1") is caught by the
    // unidentifiable-row guard first, so this stopped exercising the empty-R path it names --
    // found by mutating the guard and watching this test stay green.
    for (const restriction of [[], ["2026-12-31"]]) {
      const r = visibleAgendaDaysForViewer(
        ext(["Tuesday, May 5, 2026"]),
        viewerDates(restriction),
        restriction,
      );
      expect(r.kind === "subset" && r.rows.size === 0).toBe(false);
      expect(r).toEqual({ kind: "all" });
    }
  });

  test("a viewer day that NO row mentions fails open, even when every row parses", () => {
    // The completeness rule's own case, isolated. Every label here parses and none is
    // ambiguous, so neither the unidentifiable-row guard nor the multi-date guard fires --
    // completeness is the ONLY thing standing between this input and a subset.
    //
    // Found by mutation: deleting the `located.size !== R.size` clause left all 16 tests green,
    // because the guards added in later review rounds fire first on every other fixture. A rule
    // nothing exercises is a rule a future refactor deletes.
    const r = visibleAgendaDaysForViewer(
      ext(["Tuesday, May 5, 2026"]),
      viewerDates(["2026-05-05", "2026-05-06"]),
      ["2026-05-05", "2026-05-06"],
    );
    // The viewer works May 6 and this PDF has no May 6 block at all -- partial knowledge, so
    // the spec's fail-open-on-partial-resolution rule applies (spec §3, constraint 3).
    expect(r).toEqual({ kind: "all" });
  });

  test("REAL corpus labels still fold — the over-fire guard", () => {
    // The whitelist rule fails open on anything it does not fully understand, so the risk it
    // carries is the opposite of the one it fixes: over-firing on ordinary labels would disable
    // the feature in production while every counterexample test stayed green.
    //
    // These are actual labels from the parser corpus (tests/crew/agendaDayForToday.test.ts),
    // including the pdfjs glyph-split forms where a day or year arrives with spaces inside it.
    const corpus: [string, string][] = [
      ["Friday, Sept. 18, 2026", "2026-09-18"],
      ["Monday, May 4, 2026", "2026-05-04"],
      ["Thursday, October 9, 202 5", "2025-10-09"], // year split by pdfjs
      ["Tuesday May 13,2024", "2024-05-13"], // no comma after the weekday
      ["Tuesday, March 2 4 , 202 6", "2026-03-24"], // day AND year split
      ["Wednesday, March 2 5, 2026", "2026-03-25"], // day split
      // "Day N - <date>" is one of the commonest agenda headings there is, and the whitelist
      // rejected it until an over-fire sweep caught it: the "1" reads as a day number unless
      // the ordinal-position phrase is removed first. Singular only -- see the Days 1-2 case.
      ["Day 1 - Tuesday, May 5, 2026", "2026-05-05"],
      // "Day 2 - <date>" folds too, and deliberately. A leading ordinal-position phrase NAMES
      // the date it precedes -- "the show's second day, which is Tuesday" -- so treating Day 2
      // differently from Day 1 would be incoherent. Listed because a sweep of leading forms
      // initially classed this as a leak; the expectation was wrong, not the rule.
      ["DAY 2 — Tuesday, May 5, 2026", "2026-05-05"],
      ["Tuesday, May 5, 2026 (Show Day)", "2026-05-05"],
      ["Tuesday, May 5, 2026 | Ballroom A", "2026-05-05"],
      // R6 LOW: the corpus list claimed seven labels and held six, omitting this one from
      // tests/crew/agendaDayForToday.test.ts:23. It passed anyway, but a guard that says
      // "the corpus" must actually be the corpus.
      ["Wednesday , June 2 5 , 202 5", "2025-06-25"],
      // R6 MEDIUM: month PREFIXES used to match, so a venue or track name disabled folding for
      // the whole extraction. These are the exact words the reviewer named.
      ["Tuesday, May 5, 2026 — Marriott", "2026-05-05"],
      ["Tuesday, May 5, 2026 - Marketing Summit", "2026-05-05"],
      ["Tuesday, May 5, 2026 (Augusta Room)", "2026-05-05"],
      ["Tuesday, May 5, 2026 — Decision Makers Panel", "2026-05-05"],
      ["Tuesday, May 5, 2026 at 9:00 AM", "2026-05-05"], // a clock time is not a day number
      // R7 MEDIUM: ordinary numeric furniture in a heading. Every one of these names a single
      // day, and an earlier "any leftover number" rule rejected them all -- which would have
      // disabled folding across real shows while every counterexample test stayed green.
      ["2025 Awards — Tuesday, May 5, 2026", "2026-05-05"], // a free-floating year is metadata
      ["Tuesday, May 5, 2026 — Track 2", "2026-05-05"],
      ["Tuesday, May 5, 2026 (Room 54)", "2026-05-05"],
      ["Tuesday, May 5, 2026 — 8th Floor", "2026-05-05"], // an ordinal without "the"
      ["Tuesday, May 5, 2026 Session 3", "2026-05-05"],
      ["Day #1 — Tuesday, May 5, 2026", "2026-05-05"],
      ["Tuesday, May 5, 2026 at 9 AM", "2026-05-05"], // colonless time
      // R8 MEDIUM: an ordinal that modifies a NOUN is not a date. The discriminator is what
      // follows it -- a date ordinal ends its phrase ("and the 6th"), these do not.
      ["Tuesday, May 5, 2026 — The 8th Floor", "2026-05-05"],
      ["Tuesday, May 5, 2026 — The 6th Annual Awards", "2026-05-05"],
      ["Tuesday, May 5, 2026 — The 2nd Session", "2026-05-05"],
    ];
    for (const [label, iso] of corpus) {
      const r = visibleAgendaDaysForViewer(
        ext([label, "Thursday, December 31, 2099"]),
        [iso],
        [iso],
      );
      expect(r, `real corpus label must still fold: "${label}"`).toEqual({
        kind: "subset",
        rows: new Set([0]),
      });
    }
  });

  test("a low-confidence or empty extraction folds nothing", () => {
    // The component renders nothing for these, so there is nothing to fold. Catches a
    // matcher that returns a subset for a link that never renders rows.
    const low = { ...ext(["Tuesday, May 5, 2026"]), confidence: "low" as const };
    expect(visibleAgendaDaysForViewer(low, viewerDates(["2026-05-05"]), ["2026-05-05"])).toEqual({
      kind: "all",
    });
    expect(
      visibleAgendaDaysForViewer(ext([]), viewerDates(["2026-05-05"]), ["2026-05-05"]),
    ).toEqual({ kind: "all" });
  });

  test("unparseable jsonb folds nothing rather than throwing", () => {
    // Raw jsonb arrives unvalidated; normalization returning null must fail open.
    for (const bad of [null, undefined, 42, "nope", {}, { days: "not-an-array" }]) {
      expect(visibleAgendaDaysForViewer(bad, viewerDates(["2026-05-05"]), ["2026-05-05"])).toEqual({
        kind: "all",
      });
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
