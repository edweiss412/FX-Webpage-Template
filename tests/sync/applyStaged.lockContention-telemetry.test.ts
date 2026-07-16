import { afterEach, describe, expect, test, vi } from "vitest";
import { setLogSink, resetLogSink } from "@/lib/log";
import type { LogRecord } from "@/lib/log/types";
import type { DriveListedFile } from "@/lib/drive/list";
import type { ParseResult } from "@/lib/parser/types";
import type { SyncPipelineTx } from "@/lib/sync/runScheduledCronSync";
import type { LockedShowTx } from "@/lib/sync/lockedShowTx";
import { CONCURRENT_SYNC_SKIPPED } from "@/lib/sync/lockedShowTx";
import {
  applyStaged,
  type ApplyStagedDeps,
  type PendingSyncForApply,
} from "@/lib/sync/applyStaged";

// Finding #12: the dashboard "Apply" path returns the ConcurrentSyncSkipped sentinel
// with NO durable log when the per-show advisory lock is contended (contrast the cron
// path, which writes a sync_log row). This asserts the fail-open forensic emit
// STAGED_APPLY_CONCURRENT_SKIPPED fires with driveFileId AND that the returned skip
// sentinel + control flow are UNCHANGED (invariant 9: emits never change return value).
//
// Real logger via setLogSink (no @/lib/log mock) so the top-level `driveFileId` field
// of the LogRecord (the queryable correlation column, distinct from a context field) is
// asserted directly.

function capture(): LogRecord[] {
  const sink: LogRecord[] = [];
  setLogSink((r) => {
    sink.push(r);
  });
  return sink;
}
afterEach(() => resetLogSink());

function parseResult(): ParseResult {
  return {
    show: {
      title: "Show",
      client_label: "Client",
      client_contact: null,
      template_version: "v4",
      venue: null,
      dates: {
        travelIn: "2026-05-07",
        set: "2026-05-08",
        showDays: ["2026-05-09"],
        travelOut: "2026-05-10",
      },
      schedule_phases: {},
      event_details: {},
      agenda_links: [],
      coi_status: null,
      po: null,
      proposal: null,
      invoice: null,
      invoice_notes: null,
    },
    crewMembers: [],
    hotelReservations: [],
    rooms: [],
    transportation: null,
    contacts: [],
    pullSheet: null,
    diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
    openingReel: null,
    raw_unrecognized: [],
    warnings: [],
    hardErrors: [],
  } as unknown as ParseResult;
}

function pending(overrides: Partial<PendingSyncForApply> = {}): PendingSyncForApply {
  return {
    driveFileId: "drive-file-1",
    stagedId: "staged-live",
    sourceKind: "manual",
    wizardSessionId: null,
    baseModifiedTime: "2026-05-08T10:00:00.000Z",
    stagedModifiedTime: "2026-05-08T12:00:00.000Z",
    parseResult: parseResult(),
    triggeredReviewItems: [],
    reviewItemsCorrupt: false,
    parseResultCorrupt: false,
    priorLastSyncStatus: "ok",
    priorLastSyncError: null,
    warningSummary: "none",
    ...overrides,
  };
}

function driveMeta(overrides: Partial<DriveListedFile & { trashed: boolean }> = {}) {
  return {
    driveFileId: "drive-file-1",
    name: "Show Sheet",
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime: "2026-05-08T12:00:00.000Z",
    parents: ["watched-folder"],
    headRevisionId: "head-1",
    trashed: false,
    ...overrides,
  };
}

// A withPipelineLock stub that ALWAYS reports the lock could not be acquired — it
// returns the sentinel WITHOUT invoking fn (mirrors withShowLock's !locked branch).
// Because fn never runs, the emit that happens where the sentinel is detected is
// provably OUTSIDE any held lock.
function contendedLock(): NonNullable<ApplyStagedDeps["withPipelineLock"]> {
  return vi.fn(async () => ({ skipped: CONCURRENT_SYNC_SKIPPED }) as const);
}

