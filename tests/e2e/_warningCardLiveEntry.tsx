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
 * The scenario is chosen by `?scenario=`: `layout` (the title-row fixture),
 * `archived` (the archived pull sheet card, plan Task 13), `save` (the deferred
 * reading choice's Save flow, plan Task 15) or `jumps` (the Hotels reservation
 * marker, plan Task 16). Each publishes its fixture's row indices on <html>
 * (`data-warning-card-rows` / `data-warning-card-archived` / `data-warning-card-save`
 * / `data-warning-card-jumps`) so the spec derives every testid from the fixture
 * rather than retyping indices.
 *
 * `save` is bundled with the two staged action modules aliased to
 * `_warningCardActionStub.ts`, and its router's refresh() calls `window.__onRefresh`,
 * which swaps the harness state the way a refresh would: the row's index moves from
 * the active partition to the ignored one and the saved decision persists.
 *
 * NEVER imported by a Playwright spec (its test transform rewrites JSX in every
 * spec-imported .tsx). warning-card-layout.spec.ts bundles this out-of-process
 * through tests/e2e/_step3ReviewModalBundle.mjs and serves it over node:http.
 */
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { UseRawDecision } from "@/lib/sync/useRawOverlay";
import {
  ARCHIVED_HARNESS_ROW,
  ARCHIVED_HARNESS_TAB,
  HARNESS_DFID,
  HARNESS_WSID,
  JUMPS_HARNESS_GUEST_ROW,
  JUMPS_HARNESS_HOTEL_INDEX,
  SAVE_HARNESS_CONTENT_HASH,
  SAVE_HARNESS_ROW,
  WARNING_CARD_ROWS,
  archivedTabHarnessWarnings,
  saveHarnessWarnings,
  buildSectionData,
  jumpsHarnessHotels,
  jumpsHarnessWarnings,
  modalElement,
  warningCardHarnessWarnings,
} from "./_step3ReviewModalHarness";

declare global {
  interface Window {
    __onRefresh?: () => void;
  }
}

const SAVE_SID = "harness-save-sid";

/** The Save flow's refresh: what `router.refresh()` would deliver after a Save that
 *  persisted the sheet's reading and accepted the card. */
const SAVED_DECISION: UseRawDecision = {
  code: "ROOM_HEADER_SPLIT_AMBIGUOUS",
  contentHash: SAVE_HARNESS_CONTENT_HASH,
  target: { kind: "rooms" },
  preference: "raw",
  applied: true,
  decidedAt: "2026-10-29T00:00:00.000Z",
  decidedBy: "harness@example.test",
};

const noop = () => {};
const refreshRouter = {
  refresh: () => window.__onRefresh?.(),
  push: noop,
  replace: noop,
  back: noop,
  forward: noop,
  prefetch: noop,
  hmrRefresh: noop,
} as unknown as AppRouterInstance;

function SaveHarness() {
  const [refreshed, setRefreshed] = useState(false);
  useEffect(() => {
    window.__onRefresh = () => setRefreshed(true);
  }, []);
  const item = { index: SAVE_HARNESS_ROW, reportSurfaceId: SAVE_SID };
  const data = {
    ...buildSectionData({ warnings: saveHarnessWarnings() }),
    useRawDecisions: refreshed ? [SAVED_DECISION] : [],
    dq: {
      target: { kind: "staged" as const, wizardSessionId: HARNESS_WSID, driveFileId: HARNESS_DFID },
      model: refreshed ? { active: [], ignored: [item] } : { active: [item], ignored: [] },
    },
  };
  return modalElement(data, { router: refreshRouter });
}

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
} else if (scenario === "save") {
  document.documentElement.setAttribute(
    "data-warning-card-save",
    JSON.stringify({ dfid: HARNESS_DFID, row: SAVE_HARNESS_ROW, sid: SAVE_SID }),
  );
  createRoot(rootEl).render(<SaveHarness />);
} else if (scenario === "jumps") {
  // The Hotels reservation marker (plan Task 16): two hotels and an inline guest split
  // on the second, so the hotel section's callout entries mark that card.
  document.documentElement.setAttribute(
    "data-warning-card-jumps",
    JSON.stringify({
      dfid: HARNESS_DFID,
      guestRow: JUMPS_HARNESS_GUEST_ROW,
      hotelIndex: JUMPS_HARNESS_HOTEL_INDEX,
    }),
  );
  createRoot(rootEl).render(
    modalElement(
      buildSectionData({
        warnings: jumpsHarnessWarnings(),
        hotelReservations: jumpsHarnessHotels(),
      }),
    ),
  );
} else {
  throw new Error(`unknown warning-card scenario: ${scenario}`);
}
