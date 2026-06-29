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
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function cleanRow(dfid: string): Step3Row {
  return {
    driveFileId: dfid,
    driveFileName: `${dfid}.gsheet`,
    status: "staged",
    parseResult: PARSE,
  };
}

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

  test("aggregate publish: Select-all POSTs only the clean row and SKIPS the dirty re-scan row; the count excludes it", async () => {
    const clean = "drive-clean-aggregate";
    const dirty = "drive-dirty-aggregate";
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => ({ status: "approved" }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { getByTestId } = render(
      <Step3Review wizardSessionId={WSID} rows={[cleanRow(clean), dirtyRow(dirty, PARSE)]} />,
    );

    // M counts only the selectable (clean) row — the dirty row is excluded from the set.
    expect(getByTestId("wizard-step3-publish-count").textContent ?? "").toContain("0 of 1");

    fireEvent.click(getByTestId("wizard-step3-select-all"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    // The clean row is approved…
    expect(urls.some((u) => u.includes(clean) && u.endsWith("/approve"))).toBe(true);
    // …and the dirty re-scan row is NEVER POSTed by Select-all (server would refuse it).
    expect(urls.some((u) => u.includes(dirty))).toBe(false);
  });

  test("aggregate publish: a clean row whose /approve returns HTTP 200 {ok:false} reverts the box (needs-review, not success)", async () => {
    const dfid = "drive-clean-refused";
    // The server SAFELY refuses with HTTP 200 + { ok:false } (e.g. the row went dirty
    // between render and click → RESCAN_REVIEW_REQUIRED). The publish was NOT applied.
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: false, code: RESCAN_REVIEW_REQUIRED }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { getByTestId } = render(<Step3Review wizardSessionId={WSID} rows={[cleanRow(dfid)]} />);
    const box = getByTestId(`wizard-step3-checkbox-${dfid}`) as HTMLInputElement;
    expect(box.checked).toBe(false);

    fireEvent.click(box);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    // {ok:false} is a refusal → the optimistic check reverts to server truth; the box
    // must NOT remain checked (which would falsely read as "published").
    await waitFor(() => expect(box.checked).toBe(false));
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
