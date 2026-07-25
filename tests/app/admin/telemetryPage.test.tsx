// @vitest-environment jsdom
// tests/app/admin/dev/telemetryPage.test.tsx
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";

// developer-tier §6 row 5: Telemetry swapped its gate
// requireAdminIdentity → requireDeveloperIdentity.
vi.mock("@/lib/auth/requireDeveloper", () => ({
  requireDeveloperIdentity: async () => ({ email: "a@b.c" }),
}));
vi.mock("@/lib/time/now", () => ({ nowDate: async () => new Date("2026-06-29T12:00:00.000Z") }));
// HealthAlertsPanel is an async Server Component (own loadHealthAlerts reads);
// stub it here so the page-render test doesn't hit Supabase (alert-audience-split §6.6).
vi.mock("@/components/admin/telemetry/HealthAlertsPanel", () => ({
  HealthAlertsPanel: () => null,
}));
// The overview strip's two new service-role loaders (loadAlertSummary /
// loadTelemetryStats) also read Supabase; stub them so the page-render test
// stays DB-free. Deterministic shapes so the strip renders its ok branches.
vi.mock("@/lib/admin/loadAlertSummary", () => ({
  loadAlertSummary: async () => ({ kind: "ok", degraded: 0, notice: 0, total: 0 }),
}));
vi.mock("@/lib/admin/loadTelemetryStats", () => ({
  loadTelemetryStats: async () => ({
    kind: "ok",
    stats: { total: 0, errorCount: 0, warnCount: 0, infoCount: 0, buckets: [] },
  }),
}));
// The page renders client children (EventFilters, AutoRefreshControl) that call App Router
// hooks; without this mock the render throws the Next router invariant instead of testing.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(cleanup);

describe("TelemetryPage", () => {
  beforeEach(() => vi.resetModules());

  test("renders header + timeline; cron-health infra degrades only that section", async () => {
    vi.doMock("@/lib/admin/loadCronHealth", () => ({
      loadCronHealth: async () => ({ kind: "infra_error", message: "x" }),
    }));
    vi.doMock("@/lib/admin/loadAppEvents", () => ({
      loadAppEvents: async () => ({ kind: "ok", events: [], hasMore: false, nextCursor: null }),
    }));
    const { default: Page } = await import("@/app/admin/dev/telemetry/page");
    render(await Page({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText("Telemetry")).toBeInTheDocument();
    expect(screen.getByTestId("cron-health-degraded")).toBeInTheDocument();
    expect(screen.getByText(/No events match/i)).toBeInTheDocument(); // timeline empty-state still rendered
    // BL-COPY-CRON-SWEEP-2: header sub + degraded fallback are plain language.
    expect(screen.getByText("App event log & scheduled-job health")).toBeInTheDocument();
    expect(screen.getByTestId("cron-health-degraded").textContent).not.toMatch(/cron/i);
    // #601 impeccable critique P1: mid-show the only question is whether the
    // JOBS are broken or the READOUT is. The fallback has to answer that.
    expect(screen.getByTestId("cron-health-degraded")).toHaveTextContent(
      "The jobs are probably still running",
    );
  });

  // #601 impeccable critique P2. The de-jargon pass collapsed two distinct
  // labels ("Cron jobs" / "Cron health") onto one word, so the sidebar section
  // and the stat card said the same thing and the section lost the health axis
  // every other string on this route keeps. Asserted where BOTH render, so a
  // future rename that re-collides them fails here rather than shipping.
  test("the jobs stat card and the sidebar section do not share a label", async () => {
    vi.doMock("@/lib/admin/loadCronHealth", () => ({
      loadCronHealth: async () => ({
        kind: "ok",
        jobs: [
          {
            jobName: "sync",
            label: "Sheet sync",
            cadence: "every 5 min",
            description: "Checks each show's Google Sheet for changes",
            staleAfterMs: 3_600_000,
            lastRunAt: "2026-06-29T11:58:00.000Z",
            outcome: "ok",
            level: "info",
            counts: null,
          },
        ],
      }),
    }));
    vi.doMock("@/lib/admin/loadAppEvents", () => ({
      loadAppEvents: async () => ({ kind: "ok", events: [], hasMore: false, nextCursor: null }),
    }));
    const { default: Page } = await import("@/app/admin/dev/telemetry/page");
    render(await Page({ searchParams: Promise.resolve({}) }));

    const heading = screen.getByRole("heading", { name: /scheduled job/i });
    const cardLabel = screen.getByTestId("stat-cron").querySelector("span");

    expect(heading).toHaveTextContent("Scheduled job health");
    expect(cardLabel).toHaveTextContent("Scheduled jobs");
    // The real assertion: distinct strings, not merely both non-empty.
    expect(heading.textContent?.trim()).not.toBe(cardLabel?.textContent?.trim());
    // And the section keeps the health axis the page subs and fallback use.
    expect(heading.textContent).toMatch(/health/i);
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
    const { default: Page } = await import("@/app/admin/dev/telemetry/page");
    render(await Page({ searchParams: Promise.resolve({ requestId: "req-9", since: "all" }) }));
    expect(loadAppEvents).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: "req-9", sinceHours: null }),
    );
  });

  // Order-sensitive safety (spec §6.1/§11): the developer gate runs BEFORE any service-role read.
  // LAST in the describe — it overrides the gate mock to REJECT; placing it last avoids leak.
  test("requireDeveloperIdentity rejection → NEITHER service-role loader is called (auth-before-read)", async () => {
    const loadAppEvents = vi.fn(async () => ({
      kind: "ok",
      events: [],
      hasMore: false,
      nextCursor: null,
    }));
    const loadCronHealth = vi.fn(async () => ({ kind: "ok", jobs: [] }));
    vi.doMock("@/lib/auth/requireDeveloper", () => ({
      requireDeveloperIdentity: async () => {
        throw new Error("not developer");
      },
    }));
    vi.doMock("@/lib/admin/loadCronHealth", () => ({ loadCronHealth }));
    vi.doMock("@/lib/admin/loadAppEvents", () => ({ loadAppEvents }));
    const { default: Page } = await import("@/app/admin/dev/telemetry/page");
    await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow();
    expect(loadCronHealth).not.toHaveBeenCalled();
    expect(loadAppEvents).not.toHaveBeenCalled();
  });
});
