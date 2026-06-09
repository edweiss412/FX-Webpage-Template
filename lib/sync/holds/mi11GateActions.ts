/**
 * Phase 3 Tasks 3.6–3.8 — admin server actions that resolve an open MI-11 hold via the
 * lock-taking SECURITY DEFINER RPCs (mi11_approve_hold / mi11_reject_hold).
 *
 * TWO clients (resolution #17 / PF23 / PF24):
 *   - SERVICE-ROLE server client for the NON-locking sync_holds lookup READ (sync_holds is RLS-locked
 *     from `authenticated` per F9 / resolution #10 — an authed SELECT would permission-error).
 *   - cookie-bound AUTHENTICATED server client for the mutation RPC (the RPC's is_admin() gate +
 *     advisory lock need the admin's session JWT; the RPC is granted to `authenticated`, NOT service_role).
 *
 * Neither wraps the RPC in withShowAdvisoryLock — the RPC self-locks (single-holder, §4.1; pinned by
 * tests/auth/advisoryLockRpcDeadlock.test.ts).
 *
 * `expectedBaseModifiedTime` is the value the admin SAW WHEN THE FEED RENDERED (FeedGate.baseModifiedTime),
 * supplied by the CALLER and forwarded to the RPC UNCHANGED (resolution #26 / PF40). It is NEVER sourced
 * from a fresh server read of the hold — doing so makes the RPC's `base IS DISTINCT FROM expected` guard
 * vacuous. `drive_file_id` / `show_id` are NEVER taken from the client (PF23).
 */
import { fetchDriveFileMetadata } from "@/lib/drive/fetch";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";

export type Mi11GateResult = { ok: true } | { ok: false; code: string };

type RpcResult = { ok?: boolean; code?: string } | null;

function mapRpcOutcome(
  data: RpcResult,
  error: { message?: string } | null,
): Mi11GateResult {
  // invariant 9: distinguish returned-error (RPC infra) from a discriminated RPC result.
  if (error) {
    return { ok: false, code: "SYNC_INFRA_ERROR" };
  }
  if (data && data.ok === false) {
    return { ok: false, code: data.code ?? "SYNC_INFRA_ERROR" };
  }
  if (data && data.ok === true) {
    return { ok: true };
  }
  // null/unexpected shape — treat as an infra fault, never a silent success.
  return { ok: false, code: "SYNC_INFRA_ERROR" };
}

/**
 * Approve an open MI-11 hold. The Drive `modifiedTime` is re-read in this action (the RPC cannot read
 * Drive, §4.1 / F13) and passed as `p_observed_modified_time`. A Drive-read failure (thrown OR a
 * returned-error / missing modifiedTime) → typed non-mutating MI11_DRIVE_RECHECK_FAILED, the RPC is
 * NOT called (F15 / invariant 9).
 */
export async function approveMi11Hold(
  holdId: string,
  expectedBaseModifiedTime: string | null,
): Promise<Mi11GateResult> {
  await requireAdmin();

  // (1) NON-locking SERVICE-ROLE read → the AUTHORITATIVE drive_file_id (NEVER client-supplied; PF23).
  const service = createSupabaseServiceRoleClient();
  const { data: hold, error: lookupError } = await service
    .from("sync_holds")
    .select("drive_file_id, show_id")
    .eq("id", holdId)
    .maybeSingle();
  if (lookupError) {
    return { ok: false, code: "SYNC_INFRA_ERROR" };
  }
  if (!hold || !hold.drive_file_id) {
    // gone / already-released — no Drive call, no RPC call.
    return { ok: false, code: "MI11_HOLD_ALREADY_RESOLVED" };
  }

  // (2) Drive re-check BEFORE the RPC. Thrown OR returned-error / missing modtime → typed, no RPC.
  let observedModifiedTime: string;
  try {
    const meta = (await fetchDriveFileMetadata(hold.drive_file_id)) as {
      modifiedTime?: string | null;
      ok?: boolean;
    };
    if (!meta || meta.ok === false || !meta.modifiedTime) {
      return { ok: false, code: "MI11_DRIVE_RECHECK_FAILED" };
    }
    observedModifiedTime = meta.modifiedTime;
  } catch {
    return { ok: false, code: "MI11_DRIVE_RECHECK_FAILED" };
  }

  // (3) mutation RPC via the AUTHENTICATED client; forward the CALLER token UNCHANGED (PF40).
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("mi11_approve_hold", {
    p_hold_id: holdId,
    p_observed_modified_time: observedModifiedTime,
    p_expected_base_modified_time: expectedBaseModifiedTime,
  });
  return mapRpcOutcome(data as RpcResult, error);
}

/**
 * Reject an open MI-11 hold (convert → undo_override). NO Drive read (Reject suppresses, doesn't apply
 * a sheet value) and NO service-role pre-read: the RPC resolves its own drive_file_id for the advisory
 * lock and returns MI11_HOLD_ALREADY_RESOLVED for a gone hold. The caller-supplied feed token is
 * forwarded UNCHANGED (PF40).
 */
export async function rejectMi11Hold(
  holdId: string,
  expectedBaseModifiedTime: string | null,
): Promise<Mi11GateResult> {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("mi11_reject_hold", {
    p_hold_id: holdId,
    p_expected_base_modified_time: expectedBaseModifiedTime,
  });
  return mapRpcOutcome(data as RpcResult, error);
}
