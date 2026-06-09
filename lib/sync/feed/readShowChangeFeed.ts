// Phase 5 — Server-only (service-role) feed read data layer.
//
// Merges public.show_change_log (most-recent N, occurred_at desc) with open
// public.sync_holds (pending MI-11) and shapes each row into the canonical
// FeedEntry (00-overview "TypeScript types"). NEVER via PostgREST from() — both
// tables are RLS-locked from anon/authenticated (Phase 1, resolution #10 / F9),
// so the service-role client is the ONLY read path. The consumer (Phase 6 UI)
// renders the truncation disclosure; this layer only sets { entries, truncated,
// totalShown }.

import { UNDOABLE_CHANGE_KINDS } from "@/lib/sync/holds/types";

// Single-source the undo-gating set so the feed predicate and Phase 4's
// undo_change change_kind guard (00-overview resolution #18 / PF22) stay in
// lockstep: exactly {crew_added, crew_removed, crew_renamed}.
const CREW_DOMAIN_CHANGE_KINDS: ReadonlySet<string> = new Set(UNDOABLE_CHANGE_KINDS);

export function isCrewDomainChangeKind(kind: string): boolean {
  return CREW_DOMAIN_CHANGE_KINDS.has(kind);
}
