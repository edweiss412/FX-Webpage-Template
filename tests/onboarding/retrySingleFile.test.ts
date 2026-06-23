import { describe, expect, test } from "vitest";
import type { RetrySingleFileTx } from "@/lib/sync/retrySingleFile";
import { retrySingleFilePreflight, retrySingleFileFinalize } from "@/lib/sync/retrySingleFile";
import type { OnboardingScanResult } from "@/lib/sync/runOnboardingScan";
import { WizardSessionSupersededRollbackError } from "@/lib/sync/wizardSessionRollback";

// retrySingleFile (the orchestrator) acquires the REAL per-show pipeline lock and
// runs the REAL scan, so its end-to-end behavior — and the absence of the nested
// same-key deadlock — is verified against a live DB in
// retrySingleFileNestedLockDeadlockDb.test.ts. Here we unit-test the two exported
// under-lock building blocks (preflight + finalize) with a Fake tx.

const W1 = "11111111-1111-4111-8111-111111111111";
const W2 = "22222222-2222-4222-8222-222222222222";

type PendingRow = {
  drive_file_id: string;
  wizard_session_id: string;
  discovered_during_folder_id: string;
  last_error_code: string;
};

function pending(overrides: Partial<PendingRow> = {}): PendingRow {
  return {
    drive_file_id: "file-1",
    wizard_session_id: W1,
    discovered_during_folder_id: "folder-1",
    last_error_code: "MI_1_MISSING_REQUIRED_TAB",
    ...overrides,
  };
}

function scan(outcome: "staged" | "hard_failed" | "live_row_conflict"): OnboardingScanResult {
  return { outcome: "completed", processed: [{ driveFileId: "file-1", outcome }] };
}

class FakeRetrySingleFileTx implements RetrySingleFileTx {
  activeWizardSessionId: string | null = W1;
  pendingFolderId: string | null = "folder-1";
  pendingRow: PendingRow | null = pending();

  async queryOne<T>(sql: string) {
    const normalized = sql.replace(/\s+/g, " ").trim();
    if (/pg_locks/i.test(normalized)) return { held: true } as T;
    if (normalized.startsWith("select pending_wizard_session_id")) {
      return {
        pending_wizard_session_id: this.activeWizardSessionId,
        pending_folder_id: this.pendingFolderId,
      } as T;
    }
    if (normalized.startsWith("select drive_file_id")) return this.pendingRow as T;
    throw new Error(`Unhandled retrySingleFile SQL: ${normalized}`);
  }
}

describe("retrySingleFilePreflight", () => {
  test("returns the pending-folder id + row when the wizard session and provenance are current", async () => {
    const tx = new FakeRetrySingleFileTx();

    const result = await retrySingleFilePreflight(tx as never, "file-1", W1);

    expect(result).toEqual({
      pendingFolderId: "folder-1",
      pending: expect.objectContaining({ drive_file_id: "file-1", wizard_session_id: W1 }),
    });
  });

  test("rejects a stale wizard session as wizard_superseded", async () => {
    const tx = new FakeRetrySingleFileTx();
    tx.activeWizardSessionId = W2;

    const result = await retrySingleFilePreflight(tx as never, "file-1", W1);

    expect(result).toEqual({
      result: { outcome: "wizard_superseded", code: "WIZARD_SESSION_SUPERSEDED" },
    });
  });

  test("rejects a pending-ingestion provenance mismatch as not_found", async () => {
    const tx = new FakeRetrySingleFileTx();
    tx.pendingRow = pending({ discovered_during_folder_id: "other-folder" });

    const result = await retrySingleFilePreflight(tx as never, "file-1", W1);

    expect(result).toEqual({
      result: { outcome: "not_found", code: "PENDING_INGESTION_NOT_FOUND" },
    });
  });
});

describe("retrySingleFileFinalize", () => {
  test("a staged scan under the still-current session returns retried/staged (the scan already removed the pending-ingestion row)", async () => {
    const tx = new FakeRetrySingleFileTx();

    const result = await retrySingleFileFinalize(
      tx as never,
      "file-1",
      W1,
      scan("staged"),
      pending(),
    );

    expect(result).toEqual({ outcome: "retried", status: "staged" });
  });

  test("a hard-failed scan returns the refreshed pending-ingestion code", async () => {
    const tx = new FakeRetrySingleFileTx();

    const result = await retrySingleFileFinalize(
      tx as never,
      "file-1",
      W1,
      scan("hard_failed"),
      pending({ last_error_code: "MI_2_INVALID_DATE" }),
    );

    expect(result).toEqual({
      outcome: "retried",
      status: "hard_failed",
      code: "MI_2_INVALID_DATE",
    });
  });

  // F5 Task 5.5 S5 (R12 HIGH): the scan owns the pending-ingestion delete and
  // detects in-scan supersession; finalize detects a POST-scan supersession by
  // re-reading the wizard-session currency. Without it, a supersession in the
  // post-scan window would let the route 200 {status:"staged"} for a RETIRED tab.
  test("S5: a post-scan supersession (currency re-check mismatch) throws the typed rollback error", async () => {
    const tx = new FakeRetrySingleFileTx();
    tx.activeWizardSessionId = W2; // superseded after the scan staged

    const call = retrySingleFileFinalize(tx as never, "file-1", W1, scan("staged"), pending());

    await expect(call).rejects.toBeInstanceOf(WizardSessionSupersededRollbackError);
    await expect(call).rejects.toMatchObject({
      context: {
        attemptedAction: "retry",
        supersededSessionId: W1,
        driveFileId: "file-1",
      },
    });
  });
});
