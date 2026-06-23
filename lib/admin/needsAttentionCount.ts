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
    // nav-perf Phase 2 (E-lite): the two head-counts are independent — build both
    // queries, then await them CONCURRENTLY (Promise.all the builder promises)
    // instead of sequentially so the badge read costs one wall-time, not two
    // round-trips. Each result is destructured + discriminated per-query
    // (invariant 9; NOT allSettled). `.from()` is a synchronous throw site, so the
    // builders are constructed inside this try alongside the await.
    const ingestionQuery = supabase
      .from("pending_ingestions")
      .select("id", { count: "exact", head: true })
      .is("wizard_session_id", null);
    const syncQuery = supabase
      .from("pending_syncs")
      .select("staged_id", { count: "exact", head: true })
      .is("wizard_session_id", null);
    const [ingestionResult, syncResult] = await Promise.all([ingestionQuery, syncQuery]);
    // invariant 9: destructure { data, error } (alertCount.ts:26 pattern), never a bare result object
    const { data: _ingestionData, count: ingestionCount, error: ingestionError } = ingestionResult;
    void _ingestionData;
    if (ingestionError) return { kind: "infra_error" };
    // A null/undefined count with NO error is an integrity failure, NOT a clean
    // zero — rendering it as count:0 would hide a broken count path behind the
    // no-badge state. Only a real number is "ok". (alertCount.ts:29-31)
    if (typeof ingestionCount !== "number") return { kind: "infra_error" };
    const { data: _syncData, count: syncCount, error: syncError } = syncResult;
    void _syncData;
    if (syncError) return { kind: "infra_error" };
    if (typeof syncCount !== "number") return { kind: "infra_error" };
    return { kind: "ok", count: ingestionCount + syncCount };
  } catch {
    return { kind: "infra_error" };
  }
}
