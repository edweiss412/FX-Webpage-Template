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
import {
  UNDOABLE_CHANGE_KINDS,
  type Disposition,
  type FeedEntry,
  type FeedGate,
} from "@/lib/sync/holds/types";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { shapeHoldEntry, type HoldRow } from "@/lib/sync/feed/shapeHoldEntry";
import { toIso, sortKeyFromRaw } from "@/lib/sync/feed/sortKey";

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

// Single-source the undo-gating set so the feed predicate and Phase 4's
// undo_change change_kind guard (00-overview resolution #18 / PF22) stay in
// lockstep: exactly {crew_added, crew_removed, crew_renamed}.
const CREW_DOMAIN_CHANGE_KINDS: ReadonlySet<string> = new Set(UNDOABLE_CHANGE_KINDS);

export function isCrewDomainChangeKind(kind: string): boolean {
  return CREW_DOMAIN_CHANGE_KINDS.has(kind);
}

type ChangeLogRow = {
  id: string;
  occurred_at: string;
  status: string;
  summary: string;
  entity_ref: string | null;
  change_kind: string;
  individually_undoable: boolean;
  source: string;
  acknowledged_at: string | null;
};

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

  // Each entry carries an INTERNAL full-precision sort key (`sortKey`) derived
  // from the RAW timestamptz string (microseconds intact). The merge sorts on
  // sortKey, never on the ms-truncated display `occurredAt` (P5-F4/P5-F5
  // microsecond-truncation class): two cross-source rows differing only below
  // 1ms must keep their true chronological order. sortKey is stripped before
  // returning so it never leaks into FeedEntry.
  type RankedEntry = FeedEntry & { sortKey: string };

  const logEntries: RankedEntry[] = ((logData ?? []) as ChangeLogRow[]).map((row) => {
    const base: RankedEntry = {
      id: row.id,
      // Display only — Date-normalized to canonical ISO (P5-F4/P5-F5: display
      // fields go through Date; sort/token keys stay full-precision raw).
      occurredAt: toIso(row.occurred_at) ?? row.occurred_at,
      sortKey: sortKeyFromRaw(row.occurred_at),
      status: row.status as FeedEntry["status"],
      summary: row.summary,
      action: "none",
      entityRef: row.entity_ref,
      // Disposition axis (spec 2026-07-15 §2): keyed on the RAW selected
      // acknowledged_at being SQL NULL — mirrors the acknowledge_changes RPC
      // WHERE (source/status/acknowledged_at) exactly.
      acceptable:
        row.source === "auto_apply" && row.status === "applied" && row.acknowledged_at == null,
      acknowledgedAt: toIso(row.acknowledged_at),
    };
    // Undo iff crew-domain change_kind AND status='applied' AND
    // individually_undoable (resolution #P4-F4). The third conjunct hides the
    // perpetually-failing Undo on multi-node closed-group rename-swap rows.
    if (
      row.status === "applied" &&
      isCrewDomainChangeKind(row.change_kind) &&
      row.individually_undoable === true
    ) {
      return { ...base, action: "undo", changeLogId: row.id };
    }
    return base;
  });

  const holdEntries: RankedEntry[] = ((holdData ?? []) as HoldRow[]).map(shapeHoldEntry);

  // Sort newest-first on the FULL-PRECISION raw sortKey, NOT the ms-truncated
  // display value — otherwise a hold and a change-log row in the same ms but
  // different microseconds compare equal and the holds-before-logs build order
  // can float an OLDER hold ahead of a NEWER change (P5-F5). Strip sortKey after.
  const entries: FeedEntry[] = [...holdEntries, ...logEntries]
    .sort((a, b) => (a.sortKey < b.sortKey ? 1 : a.sortKey > b.sortKey ? -1 : 0))
    .map(({ sortKey: _sortKey, ...entry }) => entry);

  return {
    entries,
    truncated: (totalLogRows ?? 0) > limit,
    totalShown: entries.length,
  };
}
