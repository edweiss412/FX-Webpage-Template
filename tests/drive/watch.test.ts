import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { LogRecord } from "@/lib/log/types";

type WatchRow = {
  id: string;
  status: "pending" | "active" | "superseded" | "orphaned" | "stopped";
  watchedFolderId: string;
  webhookSecret: string;
  resourceId: string | null;
  expiresAt: string | null;
};

class FakeWatchTx {
  rows: WatchRow[] = [];
  alerts: Array<{ code: string; context: Record<string, unknown> }> = [];
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

    const result = await subscribeToWatchedFolder("folder-1", {
      tx,
      uuid: () => "new-channel",
      webhookSecret: () => "secret-1",
      watchFolder: vi.fn(async () => {
        throw new Error("Drive unavailable");
      }),
    });

    expect(result).toEqual({ outcome: "orphaned", channelId: "new-channel" });
    expect(tx.rows).toEqual([expect.objectContaining({ id: "new-channel", status: "orphaned" })]);
    expect(tx.alerts).toEqual([
      {
        code: "WATCH_CHANNEL_ORPHANED",
        context: {
          watched_folder_id: "folder-1",
          channel_id: "new-channel",
          reason: "watch_create_failed",
        },
      },
    ]);
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

    expect(result).toEqual({ outcome: "orphaned", channelId: "new-channel" });
    expect(tx.rows).toEqual([expect.objectContaining({ id: "new-channel", status: "orphaned" })]);
    expect(events).toEqual(["tx:start", "tx:commit", "drive:watch", "tx:start", "tx:commit"]);
    expect(tx.alerts).toEqual([
      {
        code: "WATCH_CHANNEL_ORPHANED",
        context: {
          watched_folder_id: "folder-1",
          channel_id: "new-channel",
          reason: "watch_create_failed",
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

    expect(result).toEqual({ outcome: "orphaned", channelId: "google-channel" });
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

    expect(result).toEqual({ refreshed: ["folder-1"] });
    expect(subscribeToWatchedFolder).toHaveBeenCalledWith("folder-1");
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

    expect(result).toEqual({ refreshed: ["folder-1"] });
    expect(tx.operations).toEqual(["listExpiringActive"]);
    expect(events).toEqual(["tx:start", "tx:commit", "drive:subscribe"]);
  });

  test("refreshWatchSubscriptions leaves DB state unchanged when Drive renewal fails after candidate commit", async () => {
    const tx = new FakeWatchTx();
    tx.rows.push({
      id: "due-channel",
      status: "active",
      watchedFolderId: "folder-1",
      webhookSecret: "old-secret",
      resourceId: "resource-1",
      expiresAt: "2026-05-10T00:00:00.000Z",
    });
    const before = structuredClone(tx.rows);
    const events: string[] = [];
    const { refreshWatchSubscriptions } = await import("@/lib/drive/watch");

    await expect(
      refreshWatchSubscriptions({
        withTx: async <R>(fn: (tx: FakeWatchTx) => Promise<R>) => {
          events.push("tx:start");
          const value = await fn(tx);
          events.push("tx:commit");
          return value;
        },
        now: () => tx.now,
        subscribeToWatchedFolder: vi.fn(async () => {
          events.push("drive:subscribe");
          throw new Error("Drive refresh failed");
        }),
      } as unknown as Parameters<typeof refreshWatchSubscriptions>[0]),
    ).rejects.toThrow("Drive refresh failed");

    expect(tx.rows).toEqual(before);
    expect(tx.operations).toEqual(["listExpiringActive"]);
    expect(events).toEqual(["tx:start", "tx:commit", "drive:subscribe"]);
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
  let records: LogRecord[];

  const dueRow = (): WatchRow => ({
    id: "due-channel",
    status: "active",
    watchedFolderId: "folder-1",
    webhookSecret: "old-secret",
    resourceId: "resource-1",
    // Expires before the FakeWatchTx `now` (2026-05-09T12:00Z) + 24h threshold.
    expiresAt: "2026-05-10T00:00:00.000Z",
  });

  beforeEach(async () => {
    records = [];
    const { setLogSink } = await import("@/lib/log");
    setLogSink((record) => {
      records.push(record);
    });
  });

  afterEach(async () => {
    // Restore a silent, persist-free sink (NOT resetLogSink, whose default sink
    // lazily imports persist → Supabase and can raise EnvironmentTeardownError).
    const { setLogSink } = await import("@/lib/log");
    setLogSink(() => {});
  });

  test("refreshWatchSubscriptions logs DRIVE_WATCH_RENEWAL_FAILED when a renewal orphans", async () => {
    const tx = new FakeWatchTx();
    tx.rows.push(dueRow());
    const { refreshWatchSubscriptions } = await import("@/lib/drive/watch");
    const subscribeToWatchedFolder = vi.fn(async () => ({
      outcome: "orphaned" as const,
      channelId: "orphan-channel",
    }));

    const result = await refreshWatchSubscriptions({
      tx,
      now: () => tx.now,
      subscribeToWatchedFolder,
    });

    // Control flow unchanged: the folder is still recorded as attempted.
    expect(result).toEqual({ refreshed: ["folder-1"] });

    const warnings = records.filter((r) => r.code === "DRIVE_WATCH_RENEWAL_FAILED");
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

    expect(records.filter((r) => r.code === "DRIVE_WATCH_RENEWAL_FAILED")).toEqual([]);
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
    expect(result).toEqual({ outcome: "orphaned", channelId: "new-channel" });
    expect(records.filter((r) => r.code === "DRIVE_WATCH_RENEWAL_FAILED")).toEqual([]);
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
    const { refreshWatchSubscriptions, DriveWatchInfraError } = await import("@/lib/drive/watch");

    await expect(refreshWatchSubscriptions({ tx, now: () => tx.now })).rejects.toBeInstanceOf(
      DriveWatchInfraError,
    );

    const faults = records.filter((r) => r.code === "DRIVE_WATCH_INFRA_FAULT");
    expect(faults).toHaveLength(1);
    const fault = faults[0]!;
    expect(fault.level).toBe("error");
    expect(fault.source).toBe("drive.watch");
    expect(fault.context.operation).toBe("drive_watch_channels.list_expiring_active");
    // context.error is serializeError(err.rootCause) — carries the injected cause.
    expect(fault.context.error).toMatchObject({ message: "connection reset by peer" });
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

    const faults = records.filter((r) => r.code === "DRIVE_WATCH_INFRA_FAULT");
    expect(faults).toHaveLength(1);
    const fault = faults[0]!;
    expect(fault.level).toBe("error");
    expect(fault.source).toBe("drive.watch");
    expect(fault.context.operation).toBe("drive_watch_channels.list_gc_candidates");
    expect(fault.context.error).toMatchObject({ message: "gc candidate query failed" });
  });
});
