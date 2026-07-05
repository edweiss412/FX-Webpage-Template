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
import Link from "next/link";
import { ResumeFinalizeButton } from "@/components/admin/ResumeFinalizeButton";
import { CleanupAbandonedFinalizeButton } from "@/components/admin/CleanupAbandonedFinalizeButton";
import { HelpAffordance } from "@/components/admin/HelpAffordance";
import { messageFor } from "@/lib/messages/lookup";
import { MESSAGE_CATALOG, type MessageCode } from "@/lib/messages/catalog";
import type { UnresolvedSheet, UnresolvedSheetsInfraError } from "@/app/admin/_unresolvedSheets";

type FinalizeInProgressProps = {
  sessionId: string;
  batchesCompleted: number;
  totalApprovedCount?: number;
  lastProcessedAt?: string | null;
  // The sheets blocking this session from finishing, read at render time
  // (spec §3). An array (possibly empty) or a degraded-read discriminant.
  unresolved?: UnresolvedSheet[] | UnresolvedSheetsInfraError;
};

// Doug-facing copy for a failure code, routed through the catalog (invariant 5).
// A blocking-status row can carry a null code; fall back to neutral copy —
// never invent or render a raw code.
function copyForCode(code: string | null): string {
  if (code && code in MESSAGE_CATALOG) {
    const dougFacing = messageFor(code as MessageCode).dougFacing;
    if (dougFacing) return dougFacing;
  }
  return "This sheet needs review before setup can finish.";
}

function isInfraError(
  value: FinalizeInProgressProps["unresolved"],
): value is UnresolvedSheetsInfraError {
  return typeof value === "object" && value !== null && "kind" in value;
}

export function FinalizeInProgress({
  sessionId,
  batchesCompleted,
  totalApprovedCount,
  lastProcessedAt: _lastProcessedAt,
  unresolved,
}: FinalizeInProgressProps) {
  const showProgressDenominator = typeof totalApprovedCount === "number" && totalApprovedCount > 0;
  const unresolvedSheets = Array.isArray(unresolved) ? unresolved : [];
  const unresolvedInfraError = isInfraError(unresolved);

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
        <h2 className="text-2xl font-semibold text-text-strong">Setup is publishing your shows…</h2>
        <p className="max-w-prose text-base text-text-subtle">
          Setup published a batch of shows in your last session. Pick up where you left off to
          finish the rest.
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
        {unresolvedInfraError ? (
          <p
            data-testid="finalize-in-progress-unresolved-error"
            className="text-sm text-text-subtle"
          >
            We couldn&apos;t load the blocked sheets right now. Refresh in a moment.
          </p>
        ) : null}
      </section>

      {unresolvedSheets.length > 0 ? (
        <section
          data-testid="finalize-in-progress-unresolved"
          aria-labelledby="finalize-in-progress-unresolved-heading"
          className="flex flex-col gap-3 rounded-md border border-border bg-warning-bg p-tile-pad text-warning-text"
        >
          <div className="flex flex-col gap-1">
            <h3 id="finalize-in-progress-unresolved-heading" className="text-lg font-semibold">
              Sheets that need review first
            </h3>
            <p className="max-w-prose text-sm">
              These sheets have to be resolved before setup can finish. Open each one, review it,
              then come back and resume.
            </p>
          </div>
          <ul className="flex flex-col gap-3">
            {unresolvedSheets.map((sheet) => (
              <li key={sheet.driveFileId} className="flex flex-col gap-1 text-sm">
                {/* Belt-and-suspenders: the reader fills displayName (title or
                    driveFileId), but never render a blank bold line if it's empty. */}
                <span className="wrap-break-word font-medium">
                  {sheet.displayName || sheet.driveFileId}
                </span>
                <span>{copyForCode(sheet.failureCode)}</span>
                <HelpAffordance code={sheet.failureCode} />
                <Link
                  data-testid={`finalize-in-progress-resolve-${sheet.driveFileId}`}
                  href={sheet.reApplyHref}
                  className="inline-flex min-h-tap-min items-center self-start font-medium text-warning-text underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                >
                  Review and resolve
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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
          If setup is stuck and you would rather start over, you can discard it. Shows you already
          published in this run stay live and your other live shows are never touched. Only the
          unfinished part is cleared.
        </p>
        <CleanupAbandonedFinalizeButton sessionId={sessionId} />
      </section>
    </main>
  );
}
