// @vitest-environment jsdom
/**
 * tests/components/admin/wizard/step3FinalizeDemoted.test.tsx (audit idx39/#180)
 *
 * A Step-3 row demoted by ANY finalize failure code (not just RESCAN_REVIEW_REQUIRED)
 * is NOT publish-ready: Step3Review.selectableRows already excludes any row carrying a
 * `lastFinalizeFailureCode` from Select-all and the "N of M" count, and the server
 * /approve refuses it. The card must therefore SUPPRESS its publish checkbox for every
 * demoted code — otherwise a non-RESCAN demoted row (e.g. DRIVE_FETCH_FAILED) renders an
 * ENABLED checkbox that Select-all skips and the count omits (a checkable row that can
 * never actually be selected/counted).
 *
 * Rendered through <Step3Review> (not <Step3SheetCard> directly) so the row-routing
 * production uses is exercised.
 *
 * Concrete failure mode pinned: a non-RESCAN finalize-demoted row showing an enabled
 * publish checkbox inconsistent with selectableRows.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { Step3Review, type Step3Row } from "@/components/admin/wizard/Step3Review";
import type { ParseResult } from "@/lib/parser/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin/onboarding",
}));

const WSID = "11111111-1111-1111-1111-111111111111";
const PARSE: ParseResult = {
  show: { title: "Demoted Show", client_label: "Client" },
} as unknown as ParseResult;

// A NON-RESCAN finalize failure code: the row parsed fine (has a reviewable preview)
// but a later finalize attempt failed. It must not be publishable from the card.
const NON_RESCAN_CODE = "DRIVE_FETCH_FAILED";

function demotedRow(dfid: string): Step3Row {
  return {
    driveFileId: dfid,
    driveFileName: `${dfid}.gsheet`,
    status: "staged",
    parseResult: PARSE,
    lastFinalizeFailureCode: NON_RESCAN_CODE,
  };
}
function cleanRow(dfid: string): Step3Row {
  return {
    driveFileId: dfid,
    driveFileName: `${dfid}.gsheet`,
    status: "staged",
    parseResult: PARSE,
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Step-3 non-RESCAN finalize-demoted row (audit idx39/#180)", () => {
  test("SUPPRESSES the publish checkbox and shows a needs-attention note (no raw code leak)", () => {
    const dfid = "drive-demoted-drivefetch";
    const { getByTestId, queryByTestId } = render(
      <Step3Review wizardSessionId={WSID} rows={[demotedRow(dfid)]} />,
    );
    // The publish checkbox is suppressed for this demoted row (matches selectableRows).
    expect(queryByTestId(`wizard-step3-checkbox-${dfid}`)).toBeNull();
    // A minimal "needs attention — not publishable" indicator replaces it.
    const note = getByTestId(`wizard-step3-card-${dfid}-not-publishable`);
    expect((note.textContent ?? "").toLowerCase()).toMatch(/attention|publish/);
    // Invariant 5: no raw §12.4 code leaks into the DOM.
    expect(getByTestId(`wizard-step3-card-${dfid}`).textContent ?? "").not.toContain(
      NON_RESCAN_CODE,
    );
  });

  test("Select-all SKIPS the demoted row and the N-of-M count excludes it; a clean row stays selectable", async () => {
    const clean = "drive-clean";
    const demoted = "drive-demoted";
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => ({ status: "approved" }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const onCounts = vi.fn();
    const { getByTestId, queryByTestId } = render(
      <Step3Review
        wizardSessionId={WSID}
        rows={[cleanRow(clean), demotedRow(demoted)]}
        onCountsChange={onCounts}
      />,
    );

    // Variant B: the "N of M" count moved to the sticky bar; read it from the
    // reported counts. M counts only the selectable (clean) row — the demoted row
    // is excluded (selectableTotal 1, selectedCount 0 == "0 of 1").
    const last = onCounts.mock.calls.at(-1)?.[0];
    expect(last?.selectableTotal).toBe(1);
    expect(last?.selectedCount).toBe(0);
    // The clean row keeps its enabled checkbox; the demoted row has none.
    expect(getByTestId(`wizard-step3-checkbox-${clean}`)).not.toBeNull();
    expect(queryByTestId(`wizard-step3-checkbox-${demoted}`)).toBeNull();

    fireEvent.click(getByTestId("wizard-step3-select-all"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    // The clean row is approved…
    expect(urls.some((u) => u.includes(clean) && u.endsWith("/approve"))).toBe(true);
    // …and the demoted row is NEVER POSTed by Select-all (server would refuse it).
    expect(urls.some((u) => u.includes(demoted))).toBe(false);
  });

  test("regression: a clean row (no failure code) keeps its checkbox and shows NO needs-attention note", () => {
    const dfid = "drive-clean-regression";
    const { getByTestId, queryByTestId } = render(
      <Step3Review wizardSessionId={WSID} rows={[cleanRow(dfid)]} />,
    );
    expect(getByTestId(`wizard-step3-checkbox-${dfid}`)).not.toBeNull();
    expect(queryByTestId(`wizard-step3-card-${dfid}-not-publishable`)).toBeNull();
  });
});
