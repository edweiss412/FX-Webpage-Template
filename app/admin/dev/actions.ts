"use server";
/**
 * app/admin/dev/actions.ts (M3 Task 3.1)
 *
 * Server actions for the /admin/dev panel:
 *
 *   parseAndStage(filename, prior?)        — the result-returning callable.
 *     Runs the FULL Phase-1 pipeline against the selected fixture and writes
 *     through to dev.* via dev_phase1_stage RPC. Returns a ParseAndStageResult.
 *     Used by Vitest test suites (tests/admin/parseAndStage-auth.test.ts +
 *     tests/sync/dev-routing.test.ts) for direct programmatic invocation.
 *
 *   parseAndStageFormAction(formData)      — the form-submission wrapper.
 *     Reads `fixture` from FormData, calls parseAndStage, then redirects to
 *     /admin/dev?fixture=<filename>. THIS is what app/admin/dev/page.tsx wires
 *     into <form action={parseAndStageFormAction}>; it is the only POST entry
 *     point for the parsing pipeline. The redirect lets the resulting page
 *     URL identify the parsed fixture without re-triggering the pipeline.
 *
 *   getStagedResult(filename)              — read-only SELECT.
 *     Loads the most-recent dev.pending_syncs OR dev.pending_ingestions row
 *     for the given filename and returns a ParseAndStageResult-shaped view
 *     for the page to render. NEVER invokes parseSheet / enrichWithDrivePins
 *     / dev_phase1_stage. This is what the page calls on render — converting
 *     GET /admin/dev?fixture=... from "trigger a write" (the Round-1 Finding 2
 *     bug) to "read the previously-staged state". GET is now safe.
 *
 *   resetDevSchema()                       — TRUNCATE dev.* CASCADE via
 *     dev_truncate_all RPC. Form-action wrapper uses void return; the
 *     callable form returns { ok: true } for tests.
 *
 *   listFixtures()                         — enumerate fixtures/shows/raw/*.md
 *     for the picker. Filters out underscore-prefixed names (test temp files).
 *
 * EVERY exported action calls requireAdmin() as its first line per
 * AGENTS.md §1.6 and spec §7.3. The build-time flag gate inside requireAdmin()
 * ALSO blocks the actions from executing in a prod-build, even via a
 * fictitious caller.
 *
 * Pipeline contract (per plan 03-04-tiles.md:23):
 *   parseSheet → enrichWithDrivePins(parsed, mockDriveClient)
 *     → runInvariants(prior, parseResult) → dev_phase1_stage
 *
 * Phase-1 strictness: parseAndStage NEVER inserts into dev.shows directly;
 * status-only updates on existing dev.shows rows are the only modifications
 * that path makes. Inserting new dev.shows is Phase-2/Apply (M6's job).
 *
 * Round 1 Finding 2 (Codex adversarial review) — GET safety:
 *   The previous page design called parseAndStage during Server Component
 *   render based on `?fixture=` in the URL. That made GET /admin/dev?fixture=...
 *   a state-mutating request, violating HTTP safe-method semantics. A browser
 *   prefetch, reload, or cross-site link could trigger Phase-1 writes. The
 *   refactor splits parseAndStage into (a) the result-returning callable
 *   above (kept for test invocation) and (b) parseAndStageFormAction, the
 *   POST-only wrapper the page form invokes. The page reads ?fixture= via
 *   getStagedResult (SELECT only, no pipeline). GET is now safe.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { redirect } from "next/navigation";
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

export async function parseAndStage(
  filename: string,
  /**
   * Optional synthetic `prior` ParseResult. Production callers pass nothing
   * (defaults to null) — Phase-1 first-seen runs in the dev panel have no
   * prior because the dev Apply path doesn't exist yet (the M3 dev panel does
   * not load `prior` from dev.shows; see the comment below at the
   * runInvariants call site). This parameter exists solely so the AC-3.2
   * verification test in tests/sync/dev-routing.test.ts can exercise MI-7
   * SECTION_SHRINKAGE without standing up an Apply path — the test passes a
   * synthetic prior with N hotels to drive runInvariants's comparison branch.
   * M6 will replace this default with a real load-prior-from-dev.shows lookup.
   */
  prior: ParseResult | null = null,
): Promise<ParseAndStageResult> {
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
  // and remains empty. The optional `prior` parameter on parseAndStage allows
  // verification tests (AC-3.2) to inject a synthetic prior to exercise
  // MI-6..MI-14 comparison branches without an Apply path.
  const invariants: InvariantOutcome = runInvariants(prior, parseResult);

  // Step 4: route via Phase-1 RPC.
  const supabase = createSupabaseServiceRoleClient();

  const triggeredJson = invariants.outcome === "stage" ? invariants.triggeredItems : [];

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
  const failedCodes = invariants.outcome === "hard_fail" ? invariants.failedCodes : [];
  const invariantMessages = invariants.outcome === "hard_fail" ? invariants.messages : [];
  const finalHardCode =
    effectiveOutcome === "hard_fail"
      ? (parsed.hardErrors[0]?.code ?? failedCodes[0] ?? "MI_UNKNOWN")
      : null;
  const finalHardMessage =
    effectiveOutcome === "hard_fail"
      ? [...parsed.hardErrors.map((e) => e.message), ...invariantMessages].join(" | ") || null
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
 * Form-action wrapper around parseAndStage. Reads `fixture` from the submitted
 * FormData, runs the pipeline, then redirects to /admin/dev?fixture=<filename>
 * so the URL identifies the parsed fixture without re-triggering the pipeline
 * on a refresh (the page render path uses getStagedResult, a SELECT, not the
 * pipeline). This is the ONLY POST entry point wired into the page's
 * <form action={...}> — the parsing pipeline cannot be reached via GET.
 *
 * Note: redirect() throws NEXT_REDIRECT internally, which terminates the
 * action. Callers do not see a return value.
 */
export async function parseAndStageFormAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const filename = String(formData.get("fixture") ?? "").trim();
  if (!filename) {
    // Empty selection — bounce back to the picker without parsing.
    redirect("/admin/dev");
  }
  // parseAndStage validates the filename with FIXTURE_NAME_RE and throws if
  // invalid. We don't pre-validate here because parseAndStage's gate is the
  // canonical one (single source of truth).
  await parseAndStage(filename);
  // Redirect via filename in the URL so the resulting page render is
  // refresh-friendly. The page's getStagedResult re-reads the row by filename.
  redirect(`/admin/dev?fixture=${encodeURIComponent(filename)}`);
}

