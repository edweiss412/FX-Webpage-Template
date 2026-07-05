import { describe, expect, test, vi } from "vitest";
import type { DriveListedFile } from "@/lib/drive/list";
import type { SyncPipelineTx } from "@/lib/sync/runScheduledCronSync";
import type { LockedShowTx } from "@/lib/sync/lockedShowTx";

// The restage closure calls fetchSheetMarkdownAndBytesAtRevision (markdown + bytes)
// so prepareOne can extractSourceAnchors instead of clobbering them to {}. Mock the
// drive/fetch module: the pre-fix code path calls fetchSheetAsMarkdownAtRevision
// (markdown-only), the post-fix path calls fetchSheetMarkdownAndBytesAtRevision.
vi.mock("@/lib/drive/fetch", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/drive/fetch")>();
  return {
    ...actual,
    fetchSheetAsMarkdownAtRevision: vi.fn(async () => "MARKDOWN-ONLY-NO-BYTES"),
    fetchSheetMarkdownAndBytesAtRevision: vi.fn(async () => ({
      markdown: "MARKDOWN-WITH-BYTES",
      bytes: new Uint8Array([1, 2, 3, 4]).buffer,
    })),
  };
});

import { fetchSheetMarkdownAndBytesAtRevision } from "@/lib/drive/fetch";
import {
  applyStaged,
  type ApplyStagedArgs,
  type ApplyStagedDeps,
  type PendingSyncForApply,
} from "@/lib/sync/applyStaged";
import { WizardSessionSupersededRollbackError } from "@/lib/sync/wizardSessionRollback";
import { WIZARD_SESSION_SUPERSEDED_DURING_SCAN } from "@/lib/sync/runOnboardingScan";

const WIZARD_SESSION_ID = "11111111-1111-4111-8111-111111111111";
const DRIVE_FILE_ID = "drive-file-1";
const PENDING_FOLDER_ID = "pending-folder";
const HEAD_REVISION_ID = "head-1";
const STOP = "__STOP_AFTER_CLOSURE__";

function pending(): PendingSyncForApply {
  return {
    driveFileId: DRIVE_FILE_ID,
    stagedId: "staged-wizard",
    sourceKind: "onboarding_scan",
    wizardSessionId: WIZARD_SESSION_ID,
    baseModifiedTime: null,
    // Must DIFFER from the reverified Drive modifiedTime below so the wizard
    // reverify returns revision_race → prepareWizardRestageInline runs.
    stagedModifiedTime: "2026-05-08T12:00:00.000Z",
    parseResult: null as unknown as PendingSyncForApply["parseResult"],
    triggeredReviewItems: [],
    reviewItemsCorrupt: false,
    parseResultCorrupt: false,
    priorLastSyncStatus: null,
    priorLastSyncError: null,
    warningSummary: "none",
  };
}

function driveMeta(): DriveListedFile & { trashed?: boolean } {
  return {
    driveFileId: DRIVE_FILE_ID,
    name: "Wizard Sheet",
    mimeType: "application/vnd.google-apps.spreadsheet",
    // DIFFERENT modifiedTime than pending.stagedModifiedTime → revision_race.
    modifiedTime: "2026-05-08T12:05:00.000Z",
    parents: [PENDING_FOLDER_ID],
    headRevisionId: HEAD_REVISION_ID,
    trashed: false,
  };
}

// Minimal locked tx that only answers the assertShowLockHeld pg_locks probe.
// holdPort() backs the under-lock restage phase (stageWizardRestageInline
// constructs a PostgresOnboardingScanTx from it) — unused when
// scanOnboardingPreparedFiles is mocked directly, but stageWizardRestageInline
// throws before that if holdPort() is missing/falsy.
function fakeLockedTx(): LockedShowTx<SyncPipelineTx> {
  const tx = {
    async queryOne<T>(sql: string) {
      if (/pg_locks/i.test(sql)) return { held: true } as T;
      throw new Error(`unexpected SQL in fakeLockedTx: ${sql}`);
    },
    holdPort() {
      return { unsafe: async () => [] };
    },
  };
  return tx as unknown as LockedShowTx<SyncPipelineTx>;
}

