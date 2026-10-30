// @vitest-environment jsdom
/**
 * Accepted (N) disclosures on both surfaces (warning-card-fixes spec §6.4, Task 12).
 *
 * The ignored partition is split AT RENDER into needs-look rows ("Ignored (N)") and
 * judgment rows ("Accepted (N)"); the partition, its counts and the ignore store are
 * unchanged. Failure modes this catches: report ids misaligned by the split (published
 * rows reading a sibling record's id by position), a disclosure rendering at 0, and the
 * heading or the rail counting an accepted or ignored row as active.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/admin/onboarding/_actions/stagedWarningIgnore", () => ({
  setStagedWarningIgnore: async () => ({ ok: true, state: "ignored" }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(),
}));

import { cleanup, render, within } from "@testing-library/react";
import type { ParseWarning } from "@/lib/parser/types";
import { isJudgmentCall } from "@/lib/admin/warningReadingDisplay";
import { step3Sections, type Step3SectionDef } from "@/components/admin/wizard/step3ReviewSections";
import {
  buildStagedSectionData,
  isPublished,
  type StagedSectionData,
} from "@/components/admin/review/sectionData";
import { buildSectionWarningExtras } from "@/components/admin/showpage/sectionWarningExtras";
import type { SectionWarningItem, SectionWarningModel } from "@/lib/admin/sectionWarningModel";
import { buildPublishedSurfaceProps } from "@/tests/helpers/publishedSurfaceProps";
import { premiseHolds } from "@/tests/_shared/premise";
import {
  buildParseResult,
  stagedRow,
  STEP3_FIXTURE_DFID as DFID,
  STEP3_FIXTURE_WSID as WSID,
} from "./wizard/_step3ReviewFixture";

afterEach(() => cleanup());

const NEEDS_LOOK_ACTIVE: ParseWarning = {
  severity: "warn",
  code: "UNKNOWN_FIELD",
  message: "Unrecognized field.",
  rawSnippet: "Parking | validated onsite",
};
const NEEDS_LOOK_IGNORED: ParseWarning = {
  severity: "warn",
  code: "UNKNOWN_FIELD",
  message: "Unrecognized field.",
  rawSnippet: "Hotel notes | double occupancy",
};
const JUDGMENT_IGNORED: ParseWarning = {
  severity: "warn",
  code: "HOTEL_GUEST_SPLIT_AMBIGUOUS",
  message: "Ambiguous guest split.",
  rawSnippet: "Hyatt Eric Weiss",
};

// The fixture's premise, checked through the ONE spelling of the kind test: exactly
// one of the two ignored rows is a judgment call. Without it the split assertions
// below could pass on a fixture that never exercises the partition.
premiseHolds("the judgment fixture is a judgment call", isJudgmentCall(JUDGMENT_IGNORED));
premiseHolds("the needs-look fixture is not", !isJudgmentCall(NEEDS_LOOK_IGNORED));

function defById(defs: Step3SectionDef[], id: string): Step3SectionDef {
  const def = defs.find((s) => s.id === id);
  if (!def) throw new Error(`registry has no section '${id}'`);
  return def;
}

/** Staged SectionData over `warnings`, with the ORIGINAL indices in `ignored` dismissed. */
function stagedData(warnings: ParseWarning[], ignored: number[]): StagedSectionData {
  const pr = buildParseResult({ warnings });
  const row = stagedRow(pr);
  return {
    ...buildStagedSectionData({
      pr,
      row,
      dfid: DFID,
      wizardSessionId: WSID,
      crewMembers: pr.crewMembers,
      rooms: pr.rooms,
      hotels: pr.hotelReservations,
      pullSheet: [],
      archivedPullSheetTabs: [],
      pullSheetOverride: null,
      ros: {},
      warnings,
      agendaBaseline: [],
      useRawDecisions: [],
    }),
    dq: {
      target: { kind: "staged", wizardSessionId: WSID, driveFileId: DFID },
      model: {
        active: warnings
          .map((_, index) => ({ index, reportSurfaceId: `sid-${index}` }))
          .filter((it) => !ignored.includes(it.index)),
        ignored: ignored.map((index) => ({ index, reportSurfaceId: `sid-${index}` })),
      },
    },
  };
}

function renderWarnings(d: StagedSectionData) {
  return render(<>{defById(step3Sections(d), "warnings").render(d)}</>);
}

