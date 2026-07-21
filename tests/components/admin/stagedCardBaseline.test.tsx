// @vitest-environment jsdom
/**
 * tests/components/admin/stagedCardBaseline.test.tsx
 * (plan Task 5 Step 0; spec §12 test 8a)
 *
 * A BEFORE-BASELINE for the staged warning cards, recorded against code this
 * task has not yet touched.
 *
 * Task 5 adds an optional `followUpCopy` input to `PerShowActionableWarnings`
 * and passes it from the PUBLISHED extras factory only. `StagedReviewCard` must
 * be untouched by that. Every other staged assertion in this change is narrow
 * (this exact sentence is absent, this prop is not passed), and narrow
 * assertions cannot see a card that gained a different label, a reordered
 * control, or a changed class. A snapshot can.
 *
 * Recording it BEFORE the implementation is what makes it a baseline rather than
 * a blessing of whatever the implementation happened to produce (spec §12 test
 * 8a; plan review R3b finding 8).
 *
 * It deliberately snapshots the CARD elements rather than the whole tree, so an
 * unrelated change to `StagedReviewCard`'s surrounding chrome does not create
 * noise here while a change to the cards themselves still fails.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/admin/onboarding",
  useSearchParams: () => new URLSearchParams(),
}));

import { PerShowActionableWarnings } from "@/components/admin/PerShowActionableWarnings";
import { FIXTURE_DRIVE_FILE_ID, MAPPED_WARNINGS } from "@/tests/helpers/warningSurfaceFixture";

afterEach(cleanup);

describe("staged warning-card markup baseline", () => {
  it("renders each card exactly as it does today", () => {
    // The staged mount passes ONLY `items` and `driveFileId`
    // (components/admin/StagedReviewCard.tsx:521). Reproducing that exact prop
    // set is the point: a snapshot taken with different props would not be a
    // baseline for the staged surface.
    render(
      <PerShowActionableWarnings items={[...MAPPED_WARNINGS]} driveFileId={FIXTURE_DRIVE_FILE_ID} />,
    );

    const cards = screen.queryAllByTestId("per-show-actionable-item");
    // Non-empty, or the snapshot below would pass vacuously against nothing.
    expect(cards.length).toBe(MAPPED_WARNINGS.length);

    // One snapshot per card, in document order.
    expect(cards.map((el) => el.outerHTML)).toMatchSnapshot();
  });
});
