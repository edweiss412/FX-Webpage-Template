// lib/cron/summarizeSync.ts
import type { RunScheduledCronSyncResult } from "@/lib/sync/runScheduledCronSync";
import { CONCURRENT_SYNC_SKIPPED } from "@/lib/sync/lockedShowTx";
import type { CronRunSummary } from "@/lib/cron/runSummary";

const FAILED = new Set([
  "hard_fail",
  "parse_error",
  "source_gone",
  "stale",
  "revision_race",
  "revision_race_cooldown",
]);
// Benign (non-failure) `outcome` values. Anything NOT recognized here, NOT the ConcurrentSyncSkipped
// shape below, is counted as `failed` (conservative) — a NEW/missed outcome surfaces as `partial`,
// never silently benign (§4.4 exhaustiveness).
const SKIPPED = new Set(["skipped", "asset_recovery"]);

export function summarizeSync(result: RunScheduledCronSyncResult): CronRunSummary {
  let applied = 0,
    staged = 0,
    skipped = 0,
    failed = 0;
  for (const { result: r } of result.processed) {
    // ConcurrentSyncSkipped has shape { skipped: CONCURRENT_SYNC_SKIPPED } — NO `outcome` field
    // (lib/sync/lockedShowTx.ts:16-18). A benign lock-contention skip; count as skipped, not failed.
    if ((r as { skipped?: string }).skipped === CONCURRENT_SYNC_SKIPPED) {
      skipped++;
      continue;
    }
    const outcome = (r as { outcome?: string }).outcome;
    if (outcome === "applied") applied++;
    else if (outcome === "stage") staged++;
    else if (outcome && SKIPPED.has(outcome)) skipped++;
    else if (outcome && FAILED.has(outcome)) failed++;
    else failed++; // UNKNOWN/unforeseen outcome → conservative failure (never silently benign)
  }
  const counts = { processed: result.processed.length, applied, staged, skipped, failed };

  if (result.summary?.outcome === "parse_error") {
    return { outcome: "infra", counts, detail: { summary: result.summary } };
  }
  const heartbeatFault = result.maintenanceFaults?.syncCronHeartbeat === "infra_error";
  if (failed > 0 || heartbeatFault) {
    // exactOptionalPropertyTypes: omit `detail` rather than assign `undefined`.
    return result.maintenanceFaults
      ? { outcome: "partial", counts, detail: { maintenanceFaults: result.maintenanceFaults } }
      : { outcome: "partial", counts };
  }
  if (result.summary?.outcome === "skipped") {
    return { outcome: "ok", counts, detail: { skipReason: result.summary.skipReason } };
  }
  return { outcome: "ok", counts };
}
