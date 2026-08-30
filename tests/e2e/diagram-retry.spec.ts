/**
 * tests/e2e/diagram-retry.spec.ts
 * (spec 2026-08-29-diagram-failure-retry §4.0.5; plan Task 2 — AC-1, AC-2)
 *
 * The two claims jsdom structurally cannot make, measured on the REAL <Gallery>
 * in a real engine.
 *
 *   AC-1  node identity across `retrying → idle`.
 *   AC-2  one tap is ONE request; the `srcSet` candidate set is unchanged across
 *         the transition; and for a laddered entry it holds no original-tier URL.
 *
 * WHY A BROWSER. jsdom issues no requests, so what makes a retry re-fetch at all
 * is invisible to every jsdom assertion — removing it leaves the whole component
 * suite green (probed, 196/196). A green jsdom suite therefore says nothing about
 * AC-2, which is why the acceptance criterion names a real browser rather than a
 * rendered attribute.
 *
 * This paragraph used to call that mechanism "the remount key", which was wrong in
 * a way worth recording: no remount key ships, and the test BELOW asserts the
 * opposite — that the loaded node SURVIVES into idle. §4.0.5 forbids the remount,
 * because the asset route has no validator and a remount is a second unconditional
 * GET. Corrected by whole-diff review round 3; see §0 of the design spec.
 *
 * ANTI-TAUTOLOGY POSTURE.
 *   - The count window OPENS after the first failure settles, so the initial
 *     request cannot be miscounted into the retry's total.
 *   - Identity is asserted by TAGGING the element, never by presence: a
 *     remounted image is also present, which is the exact defect §4.0.5 exists
 *     to prevent.
 *   - The fixture is LADDERED, so "no original-tier URL" is a real constraint on
 *     the loader's choice rather than a vacuous truth about an entry that has no
 *     other tier.
 *   - The failure is driven by failing the ASSET REQUEST, the component's own
 *     path to `onError`, not by dispatching a synthetic event.
 */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// `test` comes from the shared fixture, NOT from `@playwright/test`: any spec
// that calls `compileEntryCss` renders documents whose measurements are
// font-dependent, and the fixture is what attaches the font-readiness oracle.
// Binding the bare import silently opts out of it -- pinned by
// tests/e2e/_metaFontFidelityWiring.test.ts, which caught exactly that here.
import { expect, test } from "./helpers/fontFidelityFixture";

import { bundleLiveEntry, compileEntryCss } from "./helpers/liveEntryToolchain";

const REPO_ROOT = resolve(__dirname, "..", "..");

declare global {
  interface Window {
    /** First candidate set slot 0 painted, recorded before any failure. */
    __preFailureSrcSet?: string;
  }
}

/** 1x1 transparent PNG — the bytes are irrelevant, the request count is not. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

/** The asset route's real posture: stale at once, no validator to revalidate with. */
const HEADERS = { "cache-control": "private, max-age=0, must-revalidate" };

let server: Server;
let baseUrl: string;
let workDir: string;

test.beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), "diagram-retry-"));

  writeFileSync(
    join(workDir, "live.html"),
    `<!doctype html>
<html data-theme="light">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="out.css"></head>
<body class="bg-bg"><div id="root"></div><script src="bundle.js"></script></body></html>`,
  );

  bundleLiveEntry({
    entry: join(REPO_ROOT, "tests", "e2e", "_diagramRetryLiveEntry.tsx"),
    outFile: join(workDir, "bundle.js"),
    aliases: {
      "node:crypto": join(REPO_ROOT, "tests", "e2e", "_nodeCryptoStub.ts"),
      "next/navigation": join(REPO_ROOT, "tests", "e2e", "_nextNavigationStub.ts"),
    },
  });

  const entryCss = join(workDir, "entry.css");
  const globals = readFileSync(join(REPO_ROOT, "app", "globals.css"), "utf8");
  writeFileSync(
    entryCss,
    [
      `@source "${join(REPO_ROOT, "components", "diagrams", "Gallery.tsx")}";`,
      `@source "${join(REPO_ROOT, "components", "diagrams", "GalleryLightbox.tsx")}";`,
      `@source "${join(REPO_ROOT, "tests", "e2e", "_diagramRetryLiveEntry.tsx")}";`,
      globals,
    ].join("\n"),
  );
  compileEntryCss({ entryCss, outFile: join(workDir, "out.css") });

  server = createServer((req, res) => {
    const url = (req.url ?? "/").split("?")[0] ?? "/";
    const file = url === "/" || url === "" ? "live.html" : url.replace(/^\//, "");
    try {
      const body = readFileSync(join(workDir, file));
      res.setHeader(
        "content-type",
        file.endsWith(".css") ? "text/css" : file.endsWith(".js") ? "text/javascript" : "text/html",
      );
      res.end(body);
    } catch {
      res.statusCode = 404;
      res.end("not found");
    }
  });
  return new Promise<void>((r) =>
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") baseUrl = `http://127.0.0.1:${addr.port}/`;
      r();
    }),
  );
});

