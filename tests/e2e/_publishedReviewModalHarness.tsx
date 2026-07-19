/**
 * tests/e2e/_publishedReviewModalHarness.tsx (admin-show-modal Task 12 — spec §6.6)
 *
 * Renders the REAL <PublishedReviewModal> (the `/admin?show=<slug>` published
 * review surface inside the shared ReviewModalShell chrome) OPEN, with real
 * fixture data, to static markup for the standalone real-browser layout
 * harness. jsdom computes NO layout, so the §6.6 panel-column equations
 * (grab + header + main === panel in sheet mode; header + main === panel in
 * popup/two-pane mode, NO footer element) MUST be measured end-to-end in a
 * real browser (Tailwind v4 does not default `.flex` to `align-items:
 * stretch`).
 *
 * The modal is a `fixed inset-0` overlay — it is rendered directly into the
 * page body (no admin-layout document-flow shell; the panel, not the window,
 * owns the internal scroller). The modal renders open by construction: the
 * consumer passes `open` hardcoded true to ReviewModalShell.
 *
 * Precedent for renderToStaticMarkup of a real component tree inside an e2e
 * harness: tests/e2e/_step3ReviewModalHarness.tsx. Router + share-token context
 * are stubbed so the client tree renders (useShowModalNav → useRouter;
 * useSearchParams resolves null outside Next and the nav helper only builds
 * closures — nothing fires in a static render). The share token is a FIXTURE
 * VALUE (not null) so the strip's copy-link renders: T-COPY-FLUSH
 * (modal-header-reconciliation §8) measures its right edge against the band's
 * content box, and a null token would make that assertion silently vacuous.
 * `resolveOrigin` reads only NEXT_PUBLIC_SITE_ORIGIN — no window, no browser
 * API — so the static render stays server-safe.
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
import { PublishedReviewModal } from "@/components/admin/showpage/PublishedReviewModal";
import { ShareTokenProvider } from "@/app/admin/show/[slug]/ShareTokenContext";
import { buildPublishedSectionData } from "@/components/admin/review/publishedAdapter";
import type { ShowReviewSnapshot } from "@/lib/admin/readShowReviewSnapshot";
import type { SectionWarningRecord } from "@/lib/admin/sectionWarningModel";
import type { ChangesSectionProps } from "@/components/admin/showpage/ChangesSection";

/** Testid prefix for every surface node (`wizard-step3-card-<dfid>-review-*`). */
export const MODAL_DFID = "drive-pubmodal-1";
export const MODAL_SLUG = "published-modal-layout-show";
const SHOW_ID = "11111111-2222-4333-8444-555555555555";

/** Share token for the fixture — present so the strip renders its copy-link
 *  (T-COPY-FLUSH measures that button). Inert: nothing navigates here. */
const HARNESS_SHARE_TOKEN = "harness-share-token";

/** The modal header's h2 title (the dialog's accessible name). */
export const MODAL_TITLE = "Published Modal Layout Fixture";

const stubRouter = {
  refresh() {},
  push() {},
  replace() {},
  back() {},
  forward() {},
  prefetch() {},
  hmrRefresh() {},
} as unknown as AppRouterInstance;

/** A published snapshot with enough populated sections that the surface's
 *  internal scroller genuinely overflows the capped panel (max-h 85vh/80vh) —
 *  so the §6.6 equations measure a body pinned by min-h-0 flex-1, not a
 *  short-content column that happens to fit. */
function snapshot(): ShowReviewSnapshot {
  return {
    show: {
      id: SHOW_ID,
      title: MODAL_TITLE,
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
      drive_file_id: MODAL_DFID,
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

/** The real OPEN modal element tree, wired with inert actions + placeholder
 *  server slots (the §6.6 geometry does not depend on slot content). Built with
 *  React.createElement — Playwright's JSX transform would corrupt a
 *  spec-imported tree; createElement is untouched, so this stays renderable
 *  even if a future spec imports the module. */
export function modalElement(): React.ReactElement {
  const data = buildPublishedSectionData(snapshot(), { slug: MODAL_SLUG });
  const bySection: SectionWarningRecord = {};
  const modal = React.createElement(PublishedReviewModal, {
    alertId: null,
    data,
    bySection,
    slug: MODAL_SLUG,
    showId: SHOW_ID,
    title: MODAL_TITLE,
    archived: false,
    published: true,
    finalizeOwned: false,
    setPublished: NOOP_OK,
    isLive: true,
    lastSyncedAt: "2026-05-02T12:00:00.000Z",
    lastCheckedAt: "2026-05-02T12:00:00.000Z",
    lastSyncStatus: "ok",
    now: new Date("2026-05-02T13:00:00.000Z"),
    alertCount: 2,
    openSheetHref: "https://docs.google.com/spreadsheets/d/example",
    hasActionableWarnings: false,
    archiveAction: NOOP_OK,
    unarchiveAction: async () => {},
    alertSlot: React.createElement("div", { "data-testid": "harness-alert-slot" }, "alert slot"),
    shareSlot: React.createElement("div", { "data-testid": "harness-share-slot" }, "share slot"),
    // feed: null → ChangesSection renders its calm infra notice and never
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
      initialToken: HARNESS_SHARE_TOKEN,
      initialEpoch: 1,
      children: modal,
    }),
  );
}

/** The open modal rendered to static markup (fixed overlay — no page shell). */
export function renderModalHtml(): string {
  return renderToStaticMarkup(modalElement());
}

/* Direct-execution entry: `tsx` runs THIS file (real JSX transform, `@/` paths)
 * and writes the rendered modal as JSON so the layout spec never imports the
 * component tree (see header). */
if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
  const outPath = process.argv[2];
  if (!outPath) throw new Error("usage: tsx _publishedReviewModalHarness.tsx <out.json>");
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- CJS main-guard CLI
  const { writeFileSync } = require("node:fs") as typeof import("node:fs");
  writeFileSync(
    outPath,
    JSON.stringify({
      dfid: MODAL_DFID,
      normal: renderModalHtml(),
    }),
  );
}
