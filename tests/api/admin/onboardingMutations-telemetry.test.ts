import { afterEach, describe, expect, test, vi } from "vitest";
import { setLogSink, resetLogSink } from "@/lib/log";
import type { LogRecord } from "@/lib/log/types";

// rescan-sheet calls requireAdmin() DIRECTLY (not injected) — mock it (mirrors
// tests/api/rescanSheetRoute.test.ts). cleanup/discard inject requireAdminIdentity, so the
// module's requireAdminIdentity is never exercised through the default path.
const adminMock = vi.hoisted(() => ({ requireAdmin: vi.fn(async () => undefined) }));
vi.mock("@/lib/auth/requireAdmin", () => ({
  requireAdmin: adminMock.requireAdmin,
  requireAdminIdentity: vi.fn(async () => ({ email: "admin@example.com" })),
}));

import { handleRescanSheet } from "@/app/api/admin/onboarding/rescan-sheet/route";
import { handleCleanupAbandonedFinalize } from "@/app/api/admin/onboarding/cleanup-abandoned-finalize/[sessionId]/route";
import { handleLiveStagedDiscard } from "@/app/api/admin/show/staged/[stagedId]/discard/route";

function capture(): LogRecord[] {
  const sink: LogRecord[] = [];
  setLogSink((r) => {
    sink.push(r);
  });
  return sink;
}
afterEach(() => resetLogSink());

const admin = async () => ({ email: "Admin@Example.com" });
const WID = "11111111-1111-4111-8111-111111111111";

describe("rescan-sheet telemetry", () => {
  const req = () =>
    new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ driveFileId: "df-1", wizardSessionId: WID }),
    });

  test("status=updated → SHEET_RESCANNED (driveFileId + wizardSessionId)", async () => {
    const sink = capture();
    const res = await handleRescanSheet(req(), {
      rescanWizardSheet: (async () => ({
        status: "updated",
        needsReview: false,
        changed: true,
      })) as never,
    });
    expect(res.status).toBe(200);
    const rec = sink.filter((r) => r.code === "SHEET_RESCANNED");
    expect(rec).toHaveLength(1);
    expect(rec[0]!.driveFileId).toBe("df-1");
    expect(rec[0]!.context.wizardSessionId).toBe(WID);
  });

  test("non-updated (busy) → NO SHEET_RESCANNED", async () => {
    const sink = capture();
    const res = await handleRescanSheet(req(), {
      rescanWizardSheet: (async () => ({ status: "busy", code: "RESCAN_BUSY" })) as never,
    });
    expect(res.status).toBe(200);
    expect(sink.some((r) => r.code === "SHEET_RESCANNED")).toBe(false);
  });

  test("run() throw → RESCAN_INFRA_ERROR, rethrows", async () => {
    const sink = capture();
    await expect(
      handleRescanSheet(req(), {
        rescanWizardSheet: (async () => {
          throw new Error("drive down");
        }) as never,
      }),
    ).rejects.toThrow("drive down");
    const rec = sink.filter((r) => r.code === "RESCAN_INFRA_ERROR");
    expect(rec).toHaveLength(1);
    expect(rec[0]!.level).toBe("error");
  });
});

