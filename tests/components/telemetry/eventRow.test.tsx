// @vitest-environment jsdom
// tests/components/telemetry/eventRow.test.tsx
import { afterEach, describe, expect, test } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { EventRow } from "@/components/admin/telemetry/EventRow";
import type { AppEventRow } from "@/lib/admin/telemetryTypes";

afterEach(cleanup);

const now = new Date("2026-06-29T12:00:00.000Z");
const longMsg = "BEGIN " + "x".repeat(400) + " END";
const base: AppEventRow = {
  id: "e1",
  occurredAt: "2026-06-29T11:59:00.000Z",
  level: "error",
  source: "auth.validateGoogleSession",
  message: longMsg,
  code: "ADMIN_EMAILS_INFRA",
  requestId: "req-9",
  showId: null,
  driveFileId: "df-1",
  actorHash: "ah-1",
  context: { foo: "bar" },
  showTitle: null,
  showSlug: null,
};

describe("EventRow", () => {
  test("collapsed: ContextDetail not mounted; expand mounts it with FULL message + drive id", () => {
    // Non-tautological: the collapsed toggle button holds the (CSS-truncated) full text too,
    // so assert the ContextDetail element MOUNTS on expand, not mere text presence.
    render(<EventRow event={base} now={now} />);
    expect(screen.queryByTestId("event-full-message")).toBeNull();
    fireEvent.click(screen.getByTestId("event-row-toggle-e1"));
    expect(screen.getByTestId("event-full-message")).toHaveTextContent(longMsg);
    expect(screen.getByText(/df-1/)).toBeInTheDocument();
  });
  test("show/request links are NOT nested inside the toggle button (valid interactive nesting)", () => {
    render(
      <EventRow
        event={{
          ...base,
          showId: "00000000-0000-0000-0000-0000000000ab",
          showSlug: "rpas",
          showTitle: "RPAS",
        }}
        now={now}
      />,
    );
    const toggle = screen.getByTestId("event-row-toggle-e1");
    expect(toggle.querySelector("a")).toBeNull(); // the show link is a SIBLING of the button, not nested
  });
  test("show link targets the SLUG route, never the UUID (route is /admin/show/[slug])", () => {
    render(
      <EventRow
        event={{
          ...base,
          showId: "00000000-0000-0000-0000-0000000000ab",
          showSlug: "rpas-central",
          showTitle: "RPAS",
        }}
        now={now}
      />,
    );
    const link = screen.getByRole("link", { name: "RPAS" });
    expect(link.getAttribute("href")).toBe("/admin/show/rpas-central");
    expect(link.getAttribute("href")).not.toContain("0000000000ab");
  });
  test("request chip links to ?requestId=<id>&since=all", () => {
    render(<EventRow event={base} now={now} />);
    const chip = screen.getByTestId("event-row-request-e1");
    expect(chip.getAttribute("href")).toBe("/admin/dev/telemetry?requestId=req-9&since=all");
  });
  test("an error row tints its background bg-danger-bg", () => {
    render(<EventRow event={base} now={now} />); // base.level === "error"
    expect(screen.getByTestId("event-row-e1").className).toContain("bg-danger-bg");
  });
  test("a non-error row does NOT tint danger", () => {
    render(<EventRow event={{ ...base, level: "info" }} now={now} />);
    expect(screen.getByTestId("event-row-e1").className).not.toContain("bg-danger-bg");
  });
  test("isFirst omits the top divider; non-first carries border-t", () => {
    const { rerender } = render(<EventRow event={{ ...base, level: "info" }} now={now} isFirst />);
    expect(screen.getByTestId("event-row-e1").className).not.toContain("border-t");
    rerender(<EventRow event={{ ...base, level: "info" }} now={now} />);
    expect(screen.getByTestId("event-row-e1").className).toContain("border-t");
  });
  test("CRON_RUN_SUMMARY row: card is the collapsed body AND it expands to ContextDetail (AC4)", () => {
    const ev = {
      ...base,
      code: "CRON_RUN_SUMMARY",
      source: "cron.sync",
      message: "cron sync run",
      context: { jobName: "sync", outcome: "ok", counts: { processed: 1 } },
    };
    render(<EventRow event={ev} now={now} />);
    expect(screen.getByText(/processed/i)).toBeInTheDocument(); // rich card = collapsed body
    expect(screen.queryByTestId("event-full-message")).toBeNull();
    fireEvent.click(screen.getByTestId("event-row-toggle-e1"));
    expect(screen.getByTestId("event-full-message")).toHaveTextContent("cron sync run"); // expands to raw detail
  });
});

// Accent-contrast token pass (spec 2026-07-16 §4.3, TEL-1): the requestId chip
// is an id affordance, not a matters-now signal — neutral text-text-subtle
// (6.09:1 light / 6.94:1 dark on surface-sunken), never accent.
describe("EventRow requestId chip is neutral (TEL-1)", () => {
  test("chip carries text-text-subtle and not text-accent-on-bg", () => {
    render(<EventRow event={base} now={now} isFirst />);
    const chip = screen.getByTestId("event-row-request-e1");
    const tokens = new Set((chip.getAttribute("class") ?? "").split(/\s+/));
    expect(tokens.has("text-text-subtle")).toBe(true);
    expect(tokens.has("text-accent-on-bg")).toBe(false);
  });
});
