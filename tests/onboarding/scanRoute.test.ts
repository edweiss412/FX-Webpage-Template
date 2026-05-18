import { describe, expect, test, vi } from "vitest";
import type { OnboardingScanResult } from "@/lib/sync/runOnboardingScan";
import type {
  FolderVerificationResult,
  OnboardingScanRouteTx,
  ScanRouteDeps,
} from "@/app/api/admin/onboarding/scan/route";
import { handleOnboardingScan } from "@/app/api/admin/onboarding/scan/route";

const W1 = "11111111-1111-4111-8111-111111111111";
const W2 = "22222222-2222-4222-8222-222222222222";

function request(folderUrl: string): Request {
  return new Request("https://crew.fxav.test/api/admin/onboarding/scan", {
    method: "POST",
    body: JSON.stringify({ folderUrl }),
    headers: { "content-type": "application/json" },
  });
}

function okFolder(id = "folder-1"): FolderVerificationResult {
  return { ok: true, folderId: id, folderName: "FXAV Onboarding" };
}

class FakeScanDb implements OnboardingScanRouteTx {
  settings = {
    pending_wizard_session_id: null as string | null,
    pending_wizard_session_at: null as string | null,
    pending_folder_id: null as string | null,
  };
  pendingSyncs: Array<{
    drive_file_id: string;
    wizard_session_id: string;
    wizard_approved: boolean;
    triggered_review_items: string[];
  }> = [];
  pendingIngestions: Array<{ drive_file_id: string; wizard_session_id: string }> = [];
  manifest: Array<{ drive_file_id: string; wizard_session_id: string; status: string }> = [];
  shows: Array<{ drive_file_id: string }> = [];
  operations: string[] = [];

  async query<T>(sql: string, params: readonly unknown[] = []) {
    const normalized = sql.replace(/\s+/g, " ").trim();
    this.operations.push(this.classify(normalized));

    if (normalized.startsWith("select pending_wizard_session_id")) {
      return { rows: [this.settings as T], rowCount: 1 };
    }

    if (normalized.startsWith("update public.app_settings")) {
      const sessionId = params[0] as string;
      this.settings = {
        pending_wizard_session_id: sessionId,
        pending_wizard_session_at: normalized.includes("pending_wizard_session_at = now()")
          ? "DB_NOW"
          : this.settings.pending_wizard_session_at,
        pending_folder_id: params[1] as string,
      };
      return { rows: [this.settings as T], rowCount: 1 };
    }

    if (normalized.startsWith("delete from public.pending_syncs")) {
      this.pendingSyncs = this.pendingSyncs.filter((row) => row.wizard_session_id !== params[0]);
      return { rows: [], rowCount: 0 };
    }

    if (normalized.startsWith("delete from public.pending_ingestions")) {
      this.pendingIngestions = this.pendingIngestions.filter(
        (row) => row.wizard_session_id !== params[0],
      );
      return { rows: [], rowCount: 0 };
    }

    if (normalized.startsWith("delete from public.onboarding_scan_manifest")) {
      this.manifest = this.manifest.filter((row) => row.wizard_session_id !== params[0]);
      return { rows: [], rowCount: 0 };
    }

    throw new Error(`Unhandled SQL in fake scan route tx: ${normalized}`);
  }

  private classify(sql: string): string {
    if (sql.startsWith("select pending_wizard_session_id")) return "select-settings-for-update";
    if (sql.startsWith("update public.app_settings")) return "update-settings";
    if (sql.startsWith("delete from public.pending_syncs")) return "purge-pending-syncs";
    if (sql.startsWith("delete from public.pending_ingestions")) return "purge-pending-ingestions";
    if (sql.startsWith("delete from public.onboarding_scan_manifest")) return "purge-manifest";
    return "unknown";
  }

  clone(): FakeScanDb {
    const next = new FakeScanDb();
    next.settings = { ...this.settings };
    next.pendingSyncs = this.pendingSyncs.map((row) => ({ ...row }));
    next.pendingIngestions = this.pendingIngestions.map((row) => ({ ...row }));
    next.manifest = this.manifest.map((row) => ({ ...row }));
    next.shows = this.shows.map((row) => ({ ...row }));
    next.operations = [...this.operations];
    return next;
  }

