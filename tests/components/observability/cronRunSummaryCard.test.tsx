// @vitest-environment jsdom
// tests/components/observability/cronRunSummaryCard.test.tsx
import { afterEach, describe, expect, test } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CronRunSummaryCard } from "@/components/admin/observability/CronRunSummaryCard";
import type { AppEventRow } from "@/lib/admin/observabilityTypes";

afterEach(cleanup);

const ev = (context: Record<string, unknown>, source = "cron.sync"): AppEventRow => ({
  id: "1", occurredAt: "2026-06-29T00:00:00.000Z", level: "info", source, message: "cron sync run",
  code: "CRON_RUN_SUMMARY", requestId: null, showId: null, driveFileId: null, actorHash: null, context, showTitle: null, showSlug: null,
});

describe("CronRunSummaryCard guards malformed context", () => {
  test("renders counts grid for a well-formed row", () => {
    render(<CronRunSummaryCard event={ev({ jobName: "sync", outcome: "ok", durationMs: 1200, counts: { processed: 3, applied: 2 } })} />);
    expect(screen.getByText(/processed/i)).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });
  test("non-object counts → no counts grid, no crash", () => {
    const { container } = render(<CronRunSummaryCard event={ev({ jobName: "sync", outcome: "ok", counts: "oops" })} />);
    expect(container).toBeTruthy();
    expect(screen.queryByTestId("cron-summary-counts")).toBeNull();
  });
  test("non-numeric durationMs → duration omitted", () => {
    render(<CronRunSummaryCard event={ev({ jobName: "sync", outcome: "ok", durationMs: "later" })} />);
    expect(screen.queryByTestId("cron-summary-duration")).toBeNull();
  });
  test("unknown source (not cron.*) → shows source verbatim", () => {
    render(<CronRunSummaryCard event={ev({ outcome: "ok" }, "weird.source")} />);
    expect(screen.getByText(/weird\.source/)).toBeInTheDocument();
  });
  test("outcome not in {ok,partial,infra,threw} → renders 'unknown', NOT the raw value (§6.2)", () => {
    render(<CronRunSummaryCard event={ev({ jobName: "sync", outcome: "weird" })} />);
    expect(screen.getByText("unknown")).toBeInTheDocument();
    expect(screen.queryByText("weird")).toBeNull();
  });
});
