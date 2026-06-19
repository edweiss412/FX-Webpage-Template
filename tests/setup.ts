// R41 P-R11 Fix-2: lib/email/hashForLog.ts throws at module load without a
// 32+ char pepper. Tests use a fixed value so hash bytes are deterministic.
process.env.HASH_FOR_LOG_PEPPER ??= "fxav-r41-test-pepper-32-chars-min-deterministic";
process.env.PICKER_COOKIE_SIGNING_KEY ??= "0".repeat(64);

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
