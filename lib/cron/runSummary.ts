// Run-summary constants + the cron display registry. This module is deliberately
// kept free of message-catalog keywords so scripts/extract-internal-code-enums.ts
// never extracts CRON_RUN_SUMMARY (see tests/cross-cutting/cron-run-summary-scanner-safety).
export const CRON_RUN_SUMMARY = "CRON_RUN_SUMMARY";

export type CronRunOutcome = "ok" | "partial" | "infra";
export type CronRunSummary = {
  outcome: CronRunOutcome;
  counts?: Record<string, number>;
  detail?: Record<string, unknown>;
};

// Display registry for the health header. One row per LOGICAL job (notify splits in two).
// `jobName` is the source-suffix: app_events.source === `cron.${jobName}`.
// `staleAfterMs` flags a job that has missed >=2 consecutive runs (~3x cadence for
// <=hourly jobs; daily jobs use 2x = 48h so a single late run isn't flagged, two
// missed are) -> the "is this job actually firing?" signal (effectiveCronStatus).
// Every value below is >= 2x its cadence (the >=2-missed-runs floor); none is < 2x.
export type CronJobSpec = { jobName: string; label: string; cadence: string; staleAfterMs: number };

export const CRON_JOBS: readonly CronJobSpec[] = [
  { jobName: "sync", label: "Sync", cadence: "every 5 min", staleAfterMs: 20 * 60_000 },
  {
    jobName: "notify.realtime",
    label: "Notify · realtime",
    cadence: "every 5 min",
    staleAfterMs: 20 * 60_000,
  },
  {
    jobName: "notify.digest",
    label: "Notify · digest",
    cadence: "hourly",
    staleAfterMs: 3 * 3_600_000,
  },
  {
    jobName: "refresh-watch",
    label: "Refresh watch",
    cadence: "hourly",
    staleAfterMs: 3 * 3_600_000,
  },
  { jobName: "gc-watch", label: "GC watch", cadence: "hourly", staleAfterMs: 3 * 3_600_000 },
  {
    jobName: "asset-recovery",
    label: "Asset recovery",
    cadence: "every 15 min",
    staleAfterMs: 45 * 60_000,
  },
  { jobName: "diagram-gc", label: "Diagram GC", cadence: "hourly", staleAfterMs: 3 * 3_600_000 },
  {
    jobName: "report-reaper",
    label: "Report reaper",
    cadence: "daily",
    staleAfterMs: 48 * 3_600_000,
  },
  { jobName: "keepalive", label: "Keepalive", cadence: "daily", staleAfterMs: 48 * 3_600_000 },
];