/**
 * Read-only SELECT that loads the most-recent dev.pending_syncs OR
 * dev.pending_ingestions row for the given filename and returns a
 * ParseAndStageResult-shaped view for the page to render. NEVER invokes
 * parseSheet / enrichWithDrivePins / dev_phase1_stage — this is the read
 * side of Round 1 Finding 2's GET-safety refactor.
 *
 * Returns null when no row is found (e.g. the dev schema was just reset).
 */
export async function getStagedResult(filename: string): Promise<ParseAndStageResult | null> {
  await requireAdmin();
  if (!FIXTURE_NAME_RE.test(filename)) {
    // Don't leak which filenames are/aren't allowed; treat invalid names as
    // "no result" so the page renders the empty-result branch.
    return null;
  }

  const supabase = createSupabaseServiceRoleClient();
  const fixtureFileId = `dev:fixture:${filename}`;

  // Look in pending_ingestions first (hard-fail outcome) then pending_syncs
  // (stage / pass outcome). The two tables are mutually exclusive per the
  // dev_phase1_stage RPC contract — only one will have a row for a given
  // drive_file_id.
  const ingestionsRes = await supabase
    .schema("dev")
    .from("pending_ingestions")
    .select(
      "id, drive_file_id, drive_file_name, last_error_code, last_error_message, last_warnings",
    )
    .eq("drive_file_id", fixtureFileId)
    .is("wizard_session_id", null)
    .maybeSingle();
  if (ingestionsRes.error) {
    throw new Error(`getStagedResult ingestions read failed: ${ingestionsRes.error.message}`);
  }
  if (ingestionsRes.data) {
    const row = ingestionsRes.data as {
      id: string;
      drive_file_name: string;
      last_error_code: string;
      last_error_message: string;
      last_warnings: ParseWarning[] | null;
    };
    return {
      filename: row.drive_file_name,
      driveFileId: fixtureFileId,
      outcome: "hard_fail",
      triggeredItems: [],
      hardFailCodes: [row.last_error_code],
      parseWarnings: row.last_warnings ?? [],
      rawUnrecognized: [],
      mockMarker: MOCK_MARKER,
      enrichment: {
        reelPin: null,
        linkedFolderItemCount: 0,
        embeddedImageCount: 0,
      },
      staging: {
        kind: "pending_ingestion",
        id: row.id,
        show_id: null,
      },
    };
  }

  const syncsRes = await supabase
    .schema("dev")
    .from("pending_syncs")
    .select("id, drive_file_id, parse_result, triggered_review_items, warning_summary")
    .eq("drive_file_id", fixtureFileId)
    .is("wizard_session_id", null)
    .maybeSingle();
  if (syncsRes.error) {
    throw new Error(`getStagedResult syncs read failed: ${syncsRes.error.message}`);
  }
  if (!syncsRes.data) return null;

  const row = syncsRes.data as {
    id: string;
    parse_result: ParseResult;
    triggered_review_items: Array<{ id: string; invariant: string } & Record<string, unknown>>;
  };
  const parseResult = row.parse_result;
  const outcome: InvariantOutcome["outcome"] =
    row.triggered_review_items.length > 0 ? "stage" : "pass";

  return {
    filename,
    driveFileId: fixtureFileId,
    outcome,
    triggeredItems: row.triggered_review_items.map((t) => {
      const { id, invariant, ...rest } = t;
      return { id, invariant, details: rest };
    }),
    hardFailCodes: [],
    parseWarnings: parseResult.warnings ?? [],
    rawUnrecognized: parseResult.raw_unrecognized ?? [],
    mockMarker: MOCK_MARKER,
    enrichment: {
      reelPin: parseResult.openingReel ?? null,
      linkedFolderItemCount: parseResult.diagrams?.linkedFolderItems?.length ?? 0,
      embeddedImageCount: parseResult.diagrams?.embeddedImages?.length ?? 0,
    },
    staging: {
      kind: "pending_sync",
      id: row.id,
      show_id: null,
    },
  };
}

