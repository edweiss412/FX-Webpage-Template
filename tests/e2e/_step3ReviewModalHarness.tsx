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
import type { SectionData } from "@/components/admin/wizard/step3ReviewSections";
import type { CrewMemberRow, ParseResult } from "@/lib/parser/types";
import { buildParseResult, stagedRow } from "@/tests/components/admin/wizard/_step3ReviewFixture";

/** Matches the fixture builders' fixed driveFileId (_step3ReviewFixture.ts). */
export const HARNESS_DFID = "drive-abc-123";
export const HARNESS_WSID = "00000000-1111-4222-8333-444444444444";

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
): SectionData {
  const base = buildParseResult(prOverrides);
  const pr: ParseResult = {
    ...base,
    show: { ...base.show, ...showOverrides },
    crewMembers: withContactableCrew(base.crewMembers),
  };
  const row = stagedRow(pr);
  return {
    pr,
    row,
    dfid: HARNESS_DFID,
    wizardSessionId: HARNESS_WSID,
    crewMembers: pr.crewMembers,
    rooms: pr.rooms,
    hotels: pr.hotelReservations,
    pullSheet: pr.pullSheet ?? [],
    ros: pr.runOfShow ?? {},
    warnings: pr.warnings,
    agendaBaseline: [],
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
  data: SectionData,
  handlers: {
    onRequestSetChecked?: (next: boolean) => Promise<boolean>;
    onClose?: () => void;
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
    }),
  );
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

/* Direct-execution entry (Task 10): Playwright's test transform rewrites JSX
 * in EVERY .tsx it loads (this file AND the imported component tree) into its
 * component-testing payload ({ __pw_type: 'jsx', … }), which react-dom/server
 * cannot render — so the layout spec cannot import this module. Instead it
 * shells out to `node_modules/.bin/tsx` to run THIS file directly (real JSX
 * transform, tsconfig `@/` paths respected) and writes the rendered pages as
 * JSON: { dfid, normal, long }. */
if (typeof require !== "undefined" && require.main === module) {
  const outPath = process.argv[2];
  if (!outPath) throw new Error("usage: tsx _step3ReviewModalHarness.tsx <out.json>");
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- CJS main-guard CLI
  const { writeFileSync } = require("node:fs") as typeof import("node:fs");
  writeFileSync(
    outPath,
    JSON.stringify({
      dfid: HARNESS_DFID,
      normal: renderModalHtml(),
      long: renderModalHtml({
        showOverrides: { title: LONG_TITLE, client_label: LONG_CLIENT, dates: LONG_DATES },
      }),
    }),
  );
}
