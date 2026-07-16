import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { log } from "@/lib/log";

/**
 * Consolidated admin show-page snapshot reader (spec §3.3a).
 *
 * Wraps the single-statement `get_admin_show_review_snapshot` RPC (SECURITY
 * DEFINER + is_admin() gate, STABLE, no writes) so the whole published-review
 * surface reads through ONE statement-level-consistent entry point rather than
 * fanning out per-table `.from()` reads. The RPC returns a jsonb object on the
 * happy path, or SQL NULL when the caller is not an admin OR the show does not
 * exist (the two are deliberately indistinguishable to the client).
 *
 * Invariant 9: the single `supabase.rpc(...)` call boundary destructures
 * { data, error }; a returned error and a thrown error are BOTH surfaced as a
 * discriminable typed infra_error, never a silent null.
 */
type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

// jsonb payload shapes are `to_jsonb(row)` projections; field-level typing is
// Task 8's adapter concern. Keep these to what consumers need at the boundary.
export type ShowRowJson = Record<string, unknown>;
export type ShowsInternalJson = Record<string, unknown>;

export type ShowReviewSnapshot = {
  show: ShowRowJson;
  internal: ShowsInternalJson | null;
  crew_members: unknown[];
  rooms: unknown[];
  hotel_reservations: unknown[];
  transportation: unknown[];
  contacts: unknown[];
};

export type ReadSnapshotResult =
  | { kind: "ok"; snapshot: ShowReviewSnapshot }
  | { kind: "not_admin_or_missing" }
  | { kind: "infra_error"; message: string };

export async function readShowReviewSnapshot(
  supabase: SupabaseServerClient,
  showId: string,
): Promise<ReadSnapshotResult> {
  try {
    const { data, error } = await supabase.rpc("get_admin_show_review_snapshot", {
      p_show_id: showId,
    });
    if (error) {
      void log.error("get_admin_show_review_snapshot returned error", {
        source: "admin.showReview.snapshot",
        error,
      });
      return { kind: "infra_error", message: "show review snapshot read failed" };
    }
    if (data === null || data === undefined) {
      return { kind: "not_admin_or_missing" };
    }
    return { kind: "ok", snapshot: data as ShowReviewSnapshot };
  } catch (err) {
    void log.error("get_admin_show_review_snapshot threw", {
      source: "admin.showReview.snapshot",
      error: err,
    });
    return { kind: "infra_error", message: "show review snapshot read threw" };
  }
}
