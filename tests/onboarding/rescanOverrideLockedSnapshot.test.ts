import { describe, expect, it, vi } from "vitest";
import type { ParseResult } from "@/lib/parser/types";
import type { OverrideSnapshot } from "@/lib/sync/pullSheetOverride";
import type { PreparedOnboardingFile, PostgresTransaction } from "@/lib/sync/runOnboardingScan";
import { rescanWizardSheet, type RescanDeps } from "@/lib/onboarding/rescanWizardSheet";

/**
 * §5.7 / I5(a) locked-snapshot protocol (TOCTOU). The pre-lock export was produced under a
 * specific override snapshot; between the pre-lock parse and acquiring the show: lock, another
 * holder (Task-6 auto-clear, Task-8 accept/revoke RPC) can change pull_sheet_override. If the
 * under-lock re-read differs from the pre-lock snapshot, the parse is STALE and must be refused.
 */

const SESSION = "5d5d5d5d-3333-4333-8333-5d5d5d5d5d5d";
const FOLDER = "locked-snap-folder";
const DRIVE = "drive-locked-snap-1";
const SHEET_MIME = "application/vnd.google-apps.spreadsheet";
const OVERRIDE_A = { tabName: "OLD PULL SHEET", fingerprint: "aa" };

function emptyParse(): ParseResult {
  return {
    show: {} as never,
    crewMembers: [],
    hotelReservations: [],
    rooms: [],
    transportation: null,
    contacts: [],
    pullSheet: null,
    diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
    openingReel: null,
    raw_unrecognized: [],
    warnings: [],
    archivedPullSheetTabs: [],
    hardErrors: [],
  } as unknown as ParseResult;
}

function preparedWith(used: OverrideSnapshot): PreparedOnboardingFile {
  return {
    file: {
      driveFileId: DRIVE,
      name: "fixture.gsheet",
      mimeType: SHEET_MIME,
      modifiedTime: "2026-06-20T10:00:00.250Z",
      parents: [FOLDER],
    },
    kind: "sheet",
    sourceAnchors: {},
    binding: { bindingToken: "tok", modifiedTime: "2026-06-20T10:00:00.250Z" },
    parseResult: emptyParse(),
    pullSheetOverrideUsed: used,
  } as PreparedOnboardingFile;
}

// Fake tx that answers each of rescanWizardSheet's under-lock queries by SQL shape, returning
// `lockedOverride` for the §5.7 pull_sheet_override re-read.
function fakeWithTx(lockedOverride: unknown): NonNullable<RescanDeps["withTx"]> {
  const tx = {
    async unsafe(sql: string) {
      if (sql.includes("pending_folder_id")) {
        return [{ pending_folder_id: FOLDER, pending_wizard_session_id: SESSION }];
      }
      if (sql.includes("pg_try_advisory_xact_lock")) return [{ locked: true }];
      if (sql.includes("for update")) return [{ pending_wizard_session_id: SESSION }];
      if (sql.includes("onboarding_scan_manifest")) return [{ ok: 1 }];
      if (sql.includes("pg_advisory_xact_lock")) return [];
      if (sql.includes("pull_sheet_override") && sql.includes("pending_syncs")) {
        return [{ override_json: lockedOverride }];
      }
      if (sql.includes("wizard_finalize_checkpoints")) return [];
      return [];
    },
  } as unknown as PostgresTransaction;
  return async <R>(fn: (rawTx: PostgresTransaction) => Promise<R>): Promise<R> => fn(tx);
}

function deps(
  used: OverrideSnapshot,
  lockedOverride: unknown,
  applySpy: ReturnType<typeof vi.fn>,
): RescanDeps {
  return {
    fetchDriveFileMetadata: async () => ({
      driveFileId: DRIVE,
      name: "fixture.gsheet",
      mimeType: SHEET_MIME,
      modifiedTime: "2026-06-20T10:00:00.250Z",
      parents: [FOLDER],
    }),
    prepareOnboardingFiles: async () => [preparedWith(used)],
    withTx: fakeWithTx(lockedOverride),
    applyRescanDecisionUnderLock: applySpy as never,
  };
}

describe("rescanWizardSheet — §5.7 locked-snapshot protocol", () => {
  it("revoke-vs-rescan: pre-lock parse under override A, locked re-read null => stale_override_refused, no staged write", async () => {
    const applySpy = vi.fn();
    const result = await rescanWizardSheet(DRIVE, SESSION, deps(OVERRIDE_A, null, applySpy));
    expect(result.status).toBe("stale_override_refused");
    expect(applySpy).not.toHaveBeenCalled(); // no staged/live results written from the stale parse
  });

  it("accept-vs-cron: pre-lock snapshot null, locked re-read override A => stale_override_refused", async () => {
    const applySpy = vi.fn();
    const result = await rescanWizardSheet(DRIVE, SESSION, deps(null, OVERRIDE_A, applySpy));
    expect(result.status).toBe("stale_override_refused");
    expect(applySpy).not.toHaveBeenCalled();
  });

  it("no drift: pre-lock A, locked A => guard passes (applyRescanDecisionUnderLock invoked)", async () => {
    const applySpy = vi.fn(async () => ({ kind: "clean_unchecked" as const, changed: false }));
    const result = await rescanWizardSheet(DRIVE, SESSION, deps(OVERRIDE_A, OVERRIDE_A, applySpy));
    expect(result.status).not.toBe("stale_override_refused");
    expect(applySpy).toHaveBeenCalledOnce();
  });
});
