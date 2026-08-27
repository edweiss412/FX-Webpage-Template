// lib/admin/needsAttentionCount.ts (mobile needs-attention Task 2, spec §4.2)
// Badge-count helper: head-counts ONLY (no row payloads) for the AdminNav
// attention badge. Mirrors lib/admin/alertCount.ts:11-36; the two query
// shapes match loadNeedsAttention's head-count probes exactly
// (lib/admin/loadNeedsAttention.ts:71-73 and :115-117).
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadOpenIdentityHolds } from "@/lib/admin/identityHolds";
import { INBOX_ROUTED_CODES } from "@/lib/messages/adminSurface";
import { log } from "@/lib/log";

export type NeedsAttentionCountResult = { kind: "ok"; count: number } | { kind: "infra_error" };

export async function loadNeedsAttentionCount(
  opts: { loadHolds?: typeof loadOpenIdentityHolds } = {},
): Promise<NeedsAttentionCountResult> {
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch (err) {
    void log.error("needs-attention count client construction failed", {
      source: "admin.needsAttentionCount",
      code: "NEEDS_ATTENTION_COUNT_CLIENT_THREW",
      error: err,
    });
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
    if (ingestionError) {
      void log.error("pending_ingestions count returned error", {
        source: "admin.needsAttentionCount",
        code: "NEEDS_ATTENTION_INGESTIONS_COUNT_RETURNED_ERROR",
        error: ingestionError,
      });
      return { kind: "infra_error" };
    }
    // A null/undefined count with NO error is an integrity failure, NOT a clean
    // zero — rendering it as count:0 would hide a broken count path (alertCount.ts:29-31).
    if (typeof ingestionCount !== "number") {
      void log.error("pending_ingestions count returned a non-number", {
        source: "admin.needsAttentionCount",
        code: "NEEDS_ATTENTION_INGESTIONS_COUNT_NOT_NUMBER",
        error: { received: ingestionCount },
      });
      return { kind: "infra_error" };
    }
    const { data: _syncData, count: syncCount, error: syncError } = syncResult;
    void _syncData;
    if (syncError) {
      void log.error("pending_syncs count returned error", {
        source: "admin.needsAttentionCount",
        code: "NEEDS_ATTENTION_SYNCS_COUNT_RETURNED_ERROR",
        error: syncError,
      });
      return { kind: "infra_error" };
    }
    if (typeof syncCount !== "number") {
      void log.error("pending_syncs count returned a non-number", {
        source: "admin.needsAttentionCount",
        code: "NEEDS_ATTENTION_SYNCS_COUNT_NOT_NUMBER",
        error: { received: syncCount },
      });
      return { kind: "infra_error" };
    }
    pendingTotal = ingestionCount + syncCount;
  } catch (err) {
    void log.error("pending head-counts threw", {
      source: "admin.needsAttentionCount",
      code: "NEEDS_ATTENTION_PENDING_COUNTS_THREW",
      error: err,
    });
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
      if (syncProblemError) {
        void log.error("admin_alerts sync-problem count returned error", {
          source: "admin.needsAttentionCount",
          code: "NEEDS_ATTENTION_SYNC_PROBLEM_COUNT_RETURNED_ERROR",
          error: syncProblemError,
        });
        return { kind: "infra_error" };
      }
      if (typeof syncProblemCountRaw !== "number") {
        void log.error("admin_alerts sync-problem count returned a non-number", {
          source: "admin.needsAttentionCount",
          code: "NEEDS_ATTENTION_SYNC_PROBLEM_COUNT_NOT_NUMBER",
          error: { received: syncProblemCountRaw },
        });
        return { kind: "infra_error" };
      }
      syncProblemCount = syncProblemCountRaw;
    } catch (err) {
      void log.error("admin_alerts sync-problem count threw", {
        source: "admin.needsAttentionCount",
        code: "NEEDS_ATTENTION_SYNC_PROBLEM_COUNT_THREW",
        error: err,
      });
      return { kind: "infra_error" };
    }
  }

  // Fourth stream (holds rollup, spec §6): SHOWS with at least one open MI-11
  // identity hold — one per show, matching the inbox's one-card-per-show
  // grouping, so the badge never over-counts a show holding several changes.
  // A holds fault degrades the whole badge (never a silently low count).
  // Wrapped for the same reason as the loader: an injected loadHolds or a
  // future reader edit that throws must degrade the badge, not reject the
  // request (invariant 9 — no infra fault escapes as a rejection).
  let holdShowCount: number;
  try {
    const holds = await (opts.loadHolds ?? loadOpenIdentityHolds)();
    if (holds.kind === "infra_error") return { kind: "infra_error" };
    holdShowCount = holds.groups.length;
  } catch (err) {
    void log.error("identity-holds read threw", {
      source: "admin.needsAttentionCount",
      code: "NEEDS_ATTENTION_HOLDS_READ_THREW",
      error: err,
    });
    return { kind: "infra_error" };
  }

  return { kind: "ok", count: pendingTotal + syncProblemCount + holdShowCount };
}
