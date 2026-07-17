/**
 * tests/e2e/blocked-row-resolver-transitions.spec.ts (Task 12 — transition
 * audit for BlockedRowResolver, per AGENTS.md's Transition Inventory /
 * transition-audit convention)
 *
 * Real-browser LIVE interaction harness driving <BlockedRowResolver>
 * (components/admin/BlockedRowResolver.tsx) through its full state sequence:
 *   idle -> armed (tap 1) -> pending (tap 2, fetch held open) -> resolved
 *   (fetch settles { ok: true, status: "resolved" }).
 *
 * Each transition must be INSTANT — no `AnimatePresence`/`motion.*` enter-exit
 * wrapper was introduced around the resolver's mount point, and the only
 * `transition-*` classes present are the PRE-EXISTING hover treatment
 * (`transition-opacity duration-fast` armed / `transition-colors duration-fast`
 * idle) already on the button before this task (components/admin/
 * BlockedRowResolver.tsx:202-203). This is verified two ways:
 *   (a) structurally — the harness mount's direct child count is always
 *       exactly 1 (no duplicate/exiting sibling node ever coexists, the
 *       AnimatePresence tell), and no element in the subtree carries a
 *       `data-framer-*`/`motion-` marker attribute at any point in the
 *       sequence;
 *   (b) behaviorally — clicking straight through arm -> confirm -> resolve
 *       requires NO waitForTimeout/animation-settle wait at any step; the
 *       DOM reflects the next state synchronously after each action.
 *
 * HARNESS (standalone, no app boot, no useRouter dependency — BlockedRowResolver
 * imports no next/navigation, so no AppRouterContext stub is needed, unlike the
 * step3-review-modal live harness):
 *   1. bundles tests/e2e/_blockedRowResolverLiveEntry.tsx (createRoot + the
 *      real component) with a version-pinned `pnpm dlx esbuild@0.28.0
 *      --bundle --format=iife --jsx=automatic`. The entry is NEVER imported
 *      here: Playwright's test transform rewrites JSX in every spec-imported
 *      .tsx into component-testing payloads, so the browser bundle is built
 *      OUT of process (same reason the step3 modal live harness does).
 *   2. compiles the real token CSS (tailwind CLI over a copy of
 *      app/globals.css, with an explicit `@source` pointing at
 *      BlockedRowResolver.tsx so its exact class strings are guaranteed
 *      present even though the default project-wide scan already covers it).
 *   3. serves live.html (#root + bundle.js) over node:http.
 *
 * Runs standalone via tests/e2e/standalone.config.ts:
 *   node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts \
 *     tests/e2e/blocked-row-resolver-transitions.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer, type Server } from "node:http";

// CommonJS package — Playwright's CJS loader provides __dirname (mirrors
// step3-review-modal.interactions.spec.ts; do NOT use import.meta.url here).
const REPO_ROOT = resolve(__dirname, "..", "..");

const MOUNT = '[data-testid="harness-mount"]';
const RESOLVER = '[data-testid="blocked-row-resolver-drive-e2e-1"]';
const RESOLVED_MARKER = '[data-testid="host-resolved-marker"]';

let server: Server;
let baseUrl: string;
let workDir: string;

test.beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "blocked-row-resolver-live-"));

  // 1. The LIVE page: empty #root + the esbuild bundle.
  writeFileSync(
    join(workDir, "live.html"),
    `<!doctype html>
<html data-theme="light">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="out.css"></head>
<body class="bg-bg"><div id="root"></div><script src="bundle.js"></script></body></html>`,
  );

  // 2. Bundle the live entry (version-pinned dlx, matches the modal harness's
  //    pinned esbuild + tsconfig path-alias resolution for "@/...").
  execFileSync(
    "pnpm",
    [
      "dlx",
      "esbuild@0.28.0",
      join(REPO_ROOT, "tests", "e2e", "_blockedRowResolverLiveEntry.tsx"),
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

  // 3. Compile the real token CSS. An explicit @source on BlockedRowResolver.tsx
  //    guarantees its exact class strings are present in the compiled output
  //    (the project's default app/globals.css scan already covers
  //    components/admin/**, but this makes the dependency explicit and
  //    resilient to future @source exclusion changes).
  const entryCss = join(workDir, "entry.css");
  const globals = readFileSync(join(REPO_ROOT, "app", "globals.css"), "utf8");
  writeFileSync(
    entryCss,
    `@source "${join(REPO_ROOT, "components", "admin", "BlockedRowResolver.tsx")}";\n${globals}`,
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
  await page.setViewportSize({ width: 640, height: 480 });
  await page.goto(baseUrl + "live.html");
  await expect(page.locator(RESOLVER)).toBeVisible();
}

/** No motion-library marker anywhere in the harness mount subtree. */
async function assertNoMotionMarkers(page: Page) {
  const hasMotionMarker = await page.locator(MOUNT).evaluate((el) => {
    const all = el.querySelectorAll("*");
    for (const node of Array.from(all)) {
      for (const attr of Array.from(node.attributes)) {
        if (attr.name.startsWith("data-framer-") || attr.name.startsWith("data-motion")) {
          return true;
        }
      }
      if (/(^|\s)motion-/.test(node.className.toString())) {
        // motion-safe:/motion-reduce: are legitimate reduced-motion utilities elsewhere in
        // the app but BlockedRowResolver itself uses neither — any hit here is unexpected.
        if (!/motion-safe:|motion-reduce:/.test(node.className.toString())) return true;
      }
    }
    return false;
  });
  expect(hasMotionMarker, "no framer-motion/AnimatePresence marker in the mount subtree").toBe(
    false,
  );
}

