// @vitest-environment jsdom
// M12.2 Phase A Task 9 — per-show page rework (spec §6). Archived-first status
// pill; crew-link surfaces gated on published && !archived && token; preview-as
// + rotate/reset gated on published && !archived; archived ParsePanel read-only;
// quiet sync footer. Full async-page render with mocked data layer.
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const state = vi.hoisted(() => ({
  show: {} as Record<string, unknown>,
  crew: [] as Array<Record<string, unknown>>,
  pending: [] as Array<Record<string, unknown>>,
  token: null as string | null,
  selectColsByTable: {} as Record<string, string>,
}));

// Async Server Component children can't be client-rendered by RTL — stub them.
vi.mock("@/components/admin/PerShowAlertSection", () => ({
  PerShowAlertSection: () => null,
}));
vi.mock("@/app/admin/show/[slug]/CurrentShareLinkPanel", async () => {
  const React = await import("react");
  return {
    CurrentShareLinkPanel: () =>
      React.createElement("div", { "data-testid": "admin-current-share-link-panel" }),
    resolveOrigin: () => "https://crew.example.com",
  };
});

vi.mock("@/lib/auth/requireAdmin", () => ({ requireAdmin: async () => {} }));
vi.mock("@/lib/time/now", () => ({ nowDate: async () => new Date("2026-06-03T12:00:00.000Z") }));
vi.mock("@/lib/data/loadShowShareToken", () => ({
  loadShowShareToken: async () => state.token,
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin/show/x",
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from(table: string) {
      const builder: Record<string, unknown> = {};
      const pass = () => builder;
      builder.select = (cols?: string) => {
        if (typeof cols === "string") state.selectColsByTable[table] = cols;
        return builder;
      };
      builder.eq = pass;
      builder.is = pass;
      builder.order = pass;
      builder.returns = pass;
      builder.maybeSingle = async () => ({
        data: table === "shows" ? state.show : null,
        error: null,
      });
      (builder as { then: unknown }).then = (onf: (v: unknown) => unknown) => {
        const data =
          table === "crew_members" ? state.crew : table === "pending_syncs" ? state.pending : [];
        return onf({ data, error: null });
      };
      return builder;
    },
  }),
}));

const baseShow = {
  id: "s1",
  slug: "rpas",
  title: "RPAS Central",
  drive_file_id: "d1",
  published: true,
  archived: false,
  last_synced_at: "2026-06-03T10:00:00.000Z",
  last_sync_status: "ok",
};

const pendingRow = {
  staged_id: "stg-1",
  drive_file_id: "d1",
  source_kind: "manual",
  staged_modified_time: "2026-06-02T00:00:00.000Z",
  base_modified_time: null,
  warning_summary: "needs review",
  triggered_review_items: [],
  parse_result: { show: { title: "RPAS Central" } },
};

async function renderPage() {
  const mod = await import("@/app/admin/show/[slug]/page");
  const ui = await mod.default({
    params: Promise.resolve({ slug: "rpas" }),
    searchParams: Promise.resolve({}),
  });
  render(ui);
}

beforeEach(() => {
  state.show = { ...baseShow };
  state.crew = [{ id: "c1", name: "Alex Lee", role: "A1" }];
  state.pending = [];
  state.token = "tok-123";
  state.selectColsByTable = {};
});
afterEach(() => {
  cleanup();
  vi.resetModules();
});

