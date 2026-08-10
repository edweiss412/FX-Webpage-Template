// @vitest-environment jsdom
/**
 * admin-dashboard-row-actions Task 6 — bucket wiring, end to end (AC-1, §1.4).
 *
 * The component-level contract is pinned next door in dashboardWiring.test.tsx;
 * this file answers the integration question that one cannot: does the real
 * `Dashboard` server component actually turn the feature ON for the ACTIVE
 * bucket, and leave the ARCHIVED bucket alone?
 *
 * `Dashboard` is an async server component, so it is awaited and its returned
 * element rendered — the same thing the RSC runtime does with it.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { premise } from "../../../_shared/premise";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(),
}));

// Server-action modules the tree imports: in jsdom the real ones pull
// next/cache and a server Supabase client at import time.
vi.mock("@/app/admin/show/[slug]/_actions/archive", () => ({
  archiveShowAction: vi.fn(),
}));
vi.mock("@/app/admin/show/[slug]/_actions", () => ({
  unarchiveShowAction: vi.fn(),
  publishShowAction: vi.fn(),
}));
vi.mock("@/app/admin/_actions/autoApplied", () => ({
  acceptChangeAction: vi.fn(),
  acceptAllAction: vi.fn(),
  undoFromDashboardAction: vi.fn(),
}));
// The inbox and the ignored-sheets disclosure are separate loaders with their
// own suites; stub them so this test is about the BUCKET wiring only.
vi.mock("@/lib/admin/loadNeedsAttention", async () => {
  const actual = await vi.importActual<typeof import("@/lib/admin/loadNeedsAttention")>(
    "@/lib/admin/loadNeedsAttention",
  );
  return {
    ...actual,
    loadNeedsAttention: async () => ({ items: [], totalCount: 0, counts: {}, overflowCount: 0 }),
  };
});
vi.mock("@/lib/admin/loadIgnoredSheets", () => ({
  loadIgnoredSheets: async () => ({ kind: "ok", rows: [] }),
}));

type Seed = {
  activeShows?: Record<string, unknown>[];
  archivedShows?: Record<string, unknown>[];
  activeCount?: number;
  archivedCount?: number;
  crewRows?: Record<string, unknown>[];
};

const state = vi.hoisted(() => ({ seed: {} as Record<string, unknown> }));

function makeClient() {
  const seed = state.seed as Seed;
  return {
    async rpc() {
      return { data: false, error: null };
    },
    from(table: string) {
      const ctx = { head: false, eq: {} as Record<string, unknown>, inCol: null as string | null };
      const resolve = () => {
        if (ctx.head) {
          if (table === "shows") {
            const count =
              ctx.eq["archived"] === true ? (seed.archivedCount ?? 0) : (seed.activeCount ?? 0);
            return { data: null, count, error: null };
          }
          return { data: null, count: 0, error: null };
        }
        if (table === "shows" && ctx.inCol === "drive_file_id") return { data: [], error: null };
        if (table === "shows") {
          const list =
            ctx.eq["archived"] === true ? (seed.archivedShows ?? []) : (seed.activeShows ?? []);
          return { data: list, error: null };
        }
        if (table === "crew_members") return { data: seed.crewRows ?? [], error: null };
        return { data: [], error: null };
      };
      const builder: Record<string, unknown> = {};
      const pass = () => builder;
      builder.select = (_cols?: unknown, opts?: { head?: boolean }) => {
        if (opts?.head) ctx.head = true;
        return builder;
      };
      builder.eq = (col: string, val: unknown) => {
        ctx.eq[col] = val;
        return builder;
      };
      builder.is = pass;
      builder.not = pass;
      builder.order = pass;
      builder.limit = pass;
      builder.range = pass;
      builder.in = (col: string) => {
        ctx.inCol = col;
        return builder;
      };
      (builder as { then: unknown }).then = (onf: (v: unknown) => unknown) => onf(resolve());
      return builder;
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => {
    const chain: Record<string, unknown> = {};
    chain["select"] = () => chain;
    chain["eq"] = () => chain;
    chain["order"] = () => chain;
    chain["limit"] = () => Promise.resolve({ data: [], error: null });
    return { from: () => chain };
  },
  createSupabaseServerClient: async () => makeClient(),
}));
vi.mock("@/lib/time/now", () => ({ nowDate: async () => new Date("2026-06-03T12:00:00.000Z") }));
vi.mock("@/lib/admin/loadRecentAutoApplied", () => ({
  loadRecentAutoApplied: async () => ({
    kind: "ok",
    groups: [],
    renderedCount: 0,
    overflowCount: 0,
    rosterShiftByShow: {},
  }),
}));

const DATES = {
  travelIn: "2026-06-01",
  set: null,
  showDays: ["2026-06-03"],
  travelOut: "2026-06-05",
};

const showSeed = (id: string, slug: string, extra: Record<string, unknown> = {}) => ({
  id,
  slug,
  title: `Show ${slug}`,
  drive_file_id: `d${id}`,
  dates: DATES,
  venue: null,
  published: true,
  requires_resync: false,
  ...extra,
});

async function renderDashboard(bucket: "active" | "archived") {
  const { Dashboard } = await import("@/components/admin/Dashboard");
  return render(await Dashboard({ bucket }));
}

beforeEach(() => {
  state.seed = {};
});
afterEach(() => {
  cleanup();
  vi.resetModules();
});

const triggers = () =>
  Array.from(document.body.querySelectorAll('[data-testid^="row-actions-trigger-"]'));

describe("Dashboard bucket wiring", () => {
  test("the ACTIVE bucket turns row actions ON — one trigger per row", async () => {
    const rows = [showSeed("1", "alpha"), showSeed("2", "beta")];
    // PREMISE: a single row cannot distinguish per-row wiring from per-table.
    premise("the fixture seeds more than one active row", rows.length, 1);
    state.seed = {
      activeShows: rows,
      activeCount: rows.length,
      archivedCount: 0,
      crewRows: [{ show_id: "1", id: "c1", name: "Ada Lovelace" }],
    };
    await renderDashboard("active");
    expect(triggers()).toHaveLength(rows.length);
    for (const r of rows) {
      expect(
        document.body.querySelector(`[data-testid="row-actions-trigger-${r.slug}"]`),
        `row ${r.slug} carries its own trigger`,
      ).not.toBeNull();
    }
    // Rendering the WHOLE dashboard tree is slow on a loaded 2-core runner —
    // measured ~17s for the smaller archived tree — so these two cases carry
    // their own ceiling rather than riding the suite default.
  }, 120_000);

  test("the ARCHIVED bucket exposes NO row-action trigger (§1.4, out of scope)", async () => {
    const rows = [
      showSeed("9", "gone", {
        archived: true,
        archived_at: "2026-05-20T00:00:00Z",
        published: false,
      }),
    ];
    state.seed = {
      archivedShows: rows,
      activeCount: 0,
      archivedCount: rows.length,
      crewRows: [{ show_id: "9", id: "c9", name: "Ada Lovelace" }],
    };
    const { container } = await renderDashboard("archived");
    // PREMISE: "no triggers" proves nothing if the bucket rendered no rows at
    // all — the archived list must actually be on screen.
    premise(
      "the archived bucket rendered its row list",
      container.querySelectorAll('[data-testid^="archived-show-row"]').length +
        (container.textContent?.includes("Show gone") ? 1 : 0),
      0,
    );
    expect(triggers()).toHaveLength(0);
  }, 120_000);
});
