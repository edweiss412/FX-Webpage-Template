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
 * Mode boundaries (spec §6; title removed by modal-header-reconciliation §6.5):
 *   - Not archived            → PublishedToggle · [divider] · live badge (if live)
 *                               · sync age (if synced) · edited age (if content-edited)
 *                               · copy-link (published + token only). The alert badge
 *                               MOVED to the modal header (modal-header-reconciliation §6.6).
 *   - Archived (read-only)    → archived badge · sync age · edited age. No toggle,
 *                               no copy-link, no live badge — zero mutating affordances.
 *
 * Sync age vs edited age (2026-07-17 sync-cell): the badge shows the last-CHECKED time
 * (last successful Drive reach) for `ok`; the muted "Edited {rel}" shows the last-EDITED
 * time (last content apply). Both moved off the dashboard Sync cell, which now shows the
 * bucket + a hover-revealed "Checked" line only.
 *
 * Guard conditions (spec §11):
 *   - `lastSyncedAt` null     → OMIT the sync-age element entirely. `formatRelative` returns
 *                               "never" for null; rendering that would violate the omit
 *                               contract, so the null is guarded BEFORE the call.
 *   - no active share token   → copy-link hidden. "Active" = published: an unpublished show
 *                               keeps its token but the crew link is paused, so copying it
 *                               would hand out a dead link.
 *
 * Live-now is NOT derived here (it needs the show timezone + wall clock): the page computes
 * `published && isShowLiveOnDate(dates, todayIso)` — the same rule the dashboard uses
 * (Dashboard.tsx:483-484) — and passes the result as `isLive`.
 *
 * Container chrome (modal-header-reconciliation §6.5): the strip supplies LAYOUT ONLY.
 * Its sole render site is the published review modal, where it mounts in the shell's
 * `subHeader` band — and the band supplies the surface, the bottom seam and
 * `px-tile-pad` (ReviewModalShell.tsx). The former `chrome` prop's `"page"` arm (sticky
 * pin, z-index, own seam, shadow, own padding) was only reachable from the retired
 * standalone show page and is gone; re-adding any of it here would double-seam and
 * double-pad the band. `w-full` is added in Task 3 — it is what makes the copy button's
 * `ml-auto` resolve against the BAND's width rather than the strip's shrink-wrapped one.
 */

import { PublishedToggle } from "@/components/admin/PublishedToggle";
import { StatusIndicator, StatusDot } from "@/components/admin/StatusIndicator";
import { formatRelative } from "@/lib/admin/showDisplay";
import { syncStatusBucket, showsEditedClause } from "@/lib/admin/syncStatus";
import { ShareLinkCopyButton } from "@/app/admin/show/[slug]/ShareLinkCopyButton";
import { resolveOrigin } from "@/app/admin/show/[slug]/resolveOrigin";
import { useShareToken } from "@/app/admin/show/[slug]/ShareTokenContext";

type LifecycleResult = { ok: true } | { ok: false; code: string };

export type StatusStripProps = {
  /** Stable subject id for the bound publish action + crew-URL path. Feeds the crew
   *  copy URL and the bound publish toggle — NOT a display label (the strip renders no
   *  title; the modal's `<h2>` owns it). */
  slug: string;
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
  /** `shows.last_synced_at` (ISO) or null. Null → the sync-age element is not rendered.
   *  This is the "Edited" timestamp (last content apply); it feeds the muted Edited clause. */
  lastSyncedAt: string | null;
  /** `shows.last_checked_at` (ISO) or null — last successful Drive reach/evaluate. Drives the
   *  sync-age badge TIME for the `ok` bucket ("Synced {rel}"); falls back to lastSyncedAt when null. */
  lastCheckedAt: string | null;
  /** `shows.last_sync_status` → health bucket + label via `syncStatusBucket`. */
  lastSyncStatus: string | null;
  /** Server "now" for deterministic relative formatting. */
  now: Date;
};

