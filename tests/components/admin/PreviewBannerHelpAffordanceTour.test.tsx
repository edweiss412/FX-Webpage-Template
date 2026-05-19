// @vitest-environment jsdom
/**
 * tests/components/admin/PreviewBannerHelpAffordanceTour.test.tsx
 * (M10 §B Task 10.8 + 10.9 / Phase 3 / Clusters I-5 + I-6)
 *
 * Focused regression coverage for the Phase 3 §B surfaces, addressing
 * Codex R3 HIGH ("Phase 3 implementation has no tests despite the
 * repo's TDD invariant"). Pins:
 *
 *   - HelpAffordance renders the catalog `helpfulContext` text for a
 *     known dougFacing-non-null code AND returns null for unknown /
 *     admin-log-only codes (§9.0.1 contract).
 *   - HelpTooltip renders the disclosure body lazily and exposes the
 *     "?" trigger.
 *   - PreviewBanner renders name + role chip + Exit link to the
 *     canonical /admin/show/<slug> route (NOT a build-gated route),
 *     and embeds the ReportButton client island (not a dead Link).
 *   - Tour step 4 renders curly quote characters around "What does
 *     this mean?" — the R2 regression catch (HTML entities inside a
 *     JS string passed through `{expression}` to JSX render as
 *     literal text, not decoded characters).
 *   - File-content audit: Tour.tsx step 4 string contains the U+201C /
 *     U+201D characters and NOT the `&ldquo;`/`&rdquo;` tokens.
 */
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { HelpAffordance } from "@/components/admin/HelpAffordance";
import { HelpTooltip } from "@/components/admin/HelpTooltip";
import { PreviewBanner } from "@/components/admin/PreviewBanner";
import { Tour } from "@/components/admin/Tour";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";

afterEach(() => cleanup());

describe("HelpAffordance", () => {
  test("renders the catalog helpfulContext for a known dougFacing-non-null code", () => {
    // FOLDER_NOT_SHARED is an M10 §A code with non-null dougFacing
    // AND a non-null helpfulContext per catalog.ts.
    const code = "FOLDER_NOT_SHARED";
    const expected = MESSAGE_CATALOG[code]?.helpfulContext;
    expect(typeof expected).toBe("string");
    expect((expected ?? "").length).toBeGreaterThan(0);

    render(<HelpAffordance code={code} />);
    const trigger = screen.getByTestId("help-affordance-trigger");
    expect(trigger).toBeTruthy();
    const body = screen.getByTestId("help-affordance-body");
    expect(body.textContent).toBe(expected);
  });

  test("returns null for an unknown code", () => {
    const { container } = render(<HelpAffordance code="UNKNOWN_CODE_XYZ" />);
    expect(container.querySelector("[data-testid='help-affordance']")).toBeNull();
  });

  test("returns null for null/undefined/empty code", () => {
    const { container, rerender } = render(<HelpAffordance code={null} />);
    expect(container.querySelector("[data-testid='help-affordance']")).toBeNull();
    rerender(<HelpAffordance code={undefined} />);
    expect(container.querySelector("[data-testid='help-affordance']")).toBeNull();
    rerender(<HelpAffordance code="" />);
    expect(container.querySelector("[data-testid='help-affordance']")).toBeNull();
  });
});

describe("HelpTooltip", () => {
  test("renders the trigger and the body", () => {
    render(
      <HelpTooltip label="Help: Test section" testId="test-help">
        <p>Plain-language explanation goes here.</p>
      </HelpTooltip>,
    );
    const trigger = screen.getByTestId("test-help-trigger");
    expect(trigger.getAttribute("aria-label")).toBe("Help: Test section");
    const body = screen.getByTestId("test-help-body");
    expect(body.textContent).toContain("Plain-language explanation");
  });
});

describe("PreviewBanner (§9.3)", () => {
  test("renders the role chip, exits to /admin/show/<slug>, and embeds the report island", () => {
    render(
      <PreviewBanner
        crewMemberName="Eric Weiss"
        crewMemberRoleLabel="A1"
        slug="rpas-central-2026"
        showId="00000000-0000-0000-0000-000000000001"
        crewMemberId="00000000-0000-0000-0000-0000000000aa"
      />,
    );
    expect(screen.getByTestId("admin-preview-banner-name").textContent).toBe("Eric Weiss");
    expect(screen.getByTestId("admin-preview-banner-role").textContent).toBe("A1");
    const exit = screen.getByTestId("admin-preview-banner-exit") as HTMLAnchorElement;
    expect(exit.getAttribute("href")).toBe("/admin/show/rpas-central-2026");
    // No reference to /admin/dev anywhere — build-gated-routes-never-fallback rule.
    const banner = screen.getByTestId("admin-preview-banner");
    expect(banner.innerHTML).not.toContain("/admin/dev");
    // ReportButton client island present (not a dead Link).
    const reportTrigger = screen.getByTestId("report-button-trigger");
    expect(reportTrigger.textContent).toBe("Report this view");
    expect(reportTrigger.getAttribute("data-surface")).toBe("admin");
  });

  test("omits the role chip when label is null", () => {
    render(
      <PreviewBanner
        crewMemberName="A. New Hire"
        crewMemberRoleLabel={null}
        slug="rpas-central-2026"
        showId="00000000-0000-0000-0000-000000000001"
        crewMemberId="00000000-0000-0000-0000-0000000000ab"
      />,
    );
    expect(screen.queryByTestId("admin-preview-banner-role")).toBeNull();
    expect(screen.getByTestId("admin-preview-banner-name").textContent).toBe("A. New Hire");
  });
});

describe("Tour (§9.0.1)", () => {
  test("step 4 body contains curly quotes around the explainer label (not HTML entities)", () => {
    // Source-level invariant: the JS string literal must contain real
    // U+201C / U+201D characters because React does NOT decode HTML
    // entities inside `{expression}` values. This pins the R2
    // regression.
    const file = resolve(
      __dirname,
      "..",
      "..",
      "..",
      "components",
      "admin",
      "Tour.tsx",
    );
    const src = readFileSync(file, "utf8");
    expect(src).not.toContain("&ldquo;");
    expect(src).not.toContain("&rdquo;");
    expect(src).toContain("“What does this mean?”");
  });

  test("trigger opens the dialog and renders the first step", () => {
    render(<Tour />);
    const trigger = screen.getByTestId("admin-tour-trigger");
    expect(trigger.textContent).toContain("Take the tour");
    fireEvent.click(trigger);
    const title = screen.getByTestId("admin-tour-title");
    expect(title.textContent).toBe("Your dashboard");
    const indicator = screen.getByTestId("admin-tour-step-indicator");
    expect(indicator.textContent).toBe("Step 1 of 4");
  });
});
