import { afterEach, describe, expect, test, vi } from "vitest";
import { setLogSink, resetLogSink } from "@/lib/log";
import type { LogRecord } from "@/lib/log/types";
import type {
  LivePendingIngestionRouteDeps,
  LivePendingIngestionRouteTx,
} from "@/app/api/admin/pending-ingestions/[id]/retry/route";
import { handleLivePendingIngestionRetry } from "@/app/api/admin/pending-ingestions/[id]/retry/route";
import { premiseHolds } from "@/tests/_shared/premise";
import { readyPrepared } from "@/tests/_shared/preparedProcessOneFile";

// P1 dark-path telemetry — the live pending-ingestion RETRY handler previously had NO
// try/catch around the risky region (readDriveFileIdForPendingIngestion → withRowTryLock +
// post-commit). Any DB/postgres.js throw surfaced as an unlogged framework 500. This test
// pins the fail-open forensic emit: a throw INSIDE the guarded region → exactly one
// log.error with code:"PENDING_INGESTION_RETRY_FAILED" AND the original throw is preserved
// (the call rejects). Mirrors pendingIngestionAction-telemetry.test.ts.

function capture(): LogRecord[] {
  const sink: LogRecord[] = [];
  setLogSink((r) => {
    sink.push(r);
  });
  return sink;
}
afterEach(() => resetLogSink());

const admin = async () => ({ email: "admin@example.com" });
const ctx = (id = "pi-1") => ({ params: Promise.resolve({ id }) });
const retryReq = () => new Request("http://x", { method: "POST" });

