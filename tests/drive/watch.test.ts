import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  classifyWatchError,
  renewalLeadMs,
  RENEWAL_LIFE_FRACTION,
  RENEWAL_MIN_LEAD_MS,
  STALE_PENDING_MAX_AGE_MS,
} from "@/lib/drive/watchErrors";
import { setLogSink } from "@/lib/log";
import type { LogRecord } from "@/lib/log/types";
import { premiseHolds } from "../_shared/premise";
import type { ActivatePendingResult } from "@/lib/drive/watch";

// TYPED partial mock: every export stays real (`...actual`) and only the
// classifier is wrapped in a spy delegating to the genuine implementation, so
// no existing case changes behaviour. `SubscribeDeps` has no classifier member,
// so a spy on this import is the only executable seam for "the folder_changed
// branch never reaches classifyWatchError" (spec §3.2, row 2).
vi.mock("@/lib/drive/watchErrors", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/drive/watchErrors")>();
  return { ...actual, classifyWatchError: vi.fn(actual.classifyWatchError) };
});

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

  /**
   * The §3.1 activation-guard input, modelled at this port because the settings
   * comparison is part of `activatePending`'s CONTRACT (spec §3.2 test-ports
   * row). `null` means the settings row is ABSENT — the four-row rule requires
   * absence to be representable, and absent maps to PROCEED, so every
   * pre-existing case is behaviourally unchanged without per-case wiring (the
   * fake receives no folder at construction, and existing cases subscribe with
   * different folders, so a matched-folder default is not derivable).
   */
  settingsRow: { watched_folder_id: string | null } | null = null;

  async activatePending(row: {
    id: string;
    watchedFolderId: string;
    resourceId: string;
    expiresAt: string;
  }): Promise<ActivatePendingResult> {
    this.operations.push(`activatePending:${row.id}`);
    // Mirrors the production guard's rule exactly (spec §3.1): abort iff the
    // row EXISTS and its value is non-NULL and names a different folder.
    const configured = this.settingsRow?.watched_folder_id ?? null;
    if (this.settingsRow !== null && configured !== null && configured !== row.watchedFolderId) {
      return { promoted: 0, abortedFolderMismatch: true, configuredFolderId: configured };
    }
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
    // COUNT is reported so the caller can detect the zero-row case that the
    // canonical spec has always required to roll back.
    const pending = this.rows.find(
      (existing) => existing.id === row.id && existing.status === "pending",
    );
    if (!pending) return { promoted: 0, abortedFolderMismatch: false };
    pending.status = "active";
    pending.resourceId = row.resourceId;
    pending.expiresAt = row.expiresAt;
    return { promoted: 1, abortedFolderMismatch: false };
  }

  orphanedResourceIds: Array<[string, string | null | undefined]> = [];

  async markOrphaned(id: string, resourceId?: string | null) {
    this.orphanedResourceIds.push([id, resourceId]);
    this.operations.push(`markOrphaned:${id}`);
    // Mirrors production's predicate EXACTLY (lib/drive/watch.ts markOrphaned),
    // including the third arm that reopens a `stopped` row which never actually
    // reached Drive. A permissive fake would mask BL-WATCH-EXPIRED-ACTIVE-ROW,
    // which IS this filter; a stale one — this mirrored only `pending` after
    // production had widened to `pending`/`orphaned` — silently stops testing
    // the arms it omits.
    const row = this.rows.find(
      (existing) =>
        existing.id === id &&
        (existing.status === "pending" ||
          existing.status === "orphaned" ||
          (existing.status === "stopped" &&
            existing.resourceId === null &&
            resourceId !== null &&
            resourceId !== undefined)),
    );
    if (row) {
      row.status = "orphaned";
      row.resourceId = resourceId ?? row.resourceId;
    }
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
    // COPIES, like production. Returning live references let a later write in
    // the same pass retroactively change what GC believed it had read, which
    // silently disarmed every mid-pass race test written against this fake.
    return this.rows
      .filter(
        (row) =>
          row.status === "superseded" || row.status === "orphaned" || row.status === "expired",
      )
      .map((row) => ({ ...row }));
  }

  async markStopped(id: string, expectedResourceId: string | null = null): Promise<number> {
    this.operations.push(`markStopped:${id}`);
    // Mirrors production's resource-id guard EXACTLY: a candidate whose id moved
    // between GC's read and its write must NOT be marked stopped.
    const row = this.rows.find(
      (existing) => existing.id === id && (existing.resourceId ?? null) === expectedResourceId,
    );
    if (!row) return 0;
    row.status = "stopped";
    return 1;
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

  // --- backoff spec §3.3a state-write surface (write-iff-attempt) ---
  attemptRecords: Array<{
    kind: "failure" | "success";
    folderId: string;
    errorClass?: string;
    errorMessage?: string;
  }> = [];
  failRecordAttempt: "failure" | "success" | null = null;
  gateRow: { consecutiveFailures: number; nextAttemptAt: string; waiting: boolean } | null = null;
  failGateRead = false;

  async recordAttemptFailure(folderId: string, errorClass: string, errorMessage: string) {
    this.operations.push(`recordAttemptFailure:${folderId}`);
    if (this.failRecordAttempt === "failure") throw new Error("state write down");
    this.attemptRecords.push({ kind: "failure", folderId, errorClass, errorMessage });
    return {
      consecutiveFailures: this.attemptRecords.filter((r) => r.kind === "failure").length,
      nextAttemptAt: new Date(this.now.getTime() + 900_000).toISOString(),
    };
  }

  async recordAttemptSuccess(folderId: string) {
    this.operations.push(`recordAttemptSuccess:${folderId}`);
    if (this.failRecordAttempt === "success") throw new Error("state write down");
    this.attemptRecords.push({ kind: "success", folderId });
    return { consecutiveFailures: 0, nextAttemptAt: this.now.toISOString() };
  }

  async readReconcileGate(folderId: string) {
    this.operations.push(`readReconcileGate:${folderId}`);
    if (this.failGateRead) throw new Error("gate read down");
    return this.gateRow;
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
    subscribeToWatchedFolder: vi.fn().mockResolvedValue({
      outcome: "active",
      channelId: "c",
      attempt: { consecutiveFailures: 0, nextAttemptAt: "2026-05-09T12:00:00.000Z" },
    }),
    ...over,
  };
}

