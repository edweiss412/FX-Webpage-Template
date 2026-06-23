// @vitest-environment jsdom
/**
 * tests/components/tiles/OpeningReelTile.test.tsx
 *
 * Crew-redesign retarget (wp-20 step b, test 26): the AC-7.25 opening-reel
 * URL-strip + proxied-player contract, ported off the deleted OpeningReelTile
 * onto the GearSection "Opening reel" block (components/crew/sections/
 * GearSection.tsx) that now owns it.
 *
 * The reel block reads `event_details.opening_reel` and routes it through:
 *   - `stripOpeningReelText`     — removes every Drive/Docs URL substring so
 *                                  the crew DOM NEVER carries `https://` /
 *                                  `drive.google.com` / `docs.google.com`.
 *   - `shouldHideOpeningReel`    — hides the whole text line for the `''`/`TBD`
 *                                  sentinels (the reel-specific hide set).
 *   - `data.openingReelHasVideo` — gates the proxied `<OpeningReelVideo>`
 *                                  player (`video[src="/api/asset/reel/<id>"]`).
 *
 * AC-7.25 invariants pinned here (mirrors the four verbatim tile cases):
 *   - Mixed-value cell + video → URL-stripped text line ("YES") AND the
 *     proxied <video>. No raw URL in the DOM.
 *   - Pure-URL cell + video → only the <video>; stripped residual is empty so
 *     NO text line (the [data-testid="gear-opening-reel"] block still renders
 *     for the player, but its KeyValueRows "Status" row is absent).
 *   - Text-only cell ("MAYBE") + no video → text line only; no <video>.
 *   - Drift case (URL substring, no video) → URL-stripped text only; no
 *     <video>; no raw URL.
 *   - Sentinel cell ("TBD") + no video → reel block omitted entirely.
 *
 * GearSection.test.tsx already pins the mixed-value text-only-and-player case;
 * this file keeps the FULL AC-7.25 matrix live against the new owner so the
 * URL-strip contract survives the tile deletion. Renders via testing-library
 * jsdom (matching the section test); the showId PROP drives the player src.
 */
import { expect, test } from "vitest";
import { render } from "@testing-library/react";

import { GearSection } from "@/components/crew/sections/GearSection";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";

const SHOW_ID = "77777777-7777-4777-8777-777777777777";
const TODAY = new Date("2026-05-14T15:00:00Z");
const VIEWER = { kind: "admin" } as const;

function renderReel(openingReel: string | undefined, hasVideo: boolean): HTMLElement {
  return render(
    <GearSection
      data={makeShowForViewer({
        show: {
          event_details: openingReel !== undefined ? { opening_reel: openingReel } : {},
        },
        openingReelHasVideo: hasVideo,
      })}
      viewer={VIEWER}
      today={TODAY}
      showId={SHOW_ID}
    />,
  ).container;
}

/** Assert the rendered DOM carries no raw Drive/Docs URL substring. */
function expectNoRawUrl(html: string): void {
  expect(html).not.toContain("https://");
  expect(html).not.toContain("drive.google.com");
  expect(html).not.toContain("docs.google.com");
}

test("AC-7.25 mixed-value cell + video → stripped text + inline <video> (no raw URL)", () => {
  const c = renderReel("YES - https://drive.google.com/file/d/abc123/view", true);
  const html = c.innerHTML;
  // Proxied player on the bare show id (PROP), no query/`r=` suffix.
  const video = c.querySelector(`video[src="/api/asset/reel/${SHOW_ID}"]`);
  expect(video).toBeTruthy();
  // URL-stripped text residual ("YES") survives as the Status row.
  expect(c.textContent ?? "").toContain("YES");
  expectNoRawUrl(html);
  // The reel block rendered.
  expect(c.querySelector('[data-testid="gear-opening-reel"]')).toBeTruthy();
});

test("AC-7.25 pure-URL cell + video → only <video>; no text line", () => {
  const c = renderReel("https://drive.google.com/file/d/abc123/view", true);
  const html = c.innerHTML;
  expect(c.querySelector(`video[src="/api/asset/reel/${SHOW_ID}"]`)).toBeTruthy();
  expectNoRawUrl(html);
  // The reel block still renders (for the player), but the stripped residual is
  // empty so the KeyValueRows "Status" text row is absent.
  expect(c.querySelector('[data-testid="gear-opening-reel"]')).toBeTruthy();
  expect(c.querySelector('[data-testid="key-value-rows"]')).toBeNull();
});

test("AC-7.25 text-only cell ('MAYBE') + no video → text line only; no <video>", () => {
  const c = renderReel("MAYBE", false);
  expect(c.querySelector("video")).toBeNull();
  expect(c.textContent ?? "").toContain("MAYBE");
  expect(c.querySelector('[data-testid="gear-opening-reel"]')).toBeTruthy();
  // The Status text row renders for the non-empty residual.
  expect(c.querySelector('[data-testid="key-value-rows"]')).toBeTruthy();
});

test("AC-7.25 drift case (URL substring, no video) → URL-stripped text only", () => {
  const c = renderReel("YES - https://drive.google.com/file/d/abc123/view", false);
  expect(c.querySelector("video")).toBeNull();
  expect(c.textContent ?? "").toContain("YES");
  expectNoRawUrl(c.innerHTML);
});

test("sentinel cell ('TBD') + no video → reel block omitted entirely", () => {
  const c = renderReel("TBD", false);
  // shouldHideOpeningReel('TBD') → text hidden; no video → whole block gone.
  expect(c.querySelector('[data-testid="gear-opening-reel"]')).toBeNull();
  expect(c.textContent ?? "").not.toContain("TBD");
});

test("absent opening_reel + no video → reel block omitted", () => {
  const c = renderReel(undefined, false);
  expect(c.querySelector('[data-testid="gear-opening-reel"]')).toBeNull();
});

test("video src interpolates the bare show id with no `r=` or query suffix", () => {
  const c = renderReel("https://drive.google.com/file/d/abc/view", true);
  const video = c.querySelector("video");
  expect(video).toBeTruthy();
  const src = video!.getAttribute("src") ?? "";
  expect(src).toBe(`/api/asset/reel/${SHOW_ID}`);
  expect(src).not.toMatch(/api\/asset\/reel\/r=/);
  expect(src).not.toMatch(/api\/asset\/reel\/\?/);
});
