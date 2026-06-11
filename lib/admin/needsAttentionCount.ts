// lib/admin/needsAttentionCount.ts (mobile needs-attention Task 2, spec §4.2)
// Badge-count helper: head-counts ONLY (no row payloads) for the AdminNav
// attention badge. Mirrors lib/admin/alertCount.ts:11-36; the two query
// shapes match loadNeedsAttention's head-count probes exactly
// (lib/admin/loadNeedsAttention.ts:71-73 and :115-117).
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type NeedsAttentionCountResult = { kind: "ok"; count: number } | { kind: "infra_error" };

export async function loadNeedsAttentionCount(): Promise<NeedsAttentionCountResult> {
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return { kind: "infra_error" };
  }
  try {
    // invariant 9: destructure { data, error } (alertCount.ts:26 pattern), never a bare result object
    const {
      data: _ingestionData,
      count: ingestionCount,
      error: ingestionError,
    } = await supabase
      .from("pending_ingestions")
      .select("id", { count: "exact", head: true })
      .is("wizard_session_id", null);
    void _ingestionData;
    if (ingestionError) return { kind: "infra_error" };
    // A null/undefined count with NO error is an integrity failure, NOT a clean
    // zero — rendering it as count:0 would hide a broken count path behind the
    // no-badge state. Only a real number is "ok". (alertCount.ts:29-31)
    if (typeof ingestionCount !== "number") return { kind: "infra_error" };
    const {
      data: _syncData,
      count: syncCount,
      error: syncError,
    } = await supabase
      .from("pending_syncs")
      .select("staged_id", { count: "exact", head: true })
      .is("wizard_session_id", null);
    void _syncData;
    if (syncError) return { kind: "infra_error" };
    if (typeof syncCount !== "number") return { kind: "infra_error" };
    return { kind: "ok", count: ingestionCount + syncCount };
  } catch {
    return { kind: "infra_error" };
  }
}
