// @vitest-environment jsdom
/**
 * tests/components/admin/wizard/step3DirtyRescan.test.tsx (Task 5b — UI)
 *
 * A Step-3 row demoted by a per-sheet re-scan carries
 * lastFinalizeFailureCode === 'RESCAN_REVIEW_REQUIRED'. Such a row must render a
 * DISTINCT "this sheet changed — review it" state: a link to the reapply page and
 * NO bare publish checkbox (the checkbox /approve cannot safely clear it — Task 5b
 * guard). Rendered through <Step3Review> (not <Step3SheetCard> directly) so the
 * row-routing that production uses is exercised, and across BOTH card render paths
 * (a normal parsed card AND the null-parse no-details card).
 *
 * Concrete failure mode pinned: a dirty re-scan row showing the ordinary publish
 * checkbox (which would silently re-approve a crew change on click).
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { RESCAN_REVIEW_REQUIRED } from "@/lib/onboarding/rescanReviewCode";
import { Step3Review, type Step3Row } from "@/components/admin/wizard/Step3Review";
import type { ParseResult } from "@/lib/parser/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin/onboarding",
}));

const WSID = "11111111-1111-1111-1111-111111111111";

const PARSE: ParseResult = {
  show: { title: "Dirty Re-scan Show", client_label: "Client" },
} as unknown as ParseResult;

function dirtyRow(dfid: string, parseResult: ParseResult | null): Step3Row {
  return {
    driveFileId: dfid,
    driveFileName: `${dfid}.gsheet`,
    status: "staged",
    parseResult,
    lastFinalizeFailureCode: RESCAN_REVIEW_REQUIRED,
  };
}

afterEach(() => cleanup());

describe("Step-3 dirty re-scan row (RESCAN_REVIEW_REQUIRED)", () => {
  test("normal-parse card: renders the reapply link to the right page and SUPPRESSES the publish checkbox", () => {
    const dfid = "drive-dirty-normal";
    const { getByTestId, queryByTestId } = render(
      <Step3Review wizardSessionId={WSID} rows={[dirtyRow(dfid, PARSE)]} />,
    );

    const link = getByTestId(`wizard-step3-rescan-review-${dfid}`);
    expect(link.getAttribute("href")).toBe(`/admin/onboarding/staged/${WSID}/${dfid}`);
    expect(link.textContent ?? "").toContain("Review this sheet");

    // The plain publish checkbox is suppressed for this row.
    expect(queryByTestId(`wizard-step3-checkbox-${dfid}`)).toBeNull();
  });

  test("null-parse (no-details) card: STILL renders the reapply link", () => {
    const dfid = "drive-dirty-nodetails";
    const { getByTestId, queryByTestId } = render(
      <Step3Review wizardSessionId={WSID} rows={[dirtyRow(dfid, null)]} />,
    );

    const link = getByTestId(`wizard-step3-rescan-review-${dfid}`);
    expect(link.getAttribute("href")).toBe(`/admin/onboarding/staged/${WSID}/${dfid}`);
    expect(queryByTestId(`wizard-step3-checkbox-${dfid}`)).toBeNull();
  });

  test("the distinct copy explains the sheet changed and to review before publishing", () => {
    const dfid = "drive-dirty-copy";
    const { getByTestId } = render(
      <Step3Review wizardSessionId={WSID} rows={[dirtyRow(dfid, PARSE)]} />,
    );
    const card = getByTestId(`wizard-step3-card-${dfid}`);
    expect(card.textContent ?? "").toContain(
      "This sheet changed since you reviewed it. Review it before publishing.",
    );
    // No raw §12.4 code leaks into the DOM (invariant 5).
    expect(card.textContent ?? "").not.toContain(RESCAN_REVIEW_REQUIRED);
  });

  test("regression: a normal clean row (no failure code) keeps its publish checkbox and shows NO reapply link", () => {
    const dfid = "drive-clean";
    const cleanRow: Step3Row = {
      driveFileId: dfid,
      driveFileName: `${dfid}.gsheet`,
      status: "staged",
      parseResult: PARSE,
    };
    const { getByTestId, queryByTestId } = render(
      <Step3Review wizardSessionId={WSID} rows={[cleanRow]} />,
    );
    expect(getByTestId(`wizard-step3-checkbox-${dfid}`)).not.toBeNull();
    expect(queryByTestId(`wizard-step3-rescan-review-${dfid}`)).toBeNull();
  });
});
