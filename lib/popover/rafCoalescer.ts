export type RafCoalescer = { schedule: () => void; cancel: () => void };

/**
 * Leading-edge THROTTLE shared by every popover surface that re-places itself
 * from a high-frequency event source (spec 2026-08-01-admin-popover-overlay-cluster §7).
 *
 * THROTTLE, not debounce. Cancel-and-reschedule was fine while the only source
 * was `window.resize`. Callers now also subscribe to `visualViewport` scroll,
 * ~80 events per pan — faster than a frame boundary — and a debounce would
 * cancel its own pending frame on every event, so the panel would not move
 * until the gesture STOPPED.
 *
 * The pending flag is cleared BEFORE running so events landing during `run` can
 * schedule the next frame instead of being swallowed.
 */
export function createRafCoalescer(run: () => void): RafCoalescer {
  let frame: number | null = null;
  return {
    schedule() {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null; // cleared BEFORE running so later events can schedule anew
        run();
      });
    },
    cancel() {
      if (frame !== null) {
        cancelAnimationFrame(frame);
        frame = null;
      }
    },
  };
}
