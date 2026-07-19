// @vitest-environment jsdom
/**
 * tests/components/admin/showpage/attentionMenu.test.tsx
 *
 * AttentionMenu dropdown (published-show-alerts spec §5.2): actionable rows in
 * given order, tone dots, footer clearing count, close-then-navigate ordering,
 * capture-phase Escape that never reaches the modal shell's bubble listener,
 * click-outside close, listener teardown when closed.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createRef } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AttentionMenu } from "@/components/admin/showpage/AttentionMenu";
import type { AttentionItem } from "@/lib/admin/attentionItems";

function mk(over: Partial<AttentionItem>): AttentionItem {
  return {
    id: "alert:a1",
    kind: "alert",
    tone: "notice",
    sectionId: "crew",
    crewKey: null,
    actionable: true,
    menuTitle: "Role flags changed",
    menuSubtitle: "Crew · John Redcorn",
    ...over,
  };
}

const HOLD = mk({
  id: "hold:h1",
  kind: "hold",
  tone: "critical",
  sectionId: "changes",
  menuTitle: "Priya Shah's row changed while a rename was pending.",
  menuSubtitle: "Pick what happens in Changes",
});
const ALERT = mk({});
const CLEARING = mk({ id: "alert:c1", actionable: false, menuTitle: "Sheet unavailable" });

function renderMenu(over: Partial<Parameters<typeof AttentionMenu>[0]> = {}) {
  const pillRef = createRef<HTMLButtonElement>();
  const pill = document.createElement("button");
  document.body.appendChild(pill);
  (pillRef as { current: HTMLButtonElement | null }).current = pill;
  const props = {
    items: [HOLD, ALERT, CLEARING],
    open: true,
    onClose: vi.fn(),
    onNavigate: vi.fn(),
    pillRef,
    ...over,
  };
  const utils = render(<AttentionMenu {...props} />);
  return { ...utils, props, pill };
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("AttentionMenu", () => {
  test("renders only actionable rows, in order, with titles + subtitles", () => {
    renderMenu();
    const rows = screen.getAllByTestId(/^attention-menu-row-/);
    expect(rows.map((r) => r.getAttribute("data-testid"))).toEqual([
      "attention-menu-row-hold:h1",
      "attention-menu-row-alert:a1",
    ]);
    expect(rows[0]!.textContent).toContain("Priya Shah's row changed");
    expect(rows[0]!.textContent).toContain("Pick what happens in Changes");
    expect(screen.queryByText("Sheet unavailable")).toBeNull();
  });

  test("tone dot classes + sr-only tier text (WCAG 1.4.1 second channel)", () => {
    renderMenu();
    const hold = screen.getByTestId("attention-menu-row-hold:h1");
    const alert = screen.getByTestId("attention-menu-row-alert:a1");
    expect(hold.querySelector(".bg-status-degraded")).toBeTruthy();
    expect(alert.querySelector(".bg-status-review")).toBeTruthy();
    expect(hold.querySelector(".sr-only")).toBeTruthy();
  });

  test("row click → onClose BEFORE onNavigate(item)", () => {
    const calls: string[] = [];
    const { props } = renderMenu({
      onClose: vi.fn(() => calls.push("close")),
      onNavigate: vi.fn(() => calls.push("navigate")),
    });
    fireEvent.click(screen.getByTestId("attention-menu-row-alert:a1"));
    expect(calls).toEqual(["close", "navigate"]);
    expect(props.onNavigate).toHaveBeenCalledWith(ALERT);
  });

  test("footer shows clearing count copy; absent when none clearing", () => {
    renderMenu();
    expect(screen.getByText("1 more clearing on their own — no action needed")).toBeInTheDocument();
    cleanup();
    renderMenu({ items: [HOLD, ALERT] });
    expect(screen.queryByText(/clearing on their own/)).toBeNull();
  });

  test("Escape: closes, focuses pill, and a document BUBBLE listener never fires (capture + stopPropagation)", () => {
    const bubbleSpy = vi.fn();
    document.addEventListener("keydown", bubbleSpy);
    const { props, pill } = renderMenu();
    const focusSpy = vi.spyOn(pill, "focus");
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(focusSpy).toHaveBeenCalled();
    expect(bubbleSpy).not.toHaveBeenCalled();
    document.removeEventListener("keydown", bubbleSpy);
  });

  test("click outside → onClose; click inside → stays open", () => {
    const { props } = renderMenu();
    fireEvent.pointerDown(screen.getByTestId("attention-menu-row-alert:a1"));
    expect(props.onClose).not.toHaveBeenCalled();
    fireEvent.pointerDown(document.body);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  test("open:false renders nothing and no listeners remain", () => {
    const { container, props } = renderMenu({ open: false });
    expect(container.innerHTML).toBe("");
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(props.onClose).not.toHaveBeenCalled();
  });

  test("motion classes: origin-top-right + duration-fast ease-out-quart + motion-reduce off", () => {
    renderMenu();
    const panel = screen.getByTestId("published-show-review-attention-menu");
    expect(panel.className).toContain("origin-top-right");
    expect(panel.className).toContain("duration-fast");
    expect(panel.className).toContain("ease-out-quart");
    expect(panel.className).toContain("motion-reduce:transition-none");
  });
});
