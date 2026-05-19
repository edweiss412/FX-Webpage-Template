// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Breadcrumb } from "@/app/help/_components/Breadcrumb";

afterEach(() => cleanup());

// r3 (Phase A round-2 finding 2): vi.hoisted to lift the mock fn above
// vi.mock's hoisting — same TDZ-avoidance pattern as Sidebar test.
const { mockUsePathname } = vi.hoisted(() => ({
  mockUsePathname: vi.fn(() => "/help/admin/dashboard"),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}));

describe("<Breadcrumb>", () => {
  it("renders Help > group > page for a known route", () => {
    mockUsePathname.mockReturnValue("/help/admin/dashboard");
    render(<Breadcrumb />);
    expect(screen.getByText("Help")).toBeInTheDocument();
    expect(screen.getByText("The admin surface")).toBeInTheDocument();
    expect(screen.getByText("Reading the dashboard")).toBeInTheDocument();
  });

  it("degrades to just 'Help' when pathname is not in the registry", () => {
    mockUsePathname.mockReturnValue("/help/unknown");
    render(<Breadcrumb />);
    expect(screen.getByText("Help")).toBeInTheDocument();
    expect(screen.queryByText("The admin surface")).not.toBeInTheDocument();
  });
});
