import { describe, expect, test, vi } from "vitest";
import type {
  WizardPendingIngestionRouteDeps,
  WizardPendingIngestionRouteTx,
} from "@/app/api/admin/onboarding/pending_ingestions/[id]/retry/route";
import {
  handleWizardPendingIngestionAction,
  handleWizardPendingIngestionRetry,
} from "@/app/api/admin/onboarding/pending_ingestions/[id]/retry/route";
import { WizardSessionSupersededRollbackError } from "@/lib/sync/wizardSessionRollback";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { handleWizardPendingIngestionDeferUntilModified } from "@/app/api/admin/onboarding/pending_ingestions/[id]/defer_until_modified/route";
import { handleWizardPendingIngestionPermanentIgnore } from "@/app/api/admin/onboarding/pending_ingestions/[id]/permanent_ignore/route";

const W1 = "11111111-1111-4111-8111-111111111111";
const ID1 = "33333333-3333-4333-8333-333333333333";

class FakeWizardPendingTx {
  activeWizardSessionId: string | null = W1;
  pendingFolderId: string | null = "folder-1";
  manifestUpdateAffectsRow = true;
  deferralUpsertAffectsRow = true;
  deleteAffectsRow = true;
  row = {
    id: ID1,
    drive_file_id: "file-1",
    wizard_session_id: W1,
    discovered_during_folder_id: "folder-1",
    last_seen_modified_time: "2026-05-08T12:00:00.000Z",
  } as {
    id: string;
    drive_file_id: string;
    wizard_session_id: string | null;
    discovered_during_folder_id: string | null;
    last_seen_modified_time: string | null;
  } | null;
  deferrals: Array<{ kind: string; driveFileId: string }> = [];
  manifestUpdates: Array<{ status: string; wizardSessionId: string; driveFileId: string }> = [];
  manifestUpdateAttempts: Array<{ status: string; wizardSessionId: string; driveFileId: string }> = [];
  deleted = false;

  async queryOne<T>(sql: string, params: unknown[]) {
    const normalized = sql.replace(/\s+/g, " ").trim();
    if (/pg_locks/i.test(normalized)) return { held: true } as T;
    if (normalized.startsWith("select drive_file_id")) return this.row as T;
    if (normalized.startsWith("select pending_wizard_session_id")) {
      return {
        pending_wizard_session_id: this.activeWizardSessionId,
        pending_folder_id: this.pendingFolderId,
      } as T;
    }
    if (normalized.startsWith("insert into public.deferred_ingestions")) {
      if (!this.deferralUpsertAffectsRow) return null as T;
      this.deferrals.push({ kind: params[1] as string, driveFileId: params[0] as string });
      return { upserted: true } as T;
    }
    if (normalized.startsWith("update public.onboarding_scan_manifest")) {
      const entry = {
        status: params[0] as string,
        wizardSessionId: params[1] as string,
        driveFileId: params[2] as string,
      };
      this.manifestUpdateAttempts.push(entry);
      if (!this.manifestUpdateAffectsRow) return null as T;
      this.manifestUpdates.push(entry);
      return { updated: true } as T;
    }
    if (normalized.startsWith("delete from public.pending_ingestions")) {
      if (!this.deleteAffectsRow) return null as T;
      this.deleted = true;
      return { deleted: true } as T;
    }
    throw new Error(`Unhandled wizard pending SQL: ${normalized}`);
  }
}

function deps(
  tx: FakeWizardPendingTx,
  overrides: Partial<WizardPendingIngestionRouteDeps> = {},
): WizardPendingIngestionRouteDeps {
  return {
    requireAdminIdentity: vi.fn(async () => ({ email: "doug@example.com" })),
    withRowTx: vi.fn(async (_driveFileId, fn) => fn(tx as unknown as WizardPendingIngestionRouteTx)),
    readDriveFileIdForPendingIngestion: vi.fn(async () => tx.row?.drive_file_id ?? null),
    retrySingleFileUnlocked: vi.fn(async () => ({ outcome: "retried" as const, status: "staged" as const })),
    // Task 5.3: keep the unit suite hermetic — never let the default Supabase
    // alert writer or the best-effort current-session DB read run in here.
    upsertAdminAlert: vi.fn(async () => "alert-id"),
    readCurrentWizardSessionId: vi.fn(async () => tx.activeWizardSessionId),
    ...overrides,
  };
}

const context = { params: Promise.resolve({ id: ID1 }) };

function req(path: string): Request {
  return new Request(`https://crew.fxav.test${path}`, { method: "POST" });
}

async function json(response: Response): Promise<unknown> {
  return await response.json();
}

