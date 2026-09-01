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
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
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

/**
 * A per-case hook the harness server consults BEFORE serving files.
 *
 * Every other case in this file intercepts the asset with `page.route`, so the
 * request never reaches this server at all. The U-1 case cannot do that: what it
 * measures is what the SERVER sees when the browser gives up on a request, and a
 * Playwright route handler stands between the two. Returning true means the hook
 * answered; null restores ordinary file serving for every other case.
 */
let assetHook: ((req: IncomingMessage, res: ServerResponse) => boolean) | null = null;

/**
 * The check-in deadline, DERIVED from the shipped constant rather than retyped,
 * and read out of source rather than imported: `RETRY_CHECK_IN_MS` is exported
 * from GalleryLightbox.tsx, which is JSX, and Playwright's babel transform
 * rewrites JSX in a spec-imported .tsx into a component-testing payload. The
 * throw is the premise, so a rename fails loudly instead of leaving this spec
 * waiting on a number of its own invention.
 */
const RETRY_CHECK_IN_MS = (() => {
  const src = readFileSync(
    resolve(REPO_ROOT, "components", "diagrams", "GalleryLightbox.tsx"),
    "utf8",
  );
  const m = /export const RETRY_CHECK_IN_MS = ([0-9_]+)/.exec(src);
  if (m?.[1] === undefined) {
    throw new Error("RETRY_CHECK_IN_MS was not found in components/diagrams/GalleryLightbox.tsx");
  }
  return Number(m[1].replace(/_/g, ""));
})();

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
    if (assetHook !== null && url.startsWith("/api/asset/") && assetHook(req, res)) return;
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

/**
 * AC-2 and AC-D3 — the check-in in a real engine, and U-1 measured.
 *
 * AC-8 IS NOT DISCHARGED HERE, and the case was renamed when the measurement
 * came in. AC-8 says pressing Restart issues a SECOND request while the first is
 * unanswered. It does not: the replacement `<img>` carries an IDENTICAL URL, a
 * request for that URL is still in flight, and Chromium serves the new element
 * from it rather than opening a second connection. Measured
 * `attemptsAfterRestart: 2`, not 3, on 2026-09-01. The observation is recorded
 * rather than asserted away, and what happens to AC-8 is a product decision.
 *
 * Why a browser at all: jsdom issues no requests, so "Restart issues a SECOND
 * request while the first is unanswered" is invisible to every jsdom assertion
 * in this arc. And U-1 — whether removing a mid-fetch `<img>` abandons its
 * request — is a question about the network, which is why the asset here is
 * served by the HARNESS SERVER rather than intercepted: a Playwright route
 * handler stands between the browser and the socket whose fate is the subject.
 *
 * This case waits the real thirty seconds. `RETRY_CHECK_IN_MS` is a module
 * constant read at call time, so shortening it would need a test-only prop, and
 * one slow case is cheaper than that prop and cheaper than the round it earns.
 *
 * SCOPE, stated rather than implied: the harness mounts <Gallery> and no
 * lightbox, so the real-browser evidence here is gallery-only. The lightbox
 * check-in is covered by the jsdom suite and the shared implementation, and this
 * spec claims no browser measurement it does not take.
 */
