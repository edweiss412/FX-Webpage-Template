// @vitest-environment jsdom
/**
 * tests/components/admin/per-show-lifecycle.test.tsx (M12.2 Phase B2 Task 7.3)
 *
 * Per-show page lifecycle presentation (spec §2.2–§2.4):
 *   - Archived show: persistent disclosure ("This show is archived. Crew links
 *     are dead. Unarchive and re-publish to bring it back.") + a one-tap
 *     Unarchive button; ParsePanel read-only; NO Archive/Publish.
 *   - Held show (!published && !archived && !finalize-owned): disclosure
 *     ("Held — not published. Publish to make it live, then issue a crew
 *     link.") + a one-tap Publish button + the Archive button.
 *   - Publishing… (finalize-owned): no Held disclosure, no Publish/Unarchive,
 *     no Archive (mid-publish).
 *
 * Full async-page render with the data layer + finalize-owned RPC mocked,
 * mirroring perShowPage.test.tsx.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const state = vi.hoisted(() => ({
  show: {} as Record<string, unknown>,
  finalizeOwned: false as boolean,
}));

vi.mock("@/components/admin/PerShowAlertSection", () => ({ PerShowAlertSection: () => null }));
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
vi.mock("@/lib/data/loadShowShareToken", () => ({ loadShowShareToken: async () => "tok-123" }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin/show/x",
}));
// The server actions are bound in the page; stub them so the bind() target exists.
vi.mock("@/app/admin/show/[slug]/_actions", () => ({
  archiveShowAction: async () => ({ ok: true }),
  publishShowAction: async () => ({ ok: true }),
  unarchiveShowAction: async () => undefined,
  // M12.13 — the page binds undoAutoPublishAction for the footer + alert section.
  undoAutoPublishAction: async () => ({ outcome: "success" }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from(table: string) {
      const builder: Record<string, unknown> = {};
      const pass = () => builder;
      builder.select = () => builder;
      builder.eq = pass;
      builder.is = pass;
      builder.order = pass;
      builder.returns = pass;
      builder.maybeSingle = async () => ({
        data: table === "shows" ? state.show : null,
        error: null,
      });
      (builder as { then: unknown }).then = (onf: (v: unknown) => unknown) =>
        onf({ data: [], error: null });
      return builder;
    },
    rpc: async (fn: string) =>
      fn === "readfinalizeowned_b2"
        ? { data: state.finalizeOwned, error: null }
        : { data: null, error: null },
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
  state.finalizeOwned = false;
});
afterEach(() => {
  cleanup();
  vi.resetModules();
});

describe("per-show lifecycle presentation (§2.2–§2.4)", () => {
  it("Archived: persistent disclosure + one-tap Unarchive; NO Archive/Publish", async () => {
    state.show = { ...baseShow, published: false, archived: true };
    await renderPage();
    const disclosure = screen.getByTestId("archived-disclosure");
    expect(disclosure.textContent).toContain(
      "This show is archived. Crew links are dead. Unarchive and re-publish to bring it back.",
    );
    expect(screen.getByTestId("unarchive-show-button-s1")).toBeInTheDocument();
    expect(screen.queryByTestId("archive-show-button")).toBeNull();
    expect(screen.queryByTestId("publish-show-button")).toBeNull();
  });

  it("Held: disclosure + one-tap Publish + Archive button", async () => {
    state.show = { ...baseShow, published: false, archived: false };
    state.finalizeOwned = false;
    await renderPage();
    const disclosure = screen.getByTestId("held-disclosure");
    expect(disclosure.textContent).toContain(
      "Held — not published. Publish to make it live, then issue a crew link.",
    );
    expect(screen.getByTestId("publish-show-button")).toBeInTheDocument();
    expect(screen.getByTestId("archive-show-button")).toBeInTheDocument();
    expect(screen.queryByTestId("archived-disclosure")).toBeNull();
  });

  it("Publishing… (finalize-owned): no Held disclosure, no Publish/Unarchive/Archive", async () => {
    state.show = { ...baseShow, published: false, archived: false };
    state.finalizeOwned = true;
    await renderPage();
    expect(screen.queryByTestId("held-disclosure")).toBeNull();
    expect(screen.queryByTestId("publish-show-button")).toBeNull();
    expect(screen.queryByTestId("archive-show-button")).toBeNull();
    expect(screen.queryByTestId("unarchive-show-button-s1")).toBeNull();
  });

  it("Live: Archive button present, no Held/Archived disclosures, no Publish", async () => {
    await renderPage();
    expect(screen.getByTestId("archive-show-button")).toBeInTheDocument();
    expect(screen.queryByTestId("held-disclosure")).toBeNull();
    expect(screen.queryByTestId("archived-disclosure")).toBeNull();
    expect(screen.queryByTestId("publish-show-button")).toBeNull();
  });
});
