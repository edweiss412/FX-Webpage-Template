// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Header } from "@/app/help/_components/Header";

afterEach(() => cleanup());

// ThemeToggle reads/writes localStorage; mock it so Header tests focus on
// Header structure, not theme behavior.
vi.mock("@/components/layout/ThemeToggle", () => ({
  ThemeToggle: () => <button data-testid="theme-toggle">Theme</button>,
}));

describe("<Header>", () => {
  it("renders 'Back to admin →' link to /admin", () => {
    render(<Header />);
    const link = screen.getByRole("link", { name: /back to admin/i });
    expect(link).toHaveAttribute("href", "/admin");
  });

  // M12.12 follow-up — the "→" is decorative; aria-hiding it keeps it out of
  // the accessible name. Failure mode caught: someone inlines the arrow back
  // into the accessible name.
  it("back-link accessible name drops the decorative → (aria-label), visible text keeps it", () => {
    render(<Header />);
    const link = screen.getByRole("link", { name: "Back to admin" });
    expect(link).toHaveAttribute("aria-label", "Back to admin");
    // Visible text run stays UNSPLIT — splitting it drops the flex
    // inter-item space / shifts text-decoration paint (byte-level screenshot
    // drift).
    expect(link.textContent).toBe("Back to admin →");
    expect(link.firstElementChild).toBeNull();
  });

  it("renders the FXAV brand mark", () => {
    render(<Header />);
    expect(screen.getByTestId("help-header-brand")).toBeInTheDocument();
  });

  it("renders the theme toggle (AC-11.4)", () => {
    // r2 (Phase A round-1 finding 2): the Header MUST render the existing
    // components/layout/ThemeToggle. Test asserts presence so the toggle
    // can't silently drop out in a future Header edit.
    render(<Header />);
    expect(screen.getByTestId("theme-toggle")).toBeInTheDocument();
  });
});
