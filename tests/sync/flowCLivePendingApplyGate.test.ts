import { describe, expect, test, vi } from "vitest";
import type { ParseResult } from "@/lib/parser/types";
import type { LockedShowTx } from "@/lib/sync/lockedShowTx";
import type { SyncPipelineTx } from "@/lib/sync/runScheduledCronSync";
import {
  applyStaged_unlocked,
  STAGED_PARSE_OUTDATED,
  type ApplyStagedDeps,
  type PendingSyncForApply,
} from "@/lib/sync/applyStaged";
import type { OverrideSnapshot, PullSheetOverride } from "@/lib/sync/pullSheetOverride";

const logMock = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));
vi.mock("@/lib/log", () => ({ log: logMock }));

/**
 * §5.8 Flow C — live-cron deferred-apply snapshot gate (I5(c), spec §15 test 8e).
 *
 * `upsertLivePendingSync` (Task 6) already writes `pull_sheet_override_applied =
 * overrideSnapshot(override-as-of-lock)` with the staged live parse. This suite pins the
 * APPLY-side gate: at `applyStaged_unlocked` (live path, `wizard_session_id IS NULL`), under
 * the `show:` lock, the staged parse's applied snapshot MUST deep-equal
 * `overrideSnapshot(shows.pull_sheet_override)` (the durable override IS the desired value for
 * live sync). On mismatch → discard-and-rerun: refuse to apply the stale live parse; the next
 * cron re-parses/re-stages under the current durable override.
 */

const OLD_A: OverrideSnapshot = { tabName: "OLD PULL SHEET", fingerprint: "ff" };

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
    archivedPullSheetTabs: [],
    hardErrors: [],
  };
}

function driveMeta() {
  return {
    driveFileId: "drive-file-1",
    name: "Show Sheet",
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime: "2026-05-08T12:00:00.000Z",
    parents: ["watched-folder"],
    headRevisionId: "head-1",
    trashed: false,
  };
}

function pending(overrides: Partial<PendingSyncForApply> = {}): PendingSyncForApply {
  return {
    driveFileId: "drive-file-1",
    stagedId: "staged-live",
    sourceKind: "cron",
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
    pullSheetOverrideApplied: null,
    ...overrides,
  };
}

type FakeTx = SyncPipelineTx & { held: boolean };

function fakeTx(): LockedShowTx<FakeTx> {
  return {
    held: true,
    async queryOne<T>(sql: string) {
      if (/pg_locks/i.test(sql)) return { held: true } as T;
      if (/select archived from public\.shows/i.test(sql)) return { archived: false } as T;
      throw new Error(`unexpected SQL in fakeTx: ${sql}`);
    },
  } as unknown as LockedShowTx<FakeTx>;
}

// The durable override is read atomically with the show baseline via readShowForApply; a helper
// builds the show row so each test declares only the durable override snapshot it wants to gate on.
function showRow(durable: OverrideSnapshot) {
  // The durable column is a full PullSheetOverride (audit fields included); the gate reduces it
  // via overrideSnapshot() before comparing. Synthesize the audit fields so the mock matches the
  // real ShowForApply shape — the gate ignores them.
  const pullSheetOverride: PullSheetOverride | null = durable
    ? { ...durable, acceptedBy: "doug@fxav.test", acceptedAt: "2026-05-08T09:00:00.000Z" }
    : null;
  return {
    showId: "show-1",
    lastSeenModifiedTime: "2026-05-08T10:00:00.000Z",
    diagrams: { snapshot_revision_id: "rev-prior" },
    pullSheetOverride,
  };
}

function deps(overrides: Partial<ApplyStagedDeps> = {}): ApplyStagedDeps {
  const base: ApplyStagedDeps = {
    readLivePendingSyncForApply: vi.fn(async () => pending({ pullSheetOverrideApplied: OLD_A })),
    readShowForApply: vi.fn(async () => showRow(OLD_A)),
    readWatchedFolderId: vi.fn(async () => "watched-folder"),
    fetchDriveFileMetadata: vi.fn(async () => driveMeta()),
    liveDriveReverify: { outcome: "ok", metadata: driveMeta() },
    liveAssetReviewEffects: {
      parseResult: parseResult(),
      adminAlertCode: null,
      skipDiagramsWrite: false,
    },
    runPhase2: vi.fn(async () => ({ outcome: "applied" as const, appliedRoleMappings: [], showId: "show-1" })),
    insertSyncAudit: vi.fn(async () => "audit-1"),
    deleteLivePendingSync: vi.fn(async () => undefined),
    restoreShowStatus: vi.fn(async () => undefined),
    upsertLivePendingIngestion: vi.fn(async () => undefined),
    bumpReviewerAuthFloors: vi.fn(async () => undefined),
    upsertAdminAlert: vi.fn(async () => undefined),
  };
  return { ...base, ...overrides };
}

const liveArgs = {
  driveFileId: "drive-file-1",
  sourceScope: "live" as const,
  stagedId: "staged-live",
  reviewerChoices: [],
  appliedByEmail: "doug@fxav.test",
};

describe("Flow C live-cron deferred-apply gate", () => {
  test("live pending staged under override A, durable shows.override revoked before apply => apply REFUSED (no stale live parse)", async () => {
    const syncDeps = deps({
      readLivePendingSyncForApply: vi.fn(async () => pending({ pullSheetOverrideApplied: OLD_A })),
      // Durable override was revoked (→ null) after the live row was staged under A.
      readShowForApply: vi.fn(async () => showRow(null)),
    });

    const result = await applyStaged_unlocked(fakeTx(), liveArgs, syncDeps);

    expect(result.outcome).toBe("override_snapshot_mismatch");
    expect("code" in result && result.code).toBe(STAGED_PARSE_OUTDATED);
    // Discard-and-rerun: the stale live parse must NOT be applied.
    expect(syncDeps.runPhase2).not.toHaveBeenCalled();
  });

  test("durable override content-changed (A -> B) before apply => apply REFUSED", async () => {
    const syncDeps = deps({
      readLivePendingSyncForApply: vi.fn(async () => pending({ pullSheetOverrideApplied: OLD_A })),
      readShowForApply: vi.fn(async () =>
        showRow({ tabName: "OLD PULL SHEET", fingerprint: "ee" }),
      ),
    });

    const result = await applyStaged_unlocked(fakeTx(), liveArgs, syncDeps);

    expect(result.outcome).toBe("override_snapshot_mismatch");
    expect(syncDeps.runPhase2).not.toHaveBeenCalled();
  });

  test("applied snapshot === overrideSnapshot(durable) => applies normally", async () => {
    const syncDeps = deps({
      readLivePendingSyncForApply: vi.fn(async () => pending({ pullSheetOverrideApplied: OLD_A })),
      readShowForApply: vi.fn(async () => showRow({ ...OLD_A })),
    });

    const result = await applyStaged_unlocked(fakeTx(), liveArgs, syncDeps);

    expect(result.outcome).toBe("applied");
    expect(syncDeps.runPhase2).toHaveBeenCalledTimes(1);
  });

  test("both null (no override staged, durable null) => applies normally", async () => {
    const syncDeps = deps({
      readLivePendingSyncForApply: vi.fn(async () => pending({ pullSheetOverrideApplied: null })),
      readShowForApply: vi.fn(async () => showRow(null)),
    });

    const result = await applyStaged_unlocked(fakeTx(), liveArgs, syncDeps);

    expect(result.outcome).toBe("applied");
    expect(syncDeps.runPhase2).toHaveBeenCalledTimes(1);
  });
});
