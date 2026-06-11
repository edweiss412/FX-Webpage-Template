// @vitest-environment jsdom
// M11-A-D2 — WCAG 2.4.1 skip-link on the /help chrome.
//
// Keyboard users previously had to tab through the Header (brand +
// ThemeToggle + "Back to admin") and the Sidebar (12+ nav entries) before
// reaching main content on every /help/* page. The contract pinned here:
//
//   1. The FIRST anchor in the layout is a "Skip to content" link → "#main".
//   2. It precedes the Header/Sidebar chrome in DOM order (so it is the
//      first thing keyboard focus lands on).
//   3. <main> carries id="main" so the fragment actually resolves.
//
// Concrete failure mode caught: a refactor that reorders the layout chrome
// or renames the #main anchor silently strands keyboard users back at
// tab-through-everything; this test trips on either half of the pair.
import React from "react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

afterEach(() => cleanup());

vi.mock("@/lib/auth/requireAdmin", () => ({
  requireAdmin: vi.fn().mockResolvedValue({ email: "doug@fxav.local" }),
  AdminInfraError: class AdminInfraError extends Error {
    code = "ADMIN_AUTH_INFRA_ERROR";
  },
}));
vi.mock("@/app/help/_components/Header", () => ({
  Header: () => <header data-testid="stub-header">header</header>,
}));
vi.mock("@/app/help/_components/Sidebar", () => ({
  Sidebar: () => <nav data-testid="stub-sidebar">sidebar</nav>,
}));
vi.mock("@/app/help/_components/Breadcrumb", () => ({
  Breadcrumb: () => <div data-testid="stub-breadcrumb">crumb</div>,
}));

import HelpLayout from "@/app/help/layout";

async function renderLayout() {
  const tree = await HelpLayout({ children: <p>page body</p> });
  return render(tree);
}

describe("M11-A-D2: /help skip-link (WCAG 2.4.1)", () => {
  it("renders a Skip to content link targeting #main", async () => {
    await renderLayout();
    const skip = screen.getByRole("link", { name: /skip to content/i });
    expect(skip.getAttribute("href")).toBe("#main");
  });

  it("skip link precedes the Header chrome in DOM order", async () => {
    await renderLayout();
    const skip = screen.getByRole("link", { name: /skip to content/i });
    const header = screen.getByTestId("stub-header");
    // compareDocumentPosition: FOLLOWING(4) means `header` comes after `skip`.
    expect(skip.compareDocumentPosition(header) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("<main> carries id='main' so the fragment resolves", async () => {
    const { container } = await renderLayout();
    const main = container.querySelector("main");
    expect(main).not.toBeNull();
    expect(main!.id).toBe("main");
  });

  it("skip link is visually hidden until focused (sr-only pattern)", async () => {
    await renderLayout();
    const skip = screen.getByRole("link", { name: /skip to content/i });
    expect(skip.className).toContain("sr-only");
    expect(skip.className).toContain("focus:not-sr-only");
  });
});
