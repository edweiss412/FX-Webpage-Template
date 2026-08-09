/**
 * tests/e2e/_tapTargetFloorNodeShims.ts
 * (spec 2026-08-07-step3-a11y-cluster §8 — the tap-target live entry's own shim)
 *
 * MUST be the FIRST import of `_tapTargetFloorLiveEntry.tsx`. Import order is
 * evaluation order, and this file only works if it runs before the component
 * graph is pulled in.
 *
 * WHY IT EXISTS. `tests/e2e/_step3ReviewModalBundle.mjs` maps every Node builtin
 * to an empty CJS module, on the stated premise that the stubbed bindings are
 * "never called on the harness render path". `lib/log/requestContext.ts:15`
 * violates that premise: it calls `new AsyncLocalStorage()`, and a CONSTRUCTOR
 * call on `undefined` throws. Spec §1.1 R10 records exactly this failure for the
 * `/me` page and answers it by extracting the render half — which removed that
 * path and, the spec believed, the last one.
 *
 * MEASURED: it was not the last one. Bundling each mount alone shows
 * `OperatorErrorBlock` (via OnboardingWizard) pulling 22 `AsyncLocalStorage`
 * references and `AdminNav` pulling 21, while MeShowSections, HelpSheet and
 * AdministratorsSection pull none. Both reach `@/lib/log` through ordinary
 * client imports that no `"use server"` prologue elides. So the spec's
 * "extraction removes the last one" was true of the seam it was written about
 * and false of the entry as a whole.
 *
 * WHY IT DID NOT FAIL LOCALLY, which is the part worth remembering. esbuild
 * wraps CJS modules in a lazy initializer, so the constructor runs on FIRST
 * REQUIRE rather than at import time. Whether the render path reaches that
 * require is timing- and environment-dependent: 49 cases passed on this
 * machine, and passed again on linux/amd64 in the pinned
 * `mcr.microsoft.com/playwright:v1.59.1-jammy` image with a container-native
 * install — and failed every time on the GitHub runner with
 * `TypeError: import_node_async_hooks.AsyncLocalStorage is not a constructor`.
 * A latent crash that only some environments reach is still a crash; this
 * removes the latency rather than the symptom.
 *
 * WHY IT LIVES HERE AND NOT IN THE BUNDLER. Spec §8 explicitly fences teaching
 * `emptyNodeBuiltins` a functional stub: that bundler backs other standalone
 * specs, and changing its resolution semantics is a redesign of a surface this
 * branch does not otherwise touch. That fence is respected. This shim mutates
 * the stub object for THIS entry's bundle only — the empty CJS `module.exports`
 * the bundler already hands out is mutable and shared by every importer inside
 * one bundle, so seeding it before the component graph loads is enough, and no
 * other spec's bundle is affected.
 *
 * The shim is deliberately the SMALLEST thing that satisfies the constructor and
 * the two methods a logger touches. It is not an AsyncLocalStorage: there is no
 * async context propagation, because a browser harness measuring tap targets has
 * no request scope to propagate and never reads one back.
 */
import * as asyncHooks from "node:async_hooks";

class HarnessAsyncLocalStorage<T> {
  private store: T | undefined;

  getStore(): T | undefined {
    return this.store;
  }

  run<R>(store: T, callback: (...args: unknown[]) => R, ...args: unknown[]): R {
    const previous = this.store;
    this.store = store;
    try {
      return callback(...args);
    } finally {
      this.store = previous;
    }
  }

  enterWith(store: T): void {
    this.store = store;
  }

  exit<R>(callback: (...args: unknown[]) => R, ...args: unknown[]): R {
    const previous = this.store;
    this.store = undefined;
    try {
      return callback(...args);
    } finally {
      this.store = previous;
    }
  }

  disable(): void {
    this.store = undefined;
  }
}

const stub = asyncHooks as unknown as Record<string, unknown>;
stub.AsyncLocalStorage ??= HarnessAsyncLocalStorage;

/**
 * Exported so the entry's import cannot be tree-shaken away as a side-effect-only
 * module, and so the entry can assert the seeding actually took — a shim that
 * silently did nothing would put us straight back where we started.
 */
export function assertNodeShimsInstalled(): void {
  if (typeof (asyncHooks as unknown as Record<string, unknown>).AsyncLocalStorage !== "function") {
    throw new Error(
      "tap-target harness: the node:async_hooks shim did not install — " +
        "AsyncLocalStorage is still not a constructor, so the log graph will crash on first use.",
    );
  }
}
