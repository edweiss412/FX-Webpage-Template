// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

    // The EXACT class the mocked loader exposes as `variable`, not a loose
    // pattern. Review R7 showed a `/inter/i` match was satisfied by an
    // unrelated `winter-theme` class, and by `inter.className` — which would
    // leave `--font-inter` unexposed while the test stayed green. The mock's
    // constants deliberately do not contain the substring "inter" so a loose
    // matcher cannot creep back in unnoticed.
    // MECHANISM CHANGED, INTENT DID NOT. There is no generated class to look
    // for any more: the face lives in `app/fonts.css`, which defines
    // `--font-inter` on `:root`. What has to hold is unchanged and is exactly
    // the gap this test was written for — the crash screen replaces the root
    // layout, so anything the root imports is absent here unless this module
    // imports it too. Assert the import, which is what makes the token resolve.
    const source = readFileSync(resolve(__dirname, "..", "..", "app", "global-error.tsx"), "utf8");
    expect(
      source,
      "the crash screen imports the fonts stylesheet, so --font-inter resolves on its own <html>",
    ).toMatch(/import\s+["']\.\/fonts\.css["']/);

    // WCAG 3.1.1 Level A. The sibling root carries lang="en"; this one replaces
    // it, so without this the crash screen declares no language at all.
    expect(html.getAttribute("lang"), "the crash-screen root declares its language").toBe("en");
  });
});
