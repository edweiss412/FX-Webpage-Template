// @vitest-environment jsdom
// M12.2 Phase A Task 7 — Dashboard composition (spec §5/§9). Composes StatStrip
// + (ShowsTable ⟷ NeedsAttentionInbox two-col) + DashboardFooter from the new
// data layer. The two-col split carries items-stretch (Tailwind v4 default is
// NOT stretch — DESIGN §7). The infra_error path renders the existing error main.
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const state = vi.hoisted(() => ({ throwOnConstruct: false }));

function emptyClient() {
  return {
    async rpc() {
      return { data: false, error: null };
    },
    from() {
      const builder: Record<string, unknown> = {};
      const pass = () => builder;
      builder.select = () => builder;
      builder.eq = pass;
      builder.is = pass;
      builder.order = pass;
      builder.limit = pass;
      builder.in = pass;
      builder.range = pass;
      (builder as { then: unknown }).then = (onf: (v: unknown) => unknown) =>
        onf({ data: [], count: 0, error: null });
      return builder;
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => {
    if (state.throwOnConstruct) throw new Error("boom");
    return emptyClient();
  },
}));
vi.mock("@/lib/time/now", () => ({ nowDate: async () => new Date("2026-06-03T12:00:00.000Z") }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin",
}));

beforeEach(() => {
  state.throwOnConstruct = false;
});
afterEach(() => {
  cleanup();
  vi.resetModules();
});

async function renderDashboard() {
  const { Dashboard } = await import("@/components/admin/Dashboard");
  render(await Dashboard());
}

describe("Dashboard composition", () => {
  it("renders StatStrip + ShowsTable + NeedsAttentionInbox + DashboardFooter", async () => {
    await renderDashboard();
    expect(screen.getByTestId("stat-strip")).toBeInTheDocument();
    // empty data → ShowsTable + inbox empty states still render inside the split
    expect(screen.getByTestId("admin-active-shows-empty")).toBeInTheDocument();
    expect(screen.getByTestId("admin-needs-attention-empty")).toBeInTheDocument();
    expect(screen.getByTestId("help-affordance--dashboard-footer--tour")).toBeInTheDocument();
  });

  it("the two-col split container carries items-stretch (DESIGN §7)", async () => {
    await renderDashboard();
    const split = screen.getByTestId("dashboard-split");
    expect(split.className).toMatch(/items-stretch/);
  });

  it("dashboard main is full-width on desktop — no max-w-* cap (M12.3 item 4)", async () => {
    await renderDashboard();
    const main = screen.getByTestId("admin-dashboard");
    expect(main.className).toMatch(/\bw-full\b/);
    expect(main.className).not.toMatch(/\bmax-w-/);
  });

  it("needs-attention header renders the count chip and a help trigger (M12.5)", async () => {
    await renderDashboard();
    expect(screen.getByTestId("needs-attention-count-chip")).toBeInTheDocument();
    expect(screen.getByTestId("needs-attention-help-trigger")).toBeInTheDocument();
  });

  it("infra_error path renders the existing error main", async () => {
    state.throwOnConstruct = true;
    await renderDashboard();
    expect(screen.getByTestId("admin-dashboard-infra-error")).toBeInTheDocument();
    expect(screen.queryByTestId("stat-strip")).toBeNull();
  });
});