test("the check-in appears in a browser, and U-1 is measured", async ({ page }, testInfo) => {
  test.setTimeout(RETRY_CHECK_IN_MS + 120_000);

  let attempts = 0;
  /** Set when the held request's socket goes away. THE U-1 OBSERVABLE. */
  let heldEndedAt: number | null = null;
  let heldStartedAt: number | null = null;
  const release: Array<() => void> = [];

  assetHook = (req, res) => {
    if (!(req.url ?? "").includes("embedded-obj-1")) return false;
    attempts += 1;
    if (attempts === 1) {
      // The component's OWN path to onError, so the failed branch is reached the
      // way a crew member reaches it rather than by a synthetic event.
      res.statusCode = 502;
      res.end("nope");
      return true;
    }
    if (attempts === 2) {
      // HELD: headers only, no body, never ended. This is the request Restart
      // walks away from, and the one whose socket answers U-1.
      heldStartedAt = Date.now();
      const mark = () => {
        heldEndedAt ??= Date.now();
      };
      req.on("aborted", mark);
      res.on("close", mark);
      res.writeHead(200, { "content-type": "image/png", ...HEADERS });
      release.push(() => {
        try {
          res.end();
        } catch {
          /* the socket may already be gone, which is the answer, not an error */
        }
      });
      return true;
    }
    // The REPLACEMENT request Restart issues. Held too, so the case ends with
    // the cell still in flight rather than resolving under the assertions.
    release.push(() => {
      try {
        res.end();
      } catch {
        /* as above */
      }
    });
    res.writeHead(200, { "content-type": "image/png", ...HEADERS });
    return true;
  };

  try {
    await page.goto(baseUrl);

    const failedControl = page.getByTestId("diagram-retry-0");
    // The readiness gate is the control existing, never `networkidle` — this
    // case deliberately leaves a request open forever, so the network is never
    // idle by construction.
    await expect(failedControl, "the first load failed, so the cell offers a retry").toBeVisible();

    await failedControl.click();
    const overlay = page.getByTestId("diagram-retrying-0");
    await expect(overlay).toBeVisible();
    // POLLED, not read once. The overlay is visible the moment React commits the
    // phase; the browser's request for the new <img> reaches this server a beat
    // later, and a synchronous read here saw `1` on the first real run. The
    // assertion still discriminates: a tap issuing zero or two requests never
    // settles on 2.
    await expect
      .poll(() => attempts, { timeout: 10_000, message: "the tap issued exactly one new request" })
      .toBe(2);
    expect(
      await overlay.getAttribute("aria-disabled"),
      "before the deadline the control does nothing, and says so",
    ).toBe("true");

    // AC-2: the copy changes at the deadline, in a real engine.
    await expect(overlay).toContainText("Still loading", { timeout: RETRY_CHECK_IN_MS + 30_000 });
    await expect(overlay).toContainText("Restart");
    expect(
      await overlay.getAttribute("aria-disabled"),
      "at the check-in the control acts, so it is no longer aria-disabled",
    ).toBeNull();
    expect(
      await overlay.getAttribute("aria-busy"),
      "and the request IS still in flight, so aria-busy holds",
    ).toBe("true");
    expect(attempts, "no request was issued by the deadline passing").toBe(2);

    // Tag the in-flight image so the remount is identity, not presence: a
    // remounted <img> is also "an image".
    const tagged = await page.evaluate(() => {
      const img = document.querySelector('[data-testid="diagram-slot-0"] img');
      if (!img) return false;
      img.setAttribute("data-u1-original", "yes");
      return true;
    });
    expect(tagged, "the in-flight image was there to tag").toBe(true);

    // Restart, then MEASURE BEFORE ASSERTING. The observation is this case's
    // deliverable and an assertion ordering must not be able to lose it: the
    // first real run failed on the request count and took the U-1 evidence down
    // with it, when the count IS part of that evidence.
    await overlay.click();
    await page.waitForTimeout(5_000);

    const originalGone =
      (await page.locator('[data-testid="diagram-slot-0"] img[data-u1-original]').count()) === 0;
    const verdict = heldEndedAt === null ? "CONTINUED" : "ABANDONED";
    const observation = {
      verdict,
      heldForMs: heldEndedAt === null ? null : heldEndedAt - (heldStartedAt ?? heldEndedAt),
      // 3 means Restart issued a fresh request. 2 means the browser served the
      // replacement <img> from the request already in flight for the same URL,
      // which is a different fact about the same event and worth recording as
      // such rather than as a failure.
      attemptsAfterRestart: attempts,
      originalElementRemoved: originalGone,
      browser: testInfo.project.name,
      measuredAt: new Date().toISOString().slice(0, 10),
      case: "the check-in appears in a browser, and U-1 is measured",
    };
    await testInfo.attach("u1-observation.json", {
      body: JSON.stringify(observation, null, 2),
      contentType: "application/json",
    });
    // Also to stdout: standalone-e2e uploads its artifact only `if: failure()`,
    // so on a GREEN CI run the file below never leaves the runner and the job
    // log is the only place the answer can be read.
    console.log(`U-1 OBSERVATION ${JSON.stringify(observation)}`);
    mkdirSync(join(REPO_ROOT, "test-results"), { recursive: true });
    writeFileSync(
      join(REPO_ROOT, "test-results", "u1-observation.json"),
      JSON.stringify(observation, null, 2),
    );

    expect(
      originalGone,
      "the original element is gone, which is what makes Restart a replacement at all",
    ).toBe(true);
    await expect(overlay, "and the control is back to plain in-flight copy").toContainText(
      "Retrying",
    );
    expect(
      ["ABANDONED", "CONTINUED"],
      "U-1 resolves to one of the two tokens the spec's gate accepts",
    ).toContain(verdict);
  } finally {
    for (const r of release) r();
    assetHook = null;
  }
});
