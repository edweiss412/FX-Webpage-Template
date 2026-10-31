// @vitest-environment jsdom
/**
 * tests/lib/a11y/dialogFocusWalk.test.tsx
 *
 * useDialogFocus has two Tab modes.
 *
 * DEFAULT, every dialog but one: main's trap. It acts only at its two ends
 * (Tab from the last stop wraps to the first, Shift+Tab from the first to the
 * last) and leaves every other Tab to the browser. Whole-diff review R2 found
 * two blocking regressions when every dialog was moved onto the walk below: a
 * Tab stuck on a closed disclosure's summary in the admin review modals (R2-F1),
 * and CrewRowActions' "Confirm reset" unreachable because the trap moved focus
 * before the popover's own Tab handler ran (R2-F2).
 *
 * WALK, opt-in (`walkTabs`), the crew section sheet only: the trap moves
 * focus itself on every Tab. WebKit's default sequential navigation skips buttons
 * and links, so in the sheet (a dialog of buttons and links) a Tab left to the
 * browser landed on <body> (spec §5.2: focus is trapped).
 *
 * jsdom moves no focus on a Tab of its own, so a Tab the hook leaves to the
 * browser shows here as an event nothing cancelled and focus that did not move.
 */
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef, type ReactNode } from "react";
import { useDialogFocus } from "@/lib/a11y/dialogFocus";

// The browser, as measured (Chromium and WebKit, Playwright 1.59). jsdom
// computes no layout, so `offsetParent` is null everywhere and the hook would
// see no stops: any attached element "has layout" here (its offsetParent is its
// parent element). That includes the contents of a CLOSED <details>, because
// that is what both engines report for them (offsetParent BODY, tabIndex 0).
// What tells a closed disclosure apart in a browser is that focus() on its
// contents does nothing; jsdom would move focus there, so the model refuses it.
const originalOffsetParent = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetParent");
const originalFocus = HTMLElement.prototype.focus;

/** Inside a closed <details>, and not in its own summary: rendered hidden. */
function inClosedDisclosure(el: Element): boolean {
  let child: Element = el;
  for (let parent = el.parentElement; parent; child = parent, parent = parent.parentElement) {
    if (
      parent instanceof HTMLDetailsElement &&
      !parent.open &&
      child !== parent.querySelector(":scope > summary")
    ) {
      return true;
    }
  }
  return false;
}

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetParent", {
    configurable: true,
    get(this: HTMLElement) {
      return this.parentElement;
    },
  });
  HTMLElement.prototype.focus = function focus(this: HTMLElement, options?: FocusOptions) {
    if (inClosedDisclosure(this)) return;
    originalFocus.call(this, options);
  };
});
afterEach(() => {
  cleanup();
  HTMLElement.prototype.focus = originalFocus;
  if (originalOffsetParent) {
    Object.defineProperty(HTMLElement.prototype, "offsetParent", originalOffsetParent);
  }
});

