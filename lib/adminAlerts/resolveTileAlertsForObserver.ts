import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

type Client = ReturnType<typeof createSupabaseServiceRoleClient>;

export type ResolveTileAlertsForObserverInput = {
  showId: string | null;
  /** The observer whose render made this observation: a crew member id, or "admin". */
  viewerKey: string;
  /** Tiles that demonstrably rendered clean THIS request. */
  tileIds: readonly string[];
};

/**
 * Resolve TILE_SERVER_RENDER_FAILED rows this observer is entitled to clear.
 *
 * Keyed on BOTH discriminators. Permission gates live inside the wrapped seam
 * (e.g. transportTileVisible in TravelSection), so different viewers execute
 * different code for the same tileId; a viewer who skips the failing path must
 * not clear an alert that is still live for the viewer who reaches it.
 *
 * Sets `resolved_at` only. `resolved_by` stays NULL, the system-resolved
 * convention of every precedent resolver.
 */
export async function resolveTileAlertsForObserver(
  input: ResolveTileAlertsForObserverInput,
  client?: Client,
): Promise<void> {
  // An empty `.in()` list must never reach PostgREST (mirrors resolveAdminAlerts).
  if (input.tileIds.length === 0) return;

  const supabase = client ?? createSupabaseServiceRoleClient();
  let query = supabase
    .from("admin_alerts")
    .update({ resolved_at: new Date().toISOString() })
    .eq("code", "TILE_SERVER_RENDER_FAILED")
    .eq("context->>viewerKey", input.viewerKey)
    .in("context->>tileId", [...input.tileIds])
    .is("resolved_at", null);

  query = input.showId === null ? query.is("show_id", null) : query.eq("show_id", input.showId);

  const { data, error } = await query.select("id");

  if (error) {
    throw new Error(`tile alert resolve failed: ${error.message ?? String(error)}`);
  }
  // Invariant 9 requires the boundary destructure both halves. Nothing
  // downstream needs the resolved rows; matching zero rows is a normal outcome
  // (the row may name another observer, or have been resolved manually).
  void data;
}
