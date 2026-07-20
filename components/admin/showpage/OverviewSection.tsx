"use client";

/**
 * components/admin/showpage/OverviewSection.tsx (consolidated-admin-show-page spec §5.1/§6)
 *
 * The FIRST rail section of the consolidated admin show page. It relocates — INTACT — the
 * per-show alert detail, the sheet/sync cluster (correction-loop callout + open-sheet link),
 * and the archive lifecycle control. It wraps; it does not reimplement or restyle beyond
 * section chrome. (share-hub T4 moved the share-&-access cluster out to the status band.)
 *
 * The Re-sync CONTROL is NOT here: modal-header-reconciliation §4.3 (ratified) moved it to
 * the StatusStrip, and duplicating it was explicitly rejected — exactly one Re-sync exists.
 * The archived paused-notice and the correction-loop guidance stay (§6.7).
 *
 * RSC boundary: Overview renders inside the CLIENT `ShowReviewSurface` (via an extra-section
 * `render()` closure), so it is a client component. The server-only attention cluster is
 * pre-rendered by the server loader and handed in as the `attentionSlot` ReactNode prop.
 * (share-hub T4 retired the `shareSlot` prop and its `CurrentShareLinkPanel` subtree: the
 * crew URL, Copy, Email-crew, rotate and reset now live in the status band's ShareHub
 * popover, and the `#share-access` anchor moved onto the StatusStrip root.)
 * The client controls (`ArchiveShowButton`,
 * `UnarchiveShowButton`, `CorrectionLoopCallout`) are rendered directly,
 * with their server actions passed THROUGH as props (never inline-wrapped closures — the RSC
 * server-action boundary lesson; the page hands Overview DIRECT action refs).
 *
 * Mode boundaries (spec §6). share-hub T4 removed the share panel and its inactive notice,
 * so publish state no longer changes anything Overview renders — the `published` prop was
 * retired with them, and the published/held rows collapsed into one:
 *   - Not archived (published OR held)            → alert · sheet/sync (open-sheet) · Archive.
 *   - Publishing… (finalize-owned, !archived)     → the show is immutable while the finalize job
 *     holds it (spec §6): the Archive control is SUPPRESSED (matching the old page, which only
 *     rendered its lifecycle section for archived||held). The archive server action carries its
 *     own finalize-ownership refusal as the backstop, but we don't render a control the server
 *     would reject. Every other affordance renders per the published/held mode above.
 *   - Archived (read-only)                        → alert · Re-sync-PAUSED notice
 *     (no callout) · UNARCHIVE (the only lifecycle control).
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
};

export function OverviewSection({
  showId,
  archived,
  finalizeOwned,
  openSheetHref,
  hasActionableWarnings,
  archiveAction,
  unarchiveAction,
  attentionSlot,
}: OverviewSectionProps) {
  return (
    <section
      id="overview"
      data-testid="overview-section"
      aria-label="Overview"
      className="flex scroll-mt-4 flex-col gap-section-gap"
    >
      {attentionSlot}

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
