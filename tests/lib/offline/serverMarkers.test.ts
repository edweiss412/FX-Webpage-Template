/**
 * The server-side marker helpers (plan section 1, item 14; spec 4.3): every
 * server-rendered marker that carries a viewer key is built here, and each
 * falls back to `purge` naming the show when the key or the epoch is missing,
 * so a page never writes a `save` or `keep` the worker would have to reject.
 *
 * The viewer-key helper is wrapped, not replaced: every case runs the real HMAC
 * (tests/setup.ts supplies the signing key) unless it asks for a null key.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/offline/viewerKey", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/offline/viewerKey")>();
  return { viewerKey: vi.fn(actual.viewerKey) };
});

import { markerAttributes, readMarker, type Marker } from "@/lib/offline/marker";
import { keepMarkerFor, purgeMarkerFor, saveMarkerFor } from "@/lib/offline/serverMarkers";
import { viewerKey } from "@/lib/offline/viewerKey";

const SHOW = "3f2b8c1e-9d4a-4e6b-8a57-1c2d3e4f5a6b";
const CREW = "7c1e0d42-2b6f-4a39-9e81-5f3a2c4b6d70";
const RENDERED_AT = "2026-10-27T06:03:26.123Z";
const ASSETS = [
  `/api/asset/diagram/${SHOW}/rev-1/embedded-obj-1.png`,
  `/api/asset/agenda/${SHOW}/file-1`,
];

const keyFor = vi.mocked(viewerKey);

afterEach(() => {
  keyFor.mockClear();
});

/** What the worker reads back from the marker the page would render. */
function roundTrip(marker: Marker): Marker | null {
  const read = readMarker(
    renderToStaticMarkup(createElement("template", markerAttributes(marker))),
  );
  return read.kind === "valid" ? read.marker : null;
}

const realModule =
  await vi.importActual<typeof import("@/lib/offline/viewerKey")>("@/lib/offline/viewerKey");

/** The real key, computed outside the spy so a call count cannot be satisfied by the test itself. */
function realKey(): string {
  const key = realModule.viewerKey(SHOW, CREW);
  if (key === null) throw new Error("tests/setup.ts should supply PICKER_COOKIE_SIGNING_KEY");
  return key;
}

describe("purgeMarkerFor", () => {
  test("names the show it is given", () => {
    expect(purgeMarkerFor(SHOW)).toEqual({ disposition: "purge", showId: SHOW });
  });

  test("names no show when it is given none", () => {
    expect(purgeMarkerFor(null)).toEqual({ disposition: "purge", showId: null });
  });
});

describe("saveMarkerFor", () => {
  const input = {
    showId: SHOW,
    crewMemberId: CREW,
    epoch: 4,
    renderedAt: RENDERED_AT,
    assets: ASSETS,
  };

  test("carries the show, render time, epoch, viewer key and assets", () => {
    const marker = saveMarkerFor(input);

    expect(marker).toEqual({
      disposition: "save",
      showId: SHOW,
      renderedAt: RENDERED_AT,
      epoch: 4,
      viewer: realKey(),
      assets: ASSETS,
    });
    expect(keyFor).toHaveBeenCalledWith(SHOW, CREW);
  });

  test("writes a marker the worker reads back as the same save", () => {
    const marker = saveMarkerFor(input);

    expect(marker.disposition).toBe("save");
    expect(roundTrip(marker)).toEqual(marker);
  });

  test("never exposes the crew member id", () => {
    const html = renderToStaticMarkup(
      createElement("template", markerAttributes(saveMarkerFor(input))),
    );

    expect(html).toContain(`data-viewer="${realKey()}"`);
    expect(html).not.toContain(CREW);
  });

  test("epoch 0 is a real epoch, not a missing one", () => {
    expect(saveMarkerFor({ ...input, epoch: 0 })).toMatchObject({ disposition: "save", epoch: 0 });
  });

  test.each([
    ["undefined", undefined],
    ["negative", -1],
    ["fractional", 1.5],
    ["NaN", Number.NaN],
    ["infinite", Number.POSITIVE_INFINITY],
    ["past the safe integers", 2 ** 53],
  ])("an epoch that is %s falls back to purge naming the show", (_label, epoch) => {
    expect(saveMarkerFor({ ...input, epoch })).toEqual({ disposition: "purge", showId: SHOW });
  });

  test("a null viewer key falls back to purge naming the show", () => {
    keyFor.mockReturnValueOnce(null);

    expect(saveMarkerFor(input)).toEqual({ disposition: "purge", showId: SHOW });
    expect(keyFor).toHaveBeenCalledWith(SHOW, CREW);
  });
});

describe("keepMarkerFor", () => {
  test("carries the show and the viewer key of the crew member the server resolved", () => {
    const marker = keepMarkerFor(SHOW, CREW);

    expect(marker).toEqual({ disposition: "keep", showId: SHOW, viewer: realKey() });
    expect(roundTrip(marker)).toEqual(marker);
    expect(keyFor).toHaveBeenCalledWith(SHOW, CREW);
  });

  test("a null viewer key falls back to purge naming the show", () => {
    keyFor.mockReturnValueOnce(null);

    expect(keepMarkerFor(SHOW, CREW)).toEqual({ disposition: "purge", showId: SHOW });
  });
});
