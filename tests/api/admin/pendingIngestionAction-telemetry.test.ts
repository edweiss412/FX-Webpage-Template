import { afterEach, describe, expect, test } from "vitest";
import { setLogSink, resetLogSink } from "@/lib/log";
import type { LogRecord } from "@/lib/log/types";
import { handleLivePendingIngestionDiscard } from "@/app/api/admin/pending-ingestions/[id]/discard/route";
import { handleWizardPendingIngestionAction } from "@/app/api/admin/onboarding/pending_ingestions/[id]/retry/route";

// S3 — pending-ingestion discard (live) + wizard shared handler (defer/ignore/retry) durable
// telemetry. setLogSink capture proves the POST-COMMIT outcome codes + the infra-fault codes, and
// that 409/lock-skip/rollback paths commit nothing → emit nothing.

function capture(): LogRecord[] {
  const sink: LogRecord[] = [];
  setLogSink((r) => {
    sink.push(r);
  });
  return sink;
}
afterEach(() => resetLogSink());

const admin = async () => ({ email: "Admin@Example.com" });
const ctx = (id = "pi-1") => ({ params: Promise.resolve({ id }) });

describe("live pending-ingestion discard telemetry", () => {
  const discardReq = () =>
    new Request("http://x", { method: "POST", body: JSON.stringify({ kind: "permanent_ignore" }) });

  function baseDeps(overrides: Record<string, unknown> = {}) {
    return {
      requireAdminIdentity: admin,
      readDriveFileIdForPendingIngestion: async () => "df-1",
      withRowTryLock: async <R>(
        _driveFileId: string,
        fn: (tx: { queryOne<T>(sql: string, p: unknown[]): Promise<T | null> }) => Promise<R> | R,
      ) =>
        fn({
          async queryOne<T>(sql: string) {
            if (/from public\.pending_ingestions/.test(sql) && /for update/.test(sql)) {
              return {
                id: "pi-1",
                drive_file_id: "df-1",
                wizard_session_id: null,
                last_seen_modified_time: "2026-05-08T12:00:00.000Z",
                drive_file_name: "Sheet.xlsx",
              } as T;
            }
            return { upserted: true } as T; // deferral upsert / delete returning
          },
        }),
      ...overrides,
    };
  }

  test("committed discard → PENDING_INGESTION_DISCARDED (actor, driveFileId)", async () => {
    const sink = capture();
    const res = await handleLivePendingIngestionDiscard(discardReq(), ctx(), baseDeps() as never);
    expect(res.status).toBe(200);
    const rec = sink.filter((r) => r.code === "PENDING_INGESTION_DISCARDED");
    expect(rec).toHaveLength(1);
    expect(rec[0]!.driveFileId).toBe("df-1");
    expect(typeof rec[0]!.actorHash).toBe("string");
  });

  test("lock-skip (409) → NO emission", async () => {
    const sink = capture();
    const res = await handleLivePendingIngestionDiscard(
      discardReq(),
      ctx(),
      baseDeps({
        withRowTryLock: async () => ({ skipped: "CONCURRENT_SYNC_SKIPPED" }),
      }) as never,
    );
    expect(res.status).toBe(409);
    expect(sink.some((r) => r.code === "PENDING_INGESTION_DISCARDED")).toBe(false);
  });

  test("withRowTryLock throw → PENDING_INGESTION_DISCARD_FAILED, rethrows", async () => {
    const sink = capture();
    await expect(
      handleLivePendingIngestionDiscard(
        discardReq(),
        ctx(),
        baseDeps({
          withRowTryLock: async () => {
            throw new Error("lock down");
          },
        }) as never,
      ),
    ).rejects.toThrow("lock down");
    const rec = sink.filter((r) => r.code === "PENDING_INGESTION_DISCARD_FAILED");
    expect(rec).toHaveLength(1);
    expect(rec[0]!.level).toBe("error");
  });
});

