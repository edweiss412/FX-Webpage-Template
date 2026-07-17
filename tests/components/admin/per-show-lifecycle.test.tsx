// @vitest-environment jsdom
/**
 * tests/components/admin/per-show-lifecycle.test.tsx
 * (consolidated-admin-show-page spec §4/§6 — Task 13 rebuild)
 *
 * Lifecycle presentation on the consolidated page. The old page's standalone
 * "lifecycle" section (archived-disclosure / held-disclosure banners + inline
 * Publish button) is gone by design (spec §6): the StatusStrip conveys the state
 * (archived badge / publish toggle) and the Overview rail section owns the
 * Archive / Unarchive controls + the inactive-share notice. This suite preserves
 * the load-bearing behaviors the old lifecycle test pinned that STILL exist:
 *   - the PublishedToggle enable/disable states across finalize-ownership (spec
 *     §3.2 / R3): held → OFF-enabled, publishing → OFF-disabled, live+finalize →
 *     ON-disabled, live → ON-enabled;
 *   - archived → Unarchive present, toggle absent; held/live → Archive present;
 *   - Publishing… (finalize-owned) → Archive SUPPRESSED (the show is immutable, spec §6),
 *     matching the old page whose lifecycle section only rendered for archived||held.
 *
 * The Archive-hidden-during-Publishing behavior (dropped in the Task 13 rebuild, restored
 * per the Task 13 review Finding 1) is owned by OverviewSection's `finalizeOwned` prop; the
 * strip toggle is independently frozen and the archive server action still refuses.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ShowReviewSnapshot } from "@/lib/admin/readShowReviewSnapshot";

const state = vi.hoisted(() => ({
  snapshot: null as ShowReviewSnapshot | null,
  finalizeOwned: false as boolean,
}));

vi.mock("@/components/admin/PerShowAlertSection", () => ({
  PerShowAlertSection: () => null,
  fetchPerShowAlerts: async () => [],
}));
vi.mock("@/app/admin/show/[slug]/CurrentShareLinkPanel", async () => {
  const React = await import("react");
  return {
    CurrentShareLinkPanel: () =>
      React.createElement("div", { "data-testid": "admin-current-share-link-panel" }),
  };
});
vi.mock("@/lib/auth/requireAdmin", () => ({ requireAdmin: async () => {} }));
vi.mock("@/lib/time/now", () => ({ nowDate: async () => new Date("2026-06-03T12:00:00.000Z") }));
vi.mock("@/lib/data/loadShowShareToken", () => ({
  loadShowShareToken: async () => ({ token: "tok-123", epoch: 7 }),
}));
vi.mock("@/lib/sync/feed/readShowChangeFeed", () => ({
  readShowChangeFeed: async () => ({ entries: [], truncated: false, totalShown: 0 }),
}));
vi.mock("@/lib/admin/loadIgnoredWarnings", () => ({
  loadIgnoredWarnings: async () => ({ kind: "ok", fingerprints: new Set<string>() }),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin/show/x",
}));
vi.mock("@/app/admin/show/[slug]/_actions", () => ({
  archiveShowAction: async () => ({ ok: true }),
  unarchiveShowAction: async () => undefined,
  setShowPublishedAction: async () => ({ ok: true }),
  mi11ApproveAction: async () => undefined,
  mi11RejectAction: async () => undefined,
  undoChangeAction: async () => undefined,
  acceptChangeAction: async () => undefined,
  acceptAllAction: async () => undefined,
}));

vi.mock("@/lib/admin/readShowReviewSnapshot", () => ({
  readShowReviewSnapshot: async () => ({ kind: "ok", snapshot: state.snapshot }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from() {
      const builder: Record<string, unknown> = {};
      const pass = () => builder;
      builder.select = pass;
      builder.eq = pass;
      builder.limit = pass;
      builder.maybeSingle = async () => ({ data: { id: "s1" }, error: null });
      return builder;
    },
    rpc: async (fn: string) =>
      fn === "readfinalizeowned_b2"
        ? { data: state.finalizeOwned, error: null }
        : { data: null, error: null },
  }),
}));

function snapshotFor(show: Partial<Record<string, unknown>>): ShowReviewSnapshot {
  return {
    show: {
      id: "s1",
      slug: "rpas",
      title: "RPAS Central",
      client_label: "Acme",
      client_contact: null,
      dates: {
        travelIn: "2026-06-14",
        set: null,
        showDays: ["2026-06-14"],
        travelOut: "2026-06-15",
      },
      venue: { name: "Hall A", address: "1 Main St" },
      event_details: null,
      agenda_links: [],
      coi_status: "received",
      diagrams: null,
      pull_sheet: [],
      source_anchors: {},
      drive_file_id: "d1",
      published: true,
      archived: false,
      picker_epoch: 7,
      last_synced_at: "2026-06-03T10:00:00.000Z",
      last_sync_status: "ok",
      ...show,
    },
    internal: {
      financials: null,
      parse_warnings: [],
      raw_unrecognized: null,
      run_of_show: {},
      use_raw_decisions: [],
      show_id: "s1",
    },
    crew_members: [],
    rooms: [],
    hotel_reservations: [],
    transportation: [],
    contacts: [],
  };
}

async function renderPage() {
  const mod = await import("@/app/admin/show/[slug]/page");
  const ui = await mod.default({
    params: Promise.resolve({ slug: "rpas" }),
    searchParams: Promise.resolve({}),
  });
  render(ui);
}

beforeEach(() => {
  state.snapshot = snapshotFor({});
  state.finalizeOwned = false;
});
afterEach(() => {
  cleanup();
  vi.resetModules();
});

describe("consolidated per-show lifecycle presentation (§4/§6)", () => {
  it("Archived: Unarchive present, strip archived badge, NO toggle, NO Archive", async () => {
    state.snapshot = snapshotFor({ published: false, archived: true });
    await renderPage();
    expect(screen.getByTestId("unarchive-show-button-s1")).toBeInTheDocument();
    expect(screen.getByTestId("strip-archived-badge")).toBeInTheDocument();
    expect(screen.queryByTestId("published-toggle")).toBeNull();
    expect(screen.queryByTestId("archive-show-button")).toBeNull();
  });

  it("Held (!published, !finalize): toggle OFF-enabled + Archive present, no Unarchive", async () => {
    state.snapshot = snapshotFor({ published: false, archived: false });
    state.finalizeOwned = false;
    await renderPage();
    const toggle = screen.getByTestId("published-toggle");
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(toggle.hasAttribute("disabled")).toBe(false);
    expect(screen.getByTestId("archive-show-button")).toBeInTheDocument();
    expect(screen.queryByTestId("unarchive-show-button-s1")).toBeNull();
  });

  it("Publishing… (!published + finalize-owned): toggle OFF-DISABLED + Archive SUPPRESSED", async () => {
    state.snapshot = snapshotFor({ published: false, archived: false });
    state.finalizeOwned = true;
    await renderPage();
    const toggle = screen.getByTestId("published-toggle");
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(toggle.hasAttribute("disabled")).toBe(true);
    // Restored (Task 13 review Finding 1): the show is immutable mid-publish, so the Archive
    // control is hidden — not archived, so no Unarchive either.
    expect(screen.queryByTestId("archive-show-button")).toBeNull();
    expect(screen.queryByTestId("unarchive-show-button-s1")).toBeNull();
  });

  it("Live + finalize-owned (pending-changes finalize, spec R3): toggle ON-DISABLED before any click", async () => {
    state.snapshot = snapshotFor({ published: true, archived: false });
    state.finalizeOwned = true;
    await renderPage();
    const toggle = screen.getByTestId("published-toggle");
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(toggle.hasAttribute("disabled")).toBe(true);
  });

  it("Live: Archive present, toggle ON-enabled", async () => {
    await renderPage();
    expect(screen.getByTestId("archive-show-button")).toBeInTheDocument();
    const toggle = screen.getByTestId("published-toggle");
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(toggle.hasAttribute("disabled")).toBe(false);
  });
});
