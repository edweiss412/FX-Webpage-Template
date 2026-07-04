import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { STALE_PENDING_MAX_AGE_MS } from "@/lib/drive/watchErrors";
import { setLogSink } from "@/lib/log";
import type { LogRecord } from "@/lib/log/types";

// File-wide log capture via the sanctioned setLogSink seam (observability arc);
// replaces the earlier vi.mock("@/lib/log") harness so the telemetry describe
// (origin/main 51429aa1) and the R5-1 redaction assertions share one capture.
let logRecords: LogRecord[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  logRecords = [];
  setLogSink((record) => {
    logRecords.push(record);
  });
});
afterEach(() => {
  // Silent, persist-free sink (NOT resetLogSink, whose default sink lazily
  // imports persist → Supabase and can raise EnvironmentTeardownError).
  setLogSink(() => {});
});

type WatchRow = {
  id: string;
  status: "pending" | "active" | "superseded" | "orphaned" | "stopped";
  watchedFolderId: string;
  webhookSecret: string;
  resourceId: string | null;
  expiresAt: string | null;
  createdAt?: string;
};

class FakeWatchTx {
  rows: WatchRow[] = [];
  alerts: Array<{ code: string; context: Record<string, unknown>; resolved?: boolean }> = [];
  operations: string[] = [];
  now = new Date("2026-05-09T12:00:00.000Z");

  async insertPending(row: { id: string; watchedFolderId: string; webhookSecret: string }) {
    this.operations.push(`insertPending:${row.id}`);
    this.rows.push({
      id: row.id,
      status: "pending",
      watchedFolderId: row.watchedFolderId,
      webhookSecret: row.webhookSecret,
      resourceId: null,
      expiresAt: null,
    });
  }

  async activatePending(row: {
    id: string;
    watchedFolderId: string;
    resourceId: string;
    expiresAt: string;
  }) {
    this.operations.push(`activatePending:${row.id}`);
    for (const existing of this.rows) {
      if (
        existing.watchedFolderId === row.watchedFolderId &&
        existing.status === "active" &&
        existing.id !== row.id
      ) {
        existing.status = "superseded";
      }
    }
    const pending = this.rows.find((existing) => existing.id === row.id);
    if (!pending) throw new Error("pending row missing");
    pending.status = "active";
    pending.resourceId = row.resourceId;
    pending.expiresAt = row.expiresAt;
  }

  async markOrphaned(id: string) {
    this.operations.push(`markOrphaned:${id}`);
    const row = this.rows.find((existing) => existing.id === id);
    if (row) row.status = "orphaned";
  }

  async upsertAdminAlert(input: { code: string; context: Record<string, unknown> }) {
    this.alerts.push(input);
  }

  async listExpiringActive(thresholdIso: string) {
    this.operations.push("listExpiringActive");
    const threshold = Date.parse(thresholdIso);
    return this.rows.filter(
      (row) =>
        row.status === "active" && row.expiresAt !== null && Date.parse(row.expiresAt) < threshold,
    );
  }

  async listGcCandidates() {
    this.operations.push("listGcCandidates");
    return this.rows.filter((row) => row.status === "superseded" || row.status === "orphaned");
  }

  async markStopped(id: string) {
    this.operations.push(`markStopped:${id}`);
    const row = this.rows.find((existing) => existing.id === id);
    if (row) row.status = "stopped";
  }

  async deleteOldStopped() {
    this.operations.push("deleteOldStopped");
  }

  async sweepStalePending(cutoffIso: string) {
    this.operations.push("sweepStalePending");
    const cutoff = Date.parse(cutoffIso);
    const swept: string[] = [];
    for (const row of this.rows) {
      if (row.status === "pending" && row.createdAt && Date.parse(row.createdAt) < cutoff) {
        row.status = "orphaned";
        swept.push(row.id);
      }
    }
    return swept;
  }

  async hasLiveActiveChannel(folderId: string, nowIso: string) {
    this.operations.push("hasLiveActiveChannel");
    const now = Date.parse(nowIso);
    return this.rows.some(
      (row) =>
        row.watchedFolderId === folderId &&
        row.status === "active" &&
        row.expiresAt !== null &&
        Date.parse(row.expiresAt) > now,
    );
  }

  async resolveStaleWebhookTokenInvalid(folderId: string, nowIso: string) {
    this.operations.push("resolveStaleWebhookTokenInvalid");
    const now = Date.parse(nowIso);
    const liveChannelIds = new Set(
      this.rows
        .filter(
          (row) =>
            row.watchedFolderId === folderId &&
            row.status === "active" &&
            row.expiresAt !== null &&
            Date.parse(row.expiresAt) > now,
        )
        .map((row) => row.id),
    );
    for (const alert of this.alerts) {
      if (
        alert.code === "WEBHOOK_TOKEN_INVALID" &&
        !alert.resolved &&
        !liveChannelIds.has(String(alert.context.channel_id))
      ) {
        alert.resolved = true;
      }
    }
  }
}

function seedOpenWebhookTokenInvalidAlert(tx: FakeWatchTx, channelId: string) {
  tx.alerts.push({
    code: "WEBHOOK_TOKEN_INVALID",
    context: { channel_id: channelId },
    resolved: false,
  });
}

function seedActiveExpiring(tx: FakeWatchTx, folderIds: string[]) {
  for (const folderId of folderIds) {
    tx.rows.push({
      id: `channel-${folderId}`,
      status: "active",
      watchedFolderId: folderId,
      webhookSecret: "old-secret",
      resourceId: "resource-1",
      expiresAt: new Date(tx.now.getTime() - 60 * 60 * 1000).toISOString(),
    });
  }
}

function seedLiveActive(tx: FakeWatchTx, folderId: string, id = `live-${folderId}`) {
  tx.rows.push({
    id,
    status: "active",
    watchedFolderId: folderId,
    webhookSecret: "secret",
    resourceId: "resource-1",
    expiresAt: new Date(tx.now.getTime() + 60 * 60 * 1000).toISOString(),
  });
}

const NO_REFRESH = { refreshed: [], orphaned: [], failures: [] };

function reconcileDeps(tx: FakeWatchTx, over: Record<string, unknown> = {}) {
  return {
    tx,
    now: () => tx.now,
    getActiveWatchedFolder: vi.fn().mockResolvedValue({ folderId: "folder-1", folderName: "F" }),
    resolveAdminAlert: vi.fn().mockResolvedValue(undefined),
    maybeEscalateWatchOrphaned: vi.fn().mockResolvedValue({ escalated: false, faults: [] }),
    subscribeToWatchedFolder: vi.fn().mockResolvedValue({ outcome: "active", channelId: "c" }),
    ...over,
  };
}

