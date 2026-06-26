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
  // shows_internal rows the `.from("shows_internal")` read resolves with
  // (parse-data-quality-warnings Task 9): { show_id, parse_warnings }.
  showsInternalList: [] as Record<string, unknown>[],
  // show ids the readfinalizeowned_b2 RPC returns data===true for (finalize-owned).
  finalizeOwnedIds: [] as string[],
  throwOnConstruct: false as boolean,
  throwOnFrom: false as boolean,
  // Per-table throw / returned-error toggles (invariant-9 read-failure paths).
  throwOnFromTable: null as string | null,
  errorOnFromTable: null as string | null,
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
      if (state.throwOnFromTable === table) {
        throw new Error(`META: from('${table}') infra fault`);
      }
      const builder: Record<string, unknown> = {};
      const passthrough = () => builder;
      for (const m of ["select", "eq", "is", "order", "limit", "range", "in", "returns"]) {
        builder[m] = passthrough;
      }
      const data =
        table === "shows"
          ? state.showsList
          : table === "shows_internal"
            ? state.showsInternalList
            : [];
      const error =
        state.errorOnFromTable === table ? { message: `META: ${table} returned error` } : null;
      const result = { data: error ? null : data, error, count: 0 };
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
  state.showsInternalList = [];
  state.finalizeOwnedIds = [];
  state.throwOnConstruct = false;
  state.throwOnFrom = false;
  state.throwOnFromTable = null;
  state.errorOnFromTable = null;
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

// parse-data-quality-warnings Task 9 (P3 secondary) — the held-show data-gaps
// read + invariant-9 read-boundary discipline.
describe("loadHeldShows — shows_internal.parse_warnings (Task 9)", () => {
  it("derives a per-show dataGaps summary FROM the seeded parse_warnings array (anti-tautology)", async () => {
    state.showsList = [heldRow("s1", "alpha"), heldRow("s2", "bravo")];
    const alphaWarnings = [
      { severity: "warn", code: "FIELD_UNREADABLE", message: "phone" },
      { severity: "warn", code: "BLOCK_DISAPPEARED", message: "hotel gone" },
    ];
    state.showsInternalList = [
      { show_id: "s1", parse_warnings: alphaWarnings },
      { show_id: "s2", parse_warnings: [] },
    ];
    const { loadHeldShows } = await import("@/lib/admin/loadHeldShows");
    const { summarizeDataGaps } = await import("@/lib/parser/dataGaps");
    const result = await loadHeldShows();
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    const alpha = result.rows.find((r) => r.slug === "alpha")!;
    const bravo = result.rows.find((r) => r.slug === "bravo")!;
    // Derived from the DATA SOURCE (the seeded warning array), not the chip.
    expect(alpha.dataGaps).toEqual(summarizeDataGaps(alphaWarnings as never));
    expect(alpha.dataGaps?.total).toBe(2);
    // A show with no parse_warnings → total 0 (no chip downstream).
    expect(bravo.dataGaps?.total).toBe(0);
  });

  it("a show absent from shows_internal → dataGaps total 0 (no chip)", async () => {
    state.showsList = [heldRow("s1", "alpha")];
    state.showsInternalList = []; // no internal row for s1
    const { loadHeldShows } = await import("@/lib/admin/loadHeldShows");
    const result = await loadHeldShows();
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.rows[0]!.dataGaps?.total).toBe(0);
  });

  // INVARIANT 9 (R-plan F1 — NOT deferred): a shows_internal read failure must be
  // a DISCRIMINABLE infra_error, never a silent {total:0} — collapsing a failed
  // read to "no data gaps" would recreate the exact silent-drop this feature kills.
  it("shows_internal read RETURNS an error → typed infra_error (NOT silent total:0)", async () => {
    state.showsList = [heldRow("s1", "alpha")];
    state.errorOnFromTable = "shows_internal";
    const { loadHeldShows } = await import("@/lib/admin/loadHeldShows");
    const result = await loadHeldShows();
    expect(result).toMatchObject({ kind: "infra_error" });
    expect((result as { message: string }).message).toMatch(/shows_internal/);
  });

  it("shows_internal read THROWS → typed infra_error with table-specific 'threw' message", async () => {
    state.showsList = [heldRow("s1", "alpha")];
    state.throwOnFromTable = "shows_internal";
    const { loadHeldShows } = await import("@/lib/admin/loadHeldShows");
    const result = await loadHeldShows();
    expect(result).toMatchObject({ kind: "infra_error" });
    expect((result as { message: string }).message).toMatch(/shows_internal.*threw/);
  });
});

describe("ShowsTable data-gaps chip (Task 9)", () => {
  it("renders the chip near PublishShowButton when a row's dataGaps total > 0", async () => {
    state.showsList = [heldRow("s1", "alpha"), heldRow("s2", "bravo")];
    state.showsInternalList = [
      {
        show_id: "s1",
        parse_warnings: [{ severity: "warn", code: "FIELD_UNREADABLE", message: "phone" }],
      },
      { show_id: "s2", parse_warnings: [] },
    ];
    const { default: UnpublishedPage } = await import("@/app/admin/unpublished/page");
    render(await UnpublishedPage());
    // alpha (1 gap) shows the chip; bravo (0 gaps) does not.
    const chip = screen.getByTestId("shows-data-gaps-chip-alpha");
    expect(chip).toBeInTheDocument();
    expect(chip.textContent).toMatch(/1\s*data gap/i);
    expect(screen.queryByTestId("shows-data-gaps-chip-bravo")).toBeNull();
    // invariant 5: the chip never exposes the raw §12.4 code literal.
    expect(chip.textContent).not.toMatch(/FIELD_UNREADABLE/);
  });

  it("page degrades visibly when the shows_internal read fails (invariant 9, not a missing chip)", async () => {
    state.showsList = [heldRow("s1", "alpha")];
    state.throwOnFromTable = "shows_internal";
    const { default: UnpublishedPage } = await import("@/app/admin/unpublished/page");
    render(await UnpublishedPage());
    // The loader returns infra_error → the page's degraded copy shows, NOT a
    // silent table with no chips.
    expect(screen.getByTestId("admin-unpublished-degraded")).toBeInTheDocument();
    expect(screen.queryByTestId("shows-data-gaps-chip-alpha")).toBeNull();
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
