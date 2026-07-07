// @vitest-environment jsdom
// tests/components/telemetry/cronHealthList.test.tsx
import { afterEach, describe, expect, test } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CronHealthList } from "@/components/admin/telemetry/CronHealthList";
import type { CronHealthRow } from "@/lib/admin/telemetryTypes";

afterEach(cleanup);

const NOW = new Date("2020-01-02T05:30:00Z");

function row(over: Partial<CronHealthRow>): CronHealthRow {
  return {
    jobName: "job",
    label: "Job",
    description: "",
    cadence: "hourly",
    staleAfterMs: 3_600_000,
    lastRunAt: new Date(NOW.getTime() - 60_000).toISOString(),
    outcome: "ok",
    level: "info",
    counts: null,
    ...over,
  };
}

describe("CronHealthList", () => {
  test("one row per job, with the heading", () => {
    render(
      <CronHealthList
        jobs={[row({ jobName: "a", label: "A" }), row({ jobName: "b", label: "B" })]}
        now={NOW}
      />,
    );
    expect(screen.getByText("Cron health")).toBeInTheDocument();
    expect(screen.getAllByTestId("cron-health-row")).toHaveLength(2);
  });

  test("a stale (warn) row tints its background bg-warning-bg", () => {
    render(
      <CronHealthList
        jobs={[
          row({
            jobName: "stale",
            label: "Stale",
            lastRunAt: new Date(NOW.getTime() - 5_000_000).toISOString(), // > staleAfterMs
          }),
        ]}
        now={NOW}
      />,
    );
    const r = screen.getByTestId("cron-health-row");
    expect(r.className).toContain("bg-warning-bg");
  });

  test("an idle (never-run) job shows 'No run seen'", () => {
    render(<CronHealthList jobs={[row({ label: "Never", lastRunAt: null })]} now={NOW} />);
    expect(screen.getByText(/No run seen/)).toBeInTheDocument();
  });

  test("counts line renders when present", () => {
    render(<CronHealthList jobs={[row({ counts: { processed: 12, skipped: 3 } })]} now={NOW} />);
    expect(screen.getByText(/processed: 12/)).toBeInTheDocument();
    expect(screen.getByText(/skipped: 3/)).toBeInTheDocument();
  });
});
