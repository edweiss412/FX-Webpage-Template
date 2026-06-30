// @vitest-environment jsdom
// tests/components/observability/eventTimeline.test.tsx
import { afterEach, describe, expect, test } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { EventTimeline } from "@/components/admin/observability/EventTimeline";
import type { AppEventRow, LoadAppEventsResult } from "@/lib/admin/observabilityTypes";

afterEach(cleanup);

const now = new Date("2026-06-29T12:00:00.000Z");
const row = (id: string): AppEventRow => ({
  id,
  occurredAt: "2026-06-29T11:00:00.000Z",
  level: "info",
  source: "s",
  message: "m",
  code: null,
  requestId: null,
  showId: null,
  driveFileId: null,
  actorHash: null,
  context: {},
  showTitle: null,
  showSlug: null,
});

describe("EventTimeline", () => {
  test("empty → EmptyState", () => {
    render(
      <EventTimeline
        result={{ kind: "ok", events: [], hasMore: false, nextCursor: null }}
        now={now}
      />,
    );
    expect(screen.getByText(/no/i)).toBeInTheDocument();
  });
  test("hasMore → cap disclosure + Load older link with cursor", () => {
    const result: LoadAppEventsResult = {
      kind: "ok",
      events: [row("a")],
      hasMore: true,
      nextCursor: { occurredAt: "2026-06-29T11:00:00.000Z", id: "a" },
    };
    render(<EventTimeline result={result} now={now} />);
    const link = screen.getByTestId("event-timeline-load-older");
    expect(link.getAttribute("href")).toContain("cursorAt=2026-06-29T11%3A00%3A00.000Z");
    expect(link.getAttribute("href")).toContain("cursorId=a");
  });
  test("infra_error → degraded panel", () => {
    render(<EventTimeline result={{ kind: "infra_error", message: "x" }} now={now} />);
    expect(screen.getByTestId("event-timeline-degraded")).toBeInTheDocument();
  });
});
