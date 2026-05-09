import { describe, expect, test, vi } from "vitest";
import type { DriveListedFile } from "@/lib/drive/list";
import type { ParseResult, TriggeredReviewItem } from "@/lib/parser/types";
import type { LockedShowTx } from "@/lib/sync/lockedShowTx";
import type { SyncPipelineTx } from "@/lib/sync/runScheduledCronSync";
import {
  applyStaged_unlocked,
  INVALID_REVIEWER_ACTION,
  MISSING_REVIEWER_CHOICE,
  PENDING_SYNC_NOT_FOUND,
  STAGED_PARSE_OUTDATED,
  STAGED_PARSE_SOURCE_GONE,
  STAGED_PARSE_SOURCE_OUT_OF_SCOPE,
  STAGED_PARSE_SUPERSEDED,
  WIZARD_SCOPE_NOT_YET_IMPLEMENTED,
  type ApplyStagedDeps,
  type PendingSyncForApply,
} from "@/lib/sync/applyStaged";

type FakeTx = SyncPipelineTx & {
  held: boolean;
  operations: string[];
  queryOneCalls: Array<{ sql: string; params: unknown[] }>;
};

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

function fakeTx(held = true): FakeTx {
  return {
    held,
    operations: [],
    queryOneCalls: [],
    async queryOne<T>(sql: string, params: unknown[]) {
      this.queryOneCalls.push({ sql, params });
      if (/pg_locks/i.test(sql)) return { held: this.held } as T;
      throw new Error(`unexpected SQL in fakeTx: ${sql}`);
    },
    async readShowForPhase1() {
      throw new Error("not reached");
    },
    async readLivePendingSync() {
      return null;
    },
    async upsertLivePendingIngestion() {},
    async deleteLivePendingIngestion() {},
    async upsertLivePendingSync() {
      return { stagedId: "unused" };
    },
    async updateShowParseError() {},
    async updateShowPendingReview() {},
    async deleteWizardPendingSyncsExcept() {},
    async applyShowSnapshot() {
      this.operations.push("applyShowSnapshot");
      return { outcome: "updated", showId: "show-1", previousCrewNames: [] };
    },
    async deleteCrewMembersNotIn() {},
    async upsertCrewMembers() {},
    async provisionAddedCrewAuth() {},
    async revokeRemovedCrewAuth() {},
    async replaceHotelReservations() {},
    async replaceRooms() {},
    async replaceTransportation() {},
    async replaceContacts() {},
    async upsertShowsInternal() {},
  };
}

function deps(overrides: Partial<ApplyStagedDeps> = {}): ApplyStagedDeps {
  const base: ApplyStagedDeps = {
    readLivePendingSyncForApply: vi.fn(async () => pending()),
    readShowForApply: vi.fn(async () => ({
      showId: "show-1",
      lastSeenModifiedTime: "2026-05-08T10:00:00.000Z",
      diagrams: { snapshot_revision_id: "rev-prior" },
    })),
    readWatchedFolderId: vi.fn(async () => "watched-folder"),
    fetchDriveFileMetadata: vi.fn(async () => driveMeta()),
    runPhase2: vi.fn(async () => ({ outcome: "applied" as const, showId: "show-1" })),
    insertSyncAudit: vi.fn(async () => "audit-1"),
    deleteLivePendingSync: vi.fn(async () => undefined),
    restoreShowStatus: vi.fn(async () => undefined),
    upsertLivePendingIngestion: vi.fn(async () => undefined),
    bumpReviewerAuthFloors: vi.fn(async () => undefined),
    upsertAdminAlert: vi.fn(async () => undefined),
  };
  return { ...base, ...overrides };
}

