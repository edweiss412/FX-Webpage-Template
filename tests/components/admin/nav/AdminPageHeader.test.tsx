// @vitest-environment jsdom
import { readdirSync, readFileSync } from "node:fs";
import "@testing-library/jest-dom/vitest";
import { afterEach, it, expect } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AdminPageHeader } from "@/components/admin/nav/AdminPageHeader";

afterEach(() => cleanup());
it("renders title + sub", () => {
  render(<AdminPageHeader title="Dashboard" sub="Your live shows and anything that needs review." />);
  expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
  expect(screen.getByText(/live shows/)).toBeInTheDocument();
});
it("renders crumb + back link when provided", () => {
  render(<AdminPageHeader title="RPAS" crumb="Admin › Active shows" backHref="/admin" />);
  expect(screen.getByText("Admin › Active shows")).toBeInTheDocument();
  expect(screen.getByTestId("admin-page-header-back")).toHaveAttribute("href", "/admin");
});
it("renders rightSlot content", () => {
  render(<AdminPageHeader title="RPAS" rightSlot={<span data-testid="pill">Published</span>} />);
  expect(screen.getByTestId("pill")).toBeInTheDocument();
});
it("no sub/crumb/backHref/rightSlot → title only, no crash (guard: all optional; covers the §2.6 unknown/slug-less route)", () => {
  render(<AdminPageHeader title="Staged candidate" />);
  expect(screen.getByRole("heading", { name: "Staged candidate" })).toBeInTheDocument();
  expect(screen.queryByTestId("admin-page-header-back")).toBeNull();
  expect(screen.queryByTestId("admin-page-header-crumb")).toBeNull();
});
it("M12.8: NO 'Admin' eyebrow on dashboard/settings pages (it duplicated the top-nav 'Admin' label)", () => {
  render(<AdminPageHeader title="Dashboard" sub="x" />);
  expect(screen.queryByTestId("admin-page-header-eyebrow")).toBeNull();
  expect(screen.queryByText("Admin")).toBeNull(); // no eyebrow text above the title
  expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
});
it("eyebrow absent when crumb/backHref present (per-show pages)", () => {
  render(<AdminPageHeader title="Show" crumb="Admin › Active shows" backHref="/admin" />);
  expect(screen.queryByTestId("admin-page-header-eyebrow")).toBeNull();
  expect(screen.getByTestId("admin-page-header-crumb")).toBeInTheDocument();
});
it("architectural guard: header is prop-driven — NO global HEADERS / route-to-header map exists in components/admin/nav/", () => {
  // an unknown route cannot crash a global header lookup because there is none.
  // imports are at top of file
  const dir = "components/admin/nav";
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".ts") && !f.endsWith(".tsx")) continue;
    expect(readFileSync(`${dir}/${f}`, "utf8")).not.toMatch(/\bHEADERS\b/);
  }
});
