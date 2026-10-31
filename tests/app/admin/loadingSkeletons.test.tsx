// @vitest-environment jsdom
// Phase 2 (nav-perf) Workstream D — route loading.tsx skeletons.
//
// Contract: each of the four previously-feedback-less routes ships a loading.tsx
// that renders the house skeleton (LoadingShell + Skeleton primitives) so a
// navigation shows an instant silhouette instead of the old page frozen. Each:
//   • renders its LoadingShell wrapper (a defined data-testid)
//   • announces loading once via role="status" (sr-only) — LoadingShell's a11y
//   • renders >=3 Skeleton plates (the primitive's signature class pair)
//   • uses ONLY design tokens — no raw color class (e.g. bg-gray-*) leaks
//   • leaks no real heading copy / raw error code (decorative chrome only)
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import AdminAdminsLoading from "@/app/admin/settings/admins/loading";
import StagedLoading from "@/app/admin/show/staged/[stagedId]/loading";
import PreviewLoading from "@/app/admin/show/[slug]/preview/[crewId]/loading";
import HelpLoading from "@/app/help/loading";
import { crewSectionLabel } from "@/lib/crew/crewSections";
import { BASE_SECTION_IDS } from "@/lib/crew/resolveActiveSection";

afterEach(cleanup);

const CASES = [
  { name: "settings/admins", Comp: AdminAdminsLoading, testId: "admin-admins-loading" },
  { name: "show/staged/[stagedId]", Comp: StagedLoading, testId: "staged-review-loading" },
  {
    name: "show/[slug]/preview/[crewId]",
    Comp: PreviewLoading,
    testId: "admin-preview-crew-loading",
  },
  { name: "help", Comp: HelpLoading, testId: "help-loading" },
] as const;

describe("Phase 2 D — route loading.tsx skeletons", () => {
  for (const { name, Comp, testId } of CASES) {
    describe(name, () => {
      it("renders the LoadingShell wrapper testId", () => {
        const { getByTestId } = render(<Comp />);
        expect(getByTestId(testId)).toBeInTheDocument();
      });

      it("announces loading once via role=status (sr-only)", () => {
        const { getByRole } = render(<Comp />);
        expect(getByRole("status")).toBeInTheDocument();
      });

      it("renders >=3 Skeleton plates using the token classes", () => {
        const { container } = render(<Comp />);
        const plates = container.querySelectorAll(".animate-pulse.bg-surface-sunken");
        expect(plates.length).toBeGreaterThanOrEqual(3);
      });

      it("leaks no raw color class (tokens only)", () => {
        const { container } = render(<Comp />);
        expect(container.querySelector('[class*="bg-gray-"]')).toBeNull();
        expect(container.querySelector('[class*="bg-slate-"]')).toBeNull();
      });

      it("contains no raw error code (decorative chrome only)", () => {
        const { container } = render(<Comp />);
        const text = container.textContent ?? "";
        expect(text).not.toMatch(/[A-Z]{2,}_[A-Z0-9_]+/);
      });
    });
  }
});

// The preview skeleton draws the crew route's skeleton under a banner strip
// (components/crew/CrewLoadingSkeleton.tsx, pinned in full by
// tests/components/crew/loading.test.tsx), so it inherits the crew route's
// no-Budget invariant: financialsVisible is unknown pre-projection, so a Budget
// entry MUST NEVER flash during load. Pinned here too, because the generic
// cases above don't cover it.
describe("admin preview loading: the crew skeleton under the banner, never a Budget entry (§4.17)", () => {
  it("renders the banner strip first, then the crew skeleton's header, nav and blocks", () => {
    const { getByTestId } = render(<PreviewLoading />);
    const header = getByTestId("crew-loading-header");
    const banner = header.previousElementSibling;
    expect(banner).not.toBeNull();
    expect(banner).toHaveClass("animate-pulse", "bg-surface-sunken");
    for (const id of [
      "crew-loading-nav",
      "crew-loading-day-row",
      "crew-loading-pass",
      "crew-loading-list",
      "crew-loading-section",
    ]) {
      expect(getByTestId(id)).toBeInTheDocument();
    }
    expect(document.querySelector('[data-testid="preview-loading-tab"]')).toBeNull();
  });

  it("lists exactly the base sections in the nav and the list, and never Budget", () => {
    const { container, getAllByTestId } = render(<PreviewLoading />);
    // EXACT counts: an extra (e.g. Budget) entry would fail this, unlike a mere
    // "the base labels are present" check (Codex P2 R2 [low]).
    expect(getAllByTestId("crew-loading-nav-item").map((el) => el.textContent)).toEqual(
      BASE_SECTION_IDS.map(crewSectionLabel),
    );
    expect(getAllByTestId("crew-loading-list-row").map((el) => el.textContent)).toEqual(
      BASE_SECTION_IDS.filter((id) => id !== "today").map(crewSectionLabel),
    );
    expect((container.textContent ?? "").toLowerCase()).not.toContain("budget");
  });
});
