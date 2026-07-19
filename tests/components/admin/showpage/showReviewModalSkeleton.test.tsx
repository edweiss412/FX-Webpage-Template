/**
 * @vitest-environment jsdom
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DRAG_DISMISS_THRESHOLD_PX } from "@/components/admin/review/ReviewModalShell";
import { ShowReviewModalSkeleton } from "@/components/admin/showpage/ShowReviewModalSkeleton";

const TB = "published-show-review";

afterEach(cleanup);

describe("ShowReviewModalSkeleton dual usage (spec §3.4)", () => {
  // Failure mode: the shell-wide requestClose rewiring animates the LOADING
  // frame off-screen into an inert, scroll-locked state with no way back. A
  // test asserting only "no X button" passes while exactly that ships, so all
  // FOUR affordances are exercised — the drag branch in particular bypasses
  // requestClose entirely and needs its own gate.
  it("server-fallback usage (no onClose): every affordance is inert", () => {
    render(<ShowReviewModalSkeleton />);
    const dialog = screen.getByRole("dialog");
    const panel = document.querySelector<HTMLElement>("[data-review-modal-panel]")!;
    const grab = screen.getByTestId(`${TB}-grab`);

    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByTestId(`${TB}-backdrop`));
    fireEvent.click(grab);

    // Drag past the dismiss threshold — the branch that bypasses requestClose
    // and reaches beginDismiss directly.
    const endY = 100 + DRAG_DISMISS_THRESHOLD_PX + 20;
    fireEvent.pointerDown(grab, { pointerId: 1, clientY: 100 });
    fireEvent.pointerMove(grab, { pointerId: 1, clientY: endY });
    fireEvent.pointerUp(grab, { pointerId: 1, clientY: endY });

    expect(dialog).not.toHaveAttribute("inert");
    expect(panel.style.transform).toBe("");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  // Failure mode: the gate is derived too broadly and #485's client optimistic
  // copy loses its cancel, stranding the user on a skeleton.
  // Reduced motion so the close is synchronous — what is under test is that the
  // affordance is LIVE, not how it animates.
  it("client optimistic usage (real onClose): affordances dismiss", () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    try {
      const onClose = vi.fn();
      render(<ShowReviewModalSkeleton onClose={onClose} />);
      fireEvent.keyDown(document, { key: "Escape" });
      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      window.matchMedia = original;
    }
  });
});
