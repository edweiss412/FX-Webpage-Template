// @vitest-environment jsdom
/**
 * tests/components/admin/showpage/attentionMenuFrame.test.tsx
 * (wizard-review-attention-menu spec §5 — Task 4)
 *
 * `AttentionMenuFrame` and `AttentionMenuRow` are the published menu's chrome
 * and row shape, exported so the wizard's warning index renders the SAME ones.
 * The failure this file exists to catch is a wizard menu that LOOKS like the
 * published one while quietly missing a contract that lives in the chrome: the
 * nested scrollable region's name and tab stop, or the capture-phase Escape
 * claim that keeps the first Esc from closing the whole modal.
 *
 * Byte identity of the published menu itself is pinned separately, by the
 * committed baseline in publishedAttentionBaseline.test.tsx.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { AttentionMenuFrame, AttentionMenuRow } from "@/components/admin/showpage/AttentionMenu";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

/** The pill-ref scaffold from attentionMenu.test.tsx: a real focusable button in
 *  the document, so "focus returns to the pill" is observable. */
function pillScaffold() {
  const pillRef = createRef<HTMLButtonElement>();
  const pill = document.createElement("button");
  document.body.appendChild(pill);
  (pillRef as { current: HTMLButtonElement | null }).current = pill;
  return { pillRef, pill };
}

function renderFrame(over: Partial<Parameters<typeof AttentionMenuFrame>[0]> = {}) {
  const { pillRef, pill } = pillScaffold();
  const onClose = vi.fn();
  const props = {
    testId: "t-frame",
    ariaLabel: "Needs you",
    scrollerLabel: "Attention items",
    pillRef,
    onClose,
    children: (
      <>
        <AttentionMenuRow
          testId="row-a"
          dotClassName="bg-status-review"
          srText="needs review: "
          title="Row A"
          secondLine="Second A"
          truncateSecondLine
          onSelect={vi.fn()}
        />
        <AttentionMenuRow
          testId="row-b"
          dotClassName="bg-text-faint"
          srText="judgment call: "
          title="Row B"
          secondLine={null}
          truncateSecondLine={false}
          onSelect={vi.fn()}
        />
      </>
    ),
    ...over,
  };
  const utils = render(<AttentionMenuFrame {...props} />);
  return { ...utils, props, pill, onClose };
}

describe("AttentionMenuFrame", () => {
  it("names the panel and the nested scrollable region, and gives the scroller a tab stop", () => {
    renderFrame();
    const panel = screen.getByTestId("t-frame");
    expect(panel.getAttribute("role")).toBe("group");
    expect(panel.getAttribute("aria-label")).toBe("Needs you");
    // The SCROLLER, not the panel: it owns the scroll range and can overflow
    // with zero focusable descendants, so it needs its own name + tab stop.
    const scroller = screen.getByRole("group", { name: "Attention items" });
    expect(scroller).not.toBe(panel);
    expect(panel.contains(scroller)).toBe(true);
    expect(scroller.getAttribute("tabindex")).toBe("0");
  });

  it("claims Escape in the CAPTURE phase: onClose once, pill refocused, no bubble dispatch", () => {
    const { pill, onClose } = renderFrame();
    const bubbleSaw = vi.fn();
    document.addEventListener("keydown", bubbleSaw);
    try {
      fireEvent.keyDown(document, { key: "Escape" });
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(document.activeElement).toBe(pill);
      // The shell's own Escape listener is a document-level BUBBLE listener, so
      // this is the assertion that keeps the first Esc from closing the modal.
      expect(bubbleSaw).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener("keydown", bubbleSaw);
    }
  });

  it("renders `heading` between the panel edge and the scroller", () => {
    renderFrame({
      heading: <div data-testid="t-heading">Needs you</div>,
    });
    const heading = screen.getByTestId("t-heading");
    const scroller = screen.getByRole("group", { name: "Attention items" });
    expect(heading.parentElement).toBe(screen.getByTestId("t-frame"));
    expect(heading.nextElementSibling).toBe(scroller);
  });

  it("omits the heading slot entirely when no heading is passed", () => {
    renderFrame();
    const panel = screen.getByTestId("t-frame");
    const scroller = screen.getByRole("group", { name: "Attention items" });
    expect(panel.firstElementChild).toBe(scroller);
  });
});

describe("AttentionMenuRow", () => {
  it("renders the second line only when there is one, and truncates only when asked", () => {
    renderFrame();
    const a = screen.getByTestId("row-a");
    const b = screen.getByTestId("row-b");
    const secondLineOf = (row: HTMLElement) =>
      row.querySelector(".text-xs\\/relaxed") as HTMLElement | null;
    expect(secondLineOf(a)?.textContent).toBe("Second A");
    expect(secondLineOf(a)!.className).toContain("truncate");
    // A fix hint must wrap in full rather than truncate, which is the only
    // reason this prop exists — so its absence has to be observable.
    expect(secondLineOf(b)).toBeNull();
  });

  it("does not truncate the second line when truncateSecondLine is false", () => {
    renderFrame({
      children: (
        <AttentionMenuRow
          testId="row-hint"
          dotClassName="bg-status-review"
          srText="needs review: "
          title="Row hint"
          secondLine="A fix hint that must wrap in full"
          truncateSecondLine={false}
          onSelect={vi.fn()}
        />
      ),
    });
    const line = screen.getByTestId("row-hint").querySelector(".text-xs\\/relaxed") as HTMLElement;
    expect(line.textContent).toBe("A fix hint that must wrap in full");
    expect(line.className).not.toContain("truncate");
  });

  it("is a BUTTON whose tone dot and sr-only tier text are the second channel", () => {
    renderFrame();
    const a = screen.getByTestId("row-a");
    expect(a.tagName).toBe("BUTTON");
    expect(a.querySelector(".bg-status-review")).toBeTruthy();
    expect(a.querySelector(".sr-only")?.textContent).toBe("needs review: ");
    expect(screen.getByTestId("row-b").querySelector(".bg-text-faint")).toBeTruthy();
  });

  it("fires onSelect on click", () => {
    const onSelect = vi.fn();
    renderFrame({
      children: (
        <AttentionMenuRow
          testId="row-click"
          dotClassName="bg-status-review"
          srText="needs review: "
          title="Row"
          secondLine={null}
          truncateSecondLine={false}
          onSelect={onSelect}
        />
      ),
    });
    fireEvent.click(screen.getByTestId("row-click"));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
