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
});
