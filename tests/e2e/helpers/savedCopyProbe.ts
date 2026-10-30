/**
 * tests/e2e/helpers/savedCopyProbe.ts: what the crew offline e2e reads from
 * the page about the worker's saved copies (spec §7).
 *
 * Every function is document-level (`page.evaluate`, `page.waitForFunction`)
 * and holds nothing across a navigation, so each is safe to call again after a
 * reload. The database, store and cache names come from the worker's own
 * schema module (`lib/offline/storeSchema.ts`) and reach the page as
 * `evaluate` arguments: a browser-side function cannot see Node imports.
 *
 * Reading must not create what it reads. Opening an IndexedDB database that
 * does not exist creates it, so `readSavedCopies` opens the saved-copy
 * database only when `indexedDB.databases()` lists it with a version above 0,
 * and aborts the open if it would upgrade anyway (deleted in between). The
 * listing comes first because the abort alone is not clean in WebKit: it
 * leaves a version-0 entry in `indexedDB.databases()` (Chromium leaves none,
 * measured for this helper). Assert absence through `database`, never through
 * a raw `indexedDB.databases()` read. `caches.open` also creates, so only cache
 * names that `caches.keys()` already lists are opened. A cache deleted between
 * those two calls would be recreated empty; no case reads while the worker
 * deletes.
 */
import { setTimeout as sleep } from "node:timers/promises";

import type { Page } from "@playwright/test";

import { crewPath } from "@/lib/offline/crewUrl";
import type { StoredCopy } from "@/lib/offline/store";
import { CACHE_PREFIX, COPIES_STORE, DB_NAME, STATIC_CACHE } from "@/lib/offline/storeSchema";

/** A saved copy as the worker stored it, without its HTML. */
export type SavedCopyRecord = Omit<StoredCopy, "html">;

export type SavedCopyState = {
  /** False when the saved-copy database does not exist (never created, or deleted). */
  database: boolean;
  copies: SavedCopyRecord[];
  /** Every Cache Storage cache whose name starts with CACHE_PREFIX, with the URLs it holds. */
  caches: Record<string, string[]>;
};

/** The marker `SavedCopyBar` sets on `<html>` once it has its readings (components/offline/SavedCopyBar.tsx:94). */
const BAR_MOUNTED = 'html[data-fxav-bar="mounted"]';

/** What a poisoned script runs: a flag the case can check, then a throw. */
const POISONED_SCRIPT =
  'self.__fxavScriptBlocked = true; throw new Error("fxav e2e: poisoned script");';

const DEFAULT_TIMEOUT_MS = 30_000;
const POLL_MS = 250;

type Options = { timeoutMs?: number };

/** The crew shell is on screen and the saved-copy bar has hydrated. */
export async function waitForCrewHydrated(page: Page, options: Options = {}): Promise<void> {
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  try {
    await page.getByTestId("crew-shell").waitFor({ state: "visible", timeout });
  } catch (error) {
    throw new Error(`readiness gate: crew-shell not visible within ${timeout} ms`, {
      cause: error,
    });
  }
  try {
    await page.waitForFunction(
      (selector) => document.querySelector(selector) !== null,
      BAR_MOUNTED,
      {
        timeout,
      },
    );
  } catch (error) {
    throw new Error(`readiness gate: ${BAR_MOUNTED} not present within ${timeout} ms`, {
      cause: error,
    });
  }
}

/** The page is controlled by a service worker. */
export async function waitForWorkerControl(page: Page, options: Options = {}): Promise<void> {
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  try {
    await page.waitForFunction(() => navigator.serviceWorker?.controller != null, undefined, {
      timeout,
    });
  } catch (error) {
    throw new Error(
      `readiness gate: no service worker controlled the page within ${timeout} ms ` +
        `(navigator.serviceWorker.controller stayed null)`,
      { cause: error },
    );
  }
}

