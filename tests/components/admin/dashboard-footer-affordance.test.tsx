// @vitest-environment jsdom
/**
 * tests/components/admin/dashboard-footer-affordance.test.tsx
 * (M11 Phase G.3 — concrete-UI affordance test #1 per plan body Step 5b)
 *
 * Pins the dashboard-footer "Take the tour →" affordance per spec §5.6:
 *   - testid: help-affordance--dashboard-footer--tour
 *   - href:   /help/tour
 *   - text:   "Take the tour →"
 *
 * Phase G.3 supersedes M10's `<Tour />` in-product modal with a link to
 * /help/tour (the Phase E.12 canonical help page). The old `<Tour />`
 * modal trigger (data-testid="admin-tour-trigger") MUST be absent.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DashboardFooter } from "@/components/admin/DashboardFooter";

afterEach(() => cleanup());

describe("DashboardFooter (Phase G.3 — matrix row 4)", () => {
  it("renders the matrix-testid'd Take-the-tour link to /help/tour", () => {
    render(<DashboardFooter />);
    const link = screen.getByTestId("help-affordance--dashboard-footer--tour");
    expect(link).toBeInstanceOf(HTMLAnchorElement);
    expect((link as HTMLAnchorElement).getAttribute("href")).toBe("/help/tour");
    expect(link.textContent).toMatch(/Take the tour/);
  });

  // M12.12 follow-up — the "→" is decorative; aria-hiding it keeps it out of
  // the accessible name. Failure mode caught: someone inlines the arrow back
  // into the accessible name.
  it("tour-link accessible name drops the decorative → (aria-label), visible text keeps it", () => {
    render(<DashboardFooter />);
    const link = screen.getByRole("link", { name: "Take the tour" });
    expect(link.getAttribute("aria-label")).toBe("Take the tour");
    // The visible text run stays UNSPLIT — wrapping the arrow in a span
    // shifts text-decoration paint and (on this flex container) drops the
    // space before the arrow, both byte-level screenshot drift (PR #25 R1/R2).
    expect(link.textContent).toBe("Take the tour →");
    expect(link.firstElementChild).toBeNull();
  });

  it("does not render the retired M10 Tour modal trigger", () => {
    render(<DashboardFooter />);
    expect(screen.queryByTestId("admin-tour-trigger")).toBeNull();
    expect(screen.queryByTestId("admin-tour-dialog")).toBeNull();
  });
});
