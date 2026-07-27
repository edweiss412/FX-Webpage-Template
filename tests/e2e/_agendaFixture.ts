/**
 * The ONE agenda fixture behind both browser harnesses.
 *
 * It lives apart from the render script so the specs can import it directly: a spec cannot
 * import the COMPONENT (Playwright compiles loaded files with its own JSX factory, so React
 * rejects the result), but plain data has no such problem. That lets every expected count in
 * a spec be DERIVED from this fixture instead of typed as a literal.
 *
 * Why that matters here concretely: `agendaBreakdown.layout.spec.ts` asserted
 * `expect(sessionCount).toBe(2)` against markup it hand-transcribed. Pointed at the real
 * component the true count is 3, so the literal had been pinning the transcription rather
 * than the component. A hardcoded count cannot fail when the fixture grows -- it fails when
 * the fixture is CORRECT.
 */

/** One unbreakable 90-char token: the input for the "long titles wrap, not overflow" rule. */
export const LONG_TITLE =
  "AdaptingToUnpredictabilityInGlobalAssetManagementQuarterlyInvestorSummitKeynoteSessionXY";

const sess = (time: string, title: string) => ({
  time,
  title,
  room: null,
  tracks: [] as { label: string; title: string | null; room: string | null }[],
  drift: null,
});

/**
 * Row 0 carries BOTH comparison sessions -- a normal one and the 90-char token -- because a
 * session inside a folded <details> paints nothing and every rect reads zero. Rows 1 and 2
 * exist so the crew harness measures a folded row and an empty one; the admin harness opens
 * all three, which is exactly the shape difference the two harnesses are for.
 */
export const AGENDA_DAYS = [
  {
    dayLabel: "Tuesday, May 14, 2026",
    date: null,
    sessions: [sess("9:00 AM", "Welcome"), sess("10:00 AM", LONG_TITLE)],
  },
  { dayLabel: "Wednesday, May 15, 2026", date: null, sessions: [sess("11:00 AM", "Later")] },
  { dayLabel: "Thursday, May 16, 2026", date: null, sessions: [] },
];

export const AGENDA_EXTRACTION = {
  confidence: "high" as const,
  corrections: 0,
  extractorVersion: 2,
  days: AGENDA_DAYS,
};

/** Sessions painted when every row is open (the admin shape). Derived, never typed. */
export const TOTAL_SESSIONS = AGENDA_DAYS.reduce((n, d) => n + d.sessions.length, 0);

/** Sessions painted when only row 0 is open (the crew shape). */
export const OPEN_ROW_SESSIONS = AGENDA_DAYS[0]!.sessions.length;

export const TOTAL_DAYS = AGENDA_DAYS.length;
