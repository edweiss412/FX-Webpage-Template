// Phase 5 — Server-only (service-role) feed read data layer.
//
// Merges public.show_change_log (most-recent N, occurred_at desc) with open
// public.sync_holds (pending MI-11) and shapes each row into the canonical
// FeedEntry (00-overview "TypeScript types"). NEVER via PostgREST from() — both
// tables are RLS-locked from anon/authenticated (Phase 1, resolution #10 / F9),
// so the service-role client is the ONLY read path. The consumer (Phase 6 UI)
// renders the truncation disclosure; this layer only sets { entries, truncated,
// totalShown }.

import { getRequiredDougFacing } from "@/lib/messages/lookup";
import { canonEmail } from "@/lib/sync/holds/holdPort";
import { SyncInfraError } from "@/lib/sync/perFileProcessor";
import { type Disposition, type FeedEntry, type FeedGate } from "@/lib/sync/holds/types";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { type HoldRow } from "@/lib/sync/feed/shapeHoldEntry";
import { shapeChangeFeed, isCrewDomainChangeKind, type ChangeLogRow } from "@/lib/sync/feed/shapeChangeFeed";

// Re-exports: the mapping (and this helper's public import path) moved to
// shapeChangeFeed.ts; existing consumers/tests import from here unchanged.
export { isCrewDomainChangeKind, type ChangeLogRow };

const DEFAULT_LIMIT = 50;

// invariant 9 / P5-F1: every Supabase boundary fault — service-role construction
// throw, .from() throw, network throw, AND a returned {error} — maps to the
// existing typed SyncInfraError (operation + source), so the Phase-6 admin page
// (which calls this server-side after requireAdmin) can catalog-render / degrade
// instead of surfacing an unclassified 500. Mirrors the perFileProcessor /
// readShowGateRow thrown-fault discipline.
type FeedSupabaseClient = ReturnType<typeof createSupabaseServiceRoleClient>;

function createFeedSupabaseClient(): FeedSupabaseClient {
  try {
    return createSupabaseServiceRoleClient();
  } catch (cause) {
    throw new SyncInfraError("readShowChangeFeed.createServiceRoleClient", "thrown_error", cause);
  }
}

async function runFeedRead<T>(
  operation: string,
  query: () => PromiseLike<{
    data: T | null;
    count?: number | null;
    error: { message?: string } | null;
  }>,
): Promise<{ data: T | null; count?: number | null }> {
  try {
    const { data, count, error } = await query();
    if (error) {
      throw new SyncInfraError(operation, "returned_error", error);
    }
    return { data, count: count ?? null };
  } catch (cause) {
    if (cause instanceof SyncInfraError) throw cause;
    throw new SyncInfraError(operation, "thrown_error", cause);
  }
}

/**
 * Server-only (service-role) read of the per-show changes feed.
 *
 * Reads show_change_log (most-recent `limit`, occurred_at desc) + open
 * sync_holds (kind='mi11_pending'), shapes each into a FeedEntry, merges, and
 * returns them newest-first. Pending MI-11 holds are ALWAYS included (the
 * actionable items) and do NOT count toward `truncated` (resolution #8 — that
 * keys only off the show_change_log row count). undo_override holds are NOT
 * feed entries (their effect already shows as an undone/rejected log row).
 *
 * NEVER via PostgREST from() on a cookie-bound client — both tables are
 * RLS-locked from anon/authenticated (Phase 1, F9). The service-role client is
 * the only read path. Every Supabase call destructures { data, error } and
 * throws a typed error on a returned-error (invariant 9).
 */
export async function readShowChangeFeed(
  showId: string,
  opts?: { limit?: number },
): Promise<{ entries: FeedEntry[]; truncated: boolean; totalShown: number }> {
  const limit = opts?.limit ?? DEFAULT_LIMIT;
  const supabase = createFeedSupabaseClient();

  // PERF (nav-perf phase 1, A4): the three reads are independent (they share only
  // showId), so they fan out in ONE Promise.all wave instead of a serial chain.
  // Each read still goes through runFeedRead → returned {error} AND thrown faults
  // become a typed SyncInfraError (invariant 9 / P5-F1) with its own `operation`
  // + `source`. Promise.all the runFeedRead PROMISES: runFeedRead REJECTS on an
  // infra fault, so Promise.all rejects with the FIRST SyncInfraError — exactly
  // the serial behavior (the first read's returned/thrown error surfaced). NEVER
  // allSettled (that would swallow the typed reject and degrade fail-open).
  //
  //   1. Most-recent N show_change_log rows for the show (feed history + undo).
  //   2. Total log-row count for the truncation flag (pending holds excluded —
  //      they always render and never count toward truncation, resolution #8).
  //   3. Open pending MI-11 holds (actionable approve_reject entries). The select
  //      list MUST include base_modified_time (the PF40 staleness token). The
  //      kind='undo_override' holds are internal suppression state, NOT entries.
  const [{ data: logData }, { count: totalLogRows }, { data: holdData }] = await Promise.all([
    runFeedRead<ChangeLogRow[]>("readShowChangeFeed.showChangeLog", () =>
      supabase
        .from("show_change_log")
        .select(
          "id, occurred_at, status, summary, entity_ref, change_kind, individually_undoable, source, acknowledged_at",
        )
        .eq("show_id", showId)
        .order("occurred_at", { ascending: false })
        .limit(limit),
    ),
    runFeedRead<unknown>("readShowChangeFeed.showChangeLogCount", () =>
      supabase
        .from("show_change_log")
        .select("id", { count: "exact", head: true })
        .eq("show_id", showId),
    ),
    runFeedRead<HoldRow[]>("readShowChangeFeed.syncHolds", () =>
      supabase
        .from("sync_holds")
        .select("id, entity_key, held_value, proposed_value, base_modified_time, created_at")
        .eq("show_id", showId)
        .eq("kind", "mi11_pending"),
    ),
  ]);

  // Row → FeedEntry mapping + full-precision merge live in shapeChangeFeed
  // (extracted pure so the dev gallery shapes synthetic rows identically).
  const entries: FeedEntry[] = shapeChangeFeed(
    (logData ?? []) as ChangeLogRow[],
    (holdData ?? []) as HoldRow[],
  );

  return {
    entries,
    truncated: (totalLogRows ?? 0) > limit,
    totalShown: entries.length,
  };
}
