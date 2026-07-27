/**
 * THE invariant, searched rather than enumerated by hand.
 *
 * Four separate review rounds each found a different input that folded a day the viewer works,
 * and each time the fix was a new guard and one new example. That is whack-a-mole: it proves the
 * four known shapes are dead, not that a fifth does not exist. This searches the label space for
 * one.
 *
 * The property: **if a row's own label mentions a date the viewer is assigned, that row must not
 * be folded.** Ground truth comes from a scanner written independently of the implementation
 * (below), so the test cannot agree with the code by sharing its bug -- the failure mode of
 * asserting a function against itself.
 *
 * The vocabulary deliberately includes every historical bug shape: a combined two-date label
 * (R2 HIGH), a label repeating ONE date (the over-fire guard), an unparseable row between
 * parseable ones (R1 HIGH), a first-token-invalid-month label (the two-scan disagreement), plus
 * ranges, glyph-split digits, abbreviated and dotted months, and the empty label.
 */
import { describe, expect, test } from "vitest";

import { visibleAgendaDaysForViewer } from "@/lib/crew/agendaViewerDays";

const AGG = ["2026-05-04", "2026-05-05", "2026-05-06", "2026-05-07"];

const ext = (labels: string[]) => ({
  confidence: "high" as const,
  corrections: 0,
  extractorVersion: 2,
  days: labels.map((dayLabel) => ({
    dayLabel,
    date: null,
    sessions: [{ time: "9am", title: "S", room: null, tracks: [], drift: null }],
  })),
});

/**
 * Every date a label mentions — an INDEPENDENT reimplementation, not a call into the module under
 * test. If it shared `parseIsoFromDayLabel` it would inherit "first match only", which is exactly
 * the defect that produced the R2 HIGH, and the test would confirm the bug instead of catching it.
 *
 * KNOWN CEILING, narrowed but not removed. The oracle now reads optional years and ordinal
 * suffixes, so it sees the shapes that defeated its first version. It still cannot read a day
 * named in FREE PROSE ("and the following day"), which the implementation also cannot read and
 * which is filed as BL-AGENDA-PROSE-SECOND-DAY.
 *
 * WHAT THIS FILE STILL CANNOT PIN, measured rather than assumed. Mutation-checked after the
 * oracle was strengthened: reverting date-pair matching to full-dates-only, and deleting the
 * distinct-year check, BOTH leave this search green. The first is masked downstream (the leftover
 * check catches the residual month name anyway); the second needs a viewer assigned a date in a
 * second year, which this fixture's single-year aggregate cannot express. Both are pinned by
 * explicit cases in agendaViewerDays.test.ts instead. A search over a fixed fixture space proves
 * things about that space, not about the function.
 *
 * The history is the lesson. Version one recognised only full `Month day, year` tokens — exactly
 * what the implementation recognised — so it reported zero violations across 6912 combinations
 * while two reachable counterexamples sat in the label space. An oracle that shares the
 * implementation's blind spot proves nothing, however many cases it runs.
 */
