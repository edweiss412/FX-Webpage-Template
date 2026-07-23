/**
 * components/admin/dev/snapshots.ts — §4.3 client-snapshot allowlists for the
 * dev capture bundle. Pure projections: anything not listed is absent.
 * EXCLUDED by design: crewEmails (raw emails), pickerCrew (roster identity
 * rows), every function prop, `now` (redundant with meta.capturedAt).
 * Array caps: 50 with a sibling `<name>Truncated: true` marker only when the
 * cap bites (§10). Deeper email/token content inside `data`/`bySection`/`feed`
 * is scrubbed later by the §4.5 value-walk — this layer only projects.
 */

const ARRAY_CAP = 50; // §10

function capped(
  out: Record<string, unknown>,
  name: string,
  value: readonly unknown[] | undefined,
): void {
  if (value === undefined) return;
  if (value.length > ARRAY_CAP) {
    out[name] = value.slice(0, ARRAY_CAP);
    out[`${name}Truncated`] = true;
  } else {
    out[name] = value.slice();
  }
}

export type PublishedSnapshotInput = {
  slug: string;
  showId: string;
  title: string | null;
  archived: boolean;
  published: boolean;
  finalizeOwned: boolean;
  isLive: boolean;
  lastSyncedAt: string | null;
  lastCheckedAt: string | null;
  lastSyncStatus: string | null;
  alertsDegraded: boolean;
  alertId: string | null;
  openSheetHref: string | null;
  attentionItems: readonly unknown[];
  feed: unknown;
  bySection: unknown;
  data: unknown;
  // Tolerated-but-never-serialized extras (the mount passes its whole props
  // object shape through; the allowlist below is what escapes).
  [key: string]: unknown;
};

export function buildPublishedSnapshot(p: PublishedSnapshotInput): Record<string, unknown> {
  const out: Record<string, unknown> = {
    slug: p.slug,
    showId: p.showId,
    title: p.title,
    archived: p.archived,
    published: p.published,
    finalizeOwned: p.finalizeOwned,
    isLive: p.isLive,
    lastSyncedAt: p.lastSyncedAt,
    lastCheckedAt: p.lastCheckedAt,
    lastSyncStatus: p.lastSyncStatus,
    alertsDegraded: p.alertsDegraded,
    alertId: p.alertId,
    openSheetHref: p.openSheetHref,
    bySection: p.bySection,
    data: p.data,
  };
  capped(out, "attentionItems", p.attentionItems);
  capped(out, "feed", Array.isArray(p.feed) ? (p.feed as readonly unknown[]) : undefined);
  return out;
}

export type StagedSnapshotInput = {
  data: unknown;
  checked: boolean;
  isDirtyRescan: boolean;
  isPublishRunActive: boolean;
  resolution?: {
    stagedId: string;
    reviewItemsCorrupt: boolean;
    isPublishRunActive: boolean;
    triggeredReviewItems: readonly unknown[];
    [key: string]: unknown;
  };
};

export function buildStagedSnapshot(p: StagedSnapshotInput): Record<string, unknown> {
  const out: Record<string, unknown> = {
    data: p.data,
    checked: p.checked,
    isDirtyRescan: p.isDirtyRescan,
    isPublishRunActive: p.isPublishRunActive,
  };
  if (p.resolution !== undefined) {
    out["resolution"] = {
      stagedId: p.resolution.stagedId,
      reviewItemsCorrupt: p.resolution.reviewItemsCorrupt,
      isPublishRunActive: p.resolution.isPublishRunActive,
      triggeredReviewItemCount: p.resolution.triggeredReviewItems.length,
    };
  }
  return out;
}
