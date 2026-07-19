"use client";

/**
 * components/admin/showpage/OverviewSection.tsx (consolidated-admin-show-page spec §5.1/§6)
 *
 * The FIRST rail section of the consolidated admin show page. It relocates — INTACT — the
 * per-show alert detail, the share-&-access cluster, the sheet/sync cluster (correction-loop
 * callout + open-sheet link), and the archive lifecycle control. It wraps; it does not
 * reimplement or restyle beyond section chrome.
 *
 * The Re-sync CONTROL is NOT here: modal-header-reconciliation §4.3 (ratified) moved it to
 * the StatusStrip, and duplicating it was explicitly rejected — exactly one Re-sync exists.
 * The archived paused-notice and the correction-loop guidance stay (§6.7).
 *
 * RSC boundary: Overview renders inside the CLIENT `ShowReviewSurface` (via an extra-section
 * `render()` closure), so it is a client component. The server-only pieces (`CurrentShareLinkPanel`,
 * `CurrentShareLinkPanel`) are pre-rendered by the server page (Task 13) and handed in as
 * `attentionSlot` / `shareSlot` ReactNode props. The client controls (`ArchiveShowButton`,
 * `UnarchiveShowButton`, `CorrectionLoopCallout`) are rendered directly,
 * with their server actions passed THROUGH as props (never inline-wrapped closures — the RSC
 * server-action boundary lesson; the page hands Overview DIRECT action refs).
 *
 * Mode boundaries (spec §6):
 *   - Published + active (published && !archived) → alert · share panel · sheet/sync
 *     (open-sheet) · Archive.
 *   - Unpublished (held)                          → alert · INACTIVE-share notice · sheet/sync
 *     (still archivable — held is not archived) · Archive.
 *   - Publishing… (finalize-owned, !archived)     → the show is immutable while the finalize job
 *     holds it (spec §6): the Archive control is SUPPRESSED (matching the old page, which only
 *     rendered its lifecycle section for archived||held). The archive server action carries its
 *     own finalize-ownership refusal as the backstop, but we don't render a control the server
 *     would reject. Every other affordance renders per the published/held mode above.
 *   - Archived (read-only)                        → alert · INACTIVE-share notice · Re-sync-PAUSED
 *     notice (no callout) · UNARCHIVE (the only lifecycle control).
 *
 * The `#overview` wrapper anchor is the target of the strip's alert badge (StatusStrip.tsx:149)
 * and the spec §10 hash deep link.
 *
 * Guard conditions (spec §11):
 *   - `openSheetHref` null → the open-sheet link is omitted (never a dead "Open sheet ↗").
 *   - actionable-warnings 0 → the sheet/sync cluster's first child is omitted entirely.
 *   - `finalizeOwned` true (and not archived) → the Archive control is hidden (Publishing… window).
 */

import type { ReactNode } from "react";
import Link from "next/link";

import { ArchiveShowButton } from "@/components/admin/ArchiveShowButton";
import { UnarchiveShowButton } from "@/components/admin/UnarchiveShowButton";
import { CorrectionLoopCallout } from "@/components/admin/CorrectionLoopCallout";

type LifecycleResult = { ok: true } | { ok: false; code: string };

export type OverviewSectionProps = {
  /** `shows.id` — the Unarchive control's subject. */
  showId: string;
  /** Read-only lifecycle state: hides every mutating affordance, shows Unarchive. */
  archived: boolean;
  /** Publish state: an unpublished (held) show shows the inactive-share notice. */
  published: boolean;
  /** Finalize-owned ("Publishing…") window (spec §6): the show is immutable, so the Archive
   *  control is suppressed. Same value the StatusStrip freezes the publish toggle on. */
  finalizeOwned: boolean;
  /** Google Sheet deep link (built by `buildSheetDeepLink`); null → link omitted. */
  openSheetHref: string | null;
  /** ≥1 active actionable parse warning → the correction-loop callout renders as guidance. */
  hasActionableWarnings: boolean;
  /** Pre-bound (to this slug) Archive server action. */
  archiveAction: () => Promise<LifecycleResult>;
  /** Show-scoped Unarchive server action (called with `showId`). */
  unarchiveAction: (showId: string) => Promise<void>;
  /** Attention banners + degraded notice for this show (published-show-alerts §5.4). */
  attentionSlot: ReactNode;
  /** Server-rendered share-&-access cluster (`<CurrentShareLinkPanel/>`); only shown when the
   *  crew link is active (published && !archived). Ignored otherwise (inactive notice shown). */
  shareSlot: ReactNode;
};

