"use client";

/**
 * components/admin/showpage/StatusStrip.tsx (consolidated-admin-show-page spec §4/§6/§11)
 *
 * The slim, pinned status strip that stays under the admin nav while the rail sections
 * scroll. DISPLAY + 2 actions max — the publish toggle and the copy-link; everything else
 * (share panel, resync, archive/unarchive, alert detail) lives in the Overview rail section
 * (spec §4 last line; mock README delta 5 — Unarchive is NOT a strip control).
 *
 * All data arrives as plain props (the page shell wires it); this component fetches nothing
 * and defines no server actions. The publish toggle carries its own bound action through
 * (`setPublished`); the copy-link consumes `ShareTokenProvider` so a rotate updates the
 * copied URL instantly (spec §4 "within ShareTokenProvider context").
 *
 * Mode boundaries (spec §6):
 *   - Not archived            → title · [divider] · PublishedToggle · live badge (if live)
 *                               · sync age (if synced) · alert badge (if any) · copy-link
 *                               (published + token only).
 *   - Archived (read-only)    → title · archived badge · sync age. No toggle, no copy-link,
 *                               no live badge — the strip exposes zero mutating affordances.
 *
 * Guard conditions (spec §11):
 *   - `title` null            → fall back to the slug (never an empty label).
 *   - `lastSyncedAt` null     → OMIT the sync-age element entirely. `formatRelative` returns
 *                               "never" for null; rendering that would violate the omit
 *                               contract, so the null is guarded BEFORE the call.
 *   - no active share token   → copy-link hidden. "Active" = published: an unpublished show
 *                               keeps its token but the crew link is paused, so copying it
 *                               would hand out a dead link.
 *   - `alertCount` 0          → alert badge hidden.
 *
 * Live-now is NOT derived here (it needs the show timezone + wall clock): the page computes
 * `published && isShowLiveOnDate(dates, todayIso)` — the same rule the dashboard uses
 * (Dashboard.tsx:483-484) — and passes the result as `isLive`.
 */

import { TriangleAlert } from "lucide-react";
import { PublishedToggle } from "@/components/admin/PublishedToggle";
import { StatusIndicator } from "@/components/admin/StatusIndicator";
import { formatRelative } from "@/lib/admin/showDisplay";
import { syncStatusBucket } from "@/lib/admin/syncStatus";
import { ShareLinkCopyButton } from "@/app/admin/show/[slug]/ShareLinkCopyButton";
import { resolveOrigin } from "@/app/admin/show/[slug]/resolveOrigin";
import { useShareToken } from "@/app/admin/show/[slug]/ShareTokenContext";

type LifecycleResult = { ok: true } | { ok: false; code: string };

export type StatusStripProps = {
  /** Stable subject id for the bound publish action + crew-URL path. */
  slug: string;
  /** `shows.title`; null → the slug is shown instead (never an empty label). */
  title: string | null;
  /** Read-only lifecycle state: hides every mutating strip affordance. */
  archived: boolean;
  /** Current publish state (drives the wrapped toggle + the copy-link "active" gate). */
  published: boolean;
  /** Finalize ownership — disables the toggle in both publish states (passthrough). */
  finalizeOwned: boolean;
  /** Pre-bound `setShowPublishedAction` for this show's slug (passthrough to the toggle). */
  setPublished: (next: boolean) => Promise<LifecycleResult>;
  /** Page-computed `published && isShowLiveOnDate(...)`; badge renders only when true. */
  isLive: boolean;
  /** `shows.last_synced_at` (ISO) or null. Null → the sync-age element is not rendered. */
  lastSyncedAt: string | null;
  /** `shows.last_sync_status` → health bucket + label via `syncStatusBucket`. */
  lastSyncStatus: string | null;
  /** Server "now" for deterministic relative formatting. */
  now: Date;
  /** Open `admin_alerts` count for this show; 0 → the badge is hidden. */
  alertCount: number;
};

export function StatusStrip({
  slug,
  title,
  archived,
  published,
  finalizeOwned,
  setPublished,
  isLive,
  lastSyncedAt,
  lastSyncStatus,
  now,
  alertCount,
}: StatusStripProps) {
  const { token } = useShareToken();

  // Sync age: guard null BEFORE formatRelative so the "never" sentinel never renders
  // (spec §11 omit contract). Mirrors the dashboard SyncCell (ShowsTable.tsx:223-227).
  const sync = lastSyncedAt == null ? null : syncStatusBucket(lastSyncStatus);
  const syncLabel =
    sync == null
      ? null
      : lastSyncStatus === "ok"
        ? `Synced ${formatRelative(lastSyncedAt, now)}`
        : sync.label;

  // Copy-link renders only for an active crew link: published, not archived, token present.
  const copyUrl =
    published && !archived && token != null ? `${resolveOrigin()}/show/${slug}/${token}` : null;

  return (
    <div
      data-testid="show-status-strip"
      className="sticky top-0 z-30 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-surface px-4 py-2 shadow-tile sm:flex-nowrap sm:px-6"
    >
      {/* The rebuild dropped AdminPageHeader, so the sticky strip title IS the page's
          top-level heading — an <h1> (not a <span>), or screen readers get no h1 landmark. */}
      <h1
        data-testid="strip-title"
        className="min-w-0 truncate text-base font-semibold text-text-strong"
      >
        {title ?? slug}
      </h1>

      {archived ? (
        <span
          data-testid="strip-archived-badge"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-sm border border-border bg-surface px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-text-subtle"
        >
          Archived · read-only
        </span>
      ) : (
        <>
          <span aria-hidden="true" className="hidden h-5 w-px shrink-0 bg-border sm:block" />
          <div data-testid="strip-publish-toggle" className="min-w-0 shrink-0">
            <PublishedToggle
              slug={slug}
              published={published}
              finalizeOwned={finalizeOwned}
              setPublished={setPublished}
            />
          </div>
        </>
      )}

      {!archived && isLive ? (
        <span data-testid="strip-live-badge" className="shrink-0">
          <StatusIndicator status="live" label="Live now" />
        </span>
      ) : null}

      {syncLabel != null && sync != null ? (
        <span data-testid="strip-sync-age" className="shrink-0">
          <StatusIndicator status={sync.bucket} label={syncLabel} />
        </span>
      ) : null}

      {alertCount > 0 ? (
        <a
          href="#overview"
          data-testid="strip-alert-badge"
          // The visible pill stays slim (text-xs); before:-inset-y-3 extends the HIT AREA to the
          // 44px tap-min floor (PRODUCT a11y — no tiny click targets on the venue floor) without
          // growing the pill, the same idiom the publish switch uses (PublishedToggle.tsx:143-145).
          // Vertical-only extension keeps it from overlapping the strip's horizontal neighbours.
          className="relative inline-flex shrink-0 items-center gap-1.5 rounded-sm border border-border bg-warning-bg px-2 py-0.5 text-xs font-semibold tabular-nums text-warning-text transition-colors duration-fast before:absolute before:-inset-y-3 before:inset-x-0 before:content-[''] hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          <TriangleAlert aria-hidden="true" className="size-3 shrink-0" />
          {alertCount} {alertCount === 1 ? "alert" : "alerts"}
        </a>
      ) : null}

      {copyUrl != null ? (
        <div data-testid="strip-copy-link" className="ml-auto shrink-0">
          <ShareLinkCopyButton url={copyUrl} />
        </div>
      ) : null}
    </div>
  );
}
