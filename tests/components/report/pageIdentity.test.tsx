// @vitest-environment jsdom
/**
 * tests/components/report/pageIdentity.test.tsx
 *
 * Who a page says it was rendered for, read from its saved-copy marker through
 * the real DOM, so entity decoding is proven on what `outerHTML` actually
 * serializes. Crew offline spec 2026-10-26 §4.3, §5.3.
 */
import { afterEach, describe, expect, test } from "vitest";

import { markerAttributes, type Marker } from "@/lib/offline/marker";
import { pageSlug, readPageIdentity } from "@/lib/reports/offlineQueue";

const SHOW = "11111111-1111-4111-8111-111111111111";
const RENDERED = "2026-11-07T14:14:00.000Z";

function plant(marker: Marker): void {
  const element = document.createElement("template");
  for (const [name, value] of Object.entries(markerAttributes(marker))) {
    element.setAttribute(name, value);
  }
  document.body.appendChild(element);
}

afterEach(() => {
  document.body.replaceChildren();
  window.history.replaceState(null, "", "/");
});

describe("readPageIdentity", () => {
  test("a save marker gives its viewer and render time", () => {
    plant({
      disposition: "save",
      showId: SHOW,
      renderedAt: RENDERED,
      epoch: 3,
      viewer: "viewer-a",
      // A real attribute value: quotes and ampersands the DOM escapes.
      assets: ['/api/asset/diagram/1?a=1&b="2"'],
    });
    expect(readPageIdentity()).toEqual({ writer: "viewer-a", pageRenderedAt: RENDERED });
  });

  test("a keep marker gives its viewer and no render time", () => {
    plant({ disposition: "keep", showId: SHOW, viewer: "viewer-b" });
    expect(readPageIdentity()).toEqual({ writer: "viewer-b", pageRenderedAt: null });
  });

  test.each<[string, () => void]>([
    ["a purge marker", () => plant({ disposition: "purge", showId: SHOW })],
    ["a hold marker", () => plant({ disposition: "hold", showId: null })],
    ["no marker", () => undefined],
    [
      "a malformed save marker",
      () => {
        const element = document.createElement("template");
        element.id = "fxav-saved-copy";
        element.setAttribute("data-v", "3");
        element.setAttribute("data-disposition", "save");
        document.body.appendChild(element);
      },
    ],
  ])("%s gives neither", (_name, arrange) => {
    arrange();
    expect(readPageIdentity()).toEqual({ writer: null, pageRenderedAt: null });
  });
});

describe("pageSlug", () => {
  test("the slug in a crew URL", () => {
    window.history.replaceState(null, "", "/show/east-coast/token-1?s=dock");
    expect(pageSlug()).toBe("east-coast");
  });

  test("null off a crew page", () => {
    window.history.replaceState(null, "", "/help/errors");
    expect(pageSlug()).toBeNull();
  });
});
