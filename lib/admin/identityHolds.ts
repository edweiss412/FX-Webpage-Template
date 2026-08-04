// lib/admin/identityHolds.ts: cross-show open-holds read for the needs-attention
// rollup (spec 2026-08-03 section 4). Pure grouping core shared by the PostgREST
// reader below and the digest's raw-SQL transport (lib/notify/digest.ts), so page,
// inbox, badge, and email share one grouping semantics. Both render caps live here
// (NOT in the client island): the server inbox needs them too, and server code
// cannot read values from a "use client" module.
import { shapeHoldEntry, type HoldRow } from "@/lib/sync/feed/shapeHoldEntry";

// Flat, READER-normalized row: no nested embed, no Date, no null slug (spec §4).
export type IdentityHoldRow = HoldRow & {
  show_id: string;
  slug: string;
  title: string | null;
};

export type IdentityHoldGroup = {
  showId: string;
  slug: string;
  title: string | null;
  // newest-first; length >= 1; each from shapeHoldEntry(row).summary (spec R8)
  summaries: string[];
  newestCreatedAt: string;
};

export const HOLDS_ROW_CAP = 200;
export const HOLD_SUMMARIES_RENDER_CAP = 10;

export function groupHoldRows(rows: IdentityHoldRow[]): IdentityHoldGroup[] {
  const groups = new Map<string, IdentityHoldGroup>();
  for (const row of rows) {
    const summary = shapeHoldEntry(row).summary;
    const existing = groups.get(row.show_id);
    if (existing) {
      existing.summaries.push(summary);
    } else {
      groups.set(row.show_id, {
        showId: row.show_id,
        slug: row.slug,
        title: row.title,
        summaries: [summary],
        newestCreatedAt: row.created_at,
      });
    }
  }
  return [...groups.values()];
}
