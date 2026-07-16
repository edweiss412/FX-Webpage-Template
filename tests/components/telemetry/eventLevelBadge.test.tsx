// @vitest-environment jsdom
// tests/components/telemetry/eventLevelBadge.test.tsx
import { afterEach, describe, expect, test } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { EventLevelBadge } from "@/components/admin/telemetry/EventLevelBadge";

afterEach(cleanup);

describe("EventLevelBadge", () => {
  test.each([
    ["info", "Info"],
    ["warn", "Warn"],
    ["error", "Error"],
  ] as const)("%s renders a text label (never color-only)", (level, label) => {
    render(<EventLevelBadge level={level} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

// Accent-contrast token pass (spec 2026-07-16 §4.4, TEL-2): error must
// ESCALATE above warn by FILL, not weight alone — solid degraded pair
// (6.54:1 light / 4.70:1 dark). The tinted bg-danger-bg + text-status-degraded
// pairing was REJECTED (4.10:1 dark, under the 4.5:1 text floor).
describe("EventLevelBadge error escalation (TEL-2)", () => {
  function tokens(el: HTMLElement): Set<string> {
    return new Set((el.getAttribute("class") ?? "").split(/\s+/));
  }

  test("error carries the solid degraded fill, not the warn tint or the rejected pairing", () => {
    render(<EventLevelBadge level="error" />);
    const t = tokens(screen.getByTestId("event-level-error"));
    expect(t.has("bg-status-degraded")).toBe(true);
    expect(t.has("text-status-degraded-text")).toBe(true);
    expect(t.has("font-semibold")).toBe(true);
    expect(t.has("bg-warning-bg")).toBe(false);
    expect(t.has("bg-danger-bg")).toBe(false);
  });

  test("warn and info fills are unchanged", () => {
    render(<EventLevelBadge level="warn" />);
    expect(tokens(screen.getByTestId("event-level-warn")).has("bg-warning-bg")).toBe(true);
    cleanup();
    render(<EventLevelBadge level="info" />);
    expect(tokens(screen.getByTestId("event-level-info")).has("bg-surface-sunken")).toBe(true);
  });
});
