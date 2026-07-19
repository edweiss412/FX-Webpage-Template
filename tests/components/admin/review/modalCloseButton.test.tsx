// @vitest-environment jsdom
/**
 * tests/components/admin/review/modalCloseButton.test.tsx
 * (modal-close-exit-anim spec §3.3 — Task 1)
 *
 * Unit contract for the shared modal X. The button lives in each consumer's
 * `header` slot, which the shell renders INSIDE its close provider — so the
 * context read resolves here even though a hook call in the consumer's own
 * body would not (spec §3.1a).
 *
 * NOTE: this repo has no `@testing-library/user-event`; `fireEvent` is the
 * established click idiom (see reviewModalShell.test.tsx).
 */
import "@testing-library/jest-dom/vitest";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ModalCloseButton } from "@/components/admin/review/ModalCloseButton";
import { ReviewModalCloseContext } from "@/components/admin/review/ReviewModalShell";

afterEach(cleanup);

describe("ModalCloseButton", () => {
  // Failure mode: the button renders but is wired to the wrong close path,
  // so the X snaps shut while every other affordance animates.
  it("calls the context's requestClose on click", () => {
    const requestClose = vi.fn();
    render(
      <ReviewModalCloseContext.Provider value={requestClose}>
        <ModalCloseButton testId="x-close" />
      </ReviewModalCloseContext.Provider>,
    );
    fireEvent.click(screen.getByTestId("x-close"));
    expect(requestClose).toHaveBeenCalledTimes(1);
  });

  // Failure mode: initial focus breaks because the ref stops reaching the
  // consumer's `closeRef` (both consumers pass it as `initialFocusRef`).
  it("forwards its ref to the underlying button", () => {
    const ref = createRef<HTMLButtonElement>();
    render(<ModalCloseButton ref={ref} testId="x-close" />);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    expect(ref.current?.getAttribute("aria-label")).toBe("Close");
  });

  // Failure mode: a future refactor drops the provider wrap; without this the
  // button would throw instead of degrading, masking the real bug.
  it("no-ops outside a provider", () => {
    render(<ModalCloseButton testId="x-close" />);
    expect(() => fireEvent.click(screen.getByTestId("x-close"))).not.toThrow();
  });
});
