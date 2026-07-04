// lib/cron/annotateSyncStateChange.ts
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { CRON_RUN_SUMMARY, type CronRunSummary } from "@/lib/cron/runSummary";

export async function annotateSyncStateChange(summary: CronRunSummary): Promise<CronRunSummary> {
  if (summary.outcome !== "partial") return summary;
  const currentFp = (summary.detail as { failuresFingerprint?: string } | undefined)
    ?.failuresFingerprint;
  // Canonical fail-open: preserve summary+detail (incl fingerprint), set stateChanged:true, skip compare.
  const failOpen = (): CronRunSummary => ({
    ...summary,
    detail: { ...(summary.detail ?? {}), stateChanged: true },
  });
  try {
    const supabase = createSupabaseServiceRoleClient();
    // invariant 9: destructure {data,error}; returned-error → fail-open; thrown → catch → fail-open.
    const { data, error } = await supabase
      .from("app_events")
      .select("context")
      .eq("code", CRON_RUN_SUMMARY)
      .eq("source", "cron.sync")
      .order("occurred_at", { ascending: false })
      .limit(1);
    if (error) return failOpen();
    const priorDetail = (
      data?.[0]?.context as
        | { detail?: { failuresFingerprint?: string; unchangedSinceRuns?: number } }
        | undefined
    )?.detail;
    const priorFp = priorDetail?.failuresFingerprint;
    const stateChanged = priorFp === undefined || priorFp !== currentFp;
    return {
      ...summary,
      detail: {
        ...(summary.detail ?? {}),
        stateChanged,
        ...(stateChanged ? {} : { unchangedSinceRuns: (priorDetail?.unchangedSinceRuns ?? 0) + 1 }),
      },
    };
  } catch {
    return failOpen();
  }
}
