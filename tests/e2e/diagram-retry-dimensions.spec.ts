/**
 * tests/e2e/diagram-retry-dimensions.spec.ts
 * (spec 2026-08-29-diagram-failure-retry §8; plan Task 8 — AC-7)
 *
 * The gallery cell is a fixed-aspect parent (`aspect-square`) with a flex child,
 * and this project's Tailwind v4 does NOT default `.flex` to
 * `align-items: stretch`. jsdom computes no layout at all, so the only place
 * this can be established is a real engine.
 *
 * THE RED HERE WAS PLANTED, and the task says so rather than pretending
 * otherwise. Task 1 moved the placeholder `<div>`'s classes onto the button, and
 * that list already contained `size-full`, so this assertion is green the moment
 * it is authored. A guard that passes on arrival proves nothing, so the cycle run
 * before committing was: write it, REMOVE `size-full` from the control, observe
 * THIS command red, restore, observe it green. Recorded because a reader
 * otherwise cannot tell a discriminating guard from a decorative one.
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
const TOL = 0.5;
/** The spec's floor, in px. Named so the assertion reads as the rule it enforces. */
const TAP_FLOOR = 44;

/**
 * The check-in deadline, DERIVED from the shipped constant rather than retyped.
 *
 * Not imported. `RETRY_CHECK_IN_MS` is exported from GalleryLightbox.tsx, which
 * is JSX, and Playwright's babel transform rewrites JSX in a spec-imported .tsx
 * into a component-testing payload -- the same trap _diagramRetryLiveEntry.tsx
 * carries a header about. Reading the literal out of the source keeps the value
 * tied to the product's, and the throw below is the premise: a rename must fail
 * loudly here rather than silently leave this spec waiting on a number of its
 * own invention.
 */
const RETRY_CHECK_IN_MS = (() => {
  const src = readFileSync(
    resolve(__dirname, "..", "..", "components", "diagrams", "GalleryLightbox.tsx"),
    "utf8",
  );
  const m = /export const RETRY_CHECK_IN_MS = ([0-9_]+)/.exec(src);
  if (m?.[1] === undefined) {
    throw new Error("RETRY_CHECK_IN_MS was not found in components/diagrams/GalleryLightbox.tsx");
  }
  return Number(m[1].replace(/_/g, ""));
})();

let server: Server;
let baseUrl: string;
let workDir: string;

test.beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), "diagram-retry-dims-"));
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

test("AC-7: the retry control fills its cell, and clears the tap floor", async ({ page }) => {
  // Abort the asset request so the cell reaches the failed branch through the
  // component's OWN error path (spec §10.6's retraction of the earlier fence).
  await page.route("**/api/asset/diagram/**", (route) => route.abort());
  await page.goto(baseUrl);

  const cell = page.getByTestId("diagram-slot-0");
  const control = page.getByTestId("diagram-retry-0");
  // The hydration signal is the control existing at all: it is rendered only
  // after React has mounted and the error has been handled, so awaiting it is
  // awaiting hydration rather than a bare timeout.
  await expect(control).toBeVisible();

  const cellBox = await cell.boundingBox();
  const controlBox = await control.boundingBox();
  expect(cellBox, "the cell was measurable").not.toBeNull();
  expect(controlBox, "the control was measurable").not.toBeNull();

  // PREMISE: a zero-height cell would satisfy an equality assertion trivially,
  // and is exactly what a broken aspect-ratio parent produces.
  expect(cellBox!.height, "the cell has real height to fill").toBeGreaterThan(TAP_FLOOR);

  // Measured against the cell's CONTENT box, not its border box, and the
  // distinction is not pedantry -- it cost this assertion a failing run. The
  // `<li>` carries `border border-border`, `boundingBox()` reports the BORDER
  // box, and `size-full` resolves against the CONTENT box. Comparing the two
  // directly is comparing different rectangles, and it reports a 2px gap on a
  // component that is laying out correctly. The same 2px applies to the healthy
  // thumbnail button, which has shipped with `size-full` since before this arc --
  // asserted below, so the claim that this is geometry and not a defect is
  // demonstrated rather than argued.
  const inner = await cell.evaluate((el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      height: r.height - parseFloat(cs.borderTopWidth) - parseFloat(cs.borderBottomWidth),
      width: r.width - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth),
    };
  });

  expect(
    Math.abs(controlBox!.height - inner.height),
    "the control fills the cell's content height: Tailwind v4 does not default .flex to align-items stretch",
  ).toBeLessThanOrEqual(TOL);
  expect(Math.abs(controlBox!.width - inner.width), "and its width").toBeLessThanOrEqual(TOL);

  // CORROBORATION: the healthy thumbnail button, which has carried `size-full`
  // since before this arc, fills the cell to the same tolerance. If the retry
  // control's geometry were a defect rather than a border-box artefact, this
  // pre-existing control would not agree with it.
  const healthy = page.getByTestId("diagram-slot-1").locator("button").first();
  await expect(healthy).toBeVisible();
  const healthyBox = await healthy.boundingBox();
  const siblingInner = await page.getByTestId("diagram-slot-1").evaluate((el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return r.height - parseFloat(cs.borderTopWidth) - parseFloat(cs.borderBottomWidth);
  });
  expect(
    Math.abs(healthyBox!.height - siblingInner),
    "the pre-existing thumbnail button fills its cell the same way",
  ).toBeLessThanOrEqual(TOL);

  // The cell IS the tap target, and the floor is asserted on the rendered box
  // rather than on the class, so a token rename cannot silently drop it.
  expect(controlBox!.height, "clears the 44px tap floor").toBeGreaterThanOrEqual(TAP_FLOOR);
  expect(controlBox!.width, "in both axes").toBeGreaterThanOrEqual(TAP_FLOOR);
});

