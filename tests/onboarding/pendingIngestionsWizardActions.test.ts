import { describe, expect, test, vi } from "vitest";
import type {
  WizardPendingIngestionRouteDeps,
  WizardPendingIngestionRouteTx,
} from "@/app/api/admin/onboarding/pending_ingestions/[id]/retry/route";
import { handleWizardPendingIngestionRetry } from "@/app/api/admin/onboarding/pending_ingestions/[id]/retry/route";
import { handleWizardPendingIngestionDeferUntilModified } from "@/app/api/admin/onboarding/pending_ingestions/[id]/defer_until_modified/route";
import { handleWizardPendingIngestionPermanentIgnore } from "@/app/api/admin/onboarding/pending_ingestions/[id]/permanent_ignore/route";

const W1 = "11111111-1111-4111-8111-111111111111";
const ID1 = "33333333-3333-4333-8333-333333333333";

class FakeWizardPendingTx {
  activeWizardSessionId: string | null = W1;
  pendingFolderId: string | null = "folder-1";
  manifestUpdateAffectsRow = true;
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
});
