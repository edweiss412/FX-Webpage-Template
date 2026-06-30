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
import { FinalizeButton } from "@/components/admin/FinalizeButton";
import {
  Step3Review,
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
  });

  return (
    <div className="flex flex-col gap-section-gap">
      <Step3Review wizardSessionId={wizardSessionId} rows={rows} onCountsChange={setCounts} />
      {rows.length > 0 ? (
        <FinalizeButton
          wizardSessionId={wizardSessionId}
          disabled={!finishable}
          publishCount={counts.publishCount}
          uncheckedCleanCount={counts.uncheckedCleanCount}
        />
      ) : null}
    </div>
  );
}
