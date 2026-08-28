// @vitest-environment jsdom
// tests/components/telemetry/eventTimeline.test.tsx
import { afterEach, describe, expect, test, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, cleanup, within } from "@testing-library/react";
// The degraded branch gained a retry control that calls useRouter (BL-TELEMETRY-FALLBACK-RETRY);
// without this mock the render throws the Next router invariant instead of testing. Same shape
// as tests/components/telemetry/transitionAudit.test.tsx.
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}));

import { EventTimeline } from "@/components/admin/telemetry/EventTimeline";
import type { AppEventRow, LoadAppEventsResult } from "@/lib/admin/telemetryTypes";

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
  // Same class as the scheduled-job health fallback: it named a cause and offered no
  // recourse. Scoped inside its own degraded testid, so a control elsewhere in the tree
  // cannot satisfy it.
  test("infra_error → the degraded panel offers a retry that refreshes", () => {
    refresh.mockClear();
    render(<EventTimeline result={{ kind: "infra_error", message: "x" }} now={now} />);
    const retry = within(screen.getByTestId("event-timeline-degraded")).getByTestId(
      "event-timeline-retry",
    );
    fireEvent.click(retry);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
  test("renders ONE bordered event-log container, not gapped cards", () => {
    render(
      <EventTimeline
        result={{ kind: "ok", events: [row("a"), row("b")], hasMore: false, nextCursor: null }}
        now={now}
      />,
    );
    const log = screen.getByTestId("event-log");
    expect(log.tagName).toBe("UL");
    expect(log.className).toContain("border");
    // rows are <li> children of the single container
    expect(log.querySelectorAll("li")).toHaveLength(2);
  });
  test("non-first rows carry a border-t divider (flush, not gapped)", () => {
    render(
      <EventTimeline
        result={{ kind: "ok", events: [row("a"), row("b")], hasMore: false, nextCursor: null }}
        now={now}
      />,
    );
    const items = screen.getByTestId("event-log").querySelectorAll("li");
    expect(items[0]!.className).not.toContain("border-t");
    expect(items[1]!.className).toContain("border-t");
  });
});
