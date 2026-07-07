import { Suspense } from "react";
import { requireDeveloperIdentity } from "@/lib/auth/requireDeveloper";
import { nowDate } from "@/lib/time/now";
import { AdminPageHeader } from "@/components/admin/nav/AdminPageHeader";
import { parseAppEventFilters } from "@/lib/admin/telemetryTypes";
import { loadAppEvents } from "@/lib/admin/loadAppEvents";
import { loadCronHealth } from "@/lib/admin/loadCronHealth";
import { loadAlertSummary } from "@/lib/admin/loadAlertSummary";
import { loadTelemetryStats } from "@/lib/admin/loadTelemetryStats";
import { CronHealthList } from "@/components/admin/telemetry/CronHealthList";
import { TelemetryOverviewStrip } from "@/components/admin/telemetry/TelemetryOverviewStrip";
import { HealthAlertsPanel } from "@/components/admin/telemetry/HealthAlertsPanel";
import { EventFilters } from "@/components/admin/telemetry/EventFilters";
import { EventTimeline } from "@/components/admin/telemetry/EventTimeline";
import { AutoRefreshControl } from "@/components/admin/telemetry/AutoRefreshControl";

export const dynamic = "force-dynamic";

export default async function TelemetryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireDeveloperIdentity();
  const sp = await searchParams;
  const filters = parseAppEventFilters(sp);
  const now = await nowDate();
  const [health, events, alertSummary, stats] = await Promise.all([
    loadCronHealth(),
    loadAppEvents(filters),
    loadAlertSummary(),
    loadTelemetryStats(now),
  ]);
  const currentQuery = new URLSearchParams(
    Object.entries(sp).flatMap(([k, v]) =>
      v == null ? [] : ([[k, Array.isArray(v) ? v[0] : v]] as [string, string][]),
    ),
  ).toString();

  const matchCount = events.kind === "ok" ? events.events.length : 0;
  const activityLabel =
    events.kind === "ok" && events.hasMore
      ? "Showing recent events · newest first"
      : `${matchCount} events · newest first`;

  return (
    <div className="flex flex-col gap-section-gap">
      <AdminPageHeader
        title="Telemetry"
        sub="App event log & cron health"
        rightSlot={<AutoRefreshControl />}
      />

      {/* At-a-glance overview strip: system health, open alerts, cron, 24h events. */}
      <TelemetryOverviewStrip alertSummary={alertSummary} cron={health} stats={stats} now={now} />

      <div className="grid grid-cols-1 gap-section-gap xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
        {/* Hero: filter toolbar + activity sub-header + the divided event log. */}
        <section aria-labelledby="activity-heading" className="flex flex-col gap-tile-gap">
          {/* EventFilters reads useSearchParams → Suspense boundary (Next 16), same as the dev harness. */}
          <Suspense>
            <EventFilters filters={filters} />
          </Suspense>
          <div className="flex items-baseline justify-between">
            <h2 id="activity-heading" className="text-[15px] font-semibold text-text-strong">
              Activity
            </h2>
            <span className="text-xs tabular-nums text-text-subtle">{activityLabel}</span>
          </div>
          <EventTimeline result={events} now={now} currentQuery={currentQuery} />
        </section>

        {/* 340px sidebar: developer health-alert detail + compact cron list. */}
        <aside className="flex flex-col gap-section-gap">
          {/* Developer health-alert detail (alert-audience-split §6.6); nav/dashboard deep-links scroll to #health. */}
          <HealthAlertsPanel searchParams={sp} />
          {health.kind === "ok" ? (
            <CronHealthList jobs={health.jobs} now={now} />
          ) : (
            <div
              data-testid="cron-health-degraded"
              className="rounded-md border border-border bg-warning-bg p-tile-pad text-sm"
            >
              Couldn’t load cron health right now.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
