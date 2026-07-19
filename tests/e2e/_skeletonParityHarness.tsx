/**
 * tests/e2e/_skeletonParityHarness.tsx (modal-header-reconciliation §6.1.1 — Task 9)
 *
 * Renders BOTH review-modal states — the streaming `ShowReviewModalSkeleton`
 * and the loaded `PublishedReviewModal` — to static markup for the standalone
 * band-parity harness. `ReviewModalShell` has THREE consumers, not two, and the
 * skeleton is the one nobody measures: a slow `/admin?show=<slug>` load renders
 * the skeleton's header language and then SNAPS to the loaded one, at exactly
 * the moment the user is watching the header.
 *
 * ONE PAGE, ONE STYLESHEET, BOTH STATES — the point of the harness. Each state
 * is wrapped in a `data-parity` scope because both render through the shell
 * with the SAME `testIdBase="published-show-review"`, so every testid appears
 * twice; an unscoped locator would silently measure whichever came first. The
 * two panels are `fixed inset-0` overlays, so they overlap visually but are
 * laid out independently — neither can perturb the other's geometry, which is
 * what makes a single page safe here.
 *
 * NO NETWORK SETTLING IS REQUIRED: the served page inlines its compiled CSS
 * and references no remote font, image or script. The only post-first-paint
 * reflow risk is font swap, which the spec settles with `document.fonts.ready`
 * plus an rAF tick. Do not add speculative waits.
 *
 * NEVER imported by the spec: Playwright's test transform rewrites JSX in every
 * .tsx it loads into component-testing payloads react-dom/server cannot render,
 * so the spec shells out to `tsx` to run this file's main-guard.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PublishedReviewModal } from "@/components/admin/showpage/PublishedReviewModal";
import { ShowReviewModalSkeleton } from "@/components/admin/showpage/ShowReviewModalSkeleton";
import { ShareTokenProvider } from "@/app/admin/show/[slug]/ShareTokenContext";
import { buildPublishedSectionData } from "@/components/admin/review/publishedAdapter";
import type { ShowReviewSnapshot } from "@/lib/admin/readShowReviewSnapshot";
import type { SectionWarningRecord } from "@/lib/admin/sectionWarningModel";
import type { ChangesSectionProps } from "@/components/admin/showpage/ChangesSection";

export const PARITY_DFID = "drive-skeleton-parity-1";
const PARITY_SLUG = "skeleton-parity-show";
const SHOW_ID = "22222222-3333-4444-8555-666666666666";

/* ── The pinned fixture — ONE object drives BOTH renders ──────────────────────
 *
 * Every value is chosen so the LOADED header is deterministic and single-row
 * per line at the narrowest viewport under test (390px). Assertion C compares
 * the two headers' text-ROW COUNTS, so a title that wraps would make the loaded
 * header two rows and fail C for a reason that has nothing to do with the
 * contract under test.
 *
 *  - TITLE: short and unbreakable at 390px. The header's text block is already
 *    squeezed by a 44px sheet-link anchor and a 44px close affordance, so the
 *    budget is roughly 200px — "Acme Gala" clears it with room to spare.
 *  - CLIENT: non-null (the §6.3 subline's client entry + its bullet only render
 *    when non-null) and short.
 *  - DATES: a SINGLE show day and nothing else, so `dateSummarySegments` yields
 *    exactly one short segment and the subline cannot reach a second line.
 *
 * Derive every expected value from this fixture; never hardcode a pixel. */
export const PARITY_TITLE = "Acme Gala";
export const PARITY_CLIENT = "Acme";
export const PARITY_SHOW_DAY = "2026-05-03";

function snapshot(): ShowReviewSnapshot {
  return {
    show: {
      id: SHOW_ID,
      title: PARITY_TITLE,
      client_label: PARITY_CLIENT,
      client_contact: null,
      // ONE segment: no travelIn / set / travelOut, so the subline is one short
      // line at every viewport under test.
      dates: { showDays: [PARITY_SHOW_DAY] },
      venue: { name: "Grand Ballroom", address: "1 Congress Ave, Austin, TX" },
      event_details: null,
      agenda_links: [],
      coi_status: "received",
      diagrams: null,
      pull_sheet: [],
      source_anchors: {},
      drive_file_id: PARITY_DFID,
      archived: false,
      published: true,
    },
    internal: {
      financials: null,
      parse_warnings: [],
      raw_unrecognized: null,
      run_of_show: {},
      use_raw_decisions: [],
      show_id: SHOW_ID,
    },
    crew_members: Array.from({ length: 4 }, (_, i) => ({
      id: `crew-${i}`,
      name: `Crew Member ${String.fromCharCode(65 + i)}`,
      email: `crew${i}@example.com`,
      phone: null,
      role: "Audio Lead",
      role_flags: [],
      date_restriction: null,
      stage_restriction: null,
      flight_info: null,
    })),
    rooms: [],
    hotel_reservations: [],
    transportation: [],
    contacts: [],
  };
}

