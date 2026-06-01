// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { UserMenu } from "@/components/admin/nav/UserMenu";

vi.mock("next/navigation", () => ({ usePathname: () => "/admin" }));

afterEach(() => cleanup());

describe("UserMenu", () => {
  it("avatar shows initials derived from email local-part", () => {
    render(<UserMenu email="doug.pemberton@example.com" />);
    expect(screen.getByTestId("admin-user-avatar")).toHaveTextContent("DP");
  });

  it("opening the menu shows email as primary identity; Sign out is a POST form to /auth/sign-out", () => {
    render(<UserMenu email="doug@example.com" />);
    fireEvent.click(screen.getByTestId("admin-user-avatar"));
    expect(screen.getByText("doug@example.com")).toBeInTheDocument();
    const form = screen.getByTestId("admin-user-signout-form");
    expect(form).toHaveAttribute("method", "post");
    expect(form).toHaveAttribute("action", "/auth/sign-out");
  });

  it("null/empty email → neutral avatar + Sign out only (guard)", () => {
    render(<UserMenu email="" />);
    expect(screen.getByTestId("admin-user-avatar")).toHaveTextContent("•");
    fireEvent.click(screen.getByTestId("admin-user-avatar"));
    expect(screen.getByTestId("admin-user-signout-form")).toBeInTheDocument();
  });
});
