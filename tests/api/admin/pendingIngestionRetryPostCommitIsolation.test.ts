/**
 * tests/api/admin/pendingIngestionRetryPostCommitIsolation.test.ts
 *
 * Whole-diff review HIGH 1 + HIGH 2 — the live pending-ingestion retry route's POST-COMMIT tail.
 *
 * By the time control reaches that tail, `withRowTryLock` has RESOLVED: the apply is committed and
 * the roster has already changed. Every step there is a side effect on an outcome that cannot be
 * undone, so two properties must hold for EACH step independently:
 *
 *   1. A throwing step must not SUPPRESS any other step. Before this fix, `revalidateShow` ran
 *      un-isolated ahead of both emits, so a revalidate throw meant neither the forensic
 *      unlanded-rename event NOR the LEAD audit + bell notice ever ran — and, because the
 *      unlanded emit was likewise un-isolated, a throw there suppressed the role-flags emit.
 *   2. A throwing step must not convert a committed apply into a failed response. The un-isolated
 *      throws reached the outer guard, which logs PENDING_INGESTION_RETRY_FAILED and RETHROWS →
 *      a 500 that invites the operator to re-run an apply that already landed.
 *
 * These are DISTINCT try/catch sites by design, not one wrapper around the region: a single
 * try/catch would restore exactly the suppression being fixed. The tests below are written so that
 * collapsing them back into one catch fails — each asserts that a LATER step still ran after an
 * EARLIER one threw.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { setLogSink, resetLogSink } from "@/lib/log";
import type { LogRecord } from "@/lib/log/types";
import type { RoleFlagsNotice } from "@/lib/sync/phase2";
import type { UnlandedRename } from "@/lib/sync/applyParseResult";
import type {
  LivePendingIngestionRouteDeps,
  LivePendingIngestionRouteTx,
} from "@/app/api/admin/pending-ingestions/[id]/retry/route";
import { handleLivePendingIngestionRetry } from "@/app/api/admin/pending-ingestions/[id]/retry/route";
import { readyPrepared } from "@/tests/_shared/preparedProcessOneFile";

// Per-file faithful next/cache mock (the global tests/setup.ts one is a no-op spy): this file needs
// revalidateTag to be able to THROW, which is the whole point of HIGH 1.
const revalidateTagMock = vi.hoisted(() => vi.fn((_tag: string, _profile?: unknown) => {}));
vi.mock("next/cache", () => ({
  unstable_cache:
    (fn: (...a: unknown[]) => unknown) =>
    (...a: unknown[]) =>
      fn(...a),
  revalidateTag: revalidateTagMock,
  revalidatePath: vi.fn(),
}));

const emitUnlandedRenamesMock = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/log/emitIdentityLinkRenameUnlanded", () => ({
  emitIdentityLinkRenameUnlanded: emitUnlandedRenamesMock,
}));

// Partial mock: the module also exports the shared source constants and the finalize-route flush,
// which other modules in this import graph load at module scope.
const emitRoleFlagsNoticeMock = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/sync/emitRoleFlagsNotice", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/sync/emitRoleFlagsNotice")>()),
  emitRoleFlagsNotice: emitRoleFlagsNoticeMock,
}));

const ID1 = "44444444-4444-4444-8444-444444444444";

const roleFlagsNotice: RoleFlagsNotice = {
  showId: "show-1",
  code: "ROLE_FLAGS_NOTICE",
  context: {
    drive_file_id: "file-1",
    changes: [{ crew_name: "Ada", prior_flags: [], new_flags: ["LEAD"] }],
  },
};

const unlandedRenames: UnlandedRename[] = [
  { pair: { removedName: "Old", addedName: "New" }, reason: "name_held", sourceSurvived: true },
];

class FakeLivePendingTx {
  row = {
    id: ID1,
    drive_file_id: "file-1",
    wizard_session_id: null,
    last_seen_modified_time: "2026-05-08T12:00:00.000Z",
  };
  showExists = false;

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

function deps(
  tx: FakeLivePendingTx,
  overrides: Partial<LivePendingIngestionRouteDeps> = {},
): LivePendingIngestionRouteDeps {
  return {
    requireAdminIdentity: vi.fn(async () => ({ email: "doug@example.com" })),
    readDriveFileIdForPendingIngestion: vi.fn(async () => tx.row.drive_file_id),
    withRowTryLock: vi.fn(async (_driveFileId, fn) =>
      fn(tx as unknown as LivePendingIngestionRouteTx),
    ),
    fetchDriveFileMetadata: vi.fn(async (driveFileId: string) => ({
      driveFileId,
      name: `${driveFileId}.xlsx`,
      mimeType: "application/vnd.google-apps.spreadsheet",
      modifiedTime: "2026-05-08T12:00:00.000Z",
      parents: ["folder-1"],
    })),
    runManualSyncForShowUnlocked: vi.fn(async () => ({
      outcome: "applied" as const,
      showId: "show-1",
      parseWarnings: [],
      appliedRoleMappings: [],
      roleFlagsNotice,
      unlandedRenames,
    })) as unknown as NonNullable<LivePendingIngestionRouteDeps["runManualSyncForShowUnlocked"]>,
    readFinalizeOwnershipGuardUnlocked: vi.fn(async () => false),
    // Census class d (spec 2026-08-14 §5): without this stub the route runs REAL preparation
    // (Drive I/O) ahead of the runner double, since `prepared` is a required sixth argument.
    prepareProcessOneFile: vi.fn(async () => readyPrepared()) as unknown as NonNullable<
      LivePendingIngestionRouteDeps["prepareProcessOneFile"]
    >,
    // Census class e: the route-body catch emissions must not open a real postgres connection.
    logSyncSink: vi.fn(async () => {}) as unknown as NonNullable<
      LivePendingIngestionRouteDeps["logSyncSink"]
    >,
    ...overrides,
  } as LivePendingIngestionRouteDeps;
}

const req = () => new Request("http://x", { method: "POST" });
const context = { params: Promise.resolve({ id: ID1 }) };

function capture(): LogRecord[] {
  const records: LogRecord[] = [];
  setLogSink((record) => {
    records.push(record);
  });
  return records;
}

beforeEach(() => {
  revalidateTagMock.mockReset();
  revalidateTagMock.mockImplementation(() => {});
  emitUnlandedRenamesMock.mockReset();
  emitUnlandedRenamesMock.mockResolvedValue(undefined);
  emitRoleFlagsNoticeMock.mockReset();
  emitRoleFlagsNoticeMock.mockResolvedValue(undefined);
});
afterEach(() => resetLogSink());

async function json(response: Response): Promise<unknown> {
  return await response.json();
}

describe("live pending-ingestion retry: post-commit steps are independently isolated", () => {
  test("existing-show branch: a throwing revalidate suppresses NEITHER emit and keeps the 200", async () => {
    const records = capture();
    revalidateTagMock.mockImplementation(() => {
      throw new Error("revalidate down");
    });
    const tx = new FakeLivePendingTx();
    tx.showExists = true;

    const response = await handleLivePendingIngestionRetry(req(), context, deps(tx));

    // The apply COMMITTED — the response must still report it.
    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ status: "applied", slug: "show-slug" });
    // Both LATER steps still ran: this is what a single collapsed try/catch would break.
    expect(emitUnlandedRenamesMock).toHaveBeenCalledTimes(1);
    expect(emitRoleFlagsNoticeMock).toHaveBeenCalledTimes(1);
    // The admin outcome (the step between them) also survived.
    expect(records.some((r) => r.code === "PENDING_INGESTION_RETRIED")).toBe(true);
    // Escalated, not swallowed (invariant 9) — and NOT via the outer rethrowing guard.
    const escalation = records.filter(
      (r) => r.code === "PENDING_INGESTION_RETRY_REVALIDATE_FAILED",
    );
    expect(escalation).toHaveLength(1);
    expect(escalation[0]!.level).toBe("error");
    expect(escalation[0]!.showId).toBe("show-1");
    expect(escalation[0]!.driveFileId).toBe("file-1");
    expect(records.some((r) => r.code === "PENDING_INGESTION_RETRY_FAILED")).toBe(false);
  });

  test("existing-show branch: a throwing unlanded emit does not suppress the role-flags emit", async () => {
    const records = capture();
    emitUnlandedRenamesMock.mockRejectedValueOnce(new Error("app_events down"));
    const tx = new FakeLivePendingTx();
    tx.showExists = true;

    const response = await handleLivePendingIngestionRetry(req(), context, deps(tx));

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ status: "applied", slug: "show-slug" });
    // The LEAD audit + bell notice must still fire — HIGH 2's exact failure mode.
    expect(emitRoleFlagsNoticeMock).toHaveBeenCalledTimes(1);
    const escalation = records.filter(
      (r) => r.code === "IDENTITY_LINK_RENAME_UNLANDED_EMIT_FAILED",
    );
    expect(escalation).toHaveLength(1);
    expect(escalation[0]!.level).toBe("error");
    expect(escalation[0]!.showId).toBe("show-1");
    expect(records.some((r) => r.code === "PENDING_INGESTION_RETRY_FAILED")).toBe(false);
  });

  test("existing-show branch: a throwing role-flags emit still leaves the committed retry's 200", async () => {
    const records = capture();
    emitRoleFlagsNoticeMock.mockRejectedValueOnce(new Error("alert rpc down"));
    const tx = new FakeLivePendingTx();
    tx.showExists = true;

    const response = await handleLivePendingIngestionRetry(req(), context, deps(tx));

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ status: "applied", slug: "show-slug" });
    // The EARLIER steps are unaffected, and the failure is surfaced under its own code.
    expect(emitUnlandedRenamesMock).toHaveBeenCalledTimes(1);
    const escalation = records.filter((r) => r.code === "ROLE_FLAGS_NOTICE_EMIT_FAILED");
    expect(escalation).toHaveLength(1);
    expect(escalation[0]!.level).toBe("error");
    expect(records.some((r) => r.code === "PENDING_INGESTION_RETRY_FAILED")).toBe(false);
  });

  // The FIRST-SEEN branch reaches the same tail through a different callee. It can never produce an
  // unlanded pair (runManualStageForFirstSeen hardcodes identityLinkRenames to []), so the
  // suppression pair here is revalidate → role-flags notice.
  test("first-seen branch: a throwing revalidate does not suppress the role-flags emit", async () => {
    const records = capture();
    revalidateTagMock.mockImplementation(() => {
      throw new Error("revalidate down");
    });
    const tx = new FakeLivePendingTx();
    tx.showExists = false;

    const response = await handleLivePendingIngestionRetry(
      req(),
      context,
      deps(tx, {
        prepareFirstSeenStage: vi.fn(async (fileMeta) => ({
          fileMeta,
          binding: { bindingToken: "rev-1", modifiedTime: fileMeta.modifiedTime },
          parseResult: {} as never,
        })) as unknown as NonNullable<LivePendingIngestionRouteDeps["prepareFirstSeenStage"]>,
        runManualStageForFirstSeen: vi.fn(async () => ({
          outcome: "applied" as const,
          showId: "show-1",
          roleFlagsNotice,
        })) as unknown as NonNullable<LivePendingIngestionRouteDeps["runManualStageForFirstSeen"]>,
      }),
    );

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ status: "applied", slug: "show-slug" });
    expect(emitRoleFlagsNoticeMock).toHaveBeenCalledTimes(1);
    expect(records.some((r) => r.code === "PENDING_INGESTION_RETRIED")).toBe(true);
    const escalation = records.filter(
      (r) => r.code === "PENDING_INGESTION_RETRY_REVALIDATE_FAILED",
    );
    expect(escalation).toHaveLength(1);
    expect(escalation[0]!.level).toBe("error");
    expect(records.some((r) => r.code === "PENDING_INGESTION_RETRY_FAILED")).toBe(false);
  });

  // Baseline: nothing throws → every step runs exactly once and nothing is escalated. Without this,
  // the three failure-mode tests above could all pass against a route that never emits at all.
  test("nothing throws → revalidate + both emits each run once, no escalation", async () => {
    const records = capture();
    const tx = new FakeLivePendingTx();
    tx.showExists = true;

    const response = await handleLivePendingIngestionRetry(req(), context, deps(tx));

    expect(response.status).toBe(200);
    expect(revalidateTagMock).toHaveBeenCalledTimes(1);
    expect(revalidateTagMock.mock.calls[0]![0]).toBe("show-show-1");
    expect(emitUnlandedRenamesMock).toHaveBeenCalledTimes(1);
    expect(emitRoleFlagsNoticeMock).toHaveBeenCalledTimes(1);
    expect(records.filter((r) => r.level === "error")).toEqual([]);
  });
});
