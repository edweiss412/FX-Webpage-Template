import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const cronMock = vi.hoisted(() => ({
  runScheduledCronSync: vi.fn(async () => ({
    processed: [{ driveFileId: "file-1", result: { outcome: "applied", showId: "show-1" } }],
  })),
}));

vi.mock("@/lib/sync/runScheduledCronSync", () => ({
  runScheduledCronSync: cronMock.runScheduledCronSync,
}));

describe("/api/cron/sync", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    cronMock.runScheduledCronSync.mockClear();
    process.env.CRON_SECRET = "cron-test-secret";
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalSecret;
    }
  });

  test("GET rejects requests without the Vercel cron auth header", async () => {
    const { GET } = await import("@/app/api/cron/sync/route");

    const response = await GET(new NextRequest("https://crew.fxav.test/api/cron/sync"));

    expect(response.status).toBe(401);
    expect(cronMock.runScheduledCronSync).not.toHaveBeenCalled();
  });

  test("GET runs scheduled sync and returns a machine-readable summary", async () => {
    const { GET } = await import("@/app/api/cron/sync/route");

    const response = await GET(
      new NextRequest("https://crew.fxav.test/api/cron/sync", {
        headers: { authorization: "Bearer cron-test-secret" },
      }),
    );

    await expect(response.json()).resolves.toEqual({
      ok: true,
      processed: [{ driveFileId: "file-1", result: { outcome: "applied", showId: "show-1" } }],
    });
    expect(cronMock.runScheduledCronSync).toHaveBeenCalledOnce();
  });
});

describe("/api/cron/keepalive", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.CRON_SECRET = "cron-test-secret";
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalSecret;
    }
  });

  test("GET rejects requests without the Vercel cron auth header", async () => {
    const { GET } = await import("@/app/api/cron/keepalive/route");

    const response = await GET(new NextRequest("https://crew.fxav.test/api/cron/keepalive"));

    expect(response.status).toBe(401);
  });

  test("GET is a no-op health endpoint for Vercel cron", async () => {
    const { GET } = await import("@/app/api/cron/keepalive/route");

    const response = await GET(
      new NextRequest("https://crew.fxav.test/api/cron/keepalive", {
        headers: { authorization: "Bearer cron-test-secret" },
      }),
    );

    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
