// lib/cron/withCronRunSummary.ts
import type { NextRequest } from "next/server";
import { log } from "@/lib/log";
import {
  deriveRequestId,
  getRequestContext,
  runWithRequestContext,
  type RequestContext,
} from "@/lib/log/requestContext";
import { CRON_RUN_SUMMARY, type CronRunSummary } from "@/lib/cron/runSummary";

type SyncRunContext = {
  phase?: string;
  folderId?: string | null;
  inFlightDriveFileId?: string | null;
  processedBeforeThrow?: number;
  failures?: Array<{ driveFileId: string; outcome: string; code?: string }>;
};

// Fallback attribution for a cron.sync throw that BYPASSED runScheduledCronSync's
// S1 syncRunContext attach (a detached/route-tail throw): read the in-flight
// markers the sync body mirrored into the request-context ALS. Total + no-throw:
// returns undefined unless cronPhase is a string; Number.isFinite excludes NaN.
function cronCtxFromALS(store: RequestContext | undefined): SyncRunContext | undefined {
  if (!store || typeof store.cronPhase !== "string") return undefined;
  return {
    phase: store.cronPhase,
    inFlightDriveFileId: store.cronInFlightDriveFileId ?? null,
    ...(Number.isFinite(store.cronProcessedCount)
      ? { processedBeforeThrow: store.cronProcessedCount as number }
      : {}),
  };
}

export async function runCronRoute(
  jobName: string,
  request: NextRequest,
  handler: () => Promise<{ response: Response; summary: CronRunSummary }>,
): Promise<Response> {
  const run = async (): Promise<Response> => {
    const startedAt = Date.now();
    const source = `cron.${jobName}`;
    let outcome: { response: Response; summary: CronRunSummary };
    try {
      outcome = await handler();
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      // best-effort; never let a logging fault (or a malformed ctx) mask the cron error
      try {
        // Prefer the S1 syncRunContext (richer — carries failures). REJECT a malformed
        // one (non-object, or an object without a string phase) and fall back to the ALS
        // mirror so a detached/route-tail throw still carries which-record context.
        // `attributionSource` names the chosen ctx's origin; present iff a real ctx exists.
        const rawSync: unknown = (err as { syncRunContext?: unknown } | null)?.syncRunContext;
        const syncCtx =
          rawSync !== null &&
          typeof rawSync === "object" &&
          typeof (rawSync as { phase?: unknown }).phase === "string"
            ? (rawSync as SyncRunContext)
            : undefined;
        const alsCtx = syncCtx ? undefined : cronCtxFromALS(getRequestContext());
        const ctx = syncCtx ?? alsCtx;
        const attributionSource = syncCtx ? "sync-body" : alsCtx ? "als-fallback" : undefined;
        const pbt = ctx?.processedBeforeThrow;
        await log.error(`cron ${jobName} run`, {
          source,
          code: CRON_RUN_SUMMARY, // LITERAL — scanner-safe
          jobName,
          outcome: "threw",
          durationMs,
          error: err,
          ...(ctx?.inFlightDriveFileId ? { driveFileId: ctx.inFlightDriveFileId } : {}),
          ...(attributionSource ||
          ctx?.phase ||
          ctx?.failures?.length ||
          ctx?.folderId ||
          Number.isFinite(pbt)
            ? {
                detail: {
                  ...(ctx?.phase ? { phase: ctx.phase } : {}),
                  ...(ctx?.folderId ? { folderId: ctx.folderId } : {}),
                  ...(ctx?.failures?.length ? { failures: ctx.failures } : {}),
                  ...(Number.isFinite(pbt) ? { processedBeforeThrow: pbt as number } : {}),
                  ...(attributionSource ? { source: attributionSource } : {}),
                },
              }
            : {}),
        });
      } catch {
        /* swallow logging fault */
      }
      throw err; // preserve HTTP/error semantics
    }
    const durationMs = Date.now() - startedAt;
    const fields = {
      source,
      code: CRON_RUN_SUMMARY,
      jobName,
      outcome: outcome.summary.outcome,
      durationMs,
      counts: outcome.summary.counts,
      detail: outcome.summary.detail,
    };
    try {
      // LITERAL dispatch (never computed member access) so stripLogEmissionCalls strips it.
      if (outcome.summary.outcome === "infra") await log.error(`cron ${jobName} run`, fields);
      else if (outcome.summary.outcome === "partial") await log.warn(`cron ${jobName} run`, fields);
      else await log.info(`cron ${jobName} run`, fields);
    } catch {
      /* observability must never break the cron */
    }
    return outcome.response;
  };

  // Single-holder ALS: reuse an existing context, else establish one.
  return getRequestContext()
    ? run()
    : runWithRequestContext({ requestId: deriveRequestId(request.headers) }, run);
}
