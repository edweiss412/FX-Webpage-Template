// @vitest-environment jsdom
/**
 * tests/components/admin/PreviewBannerHelpAffordance.test.tsx
 * (M10 §B Task 10.8 + 10.9 / Phase 3 / Clusters I-5 + I-6; renamed in
 * M11 Phase G.3 — Tour describe block removed when Tour.tsx was deleted
 * + superseded by /help/tour MDX + DashboardFooter)
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
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { HelpAffordance } from "@/components/admin/HelpAffordance";
import { HelpTooltip } from "@/components/admin/HelpTooltip";
import { PreviewBanner } from "@/components/admin/PreviewBanner";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/",
}));

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

  test("ReportButton receives crewPreview autocapture so the GitHub issue body identifies the previewed viewer (Codex R4 finding 1)", async () => {
    // Mock /api/report. The ReportButton -> ReportModal pipeline POSTs
    // a body that includes `autocapture`. We assert the autocapture
    // round-trips the crewPreview block populated from PreviewBanner.
    const fetchMock = vi.fn().mockResolvedValue({
      status: 201,
      ok: true,
      json: async () => ({ ok: true, status: "created" }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <PreviewBanner
        crewMemberName="Eric Weiss"
        crewMemberRoleLabel="A1"
        slug="rpas-central-2026"
        showId="00000000-0000-0000-0000-000000000001"
        crewMemberId="00000000-0000-0000-0000-0000000000aa"
      />,
    );
    fireEvent.click(screen.getByTestId("report-button-trigger"));
    fireEvent.change(screen.getByTestId("report-modal-textarea"), {
      target: { value: "role gate appears broken — A1 sees financials" },
    });
    fireEvent.click(screen.getByTestId("report-modal-submit"));
    await new Promise((r) => setTimeout(r, 10));

    expect(fetchMock).toHaveBeenCalled();
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    // ReportModal spreads autocapture into the body root level
    // (see components/shared/ReportModal.tsx body construction at
    // line ~284: `...(autocapture ?? {})`), so the crewPreview block
    // lands at body.crewPreview — that IS the contract the M8 GitHub
    // issue formatter consumes.
    const body = JSON.parse(init.body as string) as {
      crewPreview?: { crewMemberId?: string; name?: string; role?: string };
    };
    expect(body.crewPreview).toEqual({
      crewMemberId: "00000000-0000-0000-0000-0000000000aa",
      name: "Eric Weiss",
      role: "A1",
    });
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
