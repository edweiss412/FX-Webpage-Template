import { beforeEach, describe, expect, test, vi } from "vitest";

const cronMock = vi.hoisted(() => ({
  runScheduledCronSync: vi.fn(async () => ({
    processed: [{ driveFileId: "file-1", result: { outcome: "applied", showId: "show-1" } }],
  })),
}));

vi.mock("@/lib/sync/runScheduledCronSync", () => ({
  runScheduledCronSync: cronMock.runScheduledCronSync,
}));

describe("/api/cron/sync", () => {
  beforeEach(() => {
    cronMock.runScheduledCronSync.mockClear();
  });

  test("GET runs scheduled sync and returns a machine-readable summary", async () => {
    const { GET } = await import("@/app/api/cron/sync/route");

    const response = await GET();

    await expect(response.json()).resolves.toEqual({
      ok: true,
      processed: [{ driveFileId: "file-1", result: { outcome: "applied", showId: "show-1" } }],
    });
    expect(cronMock.runScheduledCronSync).toHaveBeenCalledOnce();
  });
});

describe("/api/cron/keepalive", () => {
  test("GET is a no-op health endpoint for Vercel cron", async () => {
    const { GET } = await import("@/app/api/cron/keepalive/route");

    const response = await GET();

    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