describe("applyStaged live-scope", () => {
  test("runs Phase 2 from stored parse_result, audits, and deletes only the live pending row", async () => {
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const syncDeps = deps();

    const result = await applyStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        reviewerChoices: [],
        appliedByEmail: "doug@fxav.test",
      },
      syncDeps,
    );

    expect(result).toEqual({
      outcome: "applied",
      showId: "show-1",
      syncAuditId: "audit-1",
      derivedSideEffects: { revokeFloorForNames: [] },
    });
    expect(syncDeps.readLivePendingSyncForApply).toHaveBeenCalledWith(tx, "drive-file-1");
    expect(syncDeps.runPhase2).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        driveFileId: "drive-file-1",
        mode: "manual",
        parseResult: pending().parseResult,
        binding: { bindingToken: "2026-05-08T12:00:00.000Z", modifiedTime: "2026-05-08T12:00:00.000Z" },
      }),
    );
    expect(syncDeps.insertSyncAudit).toHaveBeenCalledBefore(
      vi.mocked(syncDeps.deleteLivePendingSync!),
    );
    expect(syncDeps.deleteLivePendingSync).toHaveBeenCalledWith(
      tx,
      "drive-file-1",
      "staged-live",
    );
  });

  test("missing live row returns PENDING_SYNC_NOT_FOUND without falling back to wizard rows", async () => {
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const syncDeps = deps({ readLivePendingSyncForApply: vi.fn(async () => null) });

    const result = await applyStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        reviewerChoices: [],
        appliedByEmail: "doug@fxav.test",
      },
      syncDeps,
    );

    expect(result).toEqual({ outcome: "not_found", code: PENDING_SYNC_NOT_FOUND });
    expect(syncDeps.runPhase2).not.toHaveBeenCalled();
  });

  test("staged_id CAS mismatch returns STAGED_PARSE_SUPERSEDED without mutating", async () => {
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const syncDeps = deps();

    const result = await applyStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-from-stale-tab",
        reviewerChoices: [],
        appliedByEmail: "doug@fxav.test",
      },
      syncDeps,
    );

    expect(result).toEqual({ outcome: "superseded", code: STAGED_PARSE_SUPERSEDED });
    expect(syncDeps.runPhase2).not.toHaveBeenCalled();
    expect(syncDeps.deleteLivePendingSync).not.toHaveBeenCalled();
  });

  test("base watermark CAS mismatch deletes stale live row and returns STAGED_PARSE_SUPERSEDED", async () => {
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const syncDeps = deps({
      readShowForApply: vi.fn(async () => ({
        showId: "show-1",
        lastSeenModifiedTime: "2026-05-08T11:00:00.000Z",
        diagrams: null,
      })),
    });

    const result = await applyStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        reviewerChoices: [],
        appliedByEmail: "doug@fxav.test",
      },
      syncDeps,
    );

    expect(result).toEqual({ outcome: "superseded", code: STAGED_PARSE_SUPERSEDED });
    expect(syncDeps.deleteLivePendingSync).toHaveBeenCalledWith(
      tx,
      "drive-file-1",
      "staged-live",
    );
    expect(syncDeps.runPhase2).not.toHaveBeenCalled();
  });

  test("existing-show Drive gone restores prior status and does not create pending_ingestions", async () => {
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const goneDeps = deps({
      fetchDriveFileMetadata: vi.fn(async () => driveMeta({ trashed: true })),
    });

    const gone = await applyStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        reviewerChoices: [],
        appliedByEmail: "doug@fxav.test",
      },
      goneDeps,
    );

    expect(gone).toEqual({ outcome: "source_gone", code: STAGED_PARSE_SOURCE_GONE });
    expect(goneDeps.restoreShowStatus).toHaveBeenCalledWith(tx, "drive-file-1", "ok", null);
    expect(goneDeps.upsertLivePendingIngestion).not.toHaveBeenCalled();
    expect(goneDeps.deleteLivePendingSync).toHaveBeenCalledWith(tx, "drive-file-1", "staged-live");
  });

  test("transient Drive metadata failures return SYNC_INFRA_ERROR without consuming the staged row", async () => {
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const transient = Object.assign(new Error("drive unavailable"), { status: 503 });
    const syncDeps = deps({
      fetchDriveFileMetadata: vi.fn(async () => {
        throw transient;
      }),
    });

    const result = await applyStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        reviewerChoices: [],
        appliedByEmail: "doug@fxav.test",
      },
      syncDeps,
    );

    expect(result).toEqual({ outcome: "infra_error", code: "SYNC_INFRA_ERROR" });
    expect(syncDeps.restoreShowStatus).not.toHaveBeenCalled();
    expect(syncDeps.upsertLivePendingIngestion).not.toHaveBeenCalled();
    expect(syncDeps.deleteLivePendingSync).not.toHaveBeenCalled();
    expect(syncDeps.runPhase2).not.toHaveBeenCalled();
  });

  test("first-seen Drive gone and out-of-scope failures route live recovery to pending_ingestions only", async () => {
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const firstSeen = {
      showId: null,
      lastSeenModifiedTime: null,
      diagrams: null,
    };
    const goneDeps = deps({
      readLivePendingSyncForApply: vi.fn(async () => pending({ baseModifiedTime: null })),
      readShowForApply: vi.fn(async () => firstSeen),
      fetchDriveFileMetadata: vi.fn(async () => driveMeta({ trashed: true })),
    });

    const gone = await applyStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        reviewerChoices: [],
        appliedByEmail: "doug@fxav.test",
      },
      goneDeps,
    );

    expect(gone).toEqual({ outcome: "source_gone", code: STAGED_PARSE_SOURCE_GONE });
    expect(goneDeps.restoreShowStatus).not.toHaveBeenCalled();
    expect(goneDeps.upsertLivePendingIngestion).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        driveFileId: "drive-file-1",
        lastErrorCode: STAGED_PARSE_SOURCE_GONE,
      }),
    );

    const movedDeps = deps({
      readLivePendingSyncForApply: vi.fn(async () => pending({ baseModifiedTime: null })),
      readShowForApply: vi.fn(async () => firstSeen),
      fetchDriveFileMetadata: vi.fn(async () => driveMeta({ parents: ["other-folder"] })),
    });
    const moved = await applyStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        reviewerChoices: [],
        appliedByEmail: "doug@fxav.test",
      },
      movedDeps,
    );

    expect(moved).toEqual({
      outcome: "source_out_of_scope",
      code: STAGED_PARSE_SOURCE_OUT_OF_SCOPE,
    });
    expect(movedDeps.restoreShowStatus).not.toHaveBeenCalled();
    expect(movedDeps.upsertLivePendingIngestion).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ lastErrorCode: STAGED_PARSE_SOURCE_OUT_OF_SCOPE }),
    );
  });

  test("newer Drive modifiedTime restores prior status, deletes live row, and returns STAGED_PARSE_OUTDATED", async () => {
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const syncDeps = deps({
      fetchDriveFileMetadata: vi.fn(async () =>
        driveMeta({ modifiedTime: "2026-05-08T13:00:00.000Z" }),
      ),
    });

    const result = await applyStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        reviewerChoices: [],
        appliedByEmail: "doug@fxav.test",
      },
      syncDeps,
    );

    expect(result).toEqual({ outcome: "outdated", code: STAGED_PARSE_OUTDATED });
    expect(syncDeps.restoreShowStatus).toHaveBeenCalledWith(tx, "drive-file-1", "ok", null);
    expect(syncDeps.deleteLivePendingSync).toHaveBeenCalledWith(tx, "drive-file-1", "staged-live");
  });

  test("reviewer choices are complete and asset-review items are apply-only", async () => {
    const assetItem: TriggeredReviewItem = {
      id: "asset-1",
      invariant: "DIAGRAMS_LINKED_FOLDER_DRIFT_PENDING",
      drift_count: 1,
    };
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const syncDeps = deps({
      readLivePendingSyncForApply: vi.fn(async () =>
        pending({ triggeredReviewItems: [assetItem] }),
      ),
    });

    const missing = await applyStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        reviewerChoices: [],
        appliedByEmail: "doug@fxav.test",
      },
      syncDeps,
    );
    expect(missing).toEqual({ outcome: "invalid_request", code: MISSING_REVIEWER_CHOICE });

    const invalid = await applyStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        reviewerChoices: [{ item_id: "asset-1", action: "rename", rename_value: "Nope" }],
        appliedByEmail: "doug@fxav.test",
      },
      syncDeps,
    );
    expect(invalid).toEqual({ outcome: "invalid_request", code: INVALID_REVIEWER_ACTION });
  });

  test("auth-sensitive review choices derive revoked-below-version floor bumps", async () => {
    const items: TriggeredReviewItem[] = [
      { id: "mi11", invariant: "MI-11", crew_name: "Alice", prior_email: "a@old.test", new_email: "a@new.test" },
      { id: "mi12", invariant: "MI-12", removed_name: "Bob", added_name: "Robert", email: "bob@test.test" },
      { id: "mi13", invariant: "MI-13-orphan-remove", removed_name: "Charlie" },
      { id: "mi14", invariant: "MI-14", removed_name: "Dana", added_name: "Dane" },
    ];
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const syncDeps = deps({
      readLivePendingSyncForApply: vi.fn(async () => pending({ triggeredReviewItems: items })),
    });

    const result = await applyStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        reviewerChoices: [
          { item_id: "mi11", action: "apply" },
          { item_id: "mi12", action: "rename", rename_value: "Robert" },
          { item_id: "mi13", action: "apply" },
          { item_id: "mi14", action: "rename", rename_value: "Dane" },
        ],
        appliedByEmail: "doug@fxav.test",
      },
      syncDeps,
    );

    expect(result).toMatchObject({
      outcome: "applied",
      derivedSideEffects: {
        revokeFloorForNames: ["Alice", "Bob", "Charlie", "Dana", "Dane", "Robert"],
      },
    });
    expect(syncDeps.bumpReviewerAuthFloors).toHaveBeenCalledWith(tx, "show-1", [
      "Alice",
      "Bob",
      "Charlie",
      "Dana",
      "Dane",
      "Robert",
    ]);
  });

  test("reject reviewer choice routes through discard semantics before Phase 2", async () => {
    const item: TriggeredReviewItem = {
      id: "mi12",
      invariant: "MI-12",
      removed_name: "Bob",
      added_name: "Robert",
      email: "bob@test.test",
    };
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const syncDeps = deps({
      readLivePendingSyncForApply: vi.fn(async () =>
        pending({ triggeredReviewItems: [item] }),
      ),
    });

    const result = await applyStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        reviewerChoices: [{ item_id: "mi12", action: "reject" }],
        appliedByEmail: "doug@fxav.test",
      },
      syncDeps,
    );

    expect(result).toEqual({ outcome: "discarded", variant: "try_again" });
    expect(syncDeps.restoreShowStatus).toHaveBeenCalledWith(tx, "drive-file-1", "ok", null);
    expect(syncDeps.deleteLivePendingSync).toHaveBeenCalledWith(tx, "drive-file-1", "staged-live");
    expect(syncDeps.runPhase2).not.toHaveBeenCalled();
    expect(syncDeps.insertSyncAudit).not.toHaveBeenCalled();
  });

  test("MI-13 independent choice bumps the removed identity only", async () => {
    const item: TriggeredReviewItem = {
      id: "mi13",
      invariant: "MI-13",
      removed_name: "Old Person",
      added_name: "New Person",
    };
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const syncDeps = deps({
      readLivePendingSyncForApply: vi.fn(async () =>
        pending({ triggeredReviewItems: [item] }),
      ),
    });

    const result = await applyStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        reviewerChoices: [{ item_id: "mi13", action: "independent" }],
        appliedByEmail: "doug@fxav.test",
      },
      syncDeps,
    );

    expect(result).toMatchObject({
      outcome: "applied",
      derivedSideEffects: { revokeFloorForNames: ["Old Person"] },
    });
    expect(syncDeps.bumpReviewerAuthFloors).toHaveBeenCalledWith(tx, "show-1", ["Old Person"]);
  });

  test("DIAGRAMS_EMBEDDED_NONE_FOUND mints an intentionally empty diagram snapshot", async () => {
    const item: TriggeredReviewItem = {
      id: "empty-diagrams",
      invariant: "DIAGRAMS_EMBEDDED_NONE_FOUND",
      spreadsheet_id: "sheet-1",
    };
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const runPhase2 = vi.fn<NonNullable<ApplyStagedDeps["runPhase2"]>>(
      async () => ({ outcome: "applied" as const, showId: "show-1" }),
    );
    const syncDeps = deps({
      readLivePendingSyncForApply: vi.fn(async () =>
        pending({ triggeredReviewItems: [item] }),
      ),
      runPhase2,
    });

    await applyStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        reviewerChoices: [{ item_id: "empty-diagrams", action: "apply" }],
        appliedByEmail: "doug@fxav.test",
      },
      syncDeps,
    );

    const phase2Args = runPhase2.mock.calls[0]?.[1];
    expect(phase2Args?.parseResult.diagrams).toMatchObject({
      linkedFolder: null,
      embeddedImages: [],
      linkedFolderItems: [],
      snapshot_status: "complete",
    });
    expect(typeof (phase2Args?.parseResult.diagrams as { snapshot_revision_id?: unknown }).snapshot_revision_id).toBe(
      "string",
    );
  });

  test("DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE retries before preserving prior diagrams", async () => {
    const item: TriggeredReviewItem = {
      id: "no-revision",
      invariant: "DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE",
      spreadsheet_id: "sheet-1",
    };
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const retryEmbeddedRevisionAvailability = vi.fn(async () => false);
    const runPhase2 = vi.fn<NonNullable<ApplyStagedDeps["runPhase2"]>>(
      async () => ({ outcome: "applied" as const, showId: "show-1" }),
    );
    const priorDiagrams = { snapshot_revision_id: "prior-rev", snapshot_status: "complete" };
    const syncDeps = deps({
      readLivePendingSyncForApply: vi.fn(async () =>
        pending({ triggeredReviewItems: [item] }),
      ),
      readShowForApply: vi.fn(async () => ({
        showId: "show-1",
        lastSeenModifiedTime: "2026-05-08T10:00:00.000Z",
        diagrams: priorDiagrams,
      })),
      retryEmbeddedRevisionAvailability,
      runPhase2,
    });

    await applyStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        reviewerChoices: [{ item_id: "no-revision", action: "apply" }],
        appliedByEmail: "doug@fxav.test",
      },
      syncDeps,
    );

    expect(retryEmbeddedRevisionAvailability).toHaveBeenCalledWith("sheet-1");
    expect(runPhase2.mock.calls[0]?.[1]?.parseResult.diagrams).toBe(priorDiagrams);
    expect(runPhase2.mock.calls[0]?.[1]?.skipDiagramsWrite).toBe(true);
    expect(syncDeps.upsertAdminAlert).toHaveBeenCalledWith({
      showId: "show-1",
      code: "EMBEDDED_RECOVERY_REQUIRES_RESTAGE",
      context: { drive_file_id: "drive-file-1" },
    });
  });

  test("embedded revision recovery composes with reel drift side effects", async () => {
    const unavailable: TriggeredReviewItem = {
      id: "no-revision",
      invariant: "DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE",
      spreadsheet_id: "sheet-1",
    };
    const reelDrift: TriggeredReviewItem = {
      id: "reel-drift",
      invariant: "REEL_DRIFT_PENDING",
      reel_drive_file_id: "reel-1",
    };
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const runPhase2 = vi.fn<NonNullable<ApplyStagedDeps["runPhase2"]>>(
      async () => ({ outcome: "applied" as const, showId: "show-1" }),
    );
    const priorDiagrams = { snapshot_revision_id: "prior-rev", snapshot_status: "complete" };
    const syncDeps = deps({
      readLivePendingSyncForApply: vi.fn(async () =>
        pending({
          triggeredReviewItems: [unavailable, reelDrift],
          parseResult: {
            ...parseResult(),
            openingReel: {
              driveFileId: "reel-1",
              drive_modified_time: "2026-05-08T10:00:00.000Z",
              headRevisionId: "reel-head-1",
              mimeType: "video/mp4",
            },
          },
        }),
      ),
      readShowForApply: vi.fn(async () => ({
        showId: "show-1",
        lastSeenModifiedTime: "2026-05-08T10:00:00.000Z",
        diagrams: priorDiagrams,
      })),
      retryEmbeddedRevisionAvailability: vi.fn(async () => false),
      runPhase2,
    });

    await applyStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        reviewerChoices: [
          { item_id: "no-revision", action: "apply" },
          { item_id: "reel-drift", action: "apply" },
        ],
        appliedByEmail: "doug@fxav.test",
      },
      syncDeps,
    );

    const phase2Args = runPhase2.mock.calls[0]?.[1];
    expect(phase2Args?.parseResult.diagrams).toBe(priorDiagrams);
    expect(phase2Args?.parseResult.openingReel).toBeNull();
    expect(phase2Args?.parseResult.warnings).toContainEqual(
      expect.objectContaining({ code: "REEL_DRIFTED" }),
    );
    expect(phase2Args?.parseResult.warnings).toContainEqual(
      expect.objectContaining({ code: "EMBEDDED_RECOVERY_REQUIRES_RESTAGE" }),
    );
  });

  test("REEL_DRIFT_PENDING clears the stale opening reel and persists a warning without diagram mutation", async () => {
    const item: TriggeredReviewItem = {
      id: "reel-drift",
      invariant: "REEL_DRIFT_PENDING",
      reel_drive_file_id: "reel-1",
    };
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const runPhase2 = vi.fn<NonNullable<ApplyStagedDeps["runPhase2"]>>(
      async () => ({ outcome: "applied" as const, showId: "show-1" }),
    );
    const syncDeps = deps({
      readLivePendingSyncForApply: vi.fn(async () =>
        pending({
          triggeredReviewItems: [item],
          parseResult: {
            ...parseResult(),
            openingReel: {
              driveFileId: "reel-1",
              drive_modified_time: "2026-05-08T10:00:00.000Z",
              headRevisionId: "reel-head-1",
              mimeType: "video/mp4",
            },
          },
        }),
      ),
      runPhase2,
    });

    await applyStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "live",
        stagedId: "staged-live",
        reviewerChoices: [{ item_id: "reel-drift", action: "apply" }],
        appliedByEmail: "doug@fxav.test",
      },
      syncDeps,
    );

    const phase2Args = runPhase2.mock.calls[0]?.[1];
    expect(phase2Args?.parseResult.openingReel).toBeNull();
    expect(phase2Args?.parseResult.warnings).toContainEqual(
      expect.objectContaining({ code: "REEL_DRIFTED" }),
    );
    expect(phase2Args?.parseResult.diagrams).toEqual(parseResult().diagrams);
  });

  test("wizard scope is explicitly deferred behind a 501 code", async () => {
    const tx = fakeTx() as LockedShowTx<FakeTx>;
    const syncDeps = deps();

    const result = await applyStaged_unlocked(
      tx,
      {
        driveFileId: "drive-file-1",
        sourceScope: "wizard",
        wizardSessionId: "11111111-1111-4111-8111-111111111111",
        stagedId: "staged-wizard",
        reviewerChoices: [],
        appliedByEmail: "doug@fxav.test",
      },
      syncDeps,
    );

    expect(result).toEqual({
      outcome: "wizard_deferred",
      code: WIZARD_SCOPE_NOT_YET_IMPLEMENTED,
    });
    expect(syncDeps.readLivePendingSyncForApply).not.toHaveBeenCalled();
  });
});
