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
import { useRef, type RefObject } from "react";
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

/**
 * Whole-diff review round 2: the restore chain stopped at its FIRST candidate
 * even when that candidate had been detached while the dialog was open.
 * `.focus()` on a detached node is a silent no-op, so focus fell to `<body>`
 * and the second candidate was never consulted. The hook's own doc comment
 * already named that failure as the reason `restoreTargetRef` exists; what it
 * did not do was fall THROUGH a dead override to a trigger that is still there.
 *
 * NEGATIVE-CONTROLLED: reverting the production change to the old
 * `first-candidate-wins` chain makes this fail with focus stranded on `<body>`,
 * and restoring it makes it pass. So it does discriminate.
 *
 * That was not true of the first three attempts, and the reason is worth
 * keeping: the hook takes its restore override in an OPTIONS OBJECT, and the
 * test was passing the ref positionally. `restoreTargetRef` was therefore never
 * set, the chain fell straight through to a connected trigger, and both
 * versions passed. Three rounds of "the environment must not reproduce it" were
 * wrong; typecheck found it in one line. A test that cannot fail is worth less
 * than no test, and the way this one was caught was a mechanical gate, not a
 * closer reading of the assertion.
 */
describe("restore skips detached candidates", () => {
  function Harness({
    open,
    restoreTo,
  }: {
    open: boolean;
    restoreTo: RefObject<HTMLElement | null>;
  }) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    useDialogFocus(containerRef, undefined, undefined, { restoreTargetRef: restoreTo });
    if (!open) return null;
    return (
      <div ref={containerRef}>
        <button type="button">inside</button>
      </div>
    );
  }

  test("a detached override falls through to the still-connected trigger", () => {
    const trigger = document.createElement("button");
    trigger.textContent = "trigger";
    document.body.appendChild(trigger);
    trigger.focus();

    const doomed = document.createElement("button");
    document.body.appendChild(doomed);
    const restoreTo = { current: doomed } as RefObject<HTMLElement | null>;

    const view = render(<Harness open restoreTo={restoreTo} />);

    // The override is removed while the dialog is open — the exact shape the
    // hook's comment describes, a trigger that disappears mid-dialog.
    doomed.remove();
    if (doomed.isConnected) throw new Error("premise: the override must be detached");

    // PREMISE, and the one that matters. If focus never entered the dialog then
    // `trigger` simply kept it the whole time, the restore chain is never
    // consulted, and every assertion below passes no matter what the chain
    // does. Two earlier versions of this test passed against the UNFIXED chain
    // for exactly that reason.
    if (view.container.contains(document.activeElement) === false) {
      throw new Error(
        "premise not met: focus never entered the dialog, so the restore chain is not exercised",
      );
    }

    // UNMOUNT, not a render of null. The restore effect's deps are `[]`, so its
    // cleanup runs when the component unmounts and at no other time; rendering
    // null leaves it mounted and the restore never fires. The first version of
    // this test did exactly that and failed for that reason, not for the
    // defect's.
    view.unmount();

    expect(document.activeElement, "focus is not stranded on <body>").not.toBe(document.body);
    expect(document.activeElement, "it falls through to the connected trigger").toBe(trigger);
    trigger.remove();
  });
});
