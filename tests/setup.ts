import { vi } from "vitest";

// R41 P-R11 Fix-2: lib/email/hashForLog.ts throws at module load without a
// 32+ char pepper. Tests use a fixed value so hash bytes are deterministic.
process.env.HASH_FOR_LOG_PEPPER ??= "fxav-r41-test-pepper-32-chars-min-deterministic";
process.env.PICKER_COOKIE_SIGNING_KEY ??= "0".repeat(64);

// nav-perf tag-caching: getShowForViewer now wraps its data fan-out in
// `unstable_cache` (lib/data/getShowForViewer.ts), which requires a Next
// incremental-cache request context that Vitest's `node` environment lacks
// (throws E469). Provide a GLOBAL passthrough mock so every test that calls
// getShowForViewer (directly or transitively) sees the pre-cache behavior:
// `unstable_cache(fn)` returns a wrapper that simply invokes `fn` on each call
// (no memoization, tags/revalidate ignored), and `revalidateTag` is a no-op
// spy. Test files that need faithful cache semantics (memoize-by-keyParts +
// tag-eviction — tests/data/getShowForViewer.cache.test.ts) declare their OWN
// `vi.mock("next/cache")`, which overrides this global per-file.
//
// NOTE: this preserves the prior behavior (data re-read every call) for all
// pre-existing tests; the cache test asserts the real caching contract.
vi.mock("next/cache", () => ({
  unstable_cache:
    (fn: (...a: unknown[]) => unknown) =>
    (...a: unknown[]) =>
      fn(...a),
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));

// jsdom does not implement window.matchMedia. Components that read the reduced-
// motion preference via lib/a11y/usePrefersReducedMotion (PageTransition,
// RightNowCard, and anything that renders them — e.g. AdminLayout via
// PageTransition) call it inside an effect, so ANY test that renders such a
// tree throws "matchMedia is not a function" without a stub. Provide a safe
// no-op default (matches:false) in jsdom-environment test files; per-file tests
// that assert a specific preference still override it (plain assignment creates
// a configurable, writable property). Guarded on `window` so node-environment
// test files (the suite default per vitest.config) are untouched.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

export {};
