import { describe, expect, test, vi } from "vitest";
import type {
  WizardStagedRouteDeps,
  WizardStagedRouteTx,
} from "@/app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/apply/route";
import type { WizardDiscardRouteDeps } from "@/app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/discard/route";
import { handleWizardStagedApply } from "@/app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/apply/route";
import { handleWizardStagedDiscard } from "@/app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/discard/route";
import { messageFor } from "@/lib/messages/lookup";
import {
  applyStaged,
  type ApplyStagedDeps,
  type PendingSyncForApply,
} from "@/lib/sync/applyStaged";

const W1 = "11111111-1111-4111-8111-111111111111";
const STAGED = "22222222-2222-4222-8222-222222222222";

function applyRequest(body: Record<string, unknown> = {}): Request {
  return new Request(`https://crew.fxav.test/api/admin/onboarding/staged/${W1}/file-1/apply`, {
    method: "POST",
    body: JSON.stringify({
      stagedId: STAGED,
      reviewerChoicesVersion: 1,
      reviewerChoices: [],
      ...body,
    }),
    headers: { "content-type": "application/json" },
  });
}

function discardRequest(body: Record<string, unknown> = {}): Request {
  return new Request(`https://crew.fxav.test/api/admin/onboarding/staged/${W1}/file-1/discard`, {
    method: "POST",
    body: JSON.stringify({
      stagedId: STAGED,
      kind: "try_again_next_sync",
      ...body,
    }),
    headers: { "content-type": "application/json" },
  });
}

class FakeWizardStagedTx {
  lockedDriveIds: string[] = [];
  async queryOne<T>(sql: string, params: unknown[]) {
    if (/pg_locks/i.test(sql)) return { held: true } as T;
    this.lockedDriveIds.push(params[0] as string);
    return { locked: true } as T;
  }
}

function deps(
  tx: FakeWizardStagedTx,
  overrides: Partial<WizardStagedRouteDeps> = {},
): WizardStagedRouteDeps & WizardDiscardRouteDeps {
  return {
    requireAdminIdentity: vi.fn(async () => ({ email: "doug@example.com" })),
    withRowTx: vi.fn(async (_driveFileId, fn) => fn(tx as unknown as WizardStagedRouteTx)),
    applyStaged: vi.fn(async () => ({
      outcome: "wizard_applied" as const,
      wizardSessionId: W1,
      stagedId: STAGED,
    })),
    discardStagedUnlocked: vi.fn(async () => ({ outcome: "discarded" as const, variant: "try_again" as const })),
    ...overrides,
  };
}

const context = {
  params: Promise.resolve({ wizardSessionId: W1, driveFileId: "file-1" }),
};

async function json(response: Response): Promise<unknown> {
  return await response.json();
}

