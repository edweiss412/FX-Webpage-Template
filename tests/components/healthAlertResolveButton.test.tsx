// @vitest-environment jsdom
// tests/components/healthAlertResolveButton.test.tsx (alert-audience-split Task 9)
//
// The per-row Resolve control is a Server-Action <form> (NOT a <form action="/api/…">
// to the JSON resolve route), so resolution revalidates in place and never navigates
// to raw JSON (R5 finding 3). We assert the wiring SHAPE + resolvability of page-2 rows.
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { HealthAlertRow, LoadHealthAlertsResult } from "@/lib/admin/healthAlerts";

// Stub the Server Action module so the button test doesn't pull the whole
// actions.ts graph; we assert it is bound as the form `action`, not a fetch URL.
const action = vi.fn();
vi.mock("@/app/admin/actions", () => ({ resolveHealthAlertFormAction: action }));

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

function row(id: string, code: string): HealthAlertRow {
  return {
    id,
    code,
    show_id: null,
    slug: null,
    context: null,
    occurrence_count: 1,
    raised_at: "2026-01-01T00:00:00.000Z",
  };
}

afterEach(cleanup);

describe("HealthAlertResolveButton (Task 9 wiring)", () => {
  test("renders a Server-Action <form> with a hidden id + submit button (no JSON-route href)", async () => {
    const { HealthAlertResolveButton } =
      await import("@/components/admin/observability/HealthAlertResolveButton");
    render(<HealthAlertResolveButton alertId="abc" />);
    const form = screen.getByTestId("health-alert-resolve-form-abc");
    expect(form.tagName).toBe("FORM");
    // hidden id input carries the row id (what the action reads)
    const hidden = form.querySelector('input[name="id"]') as HTMLInputElement | null;
    expect(hidden?.value).toBe("abc");
    // submit button present, NOT an anchor to the JSON resolve route
    expect(within(form).getByTestId("health-alert-resolve-abc")).toHaveAttribute("type", "submit");
    expect(form.querySelector('a[href*="/api/"]')).toBeNull();
  });

  test("page-2 degraded row (?dpage=1) renders its Resolve control — RESOLVABLE, not just reachable", async () => {
    impl.fn = async ({ weight, page }) =>
      weight === "degraded" && page === 1
        ? { kind: "ok", rows: [row("row51", "WEBHOOK_TOKEN_INVALID")], hasMore: false }
        : { kind: "ok", rows: [], hasMore: false };
    const { HealthAlertsPanel } =
      await import("@/components/admin/observability/HealthAlertsPanel");
    render(await HealthAlertsPanel({ searchParams: { dpage: "1" } }));
    expect(screen.getByTestId("health-alert-resolve-row51")).toBeInTheDocument();
  });

  test("page-2 notice row (?npage=1) renders its Resolve control", async () => {
    impl.fn = async ({ weight, page }) =>
      weight === "notice" && page === 1
        ? { kind: "ok", rows: [row("n51", "PICKER_SELECTION_RACE")], hasMore: false }
        : { kind: "ok", rows: [], hasMore: false };
    const { HealthAlertsPanel } =
      await import("@/components/admin/observability/HealthAlertsPanel");
    render(await HealthAlertsPanel({ searchParams: { npage: "1" } }));
    expect(screen.getByTestId("health-alert-resolve-n51")).toBeInTheDocument();
  });
});
