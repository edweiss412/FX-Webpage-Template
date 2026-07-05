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
import { Step3PublishBar } from "@/components/admin/wizard/Step3PublishBar";
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
    // `w-full` is load-bearing: the sticky bar's `w-full` resolves against THIS
    // wrapper, so it must fill the wizard container's width for DI-3 (bar spans
    // the container). This project's Tailwind v4 flex parents are not relied on to
    // stretch children implicitly.
    <div className="relative flex min-h-full w-full flex-col">
      {/* Scroll body: bottom padding so the last card is never occluded by the
          sticky bar (DI-3, spec §7). */}
      <div className="pb-24">
        <Step3Review wizardSessionId={wizardSessionId} rows={rows} onCountsChange={setCounts} />
      </div>
      {rows.length > 0 ? (
        <Step3PublishBar>
          <p
            data-testid="wizard-step3-publish-count"
            className="text-sm tabular-nums text-text-subtle"
          >
            <b className="text-text-strong">{counts.selectedCount}</b> of {counts.selectableTotal}{" "}
            selected to publish
          </p>
          <div className="ml-auto flex items-end gap-3">
            <Link
              data-testid="wizard-step3-back"
              href="/admin?step=2"
              className="inline-flex min-h-tap-min items-center gap-1 rounded-md px-3 text-sm font-medium text-text-subtle transition-colors duration-fast hover:text-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            >
              <ChevronLeft aria-hidden="true" className="size-4" />
              Back
            </Link>
            {/* The disabled gate is UNCHANGED — it gates on `finishable` (a blocking
                row blocks finish), NOT on selectableTotal. A finishable page with
                zero selectable rows keeps Publish enabled (finish-with-nothing is
                reachable, spec §4.4/§10). panelPlacement="above" floats the
                running/terminal panels above the bar. */}
            <FinalizeButton
              wizardSessionId={wizardSessionId}
              disabled={!finishable}
              publishCount={counts.publishCount}
              uncheckedCleanCount={counts.uncheckedCleanCount}
              panelPlacement="above"
            />
          </div>
        </Step3PublishBar>
      ) : null}
    </div>
  );
}
