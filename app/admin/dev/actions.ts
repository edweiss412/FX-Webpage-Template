"use server";
/**
 * app/admin/dev/actions.ts (M3 Task 3.1)
 *
 * Server actions for the /admin/dev panel:
 *   - parseAndStage(filename): runs the FULL Phase-1 pipeline against the
 *     selected fixture and writes through to dev.* via dev_phase1_stage RPC.
 *   - resetDevSchema(): truncates every dev.* table via the dev_truncate_all RPC.
 *
 * EVERY action calls requireAdmin() as its first line per AGENTS.md §1.6 and
 * spec §7.3. The build-time flag gate inside requireAdmin() ALSO blocks the
 * actions from executing in a prod-build, even via a fictitious caller.
 *
 * Pipeline contract (per plan 03-04-tiles.md:23):
 *   parseSheet → enrichWithDrivePins(parsed, mockDriveClient)
 *     → runInvariants(prior, parseResult) → dev_phase1_stage
 *
 * Phase-1 strictness: parseAndStage NEVER inserts into dev.shows directly;
 * status-only updates on existing dev.shows rows are the only modifications
 * that path makes. Inserting new dev.shows is Phase-2/Apply (M6's job).
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { parseSheet } from "@/lib/parser";
import { runInvariants } from "@/lib/parser/invariants";
import { enrichWithDrivePins } from "@/lib/sync/enrichWithDrivePins";
import { mockDriveClient, MOCK_MARKER } from "@/lib/sync/mocks/mockDriveClient";
import type { ParseResult, InvariantOutcome, ParseWarning } from "@/lib/parser/types";

export type ParseAndStageResult = {
  filename: string;
  /** synthetic drive_file_id used for the dev write */
  driveFileId: string;
  outcome: InvariantOutcome["outcome"];
  /** Triggered MI items when outcome='stage'; empty otherwise. */
  triggeredItems: Array<{ id: string; invariant: string; details?: unknown }>;
  /** Hard-fail codes when outcome='hard_fail'; empty otherwise. */
  hardFailCodes: string[];
  parseWarnings: ParseWarning[];
  rawUnrecognized: ParseResult["raw_unrecognized"];
  /** Mock-emitted marker so the panel can prove enrichment ran (anti-tautology). */
  mockMarker: string;
  enrichment: {
    reelPin: ParseResult["openingReel"];
    linkedFolderItemCount: number;
    embeddedImageCount: number;
  };
  staging:
    | { kind: "pending_sync"; id: string; show_id: string | null }
    | { kind: "pending_ingestion"; id: string; show_id: string | null }
    | null;
};

const FIXTURE_DIR = join(process.cwd(), "fixtures/shows/raw");
const FIXTURE_NAME_RE = /^[a-zA-Z0-9._-]+\.md$/;

