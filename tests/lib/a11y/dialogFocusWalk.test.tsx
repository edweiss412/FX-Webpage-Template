// @vitest-environment jsdom
/**
 * tests/lib/a11y/dialogFocusWalk.test.tsx
 *
 * useDialogFocus walks its own stops on every Tab (crew page redesign, the
 * section sheet's WebKit focus defect). The trap used to act only at its two
 * ends and leave every other Tab to the browser. WebKit's default sequential
 * navigation skips buttons and links, so in the crew section sheet (a dialog of
 * buttons and links) a Tab from the title the sheet focuses on open, or from
 * any of its buttons, landed on <body> (spec §5.2: focus is trapped).
 *
 * jsdom moves no focus on a Tab of its own, so a Tab the hook leaves to the
 * browser shows here as focus that did not move: each case below fails on the
 * ends-only trap for the same reason WebKit escaped.
 */
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef, type ReactNode } from "react";
import { useDialogFocus } from "@/lib/a11y/dialogFocus";

// jsdom computes no layout, so `offsetParent` is always null and the hook's
// visibility filter would see zero stops. Approximate the browser: any
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

/** A dialog whose initial focus is a `tabindex="-1"` title, as the crew sheet's is. */
function Dialog({ testId, children }: { testId: string; children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  useDialogFocus(containerRef, titleRef);
  return (
    <div ref={containerRef} role="dialog" aria-modal="true" data-testid={testId}>
      <h2 ref={titleRef} tabIndex={-1} data-testid={`${testId}-title`}>
        Title
      </h2>
      {children}
    </div>
  );
}

const active = () => (document.activeElement as HTMLElement | null)?.dataset.testid ?? null;

/** Press Tab (or Shift+Tab) on whatever holds focus; returns whether the hook took it. */
function tab(shift = false): boolean {
  const target = document.activeElement ?? document.body;
  return !fireEvent.keyDown(target, { key: "Tab", shiftKey: shift });
}

describe("useDialogFocus walks its own stops", () => {
  test("walk: from the tabindex=-1 title focused on open, Tab goes to the first stop and Shift+Tab to the last", () => {
    render(
      <Dialog testId="d">
        <button type="button" data-testid="close">
          Close
        </button>
        <a href="#x" data-testid="link">
          Link
        </a>
        <button type="button" data-testid="report">
          Report
        </button>
      </Dialog>,
    );
    expect(active()).toBe("d-title");
    expect(tab(), "the hook takes the Tab").toBe(true);
    expect(active()).toBe("close");
    screen.getByTestId("d-title").focus();
    expect(tab(true), "the hook takes the Shift+Tab").toBe(true);
    expect(active()).toBe("report");
  });

  test("walk: every Tab between stops is the hook's own, forward and back, wrapping at both ends", () => {
    render(
      <Dialog testId="d">
        <button type="button" data-testid="close">
          Close
        </button>
        <a href="#x" data-testid="link">
          Link
        </a>
        <button type="button" data-testid="report">
          Report
        </button>
      </Dialog>,
    );
    screen.getByTestId("close").focus();
    const forward: (string | null)[] = [];
    for (let i = 0; i < 3; i++) {
      expect(tab(), `Tab ${i + 1} is cancelled and moved by the hook`).toBe(true);
      forward.push(active());
    }
    expect(forward).toEqual(["link", "report", "close"]);
    const back: (string | null)[] = [];
    for (let i = 0; i < 3; i++) {
      expect(tab(true), `Shift+Tab ${i + 1} is cancelled and moved by the hook`).toBe(true);
      back.push(active());
    }
    expect(back).toEqual(["report", "link", "close"]);
  });

  test("walk: the stops are the browser's: a details summary is one, a radio group is one (its checked radio), hidden, inert and tabindex=-1 controls are none", () => {
    render(
      <Dialog testId="d">
        <button type="button" data-testid="close">
          Close
        </button>
        <details>
          <summary data-testid="summary">More</summary>
          <p>Detail</p>
        </details>
        <input type="radio" name="pick" value="a" data-testid="radio-a" />
        <input type="radio" name="pick" value="b" data-testid="radio-b" defaultChecked />
        <input type="radio" name="pick" value="c" data-testid="radio-c" />
        <button type="button" style={{ visibility: "hidden" }} data-testid="hidden">
          Hidden
        </button>
        <div inert>
          <button type="button" data-testid="inert">
            Inert
          </button>
        </div>
        <button type="button" tabIndex={-1} data-testid="skipped">
          Skipped
        </button>
        <input type="hidden" name="h" value="1" />
        <button type="button" data-testid="last">
          Last
        </button>
      </Dialog>,
    );
    screen.getByTestId("close").focus();
    const seen: (string | null)[] = [];
    for (let i = 0; i < 4; i++) {
      tab();
      seen.push(active());
    }
    expect(seen).toEqual(["summary", "radio-b", "last", "close"]);
    // Arrow keys move within a group natively; a Tab from whichever radio holds
    // focus leaves the group.
    screen.getByTestId("radio-c").focus();
    tab();
    expect(active()).toBe("last");
  });

  test("walk: a Tab a dialog nested inside this one already took is left alone", () => {
    render(
      <Dialog testId="outer">
        <button type="button" data-testid="outer-close">
          Close
        </button>
        <Dialog testId="inner">
          <button type="button" data-testid="inner-a">
            A
          </button>
          <button type="button" data-testid="inner-b">
            B
          </button>
        </Dialog>
        <button type="button" data-testid="outer-last">
          Last
        </button>
      </Dialog>,
    );
    screen.getByTestId("inner-a").focus();
    tab();
    expect(active(), "one move, the inner dialog's").toBe("inner-b");
    tab();
    expect(active(), "the inner dialog wraps within itself").toBe("inner-a");
  });
});
