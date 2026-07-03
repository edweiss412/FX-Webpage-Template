import { afterEach, describe, expect, test, vi } from "vitest";
import {
  withStepTimeout,
  SyncStepTimeoutError,
  ENRICH_STEP_TIMEOUT_MS,
} from "@/lib/sync/runScheduledCronSync";

// The 30s single-Drive-call default budget every NON-enrich step keeps (DRIVE_SYNC_STEP_TIMEOUT_MS
// is module-private; mirror its value here to pin the "other steps keep 30s" invariant).
const DRIVE_DEFAULT_MS = 30_000;

afterEach(() => {
  vi.useRealTimers();
});

describe("withStepTimeout — per-call budget + abort-on-overrun (audit idx57/#166)", () => {
  test("enrich budget: an op finishing after >30s but < ENRICH_STEP_TIMEOUT_MS does NOT time out", async () => {
    vi.useFakeTimers();
    // 60s: comfortably beyond the 30s default (which would have killed legit agenda work), well
    // under the enrich budget. Derived from the constants so it holds if the budget is retuned.
    const opDelayMs = DRIVE_DEFAULT_MS + 30_000;
    expect(opDelayMs).toBeGreaterThan(DRIVE_DEFAULT_MS);
    expect(opDelayMs).toBeLessThan(ENRICH_STEP_TIMEOUT_MS);

    const p = withStepTimeout(
      "enrichWithDrivePins",
      () => new Promise<string>((resolve) => setTimeout(() => resolve("ok"), opDelayMs)),
      ENRICH_STEP_TIMEOUT_MS,
    );
    await vi.advanceTimersByTimeAsync(opDelayMs);
    await expect(p).resolves.toBe("ok");
  });

  test("default budget still fires at 30s (every OTHER step keeps the single-Drive-call timeout)", async () => {
    vi.useFakeTimers();
    const p = withStepTimeout(
      "captureBinding",
      () => new Promise<string>((resolve) => setTimeout(() => resolve("too-late"), 60_000)),
    );
    p.catch(() => {}); // swallow the eventual rejection so it is not an unhandled rejection
    await vi.advanceTimersByTimeAsync(DRIVE_DEFAULT_MS);
    await expect(p).rejects.toBeInstanceOf(SyncStepTimeoutError);
  });

  test("overrun rejects with SyncStepTimeoutError AND aborts the signal passed to the op", async () => {
    vi.useFakeTimers();
    let seen: AbortSignal | undefined;
    const p = withStepTimeout(
      "enrichWithDrivePins",
      (signal) => {
        seen = signal;
        // Never settles on its own — only the budget's abort can stop it, modeling an agenda
        // download loop that would otherwise keep running past a lost race.
        return new Promise<never>(() => {});
      },
      ENRICH_STEP_TIMEOUT_MS,
    );
    p.catch(() => {});
    expect(seen).toBeDefined();
    expect(seen?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(ENRICH_STEP_TIMEOUT_MS);
    await expect(p).rejects.toBeInstanceOf(SyncStepTimeoutError);
    // The overrun aborted the in-flight op's signal → downstream downloads stop instead of running
    // to completion after the race was already lost.
    expect(seen?.aborted).toBe(true);
  });

  test("ENRICH_STEP_TIMEOUT_MS fits under the cron route's 300s maxDuration contract with headroom", () => {
    // Grounded in app/api/cron/sync/route.ts `export const maxDuration = 300` (audit idx57 HIGH-2).
    // Must leave room for the four OTHER 30s Drive-call steps (~120s) plus unwrapped tx/apply work.
    const CRON_ROUTE_MAX_DURATION_MS = 300_000;
    expect(ENRICH_STEP_TIMEOUT_MS).toBeLessThanOrEqual(CRON_ROUTE_MAX_DURATION_MS - 120_000);
  });

  test("timeout message reports the ACTUAL budget used, not the 30s default", async () => {
    vi.useFakeTimers();
    const p = withStepTimeout(
      "enrichWithDrivePins",
      () => new Promise<never>(() => {}),
      ENRICH_STEP_TIMEOUT_MS,
    );
    p.catch(() => {});
    await vi.advanceTimersByTimeAsync(ENRICH_STEP_TIMEOUT_MS);
    await expect(p).rejects.toThrow(String(ENRICH_STEP_TIMEOUT_MS));
  });
});
