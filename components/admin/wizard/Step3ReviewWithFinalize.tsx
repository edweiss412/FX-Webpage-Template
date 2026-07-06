"use client";

/**
 * components/admin/wizard/Step3ReviewWithFinalize.tsx
 *
 * Client wrapper that keeps the wizard step-3 publish count in sync with the
 * checkboxes. <Step3Review> owns the optimistic publish-intent overlay (the
 * boxes flip instantly); the Publish button renders the "Publish N shows &
 * finish setup" label. They used to be server-fed siblings, so the button count
 * lagged the boxes by a POST round-trip + router.refresh() — caught mid-flight
 * as checked boxes alongside "Publish 0 shows" (the publish-count lag bug).
 *
 * This wrapper holds the counts in client state, seeded from the server values
 * (so first paint is correct, no flash) and updated live by <Step3Review> via
 * onCountsChange. `finishable` stays server-derived: it gates on BLOCKING rows,
 * which cannot change optimistically and only settle on the next refresh.
 *
 * FOOTER LAYOUT (tracking-in-center redesign, 2026-07-05). The finalize state
 * machine is lifted via `useFinalizeRun` so its two surfaces sit in SEPARATE
 * <WizardFooter> slots:
 *   - CENTER: a calm idle hint ("You can finish setup whenever you are ready.")
 *     while nothing is publishing; the live publish TRACKING (a compact progress
 *     readout) while running; the terminal recovery panels on failure/complete.
 *     The old "N of M selected" count is gone. The center reserves a min-height
 *     so the idle→tracking swap barely shifts the bar, and any taller terminal
 *     panel grows UPWARD (items-end) around the baselined Back / Publish.
 *   - RIGHT (primary): the Publish button. It no longer morphs into the progress
 *     panel in place (that morph was the layout shift) — while running it simply
 *     steps aside and the center carries the tracking, so the button's slot no
 *     longer jumps.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import {
  useFinalizeRun,
  FinalizeAnnouncer,
  FinalizeTrigger,
  FinalizeConfirm,
  FinalizeStatusRegion,
  casPhaseLabel,
  type FinalizeRun,
} from "@/components/admin/FinalizeButton";
import { WizardFooter } from "@/components/admin/wizard/WizardFooter";
import { CleanupAbandonedFinalizeButton } from "@/components/admin/CleanupAbandonedFinalizeButton";
import {
  Step3Review,
  computeSelectableCounts,
  type Step3PublishCounts,
  type Step3Row,
} from "@/components/admin/wizard/Step3Review";

type Step3ReviewWithFinalizeProps = {
  wizardSessionId: string;
  rows: Step3Row[];
  finishable: boolean;
  // Server-derived seed counts (status === 'applied' / 'staged'), matching the
  // first optimistic render so the label never flashes a stale value on mount.
  initialPublishCount: number;
  initialUncheckedCleanCount: number;
  // Step-3 consolidation (spec §4.3/§4.5): the finalize checkpoint for THIS
  // session, threaded so the unified surface renders the mid-finalize footer
  // mode (Resume/Finish) instead of the pre-finalize Publish action, and the
  // rows render badge-only (no editable checkbox). null = pre-finalize.
  checkpointStatus?: "in_progress" | "all_batches_complete" | null;
  // Spec §4.5: at an all_batches_complete checkpoint that has sat untouched past
  // the staleness window, the footer shows a recovery note + Cleanup control
  // (replacing the standalone StaleReadyToPublish interstitial).
  isStale?: boolean;
};

const FINISH_HINT = "You can finish setup whenever you are ready.";

export function Step3ReviewWithFinalize({
  wizardSessionId,
  rows,
  finishable,
  initialPublishCount,
  initialUncheckedCleanCount,
  checkpointStatus = null,
  isStale = false,
}: Step3ReviewWithFinalizeProps) {
  const [counts, setCounts] = useState<Step3PublishCounts>({
    publishCount: initialPublishCount,
    uncheckedCleanCount: initialUncheckedCleanCount,
    // Seed the selectable totals from the server rows so the counts feeding the
    // Publish label + soft confirm are correct on first paint.
    ...computeSelectableCounts(rows),
  });

  // Spec §4.5: the footer primary follows the checkpoint. null → Publish (full
  // finalize + CAS); in_progress → Resume (finalize loop only); all_batches_
  // complete → Finish (CAS only).
  const mode =
    checkpointStatus === "in_progress"
      ? "resume"
      : checkpointStatus === "all_batches_complete"
        ? "finish"
        : "publish";

  // The disabled gate is UNCHANGED — it gates on `finishable` (a blocking row
  // blocks finish), NOT on selectableTotal. A finishable page with zero
  // selectable rows keeps Publish enabled (finish-with-nothing is reachable,
  // spec §4.4/§10). The live counts drive the "Publish N shows" label + confirm.
  const run = useFinalizeRun({
    wizardSessionId,
    disabled: !finishable,
    publishCount: counts.publishCount,
    uncheckedCleanCount: counts.uncheckedCleanCount,
    mode,
  });

  // Cleanup control appears mid-finalize (in_progress) and on a STALE
  // all_batches_complete checkpoint — the two states where a finalize may have
  // been abandoned and the operator needs an escape hatch (spec §4.5).
  const showCleanup =
    checkpointStatus === "in_progress" || (checkpointStatus === "all_batches_complete" && isStale);

  return (
    <div className="flex min-h-full flex-col">
      <div className="pb-24">
        <Step3Review
          wizardSessionId={wizardSessionId}
          rows={rows}
          onCountsChange={setCounts}
          isPublishRunActive={run.isRunning}
          checkpointStatus={checkpointStatus}
        />
      </div>
      {rows.length > 0 ? (
        <WizardFooter
          back={
            <Link
              data-testid="wizard-step3-back"
              href="/admin?step=2"
              className="inline-flex min-h-tap-min items-center gap-1 rounded-sm px-2 text-sm font-medium text-text-subtle transition-colors duration-fast hover:text-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            >
              <ChevronLeft aria-hidden="true" className="size-4" />
              Back
            </Link>
          }
          center={<Step3FooterCenter run={run} isStale={isStale} />}
          primary={
            <div className="flex items-end gap-3">
              <FinalizeAnnouncer run={run} />
              {showCleanup ? <CleanupAbandonedFinalizeButton sessionId={wizardSessionId} /> : null}
              {/* While publishing, the button steps aside and the center carries
                  the tracking — so this slot never morphs (no layout shift). */}
              {run.isRunning ? null : <FinalizeTrigger run={run} />}
            </div>
          }
        />
      ) : null}
    </div>
  );
}

