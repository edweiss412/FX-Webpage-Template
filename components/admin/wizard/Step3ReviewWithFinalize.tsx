"use client";

/**
 * components/admin/wizard/Step3ReviewWithFinalize.tsx
 *
 * Client wrapper that keeps the wizard step-3 publish count in sync with the
 * checkboxes. <Step3Review> owns the optimistic publish-intent overlay (the
 * boxes flip instantly); <FinalizeButton> renders the "Publish N shows & finish
 * setup" label. They used to be server-fed siblings, so the button count was
 * derived from `result.rows[].status` and lagged the boxes by a POST round-trip
 * + router.refresh() — caught mid-flight as checked boxes alongside
 * "Publish 0 shows" (the publish-count lag bug).
 *
 * This wrapper holds the counts in client state, seeded from the server values
 * (so first paint is correct, no flash) and updated live by <Step3Review> via
 * onCountsChange. The label now tracks the boxes with zero delay. `finishable`
 * stays server-derived: it gates on BLOCKING rows, which cannot change
 * optimistically and only settle on the next refresh.
 */
import { useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { FinalizeButton } from "@/components/admin/FinalizeButton";
import { WizardFooter } from "@/components/admin/wizard/WizardFooter";
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
};

export function Step3ReviewWithFinalize({
  wizardSessionId,
  rows,
  finishable,
  initialPublishCount,
  initialUncheckedCleanCount,
}: Step3ReviewWithFinalizeProps) {
  const [counts, setCounts] = useState<Step3PublishCounts>({
    publishCount: initialPublishCount,
    uncheckedCleanCount: initialUncheckedCleanCount,
    // Seed the selectable totals from the server rows so the sticky bar's "N of M"
    // is correct on first paint (same "seeded from server, no flash" contract).
    ...computeSelectableCounts(rows),
  });

  return (
    // The publish controls now live in the shared full-width <WizardFooter>
    // (fixed to the viewport bottom, spanning edge-to-edge). It positions against
    // the viewport, so this wrapper no longer needs `relative`/`w-full` to size a
    // sticky child. Bottom padding on the scroll body keeps the last card clear of
    // the fixed footer (DI-3, spec §7); OnboardingWizard pads the column too.
    <div className="flex min-h-full flex-col">
      <div className="pb-24">
        <Step3Review wizardSessionId={wizardSessionId} rows={rows} onCountsChange={setCounts} />
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
          center={
            <p
              data-testid="wizard-step3-publish-count"
              className="text-sm tabular-nums text-text-subtle"
            >
              <b className="text-text-strong">{counts.selectedCount}</b> of {counts.selectableTotal}{" "}
              selected to publish
            </p>
          }
          primary={
            // The disabled gate is UNCHANGED — it gates on `finishable` (a blocking
            // row blocks finish), NOT on selectableTotal. A finishable page with
            // zero selectable rows keeps Publish enabled (finish-with-nothing is
            // reachable, spec §4.4/§10). panelPlacement="above" floats the
            // running/terminal panels above the footer (in-flow, flex-col-reverse).
            <FinalizeButton
              wizardSessionId={wizardSessionId}
              disabled={!finishable}
              publishCount={counts.publishCount}
              uncheckedCleanCount={counts.uncheckedCleanCount}
              panelPlacement="above"
            />
          }
        />
      ) : null}
    </div>
  );
}
