import { Suspense } from "react";
import { requireAdminIdentity } from "@/lib/auth/requireAdmin";
import { nowDate } from "@/lib/time/now";
import { AdminPageHeader } from "@/components/admin/nav/AdminPageHeader";
import { parseAppEventFilters } from "@/lib/admin/observabilityTypes";
import { loadAppEvents } from "@/lib/admin/loadAppEvents";
import { loadCronHealth } from "@/lib/admin/loadCronHealth";
import { CronHealthHeader } from "@/components/admin/observability/CronHealthHeader";
import { EventFilters } from "@/components/admin/observability/EventFilters";
import { EventTimeline } from "@/components/admin/observability/EventTimeline";
import { AutoRefreshControl } from "@/components/admin/observability/AutoRefreshControl";

export const dynamic = "force-dynamic";

export default async function ObservabilityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminIdentity();
  const sp = await searchParams;
  const filters = parseAppEventFilters(sp);
  const now = await nowDate();
  const [health, events] = await Promise.all([loadCronHealth(), loadAppEvents(filters)]);
  const currentQuery = new URLSearchParams(
    Object.entries(sp).flatMap(([k, v]) =>
      v == null ? [] : ([[k, Array.isArray(v) ? v[0] : v]] as [string, string][]),
    ),
  ).toString();

  return (
    <div className="flex flex-col gap-section-gap">
      <AdminPageHeader
        title="Activity"
        sub="App event log & cron health"
        rightSlot={<AutoRefreshControl />}
      />
      {health.kind === "ok" ? (
        <CronHealthHeader jobs={health.jobs} now={now} />
      ) : (
        <div
          data-testid="cron-health-degraded"
          className="rounded-md border border-border bg-warning-bg p-tile-pad text-sm"
        >
          Couldn’t load cron health right now.
        </div>
      )}
      {/* EventFilters reads useSearchParams → Suspense boundary (Next 16), same as the dev harness. */}
      <Suspense>
        <EventFilters filters={filters} />
      </Suspense>
      <EventTimeline result={events} now={now} currentQuery={currentQuery} />
    </div>
  );
}
