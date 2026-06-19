// @vitest-environment jsdom
/**
 * tests/components/admin/undo-auto-publish-affordances.test.tsx (M12.13 Task 12)
 *
 * The FOOTER undo affordance render-iff condition (spec §6.4):
 *   Footer undo button | undoWindowOpen && published && !archived
 *
 * undoWindowOpen = expires_at != null && expires_at > now. Fixtures drive the
 * window state: a future `unpublish_token_expires_at` opens it; null/past closes
 * it. Post-undo (archived) the footer affordance is gone; the Re-sync-paused note
 * + archived affordances take over.
 *
 * NEGATIVE-REGRESSION (commit body): flipping any leg of the three-part gate makes
 * the footer render assertion fail — proving the condition is load-bearing.
 *
 * (The alert-row affordance is an async server component and is rendered directly
 * in undo-auto-publish-alert-row.test.tsx — async children don't resolve inside a
 * synchronous full-page jsdom render, which is why this file mocks
 * PerShowAlertSection to null, mirroring per-show-lifecycle.test.tsx.)
 *
 * Shared-component structural pin: both the footer and the alert section import
 * the SAME UndoAutoPublishButton (one component, two consumers — copy can't drift).
 */
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
vi.mock("@/lib/time/now", () => ({
  nowDate: async () => new Date("2026-06-12T12:00:00.000Z"),
}));
vi.mock("@/lib/data/loadShowShareToken", () => ({ loadShowShareToken: async () => "tok-123" }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin/show/x",
}));
vi.mock("@/app/admin/show/[slug]/_actions", () => ({
  archiveShowAction: async () => ({ ok: true }),
  publishShowAction: async () => ({ ok: true }),
  unarchiveShowAction: async () => undefined,
  mi11ApproveAction: async () => ({ ok: true }),
  mi11RejectAction: async () => ({ ok: true }),
  undoChangeAction: async () => ({ ok: true }),
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

const FUTURE = "2026-06-13T12:00:00.000Z"; // > now (2026-06-12T12:00)
const PAST = "2026-06-11T12:00:00.000Z"; // < now

const baseShow = {
  id: "s1",
  slug: "rpas",
  title: "RPAS Central",
  drive_file_id: "d1",
  published: true,
  archived: false,
  last_synced_at: "2026-06-12T10:00:00.000Z",
  last_sync_status: "ok",
  unpublish_token_expires_at: FUTURE,
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

describe("footer undo affordance render-iff (§6.4)", () => {
  it("renders when undoWindowOpen && published && !archived", async () => {
    await renderPage();
    expect(screen.getByTestId("undo-auto-publish-footer")).toBeInTheDocument();
  });

  it("NEGATIVE: closed window (null expires_at) → NO footer button", async () => {
    state.show = { ...baseShow, unpublish_token_expires_at: null };
    await renderPage();
    expect(screen.queryByTestId("undo-auto-publish-footer")).toBeNull();
  });

  it("NEGATIVE: closed window (past expires_at) → NO footer button", async () => {
    state.show = { ...baseShow, unpublish_token_expires_at: PAST };
    await renderPage();
    expect(screen.queryByTestId("undo-auto-publish-footer")).toBeNull();
  });

  it("NEGATIVE: archived (post-undo) → NO footer button; Re-sync-paused note shows", async () => {
    state.show = {
      ...baseShow,
      published: false,
      archived: true,
      unpublish_token_expires_at: null,
    };
    await renderPage();
    expect(screen.queryByTestId("undo-auto-publish-footer")).toBeNull();
    expect(screen.getByTestId("admin-show-resync-archived")).toBeInTheDocument();
  });

  it("NEGATIVE: held (!published) → NO footer button even with an open window", async () => {
    state.show = { ...baseShow, published: false, archived: false };
    await renderPage();
    expect(screen.queryByTestId("undo-auto-publish-footer")).toBeNull();
  });
});

describe("shared-component structural pin (§6.3)", () => {
  it("both the footer (page) and the alert section import the SAME UndoAutoPublishButton component", () => {
    const page = readFileSync(join(process.cwd(), "app/admin/show/[slug]/page.tsx"), "utf8");
    const section = readFileSync(
      join(process.cwd(), "components/admin/PerShowAlertSection.tsx"),
      "utf8",
    );
    const importRe =
      /UndoAutoPublishButton.*from\s+["']@\/components\/admin\/UndoAutoPublishButton["']/;
    expect(page).toMatch(importRe);
    expect(section).toMatch(importRe);
  });
});
