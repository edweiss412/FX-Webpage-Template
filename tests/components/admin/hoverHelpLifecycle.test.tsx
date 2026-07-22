// @vitest-environment jsdom
/**
 * tests/components/admin/hoverHelpLifecycle.test.tsx
 *
 * Spec 2026-07-22-hoverhelp-smart-position §4.3 lifecycle contract (u1-u7)
 * plus the stubbed-rect behavioral geometry suite (§4.2 shell steps a-d:
 * conversion, hidden recovery, attribute lifecycle). jsdom computes no real
 * layout, so element rects are stubbed per element; everything geometric
 * beyond these stubs lives in the real-browser suites.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { HoverHelp, PopoverHostContext } from "@/components/admin/HoverHelp";

type FrameCb = (t: number) => void;
let frames: Map<number, FrameCb>;
let nextId: number;
let cancelled: number[];
let observed: Element[];
let unobserved: Element[];

beforeEach(() => {
  frames = new Map();
  nextId = 1;
  cancelled = [];
  observed = [];
  unobserved = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameCb): number => {
    const id = nextId++;
    frames.set(id, cb);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number): void => {
    cancelled.push(id);
    frames.delete(id);
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe(el: Element) {
        observed.push(el);
      }
      unobserve(el: Element) {
        unobserved.push(el);
      }
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  // Codex R2 F8: a fake-timer test failing BEFORE its own vi.useRealTimers()
  // must not leave later tests under fake timers.
  vi.useRealTimers();
});

const runPendingFrames = () => {
  const pending = [...frames.values()];
  frames.clear();
  for (const cb of pending) cb(0);
};

function mount() {
  render(
    <HoverHelp label="Help: lifecycle" testId="lc">
      <p>body</p>
    </HoverHelp>,
  );
  return screen.getByTestId("lc-trigger");
}

/** Non-body-host fixture for the scrolled-host conversion test. */
function PaneHarness() {
  const paneRef = useRef<HTMLDivElement | null>(null);
  return (
    <div ref={paneRef} data-testid="pane-host" style={{ overflowY: "auto", height: 300 }}>
      <PopoverHostContext.Provider value={paneRef}>
        <HoverHelp label="Help: pane" testId="ph">
          <p>body</p>
        </HoverHelp>
      </PopoverHostContext.Provider>
    </div>
  );
}

test("u3: open measures synchronously — no frame requested by the open path", () => {
  const trigger = mount();
  fireEvent.click(trigger);
  expect(frames.size).toBe(0);
});

test("u4: scroll while CLOSED requests no frame", () => {
  mount();
  fireEvent.scroll(window);
  expect(frames.size).toBe(0);
});

test("u5: coalescing — many scrolls, one frame; id cleared after run", () => {
  const trigger = mount();
  fireEvent.click(trigger);
  fireEvent.scroll(window);
  fireEvent.scroll(window);
  fireEvent.scroll(window);
  expect(frames.size).toBe(1);
  runPendingFrames();
  fireEvent.scroll(window);
  expect(frames.size).toBe(1); // a NEW frame could be scheduled → id was cleared
});

test("u1: close with a frame pending cancels it", () => {
  const trigger = mount();
  fireEvent.click(trigger);
  fireEvent.scroll(window);
  expect(frames.size).toBe(1);
  const pendingId = [...frames.keys()][0];
  fireEvent.click(trigger); // toggle closed
  expect(cancelled).toContain(pendingId);
});

test("u2: unmount with a frame pending cancels it without error", () => {
  const trigger = mount();
  fireEvent.click(trigger);
  fireEvent.scroll(window);
  const pendingId = [...frames.keys()][0];
  cleanup();
  expect(cancelled).toContain(pendingId);
});

test("u6: trigger button and body and host are observed while open", () => {
  const trigger = mount();
  fireEvent.click(trigger);
  const body = screen.getByTestId("lc-body");
  expect(observed).toContain(trigger);
  expect(observed).toContain(body);
  expect(observed).toContain(document.body); // host (no provider → body)
});

