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
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
