import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createStallGuard, DRIVE_ASSET_STALL_TIMEOUT_MS } from "@/lib/drive/stallGuard";

// Fake timers make these deterministic (no wall-clock sensitivity on shared CI):
// the guard is pure setTimeout, so we drive it with advanceTimersByTimeAsync.
describe("createStallGuard", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test("aborts and flips timedOut() after the idle budget with no reset", async () => {
    const guard = createStallGuard(20);
    expect(guard.signal.aborted).toBe(false);
    expect(guard.timedOut()).toBe(false);

    await vi.advanceTimersByTimeAsync(19);
    expect(guard.timedOut()).toBe(false); // not yet
    await vi.advanceTimersByTimeAsync(2);

    expect(guard.timedOut()).toBe(true);
    expect(guard.signal.aborted).toBe(true);
    guard.clear();
  });

  test("reset() keeps the guard alive as long as progress continues, then fires once progress stops", async () => {
    const guard = createStallGuard(30);
    // Five resets at 20ms intervals (< the 30ms budget) — never fires.
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(20);
      guard.reset();
      expect(guard.timedOut()).toBe(false);
    }
    // Now stop resetting → the idle timer elapses → fires.
    await vi.advanceTimersByTimeAsync(31);
    expect(guard.timedOut()).toBe(true);
    guard.clear();
  });

  test("clear() cancels the timer so it never fires after a successful read", async () => {
    const guard = createStallGuard(20);
    guard.clear();
    await vi.advanceTimersByTimeAsync(100);
    expect(guard.timedOut()).toBe(false);
    expect(guard.signal.aborted).toBe(false);
  });

  test("a late reset() after firing does NOT re-arm (stays timed out)", async () => {
    const guard = createStallGuard(20);
    await vi.advanceTimersByTimeAsync(21);
    expect(guard.timedOut()).toBe(true);
    guard.reset();
    await vi.advanceTimersByTimeAsync(100);
    expect(guard.timedOut()).toBe(true);
    guard.clear();
  });

  test("exposes the production default budget", () => {
    expect(DRIVE_ASSET_STALL_TIMEOUT_MS).toBe(30_000);
  });
});
