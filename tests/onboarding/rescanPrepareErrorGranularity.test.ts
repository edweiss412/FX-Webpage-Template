/**
 * tests/onboarding/rescanPrepareErrorGranularity.test.ts
 * (spec docs/superpowers/specs/2026-07-24-test-safety-hardening-batch.md §4.4/§4.5, §5 tests 13 + 15)
 *
 * BL-RESCAN-PREPARE-ERROR-GRANULARITY: the per-sheet re-scan mapped ANY prepare
 * throw to DRIVE_FETCH_FAILED, whose copy tells Doug we could not fetch the sheet
 * from Google Drive and to check his share settings. When the real cause was his
 * sheet's structure, that is a wrong-reason report and the telemetry lost the
 * export-vs-parse distinction.
 *
 * Both branches stay fail-closed and PRE-LOCK: whichever code is returned, the
 * re-scan must not have mutated anything.
 */
import { describe, expect, test, vi } from "vitest";

import type { DriveListedFile } from "@/lib/drive/list";
import { severityForFinalizeRowCode } from "@/lib/onboarding/finalizeRowSeverity";
import { rescanWizardSheet } from "@/lib/onboarding/rescanWizardSheet";
import { PrepareOnboardingFileError, type PostgresTransaction } from "@/lib/sync/runOnboardingScan";

const DRIVE = "D_SHEET";
const WIZARD = "11111111-1111-1111-1111-111111111111";
const FOLDER = "F_PENDING";

const MUTATION_RE = /^\s*(insert|update|delete)\b/i;

function makeDeps(prepareThrows: unknown) {
  const calls: string[] = [];
  const tx: PostgresTransaction = {
    async unsafe(sql: string, _params: unknown[] = []) {
      const q = sql.replace(/\s+/g, " ").trim();
      calls.push(q);
      if (/select pending_folder_id, pending_wizard_session_id/i.test(q)) {
        return [{ pending_folder_id: FOLDER, pending_wizard_session_id: WIZARD }];
      }
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
      prepareOnboardingFiles: vi.fn(async () => {
        throw prepareThrows;
      }),
    },
  };
}

describe("re-scan maps the prepare fault to the right §12.4 code (spec §4.4)", () => {
  test("a PARSE fault reports STAGED_PARSE_FAILED, not a Drive failure", async () => {
    const { deps, calls } = makeDeps(
      new PrepareOnboardingFileError("parse", "unexpected section header"),
    );
    const result = await rescanWizardSheet(DRIVE, WIZARD, deps as never);

    expect(result).toEqual({ status: "needs_attention", code: "STAGED_PARSE_FAILED" });
    // Pre-lock: the fault happened before any mutation could run.
    expect(calls.filter((q) => MUTATION_RE.test(q))).toEqual([]);
  });

  test("a DRIVE_FETCH fault still reports DRIVE_FETCH_FAILED", async () => {
    const { deps, calls } = makeDeps(
      new PrepareOnboardingFileError("drive_fetch", "socket hang up"),
    );
    const result = await rescanWizardSheet(DRIVE, WIZARD, deps as never);

    expect(result).toEqual({ status: "needs_attention", code: "DRIVE_FETCH_FAILED" });
    expect(calls.filter((q) => MUTATION_RE.test(q))).toEqual([]);
  });

  test("an INTERNAL fault reports ONBOARDING_INTERNAL_ERROR, not Drive and not fix-your-sheet", async () => {
    // BL-PREPARE-INTERNAL-FAULT-KIND (spec 2026-08-09-m-wave-2-design §2.3): a bug
    // in a post-parse helper is recovered by a code fix — the operator is told to
    // contact the developer, not to check share settings or edit the sheet.
    const { deps, calls } = makeDeps(
      new PrepareOnboardingFileError("internal", "overlay clone failed"),
    );
    const result = await rescanWizardSheet(DRIVE, WIZARD, deps as never);

    expect(result).toEqual({ status: "needs_attention", code: "ONBOARDING_INTERNAL_ERROR" });
    expect(calls.filter((q) => MUTATION_RE.test(q))).toEqual([]);
  });

  test("an UNCLASSIFIED throw keeps today's DRIVE_FETCH_FAILED (conservative default)", async () => {
    const { deps } = makeDeps(new Error("something else entirely"));
    await expect(rescanWizardSheet(DRIVE, WIZARD, deps as never)).resolves.toEqual({
      status: "needs_attention",
      code: "DRIVE_FETCH_FAILED",
    });
  });

  test("a NON-Error throw also keeps DRIVE_FETCH_FAILED", async () => {
    const { deps } = makeDeps("boom");
    await expect(rescanWizardSheet(DRIVE, WIZARD, deps as never)).resolves.toEqual({
      status: "needs_attention",
      code: "DRIVE_FETCH_FAILED",
    });
  });

  test("a Drive METADATA failure (before prepare runs at all) is unchanged", async () => {
    const { deps, calls } = makeDeps(new PrepareOnboardingFileError("parse", "never reached"));
    deps.fetchDriveFileMetadata = vi.fn(async () => {
      throw new Error("404 file not found");
    });
    const result = await rescanWizardSheet(DRIVE, WIZARD, deps as never);

    expect(result).toEqual({ status: "needs_attention", code: "DRIVE_FETCH_FAILED" });
    expect(calls.filter((q) => MUTATION_RE.test(q))).toEqual([]);
  });
});

describe("finalize per-row telemetry severity (spec §4.5)", () => {
  test("an infra fault logs error; a sheet-content fault logs warn", () => {
    // The map's contract is "INFRA fault -> error, operator-recoverable -> warn".
    // A sheet the parser cannot read is recovered by Doug editing the sheet, so warn
    // is its correct home; today's error was a symptom of the same conflation this
    // change removes. Pinned so neither can flip silently.
    expect(severityForFinalizeRowCode("DRIVE_FETCH_FAILED")).toBe("error");
    expect(severityForFinalizeRowCode("STAGED_PARSE_FAILED")).toBe("warn");
  });

  test("an internal fault keeps severity error (spec 2026-08-09-m-wave-2 §2.3)", () => {
    // These faults reported as DRIVE_FETCH_FAILED (error) before the internal kind
    // existed; a code bug is not operator-recoverable by re-apply, so the split must
    // not silently downgrade it to warn.
    expect(severityForFinalizeRowCode("ONBOARDING_INTERNAL_ERROR")).toBe("error");
  });
});
