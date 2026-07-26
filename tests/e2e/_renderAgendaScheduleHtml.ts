/**
 * Renders the REAL `AgendaScheduleBlock` to static HTML and prints it on stdout.
 *
 * WHY A SEPARATE PROCESS. `tests/e2e/agendaScheduleLayout.spec.ts` cannot do this inline:
 * Playwright compiles the files it loads with ITS OWN JSX factory, so importing the component
 * there yields Playwright JSX objects (`{__pw_type, type, props, key}`) and
 * `renderToStaticMarkup` rejects them with "Objects are not valid as a React child". Measured,
 * not assumed — that is the exact error the inline version produced.
 *
 * So the spec shells out to this script the same way it already shells out to the Tailwind CLI,
 * and gets back HTML rendered by React's own transform.
 *
 * The alternative was to keep hand-transcribing the markup into the harness, which is what this
 * whole change exists to remove: by the time the fold shipped, that copy still described the
 * pre-fold structure and every dimension assertion passed against it anyway.
 */
import { renderToStaticMarkup } from "react-dom/server";

import { AgendaScheduleBlock } from "@/components/crew/AgendaScheduleBlock";

/** Kept in sync with the spec's own LONG_TITLE: one unbreakable 90-char token. */
const LONG_TITLE =
  "AdaptingToUnpredictabilityInGlobalAssetManagementQuarterlyInvestorSummitKeynoteSessionXY";

const sess = (time: string, title: string) => ({
  time,
  title,
  room: null,
  tracks: [] as { label: string; title: string | null; room: string | null }[],
  drift: null,
});

/**
 * MIXED viewerDays on purpose: row 0 is the viewer's (open, marked) and rows 1-2 are folded, so
 * the measured page contains both states. A uniform state would leave the folded-row width and
 * the marker's box unmeasured, which are the two things most likely to break at 320px.
 */
const element = AgendaScheduleBlock({
  extraction: {
    confidence: "high" as const,
    corrections: 0,
    extractorVersion: 2,
    days: [
      {
        // The OPEN day carries both comparison sessions: a normal one and the 90-char
        // unbreakable token. They must be in the open row to have a box at all — inside a
        // folded <details> the browser paints nothing and every rect is zero.
        dayLabel: "Tuesday, May 14, 2026",
        date: null,
        sessions: [sess("9:00 AM", "Welcome"), sess("10:00 AM", LONG_TITLE)],
      },
      { dayLabel: "Wednesday, May 15, 2026", date: null, sessions: [sess("11:00 AM", "Later")] },
      { dayLabel: "Thursday, May 16, 2026", date: null, sessions: [] },
    ],
  },
  viewerDays: { kind: "subset", rows: new Set([0]) },
});

process.stdout.write(element === null ? "" : renderToStaticMarkup(element));