const stubRouter = {
  refresh() {},
  push() {},
  replace() {},
  back() {},
  forward() {},
  prefetch() {},
  hmrRefresh() {},
} as unknown as AppRouterInstance;

const NOOP_OK = async () => ({ ok: true as const });

/** Share token present so the strip renders its copy-link — the loaded
 *  subheader's width and wrap behavior depend on it, and assertion E measures
 *  that band's height. A null token would quietly shrink the comparison. */
const PARITY_SHARE_TOKEN = "parity-share-token";

function wrap(node: React.ReactElement): React.ReactElement {
  return React.createElement(
    AppRouterContext.Provider,
    { value: stubRouter },
    // eslint-disable-next-line react/no-children-prop -- ShareTokenProvider types `children` as required; createElement's positional-children overload cannot satisfy a required-children prop, so it is passed in props.
    React.createElement(ShareTokenProvider, {
      initialToken: PARITY_SHARE_TOKEN,
      initialEpoch: 1,
      children: node,
    }),
  );
}

function loadedElement(): React.ReactElement {
  const data = buildPublishedSectionData(snapshot(), { slug: PARITY_SLUG });
  const bySection: SectionWarningRecord = {};
  return React.createElement(PublishedReviewModal, {
    alertId: null,
    data,
    bySection,
    slug: PARITY_SLUG,
    showId: SHOW_ID,
    title: PARITY_TITLE,
    archived: false,
    published: true,
    finalizeOwned: false,
    setPublished: NOOP_OK,
    isLive: true,
    lastSyncedAt: "2026-05-02T12:00:00.000Z",
    lastCheckedAt: "2026-05-02T12:00:00.000Z",
    lastSyncStatus: "ok",
    now: new Date("2026-05-02T13:00:00.000Z"),
    alertCount: 0,
    // Non-null: the sheet-link anchor is 44px and is what sets the loaded title
    // row's height, so the skeleton must mirror a row of that height. Omitting
    // it here would make the skeleton look wrong against a header that no real
    // published show renders.
    openSheetHref: "https://docs.google.com/spreadsheets/d/example",
    hasActionableWarnings: false,
    archiveAction: NOOP_OK,
    unarchiveAction: async () => {},
    alertSlot: React.createElement("div", { "data-testid": "harness-alert-slot" }, "alert slot"),
    shareSlot: React.createElement("div", { "data-testid": "harness-share-slot" }, "share slot"),
    feed: null,
    undoAction: NOOP_OK as ChangesSectionProps["undoAction"],
    acceptAction: NOOP_OK as unknown as ChangesSectionProps["acceptAction"],
    acceptAllAction: NOOP_OK as unknown as ChangesSectionProps["acceptAllAction"],
    approveAction: NOOP_OK as unknown as ChangesSectionProps["approveAction"],
    rejectAction: NOOP_OK as unknown as ChangesSectionProps["rejectAction"],
  });
}

/** Both states on ONE page, each under its own `data-parity` scope. */
export function parityPageHtml(): string {
  const scope = (name: string, node: React.ReactElement) =>
    React.createElement("div", { "data-parity": name }, wrap(node));
  return renderToStaticMarkup(
    React.createElement(
      React.Fragment,
      null,
      scope("skeleton", React.createElement(ShowReviewModalSkeleton)),
      scope("loaded", loadedElement()),
    ),
  );
}

/* Direct-execution entry: `tsx` runs THIS file (real JSX transform, `@/` paths)
 * and writes the rendered page as JSON so the spec never imports the tree. */
if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
  const outPath = process.argv[2];
  if (!outPath) throw new Error("usage: tsx _skeletonParityHarness.tsx <out.json>");
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- CJS main-guard CLI
  const { writeFileSync } = require("node:fs") as typeof import("node:fs");
  writeFileSync(
    outPath,
    JSON.stringify({ dfid: PARITY_DFID, title: PARITY_TITLE, page: parityPageHtml() }),
  );
}
