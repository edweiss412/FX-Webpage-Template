// @vitest-environment jsdom
// tests/components/healthAlertsPanel.autoResolve.test.tsx (alert-resolve-truthing §4.1)
//
// The manual "Resolve" control is suppressed for auto-resolving codes (a manual button would be a
// misleading no-op) and replaced by a read-only auto-clear note; manual codes keep the button.
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { HealthAlertRow, LoadHealthAlertsResult } from "@/lib/admin/healthAlerts";

const impl = vi.hoisted(() => ({
  fn: (async () => ({ kind: "ok", rows: [], hasMore: false })) as (args: {
    weight: "degraded" | "notice";
    page: number;
  }) => Promise<LoadHealthAlertsResult>,
}));

vi.mock("@/lib/admin/healthAlerts", async (orig) => {
  const actual = await orig<typeof import("@/lib/admin/healthAlerts")>();
  return {
    ...actual,
    loadHealthAlerts: (args: { weight: "degraded" | "notice"; page: number }) => impl.fn(args),
  };
});

function row(overrides: Partial<HealthAlertRow> & { id: string; code: string }): HealthAlertRow {
  return {
    show_id: null,
    slug: null,
    context: null,
    occurrence_count: 1,
    raised_at: "2026-01-01T00:00:00.000Z",
    identityText: null,
    ...overrides,
  };
}

async function renderPanel(searchParams: Record<string, string | string[] | undefined> = {}) {
  const { HealthAlertsPanel } = await import("@/components/admin/telemetry/HealthAlertsPanel");
  render(await HealthAlertsPanel({ searchParams }));
}

beforeEach(() => {
  impl.fn = async () => ({ kind: "ok", rows: [], hasMore: false });
});
afterEach(cleanup);

describe("HealthAlertsPanel auto-resolve suppression (§4.1)", () => {
  test("auto code → auto-clear note present, resolve button suppressed", async () => {
    // WEBHOOK_TOKEN_INVALID is auto + health(degraded).
    impl.fn = async ({ weight }) =>
      weight === "degraded"
        ? {
            kind: "ok",
            rows: [row({ id: "auto1", code: "WEBHOOK_TOKEN_INVALID" })],
            hasMore: false,
          }
        : { kind: "ok", rows: [], hasMore: false };
    await renderPanel();
    const rowEl = within(screen.getByTestId("health-alerts-panel")).getByTestId(
      "health-alert-row-auto1",
    );
    expect(within(rowEl).getByTestId("health-alert-autoclear-auto1")).toBeInTheDocument();
    expect(within(rowEl).queryByTestId("health-alert-resolve-form-auto1")).not.toBeInTheDocument();
    // Note is human copy, never the raw code (invariant 5).
    expect(rowEl.textContent ?? "").not.toContain("WEBHOOK_TOKEN_INVALID");
  });

  test("manual code → resolve button present, no auto-clear note", async () => {
    // PICKER_SELECTION_RACE is event-manual + health(notice).
    impl.fn = async ({ weight }) =>
      weight === "notice"
        ? {
            kind: "ok",
            rows: [row({ id: "man1", code: "PICKER_SELECTION_RACE", show_id: "s", slug: "rpas" })],
            hasMore: false,
          }
        : { kind: "ok", rows: [], hasMore: false };
    await renderPanel();
    const rowEl = within(screen.getByTestId("health-alerts-panel")).getByTestId(
      "health-alert-row-man1",
    );
    expect(within(rowEl).getByTestId("health-alert-resolve-form-man1")).toBeInTheDocument();
    expect(within(rowEl).queryByTestId("health-alert-autoclear-man1")).not.toBeInTheDocument();
  });
});
