// tests/components/admin/showpage/sectionWarningSeam.test.tsx
// @vitest-environment jsdom
/** Spec §3.3/§8.4, superseded by warning-trim un-defer §2.2.3: the WARNINGS
 *  extras are now ALWAYS seamless (they render in-box beneath the notes group, so
 *  the box supplies the boundary), in EVERY state. Every other section keeps its
 *  `border-t` seam. Matrix: warnings seamless in Silent/List/here+parseNotes;
 *  mixed -> warnings seamless while crew keeps its seam in the same render. */
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

const SEAM_CLASSES = "mt-3 flex flex-col gap-3 border-t border-border pt-3";
const SEAMLESS_CLASSES = "flex flex-col gap-3";

function extrasClass(sectionId: string): string | null {
  return screen.queryByTestId(`section-warning-controls-${sectionId}`)?.className ?? null;
}

describe("extras seam (spec §3.3)", () => {
  it("Silent: warnings extras drop the seam", () => {
    render(
      <ShowReviewSurface {...buildPublishedSurfaceProps({ listed: 0, here: 2, elsewhere: 0 })} />,
    );
    expect(extrasClass("warnings")).toBe(SEAMLESS_CLASSES);
  });

  it("List state: warnings extras stay seamless (box supplies the boundary)", () => {
    render(
      <ShowReviewSurface {...buildPublishedSurfaceProps({ listed: 1, here: 2, elsewhere: 0 })} />,
    );
    expect(extrasClass("warnings")).toBe(SEAMLESS_CLASSES);
  });

  it("here + parseNotes: extras seamless, and the panel card is genuinely present", () => {
    render(
      <ShowReviewSurface
        {...buildPublishedSurfaceProps({ listed: 0, here: 2, elsewhere: 0, withParseNotes: true })}
      />,
    );
    expect(extrasClass("warnings")).toBe(SEAMLESS_CLASSES);
    // The parse-notes banner block renders inside the card body only.
    expect(screen.getByTestId("parse-attention-notes")).toBeTruthy();
  });

  it("mixed here+elsewhere: warnings seamless while crew keeps its seam in the same render", () => {
    render(
      <ShowReviewSurface
        {...buildPublishedSurfaceProps({ listed: 0, here: 1, elsewhereInCrew: 2 })}
      />,
    );
    expect(extrasClass("warnings")).toBe(SEAMLESS_CLASSES);
    expect(extrasClass("crew")).toBe(SEAM_CLASSES);
  });
});
