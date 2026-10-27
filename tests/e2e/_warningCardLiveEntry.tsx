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
 * The scenario is chosen by `?scenario=`; only `layout` exists so far. The
 * fixture's row indices are published on <html data-warning-card-rows> so the
 * spec derives every testid from the fixture rather than retyping indices.
 *
 * NEVER imported by a Playwright spec (its test transform rewrites JSX in every
 * spec-imported .tsx). warning-card-layout.spec.ts bundles this out-of-process
 * through tests/e2e/_step3ReviewModalBundle.mjs and serves it over node:http.
 */
import { createRoot } from "react-dom/client";
import {
  HARNESS_DFID,
  WARNING_CARD_ROWS,
  buildSectionData,
  modalElement,
  warningCardHarnessWarnings,
} from "./_step3ReviewModalHarness";

const scenario = new URLSearchParams(window.location.search).get("scenario") ?? "layout";
if (scenario !== "layout") throw new Error(`unknown warning-card scenario: ${scenario}`);

document.documentElement.setAttribute(
  "data-warning-card-rows",
  JSON.stringify({ dfid: HARNESS_DFID, rows: WARNING_CARD_ROWS }),
);

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("live harness page is missing #root");
createRoot(rootEl).render(
  modalElement(buildSectionData({ warnings: warningCardHarnessWarnings() })),
);
