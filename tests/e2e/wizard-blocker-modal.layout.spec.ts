/**
 * tests/e2e/wizard-blocker-modal.layout.spec.ts (spec 2026-07-17 §8 / plan Task 7)
 *
 * REAL-BROWSER layout invariants for the finalize BLOCKER MODAL. jsdom computes
 * no layout, so the two things Doug's bug and §7a require are proven here:
 *
 *   1. NO FOOTER GROWTH (the reported regression): opening the modal must NOT
 *      change the sticky footer's height — the modal is out of flow (portaled,
 *      fixed). Measured idle → cas_per_row.
 *   2. VIEWPORT-PINNED + TOP-OF-STACK: the panel sits inside the viewport and is
 *      capped at 85vh (max-h-[85vh]); with an app-root `z-50` review stand-in
 *      present, elementFromPoint at the panel's centre resolves INSIDE the modal
 *      (portal-to-body z-50 beats the app-root z-50) — the §7a stacking proof.
 *
 * HARNESS (standalone, no app boot — mirrors blocked-row-resolver-transitions):
 *   1. bundles tests/e2e/_wizardBlockerModalLiveEntry.tsx (createRoot + the real
 *      exported <FinalizeStatusRegion> inside a real <WizardFooter>) with a
 *      version-pinned esbuild;
 *   2. compiles the real token CSS (tailwind CLI over app/globals.css, with an
 *      explicit @source on FinalizeButton.tsx so the modal's class strings are
 *      present);
 *   3. serves live.html (#root + bundle.js) over node:http.
 *
 * Runs standalone via tests/e2e/standalone.config.ts:
 *   node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts \
 *     tests/e2e/wizard-blocker-modal.layout.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer, type Server } from "node:http";

const REPO_ROOT = resolve(__dirname, "..", "..");

const FOOTER_INNER = '[data-testid="wizard-footer-inner"]';
const MODAL = '[data-testid="wizard-finalize-blocker-modal"]';
const PANEL = '[data-testid="wizard-finalize-blocker-panel"]';
const FLIP = '[data-testid="flip-to-blocker"]';

let server: Server;
let baseUrl: string;
let workDir: string;

test.beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "wizard-blocker-modal-live-"));

  writeFileSync(
    join(workDir, "live.html"),
    `<!doctype html>
<html data-theme="light">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="out.css"></head>
<body class="bg-bg"><div id="root"></div><script src="bundle.js"></script></body></html>`,
  );

  execFileSync(
    "pnpm",
    [
      "dlx",
      "esbuild@0.28.0",
      join(REPO_ROOT, "tests", "e2e", "_wizardBlockerModalLiveEntry.tsx"),
      "--bundle",
      "--format=iife",
      "--jsx=automatic",
      "--loader:.tsx=tsx",
      '--define:process.env.NODE_ENV="production"',
      "--external:node:fs",
      `--tsconfig=${join(REPO_ROOT, "tsconfig.json")}`,
      '--banner:js=window.process=window.process||{env:{NODE_ENV:"production"}};',
      `--outfile=${join(workDir, "bundle.js")}`,
    ],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 180_000 },
  );

  const entryCss = join(workDir, "entry.css");
  const globals = readFileSync(join(REPO_ROOT, "app", "globals.css"), "utf8");
  writeFileSync(
    entryCss,
    `@source "${join(REPO_ROOT, "components", "admin", "FinalizeButton.tsx")}";\n@source "${join(REPO_ROOT, "components", "admin", "wizard", "WizardFooter.tsx")}";\n${globals}`,
  );
  execFileSync(
    "pnpm",
    ["dlx", "@tailwindcss/cli@4.2.4", "-i", entryCss, "-o", join(workDir, "out.css")],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 120_000 },
  );

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
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (addr && typeof addr === "object") baseUrl = `http://127.0.0.1:${addr.port}/`;
});

test.afterAll(async () => {
  if (server) await new Promise<void>((r) => server.close(() => r()));
});

async function openLive(page: Page) {
  // 390px — the mobile bottom-sheet layout Doug hits on the venue floor.
  await page.setViewportSize({ width: 390, height: 800 });
  // Reduced motion so the entrance keyframe collapses and geometry is stable on
  // load (matches step3-review-modal.layout.spec.ts).
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(baseUrl + "live.html");
  await expect(page.locator(FLIP)).toBeVisible();
}

test.describe("finalize blocker modal — real-browser layout (spec §8)", () => {
  test.setTimeout(120_000);

  test("opening the modal does NOT change the sticky footer height (no layout shift)", async ({
    page,
  }) => {
    await openLive(page);
    const idleHeight = await page
      .locator(FOOTER_INNER)
      .evaluate((el) => el.getBoundingClientRect().height);
    await page.locator(FLIP).click();
    await expect(page.locator(MODAL)).toBeVisible();
    const openHeight = await page
      .locator(FOOTER_INNER)
      .evaluate((el) => el.getBoundingClientRect().height);
    expect(Math.abs(openHeight - idleHeight)).toBeLessThanOrEqual(0.5);
  });

  test("panel is viewport-pinned and capped at 85vh; it paints above an app-root z-50 dialog", async ({
    page,
  }) => {
    await openLive(page);
    await page.locator(FLIP).click();
    await expect(page.locator(PANEL)).toBeVisible();

    const metrics = await page.locator(PANEL).evaluate((el) => {
      const r = el.getBoundingClientRect();
      const cx = r.x + r.width / 2;
      const cy = r.y + r.height / 2;
      const hit = document.elementFromPoint(cx, cy);
      const modal = document.querySelector('[data-testid="wizard-finalize-blocker-modal"]');
      return {
        top: r.top,
        bottom: r.bottom,
        height: r.height,
        innerHeight: window.innerHeight,
        hitInsideModal: !!(hit && modal && modal.contains(hit)),
      };
    });

    // Viewport-pinned (fixed, not confined to a transformed/scroll ancestor).
    expect(metrics.top).toBeGreaterThanOrEqual(0);
    expect(metrics.bottom).toBeLessThanOrEqual(metrics.innerHeight + 0.5);
    // max-h-[85vh] cap holds even with 30 rows.
    expect(metrics.height).toBeLessThanOrEqual(0.85 * metrics.innerHeight + 0.5);
    // Top-of-stack over the app-root z-50 review stand-in.
    expect(metrics.hitInsideModal).toBe(true);
  });

  test("focus continuity: on dismiss, focus returns to the element focused before the blocker (real inert)", async ({
    page,
  }) => {
    await openLive(page);
    // Focus an element in the app-root subtree, then open the blocker WITHOUT a
    // click (via the state hook) so this element stays the previously-focused one.
    await page.locator('[data-testid="review-focusable"]').focus();
    await expect(page.locator('[data-testid="review-focusable"]')).toBeFocused();
    await page.evaluate(() => window.__setKind?.("cas_per_row"));
    await expect(page.locator(PANEL)).toBeVisible();
    // While the blocker is open the background is inert, so the underlying button
    // no longer holds focus (real browsers blur inert descendants).
    await expect(page.locator('[data-testid="review-focusable"]')).not.toBeFocused();
    // Dismiss (Back) → the inert effect un-inerts THEN restores focus to it.
    await page.locator('[data-testid="wizard-finalize-blocker-dismiss"]').click();
    await expect(page.locator(MODAL)).toHaveCount(0);
    await expect(page.locator('[data-testid="review-focusable"]')).toBeFocused();
  });
});
