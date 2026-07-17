// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, within } from "@testing-library/react";
import { ShowReviewSurface } from "@/components/admin/review/ShowReviewSurface";
import { buildStagedSectionData } from "@/components/admin/review/sectionData";
import { buildParseResult, stagedRow } from "../wizard/_step3ReviewFixture";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
beforeEach(() =>
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => ({}) } as Response)),
  ),
);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// A divergent staged section: durable override set, but the preview tab is NOT included.
function divergentStagedData() {
  const pr = buildParseResult();
  pr.archivedPullSheetTabs = [
    {
      tabName: "OLD A",
      fingerprint: "fp1",
      included: false,
      contentChangedSinceAccept: false,
      headerPreviews: ["RIA"],
    },
  ];
  return buildStagedSectionData({
    pr,
    row: stagedRow(pr), // _step3ReviewFixture.ts:147 signature is stagedRow(pr, overrides?)
    dfid: "drive-1",
    wizardSessionId: "00000000-1111-4222-8333-444444444444",
    // buildStagedSectionData takes the SectionCore list fields as separate inputs
    // (they are site-specific, NOT derived from pr) — so archivedPullSheetTabs
    // must be threaded explicitly for the S5 divergence to render.
    archivedPullSheetTabs: pr.archivedPullSheetTabs,
    crewMembers: [],
    rooms: [],
    hotels: [],
    pullSheet: [],
    ros: {},
    warnings: [],
    agendaBaseline: [],
    useRawDecisions: [],
    pullSheetOverride: { tabName: "OLD A", fingerprint: "fp1" },
  });
}

function Harness({ isPublishRunActive }: { isPublishRunActive: boolean }) {
  const ref = useRef<HTMLElement | null>(null);
  return (
    <div ref={ref as unknown as React.Ref<HTMLDivElement>}>
      <ShowReviewSurface
        data={divergentStagedData()}
        scrollerRef={ref}
        layout="modal"
        isPublishRunActive={isPublishRunActive}
      />
    </div>
  );
}

describe("ShowReviewSurface threads the publish-run freeze to the S5 Re-scan (PSAT-1)", () => {
  it("isPublishRunActive=true => S5 Re-scan is disabled", () => {
    const { container } = render(<Harness isPublishRunActive />);
    const btn = within(container)
      .getByTestId("pack-list-rescan-needed-drive-1")
      .querySelector("button");
    expect(btn).toBeDisabled();
  });
  it("isPublishRunActive=false => S5 Re-scan is enabled", () => {
    const { container } = render(<Harness isPublishRunActive={false} />);
    const btn = within(container)
      .getByTestId("pack-list-rescan-needed-drive-1")
      .querySelector("button");
    expect(btn).not.toBeDisabled();
  });
});
