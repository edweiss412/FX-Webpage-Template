/**
 * lib/realtime/showInvalidation.ts (M4 Task 4.16 — server publish helper)
 *
 * Application-side helper that publishes a `show:<id>:invalidation` Broadcast
 * event from inside a Postgres transaction. Used by write paths on
 * public.shows (M6 Phase-2 commits) that do NOT have a statement-level
 * publish trigger in M2 — the helper is the explicit publish path for those
 * commits.
 *
 * Wraps the SQL function public.publish_show_invalidation(uuid) added in
 * supabase/migrations/20260503000000_publish_show_invalidation_helper.sql.
 * The function emits the SAME envelope shape that
 * public.publish_show_invalidation_after_statement() emits, so subscribers
 * (the ShowRealtimeBridge client island in Checkpoint B) handle both sources
 * uniformly.
 *
 * Required EXECUTE grant: service_role only. Caller MUST be a server-side
 * code path that has already passed its auth gate; never expose this through
 * a client-direct supabase-js call.
 *
 * @param tx Supabase client bound to the active transaction. Pass either the
 *           service-role client (writes that don't need RLS) or a request-
 *           scoped cookie-bound client elevated to service_role after the
 *           caller's app-layer gate has fired.
 * @param showId The show_id UUID to publish for. Subscribers are scoped to
 *               `show:${showId}:invalidation`.
 *
 * Throws on RPC error so the caller's transaction rolls back instead of
 * silently committing a write that never publishes.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export async function publishShowInvalidation(
  tx: SupabaseClient,
  showId: string,
): Promise<void> {
  const { error } = await tx.rpc("publish_show_invalidation", {
    p_show_id: showId,
  });
  if (error) {
    throw new Error(`publishShowInvalidation: ${error.message}`);
  }
}
