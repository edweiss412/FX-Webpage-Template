// components/admin/observability/CronHealthHeader.tsx
import { StatusIndicator } from "@/components/admin/StatusIndicator";
import type { CronHealthRow } from "@/lib/admin/observabilityTypes";
import { effectiveCronStatus } from "./cronHealthStatus";

export function CronHealthHeader({ jobs, now }: { jobs: CronHealthRow[]; now: Date }) {
  return (
    <section aria-labelledby="cron-health-heading" className="mb-section-gap">
      <h2 id="cron-health-heading" className="mb-3 text-sm font-semibold text-text-subtle">
        Cron health
      </h2>
      <div
        data-testid="cron-health-grid"
        className="grid auto-rows-fr grid-cols-2 gap-tile-gap sm:grid-cols-3 lg:grid-cols-3"
      >
        {jobs.map((job) => {
          const v = effectiveCronStatus(job, now);
          return (
            <div
              key={job.jobName}
              data-testid="cron-health-card"
              className="flex h-full flex-col gap-1 rounded-md border border-border bg-surface p-tile-pad"
            >
              <div className="text-sm font-medium text-text">{job.label}</div>
              <StatusIndicator status={v.status} label={v.label} />
              {job.counts && (
                <div className="mt-1 text-xs text-text-subtle">
                  {Object.entries(job.counts)
                    .map(([k, n]) => `${k}: ${n}`)
                    .join(" · ")}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