describe("cleanup-abandoned-finalize telemetry", () => {
  const ctx = (sessionId = WID) => ({ params: Promise.resolve({ sessionId }) });
  const fakeTx = async <R>(
    fn: (tx: {
      query<T>(sql: string, p?: readonly unknown[]): Promise<{ rows: T[]; rowCount: number }>;
    }) => Promise<R>,
  ) =>
    fn({
      async query<T>(sql: string) {
        if (/insert into public\.sync_audit/.test(sql)) {
          return { rows: [{ id: "audit-1" } as T], rowCount: 1 };
        }
        return {
          rows: [
            {
              applied_manifest_count: 0,
              shadow_count: 0,
              unresolved_manifest_count: 0,
            } as T,
          ],
          rowCount: 1,
        };
      },
    });

  test("cleaned → FINALIZE_CLEANUP_DONE (actor, wizardSessionId)", async () => {
    const sink = capture();
    const res = await handleCleanupAbandonedFinalize(new Request("http://x"), ctx(), {
      requireAdminIdentity: admin,
      withTx: fakeTx,
      cleanupAbandonedFinalize: async () => ({ status: "cleaned" }),
    });
    expect(res.status).toBe(200);
    const rec = sink.filter((r) => r.code === "FINALIZE_CLEANUP_DONE");
    expect(rec).toHaveLength(1);
    expect(typeof rec[0]!.actorHash).toBe("string");
    expect(rec[0]!.context.wizardSessionId).toBe(WID);
  });

  test("already_cleaned (idempotent) → NO emission", async () => {
    const sink = capture();
    const res = await handleCleanupAbandonedFinalize(new Request("http://x"), ctx(), {
      requireAdminIdentity: admin,
      withTx: fakeTx,
      cleanupAbandonedFinalize: async () => ({ status: "already_cleaned" }),
    });
    expect(res.status).toBe(200);
    expect(sink.some((r) => r.code === "FINALIZE_CLEANUP_DONE")).toBe(false);
  });

  test("non-refusal throw → FINALIZE_CLEANUP_FAILED, rethrows", async () => {
    const sink = capture();
    await expect(
      handleCleanupAbandonedFinalize(new Request("http://x"), ctx(), {
        requireAdminIdentity: admin,
        withTx: fakeTx,
        cleanupAbandonedFinalize: async () => {
          throw new Error("cleanup infra down");
        },
      }),
    ).rejects.toThrow("cleanup infra down");
    const rec = sink.filter((r) => r.code === "FINALIZE_CLEANUP_FAILED");
    expect(rec).toHaveLength(1);
    expect(rec[0]!.level).toBe("error");
  });
});

describe("live staged discard telemetry", () => {
  const ctx = (stagedId = "st-1") => ({ params: Promise.resolve({ stagedId }) });
  const req = () =>
    new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ kind: "try_again_next_sync" }),
    });

  test("discarded → STAGE_DISCARDED (actor, driveFileId)", async () => {
    const sink = capture();
    const res = await handleLiveStagedDiscard(req(), ctx(), {
      requireAdminIdentity: admin,
      readDriveFileIdForStagedId: async () => "df-1",
      discardStaged: (async () => ({ outcome: "discarded", variant: "try_again" })) as never,
    });
    expect(res.status).toBe(200);
    const rec = sink.filter((r) => r.code === "STAGE_DISCARDED");
    expect(rec).toHaveLength(1);
    expect(rec[0]!.driveFileId).toBe("df-1");
    expect(typeof rec[0]!.actorHash).toBe("string");
  });

  test("lock-skip (409) → NO emission", async () => {
    const sink = capture();
    const res = await handleLiveStagedDiscard(req(), ctx(), {
      requireAdminIdentity: admin,
      readDriveFileIdForStagedId: async () => "df-1",
      discardStaged: (async () => ({ skipped: "CONCURRENT_SYNC_SKIPPED" })) as never,
    });
    expect(res.status).toBe(409);
    expect(sink.some((r) => r.code === "STAGE_DISCARDED")).toBe(false);
  });

  test("discardStaged throw → STAGE_DISCARD_FAILED, rethrows", async () => {
    const sink = capture();
    await expect(
      handleLiveStagedDiscard(req(), ctx(), {
        requireAdminIdentity: admin,
        readDriveFileIdForStagedId: async () => "df-1",
        discardStaged: (async () => {
          throw new Error("discard infra down");
        }) as never,
      }),
    ).rejects.toThrow("discard infra down");
    const rec = sink.filter((r) => r.code === "STAGE_DISCARD_FAILED");
    expect(rec).toHaveLength(1);
    expect(rec[0]!.level).toBe("error");
  });
});
