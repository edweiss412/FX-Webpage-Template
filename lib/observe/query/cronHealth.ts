// lib/observe/query/cronHealth.ts
// Fresh NON-LOGGING copy of lib/admin/loadCronHealth.ts — identical read/extraction
// logic, with the log.error calls (and the lib-log import) removed.
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { CRON_RUN_SUMMARY, CRON_JOBS, type CronJobSpec } from "@/lib/cron/runSummary";
import type {
  AppEventLevel,
  CronHealthRow,
  CronRunOutcomeRead,
} from "@/lib/admin/observabilityTypes";

export type QueryCronHealthResult =
  | { kind: "ok"; jobs: CronHealthRow[] }
  | { kind: "infra_error"; message: string };

const OUTCOMES: CronRunOutcomeRead[] = ["ok", "partial", "infra", "threw"];

function toCronHealthRow(job: CronJobSpec, result: { data: unknown }): CronHealthRow {
  const r = (result.data as Array<Record<string, unknown>> | null)?.[0];
  if (!r) return { ...job, lastRunAt: null, outcome: null, level: null, counts: null };
  const ctx = (r.context ?? {}) as Record<string, unknown>;
  const rawOutcome = ctx.outcome;
  const outcome =
    typeof rawOutcome === "string" && (OUTCOMES as string[]).includes(rawOutcome)
      ? (rawOutcome as CronRunOutcomeRead)
      : null;
  const counts =
    ctx.counts && typeof ctx.counts === "object" && !Array.isArray(ctx.counts)
      ? (ctx.counts as Record<string, number>)
      : null;
  return {
    ...job,
    lastRunAt: r.occurred_at as string,
    outcome,
    level: (r.level as AppEventLevel | null) ?? null,
    counts,
  };
}

export async function getCronHealth(): Promise<QueryCronHealthResult> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const results = await Promise.all(
      CRON_JOBS.map((job) =>
        supabase
          .from("app_events")
          // count:"exact" mirrors the other three read-core reads for uniformity; the real
          // row bound is the inline .limit(1) below (this read was already bounded).
          .select("occurred_at, level, context", { count: "exact" })
          .eq("code", CRON_RUN_SUMMARY)
          .eq("source", `cron.${job.jobName}`)
          .order("occurred_at", { ascending: false })
          .limit(1),
      ),
    );
    for (const { error } of results) {
      if (error) return { kind: "infra_error", message: "app_events read returned error" };
    }
    const jobs = CRON_JOBS.map((job, i) => toCronHealthRow(job, results[i]!));
    return { kind: "ok", jobs };
  } catch {
    return { kind: "infra_error", message: "app_events read threw" };
  }
}