/**
 * resetDevSchema — TRUNCATE dev.* CASCADE for the dev panel's reset button.
 * Admin-gated; mirrors the auto-truncate Playwright setup hook.
 *
 * Both forms are exported:
 *   - resetDevSchema() returns { ok: true } and is what tests call.
 *   - resetDevSchemaFormAction() is the form-action wrapper that the page
 *     wires into <form action={...}>; it returns void after redirecting.
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

export async function resetDevSchemaFormAction(): Promise<void> {
  await requireAdmin();
  await resetDevSchema();
  // Redirect to a clean /admin/dev so the now-stale ?fixture= query param
  // (if any) doesn't try to re-render a result that was just truncated.
  redirect("/admin/dev");
}

/** Helper used by the page to enumerate fixture choices. */
export async function listFixtures(): Promise<string[]> {
  await requireAdmin();
  const entries = await readdir(FIXTURE_DIR);
  // '_'-prefix is the test-fixture convention; see
  // tests/sync/dev-routing.test.ts beforeAll for the AC-3.3 temp-fixture write
  // (`_temp-mi1-no-version.md`). Hiding underscore-prefixed names from the
  // dev-panel dropdown prevents an operator running `pnpm test tests/sync/`
  // in one terminal from seeing test-only fixtures in the panel UI in another.
  return entries.filter((n) => n.endsWith(".md") && !n.startsWith("_")).sort();
}
