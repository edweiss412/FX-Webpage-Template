/**
 * FIX idx15/#80 — the retry (injected-tx) live-row-conflict recovery must run on
 * a FRESH transaction, not the aborted held tx.
 *
 * retrySingleFile / rescanWizardSheet call scanOnboardingPreparedFiles with an
 * injected `deps.tx` (the caller-held, per-show-locked tx) + a passthrough
 * `withShowLock` that collapses every internal withTx onto that single tx. When
 * runPhase1 raises a 23505/42P10, that held tx is ABORTED; on real Postgres every
 * subsequent statement fails with 25P02 (in_failed_sql_transaction). The scan's
 * live-row-conflict recovery (recordLiveRowConflict → upsertManifest/logSync/
 * upsertAdminAlert) therefore MUST run on a separate connection, or it 25P02s and
 * the graceful `live_row_conflict` outcome becomes an OnboardingScanInfraError —
 * which the retry route rethrows as a 500 instead of returning the typed,
 * recoverable live_row_conflict outcome.
 *
 * This is a UNIT test (no DB): the injected shared tx SIMULATES the aborted-tx
 * 25P02 by throwing on any recovery write, and a separately-injected fresh
 * recovery runner accepts the writes. Pre-fix the recovery reuses the shared
 * (aborted) tx → the scan rejects with OnboardingScanInfraError. Post-fix it uses
 * the fresh runner → the scan resolves `completed` with a live_row_conflict row.
 */
import { describe, expect, test, vi } from "vitest";
import type { DriveListedFile } from "@/lib/drive/list";
import type { ParseResult } from "@/lib/parser/types";
import {
  scanOnboardingPreparedFiles,
  type OnboardingScanTx,
  type PreparedOnboardingFile,
  type RunOnboardingScanDeps,
  type ScanTxRunner,
} from "@/lib/sync/runOnboardingScan";

const FOLDER = "fresh-tx-folder";
const SESSION = "9c9c9c9c-1111-4111-8111-9c9c9c9c9c9c";
const FILE = "fresh-tx-file";

function listedFile(driveFileId: string): DriveListedFile {
  return {
    driveFileId,
    name: `${driveFileId}.gsheet`,
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime: "2026-06-11T08:00:00.000Z",
    parents: [FOLDER],
  } as DriveListedFile;
}

function preparedSheet(driveFileId: string): PreparedOnboardingFile {
  return {
    file: listedFile(driveFileId),
    kind: "sheet",
    binding: { bindingToken: `tok-${driveFileId}`, modifiedTime: "2026-06-11T08:00:00.000Z" },
    parseResult: { warnings: [] } as unknown as ParseResult,
    sourceAnchors: {},
  } as unknown as PreparedOnboardingFile;
}

// Aborted-tx stand-in: readiness probe passes, but ANY recovery write throws the
// real 25P02 SQLSTATE — the exact failure the held tx exhibits after a 23505.
function makeAbortedSharedTx(calls: string[]): OnboardingScanTx {
  const aborted = () => {
    throw Object.assign(new Error("current transaction is aborted"), { code: "25P02" });
  };
  return {
    ensureWizardIsolationIndexes: async () => ({ ok: true }),
    upsertManifest: async () => {
      calls.push("shared.upsertManifest");
      return aborted();
    },
    logSync: async () => {
      calls.push("shared.logSync");
      return aborted();
    },
    upsertAdminAlert: async () => {
      calls.push("shared.upsertAdminAlert");
      return aborted();
    },
  } as unknown as OnboardingScanTx;
}

// Fresh recovery connection: accepts the recovery writes (upsertManifest returns
// true = session still current → the conflict is recorded and the scan continues).
function makeFreshRecoveryTx(calls: string[]): OnboardingScanTx {
  return {
    upsertManifest: async () => {
      calls.push("fresh.upsertManifest");
      return true;
    },
    logSync: async () => {
      calls.push("fresh.logSync");
    },
    upsertAdminAlert: async () => {
      calls.push("fresh.upsertAdminAlert");
      return null;
    },
  } as unknown as OnboardingScanTx;
}

describe("retry/rescan injected-tx live-row-conflict recovery runs on a fresh tx", () => {
  test("records live_row_conflict on the fresh runner (not the aborted held tx) and completes", async () => {
    const calls: string[] = [];
    const sharedTx = makeAbortedSharedTx(calls);
    const freshTx = makeFreshRecoveryTx(calls);

    let recoveryRunnerCreated = 0;
    const createRecoveryTxRunner = (): ScanTxRunner => {
      recoveryRunnerCreated += 1;
      return {
        withTx: async (fn) => fn(freshTx),
        close: vi.fn(async () => {}),
      };
    };

    const deps: RunOnboardingScanDeps = {
      // Mirror retrySingleFile: the scan runs on ONE caller-held locked tx via a
      // passthrough withShowLock (single advisory-lock holder — no second lock).
      tx: sharedTx,
      withShowLock: async (_driveFileId, fn) => fn(sharedTx as never),
      // The recovery seam under test: a fresh connection for the conflict record.
      createRecoveryTxRunner,
      // runPhase1 raises a live-row conflict (non-arbiter 23505) which aborts the
      // held tx — the exact production shape (unique_violation_against_legacy_pk).
      runPhase1: vi.fn(async () => {
        throw Object.assign(new Error("duplicate key"), { code: "23505" });
      }),
    };
    const result = await scanOnboardingPreparedFiles(FOLDER, SESSION, [preparedSheet(FILE)], deps);

    expect(result).toMatchObject({
      outcome: "completed",
      processed: [{ driveFileId: FILE, outcome: "live_row_conflict" }],
    });
    // The conflict record went to the FRESH runner...
    expect(recoveryRunnerCreated).toBe(1);
    expect(calls).toContain("fresh.upsertManifest");
    // ...and NEVER to the aborted held tx (that is the 25P02/500 bug).
    expect(calls).not.toContain("shared.upsertManifest");
  });
});
