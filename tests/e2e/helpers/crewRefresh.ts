/**
 * tests/e2e/helpers/crewRefresh.ts: re-render a crew page the way a realtime
 * invalidation does, after a fixture wrote the database directly (crew page
 * redesign plan Task 12, spec §7 compound rows).
 *
 * In production a data change reaches an open crew page in two steps: the write
 * path calls `revalidateShow` (lib/data/showCacheTag.ts), and the broadcast that
 * follows makes `ShowRealtimeBridge` call `router.refresh()`. A fixture write
 * takes neither step. It does not bust the page's per-show `unstable_cache`
 * entry (`cachedShowData`, lib/data/getShowForViewer.ts), so a plain refresh
 * re-renders the PRE-write projection: measured 2026-10-30, a seeded show whose
 * `dates` lost a day still rendered five day buttons after `router.refresh()`.
 *
 * So these helpers take both steps:
 *   - `renderFresh` sends Next's on-demand revalidation header, which makes
 *     every `unstable_cache` read in that render miss and store the fresh value
 *     (node_modules/next/dist/server/web/spec-extension/unstable-cache.js, the
 *     `incrementalCache.isOnDemandRevalidate` bypass), the job `revalidateShow`
 *     does in production; measured the same day, the five buttons became four,
 *     and a later plain refresh kept four;
 *   - `refreshFromServer` calls the router's own `refresh()`, the bridge's call, through
 *     the handle Next exposes for debugging (`window.next.router`,
 *     node_modules/next/dist/client/components/app-router-instance.js), rather
 *     than waiting on a broadcast: local broadcast delivery is lossy (about 9%,
 *     tests/e2e/helpers/realtimeOracle.ts), and the controller cannot tell which
 *     of the two called it.
 *
 * The header's value is the build's preview id, read from the prerender manifest
 * of whichever server the run uses: `next start` after a build in CI, `next dev`
 * locally (playwright.config.ts, the :3000 webServer).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { Page } from "@playwright/test";

const PRERENDER_REVALIDATE_HEADER = "x-prerender-revalidate";

function previewModeId(): string {
  const prod = join(process.cwd(), ".next", "prerender-manifest.json");
  const dev = join(process.cwd(), ".next", "dev", "prerender-manifest.json");
  const path = process.env.CI ? prod : existsSync(dev) ? dev : prod;
  const manifest = JSON.parse(readFileSync(path, "utf8")) as {
    preview?: { previewModeId?: unknown };
  };
  const id = manifest.preview?.previewModeId;
  if (typeof id !== "string" || id.length === 0) {
    throw new Error(`crewRefresh: ${path} carries no preview.previewModeId`);
  }
  return id;
}

/**
 * From now on, every render this page asks for reads fresh data: the
 * revalidation header rides on every request, on top of the case's own extra
 * headers (`baseHeaders`, the frozen clock). Call it while the page is idle,
 * BEFORE the fixture write, and leave it on: changing a WebKit page's extra
 * headers while a request is in flight fails that request ("Load failed",
 * measured 2026-10-30), and a failed RSC fetch makes Next fall back to a full
 * document load. A write to `crew_members` also broadcasts (its statement
 * trigger), so the bridge's own refresh can be in flight at any moment after it.
 */
export async function renderFresh(page: Page, baseHeaders: Record<string, string>): Promise<void> {
  await page.setExtraHTTPHeaders({
    ...baseHeaders,
    [PRERENDER_REVALIDATE_HEADER]: previewModeId(),
  });
}

/**
 * The bridge's call, `router.refresh()`, and the wait for its response. The
 * caller then polls for the state it expects. Needs `renderFresh` first, or the
 * refresh re-renders the cached projection.
 */
export async function refreshFromServer(page: Page): Promise<void> {
  const pathname = new URL(page.url()).pathname;
  const response = page.waitForResponse(
    (r) =>
      r.request().headers()["rsc"] === "1" &&
      new URL(r.url()).pathname === pathname &&
      PRERENDER_REVALIDATE_HEADER in r.request().headers(),
    { timeout: 30_000 },
  );
  await page.evaluate(() => {
    const router = (window as unknown as { next?: { router?: { refresh?: () => void } } }).next
      ?.router;
    if (typeof router?.refresh !== "function") {
      throw new Error("crewRefresh: window.next.router.refresh is not available");
    }
    router.refresh();
  });
  // The response, not its body: the render it carries can close the sheet and
  // traverse history before the stream ends.
  await response;
}
