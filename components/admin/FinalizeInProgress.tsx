/**
 * components/admin/FinalizeInProgress.tsx (M10 §B Task 10.1 §B / Phase 2)
 *
 * Rendered by app/admin/page.tsx when wizard_finalize_checkpoints.status
 * is 'in_progress' for the pending wizard session. Operator paused
 * mid-finalize (e.g., closed the tab after batch 2 of 3); this surface
 * lets them resume.
 *
 * Per plan §M10 Task 10.1 finding 2:
 *   - Title and progress bar showing batches_completed / total_approved.
 *   - <ResumeFinalizeButton /> wires to POST /api/admin/onboarding/finalize.
 *   - "Cleanup abandoned finalize" affordance (secondary action) — the
 *     helper's own staleness gate refuses fresh sessions per Task 10.1
 *     finding 1 helper guards 3 + 4.
 */
import { ResumeFinalizeButton } from "@/components/admin/ResumeFinalizeButton";
import { CleanupAbandonedFinalizeButton } from "@/components/admin/CleanupAbandonedFinalizeButton";

type FinalizeInProgressProps = {
  sessionId: string;
  batchesCompleted: number;
  totalApprovedCount?: number;
  lastProcessedAt?: string | null;
};

export function FinalizeInProgress({
  sessionId,
  batchesCompleted,
  totalApprovedCount,
  lastProcessedAt: _lastProcessedAt,
}: FinalizeInProgressProps) {
  const showProgressDenominator =
    typeof totalApprovedCount === "number" && totalApprovedCount > 0;

  return (
    <main
      data-testid="admin-finalize-in-progress"
      className="mx-auto flex max-w-2xl flex-col gap-section-gap"
    >
      <header className="flex flex-col gap-2">
        <p
          className="text-xs font-medium uppercase text-text-subtle"
          style={{ letterSpacing: "var(--tracking-eyebrow)" }}
        >
          Admin
        </p>
        <h2 className="text-2xl font-semibold text-text-strong">
          Setup is publishing your shows…
        </h2>
        <p className="max-w-prose text-base text-text-subtle">
          Setup published a batch of shows in your last session. Pick up where
          you left off to finish the rest.
        </p>
      </header>

      <section
        aria-labelledby="finalize-in-progress-progress-heading"
        className="flex flex-col gap-3 rounded-md border border-border bg-surface p-tile-pad"
      >
        <h3
          id="finalize-in-progress-progress-heading"
          className="text-lg font-semibold text-text-strong"
        >
          Progress
        </h3>
        <p
          data-testid="admin-finalize-in-progress-progress"
          className="text-base text-text tabular-nums"
        >
          {showProgressDenominator
            ? `${batchesCompleted} of ${totalApprovedCount} sheets published`
            : `${batchesCompleted} sheets published`}
        </p>
        <ResumeFinalizeButton sessionId={sessionId} />
      </section>

      <section
        aria-labelledby="finalize-in-progress-discard-heading"
        className="flex flex-col gap-3 rounded-md border border-border bg-surface-sunken p-tile-pad"
      >
        <h3
          id="finalize-in-progress-discard-heading"
          className="text-lg font-semibold text-text-strong"
        >
          Trouble finishing?
        </h3>
        <p className="max-w-prose text-sm text-text-subtle">
          If this setup has been paused for a long time and you would rather
          start fresh, you can discard it. This deletes the shows from this
          run only; live shows from your other folder are not touched.
        </p>
        <CleanupAbandonedFinalizeButton sessionId={sessionId} />
      </section>
    </main>
  );
}
