// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

import {
  PackListBreakdown,
  type PublishedGear,
} from "@/components/admin/wizard/step3ReviewSections";

afterEach(cleanup);

const gear = (over: Partial<PublishedGear> = {}): PublishedGear => ({
  offer: null,
  wire: null,
  slug: "s1",
  driveFileId: "d1",
  canMutate: true,
  ...over,
});

function renderPub(publishedGear: PublishedGear, cases: never[] = []) {
  return render(
    <PackListBreakdown
      dfid="d1"
      cases={cases}
      archivedPullSheetTabs={[]}
      pullSheetOverride={null}
      publishedGear={publishedGear}
    />,
  );
}

describe("PackListBreakdown — published archived-tab gear (spec 2026-07-23 §2.1)", () => {
  it("renders one offer card per active tab name", () => {
    renderPub(gear({ offer: { tabNames: ["OLD A", "OLD B"] } }));
    expect(screen.getAllByTestId("published-archived-tab-offer")).toHaveLength(2);
    expect(screen.getByText("OLD A")).toBeInTheDocument();
    expect(screen.getByText("OLD B")).toBeInTheDocument();
  });

  it("caps at 3 cards and shows a fixture-derived overflow line", () => {
    const names = ["t1", "t2", "t3", "t4", "t5"]; // 5 names → 3 shown + overflow 2
    renderPub(gear({ offer: { tabNames: names } }));
    expect(screen.getAllByTestId("published-archived-tab-offer")).toHaveLength(3);
    expect(
      screen.getByText(`and ${names.length - 3} more archived tabs. Resolve these in the sheet.`),
    ).toBeInTheDocument();
  });

  it("overflow copy is the spec §2.3 literal (always plural, no singularization)", () => {
    renderPub(gear({ offer: { tabNames: ["t1", "t2", "t3", "t4"] } }));
    expect(
      screen.getByText("and 1 more archived tabs. Resolve these in the sheet."),
    ).toBeInTheDocument();
  });

  it("override active (wire non-null) renders the P3 note, not offers", () => {
    renderPub(
      gear({ wire: { tabName: "OLD A", fingerprint: "fp" }, offer: { tabNames: ["OLD A"] } }),
    );
    expect(screen.getByTestId("published-archived-tab-note")).toBeInTheDocument();
    expect(screen.queryByTestId("published-archived-tab-offer")).not.toBeInTheDocument();
  });

  it("P2 offer replaces the bare empty state (no 'No pack list parsed.')", () => {
    renderPub(gear({ offer: { tabNames: ["OLD A"] } }));
    expect(screen.queryByText("No pack list parsed.")).not.toBeInTheDocument();
    expect(screen.getByTestId("published-archived-tab-offer")).toBeInTheDocument();
  });

  it("no offer + no override + no cases → the plain empty state, no gear cards", () => {
    renderPub(gear());
    expect(screen.getByText("No pack list parsed.")).toBeInTheDocument();
    expect(screen.queryByTestId("published-archived-tab-offer")).not.toBeInTheDocument();
  });

  it("Skip moves real focus to the section fallback (not just calls a callback)", () => {
    renderPub(gear({ offer: { tabNames: ["OLD A"] } }));
    fireEvent.click(screen.getByRole("button", { name: "Skip gear from OLD A" }));
    // The card unmounts; focus must land on the tabIndex={-1} section wrapper the real
    // PackListBreakdown threads as onDismissFocus (WCAG 2.4.3 — never stranded on <body>).
    const section = document.querySelector('[data-section="pack-list"]');
    expect(document.activeElement).toBe(section);
  });
});