export function OverviewSection({
  showId,
  archived,
  published,
  finalizeOwned,
  openSheetHref,
  hasActionableWarnings,
  archiveAction,
  unarchiveAction,
  attentionSlot,
  shareSlot,
}: OverviewSectionProps) {
  // The crew link is active only for a published, non-archived show — same gate the current
  // page keys the share panel / rotate / reset on (page.tsx isShowEligibleForCrewLink).
  const isCrewLinkActive = published && !archived;

  return (
    <section
      id="overview"
      data-testid="overview-section"
      aria-label="Overview"
      className="flex scroll-mt-4 flex-col gap-section-gap"
    >
      {attentionSlot}

      {/* Share & access — the server-rendered panel when the link is live, else the inactive
          notice (an unpublished/archived show keeps its token but the crew link is paused).
          `#share-access` is the always-present deep-link target for the share-access alert
          action (lib/adminAlerts/alertActions.ts) — it wraps BOTH states so a held-show nudge
          still resolves. (The publish toggle itself lives in the StatusStrip.) */}
      <div id="share-access" className="scroll-mt-4">
        {isCrewLinkActive ? (
          shareSlot
        ) : (
          <p
            data-testid="admin-share-link-inactive"
            className="rounded-sm border border-border bg-surface-sunken p-tile-pad text-sm text-text-subtle"
          >
            The crew link is inactive while this show is {archived ? "archived" : "unpublished"}. It
            will be available once the show is published.
          </p>
        )}
      </div>

      {/* Sheet & sync. The Re-sync CONTROL moved to the StatusStrip
          (modal-header-reconciliation §4.3 — ratified; duplicating it here was
          explicitly rejected, so exactly one Re-sync exists). What stays is
          everything that is not the affordance:

          - the archived PAUSED NOTICE, so the reason Re-sync is unavailable is
            still stated where the rest of the archived read-only story is told;
          - the correction-loop CALLOUT, which is guidance, not an affordance —
            its `children` slot was already optional, so it renders with no
            child button. Its copy ("…then re-sync") still resolves: the strip
            is a fixed band, visible from here, not scrolled away.

          The third arm is now `null` — a non-archived show with no actionable
          warnings simply has no first child. The `overview-sheet-sync` wrapper
          STAYS regardless: it still hosts the Open sheet link below, so
          deleting it because its first child can be null would silently drop
          `openSheetHref`. */}
      <div data-testid="overview-sheet-sync" className="flex flex-col gap-3">
        {archived ? (
          <span data-testid="admin-show-resync-archived" className="text-sm text-text-subtle">
            Re-sync is paused while this show is archived.
          </span>
        ) : hasActionableWarnings ? (
          <CorrectionLoopCallout mode="resync" />
        ) : null}
        {openSheetHref ? (
          <Link
            data-testid="overview-open-sheet"
            href={openSheetHref}
            target="_blank"
            rel="noopener noreferrer"
            // Standalone block affordance on its own row (not inline-in-prose) → meets the 44px
            // tap-min floor for the venue floor, matching the sibling phone/email/Preview-As links.
            className="inline-flex min-h-tap-min w-fit items-center gap-1 text-sm font-medium text-accent-on-bg underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          >
            Open sheet
            <span aria-hidden="true">↗</span>
          </Link>
        ) : null}
      </div>

      {/* Archive lifecycle — an archived show offers only Unarchive (read-only); a live or held
          show offers Archive. During the finalize-owned "Publishing…" window the show is immutable
          (spec §6), so the Archive control is suppressed — the row renders empty. */}
      <div data-testid="overview-archive-row" className="flex flex-wrap items-start gap-3">
        {archived ? (
          <UnarchiveShowButton showId={showId} unarchiveAction={unarchiveAction} />
        ) : finalizeOwned ? null : (
          <ArchiveShowButton archiveAction={archiveAction} compact />
        )}
      </div>
    </section>
  );
}