/** The heading count chip, read the way `headingCount()` reads it
 *  (tests/components/admin/sheetWarningsPanel.test.tsx): the `(N)` tabular-nums span in
 *  the warnings section's heading. Null when no chip renders. */
function headingCount(container: HTMLElement): number | null {
  const section = container.querySelector(
    `[data-testid="wizard-step3-card-${DFID}-breakdown-warnings"]`,
  );
  const heading = section?.querySelector("h3, h4") ?? null;
  if (heading === null) return null;
  const chip = Array.from(heading.querySelectorAll("span.tabular-nums")).find((el) =>
    /^\(\d+\)$/.test((el.textContent ?? "").trim()),
  );
  if (!chip) return null;
  return Number((chip.textContent ?? "").trim().replace(/[()]/g, ""));
}

describe("wizard Accepted (N) disclosure (spec §6.4)", () => {
  const warnings = [NEEDS_LOOK_ACTIVE, NEEDS_LOOK_IGNORED, JUDGMENT_IGNORED];
  const IGNORED = [1, 2];

  it("judgment rows sit only under Accepted, needs-look rows only under Ignored, Ignored first", () => {
    const q = renderWarnings(stagedData(warnings, IGNORED));
    const ignoredList = q.getByTestId(`wizard-step3-card-${DFID}-ignored-list`);
    const acceptedList = q.getByTestId(`wizard-step3-card-${DFID}-accepted-list`);

    const ignoredRows = ignoredList.querySelectorAll("li");
    const acceptedRows = acceptedList.querySelectorAll("li");
    expect(ignoredRows).toHaveLength(1);
    expect(acceptedRows).toHaveLength(1);
    // Identity by each fixture's own snippet, never a restated literal.
    expect(ignoredRows[0]?.textContent).toContain("Hotel notes");
    expect(acceptedRows[0]?.textContent).toContain(JUDGMENT_IGNORED.rawSnippet);
    expect(ignoredList.textContent).not.toContain(JUDGMENT_IGNORED.rawSnippet);

    expect(q.getByTestId(`wizard-step3-card-${DFID}-ignored-summary`).textContent).toContain(
      "Ignored (1)",
    );
    expect(q.getByTestId(`wizard-step3-card-${DFID}-accepted-summary`).textContent).toContain(
      "Accepted (1)",
    );
    const accepted = q.getByTestId(`wizard-step3-card-${DFID}-accepted-warnings`);
    expect(accepted.tagName.toLowerCase()).toBe("details");
    // The accepted row's restore button names the accept.
    expect(within(acceptedList).getByRole("button", { name: "Undo accept" })).toBeTruthy();
    expect(within(ignoredList).getByRole("button", { name: /un-ignore/i })).toBeTruthy();

    // DOM order: Ignored, then Accepted.
    const ignored = q.getByTestId(`wizard-step3-card-${DFID}-ignored-warnings`);
    expect(ignored.compareDocumentPosition(accepted) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("the heading chip and the rail count agree with the fixture's active rows", () => {
    // Derived from the fixture arrays, never from wizardPanelCount: the active warn rows.
    const expectedActive = warnings.filter((_, i) => !IGNORED.includes(i)).length;
    premiseHolds("an accepted or ignored row would change the count", expectedActive === 1);
    const d = stagedData(warnings, IGNORED);
    const q = renderWarnings(d);
    expect(headingCount(q.container)).toBe(expectedActive);
    const railCount = defById(step3Sections(d), "warnings").railCount;
    if (railCount === null) throw new Error("the warnings section has no rail count");
    expect(railCount(d, { routedWarningsRenderElsewhere: false })).toBe(expectedActive);
  });

  it("zero judgment rows ignored: no Accepted disclosure", () => {
    const q = renderWarnings(stagedData(warnings, [1]));
    expect(q.getByTestId(`wizard-step3-card-${DFID}-ignored-warnings`)).toBeTruthy();
    expect(q.queryByTestId(`wizard-step3-card-${DFID}-accepted-warnings`)).toBeNull();
  });

  it("zero needs-look rows ignored: no Ignored disclosure", () => {
    const q = renderWarnings(stagedData(warnings, [2]));
    expect(q.queryByTestId(`wizard-step3-card-${DFID}-ignored-warnings`)).toBeNull();
    expect(q.getByTestId(`wizard-step3-card-${DFID}-accepted-warnings`)).toBeTruthy();
  });

  it("both zero: neither disclosure renders", () => {
    const q = renderWarnings(stagedData([NEEDS_LOOK_ACTIVE], []));
    expect(q.queryByTestId(`wizard-step3-card-${DFID}-ignored-warnings`)).toBeNull();
    expect(q.queryByTestId(`wizard-step3-card-${DFID}-accepted-warnings`)).toBeNull();
  });

  it("every row dismissed: the all-clean copy is unchanged, both disclosures below it", () => {
    const q = renderWarnings(stagedData([NEEDS_LOOK_IGNORED, JUDGMENT_IGNORED], [0, 1]));
    expect(q.getByTestId(`wizard-step3-card-${DFID}-warnings-clean`).textContent).toContain(
      "Nothing needs a look on this sheet.",
    );
    expect(q.queryByTestId(`wizard-step3-card-${DFID}-warnings-empty`)).toBeNull();
    expect(q.getByTestId(`wizard-step3-card-${DFID}-ignored-warnings`)).toBeTruthy();
    expect(q.getByTestId(`wizard-step3-card-${DFID}-accepted-warnings`)).toBeTruthy();
  });
});

describe("published Accepted (N) disclosure (spec §6.4)", () => {
  const needsLookA: SectionWarningItem = { warning: NEEDS_LOOK_IGNORED, reportSurfaceId: "rs-a" };
  const judgmentJ: SectionWarningItem = { warning: JUDGMENT_IGNORED, reportSurfaceId: "rs-j" };
  const needsLookB: SectionWarningItem = {
    warning: { ...NEEDS_LOOK_IGNORED, rawSnippet: "Loading dock | rear" },
    reportSurfaceId: "rs-b",
  };

  function publishedData() {
    const data = buildPublishedSurfaceProps({}).data;
    if (!isPublished(data)) throw new Error("expected published SectionData");
    return data;
  }

  function model(ignored: SectionWarningItem[]): SectionWarningModel {
    return { active: [], ignored, bulkGroups: [], activeGroups: [], warningsByCrewKey: {} };
  }

  function renderExtras(ignored: SectionWarningItem[]) {
    const extras = buildSectionWarningExtras({ bySection: { warnings: model(ignored) } });
    return render(<>{extras("warnings", publishedData())}</>);
  }

  it("each row carries its OWN record's report id across the split", () => {
    // Judgment between two needs-look rows: a positional read after filtering hands
    // B the judgment row's id.
    const q = renderExtras([needsLookA, judgmentJ, needsLookB]);
    const ignoredList = q.getByTestId("section-ignored-list-warnings");
    const acceptedList = q.getByTestId("section-accepted-list-warnings");
    for (const it of [needsLookA, needsLookB]) {
      expect(within(ignoredList).getByTestId(`dq-unignore-${it.reportSurfaceId}`)).toBeTruthy();
      expect(within(acceptedList).queryByTestId(`dq-unignore-${it.reportSurfaceId}`)).toBeNull();
    }
    expect(
      within(acceptedList).getByTestId(`dq-unignore-${judgmentJ.reportSurfaceId}`),
    ).toBeTruthy();
    expect(
      within(ignoredList).queryByTestId(`dq-unignore-${judgmentJ.reportSurfaceId}`),
    ).toBeNull();
    expect(q.getByTestId("section-ignored-summary-warnings").textContent).toContain("Ignored (2)");
    expect(q.getByTestId("section-accepted-summary-warnings").textContent).toContain(
      "Accepted (1)",
    );
    const ignored = q.getByTestId("section-ignored-warnings-warnings");
    const accepted = q.getByTestId("section-accepted-warnings-warnings");
    expect(ignored.compareDocumentPosition(accepted) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("a section holding only an accepted row still renders (the empty-seam guard tests the union)", () => {
    const q = renderExtras([judgmentJ]);
    expect(q.getByTestId("section-warning-controls-warnings")).toBeTruthy();
    expect(q.getByTestId("section-accepted-warnings-warnings")).toBeTruthy();
    expect(q.queryByTestId("section-ignored-warnings-warnings")).toBeNull();
  });

  it("a section holding only needs-look rows renders no Accepted disclosure", () => {
    const q = renderExtras([needsLookA]);
    expect(q.getByTestId("section-ignored-warnings-warnings")).toBeTruthy();
    expect(q.queryByTestId("section-accepted-warnings-warnings")).toBeNull();
  });
});
