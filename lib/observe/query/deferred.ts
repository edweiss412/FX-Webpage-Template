import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { sanitizeIdentityString } from "@/lib/adminAlerts/sanitizeIdentityString";
import {
  clampLimit,
  type DeferredFilters,
  type DeferredRow,
  type QueryDeferredResult,
} from "./types";

const SELECT_BASE =
  "id, drive_file_id, wizard_session_id, deferred_kind, deferred_at, deferred_at_modified_time, reason";

type RawRow = {
  id: string;
  drive_file_id: string;
  wizard_session_id: string | null;
  deferred_kind: string;
  deferred_at: string;
  deferred_at_modified_time: string | null;
  reason: string | null;
  deferred_by_email?: string | null;
};

export async function queryDeferred(filters: DeferredFilters): Promise<QueryDeferredResult> {
  try {
    const includePii = filters.includePii ?? false;
    const supabase = createSupabaseServiceRoleClient();
    // §5.0 class F: deferred_by_email fetched only under --reveal-email.
    const select = includePii ? `${SELECT_BASE}, deferred_by_email` : SELECT_BASE;
    const { data, error } = await supabase
      .from("deferred_ingestions")
      .select(select, { count: "exact" })
      .order("deferred_at", { ascending: false })
      .limit(clampLimit(filters.limit, 100));
    if (error) return { kind: "infra_error", message: "deferred_ingestions read failed" };
    const rows = ((data ?? []) as unknown as RawRow[]).map((r): DeferredRow => {
      const out: DeferredRow = {
        id: r.id,
        driveFileId: r.drive_file_id,
        wizardSessionId: r.wizard_session_id,
        deferredKind: r.deferred_kind, // §5.0 class B: CHECK-constrained enum
        deferredAt: r.deferred_at,
        deferredAtModifiedTime: r.deferred_at_modified_time,
        reason: sanitizeIdentityString(r.reason, { includePii }),
      };
      if (includePii) out.deferredByEmail = r.deferred_by_email ?? null;
      return out;
    });
    return { kind: "ok", rows };
  } catch {
    return { kind: "infra_error", message: "deferred_ingestions read threw" };
  }
}
