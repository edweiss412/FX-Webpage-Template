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
  it("back-link arrow is aria-hidden — accessible name is 'Back to admin', visible text keeps →", () => {
    render(<Header />);
    const link = screen.getByRole("link", { name: "Back to admin" });
    expect(link.textContent).toContain("→");
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
