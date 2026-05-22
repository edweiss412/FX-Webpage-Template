// @vitest-environment jsdom
/**
 * tests/components/admin/section-header-affordance.test.tsx
 * (M11 Phase G.3 — concrete-UI affordance test #2 per plan body Step 5b)
 *
 * Pins the section-header HelpTooltip body contract: every static-concrete
 * `tooltip` row in AFFORDANCE_MATRIX whose host is a dashboard panel (the
 * subset directly mountable via prop-driven render in unit tests) MUST
 * render an inline `<a href={row.target}>Learn more →</a>` inside the
 * HelpTooltip body.
 *
 * Per-show panel + onboarding wizard tooltips are covered by Codex's
 * Playwright walker at `tests/e2e/deep-link-walker.spec.ts` (G.5),
 * which iterates the matrix dynamically — this unit test focuses on the
 * dashboard subset that is testable in isolation.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { ActiveShowsPanel } from "@/components/admin/ActiveShowsPanel";
import { PendingPanel } from "@/components/admin/PendingPanel";
import { AFFORDANCE_MATRIX } from "@/app/help/_affordanceMatrix";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin",
}));

afterEach(() => cleanup());

function matrixRow(testid: string) {
  const row = AFFORDANCE_MATRIX.find(
    (r) => r.kind === "concrete" && r.testid === testid,
  );
  if (!row || row.kind !== "concrete") {
    throw new Error(`matrix row not found for testid ${testid}`);
  }
  return row;
}

describe("section-header HelpTooltip inline Learn-more (Phase G.3)", () => {
  it("ActiveShowsPanel HelpTooltip body contains inline Learn-more linking to matrix target", () => {
    const row = matrixRow("help-affordance--dashboard-active-shows--tooltip");
    render(<ActiveShowsPanel rows={[]} now={new Date("2026-05-22T12:00:00Z")} />);
    const tooltipBody = screen.getByTestId(`${row.testid}-body`);
    const link = within(tooltipBody).getByRole("link", { name: /Learn more/i });
    expect(link.getAttribute("href")).toBe(row.target);
  });

  it("PendingPanel HelpTooltip body contains inline Learn-more linking to matrix target", () => {
    const row = matrixRow("help-affordance--dashboard-pending-ingestion--tooltip");
    render(
      <PendingPanel pendingIngestions={[]} firstSeenStaged={[]} />,
    );
    const tooltipBody = screen.getByTestId(`${row.testid}-body`);
    const link = within(tooltipBody).getByRole("link", { name: /Learn more/i });
    expect(link.getAttribute("href")).toBe(row.target);
  });
});
