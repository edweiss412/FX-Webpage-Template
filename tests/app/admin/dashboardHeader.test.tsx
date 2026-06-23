// @vitest-environment jsdom
// M12.2 Phase B1 Task 4.1 — Dashboard header consolidation. The settled
// `/admin` path wraps <Dashboard/> with <AdminPageHeader title="Dashboard"
// sub="Your live shows and anything that needs review." /> as the SINGLE title
// source; the duplicate <h2>Dashboard</h2> inside Dashboard.tsx is removed.
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/lib/auth/requireAdmin", () => ({ requireAdmin: async () => {} }));
vi.mock("@/lib/onboarding/sessionLifecycle", () => ({
  purgeAndRotateIfStale: async () => ({
    settings: { pending_wizard_session_id: null, watched_folder_id: "f1" },
  }),
}));
// nav-perf phase 1 (A2): AdminPage now reads app_settings via readAppSettingsRow
// to gate the purge tx. Mock it to infra_error so the gate deterministically
// falls back to the purgeAndRotateIfStale mock above — otherwise the real read
// hits live local Supabase, whose app_settings row other suites mutate, flaking
// this header test in the full suite. (Same class as AdminPage.test.tsx.)
vi.mock("@/lib/appSettings/readAppSettingsRow", () => ({
  readAppSettingsRow: async () => ({ kind: "infra_error" }),
}));
vi.mock("@/lib/time/now", () => ({ nowDate: async () => new Date("2026-06-03T12:00:00.000Z") }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin",
}));

// Render <Dashboard/> as a cheap stub so this test isolates the header wiring
// in app/admin/page.tsx, not the dashboard data layer.
vi.mock("@/components/admin/Dashboard", () => ({
  Dashboard: () => null,
}));
// M12.3: AlertBanner is now mounted in DashboardWithHeader (app/admin/page.tsx),
// not the layout. It's an async server component that self-fetches via cookies/
// Supabase, which throws outside a request scope — stub it for this page-header
// unit test (the banner has its own suite, tests/components/AlertBanner.test.tsx).
vi.mock("@/components/admin/AlertBanner", () => ({
  AlertBanner: () => null,
}));

async function renderAdminPage() {
  const mod = await import("@/app/admin/page");
  const ui = await mod.default({ searchParams: Promise.resolve({}) });
  render(ui);
}

beforeEach(() => {
  vi.resetModules();
});
afterEach(() => {
  cleanup();
});

describe("Dashboard header (Task 4.1)", () => {
  it("renders AdminPageHeader with title 'Dashboard' + sub copy", async () => {
    await renderAdminPage();
    const header = screen.getByTestId("admin-page-header");
    expect(screen.getByTestId("admin-page-header-title").textContent).toBe("Dashboard");
    expect(header.textContent).toMatch(/Your live shows and anything that needs review\./);
  });

  it("renders exactly one 'Dashboard' title node (no duplicate heading)", async () => {
    await renderAdminPage();
    const matches = screen.getAllByText("Dashboard");
    expect(matches).toHaveLength(1);
    expect(matches[0]).toHaveAttribute("data-testid", "admin-page-header-title");
  });
});