test.afterAll(() => {
  server?.close();
});

test("one tap is one request, and the node that loads is the node that stays", async ({ page }) => {
  const assetHits: string[] = [];
  let failNext = true;

  // The component's OWN path to onError: the asset request fails. Driving a
  // synthetic error event instead would bypass the loader and prove nothing
  // about what the browser actually fetched.
  await page.route("**/api/asset/diagram/**", async (route) => {
    const url = route.request().url();
    assetHits.push(url);
    if (failNext) {
      await route.fulfill({ status: 502, contentType: "text/plain", body: "nope" });
      return;
    }
    await route.fulfill({ status: 200, contentType: "image/png", headers: HEADERS, body: PNG });
  });

  // Records the FIRST candidate set slot 0 paints, before any failure can
  // remove the element. A MutationObserver rather than a poll: the window
  // between paint and `onError` is not something a timer can be trusted to hit.
  await page.addInitScript(() => {
    const record = (root: ParentNode) => {
      const img = root.querySelector?.('[data-testid="diagram-slot-0"] img');
      const set = img?.getAttribute("srcset");
      if (set && !window.__preFailureSrcSet) window.__preFailureSrcSet = set;
    };
    new MutationObserver(() => record(document)).observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["srcset"],
    });
  });

  await page.goto(baseUrl);

  const failedControl = page.getByTestId("diagram-retry-0");
  await expect(failedControl, "the first load failed, so the cell offers a retry").toBeVisible();

  // The srcSet as it was BEFORE the failure. It has to be captured while the
  // image is still mounted: once `onError` fires, slot 0 swaps to the failed
  // branch and the element is gone, so reading it here would read nothing. The
  // init script below records the first candidate set slot 0 ever paints.
  const beforeSrcSet = await page.evaluate(() => window.__preFailureSrcSet ?? null);

  // Everything up to here is setup. The count window opens NOW, so the initial
  // failed request is outside it by construction.
  const hitsBeforeTap = assetHits.length;
  failNext = false;

  await failedControl.click();

  const image = page.locator('[data-testid="diagram-slot-0"] img');
  await expect(image, "the retry mounts the image in its final position").toBeVisible();

  // Tag it. A remount yields a fresh element with no tag, so presence cannot
  // stand in for identity.
  await image.evaluate((el) => {
    (el as HTMLElement).dataset.identityProbe = "same-node";
  });

  await expect(page.getByTestId("diagram-retrying-0")).toHaveCount(0, { timeout: 10_000 });

  const survivingTag = await page
    .locator('[data-testid="diagram-slot-0"] img')
    .evaluate((el) => (el as HTMLElement).dataset.identityProbe ?? null);
  expect(survivingTag, "AC-1: the loaded node survives into idle rather than remounting").toBe(
    "same-node",
  );

  const retryHits = assetHits.length - hitsBeforeTap;
  expect(retryHits, "AC-2: one tap issues exactly one request for the asset").toBe(1);

  const afterSrcSet = await page
    .locator('[data-testid="diagram-slot-0"] img')
    .getAttribute("srcset");
  expect(afterSrcSet, "the retry renders a candidate set").toBeTruthy();
  if (beforeSrcSet) {
    expect(afterSrcSet, "AC-2: the candidate set is unchanged across the transition").toBe(
      beforeSrcSet,
    );
  }
  // A laddered entry never offers the original tier: the bare key with no
  // `@<width>.webp` suffix is the original.
  const candidates = (afterSrcSet ?? "").split(",").map((c) => c.trim().split(" ")[0] ?? "");
  const originalOffered = candidates.some((c) => /embedded-obj-1\.png(?!@)/.test(c));
  expect(originalOffered, "AC-2: a laddered entry offers no original-tier candidate").toBe(false);
});