function trueDates(label: string): string[] {
  const M: Record<string, number> = {
    january: 1,
    february: 2,
    march: 3,
    april: 4,
    may: 5,
    june: 6,
    july: 7,
    august: 8,
    september: 9,
    october: 10,
    november: 11,
    december: 12,
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    sept: 9,
    oct: 10,
    nov: 11,
    dec: 12,
  };
  const out: string[] = [];
  const collapsed = label.replace(/(?<=\d)\s+(?=\d)/g, "");
  // The year is OPTIONAL and an ordinal suffix is tolerated, so this oracle sees the shapes
  // review found after the first version was written: "/ May 6" (R5) and "the 6th" (R4). The
  // first version recognised only full Month-day-year tokens and was therefore blind in exactly
  // the same place as the implementation -- it reported zero violations while R4's and R5's
  // counterexamples were both reachable. An oracle that shares the bug proves nothing.
  for (const m of collapsed.matchAll(
    /\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?\s*,?\s*(\d{4})?/gi,
  )) {
    const mo = M[m[1]!.toLowerCase().replace(/\.$/, "")];
    if (mo) out.push(`${m[3] ?? "2026"}-${String(mo).padStart(2, "0")}-${m[2]!.padStart(2, "0")}`);
  }
  // Numeric forms and bare day-first, added when R12 showed the oracle was blind in exactly the
  // place the implementation was: it read only month-led dates, so a "/ 05-06-2026" or "/ 6 May"
  // second day was invisible to the search while being invisible to the code. The day-first scan
  // requires that no digit follows the month name -- a following digit means the month starts
  // its own month-led date and the leading number is furniture ("Day 1 May 5, 2026").
  for (const m of collapsed.matchAll(/\b(\d{4})([/.-])(\d{1,2})\2(\d{1,2})\b/g)) {
    out.push(`${m[1]}-${m[3]!.padStart(2, "0")}-${m[4]!.padStart(2, "0")}`);
  }
  for (const m of collapsed.matchAll(/\b(\d{1,2})([/.-])(\d{1,2})\2(\d{4})\b/g)) {
    out.push(`${m[4]}-${m[1]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}`);
  }
  for (const m of collapsed.matchAll(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\b(?!\s*,?\s*'?\d)/g,
  )) {
    const mo = M[m[2]!.toLowerCase()];
    if (mo) out.push(`2026-${String(mo).padStart(2, "0")}-${m[1]!.padStart(2, "0")}`);
  }
  return out;
}

const VOCAB = [
  "Tuesday, May 5, 2026",
  "Wednesday, May 6, 2026",
  "Monday, May 4, 2026",
  "May 5, 2026 / May 6, 2026", // R2 HIGH: two dates, first-match-only reported the wrong one
  "Tuesday, May 5, 2026 (May 5, 2026 rehearsal)", // one date twice: must NOT fail open
  "Foo 5, 2026 / May 6, 2026", // the two scans disagree here
  "May 5, 2026 - May 7, 2026",
  "Tuesday, May 5, 2026 / Wednesday the 6th", // R4 HIGH: a second day, no second full date
  "May 5, 2026 / May 6, 2026", // two dates, no weekday words
  "Tuesday, May 5, 2026 / May 6", // R5 HIGH: second month-day, no year
  "May 5, 2026 / May 5, 2027", // R6 HIGH: same month-day, two years
  "Day 1 - Tuesday, May 5, 2026", // over-fire guard: one day despite the "1"
  "Tuesday, May 5, 2026 — Marriott", // over-fire guard: month PREFIX in a venue name
  "May 5, 2026 / 05-06-2026", // R12 HIGH: a second date in a numeric shape the scan did not read
  "May 5, 2026 / 6 May", // R12 HIGH: day-first with no year
  "Day 1",
  "continued", // R1 HIGH: unidentifiable row between identifiable ones
  "",
];

const RESTRICTIONS = [
  ["2026-05-05"],
  ["2026-05-06"],
  ["2026-05-05", "2026-05-06"],
  ["2026-05-04", "2026-05-05"],
];

describe("visibleAgendaDaysForViewer — the never-fold-a-worked-day invariant", () => {
  // EXPLICIT TIMEOUT, deliberately. This is a combinatorial search, not a unit test: at
  // |VOCAB|^3 x |RESTRICTIONS| it runs tens of thousands of cases and takes seconds even when
  // healthy. Vitest's 5s default is not enough headroom on a loaded machine -- measured on this
  // repo, a parser generator test times out at 5s under load average 28 while passing in 24s
  // with room. A property test that flakes under parallel CI load gets deleted, so it is bounded
  // here rather than left to chance.
  test(
    "no 3-row combination folds a row that mentions a date the viewer is assigned",
    { timeout: 60_000 },
    () => {
      const violations: string[] = [];
      let checked = 0;

      for (const a of VOCAB) {
        for (const b of VOCAB) {
          for (const c of VOCAB) {
            const labels = [a, b, c];
            for (const restriction of RESTRICTIONS) {
              const viewerDates = AGG.filter((d) => restriction.includes(d));
              const r = visibleAgendaDaysForViewer(ext(labels), viewerDates, restriction);
              checked++;
              if (r.kind === "all") continue; // failing open never violates the invariant
              labels.forEach((label, i) => {
                const ownsAViewerDate = trueDates(label).some((d) => restriction.includes(d));
                if (ownsAViewerDate && !r.rows.has(i)) {
                  violations.push(
                    `folded row ${i} ("${label}") for restriction ${restriction.join()} in [${labels.join(" | ")}]`,
                  );
                }
              });
            }
          }
        }
      }

      // Derived from the vocabulary, so shrinking VOCAB cannot quietly weaken the search.
      expect(checked).toBe(VOCAB.length ** 3 * RESTRICTIONS.length);
      expect(violations.slice(0, 5), `${violations.length} violations`).toEqual([]);
    },
  );
});
