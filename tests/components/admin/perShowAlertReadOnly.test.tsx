// @vitest-environment jsdom
// spec §4.8 + alert-resolve-truthing §4.2 — the per-show "Mark resolved" button is omitted for any
// auto-resolving code (a manual button would be a misleading no-op). Three cases:
//   - inbox-routed (SHEET_UNAVAILABLE / PARSE_ERROR_LAST_GOOD) → bespoke "sheet is back" note;
//   - other auto codes (e.g. SHOW_UNPUBLISHED) → generic auto-clear note;
//   - manual codes (e.g. LIVE_ROW_CONFLICT) → the resolve button stays.
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

describe("PerShowAlertSection read-only for auto-resolving codes (§4.8 / §4.2)", () => {
  it("inbox-routed SHEET_UNAVAILABLE → bespoke sheet-back note, no resolve button", async () => {
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
    const note = screen.getByTestId("per-show-alert-autoclear-a1");
    expect(note.textContent).toContain("sheet is back");
    // The alert copy still renders (the show page is where the operator sees detail).
    expect(screen.getByTestId("per-show-alert-section").textContent).toContain("East Coast");
  });

  it("non-inbox auto code SHOW_UNPUBLISHED → generic auto-clear note, no resolve button", async () => {
    rows.value = [
      {
        id: "a2",
        code: "SHOW_UNPUBLISHED",
        context: {},
        raised_at: "2026-06-03T10:00:00.000Z",
      },
    ];
    const { PerShowAlertSection } = await import("@/components/admin/PerShowAlertSection");
    render(await PerShowAlertSection({ showId: "s1", slug: "x" }));
    expect(screen.queryByTestId("per-show-alert-resolve-a2")).toBeNull();
    const note = screen.getByTestId("per-show-alert-autoclear-a2");
    expect(note.textContent).toMatch(/clears automatically/i);
    // Generic note — not the inbox-specific "sheet is back" copy.
    expect(note.textContent).not.toContain("sheet is back");
  });

  it("manual code LIVE_ROW_CONFLICT → resolve button stays, no auto-clear note", async () => {
    rows.value = [
      {
        id: "a3",
        code: "LIVE_ROW_CONFLICT",
        context: {},
        raised_at: "2026-06-03T10:00:00.000Z",
      },
    ];
    const { PerShowAlertSection } = await import("@/components/admin/PerShowAlertSection");
    render(await PerShowAlertSection({ showId: "s1", slug: "x" }));
    expect(screen.getByTestId("per-show-alert-resolve-a3")).toBeInTheDocument();
    expect(screen.queryByTestId("per-show-alert-autoclear-a3")).toBeNull();
  });
});