/**
 * The footer center: idle hint · live tracking · terminal panels · soft confirm.
 * A reserved min-height keeps the idle→running swap from jolting the bar.
 */
function Step3FooterCenter({ run, isStale = false }: { run: FinalizeRun; isStale?: boolean }) {
  const { state } = run;
  return (
    <div
      data-testid="wizard-step3-footer-center"
      className="flex min-h-12 w-full max-w-md flex-col items-stretch justify-center"
    >
      {run.confirmOpen ? (
        <FinalizeConfirm run={run} />
      ) : state.kind === "running" ? (
        <Step3CompactTracking run={run} />
      ) : state.kind === "idle" ? (
        // Spec §4.5: a STALE all_batches_complete checkpoint replaces the calm
        // idle hint with a recovery note (the old StaleReadyToPublish framing,
        // folded inline). The Finish + Cleanup controls sit in the primary slot.
        isStale ? (
          <p
            data-testid="wizard-step3-stale-note"
            className="text-center text-sm font-medium text-warning-text"
          >
            This setup was left partway through publishing. Finish it, or clean it up to start over.
          </p>
        ) : (
          <p
            data-testid="wizard-step3-finish-hint"
            className="text-center text-sm text-text-subtle"
          >
            {FINISH_HINT}
          </p>
        )
      ) : (
        // race_row / cas_per_row / error / complete
        <FinalizeStatusRegion run={run} />
      )}
    </div>
  );
}

/**
 * Compact publish tracking for the footer center — a slim progress readout
 * rather than the boxed <ProgressPanel>, so it barely changes the bar's height.
 * Carries `run.panelRef` (tabIndex=-1) so the hook's focus-on-running still
 * lands here, and the native <progress> owns the progressbar role.
 */
function Step3CompactTracking({ run }: { run: FinalizeRun }) {
  const { state } = run;
  // WCAG 2.4.3: when Publish is clicked the trigger button is removed (it lives
  // in the footer's right slot) and this tracking takes over the center — move
  // focus here so keyboard/SR users are not dropped onto <body>. A LOCAL ref +
  // mount-time focus (rather than the hook's panelRef, which the combined
  // FinalizeButton drives) keeps this idiomatic and lint-clean.
  const trackingRef = useRef<HTMLDivElement>(null);
  const running = state.kind === "running";
  useEffect(() => {
    if (running) trackingRef.current?.focus();
  }, [running]);
  if (!running) return null;
  return (
    <div
      ref={trackingRef}
      tabIndex={-1}
      role="group"
      aria-label="Publish progress"
      data-testid="wizard-step3-tracking"
      className="flex w-full flex-col gap-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
    >
      {state.phase === "batch" ? (
        <>
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-semibold text-text-strong" aria-hidden="true">
              Publishing your shows…
            </span>
            {state.total > 0 ? (
              <span className="shrink-0 tabular-nums text-text-subtle" aria-hidden="true">
                {Math.min(state.done, state.total)} of {state.total}
              </span>
            ) : null}
          </div>
          <progress
            data-testid="wizard-finalize-progressbar"
            className="h-1.5 w-full"
            max={state.total > 0 ? state.total : undefined}
            value={state.total > 0 ? Math.min(state.done, state.total) : undefined}
            aria-label="Publish progress"
          />
          {state.lastName ? (
            <span className="truncate text-text-subtle" title={state.lastName} aria-hidden="true">
              Publishing: {state.lastName}
            </span>
          ) : null}
        </>
      ) : (
        <>
          <span className="font-semibold text-text-strong" aria-hidden="true">
            Finishing setup…
          </span>
          <span className="text-text-subtle" aria-hidden="true">
            {casPhaseLabel(state.casPhase)}
          </span>
        </>
      )}
    </div>
  );
}
