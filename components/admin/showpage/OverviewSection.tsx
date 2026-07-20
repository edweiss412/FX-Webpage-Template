"use client";

/**
 * components/admin/showpage/OverviewSection.tsx (consolidated-admin-show-page spec §5.1/§6)
 *
 * The FIRST rail section of the consolidated admin show page. What remains here is the
 * per-show alert detail plus the sheet/sync GUIDANCE — the correction-loop callout and the
 * archived paused-notice. It wraps; it does not reimplement or restyle beyond section chrome.
 *
 * Three relocations have hollowed this section out, each removing a DUPLICATE rather than a
 * capability. Do not resurrect any of them:
 *   - Re-sync CONTROL → StatusStrip (modal-header-reconciliation §4.3, ratified). Exactly one.
 *   - Share & access cluster → the status band's ShareHub popover (share-hub T4).
 *   - Open-sheet link + Archive/Unarchive → the header. The link duplicated the header title's
 *     sheet anchor (`published-show-review-sheetlink`, PublishedReviewModal.tsx); the lifecycle
 *     controls moved into the ShareHub popover's "Show" section, which is now the single home
 *     for them in both directions (Archive when live/held, Unarchive when archived).
 *
 * RSC boundary: Overview renders inside the CLIENT `ShowReviewSurface` (via an extra-section
 * `render()` closure), so it is a client component. The server-only attention cluster is
 * pre-rendered by the server loader and handed in as the `attentionSlot` ReactNode prop.
 *
 * Mode boundaries (spec §6). With the lifecycle controls gone, `archived` selects between the
 * two arms of the sheet/sync cluster and nothing else:
 *   - Not archived (published OR held) → alert · correction-loop callout iff warnings.
 *   - Archived (read-only)             → alert · Re-sync-PAUSED notice (no callout).
 *
 * The `#overview` wrapper anchor is the target of the strip's alert badge (StatusStrip.tsx:149)
 * and the spec §10 hash deep link.
 *
 * Guard conditions (spec §11):
 *   - actionable-warnings 0 and not archived → the sheet/sync cluster renders no child.
 */

import type { ReactNode } from "react";

import { CorrectionLoopCallout } from "@/components/admin/CorrectionLoopCallout";

export type OverviewSectionProps = {
  /** Read-only lifecycle state: swaps the callout for the Re-sync-paused notice. */
  archived: boolean;
  /** ≥1 active actionable parse warning → the correction-loop callout renders as guidance. */
  hasActionableWarnings: boolean;
  /** Attention banners + degraded notice for this show (published-show-alerts §5.4). */
  attentionSlot: ReactNode;
};

export function OverviewSection({
  archived,
  hasActionableWarnings,
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

      {/* Sheet & sync — guidance only; every affordance that used to sit here now
          lives in the status band (see the relocation list above). The archived
          PAUSED NOTICE stays so the reason Re-sync is unavailable is still stated
          where the rest of the archived read-only story is told (§6.7), and the
          correction-loop CALLOUT stays because it is guidance, not an affordance:
          its `children` slot was already optional, so it renders with no child
          button, and its copy ("…then re-sync") still resolves — the strip is a
          fixed band, visible from here, not scrolled away. */}
      <div data-testid="overview-sheet-sync" className="flex flex-col gap-3">
        {archived ? (
          <span data-testid="admin-show-resync-archived" className="text-sm text-text-subtle">
            Re-sync is paused while this show is archived.
          </span>
        ) : hasActionableWarnings ? (
          <CorrectionLoopCallout mode="resync" />
        ) : null}
      </div>
    </section>
  );
}
