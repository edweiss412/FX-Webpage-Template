/**
 * tests/e2e/_step3ReviewModalHarness.tsx (Tasks 10 + 11 shared)
 *
 * Renders the REAL <Step3ReviewModal> component tree to static markup for the
 * standalone real-browser layout harness (Task 10) and the esbuild-bundled
 * interactivity harness (Task 11). Precedent for renderToStaticMarkup inside
 * an e2e spec: tests/e2e/no-raw-codes.spec.ts.
 *
 * Router context: the modal's footer renders <RescanSheetButton>, which calls
 * `useRouter()` — outside the App Router that throws. The fixture is wrapped
 * in `AppRouterContext.Provider` (next/dist/shared/lib/
 * app-router-context.shared-runtime) with a no-op stub router, exactly the
 * mechanism the task brief pins.
 *
 * Fixture data reuses the shared builders in
 * tests/components/admin/wizard/_step3ReviewFixture.ts. The first crew member
 * is given a phone + email so the §15 tap-target audit has a real
 * tel:/mailto: anchor to measure.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import { Step3ReviewModal } from "@/components/admin/wizard/Step3ReviewModal";
import type { StagedSectionData } from "@/components/admin/wizard/step3ReviewSections";
import type { CrewMemberRow, ParseResult, ParseWarning } from "@/lib/parser/types";
import {
  buildParseResult,
  harnessVenue,
  stagedRow,
} from "@/tests/components/admin/wizard/_step3ReviewFixture";

/** Matches the fixture builders' fixed driveFileId (_step3ReviewFixture.ts). */
export const HARNESS_DFID = "drive-abc-123";
export const HARNESS_WSID = "00000000-1111-4222-8333-444444444444";

/** Spec §B3 tile cap, duplicated as the SPEC value (12). This harness COULD
 *  import DIAGRAM_TILE_CAP from step3ReviewSections safely (it is itself
 *  tsx-subprocess/esbuild-compiled, never spec-imported), but the value is
 *  pinned locally so a component whose cap drifts from the spec renders a
 *  wrong tile count and FAILS the §K15 layout assertions, correctly. */
const HARNESS_DIAGRAM_TILE_CAP = 12;
/** §K15 fixture size: cap + 3 → the grid renders exactly the cap and the
 *  overflow note reads "+3 more". Exported via the main-guard JSON (below) so
 *  the layout spec derives tile expectations from the fixture, not literals. */
export const HARNESS_DIAGRAM_STUB_COUNT = HARNESS_DIAGRAM_TILE_CAP + 3;
/** Spec §E3 callout row cap, duplicated (same rationale as the tile cap):
 *  CALLOUT_MAX_ENTRIES + 2 crew warnings → a callout with "View details" rows
 *  AND a "+2 more in Parse warnings" overflow row both render (§K13). */
const HARNESS_CALLOUT_MAX_ENTRIES = 3;
export const HARNESS_CREW_WARNING_COUNT = HARNESS_CALLOUT_MAX_ENTRIES + 2;

/** §K15 diagrams fixture: > cap valid stubs, ALL `contentUrl: null` so every
 *  tile renders the deterministic placeholder (zero network, stable geometry),
 *  plus a trusted linked-folder row so the folder link renders for the §15
 *  tap-target audit. */
function harnessDiagrams(): ParseResult["diagrams"] {
  return {
    linkedFolder: {
      driveFolderId: "harness-diagram-folder",
      driveFolderUrl: "https://drive.google.com/drive/folders/harness-diagram-folder",
    },
    embeddedImages: Array.from({ length: HARNESS_DIAGRAM_STUB_COUNT }, (_, i) => ({
      sheetTab: "DIAGRAMS",
      objectId: `harness-diagram-${i}`,
      mimeType: "image/png",
      alt: `Harness diagram ${i + 1}`,
      contentUrl: null,
      sheetsRevisionId: "harness-rev-1",
      embeddedFingerprint: null,
      recovery_disposition: "restage_required" as const,
      snapshotPath: null,
    })),
    linkedFolderItems: [],
  };
}

/** §K13 warnings fixture: warn-severity `crew`-kind warnings (mapped → the
 *  crew section's flag callout). Messages are human-readable (no code token)
 *  so `reviewWarningTitle` passes them through. */
