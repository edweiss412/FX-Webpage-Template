// @vitest-environment jsdom
// Task 7 — app/show/[slug]/[shareToken]/loading.tsx (the crew route's initial
// loading skeleton).
//
// Contract (crew-redesign §sub-nav / §4.17):
//   • Renders a shell-matching skeleton during the initial fetch + picker/auth
//     flow: a Header band placeholder, a sub-nav placeholder, and an empty
//     section frame.
//   • Renders placeholders for the 6 BASE_SECTION_IDS ONLY — NEVER a "Budget"
//     tab. financialsVisible is unknown pre-projection, so a Budget tab MUST
//     NOT flash during load/auth/picker.
//   • No em-dash and no raw error code in the skeleton (it is decorative chrome
//     only; a blank first paint or a leaked code would both be defects).
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, within } from "@testing-library/react";
import { BASE_SECTION_IDS } from "@/lib/crew/resolveActiveSection";
import Loading from "@/app/show/[slug]/[shareToken]/loading";

afterEach(cleanup);

describe("crew route loading.tsx skeleton", () => {
  it("renders the shell skeleton wrapper with Header band, sub-nav, and section frame", () => {
    const { getByTestId } = render(<Loading />);
    // Wrapper + the three shell regions, each addressed by a defined testid.
    expect(getByTestId("crew-loading-skeleton")).toBeInTheDocument();
    expect(getByTestId("crew-loading-header")).toBeInTheDocument();
    expect(getByTestId("crew-loading-subnav")).toBeInTheDocument();
    expect(getByTestId("crew-loading-section")).toBeInTheDocument();
  });

  it("renders exactly the 6 base section tab placeholders", () => {
    const { getByTestId, getAllByTestId } = render(<Loading />);
    const tabs = within(getByTestId("crew-loading-subnav")).queryAllByTestId(
      "crew-loading-tab",
    );
    expect(tabs).toHaveLength(BASE_SECTION_IDS.length);
    expect(BASE_SECTION_IDS).toHaveLength(6);
    // sanity: also globally, no extra tab placeholders leaked elsewhere.
    expect(getAllByTestId("crew-loading-tab")).toHaveLength(6);
  });

  it("renders each base section's label", () => {
    const { container } = render(<Loading />);
    const text = container.textContent ?? "";
    const labels: Record<(typeof BASE_SECTION_IDS)[number], string> = {
      today: "Today",
      schedule: "Schedule",
      venue: "Venue",
      travel: "Travel",
      crew: "Crew",
      gear: "Gear",
    };
    for (const id of BASE_SECTION_IDS) {
      expect(text).toContain(labels[id]);
    }
  });

  it("never renders a Budget tab (case-insensitive)", () => {
    const { container } = render(<Loading />);
    const text = (container.textContent ?? "").toLowerCase();
    expect(text).not.toContain("budget");
  });

  it("contains no em-dash and no raw error code", () => {
    const { container } = render(<Loading />);
    const text = container.textContent ?? "";
    // em-dash (U+2014) is banned chrome copy (DESIGN §9 / invariant 5).
    expect(text).not.toContain("—");
    // raw error codes are SCREAMING_SNAKE_CASE; the decorative shell has none.
    expect(text).not.toMatch(/[A-Z]{2,}_[A-Z0-9_]+/);
  });
});