describe("per-show page (§6)", () => {
  it("select adds last_synced_at, last_sync_status, archived (V2)", async () => {
    await renderPage();
    const cols = state.selectColsByTable.shows ?? "";
    expect(cols).toMatch(/archived/);
    expect(cols).toMatch(/last_synced_at/);
    expect(cols).toMatch(/last_sync_status/);
  });

  it("keeps ← Admin home", async () => {
    await renderPage();
    expect(screen.getByText(/Admin home/)).toBeInTheDocument();
  });

  it("status pill: published+!archived -> Published", async () => {
    await renderPage();
    expect(screen.getByTestId("admin-show-status-pill").textContent).toMatch(/Published/);
  });

  it("status pill archived-first: archived+published drift -> Archived (not Published)", async () => {
    state.show = { ...baseShow, archived: true, published: true };
    await renderPage();
    const pill = screen.getByTestId("admin-show-status-pill").textContent ?? "";
    expect(pill).toMatch(/Archived/);
    expect(pill).not.toMatch(/Published/);
  });

  it("status pill: !published -> Publishing…", async () => {
    state.show = { ...baseShow, published: false, archived: false };
    await renderPage();
    expect(screen.getByTestId("admin-show-status-pill").textContent).toMatch(/Publishing/);
  });

  it("crew-link surfaces present when published && !archived && token", async () => {
    await renderPage();
    expect(screen.getByTestId("admin-show-share-chip")).toBeInTheDocument();
    expect(screen.getByTestId("admin-show-open-crew")).toBeInTheDocument();
    expect(screen.getByTestId("admin-current-share-link-panel")).toBeInTheDocument();
  });

  it("crew-link surfaces hidden for archived show (incl archived+published drift)", async () => {
    state.show = { ...baseShow, archived: true, published: true };
    await renderPage();
    expect(screen.queryByTestId("admin-show-share-chip")).toBeNull();
    expect(screen.queryByTestId("admin-show-open-crew")).toBeNull();
    expect(screen.getByTestId("admin-share-link-inactive")).toBeInTheDocument();
    // ineligible show → the inactive notice REPLACES CurrentShareLinkPanel
    expect(screen.queryByTestId("admin-current-share-link-panel")).toBeNull();
  });

  it("token-read failure on a PUBLISHED ACTIVE show: token surfaces hidden but Share panel recovers (NOT the unpublished/archived notice) — Codex R1", async () => {
    // A transient loadShowShareToken null/throw must NOT make a published+active
    // show read as unpublished/archived. The token-dependent chip/open-crew are
    // hidden (no real URL), but CurrentShareLinkPanel renders (its own
    // unavailable/recovery state), and the inactive notice is NOT shown.
    state.token = null;
    await renderPage();
    expect(screen.queryByTestId("admin-show-share-chip")).toBeNull();
    expect(screen.queryByTestId("admin-show-open-crew")).toBeNull();
    expect(screen.getByTestId("admin-current-share-link-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("admin-share-link-inactive")).toBeNull();
    // rotate still rendered for the eligible show (its success URL must show)
    expect(screen.getByTestId("admin-rotate-share-token-button")).toBeInTheDocument();
  });

  it("preview-as links rendered only when published && !archived", async () => {
    await renderPage();
    expect(screen.getByTestId("admin-show-preview-as-link-c1")).toBeInTheDocument();
  });

  it("preview-as links absent + unavailable notice for archived show", async () => {
    state.show = { ...baseShow, archived: true, published: true };
    await renderPage();
    expect(screen.queryByTestId("admin-show-preview-as-link-c1")).toBeNull();
    expect(screen.getByTestId("admin-show-preview-as-unavailable")).toBeInTheDocument();
  });

  it("rotate + reset rendered only when published && !archived", async () => {
    await renderPage();
    expect(screen.getByTestId("admin-rotate-share-token-button")).toBeInTheDocument();
    expect(screen.getByTestId("admin-reset-picker-epoch-button")).toBeInTheDocument();
  });

  it("rotate + reset hidden for a publishing (unpublished) show", async () => {
    state.show = { ...baseShow, published: false, archived: false };
    await renderPage();
    expect(screen.queryByTestId("admin-rotate-share-token-button")).toBeNull();
    expect(screen.queryByTestId("admin-reset-picker-epoch-button")).toBeNull();
  });

  it("archived show: ParsePanel read-only (apply suppressed, view-only notice shown)", async () => {
    state.show = { ...baseShow, archived: true, published: true };
    state.pending = [pendingRow];
    await renderPage();
    expect(screen.getByTestId("staged-review-read-only")).toBeInTheDocument();
    expect(screen.queryByTestId("staged-review-apply")).toBeNull();
  });

  it("non-archived show: ParsePanel apply present", async () => {
    state.pending = [pendingRow];
    await renderPage();
    expect(screen.getByTestId("staged-review-apply")).toBeInTheDocument();
    expect(screen.queryByTestId("staged-review-read-only")).toBeNull();
  });

  it("sync footer shows 'Last synced {rel}' + StatusIndicator", async () => {
    await renderPage();
    const footer = screen.getByTestId("admin-show-sync-footer");
    expect(footer.textContent).toMatch(/Last synced/);
    expect(footer.querySelector("[data-testid^='status-dot-']")).not.toBeNull();
  });

  it("sync footer 'Not synced yet' when last_synced_at is null", async () => {
    state.show = { ...baseShow, last_synced_at: null, last_sync_status: null };
    await renderPage();
    expect(screen.getByTestId("admin-show-sync-footer").textContent).toMatch(/Not synced yet/);
  });

  // Codex impl-diff finding (M12.2-A close-out): a non-ok sync status with a
  // non-null last_synced_at must surface its TEXTUAL health label, not just a
  // color dot (the dot is aria-hidden — color-only would be an a11y/observability
  // regression and contradicts ShowsTable's SyncCell + syncStatus.ts intent).
  it.each([
    ["drive_error", /Couldn't reach Drive/],
    ["parse_error", /Couldn't read the sheet/],
    ["pending_review", /Changes to review/],
    ["pending", /Sync in progress/],
  ])("sync footer surfaces the textual label for non-ok status %s", async (status, labelRe) => {
    state.show = { ...baseShow, last_sync_status: status, last_synced_at: "2026-06-03T08:00:00.000Z" };
    await renderPage();
    const footer = screen.getByTestId("admin-show-sync-footer");
    // The descriptive health label appears (not color-only)…
    expect(footer.textContent).toMatch(labelRe);
    // …and the relative timestamp stays as secondary context.
    expect(footer.textContent).toMatch(/Last synced/);
  });

  // Codex impl-diff finding [high] (M12.2-A close-out): the per-show page is the
  // archived-safe READ-ONLY surface (ParsePanel readOnly, share/rotate/preview
  // gated on !archived), but the sync footer's Re-sync CTA mutates shows/
  // pending_syncs via /api/admin/sync — and the server's only gate is
  // finalize-ownership, NOT archived. So Re-sync must be suppressed for archived
  // shows (UI mitigation; the server-side archived guard is DEFERRED — DEF-3).
  it("archived show: Re-sync CTA suppressed + read-only note shown", async () => {
    state.show = { ...baseShow, archived: true, published: true };
    await renderPage();
    expect(screen.queryByTestId("admin-resync-button")).toBeNull();
    expect(screen.getByTestId("admin-show-resync-archived")).toBeInTheDocument();
  });

  it("non-archived show: Re-sync CTA present", async () => {
    await renderPage();
    expect(screen.getByTestId("admin-resync-button")).toBeInTheDocument();
    expect(screen.queryByTestId("admin-show-resync-archived")).toBeNull();
  });

  it("sync footer keeps plain 'Last synced {rel}' for ok status (no redundant label)", async () => {
    state.show = { ...baseShow, last_sync_status: "ok", last_synced_at: "2026-06-03T08:00:00.000Z" };
    await renderPage();
    const footer = screen.getByTestId("admin-show-sync-footer");
    expect(footer.textContent).toMatch(/Last synced/);
    expect(footer.textContent).not.toMatch(/Synced\b.*Last synced/); // no "Synced · Last synced" doubling
  });
});
