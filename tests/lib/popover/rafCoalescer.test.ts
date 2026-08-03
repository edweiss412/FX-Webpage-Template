import { afterEach, describe, expect, it, vi } from "vitest";

import { createRafCoalescer, type RafCoalescer } from "@/lib/popover/rafCoalescer";

/**
 * Spec 2026-08-01-admin-popover-overlay-cluster §7 — the shared leading-edge
 * rAF THROTTLE extracted from ShareHub + HoverHelp.
 *
 * Every case counts rAF REGISTRATIONS, never "the function was called": a
 * debounce (cancel-and-reschedule) calls `run` exactly as often as a throttle
 * does for a single burst, and differs only in how many frames it registers
 * and when the pending slot frees.
 */

/** Captures registrations without ever firing them implicitly. */
function harness() {
  const pending = new Map<number, FrameRequestCallback>();
  const cancelled: number[] = [];
  let nextId = 1;

  const raf = vi.fn((cb: FrameRequestCallback): number => {
    const id = nextId++;
    pending.set(id, cb);
    return id;
  });
  const caf = vi.fn((id: number): void => {
    cancelled.push(id);
    pending.delete(id);
  });

  vi.stubGlobal("requestAnimationFrame", raf);
  vi.stubGlobal("cancelAnimationFrame", caf);

  return {
    raf,
    caf,
    cancelled,
    /** Ids handed out so far, oldest first. */
    registrations: () => raf.mock.results.map((r) => r.value as number),
    /** Fires one specific registration (the callback is removed first, as the
     *  browser does — a callback that re-schedules must get a NEW slot). */
    fire(id: number) {
      const cb = pending.get(id);
      if (!cb) throw new Error(`no pending frame ${id}`);
      pending.delete(id);
      cb(0);
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("createRafCoalescer", () => {
  it("burst: five schedules register exactly one frame, and running it runs once", () => {
    const h = harness();
    const run = vi.fn();
    // Compile-time consumer pin: both exports are importable and the returned
    // value is assignable to the published type.
    const c: RafCoalescer = createRafCoalescer(run);

    c.schedule();
    c.schedule();
    c.schedule();
    c.schedule();
    c.schedule();

    expect(h.raf).toHaveBeenCalledTimes(1);
    expect(run).not.toHaveBeenCalled();

    h.fire(h.registrations()[0]!);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("throttle, not debounce: a schedule DURING run registers a second frame", () => {
    const h = harness();
    let inside = 0;
    const c: RafCoalescer = createRafCoalescer(() => {
      inside += 1;
      // The pending flag must already be cleared here, or this schedule is a
      // no-op and the event that arrived mid-frame is silently dropped.
      c.schedule();
    });

    c.schedule();
    expect(h.raf).toHaveBeenCalledTimes(1);

    h.fire(h.registrations()[0]!);

    expect(inside).toBe(1);
    expect(h.raf).toHaveBeenCalledTimes(2);
    // A debounce would have CANCELLED its own frame instead of registering one.
    expect(h.cancelled).toHaveLength(0);
  });

  it("burst after a run reuses nothing: the pending slot is free again", () => {
    const h = harness();
    const run = vi.fn();
    const c: RafCoalescer = createRafCoalescer(run);

    c.schedule();
    h.fire(h.registrations()[0]!);
    c.schedule();
    c.schedule();

    expect(h.raf).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("cancel: cancels the PENDING id, and a later schedule registers anew", () => {
    const h = harness();
    const run = vi.fn();
    const c: RafCoalescer = createRafCoalescer(run);

    c.schedule();
    const pendingId = h.registrations()[0]!;

    c.cancel();
    expect(h.caf).toHaveBeenCalledTimes(1);
    expect(h.cancelled).toContain(pendingId);

    c.schedule();
    expect(h.raf).toHaveBeenCalledTimes(2);
    expect(h.registrations()[1]).not.toBe(pendingId);
    expect(run).not.toHaveBeenCalled();
  });

  it("cancel with nothing pending is a no-op", () => {
    const h = harness();
    const c: RafCoalescer = createRafCoalescer(vi.fn());

    c.cancel();
    expect(h.caf).not.toHaveBeenCalled();

    c.schedule();
    h.fire(h.registrations()[0]!);
    // The frame already ran; its id must not be cancelled retroactively.
    c.cancel();
    expect(h.caf).not.toHaveBeenCalled();
  });
});
