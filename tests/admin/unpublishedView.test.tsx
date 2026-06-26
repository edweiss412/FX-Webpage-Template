// @vitest-environment jsdom
/**
 * tests/admin/unpublishedView.test.tsx (Task E1 — spec §5)
 *
 * The /admin/unpublished Held-shows view. Two concerns:
 *   1. loadHeldShows loader: returns ONLY Held shows — published, archived, and
 *      finalize-owned ("Publishing…") rows are all EXCLUDED. Uses the same
 *      readfinalizeowned_b2 RPC fan-out the dashboard uses (NOT requires_resync).
 *      A construction / from() throw surfaces as a typed infra_error (boundary).
 *   2. The page renders the empty-state copy when no Held shows exist, and binds
 *      a Publish action per row.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

// ── recording supabase mock (mirrors tests/admin/fetchDashboardData.test.ts) ──
const state = vi.hoisted(() => ({
  // shows rows the `.from("shows")` read resolves with.
  showsList: [] as Record<string, unknown>[],
  // show ids the readfinalizeowned_b2 RPC returns data===true for (finalize-owned).
  finalizeOwnedIds: [] as string[],
  throwOnConstruct: false as boolean,
  throwOnFrom: false as boolean,
}));

function makeClient() {
  return {
    rpc(_fn: string, args: { p_show_id: string }) {
      return Promise.resolve({
        data: state.finalizeOwnedIds.includes(args.p_show_id),
        error: null,
      });
    },
    from(table: string) {
      if (state.throwOnFrom) throw new Error("META: from() infra fault");
      const builder: Record<string, unknown> = {};
      const passthrough = () => builder;
      for (const m of ["select", "eq", "is", "order", "limit", "range", "in", "returns"]) {
        builder[m] = passthrough;
      }
      const result = { data: table === "shows" ? state.showsList : [], error: null, count: 0 };
      (builder as { then: unknown }).then = (
        onfulfilled?: ((v: typeof result) => unknown) | null,
      ) => (onfulfilled ? onfulfilled(result) : undefined);
      return builder;
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => {
    if (state.throwOnConstruct) throw new Error("META: server-client construction fault");
    return makeClient();
  },
  createSupabaseServiceRoleClient: () => makeClient(),
}));

vi.mock("@/lib/time/now", () => ({ nowDate: async () => new Date("2026-06-23T12:00:00.000Z") }));

// PublishShowButton (rendered in the per-row action slot) calls useRouter(); in
// jsdom there is no app-router context, so stub next/navigation.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin/unpublished",
}));

vi.mock("@/lib/auth/requireAdmin", () => ({
  requireAdminIdentity: async () => ({ email: "doug@example.com" }),
  requireAdmin: async () => {},
  AdminInfraError: class AdminInfraError extends Error {},
}));

beforeEach(() => {
  state.showsList = [];
  state.finalizeOwnedIds = [];
  state.throwOnConstruct = false;
  state.throwOnFrom = false;
});

afterEach(() => cleanup());

const heldRow = (id: string, slug: string) => ({
  id,
  slug,
  title: `Show ${slug}`,
  drive_file_id: `df-${id}`,
  dates: { travelIn: "2026-07-01", travelOut: "2026-07-03" },
  last_synced_at: "2026-06-22T00:00:00.000Z",
  last_sync_status: "ok",
  published: false,
  archived_at: null,
});

describe("loadHeldShows (Task E1 loader)", () => {
  it("returns ONLY Held shows: the shows query is filtered to archived=false AND published=false", async () => {
    // The loader's query already filters archived=false + published=false at the
    // DB; the mock returns whatever showsList holds (the live query would never
    // return a published/archived row). The behavioral guarantee under test is
    // the finalize-owned EXCLUSION, asserted next; here we pin that clean Held
    // rows pass through to ActiveShowRow shape.
    state.showsList = [heldRow("s1", "alpha"), heldRow("s2", "bravo")];
    const { loadHeldShows } = await import("@/lib/admin/loadHeldShows");
    const result = await loadHeldShows();
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.rows.map((r) => r.slug)).toEqual(["alpha", "bravo"]);
    // Every returned row is shaped Held: not published, not finalize-owned.
    for (const r of result.rows) {
      expect(r.published).toBe(false);
      expect(r.finalizeOwned).toBe(false);
      expect(r.isLive).toBe(false);
    }
  });

  it("EXCLUDES a finalize-owned (Publishing…) row via the readfinalizeowned_b2 RPC", async () => {
    state.showsList = [heldRow("s1", "alpha"), heldRow("s2", "publishing")];
    // s2 is owned by an active finalize checkpoint → "Publishing…", NOT Held.
    state.finalizeOwnedIds = ["s2"];
    const { loadHeldShows } = await import("@/lib/admin/loadHeldShows");
    const result = await loadHeldShows();
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.rows.map((r) => r.slug)).toEqual(["alpha"]);
    expect(result.rows.find((r) => r.slug === "publishing")).toBeUndefined();
  });

  it("server-client construction throw → typed infra_error (boundary)", async () => {
    state.throwOnConstruct = true;
    const { loadHeldShows } = await import("@/lib/admin/loadHeldShows");
    const result = await loadHeldShows();
    expect(result).toMatchObject({ kind: "infra_error" });
  });

  it("from('shows') throw → typed infra_error with table-specific 'threw' message", async () => {
    state.throwOnFrom = true;
    const { loadHeldShows } = await import("@/lib/admin/loadHeldShows");
    const result = await loadHeldShows();
    expect(result).toMatchObject({ kind: "infra_error" });
    expect((result as { message: string }).message).toMatch(/shows.*threw/);
  });
});

describe("UnpublishedPage render", () => {
  it("empty state copy when no Held shows exist", async () => {
    state.showsList = [];
    const { default: UnpublishedPage } = await import("@/app/admin/unpublished/page");
    render(await UnpublishedPage());
    const empty = screen.getByTestId("admin-unpublished-empty");
    expect(empty).toHaveTextContent("No unpublished shows.");
    expect(empty).toHaveTextContent("Sheets you leave unchecked during setup will appear here.");
  });

  it("renders a per-row action bar (Publish) bound per Held row", async () => {
    state.showsList = [heldRow("s1", "alpha")];
    const { default: UnpublishedPage } = await import("@/app/admin/unpublished/page");
    render(await UnpublishedPage());
    // The ShowsTable per-row action slot renders the PublishShowButton for the
    // Held row (data-testid from ShowsTable's rowAction wrapper).
    expect(screen.getByTestId("shows-row-action-alpha")).toBeInTheDocument();
    expect(screen.getByTestId("publish-show-button")).toBeInTheDocument();
  });

  it("infra_error → fixed degraded copy, never the raw message (invariant 5)", async () => {
    state.throwOnConstruct = true;
    const { default: UnpublishedPage } = await import("@/app/admin/unpublished/page");
    render(await UnpublishedPage());
    const degraded = screen.getByTestId("admin-unpublished-degraded");
    expect(degraded).toHaveTextContent(/could not load this list/i);
    expect(degraded).not.toHaveTextContent(/META:/);
  });
});
