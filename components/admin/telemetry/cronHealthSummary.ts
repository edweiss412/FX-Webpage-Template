// components/admin/telemetry/cronHealthSummary.ts
import type { CronHealthRow } from "@/lib/admin/telemetryTypes";
import { effectiveCronStatus } from "./cronHealthStatus";

export type CronHealthSummary = {
  healthy: number;
  stale: number;
  idle: number;
  review: number;
  total: number;
};

// Tally cron jobs into the overview-strip buckets via the SAME status derivation
// the sidebar list uses (effectiveCronStatus) — one source of truth. healthy =
// live|positive, stale = warn, idle = idle, review = review; total = jobs.length.
export function summarizeCronHealth(jobs: CronHealthRow[], now: Date): CronHealthSummary {
  const summary: CronHealthSummary = {
    healthy: 0,
    stale: 0,
    idle: 0,
    review: 0,
    total: jobs.length,
  };
  for (const job of jobs) {
    const { status } = effectiveCronStatus(job, now);
    switch (status) {
      case "live":
      case "positive":
        summary.healthy++;
        break;
      case "warn":
        summary.stale++;
        break;
      case "idle":
        summary.idle++;
        break;
      case "review":
        summary.review++;
        break;
    }
  }
  return summary;
}