export async function parseAndStage(filename: string): Promise<ParseAndStageResult> {
  await requireAdmin();

  // Filename allowlist gate — never read outside fixtures/shows/raw and never
  // accept path traversal.
  if (!FIXTURE_NAME_RE.test(filename)) {
    throw new Error(`parseAndStage: invalid fixture name '${filename}'`);
  }

  const path = join(FIXTURE_DIR, filename);
  const markdown = await readFile(path, "utf8");

  // Step 1: pure parser.
  const parsed = parseSheet(markdown, filename);

  // Step 2: sync-layer enrichment via mock Drive client. Skipping this step
  // would defeat the panel's pipeline-parity claim per plan §pipeline-contract.
  const fixtureFileId = `dev:fixture:${filename}`;
  const parseResult = await enrichWithDrivePins(parsed, mockDriveClient, {
    driveFileId: fixtureFileId,
    fileMeta: {
      driveFileId: fixtureFileId,
      headRevisionId: `mock-rev-${filename.replace(/[^a-zA-Z0-9]/g, "")}`,
      md5Checksum: "f".repeat(32),
      mimeType: "application/vnd.google-apps.spreadsheet",
      modifiedTime: new Date().toISOString(),
    },
  });

  // Step 3: invariants. `prior` is the previously persisted dev state if any
  // dev-Apply created a row; for first-seen runs this is null. For M3 the dev
  // panel does not load `prior` from dev.shows yet (no Apply path in M3) — null
  // is correct because the dev shows table is reset between Playwright tests
  // and remains empty.
  const invariants: InvariantOutcome = runInvariants(null, parseResult);

  // Step 4: route via Phase-1 RPC.
  const supabase = createSupabaseServiceRoleClient();

  const triggeredJson =
    invariants.outcome === "stage" ? invariants.triggeredItems : [];

  // If parser hardErrors fired but invariants returned 'pass'/'stage', still
  // route to pending_ingestions. parseSheet's MI-1 path returns hardErrors+pass.
  const effectiveOutcome: InvariantOutcome["outcome"] =
    parsed.hardErrors.length > 0 ? "hard_fail" : invariants.outcome;

  // Single-pass hard-fail summary. Priority for the canonical code reported
  // to dev.pending_ingestions:
  //   1. parsed.hardErrors[0]?.code  — MI-1_VERSION_DETECTION_FAILED lives
  //      here; the parser short-circuits at version detection so this is
  //      the authoritative source when it's set (per parseSheet's contract
  //      at lib/parser/index.ts:317).
  //   2. invariants.failedCodes[0]   — MI-2..MI-5b come from the invariants
  //      pass when no parser hardError fired but invariants then rejected.
  //   3. 'MI_UNKNOWN'                — defensive sentinel; cannot reach
  //      under current code paths but keeps the column non-null.
  const failedCodes =
    invariants.outcome === "hard_fail" ? invariants.failedCodes : [];
  const invariantMessages =
    invariants.outcome === "hard_fail" ? invariants.messages : [];
  const finalHardCode =
    effectiveOutcome === "hard_fail"
      ? (parsed.hardErrors[0]?.code ?? failedCodes[0] ?? "MI_UNKNOWN")
      : null;
  const finalHardMessage =
    effectiveOutcome === "hard_fail"
      ? [...parsed.hardErrors.map((e) => e.message), ...invariantMessages].join(" | ") ||
        null
      : null;

  const warningSummary =
    parseResult.warnings.length === 0
      ? "no warnings"
      : `${parseResult.warnings.length} parser warning(s)`;

  const { data, error } = await supabase.rpc("dev_phase1_stage", {
    p_drive_file_id: fixtureFileId,
    p_drive_file_name: filename,
    p_parse_result: parseResult as unknown as Record<string, unknown>,
    p_outcome: effectiveOutcome,
    p_triggered_items: triggeredJson as unknown as Record<string, unknown>[],
    p_hard_error_code: effectiveOutcome === "hard_fail" ? finalHardCode : null,
    p_hard_error_message: effectiveOutcome === "hard_fail" ? finalHardMessage : null,
    p_warnings: parseResult.warnings as unknown as Record<string, unknown>[],
    p_warning_summary: warningSummary,
    p_staged_modified_time: new Date().toISOString(),
  });

  if (error) {
    throw new Error(`dev_phase1_stage failed: ${error.message}`);
  }

  const staging = data as ParseAndStageResult["staging"];

  return {
    filename,
    driveFileId: fixtureFileId,
    outcome: effectiveOutcome,
    triggeredItems:
      effectiveOutcome === "stage" && invariants.outcome === "stage"
        ? invariants.triggeredItems.map((t) => {
            const { id, invariant, ...rest } = t as { id: string; invariant: string } & Record<
              string,
              unknown
            >;
            return { id, invariant, details: rest };
          })
        : [],
    hardFailCodes:
      effectiveOutcome === "hard_fail"
        ? [...parsed.hardErrors.map((e) => e.code), ...failedCodes]
        : [],
    parseWarnings: parseResult.warnings,
    rawUnrecognized: parseResult.raw_unrecognized,
    mockMarker: MOCK_MARKER,
    enrichment: {
      reelPin: parseResult.openingReel,
      linkedFolderItemCount: parseResult.diagrams.linkedFolderItems.length,
      embeddedImageCount: parseResult.diagrams.embeddedImages.length,
    },
    staging,
  };
}

/**
 * resetDevSchema — TRUNCATE dev.* CASCADE for the dev panel's reset button.
 * Admin-gated; mirrors the auto-truncate Playwright setup hook.
 */
export async function resetDevSchema(): Promise<{ ok: true }> {
  await requireAdmin();
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase.rpc("dev_truncate_all");
  if (error) {
    throw new Error(`dev_truncate_all failed: ${error.message}`);
  }
  return { ok: true };
}

/** Helper used by the page to enumerate fixture choices. */
export async function listFixtures(): Promise<string[]> {
  await requireAdmin();
  const entries = await readdir(FIXTURE_DIR);
  return entries.filter((n) => n.endsWith(".md")).sort();
}
