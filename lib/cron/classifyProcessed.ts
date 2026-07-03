// lib/cron/classifyProcessed.ts
import type { RunScheduledCronSyncResult } from "@/lib/sync/runScheduledCronSync";
import { CONCURRENT_SYNC_SKIPPED } from "@/lib/sync/lockedShowTx";

// Benign (non-failure) outcomes. Anything NOT here, NOT the ConcurrentSyncSkipped shape,
// is counted as `failed` (conservative) — a NEW/missed outcome surfaces, never silently benign.
const SKIPPED = new Set(["skipped", "asset_recovery"]);
export const MAX_FAILURE_BREADCRUMBS = 25;

export type ClassifiedProcessed = {
  counts: { processed: number; applied: number; staged: number; skipped: number; failed: number };
  breadcrumbs: Array<{ driveFileId: string; outcome: string; code?: string }>;
  failuresTruncated: boolean;
  fingerprintParts: string[];
};

export function classifyProcessed(
  processed: RunScheduledCronSyncResult["processed"],
): ClassifiedProcessed {
  let applied = 0,
    staged = 0,
    skipped = 0,
    failed = 0;
  const breadcrumbs: ClassifiedProcessed["breadcrumbs"] = [];
  const fingerprintParts: string[] = [];
  for (const { driveFileId, result: r } of processed) {
    if ((r as { skipped?: string }).skipped === CONCURRENT_SYNC_SKIPPED) {
      skipped++;
      continue;
    }
    const outcome = (r as { outcome?: string }).outcome;
    if (outcome === "applied") applied++;
    else if (outcome === "stage") staged++;
    else if (outcome && SKIPPED.has(outcome)) skipped++;
    else {
      failed++;
      const code = (r as { code?: string }).code;
      const label = outcome ?? "unknown";
      fingerprintParts.push(`${driveFileId}|${code ?? label}`);
      if (breadcrumbs.length < MAX_FAILURE_BREADCRUMBS) {
        breadcrumbs.push({ driveFileId, outcome: label, ...(code ? { code } : {}) });
      }
    }
  }
  return {
    counts: { processed: processed.length, applied, staged, skipped, failed },
    breadcrumbs,
    failuresTruncated: failed > breadcrumbs.length,
    fingerprintParts,
  };
}
