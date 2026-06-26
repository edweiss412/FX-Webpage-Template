// @vitest-environment jsdom
/**
 * tests/components/wizardStagedPage.heading.test.tsx (Task D6 — spec §8.3 / AC6)
 *
 * The wizard staged detail page reverts to failure-recovery only. Its heading +
 * subcopy must be CONDITIONAL on `row.last_finalize_failure_code`:
 *   - code set  → the failure copy ("Re-apply this sheet" / "The last publish
 *                 attempt could not finish this sheet …").
 *   - code null → neutral copy ("Re-review this sheet" / a neutral subcopy with
 *                 NO "last publish attempt could not finish" claim).
 *
 * Since the D2 link removal, first-review traffic no longer routes here, so the
 * page's heading must not assert a failure that didn't happen. This is a state
 * page with NO §12.4 code (page.tsx:66), so no catalog work.
 *
 * Reuses the WizardStagedReapplyResolved.test.tsx mocking topology (requireAdmin
 * + a chainable createSupabaseServerClient + a StagedReviewCard stub) so the
 * test exercises the real Server Component branch, not a re-implementation.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, within } from "@testing-library/react";

const requireAdminMock = vi.fn(async () => undefined);
vi.mock("@/lib/auth/requireAdmin", () => ({
  requireAdmin: () => requireAdminMock(),
}));

vi.mock("next/navigation", () => ({ notFound: () => undefined }));

vi.mock("@/components/admin/StagedReviewCard", () => ({
  StagedReviewCard: () => <div data-testid="staged-review-card-stub" />,
}));

const state = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from: () => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({ data: state.row, error: null }),
      };
      return builder;
    },
  }),
}));

import WizardStagedReapplyPage from "@/app/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/page";

const WSID = "11111111-1111-1111-1111-111111111111";
const DFID = "drive-staged-1";

function rowWith(lastFinalizeFailureCode: string | null): Record<string, unknown> {
  return {
    staged_id: "22222222-2222-2222-2222-222222222222",
    drive_file_id: DFID,
    staged_modified_time: "2026-06-10T12:00:00.000Z",
    base_modified_time: null,
    parse_result: { show: { title: "RPAS Central 2026" } },
    triggered_review_items: [],
    last_finalize_failure_code: lastFinalizeFailureCode,
    source_kind: "onboarding_scan",
  };
}

async function renderPage() {
  return render(
    await WizardStagedReapplyPage({
      params: Promise.resolve({ wizardSessionId: WSID, driveFileId: DFID }),
    }),
  );
}

beforeEach(() => {
  state.row = null;
  requireAdminMock.mockClear();
});

afterEach(() => cleanup());

describe("Wizard staged page conditional failure heading (Task D6 / §8.3)", () => {
  test("last_finalize_failure_code SET → renders the failure heading + failure subcopy", async () => {
    state.row = rowWith("STAGED_PARSE_REVISION_RACE_DURING_FINALIZE");
    const { getByTestId } = await renderPage();
    const page = within(getByTestId("wizard-staged-reapply-page"));
    expect(page.getByRole("heading", { name: "Re-apply this sheet" })).toBeTruthy();
    // The failure subcopy makes the "last publish attempt could not finish" claim.
    expect(getByTestId("wizard-staged-reapply-page").textContent ?? "").toContain(
      "The last publish attempt could not finish this sheet",
    );
  });

  test("last_finalize_failure_code NULL → renders the NEUTRAL heading, NOT the failure copy", async () => {
    state.row = rowWith(null);
    const { getByTestId } = await renderPage();
    const root = getByTestId("wizard-staged-reapply-page");
    const page = within(root);
    // Neutral heading.
    expect(page.getByRole("heading", { name: "Re-review this sheet" })).toBeTruthy();
    // The failure heading + failure claim are NOT present.
    expect(page.queryByRole("heading", { name: "Re-apply this sheet" })).toBeNull();
    expect(root.textContent ?? "").not.toContain(
      "The last publish attempt could not finish this sheet",
    );
  });
});
