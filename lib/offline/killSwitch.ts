/**
 * The saved-copy kill switch (spec 4.10).
 *
 * `CREW_OFFLINE_DISABLED=1` in the Vercel project environment turns the feature
 * off with no code change: /sw.js then serves KILL_SWITCH_SOURCE instead of the
 * bundled worker, and the next update check swaps it in. This module is
 * server-only; the worker bundle must never reach it (the bundle allowlist in
 * tests/lib/offline/swSourceFreshness.test.ts lists it).
 */
import { CACHE_PREFIX, DB_NAME } from "@/lib/offline/storeSchema";

/** `1` disables; any other value, including unset, `0` and `true`, leaves the feature on. */
export function crewOfflineDisabled(env: Readonly<Record<string, string | undefined>>): boolean {
  return env.CREW_OFFLINE_DISABLED === "1";
}

/**
 * A worker that removes everything the real worker owns and then itself. It
 * registers no `fetch` listener, so once it is active every request goes to the
 * network and no page is served from a saved copy.
 *
 * The names come from storeSchema.ts, so a renamed prefix or database cannot
 * leave this worker deleting the wrong things. Each step is independent: a
 * failed cache or database delete must not keep the worker registered, and a
 * rejection from `waitUntil` would fail the activation and leave the previous
 * worker in charge, which is the one outcome a kill switch cannot allow.
 * `deleteDatabase` also settles on `blocked`, since an open connection elsewhere
 * would otherwise hold this activation open; the delete stays queued with the
 * browser and finishes when that connection closes.
 */
export const KILL_SWITCH_SOURCE: string = `"use strict";
const CACHE_PREFIX = ${JSON.stringify(CACHE_PREFIX)};
const DB_NAME = ${JSON.stringify(DB_NAME)};

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

async function deleteCaches() {
  const names = await caches.keys();
  await Promise.all(
    names
      .filter((name) => name.startsWith(CACHE_PREFIX))
      .map((name) => caches.delete(name).catch(() => false)),
  );
}

function deleteDatabase() {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  });
}

async function attempt(step) {
  try {
    await step();
  } catch (_) {
    // Best effort: the steps below must still run.
  }
}

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await attempt(deleteCaches);
      await attempt(deleteDatabase);
      await attempt(() => self.registration.unregister());
    })(),
  );
});
`;