/**
 * AC-13 — the CHECK-IN's geometry, which is a different question from AC-7's.
 *
 * AC-7 measures the failed control. This measures the in-flight overlay in its
 * `checked-in` phase, and the two are different elements with different class
 * lists: the overlay is `absolute inset-0` against the cell as containing block,
 * where the failed control is `size-full`. Both resolve to the content box, and
 * a reader who assumed AC-7 covered this would be measuring the wrong node.
 *
 * THE RED HERE WAS PLANTED, for the same reason AC-7's was: the overlay already
 * carries `absolute inset-0`, so this is green the moment it is authored. The
 * cycle run before committing was: write it, remove `absolute inset-0` from the
 * in-flight control, observe THIS command red, restore, observe green.
 */
test("AC-13: the check-in fills its cell, holds both lines, and clears the tap floor", async ({
  page,
}) => {
  // One real window plus room for the bundle, the paint and the measurements.
  // The deadline is a module constant read at call time, so shortening it would
  // need a test-only prop; one slow case is cheaper than that prop.
  test.setTimeout(RETRY_CHECK_IN_MS + 90_000);

  // The retry request is HELD OPEN for the whole case. That is what puts the
  // cell in the check-in and keeps it there: a request that resolves mid-case
  // would delete the phase and detach the node under every `evaluate` below.
  const release: Array<() => void> = [];
  let attempts = 0;
  await page.route("**/api/asset/diagram/**", async (route) => {
    if (!route.request().url().includes("embedded-obj-1")) {
      await route.abort();
      return;
    }
    attempts += 1;
    // The FIRST attempt fails, which is what drives the cell to the failed
    // branch through the component's own error path. Every later one hangs.
    if (attempts === 1) {
      await route.abort();
      return;
    }
    await new Promise<void>((r) => release.push(r));
    await route.abort().catch(() => {});
  });

  try {
    await page.goto(baseUrl);

    const cell = page.getByTestId("diagram-slot-0");
    const failedControl = page.getByTestId("diagram-retry-0");
    // Hydration signal, not a timeout: the control exists only after React has
    // mounted and handled the error.
    await expect(failedControl).toBeVisible();
    await failedControl.click();

    const overlay = page.getByTestId("diagram-retrying-0");
    await expect(overlay).toBeVisible();
    // PREMISE, and the one this case actually turns on: it must reach the
    // CHECKED-IN phase. Measuring the `pending` overlay would pass on a build
    // where the check-in never arrives, since both phases render this node.
    await expect(overlay).toContainText("Still loading", {
      timeout: RETRY_CHECK_IN_MS + 30_000,
    });
    expect(attempts, "the retry issued a second request, and it is still unanswered").toBe(2);

    const cellBox = await cell.boundingBox();
    const overlayBox = await overlay.boundingBox();
    expect(cellBox, "the cell was measurable").not.toBeNull();
    expect(overlayBox, "the check-in overlay was measurable").not.toBeNull();
    expect(cellBox!.height, "the cell has real height to fill").toBeGreaterThan(TAP_FLOOR);

    // The cell's CONTENT box, computed the same way AC-7 computes it, and for
    // the same reason: `boundingBox()` reports the BORDER box while `inset-0`
    // resolves against the content box, so comparing them raw reports a 2px gap
    // on a component laying out correctly.
    const inner = await cell.evaluate((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        height: r.height - parseFloat(cs.borderTopWidth) - parseFloat(cs.borderBottomWidth),
        width: r.width - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth),
      };
    });

    expect(
      Math.abs(overlayBox!.height - inner.height),
      "the check-in fills the cell's content height",
    ).toBeLessThanOrEqual(TOL);
    expect(Math.abs(overlayBox!.width - inner.width), "and its width").toBeLessThanOrEqual(TOL);

    // Both lines INSIDE the button's rect. The check-in is the one in-flight
    // phase with two lines of copy, and the cell is ~117px at 30vw on a 390px
    // phone, so "it fits" is a real question rather than a formality. Asserted
    // on the rendered rects, so a line-height or gap change that overflows is
    // caught even though every class stays valid.
    const lines = overlay.locator("span");
    await expect(lines).toHaveCount(2);
    for (let i = 0; i < 2; i += 1) {
      const lineBox = await lines.nth(i).boundingBox();
      expect(lineBox, `line ${i} was measurable`).not.toBeNull();
      expect(lineBox!.y, `line ${i} starts inside the control`).toBeGreaterThanOrEqual(
        overlayBox!.y - TOL,
      );
      expect(lineBox!.y + lineBox!.height, `line ${i} ends inside the control`).toBeLessThanOrEqual(
        overlayBox!.y + overlayBox!.height + TOL,
      );
      expect(lineBox!.x, `line ${i} starts inside horizontally`).toBeGreaterThanOrEqual(
        overlayBox!.x - TOL,
      );
      expect(lineBox!.x + lineBox!.width, `line ${i} ends inside horizontally`).toBeLessThanOrEqual(
        overlayBox!.x + overlayBox!.width + TOL,
      );
    }

    // The overlay IS the tap target at the check-in: it is the element that
    // takes the Restart press. Asserted on the rendered box, so a token rename
    // cannot silently drop the floor.
    expect(overlayBox!.height, "clears the 44px tap floor").toBeGreaterThanOrEqual(TAP_FLOOR);
    expect(overlayBox!.width, "in both axes").toBeGreaterThanOrEqual(TAP_FLOOR);
  } finally {
    for (const r of release) r();
  }
});
