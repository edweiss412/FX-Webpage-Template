/**
 * lib/admin/showDisplay.ts (M12.12 Task 10)
 *
 * ONE home for the show-display helpers shared across the admin surface
 * (ShowsTable, NeedsAttentionInbox, ArchivedShowRow, ChangeFeedTime,
 * Dashboard, per-show page). Relocated VERBATIM from the deleted
 * components/admin/ActiveShowsPanel.tsx (M10 §B Task 10.6 / Phase 2),
 * which had been dead code since the M12.2 admin redesign replaced it
 * with ShowsTable/NeedsAttentionInbox. No transitional re-export
 * (spec §13).
 */

import type { DataGapsSummary, AutoFixSummary } from "@/lib/parser/dataGaps";

// Flow-4 auto-applied strip (spec §6.1) — per-show roster-shift summary from
// the roster_shift_counts RPC. `total` is added+removed+renamed. Single-defined
// here; Task 7 wires the optional `rosterShift?` field onto ActiveShowRow + the
// badge. This standalone export is imported by lib/admin/loadRecentAutoApplied.ts.
export type RosterShiftSummary = { added: number; removed: number; renamed: number; total: number };

export type ActiveShowRow = {
  id: string;
  slug: string;
  title: string | null;
  showDateStart: string | null;
  showDateEnd: string | null;
  crewCount: number | null;
  lastSyncedAt: string | null;
  lastSyncStatus: string | null;
  // 2026-07-17 sync-cell — last time the cron SUCCESSFULLY reached Drive and
  // evaluated this show (shows.last_checked_at). Distinct from lastSyncedAt
  // (last content apply / error stamp). Feeds the Sync cell "Checked {rel}"
  // line. Required: the Dashboard loader always selects it.
  lastCheckedAt: string | null;
  published: boolean;
  // M12.2 Phase A (§3.2) — single-source live flag computed once in
  // fetchDashboardData (published && today∈span, show tz). ShowsTable's Live
  // pill reads this; it is never recomputed in the component.
  isLive: boolean;
  // M12.2 Phase B2 (§3.2) — finalize-ownership for the Held-vs-Publishing pill
  // split. Computed once in fetchDashboardData from the authoritative
  // `public.readfinalizeowned_b2(p_show_id)` SECURITY DEFINER predicate (true
  // iff an ACTIVE wizard finalize checkpoint owns the show) — queried only for
  // in-flight (`!published && !archived`) active-segment rows, fail-toward-Held
  // on any infra hiccup. NOT derived from `requires_resync` (a clean Unarchive
  // catch-up clears it, so the normal Held state has requires_resync=false).
  // ShowsTable reads this to pick the pill (finalize-owned → "Publishing…"
  // status-warn; else !published → "Held" status-idle); never recomputed.
  finalizeOwned: boolean;
  // M12.2 Phase B2 (§3.1) — archived-segment rows only. `shows.archived_at`
  // ISO string, or null for a row seeded outside the legacy backfill (the
  // ArchivedShowRow renders "Archived (date unknown)" + sorts last). Always
  // null for active-segment rows.
  archivedAt: string | null;
  // parse-data-quality-warnings §6.2b (Task 9) — OPTIONAL per-show data-gaps
  // summary from shows_internal.parse_warnings. Producers omit it → undefined →
  // ShowsTable renders no chip; when a producer supplies it and `total > 0`,
  // ShowsTable renders its data-gaps chip near the row's action. (The former
  // /admin/unpublished loader that populated this was removed; Held shows now
  // live in the dashboard's Active-shows list, which does not set this field.)
  dataGaps?: DataGapsSummary;
  // Flow-4 4.3 badge (spec §6.4/§5.4, Task 7) — OPTIONAL per-show roster-shift
  // summary from the `roster_shift_counts` RPC, populated for PUBLISHED shows
  // only (unpublished → undefined → no roster contribution). When `total > 0`,
  // DataQualityBadge lights amber and folds the roster segment into its
  // accessible name (§6.5). No time-decay: it clears when the last
  // un-dispositioned roster row is Accepted/Undone/superseded.
  rosterShift?: RosterShiftSummary;
  // Flow 6 §3.2 (6.3) — OPTIONAL per-show auto-fix summary (the five
  // *_AUTOCORRECTED codes) from the SAME shows_internal.parse_warnings read.
  // Producers omit it → undefined → ShowsTable renders no auto-fixed chip; when
  // supplied and `total > 0`, ShowsTable renders a NEUTRAL "N auto-fixed" pill
  // (distinct from the amber data-gaps chip — a benign "we fixed it" notice).
  autoFixes?: AutoFixSummary;
};

// Single date-only ISO ('YYYY-MM-DD') → short "M/D/YY", or null for a null input.
// Show dates are date-only ISO, which `new Date` parses as UTC midnight. Use UTC
// getters so the displayed calendar date matches the sheet value regardless of
// server/runtime timezone — local getters render one day earlier in US zones
// (e.g. 2026-06-14 → "6/13" in America/Chicago). M12.3 adversarial R3.
// Owns the toShort logic for BOTH the combined range (below) and the split
// Start/End columns in ShowsTable, so the UTC-safe formatting lives in one place.
export function formatShortDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${String(d.getUTCFullYear()).slice(-2)}`;
}

export function formatDateRange(start: string | null, end: string | null): string | null {
  if (!start && !end) return null;
  if (start && end) return `${formatShortDate(start)} → ${formatShortDate(end)}`;
  return formatShortDate(start ?? end)!;
}

export function formatRelative(iso: string | null, now: Date): string {
  if (!iso) return "never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const minutes = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
