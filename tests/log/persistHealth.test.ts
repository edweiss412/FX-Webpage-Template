// tests/log/persistHealth.test.ts
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { LogRecord } from "@/lib/log/types";

const insertMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => ({
    from: (_table: string) => ({ insert: insertMock }),
  }),
}));

const record: LogRecord = {
  level: "error",
  message: "m",
  source: "s",
  code: "C",
  requestId: "r",
  showId: "sh",
  driveFileId: "d",
  actorHash: "h",
  context: { a: 1 },
};

beforeEach(() => insertMock.mockReset());
afterEach(() => vi.restoreAllMocks());

describe("persistHealth (app_events durable-channel self-health)", () => {
  // Failure mode caught: a wholesale app_events write outage (RLS regression, key
  // rotation, schema drift, quota) going dark with ZERO operator signal because the
  // only reaction was console.error (invisible on Vercel). A climbing `failed` with
  // `ok` flat is the probe.
  test("clean insert increments ok, leaves failed/lastError untouched", async () => {
    const { resetPersistHealth, getPersistHealth } = await import("@/lib/log/persistHealth");
    resetPersistHealth();
    insertMock.mockResolvedValue({ error: null });
    const { persistAppEvent } = await import("@/lib/log/persist");
    await persistAppEvent(record);
    expect(getPersistHealth()).toEqual({ ok: 1, failed: 0, lastError: null, lastFailedAt: null });
  });

  test("returned {error} increments failed + records lastError/lastFailedAt", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { resetPersistHealth, getPersistHealth } = await import("@/lib/log/persistHealth");
    resetPersistHealth();
    insertMock.mockResolvedValue({ error: { message: "denied" } });
    const { persistAppEvent } = await import("@/lib/log/persist");
    await persistAppEvent(record);
    const h = getPersistHealth();
    expect(h.failed).toBe(1);
    expect(h.ok).toBe(0);
    expect(h.lastError).toContain("denied");
    expect(h.lastFailedAt).not.toBeNull();
  });

  test("thrown insert increments failed + records lastError (never throws)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { resetPersistHealth, getPersistHealth } = await import("@/lib/log/persistHealth");
    resetPersistHealth();
    insertMock.mockRejectedValueOnce(new Error("network"));
    const { persistAppEvent } = await import("@/lib/log/persist");
    await expect(persistAppEvent(record)).resolves.toBeUndefined();
    const h = getPersistHealth();
    expect(h.failed).toBe(1);
    expect(h.lastError).toContain("network");
  });

  test("getPersistHealth is a snapshot (mutating it does not corrupt state)", async () => {
    const { resetPersistHealth, getPersistHealth } = await import("@/lib/log/persistHealth");
    resetPersistHealth();
    const snap = getPersistHealth();
    snap.ok = 999;
    expect(getPersistHealth().ok).toBe(0);
  });
});