function harnessWarnings(): ParseWarning[] {
  return Array.from({ length: HARNESS_CREW_WARNING_COUNT }, (_, i) => ({
    severity: "warn" as const,
    code: "HARNESS_CREW_WARNING",
    message: `Crew assignment ${i + 1} could not be fully read.`,
    blockRef: { kind: "crew", index: i },
  }));
}

/** §9.1 long-content header case: a single UNBREAKABLE token (no spaces, no
 *  hyphens — hyphens are CSS soft-break opportunities), plus a long client and
 *  a maximal 4-segment dates summary. */
export const LONG_TITLE =
  "AcmeCapitalGlobalAssetManagementQuarterlyInvestorSummitStrategyOffsiteWaldorfAstoriaGrandBallroomEditionExtendedDirectorsCut";
export const LONG_CLIENT = "AcmeCapitalGlobalAssetManagementHoldingsInternationalPartnersGroupLLC";
export const LONG_DATES: ParseResult["show"]["dates"] = {
  travelIn: "2026-04-08",
  set: "2026-04-09",
  showDays: ["2026-04-10", "2026-04-11", "2026-04-12", "2026-04-13"],
  travelOut: "2026-04-14",
};

const stubRouter = {
  refresh() {},
  push() {},
  replace() {},
  back() {},
  forward() {},
  prefetch() {},
  hmrRefresh() {},
} as unknown as AppRouterInstance;

/** Ensure at least one crew member carries phone + email so the crew section
 *  renders the §8 tel:/mailto: 44×44 anchors the tap-target audit measures. */
function withContactableCrew(crew: CrewMemberRow[]): CrewMemberRow[] {
  return crew.map((m, i) =>
    i === 0 ? { ...m, phone: "+1 555 010 0000", email: "crew.person.1@example.com" } : m,
  );
}

/** Assemble the modal's SectionData from the shared fixture builders (same
 *  shape as Step3ReviewModal.test.tsx's `sectionData`). */
export function buildSectionData(
  prOverrides: Partial<ParseResult> = {},
  showOverrides: Partial<ParseResult["show"]> = {},
): StagedSectionData {
  // Harness defaults (diagrams + crew warnings, above) layer UNDER the
  // caller's prOverrides so existing override-driven cases stay authoritative.
  const base = buildParseResult({
    diagrams: harnessDiagrams(),
    warnings: harnessWarnings(),
    ...prOverrides,
  });
  const pr: ParseResult = {
    ...base,
    show: { ...base.show, ...showOverrides },
    crewMembers: withContactableCrew(base.crewMembers),
  };
  const row = stagedRow(pr);
  return {
    mode: "staged",
    pr,
    row,
    dfid: HARNESS_DFID,
    wizardSessionId: HARNESS_WSID,
    // SectionCore (spec §3.2) — mechanical staged derivation (Task 4's builder
    // will replace these literals across all construction sites).
    title: pr.show.title || row.driveFileName || HARNESS_DFID,
    clientLabel: pr.show.client_label || null,
    dates: pr.show.dates,
    venue: pr.show.venue,
    eventDetails: pr.show.event_details,
    clientContact: pr.show.client_contact,
    contacts: pr.contacts ?? [],
    transportation: pr.transportation,
    diagrams: pr.diagrams,
    billing: {
      coiStatus: pr.show.coi_status,
      proposal: pr.show.proposal,
      po: pr.show.po,
      invoice: pr.show.invoice,
      invoiceNotes: pr.show.invoice_notes,
    },
    rawUnrecognized: pr.raw_unrecognized,
    sourceAnchors: row.sourceAnchors ?? {},
    driveFileId: HARNESS_DFID,
    crewMembers: pr.crewMembers,
    rooms: pr.rooms,
    hotels: pr.hotelReservations,
    pullSheet: pr.pullSheet ?? [],
    archivedPullSheetTabs: pr.archivedPullSheetTabs ?? [],
    ros: pr.runOfShow ?? {},
    warnings: pr.warnings,
    agendaBaseline: [],
    useRawDecisions: [],
  };
}

/** The modal element tree (shared so Task 11's esbuild entry can hydrate the
 *  same fixture it statically measures). The modal has no internal open state
 *  — it IS the open dialog; rendering it renders it open.
 *
 *  Built with React.createElement, NOT JSX: Playwright's test transform
 *  rewrites JSX in loaded .tsx files into its component-testing payload
 *  ({ __pw_type: 'jsx', … }), which react-dom/server cannot render
 *  ("Objects are not valid as a React child"). createElement is untouched
 *  by that transform and esbuild (Task 11) compiles it identically. */
