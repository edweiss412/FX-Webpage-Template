/**
 * Composition seam for the staged "applied" state (spec 2026-07-16 §3.3 / §7 item 6):
 * rescanWizardSheet's re-stage runs the REAL prepareOnboardingFiles, so the refreshed
 * staged parse is post-overlay — the warning `mapRoleTokenStaged`'s applied-check reads
 * is consumed and the stamp rides along. (The action-level `applied` contract itself is
 * pinned in tests/admin/mapRoleTokenStagedAction.test.ts; this pins the seam that makes
 * it truthful: the rescan core receives a post-overlay refreshedParse.)
 */
import { describe, expect, it, vi } from "vitest";

import { rescanWizardSheet, type RescanDeps } from "@/lib/onboarding/rescanWizardSheet";
import { prepareOnboardingFiles } from "@/lib/sync/runOnboardingScan";
import type { PostgresTransaction } from "@/lib/sync/runOnboardingScan";
import type { ParseResult, ParseWarning, ParsedSheet } from "@/lib/parser/types";
import type { RoleTokenMapping } from "@/lib/sync/roleMappingOverlay";
import { crew, parseResult as buildParseResult } from "@/tests/sync/_holdAwareTestkit";

const attachSpy = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/sync/attachWarningAnchors", () => ({ attachWarningAnchors: attachSpy }));

const DRIVE = "drv-rescan-overlay";
const FOLDER = "folder-1";
const SESSION = "6f6e626f-6172-4d69-8e67-000000000001";
const SHEET_MIME = "application/vnd.google-apps.spreadsheet";
const TOKEN = "NEWROLE";

const mapping = (): RoleTokenMapping => ({
  token: TOKEN,
  grants: ["A1"],
  decidedBy: "doug@fxav.com",
  decidedAt: "2026-07-16T00:00:00.000Z",
});

function warnedParse(): ParseResult {
  const pr = buildParseResult([crew("Pat", { role_flags: [] })]);
  pr.warnings = [
    {
      severity: "warn",
      code: "UNKNOWN_ROLE_TOKEN",
      message: `Unrecognized role "${TOKEN}"`,
      rawSnippet: TOKEN,
      roleToken: TOKEN,
      blockRef: { kind: "crew", index: 0, name: "Pat" },
    } as ParseWarning,
  ];
  return pr;
}

function fakeWithTx(): NonNullable<RescanDeps["withTx"]> {
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
        return [{ override_json: null }];
      }
      if (sql.includes("wizard_finalize_checkpoints")) return [];
      return [];
    },
  } as unknown as PostgresTransaction;
  return async <R>(fn: (rawTx: PostgresTransaction) => Promise<R>): Promise<R> => fn(tx);
}

describe("rescanWizardSheet — re-stage parses post-overlay (spec §3.3)", () => {
  it("the rescan core receives a refreshedParse with the warning consumed and the stamp present", async () => {
    const applySpy = vi.fn(async () => ({ kind: "clean_unchecked" as const, changed: false }));
    const metadata = {
      driveFileId: DRIVE,
      name: "fixture.gsheet",
      mimeType: SHEET_MIME,
      modifiedTime: "2026-07-16T10:00:00.000Z",
      parents: [FOLDER],
    };
    const result = await rescanWizardSheet(DRIVE, SESSION, {
      fetchDriveFileMetadata: async () => metadata,
      // REAL prepare with stubbed IO deps — the seam under test is prepare's overlay.
      prepareOnboardingFiles: (folderId, d) =>
        prepareOnboardingFiles(folderId, {
          ...d,
          fetchMarkdownWithBinding: async () => ({
            binding: { bindingToken: "tok", modifiedTime: metadata.modifiedTime },
            markdown: "md",
          }),
          parseSheet: () => ({}) as unknown as ParsedSheet,
          enrichWithDrivePins: async () => warnedParse(),
          listSheetGids: async () => new Map<string, number>(),
          driveClient: {} as never,
          readPullSheetOverride: async () => null,
          readRoleTokenMappings: async () => [mapping()],
        }),
      withTx: fakeWithTx(),
      applyRescanDecisionUnderLock: applySpy as never,
    });
    expect(result.status).toBe("updated");
    const args = applySpy.mock.calls[0]![1] as { refreshedParse: ParseResult };
    expect(args.refreshedParse.warnings.some((w) => w.code === "UNKNOWN_ROLE_TOKEN")).toBe(false);
    expect(args.refreshedParse.crewMembers[0]!.role_flags).toContain("A1");
    expect(args.refreshedParse.appliedRoleMappings).toEqual([{ token: TOKEN, grants: ["A1"] }]);
  });
});
