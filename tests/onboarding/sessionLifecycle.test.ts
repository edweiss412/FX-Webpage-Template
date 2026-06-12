import { describe, expect, test, vi } from "vitest";
import {
  CleanupRequiresStaleSessionError,
  cleanupAbandonedFinalize,
  purgeAndRotateIfStale,
  purgeAndRotateOnboardingSession,
  type AppSettingsRow,
  type OnboardingSessionTx,
} from "@/lib/onboarding/sessionLifecycle";

const W1 = "11111111-1111-4111-8111-111111111111";
const W2 = "22222222-2222-4222-8222-222222222222";

function settings(overrides: Partial<AppSettingsRow> = {}): AppSettingsRow {
  return {
    id: "default",
    watched_folder_id: null,
    watched_folder_name: null,
    watched_folder_set_by_email: null,
    watched_folder_set_at: null,
    active_signing_key_id: "k1",
    pending_folder_id: null,
    pending_folder_name: null,
    pending_folder_set_by_email: null,
    pending_folder_set_at: null,
    pending_wizard_session_id: W1,
    pending_wizard_session_at: "2026-05-17T00:00:00.000Z",
    updated_at: "2026-05-17T00:00:00.000Z",
    ...overrides,
  };
}

class FakeLifecycleTx implements OnboardingSessionTx {
  settingsRow = settings();
  pendingSyncSessions = new Set<string | null>([W1, null]);
  pendingIngestionSessions = new Set<string | null>([W1, null]);
  deferredIngestionSessions = new Set<string | null>([W1, null]);
  manifestSessions = new Set<string>([W1]);
  hasCheckpoint = false;
  recentCheckpoint = false;
  staleByDbClock = false;
  appliedManifestDriveFileIds = ["drive-b", "drive-a"];
  shadowDriveFileIds = ["drive-c", "drive-a"];
  failAfterOperation: string | null = null;
  operations: string[] = [];
  syncLog: string[] = [];

