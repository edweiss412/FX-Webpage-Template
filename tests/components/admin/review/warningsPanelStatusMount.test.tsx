// tests/components/admin/review/warningsPanelStatusMount.test.tsx
// @vitest-environment jsdom
/** Spec §3.2/§8.3: the status span lives OUTSIDE the suppressible panel-card
 *  subtree (step3ReviewSections.tsx:792-815 unmounts children in Silent), so
 *  the SAME node instance survives clean<->Silent and its text changes.
 *  Renders through the real surface, not a bare WarningsBreakdown. */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/admin/show/polish-fixture-show",
  useSearchParams: () => new URLSearchParams(),
}));

import { buildPublishedSurfaceProps } from "@/tests/helpers/publishedSurfaceProps";
import { ShowReviewSurface } from "@/components/admin/review/ShowReviewSurface";

afterEach(cleanup);

describe("warnings panel live region (spec §3.2)", () => {
  it("gate ON: span present, correct sentence, same node across Silent re-render", () => {
    const silent = buildPublishedSurfaceProps({ listed: 0, here: 2, elsewhere: 0 });
    const { rerender } = render(<ShowReviewSurface {...silent} />);
    const span = screen.getByTestId("warnings-panel-status");
    expect(span.getAttribute("role")).toBe("status");
    expect(span.textContent).toBe("2 warnings need a look below.");
    const clean = buildPublishedSurfaceProps({ listed: 0, here: 0, elsewhere: 0 });
    rerender(<ShowReviewSurface {...clean} />);
    expect(screen.getByTestId("warnings-panel-status")).toBe(span); // same instance
    expect(span.textContent).toBe("Nothing needs a look on this sheet.");
  });

  it("production wiring feeds each bucket: listed, elsewhere, and the mixed tuple", () => {
    // Catches: wiring that always passes zero for listed, swaps here/elsewhere,
    // or derives elsewhere from the wrong model. Counts differ pairwise so a
    // swapped pair cannot produce the same sentence.
    const { rerender } = render(
      <ShowReviewSurface {...buildPublishedSurfaceProps({ listed: 2, here: 0, elsewhere: 0 })} />,
    );
    const span = screen.getByTestId("warnings-panel-status");
    expect(span.textContent).toBe("2 warnings listed.");
    rerender(
      <ShowReviewSurface {...buildPublishedSurfaceProps({ listed: 0, here: 0, elsewhere: 3 })} />,
    );
    expect(span.textContent).toBe("3 warnings need a look in their own sections.");
    rerender(
      <ShowReviewSurface {...buildPublishedSurfaceProps({ listed: 2, here: 1, elsewhere: 3 })} />,
    );
    expect(span.textContent).toBe(
      "2 warnings listed. 1 warning needs a look below. 3 warnings need a look in their own sections.",
    );
  });

  it("gate OFF (staged shape): span absent", () => {
    const staged = buildPublishedSurfaceProps({ listed: 1, gateOff: true });
    render(<ShowReviewSurface {...staged} />);
    expect(screen.queryByTestId("warnings-panel-status")).toBeNull();
  });
});
