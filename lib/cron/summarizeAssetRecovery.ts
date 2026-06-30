// lib/cron/summarizeAssetRecovery.ts
import type { AssetRecoveryCronResult } from "@/lib/sync/assetRecovery";
import type { CronRunSummary } from "@/lib/cron/runSummary";

// Exhaustive map of every AssetRecoveryResult.outcome literal (lib/sync/assetRecovery.ts:102-115).
const RECOVERED = new Set(["recovered", "restage_required", "no_op"]);
const SKIPPED = new Set(["skipped", "revision_drift", "drift_cooldown"]);
const PARTIAL = new Set(["partial_failure", "bytes_exceeded"]);
// "infra_error" → infra. Anything UNKNOWN → conservative failure (never silently benign).

export function summarizeAssetRecovery(result: AssetRecoveryCronResult): CronRunSummary {
  let recovered = 0,
    skipped = 0,
    failed = 0,
    infra = 0;
  for (const { result: r } of result.processed) {
    const o = r.outcome;
    if (o === "infra_error") {
      infra++;
      failed++;
    } else if (PARTIAL.has(o)) failed++;
    else if (RECOVERED.has(o)) recovered++;
    else if (SKIPPED.has(o)) skipped++;
    else failed++; // unknown/unforeseen → conservative failure
  }
  const counts = { processed: result.processed.length, recovered, skipped, failed };
  const outcome = infra > 0 ? "infra" : failed > 0 ? "partial" : "ok";
  return { outcome, counts };
}
