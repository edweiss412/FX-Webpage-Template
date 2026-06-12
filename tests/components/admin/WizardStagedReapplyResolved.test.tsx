// @vitest-environment jsdom
/**
 * tests/components/admin/WizardStagedReapplyResolved.test.tsx
 * (M-onboarding-fixups Phase 3 / F3 — spec §5)
 *
 * Pins the row-gone contract of the wizard re-apply page:
 * consumed/malformed → rendered "already resolved" state (NOT notFound());
 * infra error → unchanged; found row → unchanged (StagedReviewCard mounts).
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, within } from "@testing-library/react";

const requireAdminMock = vi.fn(async () => undefined);
vi.mock("@/lib/auth/requireAdmin", () => ({
  requireAdmin: () => requireAdminMock(),
}));

// Sentinel: if the page ever calls notFound() again, the render throws and
// the resolved-state test fails loudly (concrete failure mode: regression to 404).
const notFoundMock = vi.fn((): never => {
  throw new Error("NEXT_NOT_FOUND_SENTINEL");
});
vi.mock("next/navigation", () => ({ notFound: () => notFoundMock() }));

// The found-row path mounts this client component; stub it (its own contract is
// pinned by tests/components/admin/WizardStagedPage.test.tsx).
vi.mock("@/components/admin/StagedReviewCard", () => ({
  StagedReviewCard: () => <div data-testid="staged-review-card-stub" />,
}));

const state = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  queryError: null as { message: string } | null,
  clientThrows: false,
  queryCount: 0,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => {
    if (state.clientThrows) throw new Error("client construction failed");
    return {
      from: () => {
        state.queryCount += 1;
        const builder = {
          select: () => builder,
          eq: () => builder,
          maybeSingle: async () => ({ data: state.row, error: state.queryError }),
        };
        return builder;
      },
    };
  },
}));

import WizardStagedReapplyPage, {
  generateMetadata,
} from "@/app/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/page";

const WSID = "11111111-1111-1111-1111-111111111111";
const DFID = "drive-consumed-1";

async function renderPage(wizardSessionId = WSID, driveFileId = DFID) {
  return render(
    await WizardStagedReapplyPage({
      params: Promise.resolve({ wizardSessionId, driveFileId }),
    }),
  );
}

beforeEach(() => {
  state.row = null;
  state.queryError = null;
  state.clientThrows = false;
  state.queryCount = 0;
  notFoundMock.mockClear();
});

afterEach(() => cleanup());

describe("F3 — already-resolved state (spec §5)", () => {
  test("consumed row renders the resolved page with exact copy + both links; never notFound()", async () => {
    // Failure modes: notFound() restored (sentinel throws); copy drift; a link
    // pointing at a non-routable target.
    const { getByTestId, queryByTestId } = await renderPage();
    const resolved = within(getByTestId("wizard-staged-reapply-resolved"));
    expect(
      resolved.getByRole("heading", { name: "This sheet is already taken care of." }),
    ).toBeTruthy();
    expect(
      resolved.getByText(
        "It was applied or set aside, possibly from another tab. Nothing else is needed here.",
      ),
    ).toBeTruthy();
    expect(
      resolved.getByRole("link", { name: "Back to setup" }).getAttribute("href"),
    ).toBe("/admin/onboarding");
    expect(
      resolved.getByRole("link", { name: "Go to dashboard" }).getAttribute("href"),
    ).toBe("/admin");
    expect(notFoundMock).not.toHaveBeenCalled();
    // The re-apply working shell must NOT render alongside the resolved state.
    expect(queryByTestId("wizard-staged-reapply-page")).toBeNull();
    expect(queryByTestId("staged-review-card-stub")).toBeNull();
  });

  test("malformed wizardSessionId renders the SAME resolved page WITHOUT querying", async () => {
    // Failure mode: a non-uuid hitting `.eq()` on the uuid column makes PostgREST
    // 400 → the page would render the INFRA-ERROR state ("We could not load…")
    // instead of the resolved page. The guard must short-circuit pre-query.
    const { getByTestId, queryByTestId } = await renderPage("not-a-uuid");
    expect(getByTestId("wizard-staged-reapply-resolved")).toBeTruthy();
    expect(queryByTestId("wizard-staged-reapply-infra-error")).toBeNull();
    expect(state.queryCount).toBe(0);
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  test("unknown driveFileId (text column — query allowed) renders the resolved page", async () => {
    // driveFileId is text: indistinguishable-from-consumed by design (no
    // row-existence leak; copy stays generic — spec §5 guard conditions).
    const { getByTestId } = await renderPage(WSID, "no-such-file");
    expect(getByTestId("wizard-staged-reapply-resolved")).toBeTruthy();
    expect(state.queryCount).toBe(1);
  });

  test("infra error path is UNCHANGED: query error renders the infra-error state, not the resolved page", async () => {
    // Failure mode: over-broad refactor folds infra errors into "resolved" —
    // masking a real outage as success and stranding Doug with no retry cue.
    state.queryError = { message: "boom" };
    const { getByTestId, queryByTestId } = await renderPage();
    expect(getByTestId("wizard-staged-reapply-infra-error")).toBeTruthy();
    expect(queryByTestId("wizard-staged-reapply-resolved")).toBeNull();
  });

  test("client-construction failure also renders the infra-error state", async () => {
    state.clientThrows = true;
    const { getByTestId, queryByTestId } = await renderPage();
    expect(getByTestId("wizard-staged-reapply-infra-error")).toBeTruthy();
    expect(queryByTestId("wizard-staged-reapply-resolved")).toBeNull();
  });

  test("resolved branch gets its own tab title; found row keeps the re-apply title", async () => {
    // Failure mode: the static module-level title labels the resolved state
    // "Re-apply staged sheet" — a misleading tab title for a page whose body
    // says nothing is left to re-apply (impeccable-critique MEDIUM).
    const metadataFor = (wizardSessionId: string, driveFileId = DFID) =>
      generateMetadata({ params: Promise.resolve({ wizardSessionId, driveFileId }) });

    // Consumed row → resolved title.
    expect((await metadataFor(WSID)).title).toBe("Sheet already resolved · Admin · FXAV");
    // Malformed id → resolved title WITHOUT querying (same pre-query guard).
    state.queryCount = 0;
    expect((await metadataFor("not-a-uuid")).title).toBe(
      "Sheet already resolved · Admin · FXAV",
    );
    expect(state.queryCount).toBe(0);
    // Found row → the working-shell title (sibling-page format, page.tsx:33 form).
    state.row = {
      staged_id: "22222222-2222-2222-2222-222222222222",
      drive_file_id: DFID,
      staged_modified_time: "2026-06-10T12:00:00.000Z",
      base_modified_time: null,
      parse_result: null,
      triggered_review_items: [],
      last_finalize_failure_code: null,
      source_kind: "onboarding_scan",
    };
    expect((await metadataFor(WSID)).title).toBe("Re-apply staged sheet · Admin · FXAV");
  });

  test("found row still renders the working re-apply shell (StagedReviewCard mounts)", async () => {
    // Failure mode: the resolved-state branch swallows the found-row path.
    state.row = {
      staged_id: "22222222-2222-2222-2222-222222222222",
      drive_file_id: DFID,
      staged_modified_time: "2026-06-10T12:00:00.000Z",
      base_modified_time: null,
      parse_result: { show: { title: "RPAS Central 2026" } },
      triggered_review_items: [],
      last_finalize_failure_code: null,
      source_kind: "onboarding_scan",
    };
    const { getByTestId, queryByTestId } = await renderPage();
    expect(getByTestId("wizard-staged-reapply-page")).toBeTruthy();
    expect(getByTestId("staged-review-card-stub")).toBeTruthy();
    expect(queryByTestId("wizard-staged-reapply-resolved")).toBeNull();
  });
});