describe("Drive watch lifecycle", () => {
  test("default Postgres watch path wraps supersede and activate in one transaction", () => {
    const source = readFileSync(join(process.cwd(), "lib/drive/watch.ts"), "utf8");

    expect(source).toMatch(/sql\.begin\s*\(/);
  });

  test("subscribe inserts pending, activates it, and supersedes prior active channel", async () => {
    const tx = new FakeWatchTx();
    tx.rows.push({
      id: "old-channel",
      status: "active",
      watchedFolderId: "folder-1",
      webhookSecret: "old-secret",
      resourceId: "old-resource",
      expiresAt: "2026-05-10T12:00:00.000Z",
    });
    const { subscribeToWatchedFolder } = await import("@/lib/drive/watch");

    const result = await subscribeToWatchedFolder("folder-1", {
      tx,
      uuid: () => "new-channel",
      webhookSecret: () => "secret-1",
      watchFolder: vi.fn(async () => ({
        id: "new-channel",
        resourceId: "resource-1",
        expiration: "2026-05-10T13:00:00.000Z",
      })),
    });

    expect(result).toEqual({ outcome: "active", channelId: "new-channel" });
    expect(tx.rows).toEqual([
      expect.objectContaining({ id: "old-channel", status: "superseded" }),
      expect.objectContaining({
        id: "new-channel",
        status: "active",
        resourceId: "resource-1",
        expiresAt: "2026-05-10T13:00:00.000Z",
      }),
    ]);
    expect(tx.operations).toEqual(["insertPending:new-channel", "activatePending:new-channel"]);
  });

  test("watch creation failure leaves orphaned row and raises WATCH_CHANNEL_ORPHANED", async () => {
    const tx = new FakeWatchTx();
    const { subscribeToWatchedFolder } = await import("@/lib/drive/watch");
    const capturedSecret = "secret-1";

    const result = await subscribeToWatchedFolder("folder-1", {
      tx,
      uuid: () => "new-channel",
      webhookSecret: () => capturedSecret,
      watchFolder: vi
        .fn()
        .mockRejectedValue(
          new Error(`files.watch failed: token=${capturedSecret} Bearer ya29.zzz`),
        ),
    });

    expect(tx.rows).toEqual([expect.objectContaining({ id: "new-channel", status: "orphaned" })]);
    const alert = tx.alerts[0]!;
    expect(alert.code).toBe("WATCH_CHANNEL_ORPHANED");
    expect(alert.context.watched_folder_id).toBe("folder-1");
    expect(alert.context.channel_id).toBe("new-channel");
    expect(alert.context.reason).toBe("watch_create_failed");
    expect(alert.context.error_class).toBe("drive_api");
    expect(String(alert.context.error_message)).not.toContain(capturedSecret);
    expect(String(alert.context.error_message)).not.toContain("ya29.zzz");
    expect(result).toEqual({
      outcome: "orphaned",
      channelId: expect.any(String),
      reason: "watch_create_failed",
    });
  });

  test("subscribe failure log payload is redacted and carries no raw error object", async () => {
    const tx = new FakeWatchTx();
    const { subscribeToWatchedFolder } = await import("@/lib/drive/watch");
    const secret = "sec-leak-1";

    await subscribeToWatchedFolder("folder-1", {
      tx,
      uuid: () => "chan-1",
      webhookSecret: () => secret,
      watchFolder: () =>
        Promise.reject(new Error(`files.watch failed token=${secret} Bearer ya29.zzz`)),
    });

    const rec = logRecords.find((r) => r.message === "drive watch subscribe failed")!;
    expect(rec).toBeTruthy();
    expect(rec.context).not.toHaveProperty("error");
    const flat = JSON.stringify(rec.context);
    expect(flat).not.toContain(secret);
    expect(flat).not.toContain("ya29.zzz");
    expect(rec.context.errorMessage).toContain("files.watch failed");
    expect(rec.context.errorClass).toBe("drive_api");
  });

  test("DRIVE_WEBHOOK_BASE_URL config error is classified config in the orphan alert", async () => {
    const tx = new FakeWatchTx();
    const { subscribeToWatchedFolder } = await import("@/lib/drive/watch");

    const result = await subscribeToWatchedFolder("folder-1", {
      tx,
      uuid: () => "chan-1",
      webhookSecret: () => "sec-1",
      watchFolder: () =>
        Promise.reject(
          new Error("DRIVE_WEBHOOK_BASE_URL is required for Drive watch subscriptions"),
        ),
    });

    expect(result.outcome).toBe("orphaned");
    expect(tx.alerts[0]!.context.error_class).toBe("config");
    expect(tx.alerts[0]!.context.error_message).toContain("DRIVE_WEBHOOK_BASE_URL is required");
  });

  test("subscription failure commits pending before Drive call then marks orphaned in a later phase", async () => {
    const tx = new FakeWatchTx();
    const events: string[] = [];
    const { subscribeToWatchedFolder } = await import("@/lib/drive/watch");

    const result = await subscribeToWatchedFolder("folder-1", {
      withTx: async <R>(fn: (tx: FakeWatchTx) => Promise<R>) => {
        events.push("tx:start");
        const value = await fn(tx);
        events.push("tx:commit");
        return value;
      },
      uuid: () => "new-channel",
      webhookSecret: () => "secret-1",
      watchFolder: vi.fn(async () => {
        events.push("drive:watch");
        expect(tx.rows).toEqual([
          expect.objectContaining({ id: "new-channel", status: "pending" }),
        ]);
        expect(events).toEqual(["tx:start", "tx:commit", "drive:watch"]);
        throw new Error("Drive unavailable");
      }),
    });

    expect(result).toEqual({
      outcome: "orphaned",
      channelId: "new-channel",
      reason: "watch_create_failed",
    });
    expect(tx.rows).toEqual([expect.objectContaining({ id: "new-channel", status: "orphaned" })]);
    expect(events).toEqual(["tx:start", "tx:commit", "drive:watch", "tx:start", "tx:commit"]);
    expect(tx.alerts).toEqual([
      {
        code: "WATCH_CHANNEL_ORPHANED",
        context: {
          watched_folder_id: "folder-1",
          channel_id: "new-channel",
          reason: "watch_create_failed",
          error_class: "drive_api",
          error_message: "Drive unavailable",
        },
      },
    ]);
  });

  test("activation failure after Drive succeeds records the Google channel id in the orphan alert", async () => {
    class ActivationFailsTx extends FakeWatchTx {
      override async activatePending(row: {
        id: string;
        watchedFolderId: string;
        resourceId: string;
        expiresAt: string;
      }) {
        this.operations.push(`activatePending:${row.id}`);
        throw new Error("database unavailable after Drive watch");
      }
    }
    const tx = new ActivationFailsTx();
    const { subscribeToWatchedFolder } = await import("@/lib/drive/watch");

    const result = await subscribeToWatchedFolder("folder-1", {
      withTx: async (fn) => fn(tx),
      uuid: () => "requested-channel",
      webhookSecret: () => "secret-1",
      watchFolder: vi.fn(async () => ({
        id: "google-channel",
        resourceId: "resource-1",
        expiration: "2026-05-10T13:00:00.000Z",
      })),
    });

    expect(result).toEqual({
      outcome: "orphaned",
      channelId: "google-channel",
      reason: "activate_failed_after_watch_created",
    });
    expect(tx.rows).toEqual([
      expect.objectContaining({ id: "requested-channel", status: "orphaned" }),
    ]);
    expect(tx.alerts).toEqual([
      {
        code: "WATCH_CHANNEL_ORPHANED",
        context: {
          watched_folder_id: "folder-1",
          channel_id: "google-channel",
          requested_channel_id: "requested-channel",
          resource_id: "resource-1",
          expiration: "2026-05-10T13:00:00.000Z",
          reason: "activate_failed_after_watch_created",
          error_class: "db",
          error_message:
            "Drive watch infrastructure failure during drive_watch_channels.activate_pending",
        },
      },
    ]);
  });

  test("refreshWatchSubscriptions renews active rows expiring within 24 hours", async () => {
    const tx = new FakeWatchTx();
    tx.rows.push({
      id: "due-channel",
      status: "active",
      watchedFolderId: "folder-1",
      webhookSecret: "old-secret",
      resourceId: "resource-1",
      expiresAt: "2026-05-10T00:00:00.000Z",
    });
    const { refreshWatchSubscriptions } = await import("@/lib/drive/watch");
    const subscribeToWatchedFolder = vi.fn(async () => ({
      outcome: "active" as const,
      channelId: "new-channel",
    }));

    const result = await refreshWatchSubscriptions({
      tx,
      now: () => tx.now,
      subscribeToWatchedFolder,
    });

    expect(result).toEqual({ refreshed: ["folder-1"], orphaned: [], failures: [] });
    expect(subscribeToWatchedFolder).toHaveBeenCalledWith("folder-1");
  });

  test("refresh isolates per-row failures and classifies by orphan reason", async () => {
    const tx = new FakeWatchTx();
    const { refreshWatchSubscriptions, DriveWatchInfraError } = await import("@/lib/drive/watch");
    seedActiveExpiring(tx, ["folder-a", "folder-b", "folder-c", "folder-d"]);
    const subscribe = vi.fn(async (folderId: string) => {
      if (folderId === "folder-a") return { outcome: "active", channelId: "a" } as const;
      if (folderId === "folder-b")
        return { outcome: "orphaned", channelId: "b", reason: "watch_create_failed" } as const;
      if (folderId === "folder-c")
        return {
          outcome: "orphaned",
          channelId: "c",
          reason: "activate_failed_after_watch_created",
        } as const;
      throw new DriveWatchInfraError("drive_watch_channels.insert_pending", new Error("db down"));
    });

    const result = await refreshWatchSubscriptions({
      tx,
      now: () => tx.now,
      subscribeToWatchedFolder: subscribe,
    });

    expect(subscribe).toHaveBeenCalledTimes(4);
    expect(result.refreshed).toEqual(["folder-a"]);
    expect(result.orphaned).toEqual(["folder-b"]);
    expect(result.failures).toEqual([
      { folderId: "folder-c", operation: "activate_pending" },
      { folderId: "folder-d", operation: "subscribe" },
    ]);
  });

  test("refresh catches a list_expiring DB failure into the typed failures channel (never rejects)", async () => {
    const tx = new FakeWatchTx();
    tx.listExpiringActive = async () => {
      throw new Error("connection refused");
    };
    const { refreshWatchSubscriptions } = await import("@/lib/drive/watch");

    const result = await refreshWatchSubscriptions({ tx, now: () => tx.now });

    expect(result).toEqual({
      refreshed: [],
      orphaned: [],
      failures: [{ folderId: "*", operation: "list_expiring" }],
    });
  });

  test("refreshWatchSubscriptions commits the candidate query before Drive renewal", async () => {
    const tx = new FakeWatchTx();
    tx.rows.push({
      id: "due-channel",
      status: "active",
      watchedFolderId: "folder-1",
      webhookSecret: "old-secret",
      resourceId: "resource-1",
      expiresAt: "2026-05-10T00:00:00.000Z",
    });
    const events: string[] = [];
    const { refreshWatchSubscriptions } = await import("@/lib/drive/watch");
    const subscribeToWatchedFolder = vi.fn(async () => {
      events.push("drive:subscribe");
      expect(events).toEqual(["tx:start", "tx:commit", "drive:subscribe"]);
      return { outcome: "active" as const, channelId: "new-channel" };
    });

    const result = await refreshWatchSubscriptions({
      withTx: async <R>(fn: (tx: FakeWatchTx) => Promise<R>) => {
        events.push("tx:start");
        const value = await fn(tx);
        events.push("tx:commit");
        return value;
      },
      now: () => tx.now,
      subscribeToWatchedFolder,
    } as unknown as Parameters<typeof refreshWatchSubscriptions>[0]);

    expect(result).toEqual({ refreshed: ["folder-1"], orphaned: [], failures: [] });
    expect(tx.operations).toEqual(["listExpiringActive"]);
    expect(events).toEqual(["tx:start", "tx:commit", "drive:subscribe"]);
  });

  test("refreshWatchSubscriptions records a typed failure and leaves DB state unchanged when Drive renewal throws after candidate commit", async () => {
    const tx = new FakeWatchTx();
    const capturedSecret = "old-secret";
    tx.rows.push({
      id: "due-channel",
      status: "active",
      watchedFolderId: "folder-1",
      webhookSecret: capturedSecret,
      resourceId: "resource-1",
      expiresAt: "2026-05-10T00:00:00.000Z",
    });
    const before = structuredClone(tx.rows);
    const events: string[] = [];
    const { refreshWatchSubscriptions } = await import("@/lib/drive/watch");

    const result = await refreshWatchSubscriptions({
      withTx: async <R>(fn: (tx: FakeWatchTx) => Promise<R>) => {
        events.push("tx:start");
        const value = await fn(tx);
        events.push("tx:commit");
        return value;
      },
      now: () => tx.now,
      subscribeToWatchedFolder: vi.fn(async () => {
        events.push("drive:subscribe");
        throw new Error(`renewal failed: token=${capturedSecret} Bearer ya29.zzz`);
      }),
    } as unknown as Parameters<typeof refreshWatchSubscriptions>[0]);

    expect(result).toEqual({
      refreshed: [],
      orphaned: [],
      failures: [{ folderId: "folder-1", operation: "subscribe" }],
    });
    expect(tx.rows).toEqual(before);
    expect(tx.operations).toEqual(["listExpiringActive"]);
    expect(events).toEqual(["tx:start", "tx:commit", "drive:subscribe"]);

    const rec = logRecords.find((r) => r.message === "refresh-watch renewal failed")!;
    expect(rec).toBeTruthy();
    expect(String(rec.context.errorMessage)).not.toContain(capturedSecret);
    expect(String(rec.context.errorMessage)).not.toContain("ya29.zzz");
  });

  test("gcWatchChannels stops superseded and orphaned channels and leaves orphan alerts for operator dismissal", async () => {
    const tx = new FakeWatchTx();
    tx.alerts.push({
      code: "WATCH_CHANNEL_ORPHANED",
      context: { watched_folder_id: "folder-1", channel_id: "orphaned-channel" },
    });
    tx.rows.push(
      {
        id: "superseded-channel",
        status: "superseded",
        watchedFolderId: "folder-1",
        webhookSecret: "secret-1",
        resourceId: "resource-1",
        expiresAt: "2026-05-10T00:00:00.000Z",
      },
      {
        id: "orphaned-channel",
        status: "orphaned",
        watchedFolderId: "folder-1",
        webhookSecret: "secret-2",
        resourceId: null,
        expiresAt: null,
      },
    );
    const { gcWatchChannels } = await import("@/lib/drive/watch");
    const stopChannel = vi.fn(async () => undefined);

    const result = await gcWatchChannels({ tx, stopChannel });

    expect(result).toEqual({ stopped: ["superseded-channel", "orphaned-channel"] });
    expect(stopChannel).toHaveBeenCalledWith({
      id: "superseded-channel",
      resourceId: "resource-1",
    });
    expect(stopChannel).toHaveBeenCalledWith({ id: "orphaned-channel", resourceId: null });
    expect(tx.rows.map((row) => row.status)).toEqual(["stopped", "stopped"]);
    expect(tx.operations).toContain("deleteOldStopped");
    expect(tx.alerts).toEqual([
      {
        code: "WATCH_CHANNEL_ORPHANED",
        context: { watched_folder_id: "folder-1", channel_id: "orphaned-channel" },
      },
    ]);
  });

  test("gcWatchChannels stops Drive channels outside transactions and marks rows in fresh transactions", async () => {
    const tx = new FakeWatchTx();
    tx.rows.push({
      id: "superseded-channel",
      status: "superseded",
      watchedFolderId: "folder-1",
      webhookSecret: "secret-1",
      resourceId: "resource-1",
      expiresAt: "2026-05-10T00:00:00.000Z",
    });
    const events: string[] = [];
    const { gcWatchChannels } = await import("@/lib/drive/watch");
    const stopChannel = vi.fn(async () => {
      events.push("drive:stop");
      expect(events).toEqual(["tx:start", "tx:commit", "drive:stop"]);
    });

    const result = await gcWatchChannels({
      withTx: async <R>(fn: (tx: FakeWatchTx) => Promise<R>) => {
        events.push("tx:start");
        const value = await fn(tx);
        events.push("tx:commit");
        return value;
      },
      stopChannel,
    } as unknown as Parameters<typeof gcWatchChannels>[0]);

    expect(result).toEqual({ stopped: ["superseded-channel"] });
    expect(tx.rows).toEqual([expect.objectContaining({ status: "stopped" })]);
    expect(tx.operations).toEqual([
      "listGcCandidates",
      "markStopped:superseded-channel",
      "deleteOldStopped",
    ]);
    expect(events).toEqual([
      "tx:start",
      "tx:commit",
      "drive:stop",
      "tx:start",
      "tx:commit",
      "tx:start",
      "tx:commit",
    ]);
  });
});

describe("reconcileWatchChannels", () => {
  test("healthy: live channel + clean refresh → resolve + healthy", async () => {
    // catches: status='active'-only class regressing; resolve not firing on recovery
    const tx = new FakeWatchTx();
    seedLiveActive(tx, "folder-1");
    const { reconcileWatchChannels } = await import("@/lib/drive/watch");
    const deps = reconcileDeps(tx);

    const result = await reconcileWatchChannels(NO_REFRESH, deps);

    expect(result).toEqual({ outcome: "healthy", sweptPending: 0, escalated: false, faults: [] });
    expect(deps.resolveAdminAlert).toHaveBeenCalledWith({
      showId: null,
      code: "WATCH_CHANNEL_ORPHANED",
    });
    expect(deps.subscribeToWatchedFolder).not.toHaveBeenCalled();
    expect(deps.maybeEscalateWatchOrphaned).not.toHaveBeenCalled();
  });

  test("healthy: open WEBHOOK_TOKEN_INVALID alert naming a channel that is NOT the folder's live active channel → resolved", async () => {
    const tx = new FakeWatchTx();
    seedLiveActive(tx, "folder-1", "live-channel");
    seedOpenWebhookTokenInvalidAlert(tx, "stale-channel");
    const { reconcileWatchChannels } = await import("@/lib/drive/watch");
    const deps = reconcileDeps(tx);

    const result = await reconcileWatchChannels(NO_REFRESH, deps);

    expect(result.outcome).toBe("healthy");
    expect(tx.operations).toContain("resolveStaleWebhookTokenInvalid");
    expect(tx.alerts[0]).toMatchObject({
      code: "WEBHOOK_TOKEN_INVALID",
      context: { channel_id: "stale-channel" },
      resolved: true,
    });
  });

  test("healthy: open WEBHOOK_TOKEN_INVALID alert naming the CURRENT live channel → untouched", async () => {
    const tx = new FakeWatchTx();
    seedLiveActive(tx, "folder-1", "live-channel");
    seedOpenWebhookTokenInvalidAlert(tx, "live-channel");
    const { reconcileWatchChannels } = await import("@/lib/drive/watch");
    const deps = reconcileDeps(tx);

    const result = await reconcileWatchChannels(NO_REFRESH, deps);

    expect(result.outcome).toBe("healthy");
    expect(tx.operations).toContain("resolveStaleWebhookTokenInvalid");
    expect(tx.alerts[0]).toMatchObject({
      code: "WEBHOOK_TOKEN_INVALID",
      context: { channel_id: "live-channel" },
      resolved: false,
    });
  });

  test("vacuous: no folder → resolve stale WATCH_CHANNEL_ORPHANED alongside the global WEBHOOK_TOKEN_INVALID alert, no subscribe", async () => {
    const tx = new FakeWatchTx();
    const { reconcileWatchChannels } = await import("@/lib/drive/watch");
    const deps = reconcileDeps(tx, {
      getActiveWatchedFolder: vi.fn().mockResolvedValue({ kind: "no_folder_configured" }),
    });

    const result = await reconcileWatchChannels(NO_REFRESH, deps);

    expect(result).toEqual({ outcome: "vacuous", sweptPending: 0, escalated: false, faults: [] });
    expect(deps.resolveAdminAlert).toHaveBeenCalledWith({
      showId: null,
      code: "WATCH_CHANNEL_ORPHANED",
    });
    expect(deps.resolveAdminAlert).toHaveBeenCalledWith({
      showId: null,
      code: "WEBHOOK_TOKEN_INVALID",
    });
    expect(deps.subscribeToWatchedFolder).not.toHaveBeenCalled();
  });

  test("no live channel → exactly one subscribe; active → recovered + resolve (WATCH_CHANNEL_ORPHANED and stale WEBHOOK_TOKEN_INVALID)", async () => {
    const tx = new FakeWatchTx();
    seedOpenWebhookTokenInvalidAlert(tx, "old-channel");
    const { reconcileWatchChannels } = await import("@/lib/drive/watch");
    const deps = reconcileDeps(tx);

    const result = await reconcileWatchChannels(NO_REFRESH, deps);

    expect(result).toEqual({ outcome: "recovered", sweptPending: 0, escalated: false, faults: [] });
    expect(deps.subscribeToWatchedFolder).toHaveBeenCalledTimes(1);
    expect(deps.subscribeToWatchedFolder).toHaveBeenCalledWith("folder-1");
    expect(deps.resolveAdminAlert).toHaveBeenCalledWith({
      showId: null,
      code: "WATCH_CHANNEL_ORPHANED",
    });
    expect(tx.operations).toContain("resolveStaleWebhookTokenInvalid");
    expect(tx.alerts[0]).toMatchObject({
      code: "WEBHOOK_TOKEN_INVALID",
      context: { channel_id: "old-channel" },
      resolved: true,
    });
  });

  test("no live channel, subscribe orphaned watch_create_failed → still_orphaned, no resolve, escalation runs", async () => {
    const tx = new FakeWatchTx();
    const { reconcileWatchChannels } = await import("@/lib/drive/watch");
    const deps = reconcileDeps(tx, {
      subscribeToWatchedFolder: vi.fn().mockResolvedValue({
        outcome: "orphaned",
        channelId: "c",
        reason: "watch_create_failed",
      }),
    });

    const result = await reconcileWatchChannels(NO_REFRESH, deps);

    expect(result.outcome).toBe("still_orphaned");
    expect(deps.resolveAdminAlert).not.toHaveBeenCalled();
    expect(deps.maybeEscalateWatchOrphaned).toHaveBeenCalledWith({
      folderId: "folder-1",
      folderName: "F",
    });
  });

  test("no live channel, subscribe orphaned activate_failed → activate_write fault → infra_error outcome", async () => {
    const tx = new FakeWatchTx();
    const { reconcileWatchChannels } = await import("@/lib/drive/watch");
    const deps = reconcileDeps(tx, {
      subscribeToWatchedFolder: vi.fn().mockResolvedValue({
        outcome: "orphaned",
        channelId: "c",
        reason: "activate_failed_after_watch_created",
      }),
    });

    const result = await reconcileWatchChannels(NO_REFRESH, deps);

    expect(result.faults).toContain("activate_write");
    expect(result.outcome).toBe("infra_error");
    expect(deps.maybeEscalateWatchOrphaned).toHaveBeenCalled();
  });

  test("R4-1/R10-1 renewal_failing leg 1 (orphaned list): live channel BUT refresh.orphaned names the folder → renewal_failing, NO resolve, NO second subscribe, escalation runs", async () => {
    // catches: resolve-defeats-renewal-alert; double-subscribe count distortion
    const tx = new FakeWatchTx();
    seedLiveActive(tx, "folder-1");
    const { reconcileWatchChannels } = await import("@/lib/drive/watch");
    const deps = reconcileDeps(tx);

    const result = await reconcileWatchChannels(
      { refreshed: [], orphaned: ["folder-1"], failures: [] },
      deps,
    );

    expect(result.outcome).toBe("renewal_failing");
    expect(deps.subscribeToWatchedFolder).not.toHaveBeenCalled();
    expect(deps.resolveAdminAlert).not.toHaveBeenCalled();
    expect(deps.maybeEscalateWatchOrphaned).toHaveBeenCalled();
  });

  test("list_expiring '*' failure marks the configured folder renewal-dirty (no auto-resolve on unknown renewal state)", async () => {
    // Whole-diff review MED: a pre-loop list-infra cycle must not let a
    // still-live channel pass condition (b) and clear the alert while renewal
    // state is unknown.
    const tx = new FakeWatchTx();
    seedLiveActive(tx, "folder-1");
    const { reconcileWatchChannels } = await import("@/lib/drive/watch");
    const deps = reconcileDeps(tx);
    const result = await reconcileWatchChannels(
      { refreshed: [], orphaned: [], failures: [{ folderId: "*", operation: "list_expiring" }] },
      deps,
    );
    expect(deps.resolveAdminAlert).not.toHaveBeenCalled();
    expect(deps.subscribeToWatchedFolder).not.toHaveBeenCalled();
    expect(result.outcome).toBe("renewal_failing");
  });

  test("R4-1/R10-1 renewal_failing leg 2 (failures list, activate_pending): live channel BUT refresh.failures names the folder → renewal_failing, NO resolve, NO second subscribe, escalation runs (R9-2: never-escalates-on-renewal-failing)", async () => {
    const tx = new FakeWatchTx();
    seedLiveActive(tx, "folder-1");
    const { reconcileWatchChannels } = await import("@/lib/drive/watch");
    const deps = reconcileDeps(tx);

    const result = await reconcileWatchChannels(
      {
        refreshed: [],
        orphaned: [],
        failures: [{ folderId: "folder-1", operation: "activate_pending" }],
      },
      deps,
    );

    expect(result.outcome).toBe("renewal_failing");
    expect(deps.subscribeToWatchedFolder).not.toHaveBeenCalled();
    expect(deps.resolveAdminAlert).not.toHaveBeenCalled();
    expect(deps.maybeEscalateWatchOrphaned).toHaveBeenCalled();
  });

  test("folder-switch: old folder's live channel does NOT satisfy the predicate", async () => {
    // active channel rows for folder-OLD; configured folder folder-NEW → subscribe fires for folder-NEW
    const tx = new FakeWatchTx();
    seedLiveActive(tx, "folder-old");
    const { reconcileWatchChannels } = await import("@/lib/drive/watch");
    const deps = reconcileDeps(tx, {
      getActiveWatchedFolder: vi
        .fn()
        .mockResolvedValue({ folderId: "folder-new", folderName: "F" }),
    });

    const result = await reconcileWatchChannels(NO_REFRESH, deps);

    expect(deps.subscribeToWatchedFolder).toHaveBeenCalledWith("folder-new");
    expect(result.outcome).toBe("recovered");
  });

  test("stale-pending sweep flips only rows older than STALE_PENDING_MAX_AGE_MS and writes ZERO alerts", async () => {
    const tx = new FakeWatchTx();
    const cutoff = tx.now.getTime() - STALE_PENDING_MAX_AGE_MS;
    tx.rows.push(
      {
        id: "stale-1",
        status: "pending",
        watchedFolderId: "folder-1",
        webhookSecret: "s1",
        resourceId: null,
        expiresAt: null,
        createdAt: new Date(cutoff - 1000).toISOString(),
      },
      {
        id: "fresh-1",
        status: "pending",
        watchedFolderId: "folder-1",
        webhookSecret: "s2",
        resourceId: null,
        expiresAt: null,
        createdAt: new Date(cutoff + 1000).toISOString(),
      },
    );
    const { reconcileWatchChannels } = await import("@/lib/drive/watch");
    const deps = reconcileDeps(tx, {
      getActiveWatchedFolder: vi.fn().mockResolvedValue({ kind: "no_folder_configured" }),
    });

    const result = await reconcileWatchChannels(NO_REFRESH, deps);

    expect(result.sweptPending).toBe(1);
    expect(tx.rows.find((r) => r.id === "stale-1")!.status).toBe("orphaned");
    expect(tx.rows.find((r) => r.id === "fresh-1")!.status).toBe("pending");
    expect(tx.alerts).toEqual([]);
  });

  test("fault mapping: folder infra_error → folder_read fault, outcome infra_error", async () => {
    const tx = new FakeWatchTx();
    const { reconcileWatchChannels } = await import("@/lib/drive/watch");
    const deps = reconcileDeps(tx, {
      getActiveWatchedFolder: vi.fn().mockResolvedValue({
        kind: "infra_error",
        operation: "readActiveWatchedFolderId",
        source: "returned_error",
        cause: new Error("db down"),
      }),
    });

    const result = await reconcileWatchChannels(NO_REFRESH, deps);

    expect(result.faults).toContain("folder_read");
    expect(result.outcome).toBe("infra_error");
  });

  test("fault mapping: hasLiveActiveChannel throw → channel_read fault, outcome infra_error", async () => {
    const tx = new FakeWatchTx();
    tx.hasLiveActiveChannel = async () => {
      throw new Error("connection refused");
    };
    const { reconcileWatchChannels } = await import("@/lib/drive/watch");
    const deps = reconcileDeps(tx);

    const result = await reconcileWatchChannels(NO_REFRESH, deps);

    expect(result.faults).toContain("channel_read");
    expect(result.outcome).toBe("infra_error");
  });

  test("fault mapping: resolve throw on healthy path → alert_resolve_write fault, outcome infra_error", async () => {
    const tx = new FakeWatchTx();
    seedLiveActive(tx, "folder-1");
    const { reconcileWatchChannels } = await import("@/lib/drive/watch");
    const deps = reconcileDeps(tx, {
      resolveAdminAlert: vi.fn().mockRejectedValue(new Error("db down")),
    });

    const result = await reconcileWatchChannels(NO_REFRESH, deps);

    expect(result.faults).toContain("alert_resolve_write");
    expect(result.outcome).toBe("infra_error");
  });

  test("fault mapping: subscribe throw (DriveWatchInfraError) → subscribe_infra fault", async () => {
    const tx = new FakeWatchTx();
    const { reconcileWatchChannels, DriveWatchInfraError } = await import("@/lib/drive/watch");
    const deps = reconcileDeps(tx, {
      subscribeToWatchedFolder: vi
        .fn()
        .mockRejectedValue(
          new DriveWatchInfraError("drive_watch_channels.insert_pending", new Error("db down")),
        ),
    });

    const result = await reconcileWatchChannels(NO_REFRESH, deps);

    expect(result.faults).toContain("subscribe_infra");
    expect(result.outcome).toBe("infra_error");
  });

  test("fault mapping: sweep throw → pending_sweep fault; any fault forces outcome infra_error", async () => {
    const tx = new FakeWatchTx();
    seedLiveActive(tx, "folder-1");
    tx.sweepStalePending = async () => {
      throw new Error("db down");
    };
    const { reconcileWatchChannels } = await import("@/lib/drive/watch");
    const deps = reconcileDeps(tx);

    const result = await reconcileWatchChannels(NO_REFRESH, deps);

    expect(result.faults).toContain("pending_sweep");
    expect(result.sweptPending).toBe(0);
    expect(result.outcome).toBe("infra_error");
  });

  test("plan-R3-1: getActiveWatchedFolder THROWING (not returning infra_error) → folder_read fault, typed return, no throw out of reconcile", async () => {
    const tx = new FakeWatchTx();
    const { reconcileWatchChannels } = await import("@/lib/drive/watch");
    const deps = reconcileDeps(tx, {
      getActiveWatchedFolder: vi.fn().mockRejectedValue(new Error("boom")),
    });

    const result = await reconcileWatchChannels(NO_REFRESH, deps);

    expect(result.faults).toContain("folder_read");
    expect(result.outcome).toBe("infra_error");
  });

  test("plan-R3-1: maybeEscalateWatchOrphaned THROWING → escalation_helper fault, typed return, no throw", async () => {
    const tx = new FakeWatchTx();
    const { reconcileWatchChannels } = await import("@/lib/drive/watch");
    const deps = reconcileDeps(tx, {
      subscribeToWatchedFolder: vi.fn().mockResolvedValue({
        outcome: "orphaned",
        channelId: "c",
        reason: "watch_create_failed",
      }),
      maybeEscalateWatchOrphaned: vi.fn().mockRejectedValue(new Error("boom")),
    });

    const result = await reconcileWatchChannels(NO_REFRESH, deps);

    expect(result.faults).toContain("escalation_helper");
    expect(result.outcome).toBe("infra_error");
  });

  test("plan-R3-2: thrown subscribe (subscribe_infra) still runs the escalation branch — a down-and-unrecoverable watch is support-worthy", async () => {
    const tx = new FakeWatchTx();
    const { reconcileWatchChannels } = await import("@/lib/drive/watch");
    const deps = reconcileDeps(tx, {
      subscribeToWatchedFolder: vi.fn().mockRejectedValue(new Error("drive down")),
    });

    const result = await reconcileWatchChannels(NO_REFRESH, deps);

    expect(result.faults).toContain("subscribe_infra");
    expect(deps.maybeEscalateWatchOrphaned).toHaveBeenCalled();
  });

  test("active subscribe + resolveAdminAlert throw → alert_resolve_write fault, outcome infra_error, NO escalation call", async () => {
    // plan-R2 finding 1: a successful re-subscribe followed by a resolve DB fault
    // must not send Sentry/email as if the channel were still broken.
    const tx = new FakeWatchTx();
    const { reconcileWatchChannels } = await import("@/lib/drive/watch");
    const deps = reconcileDeps(tx, {
      resolveAdminAlert: vi.fn().mockRejectedValue(new Error("db down")),
    });

    const result = await reconcileWatchChannels(NO_REFRESH, deps);

    expect(deps.maybeEscalateWatchOrphaned).not.toHaveBeenCalled();
    expect(result.faults).toContain("alert_resolve_write");
    expect(result.outcome).toBe("infra_error");
  });

  test("escalation faults propagate into reconcile faults", async () => {
    const tx = new FakeWatchTx();
    const { reconcileWatchChannels } = await import("@/lib/drive/watch");
    const deps = reconcileDeps(tx, {
      subscribeToWatchedFolder: vi.fn().mockResolvedValue({
        outcome: "orphaned",
        channelId: "c",
        reason: "watch_create_failed",
      }),
      maybeEscalateWatchOrphaned: vi
        .fn()
        .mockResolvedValue({ escalated: true, faults: ["email_send"] }),
    });

    const result = await reconcileWatchChannels(NO_REFRESH, deps);

    expect(result.outcome).toBe("infra_error");
    expect(result.escalated).toBe(true);
    expect(result.faults).toContain("email_send");
  });
});

describe("Drive transaction-boundary class sweep", () => {
  test("Drive API calls are not reachable from DB transaction callbacks", () => {
    const offenders: string[] = [];
    const transactionScopedFunctions = [
      { path: "lib/drive/watch.ts", name: "withDefaultTx" },
      { path: "lib/drive/watch.ts", name: "subscribeWithTx" },
      { path: "lib/drive/watch.ts", name: "activateWithTx" },
      { path: "lib/drive/watch.ts", name: "markWatchOrphanedWithTx" },
      { path: "lib/sync/runScheduledCronSync.ts", name: "withPostgresSyncPipelineLock" },
      { path: "lib/sync/runOnboardingScan.ts", name: "defaultCreateScanTxRunner" },
      { path: "lib/sync/runOnboardingScan.ts", name: "scanPreparedFileWithTx" },
    ];
    const driveCallPattern =
      /\b(?:watchFolder|defaultWatchFolder|files\.watch|getDriveClient\(\)\.(?:files|channels)|fetchDriveFileMetadata|fetchSheetAsMarkdownAtRevision|listDriveFolder)\b/;

    function functionBody(source: string, name: string): string {
      const start = source.indexOf(`function ${name}`);
      expect(start, `${name} missing from transaction-boundary registry`).toBeGreaterThanOrEqual(0);
      const open = source.indexOf("{", start);
      let depth = 0;
      for (let index = open; index < source.length; index += 1) {
        if (source[index] === "{") depth += 1;
        if (source[index] === "}") depth -= 1;
        if (depth === 0) return source.slice(open, index + 1);
      }
      throw new Error(`Could not parse function body for ${name}`);
    }

    for (const entry of transactionScopedFunctions) {
      const source = readFileSync(join(process.cwd(), entry.path), "utf8");
      if (driveCallPattern.test(functionBody(source, entry.name))) offenders.push(entry.path);
    }

    expect(offenders).toEqual([]);

    const watchSource = readFileSync(join(process.cwd(), "lib/drive/watch.ts"), "utf8");
    expect(watchSource).not.toMatch(
      /withDefaultTx\(\(tx\)\s*=>\s*refreshWatchSubscriptions\(\{\s*\.\.\.deps,\s*tx\s*\}\)\)/,
    );
    expect(watchSource).not.toMatch(
      /withDefaultTx\(\(tx\)\s*=>\s*gcWatchChannels\(\{\s*\.\.\.deps,\s*tx\s*\}\)\)/,
    );
  });
});

describe("Drive watch telemetry", () => {
  // Uses the file-wide logRecords sink installed in the top-level beforeEach.
  const records = () => logRecords;

  const dueRow = (): WatchRow => ({
    id: "due-channel",
    status: "active",
    watchedFolderId: "folder-1",
    webhookSecret: "old-secret",
    resourceId: "resource-1",
    // Expires before the FakeWatchTx `now` (2026-05-09T12:00Z) + 24h threshold.
    expiresAt: "2026-05-10T00:00:00.000Z",
  });

  test("refreshWatchSubscriptions logs DRIVE_WATCH_RENEWAL_FAILED when a renewal orphans", async () => {
    const tx = new FakeWatchTx();
    tx.rows.push(dueRow());
    const { refreshWatchSubscriptions } = await import("@/lib/drive/watch");
    const subscribeToWatchedFolder = vi.fn(async () => ({
      outcome: "orphaned" as const,
      channelId: "orphan-channel",
      reason: "watch_create_failed" as const,
    }));

    const result = await refreshWatchSubscriptions({
      tx,
      now: () => tx.now,
      subscribeToWatchedFolder,
    });

    // Post-merge contract (this branch): failed renewals land in the typed
    // `orphaned` channel instead of `refreshed` (spec §3.2 Hardening).
    expect(result).toEqual({ refreshed: [], orphaned: ["folder-1"], failures: [] });

    const warnings = records().filter((r) => r.code === "DRIVE_WATCH_RENEWAL_FAILED");
    expect(warnings).toHaveLength(1);
    const warning = warnings[0]!;
    expect(warning.level).toBe("warn");
    expect(warning.source).toBe("drive.watch");
    // channelId/watchedFolderId derived from the injected SubscribeResult + due row.
    expect(warning.context).toMatchObject({
      channelId: "orphan-channel",
      watchedFolderId: "folder-1",
    });
  });

  test("refreshWatchSubscriptions does NOT log renewal-failure when the renewal succeeds", async () => {
    const tx = new FakeWatchTx();
    tx.rows.push(dueRow());
    const { refreshWatchSubscriptions } = await import("@/lib/drive/watch");
    const subscribeToWatchedFolder = vi.fn(async () => ({
      outcome: "active" as const,
      channelId: "renewed-channel",
    }));

    await refreshWatchSubscriptions({ tx, now: () => tx.now, subscribeToWatchedFolder });

    expect(records().filter((r) => r.code === "DRIVE_WATCH_RENEWAL_FAILED")).toEqual([]);
  });

  test("subscribeToWatchedFolder create-failure does NOT log DRIVE_WATCH_RENEWAL_FAILED (not a renewal)", async () => {
    const tx = new FakeWatchTx();
    const { subscribeToWatchedFolder } = await import("@/lib/drive/watch");

    const result = await subscribeToWatchedFolder("folder-1", {
      tx,
      uuid: () => "new-channel",
      webhookSecret: () => "secret-1",
      watchFolder: vi.fn(async () => {
        throw new Error("Drive unavailable");
      }),
    });

    // Initial create/activate orphans raise WATCH_CHANNEL_ORPHANED, not a renewal code.
    expect(result).toEqual({
      outcome: "orphaned",
      channelId: "new-channel",
      reason: "watch_create_failed",
    });
    expect(records().filter((r) => r.code === "DRIVE_WATCH_RENEWAL_FAILED")).toEqual([]);
  });

  test("refreshWatchSubscriptions logs DRIVE_WATCH_INFRA_FAULT and re-propagates on infra fault", async () => {
    const cause = new Error("connection reset by peer");
    class ThrowingTx extends FakeWatchTx {
      override async listExpiringActive(
        _thresholdIso: string,
      ): ReturnType<FakeWatchTx["listExpiringActive"]> {
        throw cause;
      }
    }
    const tx = new ThrowingTx();
    const { refreshWatchSubscriptions } = await import("@/lib/drive/watch");

    // Post-merge contract (this branch): refresh NEVER rejects — a list_expiring
    // infra fault becomes the typed "*" failures row (spec §3.2 Hardening / R5-3);
    // scheduler visibility comes from the route's 500 contract instead of a throw.
    const result = await refreshWatchSubscriptions({ tx, now: () => tx.now });
    expect(result).toEqual({
      refreshed: [],
      orphaned: [],
      failures: [{ folderId: "*", operation: "list_expiring" }],
    });

    const faults = records().filter((r) => r.code === "DRIVE_WATCH_INFRA_FAULT");
    expect(faults).toHaveLength(1);
    const fault = faults[0]!;
    expect(fault.level).toBe("error");
    expect(fault.source).toBe("drive.watch");
    expect(fault.context.operation).toBe("drive_watch_channels.list_expiring_active");
    // Redacted message (R5-1 contract) — never a raw error object.
    expect(fault.context).not.toHaveProperty("error");
    expect(String(fault.context.errorMessage)).toContain("connection reset by peer");
  });

  test("gcWatchChannels logs DRIVE_WATCH_INFRA_FAULT and re-propagates on infra fault", async () => {
    const cause = new Error("gc candidate query failed");
    class ThrowingGcTx extends FakeWatchTx {
      override async listGcCandidates(): ReturnType<FakeWatchTx["listGcCandidates"]> {
        throw cause;
      }
    }
    const tx = new ThrowingGcTx();
    const { gcWatchChannels, DriveWatchInfraError } = await import("@/lib/drive/watch");

    await expect(gcWatchChannels({ tx })).rejects.toBeInstanceOf(DriveWatchInfraError);

    const faults = records().filter((r) => r.code === "DRIVE_WATCH_INFRA_FAULT");
    expect(faults).toHaveLength(1);
    const fault = faults[0]!;
    expect(fault.level).toBe("error");
    expect(fault.source).toBe("drive.watch");
    expect(fault.context.operation).toBe("drive_watch_channels.list_gc_candidates");
    expect(fault.context.error).toMatchObject({ message: "gc candidate query failed" });
  });

  test("subscribeToWatchedFolder logs one DRIVE_WATCH_ACTIVATED info on activation success", async () => {
    const tx = new FakeWatchTx();
    const { subscribeToWatchedFolder } = await import("@/lib/drive/watch");

    const result = await subscribeToWatchedFolder("folder-1", {
      tx,
      uuid: () => "new-channel",
      webhookSecret: () => "secret-1",
      watchFolder: vi.fn(async () => ({
        id: "new-channel",
        resourceId: "resource-1",
        expiration: "2026-05-10T13:00:00.000Z",
      })),
    });

    expect(result).toEqual({ outcome: "active", channelId: "new-channel" });
    const activated = records().filter((r) => r.code === "DRIVE_WATCH_ACTIVATED");
    expect(activated).toHaveLength(1);
    expect(activated[0]!.level).toBe("info");
    expect(activated[0]!.source).toBe("drive.watch");
    expect(activated[0]!.context).toMatchObject({
      channelId: "new-channel",
      watchedFolderId: "folder-1",
      expiresAt: "2026-05-10T13:00:00.000Z",
    });
  });

  test("subscribeToWatchedFolder does NOT log DRIVE_WATCH_ACTIVATED when activation orphans", async () => {
    const tx = new FakeWatchTx();
    const { subscribeToWatchedFolder } = await import("@/lib/drive/watch");

    await subscribeToWatchedFolder("folder-1", {
      tx,
      uuid: () => "new-channel",
      webhookSecret: () => "secret-1",
      watchFolder: vi.fn(async () => {
        throw new Error("Drive unavailable");
      }),
    });

    expect(records().filter((r) => r.code === "DRIVE_WATCH_ACTIVATED")).toEqual([]);
  });

  test("gcWatchChannels logs DRIVE_WATCH_STOP_FAILED but still marks the channel stopped (control flow unchanged)", async () => {
    const tx = new FakeWatchTx();
    tx.rows.push({
      id: "orphaned-channel",
      status: "orphaned",
      watchedFolderId: "folder-1",
      webhookSecret: "secret-1",
      resourceId: "resource-1",
      expiresAt: null,
    });
    const { gcWatchChannels } = await import("@/lib/drive/watch");
    const stopChannel = vi.fn(async () => {
      throw new Error("channels.stop 404");
    });

    const result = await gcWatchChannels({ tx, stopChannel });

    // Non-fatal: the row is STILL marked stopped and returned despite the Drive fault.
    expect(result).toEqual({ stopped: ["orphaned-channel"] });
    expect(tx.rows.map((row) => row.status)).toEqual(["stopped"]);

    const warns = records().filter((r) => r.code === "DRIVE_WATCH_STOP_FAILED");
    expect(warns).toHaveLength(1);
    expect(warns[0]!.level).toBe("warn");
    expect(warns[0]!.source).toBe("drive.watch");
    expect(warns[0]!.context).toMatchObject({ channelId: "orphaned-channel" });
    expect(warns[0]!.context.error).toMatchObject({ message: "channels.stop 404" });
  });

  test("stale-pending sweep persists as DRIVE_WATCH_STALE_PENDING_SWEPT info, off the warn stream", async () => {
    const tx = new FakeWatchTx();
    const cutoff = tx.now.getTime() - STALE_PENDING_MAX_AGE_MS;
    tx.rows.push({
      id: "stale-1",
      status: "pending",
      watchedFolderId: "folder-1",
      webhookSecret: "s1",
      resourceId: null,
      expiresAt: null,
      createdAt: new Date(cutoff - 1000).toISOString(),
    });
    const { reconcileWatchChannels } = await import("@/lib/drive/watch");
    const deps = reconcileDeps(tx, {
      getActiveWatchedFolder: vi.fn().mockResolvedValue({ kind: "no_folder_configured" }),
    });

    const result = await reconcileWatchChannels(NO_REFRESH, deps);

    expect(result.sweptPending).toBe(1);
    const swept = records().filter((r) => r.code === "DRIVE_WATCH_STALE_PENDING_SWEPT");
    expect(swept).toHaveLength(1);
    expect(swept[0]!.level).toBe("info");
    expect(swept[0]!.source).toBe("drive.watch.reconcile");
    expect(swept[0]!.context).toMatchObject({ sweptIds: ["stale-1"] });
    // Downgraded off the warn stream: no warn-level record for this hygiene action.
    expect(
      records().filter(
        (r) => r.message === "stale pending watch channels swept" && r.level === "warn",
      ),
    ).toEqual([]);
  });
});
