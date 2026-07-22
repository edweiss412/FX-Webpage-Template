// @vitest-environment jsdom
/**
 * Blur-close (spec 2026-07-22-hoverhelp-caret-blur-close §4).
 * jsdom asserts the handler logic with synthesized FocusEvents; REAL focus
 * traversal is covered by the §4.0 Chromium probe + e2e T-E4.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { HoverHelp, PopoverHostContext } from "@/components/admin/HoverHelp";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function Harness({
  modalHost = false,
  learnMore = false,
  afterBodyText,
}: {
  modalHost?: boolean;
  learnMore?: boolean;
  afterBodyText?: string;
}) {
  const paneRef = useRef<HTMLDivElement | null>(null);
  const help = (
    <HoverHelp
      label="Help: blur"
      testId="bc"
      {...(learnMore ? { learnMore: { href: "/help/x" } } : {})}
      {...(afterBodyText !== undefined ? { afterBodyText } : {})}
    >
      <p>body</p>
    </HoverHelp>
  );
  return (
    <div>
      <button data-testid="outside-a">A</button>
      {modalHost ? (
        <div ref={paneRef} data-testid="pane">
          <PopoverHostContext.Provider value={paneRef}>{help}</PopoverHostContext.Provider>
        </div>
      ) : (
        help
      )}
      <button data-testid="outside-b">B</button>
    </div>
  );
}

const open = () => {
  const trigger = screen.getByTestId("bc-trigger");
  fireEvent.click(trigger);
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  return trigger;
};
const expectClosed = () => {
  expect(screen.getByTestId("bc-trigger").getAttribute("aria-expanded")).toBe("false");
  expect(screen.getByTestId("bc-body").className).toContain("hidden");
};
const expectOpen = () =>
  expect(screen.getByTestId("bc-trigger").getAttribute("aria-expanded")).toBe("true");

describe("pair-scoped blur-close", () => {
  test("T-B1: focusout to an outside control closes and leaves focus where the user sent it", () => {
    render(<Harness />);
    const trigger = open();
    const outside = screen.getByTestId("outside-b");
    // browser order: focus moves FIRST, then focusout fires with relatedTarget
    outside.focus();
    fireEvent.focusOut(trigger, { relatedTarget: outside });
    expectClosed();
    expect(document.activeElement).toBe(outside); // no focus steal
  });

  test("T-B2: focusout to the portaled body link stays open", () => {
    render(<Harness learnMore />);
    const trigger = open();
    const link = screen.getByTestId("bc-body").querySelector("a");
    if (!link) throw new Error("link missing");
    fireEvent.focusOut(trigger, { relatedTarget: link });
    expectOpen();
  });

  test("T-B3: null relatedTarget is ignored (window blur / non-focusable click)", () => {
    render(<Harness />);
    const trigger = open();
    fireEvent.focusOut(trigger, { relatedTarget: null });
    expectOpen();
  });

  test("T-B4: bridge forward-Tab still closes and refocuses the trigger", () => {
    render(<Harness learnMore />);
    const trigger = open();
    const link = screen.getByTestId("bc-body").querySelector("a");
    if (!link) throw new Error("link missing");
    (link as HTMLElement).focus();
    fireEvent.keyDown(screen.getByTestId("bc-body"), { key: "Tab" });
    expectClosed();
    expect(document.activeElement).toBe(trigger);
  });

  test("T-B5: hover-open with focus elsewhere - outside focus moves never close", () => {
    render(<Harness />);
    const trigger = screen.getByTestId("bc-trigger");
    fireEvent.pointerEnter(trigger.parentElement as HTMLElement, { pointerType: "mouse" });
    expectOpen();
    const a = screen.getByTestId("outside-a");
    const b = screen.getByTestId("outside-b");
    a.focus();
    fireEvent.focusOut(a, { relatedTarget: b }); // outside pair - handler not attached there
    expectOpen();
  });

  test("T-B6: modal host + learnMore - carve-out keeps it open", () => {
    render(<Harness modalHost learnMore />);
    open();
    fireEvent.focusOut(screen.getByTestId("bc-trigger"), {
      relatedTarget: screen.getByTestId("outside-b"),
    });
    expectOpen();
  });

  test("T-B7: body host + learnMore closes (carve-out is modal-only)", () => {
    render(<Harness learnMore />);
    open();
    fireEvent.focusOut(screen.getByTestId("bc-trigger"), {
      relatedTarget: screen.getByTestId("outside-b"),
    });
    expectClosed();
  });

  test("T-B8: modal host WITHOUT learnMore closes", () => {
    render(<Harness modalHost />);
    open();
    fireEvent.focusOut(screen.getByTestId("bc-trigger"), {
      relatedTarget: screen.getByTestId("outside-b"),
    });
    expectClosed();
  });

  test("T-B9: modal host + afterBodyText only (narrowed, no link) closes", () => {
    render(<Harness modalHost afterBodyText="Second paragraph." />);
    open();
    fireEvent.focusOut(screen.getByTestId("bc-trigger"), {
      relatedTarget: screen.getByTestId("outside-b"),
    });
    expectClosed();
  });

  test("T-B11: blur ORIGINATING in the portaled body (link -> outside) closes via root handler", () => {
    render(<Harness learnMore />);
    open();
    const link = screen.getByTestId("bc-body").querySelector("a");
    if (!link) throw new Error("link missing");
    (link as HTMLElement).focus();
    const outside = screen.getByTestId("outside-b");
    outside.focus();
    // portal blurs bubble through the REACT tree to the root wrapper (probe P2);
    // this dispatch proves the root handler receives a portaled descendant's blur.
    fireEvent.focusOut(link, { relatedTarget: outside });
    expectClosed();
    expect(document.activeElement).toBe(outside);
  });

  test("T-B10: blur-close clears a pending pointer-leave timer (no stale close on reopen)", () => {
    vi.useFakeTimers();
    render(<Harness />);
    const trigger = open();
    const root = trigger.parentElement as HTMLElement;
    fireEvent.pointerLeave(root, { pointerType: "mouse" }); // schedules 120ms close
    fireEvent.focusOut(trigger, { relatedTarget: screen.getByTestId("outside-b") });
    expectClosed();
    fireEvent.click(trigger); // immediate reopen
    expectOpen();
    act(() => {
      vi.advanceTimersByTime(500); // stale timer would fire in here if not cleared
    });
    expectOpen();
    vi.useRealTimers();
  });
});
