/**
 * tests/e2e/helpers/crewOfflineFixture.ts: the Playwright fixture the crew
 * offline specs take `test` from (spec §7), plus the steps every case shares.
 *
 * One proxy per worker (crewOfflineProxy.ts) sits between the browser and the
 * production server on E2E_PORT, and `reset()` runs before every case, so a
 * case's stub (case 14's /sw.js) or refusal predicate (case 7's) never reaches
 * the next one. Every case gets:
 *
 *   - `origin`: the proxy origin to navigate to, never the project baseURL.
 *     Chromium gets the plain-http listener (loopback http is a secure
 *     context there), WebKit the https one (WebKit stores the `__Host-` picker
 *     cookie only over https, spike Q2). The engine is read HERE, from
 *     Playwright's own fixture, because the CI wiring guard
 *     (tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts,
 *     expectNoUndeclaredProjectGate) refuses any spec that names the engine
 *     or the project, strings included; the specs therefore never branch on
 *     either, and every case asserts the same things under both.
 *   - `crewContext` / `crewPage`: one ephemeral `browser.newContext()` per
 *     case. Never a persistent context (the spike measured WebKit persistent
 *     contexts losing Cache Storage) and never `context.setOffline` (spike M1:
 *     unreliable for workers); "offline" is the proxy refusing.
 *
 * `assertServerUnderTest` is each spec's `beforeAll`: the run must be the CI
 * production build (`CI=1` makes the baseline webServer `pnpm build && pnpm
 * start`), and /sw.js through the proxy must equal the committed SW_SOURCE, so
 * a stale or foreign server on the port fails loudly instead of testing other
 * code.
 *
 * Readiness, before any case asserts (writing-plans checklist b):
 * `pickAndSave` waits for the crew shell, the bar's own hydration signal on
 * `<html>`, worker control, and the committed copy. Nothing here waits on
 * `networkidle`, and every page read is document-level and re-acquired after
 * each navigation (savedCopyProbe.ts).
 */
import { test as base, expect, type BrowserContext, type Page } from "@playwright/test";

import { SW_SOURCE } from "@/lib/offline/__generated__/swSource";

import { startCrewOfflineProxy, type CrewOfflineProxy } from "./crewOfflineProxy";
import {
  readSavedCopies,
  waitForCrewHydrated,
  waitForSavedCopy,
  waitForWorkerControl,
  type SavedCopyRecord,
} from "./savedCopyProbe";

export { expect };

/** The "not saved yet" page (spec 4.7.5), verbatim. */
export const NOT_SAVED_HEADING = "No signal, and this show isn't saved on this phone yet.";
export const NOT_SAVED_BODY =
  "Open this link once while you have signal or wifi. After that it works here even with no signal.";
export const NOT_SAVED_NOTE = "This page reloads by itself once it can reach the server.";
export const NOT_SAVED_RETRY = "Try again";

/** Server actions (selectIdentity, the realtime refresh) on a cold production server. */
const AFTER_SERVER_ACTION = { timeout: 30_000 };

type WorkerFixtures = { crewOfflineProxy: CrewOfflineProxy };

type CaseFixtures = {
  /**
   * The worker's proxy, reset to `pass` with no predicate and no stubs before
   * this case. Not named `proxy`: that is Playwright's own context option.
   */
  crewProxy: CrewOfflineProxy;
  /** The proxy origin this engine navigates to. */
  origin: string;
  crewContext: BrowserContext;
  crewPage: Page;
};

function upstreamPort(): number {
  const port = Number(process.env.E2E_PORT ?? "3000");
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`crew offline e2e: E2E_PORT is not a port: ${process.env.E2E_PORT}`);
  }
  return port;
}

