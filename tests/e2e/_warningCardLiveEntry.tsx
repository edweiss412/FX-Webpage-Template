/**
 * tests/e2e/_warningCardLiveEntry.tsx
 * (warning-card-fixes spec §13.1; plan Task 7)
 *
 * Browser ENTRY for the wizard warning-card harness: mounts the REAL
 * <Step3ReviewModal> tree over `warningCardHarnessWarnings()` (same
 * AppRouterContext stub and fixture builders as the other Step 3 harnesses),
 * with react-dom/client, so the title row's geometry is measured against real
 * component markup and real compiled CSS.
 *
 * The scenario is chosen by `?scenario=`: `layout` (the title-row fixture) or
 * `archived` (the archived pull sheet card, plan Task 13). Each publishes its
 * fixture's row indices on <html> (`data-warning-card-rows` /
 * `data-warning-card-archived`) so the spec derives every testid from the fixture
 * rather than retyping indices.
 *
 * NEVER imported by a Playwright spec (its test transform rewrites JSX in every
 * spec-imported .tsx). warning-card-layout.spec.ts bundles this out-of-process
 * through tests/e2e/_step3ReviewModalBundle.mjs and serves it over node:http.
 */
import { createRoot } from "react-dom/client";
import {
  ARCHIVED_HARNESS_ROW,
  ARCHIVED_HARNESS_TAB,
  HARNESS_DFID,
  HARNESS_WSID,
  WARNING_CARD_ROWS,
  archivedTabHarnessWarnings,
  buildSectionData,
  modalElement,
  warningCardHarnessWarnings,
} from "./_step3ReviewModalHarness";

const scenario = new URLSearchParams(window.location.search).get("scenario") ?? "layout";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("live harness page is missing #root");

if (scenario === "layout") {
  document.documentElement.setAttribute(
    "data-warning-card-rows",
    JSON.stringify({ dfid: HARNESS_DFID, rows: WARNING_CARD_ROWS }),
  );
  createRoot(rootEl).render(
    modalElement(buildSectionData({ warnings: warningCardHarnessWarnings() })),
  );
} else if (scenario === "archived") {
  // The archived pull sheet card (plan Task 13): the staged tab plus a `dq` model with
  // the warning ACTIVE, so the card mounts Report + Ignore and its include button.
  document.documentElement.setAttribute(
    "data-warning-card-archived",
    JSON.stringify({ dfid: HARNESS_DFID, row: ARCHIVED_HARNESS_ROW }),
  );
  const data = buildSectionData({
    warnings: archivedTabHarnessWarnings(),
    archivedPullSheetTabs: [ARCHIVED_HARNESS_TAB],
  });
  createRoot(rootEl).render(
    modalElement({
      ...data,
      dq: {
        target: { kind: "staged", wizardSessionId: HARNESS_WSID, driveFileId: HARNESS_DFID },
        model: {
          active: [{ index: ARCHIVED_HARNESS_ROW, reportSurfaceId: "harness-archived-sid" }],
          ignored: [],
        },
      },
    }),
  );
} else {
  throw new Error(`unknown warning-card scenario: ${scenario}`);
}
