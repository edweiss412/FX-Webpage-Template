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
// `label` is a short, plain-language name; `description` is a one-line, non-technical
// explanation shown under the label on the admin Activity page's Cron health cards.
// Keep descriptions free of CONSTANT_CASE / Capitalized_Underscore tokens so the
// internal-code-enum scanner (scripts/extract-internal-code-enums.ts) never picks them up.
export type CronJobSpec = {
  jobName: string;
  label: string;
  description: string;
  cadence: string;
  staleAfterMs: number;
};

export const CRON_JOBS: readonly CronJobSpec[] = [
  {
    jobName: "sync",
    label: "Sheet sync",
    description: "Checks each show's Google Sheet for changes and updates the crew pages.",
    cadence: "every 5 min",
    staleAfterMs: 20 * 60_000,
  },
  {
    jobName: "notify.realtime",
    label: "Alerts · instant",
    description: "Sends admin alerts the moment something needs your attention.",
    cadence: "every 5 min",
    staleAfterMs: 20 * 60_000,
  },
  {
    jobName: "notify.digest",
    label: "Alerts · hourly digest",
    description: "Emails the hourly summary of admin alerts.",
    cadence: "hourly",
    staleAfterMs: 3 * 3_600_000,
  },
  {
    jobName: "refresh-watch",
    label: "Drive watch renewal",
    description: "Renews the Google Drive change subscriptions before they expire.",
    cadence: "hourly",
    staleAfterMs: 3 * 3_600_000,
  },
  {
    jobName: "gc-watch",
    label: "Drive watch cleanup",
    description: "Removes expired or duplicate Google Drive change subscriptions.",
    cadence: "hourly",
    staleAfterMs: 3 * 3_600_000,
  },
  {
    jobName: "asset-recovery",
    label: "Upload retry",
    description: "Retries crew photos and files that failed to upload the first time.",
    cadence: "every 15 min",
    staleAfterMs: 45 * 60_000,
  },
  {
    jobName: "diagram-gc",
    label: "Upload cleanup",
    description: "Deletes leftover files from uploads that never finished.",
    cadence: "hourly",
    staleAfterMs: 3 * 3_600_000,
  },
  {
    jobName: "report-reaper",
    label: "Stuck report cleanup",
    description: "Clears bug reports whose processing got stuck.",
    cadence: "daily",
    staleAfterMs: 48 * 3_600_000,
  },
  {
    jobName: "keepalive",
    label: "Database keepalive",
    description: "Pings the database so the host doesn't pause it for inactivity.",
    cadence: "daily",
    staleAfterMs: 48 * 3_600_000,
  },
];
