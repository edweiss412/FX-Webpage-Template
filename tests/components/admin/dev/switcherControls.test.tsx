/**
 * tests/components/admin/dev/switcherControls.test.tsx
 * (plan 2026-07-21-attention-modal-switcher-gallery Task 5)
 */
// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { SwitcherControls } from "@/components/admin/dev/SwitcherControls";
import type { ExcludedScenario } from "@/lib/dev/galleryModalTypes";

afterEach(cleanup);

const base = {
  index: 2,
  total: 10,
  label: "Diagram signal missing",
  tier: 1 as const,
  codes: ["DIAGRAM_SIGNAL_MISSING"],
  excluded: [] as ExcludedScenario[],
  closed: false,
  onPrev: vi.fn(),
  onNext: vi.fn(),
  onReopen: vi.fn(),
};

describe("SwitcherControls", () => {
  test("renders position, label, tier, and codes", () => {
    render(<SwitcherControls {...base} />);
    const bar = screen.getByTestId("attention-switcher-controls");
    expect(within(bar).getByText(/3 \/ 10/)).toBeTruthy(); // 1-indexed
    expect(within(bar).getByText("Diagram signal missing")).toBeTruthy();
    expect(within(bar).getByText(/DIAGRAM_SIGNAL_MISSING/)).toBeTruthy();
  });

  test("prev/next wired; buttons carry the 44px tap-target class", () => {
    render(<SwitcherControls {...base} />);
    const prev = screen.getByRole("button", { name: /prev/i });
    const next = screen.getByRole("button", { name: /next/i });
    fireEvent.click(prev);
    fireEvent.click(next);
    expect(base.onPrev).toHaveBeenCalled();
    expect(base.onNext).toHaveBeenCalled();
    expect(prev.className).toContain("min-h-tap-min");
    expect(next.className).toContain("min-h-tap-min");
  });

  test("group role + polite live count", () => {
    render(<SwitcherControls {...base} />);
    const bar = screen.getByRole("group", { name: /scenario switcher/i });
    expect(bar).toBeTruthy();
    expect(
      within(bar)
        .getByText(/3 \/ 10/)
        .closest("[aria-live='polite']"),
    ).toBeTruthy();
  });

  test("footnotes grouped by reason", () => {
    const excluded: ExcludedScenario[] = [
      { id: "t2-section-absent", label: "Section absent", reason: "structural" },
      { id: "alert-email-delivery-failed", label: "Email delivery failed", reason: "cut" },
    ];
    render(<SwitcherControls {...base} excluded={excluded} />);
    const bar = screen.getByTestId("attention-switcher-controls");
    expect(within(bar).getByText(/structural probes/i)).toBeTruthy();
    expect(within(bar).getByText(/Section absent/)).toBeTruthy();
    expect(within(bar).getByText(/published attention surface/i)).toBeTruthy();
  });

  test("closed mode shows Reopen wired to onReopen", () => {
    render(<SwitcherControls {...base} closed />);
    const reopen = screen.getByRole("button", { name: /reopen/i });
    fireEvent.click(reopen);
    expect(base.onReopen).toHaveBeenCalled();
  });

  test("no em-dash in rendered copy", () => {
    render(<SwitcherControls {...base} excluded={[{ id: "x", label: "Y", reason: "cut" }]} />);
    const bar = screen.getByTestId("attention-switcher-controls");
    expect(bar.textContent).not.toContain("—");
  });
});
