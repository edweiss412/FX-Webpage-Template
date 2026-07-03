// lib/cron/summarizeSync.ts
import type { RunScheduledCronSyncResult } from "@/lib/sync/runScheduledCronSync";
import type { CronRunSummary } from "@/lib/cron/runSummary";
import { classifyProcessed } from "@/lib/cron/classifyProcessed";

export function summarizeSync(result: RunScheduledCronSyncResult): CronRunSummary {
  const { counts, breadcrumbs, failuresTruncated, fingerprintParts } = classifyProcessed(
    result.processed,
  );

  if (result.summary?.outcome === "parse_error") {
    return { outcome: "infra", counts, detail: { summary: result.summary } };
  }
  const heartbeatFault = result.maintenanceFaults?.syncCronHeartbeat === "infra_error";
  if (counts.failed > 0 || heartbeatFault) {
    const failuresFingerprint = fingerprintParts.length
      ? [...fingerprintParts].sort().join(",")
      : "heartbeat";
    const detail = {
      ...(result.maintenanceFaults ? { maintenanceFaults: result.maintenanceFaults } : {}),
      ...(breadcrumbs.length > 0 ? { failures: breadcrumbs } : {}),
      ...(failuresTruncated ? { failuresTruncated: true } : {}),
      failuresFingerprint,
    };
    return { outcome: "partial", counts, detail };
  }
  if (result.summary?.outcome === "skipped") {
    return { outcome: "ok", counts, detail: { skipReason: result.summary.skipReason } };
  }
  return { outcome: "ok", counts };
}