export function StatusStrip({
  slug,
  archived,
  published,
  finalizeOwned,
  setPublished,
  isLive,
  lastSyncedAt,
  lastCheckedAt,
  lastSyncStatus,
  now,
}: StatusStripProps) {
  const { token } = useShareToken();

  // Sync age: guard null BEFORE formatRelative so the "never" sentinel never renders
  // (spec §11 omit contract). Element existence is gated on lastSyncedAt (a show that
  // never synced shows nothing). For the `ok` bucket the displayed TIME is
  // last_checked_at ("Synced {rel}" = last successful Drive reach), falling back to
  // last_synced_at when the check stamp is absent; non-ok buckets show the health label.
  const sync = lastSyncedAt == null ? null : syncStatusBucket(lastSyncStatus);
  const syncLabel =
    sync == null
      ? null
      : lastSyncStatus === "ok"
        ? `Synced ${formatRelative(lastCheckedAt ?? lastSyncedAt, now)}`
        : sync.label;

  // "Edited {rel}" (last_synced_at = last content apply), moved here from the dashboard
  // Sync cell. Suppressed for the three error buckets where last_synced_at is an
  // error-attempt stamp, not a content edit (showsEditedClause === false) — the same
  // deny-set the dashboard used — and when the show never synced.
  const editedRel =
    lastSyncedAt != null && showsEditedClause(lastSyncStatus)
      ? formatRelative(lastSyncedAt, now)
      : null;

  // Copy-link renders only for an active crew link: published, not archived, token present.
  const copyUrl =
    published && !archived && token != null ? `${resolveOrigin()}/show/${slug}/${token}` : null;

  // CASP2-4 (item 2, approach A): a control/signal divider so the ON switch (bg-accent) and the
  // Live-now dot (bg-status-live = accent, SAME hue — globals.css:89) stop reading as one orange
  // smear. Renders iff there is a toggle to separate (¬archived) AND ≥1 signal follows. The two
  // disjuncts are exactly the render conditions of the live/sync elements below, so the
  // divider appears iff a signal renders beside the toggle. `hidden sm:block` — no vertical
  // divider on the wrapped 390px mobile row.
  //
  // The former third disjunct (`alertCount > 0`) was DROPPED with the alert
  // relocation (modal-header-reconciliation §7): the element it stood in for now
  // lives in the modal header, so keeping it would draw a divider followed by
  // nothing on an alerts-only show.
  const hasSignal = isLive || (syncLabel != null && sync != null);
  const showControlDivider = !archived && hasSignal;

  return (
    <div
      data-testid="show-status-strip"
      // Full band width is what makes right-flush reachable (§8): `ml-auto` on
      // the copy button only reaches the band's content edge if this row spans
      // it. VERIFIED by measurement — swapping `w-full` for `w-fit` fails
      // T-COPY-FLUSH by ~470px at 1280 (published-review-modal.layout.spec.ts).
      //
      // Honest note: `w-full` is DEFENSIVE, not load-bearing today. The band is
      // a block-level, non-flex container, so this block-level flex row already
      // fills it; T-COPY-FLUSH passes with `w-full` removed. It is kept because
      // the guarantee would evaporate the moment the band became a flex
      // container — the strip would then shrink-wrap as a flex item (this
      // repo's Tailwind v4 does not default `.flex` to align-items: stretch)
      // and `ml-auto` would flush to the strip's own edge instead.
      //
      // Deliberately NO `relative` here — that would re-anchor the Task 7
      // Re-sync overlay to the strip and break its `inset-x-0` full-band width.
      // The band owns the positioned ancestor.
      className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 sm:flex-nowrap"
    >
      {archived ? (
        <span
          data-testid="strip-archived-badge"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-sm border border-border bg-surface px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-text-subtle"
        >
          Archived · read-only
        </span>
      ) : (
        <div data-testid="strip-publish-toggle" className="shrink-0">
          <PublishedToggle
            slug={slug}
            variant="inline"
            published={published}
            finalizeOwned={finalizeOwned}
            setPublished={setPublished}
          />
        </div>
      )}

      {showControlDivider ? (
        <span
          aria-hidden="true"
          data-testid="strip-control-divider"
          className="hidden h-5 w-px shrink-0 bg-border sm:block"
        />
      ) : null}

      {!archived && isLive ? (
        <span data-testid="strip-live-badge" className="shrink-0">
          <StatusIndicator status="live" label="Live now" />
        </span>
      ) : null}

      {syncLabel != null && sync != null ? (
        <span data-testid="strip-sync-age" className="flex shrink-0 items-center gap-2">
          {/* One health dot, colored by sync HEALTH (last_sync_status bucket) — NOT the
              edit time. It pairs with both text lines (the color-blind floor). */}
          {/* pulse: subtle heartbeat on the healthy/synced dot (no-op on non-positive). */}
          <StatusDot status={sync.bucket} pulse />
          {/* Synced (last-checked) over Edited (last-synced), stacked and equally weighted
              — same size/color, neither is the "primary" of the pair. */}
          <span className="flex flex-col text-xs/tight text-text-subtle tabular-nums">
            <span data-testid="strip-synced-line">{syncLabel}</span>
            {editedRel != null ? (
              <span data-testid="strip-edited-age">Edited {editedRel}</span>
            ) : null}
          </span>
        </span>
      ) : null}

      {/* The alert badge lived here until modal-header-reconciliation §6.6 moved
          it to the modal header as `published-show-review-alert-pill`. Do not
          re-add it: rendered in both places, the count reads as two different
          numbers the moment one of them lags. */}

      {copyUrl != null ? (
        <div data-testid="strip-copy-link" className="ml-auto shrink-0">
          <ShareLinkCopyButton url={copyUrl} />
        </div>
      ) : null}
    </div>
  );
}