describe("wizard restage fetches xlsx bytes (audit idx14/#77)", () => {
  test("the restage fetchMarkdownWithBinding closure returns bytes so source_anchors is not clobbered", async () => {
    let captured: { binding: unknown; markdown: string; bytes?: ArrayBuffer } | undefined;

    const deps: ApplyStagedDeps = {
      // Fake pipeline lock: run the callback with a lock-held tx.
      withPipelineLock: (async (_id: string, fn: (tx: LockedShowTx<SyncPipelineTx>) => unknown) =>
        fn(fakeLockedTx())) as unknown as NonNullable<ApplyStagedDeps["withPipelineLock"]>,
      readWizardPendingSyncForApply: vi.fn(async () => pending()),
      readActiveWizardSession: vi.fn(async () => WIZARD_SESSION_ID),
      readPendingFolderId: vi.fn(async () => PENDING_FOLDER_ID),
      fetchDriveFileMetadata: vi.fn(async () => driveMeta()),
      // Capture + invoke the injected restage closure, then STOP before the
      // under-lock staging machinery (holdPort/scanOnboardingPreparedFiles).
      prepareOnboardingFiles: vi.fn(
        async (
          _folderId: string,
          opts: {
            fetchMarkdownWithBinding: (
              id: string,
            ) => Promise<{ binding: unknown; markdown: string; bytes?: ArrayBuffer }>;
          },
        ) => {
          captured = await opts.fetchMarkdownWithBinding(DRIVE_FILE_ID);
          throw new Error(STOP);
        },
      ) as unknown as NonNullable<ApplyStagedDeps["prepareOnboardingFiles"]>,
    };

    const args: ApplyStagedArgs = {
      driveFileId: DRIVE_FILE_ID,
      sourceScope: "wizard",
      wizardSessionId: WIZARD_SESSION_ID,
      stagedId: "staged-wizard",
      reviewerChoices: [],
      appliedByEmail: "doug@fxav.test",
    };

    await expect(applyStaged(args, deps)).rejects.toThrow(STOP);

    // Closure must carry bytes (the bug returned { binding, markdown } only).
    expect(captured?.bytes).toBeDefined();
    expect(captured?.bytes?.byteLength).toBeGreaterThan(0);
    // And it must have sourced them from the markdown+bytes sibling at the pinned revision.
    expect(fetchSheetMarkdownAndBytesAtRevision).toHaveBeenCalledWith(
      DRIVE_FILE_ID,
      HEAD_REVISION_ID,
    );
  });

  // Task 7 fix round 1: the in-scan supersession throw (applyStaged.ts ~1687,
  // stageWizardRestageInline) must populate context.driveFileName from
  // reverify.metadata.name — the Drive-reverified name captured BEFORE the
  // restage, not the (here-null) staged parseResult. Drives the REAL
  // applyStaged → applyWizardWithDriveReverify → prepareWizardRestageInline →
  // stageWizardRestageInline chain (not a mocked throw) so a regression to
  // that population expression fails this test.
  test("in-scan supersession during the restage rolls back with the reverified driveFileName", async () => {
    const scanOnboardingPreparedFiles = vi.fn(async () => ({
      outcome: "superseded" as const,
      code: WIZARD_SESSION_SUPERSEDED_DURING_SCAN,
      processed: [],
    }));

    const deps: ApplyStagedDeps = {
      withPipelineLock: (async (_id: string, fn: (tx: LockedShowTx<SyncPipelineTx>) => unknown) =>
        fn(fakeLockedTx())) as unknown as NonNullable<ApplyStagedDeps["withPipelineLock"]>,
      readWizardPendingSyncForApply: vi.fn(async () => pending()),
      readActiveWizardSession: vi.fn(async () => WIZARD_SESSION_ID),
      readPendingFolderId: vi.fn(async () => PENDING_FOLDER_ID),
      fetchDriveFileMetadata: vi.fn(async () => driveMeta()),
      // Let the pre-lock prepare phase complete normally (unlike the STOP test
      // above) so control reaches the under-lock stageWizardRestageInline.
      prepareOnboardingFiles: vi.fn(async () => []) as unknown as NonNullable<
        ApplyStagedDeps["prepareOnboardingFiles"]
      >,
      scanOnboardingPreparedFiles,
    };

    const args: ApplyStagedArgs = {
      driveFileId: DRIVE_FILE_ID,
      sourceScope: "wizard",
      wizardSessionId: WIZARD_SESSION_ID,
      stagedId: "staged-wizard",
      reviewerChoices: [],
      appliedByEmail: "doug@fxav.test",
    };

    const promise = applyStaged(args, deps);

    await expect(promise).rejects.toBeInstanceOf(WizardSessionSupersededRollbackError);
    await expect(promise).rejects.toMatchObject({
      context: { attemptedAction: "apply", driveFileName: driveMeta().name },
    });
    expect(scanOnboardingPreparedFiles).toHaveBeenCalled();
  });
});
