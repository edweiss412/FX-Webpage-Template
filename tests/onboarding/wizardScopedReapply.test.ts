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
import { WizardSessionSupersededRollbackError } from "@/lib/sync/wizardSessionRollback";

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
  // The wizard restage builds a PostgresOnboardingScanTx over holdPort() to stage
  // wizard-scoped on the locked connection. These tests mock the scan, so the
  // returned executor is never actually queried — a stub satisfies the wiring.
  holdPort() {
    return { unsafe: async (): Promise<unknown[]> => [] };
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
    discardStagedUnlocked: vi.fn(async () => ({
      outcome: "discarded" as const,
      variant: "try_again" as const,
    })),
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
  test("never returns an empty 500 — an unexpected throw in applyStaged becomes a typed JSON error (Codex R5)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const tx = new FakeWizardStagedTx();
    const response = await handleWizardStagedApply(applyRequest(), context, {
      ...deps(tx),
      applyStaged: vi.fn(async () => {
        throw new Error("kaboom: corrupt parse_result deref");
      }),
    });
    expect(response.status).toBe(500);
    expect(await json(response)).toEqual({ ok: false, code: "SYNC_INFRA_ERROR" });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  // BL-APPLYSTAGED-SUPERSESSION-ROLLBACK: applyStaged now THROWS
  // WizardSessionSupersededRollbackError on an in-apply supersession that would
  // otherwise commit partial wizard writes (applyStaged.ts 1084/1105/1554). The
  // wizard apply route must map that throw to 409 + a WIZARD_SESSION_SUPERSEDED_RACE
  // alert — NOT the body-less 500 the backstop above would otherwise produce.
  test("apply maps a thrown WizardSessionSupersededRollbackError to 409 + race alert (attempted_action apply)", async () => {
    const tx = new FakeWizardStagedTx();
    const alerts: Array<{ code: string; context: Record<string, unknown> }> = [];
    const response = await handleWizardStagedApply(applyRequest(), context, {
      ...deps(tx),
      applyStaged: vi.fn(async () => {
        throw new WizardSessionSupersededRollbackError({
          attemptedAction: "apply",
          supersededSessionId: W1,
          driveFileId: "file-1",
        });
      }),
      readCurrentWizardSessionId: vi.fn(async () => "99999999-9999-4999-8999-999999999999"),
      upsertAdminAlert: vi.fn(async (input) => {
        alerts.push({ code: input.code, context: input.context as Record<string, unknown> });
        return "alert-id";
      }),
    });

    expect(response.status).toBe(409);
    expect(await json(response)).toEqual({ ok: false, code: "WIZARD_SESSION_SUPERSEDED" });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      code: "WIZARD_SESSION_SUPERSEDED_RACE",
      context: { attempted_action: "apply", drive_file_id: "file-1" },
    });
  });

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

  // F5 Task 5.5 (R6 HIGH): discardStaged_unlocked now THROWS the typed
  // rollback error where it used to return a result object. A route that
  // doesn't catch it turns every lost race into an uncataloged 500 (raw error
  // text — invariant 5 violation) instead of the existing cataloged 409.
  test("handleWizardStagedDiscard maps the typed rollback to 409 WIZARD_SESSION_SUPERSEDED after the tx aborts — never an uncataloged 500", async () => {
    const log = { settled: null as "resolved" | "rejected" | null };
    const tx = new FakeWizardStagedTx();
    const recordingWithRowTx = async <R>(
      _driveFileId: string,
      fn: (t: WizardStagedRouteTx) => Promise<R> | R,
    ): Promise<R> => {
      try {
        const r = await fn(tx as unknown as WizardStagedRouteTx);
        log.settled = "resolved";
        return r;
      } catch (e) {
        log.settled = "rejected";
        throw e;
      }
    };
    const upsertAlert = vi.fn(async () => "alert-id");
    const response = await handleWizardStagedDiscard(
      discardRequest({ kind: "permanent_ignore" }),
      context,
      {
        ...deps(tx),
        withRowTx: recordingWithRowTx,
        upsertAdminAlert: upsertAlert,
        readCurrentWizardSessionId: vi.fn(async () => W1),
        discardStagedUnlocked: async () => {
          throw new WizardSessionSupersededRollbackError({
            attemptedAction: "discard",
            supersededSessionId: W1,
            driveFileId: "file-1",
          });
        },
      },
    );
    expect(log.settled).toBe("rejected"); // the error crossed the tx boundary → real abort
    expect(response.status).toBe(409);
    expect(await json(response)).toMatchObject({ ok: false, code: "WIZARD_SESSION_SUPERSEDED" });
    // R51-1: the alert contract is route-consistent — the discard route fires
    // the SAME post-rollback producer with attempted_action "discard".
    expect(upsertAlert).toHaveBeenCalledWith({
      showId: null,
      code: "WIZARD_SESSION_SUPERSEDED_RACE",
      context: expect.objectContaining({
        attempted_action: "discard",
        superseded_session_id: W1,
        drive_file_id: "file-1",
      }),
    });
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
      prepareOnboardingFiles: vi.fn(async () => []),
      scanOnboardingPreparedFiles: vi.fn(async () => {
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
      prepareOnboardingFiles: vi.fn(async () => []),
      scanOnboardingPreparedFiles: vi.fn(async () => {
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
      prepareOnboardingFiles: vi.fn(async () => []),
      scanOnboardingPreparedFiles: vi.fn(async () => {
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

/**
 * Onboarding apply revision-race regression (M12 Phase 0.F smoke 3 — 4th
 * onboarding defect). Drives the REAL applyStaged wizard path through the REAL
 * revision guard (verifyWizardApplyDriveScope), NOT a mocked reverify result.
 *
 * Crucially, `readWizardPendingSyncForApply` returns a `stagedModifiedTime`
 * that is a JS `Date` — the value postgres.js actually yields for the
 * `timestamptz` column. Every other test in this file passes a STRING, which is
 * exactly why this bug slipped through: the harness masked the Date coercion.
 * `fetchDriveFileMetadata` returns the live Drive `modifiedTime` as an ISO
 * string (with milliseconds), as the real Drive client does.
 */
describe("onboarding apply revision-race — real guard, postgres.js Date staged time", () => {
  const INSTANT = "2026-05-09T03:44:06.040Z"; // sub-second ms — the bug's trigger
  const FOLDER = "folder-1";

  function publishDeps(overrides: Partial<ApplyStagedDeps> = {}): ApplyStagedDeps & {
    approveWizardPendingSync: ReturnType<typeof vi.fn>;
    markWizardManifestApplied: ReturnType<typeof vi.fn>;
    prepareOnboardingFiles: ReturnType<typeof vi.fn>;
    scanOnboardingPreparedFiles: ReturnType<typeof vi.fn>;
  } {
    const approveWizardPendingSync = vi.fn(async () => true);
    const markWizardManifestApplied = vi.fn(async () => true);
    // Only reached if the guard FALSE-fires (revision_race -> inline restage).
    const prepareOnboardingFiles = vi.fn(async () => []);
    const scanOnboardingPreparedFiles = vi.fn(async () => ({
      outcome: "completed" as const,
      processed: [{ driveFileId: "file-1", outcome: "staged" as const }],
    }));
    const base = applyDeps({
      // postgres.js returns a Date for staged_modified_time — reproduce that.
      readWizardPendingSyncForApply: vi.fn(async () =>
        pendingSync({ stagedModifiedTime: new Date(INSTANT) as unknown as string }),
      ),
      readPendingFolderId: vi.fn(async () => FOLDER),
      approveWizardPendingSync,
      markWizardManifestApplied,
      prepareOnboardingFiles,
      scanOnboardingPreparedFiles,
      ...overrides,
    });
    return Object.assign(base, {
      approveWizardPendingSync,
      markWizardManifestApplied,
      prepareOnboardingFiles,
      scanOnboardingPreparedFiles,
    });
  }

  function driveMetaAt(modifiedTime: string) {
    return vi.fn(async () => ({
      driveFileId: "file-1",
      name: "Demo Show",
      mimeType: "application/vnd.google-apps.spreadsheet",
      modifiedTime,
      parents: [FOLDER],
      // Native Google Sheets carry NO headRevisionId (confirmed live) — the
      // guard must rely on modifiedTime, so it must be precision-exact.
    }));
  }

  // FALSE POSITIVE (the bug): unedited sheet — Drive modifiedTime equals the
  // staged instant to the millisecond. Must NOT be a revision_race; the apply
  // must proceed to publish. Failure mode: deterministic 409 blocking finalize.
  test("an unedited sheet (same instant, Date staged) applies and publishes — no false race", async () => {
    const deps = publishDeps({ fetchDriveFileMetadata: driveMetaAt(INSTANT) });

    const result = await applyStaged(wizardApplyArgs(), deps);

    expect(result).toEqual({
      outcome: "wizard_applied",
      wizardSessionId: W1,
      stagedId: STAGED,
    });
    // Apply actually reached the publish step (not just "didn't 409").
    expect(deps.approveWizardPendingSync).toHaveBeenCalledTimes(1);
    expect(deps.markWizardManifestApplied).toHaveBeenCalledTimes(1);
    // The guard did NOT false-fire, so no inline rescan happened (neither the
    // pre-lock prepare nor the under-lock staging ran).
    expect(deps.prepareOnboardingFiles).not.toHaveBeenCalled();
    expect(deps.scanOnboardingPreparedFiles).not.toHaveBeenCalled();
  });

  // TRUE POSITIVE (guard preserved): a real edit bumps modifiedTime past the
  // staged instant. The guard must fire -> inline restage for re-review, and
  // must NOT blindly publish the stale staged revision.
  test("a genuinely edited sheet (later modifiedTime) fires the guard and re-stages, does not publish", async () => {
    const NEW_INSTANT = "2026-05-09T03:45:00.000Z";
    // Stateful pending: the preflight read sees the OLD (Date) staged time; the
    // inline rescan re-stages at the NEW Drive instant, so the inner reverify
    // matches and the result is restaged_inline (re-review), not a bounded race.
    let currentPending: PendingSyncForApply = pendingSync({
      stagedModifiedTime: new Date(INSTANT) as unknown as string,
    });
    const freshStagedId = "33333333-3333-4333-8333-333333333333";
    const approveWizardPendingSync = vi.fn(async () => true);
    const prepareOnboardingFiles = vi.fn(async () => []);
    const scanOnboardingPreparedFiles = vi.fn(async () => {
      currentPending = pendingSync({
        stagedId: freshStagedId,
        stagedModifiedTime: NEW_INSTANT,
      });
      return {
        outcome: "completed" as const,
        processed: [{ driveFileId: "file-1", outcome: "staged" as const }],
      };
    });
    const deps = applyDeps({
      readWizardPendingSyncForApply: vi.fn(async () => currentPending),
      readPendingFolderId: vi.fn(async () => FOLDER),
      fetchDriveFileMetadata: driveMetaAt(NEW_INSTANT),
      approveWizardPendingSync,
      prepareOnboardingFiles,
      scanOnboardingPreparedFiles,
    });

    const result = await applyStaged(wizardApplyArgs(), deps);

    expect(result).toMatchObject({
      outcome: "restaged_inline",
      code: "STAGED_PARSE_RESTAGED_INLINE",
      stagedId: freshStagedId,
    });
    expect(prepareOnboardingFiles).toHaveBeenCalledTimes(1);
    expect(scanOnboardingPreparedFiles).toHaveBeenCalledTimes(1);
    expect(approveWizardPendingSync).not.toHaveBeenCalled();
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
    parseResult: {
      show: { title: "Demo Show" },
      crewMembers: [],
      rooms: [],
      warnings: [],
    } as unknown as PendingSyncForApply["parseResult"],
    triggeredReviewItems: [],
    reviewItemsCorrupt: false,
    parseResultCorrupt: false,
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
