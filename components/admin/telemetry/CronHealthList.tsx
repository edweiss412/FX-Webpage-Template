// components/admin/telemetry/CronHealthList.tsx
//
// The sidebar cron-health surface: a single bordered card with one divided row
// per job (compact), replacing the old 3-col card grid (CronHealthHeader) on
// the telemetry page only. Status derives from the SAME effectiveCronStatus the
// overview strip's summarizeCronHealth uses. A warn (stale/failed) row tints
// its background so a problem reads at a glance. CronHealthHeader is retained
// for its other consumer (the dimension harness) — see spec §7.6.
import { StatusIndicator } from "@/components/admin/StatusIndicator";
import type { CronHealthRow } from "@/lib/admin/telemetryTypes";
import { effectiveCronStatus } from "./cronHealthStatus";

export function CronHealthList({ jobs, now }: { jobs: CronHealthRow[]; now: Date }) {
  return (
    <section aria-labelledby="cron-health-heading">
      <h2 id="cron-health-heading" className="mb-3 text-[15px] font-semibold text-text-strong">
        Cron health
      </h2>
      <div className="overflow-hidden rounded-md border border-border bg-surface shadow-tile">
        {jobs.map((job, i) => {
          const v = effectiveCronStatus(job, now);
          const warn = v.status === "warn";
          return (
            <div
              key={job.jobName}
              data-testid="cron-health-row"
              className={`flex items-start justify-between gap-3 px-4 py-3 ${i > 0 ? "border-t border-border" : ""} ${warn ? "bg-warning-bg" : ""}`}
            >
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold text-text-strong">
                  {job.label}
                </div>
                <div className="text-[11px] text-text-faint">{job.cadence}</div>
              </div>
              <div className="flex flex-col items-end gap-0.5 text-right">
                <StatusIndicator status={v.status} label={v.label} />
                {job.counts && (
                  <div className="text-[11px] tabular-nums text-text-subtle">
                    {Object.entries(job.counts)
                      .map(([k, n]) => `${k}: ${n}`)
                      .join(" · ")}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
