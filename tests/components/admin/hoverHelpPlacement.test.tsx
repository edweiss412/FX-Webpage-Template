// @vitest-environment jsdom
/**
 * HoverHelp placement pins (scroll-clamp spec §5.4).
 * Family B: placement derives from the body's NATURAL size (a capped
 * measurement computes a wrong cap/position — the R3 live-core probe showed
 * stale vs natural placements at different coordinates).
 * Family C: the §4.5 self-origin filter — the body's own scroll events must
 * not schedule a re-place (the R5 perpetual-measure loop's fuel).
 *
 * jsdom computes no layout; rects are stubbed on the prototype, style-SENSITIVE
 * for the body so a measurement taken with a stale inline cap is observable.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HoverHelp } from "@/components/admin/HoverHelp";
import { premise, premiseHolds } from "../../_shared/premise";

const NATURAL_H = 900;
type StubRect = { left: number; top: number; width: number; height: number };
let triggerRect: StubRect;
const originalRect = Element.prototype.getBoundingClientRect;

function asDomRect(r: StubRect): DOMRect {
  return {
    x: r.left,
    y: r.top,
    left: r.left,
    top: r.top,
    width: r.width,
    height: r.height,
    right: r.left + r.width,
    bottom: r.top + r.height,
    toJSON: () => ({}),
  } as DOMRect;
}

type FrameCb = FrameRequestCallback;
let frames: FrameCb[] = [];
const flushFrames = () => {
  const queued = frames;
  frames = [];
  for (const cb of queued) cb(0);
};

beforeEach(() => {
  frames = [];
  triggerRect = { left: 100, top: 400, width: 24, height: 24 };
  Element.prototype.getBoundingClientRect = function (this: Element): DOMRect {
    const id = (this as HTMLElement).dataset?.["testid"];
    if (id === "ph-trigger") return asDomRect(triggerRect);
    if (id === "ph-body") {
      const cap = parseFloat((this as HTMLElement).style.maxHeight);
      const h = Number.isFinite(cap) ? Math.min(NATURAL_H, cap) : NATURAL_H;
      return asDomRect({ left: 0, top: 0, width: 288, height: h });
    }
    return originalRect.call(this);
  };
  vi.stubGlobal("requestAnimationFrame", ((cb: FrameCb) => {
    frames.push(cb);
    return frames.length;
  }) as typeof globalThis.requestAnimationFrame);
  vi.stubGlobal("cancelAnimationFrame", (() => {}) as typeof globalThis.cancelAnimationFrame);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  Element.prototype.getBoundingClientRect = originalRect;
  vi.unstubAllGlobals();
});

function openHelp(): { trigger: HTMLElement; body: HTMLElement } {
  render(
    <HoverHelp label="Help: placement" testId="ph">
      <p>body</p>
    </HoverHelp>,
  );
  const trigger = screen.getByTestId("ph-trigger");
  fireEvent.click(trigger);
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  return { trigger, body: screen.getByTestId("ph-body") };
}

describe("HoverHelp — natural-size measurement + self-origin filter (scroll-clamp spec §5.4)", () => {
  test("family B: after the trigger moves and room grows, the cap derives from the NATURAL height", () => {
    const { body } = openHelp();
    const cappedBefore = parseFloat(body.style.maxHeight);
    // PREMISE (own inputs): the open placement must cap the body, and the
    // natural height must exceed the viewport, or a stale measurement is
    // indistinguishable from a natural one below.
    premiseHolds("open placement caps the body", Number.isFinite(cappedBefore));
    premise("natural height exceeds the viewport", NATURAL_H, window.innerHeight);
    triggerRect = { left: 100, top: 8, width: 24, height: 24 };
    premiseHolds(
      "post-move room exceeds the stale cap",
      window.innerHeight - (triggerRect.top + triggerRect.height) > cappedBefore,
    );
    // A document-origin scroll re-places (HoverHelp has no scroll dismissal).
    document.dispatchEvent(new Event("scroll", { bubbles: false }));
    flushFrames();
    const cappedAfter = parseFloat(body.style.maxHeight);
    expect(
      Number.isFinite(cappedAfter),
      "a natural measurement still needs a cap (natural 900 > any room); a STALE " +
        "measurement fits under the grown room and drops the cap entirely",
    ).toBe(true);
    expect(
      cappedAfter,
      "the re-applied cap derives from the grown room (natural measure), not the stale cap",
    ).toBeGreaterThan(cappedBefore);
  });

  test("family C: body-origin scroll never schedules; document scroll still re-places", () => {
    const { body } = openHelp();
    frames = [];
    // Body-origin: MUST NOT schedule (spec §4.5) — the event the helper's
    // scroll-restore emits on every measurement of a scrolled body.
    body.dispatchEvent(new Event("scroll", { bubbles: false }));
    expect(frames.length, "body-origin scroll is ignored (self-origin filter)").toBe(0);
    // Document-origin: still schedules a re-place.
    document.dispatchEvent(new Event("scroll", { bubbles: false }));
    expect(frames.length, "document scroll still schedules a re-place").toBeGreaterThan(0);
  });
});