test("u7: close detaches trigger, body AND host observations specifically", () => {
  const trigger = mount();
  fireEvent.click(trigger);
  const body = screen.getByTestId("lc-body");
  fireEvent.click(trigger);
  expect(unobserved).toContain(trigger);
  expect(unobserved).toContain(body);
  expect(unobserved).toContain(document.body);
});

/**
 * Behavioral geometry: jsdom rects stubbed per element, so the full
 * measure-and-apply path (bounds, conversion, constraints, hidden recovery,
 * data attributes) is asserted here, not only in e2e.
 */
describe("measure-and-apply with stubbed rects", () => {
  const stubRect = (
    el: Element,
    r: { left: number; top: number; width: number; height: number },
  ) => {
    Object.defineProperty(el, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        ...r,
        right: r.left + r.width,
        bottom: r.top + r.height,
        x: r.left,
        y: r.top,
        toJSON: () => "",
      }),
    });
  };
  const stubViewport = (w: number, h: number) => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: w });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: h });
  };

  test("body-host conversion writes viewport+scroll coords synchronously on open (u3 strengthened)", () => {
    stubViewport(1000, 800);
    Object.defineProperty(window, "scrollX", { configurable: true, value: 0 });
    Object.defineProperty(window, "scrollY", { configurable: true, value: 250 });
    const trigger = mount();
    stubRect(trigger, { left: 500, top: 300, width: 20, height: 20 });
    stubRect(document.body, { left: 0, top: -250, width: 1000, height: 3000 });
    const body = screen.getByTestId("lc-body");
    stubRect(body, { left: 0, top: 0, width: 288, height: 200 });
    fireEvent.click(trigger);
    expect(frames.size).toBe(0); // synchronous: no frame requested by the open path
    expect(body.style.top).toBe(`${320 + 6 + 250}px`); // trigger.bottom + GAP + scrollY
    expect(body.getAttribute("data-popover-side")).toBe("bottom");
  });

  test("SCROLLING non-body host adds its scroll offsets to the conversion", () => {
    stubViewport(1000, 800);
    render(<PaneHarness />);
    const trigger = screen.getByTestId("ph-trigger");
    const pane = screen.getByTestId("pane-host");
    Object.defineProperty(pane, "scrollTop", { configurable: true, value: 120 });
    Object.defineProperty(pane, "scrollLeft", { configurable: true, value: 40 });
    Object.defineProperty(pane, "clientTop", { configurable: true, value: 0 });
    Object.defineProperty(pane, "clientLeft", { configurable: true, value: 0 });
    stubRect(pane, { left: 100, top: 100, width: 400, height: 300 });
    stubRect(trigger, { left: 150, top: 150, width: 20, height: 20 });
    const body = screen.getByTestId("ph-body");
    stubRect(body, { left: 0, top: 0, width: 288, height: 100 });
    fireEvent.click(trigger);
    // vy = trigger.bottom + GAP = 176; top = 176 - 100(host top) - 0(border) + 120(scrollTop) = 196
    expect(body.style.top).toBe("196px");
    // align left (default): vx = trigger.left = 150 -> clamp into [108, 492-288=204] -> 150
    // left = 150 - 100(host left) - 0(border) + 40(scrollLeft) = 90
    expect(body.style.left).toBe("90px");
  });

  test("anchor-gone with focus INSIDE the body closes and refocuses the trigger (WCAG 2.4.7)", () => {
    stubViewport(1000, 800);
    render(
      <HoverHelp label="Help: rescue" testId="fr" learnMore={{ href: "/help/x" }}>
        <p>body</p>
      </HoverHelp>,
    );
    const trigger = screen.getByTestId("fr-trigger");
    stubRect(trigger, { left: 500, top: 300, width: 20, height: 20 });
    stubRect(document.body, { left: 0, top: 0, width: 1000, height: 800 });
    const body = screen.getByTestId("fr-body");
    stubRect(body, { left: 0, top: 0, width: 288, height: 200 });
    fireEvent.click(trigger);
    const link = body.querySelector("a");
    if (!link) throw new Error("learn-more link missing");
    (link as HTMLElement).focus();
    stubRect(trigger, { left: 500, top: -900, width: 20, height: 20 }); // scrolled out
    fireEvent.scroll(window);
    act(() => runPendingFrames()); // the rescue path calls setOpen(false) inside the frame
    // NOT hidden-around-the-user: popover closed, focus handed back.
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
    expect(body.hasAttribute("data-popover-hidden")).toBe(false);
  });

  test("anchor-gone hides, clears side attribute, and recovers", () => {
    stubViewport(1000, 800);
    const trigger = mount();
    stubRect(trigger, { left: 500, top: 300, width: 20, height: 20 });
    stubRect(document.body, { left: 0, top: 0, width: 1000, height: 800 });
    const body = screen.getByTestId("lc-body");
    stubRect(body, { left: 0, top: 0, width: 288, height: 200 });
    fireEvent.click(trigger);
    expect(body.getAttribute("data-popover-side")).toBe("bottom");
    stubRect(trigger, { left: 500, top: -900, width: 20, height: 20 }); // scrolled out
    fireEvent.scroll(window);
    runPendingFrames();
    expect(body.style.visibility).toBe("hidden");
    expect(body.getAttribute("data-popover-hidden")).toBe("true");
    expect(body.hasAttribute("data-popover-side")).toBe(false); // stale side cleared
    stubRect(trigger, { left: 500, top: 300, width: 20, height: 20 }); // back
    fireEvent.scroll(window);
    runPendingFrames();
    expect(body.style.visibility).toBe("");
    expect(body.getAttribute("data-popover-side")).toBe("bottom");
  });

  test("close clears BOTH placement attributes", () => {
    stubViewport(1000, 800);
    const trigger = mount();
    stubRect(trigger, { left: 500, top: 300, width: 20, height: 20 });
    stubRect(document.body, { left: 0, top: 0, width: 1000, height: 800 });
    const body = screen.getByTestId("lc-body");
    stubRect(body, { left: 0, top: 0, width: 288, height: 200 });
    fireEvent.click(trigger);
    fireEvent.click(trigger);
    expect(body.hasAttribute("data-popover-side")).toBe(false);
    expect(body.hasAttribute("data-popover-hidden")).toBe(false);
  });
});

