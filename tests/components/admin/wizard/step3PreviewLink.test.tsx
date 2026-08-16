// @vitest-environment jsdom
/**
 * Task 6 — the step-3 review modal's "Open crew preview" entry link (spec §2.8).
 *
 * Guard condition per prop: the ordinary row's `stagedId` is OPTIONAL
 * (Step3Review.tsx:124), so an absent value renders NO link rather than a broken
 * href. Both arms are asserted, and the href is derived from the fixture value.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { Step3ReviewModal } from "@/components/admin/wizard/Step3ReviewModal";
import {
  buildStagedSectionData,
  type StagedSectionData,
} from "@/components/admin/review/sectionData";
import { buildParseResult, stagedRow } from "./_step3ReviewFixture";
import type { ParseWarning } from "@/lib/parser/types";

const DFID = "drive-abc-123";
const WSID = "00000000-1111-4222-8333-444444444444";
const STAGED_ID = "3f1c9b7e-0000-4000-8000-0000000000aa";
const LINK_LABEL = "Open crew preview";
// The accessible name carries the shared new-tab announcement (NewTabHint,
// pinned by tests/styles/_metaNewTabAnnouncement.test.ts), so the name is the
// label PLUS that suffix. Matching on the label alone would go silently stale if
// the suffix were dropped, so the exact accessible name is asserted separately.
const LINK_NAME = /^Open crew preview \(opens in a new tab\)$/;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function sectionData(opts?: {
  stagedId?: string | undefined;
  warnings?: ParseWarning[];
}): StagedSectionData {
  const pr = buildParseResult(opts?.warnings ? { warnings: opts.warnings } : {});
  const row = stagedRow(pr, opts?.stagedId === undefined ? {} : { stagedId: opts.stagedId });
  return buildStagedSectionData({
    pr,
    row,
    dfid: DFID,
    wizardSessionId: WSID,
    crewMembers: pr.crewMembers,
    rooms: pr.rooms,
    hotels: pr.hotelReservations,
    pullSheet: pr.pullSheet ?? [],
    archivedPullSheetTabs: pr.archivedPullSheetTabs ?? [],
    pullSheetOverride: null,
    ros: pr.runOfShow ?? {},
    warnings: pr.warnings,
    agendaBaseline: [],
    useRawDecisions: [],
  });
}

function renderModal(data: StagedSectionData): void {
  render(
    <Step3ReviewModal
      data={data}
      checked={false}
      isDirtyRescan={false}
      onRequestSetChecked={async () => true}
      onClose={() => {}}
    />,
  );
}

describe("step-3 review modal crew-preview link (AC-5)", () => {
  test("renders an external-tab anchor whose href carries the row's stagedId", () => {
    renderModal(sectionData({ stagedId: STAGED_ID }));

    const link = screen.getByRole("link", { name: LINK_NAME });
    expect(link.getAttribute("href")).toBe(`/admin/wizard/preview/${STAGED_ID}`);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.getAttribute("class")).toContain("min-h-tap-min");
    // Visible text stays short; the sr-only hint supplies the rest of the name.
    expect(link.textContent).toContain(LINK_LABEL);
    expect(link.querySelector(".sr-only")!.textContent).toBe("(opens in a new tab)");
  });

  test("the href follows the row's stagedId rather than a constant", () => {
    const other = "9a2d4c6e-1111-4111-8111-111111111111";
    renderModal(sectionData({ stagedId: other }));
    expect(screen.getByRole("link", { name: LINK_NAME }).getAttribute("href")).toBe(
      `/admin/wizard/preview/${other}`,
    );
  });

  test("renders for a WARNED parse too: previewing a warned parse is the point", () => {
    const warnings: ParseWarning[] = [
      {
        code: "UNKNOWN_ROLE_TOKEN",
        message: "Unrecognized role token",
      } as unknown as ParseWarning,
    ];
    renderModal(sectionData({ stagedId: STAGED_ID, warnings }));
    expect(screen.getByRole("link", { name: LINK_NAME })).toBeInTheDocument();
  });

  test("renders NO link when the row carries no stagedId", () => {
    renderModal(sectionData());
    expect(screen.queryByRole("link", { name: LINK_NAME })).toBeNull();
    // Scanned the whole tree, not just the footer: no dormant href either.
    expect(document.body.querySelector('a[href^="/admin/wizard/preview/"]')).toBeNull();
  });
});
