import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { log } from "@/lib/log";
import { CRON_RUN_SUMMARY, CRON_JOBS, type CronJobSpec } from "@/lib/cron/runSummary";
import type {
  AppEventLevel,
  CronHealthRow,
  CronRunOutcomeRead,
  LoadCronHealthResult,
} from "@/lib/admin/observabilityTypes";

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

export async function loadCronHealth(): Promise<LoadCronHealthResult> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const results = await Promise.all(
      CRON_JOBS.map((job) =>
        supabase
          .from("app_events")
          .select("occurred_at, level, context")
          .eq("code", CRON_RUN_SUMMARY)
          .eq("source", `cron.${job.jobName}`)
          .order("occurred_at", { ascending: false })
          .limit(1),
      ),
    );
    // Supabase call-boundary (invariant 9): a RETURNED {error} on any of the 9 reads → distinct
    // infra_error("…returned error"); a genuine THROW funnels to the catch → "…threw".
    for (const { error } of results) {
      if (error) {
        void log.error("app_events read returned error", { source: "admin.loadCronHealth", error });
        return { kind: "infra_error", message: "app_events read returned error" };
      }
    }
    const jobs = CRON_JOBS.map((job, i) => toCronHealthRow(job, results[i]!));
    return { kind: "ok", jobs };
  } catch (err) {
    void log.error("app_events read threw", { source: "admin.loadCronHealth", error: err });
    return { kind: "infra_error", message: "app_events read threw" };
  }
}