function baseDeps(overrides: Partial<ApplyStagedDeps> = {}): ApplyStagedDeps {
  return {
    readLivePendingSyncForApply: vi.fn(async () => pending()),
    readWizardPendingSyncForApply: vi.fn(async () => pending()),
    readShowForApply: vi.fn(async () => ({
      showId: "show-1",
      lastSeenModifiedTime: "2026-05-08T10:00:00.000Z",
      diagrams: { snapshot_revision_id: "rev-prior" },
    })),
    readWatchedFolderId: vi.fn(async () => "watched-folder"),
    fetchDriveFileMetadata: vi.fn(async () => driveMeta()),
    runPhase2: vi.fn(async () => ({ outcome: "applied" as const, appliedRoleMappings: [], showId: "show-1" })),
    resolveAdminAlerts: vi.fn(async () => undefined),
    readLandedSnapshotStatus: vi.fn(async () => null),
    ...overrides,
  };
}

describe("applyStaged lock-contention durable emit (finding #12)", () => {
  test("LIVE: contended lock → one STAGED_APPLY_CONCURRENT_SKIPPED info with driveFileId; sentinel returned unchanged", async () => {
    const sink = capture();
    const withPipelineLock = contendedLock();
    const result = await applyStaged(
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        reviewerChoices: [],
        appliedByEmail: "doug@fxav.test",
      },
      baseDeps({ withPipelineLock }),
    );

    // Control flow UNCHANGED: the skip sentinel is returned as-is.
    expect(result).toEqual({ skipped: CONCURRENT_SYNC_SKIPPED });

    const rec = sink.filter((r) => r.code === "STAGED_APPLY_CONCURRENT_SKIPPED");
    expect(rec, "exactly one durable skip emit").toHaveLength(1);
    expect(rec[0]!.level).toBe("info");
    expect(rec[0]!.source).toBe("sync.applyStaged");
    // driveFileId is the RESERVED top-level correlation field — this is what a sync_log
    // join would use, not a nested context field.
    expect(rec[0]!.driveFileId).toBe("drive-file-1");
    // info-with-code is persist-eligible (the whole point of finding #12).
    expect(rec[0]!.code).toBe("STAGED_APPLY_CONCURRENT_SKIPPED");
  });

  test("WIZARD: contended lock → one STAGED_APPLY_CONCURRENT_SKIPPED info with driveFileId; sentinel returned unchanged", async () => {
    const sink = capture();
    const withPipelineLock = contendedLock();
    const result = await applyStaged(
      {
        driveFileId: "drive-file-1",
        sourceScope: "wizard",
        wizardSessionId: "11111111-1111-4111-8111-111111111111",
        stagedId: "staged-live",
        reviewerChoices: [],
        appliedByEmail: "doug@fxav.test",
      },
      baseDeps({ withPipelineLock }),
    );

    expect(result).toEqual({ skipped: CONCURRENT_SYNC_SKIPPED });

    const rec = sink.filter((r) => r.code === "STAGED_APPLY_CONCURRENT_SKIPPED");
    expect(rec).toHaveLength(1);
    expect(rec[0]!.level).toBe("info");
    expect(rec[0]!.source).toBe("sync.applyStaged");
    expect(rec[0]!.driveFileId).toBe("drive-file-1");
  });

  test("non-contended live apply does NOT emit the skip code", async () => {
    const tx = {
      async queryOne<T>(sql: string) {
        if (/pg_locks/i.test(sql)) return { held: true } as T;
        if (/select archived from public\.shows/i.test(sql)) return { archived: false } as T;
        throw new Error(`unexpected SQL: ${sql}`);
      },
    } as unknown as LockedShowTx<SyncPipelineTx>;
    const sink = capture();
    const result = await applyStaged(
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        reviewerChoices: [],
        appliedByEmail: "doug@fxav.test",
      },
      baseDeps({
        withPipelineLock: vi.fn(async (_driveFileId, fn) => fn(tx)),
        liveDriveReverify: { outcome: "ok", metadata: driveMeta() },
        liveAssetReviewEffects: {
          parseResult: parseResult(),
          adminAlertCode: null,
          skipDiagramsWrite: false,
        },
        insertSyncAudit: vi.fn(async () => "audit-1"),
        deleteLivePendingSync: vi.fn(async () => undefined),
        bumpReviewerAuthFloors: vi.fn(async () => undefined),
        upsertAdminAlert: vi.fn(async () => undefined),
      }),
    );

    expect("skipped" in result).toBe(false);
    expect(sink.some((r) => r.code === "STAGED_APPLY_CONCURRENT_SKIPPED")).toBe(false);
  });
});
