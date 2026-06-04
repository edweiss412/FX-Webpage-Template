// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AdminNav } from "@/components/admin/nav/AdminNav";

vi.mock("next/navigation", () => ({ usePathname: () => "/admin" }));

afterEach(() => cleanup());

describe("AdminNav", () => {
  it("renders brand, both nav items, NotifBell, ThemeToggle, UserMenu", () => {
    render(<AdminNav email="doug@example.com" alertCount={{ kind: "ok", count: 0 }} />);
    expect(screen.getByText("Admin")).toBeInTheDocument(); // brand badge
    expect(screen.getAllByRole("link", { name: /Dashboard/ }).length).toBeGreaterThan(0);
    expect(screen.getByTestId("admin-notif-bell")).toBeInTheDocument();
    expect(screen.getByTestId("theme-toggle")).toBeInTheDocument();
    expect(screen.getByTestId("admin-user-avatar")).toBeInTheDocument();
  });

  it("brand link contains the FXAV icon image", () => {
    render(<AdminNav email="doug@example.com" alertCount={{ kind: "ok", count: 0 }} />);
    const brand = screen.getByTestId("admin-nav-brand");
    const img = brand.querySelector("img");
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute("src", expect.stringContaining("fxav-icon"));
  });

  it("renders the fixed mobile bottom tab bar with both short labels", () => {
    render(<AdminNav email="d@e.com" alertCount={{ kind: "ok", count: 0 }} />);
    const tabbar = screen.getByTestId("admin-bottom-tabs");
    expect(tabbar).toBeInTheDocument();
    expect(tabbar).toHaveTextContent("Home");
    expect(tabbar).toHaveTextContent("Settings");
  });

  it("infra_error alertCount → degraded bell in the shell", () => {
    render(<AdminNav email="d@e.com" alertCount={{ kind: "infra_error" }} />);
    expect(screen.getByTestId("admin-notif-bell-degraded")).toBeInTheDocument();
  });
});
