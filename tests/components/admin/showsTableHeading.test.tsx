// @vitest-environment jsdom
/**
 * tests/components/admin/showsTableHeading.test.tsx
 *
 * The shows-table heading treatment. With a watched folder name it renders a
 * "Watched folder" eyebrow over the name in a monospace face (so a slug-style
 * name reads as a deliberate identifier); with no folder name it renders the
 * plain bucket label. The name (or label) must remain the <h3> heading so
 * heading-navigation still lands on it, and the eyebrow must NOT be part of the
 * heading's accessible name.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { ShowsTableHeading } from "@/components/admin/ShowsTableHeading";

// admin-show-modal Task 11: ShowsTable/StagedReviewCard are client islands that
// read the current search params (param-preserving modal hrefs) — stub the
// app-router hooks jsdom has no router for.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => cleanup());

describe("ShowsTableHeading", () => {
  it("folder name present: eyebrow + monospace name as the heading (no fallback label)", () => {
    render(<ShowsTableHeading folderName="fxav-test-shows" fallbackLabel="Active shows" />);
    expect(screen.getByTestId("shows-heading-eyebrow")).toHaveTextContent("Watched folder");
    const heading = screen.getByRole("heading", { name: "fxav-test-shows" });
    expect(heading.className).toMatch(/font-mono/);
    // The eyebrow is a sibling label, not part of the heading's accessible name.
    expect(heading).not.toHaveTextContent("Watched folder");
    expect(screen.queryByText("Active shows")).not.toBeInTheDocument();
  });

  it("no folder name: plain bucket label as the heading, no eyebrow", () => {
    render(<ShowsTableHeading folderName={null} fallbackLabel="Active shows" />);
    expect(screen.getByRole("heading", { name: "Active shows" })).toBeInTheDocument();
    expect(screen.queryByTestId("shows-heading-eyebrow")).not.toBeInTheDocument();
  });

  it("keeps a slug verbatim (no case/character transform)", () => {
    render(<ShowsTableHeading folderName="2026_shows-DRAFT" fallbackLabel="Active shows" />);
    expect(screen.getByRole("heading", { name: "2026_shows-DRAFT" })).toBeInTheDocument();
  });
});
