import { vi } from "vitest";
import * as logModule from "@/lib/log";

// lib/log default-sink teardown-safety (Phase 4 console.* → lib/log migration).
// The default sink lazily `await import("./persist")` → `@/lib/supabase/server`
// → @supabase/ssr whenever a record persists (every error/warn, and info+code).
// Callers emit fire-and-forget (`void log.error(...)`), so in a unit test that
// dynamic import can resolve AFTER the jsdom/node environment has torn down —
// vitest raises `EnvironmentTeardownError` ("Cannot load @supabase/ssr ... after
// the environment was torn down"). It is CI-only: a warm local module cache wins
// the race that a cold CI import loses. Install a SYNCHRONOUS, console-only sink
// that mirrors the default sink's console line but NEVER touches persist/Supabase.
// Test files that assert on emitted records install their OWN sink (this is
// overridden per-file); files that exercise the real persist path call
// `persistAppEvent` directly or `resetLogSink()`. Guarded because files that
// `vi.mock("@/lib/log")` may not re-export `setLogSink` (and don't need it — a
// fully-mocked log never reaches the default sink).
if (typeof logModule.setLogSink === "function") {
  logModule.setLogSink((record) => {
    const compact: Record<string, unknown> = {
      level: record.level,
      code: record.code,
      requestId: record.requestId,
      showId: record.showId,
      driveFileId: record.driveFileId,
      actorHash: record.actorHash,
      ...record.context,
    };
    for (const k of Object.keys(compact)) if (compact[k] == null) delete compact[k];
    console[record.level](`[${record.source}] ${record.message}`, compact);
  });
}

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