describe("wizard pending-ingestion shared handler telemetry", () => {
  function wizardDeps(action: "defer_until_modified" | "permanent_ignore", overrides = {}) {
    return {
      requireAdminIdentity: admin,
      readDriveFileIdForPendingIngestion: async () => "df-1",
      withRowTx: async <R>(
        _driveFileId: string,
        fn: (tx: { queryOne<T>(sql: string, p: unknown[]): Promise<T> }) => Promise<R> | R,
      ) =>
        fn({
          async queryOne<T>(sql: string) {
            // Mutation matchers FIRST — their EXISTS subquery also contains "from public.app_settings",
            // so the settings read must be matched by its distinctive select-list, not the table name.
            if (/update public\.onboarding_scan_manifest/.test(sql)) return { updated: true } as T;
            if (/insert into public\.deferred_ingestions/.test(sql)) return { upserted: true } as T;
            if (/delete from public\.pending_ingestions/.test(sql)) return { deleted: true } as T;
            if (/for update/.test(sql)) {
              return {
                id: "pi-1",
                drive_file_id: "df-1",
                wizard_session_id: "sess-1",
                discovered_during_folder_id: "folder-1",
                last_seen_modified_time: "2026-05-08T12:00:00.000Z",
                drive_file_name: "Sheet.xlsx",
              } as T;
            }
            if (/select pending_wizard_session_id/.test(sql)) {
              return {
                pending_wizard_session_id: "sess-1",
                pending_folder_id: "folder-1",
              } as T;
            }
            return null as T;
          },
        }),
      ...overrides,
    };
  }

  test("committed defer → PENDING_INGESTION_DEFERRED (driveFileId)", async () => {
    const sink = capture();
    const res = await handleWizardPendingIngestionAction(
      ctx(),
      wizardDeps("defer_until_modified") as never,
      "defer_until_modified",
    );
    expect(res.status).toBe(200);
    const rec = sink.filter((r) => r.code === "PENDING_INGESTION_DEFERRED");
    expect(rec).toHaveLength(1);
    expect(rec[0]!.driveFileId).toBe("df-1");
    expect(sink.some((r) => r.code === "PENDING_INGESTION_IGNORED")).toBe(false);
  });

  test("committed permanent_ignore → PENDING_INGESTION_IGNORED", async () => {
    const sink = capture();
    const res = await handleWizardPendingIngestionAction(
      ctx(),
      wizardDeps("permanent_ignore") as never,
      "permanent_ignore",
    );
    expect(res.status).toBe(200);
    const rec = sink.filter((r) => r.code === "PENDING_INGESTION_IGNORED");
    expect(rec).toHaveLength(1);
  });

  test("committed retry → PENDING_INGESTION_RETRIED (reused)", async () => {
    const sink = capture();
    const res = await handleWizardPendingIngestionAction(
      ctx(),
      {
        requireAdminIdentity: admin,
        readDriveFileIdForPendingIngestion: async () => "df-1",
        readWizardSessionForPendingIngestion: async () => "sess-1",
        retrySingleFile: async () => ({ outcome: "retried" as const, status: "staged" as const }),
      } as never,
      "retry",
    );
    expect(res.status).toBe(200);
    const rec = sink.filter((r) => r.code === "PENDING_INGESTION_RETRIED");
    expect(rec).toHaveLength(1);
    expect(rec[0]!.driveFileId).toBe("df-1");
  });

  test("wizard-session supersession (rollback → 409) → NO outcome, NO action-failed", async () => {
    const sink = capture();
    const res = await handleWizardPendingIngestionAction(
      ctx(),
      wizardDeps("defer_until_modified", {
        withRowTx: async <R>(
          _d: string,
          fn: (tx: { queryOne<T>(sql: string, p: unknown[]): Promise<T> }) => Promise<R> | R,
        ) =>
          fn({
            async queryOne<T>(sql: string) {
              // manifest transition returns 0 rows → typed rollback throw → 409
              if (/update public\.onboarding_scan_manifest/.test(sql))
                return { updated: false } as T;
              if (/for update/.test(sql)) {
                return {
                  id: "pi-1",
                  drive_file_id: "df-1",
                  wizard_session_id: "sess-1",
                  discovered_during_folder_id: "folder-1",
                  last_seen_modified_time: "2026-05-08T12:00:00.000Z",
                  drive_file_name: "Sheet.xlsx",
                } as T;
              }
              if (/select pending_wizard_session_id/.test(sql)) {
                return {
                  pending_wizard_session_id: "sess-1",
                  pending_folder_id: "folder-1",
                } as T;
              }
              return null as T;
            },
          }),
        upsertAdminAlert: async () => null,
        readCurrentWizardSessionId: async () => null,
      }) as never,
      "defer_until_modified",
    );
    expect(res.status).toBe(409);
    expect(sink.some((r) => r.code === "PENDING_INGESTION_DEFERRED")).toBe(false);
    expect(sink.some((r) => r.code === "PENDING_INGESTION_ACTION_FAILED")).toBe(false);
  });

  test("non-rollback throw → PENDING_INGESTION_ACTION_FAILED, rethrows", async () => {
    const sink = capture();
    await expect(
      handleWizardPendingIngestionAction(
        ctx(),
        wizardDeps("defer_until_modified", {
          withRowTx: async () => {
            throw new Error("infra down");
          },
        }) as never,
        "defer_until_modified",
      ),
    ).rejects.toThrow("infra down");
    const rec = sink.filter((r) => r.code === "PENDING_INGESTION_ACTION_FAILED");
    expect(rec).toHaveLength(1);
    expect(rec[0]!.level).toBe("error");
  });
});
