import { describe, expect, test, vi } from "vitest";

import { rescanWizardSheet } from "@/lib/onboarding/rescanWizardSheet";
import type { PostgresTransaction } from "@/lib/sync/runOnboardingScan";
import type { DriveListedFile } from "@/lib/drive/list";

/**
 * tests/onboarding/rescanCheckpointReopen.test.ts
 *
 * Whole-diff R3 MEDIUM: the completed-checkpoint reopen ('in_progress') must fire
 * ONLY after the rescan core returns a HEALING outcome. The previous code hoisted
 * the reopen ahead of the core, so a non-healing core outcome (schema_missing /
 * superseded / not_staged / hard_failed) left the checkpoint 'in_progress' with
 * nothing healed — stranding the admin on a resume surface with no processable row.
 * These fakes drive the outcome directly (injected core) and assert whether the
 * reopen UPDATE was issued.
 */

const DRIVE = "D_SHEET";
const WIZARD = "11111111-1111-1111-1111-111111111111";
const FOLDER = "F_PENDING";

const REOPEN_RE =
  /update\s+public\.wizard_finalize_checkpoints[\s\S]*set\s+status\s*=\s*'in_progress'/i;

// A fake raw postgres.js tx: answers the pre-lock settings read and the locked
// mutation's guard queries, records every executed SQL, and reports whether the
// checkpoint is COMPLETE (blocker-heal) via `completeCheckpoint`.
function makeDeps(opts: {
  completeCheckpoint: boolean;
  outcome: { kind: string; code?: string; changed?: boolean };
}) {
  const calls: string[] = [];
  const tx: PostgresTransaction = {
    async unsafe(sql: string, _params: unknown[] = []) {
      const q = sql.replace(/\s+/g, " ").trim();
      calls.push(q);
      if (/select pending_folder_id, pending_wizard_session_id/i.test(q)) {
        return [{ pending_folder_id: FOLDER, pending_wizard_session_id: WIZARD }];
      }
      if (/pg_try_advisory_xact_lock/i.test(q)) return [{ locked: true }];
      if (/select pending_wizard_session_id from public\.app_settings/i.test(q)) {
        return [{ pending_wizard_session_id: WIZARD }];
      }
      if (/from public\.onboarding_scan_manifest/i.test(q)) return [{ ok: 1 }];
      if (/pg_advisory_xact_lock/i.test(q)) return [];
      // Blocker-heal detection SELECT (status in complete states).
      if (/select 1 as ok from public\.wizard_finalize_checkpoints/i.test(q)) {
        return opts.completeCheckpoint ? [{ ok: 1 }] : [];
      }
      // The reopen UPDATE (only expected on a healing outcome + blocker heal).
      if (REOPEN_RE.test(q)) return [];
      return [];
    },
  };
  return {
    calls,
    deps: {
      withTx: async <R>(fn: (t: PostgresTransaction) => Promise<R>) => fn(tx),
      fetchDriveFileMetadata: vi.fn(
        async (driveFileId: string) =>
          ({
            driveFileId,
            name: `${driveFileId}.xlsx`,
            mimeType: "application/vnd.google-apps.spreadsheet",
            modifiedTime: "2026-05-08T12:00:00.000Z",
            parents: [FOLDER],
          }) as DriveListedFile,
      ),
      prepareOnboardingFiles: vi.fn(async () => [
        { kind: "sheet", parseResult: {}, file: { driveFileId: DRIVE } } as never,
      ]),
      applyRescanDecisionUnderLock: (async () => opts.outcome) as never,
    },
  };
}

describe("rescanWizardSheet checkpoint reopen (whole-diff R3 MEDIUM)", () => {
  test("NON-healing core outcome (superseded) on a completed checkpoint → NO reopen", async () => {
    const { calls, deps } = makeDeps({
      completeCheckpoint: true,
      outcome: { kind: "superseded" },
    });
    const result = await rescanWizardSheet(DRIVE, WIZARD, deps);
    expect(result).toEqual({ status: "superseded" });
    // The checkpoint must be left intact — no reopen to 'in_progress'.
    expect(calls.some((q) => REOPEN_RE.test(q))).toBe(false);
  });

  test("healing outcome (dirty_demoted) on a completed checkpoint → reopens 'in_progress'", async () => {
    const { calls, deps } = makeDeps({
      completeCheckpoint: true,
      outcome: { kind: "dirty_demoted", changed: true },
    });
    const result = await rescanWizardSheet(DRIVE, WIZARD, deps);
    expect(result).toMatchObject({ status: "updated", demoted: true });
    expect(calls.some((q) => REOPEN_RE.test(q))).toBe(true);
  });

  test("healing outcome but NO completed checkpoint (pre-finalize) → NO reopen", async () => {
    const { calls, deps } = makeDeps({
      completeCheckpoint: false,
      outcome: { kind: "clean_restamped", changed: true },
    });
    const result = await rescanWizardSheet(DRIVE, WIZARD, deps);
    expect(result).toMatchObject({ status: "updated", demoted: false });
    expect(calls.some((q) => REOPEN_RE.test(q))).toBe(false);
  });
});
