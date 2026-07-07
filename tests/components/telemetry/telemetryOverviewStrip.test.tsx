// @vitest-environment jsdom
// tests/components/telemetry/telemetryOverviewStrip.test.tsx
import { afterEach, describe, expect, test } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { TelemetryOverviewStrip } from "@/components/admin/telemetry/TelemetryOverviewStrip";
import type {
  AlertSummary,
  CronHealthRow,
  LoadCronHealthResult,
  LoadTelemetryStatsResult,
} from "@/lib/admin/telemetryTypes";

afterEach(cleanup);

const NOW = new Date("2020-01-02T05:30:00Z");

// 9 cron jobs, all fresh+ok → summarizeCronHealth → healthy 9 / total 9, 0 stale, 0 idle.
function job(name: string): CronHealthRow {
  return {
    jobName: name,
    label: name,
    description: "",
    cadence: "hourly",
    staleAfterMs: 3_600_000,
    lastRunAt: new Date(NOW.getTime() - 60_000).toISOString(),
    outcome: "ok",
    level: "info",
    counts: null,
  };
}
const okCron: LoadCronHealthResult = {
  kind: "ok",
  jobs: Array.from({ length: 9 }, (_, i) => job(`job.${i}`)),
};
const okStats: LoadTelemetryStatsResult = {
  kind: "ok",
  stats: { total: 42, errorCount: 3, warnCount: 5, infoCount: 34, buckets: [0, 2, 4, 8] },
};
const okSummary: AlertSummary = { kind: "ok", degraded: 0, notice: 0, total: 0 };

describe("TelemetryOverviewStrip", () => {
  test("degraded health + open-alerts count; cron total uses jobs.length (9)", () => {
    render(
      <TelemetryOverviewStrip
        alertSummary={{ kind: "degraded", total: 2, degraded: 1, notice: 1 }}
        cron={okCron}
        stats={okStats}
        now={NOW}
      />,
    );
    expect(
      within(screen.getByTestId("stat-system-health")).getByText("Degraded"),
    ).toBeInTheDocument();
    expect(within(screen.getByTestId("stat-open-alerts")).getByText("2")).toBeInTheDocument();
    // cron total is jobs.length (9), not a hardcoded literal
    expect(within(screen.getByTestId("stat-cron")).getByText(/\/\s*9/)).toBeInTheDocument();
    // events ok → the 42 total shows
    expect(within(screen.getByTestId("stat-events")).getByText("42")).toBeInTheDocument();
  });

  test("ok health → Healthy / All clear; open-alerts 0 → No open alerts", () => {
    render(
      <TelemetryOverviewStrip alertSummary={okSummary} cron={okCron} stats={okStats} now={NOW} />,
    );
    expect(
      within(screen.getByTestId("stat-system-health")).getByText("Healthy"),
    ).toBeInTheDocument();
    expect(within(screen.getByTestId("stat-open-alerts")).getByText("0")).toBeInTheDocument();
  });

  test("notice health → Notice + N to review", () => {
    render(
      <TelemetryOverviewStrip
        alertSummary={{ kind: "notice", total: 3, degraded: 0, notice: 3 }}
        cron={okCron}
        stats={okStats}
        now={NOW}
      />,
    );
    expect(
      within(screen.getByTestId("stat-system-health")).getByText("Notice"),
    ).toBeInTheDocument();
  });

  test("events infra_error → em-dash, sparkline still renders", () => {
    render(
      <TelemetryOverviewStrip
        alertSummary={okSummary}
        cron={okCron}
        stats={{ kind: "infra_error", message: "x" }}
        now={NOW}
      />,
    );
    expect(within(screen.getByTestId("stat-events")).getByText("—")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("stat-events")).getByTestId("event-sparkline"),
    ).toBeInTheDocument();
  });

  test("alertSummary infra_error → system-health Unavailable; open-alerts em-dash", () => {
    render(
      <TelemetryOverviewStrip
        alertSummary={{ kind: "infra_error" }}
        cron={okCron}
        stats={okStats}
        now={NOW}
      />,
    );
    expect(
      within(screen.getByTestId("stat-system-health")).getByText("Unavailable"),
    ).toBeInTheDocument();
    expect(within(screen.getByTestId("stat-open-alerts")).getByText("—")).toBeInTheDocument();
  });

  test("cron infra_error → em-dash + unavailable sub-line", () => {
    render(
      <TelemetryOverviewStrip
        alertSummary={okSummary}
        cron={{ kind: "infra_error", message: "x" }}
        stats={okStats}
        now={NOW}
      />,
    );
    expect(within(screen.getByTestId("stat-cron")).getByText("—")).toBeInTheDocument();
    expect(within(screen.getByTestId("stat-cron")).getByText(/unavailable/i)).toBeInTheDocument();
  });

  test("events total 0 → No events in 24h", () => {
    render(
      <TelemetryOverviewStrip
        alertSummary={okSummary}
        cron={okCron}
        stats={{
          kind: "ok",
          stats: { total: 0, errorCount: 0, warnCount: 0, infoCount: 0, buckets: [0, 0, 0] },
        }}
        now={NOW}
      />,
    );
    expect(
      within(screen.getByTestId("stat-events")).getByText(/No events in 24h/i),
    ).toBeInTheDocument();
  });
});
