import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const cronMock = vi.hoisted(() => ({
  runScheduledCronSync: vi.fn(async () => ({
    processed: [{ driveFileId: "file-1", result: { outcome: "applied", showId: "show-1" } }],
  })),
  refreshWatchSubscriptions: vi.fn(async () => ({ refreshed: ["folder-1"] })),
  gcWatchChannels: vi.fn(async () => ({ stopped: ["channel-1"] })),
  runAssetRecoveryCron: vi.fn(async () => ({
    processed: [
      { showId: "show-1", result: { outcome: "recovered", snapshotRevisionId: "rev-1" } },
    ],
  })),
  runDiagramGc: vi.fn(async () => ({
    orphanBlobsDeleted: 1,
    pendingPrefixesDeleted: 2,
    promotedRowsDeleted: 3,
  })),
  writeSyncLog: vi.fn(async () => undefined),
}));

vi.mock("@/lib/sync/runScheduledCronSync", () => ({
  runScheduledCronSync: cronMock.runScheduledCronSync,
}));

vi.mock("@/lib/sync/syncLog", () => ({
  writeSyncLog: cronMock.writeSyncLog,
}));

vi.mock("@/lib/drive/watch", () => ({
  refreshWatchSubscriptions: cronMock.refreshWatchSubscriptions,
  gcWatchChannels: cronMock.gcWatchChannels,
}));

vi.mock("@/lib/sync/assetRecovery", () => ({
  runAssetRecoveryCron: cronMock.runAssetRecoveryCron,
}));

vi.mock("@/lib/sync/diagramGc", () => ({
  runDiagramGc: cronMock.runDiagramGc,
}));

describe("/api/cron/sync", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    cronMock.runScheduledCronSync.mockClear();
    cronMock.writeSyncLog.mockClear();
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
    expect(cronMock.runScheduledCronSync).toHaveBeenCalledWith({ logSync: cronMock.writeSyncLog });
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

describe("/api/cron/refresh-watch", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    cronMock.refreshWatchSubscriptions.mockClear();
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
    const { GET } = await import("@/app/api/cron/refresh-watch/route");

    const response = await GET(new NextRequest("https://crew.fxav.test/api/cron/refresh-watch"));

    expect(response.status).toBe(401);
    expect(cronMock.refreshWatchSubscriptions).not.toHaveBeenCalled();
  });

  test("GET refreshes expiring Drive watch subscriptions", async () => {
    const { GET } = await import("@/app/api/cron/refresh-watch/route");

    const response = await GET(
      new NextRequest("https://crew.fxav.test/api/cron/refresh-watch", {
        headers: { authorization: "Bearer cron-test-secret" },
      }),
    );

    await expect(response.json()).resolves.toEqual({ ok: true, refreshed: ["folder-1"] });
    expect(cronMock.refreshWatchSubscriptions).toHaveBeenCalledOnce();
  });
});

describe("/api/cron/gc-watch", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    cronMock.gcWatchChannels.mockClear();
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
    const { GET } = await import("@/app/api/cron/gc-watch/route");

    const response = await GET(new NextRequest("https://crew.fxav.test/api/cron/gc-watch"));

    expect(response.status).toBe(401);
    expect(cronMock.gcWatchChannels).not.toHaveBeenCalled();
  });

  test("GET stops orphaned and superseded Drive watch subscriptions", async () => {
    const { GET } = await import("@/app/api/cron/gc-watch/route");

    const response = await GET(
      new NextRequest("https://crew.fxav.test/api/cron/gc-watch", {
        headers: { authorization: "Bearer cron-test-secret" },
      }),
    );

    await expect(response.json()).resolves.toEqual({ ok: true, stopped: ["channel-1"] });
    expect(cronMock.gcWatchChannels).toHaveBeenCalledOnce();
  });
});

describe("/api/cron/asset-recovery", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    cronMock.runAssetRecoveryCron.mockClear();
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
    const { GET } = await import("@/app/api/cron/asset-recovery/route");

    const response = await GET(new NextRequest("https://crew.fxav.test/api/cron/asset-recovery"));

    expect(response.status).toBe(401);
    expect(cronMock.runAssetRecoveryCron).not.toHaveBeenCalled();
  });

  test("GET runs asset recovery and returns a machine-readable summary", async () => {
    const { GET } = await import("@/app/api/cron/asset-recovery/route");

    const response = await GET(
      new NextRequest("https://crew.fxav.test/api/cron/asset-recovery", {
        headers: { authorization: "Bearer cron-test-secret" },
      }),
    );

    await expect(response.json()).resolves.toEqual({
      ok: true,
      processed: [
        { showId: "show-1", result: { outcome: "recovered", snapshotRevisionId: "rev-1" } },
      ],
    });
    expect(cronMock.runAssetRecoveryCron).toHaveBeenCalledOnce();
  });
});

describe("/api/cron/diagram-gc", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    cronMock.runDiagramGc.mockClear();
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
    const { GET } = await import("@/app/api/cron/diagram-gc/route");

    const response = await GET(new NextRequest("https://crew.fxav.test/api/cron/diagram-gc"));

    expect(response.status).toBe(401);
    expect(cronMock.runDiagramGc).not.toHaveBeenCalled();
  });

  test("GET runs diagram GC and returns a machine-readable summary", async () => {
    const { GET } = await import("@/app/api/cron/diagram-gc/route");

    const response = await GET(
      new NextRequest("https://crew.fxav.test/api/cron/diagram-gc", {
        headers: { authorization: "Bearer cron-test-secret" },
      }),
    );

    await expect(response.json()).resolves.toEqual({
      ok: true,
      orphanBlobsDeleted: 1,
      pendingPrefixesDeleted: 2,
      promotedRowsDeleted: 3,
    });
    expect(cronMock.runDiagramGc).toHaveBeenCalledOnce();
  });
});
