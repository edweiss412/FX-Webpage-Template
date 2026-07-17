/**
 * tests/e2e/collapse-panel-morph.spec.ts (Task 8 — CollapsePanel height morph)
 *
 * Real-browser assertion that the shared CollapsePanel height-morph actually
 * changes the region grid-item's rendered height: 0 when closed, > 0 when open.
 * This is the jsdom-can't-verify contract (jsdom computes no layout); the class
 * presence (grid-rows-[0fr]/[1fr], inert) is pinned separately in the jsdom
 * unit + transition-audit tests.
 *
 * Determinism: the probe runs under prefers-reduced-motion: reduce, which
 * collapses --duration-normal to 0ms (app/globals.css) so the toggle is
 * instantaneous — no mid-transition sampling / flake.
 *
 * HARNESS (standalone, no app boot, no Supabase — mirrors
 * blocked-row-resolver-transitions.spec.ts):
 *   1. bundles tests/e2e/_collapsePanelMorphLiveEntry.tsx (createRoot + the real
 *      CollapsePanel) out-of-process with a version-pinned esbuild.
 *   2. compiles the real token CSS with the Tailwind CLI over app/globals.css,
 *      with an explicit @source on CollapsePanel.tsx so grid-rows-[0fr]/[1fr],
 *      transition-[grid-template-rows], duration-normal, motion-reduce:* and the
 *      overflow-hidden utility are guaranteed present (Codex plan-review: without
 *      real CSS the morph classes are unstyled and the test would pass/fail for
 *      CSS-absence reasons, not the morph).
 *   3. serves live.html (#root + bundle.js + out.css) over node:http.
 *
 * Runs standalone via tests/e2e/standalone.config.ts:
 *   node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts \
 *     tests/e2e/collapse-panel-morph.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer, type Server } from "node:http";

const REPO_ROOT = resolve(__dirname, "..", "..");

const TOGGLE = '[data-testid="morph-toggle"]';
const PROBE = '[data-testid="morph-probe"]';

let server: Server;
let baseUrl: string;
let workDir: string;

test.beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "collapse-panel-morph-"));

  // 1. Live page: empty #root + the esbuild bundle + compiled CSS.
  writeFileSync(
    join(workDir, "live.html"),
    `<!doctype html>
<html data-theme="light">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="out.css"></head>
<body class="bg-bg"><div id="root"></div><script src="bundle.js"></script></body></html>`,
  );

  // 2. Bundle the live entry (version-pinned dlx esbuild, tsconfig path aliases).
  execFileSync(
    "pnpm",
    [
      "dlx",
      "esbuild@0.28.0",
      join(REPO_ROOT, "tests", "e2e", "_collapsePanelMorphLiveEntry.tsx"),
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

  // 3. Compile the real token CSS. @source on CollapsePanel.tsx guarantees its
  //    exact class strings (grid-rows-[0fr]/[1fr], transition-[grid-template-rows],
  //    duration-normal, motion-reduce:transition-none, overflow-hidden) are emitted.
  const entryCss = join(workDir, "entry.css");
  const globals = readFileSync(join(REPO_ROOT, "app", "globals.css"), "utf8");
  writeFileSync(
    entryCss,
    `@source "${join(REPO_ROOT, "components", "admin", "CollapsePanel.tsx")}";\n@source "${join(REPO_ROOT, "tests", "e2e", "_collapsePanelMorphLiveEntry.tsx")}";\n${globals}`,
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

async function probeHeight(page: Page): Promise<number> {
  return page.locator(PROBE).evaluate((el) => el.getBoundingClientRect().height);
}

test.describe("CollapsePanel height morph (real browser, reduced-motion)", () => {
  test.setTimeout(120_000);

  test("region grid-item height is 0 closed and > 0 open", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 640, height: 480 });
    await page.goto(baseUrl + "live.html");
    await expect(page.locator(TOGGLE)).toBeVisible();

    // CSS sanity guard: the morph utilities actually resolved (not an unstyled
    // harness) — the outer track is a real CSS grid.
    const trackDisplay = await page
      .locator(PROBE)
      .evaluate((el) => getComputedStyle(el.parentElement as HTMLElement).display);
    expect(trackDisplay, "outer track must be display:grid (compiled Tailwind loaded)").toBe(
      "grid",
    );

    // Closed: the 0fr track + overflow-hidden clamp the region to exactly 0.
    expect(await probeHeight(page)).toBe(0);

    // Open: instant under reduced-motion → height settles > 0 with no wait.
    await page.locator(TOGGLE).click();
    expect(await page.locator(TOGGLE).getAttribute("aria-expanded")).toBe("true");
    expect(await probeHeight(page)).toBeGreaterThan(0);

    // Re-collapse: back to 0.
    await page.locator(TOGGLE).click();
    expect(await probeHeight(page)).toBe(0);
  });
});
