/**
 * `tests/setup.ts:70` stubs `window.matchMedia` with `matches: false` — i.e.
 * MOTION ENABLED. Since MODAL-CLOSE-EXIT-ANIM-1, a modal close under motion
 * plays an exit animation and calls `onClose` only at exit-end (in jsdom, via
 * the fallback timer, since jsdom never fires `transitionend`).
 *
 * Tests that assert a SYNCHRONOUS close are asserting the reduced-motion
 * contract (spec §3.1 step 4 — byte-identical to pre-animation behavior) and
 * must say so explicitly by wrapping in this helper.
 *
 * Do NOT reach for this to make an animated-path failure go away: that deletes
 * the coverage which proves the exit runs at all. Pin both halves.
 */
export function withReducedMotion<T>(run: () => T): T {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) =>
    ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  try {
    return run();
  } finally {
    window.matchMedia = original;
  }
}