describe("Drive watch lifecycle", () => {
  test("default Postgres watch path wraps supersede and activate in one transaction", () => {
    const source = readFileSync(join(process.cwd(), "lib/drive/watch.ts"), "utf8");

    // Scoped to the default runner's body. Searching the whole FILE for any
    // `sql.begin(` passed even if this path stopped using one — partial
    // supersession could then commit before an activation failure without this
    // named test noticing (whole-diff R6 finding 3).
    // `sql.begin(` with the paren: the bare name also appears in two comments,
    // and slicing from a comment measured nothing.
    const begin = source.indexOf("sql.begin(");
    expect(begin).toBeGreaterThan(-1);
    const runner = source.slice(begin, source.indexOf("\n}", begin));
    // The transaction hands its raw connection to the port every caller uses,
    // so every statement in the callback shares it.
    expect(runner).toMatch(/new PostgresWatchTx\s*\(/);
    expect(source.slice(0, begin)).not.toContain("sql.begin(");

    // And supersession lives INSIDE activatePending, which that transaction
    // runs — so the two cannot be split without moving one of them.
    const activate = source.slice(
      source.indexOf("async activatePending("),
      source.indexOf("async markStopped("),
    );
    expect(activate).toMatch(/set status = 'superseded'/);
    expect(activate).toMatch(/set status = 'active'/);

    // The §3.1 activation guard shares that transaction too, and the §3.4 lock
    // ordering requires it to run BEFORE either channel UPDATE — a guard placed
    // after them would take the settings row second and open a deadlock cycle.
    expect(activate).toMatch(
      /select watched_folder_id from public\.app_settings where id = 'default' for share/,
    );
    const guard = activate.indexOf("for share");
    expect(guard).toBeLessThan(activate.indexOf("set status = 'superseded'"));
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

    expect(result).toEqual({ outcome: "active", channelId: "new-channel", attempt: null });
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
    expect(result).toMatchObject({
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

    expect(result).toMatchObject({
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
      }): Promise<ActivatePendingResult> {
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

    expect(result).toMatchObject({
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
      attempt: null,
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
    const subscribe = vi.fn(async () => ({
      outcome: "active" as const,
      channelId: "x",
      attempt: null,
    }));

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
          attempt: null,
        })),
        getActiveWatchedFolder: folderOf(tx) as never,
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
    const subscribe = vi.fn(async () => ({
      outcome: "active" as const,
      channelId: "x",
      attempt: null,
    }));

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
      if (kind === "active") return { outcome: "active", channelId: "a", attempt: null } as const;
      if (kind === "infra")
        throw new DriveWatchInfraError("drive_watch_channels.insert_pending", new Error("db down"));
      return {
        outcome: "orphaned",
        channelId: "c",
        reason: kind,
        errorClass: "drive_api",
        errorMessage: "fixture",
        attempt: null,
      } as const;
    });

    const result = await refreshWatchSubscriptions({
      tx,
      now: () => tx.now,
      subscribeToWatchedFolder: subscribe as never,
      getActiveWatchedFolder: folderOf(tx) as never,
    });

    expect(subscribe).toHaveBeenCalledTimes(1);
    // The WHOLE result, not just the expected bucket. Asserting one bucket lets
    // a dropped `continue` put the same folder in two of them, and reconcile
    // reads every bucket — it would report renewal_failing on a folder that
    // renewed successfully (whole-diff R5 finding 2).
    const expected = {
      refreshed: bucket === "refreshed" ? ["folder-x"] : [],
      orphaned: bucket === "orphaned" ? ["folder-x"] : [],
      failures:
        bucket === "failures"
          ? [
              {
                folderId: "folder-x",
                operation: kind === "infra" ? "subscribe" : "activate_pending",
              },
            ]
          : [],
    };
    expect({
      refreshed: result.refreshed,
      orphaned: result.orphaned,
      failures: result.failures,
    }).toEqual(expected);
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
      return { outcome: "active" as const, channelId: "new-channel", attempt: null };
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

    expect(result).toEqual({
      outcome: "healthy",
      sweptPending: 0,
      escalated: false,
      faults: [],
      nextAttemptAt: null,
      consecutiveFailures: null,
    });
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

    expect(result).toEqual({
      outcome: "vacuous",
      sweptPending: 0,
      escalated: false,
      faults: [],
      nextAttemptAt: null,
      consecutiveFailures: null,
    });
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

    expect(result).toEqual({
      outcome: "recovered",
      sweptPending: 0,
      escalated: false,
      faults: [],
      nextAttemptAt: "2026-05-09T12:00:00.000Z",
      consecutiveFailures: 0,
    });
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
        errorClass: "drive_api",
        errorMessage: "fixture",
        attempt: { consecutiveFailures: 1, nextAttemptAt: "2026-05-09T12:15:00.000Z" },
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
        errorClass: "drive_api",
        errorMessage: "fixture",
        attempt: { consecutiveFailures: 1, nextAttemptAt: "2026-05-09T12:15:00.000Z" },
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
        errorClass: "drive_api",
        errorMessage: "fixture",
        attempt: { consecutiveFailures: 1, nextAttemptAt: "2026-05-09T12:15:00.000Z" },
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
        errorClass: "drive_api",
        errorMessage: "fixture",
        attempt: { consecutiveFailures: 1, nextAttemptAt: "2026-05-09T12:15:00.000Z" },
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
      errorClass: "drive_api" as const,
      errorMessage: "fixture",
      attempt: null,
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
      attempt: null,
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
    expect(result).toMatchObject({
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

    expect(result).toEqual({ outcome: "active", channelId: "new-channel", attempt: null });
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

  test("gcWatchChannels logs DRIVE_WATCH_STOP_FAILED and RETAINS an orphaned row that holds a resource id", async () => {
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

    // This row HOLDS a resource id, so Drive created the channel and it may
    // still be live. An unrecognised error shape counts as non-404, so the row
    // is left orphaned and retried; marking it stopped would retire the only
    // record of a live channel, after which listGcCandidates stops selecting it
    // and deleteOldStopped eventually removes it (whole-diff R8 finding 1).
    // This test previously asserted the opposite and encoded the defect.
    expect(result).toEqual({ stopped: [] });
    expect(tx.rows.map((row) => row.status)).toEqual(["orphaned"]);

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
      attempt: null,
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
    // The STORED status, not only the returned array. `stopped` was populated
    // unconditionally on the expired branch, so a write that matched zero rows
    // still reported the row stopped and it was re-selected every pass
    // (whole-diff R7 finding 2).
    expect(tx.rows.map((r) => [r.id, r.status]).sort()).toEqual([
      ["exp", "stopped"],
      ["sup", "stopped"],
    ]);
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
    const subscribe = vi.fn(async () => ({
      outcome: "active" as const,
      channelId: "c",
      attempt: null,
    }));

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
    const subscribe = vi.fn(async () => ({
      outcome: "active" as const,
      channelId: "c",
      attempt: null,
    }));
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
    const subscribe = vi.fn(async () => ({
      outcome: "active" as const,
      channelId: "c",
      attempt: null,
    }));

    const result = await runRefresh(tx, { kind: "no_folder_configured" }, subscribe);

    expect(subscribe).toHaveBeenCalledTimes(0);
    expect(result.failures).toEqual([]);
  });

  test("folder-read infra_error with due rows: renews NOTHING and records the '*' failure", async () => {
    const tx = new FakeWatchTx();
    dueRow(tx, "f1");
    const subscribe = vi.fn(async () => ({
      outcome: "active" as const,
      channelId: "c",
      attempt: null,
    }));

    const result = await runRefresh(tx, { kind: "infra_error", operation: "x" }, subscribe);

    expect(subscribe).toHaveBeenCalledTimes(0);
    expect(result.failures).toEqual([{ folderId: "*", operation: "folder_read" }]);
  });

  test("folder-read failure with ZERO due rows records NO failure, but still emits", async () => {
    const tx = new FakeWatchTx(); // no due rows seeded
    const subscribe = vi.fn(async () => ({
      outcome: "active" as const,
      channelId: "c",
      attempt: null,
    }));

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
    const subscribe = vi.fn(async () => ({
      outcome: "active" as const,
      channelId: "c",
      attempt: null,
    }));
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
      override async activatePending(): Promise<ActivatePendingResult> {
        this.operations.push("activatePending:zero-rows");
        return { promoted: 0, abortedFolderMismatch: false };
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
    // And the ESCALATION EVIDENCE. Without this, bypassing the alert only on
    // the zero-row branch keeps the outcome and the resourceId correct while
    // the operator learns nothing (whole-diff R6 finding 2).
    expect(tx.alerts.map((a) => a.code)).toContain("WATCH_CHANNEL_ORPHANED");
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

describe("refresh never reaches the ambient settings read (structural)", () => {
  test("every refreshWatchSubscriptions call in this suite injects getActiveWatchedFolder", async () => {
    // A call site without the injection performs the REAL service-role read.
    // Locally that resolves; in CI it hangs to the 5s default and the failure
    // reads as a flake rather than a missing dependency. One site slipped past
    // a bulk edit because it was nested inside `await expect(...)`, so this is
    // now enforced rather than grepped by hand.
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("tests/drive/watch.test.ts", "utf8");
    const offenders: number[] = [];
    // A zero-argument call is the FORM that reaches the ambient read, so it is
    // an offender by definition — matching only `({` would miss it entirely.
    for (const m of src.matchAll(/refreshWatchSubscriptions\(\s*\)/g)) {
      offenders.push(src.slice(0, m.index!).split("\n").length);
    }
    for (const m of src.matchAll(/refreshWatchSubscriptions\(\s*\{/g)) {
      let depth = 0;
      let j = m.index! + m[0].length - 1;
      for (; j < src.length; j += 1) {
        if (src[j] === "{") depth += 1;
        else if (src[j] === "}") {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      if (!src.slice(m.index!, j).includes("getActiveWatchedFolder")) {
        offenders.push(src.slice(0, m.index!).split("\n").length);
      }
    }
    expect(offenders, `lines missing getActiveWatchedFolder: ${offenders.join(", ")}`).toEqual([]);
  });
});

describe("forensic emits carry their codes and payloads (whole-diff R3 finding 6)", () => {
  function due(tx: FakeWatchTx, folderId: string, id = `e-${folderId}`) {
    const t = tx.now.getTime();
    tx.rows.push({
      id,
      status: "active",
      watchedFolderId: folderId,
      webhookSecret: "s",
      resourceId: "r",
      createdAt: new Date(t - 19 * 3_600_000).toISOString(),
      expiresAt: new Date(t + 5 * 3_600_000).toISOString(),
    });
  }
  const codeOf = (code: string) => logRecords.filter((r) => r.code === code);

  test("DRIVE_WATCH_EXPIRED_REAPED reports the two populations SEPARATELY", async () => {
    const tx = new FakeWatchTx();
    const t = tx.now.getTime();
    tx.rows.push({
      id: "dead-1",
      status: "active",
      watchedFolderId: "f-dead",
      webhookSecret: "s",
      resourceId: "r",
      createdAt: new Date(t - 30 * 3_600_000).toISOString(),
      expiresAt: new Date(t - 3_600_000).toISOString(),
    });
    tx.rows.push({
      id: "inv-1",
      status: "active",
      watchedFolderId: "f-inv",
      webhookSecret: "s",
      resourceId: "r",
      createdAt: new Date(t + 30 * 3_600_000).toISOString(),
      expiresAt: new Date(t + 24 * 3_600_000).toISOString(),
    });
    const { refreshWatchSubscriptions } = await import("@/lib/drive/watch");
    await refreshWatchSubscriptions({
      tx: tx as never,
      now: () => tx.now,
      subscribeToWatchedFolder: vi.fn(async () => ({
        outcome: "active" as const,
        channelId: "c",
        attempt: null,
      })),
      getActiveWatchedFolder: async () => ({ folderId: "f-dead", folderName: null }),
    });

    const rec = codeOf("DRIVE_WATCH_EXPIRED_REAPED")[0];
    // A merged id list would file the future-dated invalid lease under
    // "expired" — the misattribution the two-status split exists to prevent.
    expect(rec?.context).toMatchObject({
      expiredIds: ["dead-1"],
      supersededIds: ["inv-1"],
      expiredCount: 1,
      supersededCount: 1,
    });
  });

  test("DRIVE_WATCH_RENEWAL_SKIPPED_STALE_FOLDER carries sorted ids, counts, folder and reason", async () => {
    const tx = new FakeWatchTx();
    due(tx, "zzz-stale");
    due(tx, "aaa-stale");
    due(tx, "configured");
    const { refreshWatchSubscriptions } = await import("@/lib/drive/watch");
    await refreshWatchSubscriptions({
      tx: tx as never,
      now: () => tx.now,
      subscribeToWatchedFolder: vi.fn(async () => ({
        outcome: "active" as const,
        channelId: "c",
        attempt: null,
      })),
      getActiveWatchedFolder: async () => ({ folderId: "configured", folderName: null }),
    });

    const rec = codeOf("DRIVE_WATCH_RENEWAL_SKIPPED_STALE_FOLDER")[0];
    // Fed in reverse order; must come out sorted, or the telemetry preserves
    // nondeterministic database order.
    expect(rec?.context).toMatchObject({
      skippedFolderIds: ["aaa-stale", "zzz-stale"],
      skippedCount: 2,
      configuredFolderId: "configured",
      reason: "not_configured_folder",
    });
  });

  test("DRIVE_WATCH_FOLDER_READ_FAILED carries dueCount and a REDACTED message", async () => {
    const tx = new FakeWatchTx();
    due(tx, "f1");
    const { refreshWatchSubscriptions } = await import("@/lib/drive/watch");
    await refreshWatchSubscriptions({
      tx: tx as never,
      now: () => tx.now,
      subscribeToWatchedFolder: vi.fn(async () => ({
        outcome: "active" as const,
        channelId: "c",
        attempt: null,
      })),
      getActiveWatchedFolder: (async () => {
        throw new Error("settings read failed: Bearer sk-abc123 while fetching KEEPME");
      }) as never,
    });

    const rec = codeOf("DRIVE_WATCH_FOLDER_READ_FAILED")[0];
    expect(rec?.context.dueCount).toBe(1);
    // Secret-bearing input AND a surviving benign marker: asserting only that
    // the payload "looks clean" passes an implementation that skipped redaction
    // and equally one that discarded the message entirely.
    expect(String(rec?.context.errorMessage)).not.toContain("sk-abc123");
    expect(String(rec?.context.errorMessage)).toContain("KEEPME");
  });
});

describe("GC loop controls are behaviourally pinned (whole-diff R4)", () => {
  function gcRow(
    tx: FakeWatchTx,
    id: string,
    status: "superseded" | "orphaned" | "expired",
    opts: { resourceId?: string | null; createdAt?: string | Date | null } = {},
  ) {
    tx.rows.push({
      id,
      status,
      watchedFolderId: `f-${id}`,
      webhookSecret: "s",
      resourceId: opts.resourceId === undefined ? "r" : opts.resourceId,
      createdAt: (opts.createdAt ?? tx.now.toISOString()) as string,
      expiresAt: tx.now.toISOString(),
    });
  }

  test("a YOUNG null-resource orphan is skipped; an OLD one is collected", async () => {
    const tx = new FakeWatchTx();
    const now = tx.now.getTime();
    // Young: a subscribe may still be in flight, and collecting it here would
    // mark it stopped, after which markOrphaned can never record the resourceId.
    gcRow(tx, "young", "orphaned", { resourceId: null, createdAt: new Date(now - 60_000) });
    gcRow(tx, "old", "orphaned", { resourceId: null, createdAt: new Date(now - 7_200_000) });
    const { gcWatchChannels } = await import("@/lib/drive/watch");

    const result = await gcWatchChannels({ tx: tx as never, now: () => now });

    expect(result.stopped).toEqual(["old"]);
    expect(tx.rows.find((r) => r.id === "young")!.status).toBe("orphaned");
    expect(tx.rows.find((r) => r.id === "old")!.status).toBe("stopped");
  });

  test("the young-orphan guard accepts a Date, which is what postgres.js yields", async () => {
    // The guard previously tested `typeof === "string"`, so it was dead for
    // every production row — postgres.js parses timestamptz into a Date.
    const tx = new FakeWatchTx();
    const now = tx.now.getTime();
    gcRow(tx, "young-date", "orphaned", {
      resourceId: null,
      createdAt: new Date(now - 60_000),
    });
    const { gcWatchChannels } = await import("@/lib/drive/watch");

    const result = await gcWatchChannels({ tx: tx as never, now: () => now });

    expect(result.stopped).toEqual([]);
  });

  test("GC_RUN_BUDGET_MS stops the pass and reports rows never ATTEMPTED", async () => {
    const tx = new FakeWatchTx();
    for (let i = 0; i < 5; i += 1) gcRow(tx, `sup-${i}`, "superseded");
    const { gcWatchChannels } = await import("@/lib/drive/watch");
    const { GC_RUN_BUDGET_MS } = await import("@/lib/drive/watchErrors");

    // Each stop consumes half the budget, so the third iteration is refused.
    let clock = 0;
    const result = await gcWatchChannels({
      tx: tx as never,
      now: () => clock,
      stopChannel: async () => {
        clock += GC_RUN_BUDGET_MS / 2;
      },
    });

    expect(result.stopped).toHaveLength(2);
    const rec = logRecords.find((r) => r.code === "DRIVE_WATCH_GC_BUDGET_EXHAUSTED");
    expect(rec?.context).toMatchObject({ stoppedCount: 2, remainingCount: 3 });
  });

  test("REFRESH_RUN_BUDGET_MS stops the loop and records run_budget failures", async () => {
    const tx = new FakeWatchTx();
    const t = tx.now.getTime();
    for (let i = 0; i < 3; i += 1) {
      tx.rows.push({
        id: `r-${i}`,
        status: "active",
        watchedFolderId: "cfg",
        webhookSecret: "s",
        resourceId: "r",
        createdAt: new Date(t - 19 * 3_600_000).toISOString(),
        expiresAt: new Date(t + 5 * 3_600_000).toISOString(),
      });
    }
    const { refreshWatchSubscriptions } = await import("@/lib/drive/watch");
    const { REFRESH_RUN_BUDGET_MS } = await import("@/lib/drive/watchErrors");

    let clock = t;
    const result = await refreshWatchSubscriptions({
      tx: tx as never,
      now: () => new Date(clock),
      getActiveWatchedFolder: async () => ({ folderId: "cfg", folderName: null }),
      subscribeToWatchedFolder: vi.fn(async () => {
        clock += REFRESH_RUN_BUDGET_MS;
        return { outcome: "active" as const, channelId: "c", attempt: null };
      }),
    });

    // EXACT counts. The clock lands on exactly REFRESH_RUN_BUDGET_MS, so a
    // comparison relaxed from `>=` to `>` admits a second row and still leaves
    // one failure plus the telemetry emit — `toBeGreaterThan(0)` could not see
    // it (whole-diff R5 finding 4).
    expect(result.refreshed).toHaveLength(1);
    expect(result.failures.filter((f) => f.operation === "run_budget")).toHaveLength(2);
    expect(logRecords.some((r) => r.code === "DRIVE_WATCH_RUN_BUDGET_EXHAUSTED")).toBe(true);
  });
});

test("GC asks the port for at most GC_CANDIDATES_PER_PASS rows", async () => {
  const tx = new FakeWatchTx();
  const seen: Array<number | undefined> = [];
  // Override on the instance, not via a spread: spreading a class instance drops
  // every prototype method the collector still needs.
  tx.listGcCandidates = async (limit?: number) => {
    seen.push(limit);
    return [];
  };
  const { gcWatchChannels } = await import("@/lib/drive/watch");
  const { GC_CANDIDATES_PER_PASS } = await import("@/lib/drive/watchErrors");

  await gcWatchChannels({ tx: tx as never });

  expect(seen).toEqual([GC_CANDIDATES_PER_PASS]);
});

describe("markOrphaned reopens a stopped row that never reached Drive (R5 finding 1)", () => {
  test("a stopped row with NO resource id reopens and records the id", async () => {
    // A subscribe that stalls in the unbounded credential fetch outlives the
    // young-orphan window; GC then marks it stopped WITHOUT calling Drive,
    // because it has nothing to stop. When the call finally returns a resource
    // id, this is the last chance to record it — otherwise the Drive channel is
    // live for its whole lease and nothing in the database can stop it.
    const tx = new FakeWatchTx();
    tx.rows.push({
      id: "stalled",
      status: "stopped",
      watchedFolderId: "f",
      webhookSecret: "s",
      resourceId: null,
      expiresAt: tx.now.toISOString(),
    });

    await tx.markOrphaned("stalled", "late-resource");

    const row = tx.rows.find((r) => r.id === "stalled")!;
    expect(row.status).toBe("orphaned");
    expect(row.resourceId).toBe("late-resource");
  });

  test("a stopped row that HAS a resource id is left alone", async () => {
    // That row was genuinely stopped at Drive — GC had an id to call with.
    const tx = new FakeWatchTx();
    tx.rows.push({
      id: "really-stopped",
      status: "stopped",
      watchedFolderId: "f",
      webhookSecret: "s",
      resourceId: "already-stopped",
      expiresAt: tx.now.toISOString(),
    });

    await tx.markOrphaned("really-stopped", "late-resource");

    expect(tx.rows.find((r) => r.id === "really-stopped")!.status).toBe("stopped");
  });

  test("a stopped row is NOT reopened when no resource id is supplied", async () => {
    const tx = new FakeWatchTx();
    tx.rows.push({
      id: "no-id",
      status: "stopped",
      watchedFolderId: "f",
      webhookSecret: "s",
      resourceId: null,
      expiresAt: tx.now.toISOString(),
    });

    await tx.markOrphaned("no-id");

    expect(tx.rows.find((r) => r.id === "no-id")!.status).toBe("stopped");
  });
});

describe("GC never stops a row whose resource id moved under it (R6 finding 1)", () => {
  test("a late resource id leaves the row orphaned for the next pass", async () => {
    // GC reads candidates in one transaction and writes in later ones. A
    // subscribe stalled in the credential fetch can commit a resource id in
    // between. Marking the row stopped anyway strands it: stopped rows match
    // neither listGcCandidates nor the markOrphaned reopen arm, so the live
    // channel would run to lease expiry with nothing able to stop it.
    const tx = new FakeWatchTx();
    tx.rows.push({
      id: "raced",
      status: "orphaned",
      watchedFolderId: "f",
      webhookSecret: "s",
      resourceId: null,
      createdAt: new Date(tx.now.getTime() - 7_200_000).toISOString(),
      expiresAt: tx.now.toISOString(),
    });
    const { gcWatchChannels } = await import("@/lib/drive/watch");

    const result = await gcWatchChannels({
      tx: tx as never,
      now: () => tx.now.getTime(),
      stopChannel: async () => {
        // The stalled subscriber commits between GC's read and its write.
        tx.rows.find((r) => r.id === "raced")!.resourceId = "late-resource";
      },
    });

    expect(result.stopped).toEqual([]);
    expect(tx.rows.find((r) => r.id === "raced")!.status).toBe("orphaned");
    expect(logRecords.some((r) => r.code === "DRIVE_WATCH_GC_ROW_CHANGED")).toBe(true);
  });

  test("an unchanged row is still stopped, so the guard is not a blanket refusal", async () => {
    const tx = new FakeWatchTx();
    tx.rows.push({
      id: "calm",
      status: "orphaned",
      watchedFolderId: "f",
      webhookSecret: "s",
      resourceId: "steady",
      createdAt: new Date(tx.now.getTime() - 7_200_000).toISOString(),
      expiresAt: tx.now.toISOString(),
    });
    const { gcWatchChannels } = await import("@/lib/drive/watch");

    const result = await gcWatchChannels({
      tx: tx as never,
      now: () => tx.now.getTime(),
      stopChannel: async () => {},
    });

    expect(result.stopped).toEqual(["calm"]);
    expect(tx.rows.find((r) => r.id === "calm")!.status).toBe("stopped");
  });

  test("GC has exactly ONE markStopped call site, so no branch can go unguarded", async () => {
    // The expired branch drifted into an unguarded `markStopped(channel.id)`
    // and defaulted the guard's expectation to null; every expired row holds a
    // resource id, so the write matched nothing while the result claimed a stop.
    const source = readFileSync(join(process.cwd(), "lib/drive/watch.ts"), "utf8");

    expect(source.match(/tx\.markStopped\(/g) ?? []).toHaveLength(1);
    expect(source).toMatch(/tx\.markStopped\(channel\.id,\s*channel\.resourceId\)/);
  });
});

describe("the stop-failure retry keys on the resource id, not the status (R8 finding 1)", () => {
  function orphan(tx: FakeWatchTx, id: string, resourceId: string | null) {
    tx.rows.push({
      id,
      status: "orphaned",
      watchedFolderId: `f-${id}`,
      webhookSecret: "s",
      resourceId,
      createdAt: new Date(tx.now.getTime() - 7_200_000).toISOString(),
      expiresAt: null,
    });
  }

  test("no resource id: nothing to retry with, so the row is still marked stopped", async () => {
    // The canonical "either way" behaviour, preserved for the population it was
    // written for. Retrying here would loop forever on a row GC can never act on.
    const tx = new FakeWatchTx();
    orphan(tx, "no-res", null);
    const { gcWatchChannels } = await import("@/lib/drive/watch");

    const result = await gcWatchChannels({
      tx: tx as never,
      now: () => tx.now.getTime(),
      stopChannel: async () => {
        throw Object.assign(new Error("boom"), { response: { status: 503 } });
      },
    });

    expect(result.stopped).toEqual(["no-res"]);
    expect(tx.rows[0]!.status).toBe("stopped");
  });

  test("resource id plus a REAL 404: already gone at Drive, so it is stopped", async () => {
    const tx = new FakeWatchTx();
    orphan(tx, "gone", "r-gone");
    const { gcWatchChannels } = await import("@/lib/drive/watch");

    const result = await gcWatchChannels({
      tx: tx as never,
      now: () => tx.now.getTime(),
      stopChannel: async () => {
        throw Object.assign(new Error("not found"), { response: { status: 404 } });
      },
    });

    expect(result.stopped).toEqual(["gone"]);
    expect(tx.rows[0]!.status).toBe("stopped");
  });

  test("resource id plus a 503: possibly live, so it stays orphaned for the next pass", async () => {
    const tx = new FakeWatchTx();
    orphan(tx, "maybe-live", "r-live");
    const { gcWatchChannels } = await import("@/lib/drive/watch");

    const result = await gcWatchChannels({
      tx: tx as never,
      now: () => tx.now.getTime(),
      stopChannel: async () => {
        throw Object.assign(new Error("unavailable"), { response: { status: 503 } });
      },
    });

    expect(result.stopped).toEqual([]);
    expect(tx.rows[0]!.status).toBe("orphaned");
  });
});

// ---------------------------------------------------------------------------
// Write-iff-attempt inside subscribeToWatchedFolder (backoff spec §3.3a; §6
// classes 16b/16c). The attempt boundary is the watchFolder invocation: the
// pre-boundary insertPending fault records nothing; every arm at or past the
// boundary records exactly one attempt when (and only when) the caller opted
// in via recordAttempt: true.
// ---------------------------------------------------------------------------
describe("subscribeToWatchedFolder write-iff-attempt (spec §3.3a, 16b/16c)", () => {
  // Echo the requested channelId, as Drive does — a fixed id would miss the
  // pending row and route activation into the orphaned arm.
  const okWatchFolder = () =>
    vi.fn(async (args: { channelId: string }) => ({
      id: args.channelId,
      resourceId: "res-1",
      expiration: String(Date.parse("2026-05-10T12:00:00.000Z")),
    }));
  const rejectingWatch = vi.fn(async () => {
    throw new Error("drive boom");
  });

  function warnRecords() {
    return logRecords.filter((r) => r.code === "DRIVE_WATCH_STATE_WRITE_FAILED");
  }

  test("records (A) BEFORE markOrphaned when watchFolder rejects, error fields + attempt on the result", async () => {
    const { subscribeToWatchedFolder } = await import("@/lib/drive/watch");
    const tx = new FakeWatchTx();
    const res = await subscribeToWatchedFolder("folder-1", {
      tx,
      recordAttempt: true,
      watchFolder: rejectingWatch,
    });
    expect(res.outcome).toBe("orphaned");
    if (res.outcome !== "orphaned") throw new Error("unreachable");
    expect(res.errorClass).toBe("drive_api");
    expect(res.errorMessage).toContain("drive boom");
    expect(res.attempt).toEqual({
      consecutiveFailures: 1,
      nextAttemptAt: new Date(tx.now.getTime() + 900_000).toISOString(),
    });
    const recordIdx = tx.operations.findIndex((o) => o.startsWith("recordAttemptFailure"));
    const orphanIdx = tx.operations.findIndex((o) => o.startsWith("markOrphaned"));
    expect(recordIdx).toBeGreaterThanOrEqual(0);
    expect(orphanIdx).toBeGreaterThanOrEqual(0);
    expect(recordIdx).toBeLessThan(orphanIdx);
  });

  test("records (B) on the success path", async () => {
    const { subscribeToWatchedFolder } = await import("@/lib/drive/watch");
    const tx = new FakeWatchTx();
    const res = await subscribeToWatchedFolder("folder-1", {
      tx,
      recordAttempt: true,
      watchFolder: okWatchFolder(),
    });
    expect(res.outcome).toBe("active");
    if (res.outcome !== "active") throw new Error("unreachable");
    expect(res.attempt).toEqual({
      consecutiveFailures: 0,
      nextAttemptAt: tx.now.toISOString(),
    });
    expect(tx.attemptRecords).toEqual([{ kind: "success", folderId: "folder-1" }]);
  });

  test("pre-boundary insertPending throw records NOTHING", async () => {
    const { subscribeToWatchedFolder } = await import("@/lib/drive/watch");
    const tx = new FakeWatchTx();
    tx.insertPending = async () => {
      throw new Error("db down");
    };
    await expect(
      subscribeToWatchedFolder("folder-1", {
        tx,
        recordAttempt: true,
        watchFolder: rejectingWatch,
      }),
    ).rejects.toThrow();
    expect(tx.attemptRecords).toEqual([]);
  });

  test("default recordAttempt=false writes nothing on ANY arm (16b refresh/onboarding contract)", async () => {
    const { subscribeToWatchedFolder } = await import("@/lib/drive/watch");
    // failure arm
    const tx1 = new FakeWatchTx();
    await subscribeToWatchedFolder("folder-1", { tx: tx1, watchFolder: rejectingWatch });
    expect(tx1.attemptRecords).toEqual([]);
    // success arm
    const tx2 = new FakeWatchTx();
    await subscribeToWatchedFolder("folder-1", { tx: tx2, watchFolder: okWatchFolder() });
    expect(tx2.attemptRecords).toEqual([]);
    // activation-failure arm
    const tx3 = new FakeWatchTx();
    tx3.activatePending = async () => {
      throw new Error("activate down");
    };
    await subscribeToWatchedFolder("folder-1", { tx: tx3, watchFolder: okWatchFolder() });
    expect(tx3.attemptRecords).toEqual([]);
  });

  test("activation-throw arm records exactly one (A) with recordAttempt: true (16b)", async () => {
    const { subscribeToWatchedFolder } = await import("@/lib/drive/watch");
    const tx = new FakeWatchTx();
    tx.activatePending = async () => {
      throw new Error("activate down");
    };
    const res = await subscribeToWatchedFolder("folder-1", {
      tx,
      recordAttempt: true,
      watchFolder: okWatchFolder(),
    });
    expect(res.outcome).toBe("orphaned");
    expect(tx.attemptRecords.filter((r) => r.kind === "failure")).toHaveLength(1);
  });

  test("failed (A) emits DRIVE_WATCH_STATE_WRITE_FAILED, attempt null, alert path unaffected (16b)", async () => {
    const { subscribeToWatchedFolder } = await import("@/lib/drive/watch");
    const tx = new FakeWatchTx();
    tx.failRecordAttempt = "failure";
    const res = await subscribeToWatchedFolder("folder-1", {
      tx,
      recordAttempt: true,
      watchFolder: rejectingWatch,
    });
    expect(res.outcome).toBe("orphaned");
    if (res.outcome !== "orphaned") throw new Error("unreachable");
    expect(res.attempt).toBeNull();
    expect(warnRecords()).toHaveLength(1);
    expect(warnRecords()[0]!.context.statement).toBe("record_attempt_failure");
    expect(tx.operations.some((o) => o.startsWith("markOrphaned"))).toBe(true);
  });

  test("failed (B) on the success path emits the warn and returns attempt null (16b)", async () => {
    const { subscribeToWatchedFolder } = await import("@/lib/drive/watch");
    const tx = new FakeWatchTx();
    tx.failRecordAttempt = "success";
    const res = await subscribeToWatchedFolder("folder-1", {
      tx,
      recordAttempt: true,
      watchFolder: okWatchFolder(),
    });
    expect(res.outcome).toBe("active");
    if (res.outcome !== "active") throw new Error("unreachable");
    expect(res.attempt).toBeNull();
    expect(warnRecords()).toHaveLength(1);
    expect(warnRecords()[0]!.context.statement).toBe("record_attempt_success");
  });

  test("finalization throw AFTER Drive failure leaves (A) recorded (16c, markOrphaned fault point)", async () => {
    const { subscribeToWatchedFolder } = await import("@/lib/drive/watch");
    const tx = new FakeWatchTx();
    tx.markOrphaned = async () => {
      throw new Error("orphan write down");
    };
    await expect(
      subscribeToWatchedFolder("folder-1", {
        tx,
        recordAttempt: true,
        watchFolder: rejectingWatch,
      }),
    ).rejects.toThrow();
    expect(tx.attemptRecords.filter((r) => r.kind === "failure")).toHaveLength(1);
  });

  test("alert-upsert throw AFTER Drive failure leaves (A) recorded (16c, second fault point)", async () => {
    const { subscribeToWatchedFolder } = await import("@/lib/drive/watch");
    const tx = new FakeWatchTx();
    tx.upsertAdminAlert = async () => {
      throw new Error("alert write down");
    };
    await expect(
      subscribeToWatchedFolder("folder-1", {
        tx,
        recordAttempt: true,
        watchFolder: rejectingWatch,
      }),
    ).rejects.toThrow();
    expect(tx.attemptRecords.filter((r) => r.kind === "failure")).toHaveLength(1);
  });

  test("persistent finalization fault across three cycles still records three attempts (16c)", async () => {
    const { subscribeToWatchedFolder } = await import("@/lib/drive/watch");
    const tx = new FakeWatchTx();
    tx.markOrphaned = async () => {
      throw new Error("persistent");
    };
    for (let i = 0; i < 3; i++) {
      await subscribeToWatchedFolder("folder-1", {
        tx,
        recordAttempt: true,
        watchFolder: rejectingWatch,
      }).catch(() => {});
    }
    expect(tx.attemptRecords.filter((r) => r.kind === "failure")).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Backoff gate in reconcile's !live branch (backoff spec §3.4; §6 classes 16a
// and 6). The gate is consulted ONLY when no live channel exists (I2), its
// verdict is computed in the DB clock domain (D8; FakeWatchTx returns the
// canned `waiting` verbatim), and `backoff_waiting` suppresses exactly one
// Drive call — never the escalation check.
// ---------------------------------------------------------------------------
describe("reconcile backoff gate (spec §3.4, 16a)", () => {
  const FUTURE_ISO = "2026-05-09T12:15:00.000Z";

  test("!live + waiting → backoff_waiting, zero subscribes, zero writes, escalation still runs", async () => {
    const tx = new FakeWatchTx();
    tx.gateRow = { consecutiveFailures: 2, nextAttemptAt: FUTURE_ISO, waiting: true };
    const { reconcileWatchChannels } = await import("@/lib/drive/watch");
    const deps = reconcileDeps(tx);

    const result = await reconcileWatchChannels(NO_REFRESH, deps);

    expect(result.outcome).toBe("backoff_waiting");
    expect(result.nextAttemptAt).toBe(FUTURE_ISO);
    expect(result.consecutiveFailures).toBe(2);
    expect(deps.subscribeToWatchedFolder).not.toHaveBeenCalled();
    expect(tx.attemptRecords).toEqual([]);
    expect(deps.maybeEscalateWatchOrphaned).toHaveBeenCalledTimes(1);
  });

  test("!live + not waiting → subscribe attempted", async () => {
    const tx = new FakeWatchTx();
    tx.gateRow = {
      consecutiveFailures: 1,
      nextAttemptAt: "2026-05-09T11:00:00.000Z",
      waiting: false,
    };
    const { reconcileWatchChannels } = await import("@/lib/drive/watch");
    const deps = reconcileDeps(tx);

    await reconcileWatchChannels(NO_REFRESH, deps);

    expect(deps.subscribeToWatchedFolder).toHaveBeenCalledTimes(1);
  });

  test("!live + NO gate row → subscribe attempted (not waiting)", async () => {
    const tx = new FakeWatchTx();
    tx.gateRow = null;
    const { reconcileWatchChannels } = await import("@/lib/drive/watch");
    const deps = reconcileDeps(tx);

    await reconcileWatchChannels(NO_REFRESH, deps);

    expect(deps.subscribeToWatchedFolder).toHaveBeenCalledTimes(1);
  });

  test("live paths NEVER read the gate (I2 structural pin) - both live cells EXECUTED", async () => {
    const { reconcileWatchChannels } = await import("@/lib/drive/watch");
    // live + clean → healthy
    const tx1 = new FakeWatchTx();
    seedLiveActive(tx1, "folder-1");
    const deps1 = reconcileDeps(tx1);
    const healthy = await reconcileWatchChannels(NO_REFRESH, deps1);
    expect(healthy.outcome).toBe("healthy");
    expect(tx1.operations.some((o) => o.startsWith("readReconcileGate"))).toBe(false);
    // live + renewalFailed → renewal_failing
    const tx2 = new FakeWatchTx();
    seedLiveActive(tx2, "folder-1");
    const deps2 = reconcileDeps(tx2);
    const failing = await reconcileWatchChannels(
      { refreshed: [], orphaned: ["folder-1"], failures: [] },
      deps2,
    );
    expect(failing.outcome).toBe("renewal_failing");
    expect(tx2.operations.some((o) => o.startsWith("readReconcileGate"))).toBe(false);
  });

  test("gate read fault → state_read fault, infra_error, no subscribe, no write", async () => {
    const tx = new FakeWatchTx();
    tx.failGateRead = true;
    const { reconcileWatchChannels } = await import("@/lib/drive/watch");
    const deps = reconcileDeps(tx);

    const result = await reconcileWatchChannels(NO_REFRESH, deps);

    expect(result.outcome).toBe("infra_error");
    expect(result.faults).toContain("state_read");
    expect(deps.subscribeToWatchedFolder).not.toHaveBeenCalled();
    expect(tx.attemptRecords).toEqual([]);
  });

  test("completed attempt with attempt:null → state_write fault, infra_error (spec §3.3a observer)", async () => {
    const tx = new FakeWatchTx();
    const { reconcileWatchChannels } = await import("@/lib/drive/watch");
    const deps = reconcileDeps(tx, {
      subscribeToWatchedFolder: vi.fn().mockResolvedValue({
        outcome: "orphaned",
        channelId: "c",
        reason: "watch_create_failed",
        errorClass: "drive_api",
        errorMessage: "m",
        attempt: null,
      }),
    });

    const result = await reconcileWatchChannels(NO_REFRESH, deps);

    expect(result.outcome).toBe("infra_error");
    expect(result.faults).toContain("state_write");
  });

  test("recovered cycle carries the attempt bookkeeping into the result", async () => {
    const tx = new FakeWatchTx();
    const { reconcileWatchChannels } = await import("@/lib/drive/watch");
    const deps = reconcileDeps(tx, {
      subscribeToWatchedFolder: vi.fn().mockResolvedValue({
        outcome: "active",
        channelId: "c",
        attempt: { consecutiveFailures: 0, nextAttemptAt: "2026-05-09T12:00:00.000Z" },
      }),
    });

    const result = await reconcileWatchChannels(NO_REFRESH, deps);

    expect(result.outcome).toBe("recovered");
    expect(result.consecutiveFailures).toBe(0);
    expect(result.nextAttemptAt).toBe("2026-05-09T12:00:00.000Z");
  });

  test("failed attempt still escalates and reports still_orphaned with ladder fields", async () => {
    const tx = new FakeWatchTx();
    const { reconcileWatchChannels } = await import("@/lib/drive/watch");
    const deps = reconcileDeps(tx, {
      subscribeToWatchedFolder: vi.fn().mockResolvedValue({
        outcome: "orphaned",
        channelId: "c",
        reason: "watch_create_failed",
        errorClass: "drive_api",
        errorMessage: "m",
        attempt: { consecutiveFailures: 3, nextAttemptAt: "2026-05-09T13:00:00.000Z" },
      }),
    });

    const result = await reconcileWatchChannels(NO_REFRESH, deps);

    expect(result.outcome).toBe("still_orphaned");
    expect(result.consecutiveFailures).toBe(3);
    expect(result.nextAttemptAt).toBe("2026-05-09T13:00:00.000Z");
    expect(deps.maybeEscalateWatchOrphaned).toHaveBeenCalledTimes(1);
  });
});

// Class 17 (fault-vs-attempt independence) and class 7 half a (refresh writes
// no state) — backoff spec §6.
describe("fault-vs-attempt independence (spec §6 class 17)", () => {
  const ORPHANED_WITH_ATTEMPT = {
    outcome: "orphaned" as const,
    channelId: "c",
    reason: "watch_create_failed" as const,
    errorClass: "drive_api" as const,
    errorMessage: "fixture",
    attempt: { consecutiveFailures: 3, nextAttemptAt: "2026-05-09T13:00:00.000Z" },
  };

  test.each([
    "escalation_helper",
    "guard_read",
    "guard_write",
    "pref_read",
    "recipients_read",
    "email_send",
    "alert_row_read",
  ])(
    "post-attempt escalation fault %s → infra_error AND the attempt bookkeeping survives",
    async (faultName) => {
      const tx = new FakeWatchTx();
      const { reconcileWatchChannels } = await import("@/lib/drive/watch");
      const deps = reconcileDeps(tx, {
        subscribeToWatchedFolder: vi.fn().mockResolvedValue(ORPHANED_WITH_ATTEMPT),
        maybeEscalateWatchOrphaned: vi
          .fn()
          .mockResolvedValue({ escalated: false, faults: [faultName] }),
      });

      const result = await reconcileWatchChannels(NO_REFRESH, deps);

      expect(result.outcome).toBe("infra_error");
      expect(result.faults).toContain(faultName);
      expect(result.consecutiveFailures).toBe(3); // the §3.3a write already landed
    },
  );

  test("alert_resolve_write after a recovered attempt → infra_error, attempt bookkeeping survives", async () => {
    const tx = new FakeWatchTx();
    const { reconcileWatchChannels } = await import("@/lib/drive/watch");
    const deps = reconcileDeps(tx, {
      subscribeToWatchedFolder: vi.fn().mockResolvedValue({
        outcome: "active",
        channelId: "c",
        attempt: { consecutiveFailures: 0, nextAttemptAt: "2026-05-09T12:00:00.000Z" },
      }),
      resolveAdminAlert: vi.fn().mockRejectedValue(new Error("resolve down")),
    });

    const result = await reconcileWatchChannels(NO_REFRESH, deps);

    expect(result.outcome).toBe("infra_error");
    expect(result.faults).toContain("alert_resolve_write");
    expect(result.consecutiveFailures).toBe(0);
  });
});

describe("refresh writes no state (spec §6 class 7, deps-spy half)", () => {
  test("a failing renewal subscribe performs ZERO state writes", async () => {
    const tx = new FakeWatchTx();
    // an active row inside its renewal window so the loop attempts it
    tx.rows.push({
      id: "due-1",
      status: "active",
      watchedFolderId: "folder-1",
      webhookSecret: "s",
      resourceId: "r",
      createdAt: new Date(tx.now.getTime() - 23 * 3_600_000).toISOString(),
      expiresAt: new Date(tx.now.getTime() + 3_600_000).toISOString(),
    });
    const { refreshWatchSubscriptions } = await import("@/lib/drive/watch");
    await refreshWatchSubscriptions({
      tx,
      now: () => tx.now,
      subscribeToWatchedFolder: vi.fn().mockResolvedValue({
        outcome: "orphaned" as const,
        channelId: "c",
        reason: "watch_create_failed" as const,
        errorClass: "drive_api" as const,
        errorMessage: "fixture",
        attempt: null,
      }),
      getActiveWatchedFolder: async () => ({ folderId: "folder-1", folderName: null }),
    });
    expect(tx.attemptRecords).toEqual([]);
  });
});

describe("activation guard at the fake port (spec §3.1 rule)", () => {
  // One fixture constant; the mismatch folder is derived from it so the two can
  // never drift into equality and vacuously satisfy the abort rule.
  const GUARD_FOLDER: string = "guard-fixture-folder";
  const PROMOTED_FOLDER: string = `${GUARD_FOLDER}-promoted`;
  const CHANNEL = "guard-ch";

  async function activateUnder(settingsRow: { watched_folder_id: string | null } | null) {
    const tx = new FakeWatchTx();
    tx.settingsRow = settingsRow;
    await tx.insertPending({
      id: CHANNEL,
      watchedFolderId: GUARD_FOLDER,
      webhookSecret: "secret-1",
    });
    const result = await tx.activatePending({
      id: CHANNEL,
      watchedFolderId: GUARD_FOLDER,
      resourceId: "resource-1",
      expiresAt: new Date("2026-05-10T12:00:00.000Z").toISOString(),
    });
    return { tx, result };
  }

  const statusOf = (tx: FakeWatchTx) => tx.rows.find((r) => r.id === CHANNEL)?.status;

  test("activation guard proceeds when the settings row is absent", async () => {
    const { tx, result } = await activateUnder(null);
    expect(result).toEqual({ promoted: 1, abortedFolderMismatch: false });
    expect(statusOf(tx)).toBe("active");
  });

  test("activation guard proceeds when watched_folder_id is NULL", async () => {
    const { tx, result } = await activateUnder({ watched_folder_id: null });
    expect(result).toEqual({ promoted: 1, abortedFolderMismatch: false });
    expect(statusOf(tx)).toBe("active");
  });

  test("activation guard proceeds when the configured folder matches", async () => {
    const { tx, result } = await activateUnder({ watched_folder_id: GUARD_FOLDER });
    expect(result).toEqual({ promoted: 1, abortedFolderMismatch: false });
    expect(statusOf(tx)).toBe("active");
  });

  test("activation guard aborts when the configured folder differs", async () => {
    premiseHolds(
      "the configured folder differs from the folder being activated",
      PROMOTED_FOLDER !== GUARD_FOLDER,
    );
    const { tx, result } = await activateUnder({ watched_folder_id: PROMOTED_FOLDER });
    expect(result).toEqual({
      promoted: 0,
      abortedFolderMismatch: true,
      configuredFolderId: PROMOTED_FOLDER,
    });
    // Anti-tautology: the row, not the return value the guard itself produced.
    expect(statusOf(tx)).toBe("pending");
  });
});

describe("folder_changed: the dedicated activation-abort branch (spec §3.1)", () => {
  // One fixture constant; the promoted folder is derived so the two can never
  // drift into equality and vacuously satisfy the abort rule.
  const SUBSCRIBED_FOLDER: string = "folder-changed-subject";
  const PROMOTED_FOLDER: string = `${SUBSCRIBED_FOLDER}-promoted`;
  const CHANNEL = "ch-folder-changed";
  const RESOURCE = "resource-folder-changed";

  async function abortedSubscribe() {
    const tx = new FakeWatchTx();
    tx.settingsRow = { watched_folder_id: PROMOTED_FOLDER };
    const { subscribeToWatchedFolder } = await import("@/lib/drive/watch");
    const result = await subscribeToWatchedFolder(SUBSCRIBED_FOLDER, {
      tx,
      // recordAttempt ON, so "records no attempt" is a real claim about the
      // branch and not an artifact of the default.
      recordAttempt: true,
      uuid: () => CHANNEL,
      webhookSecret: () => "webhook-secret-value",
      watchFolder: async () => ({
        id: CHANNEL,
        resourceId: RESOURCE,
        expiration: new Date("2026-05-10T12:00:00.000Z").toISOString(),
      }),
    });
    return { tx, result };
  }

  test("folder_changed is returned with exactly the union member's keys", async () => {
    premiseHolds(
      "the configured folder differs from the subscribed one",
      PROMOTED_FOLDER !== SUBSCRIBED_FOLDER,
    );
    const { result } = await abortedSubscribe();

    expect(result).toEqual({
      outcome: "folder_changed",
      channelId: CHANNEL,
      configuredFolderId: PROMOTED_FOLDER,
    });
    // Exact key set: no errorClass / errorMessage / attempt. This is not an
    // error result, and a consumer must not be able to read one off it.
    expect(Object.keys(result).sort()).toEqual(["channelId", "configuredFolderId", "outcome"]);
  });

  test("folder_changed orphans the Drive channel with its resourceId so GC can stop it", async () => {
    const { tx } = await abortedSubscribe();

    premiseHolds("the watch stub returned a non-null resourceId", RESOURCE !== null);
    expect(tx.orphanedResourceIds).toEqual([[CHANNEL, RESOURCE]]);
    expect(tx.alerts).toHaveLength(1);
    expect(tx.alerts[0]?.context.reason).toBe("folder_changed_during_activation");
    expect(tx.alerts[0]?.context.resource_id).toBe(RESOURCE);
  });

  test("folder_changed records NO attempt despite recordAttempt: true", async () => {
    const { tx } = await abortedSubscribe();

    // A folder change is not a folder failure: writing one would pollute the
    // OLD folder's durable backoff state.
    expect(tx.attemptRecords).toEqual([]);
    expect(tx.operations.filter((op) => op.startsWith("recordAttempt"))).toEqual([]);
  });

  test("folder_changed emits exactly one DRIVE_WATCH_ACTIVATION_FOLDER_CHANGED, secret-free", async () => {
    await abortedSubscribe();

    const emits = logRecords.filter((r) => r.code === "DRIVE_WATCH_ACTIVATION_FOLDER_CHANGED");
    expect(emits).toHaveLength(1);
    expect(emits[0]?.level).toBe("warn");
    expect(emits[0]?.context).toMatchObject({
      watchedFolderId: SUBSCRIBED_FOLDER,
      configuredFolderId: PROMOTED_FOLDER,
      channelId: CHANNEL,
    });
    expect(JSON.stringify(emits[0])).not.toContain("webhook-secret-value");
  });

  test("folder_changed never reaches classifyWatchError", async () => {
    // The generic catch would classify an unknown error as "drive_api" — a
    // false Drive error class for what is a deliberate cancel.
    vi.mocked(classifyWatchError).mockClear();
    await abortedSubscribe();

    expect(vi.mocked(classifyWatchError).mock.calls).toHaveLength(0);
  });
});