export function modalElement(
  data: StagedSectionData,
  handlers: {
    onRequestSetChecked?: (next: boolean) => Promise<boolean>;
    onClose?: () => void;
    // Step-3 consolidation (spec §9): when provided, the modal renders its
    // RESOLUTION variant (tier radios + describeItem lines + Approve & apply /
    // Re-scan / Ignore footer) instead of the read-only publish footer. The
    // layout harness passes this to measure the folded resolution surface.
    resolution?: import("@/components/admin/wizard/Step3ReviewModal").Step3ReviewResolution;
  } = {},
): React.ReactElement {
  return React.createElement(
    AppRouterContext.Provider,
    { value: stubRouter },
    React.createElement(Step3ReviewModal, {
      data,
      checked: false,
      isDirtyRescan: false,
      onRequestSetChecked: handlers.onRequestSetChecked ?? (async () => true),
      onClose: handlers.onClose ?? (() => {}),
      ...(handlers.resolution ? { resolution: handlers.resolution } : {}),
    }),
  );
}

/** A minimal resolution fixture for the layout harness: a tier-3 (MI-6, radio
 *  choices) + a tier-1 (FIRST_SEEN_REVIEW context) review item — the widest
 *  footer variant. Handlers are inert (layout-only measurement). */
export function harnessResolution(): import("@/components/admin/wizard/Step3ReviewModal").Step3ReviewResolution {
  return {
    triggeredReviewItems: [
      { id: "mi6-1", invariant: "MI-6", section: "schedule" },
      { id: "fs-1", invariant: "FIRST_SEEN_REVIEW" },
    ] as unknown as import("@/lib/parser/types").TriggeredReviewItem[],
    reviewItemsCorrupt: false,
    stagedId: "staged-harness-1",
    isPublishRunActive: false,
    onApplyResolve: async () => true,
    onRescan: () => {},
    onIgnore: async () => true,
  };
}

/** Static HTML for the modal (default fixture, or with overrides — e.g. the
 *  §9.1 long-content header case). */
export function renderModalHtml(
  overrides: {
    prOverrides?: Partial<ParseResult>;
    showOverrides?: Partial<ParseResult["show"]>;
  } = {},
): string {
  const data = buildSectionData(overrides.prOverrides ?? {}, overrides.showOverrides ?? {});
  return renderToStaticMarkup(modalElement(data));
}

/** Static HTML for the modal's RESOLUTION variant (spec §9) — the folded
 *  re-apply surface with tier radios + Approve & apply / Re-scan / Ignore. */
export function renderResolutionModalHtml(): string {
  const data = buildSectionData();
  return renderToStaticMarkup(modalElement(data, { resolution: harnessResolution() }));
}

/* Direct-execution entry (Task 10): Playwright's test transform rewrites JSX
 * in EVERY .tsx it loads (this file AND the imported component tree) into its
 * component-testing payload ({ __pw_type: 'jsx', … }), which react-dom/server
 * cannot render — so the layout spec cannot import this module. Instead it
 * shells out to `node_modules/.bin/tsx` to run THIS file directly (real JSX
 * transform, tsconfig `@/` paths respected) and writes the rendered pages as
 * JSON: { dfid, normal, long }. The `typeof module` check matters for Task
 * 11's esbuild browser bundle, where `require` compiles to a defined
 * `__require` shim but bare `module` would be a ReferenceError. */
if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
  const outPath = process.argv[2];
  if (!outPath) throw new Error("usage: tsx _step3ReviewModalHarness.tsx <out.json>");
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- CJS main-guard CLI
  const { writeFileSync } = require("node:fs") as typeof import("node:fs");
  writeFileSync(
    outPath,
    JSON.stringify({
      dfid: HARNESS_DFID,
      diagramStubCount: HARNESS_DIAGRAM_STUB_COUNT,
      crewWarningCount: HARNESS_CREW_WARNING_COUNT,
      normal: renderModalHtml({ showOverrides: { venue: harnessVenue() } }),
      long: renderModalHtml({
        showOverrides: { title: LONG_TITLE, client_label: LONG_CLIENT, dates: LONG_DATES },
      }),
      resolution: renderResolutionModalHtml(),
    }),
  );
}
