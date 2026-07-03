// lib/cron/summarizeAssetRecovery.ts
import type { AssetRecoveryCronResult } from "@/lib/sync/assetRecovery";
import type { CronRunSummary } from "@/lib/cron/runSummary";

// Exhaustive map of every AssetRecoveryResult.outcome literal (lib/sync/assetRecovery.ts:102-115).
const RECOVERED = new Set(["recovered", "restage_required", "no_op"]);
const SKIPPED = new Set(["skipped", "revision_drift", "drift_cooldown"]);
const PARTIAL = new Set(["partial_failure", "bytes_exceeded"]);
// "infra_error" → infra. Anything UNKNOWN → conservative failure (never silently benign).

const MAX_FAILURE_BREADCRUMBS = 25;

export function summarizeAssetRecovery(result: AssetRecoveryCronResult): CronRunSummary {
  let recovered = 0,
    skipped = 0,
    failed = 0,
    infra = 0;
  const failures: Array<{ showId: string; outcome: string; code?: string }> = [];
  for (const { showId, result: r } of result.processed) {
    const o = r.outcome;
    if (RECOVERED.has(o)) {
      recovered++;
      continue;
    }
    if (SKIPPED.has(o)) {
      skipped++;
      continue;
    }
    // infra_error | PARTIAL-set | unknown → conservative failure (never silently benign).
    if (o === "infra_error") infra++;
    failed++;
    if (failures.length < MAX_FAILURE_BREADCRUMBS) {
      const code = (r as { code?: string }).code;
      failures.push({ showId, outcome: o, ...(code ? { code } : {}) });
    }
  }
  const counts = { processed: result.processed.length, recovered, skipped, failed };
  const outcome = infra > 0 ? "infra" : failed > 0 ? "partial" : "ok";
  return failures.length > 0 ? { outcome, counts, detail: { failures } } : { outcome, counts };
}
