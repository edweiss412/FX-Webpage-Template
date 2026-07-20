"use client";

/**
 * components/admin/showpage/OverviewSection.tsx (consolidated-admin-show-page spec §5.1/§6)
 *
 * The FIRST rail section of the consolidated admin show page. What remains here is the
 * per-show alert detail plus the archived paused-notice. It wraps; it does not reimplement or
 * restyle beyond section chrome.
 *
 * Four relocations have hollowed this section out, each removing a DUPLICATE rather than a
 * capability. Do not resurrect any of them:
 *   - Re-sync CONTROL → StatusStrip (modal-header-reconciliation §4.3, ratified). Exactly one.
 *   - Share & access cluster → the status band's ShareHub popover (share-hub T4).
 *   - Open-sheet link + Archive/Unarchive → the header. The link duplicated the header title's
 *     sheet anchor (`published-show-review-sheetlink`, PublishedReviewModal.tsx); the lifecycle
 *     controls moved into the ShareHub popover's "Show" section, which is now the single home
 *     for them in both directions (Archive when live/held, Unarchive when archived).
 *   - Correction-loop CALLOUT → the Parse warnings panel (`WarningsBreakdown`,
 *     step3ReviewSections.tsx), which already rendered the SAME sentence whenever
 *     `warnings.length > 0` — a superset of the actionable subset that gated it here. The two
 *     rendered one scroll apart inside a single modal and read as two separate instructions.
 *     The panel owns it now, with a mode-derived verb (re-sync published / re-scan wizard).
 *
 * RSC boundary: Overview renders inside the CLIENT `ShowReviewSurface` (via an extra-section
 * `render()` closure), so it is a client component. The server-only attention cluster is
 * pre-rendered by the server loader and handed in as the `attentionSlot` ReactNode prop.
 *
 * Mode boundaries (spec §6). With the lifecycle controls and the callout gone, `archived` is
 * the only thing the sheet/sync cluster reads:
 *   - Not archived (published OR held) → alert only; the cluster renders no child.
 *   - Archived (read-only)             → alert · Re-sync-PAUSED notice.
 *
 * The `#overview` wrapper anchor is the target of the strip's alert badge (StatusStrip.tsx:149)
 * and the spec §10 hash deep link.
 *
 * Guard conditions (spec §11):
 *   - not archived → the sheet/sync cluster renders no child.
 */

import type { ReactNode } from "react";

export type OverviewSectionProps = {
  /** Read-only lifecycle state: gates the Re-sync-paused notice. */
  archived: boolean;
  /** Attention banners + degraded notice for this show (published-show-alerts §5.4). */
  attentionSlot: ReactNode;
};

export function OverviewSection({ archived, attentionSlot }: OverviewSectionProps) {
  return (
    <section
      id="overview"
      data-testid="overview-section"
      aria-label="Overview"
      className="flex scroll-mt-4 flex-col gap-section-gap"
    >
      {attentionSlot}

      {/* Sheet & sync — every affordance that used to sit here now lives in the
          status band (see the relocation list above). What is left is the archived
          PAUSED NOTICE, so the reason Re-sync is unavailable is still stated where
          the rest of the archived read-only story is told (§6.7).

          The correction-loop CALLOUT left too. It is guidance, not an affordance,
          but the Parse warnings panel already rendered the identical sentence on a
          strictly wider gate, so this instance could never be the only one on
          screen — it was a verbatim duplicate one scroll away in the same modal.
          Do NOT reintroduce a copy here.

          The wrapper STAYS even though only one arm can fill it: it is the
          documented sheet/sync slot, and collapsing it into a bare conditional
          would make the next addition here reach for a new container. */}
      <div data-testid="overview-sheet-sync" className="flex flex-col gap-3">
        {archived ? (
          <span data-testid="admin-show-resync-archived" className="text-sm text-text-subtle">
            Re-sync is paused while this show is archived.
          </span>
        ) : null}
      </div>
    </section>
  );
}
