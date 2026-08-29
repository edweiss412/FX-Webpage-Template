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

import { expect, test } from "@playwright/test";

import { bundleLiveEntry, compileEntryCss } from "./helpers/liveEntryToolchain";

const REPO_ROOT = resolve(__dirname, "..", "..");
const TOL = 0.5;
/** The spec's floor, in px. Named so the assertion reads as the rule it enforces. */
const TAP_FLOOR = 44;

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
