// @vitest-environment jsdom
// tests/app/admin/dev/telemetryPage.test.tsx
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { premise } from "../../_shared/premise";
import { CRON_JOBS } from "@/lib/cron/runSummary";

// developer-tier §6 row 5: Telemetry swapped its gate
// requireAdminIdentity → requireDeveloperIdentity.
vi.mock("@/lib/auth/requireDeveloper", () => ({
  requireDeveloperIdentity: async () => ({ email: "a@b.c" }),
}));
// Mutable so a case can advance the page's per-render clock between renders, which is
// what the retry control reads to tell a settled failure from a tap it has not heard
// back from. Every other case leaves it at the fixed instant it has always been.
const PAGE_NOW_DEFAULT = "2026-06-29T12:00:00.000Z";
let pageNow = new Date(PAGE_NOW_DEFAULT);
vi.mock("@/lib/time/now", () => ({ nowDate: async () => pageNow }));
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
// The three spies are module-level and STABLE, not fresh per useRouter() call: the retry
// cases below assert on them, and a factory that minted a new vi.fn() per call would give
// every assertion a spy nothing had ever touched.
const routerRefresh = vi.fn();
const routerPush = vi.fn();
const routerReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, replace: routerReplace, refresh: routerRefresh }),
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  cleanup();
  pageNow = new Date(PAGE_NOW_DEFAULT);
  // mockReset, not mockClear: the retry cases install an implementation that re-renders the
  // page, and a leaked implementation would drive a later case's click into a stale tree.
  routerRefresh.mockReset();
  routerPush.mockReset();
  routerReplace.mockReset();
});

