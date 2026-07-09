/**
 * Flow-4 accept action helper — acknowledgeChanges(showId, ids).
 *
 * Thin delegation to the admin-only `acknowledge_changes` SECURITY DEFINER RPC.
 * Mirrors undoChange / mi11GateActions identity + pattern (00-overview resolution #11):
 *   - cookie-bound AUTHENTICATED server client (the RPC's is_admin() gate needs the
 *     admin's session JWT; the RPC is granted to `authenticated`, NOT service_role).
 *   - NO withShowAdvisoryLock wrap — acknowledgement is a lock-free set of the
 *     acknowledged_at column; it mutates no roster/hold state (single-holder §4.1).
 *
 * invariant 9: a returned {error} (RPC infra) AND a thrown client-construction /
 * rpc fault both map to the same typed SYNC_INFRA_ERROR result — never an uncaught
 * throw / untyped admin 500. A null / unexpected RPC shape is likewise NOT a silent
 * success.
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";

export type AcknowledgeChangesResult = { ok: true; count: number } | { ok: false; code: string };

type RpcResult = { ok?: boolean; count?: number } | null;

export async function acknowledgeChanges(
  showId: string,
  ids: string[],
): Promise<AcknowledgeChangesResult> {
  // The admin-gate throw is the auth boundary, NOT a Supabase infra fault.
  await requireAdmin();

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("acknowledge_changes", {
      p_show_id: showId,
      p_ids: ids,
    });
    if (error) {
      return { ok: false, code: "SYNC_INFRA_ERROR" };
    }
    const result = data as RpcResult;
    if (result && result.ok === true && typeof result.count === "number") {
      return { ok: true, count: result.count };
    }
    // null / unexpected shape — never a silent success.
    return { ok: false, code: "SYNC_INFRA_ERROR" };
  } catch {
    return { ok: false, code: "SYNC_INFRA_ERROR" };
  }
}
