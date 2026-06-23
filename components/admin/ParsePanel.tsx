/**
 * components/admin/ParsePanel.tsx (M6 §B Task 6.11 — UI portion)
 *
 * Per-show parse panel. Lists the live `pending_syncs` rows (the page
 * Server Component filters to `wizard_session_id IS NULL`) and renders
 * one <StagedReviewCard> per row.
 *
 * Pre-amendment AC-6.11 behavior (Amendment 9 deferred as M6-D12):
 * first-seen and existing-show staged rows are rendered uniformly; the
 * card itself decides which discard variants apply.
 *
 * Empty state intentionally uses hard-coded copy. The §12.4 catalog has
 * no "empty queue" code (catalog is for surfacing failures, not absence
 * of failures), so messageFor() does not apply here.
 *
 * Server Component (no 'use client') — children are Client Components.
 */
import { StagedReviewCard, type StagedRow } from "@/components/admin/StagedReviewCard";

export type ParsePanelProps = {
  rows: StagedRow[];
  /** Forwarded to every card; the page binds this to router.refresh. */
  onMutated?: () => void;
  /**
   * Show id — forwarded to every card so the per-row admin "Report this"
   * affordance (M8 Task 8.4 §B) is scoped to this show. Optional for
   * back-compat with admin contexts that don't surface the reporter.
   */
  showId?: string;
  /**
   * M12.2 Phase A (§6 / R32) — render every card read-only (apply/discard
   * suppressed) for an ARCHIVED show; the staged change stays viewable.
   */
  readOnly?: boolean;
};

export function ParsePanel({ rows, onMutated, showId, readOnly }: ParsePanelProps) {
  if (rows.length === 0) {
    return (
      <section
        data-testid="parse-panel-empty"
        aria-labelledby="parse-panel-empty-heading"
        className="rounded-md border border-border bg-surface p-tile-pad"
      >
        <h2 id="parse-panel-empty-heading" className="text-base font-semibold text-text-strong">
          Nothing to review
        </h2>
        <p className="mt-2 text-sm text-text-subtle">
          No sheet changes are waiting for your review on this show.
        </p>
      </section>
    );
  }

  return (
    <section
      data-testid="parse-panel"
      aria-labelledby="parse-panel-heading"
      className="space-y-section-gap"
    >
      <h2 id="parse-panel-heading" className="sr-only">
        Changes waiting for review
      </h2>
      <ul className="space-y-section-gap">
        {rows.map((row) => {
          // exactOptionalPropertyTypes: build the props object explicitly so
          // optional fields are only included when defined, avoiding the
          // `undefined`-widening that strict exact-optional types reject.
          const cardProps: React.ComponentProps<typeof StagedReviewCard> = {
            row,
            ...(onMutated ? { onMutated } : {}),
            ...(showId ? { showId } : {}),
            ...(readOnly ? { readOnly: true } : {}),
          };
          return (
            <li key={row.stagedId}>
              <StagedReviewCard {...cardProps} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
