// @vitest-environment jsdom
/**
 * tests/components/admin/previewBannerHeight.test.tsx: the admin preview banner
 * publishes its own height as `--preview-banner-h` on <html> (crew page
 * redesign invariant-8 audit P1-3, critique F3).
 *
 * The banner and the wide crew header were both sticky at top 0, so the banner
 * covered the header once the page scrolled. The header sticks at
 * `--crew-sticky-top` instead, which reads this property (app/globals.css), so
 * the property must track the banner's real height (it wraps at narrow widths)
 * and must leave <html> when the banner does, or the crew route would inherit a
 * stale offset after a client navigation out of the preview.
 */
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PreviewBanner } from "@/components/admin/PreviewBanner";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/",
}));

/** A ResizeObserver whose callbacks the test fires by hand. */
class ManualObserver {
  static all: ManualObserver[] = [];
  observed: Element[] = [];
  constructor(private readonly cb: ResizeObserverCallback) {
    ManualObserver.all.push(this);
  }
  observe(el: Element) {
    this.observed.push(el);
  }
  unobserve() {}
  disconnect() {
    this.observed = [];
  }
  fire() {
    this.cb([], this as unknown as ResizeObserver);
  }
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  ManualObserver.all = [];
  document.documentElement.style.removeProperty("--preview-banner-h");
  document.documentElement.style.removeProperty("--preview-banner-bottom");
});

function renderBanner() {
  return render(
    <PreviewBanner
      crewMemberName="Eric Weiss"
      crewMemberRoleLabel="A1"
      slug="spring-gala"
      showId="00000000-0000-4000-8000-000000000001"
      crewMemberId="00000000-0000-4000-8000-000000000002"
    />,
  );
}

describe("PreviewBanner publishes its height (audit P1-3)", () => {
  it("sets --preview-banner-h on <html> to the banner's height, follows a resize, and removes it on unmount", () => {
    vi.stubGlobal("ResizeObserver", ManualObserver);
    let height = 69;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      const h = this.dataset.testid === "admin-preview-banner" ? height : 0;
      return {
        top: 0,
        bottom: h,
        height: h,
        left: 0,
        right: 0,
        width: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect;
    });
    const { unmount } = renderBanner();
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--preview-banner-h")).toBe("69px");
    // It observes the banner itself, not some wrapper.
    const observer = ManualObserver.all[0]!;
    expect((observer.observed[0] as HTMLElement).dataset.testid).toBe("admin-preview-banner");

    height = 113; // the banner wrapped onto a second line
    act(() => observer.fire());
    expect(root.style.getPropertyValue("--preview-banner-h")).toBe("113px");

    unmount();
    expect(root.style.getPropertyValue("--preview-banner-h")).toBe("");
  });

  // Whole-diff review round 2, 2A-1: the compact section sheet is fixed to the
  // viewport under the banner, so its cap needs the banner's bottom edge, which
  // sits below the admin nav at the top of the page and rises as the page scrolls.
  it("sets --preview-banner-bottom to the banner's bottom edge, follows the scroll once a frame, and removes it on unmount", () => {
    vi.stubGlobal("ResizeObserver", ManualObserver);
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal("cancelAnimationFrame", () => {});
    let top = 89; // under the admin nav at the top of the page
    const reads = vi.fn();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      const banner = this.dataset.testid === "admin-preview-banner";
      if (banner) reads();
      const h = banner ? 132 : 0;
      return {
        top: banner ? top : 0,
        bottom: banner ? top + h : 0,
        height: h,
        left: 0,
        right: 0,
        width: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect;
    });
    const { unmount } = renderBanner();
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--preview-banner-bottom")).toBe("221px");
    expect(root.style.getPropertyValue("--preview-banner-h")).toBe("132px");

    // Two scroll events in one frame: one read, on the frame.
    top = 40;
    reads.mockClear();
    window.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("scroll"));
    expect(reads).not.toHaveBeenCalled();
    expect(frames).toHaveLength(1);
    act(() => frames.shift()!(0));
    expect(reads).toHaveBeenCalledTimes(1);
    expect(root.style.getPropertyValue("--preview-banner-bottom")).toBe("172px");

    // Stuck at the top: the edge is the height.
    top = 0;
    window.dispatchEvent(new Event("scroll"));
    act(() => frames.shift()!(0));
    expect(root.style.getPropertyValue("--preview-banner-bottom")).toBe("132px");

    unmount();
    expect(root.style.getPropertyValue("--preview-banner-bottom")).toBe("");
    // No listener outlives the banner.
    window.dispatchEvent(new Event("scroll"));
    expect(frames).toHaveLength(0);
  });

  it("still publishes once without ResizeObserver", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      const h = this.dataset.testid === "admin-preview-banner" ? 69 : 0;
      return {
        top: 0,
        bottom: h,
        height: h,
        left: 0,
        right: 0,
        width: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect;
    });
    renderBanner();
    expect(document.documentElement.style.getPropertyValue("--preview-banner-h")).toBe("69px");
  });
});
