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
 * KNOWN CEILING, and the reason this file is not sufficient on its own. It recognises only full
 * `Month day, year` tokens, so it is blind to a label that names a second day in prose
 * ("… / Wednesday the 6th"). Review R4 found exactly that input, and this search did NOT flag it —
 * the implementation and the ground truth were blind in the same place. An independent
 * reimplementation is only as independent as the shapes it knows about. The weekday-name and
 * ordinal signals are pinned by explicit cases in agendaViewerDays.test.ts instead.
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
  for (const m of collapsed.matchAll(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})\s*,?\s*(\d{4})\b/g)) {
    const mo = M[m[1]!.toLowerCase().replace(/\.$/, "")];
    if (mo) out.push(`${m[3]}-${String(mo).padStart(2, "0")}-${m[2]!.padStart(2, "0")}`);
  }
  return out;
}

const VOCAB = [
  "Tuesday, May 5, 2026",
  "Wednesday, May 6, 2026",
  "Monday, May 4, 2026",
  "May. 5, 2026",
  "May 5, 2026 / May 6, 2026", // R2 HIGH: two dates, first-match-only reported the wrong one
  "Tuesday, May 5, 2026 (May 5, 2026 rehearsal)", // one date twice: must NOT fail open
  "Foo 5, 2026 / May 6, 2026", // the two scans disagree here
  "May 5, 2026 - May 7, 2026",
  "2 6 May 5, 2026", // pdfjs glyph-split digits
  "Tuesday, May 5, 2026 / Wednesday the 6th", // R4 HIGH: a second day in prose, no second date
  "May 5, 2026 / May 6, 2026", // two dates, no weekday words
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
  test("no 3-row combination folds a row that mentions a date the viewer is assigned", () => {
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
  });
});
