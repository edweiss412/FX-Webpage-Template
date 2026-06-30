// @vitest-environment jsdom
// tests/app/admin/observabilityPage.test.tsx
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("@/lib/auth/requireAdmin", () => ({
  requireAdminIdentity: async () => ({ email: "a@b.c" }),
}));
vi.mock("@/lib/time/now", () => ({ nowDate: async () => new Date("2026-06-29T12:00:00.000Z") }));
// The page renders client children (EventFilters, AutoRefreshControl) that call App Router
// hooks; without this mock the render throws the Next router invariant instead of testing.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(cleanup);

describe("ObservabilityPage", () => {
  beforeEach(() => vi.resetModules());

  test("renders header + timeline; cron-health infra degrades only that section", async () => {
    vi.doMock("@/lib/admin/loadCronHealth", () => ({
      loadCronHealth: async () => ({ kind: "infra_error", message: "x" }),
    }));
    vi.doMock("@/lib/admin/loadAppEvents", () => ({
      loadAppEvents: async () => ({ kind: "ok", events: [], hasMore: false, nextCursor: null }),
    }));
    const { default: Page } = await import("@/app/admin/observability/page");
    render(await Page({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText("Activity")).toBeInTheDocument();
    expect(screen.getByTestId("cron-health-degraded")).toBeInTheDocument();
    expect(screen.getByText(/No events/i)).toBeInTheDocument(); // timeline still rendered
  });

  test("passes parsed request-correlation filters into loadAppEvents (AC3: requestId + sinceHours null)", async () => {
    const loadAppEvents = vi.fn(async () => ({
      kind: "ok",
      events: [],
      hasMore: false,
      nextCursor: null,
    }));
    vi.doMock("@/lib/admin/loadCronHealth", () => ({
      loadCronHealth: async () => ({ kind: "ok", jobs: [] }),
    }));
    vi.doMock("@/lib/admin/loadAppEvents", () => ({ loadAppEvents }));
    const { default: Page } = await import("@/app/admin/observability/page");
    render(await Page({ searchParams: Promise.resolve({ requestId: "req-9", since: "all" }) }));
    expect(loadAppEvents).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: "req-9", sinceHours: null }),
    );
  });

  // Order-sensitive safety (spec §6.1/§11): the admin gate runs BEFORE any service-role read.
  // LAST in the describe — it overrides the requireAdmin mock to REJECT; placing it last avoids leak.
  test("requireAdminIdentity rejection → NEITHER service-role loader is called (auth-before-read)", async () => {
    const loadAppEvents = vi.fn(async () => ({
      kind: "ok",
      events: [],
      hasMore: false,
      nextCursor: null,
    }));
    const loadCronHealth = vi.fn(async () => ({ kind: "ok", jobs: [] }));
    vi.doMock("@/lib/auth/requireAdmin", () => ({
      requireAdminIdentity: async () => {
        throw new Error("not admin");
      },
    }));
    vi.doMock("@/lib/admin/loadCronHealth", () => ({ loadCronHealth }));
    vi.doMock("@/lib/admin/loadAppEvents", () => ({ loadAppEvents }));
    const { default: Page } = await import("@/app/admin/observability/page");
    await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow();
    expect(loadCronHealth).not.toHaveBeenCalled();
    expect(loadAppEvents).not.toHaveBeenCalled();
  });
});
