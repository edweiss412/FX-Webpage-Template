import { log } from "@/lib/log";
import type { DiagramVariantFailureRow } from "@/lib/sync/snapshotAssets";

/**
 * POST-COMMIT emit for diagram variant generation failures (spec §3).
 *
 * The variant stage runs inside the show advisory-lock transaction, and
 * `log.warn` is durable (lib/log/logger.ts) — an in-lock emit would persist a
 * failure record for an Apply that later rolls back, violating invariant 10's
 * post-commit rule. So the stage emits nothing, the rows travel as DATA on each
 * result type, and every consuming surface calls this helper AFTER its
 * transaction commits. A rolled-back Apply emits nothing because it never
 * reaches its caller's post-commit region.
 *
 * One record per row, so a batch never collapses several distinct assets or
 * reasons into one. Centralised here so all five census sinks (cron/manual tail,
 * staged apply, existing-show retry, first-seen retry, asset recovery) emit an
 * identical payload — a per-site copy is how the shapes drift apart.
 *
 * DIAGRAM_VARIANT_GENERATION_FAILED is an internal telemetry code, not a §12.4
 * user-facing code: no catalog row, no `pnpm gen:spec-codes`. Redaction-safe —
 * an asset key, a reason token, and sharp's own message; no bytes, no URL, no
 * token.
 */
export async function emitDiagramVariantFailures(
  rows: readonly DiagramVariantFailureRow[],
  ctx: { showId: string },
): Promise<void> {
  for (const row of rows) {
    await log.warn("diagram variant generation failed", {
      source: "sync.diagramVariants",
      code: "DIAGRAM_VARIANT_GENERATION_FAILED",
      showId: ctx.showId,
      assetKey: row.assetKey,
      reason: row.reason,
      error: row.message,
    });
  }
}
