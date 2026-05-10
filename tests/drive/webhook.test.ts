import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import type { DriveListedFile } from "@/lib/drive/list";
import { SyncInfraError } from "@/lib/sync/perFileProcessor";

const syncLogMock = vi.hoisted(() => ({
  writeSyncLog: vi.fn(async () => undefined),
}));

vi.mock("@/lib/sync/syncLog", () => ({
  writeSyncLog: syncLogMock.writeSyncLog,
}));

type ChannelRow = {
  id: string;
  watchedFolderId: string;
  webhookSecret: string;
  resourceId: string;
};

function request(headers: Record<string, string>): NextRequest {
  return new NextRequest("https://crew.fxav.test/api/drive/webhook", {
    method: "POST",
    headers,
  });
}

function headers(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    "X-Goog-Channel-ID": "channel-1",
    "X-Goog-Channel-Token": "secret-1",
    "X-Goog-Resource-ID": "resource-1",
    "X-Goog-Resource-State": "update",
    ...overrides,
  };
}

function activeChannel(): ChannelRow {
  return {
    id: "channel-1",
    watchedFolderId: "folder-1",
    webhookSecret: "secret-1",
    resourceId: "resource-1",
  };
}

function listedFile(
  driveFileId: string,
  modifiedTime = "2026-05-09T12:00:00.000Z",
): DriveListedFile {
  return {
    driveFileId,
    name: `${driveFileId}.xlsx`,
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime,
    parents: ["folder-1"],
  };
}

