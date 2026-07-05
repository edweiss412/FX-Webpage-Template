// @vitest-environment jsdom
// spec §4.8 — inbox-routed sync-problem codes (SHEET_UNAVAILABLE /
// PARSE_ERROR_LAST_GOOD) render READ-ONLY on the per-show page: the copy stays,
// but the "Mark resolved" button is omitted (they auto-clear). A non-inbox
// per-show code still gets its resolve button.
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const rows = vi.hoisted(() => ({ value: [] as Array<Record<string, unknown>> }));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from() {
      const builder: Record<string, unknown> = {};
      const pass = () => builder;
      builder.select = pass;
      builder.eq = pass;
      builder.is = pass;
      builder.not = pass;
      builder.order = pass;
      (builder as { then: unknown }).then = (onf: (v: unknown) => unknown) =>
        onf({ data: rows.value, error: null });
      return builder;
    },
  }),
}));
vi.mock("@/lib/time/now", () => ({ nowDate: async () => new Date("2026-06-03T12:00:00.000Z") }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin/show/x",
}));

afterEach(() => {
  cleanup();
  vi.resetModules();
});

describe("PerShowAlertSection read-only for inbox-routed codes (§4.8)", () => {
  it("omits the resolve button + shows the auto-clear note for SHEET_UNAVAILABLE", async () => {
    rows.value = [
      {
        id: "a1",
        code: "SHEET_UNAVAILABLE",
        context: { sheet_name: "East Coast" },
        raised_at: "2026-06-03T10:00:00.000Z",
      },
    ];
    const { PerShowAlertSection } = await import("@/components/admin/PerShowAlertSection");
    render(await PerShowAlertSection({ showId: "s1", slug: "x" }));
    expect(screen.queryByTestId("per-show-alert-resolve-a1")).toBeNull();
    expect(screen.getByTestId("per-show-alert-autoclear-a1")).toBeInTheDocument();
    // The alert copy still renders (the show page is where the operator sees detail).
    expect(screen.getByTestId("per-show-alert-section").textContent).toContain("East Coast");
  });

  it("keeps the resolve button for a non-inbox per-show code (WATCH_CHANNEL_ORPHANED)", async () => {
    rows.value = [
      {
        id: "a2",
        code: "WATCH_CHANNEL_ORPHANED",
        context: {},
        raised_at: "2026-06-03T10:00:00.000Z",
      },
    ];
    const { PerShowAlertSection } = await import("@/components/admin/PerShowAlertSection");
    render(await PerShowAlertSection({ showId: "s1", slug: "x" }));
    expect(screen.getByTestId("per-show-alert-resolve-a2")).toBeInTheDocument();
    expect(screen.queryByTestId("per-show-alert-autoclear-a2")).toBeNull();
  });
});