describe("dismissal focus + tab-order lifecycle (codex R1 F1/F2)", () => {
  function mountWithLinkOpen() {
    render(
      <HoverHelp label="Help: dismissal" testId="dm" learnMore={{ href: "/help/x" }}>
        <p>body</p>
      </HoverHelp>,
    );
    const trigger = screen.getByTestId("dm-trigger");
    fireEvent.click(trigger);
    const body = screen.getByTestId("dm-body");
    const link = body.querySelector("a");
    if (!link) throw new Error("learn-more link missing");
    return { trigger, body, link: link as HTMLElement };
  }

  test("F1: hover-close is not scheduled while focus is inside the body", () => {
    vi.useFakeTimers();
    const { trigger, link } = mountWithLinkOpen();
    link.focus();
    const root = trigger.closest("div");
    if (!root) throw new Error("no root");
    fireEvent.pointerLeave(root, { pointerType: "mouse" }); // would schedule close
    vi.advanceTimersByTime(300); // past CLOSE_DELAY_MS
    expect(trigger.getAttribute("aria-expanded")).toBe("true"); // still open
    vi.useRealTimers();
  });

  test("F1: a pending hover-close does not fire if focus arrives during the window", () => {
    vi.useFakeTimers();
    const { trigger, link } = mountWithLinkOpen();
    const root = trigger.closest("div");
    if (!root) throw new Error("no root");
    fireEvent.pointerLeave(root, { pointerType: "mouse" }); // schedules close (no focus yet)
    link.focus(); // focus arrives inside the 120ms window
    vi.advanceTimersByTime(300);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    vi.useRealTimers();
  });

  test("F1: Escape with focus inside the body restores focus to the trigger", () => {
    const { trigger, link } = mountWithLinkOpen();
    link.focus();
    fireEvent.keyDown(link, { key: "Escape" }); // containment path (root handler)
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  });

  test("F2: learn-more link is out of tab order while closed, in while open", () => {
    // Real rects so the open measure lands VISIBLE (jsdom's default all-zero
    // rects read as a degenerate anchor -> hidden -> tabindex stays -1, which
    // is itself correct but not what this test pins).
    const stub = (el: Element, r: { left: number; top: number; width: number; height: number }) =>
      Object.defineProperty(el, "getBoundingClientRect", {
        configurable: true,
        value: () => ({
          ...r,
          right: r.left + r.width,
          bottom: r.top + r.height,
          x: r.left,
          y: r.top,
          toJSON: () => "",
        }),
      });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1000 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
    render(
      <HoverHelp label="Help: taborder" testId="to" learnMore={{ href: "/help/x" }}>
        <p>body</p>
      </HoverHelp>,
    );
    const trigger = screen.getByTestId("to-trigger");
    const body = screen.getByTestId("to-body");
    stub(trigger, { left: 500, top: 300, width: 20, height: 20 });
    stub(document.body, { left: 0, top: 0, width: 1000, height: 800 });
    stub(body, { left: 0, top: 0, width: 288, height: 200 });
    const link = body.querySelector("a") as HTMLElement;
    expect(link.getAttribute("tabindex")).toBe("-1"); // closed
    fireEvent.click(trigger);
    expect(link.getAttribute("tabindex")).toBe("0"); // open + visible
    fireEvent.click(trigger);
    expect(link.getAttribute("tabindex")).toBe("-1"); // closed again
  });
});

