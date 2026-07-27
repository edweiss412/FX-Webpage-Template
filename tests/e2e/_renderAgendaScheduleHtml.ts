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
import { AGENDA_EXTRACTION } from "./_agendaFixture";

/**
 * MIXED viewerDays on purpose: row 0 is the viewer's (open, marked) and rows 1-2 are folded, so
 * the measured page contains both states. A uniform state would leave the folded-row width and
 * the marker's box unmeasured, which are the two things most likely to break at 320px.
 */
const element = AgendaScheduleBlock({
  extraction: AGENDA_EXTRACTION,
  // `--admin` renders the Step 3 preview's shape: no viewerDays, so the default
  // { kind: "all" } applies and every row is open and unmarked, exactly as the admin
  // caller gets it (components/admin/wizard/step3ReviewSections.tsx passes no viewer).
  ...(process.argv.includes("--admin")
    ? {}
    : { viewerDays: { kind: "subset" as const, rows: new Set([0]) } }),
});

process.stdout.write(element === null ? "" : renderToStaticMarkup(element));
