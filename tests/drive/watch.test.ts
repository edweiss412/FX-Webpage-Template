import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  renewalLeadMs,
  RENEWAL_LIFE_FRACTION,
  RENEWAL_MIN_LEAD_MS,
  STALE_PENDING_MAX_AGE_MS,
} from "@/lib/drive/watchErrors";
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
  status: "pending" | "active" | "superseded" | "orphaned" | "expired" | "stopped";
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
      // Mirrors the production DEFAULT now() on created_at
      // (supabase/migrations/20260501001000_internal_and_admin.sql:291). Without
      // it a subscribe-then-refresh lifecycle hits listRenewalDue's NOT NULL
      // guard and fails in a way production cannot (R7 finding 2).
      createdAt: this.now.toISOString(),
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
  }): Promise<number> {
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
    // Mirrors production: only a row still in `pending` is promoted, and the
    // COUNT is returned so the caller can detect the zero-row case that the
    // canonical spec has always required to roll back.
    const pending = this.rows.find(
      (existing) => existing.id === row.id && existing.status === "pending",
    );
    if (!pending) return 0;
    pending.status = "active";
    pending.resourceId = row.resourceId;
    pending.expiresAt = row.expiresAt;
    return 1;
  }

  orphanedResourceIds: Array<[string, string | null | undefined]> = [];

  async markOrphaned(id: string, resourceId?: string | null) {
    this.orphanedResourceIds.push([id, resourceId]);
    this.operations.push(`markOrphaned:${id}`);
    // Mirrors production's `status = 'pending'` filter
    // (lib/drive/watch.ts markOrphaned). A permissive fake would mask
    // BL-WATCH-EXPIRED-ACTIVE-ROW, which IS that filter.
    const row = this.rows.find((existing) => existing.id === id && existing.status === "pending");
    if (row) row.status = "orphaned";
  }

  // Mirrors PostgresWatchTx.expireDeadActive EXACTLY, including the two-arm
  // predicate and the two DIFFERENT target statuses (spec §3.1.2). A fake that
  // collapses them hides the leak the split exists to prevent: an invalid lease
  // may still have a LIVE Drive channel, so it must reach GC's stop call.
  async expireDeadActive(): Promise<Array<{ id: string; status: "expired" | "superseded" }>> {
    this.operations.push("expireDeadActive");
    const out: Array<{ id: string; status: "expired" | "superseded" }> = [];
    for (const row of this.rows) {
      if (row.status !== "active" || !row.expiresAt || !row.createdAt) continue;
      const expires = Date.parse(row.expiresAt);
      const created = Date.parse(row.createdAt);
      const dead = expires <= this.now.getTime();
      const invalid = expires <= created;
      if (!dead && !invalid) continue;
      row.status = dead ? "expired" : "superseded";
      out.push({ id: row.id, status: row.status });
    }
    return out;
  }

  async upsertAdminAlert(input: { code: string; context: Record<string, unknown> }) {
    this.alerts.push(input);
  }

  // Mirrors PostgresWatchTx.listRenewalDue, and CALLS renewalLeadMs rather than
  // restating its arithmetic — an independent copy here is exactly how the
  // DB-free suite could stay green while production used different semantics.
  // (The previous version claimed to reuse the helper and did not; whole-diff
  // R1 finding 4.) `args` is NOT decorative and NOT mere signature parity: it is
  // threaded into `renewalLeadMs` below, which has no defaults
  // (`lib/drive/watchErrors.ts` — deliberately, per R7 finding 2). That is what
  // makes a wrong caller-assembled lead or fraction observable here rather than
  // silently corrected. (The earlier wording claimed the opposite and
  // contradicted the call site 20 lines down; whole-diff R8 finding 4.)
  async listRenewalDue(args: { nowIso: string; minLeadMs: number; lifeFraction: number }) {
    this.operations.push("listRenewalDue");
    const nowMs = Date.parse(args.nowIso);
    return this.rows.filter((row) => {
      if (row.status !== "active" || row.expiresAt === null) return false;
      const expiresMs = Date.parse(row.expiresAt);
      // `created_at` is NOT NULL in production
      // (supabase/migrations/20260501001000_internal_and_admin.sql:291). Treating
      // an omitted value as a zero-length lease would make a fixture "due" for a
      // reason production can never produce (whole-diff R4-4).
      if (row.createdAt === undefined) {
        throw new Error(`FakeWatchTx: row ${row.id} is missing createdAt (NOT NULL in production)`);
      }
      const createdMs = Date.parse(row.createdAt);
      // Inverted/zero-length lease: due immediately, matching the SQL's first arm.
      if (expiresMs <= createdMs) return true;
      // Calls the SHARED helper with the CALLER'S arguments (R4-4, R5-4): a fake
      // that restates the arithmetic, or that substitutes module constants for
      // the caller's values, stays green when the caller assembles a wrong lead
      // or fraction — exactly the drift the port change could introduce.
      const lead = renewalLeadMs(expiresMs - createdMs, args.minLeadMs, args.lifeFraction);
      return nowMs >= expiresMs - lead;
    });
  }

  async listGcCandidates() {
    this.operations.push("listGcCandidates");
    return this.rows.filter(
      (row) => row.status === "superseded" || row.status === "orphaned" || row.status === "expired",
    );
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

/**
 * Injects the configured-folder read for tests whose subject is the renewal
 * PREDICATE rather than the §3.2 folder filter. Returns the folder of the first
 * active row the test seeded, so those tests keep exercising what they were
 * written for. Without an injection each call would perform the real
 * service-role settings read and DB-free behaviour would depend on ambient
 * environment state.
 */
function folderOf(tx: FakeWatchTx) {
  return async () => {
    const row = tx.rows.find((r) => r.status === "active") ?? tx.rows[0];
    return { folderId: row?.watchedFolderId ?? "unset-folder", folderName: null };
  };
}

function seedActiveExpiring(tx: FakeWatchTx, folderIds: string[]) {
  for (const folderId of folderIds) {
    tx.rows.push({
      id: `channel-${folderId}`,
      status: "active",
      watchedFolderId: folderId,
      webhookSecret: "old-secret",
      resourceId: "resource-1",
      // A 24h lease created 19h ago with 5h remaining: still INSIDE its lease,
      // and renewal-due because 5h < the 6h lead for a 24h grant. It used to be
      // dated an hour PAST expiry, which the §3.1.2 reap now consumes before
      // `listRenewalDue` runs — that would leave this test exercising only the
      // reap while still passing its own name. `createdAt` is mandatory:
      // production's column is NOT NULL and the fake refuses to guess.
      createdAt: new Date(tx.now.getTime() - 19 * 60 * 60 * 1000).toISOString(),
      expiresAt: new Date(tx.now.getTime() + 5 * 60 * 60 * 1000).toISOString(),
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

    // `now` is injected so this fixture no longer reads as a lease in the past
    // against the real clock (which would trip the DRIVE_WATCH_GRANT_TOO_SHORT
    // path this test is not about). The 25h span deliberately EXCEEDS Drive's
    // documented 24h maximum: it is a synthetic longer-than-requested response,
    // exercising that we store what Drive returns rather than what we asked for.
    // It is not a claim that Drive grants 25h (whole-diff R2 finding 4).
    const result = await subscribeToWatchedFolder("folder-1", {
      tx,
      uuid: () => "new-channel",
      webhookSecret: () => "secret-1",
      now: () => Date.parse("2026-05-10T12:00:00.000Z"),
      watchFolder: vi.fn(async () => ({
        id: "new-channel",
        resourceId: "resource-1",
        expiration: "2026-05-11T13:00:00.000Z",
      })),
    });

    expect(result).toEqual({ outcome: "active", channelId: "new-channel" });
    expect(tx.rows).toEqual([
      expect.objectContaining({ id: "old-channel", status: "superseded" }),
      expect.objectContaining({
        id: "new-channel",
        status: "active",
        resourceId: "resource-1",
        expiresAt: "2026-05-11T13:00:00.000Z",
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
      }): Promise<number> {
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

  test("refreshWatchSubscriptions renews active rows inside their renewal window", async () => {
    const tx = new FakeWatchTx();
    tx.rows.push({
      id: "due-channel",
      status: "active",
      watchedFolderId: "folder-1",
      webhookSecret: "old-secret",
      resourceId: "resource-1",
      // 24h lease created 05-08T16:00, expiring 05-09T16:00. At tx.now
      // (05-09T12:00) it has 4h left against a 6h renewal lead, so it is due.
      createdAt: "2026-05-08T16:00:00.000Z",
      expiresAt: "2026-05-09T16:00:00.000Z",
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
      getActiveWatchedFolder: folderOf(tx) as never,
    });

    expect(result).toEqual({ refreshed: ["folder-1"], orphaned: [], failures: [] });
    expect(subscribeToWatchedFolder).toHaveBeenCalledWith("folder-1");
  });

  test("renewal uses the CALLER'S lead arguments, not module constants", async () => {
    // Whole-diff R4-4: the fake previously ignored args.minLeadMs/lifeFraction,
    // so a caller assembling the wrong values kept the DB-free suite green.
    // This row is due ONLY because of the absolute floor: a 6h lease whose
    // proportional lead (25% = 1.5h) has NOT yet elapsed, but which sits inside
    // the 2h floor. Pass minLeadMs = 0 and it stops being due — which is exactly
    // what a broken caller would do.
    const tx = new FakeWatchTx();
    tx.rows.push({
      id: "floor-governed",
      status: "active",
      watchedFolderId: "folder-floor",
      webhookSecret: "old-secret",
      resourceId: "resource-1",
      createdAt: new Date(tx.now.getTime() - 4 * 60 * 60 * 1000).toISOString(),
      expiresAt: new Date(tx.now.getTime() + 2 * 60 * 60 * 1000).toISOString(),
    });

    const due = await tx.listRenewalDue({
      nowIso: tx.now.toISOString(),
      minLeadMs: RENEWAL_MIN_LEAD_MS,
      lifeFraction: 1 - RENEWAL_LIFE_FRACTION,
    });
    expect(due.map((r) => r.watchedFolderId)).toEqual(["folder-floor"]);

    // The discriminating half: drop the floor and the row is no longer due.
    const withoutFloor = await tx.listRenewalDue({
      nowIso: tx.now.toISOString(),
      minLeadMs: 0,
      lifeFraction: 1 - RENEWAL_LIFE_FRACTION,
    });
    expect(withoutFloor).toEqual([]);
  });

  test("the CALLER assembles the correct minLeadMs (through refreshWatchSubscriptions)", async () => {
    // R7 finding 2: the floor fixture calls the fake DIRECTLY, so zeroing the
    // caller's minLeadMs was not discriminated by the DB-free suite. This drives
    // the real assembly path with a 6h lease at 4h elapsed: due via the 2h floor
    // (proportional lead is only 1.5h), NOT due if the caller passes 0.
    const tx = new FakeWatchTx();
    tx.rows.push({
      id: "caller-floor",
      status: "active",
      watchedFolderId: "folder-caller-floor",
      webhookSecret: "old-secret",
      resourceId: "resource-1",
      createdAt: new Date(tx.now.getTime() - 4 * 60 * 60 * 1000).toISOString(),
      expiresAt: new Date(tx.now.getTime() + 2 * 60 * 60 * 1000).toISOString(),
    });
    const { refreshWatchSubscriptions } = await import("@/lib/drive/watch");
    const subscribe = vi.fn(async () => ({ outcome: "active" as const, channelId: "x" }));

    const result = await refreshWatchSubscriptions({
      tx,
      now: () => tx.now,
      subscribeToWatchedFolder: subscribe,
      getActiveWatchedFolder: folderOf(tx) as never,
    });

    expect(subscribe).toHaveBeenCalledWith("folder-caller-floor");
    expect(result.refreshed).toEqual(["folder-caller-floor"]);
  });

  test("subscribe-then-refresh is a valid lifecycle in the fake (created_at is stamped)", async () => {
    // R7 finding 2: insertPending omitted created_at, so a row the fake itself
    // created was then rejected by listRenewalDue's NOT NULL guard — a failure
    // production cannot produce, since the column defaults to now().
    const tx = new FakeWatchTx();
    const { subscribeToWatchedFolder, refreshWatchSubscriptions } =
      await import("@/lib/drive/watch");
    await subscribeToWatchedFolder("folder-lifecycle", {
      tx,
      uuid: () => "lifecycle-channel",
      webhookSecret: () => "secret-1",
      now: () => tx.now.getTime(),
      watchFolder: vi.fn(async () => ({
        id: "lifecycle-channel",
        resourceId: "resource-1",
        expiration: new Date(tx.now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      })),
    });

    // Must not throw, and the freshly-activated 24h lease is not yet due.
    await expect(
      refreshWatchSubscriptions({
        tx,
        now: () => tx.now,
        subscribeToWatchedFolder: vi.fn(async () => ({
          outcome: "active" as const,
          channelId: "y",
        })),
      }),
    ).resolves.toEqual({ refreshed: [], orphaned: [], failures: [] });
  });

  test("the CALLER assembles the correct lifeFraction (through refreshWatchSubscriptions)", async () => {
    // R5 finding 3, and the reason the direct-call test below is not enough: that
    // one proves the FAKE honours the fraction, not that the caller passes the
    // right one. This drives the real assembly path. A 24h lease at 10h elapsed
    // is not due under the correct complement (lead 6h, due at 18h) but IS due
    // under the uncomplemented value (lead 18h, due at 6h) — so inverting
    // `1 - RENEWAL_LIFE_FRACTION` at the call site fails here.
    const tx = new FakeWatchTx();
    tx.rows.push({
      id: "caller-probe",
      status: "active",
      watchedFolderId: "folder-caller",
      webhookSecret: "old-secret",
      resourceId: "resource-1",
      createdAt: new Date(tx.now.getTime() - 10 * 60 * 60 * 1000).toISOString(),
      expiresAt: new Date(tx.now.getTime() + 14 * 60 * 60 * 1000).toISOString(),
    });
    const { refreshWatchSubscriptions } = await import("@/lib/drive/watch");
    const subscribe = vi.fn(async () => ({ outcome: "active" as const, channelId: "x" }));

    const result = await refreshWatchSubscriptions({
      tx,
      now: () => tx.now,
      subscribeToWatchedFolder: subscribe,
      getActiveWatchedFolder: folderOf(tx) as never,
    });

    expect(subscribe).not.toHaveBeenCalled();
    expect(result).toEqual({ refreshed: [], orphaned: [], failures: [] });
  });

  test("renewal discriminates a wrong lifeFraction, not just a wrong floor", async () => {
    // R5 finding 3: the floor fixture above passes under BOTH 0.25 and an
    // inverted 0.75, so it could not catch a caller that passed the fraction
    // uncomplemented. A 24h lease at 10h elapsed does discriminate:
    //   correct  (0.25) -> lead 6h,  due at 18h elapsed -> NOT due
    //   inverted (0.75) -> lead 18h, due at  6h elapsed -> due
    // A caller regression would renew every 24h lease after 6h instead of 18h.
    const tx = new FakeWatchTx();
    tx.rows.push({
      id: "fraction-probe",
      status: "active",
      watchedFolderId: "folder-fraction",
      webhookSecret: "old-secret",
      resourceId: "resource-1",
      createdAt: new Date(tx.now.getTime() - 10 * 60 * 60 * 1000).toISOString(),
      expiresAt: new Date(tx.now.getTime() + 14 * 60 * 60 * 1000).toISOString(),
    });

    const correct = await tx.listRenewalDue({
      nowIso: tx.now.toISOString(),
      minLeadMs: RENEWAL_MIN_LEAD_MS,
      lifeFraction: 1 - RENEWAL_LIFE_FRACTION,
    });
    expect(correct).toEqual([]);

    const inverted = await tx.listRenewalDue({
      nowIso: tx.now.toISOString(),
      minLeadMs: RENEWAL_MIN_LEAD_MS,
      lifeFraction: RENEWAL_LIFE_FRACTION, // the uncomplemented value
    });
    expect(inverted.map((r) => r.watchedFolderId)).toEqual(["folder-fraction"]);
  });

  // Rewritten for the §3.2 folder filter: a single run can only renew the ONE
  // configured folder, so the original four-folders-in-one-pass premise is gone.
  // The test's actual subject — that each outcome is classified into the right
  // channel — is preserved by running each case as its own single-folder pass,
  // which is what production does anyway.
  test.each([
    ["active", "refreshed"],
    ["watch_create_failed", "orphaned"],
    ["activate_failed_after_watch_created", "failures"],
    ["infra", "failures"],
  ] as const)("refresh classifies a %s outcome into `%s`", async (kind, bucket) => {
    const tx = new FakeWatchTx();
    const { refreshWatchSubscriptions, DriveWatchInfraError } = await import("@/lib/drive/watch");
    seedActiveExpiring(tx, ["folder-x"]);
    const subscribe = vi.fn(async () => {
      if (kind === "active") return { outcome: "active", channelId: "a" } as const;
      if (kind === "infra")
        throw new DriveWatchInfraError("drive_watch_channels.insert_pending", new Error("db down"));
      return { outcome: "orphaned", channelId: "c", reason: kind } as const;
    });

    const result = await refreshWatchSubscriptions({
      tx,
      now: () => tx.now,
      subscribeToWatchedFolder: subscribe as never,
      getActiveWatchedFolder: folderOf(tx) as never,
    });

    expect(subscribe).toHaveBeenCalledTimes(1);
    if (bucket === "refreshed") expect(result.refreshed).toEqual(["folder-x"]);
    else if (bucket === "orphaned") expect(result.orphaned).toEqual(["folder-x"]);
    else {
      expect(result.failures).toEqual([
        {
          folderId: "folder-x",
          operation: kind === "infra" ? "subscribe" : "activate_pending",
        },
      ]);
    }
  });

  test("refresh catches a list_expiring DB failure into the typed failures channel (never rejects)", async () => {
    const tx = new FakeWatchTx();
    tx.listRenewalDue = async () => {
      throw new Error("connection refused");
    };
    const { refreshWatchSubscriptions } = await import("@/lib/drive/watch");

    const result = await refreshWatchSubscriptions({
      tx,
      now: () => tx.now,
      getActiveWatchedFolder: folderOf(tx) as never,
    });

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
      // 24h lease created 05-08T16:00, expiring 05-09T16:00. At tx.now
      // (05-09T12:00) it has 4h left against a 6h renewal lead, so it is due.
      createdAt: "2026-05-08T16:00:00.000Z",
      expiresAt: "2026-05-09T16:00:00.000Z",
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
      getActiveWatchedFolder: folderOf(tx) as never,
    } as unknown as Parameters<typeof refreshWatchSubscriptions>[0]);

    expect(result).toEqual({ refreshed: ["folder-1"], orphaned: [], failures: [] });
    // The reap now precedes the read inside the same transaction (spec §3.1.3).
    expect(tx.operations).toEqual(["expireDeadActive", "listRenewalDue"]);
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
      // 24h lease created 05-08T16:00, expiring 05-09T16:00. At tx.now
      // (05-09T12:00) it has 4h left against a 6h renewal lead, so it is due.
      createdAt: "2026-05-08T16:00:00.000Z",
      expiresAt: "2026-05-09T16:00:00.000Z",
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
      getActiveWatchedFolder: folderOf(tx) as never,
    } as unknown as Parameters<typeof refreshWatchSubscriptions>[0]);

    expect(result).toEqual({
      refreshed: [],
      orphaned: [],
      failures: [{ folderId: "folder-1", operation: "subscribe" }],
    });
    expect(tx.rows).toEqual(before);
    // The reap now precedes the read inside the same transaction (spec §3.1.3).
    expect(tx.operations).toEqual(["expireDeadActive", "listRenewalDue"]);
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
      // 24h lease created 05-08T16:00, expiring 05-09T16:00. At tx.now
      // (05-09T12:00) it has 4h left against a 6h renewal lead, so it is due.
      createdAt: "2026-05-08T16:00:00.000Z",
      expiresAt: "2026-05-09T16:00:00.000Z",
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
    // 24h lease created 05-08T16:00, expiring 05-09T16:00. At the FakeWatchTx
    // `now` (2026-05-09T12:00Z) it has 4h left against a 6h renewal lead
    // (25% of a 24h grant), so it is inside its renewal window.
    createdAt: "2026-05-08T16:00:00.000Z",
    expiresAt: "2026-05-09T16:00:00.000Z",
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
      getActiveWatchedFolder: folderOf(tx) as never,
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

    await refreshWatchSubscriptions({
      tx,
      now: () => tx.now,
      subscribeToWatchedFolder,
      getActiveWatchedFolder: folderOf(tx) as never,
    });

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
      override async listRenewalDue(_args: {
        nowIso: string;
        minLeadMs: number;
        lifeFraction: number;
      }): ReturnType<FakeWatchTx["listRenewalDue"]> {
        throw cause;
      }
    }
    const tx = new ThrowingTx();
    const { refreshWatchSubscriptions } = await import("@/lib/drive/watch");

    // Post-merge contract (this branch): refresh NEVER rejects — a list_expiring
    // infra fault becomes the typed "*" failures row (spec §3.2 Hardening / R5-3);
    // scheduler visibility comes from the route's 500 contract instead of a throw.
    const result = await refreshWatchSubscriptions({
      tx,
      now: () => tx.now,
      getActiveWatchedFolder: folderOf(tx) as never,
    });
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
    expect(fault.context.operation).toBe("drive_watch_channels.list_renewal_due");
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

describe("watch renewal lifecycle — reap and GC (spec §3.1)", () => {
  test("the reap runs BEFORE the renewal read, in that order", async () => {
    const tx = new FakeWatchTx();
    const subscribe = vi.fn(async (folderId: string) => ({
      outcome: "active" as const,
      channelId: `c-${folderId}`,
    }));
    const { refreshWatchSubscriptions } = await import("@/lib/drive/watch");
    await refreshWatchSubscriptions({
      tx: tx as never,
      now: () => tx.now,
      subscribeToWatchedFolder: subscribe,
      getActiveWatchedFolder: async () => ({ folderId: "folder-1", folderName: null }),
    });
    // ORDER, not presence: a reap ordered AFTER the read leaves the stale row in
    // `due` and reduces the whole fix to a no-op.
    expect(tx.operations.slice(0, 2)).toEqual(["expireDeadActive", "listRenewalDue"]);
  });

  test("a genuinely expired row is reaped to `expired`; an inverted lease with a FUTURE expiry to `superseded`", async () => {
    const tx = new FakeWatchTx();
    const t = tx.now.getTime();
    tx.rows.push({
      id: "dead",
      status: "active",
      watchedFolderId: "folder-dead",
      webhookSecret: "s",
      resourceId: "r",
      createdAt: new Date(t - 30 * 3_600_000).toISOString(),
      expiresAt: new Date(t - 6 * 3_600_000).toISOString(),
    });
    tx.rows.push({
      id: "inverted",
      status: "active",
      watchedFolderId: "folder-inv",
      webhookSecret: "s",
      resourceId: "r",
      createdAt: new Date(t + 30 * 3_600_000).toISOString(),
      expiresAt: new Date(t + 24 * 3_600_000).toISOString(),
    });
    tx.rows.push({
      id: "healthy",
      status: "active",
      watchedFolderId: "folder-ok",
      webhookSecret: "s",
      resourceId: "r",
      createdAt: new Date(t - 3_600_000).toISOString(),
      expiresAt: new Date(t + 23 * 3_600_000).toISOString(),
    });

    await tx.expireDeadActive();

    // Assert the resulting STATUS, not merely that the rows left `active`: a
    // status-blind assertion passes while a possibly-live Drive channel is
    // abandoned with nothing left to stop it (spec §3.1.2).
    expect(tx.rows.find((r) => r.id === "dead")!.status).toBe("expired");
    expect(tx.rows.find((r) => r.id === "inverted")!.status).toBe("superseded");
    expect(tx.rows.find((r) => r.id === "healthy")!.status).toBe("active");
  });

  test("GC skips channels.stop for `expired` but calls it for `superseded`, and marks both stopped", async () => {
    const tx = new FakeWatchTx();
    tx.rows.push({
      id: "exp",
      status: "expired",
      watchedFolderId: "f",
      webhookSecret: "s",
      resourceId: "r-exp",
      createdAt: tx.now.toISOString(),
      expiresAt: tx.now.toISOString(),
    });
    tx.rows.push({
      id: "sup",
      status: "superseded",
      watchedFolderId: "f2",
      webhookSecret: "s",
      resourceId: "r-sup",
      createdAt: tx.now.toISOString(),
      expiresAt: tx.now.toISOString(),
    });
    const stopChannel = vi.fn(async () => {});

    const { gcWatchChannels } = await import("@/lib/drive/watch");
    const result = await gcWatchChannels({ tx: tx as never, stopChannel });

    // Assert the spy's call LIST by channel id — a count-only assertion passes
    // if it skipped the wrong one.
    expect(stopChannel.mock.calls.map((c) => (c as unknown as [{ id: string }])[0].id)).toEqual([
      "sup",
    ]);
    expect(result.stopped.sort()).toEqual(["exp", "sup"]);
  });
});

describe("watch renewal — configured-folder filter (spec §3.2.2)", () => {
  function dueRow(tx: FakeWatchTx, folderId: string, id = `ch-${folderId}`) {
    const t = tx.now.getTime();
    tx.rows.push({
      id,
      status: "active",
      watchedFolderId: folderId,
      webhookSecret: "s",
      resourceId: "r",
      createdAt: new Date(t - 19 * 3_600_000).toISOString(), // 24h lease, 5h left => due
      expiresAt: new Date(t + 5 * 3_600_000).toISOString(),
    });
  }

  async function runRefresh(tx: FakeWatchTx, folder: unknown, subscribe: ReturnType<typeof vi.fn>) {
    const { refreshWatchSubscriptions } = await import("@/lib/drive/watch");
    return refreshWatchSubscriptions({
      tx: tx as never,
      now: () => tx.now,
      subscribeToWatchedFolder: subscribe as never,
      getActiveWatchedFolder: async () => folder as never,
    });
  }

  test("renews ONLY the configured folder, asserted by ARGUMENT not count", async () => {
    const tx = new FakeWatchTx();
    dueRow(tx, "folder-configured");
    dueRow(tx, "folder-stale");
    const subscribe = vi.fn(async () => ({ outcome: "active" as const, channelId: "c" }));

    await runRefresh(tx, { folderId: "folder-configured", folderName: null }, subscribe);

    // The argument, not the count: a count-only assertion passes on the wrong folder.
    expect(subscribe.mock.calls.map((c) => (c as unknown as [string])[0])).toEqual([
      "folder-configured",
    ]);
  });

  test("`getActiveWatchedFolder` is called EXACTLY once per run", async () => {
    const tx = new FakeWatchTx();
    dueRow(tx, "f1");
    dueRow(tx, "f2");
    const subscribe = vi.fn(async () => ({ outcome: "active" as const, channelId: "c" }));
    const getFolder = vi.fn(async () => ({ folderId: "f1", folderName: null }));
    const { refreshWatchSubscriptions } = await import("@/lib/drive/watch");
    await refreshWatchSubscriptions({
      tx: tx as never,
      now: () => tx.now,
      subscribeToWatchedFolder: subscribe as never,
      getActiveWatchedFolder: getFolder as never,
    });
    // Every other folder-filter assertion is satisfied by a per-row read, which
    // would additionally admit MORE than one folder if config changed mid-loop.
    expect(getFolder).toHaveBeenCalledTimes(1);
  });

  test("no_folder_configured renews nothing, with a DUE row present", async () => {
    const tx = new FakeWatchTx();
    dueRow(tx, "f1"); // precondition: without it the assertion holds vacuously
    const subscribe = vi.fn(async () => ({ outcome: "active" as const, channelId: "c" }));

    const result = await runRefresh(tx, { kind: "no_folder_configured" }, subscribe);

    expect(subscribe).toHaveBeenCalledTimes(0);
    expect(result.failures).toEqual([]);
  });

  test("folder-read infra_error with due rows: renews NOTHING and records the '*' failure", async () => {
    const tx = new FakeWatchTx();
    dueRow(tx, "f1");
    const subscribe = vi.fn(async () => ({ outcome: "active" as const, channelId: "c" }));

    const result = await runRefresh(tx, { kind: "infra_error", operation: "x" }, subscribe);

    expect(subscribe).toHaveBeenCalledTimes(0);
    expect(result.failures).toEqual([{ folderId: "*", operation: "folder_read" }]);
  });

  test("folder-read failure with ZERO due rows records NO failure, but still emits", async () => {
    const tx = new FakeWatchTx(); // no due rows seeded
    const subscribe = vi.fn(async () => ({ outcome: "active" as const, channelId: "c" }));

    const result = await runRefresh(tx, { kind: "infra_error", operation: "x" }, subscribe);

    // Two regressions hide here: always recording '*' manufactures a false 500
    // and marks a live channel renewal-dirty; returning before the folder read
    // suppresses the forensic emit entirely.
    expect(result.failures).toEqual([]);
    expect(
      logRecords.filter((r) => r.message === "refresh-watch configured-folder read failed"),
    ).toHaveLength(1);
  });

  test("a thrown folder read behaves like infra_error and never rejects", async () => {
    const tx = new FakeWatchTx();
    dueRow(tx, "f1");
    const subscribe = vi.fn(async () => ({ outcome: "active" as const, channelId: "c" }));
    const { refreshWatchSubscriptions } = await import("@/lib/drive/watch");

    const result = await refreshWatchSubscriptions({
      tx: tx as never,
      now: () => tx.now,
      subscribeToWatchedFolder: subscribe as never,
      getActiveWatchedFolder: (async () => {
        throw new Error("settings read blew up");
      }) as never,
    });

    expect(result.failures).toEqual([{ folderId: "*", operation: "folder_read" }]);
  });
});

describe("activation and GC failure branches (whole-diff findings 2 and 5)", () => {
  test("activatePending returning ZERO orphans the channel AND records its Drive resourceId", async () => {
    // Promotion orphaned the pending row between the insert and the activation,
    // so activatePending matches zero rows and returns 0 WITHOUT throwing —
    // the case no existing test covered, since they all threw instead.
    class ZeroActivationTx extends FakeWatchTx {
      override async activatePending(): Promise<number> {
        this.operations.push("activatePending:zero-rows");
        return 0;
      }
    }
    const tx = new ZeroActivationTx();
    const { subscribeToWatchedFolder } = await import("@/lib/drive/watch");

    const result = await subscribeToWatchedFolder("folder-1", {
      tx: tx as never,
      uuid: () => "ch-zero",
      webhookSecret: () => "s",
      now: () => tx.now.getTime(),
      watchFolder: async () => ({
        id: "ch-zero",
        resourceId: "google-resource-1",
        expiration: new Date(tx.now.getTime() + 86_400_000).toISOString(),
      }),
    });

    // Removing the zero-count check would make this resolve `active`: the
    // existing tests only ever THREW from activatePending, so none of them
    // discriminated (finding 5).
    expect(result).toMatchObject({ outcome: "orphaned" });
    // And the resourceId must be recorded, or GC's channels.stop exits early on
    // the null and the Drive channel stays live to its lease (finding 2).
    expect(tx.orphanedResourceIds).toEqual([["ch-zero", "google-resource-1"]]);
  });

  test("a SUPERSEDED row whose stop fails with a real 404 IS marked stopped", async () => {
    const tx = new FakeWatchTx();
    tx.rows.push({
      id: "sup-404",
      status: "superseded",
      watchedFolderId: "f",
      webhookSecret: "s",
      resourceId: "r",
      createdAt: tx.now.toISOString(),
      expiresAt: tx.now.toISOString(),
    });
    const { gcWatchChannels } = await import("@/lib/drive/watch");

    const result = await gcWatchChannels({
      tx: tx as never,
      stopChannel: async () => {
        // A REAL gaxios 404 shape. The pre-existing test threw
        // `new Error("channels.stop 404")`, whose message contains "404" but
        // carries no numeric status — so it never exercised the classification.
        throw Object.assign(new Error("Channel not found"), { response: { status: 404 } });
      },
    });

    expect(result.stopped).toEqual(["sup-404"]);
    expect(tx.rows[0]!.status).toBe("stopped");
  });

  test("a SUPERSEDED row whose stop fails non-404 is LEFT superseded for retry", async () => {
    const tx = new FakeWatchTx();
    tx.rows.push({
      id: "sup-503",
      status: "superseded",
      watchedFolderId: "f",
      webhookSecret: "s",
      resourceId: "r",
      createdAt: tx.now.toISOString(),
      expiresAt: tx.now.toISOString(),
    });
    const { gcWatchChannels } = await import("@/lib/drive/watch");

    const result = await gcWatchChannels({
      tx: tx as never,
      stopChannel: async () => {
        throw Object.assign(new Error("backend error"), { response: { status: 503 } });
      },
    });

    // Abandoning it here would leak a possibly-live channel — the exact reason
    // §3.1.2 routes invalid leases to `superseded` rather than `expired`.
    expect(result.stopped).toEqual([]);
    expect(tx.rows[0]!.status).toBe("superseded");
  });
});
