/**
 * Phase 4 undo action helper (wired in Phase 6) — undoChange(changeLogId).
 *
 * Thin delegation to the lock-taking SECURITY DEFINER `undo_change` RPC. Mirrors
 * the Phase 3 mi11GateActions identity + pattern (00-overview resolution #11):
 *   - cookie-bound AUTHENTICATED server client (the RPC's is_admin() gate +
 *     advisory lock need the admin's session JWT; the RPC is granted to
 *     `authenticated`, NOT service_role).
 *   - NO withShowAdvisoryLock wrap — the RPC self-locks (single-holder, §4.1;
 *     pinned by tests/auth/advisoryLockRpcDeadlock.test.ts). It also self-resolves
 *     drive_file_id from the change-log row (no client-supplied file id — PF23).
 *
 * invariant 9: a returned {error} (RPC infra) AND a thrown client-construction /
 * rpc fault both map to the same typed SYNC_INFRA_ERROR result — never an uncaught
 * throw / untyped admin 500.
 */
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";

// nav-perf tag-caching (Task 9): on success the helper surfaces the affected `showId` so
// undoChangeAction can `revalidateShow(showId)` POST-COMMIT (the self-locking RPC committed by the
// time the action's `await` resolves). showId is server-resolved from the change-log row, never
// client-supplied (PF23); optional so a success whose show_id could not be read still type-checks.
export type UndoChangeResult = { ok: true; showId?: string } | { ok: false; code: string };

type RpcResult = { ok?: boolean; code?: string } | null;

function mapRpcOutcome(
  data: RpcResult,
  error: { message?: string } | null,
  showId?: string | null,
): UndoChangeResult {
  if (error) {
    return { ok: false, code: "SYNC_INFRA_ERROR" };
  }
  if (data && data.ok === false) {
    return { ok: false, code: data.code ?? "SYNC_INFRA_ERROR" };
  }
  if (data && data.ok === true) {
    return showId ? { ok: true, showId } : { ok: true };
  }
  // null / unexpected shape — never a silent success.
  return { ok: false, code: "SYNC_INFRA_ERROR" };
}

export async function undoChange(changeLogId: string): Promise<UndoChangeResult> {
  // The admin-gate throw is the auth boundary, NOT a Supabase infra fault.
  await requireAdmin();

  // nav-perf tag-caching (Task 9): resolve the AUTHORITATIVE show id for the action's POST-COMMIT
  // revalidate (NEVER client-supplied; PF23). Non-locking service-role read of the change-log row;
  // the RPC self-resolves its own drive_file_id for the lock, so this read is off the mutation path
  // and a failure only skips the data-cache bust (rendered data stays correct on the next refresh).
  let resolvedShowId: string | null = null;
  try {
    const service = createSupabaseServiceRoleClient();
    const { data } = await service
      .from("show_change_log")
      .select("show_id")
      .eq("id", changeLogId)
      .maybeSingle();
    resolvedShowId = (data as { show_id?: string | null } | null)?.show_id ?? null;
  } catch {
    resolvedShowId = null;
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("undo_change", {
      p_change_log_id: changeLogId,
    });
    return mapRpcOutcome(data as RpcResult, error, resolvedShowId);
  } catch {
    return { ok: false, code: "SYNC_INFRA_ERROR" };
  }
}
