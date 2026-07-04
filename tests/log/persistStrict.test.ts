// tests/log/persistStrict.test.ts
import { describe, expect, test, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  insertMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => ({ from: () => ({ insert: mocks.insertMock }) }),
}));

import { persistAppEventStrict } from "@/lib/log/persist";
import { runWithRequestContext } from "@/lib/log/requestContext";

const insertMock = mocks.insertMock;

const RECORD = {
  level: "info" as const,
  source: "drive.watch.escalation",
  message: "watch escalation fired",
  context: { alertId: "a-1", errorClass: "config", occurrenceCount: 1 },
};

beforeEach(() => insertMock.mockReset());

describe("persistAppEventStrict", () => {
  // Failure mode caught: best-effort log.* swallowing a guard-write failure →
  // duplicate escalation (spec R1-1); silent throw path (invariant 9).
  test("returns ok on clean insert and passes NOT-NULL columns", async () => {
    insertMock.mockResolvedValue({ error: null });
    const result = await persistAppEventStrict(RECORD);
    expect(result).toEqual({ ok: true });
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "info",
        source: "drive.watch.escalation",
        message: "watch escalation fired",
      }),
    );
  });
  test("returned error → { ok: false, error }", async () => {
    insertMock.mockResolvedValue({ error: { message: "boom" } });
    expect((await persistAppEventStrict(RECORD)).ok).toBe(false);
  });
  test("thrown error → { ok: false, error } (never throws)", async () => {
    insertMock.mockRejectedValueOnce(new Error("net down"));
    const result = await persistAppEventStrict(RECORD);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(Error);
      expect((result.error as Error).message).toBe("net down");
    }
  });
  test("sanitizes context through the logger chokepoint (emails redacted)", async () => {
    // Failure mode: strict writer bypassing buildRecord's sanitizeContext →
    // unsanitized PII persisting to app_events (spec §3.2.5 "same sanitization path").
    insertMock.mockResolvedValue({ error: null });
    await persistAppEventStrict({
      ...RECORD,
      context: { alertId: "a-1", note: "reach doug@example.com" },
    });
    const inserted = insertMock.mock.calls[0]![0] as { context: Record<string, unknown> };
    expect(JSON.stringify(inserted.context)).not.toContain("doug@example.com");
  });

  // Failure mode caught (finding #4): the strict writer bypasses buildRecord, so
  // unlike the logger path it never auto-filled requestId/showId from ALS — guard
  // rows lost their request/show correlation. Mirror the logger's precedence:
  // explicit value (incl. explicit null) wins; only undefined/absent falls to ALS.
  test("auto-fills request_id/show_id from ALS when the caller omits them", async () => {
    insertMock.mockResolvedValue({ error: null });
    await runWithRequestContext({ requestId: "r1", showId: "s1" }, async () => {
      await persistAppEventStrict(RECORD); // RECORD carries no requestId/showId
    });
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ request_id: "r1", show_id: "s1" }),
    );
  });

  test("explicit request_id/show_id override ALS (explicit wins)", async () => {
    insertMock.mockResolvedValue({ error: null });
    await runWithRequestContext({ requestId: "r1", showId: "s1" }, async () => {
      await persistAppEventStrict({ ...RECORD, requestId: "explicit-r", showId: "explicit-s" });
    });
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ request_id: "explicit-r", show_id: "explicit-s" }),
    );
  });

  test("explicit null request_id/show_id override ALS (null = 'no correlation')", async () => {
    insertMock.mockResolvedValue({ error: null });
    await runWithRequestContext({ requestId: "r1", showId: "s1" }, async () => {
      await persistAppEventStrict({ ...RECORD, requestId: null, showId: null });
    });
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ request_id: null, show_id: null }),
    );
  });

  test("outside any ALS scope, omitted request_id/show_id stay null", async () => {
    insertMock.mockResolvedValue({ error: null });
    await persistAppEventStrict(RECORD);
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ request_id: null, show_id: null }),
    );
  });
});
