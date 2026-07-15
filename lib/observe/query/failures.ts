import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { sanitizeIdentityString } from "@/lib/adminAlerts/sanitizeIdentityString";
import { emitClassDCode, serializeWarningArray } from "./serializeWarning";
import { clampLimit, type FailureFilters, type FailureRow, type QueryFailuresResult } from "./types";

const SELECT =
  "id, drive_file_id, drive_file_name, first_seen_at, last_attempt_at, attempt_count, last_error_code, last_error_message, last_warnings, wizard_session_id";

type RawRow = {
  id: string;
  drive_file_id: string;
  drive_file_name: string;
  first_seen_at: string;
  last_attempt_at: string;
  attempt_count: number;
  last_error_code: string;
  last_error_message: string;
  last_warnings: unknown;
  wizard_session_id: string | null;
};

export async function queryIngestFailures(filters: FailureFilters): Promise<QueryFailuresResult> {
  try {
    const includePii = filters.includePii ?? false;
    const supabase = createSupabaseServiceRoleClient();
    let query = supabase.from("pending_ingestions").select(SELECT, { count: "exact" });
    if (filters.sessionId) query = query.eq("wizard_session_id", filters.sessionId);
    if (filters.code) query = query.eq("last_error_code", filters.code);
    const sinceHours = filters.sinceHours === undefined ? 24 : filters.sinceHours;
    if (sinceHours != null) {
      query = query.gte(
        "last_attempt_at",
        new Date(Date.now() - sinceHours * 3_600_000).toISOString(),
      );
    }
    const { data, error } = await query
      .order("last_attempt_at", { ascending: false })
      .limit(clampLimit(filters.limit, 100));
    if (error) return { kind: "infra_error", message: "pending_ingestions read failed" };
    const rows = ((data ?? []) as unknown as RawRow[]).map((r): FailureRow => {
      const code = emitClassDCode(r.last_error_code);
      return {
        id: r.id,
        driveFileId: r.drive_file_id,
        driveFileName: sanitizeIdentityString(r.drive_file_name, { includePii }),
        firstSeenAt: r.first_seen_at,
        lastAttemptAt: r.last_attempt_at,
        attemptCount: r.attempt_count,
        lastErrorCode: code.code,
        lastErrorCodeUnrecognized: code.unrecognized,
        lastErrorMessage: sanitizeIdentityString(r.last_error_message, { includePii }),
        lastWarnings: serializeWarningArray(r.last_warnings, { includePii }),
        wizardSessionId: r.wizard_session_id,
      };
    });
    return { kind: "ok", rows };
  } catch {
    return { kind: "infra_error", message: "pending_ingestions read threw" };
  }
}
