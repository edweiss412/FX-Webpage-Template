// @vitest-environment jsdom
/**
 * tests/components/admin/undo-auto-publish-alert-row.test.tsx (M12.13 Task 12)
 *
 * The SHOW_FIRST_PUBLISHED alert-row undo affordance (spec §6.3/§6.4):
 *   Alert-row undo action | undoWindowOpen, and ONLY on SHOW_FIRST_PUBLISHED rows
 *
 * PerShowAlertSection is an async server component, so it's awaited and its
 * returned element rendered directly (async children don't resolve in a
 * synchronous full-page jsdom render).
 *
 * NEGATIVE-REGRESSION (commit body): the action renders ONLY when BOTH the code
 * matches SHOW_FIRST_PUBLISHED AND the window is open. Flipping either leg drops
 * the action — a non-matching code (window open) and a matching code (window
 * closed) both render the row WITHOUT the undo action; the alert itself remains
 * as history.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const state = vi.hoisted(() => ({
  alerts: [] as Array<{ id: string; code: string; context: unknown; raised_at: string }>,
}));

vi.mock("@/lib/time/now", () => ({
  nowDate: async () => new Date("2026-06-12T12:00:00.000Z"),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin/show/rpas",
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from() {
      const builder: Record<string, unknown> = {};
      const pass = () => builder;
      builder.select = () => builder;
      builder.eq = pass;
      builder.is = pass;
      builder.order = () => ({
        then: (onf: (v: unknown) => unknown) => onf({ data: state.alerts, error: null }),
      });
      return builder;
    },
  }),
}));

const SHOW_FIRST_PUBLISHED_ROW = {
  id: "a1",
  code: "SHOW_FIRST_PUBLISHED",
  context: { sheet_name: "RPAS Central" },
  raised_at: "2026-06-12T11:00:00.000Z",
};

const noopUndo = async () => ({ outcome: "success" }) as const;

async function renderSection(props: { undoWindowOpen?: boolean; withAction?: boolean }) {
  const { PerShowAlertSection } = await import("@/components/admin/PerShowAlertSection");
  const ui = await PerShowAlertSection({
    showId: "s1",
    slug: "rpas",
    undoWindowOpen: props.undoWindowOpen ?? false,
    ...(props.withAction === false ? {} : { undoAutoPublishAction: noopUndo }),
  });
  render(ui);
}

beforeEach(() => {
  state.alerts = [SHOW_FIRST_PUBLISHED_ROW];
});
afterEach(() => {
  cleanup();
  vi.resetModules();
});

describe("alert-row undo affordance render-iff (§6.4)", () => {
  it("renders on a SHOW_FIRST_PUBLISHED row while the window is open", async () => {
    await renderSection({ undoWindowOpen: true });
    expect(screen.getByTestId("per-show-alert-section")).toBeInTheDocument();
    expect(screen.getByTestId("undo-auto-publish-alert")).toBeInTheDocument();
  });

  it("NEGATIVE: NOT rendered when the window is closed (alert remains as history)", async () => {
    await renderSection({ undoWindowOpen: false });
    expect(screen.getByTestId("per-show-alert-section")).toBeInTheDocument();
    expect(screen.queryByTestId("undo-auto-publish-alert")).toBeNull();
  });

  it("NEGATIVE: NOT rendered on a non-SHOW_FIRST_PUBLISHED row (window open)", async () => {
    state.alerts = [
      {
        id: "a2",
        code: "PARSE_WARNING_AMBIGUOUS_ROLE",
        context: {},
        raised_at: "2026-06-12T11:00:00.000Z",
      },
    ];
    await renderSection({ undoWindowOpen: true });
    expect(screen.getByTestId("per-show-alert-section")).toBeInTheDocument();
    expect(screen.queryByTestId("undo-auto-publish-alert")).toBeNull();
  });

  it("NEGATIVE: NOT rendered when no bound action is threaded (defensive)", async () => {
    await renderSection({ undoWindowOpen: true, withAction: false });
    expect(screen.queryByTestId("undo-auto-publish-alert")).toBeNull();
  });
});
