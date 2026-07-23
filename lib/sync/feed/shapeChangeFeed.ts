// The PURE change-feed shaper, extracted from readShowChangeFeed (modal-state-
// coverage spec §3.1) so the dev gallery can shape synthetic show_change_log
// rows through the exact production mapping instead of hand-rolling FeedEntry.
// readShowChangeFeed remains the only DB read path; this module owns the
// row → FeedEntry mapping and the full-precision cross-source merge.
import { UNDOABLE_CHANGE_KINDS, type FeedEntry } from "@/lib/sync/holds/types";
import { shapeHoldEntry, type HoldRow } from "@/lib/sync/feed/shapeHoldEntry";
import { toIso, sortKeyFromRaw } from "@/lib/sync/feed/sortKey";

// Single-source the undo-gating set so the feed predicate and Phase 4's
// undo_change change_kind guard (00-overview resolution #18 / PF22) stay in
// lockstep: exactly {crew_added, crew_removed, crew_renamed}.
const CREW_DOMAIN_CHANGE_KINDS: ReadonlySet<string> = new Set(UNDOABLE_CHANGE_KINDS);

export function isCrewDomainChangeKind(kind: string): boolean {
  return CREW_DOMAIN_CHANGE_KINDS.has(kind);
}

export type ChangeLogRow = {
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
 * Shape show_change_log rows + open mi11 holds into the merged, newest-first
 * FeedEntry list. Each entry carries an INTERNAL full-precision sort key
 * (`sortKey`) derived from the RAW timestamptz string (microseconds intact).
 * The merge sorts on sortKey, never on the ms-truncated display `occurredAt`
 * (P5-F4/P5-F5 microsecond-truncation class): two cross-source rows differing
 * only below 1ms must keep their true chronological order. sortKey is stripped
 * before returning so it never leaks into FeedEntry.
 */
export function shapeChangeFeed(logRows: ChangeLogRow[], holdRows: HoldRow[]): FeedEntry[] {
  type RankedEntry = FeedEntry & { sortKey: string };

  const logEntries: RankedEntry[] = logRows.map((row) => {
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

  const holdEntries: RankedEntry[] = holdRows.map(shapeHoldEntry);

  // Sort newest-first on the FULL-PRECISION raw sortKey, NOT the ms-truncated
  // display value — otherwise a hold and a change-log row in the same ms but
  // different microseconds compare equal and the holds-before-logs build order
  // can float an OLDER hold ahead of a NEWER change (P5-F5). Strip sortKey after.
  return [...holdEntries, ...logEntries]
    .sort((a, b) => (a.sortKey < b.sortKey ? 1 : a.sortKey > b.sortKey ? -1 : 0))
    .map(({ sortKey: _sortKey, ...entry }) => entry);
}
