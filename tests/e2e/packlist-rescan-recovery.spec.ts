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
 * NOT RUNNABLE AS CHECKED IN (2026-07-26). This spec was removed from
 * `tests/e2e/standalone.config.ts`'s `testMatch`, and no other Playwright
 * project collects it — the command that used to run it now exits 1 with
 * "No tests found". It is kept in the tree because the harness and assertions
 * are still the right ones once the blocker is resolved.
 *
 * WHY it was removed: its live entry reaches the whole server tree —
 * step3ReviewSections -> UseRawControlBoundary -> a `"use server"` module ->
 * runScheduledCronSync -> googleapis (913 graph inputs), with
 * lib/sync/lockedShowTx reaching postgres by a parallel edge. No per-module
 * alias list fixes it (a 4-entry list leaves 78 errors; stubbing the one
 * action boundary still leaves ten lib/sync modules pulling postgres), and an
 * unfiltered CI job cannot carry a red spec.
 *
 * TO RUN IT AGAIN you must first resolve BL-HARNESS-PACKLIST-SERVER-GRAPH in
 * BACKLOG.md — either a graph-derived resolver (BL-HARNESS-RESOLVER-POLICY) or
 * a trimmed import graph for step3ReviewSections — and then re-add this file
 * to the standalone config's `testMatch`.
 */
import { test, expect } from "@playwright/test";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer, type Server } from "node:http";
import { bundleLiveEntry } from "./helpers/liveEntryToolchain";

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

  bundleLiveEntry({
    entry: join(REPO_ROOT, "tests", "e2e", "_packListRescanLiveEntry.tsx"),
    outFile: join(workDir, "bundle.js"),
  });

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
