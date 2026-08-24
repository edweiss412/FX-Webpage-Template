// components/admin/telemetry/TelemetryOverviewStrip.tsx
//
// The at-a-glance overview strip: four stat cards summarizing system health,
// open alerts, cron health, and 24h event volume. Server component (plain
// function). All four share ONE card shell for a consistent affordance but
// compose their interiors differently (dot+word, big number, ratio+breakdown,
// number+sparkline) — same container, distinct content, so it reads as a
// cohesive strip without being an identical-card grid.

import type {
  AlertSummary,
  LoadCronHealthResult,
  LoadTelemetryStatsResult,
} from "@/lib/admin/telemetryTypes";
import { EventVolumeSparkline } from "./EventVolumeSparkline";
import { summarizeCronHealth } from "./cronHealthSummary";
import { cn } from "@/lib/ui/cn";

type StatDotStatus = "positive" | "review" | "degraded" | "idle";

const DOT_CLASS: Record<StatDotStatus, string> = {
  positive: cn("bg-status-positive"),
  review: cn("bg-status-review"),
  degraded: cn("bg-status-degraded"),
  idle: cn("bg-status-idle"),
};

function StatDot({ status }: { status: StatDotStatus }) {
  return (
    <span
      aria-hidden
      className={`inline-block size-2 shrink-0 rounded-full ${DOT_CLASS[status]}`}
    />
  );
}

function StatCard({
  label,
  testId,
  renderFault,
  children,
}: {
  label: string;
  testId: string;
  // Layer 1's marker, threaded as a prop because a DOM attribute cannot cross a
  // component boundary. Passed only by the fault branches, so an unmarked one
  // still fails the meta-test rather than inheriting a marker every card has.
  renderFault?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div
      data-testid={testId}
      data-render-fault={renderFault}
      className="flex h-full flex-col gap-2 rounded-md border border-border bg-surface p-4 shadow-tile"
    >
      <span className="text-[10px] font-semibold uppercase tracking-eyebrow text-text-subtle">
        {label}
      </span>
      {children}
    </div>
  );
}

function ValueWord({ dot, word }: { dot: StatDotStatus; word: string }) {
  return (
    <span className="flex items-center gap-2 text-lg font-semibold text-text">
      <StatDot status={dot} />
      {word}
    </span>
  );
}

function SubLine({ children }: { children: React.ReactNode }) {
  return <span className="text-xs text-text-subtle">{children}</span>;
}

function BigNumber({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-2xl font-semibold tabular-nums tracking-tight text-text">{children}</span>
  );
}

// A "no data" placeholder — a lone em dash reads oddly to screen readers, so the
// value carries an explicit label while the glyph stays purely visual.
function Unavailable() {
  return (
    <span className="text-2xl font-semibold tracking-tight text-text" aria-label="Unavailable">
      <span aria-hidden>—</span>
    </span>
  );
}

// ── System health ────────────────────────────────────────────────────────────
function SystemHealthCard({ summary }: { summary: AlertSummary }) {
  // Flag-shaped: the branch assigns and a later return renders, so the marking
  // scanner cannot reach it (spec section 4.2, shape 4 -- tracing a flag to its
  // render is dataflow this arc does not carry). Marked by hand because the
  // flag is right here and the strip would otherwise encode "Unavailable"
  // silently. The residue registry records that the scanner cannot enforce it.
  let unavailable = false;
  let dot: StatDotStatus;
  let word: string;
  let sub: string;
  switch (summary.kind) {
    case "ok":
      dot = "positive";
      word = "Healthy";
      sub = "All clear";
      break;
    case "notice":
      dot = "review";
      word = "Notice";
      sub = `${summary.notice} to review`;
      break;
    case "degraded":
      dot = "degraded";
      word = "Degraded";
      sub = `${summary.degraded} issue${summary.degraded === 1 ? "" : "s"} need action`;
      break;
    default:
      dot = "idle";
      word = "Unavailable";
      sub = "Health check failed";
      unavailable = true;
      break;
  }
  return (
    <StatCard
      label="System health"
      testId="stat-system-health"
      renderFault={unavailable ? "telemetry-system-health" : undefined}
    >
      <ValueWord dot={dot} word={word} />
      <SubLine>{sub}</SubLine>
    </StatCard>
  );
}