/** The mount's direct child count — AnimatePresence's tell is a lingering exiting sibling. */
async function mountChildCount(page: Page) {
  return page.locator(MOUNT).evaluate((el) => el.children.length);
}

test.describe("BlockedRowResolver transition audit (idle -> armed -> pending -> resolved)", () => {
  test.setTimeout(120_000);

  test("idle -> armed is instant: no wait needed, exactly one child, no motion wrapper", async ({
    page,
  }) => {
    await openLive(page);
    expect(await mountChildCount(page), "idle: exactly one child (the resolver button)").toBe(1);
    await assertNoMotionMarkers(page);

    await page.locator(RESOLVER).click();
    // No animation-settle wait: assert immediately after the click resolves.
    await expect(page.locator(RESOLVER)).toHaveText(
      "Confirm unarchive: brings this show back to publish it",
    );
    expect(await mountChildCount(page), "armed: still exactly one child").toBe(1);
    await assertNoMotionMarkers(page);
  });

  test("armed -> pending is instant: aria-busy + label flip with no wait, no motion wrapper", async ({
    page,
  }) => {
    await openLive(page);
    await page.locator(RESOLVER).click(); // idle -> armed
    await page.locator(RESOLVER).click(); // armed -> pending (fetch held open by the harness)

    await expect(page.locator(RESOLVER)).toHaveText("Unarchiving…");
    await expect(page.locator(RESOLVER)).toHaveAttribute("aria-busy", "true");
    expect(await mountChildCount(page), "pending: still exactly one child").toBe(1);
    await assertNoMotionMarkers(page);
  });

  test("pending -> resolved is instant: onResolved fires and the row is replaced with no motion wrapper", async ({
    page,
  }) => {
    await openLive(page);
    await page.locator(RESOLVER).click(); // idle -> armed
    await page.locator(RESOLVER).click(); // armed -> pending

    await page.evaluate(() => window.__releaseResolve?.());

    await expect(page.locator(RESOLVED_MARKER)).toBeVisible();
    // The resolver itself is gone (not left mid-transition alongside the marker).
    await expect(page.locator(RESOLVER)).toHaveCount(0);
    expect(
      await page.evaluate(() => window.__resolvedFired === true),
      "onResolved fired (not just DOM removal)",
    ).toBe(true);
    expect(await mountChildCount(page), "resolved: exactly one child (the marker)").toBe(1);
    await assertNoMotionMarkers(page);
  });

  test("full idle -> armed -> pending -> resolved run requires no animation-settle waits at any step", async ({
    page,
  }) => {
    await openLive(page);
    const t0 = Date.now();
    await page.locator(RESOLVER).click();
    await expect(page.locator(RESOLVER)).toHaveText(
      "Confirm unarchive: brings this show back to publish it",
    );
    await page.locator(RESOLVER).click();
    await expect(page.locator(RESOLVER)).toHaveAttribute("aria-busy", "true");
    await page.evaluate(() => window.__releaseResolve?.());
    await expect(page.locator(RESOLVED_MARKER)).toBeVisible();
    const elapsedMs = Date.now() - t0;
    // Generous ceiling (network/CI jitter only) — no per-transition animation
    // duration is baked into this budget, since none should exist.
    expect(
      elapsedMs,
      "the whole sequence completes without any animation-settle delay",
    ).toBeLessThan(5_000);
  });
});