/** A dialog whose initial focus is a `tabindex="-1"` title, as the crew sheet's is. */
function Dialog({
  testId,
  walk = false,
  children,
}: {
  testId: string;
  walk?: boolean;
  children: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  useDialogFocus(containerRef, titleRef, undefined, walk ? { walkTabs: true } : undefined);
  return (
    <div ref={containerRef} role="dialog" aria-modal="true" data-testid={testId}>
      <h2 ref={titleRef} tabIndex={-1} data-testid={`${testId}-title`}>
        Title
      </h2>
      {children}
    </div>
  );
}

/**
 * CrewRowActions' reset confirm (components/admin/wizard/CrewRowActions.tsx:157-180):
 * its own two-stop Tab trap, a React handler that reads `document.activeElement`
 * and moves focus between Cancel and Confirm. While a reset runs, both buttons
 * are disabled, the group itself holds focus, and the handler swallows Tab.
 */
function ConfirmPopover({ resolving = false }: { resolving?: boolean }) {
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const goRef = useRef<HTMLButtonElement | null>(null);
  return (
    <div
      role="group"
      tabIndex={-1}
      data-testid="confirm"
      onKeyDown={(e) => {
        if (e.key !== "Tab") return;
        e.preventDefault();
        if (resolving) {
          e.stopPropagation();
          return;
        }
        (document.activeElement === cancelRef.current ? goRef.current : cancelRef.current)?.focus();
      }}
    >
      <button type="button" ref={cancelRef} disabled={resolving} data-testid="cancel">
        Cancel
      </button>
      <button type="button" ref={goRef} disabled={resolving} data-testid="go">
        Confirm reset
      </button>
    </div>
  );
}

const active = () => (document.activeElement as HTMLElement | null)?.dataset.testid ?? null;

/** Press Tab (or Shift+Tab) on whatever holds focus; returns whether anything cancelled it. */
function tab(shift = false): boolean {
  const target = document.activeElement ?? document.body;
  return !fireEvent.keyDown(target, { key: "Tab", shiftKey: shift });
}

describe("default mode: main's trap, acting only at its two ends", () => {
  test("default: a Tab between the ends is the browser's, Tab from the last stop wraps to the first, Shift+Tab from the first to the last", () => {
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
    // From the tabindex=-1 title (not a stop) and from a middle stop, both
    // directions: left to the browser, uncancelled and unmoved.
    expect(tab(), "Tab from the title").toBe(false);
    expect(active()).toBe("d-title");
    screen.getByTestId("link").focus();
    expect(tab(), "Tab from a middle stop").toBe(false);
    expect(active()).toBe("link");
    expect(tab(true), "Shift+Tab from a middle stop").toBe(false);
    expect(active()).toBe("link");
    // The two ends wrap.
    screen.getByTestId("report").focus();
    expect(tab(), "Tab from the last stop").toBe(true);
    expect(active()).toBe("close");
    expect(tab(true), "Shift+Tab from the first stop").toBe(true);
    expect(active()).toBe("report");
  });

  test("default: a closed disclosure's summary and the stop below it hand Tab to the browser (R2-F1, the review modals' Ignored and Accepted folds)", () => {
    render(
      <Dialog testId="d">
        <button type="button" data-testid="close">
          Close
        </button>
        <details>
          <summary data-testid="summary">Ignored (1)</summary>
          <button type="button" data-testid="un-ignore">
            Un-ignore
          </button>
        </details>
        <button type="button" data-testid="next">
          Next card
        </button>
        <button type="button" data-testid="last">
          Last
        </button>
      </Dialog>,
    );
    // PREMISE: the model hides the closed disclosure's contents from focus.
    screen.getByTestId("un-ignore").focus();
    expect(active(), "focus() inside a closed disclosure does nothing").toBe("d-title");

    screen.getByTestId("summary").focus();
    expect(tab(), "Tab from the summary").toBe(false);
    expect(active()).toBe("summary");
    screen.getByTestId("next").focus();
    expect(tab(true), "Shift+Tab from the stop below the disclosure").toBe(false);
    expect(active()).toBe("next");
  });

  test("default: a child's own Tab handler between the ends keeps control (R2-F2, CrewRowActions' reset confirm)", () => {
    render(
      <Dialog testId="d">
        <button type="button" data-testid="close">
          Close
        </button>
        <button type="button" data-testid="trigger">
          More actions
        </button>
        <ConfirmPopover />
        <button type="button" data-testid="next-row">
          Next row
        </button>
      </Dialog>,
    );
    screen.getByTestId("cancel").focus();
    tab();
    expect(active(), "Tab from Cancel").toBe("go");
    tab();
    expect(active(), "Tab from Confirm reset").toBe("cancel");
    tab(true);
    expect(active(), "Shift+Tab from Cancel").toBe("go");
  });

  test("default: while a reset runs, the confirm's own handler holds focus on the popover (R2-F2)", () => {
    render(
      <Dialog testId="d">
        <button type="button" data-testid="close">
          Close
        </button>
        <ConfirmPopover resolving />
        <button type="button" data-testid="next-row">
          Next row
        </button>
      </Dialog>,
    );
    screen.getByTestId("confirm").focus();
    tab();
    expect(active(), "Tab while resolving").toBe("confirm");
    tab(true);
    expect(active(), "Shift+Tab while resolving").toBe("confirm");
  });
});

describe("walk mode (walkTabs, the crew section sheet): the hook moves focus on every Tab", () => {
  test("walk: from the tabindex=-1 title focused on open, Tab goes to the first stop and Shift+Tab to the last", () => {
    render(
      <Dialog testId="d" walk>
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
      <Dialog testId="d" walk>
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
      <Dialog testId="d" walk>
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

  test("walk: a dialog nested inside the sheet keeps its own ends, and the walk carries the Tabs between them", () => {
    render(
      <Dialog testId="outer" walk>
        <button type="button" data-testid="outer-close">
          Close
        </button>
        <Dialog testId="inner">
          <button type="button" data-testid="inner-a">
            A
          </button>
          <button type="button" data-testid="inner-m">
            M
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
    screen.getByTestId("inner-b").focus();
    tab();
    expect(active(), "the inner dialog's end wraps within itself, one move").toBe("inner-a");
    tab(true);
    expect(active(), "and back").toBe("inner-b");
    tab(true);
    expect(active(), "between the inner ends, the sheet's walk moves focus").toBe("inner-m");
    tab();
    expect(active()).toBe("inner-b");
  });
});
