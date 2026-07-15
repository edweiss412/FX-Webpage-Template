import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { sanitizeIdentityString } from "@/lib/adminAlerts/sanitizeIdentityString";
import { emitClassDCode, serializeWarningArray } from "./serializeWarning";
import { clampLimit, type QueryStagedResult, type StagedFilters, type StagedRow } from "./types";

// §5.0-allowlisted projection. parse_result is NEVER selected wholesale — the
// aliased ->warnings jsonb projection keeps the full show payload off the wire.
const SELECT_BASE =
  "id, drive_file_id, parsed_at, staged_modified_time, source_kind, wizard_session_id, wizard_approved, warning_summary, last_finalize_failure_code, warnings:parse_result->warnings";

type RawRow = {
  id: string;
  drive_file_id: string;
  parsed_at: string;
  staged_modified_time: string;
  source_kind: string;
  wizard_session_id: string | null;
  wizard_approved: boolean;
  warning_summary: string;
  last_finalize_failure_code: string | null;
  warnings: unknown;
  wizard_approved_by_email?: string | null;
};

export async function queryStagedParses(filters: StagedFilters): Promise<QueryStagedResult> {
  try {
    const includePii = filters.includePii ?? false;
    const supabase = createSupabaseServiceRoleClient();
    // PII class F: email column is not fetched at all unless revealed.
    const select = includePii ? `${SELECT_BASE}, wizard_approved_by_email` : SELECT_BASE;
    let query = supabase.from("pending_syncs").select(select, { count: "exact" });
    if (filters.sessionId) query = query.eq("wizard_session_id", filters.sessionId);
    if (filters.driveFileId) query = query.eq("drive_file_id", filters.driveFileId);
    // First-element-exists predicate BEFORE the row cap: excludes empty arrays,
    // NULLs, scalars, and objects DB-side (Codex R1 F2 + R2 F3).
    if (filters.warningsOnly) query = query.not("parse_result->warnings->0", "is", null);
    const sinceHours = filters.sinceHours === undefined ? 24 : filters.sinceHours;
    if (sinceHours != null) {
      query = query.gte("parsed_at", new Date(Date.now() - sinceHours * 3_600_000).toISOString());
    }
    const { data, error } = await query
      .order("parsed_at", { ascending: false })
      .limit(clampLimit(filters.limit, 100));
    if (error) return { kind: "infra_error", message: "pending_syncs read failed" };
    const rows = ((data ?? []) as unknown as RawRow[]).map((r): StagedRow => {
      const rawCode = r.last_finalize_failure_code;
      const finalize =
        rawCode == null || rawCode === "" ? { code: "", unrecognized: false } : emitClassDCode(rawCode);
      const out: StagedRow = {
        id: r.id,
        driveFileId: r.drive_file_id,
        parsedAt: r.parsed_at,
        stagedModifiedTime: r.staged_modified_time,
        sourceKind: r.source_kind,
        wizardSessionId: r.wizard_session_id,
        wizardApproved: r.wizard_approved,
        warningSummary: sanitizeIdentityString(r.warning_summary, { includePii }),
        lastFinalizeFailureCode: finalize.code,
        lastFinalizeFailureCodeUnrecognized: finalize.unrecognized,
        warnings: serializeWarningArray(r.warnings, { includePii }),
      };
      if (includePii) out.wizardApprovedByEmail = r.wizard_approved_by_email ?? null;
      return out;
    });
    return { kind: "ok", rows };
  } catch {
    return { kind: "infra_error", message: "pending_syncs read threw" };
  }
}
