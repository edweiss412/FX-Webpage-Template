/**
 * tests/e2e/_showPageLayoutHarness.tsx (Task 14 — spec §8 dimensional invariants)
 *
 * Renders the REAL consolidated admin show page (<PublishedReviewPage>: the
 * pinned <StatusStrip> over the shared <ShowReviewSurface layout="page">) to
 * static markup for the standalone real-browser layout harness. jsdom computes
 * NO layout, so the two-pane stretch / sticky-strip / chip-rail invariants MUST
 * be measured end-to-end in a real browser (spec §8; Tailwind v4 does not
 * default `.flex` to `align-items: stretch`).
 *
 * The page is wrapped in the REAL admin-layout document-flow shell
 * (`mx-auto max-w-[1600px] …`, matching app/admin/layout.tsx's non-onboarding
 * branch) so the WINDOW is the scroll container — the admin layout has a
 * non-sticky nav and no height cap (window-scroll model, task-13 §Watchpoints),
 * which is exactly what the strip's `sticky top-0` (nav-offset 0) needs.
 *
 * Precedent for renderToStaticMarkup of a real component tree inside an e2e
 * harness: tests/e2e/_step3ReviewModalHarness.tsx. Router + share-token context
 * are stubbed so the client tree renders (StatusStrip → useShareToken,
 * PublishedToggle → useRouter). The share token is null so the copy-link (and
 * thus resolveOrigin, which reads window) never renders — irrelevant to the §8
 * geometry, and keeps the static render browser-API-free.
 *
 * NEVER imported by the layout spec: Playwright's test transform rewrites JSX in
 * every .tsx it loads into component-testing payloads react-dom/server cannot
 * render, so the spec shells out to `tsx` to run this file's main-guard, which
 * writes { dfid, normal }.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PublishedReviewPage } from "@/components/admin/showpage/PublishedReviewPage";
import { ShareTokenProvider } from "@/app/admin/show/[slug]/ShareTokenContext";
import { buildPublishedSectionData } from "@/components/admin/review/publishedAdapter";
import type { ShowReviewSnapshot } from "@/lib/admin/readShowReviewSnapshot";
import type { SectionWarningRecord } from "@/lib/admin/sectionWarningModel";
import type { ChangesSectionProps } from "@/components/admin/showpage/ChangesSection";

/** Testid prefix for every surface node (`wizard-step3-card-<dfid>-review-*`). */
export const SHOWPAGE_DFID = "drive-showpage-1";
export const SHOWPAGE_SLUG = "showpage-layout-show";
const SHOW_ID = "11111111-2222-4333-8444-555555555555";

const stubRouter = {
  refresh() {},
  push() {},
  replace() {},
  back() {},
  forward() {},
  prefetch() {},
  hmrRefresh() {},
} as unknown as AppRouterInstance;

/** A published snapshot with enough populated sections that the content pane is
 *  clearly TALLER than the side rail's intrinsic nav height — so invariant 1
 *  (rail.height === content.height at ≥lg) is a real stretch measurement, not a
 *  vacuous equality — and the whole page exceeds ~2000px for the sticky-scroll
 *  invariant. */
function snapshot(): ShowReviewSnapshot {
  return {
    show: {
      id: SHOW_ID,
      title: "Showpage Layout Fixture",
      client_label: "Acme Capital",
      client_contact: { name: "Dana Lee", email: "dana@acme.example", phone: "+1 555 010 0100" },
      dates: {
        travelIn: "2026-05-01",
        set: "2026-05-02",
        showDays: ["2026-05-03", "2026-05-04"],
        travelOut: "2026-05-05",
      },
      venue: { name: "Grand Ballroom", address: "1 Congress Ave, Austin, TX" },
      event_details: { theme: "Annual Summit", notes: "Formal evening program." },
      agenda_links: [],
      coi_status: "received",
      diagrams: null,
      pull_sheet: [],
      source_anchors: {},
      drive_file_id: SHOWPAGE_DFID,
      archived: false,
      published: true,
    },
    internal: {
      financials: { proposal: "P-100", po: "PO-200", invoice: "INV-300", invoice_notes: "Net 30" },
      parse_warnings: [],
      raw_unrecognized: null,
      run_of_show: {},
      use_raw_decisions: [],
      show_id: SHOW_ID,
    },
    crew_members: Array.from({ length: 6 }, (_, i) => ({
      id: `crew-${i}`,
      name: `Crew Member ${String.fromCharCode(65 + i)}`,
      email: `crew${i}@example.com`,
      phone: `+1 555 020 01${String(i).padStart(2, "0")}`,
      role: i % 2 === 0 ? "Audio Lead" : "Video Tech",
      role_flags: [],
      date_restriction: null,
      stage_restriction: null,
      flight_info: null,
    })),
    rooms: Array.from({ length: 3 }, (_, i) => ({
      id: `room-${i}`,
      kind: "show",
      name: `Room ${i + 1}`,
      dimensions: "40x60",
      floor: "2",
      setup: "Theater",
      set_time: "08:00",
      show_time: "18:00",
      strike_time: "23:00",
      audio: "L-Acoustics",
      video: "2x LED wall",
      lighting: "Full rig",
      scenic: "Stage flats",
      power: "3-phase",
      digital_signage: null,
      other: null,
      notes: "Load in via dock B.",
    })),
    hotel_reservations: [
      {
        id: "hotel-0",
        ordinal: 1,
        hotel_name: "Downtown Marriott",
        hotel_address: "2 River St, Austin, TX",
        names: ["Crew Member A", "Crew Member B"],
        confirmation_no: "CN-9001",
        check_in: "2026-05-01",
        check_out: "2026-05-05",
        notes: null,
      },
    ],
    transportation: [
      {
        id: "tr-0",
        driver_name: "Sam Rivera",
        driver_phone: "+1 555 030 0000",
        driver_email: "sam@example.com",
        loadout_name: null,
        loadout_phone: null,
        loadout_email: null,
        vehicle: "26ft box truck",
        license_plate: "TX-1234",
        color: "White",
        parking: "Dock B",
        schedule: [],
        notes: null,
      },
    ],
    contacts: [
      {
        id: "ct-0",
        kind: "venue",
        name: "Pat Ops",
        email: "pat@venue.example",
        phone: null,
        notes: null,
      },
      {
        id: "ct-1",
        kind: "catering",
        name: "Jo Chef",
        email: null,
        phone: "+1 555 040 0000",
        notes: null,
      },
    ],
  };
}