describe("tab bridge (body host only, learnMore set — spec §4.5)", () => {
  function mountWithLink() {
    render(
      <HoverHelp label="Help: bridge" testId="br" learnMore={{ href: "/help/x" }}>
        <p>body</p>
      </HoverHelp>,
    );
    const trigger = screen.getByTestId("br-trigger");
    fireEvent.click(trigger);
    const body = screen.getByTestId("br-body");
    const link = body.querySelector("a");
    if (!link) throw new Error("learn-more link missing");
    return { trigger, link: link as HTMLElement };
  }

  test("Tab on trigger moves focus to the link and clears a pending close timer", () => {
    vi.useFakeTimers();
    const { trigger, link } = mountWithLink();
    const root = trigger.closest("div");
    if (!root) throw new Error("no root");
    fireEvent.pointerLeave(root, { pointerType: "mouse" }); // stage pending close
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "Tab" });
    expect(document.activeElement).toBe(link);
    vi.advanceTimersByTime(300); // past CLOSE_DELAY_MS
    expect(trigger.getAttribute("aria-expanded")).toBe("true"); // timer was cleared
    vi.useRealTimers();
  });

  test("Tab on link closes popover and returns focus to trigger (declared double-visit)", () => {
    const { trigger, link } = mountWithLink();
    link.focus();
    fireEvent.keyDown(link, { key: "Tab" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  });

  test("Shift+Tab on link returns focus to trigger, popover stays open", () => {
    const { trigger, link } = mountWithLink();
    link.focus();
    fireEvent.keyDown(link, { key: "Tab", shiftKey: true });
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(trigger);
  });

  test("focusin on the body clears a pending close timer", () => {
    vi.useFakeTimers();
    const { trigger, link } = mountWithLink();
    const root = trigger.closest("div");
    if (!root) throw new Error("no root");
    fireEvent.pointerLeave(root, { pointerType: "mouse" });
    fireEvent.focusIn(link);
    vi.advanceTimersByTime(300);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    vi.useRealTimers();
  });

  test("bridge is OFF inside a provided host (dialog owns Tab)", () => {
    render(<PaneHarness />);
    const trigger = screen.getByTestId("ph-trigger");
    fireEvent.click(trigger);
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "Tab" });
    // no preventDefault path: focus NOT programmatically moved to the link
    expect(document.activeElement).toBe(trigger);
  });
});