  restore(snapshot: FakeScanDb): void {
    this.settings = { ...snapshot.settings };
    this.pendingSyncs = snapshot.pendingSyncs.map((row) => ({ ...row }));
    this.pendingIngestions = snapshot.pendingIngestions.map((row) => ({ ...row }));
    this.manifest = snapshot.manifest.map((row) => ({ ...row }));
    this.shows = snapshot.shows.map((row) => ({ ...row }));
    this.operations = [...snapshot.operations];
  }
}

function deps(db: FakeScanDb, overrides: Partial<ScanRouteDeps> = {}): ScanRouteDeps {
  return {
    requireAdminIdentity: vi.fn(async () => ({ email: "doug@example.com" })),
    randomUUID: () => W1,
    verifyFolder: vi.fn(async () => okFolder()),
    withTx: async (fn) => {
      const snapshot = db.clone();
      try {
        return await fn(db);
      } catch (error) {
        db.restore(snapshot);
        throw error;
      }
    },
    runOnboardingScan: vi.fn(async () => ({ outcome: "completed", processed: [] })),
    ...overrides,
  };
}

async function json(response: Response): Promise<unknown> {
  return await response.json();
}

describe("POST /api/admin/onboarding/scan", () => {
  test("AC-10.2 success: verifies folder, mints session, purges current-session rows, and returns scan result", async () => {
    const db = new FakeScanDb();
    const routeDeps = deps(db, {
      runOnboardingScan: vi.fn(async () => ({
        outcome: "completed",
        processed: [{ driveFileId: "sheet-1", outcome: "staged" }],
      })),
    });

    const response = await handleOnboardingScan(
      request("https://drive.google.com/drive/folders/folder-1"),
      routeDeps,
    );

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({
      outcome: "completed",
      processed: [{ driveFileId: "sheet-1", outcome: "staged" }],
    });
    expect(db.settings).toMatchObject({
      pending_wizard_session_id: W1,
      pending_wizard_session_at: "DB_NOW",
      pending_folder_id: "folder-1",
    });
    expect(routeDeps.runOnboardingScan).toHaveBeenCalledWith("folder-1", W1);
  });

  test.each([
    ["not a URL", 400, "INVALID_FOLDER_URL", okFolder()],
    [
      "https://drive.google.com/drive/folders/folder-1",
      403,
      "FOLDER_NOT_SHARED",
      { ok: false, status: 403, code: "FOLDER_NOT_SHARED" } satisfies FolderVerificationResult,
    ],
    [
      "https://drive.google.com/drive/folders/folder-1",
      404,
      "FOLDER_NOT_FOUND",
      { ok: false, status: 404, code: "FOLDER_NOT_FOUND" } satisfies FolderVerificationResult,
    ],
    [
      "https://drive.google.com/drive/folders/folder-1",
      400,
      "OPERATOR_ERROR_NOT_FOLDER",
      {
        ok: false,
        status: 400,
        code: "OPERATOR_ERROR_NOT_FOLDER",
      } satisfies FolderVerificationResult,
    ],
  ])("AC-10.2 failure path %# returns %i %s", async (folderUrl, status, code, verifyResult) => {
    const db = new FakeScanDb();
    const routeDeps = deps(db, { verifyFolder: vi.fn(async () => verifyResult) });

    const response = await handleOnboardingScan(request(folderUrl), routeDeps);

    expect(response.status).toBe(status);
    expect(await json(response)).toEqual({ ok: false, code });
    expect(routeDeps.runOnboardingScan).not.toHaveBeenCalled();
  });

  test("non-admin caller returns 403 before Drive or DB work", async () => {
    const db = new FakeScanDb();
    const routeDeps = deps(db, {
      requireAdminIdentity: vi.fn(async () => {
        throw new Error("forbidden");
      }),
    });

    const response = await handleOnboardingScan(
      request("https://drive.google.com/drive/folders/folder-1"),
      routeDeps,
    );

    expect(response.status).toBe(403);
    expect(await json(response)).toEqual({ ok: false, code: "ADMIN_FORBIDDEN" });
    expect(routeDeps.verifyFolder).not.toHaveBeenCalled();
    expect(db.operations).toEqual([]);
  });

  test("re-call against the same session id reuses the id and purges prior rows for that session", async () => {
    const db = new FakeScanDb();
    db.settings = {
      pending_wizard_session_id: W2,
      pending_wizard_session_at: "OLD_DB_NOW",
      pending_folder_id: "old-folder",
    };
    db.pendingSyncs = [
      {
        drive_file_id: "old-sheet",
        wizard_session_id: W2,
        wizard_approved: false,
        triggered_review_items: ["OLD"],
      },
    ];
    db.pendingIngestions = [{ drive_file_id: "old-hard-fail", wizard_session_id: W2 }];
    db.manifest = [{ drive_file_id: "old-sheet", wizard_session_id: W2, status: "staged" }];
    const routeDeps = deps(db, {
      randomUUID: () => W1,
      verifyFolder: vi.fn(async () => okFolder("folder-2")),
    });

    const response = await handleOnboardingScan(
      request("https://drive.google.com/drive/folders/folder-2"),
      routeDeps,
    );

    expect(response.status).toBe(200);
    expect(db.settings.pending_wizard_session_id).toBe(W2);
    expect(db.settings.pending_wizard_session_at).toBe("OLD_DB_NOW");
    expect(db.settings.pending_folder_id).toBe("folder-2");
    expect(db.pendingSyncs).toEqual([]);
    expect(db.pendingIngestions).toEqual([]);
    expect(db.manifest).toEqual([]);
    expect(routeDeps.runOnboardingScan).toHaveBeenCalledWith("folder-2", W2);
  });

  test("Amendment 9 clean first-seen onboarding fixture stays staged for review", async () => {
    const db = new FakeScanDb();
    const routeDeps = deps(db, {
      runOnboardingScan: vi.fn(async (_folderId, wizardSessionId) => {
        db.pendingSyncs.push({
          drive_file_id: "clean-first-seen",
          wizard_session_id: wizardSessionId,
          wizard_approved: false,
          triggered_review_items: ["ONBOARDING_SCAN_REVIEW"],
        });
        db.manifest.push({
          drive_file_id: "clean-first-seen",
          wizard_session_id: wizardSessionId,
          status: "staged",
        });
        return {
          outcome: "completed",
          processed: [{ driveFileId: "clean-first-seen", outcome: "staged" }],
        };
      }),
    });

    const response = await handleOnboardingScan(
      request("https://drive.google.com/drive/folders/folder-1"),
      routeDeps,
    );

    expect(response.status).toBe(200);
    expect(db.shows).toEqual([]);
    expect(db.pendingSyncs).toEqual([
      {
        drive_file_id: "clean-first-seen",
        wizard_session_id: W1,
        wizard_approved: false,
        triggered_review_items: ["ONBOARDING_SCAN_REVIEW"],
      },
    ]);
    expect(db.manifest).toEqual([
      { drive_file_id: "clean-first-seen", wizard_session_id: W1, status: "staged" },
    ]);
    expect(db.pendingSyncs[0]?.triggered_review_items).not.toContain("FIRST_SEEN_REVIEW");
  });

  test.each([
    [
      "WIZARD_SESSION_SUPERSEDED_DURING_SCAN",
      { outcome: "superseded", code: "WIZARD_SESSION_SUPERSEDED_DURING_SCAN", processed: [] },
    ],
    [
      "WIZARD_ISOLATION_INDEXES_MISSING",
      {
        outcome: "schema_missing",
        code: "WIZARD_ISOLATION_INDEXES_MISSING",
        missingIndexes: ["pending_syncs_session_drive_file_idx"],
      },
    ],
    [
      "LIVE_ROW_CONFLICT",
      {
        outcome: "completed",
        processed: [{ driveFileId: "sheet-1", outcome: "live_row_conflict" }],
      },
    ],
  ] satisfies Array<[string, OnboardingScanResult]>)(
    "passes through %s scan result",
    async (_name, result) => {
      const db = new FakeScanDb();
      const routeDeps = deps(db, { runOnboardingScan: vi.fn(async () => result) });

      const response = await handleOnboardingScan(
        request("https://drive.google.com/drive/folders/folder-1"),
        routeDeps,
      );

      expect(response.status).toBe(200);
      expect(await json(response)).toEqual(result);
    },
  );
});
