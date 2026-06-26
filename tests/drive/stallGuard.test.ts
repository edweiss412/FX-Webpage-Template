import { describe, expect, test } from "vitest";
import { createStallGuard, DRIVE_ASSET_STALL_TIMEOUT_MS } from "@/lib/drive/stallGuard";

// Small real-timer waits keep these deterministic without faking timers (the
// guard's setTimeout is the unit under test). Budgets are tiny (≤60ms).
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe("createStallGuard", () => {
  test("aborts and flips timedOut() after the idle budget with no reset", async () => {
    const guard = createStallGuard(20);
    expect(guard.signal.aborted).toBe(false);
    expect(guard.timedOut()).toBe(false);

    await wait(40);

    expect(guard.timedOut()).toBe(true);
    expect(guard.signal.aborted).toBe(true);
    guard.clear();
  });

  test("reset() keeps the guard alive as long as progress continues, then fires once progress stops", async () => {
    const guard = createStallGuard(30);
    // Three resets at 15ms intervals (< the 30ms budget) — never fires.
    for (let i = 0; i < 3; i++) {
      await wait(15);
      guard.reset();
      expect(guard.timedOut()).toBe(false);
    }
    // Now stop resetting → the idle timer elapses → fires.
    await wait(50);
    expect(guard.timedOut()).toBe(true);
    guard.clear();
  });

  test("clear() cancels the timer so it never fires after a successful read", async () => {
    const guard = createStallGuard(20);
    guard.clear();
    await wait(40);
    expect(guard.timedOut()).toBe(false);
    expect(guard.signal.aborted).toBe(false);
  });

  test("a late reset() after firing does NOT re-arm (stays timed out)", async () => {
    const guard = createStallGuard(20);
    await wait(40);
    expect(guard.timedOut()).toBe(true);
    guard.reset();
    await wait(40);
    expect(guard.timedOut()).toBe(true);
    guard.clear();
  });

  test("exposes the production default budget", () => {
    expect(DRIVE_ASSET_STALL_TIMEOUT_MS).toBe(30_000);
  });
});
