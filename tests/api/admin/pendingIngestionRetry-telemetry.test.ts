import { afterEach, describe, expect, test } from "vitest";
import { setLogSink, resetLogSink } from "@/lib/log";
import type { LogRecord } from "@/lib/log/types";
import { handleLivePendingIngestionRetry } from "@/app/api/admin/pending-ingestions/[id]/retry/route";

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
});
