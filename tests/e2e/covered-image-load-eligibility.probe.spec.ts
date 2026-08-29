/**
 * tests/e2e/covered-image-load-eligibility.probe.spec.ts
 *
 * Probe P3 — settles spec §1.4 row U-3.
 *
 * THE CLAIM AS POSED, AND THE ANSWER. The spec claimed a lazily-loaded image
 * sitting UNDER an opaque overlay could be deferred, so the retry image would
 * need `loading="eager"` in flight. Arm 3 REFUTES that mechanism: an UNCOVERED
 * off-screen lazy image is deferred exactly as a covered one is, so the overlay
 * is not what defers — being off-screen is. Since the retry is reached by a tap,
 * which implies the cell is in the viewport, the override was dropped. This
 * probe removed an attribute from the design rather than confirming one.
 *
 * THE ATTRIBUTE IS THE WHOLE FIDELITY OF THIS PROBE. `next/image` does NOT leave
 * `loading` unset: with no `loading` prop and no `priority` it computes `isLazy`
 * true (node_modules/next/dist/shared/lib/get-img-props.js:271) and emits
 * `loading="lazy"` (same file, line 553). A bare `<img>` with no attribute
 * defaults to EAGER — the opposite. An earlier draft of this probe said it would
 * sit at "the browser default", which would have loaded eagerly, reported a
 * request, and "disproved" U-3 without ever reproducing the real case. Caught in
 * self-review, and the reason every arm below sets the attribute explicitly.
 *
 * THREE ARMS, because two cannot separate the causes: lazy-and-covered,
 * eager-and-covered, lazy-and-uncovered. If the third requests and the first
 * does not, the overlay is the cause and `eager` is the repair.
 */
import { expect, test } from "@playwright/test";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

/**
 * The image sits far below the fold. Lazy loading is only ever a DEFERRAL of
 * off-screen images, so an in-viewport lazy image loads immediately and the arm
 * would measure nothing. The spacer is what puts the case in reach.
 */
function fixture(loading: "lazy" | "eager", covered: boolean): string {
  return `<!doctype html>
<html><body style="margin:0">
  <div style="height:4000px"></div>
  <div id="host" style="position:relative;width:64px;height:64px">
    <img id="live" src="http://probe.test/probe-asset.png" loading="${loading}"
         style="width:64px;height:64px">
    ${covered ? `<div style="position:absolute;inset:0;background:#000"></div>` : ""}
  </div>
</body></html>`;
}

async function run(
  page: import("@playwright/test").Page,
  loading: "lazy" | "eager",
  covered: boolean,
): Promise<number> {
  let count = 0;
  await page.route("http://probe.test/index.html", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: fixture(loading, covered) }),
  );
  await page.route("http://probe.test/probe-asset.png", async (route) => {
    count += 1;
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      headers: { "Cache-Control": "private, max-age=0, must-revalidate" },
      body: PNG,
    });
  });
  await page.goto("http://probe.test/index.html");
  // PREMISE: the element must EXIST and carry the attribute under test, or a
  // zero count says nothing about laziness.
  expect(await page.getAttribute("#live", "loading")).toBe(loading);
  // Give a deferred load every chance to happen before concluding it did not.
  await page.waitForTimeout(750);
  return count;
}

test("lazy + covered + off-screen: the request is DEFERRED", async ({ page }) => {
  expect(await run(page, "lazy", true)).toBe(0);
});

test("eager + covered + off-screen: the request is issued anyway", async ({ page }) => {
  expect(await run(page, "eager", true)).toBe(1);
});

test("lazy + UNCOVERED + off-screen: still deferred, so the overlay is not the cause", async ({
  page,
}) => {
  // The discriminating arm. If this differed from arm 1, the overlay would be
  // what defers; it does not, so OFF-SCREEN-ness is, and `eager` is the repair
  // for both.
  expect(await run(page, "lazy", false)).toBe(0);
});
