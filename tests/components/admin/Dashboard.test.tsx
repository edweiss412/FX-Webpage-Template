// @vitest-environment jsdom
// M12.2 Phase A Task 7 — Dashboard composition (spec §5/§9). Composes StatStrip
// + (ShowsTable ⟷ NeedsAttentionInbox two-col) + DashboardFooter from the new
// data layer. The two-col split carries items-stretch (Tailwind v4 default is
// NOT stretch — DESIGN §7). The infra_error path renders the existing error main.
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

const state = vi.hoisted(() => ({ throwOnConstruct: false }));
// Mobile needs-attention Task 7 (R6-F1) — when set, loadNeedsAttention returns
// this instead of running against the (empty) mocked client, so the summary
// card can be fed stream totals that EXCEED every rendered row-array length.
const naState = vi.hoisted(() => ({
  override: null as null | import("@/lib/admin/needsAttention").NeedsAttention,
}));

vi.mock("@/lib/admin/loadNeedsAttention", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/loadNeedsAttention")>();
  return {
    ...actual,
    loadNeedsAttention: async (opts: Parameters<typeof actual.loadNeedsAttention>[0]) =>
      naState.override ?? actual.loadNeedsAttention(opts),
  };
});

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
  naState.override = null;
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

  it("summary card renders loader-derived stream totals, not the rendered subset (R6-F1)", async () => {
    // Totals (31/47) exceed EVERY row-array length: only 2 items rendered
    // (1 per stream). A broken implementation that counts rendered rows would
    // show 1/1 (or 2) — the card must show the loader's exact head-counts.
    naState.override = {
      items: [
        {
          variant: "pending_ingestion",
          key: "pi:00000000-0000-0000-0000-000000000001",
          id: "00000000-0000-0000-0000-000000000001",
          driveFileId: "drive-file-ingest-1",
          driveFileName: "RPAS Central.xlsx",
          copy: "We couldn't process this sheet.",
          activityAt: "2026-06-01T10:00:00.000Z",
        },
        {
          variant: "existing_staged",
          key: "ps:00000000-0000-0000-0000-000000000002",
          stagedId: "00000000-0000-0000-0000-000000000002",
          driveFileId: "drive-file-sync-1",
          slug: "rpas-central",
          title: "RPAS Central",
          activityAt: "2026-06-02T10:00:00.000Z",
        },
      ],
      renderedCount: 2,
      totalCount: 78,
      overflowCount: 76,
      ingestionTotal: 31,
      syncTotal: 47,
    };
    await renderDashboard();

    // Anti-tautology: the full inbox (inside dashboard-inbox-desktop) renders
    // overlapping counts/labels. Clone the inbox column and REMOVE the desktop
    // node before asserting any summary-card text.
    const col = screen.getByTestId("dashboard-inbox-col");
    const desktop = col.querySelector('[data-testid="dashboard-inbox-desktop"]');
    expect(desktop).not.toBeNull();
    const clone = col.cloneNode(true) as HTMLElement;
    clone.querySelector('[data-testid="dashboard-inbox-desktop"]')?.remove();

    const card = clone.querySelector<HTMLElement>('[data-testid="needs-attention-summary-card"]');
    expect(card).not.toBeNull();
    expect(card!.textContent).toContain("Needs attention · 78");
    expect(card!.querySelector('[data-testid="summary-chip-ingestions"]')?.textContent).toContain(
      "31 couldn't process",
    );
    expect(card!.querySelector('[data-testid="summary-chip-syncs"]')?.textContent).toContain(
      "47 to review",
    );

    // Dual-render structure (spec §4.6): card is mobile-only, the existing
    // header row + inbox live inside the desktop-only wrapper.
    expect(card!.className).toMatch(/min-\[720px\]:hidden/);
    expect((desktop as HTMLElement).className).toMatch(/\bhidden\b/);
    expect((desktop as HTMLElement).className).toMatch(/min-\[720px\]:flex/);
    expect(desktop!.querySelector('[data-testid="needs-attention-count-chip"]')).not.toBeNull();
  });

  it("infra_error path renders the existing error main", async () => {
    state.throwOnConstruct = true;
    await renderDashboard();
    expect(screen.getByTestId("admin-dashboard-infra-error")).toBeInTheDocument();
    expect(screen.queryByTestId("stat-strip")).toBeNull();
  });

  // B1-D3 (M12.2 DEFERRED) — the infra-error branch renders BELOW the shared
  // <AdminPageHeader title="Dashboard"> in app/admin/page.tsx, so it must not
  // carry its own "Admin" eyebrow chrome: two stacked header blocks otherwise.
  // Failure mode caught: someone re-adds page-level chrome to the error branch
  // and the infra-fault page regresses to a doubled header.
  it("B1-D3: infra_error branch carries no 'Admin' eyebrow (single header under AdminPageHeader)", async () => {
    state.throwOnConstruct = true;
    await renderDashboard();
    const errorMain = screen.getByTestId("admin-dashboard-infra-error");
    expect(within(errorMain).queryByText(/^admin$/i)).toBeNull();
    // The error message itself still renders — content, not chrome.
    expect(within(errorMain).getByText(/we could not load your dashboard/i)).toBeInTheDocument();
  });
});