describe("live pending-ingestion retry telemetry", () => {
  test("withRowTryLock throw → PENDING_INGESTION_RETRY_FAILED (error), rethrows", async () => {
    const sink = capture();
    await expect(
      handleLivePendingIngestionRetry(retryReq(), ctx(), {
        requireAdminIdentity: admin,
        readDriveFileIdForPendingIngestion: async () => "df-1",
        withRowTryLock: async () => {
          throw new Error("lock down");
        },
      } as never),
    ).rejects.toThrow("lock down");
    const rec = sink.filter((r) => r.code === "PENDING_INGESTION_RETRY_FAILED");
    expect(rec).toHaveLength(1);
    expect(rec[0]!.level).toBe("error");
    expect(rec[0]!.driveFileId).toBe("df-1");
    expect(rec[0]!.source).toBe("api.admin.pending-ingestions.retry");
  });

  test("id-read throw (driveFileId not yet resolved) → still emits with driveFileId null, rethrows", async () => {
    const sink = capture();
    await expect(
      handleLivePendingIngestionRetry(retryReq(), ctx(), {
        requireAdminIdentity: admin,
        readDriveFileIdForPendingIngestion: async () => {
          throw new Error("id read boom");
        },
      } as never),
    ).rejects.toThrow("id read boom");
    const rec = sink.filter((r) => r.code === "PENDING_INGESTION_RETRY_FAILED");
    expect(rec).toHaveLength(1);
    expect(rec[0]!.level).toBe("error");
    expect(rec[0]!.driveFileId).toBeNull();
  });

  test("auth failure (before the guard) does NOT emit PENDING_INGESTION_RETRY_FAILED", async () => {
    const sink = capture();
    const res = await handleLivePendingIngestionRetry(retryReq(), ctx(), {
      requireAdminIdentity: async () => {
        throw { code: "ADMIN_SESSION_LOOKUP_FAILED" };
      },
    } as never);
    expect(res.status).toBe(500);
    expect(sink.some((r) => r.code === "PENDING_INGESTION_RETRY_FAILED")).toBe(false);
  });

  // Inner route-level Drive metadata fetch catch (existing-show branch): returns 502
  // and previously swallowed the caught error. Distinct from the outer PR-1 throw guard.
  test("Drive metadata fetch throws → 502 + PENDING_INGESTION_RETRY_DRIVE_FETCH_FAILED (warn), NOT the outer throw guard", async () => {
    const sink = capture();
    // Fake locked tx that walks the existing-show branch up to the Drive fetch:
    // pending row (live, matching drive id) → show exists → not archived.
    const fakeTx = {
      async queryOne(sqlText: string): Promise<unknown> {
        if (/for update/i.test(sqlText)) {
          return {
            id: "pi-1",
            drive_file_id: "df-1",
            wizard_session_id: null,
            last_seen_modified_time: null,
          };
        }
        if (/exists/i.test(sqlText)) return { exists: true };
        if (/archived/i.test(sqlText)) return { archived: false };
        throw new Error(`unexpected SQL in fakeTx: ${sqlText}`);
      },
    };
    const res = await handleLivePendingIngestionRetry(retryReq(), ctx(), {
      requireAdminIdentity: admin,
      readDriveFileIdForPendingIngestion: async () => "df-1",
      withRowTryLock: async (_d: string, fn: (tx: unknown) => unknown) => fn(fakeTx),
      readFinalizeOwnershipGuardUnlocked: async () => false,
      fetchDriveFileMetadata: async () => {
        throw new Error("drive down");
      },
    } as never);

    // Control flow UNCHANGED: still a 502 DRIVE_FETCH_FAILED.
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, code: "DRIVE_FETCH_FAILED" });

    const rec = sink.filter((r) => r.code === "PENDING_INGESTION_RETRY_DRIVE_FETCH_FAILED");
    expect(rec).toHaveLength(1);
    expect(rec[0]!.level).toBe("warn");
    expect(rec[0]!.driveFileId).toBe("df-1");
    // The inner 502 catch returns normally, so the outer throw-guard never fires.
    expect(sink.some((r) => r.code === "PENDING_INGESTION_RETRY_FAILED")).toBe(false);
  });

  test("FIRST-SEEN branch: Drive metadata fetch throws → 502 + PENDING_INGESTION_RETRY_DRIVE_FETCH_FAILED (warn)", async () => {
    const sink = capture();
    // Same fault but the FIRST-SEEN path (show does NOT yet exist) → the second,
    // distinct inner Drive-fetch catch. Covers the branch the existing-show test can't reach.
    const fakeTx = {
      async queryOne(sqlText: string): Promise<unknown> {
        if (/for update/i.test(sqlText)) {
          return {
            id: "pi-2",
            drive_file_id: "df-2",
            wizard_session_id: null,
            last_seen_modified_time: null,
          };
        }
        if (/exists/i.test(sqlText)) return { exists: false }; // first-seen: no live show yet
        throw new Error(`unexpected SQL in fakeTx: ${sqlText}`);
      },
    };
    const res = await handleLivePendingIngestionRetry(retryReq(), ctx(), {
      requireAdminIdentity: admin,
      readDriveFileIdForPendingIngestion: async () => "df-2",
      withRowTryLock: async (_d: string, fn: (tx: unknown) => unknown) => fn(fakeTx),
      readFinalizeOwnershipGuardUnlocked: async () => false,
      fetchDriveFileMetadata: async () => {
        throw new Error("drive down");
      },
    } as never);

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, code: "DRIVE_FETCH_FAILED" });

    const rec = sink.filter((r) => r.code === "PENDING_INGESTION_RETRY_DRIVE_FETCH_FAILED");
    expect(rec).toHaveLength(1);
    expect(rec[0]!.level).toBe("warn");
    expect(rec[0]!.driveFileId).toBe("df-2");
    expect(sink.some((r) => r.code === "PENDING_INGESTION_RETRY_FAILED")).toBe(false);
  });
});

// Task 2 hop 4 of 5 (spec 2026-08-09-private-image-pipeline §3). This route's existing-show branch
// calls runManualSyncForShowUnlocked, which routes AROUND processOneFile's post-commit tail — the
// site where cron and manual emit. So the route must capture the variant-failure rows INSIDE
// withRowTryLock (logging there would persist a failure record for an apply a rollback could still
// erase — invariant 10) and emit them once that lock RESOLVES, exactly as it already does for
// unlandedRenames. Failure mode caught: the cron sink wired, this bypass sink left dark.
//
// Ordering is asserted with the mechanism from pendingIngestionRetryPostCommitIsolation.test.ts —
// the lock wrapper brackets the callback, and the emit must land strictly after `lock:commit`.
const RETRY_ID = "44444444-4444-4444-8444-444444444444";

class FakeLivePendingTx {
  row = {
    id: RETRY_ID,
    drive_file_id: "file-1",
    wizard_session_id: null,
    last_seen_modified_time: "2026-05-08T12:00:00.000Z",
  };
  showExists = true;

