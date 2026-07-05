// lib/admin/needsAttentionCount.ts (mobile needs-attention Task 2, spec §4.2)
// Badge-count helper: head-counts ONLY (no row payloads) for the AdminNav
// attention badge. Mirrors lib/admin/alertCount.ts:11-36; the two query
// shapes match loadNeedsAttention's head-count probes exactly
// (lib/admin/loadNeedsAttention.ts:71-73 and :115-117).
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { INBOX_ROUTED_CODES } from "@/lib/messages/adminSurface";

export type NeedsAttentionCountResult = { kind: "ok"; count: number } | { kind: "infra_error" };

export async function loadNeedsAttentionCount(): Promise<NeedsAttentionCountResult> {
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return { kind: "infra_error" };
  }
  // nav-perf Phase 2 (E-lite): the two pending head-counts are independent — build
  // both queries, then await them CONCURRENTLY (Promise.all) so the badge read
  // costs one wall-time. Each result is destructured + discriminated per-query
  // (invariant 9; NOT allSettled). `.from()` is a synchronous throw site, so the
  // builders are constructed inside this try alongside the await.
  let pendingTotal: number;
  try {
    const ingestionQuery = supabase
      .from("pending_ingestions")
      .select("id", { count: "exact", head: true })
      .is("wizard_session_id", null);
    const syncQuery = supabase
      .from("pending_syncs")
      .select("staged_id", { count: "exact", head: true })
      .is("wizard_session_id", null);
    const [ingestionResult, syncResult] = await Promise.all([ingestionQuery, syncQuery]);
    const { data: _ingestionData, count: ingestionCount, error: ingestionError } = ingestionResult;
    void _ingestionData;
    if (ingestionError) return { kind: "infra_error" };
    // A null/undefined count with NO error is an integrity failure, NOT a clean
    // zero — rendering it as count:0 would hide a broken count path (alertCount.ts:29-31).
    if (typeof ingestionCount !== "number") return { kind: "infra_error" };
    const { data: _syncData, count: syncCount, error: syncError } = syncResult;
    void _syncData;
    if (syncError) return { kind: "infra_error" };
    if (typeof syncCount !== "number") return { kind: "infra_error" };
    pendingTotal = ingestionCount + syncCount;
  } catch {
    return { kind: "infra_error" };
  }

  // Third stream (spec §4.5): unresolved inbox-routed alerts on non-archived
  // shows. Same filters as the loader (§6 lockstep) + the same empty-set
  // short-circuit (never drop the .in(); a bare query would count every
  // unresolved per-show alert). Its own try/catch keeps every builder/await
  // wrapped without stretching one long try body (invariant 9).
  let syncProblemCount = 0;
  if (INBOX_ROUTED_CODES.length > 0) {
    try {
      const {
        data: _syncProblemData,
        count: syncProblemCountRaw,
        error: syncProblemError,
      } = await supabase
        .from("admin_alerts")
        .select("id, shows!inner(id)", { count: "exact", head: true })
        .is("resolved_at", null)
        .in("code", INBOX_ROUTED_CODES)
        .not("show_id", "is", null)
        .eq("shows.archived", false);
      void _syncProblemData;
      if (syncProblemError) return { kind: "infra_error" };
      if (typeof syncProblemCountRaw !== "number") return { kind: "infra_error" };
      syncProblemCount = syncProblemCountRaw;
    } catch {
      return { kind: "infra_error" };
    }
  }

  return { kind: "ok", count: pendingTotal + syncProblemCount };
}
