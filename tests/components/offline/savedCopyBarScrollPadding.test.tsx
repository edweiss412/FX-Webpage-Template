// @vitest-environment jsdom
/**
 * <SavedCopyBar>'s scroll padding (WCAG 2.4.11 Focus Not Obscured): while the
 * visible bar shows, `<html>` carries `scroll-padding-top` equal to the bar's
 * live region, so a control the keyboard focuses scrolls out from under the
 * sticky bar instead of landing behind it. The height follows the region
 * through a ResizeObserver (copy and width change it), and the padding goes
 * when the bar hides and when the bar unmounts.
 *
 * jsdom lays nothing out, so the region's height is a stub and the observer is
 * a fake whose callback the test fires. What a real browser does with the
 * padding is tests/e2e/crew-offline-layout.spec.ts case 7.
 *
 * Failure modes caught: no padding while the bar shows; a padding that keeps
 * the first height after the bar grows; a padding left behind after the bar
 * hides or unmounts, which would offset every later scroll on the page; a
 * padding set while nothing shows; and a crash where ResizeObserver is absent.
 */
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi, type MockInstance } from "vitest";

import { SavedCopyBar, type SavedCopyBarProps } from "@/components/offline/SavedCopyBar";
import { premiseHolds } from "@/tests/_shared/premise";

const NOW_MS = Date.parse("2026-10-27T12:00:00.000Z");
const RENDERED_AT = "2026-10-27T11:59:00.000Z";

const PROPS: SavedCopyBarProps = {
  renderedAt: RENDERED_AT,
  sheetUnavailable: false,
  slug: "demo-show",
  shareToken: "abc123",
};

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  readonly observed: Element[] = [];
  disconnected = false;
  constructor(private readonly callback: ResizeObserverCallback) {
    FakeResizeObserver.instances.push(this);
  }
  observe(target: Element): void {
    this.observed.push(target);
  }
  unobserve(): void {}
  disconnect(): void {
    this.disconnected = true;
  }
  /** What the browser does after a layout that changed an observed box. */
  fire(): void {
    act(() => {
      this.callback([], this as unknown as ResizeObserver);
    });
  }
}

/** The height the region reports; every other element reports none. */
let regionHeight = 0;
let onLine: MockInstance<() => boolean>;

function scrollPaddingTop(): string {
  return document.documentElement.style.scrollPaddingTop;
}

function goOnline(value: boolean): void {
  onLine.mockReturnValue(value);
  act(() => {
    window.dispatchEvent(new Event(value ? "online" : "offline"));
  });
}

function region(): HTMLElement {
  const found = document.querySelector<HTMLElement>('[data-testid="saved-copy-bar-region"]');
  if (found === null) throw new Error("the bar's live region is not mounted");
  return found;
}

function barShows(): boolean {
  return document.querySelector('[data-testid="saved-copy-bar"]') !== null;
}

/** The one observer watching the region, and nothing else. */
function regionObserver(): FakeResizeObserver {
  const watching = FakeResizeObserver.instances.filter((o) => o.observed.includes(region()));
  expect(watching).toHaveLength(1);
  return watching[0]!;
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW_MS, toFake: ["Date"] });
  onLine = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true);
  FakeResizeObserver.instances = [];
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  regionHeight = 0;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    const height = this.dataset.testid === "saved-copy-bar-region" ? regionHeight : 0;
    return new DOMRect(0, 0, 390, height);
  });
  document.documentElement.style.removeProperty("scroll-padding-top");
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.documentElement.style.removeProperty("scroll-padding-top");
  document.documentElement.removeAttribute("data-fxav-bar");
});

describe("SavedCopyBar: scroll-padding-top follows the visible bar", () => {
  test("a hidden bar sets no padding and watches nothing", () => {
    regionHeight = 57;
    render(<SavedCopyBar {...PROPS} />);
    premiseHolds("the live, online page shows no bar", !barShows());
    expect(scrollPaddingTop()).toBe("");
    expect(FakeResizeObserver.instances).toEqual([]);
  });

  test("set: the bar showing puts the region's height on html", () => {
    regionHeight = 57;
    render(<SavedCopyBar {...PROPS} />);
    goOnline(false);
    premiseHolds("the bar shows once the phone is offline", barShows());
    expect(scrollPaddingTop()).toBe("57px");
    regionObserver();
  });

  test("update: the region growing moves the padding with it", () => {
    regionHeight = 57;
    render(<SavedCopyBar {...PROPS} />);
    goOnline(false);
    expect(scrollPaddingTop()).toBe("57px");

    regionHeight = 97;
    regionObserver().fire();
    expect(scrollPaddingTop()).toBe("97px");

    regionHeight = 36.5;
    regionObserver().fire();
    expect(scrollPaddingTop()).toBe("36.5px");
  });

  test("clear on hide: the bar going away removes the padding and stops watching", () => {
    regionHeight = 57;
    render(<SavedCopyBar {...PROPS} />);
    goOnline(false);
    const observer = regionObserver();
    expect(scrollPaddingTop()).toBe("57px");

    regionHeight = 0;
    goOnline(true);
    premiseHolds("the bar is hidden again", !barShows());
    expect(scrollPaddingTop()).toBe("");
    expect(observer.disconnected).toBe(true);

    // Showing again starts over, with the height of the moment.
    regionHeight = 77;
    goOnline(false);
    expect(scrollPaddingTop()).toBe("77px");
  });

  test("clear on unmount: the padding leaves with the bar", () => {
    regionHeight = 57;
    const { unmount } = render(<SavedCopyBar {...PROPS} />);
    goOnline(false);
    const observer = regionObserver();
    expect(scrollPaddingTop()).toBe("57px");

    unmount();
    expect(scrollPaddingTop()).toBe("");
    expect(observer.disconnected).toBe(true);
  });

  test("with no ResizeObserver the padding still follows the bar showing and hiding", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    regionHeight = 57;
    render(<SavedCopyBar {...PROPS} />);
    goOnline(false);
    expect(scrollPaddingTop()).toBe("57px");

    goOnline(true);
    expect(scrollPaddingTop()).toBe("");
  });
});
