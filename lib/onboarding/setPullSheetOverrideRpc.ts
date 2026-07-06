import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { OverrideSnapshot } from "@/lib/sync/pullSheetOverride";

/**
 * The RPC caller for `set_pull_sheet_override` (spec §5.4). This is the ONLY JS
 * entry point to the SECURITY DEFINER accept/revoke writer. The RPC holds the
 * per-show advisory lock ITSELF (single-holder — invariant 2), so this caller
 * never takes a `show:` lock; it only forwards the six positional args as the
 * PostgREST-named params object and destructures `{ data, error }` at the
 * Supabase call boundary (invariant 9).
 *
 * Row-state CAS (`p_expected_override_snapshot`) and the active-session guard live
 * IN the RPC; a `40001` serialization_failure surfaced here means the override row
 * changed since the admin's page loaded — the route maps it to a `409 stale_review`.
 */
export type SetPullSheetOverrideParams = {
  p_drive_file_id: string;
  p_wizard_session_id: string;
  /** `null` = revoke; a tab name = accept. */
  p_tab_name: string | null;
  /** Server-computed fingerprint on accept; `null` on revoke. */
  p_fingerprint: string | null;
  p_accepted_by: string;
  /** The override snapshot the admin's UI last rendered (row-state CAS). */
  p_expected_override_snapshot: OverrideSnapshot;
};

export type SetPullSheetOverrideResult = { data: unknown; error: unknown };

export async function setPullSheetOverrideRpc(
  params: SetPullSheetOverrideParams,
  deps?: { createClient?: typeof createSupabaseServiceRoleClient },
): Promise<SetPullSheetOverrideResult> {
  const client = (deps?.createClient ?? createSupabaseServiceRoleClient)();
  // Destructure { data, error } at the Supabase call boundary (invariant 9). A
  // returned error (e.g. PostgREST-mapped 40001) is handled by the caller; a thrown
  // error (network/transport) propagates.
  const { data, error } = await client.rpc("set_pull_sheet_override", params);
  return { data, error };
}
