/**
 * tests/sync/syncDiagramRevalidate.test.ts (nav-perf tag-caching, plan Task 7)
 *
 * Asserts the diagram-promote / asset-recovery / staged-apply writers call
 * `revalidateTag(showCacheTag(showId), { expire: 0 })` POST-COMMIT — after the
 * lock/tx that performed the rendered-data write resolves, on the outcomes that
 * actually mutate getShowForViewer-projected data (shows.diagrams; crew/show via
 * runPhase2), and NEVER on a non-mutating outcome.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";
import { revalidateTag } from "next/cache";
import { showCacheTag } from "@/lib/data/showCacheTag";
import type { DriveListedFile } from "@/lib/drive/list";
import type { ParseResult } from "@/lib/parser/types";
import type { LockedShowTx } from "@/lib/sync/lockedShowTx";
import type { SyncPipelineTx } from "@/lib/sync/runScheduledCronSync";

const order: string[] = [];
vi.mock("next/cache", () => ({
  unstable_cache:
    (fn: (...a: unknown[]) => unknown) =>
    (...a: unknown[]) =>
      fn(...a),
  revalidateTag: vi.fn((tag: string) => {
    order.push(`revalidate:${tag}`);
  }),
  revalidatePath: vi.fn(),
}));

beforeEach(() => {
  order.length = 0;
  (revalidateTag as unknown as ReturnType<typeof vi.fn>).mockClear();
});

// ---------------------------------------------------------------------------
// assetRecovery — runAssetRecoveryCron post-commit revalidate
// ---------------------------------------------------------------------------

describe("runAssetRecoveryCron post-commit revalidate", () => {
  test("revalidates only the shows whose diagrams it wrote (recovered/restage_required/partial_failure)", async () => {
    const { runAssetRecoveryCron } = await import("@/lib/sync/assetRecovery");
    const outcomes: Record<
      string,
      { outcome: string; snapshotRevisionId?: string; code?: string }
    > = {
      "show-recovered": { outcome: "recovered", snapshotRevisionId: "rev-1" },
      "show-restage": { outcome: "restage_required", snapshotRevisionId: "rev-2" },
      "show-partial": { outcome: "partial_failure", snapshotRevisionId: "rev-3" },
      "show-noop": { outcome: "no_op" },
      "show-drift": { outcome: "revision_drift", code: "ASSET_RECOVERY_REVISION_DRIFT" },
    };

    await runAssetRecoveryCron({
      listRecoverableShows: async () => Object.keys(outcomes),
      recover: async (id) => {
        order.push(`committed:${id}`);
        return outcomes[id] as never;
      },
    });

    const tags = (revalidateTag as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(tags).toEqual([
      showCacheTag("show-recovered"),
      showCacheTag("show-restage"),
      showCacheTag("show-partial"),
    ]);
    for (const c of (revalidateTag as unknown as ReturnType<typeof vi.fn>).mock.calls) {
      expect(c[1]).toEqual({ expire: 0 });
    }
    // Post-commit ordering: each revalidate follows its own `recover` resolution.
    expect(order).toEqual([
      "committed:show-recovered",
      `revalidate:${showCacheTag("show-recovered")}`,
      "committed:show-restage",
      `revalidate:${showCacheTag("show-restage")}`,
      "committed:show-partial",
      `revalidate:${showCacheTag("show-partial")}`,
      "committed:show-noop",
      "committed:show-drift",
    ]);
  });
});

// ---------------------------------------------------------------------------
// applyStaged — live applied path post-commit revalidate
// ---------------------------------------------------------------------------

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
  };
}

function driveMeta(): DriveListedFile {
  return {
    driveFileId: "drive-file-1",
    name: "Show Sheet",
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime: "2026-05-08T12:00:00.000Z",
    parents: ["watched-folder"],
    headRevisionId: "head-1",
  };
}

function fakeTx() {
  return {
    held: true,
    async queryOne<T>(sql: string) {
      if (/pg_locks/i.test(sql)) return { held: true } as T;
      if (/select archived from public\.shows/i.test(sql)) return { archived: false } as T;
      if (/upsert_admin_alert/i.test(sql)) return { id: "alert-row-1" } as T;
      throw new Error(`unexpected SQL in fakeTx: ${sql}`);
    },
  } as unknown as LockedShowTx<SyncPipelineTx>;
}

describe("applyStaged live post-commit revalidate", () => {
  test("revalidates the applied show AFTER the locked CAS commits", async () => {
    const { applyStaged } = await import("@/lib/sync/applyStaged");
    const tx = fakeTx();
    const result = await applyStaged(
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        reviewerChoices: [],
        appliedByEmail: "doug@fxav.test",
      },
      {
        readLivePendingSyncForApply: vi.fn(async () => ({
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
        })),
        readShowForApply: vi.fn(async () => ({
          showId: "show-1",
          lastSeenModifiedTime: "2026-05-08T10:00:00.000Z",
          diagrams: { snapshot_revision_id: "rev-prior" },
        })),
        readWatchedFolderId: vi.fn(async () => "watched-folder"),
        fetchDriveFileMetadata: vi.fn(async () => driveMeta()),
        liveDriveReverify: { outcome: "ok", metadata: driveMeta() },
        liveAssetReviewEffects: {
          parseResult: parseResult(),
          adminAlertCode: null,
          skipDiagramsWrite: false,
        },
        runPhase2: vi.fn(async () => ({ outcome: "applied" as const, showId: "show-1" })),
        insertSyncAudit: vi.fn(async () => "audit-1"),
        deleteLivePendingSync: vi.fn(async () => undefined),
        restoreShowStatus: vi.fn(async () => undefined),
        upsertLivePendingIngestion: vi.fn(async () => undefined),
        bumpReviewerAuthFloors: vi.fn(async () => undefined),
        upsertAdminAlert: vi.fn(async () => undefined),
        withPipelineLock: vi.fn(async (_driveFileId, fn) => {
          const r = await fn(tx);
          order.push("committed");
          return r;
        }),
      },
    );

    expect(result).toMatchObject({ outcome: "applied", showId: "show-1" });
    expect(revalidateTag).toHaveBeenCalledTimes(1);
    expect(revalidateTag).toHaveBeenCalledWith(showCacheTag("show-1"), { expire: 0 });
    // Post-commit: the LAST `committed` (the applied CAS lock) precedes the revalidate.
    expect(order[order.length - 1]).toBe(`revalidate:${showCacheTag("show-1")}`);
    expect(order.filter((o) => o === "committed").length).toBeGreaterThanOrEqual(1);
    const lastCommit = order.lastIndexOf("committed");
    const revalIdx = order.indexOf(`revalidate:${showCacheTag("show-1")}`);
    expect(revalIdx).toBeGreaterThan(lastCommit);
  });

  test("does NOT revalidate a non-applied live outcome (staged_id superseded)", async () => {
    const { applyStaged } = await import("@/lib/sync/applyStaged");
    const tx = fakeTx();
    const result = await applyStaged(
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        reviewerChoices: [],
        appliedByEmail: "doug@fxav.test",
      },
      {
        // Reader returns a DIFFERENT stagedId → wrapper aborts with `superseded`, no runPhase2.
        readLivePendingSyncForApply: vi.fn(async () => ({
          driveFileId: "drive-file-1",
          stagedId: "staged-from-concurrent-reviewer",
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
        })),
        readShowForApply: vi.fn(async () => ({
          showId: "show-1",
          lastSeenModifiedTime: "2026-05-08T10:00:00.000Z",
          diagrams: { snapshot_revision_id: "rev-prior" },
        })),
        readWatchedFolderId: vi.fn(async () => "watched-folder"),
        fetchDriveFileMetadata: vi.fn(async () => driveMeta()),
        liveDriveReverify: { outcome: "ok", metadata: driveMeta() },
        liveAssetReviewEffects: {
          parseResult: parseResult(),
          adminAlertCode: null,
          skipDiagramsWrite: false,
        },
        deleteLivePendingSync: vi.fn(async () => undefined),
        restoreShowStatus: vi.fn(async () => undefined),
        upsertLivePendingIngestion: vi.fn(async () => undefined),
        withPipelineLock: vi.fn(async (_driveFileId, fn) => fn(tx)),
      },
    );

    expect("outcome" in result && result.outcome).toBe("superseded");
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});