// The fixture callback's second argument is named `provide`, not `use`: eslint's
// react-hooks rule reads a bare `use(...)` as React's hook
// (tests/e2e/helpers/fontFidelityFixture.ts carries the same note).
export const test = base.extend<CaseFixtures, WorkerFixtures>({
  crewOfflineProxy: [
    // Playwright reads the fixtures a callback needs from its first parameter's
    // destructuring pattern, so an empty pattern is the declared "none".
    async ({}, provide) => {
      const proxy = await startCrewOfflineProxy({ upstreamPort: upstreamPort() });
      try {
        await provide(proxy);
      } finally {
        await proxy.close();
      }
    },
    { scope: "worker" },
  ],
  crewProxy: async ({ crewOfflineProxy }, provide) => {
    crewOfflineProxy.reset();
    await provide(crewOfflineProxy);
    // Releases anything the case left held, so it cannot answer into the next case.
    crewOfflineProxy.reset();
  },
  origin: async ({ crewProxy, browserName }, provide) => {
    await provide(browserName === "webkit" ? crewProxy.httpsOrigin : crewProxy.httpOrigin);
  },
  crewContext: async ({ browser }, provide) => {
    const context = await browser.newContext();
    try {
      await provide(context);
    } finally {
      await context.close();
    }
  },
  crewPage: async ({ crewContext }, provide) => {
    await provide(await crewContext.newPage());
  },
});

/**
 * The beforeAll guard (writing-plans checklist a). Throws unless the run is the
 * CI production build and the server behind the proxy serves the committed
 * worker byte for byte.
 */
export async function assertServerUnderTest(proxy: CrewOfflineProxy): Promise<void> {
  if (!process.env.CI) {
    throw new Error(
      "crew offline e2e: run with CI=1, which makes the baseline webServer a production build " +
        "(pnpm build && pnpm start); a dev server bundles and serves pages differently",
    );
  }
  const response = await fetch(`${proxy.httpOrigin}/sw.js`, { cache: "no-store" });
  const body = await response.text();
  if (response.status !== 200 || body !== SW_SOURCE) {
    const at = [...body].findIndex((char, i) => char !== SW_SOURCE[i]);
    throw new Error(
      `crew offline e2e: the server on E2E_PORT ${upstreamPort()} is not this checkout's build: ` +
        `/sw.js answered ${response.status} with ${body.length} chars, the committed SW_SOURCE ` +
        `has ${SW_SOURCE.length}, first difference at ${at}. A stale server is holding the port.`,
    );
  }
}

/** A show's crew URL path, `/show/<slug>/<token>`. */
export function crewUrlPath(show: { slug: string; shareToken: string }): string {
  return `/show/${show.slug}/${show.shareToken}`;
}

/**
 * Picks `crewMemberId` on the picker at `?gate=skip` (the picker-flow
 * precedent), then waits for the whole first-visit chain: the crew shell, the
 * bar's hydration signal, the worker taking control, and the registrar's
 * `ensure-saved` committing a copy of the show at this path.
 */
export async function pickAndSave(
  page: Page,
  origin: string,
  target: { showId: string; path: string; crewMemberId: string },
): Promise<SavedCopyRecord> {
  await page.goto(`${origin}${target.path}?gate=skip`);
  await expect(page.getByTestId("picker-interstitial-root")).toBeVisible(AFTER_SERVER_ACTION);
  await page
    .locator(`[data-testid="picker-roster-row"][data-crew-member-id="${target.crewMemberId}"]`)
    .click();
  return waitForSaved(page, target);
}

/** The first-visit chain from the crew shell on: hydrated, controlled, saved. */
export async function waitForSaved(
  page: Page,
  target: { showId: string; path: string },
): Promise<SavedCopyRecord> {
  await waitForCrewHydrated(page);
  await waitForWorkerControl(page);
  return waitForSavedCopy(page, { showId: target.showId, url: target.path });
}

/** The worker's "not saved yet" page is on screen. */
export async function expectNotSavedPage(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { level: 1, name: NOT_SAVED_HEADING })).toBeVisible();
}

/** Every copy the worker holds for `showId`, polled until the worker's purge has landed. */
export async function expectNoCopyOf(page: Page, showId: string): Promise<void> {
  await expect
    .poll(
      async () => (await readSavedCopies(page)).copies.filter((copy) => copy.showId === showId),
      { message: `the saved copy of show ${showId} is gone`, timeout: 15_000 },
    )
    .toEqual([]);
}

/** Opens the avatar menu once the trigger answers (it is a client island). */
export async function openAvatarMenu(page: Page): Promise<void> {
  const trigger = page.getByTestId("avatar-menu-trigger");
  await expect(async () => {
    await trigger.click();
    await expect(page.getByTestId("avatar-menu-popover")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}

/** The saved-copy bar's state and copy, as `deriveBarView` rendered them. */
export function savedCopyBar(page: Page) {
  return {
    bar: page.getByTestId("saved-copy-bar"),
    content: page.getByTestId("saved-copy-bar-content"),
  };
}