const NOOP_OK = async () => ({ ok: true as const });

/** The real page element tree, wired with inert actions + placeholder server
 *  slots (the §8 geometry does not depend on slot content). Built with
 *  React.createElement — see the modal harness header: Playwright's JSX
 *  transform would corrupt a spec-imported tree; createElement is untouched, so
 *  this stays renderable even if a future spec imports the module. */
export function pageElement(): React.ReactElement {
  const data = buildPublishedSectionData(snapshot(), { slug: SHOWPAGE_SLUG });
  const bySection: SectionWarningRecord = {};
  // children folded into props (not positional) — both providers type `children`
  // as required, which createElement's positional-children overload does not
  // satisfy under this project's tsconfig.
  const page = React.createElement(PublishedReviewPage, {
    data,
    bySection,
    slug: SHOWPAGE_SLUG,
    showId: SHOW_ID,
    title: "Showpage Layout Fixture",
    archived: false,
    published: true,
    finalizeOwned: false,
    setPublished: NOOP_OK,
    isLive: true,
    lastSyncedAt: "2026-05-02T12:00:00.000Z",
    lastSyncStatus: "ok",
    now: new Date("2026-05-02T13:00:00.000Z"),
    alertCount: 2,
    openSheetHref: "https://docs.google.com/spreadsheets/d/example",
    hasActionableWarnings: false,
    archiveAction: NOOP_OK,
    unarchiveAction: async () => {},
    alertSlot: React.createElement("div", { "data-testid": "harness-alert-slot" }, "alert slot"),
    shareSlot: React.createElement("div", { "data-testid": "harness-share-slot" }, "share slot"),
    // feed: null → ChangesFeed renders its calm empty/infra notice and never
    // invokes these actions; inert stubs cast to the exact prop shapes.
    feed: null,
    undoAction: NOOP_OK as ChangesSectionProps["undoAction"],
    acceptAction: NOOP_OK as unknown as ChangesSectionProps["acceptAction"],
    acceptAllAction: NOOP_OK as unknown as ChangesSectionProps["acceptAllAction"],
    approveAction: NOOP_OK as unknown as ChangesSectionProps["approveAction"],
    rejectAction: NOOP_OK as unknown as ChangesSectionProps["rejectAction"],
  });
  return React.createElement(
    AppRouterContext.Provider,
    { value: stubRouter },
    // eslint-disable-next-line react/no-children-prop -- ShareTokenProvider types `children` as required; createElement's positional-children overload cannot satisfy a required-children prop, so it is passed in props.
    React.createElement(ShareTokenProvider, {
      initialToken: null,
      initialEpoch: 0,
      children: page,
    }),
  );
}

/** The page inside the REAL admin-layout document-flow shell (non-onboarding
 *  branch of app/admin/layout.tsx) so the window is the scroll container. */
export function renderPageHtml(): string {
  return renderToStaticMarkup(
    React.createElement(
      "div",
      {
        "data-testid": "admin-layout",
        className:
          "mx-auto max-w-[1600px] px-page-pad-mobile pt-page-pad-mobile pb-20 sm:px-page-pad-desktop sm:pt-page-pad-desktop min-[720px]:pb-page-pad-desktop",
      },
      pageElement(),
    ),
  );
}

/* Direct-execution entry: `tsx` runs THIS file (real JSX transform, `@/` paths)
 * and writes the rendered page as JSON so the layout spec never imports the
 * component tree (see header). */
if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
  const outPath = process.argv[2];
  if (!outPath) throw new Error("usage: tsx _showPageLayoutHarness.tsx <out.json>");
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- CJS main-guard CLI
  const { writeFileSync } = require("node:fs") as typeof import("node:fs");
  writeFileSync(outPath, JSON.stringify({ dfid: SHOWPAGE_DFID, normal: renderPageHtml() }));
}
