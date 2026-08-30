/**
 * tests/e2e/image-remount-request-count.probe.spec.ts
 *
 * Probe P2 — settles spec §1.4 row U-2.
 *
 * THE CLAIM. Replacing the in-flight image element with a different element on
 * `retrying → idle` costs a SECOND unconditional GET, because the asset route
 * sends `private, max-age=0, must-revalidate` with no validator
 * (app/api/asset/diagram/[show]/[rev]/[key]/route.ts:12, and a grep of that file
 * for ETag or Last-Modified returns nothing). Spec §4.0.5 rejects the separate
 * -node shape on that basis, and for an originals-only entry the difference is
 * up to 50 MB paid twice to display 50 MB once.
 *
 * ONLY NODE REUSE VARIES. Plan round 1 found the earlier draft left every other
 * variable open, so both arms are pinned to the same URL, the same response
 * headers, the same interception, `loading="eager"` on every element so lazy
 * evaluation cannot differ between them, and an explicit await on the load event
 * rather than a race. The count window opens AFTER the first load settles, so
 * the initial request is outside it by construction and cannot be miscounted
 * into either arm.
 */
import { expect, test } from "@playwright/test";

// 1x1 transparent PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

/** The asset route's exact caching posture: stale at once, and no validator to revalidate with. */
const HEADERS = { "Cache-Control": "private, max-age=0, must-revalidate" };

const FIXTURE = `<!doctype html>
<html><body style="margin:0">
  <div id="host" style="position:relative;width:64px;height:64px">
    <img id="live" src="/probe-asset.png" loading="eager" style="width:64px;height:64px">
    <div id="overlay" style="position:absolute;inset:0;background:#000;display:none"></div>
  </div>
</body></html>`;

async function mount(page: import("@playwright/test").Page) {
  let count = 0;
  // A REAL ORIGIN, not `setContent`. `setContent` leaves the document on
  // `about:blank`, where a relative `/probe-asset.png` resolves to nothing the
  // route handler can match — the image never loads and the premise below fails
  // for a reason that has nothing to do with the claim. The repo's existing
  // fixture specs use this same served-origin shape
  // (tests/e2e/fontFidelityFixture.spec.ts:42-54).
  await page.route("http://probe.test/index.html", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: FIXTURE }),
  );
  await page.route("http://probe.test/probe-asset.png", async (route) => {
    count += 1;
    await route.fulfill({ status: 200, contentType: "image/png", headers: HEADERS, body: PNG });
  });
  await page.goto("http://probe.test/index.html");
  await page.waitForFunction(() => {
    const img = document.getElementById("live") as HTMLImageElement | null;
    return !!img && img.complete && img.naturalWidth > 0;
  });
  // PREMISE: the first load must have HAPPENED and been counted, or a later
  // "1 request" reading would be indistinguishable from an image that never
  // loaded at all.
  expect(count, "the initial load was served through the interceptor").toBe(1);
  return () => count;
}

test("REMOUNT: replacing the element with a new one at the same src costs a SECOND request", async ({
  page,
}) => {
  const countAfter = await mount(page);
  const before = countAfter();

  await page.evaluate(async () => {
    const host = document.getElementById("host")!;
    document.getElementById("live")!.remove();
    const next = document.createElement("img");
    next.id = "live";
    next.loading = "eager";
    next.style.cssText = "width:64px;height:64px";
    next.src = "/probe-asset.png";
    host.prepend(next);
    await new Promise<void>((resolve) => {
      if (next.complete && next.naturalWidth > 0) return resolve();
      next.addEventListener("load", () => resolve(), { once: true });
      next.addEventListener("error", () => resolve(), { once: true });
    });
  });

  expect(countAfter() - before, "a new element re-requests, because nothing can revalidate").toBe(
    1,
  );
});

test("SAME NODE: toggling only a sibling overlay costs NO further request", async ({ page }) => {
  const countAfter = await mount(page);
  const before = countAfter();

  await page.evaluate(async () => {
    // The §4.0.5 shape: the image element is untouched; only the overlay above
    // it changes. This is the transition `retrying -> idle` actually performs.
    document.getElementById("overlay")!.style.display = "block";
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    document.getElementById("overlay")!.style.display = "none";
    await new Promise((r) => requestAnimationFrame(() => r(null)));
  });

  expect(countAfter() - before, "the surviving element issues nothing further").toBe(0);
});
