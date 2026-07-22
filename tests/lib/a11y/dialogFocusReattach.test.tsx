// @vitest-environment jsdom
/**
 * tests/lib/a11y/dialogFocusReattach.test.tsx
 *
 * useDialogFocus reattach contract (hoverhelp-smart-position Task 7 producer
 * fix). ReviewModalShell's `mounted` flip moves the dialog tree into a
 * `createPortal(document.body)` — React RECREATES the host DOM nodes, so a
 * keydown listener attached to the FIRST panel node is silently lost and the
 * Tab trap goes dead on every SSR cold-load (`/admin?show=` — masked in
 * production only because the inert background plus the modal sitting at the
 * end of `document.body` makes native tab-wrap mimic the trap). The hook
 * therefore accepts a `reattachKey`: when it changes, the effect re-runs and
 * the trap re-binds to the CURRENT container node.
 *
 * Failure mode caught: without the reattachKey dep, the "trap wraps on the
 * swapped container" test fails — the keydown on the new node reaches no
 * listener, `defaultPrevented` stays false, and focus would escape the dialog.
 */
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { useRef } from "react";
import { useDialogFocus } from "@/lib/a11y/dialogFocus";

// jsdom computes no layout, so `offsetParent` is always null and the hook's
// visibility filter would see zero focusables. Approximate the browser: any
// attached element "has layout" (its offsetParent is its parent element).
const originalOffsetParent = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetParent");
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetParent", {
    configurable: true,
    get(this: HTMLElement) {
      return this.parentElement;
    },
  });
});
afterEach(() => {
  cleanup();
  if (originalOffsetParent) {
    Object.defineProperty(HTMLElement.prototype, "offsetParent", originalOffsetParent);
  }
});

/**
 * Mirrors the shell's mounted-flip topology: `remounted={false}` renders
 * container A; rerendering with `true` renders a DIFFERENT container node
 * (keyed, so React recreates the DOM) while the component instance — and
 * therefore the hook's effect — survives.
 */
function Harness({ remounted }: { remounted: boolean }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  useDialogFocus(containerRef, undefined, remounted);
  const k = remounted ? "b" : "a";
  return (
    <div key={k} ref={containerRef} data-testid={k}>
      <button type="button" data-testid={`${k}-first`}>
        first
      </button>
      <button type="button" data-testid={`${k}-last`}>
        last
      </button>
    </div>
  );
}

describe("useDialogFocus reattach on container recreation", () => {
  test("trap wraps on the swapped container (listener re-bound via reattachKey)", () => {
    const { getByTestId, rerender } = render(<Harness remounted={false} />);
    // Sanity: trap alive on container A.
    const aLast = getByTestId("a-last");
    aLast.focus();
    const aEvent = fireEvent.keyDown(aLast, { key: "Tab" });
    expect(aEvent).toBe(false); // preventDefault called → trap intercepted
    expect(document.activeElement).toBe(getByTestId("a-first")); // wrapped

    rerender(<Harness remounted={true} />);
    const bLast = getByTestId("b-last");
    bLast.focus();
    const bEvent = fireEvent.keyDown(bLast, { key: "Tab" });
    expect(bEvent).toBe(false); // trap re-bound to the NEW node
    expect(document.activeElement).toBe(getByTestId("b-first"));
  });

  test("tabindex=-1 focusables are not trap boundaries (codex R1 F2 - mirrors native order)", () => {
    function LinkHarness() {
      const containerRef = useRef<HTMLDivElement | null>(null);
      useDialogFocus(containerRef, undefined);
      return (
        <div ref={containerRef}>
          <button type="button" data-testid="first">
            first
          </button>
          <button type="button" data-testid="real-last">
            real last
          </button>
          {/* e.g. HoverHelp's learn-more link while the popover is closed or
              collision-hidden: matches `a[href]` and keeps a non-null
              offsetParent, but is NOT in native sequential order. */}
          <a href="/x" tabIndex={-1} data-testid="untabbable">
            untabbable
          </a>
        </div>
      );
    }
    const { getByTestId } = render(<LinkHarness />);
    const realLast = getByTestId("real-last");
    realLast.focus();
    const evt = fireEvent.keyDown(realLast, { key: "Tab" });
    expect(evt).toBe(false); // trap intercepted: real-last IS the boundary
    expect(document.activeElement).toBe(getByTestId("first")); // wrapped, not the -1 link
  });

  test("initial focus is re-applied to the new container after the swap", () => {
    const { getByTestId, rerender } = render(<Harness remounted={false} />);
    expect(document.activeElement).toBe(getByTestId("a-first"));
    rerender(<Harness remounted={true} />);
    // The DOM swap dropped focus; the reattach re-applies the initial-focus
    // contract on the new tree (first focusable — no initialFocusRef here).
    expect(document.activeElement).toBe(getByTestId("b-first"));
  });
});
