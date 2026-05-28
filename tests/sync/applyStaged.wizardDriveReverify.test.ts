import { describe, expect, test, vi } from "vitest";
import type { DriveListedFile } from "@/lib/drive/list";
import type { ParseResult } from "@/lib/parser/types";
import type { LockedShowTx } from "@/lib/sync/lockedShowTx";
import type { SyncPipelineTx } from "@/lib/sync/runScheduledCronSync";
import {
  applyStaged_unlocked,
  STAGED_PARSE_SOURCE_GONE,
  STAGED_PARSE_SOURCE_OUT_OF_SCOPE,
  type ApplyStagedDeps,
  type PendingSyncForApply,
} from "@/lib/sync/applyStaged";

const WIZARD_SESSION_ID = "11111111-1111-4111-8111-111111111111";
const STAGED_PARSE_REVISION_RACE = "STAGED_PARSE_REVISION_RACE";

type FakeTx = SyncPipelineTx & {
  held: boolean;
  queryOneCalls: Array<{ sql: string; params: unknown[] }>;
};

type WizardDriveReverify =
  | { outcome: "ok"; metadata: DriveListedFile & { trashed?: boolean }; pendingFolderId: string }
  | { outcome: "source_gone"; code: typeof STAGED_PARSE_SOURCE_GONE; pendingFolderId: string }
  | {
      outcome: "source_out_of_scope";
      code: typeof STAGED_PARSE_SOURCE_OUT_OF_SCOPE;
      pendingFolderId: string;
    }
  | {
      outcome: "revision_race";
      code: typeof STAGED_PARSE_REVISION_RACE;
      pendingFolderId: string;
      metadata: DriveListedFile & { trashed?: boolean };
    };

type WizardReverifyDeps = ApplyStagedDeps & {
  wizardDriveReverify: WizardDriveReverify;
  upsertWizardPendingIngestion: ReturnType<typeof vi.fn>;
  markWizardManifestHardFailed: ReturnType<typeof vi.fn>;
};