/** The saved-copy database's copies and the worker's caches, as the page sees them. */
export function readSavedCopies(page: Page): Promise<SavedCopyState> {
  return page.evaluate(
    async ({ dbName, copiesStore, cachePrefix }) => {
      const listed = (await indexedDB.databases()).some(
        (info) => info.name === dbName && (info.version ?? 0) > 0,
      );
      const copies = await new Promise<Array<Record<string, unknown>> | null>((resolve, reject) => {
        if (!listed) {
          resolve(null);
          return;
        }
        const open = indexedDB.open(dbName);
        let absent = false;
        open.onupgradeneeded = () => {
          absent = true;
          open.transaction?.abort();
        };
        open.onerror = (event) => {
          event.preventDefault();
          if (absent) resolve(null);
          else reject(open.error);
        };
        open.onsuccess = () => {
          const db = open.result;
          db.onversionchange = () => db.close();
          if (!db.objectStoreNames.contains(copiesStore)) {
            db.close();
            resolve([]);
            return;
          }
          const all = db.transaction(copiesStore, "readonly").objectStore(copiesStore).getAll();
          all.onsuccess = () => {
            db.close();
            resolve(all.result as Array<Record<string, unknown>>);
          };
          all.onerror = () => {
            db.close();
            reject(all.error);
          };
        };
      });
      const byName: Record<string, string[]> = {};
      for (const name of await self.caches.keys()) {
        if (!name.startsWith(cachePrefix)) continue;
        const cache = await self.caches.open(name);
        byName[name] = (await cache.keys()).map((request) => request.url);
      }
      return {
        database: copies !== null,
        copies: (copies ?? []).map(({ html: _html, ...rest }) => rest),
        caches: byName,
      };
    },
    { dbName: DB_NAME, copiesStore: COPIES_STORE, cachePrefix: CACHE_PREFIX },
  ) as Promise<SavedCopyState>;
}

/**
 * Waits until the worker has committed a copy of `showId` under `url` (a crew
 * URL or path; it is reduced to the crew path the worker keys copies by) and
 * returns that copy. Transient evaluate failures during a navigation retry.
 */
export async function waitForSavedCopy(
  page: Page,
  target: { showId: string; url: string },
  options: Options = {},
): Promise<SavedCopyRecord> {
  const path = crewPath(new URL(target.url, "http://127.0.0.1").pathname);
  if (path === null) throw new Error(`waitForSavedCopy: not a crew URL: ${target.url}`);
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const deadline = Date.now() + timeout;
  let last = "nothing read yet";
  for (;;) {
    try {
      const state = await readSavedCopies(page);
      const found = state.copies.find((c) => c.showId === target.showId && c.url === path);
      if (found !== undefined) return found;
      last = state.database
        ? `copies ${JSON.stringify(state.copies.map((c) => [c.showId, c.url]))}`
        : "no saved-copy database";
    } catch (error) {
      last = `read failed: ${error instanceof Error ? error.message : String(error)}`;
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `readiness gate: no saved copy of show ${target.showId} at ${path} within ${timeout} ms (${last})`,
      );
    }
    await sleep(POLL_MS);
  }
}

/**
 * Overwrites every `/_next/static/**` script in the worker's static cache with
 * a body that sets `self.__fxavScriptBlocked = true` and throws. Overwriting,
 * not deleting: on a miss the worker would refetch, and the browser's HTTP
 * cache holds these immutable URLs and would answer even with the proxy
 * refusing. Returns the URLs it poisoned, and throws when there were none.
 */
export async function poisonStaticScripts(page: Page): Promise<string[]> {
  const poisoned = await page.evaluate(
    async ({ staticCache, body }) => {
      if (!(await self.caches.has(staticCache))) return null;
      const cache = await self.caches.open(staticCache);
      const urls: string[] = [];
      for (const request of await cache.keys()) {
        const { pathname } = new URL(request.url);
        if (!pathname.startsWith("/_next/static/") || !pathname.endsWith(".js")) continue;
        await cache.put(
          request,
          new Response(body, {
            headers: { "content-type": "application/javascript; charset=utf-8" },
          }),
        );
        urls.push(request.url);
      }
      return urls;
    },
    { staticCache: STATIC_CACHE, body: POISONED_SCRIPT },
  );
  if (poisoned === null) throw new Error(`poisonStaticScripts: no ${STATIC_CACHE} cache to poison`);
  if (poisoned.length === 0) {
    throw new Error(`poisonStaticScripts: ${STATIC_CACHE} holds no /_next/static/ script`);
  }
  return poisoned;
}