// Data-source assertion against the real registry, not the mocks below: the
// mocked loadCronHealth fixtures can drift green, this cannot. Catches the
// registry label regressing from the unified job name.
test("the sync job's registry label is the unified name (BL-SYNC-JOB-FOUR-NAMES)", () => {
  expect(CRON_JOBS.find((j) => j.jobName === "sync")?.label).toBe("Auto sync");
});

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

  // BL-TELEMETRY-FALLBACK-RETRY / #601 impeccable critique P1. The fallback named the
  // cause and offered no recourse: the only way to re-read was a full page reload.
  test("the health fallback offers a retry, and one tap re-reads without navigating", async () => {
    const loadCronHealth = vi.fn(async () => ({ kind: "infra_error", message: "x" }));
    vi.doMock("@/lib/admin/loadCronHealth", () => ({ loadCronHealth }));
    vi.doMock("@/lib/admin/loadAppEvents", () => ({
      loadAppEvents: async () => ({ kind: "ok", events: [], hasMore: false, nextCursor: null }),
    }));
    const { default: Page } = await import("@/app/admin/dev/telemetry/page");

    let renders = 0;
    const renderPage = async () => {
      renders += 1;
      return await Page({ searchParams: Promise.resolve({}) });
    };
    const utils = render(await renderPage());

    // On this case's OWN inputs. Without it every assertion below is vacuously satisfiable
    // by a page that rendered the ok branch and has no fallback at all.
    premise(
      "the fallback branch is the one rendered",
      screen.queryAllByTestId("cron-health-degraded").length,
      0,
    );
    const before = loadCronHealth.mock.calls.length;
    premise("the first render read the loader", before, 0);

    // Scoped deliberately: the page header already renders `autorefresh-manual`, a second
    // rotate-icon refresh control, and an unscoped query would be satisfied by it.
    const retry = within(screen.getByTestId("cron-health-degraded")).getByTestId(
      "cron-health-retry",
    );

    // What the App Router does on router.refresh() for a force-dynamic server component.
    // Nothing else in this case re-renders, so a button that never calls refresh leaves the
    // count where it was; and the assertion is on the LOADER, not on the refresh spy, so a
    // control that calls refresh without the page re-reading fails too.
    routerRefresh.mockImplementation(() => {
      void act(async () => {
        utils.rerender(await renderPage());
      });
    });

    fireEvent.click(retry);
    expect(routerRefresh).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(loadCronHealth.mock.calls.length).toBe(before + 1));
    expect(renders).toBe(2);

    // The consequence bound, written as assertions rather than as a sentence.
    expect(routerPush).not.toHaveBeenCalled();
    expect(routerReplace).not.toHaveBeenCalled();
    expect(retry).toHaveAttribute("type", "button");
    expect(retry).not.toHaveAttribute("href");
  });

  // TELEMETRY-RETRY-OUTCOME-ANNOUNCEMENT-1, end to end through the real page: the
  // announcement's signal is the page's own per-render timestamp, so a case that
  // renders the control in isolation cannot prove the wiring. DIFFERENT, not later,
  // deliberately: the contract is any-difference, and direction coverage lives in the
  // control's own suite.
  test("a re-read that still fails announces the outcome to the live region", async () => {
    const loadCronHealth = vi.fn(async () => ({ kind: "infra_error", message: "x" }));
    vi.doMock("@/lib/admin/loadCronHealth", () => ({ loadCronHealth }));
    vi.doMock("@/lib/admin/loadAppEvents", () => ({
      loadAppEvents: async () => ({ kind: "ok", events: [], hasMore: false, nextCursor: null }),
    }));
    const { default: Page } = await import("@/app/admin/dev/telemetry/page");
    const { retryOutcomeAnnouncement } =
      await import("@/components/admin/telemetry/TelemetryRetryButton");

    const renderPage = async () => await Page({ searchParams: Promise.resolve({}) });
    const utils = render(await renderPage());
    premise(
      "the fallback branch is the one rendered",
      screen.queryAllByTestId("cron-health-degraded").length,
      0,
    );

    const status = screen.getByTestId("cron-health-retry-status");
    premise("the live region starts empty", 1, (status.textContent ?? "").length);

    routerRefresh.mockImplementation(() => {
      // The server render the tap provoked, at a different instant, still failing.
      pageNow = new Date("2026-06-29T12:00:20.000Z");
      void act(async () => {
        utils.rerender(await renderPage());
      });
    });

    fireEvent.click(
      within(screen.getByTestId("cron-health-degraded")).getByTestId("cron-health-retry"),
    );

    await waitFor(() =>
      expect(screen.getByTestId("cron-health-retry-status").textContent).toContain(
        retryOutcomeAnnouncement("scheduled-job health"),
      ),
    );
    expect(loadCronHealth.mock.calls.length).toBe(2);
  });

  test("a retry that succeeds replaces the fallback, and takes the control with it", async () => {
    const job = {
      jobName: "sync",
      label: "Auto sync",
      cadence: "every 5 min",
      description: "Checks each show's Google Sheet for changes",
      staleAfterMs: 3_600_000,
      lastRunAt: "2026-06-29T11:58:00.000Z",
      outcome: "ok",
      level: "info",
      counts: null,
    };
    const loadCronHealth = vi
      .fn()
      .mockResolvedValueOnce({ kind: "infra_error", message: "x" })
      .mockResolvedValue({ kind: "ok", jobs: [job] });
    vi.doMock("@/lib/admin/loadCronHealth", () => ({ loadCronHealth }));
    vi.doMock("@/lib/admin/loadAppEvents", () => ({
      loadAppEvents: async () => ({ kind: "ok", events: [], hasMore: false, nextCursor: null }),
    }));
    const { default: Page } = await import("@/app/admin/dev/telemetry/page");

    const renderPage = async () => await Page({ searchParams: Promise.resolve({}) });
    const utils = render(await renderPage());

    // Both premises on THIS case's own inputs: a fixture whose label is "" would make the
    // on-screen assertion pass against any DOM, and an ok first render would make the whole
    // case vacuous.
    premise("the label the success assertion looks for is non-empty", job.label.length, 0);
    premise(
      "the first render took the fallback branch",
      screen.queryAllByTestId("cron-health-degraded").length,
      0,
    );

    routerRefresh.mockImplementation(() => {
      void act(async () => {
        utils.rerender(await renderPage());
      });
    });
    fireEvent.click(screen.getByTestId("cron-health-retry"));

    await waitFor(() => expect(screen.queryByTestId("cron-health-degraded")).toBeNull());
    // The control goes with the branch it lives in; nothing is left behind to click.
    expect(screen.queryByTestId("cron-health-retry")).toBeNull();
    // Read off the fixture, never retyped, so a fixture whose label changes cannot leave
    // this passing against a stale string.
    expect(screen.getByText(job.label)).toBeInTheDocument();
  });

  test("a retry that fails again keeps the copy and the control unchanged", async () => {
    const loadCronHealth = vi.fn(async () => ({ kind: "infra_error", message: "x" }));
    vi.doMock("@/lib/admin/loadCronHealth", () => ({ loadCronHealth }));
    vi.doMock("@/lib/admin/loadAppEvents", () => ({
      loadAppEvents: async () => ({ kind: "ok", events: [], hasMore: false, nextCursor: null }),
    }));
    const { default: Page } = await import("@/app/admin/dev/telemetry/page");

    const renderPage = async () => await Page({ searchParams: Promise.resolve({}) });
    const utils = render(await renderPage());
    const before = loadCronHealth.mock.calls.length;
    premise("the first render read the loader", before, 0);

    routerRefresh.mockImplementation(() => {
      void act(async () => {
        utils.rerender(await renderPage());
      });
    });
    fireEvent.click(screen.getByTestId("cron-health-retry"));
    await waitFor(() => expect(loadCronHealth.mock.calls.length).toBe(before + 1));
    fireEvent.click(screen.getByTestId("cron-health-retry"));
    await waitFor(() => expect(loadCronHealth.mock.calls.length).toBe(before + 2));

    const fallback = screen.getByTestId("cron-health-degraded");
    expect(within(fallback).getByTestId("cron-health-retry")).toBeInTheDocument();
    // Asserted on the shipped sentences, apostrophe sidestepped, so "copy unchanged" is a
    // test rather than a claim.
    expect(fallback).toHaveTextContent("load scheduled-job health right now");
    expect(fallback).toHaveTextContent("The jobs are probably still running");
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
            label: "Auto sync",
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
