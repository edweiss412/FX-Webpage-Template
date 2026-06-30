// @vitest-environment jsdom
// tests/components/observability/cronHealthHeader.test.tsx
import { afterEach, describe, expect, test } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CronHealthHeader } from "@/components/admin/observability/CronHealthHeader";
import { CRON_JOBS } from "@/lib/cron/runSummary";
import type { CronHealthRow } from "@/lib/admin/observabilityTypes";

afterEach(cleanup);

const now = new Date("2026-06-29T12:00:00.000Z");
const rows: CronHealthRow[] = CRON_JOBS.map((j) => ({ ...j, lastRunAt: null, outcome: null, level: null, counts: null }));

describe("CronHealthHeader", () => {
  test("renders one card per job with grid auto-rows-fr and 'No run seen' when no data", () => {
    render(<CronHealthHeader jobs={rows} now={now} />);
    expect(screen.getAllByTestId("cron-health-card")).toHaveLength(CRON_JOBS.length);
    expect(screen.getByTestId("cron-health-grid").className).toContain("auto-rows-fr");
    expect(screen.getAllByText("No run seen").length).toBeGreaterThan(0);
  });
  test("stale job shows 'Stale' label", () => {
    const stale = rows.map((r) => r.jobName === "sync"
      ? { ...r, lastRunAt: new Date(now.getTime() - r.staleAfterMs - 60_000).toISOString(), outcome: "ok" as const, level: "info" as const }
      : r);
    render(<CronHealthHeader jobs={stale} now={now} />);
    expect(screen.getByText(/Stale/)).toBeInTheDocument();
  });
});