describe("wizard pending_ingestions actions", () => {
  test("retry locks by drive_file_id and delegates to retrySingleFile_unlocked", async () => {
    const tx = new FakeWizardPendingTx();
    const routeDeps = deps(tx);

    const response = await handleWizardPendingIngestionRetry(req("/retry"), context, routeDeps);

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ status: "staged" });
    expect(routeDeps.withRowTx).toHaveBeenCalledWith("file-1", expect.any(Function));
    expect(routeDeps.retrySingleFileUnlocked).toHaveBeenCalledWith(tx, "file-1", W1, expect.any(Object));
  });

  test("retry rejects stale wizard session after the row lock", async () => {
    const tx = new FakeWizardPendingTx();
    tx.activeWizardSessionId = "22222222-2222-4222-8222-222222222222";

    const response = await handleWizardPendingIngestionRetry(req("/retry"), context, deps(tx));

    expect(response.status).toBe(409);
    expect(await json(response)).toEqual({ ok: false, code: "WIZARD_SESSION_SUPERSEDED" });
  });

  test("actions assert the locked drive id still owns the selected row", async () => {
    const tx = new FakeWizardPendingTx();
    const routeDeps = deps(tx, {
      readDriveFileIdForPendingIngestion: vi.fn(async () => "file-locked"),
    });

    const response = await handleWizardPendingIngestionDeferUntilModified(req("/defer"), context, routeDeps);

    expect(response.status).toBe(500);
    expect(await json(response)).toEqual({ ok: false, code: "LOCK_OWNERSHIP_ASSERTION_FAILED" });
    expect(tx.deferrals).toEqual([]);
    expect(tx.deleted).toBe(false);
    expect(tx.manifestUpdates).toEqual([]);
  });

  test("defer_until_modified writes a wizard deferral and deletes the pending ingestion", async () => {
    const tx = new FakeWizardPendingTx();

    const response = await handleWizardPendingIngestionDeferUntilModified(req("/defer"), context, deps(tx));

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ status: "deferred" });
    expect(tx.deferrals).toEqual([{ driveFileId: "file-1", kind: "defer_until_modified" }]);
    expect(tx.deleted).toBe(true);
  });

  test("permanent_ignore writes a wizard deferral and deletes the pending ingestion", async () => {
    const tx = new FakeWizardPendingTx();

    const response = await handleWizardPendingIngestionPermanentIgnore(req("/ignore"), context, deps(tx));

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ status: "ignored" });
    expect(tx.deferrals).toEqual([{ driveFileId: "file-1", kind: "permanent_ignore" }]);
    expect(tx.deleted).toBe(true);
  });

  // I.2 R20 F1 (HIGH, 2026-05-23): finalize's unresolved-manifest predicate
  // counts rows with status IN ('staged','hard_failed','discard_retryable',
  // 'live_row_conflict'). Before this fix, defer_until_modified and
  // permanent_ignore wrote `deferred_ingestions` + deleted `pending_ingestions`
  // but never transitioned `onboarding_scan_manifest.status` from
  // 'hard_failed' to the resolved status. The operator saw a 200 OK and
  // then finalize blocked with ONBOARDING_NOT_RESOLVED. Both branches must
  // transition the manifest atomically in the same locked transaction.
  test("defer_until_modified transitions the manifest row to defer_until_modified", async () => {
    const tx = new FakeWizardPendingTx();

    const response = await handleWizardPendingIngestionDeferUntilModified(req("/defer"), context, deps(tx));

    expect(response.status).toBe(200);
    expect(tx.manifestUpdates).toEqual([
      { status: "defer_until_modified", wizardSessionId: W1, driveFileId: "file-1" },
    ]);
  });

  test("permanent_ignore transitions the manifest row to permanent_ignore", async () => {
    const tx = new FakeWizardPendingTx();

    const response = await handleWizardPendingIngestionPermanentIgnore(req("/ignore"), context, deps(tx));

    expect(response.status).toBe(200);
    expect(tx.manifestUpdates).toEqual([
      { status: "permanent_ignore", wizardSessionId: W1, driveFileId: "file-1" },
    ]);
  });

  // M12 adversarial review R41-R9/R11/R16 (HIGH, 2026-05-23): manifest UPDATE
  // returning 0 rows (e.g., wizard superseded after requireCurrentWizardRow,
  // manifest row missing, or app_settings drift inside the locked tx) must
  // abort with WIZARD_SESSION_SUPERSEDED and MUST NOT delete the
  // pending_ingestions row. Mirrors lib/sync/discardStaged.ts CAS pattern.
  test("defer_until_modified aborts with 409 when manifest CAS UPDATE affects 0 rows", async () => {
    const tx = new FakeWizardPendingTx();
    tx.manifestUpdateAffectsRow = false;

    const response = await handleWizardPendingIngestionDeferUntilModified(req("/defer"), context, deps(tx));

    expect(response.status).toBe(409);
    expect(await json(response)).toEqual({ ok: false, code: "WIZARD_SESSION_SUPERSEDED" });
    expect(tx.manifestUpdateAttempts).toEqual([
      { status: "defer_until_modified", wizardSessionId: W1, driveFileId: "file-1" },
    ]);
    expect(tx.manifestUpdates).toEqual([]);
    expect(tx.deleted).toBe(false);
  });

  test("permanent_ignore aborts with 409 when manifest CAS UPDATE affects 0 rows", async () => {
    const tx = new FakeWizardPendingTx();
    tx.manifestUpdateAffectsRow = false;

    const response = await handleWizardPendingIngestionPermanentIgnore(req("/ignore"), context, deps(tx));

    expect(response.status).toBe(409);
    expect(await json(response)).toEqual({ ok: false, code: "WIZARD_SESSION_SUPERSEDED" });
    expect(tx.manifestUpdateAttempts).toEqual([
      { status: "permanent_ignore", wizardSessionId: W1, driveFileId: "file-1" },
    ]);
    expect(tx.manifestUpdates).toEqual([]);
    expect(tx.deleted).toBe(false);
  });

  // F5 Task 5.1 (spec §7 R9-1): refusals AFTER a mutating statement must THROW
  // a typed error that crosses the transaction boundary (→ real rollback), never
  // return a Response from inside the tx callback — withPostgresSyncPipelineLock
  // COMMITS on normal return (runScheduledCronSync.ts sql.begin), so a returned
  // 409 would silently commit the already-executed manifest UPDATE.
  function recordingWithRowTx(
    tx: FakeWizardPendingTx,
    log: { settled: "resolved" | "rejected" | null },
  ) {
    return async <R>(
      _driveFileId: string,
      fn: (t: WizardPendingIngestionRouteTx) => Promise<R> | R,
    ): Promise<R> => {
      try {
        const result = await fn(tx as unknown as WizardPendingIngestionRouteTx);
        log.settled = "resolved"; // a real tx COMMITS here
        return result;
      } catch (error) {
        log.settled = "rejected"; // a real tx ROLLS BACK here
        throw error;
      }
    };
  }

  test("deferral-upsert predicate miss after a successful manifest UPDATE rejects the tx callback (rollback), then maps to 409", async () => {
    const log = { settled: null as "resolved" | "rejected" | null };
    const tx = new FakeWizardPendingTx();
    tx.deferralUpsertAffectsRow = false;
    const response = await handleWizardPendingIngestionAction(
      context,
      { ...deps(tx), withRowTx: recordingWithRowTx(tx, log) },
      "defer_until_modified",
    );
    expect(response.status).toBe(409);
    expect(await json(response)).toMatchObject({ ok: false, code: "WIZARD_SESSION_SUPERSEDED" });
    // THE assertion that kills the R9-1 shape: the callback must REJECT (typed
    // error crossing the tx boundary → abort), never resolve a Response from
    // inside the transaction.
    expect(log.settled).toBe("rejected");
    expect(tx.deleted).toBe(false);
  });

  test("pending-ingestion delete predicate miss also rejects the tx callback and maps to 409", async () => {
    const log = { settled: null as "resolved" | "rejected" | null };
    const tx = new FakeWizardPendingTx();
    tx.deleteAffectsRow = false;
    const response = await handleWizardPendingIngestionAction(
      context,
      { ...deps(tx), withRowTx: recordingWithRowTx(tx, log) },
      "permanent_ignore",
    );
    expect(response.status).toBe(409);
    expect(await json(response)).toMatchObject({ ok: false, code: "WIZARD_SESSION_SUPERSEDED" });
    expect(log.settled).toBe("rejected");
  });

  test("manifest CAS miss STILL maps to 409 — but now via the typed rollback error, not a returned Response", async () => {
    const log = { settled: null as "resolved" | "rejected" | null };
    const tx = new FakeWizardPendingTx();
    tx.manifestUpdateAffectsRow = false;
    const response = await handleWizardPendingIngestionAction(
      context,
      { ...deps(tx), withRowTx: recordingWithRowTx(tx, log) },
      "defer_until_modified",
    );
    expect(response.status).toBe(409);
    expect(await json(response)).toMatchObject({ ok: false, code: "WIZARD_SESSION_SUPERSEDED" });
    expect(log.settled).toBe("rejected");
    expect(tx.deferrals).toEqual([]);
    expect(tx.deleted).toBe(false);
  });

  // F5 Task 5.3: the race must leave a DURABLE operator signal — written only
  // AFTER the protected transaction aborted (an in-tx write would vanish with
  // the rollback it reports), and best-effort (a failed alert write must not
  // mask the typed 409 refusal).
  test("the 0-row supersession path writes WIZARD_SESSION_SUPERSEDED_RACE only AFTER the tx rejected, with the race context", async () => {
    const order: string[] = [];
    const upsertAlert = vi.fn(async () => {
      order.push("alert");
      return "alert-id";
    });
    const log = { settled: null as "resolved" | "rejected" | null };
    const tx = new FakeWizardPendingTx();
    tx.deferralUpsertAffectsRow = false;
    const wrappedWithRowTx = async <R>(
      _driveFileId: string,
      fn: (t: WizardPendingIngestionRouteTx) => Promise<R> | R,
    ): Promise<R> => {
      try {
        const r = await fn(tx as unknown as WizardPendingIngestionRouteTx);
        log.settled = "resolved";
        return r;
      } catch (e) {
        log.settled = "rejected";
        order.push("aborted");
        throw e;
      }
    };
    const response = await handleWizardPendingIngestionAction(
      context,
      { ...deps(tx), withRowTx: wrappedWithRowTx, upsertAdminAlert: upsertAlert },
      "defer_until_modified",
    );
    expect(response.status).toBe(409);
    expect(order).toEqual(["aborted", "alert"]); // persistence boundary: alert strictly post-abort
    expect(upsertAlert).toHaveBeenCalledWith({
      showId: null,
      code: "WIZARD_SESSION_SUPERSEDED_RACE",
      context: expect.objectContaining({
        attempted_action: "defer_until_modified",
        superseded_session_id: W1,
        pending_ingestion_id: ID1,
        drive_file_id: "file-1",
      }),
    });
  });

  test("alert-writer failure does not mask the 409 (alert is best-effort, the refusal is the contract)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const tx = new FakeWizardPendingTx();
    tx.manifestUpdateAffectsRow = false;
    const response = await handleWizardPendingIngestionAction(
      context,
      {
        ...deps(tx),
        upsertAdminAlert: vi.fn(async () => {
          throw new Error("alert infra down");
        }),
      },
      "permanent_ignore",
    );
    expect(response.status).toBe(409); // typed refusal survives; the writer error is logged, not thrown
    expect(await json(response)).toMatchObject({ ok: false, code: "WIZARD_SESSION_SUPERSEDED" });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  // R33-1/R40-2 copy honesty: retry's commit-window residue is ACCEPTED + swept
  // (spec §7 R5-2, §8), so absolute-rollback claims would be FALSE for retry.
  // Scan EVERY Doug-reaching field of the catalog entry.
  test("WIZARD_SESSION_SUPERSEDED_RACE copy never claims absolute rollback (no 'rolled back in full' / 'Nothing was lost' / 'Nothing was changed')", () => {
    const entry = (MESSAGE_CATALOG as Record<string, Record<string, string | null> | undefined>)[
      "WIZARD_SESSION_SUPERSEDED_RACE"
    ];
    expect(entry, "WIZARD_SESSION_SUPERSEDED_RACE missing from MESSAGE_CATALOG").toBeDefined();
    const dougReachingFields = [
      "dougFacing",
      "helpfulContext",
      "title",
      "longExplanation",
      "followUp",
    ] as const;
    for (const field of dougReachingFields) {
      const copy = (entry?.[field] ?? "") as string;
      for (const forbidden of ["rolled back in full", "Nothing was lost", "Nothing was changed"]) {
        expect(
          copy.toLowerCase().includes(forbidden.toLowerCase()),
          `${field} contains the forbidden absolute-rollback claim "${forbidden}" — retry residue is accepted+swept, not rolled back`,
        ).toBe(false);
      }
    }
    // And the entry actually renders to Doug (non-null dougFacing — the
    // _metaAdminAlertCatalog contract; an empty shell alert is the bug class).
    expect(entry?.dougFacing ?? null).not.toBeNull();
  });

  test("the typed error carries the race context for the Task-5.3 alert payload", () => {
    const error = new WizardSessionSupersededRollbackError({
      attemptedAction: "defer_until_modified",
      supersededSessionId: "w1",
      pendingIngestionId: "pi-1",
      driveFileId: "drive-1",
    });
    expect(error.code).toBe("WIZARD_SESSION_SUPERSEDED");
    expect(error.context.attemptedAction).toBe("defer_until_modified");
    expect(error.context.driveFileId).toBe("drive-1");
  });
});