// ── Open alerts ──────────────────────────────────────────────────────────────
function OpenAlertsCard({ summary }: { summary: AlertSummary }) {
  if (summary.kind === "infra_error") {
    return (
      <StatCard label="Open alerts" testId="stat-open-alerts" renderFault="telemetry-open-alerts">
        <Unavailable />
        <SubLine>Unavailable</SubLine>
      </StatCard>
    );
  }
  if (summary.total === 0) {
    return (
      <StatCard label="Open alerts" testId="stat-open-alerts">
        <BigNumber>0</BigNumber>
        <SubLine>No open alerts</SubLine>
      </StatCard>
    );
  }
  const segments: React.ReactNode[] = [];
  if (summary.degraded > 0) {
    segments.push(
      <span key="deg" className="flex items-center gap-1 tabular-nums">
        <StatDot status="degraded" />
        {summary.degraded} degraded
      </span>,
    );
  }
  if (summary.notice > 0) {
    segments.push(
      <span key="not" className="flex items-center gap-1 tabular-nums">
        <StatDot status="review" />
        {summary.notice} notice
      </span>,
    );
  }
  return (
    <StatCard label="Open alerts" testId="stat-open-alerts">
      <BigNumber>{summary.total}</BigNumber>
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-subtle">
        {segments}
      </span>
    </StatCard>
  );
}

// ── Cron jobs ────────────────────────────────────────────────────────────────
function CronCard({ cron, now }: { cron: LoadCronHealthResult; now: Date }) {
  if (cron.kind === "infra_error") {
    return (
      <StatCard label="Scheduled jobs" testId="stat-cron" renderFault="telemetry-cron-health">
        <Unavailable />
        <SubLine>Health unavailable</SubLine>
      </StatCard>
    );
  }
  const s = summarizeCronHealth(cron.jobs, now);
  const parts: string[] = [];
  if (s.stale > 0) parts.push(`${s.stale} stale`);
  if (s.idle > 0) parts.push(`${s.idle} idle`);
  if (s.review > 0) parts.push(`${s.review} issue${s.review === 1 ? "" : "s"}`);
  return (
    <StatCard label="Scheduled jobs" testId="stat-cron">
      <span className="text-2xl font-semibold tabular-nums tracking-tight text-text">
        {s.healthy}
        <span className="text-text-subtle"> / {s.total}</span>
      </span>
      <SubLine>{parts.length > 0 ? parts.join(" · ") : "All healthy"}</SubLine>
    </StatCard>
  );
}

// ── Events · 24h ─────────────────────────────────────────────────────────────
function EventsCard({ stats }: { stats: LoadTelemetryStatsResult }) {
  const buckets = stats.kind === "ok" ? stats.stats.buckets : [];
  const isInfra = stats.kind === "infra_error";
  let value: React.ReactNode;
  let sub: string;
  if (isInfra) {
    value = <Unavailable />;
    sub = "Unavailable";
  } else if (stats.stats.total === 0) {
    value = <BigNumber>0</BigNumber>;
    sub = "No events in 24h";
  } else {
    value = <BigNumber>{stats.stats.total}</BigNumber>;
    const segs: string[] = [];
    if (stats.stats.errorCount > 0)
      segs.push(`${stats.stats.errorCount} error${stats.stats.errorCount === 1 ? "" : "s"}`);
    if (stats.stats.warnCount > 0)
      segs.push(`${stats.stats.warnCount} warn${stats.stats.warnCount === 1 ? "" : "s"}`);
    sub = segs.length > 0 ? segs.join(" · ") : "No errors or warnings";
  }
  return (
    <StatCard
      label="Events · 24h"
      testId="stat-events"
      renderFault={isInfra ? "telemetry-events" : undefined}
    >
      <div className="flex items-end justify-between gap-2">
        {value}
        <EventVolumeSparkline buckets={buckets} />
      </div>
      <SubLine>{sub}</SubLine>
    </StatCard>
  );
}

export function TelemetryOverviewStrip({
  alertSummary,
  cron,
  stats,
  now,
}: {
  alertSummary: AlertSummary;
  cron: LoadCronHealthResult;
  stats: LoadTelemetryStatsResult;
  now: Date;
}) {
  return (
    <div
      data-testid="telemetry-overview-strip"
      className="grid grid-cols-1 gap-tile-gap sm:grid-cols-2 xl:grid-cols-4"
    >
      <SystemHealthCard summary={alertSummary} />
      <OpenAlertsCard summary={alertSummary} />
      <CronCard cron={cron} now={now} />
      <EventsCard stats={stats} />
    </div>
  );
}