describe("wizard-scoped staged apply/discard routes", () => {
  test("apply delegates to applyStaged with sourceScope wizard", async () => {
    const tx = new FakeWizardStagedTx();
    const routeDeps = deps(tx);

    const response = await handleWizardStagedApply(applyRequest(), context, routeDeps);

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({
      status: "reapplied",
      wizard_session_id: W1,
      drive_file_id: "file-1",
    });
    expect(routeDeps.applyStaged).toHaveBeenCalledWith(
      {
        sourceScope: "wizard",
        wizardSessionId: W1,
        driveFileId: "file-1",
        stagedId: STAGED,
        reviewerChoices: [],
        appliedByEmail: "doug@example.com",
      },
      expect.any(Object),
    );
  });

  test("apply preserves superseded parse errors from applyStaged", async () => {
    const response = await handleWizardStagedApply(
      applyRequest(),
      context,
      deps(new FakeWizardStagedTx(), {
        applyStaged: vi.fn(async () => ({
          outcome: "superseded" as const,
          code: "STAGED_PARSE_SUPERSEDED" as const,
        })),
      }),
    );

    expect(response.status).toBe(409);
    expect(await json(response)).toEqual({ ok: false, code: "STAGED_PARSE_SUPERSEDED" });
  });

  test("apply returns restaged_inline when Drive modtime drift is rescanned inline", async () => {
    const response = await handleWizardStagedApply(
      applyRequest(),
      context,
      deps(new FakeWizardStagedTx(), {
        applyStaged: vi.fn(async () => ({
          outcome: "restaged_inline" as const,
          code: "STAGED_PARSE_RESTAGED_INLINE" as const,
          wizardSessionId: W1,
          driveFileId: "file-1",
          stagedId: "33333333-3333-4333-8333-333333333333",
          stagedModifiedTime: "2026-05-18T12:01:00.000Z",
        })),
      }),
    );

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({
      status: "restaged_inline",
      wizard_session_id: W1,
      drive_file_id: "file-1",
      staged_id: "33333333-3333-4333-8333-333333333333",
      staged_modified_time: "2026-05-18T12:01:00.000Z",
      code: "STAGED_PARSE_RESTAGED_INLINE",
    });
  });

  test("apply rejects unsupported reviewer choice versions before locking", async () => {
    const routeDeps = deps(new FakeWizardStagedTx());
    const response = await handleWizardStagedApply(
      applyRequest({ reviewerChoicesVersion: 2 }),
      context,
      routeDeps,
    );

    expect(response.status).toBe(409);
    expect(await json(response)).toEqual({
      ok: false,
      code: "WIZARD_REVIEWER_CHOICES_VERSION_UNSUPPORTED",
    });
    expect(routeDeps.withRowTx).not.toHaveBeenCalled();
  });

  test("discard delegates to discardStaged_unlocked with wizard scope and mapped variant", async () => {
    const tx = new FakeWizardStagedTx();
    const routeDeps = deps(tx);

    const response = await handleWizardStagedDiscard(
      discardRequest({ kind: "defer_until_modified" }),
      context,
      routeDeps,
    );

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({
      status: "discarded",
      wizard_session_id: W1,
      drive_file_id: "file-1",
      variant: "defer_until_modified",
    });
    expect(routeDeps.discardStagedUnlocked).toHaveBeenCalledWith(
      tx,
      {
        sourceScope: "wizard",
        wizardSessionId: W1,
        driveFileId: "file-1",
        stagedId: STAGED,
        variant: "defer_until_modified",
      },
      expect.any(Object),
    );
  });

  test("modtime mismatch inline rescan upserts pending_syncs for the same wizard session", async () => {
    const oldPending = pendingSync({
      stagedId: STAGED,
      stagedModifiedTime: "2026-05-18T12:00:00.000Z",
    });
    const freshPending = pendingSync({
      stagedId: "33333333-3333-4333-8333-333333333333",
      stagedModifiedTime: "2026-05-18T12:01:00.000Z",
    });
    let currentPending: PendingSyncForApply | null = oldPending;
    const upsertedRows: Array<{
      stagedId: string;
      stagedModifiedTime: string;
      wizardSessionId: string | null;
      sourceKind: string;
    }> = [];
    const depsForApply = applyDeps({
      readWizardPendingSyncForApply: vi.fn(async () => currentPending),
      runOnboardingScan: vi.fn(async () => {
        currentPending = freshPending;
        upsertedRows.push({
          stagedId: freshPending.stagedId,
          stagedModifiedTime: freshPending.stagedModifiedTime,
          wizardSessionId: freshPending.wizardSessionId,
          sourceKind: freshPending.sourceKind,
        });
        return {
          outcome: "completed" as const,
          processed: [{ driveFileId: "file-1", outcome: "staged" as const }],
        };
      }),
    });

    const result = await applyStaged(wizardApplyArgs(), depsForApply);

    expect(result).toEqual({
      outcome: "restaged_inline",
      code: "STAGED_PARSE_RESTAGED_INLINE",
      wizardSessionId: W1,
      driveFileId: "file-1",
      stagedId: freshPending.stagedId,
      stagedModifiedTime: freshPending.stagedModifiedTime,
    });
    expect(upsertedRows).toEqual([
      {
        stagedId: freshPending.stagedId,
        stagedModifiedTime: "2026-05-18T12:01:00.000Z",
        wizardSessionId: W1,
        sourceKind: "onboarding_scan",
      },
    ]);
  });

  test("inner inline rescan gone result returns STAGED_PARSE_SOURCE_GONE", async () => {
    let currentPending: PendingSyncForApply | null = pendingSync();
    const depsForApply = applyDeps({
      readWizardPendingSyncForApply: vi.fn(async () => currentPending),
      runOnboardingScan: vi.fn(async () => {
        currentPending = null;
        return {
          outcome: "completed" as const,
          processed: [{ driveFileId: "file-1", outcome: "hard_failed" as const }],
        };
      }),
    });

    const result = await applyStaged(wizardApplyArgs(), depsForApply);

    expect(result).toEqual({ outcome: "source_gone", code: "STAGED_PARSE_SOURCE_GONE" });
  });

  test("inner inline rescan re-race returns bounded STAGED_PARSE_REVISION_RACE", async () => {
    let currentPending = pendingSync();
    const depsForApply = applyDeps({
      readWizardPendingSyncForApply: vi.fn(async () => currentPending),
      runOnboardingScan: vi.fn(async () => {
        currentPending = pendingSync({
          stagedId: "33333333-3333-4333-8333-333333333333",
          stagedModifiedTime: "2026-05-18T12:02:00.000Z",
        });
        return {
          outcome: "completed" as const,
          processed: [{ driveFileId: "file-1", outcome: "staged" as const }],
        };
      }),
    });

    const result = await applyStaged(wizardApplyArgs(), depsForApply);

    expect(result).toEqual({
      outcome: "revision_race",
      code: "STAGED_PARSE_REVISION_RACE",
    });
  });

  test("STAGED_PARSE_RESTAGED_INLINE has Doug-facing copy and helpful context", () => {
    expect(messageFor("STAGED_PARSE_RESTAGED_INLINE")).toMatchObject({
      dougFacing: expect.any(String),
      helpfulContext: expect.any(String),
    });
  });
});

