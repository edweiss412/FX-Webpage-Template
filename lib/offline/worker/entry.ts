/**
 * The service worker's entry point (spec 4.1, 4.9). `pnpm gen:sw` bundles this
 * file into lib/offline/__generated__/swSource.ts, and /sw.js serves that
 * string. It wires the browser's real objects into the handlers in install.ts;
 * everything the worker decides lives there, so there is nothing to test here
 * beyond the bundle itself (tests/lib/offline/swSourceFreshness.test.ts).
 *
 * Nothing imports this module: importing it would install a worker on whatever
 * `self` is.
 */
import { createIdbStore } from "@/lib/offline/idbStore";
import { installWorker, type WorkerDeps } from "@/lib/offline/worker/install";
import type { Clients, WorkerScope } from "@/lib/offline/worker/swTypes";

/**
 * The repo's tsconfig carries the `dom` lib and not `webworker`, so `self` is
 * typed as a Window. It is the worker's global scope here, which has the
 * members `WorkerScope` lists plus `clients`.
 */
const scope = self as unknown as WorkerScope & { readonly clients: Clients };

function realDeps(): WorkerDeps {
  return {
    store: createIdbStore(indexedDB),
    cacheStorage: caches,
    // Wrapped, not passed: the handlers call `deps.fetch(...)`, which would run
    // the native `fetch` with `deps` as its receiver, and browsers refuse that.
    fetch: (input, init) => fetch(input, init),
    now: () => Date.now(),
    clients: scope.clients,
    timers: {
      setTimeout: (callback, ms) => self.setTimeout(callback, ms),
      clearTimeout: (handle) => self.clearTimeout(handle),
    },
  };
}

installWorker(scope, realDeps());
