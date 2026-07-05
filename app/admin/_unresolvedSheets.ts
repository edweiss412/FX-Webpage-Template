/**
 * app/admin/_unresolvedSheets.ts (spec 2026-07-05-finalize-resume-deadlock §3.2)
 *
 * Admin-private guarded read of the sheets that block a paused finalize from
 * finishing, consumed by app/admin/page.tsx's `in_progress` re-entry branch and
 * rendered by <FinalizeInProgress />. Reproduces the finalize route's
 * `unresolvedManifestCount` predicate EXACTLY (app/api/admin/onboarding/finalize/
 * route.ts:333-366) so the demoted wedge row — status='staged' WITH a non-null
 * last_finalize_failure_code, the most common stuck case set by demotePending —
 * is surfaced, not just the three blocking statuses.
 *
 * Underscore prefix keeps Next.js routing from treating this file as a page
 * (mirrors app/admin/_finalizeCheckpoint.ts). Follows the §B Supabase
 * call-boundary contract (AGENTS.md invariant 9): every read destructures
 * { data, error }; any fault returns a discriminated { kind: 'infra_error' }
 * rather than throwing. Registered in tests/admin/_metaInfraContract.test.ts.
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";

// The manifest statuses the read queries. The three genuinely-blocking statuses
// PLUS 'staged' — a demoted row is reset to 'staged' by demotePending while its
// pending_syncs.last_finalize_failure_code is stamped, so a 'staged' row is
// unresolved iff its failure code is non-null (filtered in JS below).
const QUERIED_STATUSES = [
  "hard_failed",
  "live_row_conflict",
  "discard_retryable",
  "staged",
] as const;
const BLOCKING_STATUSES = new Set<string>([
  "hard_failed",
  "live_row_conflict",
  "discard_retryable",
]);

export type UnresolvedSheet = {
  driveFileId: string;
  failureCode: string | null;
  displayName: string;
  reApplyHref: string;
};

export type UnresolvedSheetsInfraError = {
  kind: "infra_error";
  message: string;
};

export type UnresolvedSheetsResult = UnresolvedSheet[] | UnresolvedSheetsInfraError;

type ManifestRow = { drive_file_id: string; status: string };
type PendingRow = {
  drive_file_id: string;
  last_finalize_failure_code: string | null;
  parse_result: { show?: { title?: string | null } | null } | null;
};

// Mirrors reApplyUrl (app/api/admin/onboarding/finalize/route.ts:247-249) — the
// server builds the href so the client never composes the URL (§3.1).
function reApplyHref(wizardSessionId: string, driveFileId: string): string {
  return `/admin/onboarding/staged/${encodeURIComponent(wizardSessionId)}/${encodeURIComponent(driveFileId)}`;
}

function displayNameFor(parseResult: PendingRow["parse_result"], driveFileId: string): string {
  const title = parseResult?.show?.title;
  return typeof title === "string" && title.length > 0 ? title : driveFileId;
}

export async function readUnresolvedSheets(
  wizardSessionId: string,
): Promise<UnresolvedSheetsResult> {
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch (err) {
    return {
      kind: "infra_error",
      message: `readUnresolvedSheets: server client construction failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Read 1: manifest rows at any queried status for this session.
  let manifestRows: ManifestRow[];
  try {
    const { data, error } = await supabase
      .from("onboarding_scan_manifest")
      .select("drive_file_id, status")
      .eq("wizard_session_id", wizardSessionId)
      .in("status", QUERIED_STATUSES as unknown as string[]);
    if (error) {
      return {
        kind: "infra_error",
        message: `readUnresolvedSheets: manifest query failed: ${error.message}`,
      };
    }
    manifestRows = (data ?? []) as ManifestRow[];
  } catch (err) {
    return {
      kind: "infra_error",
      message: `readUnresolvedSheets: manifest query threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (manifestRows.length === 0) return [];

  const driveFileIds = [...new Set(manifestRows.map((r) => r.drive_file_id))];

  // Read 2: the failure code + title for those drive ids.
  let pendingRows: PendingRow[];
  try {
    const { data, error } = await supabase
      .from("pending_syncs")
      .select("drive_file_id, last_finalize_failure_code, parse_result")
      .eq("wizard_session_id", wizardSessionId)
      .in("drive_file_id", driveFileIds);
    if (error) {
      return {
        kind: "infra_error",
        message: `readUnresolvedSheets: pending query failed: ${error.message}`,
      };
    }
    pendingRows = (data ?? []) as PendingRow[];
  } catch (err) {
    return {
      kind: "infra_error",
      message: `readUnresolvedSheets: pending query threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const pendingByDriveId = new Map(pendingRows.map((r) => [r.drive_file_id, r]));

  // Compose + filter by the EXACT unresolvedManifestCount predicate: blocking
  // status OR (staged AND failure code non-null). A fresh unchecked-clean staged
  // row (no failure code) is correctly excluded.
  const unresolved: UnresolvedSheet[] = [];
  for (const m of manifestRows) {
    const pending = pendingByDriveId.get(m.drive_file_id);
    const failureCode = pending?.last_finalize_failure_code ?? null;
    const include =
      BLOCKING_STATUSES.has(m.status) || (m.status === "staged" && failureCode !== null);
    if (!include) continue;
    unresolved.push({
      driveFileId: m.drive_file_id,
      failureCode,
      displayName: displayNameFor(pending?.parse_result ?? null, m.drive_file_id),
      reApplyHref: reApplyHref(wizardSessionId, m.drive_file_id),
    });
  }
  return unresolved;
}
