/**
 * tests/e2e/packlist-rescan-recovery.spec.ts (PSAT-1 Task 6)
 *
 * Real-browser assertion of the S5 archived-tab re-scan recovery state
 * (spec §3.4). Renders the REAL <PackListBreakdown> in the S5 accept-stale case
 * (durable override set + preview tab present-but-not-included) and verifies, in
 * a real DOM, that:
 *   - the recovery note copy renders ("Your change was saved, but this preview is
 *     out of date." + "Re-scan to refresh it.");
 *   - the RescanSheetButton renders and is keyboard-focusable;
 *   - no raw §12.4 code substring leaks into the visible copy;
 *   - the rendered copy carries no em dash (DESIGN.md §UI-copy).
 *
 * jsdom (Task 4/5 unit tests) pins the divergence/state-machine + freeze
 * behavior; this pins the actual rendered DOM + real focus.
 *
 * HARNESS (standalone, no app boot, no Supabase — mirrors
 * collapse-panel-morph.spec.ts, minus the Tailwind compile these DOM/text/focus
 * checks do not need):
 *   1. bundles tests/e2e/_packListRescanLiveEntry.tsx (createRoot + the real
 *      PackListBreakdown wrapped in AppRouterContext) out-of-process with a
 *      version-pinned esbuild.
 *   2. serves live.html (#root + bundle.js) over node:http.
 *
 * Runs standalone via tests/e2e/standalone.config.ts:
 *   node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts \
 *     tests/e2e/packlist-rescan-recovery.spec.ts
 */
import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer, type Server } from "node:http";

const REPO_ROOT = resolve(__dirname, "..", "..");
const RECOVERY = '[data-testid="pack-list-rescan-needed-drive-1"]';

let server: Server;
let baseUrl: string;
let workDir: string;

test.beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "packlist-rescan-recovery-"));

  writeFileSync(
    join(workDir, "live.html"),
    `<!doctype html>
<html data-theme="light">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body><div id="root"></div><script src="bundle.js"></script></body></html>`,
  );

  execFileSync(
    "pnpm",
    [
      "dlx",
      "esbuild@0.28.0",
      join(REPO_ROOT, "tests", "e2e", "_packListRescanLiveEntry.tsx"),
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

  server = createServer((req, res) => {
    const url = (req.url ?? "/").split("?")[0] ?? "/";
    const file = url === "/" || url === "" ? "live.html" : url.replace(/^\//, "");
    try {
      const body = readFileSync(join(workDir, file));
      res.setHeader("content-type", file.endsWith(".js") ? "text/javascript" : "text/html");
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

test.describe("PackListBreakdown S5 re-scan recovery (real browser)", () => {
  test.setTimeout(120_000);

  test("renders the recovery note + a focusable Re-scan button, no raw code, no em dash", async ({
    page,
  }) => {
    await page.goto(baseUrl + "live.html");
    const recovery = page.locator(RECOVERY);
    await expect(recovery).toBeVisible();

    // Note copy (spec §3.4).
    const text = (await recovery.innerText()).trim();
    expect(text).toContain("Your change was saved, but this preview is out of date.");
    expect(text).toContain("Re-scan to refresh it.");

    // The RescanSheetButton renders and is keyboard-focusable.
    const button = recovery.getByRole("button", { name: /re-scan/i });
    await expect(button).toBeVisible();
    await button.focus();
    const focused = await button.evaluate((el) => el === document.activeElement);
    expect(focused).toBe(true);

    // Invariant 5: no raw §12.4 code substring leaks into the visible copy.
    // Codes are SHOUTY_SNAKE (≥6 chars, all-caps + underscore); the recovery
    // copy is plain English, so no such token should appear.
    expect(text).not.toMatch(/[A-Z]{2,}_[A-Z_]{3,}/);

    // Copy rule (DESIGN.md §UI-copy): no em dash.
    expect(text).not.toContain("—");
  });
});
