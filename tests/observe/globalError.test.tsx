// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
const h = vi.hoisted(() => ({ captureBoundaryError: vi.fn() }));
vi.mock("@/lib/observe/captureBoundaryError", () => ({
  captureBoundaryError: h.captureBoundaryError,
}));
import GlobalError from "@/app/global-error";
const { captureBoundaryError } = h;
afterEach(() => {
  cleanup();
  captureBoundaryError.mockReset();
});

describe("global-error", () => {
  test("captures with area=root on mount and renders crew copy + reload", () => {
    const reset = vi.fn();
    const err = Object.assign(new Error("boom"), { digest: "d9" });
    render(<GlobalError error={err} reset={reset} />);
    expect(captureBoundaryError).toHaveBeenCalledWith(err, "root");
    expect(screen.getByText(/try reloading/i)).toBeInTheDocument(); // PAGE_RENDER_FAILED crewFacing
    fireEvent.click(screen.getByRole("button", { name: /reload/i }));
    expect(reset).toHaveBeenCalled();
  });

  /**
   * The SECOND ROOT.
   *
   * Next 16 lets `global-error` render its own `<html>`, which REPLACES the root
   * layout — so everything `app/layout.tsx` sets up is absent here unless this
   * file re-establishes it. The stylesheet import has always been carried across
   * for that reason; the font was not, which left the crash screen as the one
   * tree rendering a system font after `BL-HEADER-FONT-FALLBACK-WRAP` closed
   * everywhere else.
   *
   * The browser suite cannot cover this: `tests/e2e/font-binding.spec.ts` visits
   * real routes, and every one of them mounts the ORDINARY root. Deleting the
   * font import from this file leaves that suite and the single-loader guard
   * entirely green — which is exactly why this case exists (adversarial review
   * R6 raised its absence as an invariant-1 P0).
   */
  test("re-establishes the root layout's font and language on its own <html>", () => {
    render(<GlobalError error={new Error("boom")} reset={vi.fn()} />);
    // React 19 hoists a rendered <html>'s props onto the real documentElement
    // rather than nesting an <html> inside the test container, so the attributes
    // are read from there.
    const html = document.documentElement;

    // The generated next/font class. Its real name is hashed per build, so match
    // the shape rather than a literal: what matters is that the shared loader's
    // `variable` class is APPLIED here, i.e. carried across from app/fonts.ts.
    // (tests/setup.ts mocks next/font/google, since it is a build-time
    // transform that throws outside Next's compilation pipeline.)
    expect(
      html.getAttribute("class") ?? "",
      "the shared loader's variable class is applied, so --font-inter resolves here too",
    ).toMatch(/inter/i);

    // WCAG 3.1.1 Level A. The sibling root carries lang="en"; this one replaces
    // it, so without this the crash screen declares no language at all.
    expect(html.getAttribute("lang"), "the crash-screen root declares its language").toBe("en");
  });
});
