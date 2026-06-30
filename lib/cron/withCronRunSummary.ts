// lib/cron/withCronRunSummary.ts
import type { NextRequest } from "next/server";
import { log } from "@/lib/log";
import {
  deriveRequestId,
  getRequestContext,
  runWithRequestContext,
} from "@/lib/log/requestContext";
import { CRON_RUN_SUMMARY, type CronRunSummary } from "@/lib/cron/runSummary";

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
      // best-effort; never let a logging fault mask the cron error
      try {
        await log.error(`cron ${jobName} run`, {
          source,
          code: CRON_RUN_SUMMARY,
          jobName,
          outcome: "threw",
          durationMs,
          error: err,
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