describe("/api/drive/webhook", () => {
  beforeEach(() => {
    syncLogMock.writeSyncLog.mockClear();
  });

  test.each([
    "X-Goog-Channel-ID",
    "X-Goog-Channel-Token",
    "X-Goog-Resource-ID",
    "X-Goog-Resource-State",
  ])("missing %s returns WEBHOOK_HEADERS_MISSING without dispatch", async (missing) => {
    const { handleDriveWebhook } = await import("@/app/api/drive/webhook/route");
    const tx = {
      readActiveWatchChannel: vi.fn(async () => activeChannel()),
      upsertAdminAlert: vi.fn(async () => undefined),
    };
    const requestHeaders = headers();
    delete requestHeaders[missing];

    const response = await handleDriveWebhook(request(requestHeaders), {
      tx,
      listFolder: vi.fn(async () => [listedFile("file-1")]),
      runPushSyncForShow: vi.fn(async () => ({ outcome: "applied" as const, showId: "show-1" })),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      code: "WEBHOOK_HEADERS_MISSING",
    });
    expect(tx.readActiveWatchChannel).not.toHaveBeenCalled();
  });

  test("non-active or unknown channel returns gone and does not dispatch", async () => {
    const { handleDriveWebhook } = await import("@/app/api/drive/webhook/route");
    const tx = {
      readActiveWatchChannel: vi.fn(async () => null),
      upsertAdminAlert: vi.fn(async () => undefined),
    };
    const runPushSyncForShow = vi.fn(async () => ({
      outcome: "applied" as const,
      showId: "show-1",
    }));

    const response = await handleDriveWebhook(request(headers()), {
      tx,
      listFolder: vi.fn(async () => [listedFile("file-1")]),
      runPushSyncForShow,
    });

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      code: "WEBHOOK_CHANNEL_INACTIVE",
    });
    expect(tx.readActiveWatchChannel).toHaveBeenCalledWith("channel-1");
    expect(runPushSyncForShow).not.toHaveBeenCalled();
  });

  test("wrong token returns 401, writes WEBHOOK_TOKEN_INVALID, and does not dispatch", async () => {
    const { handleDriveWebhook } = await import("@/app/api/drive/webhook/route");
    const tx = {
      readActiveWatchChannel: vi.fn(async () => activeChannel()),
      upsertAdminAlert: vi.fn(async () => undefined),
    };
    const runPushSyncForShow = vi.fn(async () => ({
      outcome: "applied" as const,
      showId: "show-1",
    }));

    const response = await handleDriveWebhook(
      request(headers({ "X-Goog-Channel-Token": "wrong-secret" })),
      {
        tx,
        listFolder: vi.fn(async () => [listedFile("file-1")]),
        runPushSyncForShow,
      },
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      code: "WEBHOOK_TOKEN_INVALID",
    });
    expect(tx.upsertAdminAlert).toHaveBeenCalledWith({
      code: "WEBHOOK_TOKEN_INVALID",
      context: { channel_id: "channel-1", reason: "token_mismatch" },
    });
    expect(runPushSyncForShow).not.toHaveBeenCalled();
  });

  test("resource id mismatch returns 401 and does not dispatch", async () => {
    const { handleDriveWebhook } = await import("@/app/api/drive/webhook/route");
    const tx = {
      readActiveWatchChannel: vi.fn(async () => activeChannel()),
      upsertAdminAlert: vi.fn(async () => undefined),
    };
    const runPushSyncForShow = vi.fn(async () => ({
      outcome: "applied" as const,
      showId: "show-1",
    }));

    const response = await handleDriveWebhook(
      request(headers({ "X-Goog-Resource-ID": "different-resource" })),
      {
        tx,
        listFolder: vi.fn(async () => [listedFile("file-1")]),
        runPushSyncForShow,
      },
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      code: "WEBHOOK_TOKEN_INVALID",
    });
    expect(tx.upsertAdminAlert).toHaveBeenCalledWith({
      code: "WEBHOOK_TOKEN_INVALID",
      context: { channel_id: "channel-1", reason: "resource_mismatch" },
    });
    expect(runPushSyncForShow).not.toHaveBeenCalled();
  });

  test("default webhook alert writer coalesces repeated token-invalid alerts per channel", () => {
    const source = readFileSync(
      join(process.cwd(), "app/api/drive/webhook/route.ts"),
      "utf8",
    ).toLowerCase();

    expect(source).toContain("context->>'channel_id' = $2");
    expect(source).toContain("last_seen_at > now() - interval '1 hour'");
  });

  test.each(["sync", "trash", "remove", "untrash"])(
    "resource state %s is acknowledged without push dispatch",
    async (state) => {
      const { handleDriveWebhook } = await import("@/app/api/drive/webhook/route");
      const tx = {
        readActiveWatchChannel: vi.fn(async () => activeChannel()),
        upsertAdminAlert: vi.fn(async () => undefined),
      };
      const listFolder = vi.fn(async () => [listedFile("file-1")]);
      const runPushSyncForShow = vi.fn(async () => ({
        outcome: "applied" as const,
        showId: "show-1",
      }));

      const response = await handleDriveWebhook(
        request(headers({ "X-Goog-Resource-State": state })),
        {
          tx,
          listFolder,
          runPushSyncForShow,
        },
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true, ignored: state });
      expect(listFolder).not.toHaveBeenCalled();
      expect(runPushSyncForShow).not.toHaveBeenCalled();
    },
  );

  test("add/update notifications list the watched folder and dispatch each file once", async () => {
    const { handleDriveWebhook } = await import("@/app/api/drive/webhook/route");
    const deferred: Array<() => Promise<void>> = [];
    const tx = {
      readActiveWatchChannel: vi.fn(async () => activeChannel()),
      upsertAdminAlert: vi.fn(async () => undefined),
    };
    const file = listedFile("file-1");
    const listFolder = vi.fn(async () => [file, file, listedFile("file-2")]);
    const runPushSyncForShow = vi.fn(async () => ({
      outcome: "applied" as const,
      showId: "show-1",
    }));

    const response = await handleDriveWebhook(
      request(headers({ "X-Goog-Resource-State": "add" })),
      {
        tx,
        listFolder,
        runPushSyncForShow,
        defer: (task) => deferred.push(task),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      queued: true,
    });
    expect(listFolder).not.toHaveBeenCalled();
    expect(runPushSyncForShow).not.toHaveBeenCalled();

    await deferred[0]?.();

    expect(listFolder).toHaveBeenCalledWith("folder-1");
    expect(runPushSyncForShow).toHaveBeenCalledTimes(2);
    expect(runPushSyncForShow).toHaveBeenCalledWith("file-1", {
      fileMeta: file,
      logSync: syncLogMock.writeSyncLog,
    });
  });

  test("successful background dispatch keeps using the durable sync_log sink per file", async () => {
    const { dispatchDriveWebhookFiles } = await import("@/app/api/drive/webhook/route");
    const file = listedFile("file-a");
    const logSync = vi.fn(async () => undefined);
    const runPushSyncForShow = vi.fn(async (driveFileId: string, deps) => {
      await deps?.logSync?.({ driveFileId, outcome: "applied" });
      return { outcome: "applied" as const, showId: "show-a" };
    });

    const result = await dispatchDriveWebhookFiles(activeChannel(), {
      listFolder: vi.fn(async () => [file]),
      runPushSyncForShow,
      logSync,
    });

    expect(result).toEqual({
      dispatched: [{ driveFileId: "file-a", result: { outcome: "applied", showId: "show-a" } }],
    });
    expect(logSync).toHaveBeenCalledWith({ driveFileId: "file-a", outcome: "applied" });
  });

  test("background dispatch isolates one file failure from the rest of the folder", async () => {
    const { dispatchDriveWebhookFiles } = await import("@/app/api/drive/webhook/route");
    const fileA = listedFile("file-a");
    const fileB = listedFile("file-b");
    const logSync = vi.fn(async () => undefined);
    const runPushSyncForShow = vi
      .fn()
      .mockRejectedValueOnce(
        new SyncInfraError("readShowGateRow", "returned_error", new Error("db offline")),
      )
      .mockResolvedValueOnce({ outcome: "applied" as const, showId: "show-b" });

    const result = await dispatchDriveWebhookFiles(activeChannel(), {
      listFolder: vi.fn(async () => [fileA, fileB]),
      runPushSyncForShow,
      logSync,
    });

    expect(result).toEqual({
      dispatched: [
        { driveFileId: "file-a", result: { outcome: "error", code: "SYNC_INFRA_ERROR" } },
        { driveFileId: "file-b", result: { outcome: "applied", showId: "show-b" } },
      ],
    });
    expect(runPushSyncForShow).toHaveBeenCalledTimes(2);
    expect(logSync).toHaveBeenCalledWith({
      driveFileId: "file-a",
      outcome: "error",
      code: "SYNC_INFRA_ERROR",
      payload: expect.objectContaining({
        name: "SyncInfraError",
        message: expect.stringContaining("readShowGateRow"),
        operation: "readShowGateRow",
      }),
    });
  });

  test("background folder listing failure is written to sync_log before the task settles", async () => {
    const { dispatchDriveWebhookFiles } = await import("@/app/api/drive/webhook/route");
    const logSync = vi.fn(async () => undefined);
    const listError = new SyncInfraError(
      "listFolder",
      "thrown_error",
      new Error("drive unavailable"),
    );

    const result = await dispatchDriveWebhookFiles(activeChannel(), {
      listFolder: vi.fn(async () => {
        throw listError;
      }),
      runPushSyncForShow: vi.fn(async () => ({ outcome: "applied" as const, showId: "show-a" })),
      logSync,
    });

    expect(result).toEqual({
      dispatched: [{ driveFileId: null, result: { outcome: "error", code: "SYNC_INFRA_ERROR" } }],
    });
    expect(logSync).toHaveBeenCalledWith({
      driveFileId: null,
      outcome: "error",
      code: "SYNC_INFRA_ERROR",
      payload: expect.objectContaining({
        name: "SyncInfraError",
        operation: "listFolder",
      }),
    });
  });
});

describe("runPushSyncForShow", () => {
  test("dispatches the shared sync pipeline with mode='push'", async () => {
    const { runPushSyncForShow } = await import("@/lib/sync/runPushSyncForShow");
    const fileMeta = listedFile("file-1", "2026-05-09T12:05:00.000Z");
    const processOneFile = vi.fn(async () => ({ outcome: "applied" as const, showId: "show-1" }));

    const result = await runPushSyncForShow("file-1", {
      fileMeta,
      readPushDuplicatePreflight: vi.fn(async () => ({ outcome: "proceed" as const })),
      processOneFile,
    });

    expect(result).toEqual({ outcome: "applied", showId: "show-1" });
    expect(processOneFile).toHaveBeenCalledWith("file-1", "push", fileMeta, {
      logSync: syncLogMock.writeSyncLog,
    });
  });
});