function parseResult(): ParseResult {
  return {
    show: {
      title: "Wizard Sheet",
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
    stagedId: "staged-wizard",
    sourceKind: "onboarding_scan",
    wizardSessionId: WIZARD_SESSION_ID,
    baseModifiedTime: null,
    stagedModifiedTime: "2026-05-08T12:00:00.000Z",
    parseResult: parseResult(),
    triggeredReviewItems: [],
    reviewItemsCorrupt: false,
    priorLastSyncStatus: null,
    priorLastSyncError: null,
    warningSummary: "none",
    ...overrides,
  };
}

function driveMeta(overrides: Partial<DriveListedFile & { trashed: boolean }> = {}) {
  return {
    driveFileId: "drive-file-1",
    name: "Wizard Sheet",
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime: "2026-05-08T12:00:00.000Z",
    parents: ["pending-folder"],
    headRevisionId: "head-1",
    trashed: false,
    ...overrides,
  };
}

function fakeTx(): LockedShowTx<FakeTx> {
  const queryOneCalls: Array<{ sql: string; params: unknown[] }> = [];
  const tx: FakeTx = {
    held: true,
    queryOneCalls,
    async queryOne<T>(sql: string, params: unknown[]) {
      queryOneCalls.push({ sql, params });
      if (/pg_locks/i.test(sql)) return { held: tx.held } as T;
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
  return tx as unknown as LockedShowTx<FakeTx>;
}

function wizardDeps(reverify: WizardDriveReverify): WizardReverifyDeps {
  return {
    readLivePendingSyncForApply: vi.fn(async () => {
      throw new Error("wizard Apply must not read the live partition");
    }),
    readWizardPendingSyncForApply: vi.fn(async () => pending()),
    readActiveWizardSession: vi.fn(async () => WIZARD_SESSION_ID),
    approveWizardPendingSync: vi.fn(async () => true),
    markWizardManifestApplied: vi.fn(async () => true),
    runPhase2: vi.fn(async () => {
      throw new Error("wizard Apply must not run Phase 2");
    }),
    insertSyncAudit: vi.fn(async () => {
      throw new Error("wizard Apply must not write sync_audit");
    }),
    deleteLivePendingSync: vi.fn(async () => {
      throw new Error("wizard Apply must not delete live pending_syncs");
    }),
    upsertWizardPendingIngestion: vi.fn(async () => true),
    markWizardManifestHardFailed: vi.fn(async () => true),
    wizardDriveReverify: reverify,
  };
}

async function applyWizard(syncDeps: ApplyStagedDeps) {
  return await applyStaged_unlocked(
    fakeTx(),
    {
      driveFileId: "drive-file-1",
      sourceScope: "wizard",
      wizardSessionId: WIZARD_SESSION_ID,
      stagedId: "staged-wizard",
      reviewerChoices: [],
      appliedByEmail: "doug@fxav.test",
    },
    syncDeps,
  );
}

describe("wizard Apply Drive reverify", () => {
  test("valid pending-folder wizard Apply approves the staged row and manifest", async () => {
    const syncDeps = wizardDeps({
      outcome: "ok",
      metadata: driveMeta(),
      pendingFolderId: "pending-folder",
    });

    const result = await applyWizard(syncDeps);

    expect(result).toEqual({
      outcome: "wizard_applied",
      wizardSessionId: WIZARD_SESSION_ID,
      stagedId: "staged-wizard",
    });
    expect(syncDeps.approveWizardPendingSync).toHaveBeenCalled();
    expect(syncDeps.markWizardManifestApplied).toHaveBeenCalled();
    expect(syncDeps.upsertWizardPendingIngestion).not.toHaveBeenCalled();
    expect(syncDeps.markWizardManifestHardFailed).not.toHaveBeenCalled();
  });

  test("Drive 404 blocks wizard approval and writes wizard-scoped hard-fail recovery", async () => {
    const syncDeps = wizardDeps({
      outcome: "source_gone",
      code: STAGED_PARSE_SOURCE_GONE,
      pendingFolderId: "pending-folder",
    });

    const result = await applyWizard(syncDeps);

    expect(result).toEqual({ outcome: "source_gone", code: STAGED_PARSE_SOURCE_GONE });
    expect(syncDeps.approveWizardPendingSync).not.toHaveBeenCalled();
    expect(syncDeps.markWizardManifestApplied).not.toHaveBeenCalled();
    expect(syncDeps.upsertWizardPendingIngestion).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        driveFileId: "drive-file-1",
        wizardSessionId: WIZARD_SESSION_ID,
        pendingFolderId: "pending-folder",
        lastErrorCode: STAGED_PARSE_SOURCE_GONE,
      }),
    );
    expect(syncDeps.markWizardManifestHardFailed).toHaveBeenCalledWith(
      expect.anything(),
      "drive-file-1",
      WIZARD_SESSION_ID,
    );
  });

  test("moved-out sheet blocks wizard approval and hard-fails the manifest", async () => {
    const syncDeps = wizardDeps({
      outcome: "source_out_of_scope",
      code: STAGED_PARSE_SOURCE_OUT_OF_SCOPE,
      pendingFolderId: "pending-folder",
    });

    const result = await applyWizard(syncDeps);

    expect(result).toEqual({
      outcome: "source_out_of_scope",
      code: STAGED_PARSE_SOURCE_OUT_OF_SCOPE,
    });
    expect(syncDeps.approveWizardPendingSync).not.toHaveBeenCalled();
    expect(syncDeps.markWizardManifestApplied).not.toHaveBeenCalled();
    expect(syncDeps.upsertWizardPendingIngestion).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        wizardSessionId: WIZARD_SESSION_ID,
        pendingFolderId: "pending-folder",
        lastErrorCode: STAGED_PARSE_SOURCE_OUT_OF_SCOPE,
      }),
    );
    expect(syncDeps.markWizardManifestHardFailed).toHaveBeenCalledWith(
      expect.anything(),
      "drive-file-1",
      WIZARD_SESSION_ID,
    );
  });

  test("modifiedTime drift blocks wizard approval with STAGED_PARSE_REVISION_RACE", async () => {
    const syncDeps = wizardDeps({
      outcome: "revision_race",
      code: STAGED_PARSE_REVISION_RACE,
      pendingFolderId: "pending-folder",
      metadata: driveMeta({ modifiedTime: "2026-05-08T12:01:00.000Z" }),
    });

    const result = await applyWizard(syncDeps);

    expect(result).toEqual({
      outcome: "revision_race",
      code: STAGED_PARSE_REVISION_RACE,
    });
    expect(syncDeps.approveWizardPendingSync).not.toHaveBeenCalled();
    expect(syncDeps.markWizardManifestApplied).not.toHaveBeenCalled();
    expect(syncDeps.upsertWizardPendingIngestion).not.toHaveBeenCalled();
    expect(syncDeps.markWizardManifestHardFailed).not.toHaveBeenCalled();
  });
});