  async query<T>(sql: string, params: readonly unknown[] = []) {
    const normalized = sql.replace(/\s+/g, " ").trim();
    const op = this.classify(normalized);
    this.operations.push(op === "lock-show" ? `lock-show:${String(params[0])}` : op);

    if (this.failAfterOperation === op) {
      throw new Error(`simulated failure after ${op}`);
    }

    if (op === "rotate-unconditional") {
      this.settingsRow = {
        ...this.settingsRow,
        pending_wizard_session_id: params[0] as string,
        pending_wizard_session_at: "DB_NOW",
        updated_at: "DB_NOW",
      };
      return { rows: [this.settingsRow as T], rowCount: 1 };
    }

    if (op === "rotate-if-stale") {
      if (this.staleByDbClock && !this.hasCheckpoint) {
        this.settingsRow = {
          ...this.settingsRow,
          pending_wizard_session_id: params[0] as string,
          pending_wizard_session_at: "DB_NOW",
          updated_at: "DB_NOW",
        };
        return { rows: [this.settingsRow as T], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    if (op === "select-settings") {
      return { rows: [this.settingsRow as T], rowCount: 1 };
    }

    if (op === "probe-suppressed") {
      return { rows: this.staleByDbClock && this.hasCheckpoint ? ([{ one: 1 }] as T[]) : [], rowCount: this.staleByDbClock && this.hasCheckpoint ? 1 : 0 };
    }

    if (op === "log") {
      this.syncLog.push(String(params[0] ?? "logged"));
      return { rows: [], rowCount: 0 };
    }

    if (op === "purge-pending-syncs") {
      this.pendingSyncSessions = new Set([...this.pendingSyncSessions].filter((id) => id === null));
      return { rows: [], rowCount: 0 };
    }

    if (op === "purge-pending-ingestions") {
      this.pendingIngestionSessions = new Set(
        [...this.pendingIngestionSessions].filter((id) => id === null),
      );
      return { rows: [], rowCount: 0 };
    }

    if (op === "purge-manifest") {
      this.manifestSessions.clear();
      return { rows: [], rowCount: 0 };
    }

    if (op === "purge-deferred-ingestions") {
      this.deferredIngestionSessions = new Set(
        [...this.deferredIngestionSessions].filter((id) => id === null),
      );
      return { rows: [], rowCount: 0 };
    }

    if (op === "lock-finalize") {
      return { rows: [], rowCount: 0 };
    }

    if (op === "lock-show") {
      return { rows: [], rowCount: 0 };
    }

    if (op === "select-stale-session") {
      return {
        rows:
          this.settingsRow.pending_wizard_session_id === params[0] && this.staleByDbClock
            ? ([this.settingsRow] as T[])
            : [],
        rowCount:
          this.settingsRow.pending_wizard_session_id === params[0] && this.staleByDbClock ? 1 : 0,
      };
    }

    if (op === "select-recent-finalize") {
      return {
        rows: this.recentCheckpoint ? ([{ id: "checkpoint-1" }] as T[]) : [],
        rowCount: this.recentCheckpoint ? 1 : 0,
      };
    }

    if (op === "select-applied-manifest-drive-files") {
      const rows = this.appliedManifestDriveFileIds.map((drive_file_id) => ({ drive_file_id }));
      return { rows: rows as T[], rowCount: rows.length };
    }

    if (op === "select-shadow-drive-files") {
      const rows = this.shadowDriveFileIds.map((drive_file_id) => ({ drive_file_id }));
      return { rows: rows as T[], rowCount: rows.length };
    }

    if (op === "delete-shadow" || op === "delete-interim-shows" || op === "delete-checkpoint") {
      return { rows: [], rowCount: 0 };
    }

    throw new Error(`Unhandled SQL in fake tx: ${normalized}`);
  }

  private classify(sql: string): string {
    if (sql.startsWith("update public.app_settings") && sql.includes("returning")) {
      return sql.includes("pending_wizard_session_at < now() - interval '24 hours'")
        ? "rotate-if-stale"
        : "rotate-unconditional";
    }
    if (sql.includes("join public.wizard_finalize_checkpoints")) return "probe-suppressed";
    if (sql.startsWith("insert into public.sync_log")) return "log";
    if (sql.startsWith("delete from public.pending_syncs")) return "purge-pending-syncs";
    if (sql.startsWith("delete from public.pending_ingestions")) return "purge-pending-ingestions";
    if (sql.startsWith("delete from public.onboarding_scan_manifest")) return "purge-manifest";
    if (sql.startsWith("delete from public.deferred_ingestions")) return "purge-deferred-ingestions";
    if (sql.startsWith("select pg_advisory_xact_lock") && sql.includes("finalize:")) {
      return "lock-finalize";
    }
    if (sql.startsWith("select pg_advisory_xact_lock") && sql.includes("show:")) {
      return "lock-show";
    }
    if (sql.includes("pending_wizard_session_id = $1") && sql.includes("for update")) {
      return "select-stale-session";
    }
    if (sql.startsWith("select") && sql.includes("from public.app_settings where id = 'default'")) {
      return "select-settings";
    }
    if (sql.includes("from public.wizard_finalize_checkpoints") && sql.includes("last_processed_at > now()")) {
      return "select-recent-finalize";
    }
    if (sql.startsWith("delete from public.shows_pending_changes")) return "delete-shadow";
    if (
      sql.startsWith("delete from public.shows") &&
      sql.includes("using public.onboarding_scan_manifest") &&
      sql.includes("created_show_id = s.id") &&
      sql.includes("wizard_created_session_id = m.wizard_session_id")
    ) {
      // F4 Task 4.1: the first-seen delete is provenance-keyed (created_show_id
      // join + show-side discriminator), never the published=false proxy. A
      // bare `delete from public.shows where published = false` now falls
      // through to the classify error below.
      return "delete-interim-shows";
    }
    if (sql.includes("from public.onboarding_scan_manifest") && sql.includes("status = 'applied'")) {
      return "select-applied-manifest-drive-files";
    }
    if (sql.includes("from public.shows_pending_changes") && sql.includes("for update")) {
      return "select-shadow-drive-files";
    }
    if (sql.startsWith("delete from public.wizard_finalize_checkpoints")) return "delete-checkpoint";
    throw new Error(`Could not classify SQL: ${sql}`);
  }

  clone(): FakeLifecycleTx {
    const next = new FakeLifecycleTx();
    next.settingsRow = { ...this.settingsRow };
    next.pendingSyncSessions = new Set(this.pendingSyncSessions);
    next.pendingIngestionSessions = new Set(this.pendingIngestionSessions);
    next.deferredIngestionSessions = new Set(this.deferredIngestionSessions);
    next.manifestSessions = new Set(this.manifestSessions);
    next.hasCheckpoint = this.hasCheckpoint;
    next.recentCheckpoint = this.recentCheckpoint;
    next.staleByDbClock = this.staleByDbClock;
    next.appliedManifestDriveFileIds = [...this.appliedManifestDriveFileIds];
    next.shadowDriveFileIds = [...this.shadowDriveFileIds];
    next.failAfterOperation = this.failAfterOperation;
    next.operations = [...this.operations];
    next.syncLog = [...this.syncLog];
    return next;
  }

  restore(snapshot: FakeLifecycleTx): void {
    this.settingsRow = { ...snapshot.settingsRow };
    this.pendingSyncSessions = new Set(snapshot.pendingSyncSessions);
    this.pendingIngestionSessions = new Set(snapshot.pendingIngestionSessions);
    this.deferredIngestionSessions = new Set(snapshot.deferredIngestionSessions);
    this.manifestSessions = new Set(snapshot.manifestSessions);
    this.appliedManifestDriveFileIds = [...snapshot.appliedManifestDriveFileIds];
    this.shadowDriveFileIds = [...snapshot.shadowDriveFileIds];
    this.operations = [...snapshot.operations];
    this.syncLog = [...snapshot.syncLog];
  }
}

function withFakeTx(tx: FakeLifecycleTx) {
  return async <R>(fn: (tx: OnboardingSessionTx) => Promise<R>): Promise<R> => {
    const snapshot = tx.clone();
    try {
      return await fn(tx);
    } catch (error) {
      tx.restore(snapshot);
      throw error;
    }
  };
}

describe("onboarding session lifecycle helpers", () => {
  test("purgeAndRotateOnboardingSession rotates and purges wizard rows in one transaction", async () => {
    const tx = new FakeLifecycleTx();
    tx.settingsRow = settings({ watched_folder_id: "preserved-folder-id" });
    const result = await purgeAndRotateOnboardingSession({
      randomUUID: () => W2,
      withTx: withFakeTx(tx),
    });

    expect(result).toEqual({ settings: { ...tx.settingsRow }, rotated: true });
    expect(result.settings.watched_folder_id).toBe("preserved-folder-id");
    expect(tx.settingsRow.watched_folder_id).toBe("preserved-folder-id");
    expect(tx.settingsRow.pending_wizard_session_id).toBe(W2);
    expect(tx.pendingSyncSessions).toEqual(new Set([null]));
    expect(tx.pendingIngestionSessions).toEqual(new Set([null]));
    expect(tx.deferredIngestionSessions).toEqual(new Set([null]));
    expect(tx.manifestSessions.size).toBe(0);
  });

  test("purgeAndRotateIfStale ignores app-ahead-of-DB skew and preserves a DB-fresh session", async () => {
    vi.setSystemTime(new Date("2099-01-01T00:00:00Z"));
    const tx = new FakeLifecycleTx();
    tx.staleByDbClock = false;

    const result = await purgeAndRotateIfStale({ randomUUID: () => W2, withTx: withFakeTx(tx) });

    expect(result).toEqual({ settings: tx.settingsRow, rotated: false });
    expect(tx.settingsRow.pending_wizard_session_id).toBe(W1);
    expect(tx.pendingSyncSessions.has(W1)).toBe(true);
    vi.useRealTimers();
  });

  test("purgeAndRotateIfStale ignores app-behind-DB skew and rotates a DB-stale session", async () => {
    vi.setSystemTime(new Date("2001-01-01T00:00:00Z"));
    const tx = new FakeLifecycleTx();
    tx.staleByDbClock = true;

    const result = await purgeAndRotateIfStale({ randomUUID: () => W2, withTx: withFakeTx(tx) });

    expect(result.rotated).toBe(true);
    expect(result.settings.pending_wizard_session_id).toBe(W2);
    expect(tx.pendingSyncSessions).toEqual(new Set([null]));
    expect(tx.deferredIngestionSessions).toEqual(new Set([null]));
    vi.useRealTimers();
  });

  test("purgeAndRotateIfStale preserves watched_folder_id across stale rotation (AC-10.5)", async () => {
    const tx = new FakeLifecycleTx();
    tx.settingsRow = settings({
      watched_folder_id: "preserved-folder-id",
      pending_wizard_session_at: "2026-05-15T00:00:00.000Z",
    });
    tx.staleByDbClock = true;

    const result = await purgeAndRotateIfStale({ randomUUID: () => W2, withTx: withFakeTx(tx) });

    expect(result.rotated).toBe(true);
    expect(result.settings.watched_folder_id).toBe("preserved-folder-id");
    const selected = await tx.query<AppSettingsRow>(
      "select * from public.app_settings where id = 'default'",
    );
    expect(selected.rows[0]?.watched_folder_id).toBe("preserved-folder-id");
  });

  test("purgeAndRotateIfStale rotates at the exact 24h boundary when the DB predicate matches", async () => {
    const tx = new FakeLifecycleTx();
    tx.staleByDbClock = true;

    const result = await purgeAndRotateIfStale({ randomUUID: () => W2, withTx: withFakeTx(tx) });

    expect(result.rotated).toBe(true);
    expect(tx.operations).toContain("rotate-if-stale");
  });

  test("purgeAndRotateIfStale suppresses stale rotation when finalize batches are pending", async () => {
    const tx = new FakeLifecycleTx();
    tx.staleByDbClock = true;
    tx.hasCheckpoint = true;

    const result = await purgeAndRotateIfStale({ randomUUID: () => W2, withTx: withFakeTx(tx) });

    expect(result).toEqual({
      settings: tx.settingsRow,
      rotated: false,
      suppressed: "WIZARD_FINALIZE_BATCHES_PENDING",
    });
    expect(tx.settingsRow.pending_wizard_session_id).toBe(W1);
    expect(tx.syncLog).toEqual(["WIZARD_FINALIZE_BATCHES_PENDING"]);
  });

  test("purgeAndRotateIfStale rolls back partial purge failures", async () => {
    const tx = new FakeLifecycleTx();
    tx.staleByDbClock = true;
    tx.failAfterOperation = "purge-pending-ingestions";

    await expect(
      purgeAndRotateIfStale({ randomUUID: () => W2, withTx: withFakeTx(tx) }),
    ).rejects.toThrow(/simulated failure/);

    expect(tx.settingsRow.pending_wizard_session_id).toBe(W1);
    expect(tx.pendingSyncSessions.has(W1)).toBe(true);
    expect(tx.pendingIngestionSessions.has(W1)).toBe(true);
    expect(tx.deferredIngestionSessions.has(W1)).toBe(true);
    expect(tx.manifestSessions.has(W1)).toBe(true);
  });

  test("cleanupAbandonedFinalize enforces admin auth before opening a transaction", async () => {
    const tx = new FakeLifecycleTx();
    const requireAdminIdentity = vi.fn(async () => {
      throw new Error("not admin");
    });

    await expect(
      cleanupAbandonedFinalize(W1, { requireAdminIdentity, withTx: withFakeTx(tx) }),
    ).rejects.toThrow(/not admin/);
    expect(tx.operations).toEqual([]);
  });

  test("cleanupAbandonedFinalize refuses a fresh session by DB clock", async () => {
    const tx = new FakeLifecycleTx();
    tx.staleByDbClock = false;

    await expect(
      cleanupAbandonedFinalize(W1, {
        requireAdminIdentity: async () => ({ email: "doug@example.com" }),
        withTx: withFakeTx(tx),
      }),
    ).rejects.toMatchObject({
      code: "CLEANUP_REQUIRES_STALE_SESSION",
      reason: "session_too_fresh",
    });
  });

  test("cleanupAbandonedFinalize refuses checkpoints that advanced within the last hour", async () => {
    const tx = new FakeLifecycleTx();
    tx.staleByDbClock = true;
    tx.recentCheckpoint = true;

    await expect(
      cleanupAbandonedFinalize(W1, {
        requireAdminIdentity: async () => ({ email: "doug@example.com" }),
        withTx: withFakeTx(tx),
      }),
    ).rejects.toBeInstanceOf(CleanupRequiresStaleSessionError);
  });

  test("cleanupAbandonedFinalize takes the finalize advisory lock and rotates after cleanup", async () => {
    const tx = new FakeLifecycleTx();
    tx.staleByDbClock = true;

    const result = await cleanupAbandonedFinalize(W1, {
      randomUUID: () => W2,
      requireAdminIdentity: async () => ({ email: "doug@example.com" }),
      withTx: withFakeTx(tx),
    });

    expect(result).toEqual({ status: "cleaned", settings: tx.settingsRow });
    expect(tx.operations.slice(0, 3)).toEqual([
      "lock-finalize",
      "select-stale-session",
      "select-recent-finalize",
    ]);
    expect(tx.settingsRow.pending_wizard_session_id).toBe(W2);
  });

  test("cleanupAbandonedFinalize takes per-show locks in deterministic drive-file order before deleting show rows", async () => {
    const tx = new FakeLifecycleTx();
    tx.staleByDbClock = true;

    await cleanupAbandonedFinalize(W1, {
      randomUUID: () => W2,
      requireAdminIdentity: async () => ({ email: "doug@example.com" }),
      withTx: withFakeTx(tx),
    });

    expect(tx.operations).toEqual(
      expect.arrayContaining([
        "select-applied-manifest-drive-files",
        "select-shadow-drive-files",
        "lock-show:drive-a",
        "lock-show:drive-b",
        "lock-show:drive-c",
      ]),
    );
    expect(tx.operations.indexOf("lock-show:drive-a")).toBeLessThan(
      tx.operations.indexOf("lock-show:drive-b"),
    );
    expect(tx.operations.indexOf("lock-show:drive-b")).toBeLessThan(
      tx.operations.indexOf("lock-show:drive-c"),
    );
    expect(tx.operations.indexOf("lock-show:drive-c")).toBeLessThan(
      tx.operations.indexOf("delete-shadow"),
    );
    expect(tx.operations.indexOf("lock-show:drive-c")).toBeLessThan(
      tx.operations.indexOf("delete-interim-shows"),
    );
  });
});
