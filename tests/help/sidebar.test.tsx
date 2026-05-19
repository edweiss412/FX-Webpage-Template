// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Sidebar } from "@/app/help/_components/Sidebar";

// Mock usePathname so the current-page highlight is testable.
// r3 (Phase A round-2 finding 2): use vi.hoisted to lift the mock fn
// definition above vi.mock's hoisting. A plain `const mockUsePathname`
// would still be in the temporal-dead zone when vi.mock's factory runs.
const { mockUsePathname } = vi.hoisted(() => ({
  mockUsePathname: vi.fn(() => "/help/admin/dashboard"),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}));

// globals: false in vitest.config.ts means RTL's auto-cleanup hook never
// registers. Call cleanup manually so each `it` starts with a fresh body.
afterEach(() => cleanup());

describe("<Sidebar>", () => {
  it("renders every nav entry as a link", () => {
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: "What this app does for you" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reading the dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Errors" })).toBeInTheDocument();
  });

  it("renders the three group headings", () => {
    render(<Sidebar />);
    expect(screen.getByText("Get started")).toBeInTheDocument();
    expect(screen.getByText("The admin surface")).toBeInTheDocument();
    expect(screen.getByText("Reference")).toBeInTheDocument();
  });

  it("marks the current page with aria-current", () => {
    render(<Sidebar />);
    const current = screen.getByRole("link", { name: "Reading the dashboard" });
    expect(current).toHaveAttribute("aria-current", "page");
  });
});