  async queryOne<T>(sql: string): Promise<T> {
    const normalized = sql.replace(/\s+/g, " ").trim();
    if (/pg_locks/i.test(normalized)) return { held: true } as T;
    if (normalized.startsWith("select id, drive_file_id")) return this.row as T;
    if (normalized.startsWith("select exists")) return { exists: this.showExists } as T;
    if (normalized.startsWith("select archived from public.shows")) return { archived: false } as T;
    if (normalized.startsWith("select watched_folder_id")) {
      return { watched_folder_id: "folder-1" } as T;
    }
    if (normalized.startsWith("select slug")) return { slug: "show-slug" } as T;
    throw new Error(`Unhandled live pending SQL: ${normalized}`);
  }
}

describe("live pending-ingestion retry: diagram variant failure telemetry", () => {
  test("existing-show retry emits DIAGRAM_VARIANT_GENERATION_FAILED per row, after the lock resolves", async () => {
    const events: string[] = [];
    const records: LogRecord[] = [];
    setLogSink((record) => {
      if (record.code === "DIAGRAM_VARIANT_GENERATION_FAILED") {
        records.push(record);
        events.push(`emit:${String(record.context.assetKey)}`);
      }
    });
    // TWO rows with distinct keys/reasons/messages so a constant-payload emit cannot pass.
    const variantFailures = [
      {
        assetKey: "folder-linked-1.png",
        reason: "sharp_error" as const,
        message: "sharp pipeline threw: unsupported input",
      },
      {
        assetKey: "embedded-obj-1.png",
        reason: "blur_oversize" as const,
        message: "blur 24x18 exceeds the 16px cap",
      },
    ];
    const tx = new FakeLivePendingTx();
    const runManualSyncForShowUnlocked = vi.fn(async () => ({
      outcome: "applied" as const,
      showId: "show-1",
      parseWarnings: [],
      appliedRoleMappings: [],
      variantFailures,
    }));
    const deps = {
      requireAdminIdentity: vi.fn(async () => ({ email: "doug@example.com" })),
      readDriveFileIdForPendingIngestion: vi.fn(async () => tx.row.drive_file_id),
      withRowTryLock: vi.fn(async (_driveFileId: string, fn: (t: unknown) => unknown) => {
        events.push("lock:start");
        const result = await fn(tx as unknown as LivePendingIngestionRouteTx);
        events.push("lock:commit");
        return result;
      }),
      fetchDriveFileMetadata: vi.fn(async (driveFileId: string) => ({
        driveFileId,
        name: `${driveFileId}.xlsx`,
        mimeType: "application/vnd.google-apps.spreadsheet",
        modifiedTime: "2026-05-08T12:00:00.000Z",
        parents: ["folder-1"],
      })),
      runManualSyncForShowUnlocked,
      readFinalizeOwnershipGuardUnlocked: vi.fn(async () => false),
      // Census class d (spec 2026-08-14 §5): stubbed so the route does not run REAL preparation
      // (Drive I/O) ahead of the runner double.
      prepareProcessOneFile: vi.fn(async () => readyPrepared()),
      logSyncSink: vi.fn(async () => {}),
    } as unknown as LivePendingIngestionRouteDeps;

    const response = await handleLivePendingIngestionRetry(
      new Request("http://x", { method: "POST" }),
      { params: Promise.resolve({ id: RETRY_ID }) },
      deps,
    );

    // The apply COMMITTED — a variant failure is a degraded-asset signal, never a failed retry.
    expect(response.status).toBe(200);
    premiseHolds(
      "the retry ran the bypass sync and carried at least one variant-failure row",
      runManualSyncForShowUnlocked.mock.calls.length > 0 && variantFailures.length > 0,
    );
    // Exactly one record per row, payload derived from the fixture rows themselves (spec §3).
    expect(
      records.map((record) => ({
        level: record.level,
        message: record.message,
        source: record.source,
        code: record.code,
        showId: record.showId,
        assetKey: record.context.assetKey,
        reason: record.context.reason,
        error: record.context.error,
      })),
    ).toEqual(
      variantFailures.map((failure) => ({
        level: "warn",
        message: "diagram variant generation failed",
        source: "sync.diagramVariants",
        code: "DIAGRAM_VARIANT_GENERATION_FAILED",
        showId: "show-1",
        assetKey: failure.assetKey,
        reason: failure.reason,
        error: failure.message,
      })),
    );
    // POST-COMMIT ISOLATION: every emit lands strictly after the lock callback resolved.
    expect(events).toEqual([
      "lock:start",
      "lock:commit",
      ...variantFailures.map((failure) => `emit:${failure.assetKey}`),
    ]);
  });
});
