import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

/**
 * The RPC caller for `set_published_pull_sheet_override` (spec 2026-07-23 §3.2). The ONLY JS
 * entry to the SECURITY DEFINER published-show accept/revoke writer. The RPC holds the per-show
 * advisory lock ITSELF (single-holder — invariant 2), so this caller never takes a `show:` lock.
 * It forwards positional args as the PostgREST-named params object and destructures
 * `{ data, error }` at the Supabase boundary (invariant 9).
 *
 * CAS (`p_expected_override_snapshot`, structural jsonb) and the lifecycle guard live IN the RPC.
 * A `40001` here means the override row changed since the page loaded → route maps to 409
 * `stale_review`; `55000`/`P0002` → 409 `lifecycle_conflict`; anything else → 502 `sync_infra`.
 */
export type SetPublishedPullSheetOverrideParams = {
  p_drive_file_id: string;
  /** `null` = revoke; a tab name = accept. */
  p_tab_name: string | null;
  /** Server-scanned fingerprint on accept; `null` on revoke. */
  p_fingerprint: string | null;
  p_accepted_by: string;
  /** The override snapshot the admin's UI last rendered (structural row-state CAS). */
  p_expected_override_snapshot: { tabName: string | null; fingerprint: string | null } | null;
};

export type SetPublishedPullSheetOverrideResult = { data: unknown; error: unknown };

export async function setPublishedPullSheetOverrideRpc(
  params: SetPublishedPullSheetOverrideParams,
  deps?: { createClient?: typeof createSupabaseServiceRoleClient },
): Promise<SetPublishedPullSheetOverrideResult> {
  const client = (deps?.createClient ?? createSupabaseServiceRoleClient)();
  // not-subject-to-meta: _metaInfraContract's registry scope is the auth helpers
  // (tests/auth/_metaInfraContract.test.ts), not RPC callers. This is the sole Supabase call
  // boundary for the published override; it destructures { data, error } (invariant 9) and the
  // route's typed-result tests assert every §3.4 path (returned-error → mapped status; thrown →
  // 502). Mirrors lib/onboarding/setPullSheetOverrideRpc.ts, which carries no registry row.
  const { data, error } = await client.rpc("set_published_pull_sheet_override", params);
  return { data, error };
}
