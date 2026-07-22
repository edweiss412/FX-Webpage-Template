/**
 * tests/components/admin/dev/switcherControls.test.tsx
 * (plan 2026-07-21-attention-modal-switcher-gallery Task 5;
 *  disclosure contract per spec 2026-07-21-gallery-switcher-slim-bar §5)
 */
// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
  onPrev: vi.fn(),
  onNext: vi.fn(),
};

const MIXED: ExcludedScenario[] = [
  { id: "t2-section-absent", label: "Section absent", reason: "structural" },
  { id: "alert-email-delivery-failed", label: "Email delivery failed", reason: "cut" },
];

const TOGGLE_TESTID = "attention-switcher-excluded-toggle";
const PANEL_TESTID = "attention-switcher-excluded-panel";

describe("SwitcherControls", () => {
  test("renders position + human label; raw codes are NOT visible text (invariant 5)", () => {
    render(<SwitcherControls {...base} />);
    const bar = screen.getByTestId("attention-switcher-controls");
    expect(within(bar).getByText(/3 \/ 10/)).toBeTruthy(); // 1-indexed
    expect(within(bar).getByText("Diagram signal missing")).toBeTruthy();
    // The raw code is inspectable via a non-visible data attribute, never copy.
    expect(within(bar).queryByText(/DIAGRAM_SIGNAL_MISSING/)).toBeNull();
    expect(bar.getAttribute("data-codes")).toBe("DIAGRAM_SIGNAL_MISSING");
  });

  test("aria-live region announces the scenario label, not just the number", () => {
    render(<SwitcherControls {...base} />);
    const bar = screen.getByTestId("attention-switcher-controls");
    const live = within(bar)
      .getByText(/3 \/ 10/)
      .closest("[aria-live='polite']");
    expect(live).not.toBeNull();
    // The changing scenario identity is INSIDE the live region.
    expect(live!.textContent).toContain("Diagram signal missing");
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

  // --- Disclosure contract (spec §2.2/§2.3/§5) ---

  test("footnote copy is hidden behind a collapsed-by-default disclosure", () => {
    render(<SwitcherControls {...base} excluded={MIXED} />);
    const bar = screen.getByTestId("attention-switcher-controls");
    // Absent initially — the disclosure owns the copy.
    expect(within(bar).queryByText(/structural probes/i)).toBeNull();
    expect(within(bar).queryByText(/published attention surface/i)).toBeNull();
    const toggle = within(bar).getByTestId(TOGGLE_TESTID);
    expect(within(bar).getByRole("button", { name: /2 excluded/i })).toBe(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.hasAttribute("aria-controls")).toBe(false);
    expect(within(bar).queryByTestId(PANEL_TESTID)).toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.getAttribute("aria-controls")).toBe("switcher-excluded-panel");
    const panel = within(bar).getByTestId(PANEL_TESTID);
    expect(panel.id).toBe("switcher-excluded-panel");
    expect(within(panel).getByText(/structural probes/i)).toBeTruthy();
    expect(within(panel).getByText(/Section absent/)).toBeTruthy();
    expect(within(panel).getByText(/published attention surface/i)).toBeTruthy();

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.hasAttribute("aria-controls")).toBe(false);
    expect(within(bar).queryByTestId(PANEL_TESTID)).toBeNull();
  });

  test("structural-only panel shows only the structural line; cut-only the inverse", () => {
    const structuralOnly: ExcludedScenario[] = [MIXED[0]!];
    const { unmount } = render(<SwitcherControls {...base} excluded={structuralOnly} />);
    fireEvent.click(screen.getByTestId(TOGGLE_TESTID));
    let panel = screen.getByTestId(PANEL_TESTID);
    expect(within(panel).getByText(/structural probes/i)).toBeTruthy();
    expect(within(panel).queryByText(/published attention surface/i)).toBeNull();
    unmount();

    const cutOnly: ExcludedScenario[] = [MIXED[1]!];
    render(<SwitcherControls {...base} excluded={cutOnly} />);
    fireEvent.click(screen.getByTestId(TOGGLE_TESTID));
    panel = screen.getByTestId(PANEL_TESTID);
    expect(within(panel).queryByText(/structural probes/i)).toBeNull();
    expect(within(panel).getByText(/published attention surface/i)).toBeTruthy();
  });

  test("no excluded scenarios: no toggle, no panel", () => {
    render(<SwitcherControls {...base} excluded={[]} />);
    expect(screen.queryByTestId(TOGGLE_TESTID)).toBeNull();
    expect(screen.queryByTestId(PANEL_TESTID)).toBeNull();
  });

  // --- Static class pins (spec §5): contracts invisible to a zero-inset browser
  //     and the short current catalog — the classes ARE the testable surface. ---

  test("row never wraps; fixed children pin shrink-0; wrapper stays the shrinkable child", () => {
    render(<SwitcherControls {...base} excluded={MIXED} />);
    const bar = screen.getByTestId("attention-switcher-controls");
    const prev = within(bar).getByRole("button", { name: /prev/i });
    const next = within(bar).getByRole("button", { name: /next/i });
    const toggle = within(bar).getByTestId(TOGGLE_TESTID);
    const row = prev.parentElement!;
    expect(row.className).toContain("flex-nowrap");
    expect(row.className.split(/\s+/)).not.toContain("flex-wrap");
    for (const el of [prev, next, toggle]) {
      expect(el.className).toContain("shrink-0");
    }
    const chip = within(bar)
      .getByText(/tier 1/)
      .closest("span")!;
    expect(chip.className).toContain("shrink-0");
    const wrapper = within(bar)
      .getByText(/3 \/ 10/)
      .closest("[aria-live='polite']")! as HTMLElement;
    expect(wrapper.className).toContain("min-w-0");
    expect(wrapper.className).toContain("flex-1");
    // Toggle is a real tap target in both dimensions.
    expect(toggle.className).toContain("min-h-tap-min");
    expect(toggle.className).toContain("min-w-tap-min");
  });

  test("bar container uses additive safe-area top padding, not py-2", () => {
    render(<SwitcherControls {...base} />);
    const bar = screen.getByTestId("attention-switcher-controls");
    expect(bar.className).toContain("pb-2");
    expect(bar.className).toContain("pt-[calc(--spacing(2)+env(safe-area-inset-top,0))]");
    expect(bar.className.split(/\s+/)).not.toContain("py-2");
  });

  test("open panel is capped and scrollable", () => {
    render(<SwitcherControls {...base} excluded={MIXED} />);
    fireEvent.click(screen.getByTestId(TOGGLE_TESTID));
    const panel = screen.getByTestId(PANEL_TESTID);
    expect(panel.className).toContain("max-h-[40vh]");
    expect(panel.className).toContain("overflow-y-auto");
  });

  // --- Guard rows (spec §3, runtime set) ---

  test("count arithmetic and degenerate numeric props render without gating", () => {
    const { rerender } = render(<SwitcherControls {...base} index={0} total={10} />);
    const bar = screen.getByTestId("attention-switcher-controls");
    expect(within(bar).getByText(/1 \/ 10/)).toBeTruthy();
    rerender(<SwitcherControls {...base} index={NaN} total={10} />);
    expect(within(bar).getByText(/NaN \/ 10/)).toBeTruthy();
    rerender(<SwitcherControls {...base} index={-1} total={0} />);
    expect(within(bar).getByText(/0 \/ 0/)).toBeTruthy();
    rerender(<SwitcherControls {...base} index={2} total={-3} />);
    expect(within(bar).getByText(/3 \/ -3/)).toBeTruthy();
    rerender(<SwitcherControls {...base} index={2} total={NaN} />);
    expect(within(bar).getByText(/3 \/ NaN/)).toBeTruthy();
  });

  test("empty and long labels keep the truncating span contract", () => {
    const { rerender } = render(<SwitcherControls {...base} label="" />);
    const bar = screen.getByTestId("attention-switcher-controls");
    const wrapper = within(bar)
      .getByText(/3 \/ 10/)
      .closest("[aria-live='polite']")! as HTMLElement;
    // Row intact: the truncating span is still rendered, just empty.
    const emptySpan = wrapper.querySelector("span.truncate");
    expect(emptySpan).not.toBeNull();
    expect(emptySpan!.className).toContain("min-w-0");
    expect(emptySpan!.textContent).toBe("");

    const long = "x".repeat(200);
    rerender(<SwitcherControls {...base} label={long} />);
    const longSpan = within(bar).getByText(long);
    // jsdom cannot measure clipping; the class IS the contract.
    expect(longSpan.className).toContain("truncate");
  });

  test("empty codes yields an empty data-codes attribute", () => {
    render(<SwitcherControls {...base} codes={[]} />);
    expect(screen.getByTestId("attention-switcher-controls").getAttribute("data-codes")).toBe("");
  });

  test("no em-dash in rendered copy, collapsed or expanded", () => {
    render(<SwitcherControls {...base} excluded={MIXED} />);
    const bar = screen.getByTestId("attention-switcher-controls");
    expect(bar.textContent).not.toContain("—");
    fireEvent.click(screen.getByTestId(TOGGLE_TESTID));
    expect(bar.textContent).not.toContain("—");
  });

  // --- Transition audit (spec §4): 2 states, 1 pair, instant. Conditional
  //     renders — toggle (excluded.length > 0), panel (showExcluded), structural
  //     line, cut line — are all instant mount/unmount by inventory. ---

  test("component is animation-free (source scan)", () => {
    const src = readFileSync(
      join(process.cwd(), "components/admin/dev/SwitcherControls.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/AnimatePresence|motion\.|animate-|transition/);
  });
});
