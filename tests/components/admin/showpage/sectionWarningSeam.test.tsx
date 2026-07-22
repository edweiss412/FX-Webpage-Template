// tests/components/admin/showpage/sectionWarningSeam.test.tsx
// @vitest-environment jsdom
/** Spec §3.3/§8.4. Catches: seam dropped in the wrong state or wrong section.
 *  Matrix: Silent -> warnings extras seamless; List -> byte-identical classes;
 *  here+parseNotes -> card AND seam stay; mixed -> only warnings seamless. */
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

  it("List state: byte-identical seam classes", () => {
    render(
      <ShowReviewSurface {...buildPublishedSurfaceProps({ listed: 1, here: 2, elsewhere: 0 })} />,
    );
    expect(extrasClass("warnings")).toBe(SEAM_CLASSES);
  });

  it("here + parseNotes: card stays, seam stays", () => {
    render(
      <ShowReviewSurface
        {...buildPublishedSurfaceProps({ listed: 0, here: 2, elsewhere: 0, withParseNotes: true })}
      />,
    );
    expect(extrasClass("warnings")).toBe(SEAM_CLASSES);
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
