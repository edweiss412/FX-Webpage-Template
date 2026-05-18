import { describe, expect, test, vi } from "vitest";
import type { RetrySingleFileTx } from "@/lib/sync/retrySingleFile";
import { retrySingleFile_unlocked } from "@/lib/sync/retrySingleFile";

const W1 = "11111111-1111-4111-8111-111111111111";

class FakeRetrySingleFileTx implements RetrySingleFileTx {
  activeWizardSessionId: string | null = W1;
  pendingFolderId: string | null = "folder-1";
  pendingRow:
    | {
        drive_file_id: string;
        wizard_session_id: string;
        discovered_during_folder_id: string;
      }
    | null = {
    drive_file_id: "file-1",
    wizard_session_id: W1,
    discovered_during_folder_id: "folder-1",
  };
  deletedPendingIngestion = false;

  async queryOne<T>(sql: string, params: unknown[]) {
    const normalized = sql.replace(/\s+/g, " ").trim();
    if (/pg_locks/i.test(normalized)) return { held: true } as T;
    if (normalized.startsWith("select pending_wizard_session_id")) {
      return {
        pending_wizard_session_id: this.activeWizardSessionId,
        pending_folder_id: this.pendingFolderId,
      } as T;
    }
    if (normalized.startsWith("select drive_file_id")) return this.pendingRow as T;
    if (normalized.startsWith("delete from public.pending_ingestions")) {
      this.deletedPendingIngestion = true;
      return { deleted: true } as T;
    }
    throw new Error(`Unhandled retrySingleFile SQL: ${normalized} ${JSON.stringify(params)}`);
  }
}

describe("retrySingleFile_unlocked", () => {
  test("checks wizard CAS/provenance, runs one-file onboarding scan, and deletes the hard-fail row on staged success", async () => {
    const tx = new FakeRetrySingleFileTx();
    const runOnboardingScan = vi.fn(async () => ({
      outcome: "completed" as const,
      processed: [{ driveFileId: "file-1", outcome: "staged" as const }],
    }));

    const result = await retrySingleFile_unlocked(tx, "file-1", W1, {
      runOnboardingScan,
      fetchDriveFileMetadata: vi.fn(async () => ({
        driveFileId: "file-1",
        name: "file-1.xlsx",
        mimeType: "application/vnd.google-apps.spreadsheet",
        modifiedTime: "2026-05-08T12:00:00.000Z",
        parents: ["folder-1"],
      })),
    });

    expect(result).toEqual({ outcome: "retried", status: "staged" });
    expect(runOnboardingScan).toHaveBeenCalledWith("folder-1", W1, expect.any(Object));
    expect(tx.deletedPendingIngestion).toBe(true);
  });

  test("rejects stale wizard sessions without running Phase 1", async () => {
    const tx = new FakeRetrySingleFileTx();
    tx.activeWizardSessionId = "22222222-2222-4222-8222-222222222222";
    const runOnboardingScan = vi.fn();

    const result = await retrySingleFile_unlocked(tx, "file-1", W1, { runOnboardingScan });

    expect(result).toEqual({ outcome: "wizard_superseded", code: "WIZARD_SESSION_SUPERSEDED" });
    expect(runOnboardingScan).not.toHaveBeenCalled();
  });

  test("rejects pending-ingestion provenance mismatch", async () => {
    const tx = new FakeRetrySingleFileTx();
    tx.pendingRow = {
      drive_file_id: "file-1",
      wizard_session_id: W1,
      discovered_during_folder_id: "other-folder",
    };

    const result = await retrySingleFile_unlocked(tx, "file-1", W1, { runOnboardingScan: vi.fn() });

    expect(result).toEqual({
      outcome: "not_found",
      code: "PENDING_INGESTION_NOT_FOUND",
    });
  });
});
