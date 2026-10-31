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