function pendingSync(overrides: Partial<PendingSyncForApply> = {}): PendingSyncForApply {
  return {
    driveFileId: "file-1",
    stagedId: STAGED,
    sourceKind: "onboarding_scan",
    wizardSessionId: W1,
    baseModifiedTime: null,
    stagedModifiedTime: "2026-05-18T12:00:00.000Z",
    parseResult: ({
      show: { title: "Demo Show" },
      crewMembers: [],
      rooms: [],
      warnings: [],
    } as unknown) as PendingSyncForApply["parseResult"],
    triggeredReviewItems: [],
    priorLastSyncStatus: null,
    priorLastSyncError: null,
    warningSummary: "",
    ...overrides,
  };
}

function wizardApplyArgs(): Parameters<typeof applyStaged>[0] {
  return {
    sourceScope: "wizard",
    wizardSessionId: W1,
    driveFileId: "file-1",
    stagedId: STAGED,
    reviewerChoices: [],
    appliedByEmail: "doug@example.com",
  };
}

function applyDeps(overrides: Partial<ApplyStagedDeps> = {}): ApplyStagedDeps {
  const base: ApplyStagedDeps = {
    withPipelineLock: vi.fn(async (_driveFileId, fn) =>
      fn(new FakeWizardStagedTx() as never),
    ) as NonNullable<ApplyStagedDeps["withPipelineLock"]>,
    readWizardPendingSyncForApply: vi.fn(async () => pendingSync()),
    readActiveWizardSession: vi.fn(async () => W1),
    readPendingFolderId: vi.fn(async () => "folder-1"),
    fetchDriveFileMetadata: vi.fn(async () => ({
      driveFileId: "file-1",
      name: "Demo Show",
      mimeType: "application/vnd.google-apps.spreadsheet",
      modifiedTime: "2026-05-18T12:01:00.000Z",
      parents: ["folder-1"],
      headRevisionId: "rev-new",
    })),
  };
  return Object.assign(base, overrides);
}
