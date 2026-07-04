// @vitest-environment jsdom
/**
 * tests/components/appHealthPanel.test.tsx (alert-audience-split Task 7, spec §6.5)
 *
 * Pins the dashboard `AppHealthPanel` — the ambient health read rendered on
 * `/admin` below `AlertBanner`. It does its OWN `fetchHealthRollup()` read
 * (a layout cannot pass props into page children, R5 finding 2) and resolves
 * `isCurrentUserDeveloper()` itself.
 *
 * Contract (§6.5):
 *   - ok → a quiet "All systems normal" StatusIndicator (positive hue). This
 *     surface IS allowed to show the healthy state explicitly (unlike the amber
 *     banner, which is invisible when clean).
 *   - active (notice/degraded) → the worst-active state + the count, plus a
 *     developer "View details →" deep-link to /admin/dev/telemetry#health OR
 *     (for Doug) the same popover trigger.
 *   - infra_error → a quiet "status unknown" row (never a raw error code).
 *
 * The component is an async Server Component, so each test awaits the JSX
 * before passing it to render(). fetchHealthRollup + isCurrentUserDeveloper
 * are mocked so no Supabase/request scope is needed.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { HealthStatus } from "@/lib/admin/healthRollup";

const rollupState = vi.hoisted(() => ({ result: { kind: "ok" } as HealthStatus }));
const devState = vi.hoisted(() => ({ isDeveloper: false }));

vi.mock("@/lib/admin/healthRollup", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/admin/healthRollup")>();
  return { ...actual, fetchHealthRollup: vi.fn(async () => rollupState.result) };
});
vi.mock("@/lib/auth/requireDeveloper", () => ({
  isCurrentUserDeveloper: vi.fn(async () => devState.isDeveloper),
}));

async function renderPanel() {
  const { AppHealthPanel } = await import("@/components/admin/AppHealthPanel");
  const ui = await AppHealthPanel();
  render(ui);
}

const degraded: HealthStatus = {
  kind: "degraded",
  count: 3,
  summaries: [{ text: "A background report lease is thrashing.", count: 3 }],
  overflowCount: 0,
};
const notice: HealthStatus = {
  kind: "notice",
  count: 2,
  summaries: [{ text: "A picker selection raced.", count: 2 }],
  overflowCount: 0,
};

beforeEach(() => {
  rollupState.result = { kind: "ok" };
  devState.isDeveloper = false;
});
afterEach(cleanup);

describe("AppHealthPanel (Task 7 / AC12)", () => {
  test("ok → quiet 'All systems normal' panel (positive)", async () => {
    rollupState.result = { kind: "ok" };
    await renderPanel();
    const panel = screen.getByTestId("app-health-panel");
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveTextContent("All systems normal");
  });

  test("degraded → panel with worst-active label + the exact count", async () => {
    rollupState.result = degraded;
    await renderPanel();
    const panel = screen.getByTestId("app-health-panel");
    expect(panel).toBeInTheDocument();
    expect(within(panel).getByTestId("app-health-dot-degraded")).toBeInTheDocument();
    // The count is surfaced (3 background items).
    expect(panel).toHaveTextContent("3");
  });

  test("developer + active → 'View details →' deep-link to /admin/dev/telemetry#health", async () => {
    rollupState.result = degraded;
    devState.isDeveloper = true;
    await renderPanel();
    const link = screen.getByRole("link", { name: /View details/i });
    expect(link).toHaveAttribute("href", "/admin/dev/telemetry#health");
  });

  test("Doug + active → a popover trigger button (no deep-link)", async () => {
    rollupState.result = notice;
    devState.isDeveloper = false;
    await renderPanel();
    const panel = screen.getByTestId("app-health-panel");
    // Doug gets a button that opens the plain-language popover, not a dev link.
    expect(within(panel).getByRole("button")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /View details/i })).toBeNull();
  });

  test("infra_error → a quiet unknown-state row, no raw code string", async () => {
    rollupState.result = { kind: "infra_error" };
    await renderPanel();
    const panel = screen.getByTestId("app-health-panel");
    expect(panel).toBeInTheDocument();
    expect(panel.textContent ?? "").not.toMatch(/[A-Z_]{6,}/); // no raw CODE_LIKE token
  });
});
