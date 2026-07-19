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
 *                               · sync age (if synced) · edited age (if content-edited)
 *                               · alert badge (if any) · copy-link (published + token only).
 *   - Archived (read-only)    → title · archived badge · sync age · edited age. No toggle,
 *                               no copy-link, no live badge — zero mutating affordances.
 *
 * Sync age vs edited age (2026-07-17 sync-cell): the badge shows the last-CHECKED time
 * (last successful Drive reach) for `ok`; the muted "Edited {rel}" shows the last-EDITED
 * time (last content apply). Both moved off the dashboard Sync cell, which now shows the
 * bucket + a hover-revealed "Checked" line only.
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
import { StatusIndicator, StatusDot } from "@/components/admin/StatusIndicator";
import { formatRelative } from "@/lib/admin/showDisplay";
import { syncStatusBucket, showsEditedClause } from "@/lib/admin/syncStatus";
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
  /** Open `admin_alerts` count for this show; 0 → the badge is hidden. */
  alertCount: number;
  /** admin-show-modal spec §6.1: `false` suppresses the internal `<h1>` title AND its
   *  immediately-following divider (no orphan leading separator — the strip then starts
   *  at the publish toggle). The modal header owns the title as an `<h2>`, so the dialog
   *  contains exactly one title node and no `<h1>`. Default `true` (page behavior). */
  renderTitle?: boolean;
  /** MODAL-STRIP-CHROME-1: which container chrome the strip wears.
   *  `"page"` (default) = the pinned page strip — sticky/z under the admin nav, its own
   *  bottom seam + shadow, its own horizontal/vertical padding.
   *  `"modal-header"` = layout only. ReviewModalShell's `<header>` already supplies the
   *  surface, the bottom border and `px-tile-pad` (ReviewModalShell.tsx:432) and the header's
   *  flex column supplies the row gap, so the page chrome would stack a doubled seam and
   *  doubled padding; sticky/z are inert inside a non-scrolling header.
   *
   *  PRECONDITION for `"modal-header"` — the parent MUST supply all four, because the
   *  strip supplies none of them in this mode: (1) a `bg-surface` background (the strip's
   *  children resolve `focus-visible:ring-offset-surface` against it), (2) horizontal
   *  padding, (3) the bottom seam, and (4) vertical separation from whatever precedes the
   *  strip — the strip has NO vertical padding here, so the parent's column gap is the
   *  entire budget (pinned by the "header rhythm" assertion in
   *  tests/e2e/published-review-modal.layout.spec.ts). */
  chrome?: "page" | "modal-header";
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
  lastCheckedAt,
  lastSyncStatus,
  now,
  alertCount,
  renderTitle = true,
  chrome = "page",
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
  // smear. Renders iff there is a toggle to separate (¬archived) AND ≥1 signal follows. The three
  // disjuncts are exactly the render conditions of the live/sync/alert elements below, so the
  // divider appears iff a signal renders beside the toggle. `hidden sm:block` matches the title
  // divider — no vertical divider on the wrapped 390px mobile row.
  const hasSignal = isLive || (syncLabel != null && sync != null) || alertCount > 0;
  const showControlDivider = !archived && hasSignal;

  // Container chrome (MODAL-STRIP-CHROME-1). Both arms are whole literals (not a
  // template concat) so the Tailwind class-order lint still sorts them, and the
  // ternary lives OUTSIDE the JSX so it is not a conditional MOUNT — the
  // pageTransitions count pin (8) is unchanged by this variant.
  const containerClass =
    chrome === "modal-header"
      ? "flex flex-wrap items-center gap-x-4 gap-y-2 sm:flex-nowrap"
      : "sticky top-0 z-30 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-surface px-4 py-2 shadow-tile sm:flex-nowrap sm:px-6";

  return (
    <div data-testid="show-status-strip" className={containerClass}>
      {/* admin-show-modal spec §6.1: the title block (h1 + its adjacent divider) is one
          conditional — the modal passes renderTitle={false} so its <h2> header stays the
          dialog's only title node and the strip starts at the publish toggle. */}
      {renderTitle ? (
        <>
          {/* The rebuild dropped AdminPageHeader, so the sticky strip title IS the page's
              top-level heading — an <h1> (not a <span>), or screen readers get no h1 landmark. */}
          <h1
            data-testid="strip-title"
            className="min-w-0 truncate text-base font-semibold text-text-strong"
          >
            {title ?? slug}
          </h1>
          {/* Title↔toggle divider: only when a toggle follows (¬archived). Lives inside the
              renderTitle block (covered by its count row) so suppressing the title can never
              leave an orphan leading separator. */}
          {archived ? null : (
            <span
              aria-hidden="true"
              data-testid="strip-title-divider"
              className="hidden h-5 w-px shrink-0 bg-border sm:block"
            />
          )}
        </>
      ) : null}

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

      {alertCount > 0 ? (
        <a
          href="#overview"
          data-testid="strip-alert-badge"
          // The visible pill stays slim (text-xs); before:-inset-y-3 extends the HIT AREA to the
          // 44px tap-min floor (PRODUCT a11y — no tiny click targets on the venue floor) without
          // growing the pill, the same idiom the publish switch uses (PublishedToggle.tsx:143-145).
          // Vertical-only extension keeps it from overlapping the strip's horizontal neighbours.
          className="relative inline-flex shrink-0 items-center gap-1.5 rounded-sm border border-border bg-warning-bg px-2 py-0.5 text-xs font-semibold tabular-nums text-warning-text transition-colors duration-fast before:absolute before:-inset-y-3 before:inset-x-0 before:content-[''] hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
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
