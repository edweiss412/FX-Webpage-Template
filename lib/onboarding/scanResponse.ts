/**
 * lib/onboarding/scanResponse.ts
 *
 * Canonical wire contract for POST /api/admin/onboarding/scan, imported by
 * BOTH the route (server) and <Step2Verify> (client). Defining it once turns
 * any server/client drift into a compile error instead of a runtime crash.
 *
 * History: the route previously returned the raw `runOnboardingScan` result
 * ({ outcome, processed }) verbatim, while the client read `result.totals.*` —
 * an independently-declared shape the server never emitted. Every successful
 * scan threw "Cannot read properties of undefined (reading 'staged')" and
 * crashed the wizard. The fix aggregates `processed[]` into `totals` here, and
 * both ends share this type.
 */
import type { OnboardingScanResult } from "@/lib/sync/runOnboardingScan";

export type OnboardingScanTotals = {
  staged: number;
  hard_failed: number;
  skipped_non_sheet: number;
  live_row_conflict: number;
};

/**
 * The "completed" response body the client actually consumes: per-bucket
 * totals plus the folder context the route holds (the client renders
 * folderName + the bucket counts; wizardSessionId/folderId travel for
 * completeness and future use).
 */
export type OnboardingScanCompletedBody = {
  outcome: "completed";
  wizardSessionId: string;
  folderId: string;
  folderName?: string | undefined;
  totals: OnboardingScanTotals;
};

/**
 * The full scan response union. "completed" is reshaped to totals; the
 * "schema_missing" / "superseded" variants pass through verbatim from
 * runOnboardingScan (the client reads only their `outcome` + `code`).
 */
export type OnboardingScanResponseBody =
  | OnboardingScanCompletedBody
  | Exclude<OnboardingScanResult, { outcome: "completed" }>;

export function aggregateProcessedTotals(
  processed: Extract<OnboardingScanResult, { outcome: "completed" }>["processed"],
): OnboardingScanTotals {
  const totals: OnboardingScanTotals = {
    staged: 0,
    hard_failed: 0,
    skipped_non_sheet: 0,
    live_row_conflict: 0,
  };
  for (const entry of processed) totals[entry.outcome] += 1;
  return totals;
}

export function toScanResponseBody(
  result: OnboardingScanResult,
  context: { wizardSessionId: string; folderId: string; folderName?: string | undefined },
): OnboardingScanResponseBody {
  if (result.outcome === "completed") {
    return {
      outcome: "completed",
      wizardSessionId: context.wizardSessionId,
      folderId: context.folderId,
      folderName: context.folderName,
      totals: aggregateProcessedTotals(result.processed),
    };
  }
  // schema_missing | superseded — verbatim; the client reads only outcome + code.
  return result;
}
