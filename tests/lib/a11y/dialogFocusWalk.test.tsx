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
import { createPortal } from "react-dom";
import { useDialogFocus } from "@/lib/a11y/dialogFocus";

// The browser, as measured (Chromium and WebKit, Playwright 1.59). jsdom
// computes no layout, so `offsetParent` is null everywhere and the hook would
// see no stops: any attached element "has layout" here (its offsetParent is its
// parent element). That includes the contents of a CLOSED <details>, because
// that is what both engines report for them (offsetParent BODY, tabIndex 0).
// What tells a closed disclosure apart in a browser is that focus() on its
// contents does nothing; jsdom would move focus there, so the model refuses it.
// The reverse for media with controls: both engines focus a `video[controls]`
// or `audio[controls]` (WebKit reporting tabIndex -1 while it does, as it does
// for an editing host), and jsdom refuses, so the model lets it through.
const originalOffsetParent = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetParent");
const originalFocus = HTMLElement.prototype.focus;
/** Every focus() the model refused for a closed disclosure's contents. */
let refusedInDisclosure: HTMLElement[] = [];

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
  refusedInDisclosure = [];
  Object.defineProperty(HTMLElement.prototype, "offsetParent", {
    configurable: true,
    get(this: HTMLElement) {
      return this.parentElement;
    },
  });
  HTMLElement.prototype.focus = function focus(this: HTMLElement, options?: FocusOptions) {
    if (inClosedDisclosure(this)) {
      refusedInDisclosure.push(this);
      return;
    }
    if (this instanceof HTMLMediaElement && this.controls && !this.hasAttribute("tabindex")) {
      // jsdom focuses only what it deems a focusable area; a tabindex makes it
      // one for the call, and focus stays once the attribute is gone.
      this.setAttribute("tabindex", "-1");
      originalFocus.call(this, options);
      this.removeAttribute("tabindex");
      return;
    }
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

/**
 * A dialog whose initial focus is a `tabindex="-1"` title, as the crew sheet's
 * is. `portal` mounts it in `document.body`, as ReviewModalShell does: React
 * then dispatches its handlers from <body> instead of the root container.
 */
function Dialog({
  testId,
  walk = false,
  portal = false,
  children,
}: {
  testId: string;
  walk?: boolean;
  portal?: boolean;
  children: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  useDialogFocus(containerRef, titleRef, undefined, walk ? { walkTabs: true } : undefined);
  const dialog = (
    <div ref={containerRef} role="dialog" aria-modal="true" data-testid={testId}>
      <h2 ref={titleRef} tabIndex={-1} data-testid={`${testId}-title`}>
        Title
      </h2>
      {children}
    </div>
  );
  return portal ? createPortal(dialog, document.body) : dialog;
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

/** Lets a task run: the walk settles a Tab it left to the browser after the browser's own move. */
const settle = () => new Promise<void>((resolve) => window.setTimeout(resolve, 0));

/** The browser's own Tab from a player, as WebKit's is (measured): focus lands on <body>. */
async function landOnBody(): Promise<void> {
  const el = document.activeElement as HTMLElement | null;
  if (el !== null && el !== document.body) {
    // jsdom blurs only what it deems focusable, which a player is not (above).
    const marked = el.hasAttribute("tabindex");
    if (!marked) el.setAttribute("tabindex", "-1");
    el.blur();
    if (!marked) el.removeAttribute("tabindex");
  }
  // PREMISE: the browser's move left focus on <body>.
  expect(document.activeElement).toBe(document.body);
  await settle();
}

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

  test("walk: a closed disclosure is one stop, its summary; its contents become stops when it opens (R2-F1)", () => {
    render(
      <Dialog testId="d" walk>
        <button type="button" data-testid="close">
          Close
        </button>
        <details data-testid="fold">
          <summary data-testid="summary">Ignored (1)</summary>
          <button type="button" data-testid="un-ignore">
            Un-ignore
          </button>
          <a href="#x" data-testid="in-link">
            Open in sheet
          </a>
        </details>
        {/* A closed disclosure hides a nested one whole, summary included. */}
        <details>
          <summary data-testid="outer-summary">2 more</summary>
          <details open>
            <summary data-testid="nested-summary">Nested</summary>
            <button type="button" data-testid="nested-button">
              Nested
            </button>
          </details>
        </details>
        <button type="button" data-testid="next">
          Next card
        </button>
      </Dialog>,
    );
    // PREMISE: the model hides the closed disclosure's contents from focus.
    screen.getByTestId("un-ignore").focus();
    expect(active(), "focus() inside a closed disclosure does nothing").toBe("d-title");
    refusedInDisclosure = [];

    screen.getByTestId("close").focus();
    const forward: (string | null)[] = [];
    for (let i = 0; i < 4; i++) {
      tab();
      forward.push(active());
    }
    expect(forward).toEqual(["summary", "outer-summary", "next", "close"]);
    const back: (string | null)[] = [];
    for (let i = 0; i < 4; i++) {
      tab(true);
      back.push(active());
    }
    expect(back).toEqual(["next", "outer-summary", "summary", "close"]);
    // Not stops at all, not stops the walk tried and passed over.
    expect(refusedInDisclosure.map((el) => el.dataset.testid ?? el.tagName)).toEqual([]);

    (screen.getByTestId("fold") as HTMLDetailsElement).open = true;
    screen.getByTestId("summary").focus();
    const opened: (string | null)[] = [];
    for (let i = 0; i < 3; i++) {
      tab();
      opened.push(active());
    }
    expect(opened).toEqual(["un-ignore", "in-link", "outer-summary"]);
  });

  // React 19 dispatches every onKeyDown from the root container (or, for a
  // portal, its container), an ancestor of the dialog. A trap listening on the
  // dialog itself therefore moved focus BEFORE a child's own Tab handler ran,
  // and the handler then read an activeElement that had already moved.
  for (const portal of [false, true]) {
    const where = portal ? "portaled to <body>" : "in the root";
    test(`walk: a child's own Tab handler keeps control, ${where} (R2-F2)`, () => {
      render(
        <Dialog testId="d" walk portal={portal}>
          <button type="button" data-testid="close">
            Close
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
      // A Tab no child handles is still the walk's.
      screen.getByTestId("close").focus();
      expect(tab(), "the walk takes an unhandled Tab").toBe(true);
      expect(active()).toBe("cancel");
    });

    test(`walk: while a reset runs, the child's handler holds focus on its popover, ${where} (R2-F2)`, () => {
      render(
        <Dialog testId="d" walk portal={portal}>
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
  }

  test("walk: media with controls, a frame and an editing host are stops; media without controls and a non-editable region are not (R2-F3)", async () => {
    render(
      <Dialog testId="d" walk>
        <button type="button" data-testid="close">
          Close
        </button>
        {/* The Gear section's opening reel (components/tiles/OpeningReelVideo.tsx). */}
        <video controls preload="none" data-testid="reel" />
        <video preload="none" data-testid="silent" />
        <audio controls preload="none" data-testid="clip" />
        <iframe title="Frame" data-testid="frame" />
        <div contentEditable suppressContentEditableWarning data-testid="editable">
          Notes
        </div>
        <div contentEditable={false} data-testid="not-editable">
          Read only
        </div>
        <button type="button" data-testid="last">
          Last
        </button>
      </Dialog>,
    );
    // PREMISE: each stop takes focus here, as in both engines.
    for (const id of ["reel", "clip", "frame", "editable"]) {
      screen.getByTestId(id).focus();
      expect(active(), `${id} takes focus`).toBe(id);
    }
    // A Tab on a player, or a Shift+Tab onto one, is the browser's (the next
    // case); here the browser's move lands on <body>, as WebKit's plain Tab
    // does, so the walk's own order shows.
    const step = async (shift = false) => {
      if (!tab(shift)) await landOnBody();
      return active();
    };
    screen.getByTestId("close").focus();
    const forward: (string | null)[] = [];
    for (let i = 0; i < 6; i++) forward.push(await step());
    expect(forward).toEqual(["reel", "clip", "frame", "editable", "last", "close"]);
    const back: (string | null)[] = [];
    for (let i = 0; i < 6; i++) back.push(await step(true));
    expect(back).toEqual(["last", "editable", "frame", "clip", "reel", "close"]);
  });

  // Whole-diff review round 2, 2A-2. A player's own controls are the browser's:
  // Chromium's are a closed shadow tree behind the <video> (measured, Playwright
  // 1.59: from the element, six more Tabs stay on it, then the next control;
  // Space plays, as does Tab then Enter on its play button), and WebKit's are
  // reached with Option+Tab (one more stop on it, Enter plays). The walk used to
  // cancel every Tab on the player and move past it, so none of those controls
  // could be reached. Now a Tab on a player, and a Shift+Tab onto one, go to the
  // browser; once focus leaves the player the walk puts it on its own next stop
  // (WebKit's plain Tab from a player lands on <body>).
  test("walk: on a player with controls, Tab and Shift+Tab are the browser's while focus stays in it, and the walk takes over once focus leaves it (round 2, 2A-2)", async () => {
    render(
      <Dialog testId="d" walk>
        <button type="button" data-testid="close">
          Close
        </button>
        <video controls preload="none" data-testid="reel" />
        <button type="button" data-testid="last">
          Last
        </button>
      </Dialog>,
    );
    const reel = screen.getByTestId("reel");

    // Into the player: the walk's own Tab, onto the element, as Chromium's is.
    screen.getByTestId("close").focus();
    expect(tab(), "the walk takes the Tab onto the player").toBe(true);
    expect(active()).toBe("reel");

    // On the player: the browser's, so its controls are reached. Focus stays on
    // the element while it moves among them, and the walk leaves it there.
    for (const shift of [false, true]) {
      reel.focus();
      expect(tab(shift), `${shift ? "Shift+Tab" : "Tab"} on the player is the browser's`).toBe(
        false,
      );
      await settle();
      expect(active(), "still in the player's controls").toBe("reel");
    }

    // Leaving it forward: wherever the browser put focus, the walk's next stop.
    reel.focus();
    tab();
    await landOnBody(); // WebKit's own Tab from a player
    expect(active()).toBe("last");
    reel.focus();
    tab();
    screen.getByTestId("last").focus(); // Chromium's, already the walk's stop
    await settle();
    expect(active()).toBe("last");

    // Leaving it backward, from its first control.
    reel.focus();
    tab(true);
    await landOnBody();
    expect(active()).toBe("close");

    // Onto the player backward: the browser's Shift+Tab, which lands on the
    // player's last control (Chromium); anywhere else, the walk puts it on the player.
    screen.getByTestId("last").focus();
    expect(tab(true), "Shift+Tab onto the player is the browser's").toBe(false);
    await landOnBody();
    expect(active()).toBe("reel");
    screen.getByTestId("last").focus();
    tab(true);
    reel.focus(); // the browser's own landing, on the player
    await settle();
    expect(active()).toBe("reel");

    // Away from players, every Tab is still the walk's.
    screen.getByTestId("last").focus();
    expect(tab(), "the walk takes a Tab between buttons").toBe(true);
    expect(active()).toBe("close");
  });

  // The class R2-F1 belongs to: a stop the walk accepts while focus() on it does
  // nothing. A closed disclosure's contents are filtered out by name; a control
  // in a disabled fieldset (measured: tabIndex 0, an offsetParent, focus()
  // refused in both engines) or an editable region nested in another editing
  // host is the same shape, and the walk must pass over it rather than hold.
  test("walk: a stop that refuses focus is passed over in both directions, never held", () => {
    render(
      <Dialog testId="d" walk>
        <button type="button" data-testid="close">
          Close
        </button>
        <fieldset disabled>
          <button type="button" data-testid="locked">
            Locked
          </button>
        </fieldset>
        <button type="button" data-testid="next">
          Next
        </button>
      </Dialog>,
    );
    // PREMISE: the locked control refuses focus, as it does in both engines.
    screen.getByTestId("locked").focus();
    expect(active(), "focus() in a disabled fieldset does nothing").toBe("d-title");

    screen.getByTestId("close").focus();
    const forward: (string | null)[] = [];
    for (let i = 0; i < 2; i++) {
      tab();
      forward.push(active());
    }
    expect(forward).toEqual(["next", "close"]);
    const back: (string | null)[] = [];
    for (let i = 0; i < 2; i++) {
      tab(true);
      back.push(active());
    }
    expect(back).toEqual(["next", "close"]);
  });

  // The walk listens on `window`, so it hears Tabs from anywhere on the page. A
  // dialog opened from the sheet but portaled outside it (as the admin review
  // modal's unsaved-readings prompt is portaled) owns its own Tabs.
  test("walk: a Tab outside the sheet's dialog is not the walk's, even in a dialog opened over it", () => {
    render(
      <Dialog testId="sheet" walk>
        <button type="button" data-testid="sheet-close">
          Close
        </button>
        <Dialog testId="prompt" portal>
          <button type="button" data-testid="prompt-a">
            A
          </button>
          <button type="button" data-testid="prompt-m">
            M
          </button>
          <button type="button" data-testid="prompt-b">
            B
          </button>
        </Dialog>
      </Dialog>,
    );
    // PREMISE: the prompt is outside the sheet's DOM, though inside its React tree.
    expect(screen.getByTestId("sheet").contains(screen.getByTestId("prompt"))).toBe(false);
    screen.getByTestId("prompt-m").focus();
    expect(tab(), "a middle Tab in the prompt is the browser's").toBe(false);
    expect(active()).toBe("prompt-m");
    screen.getByTestId("prompt-b").focus();
    expect(tab(), "the prompt's own end wraps").toBe(true);
    expect(active()).toBe("prompt-a");
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
