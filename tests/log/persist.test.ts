// tests/log/persist.test.ts
import { afterEach, describe, expect, test, vi } from "vitest";
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

afterEach(() => {
  insertMock.mockReset();
  vi.restoreAllMocks();
});

describe("persistAppEvent", () => {
  test("inserts the mapped columns", async () => {
    insertMock.mockResolvedValue({ error: null });
    const { persistAppEvent } = await import("@/lib/log/persist");
    await persistAppEvent(record);
    expect(insertMock).toHaveBeenCalledWith({
      level: "error",
      source: "s",
      message: "m",
      code: "C",
      request_id: "r",
      show_id: "sh",
      drive_file_id: "d",
      actor_hash: "h",
      context: { a: 1 },
    });
  });

  test("returned {error} → console-degrade, no throw", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    insertMock.mockResolvedValue({ error: { message: "denied" } });
    const { persistAppEvent } = await import("@/lib/log/persist");
    await expect(persistAppEvent(record)).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledWith("[log/persist] app_events write failed", expect.any(Object));
  });

  test("thrown error → caught, no throw", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    insertMock.mockRejectedValue(new Error("network"));
    const { persistAppEvent } = await import("@/lib/log/persist");
    await expect(persistAppEvent(record)).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledWith("[log/persist] app_events write threw", expect.any(Object));
  });
});
