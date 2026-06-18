// @vitest-environment jsdom
// Task 8 (R5-HIGH-1): a TILE_PROJECTION_FETCH_FAILED per-show alert renders a
// curated "Failed sources:" detail line listing the domains from
// context.failedKeys — a fixed, server-curated domain vocabulary, NEVER the raw
// pg error text. Other codes (and rows without failedKeys) render NO such line.
// Negative regression: stash the render branch → the failedKeys line disappears
// and the "hotel, rooms" assertion fails.
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const rows = vi.hoisted(() => ({
  value: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from() {
      const builder: Record<string, unknown> = {};
      const pass = () => builder;
      builder.select = pass;
      builder.eq = pass;
      builder.is = pass;
      builder.order = pass;
      (builder as { then: unknown }).then = (onf: (v: unknown) => unknown) =>
        onf({ data: rows.value, error: null });
      return builder;
    },
  }),
}));
vi.mock("@/lib/time/now", () => ({ nowDate: async () => new Date("2026-06-18T12:00:00.000Z") }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin/show/x",
}));

afterEach(() => {
  cleanup();
  vi.resetModules();
});

describe("PerShowAlertSection TILE_PROJECTION_FETCH_FAILED failedKeys detail", () => {
  it("renders a 'Failed sources:' line listing the curated domains from context.failedKeys", async () => {
    rows.value = [
      {
        id: "a1",
        code: "TILE_PROJECTION_FETCH_FAILED",
        context: { sheet_name: "Acme", failedKeys: ["hotel", "rooms"] },
        raised_at: "2026-06-18T10:00:00.000Z",
      },
    ];
    const { PerShowAlertSection } = await import("@/components/admin/PerShowAlertSection");
    render(await PerShowAlertSection({ showId: "s1", slug: "x" }));
    const section = screen.getByTestId("per-show-alert-section");
    expect(section.textContent).toContain("Failed sources:");
    expect(section.textContent).toContain("hotel, rooms");
    // Never leak raw pg error text: the producer puts curated domain keys in
    // failedKeys, not the underlying error.message (which getShowForViewer
    // records separately in data.tileErrors values).
    expect(section.textContent).not.toContain("fetch failed");
    // No em-dash anywhere in the rendered alert copy (DESIGN.md §9).
    expect(section.textContent).not.toContain("—");
  });

  it("renders NO 'Failed sources:' line when the alert row has no failedKeys", async () => {
    rows.value = [
      {
        id: "a2",
        code: "TILE_PROJECTION_FETCH_FAILED",
        context: { sheet_name: "Acme" },
        raised_at: "2026-06-18T10:00:00.000Z",
      },
    ];
    const { PerShowAlertSection } = await import("@/components/admin/PerShowAlertSection");
    render(await PerShowAlertSection({ showId: "s1", slug: "x" }));
    const section = screen.getByTestId("per-show-alert-section");
    expect(section.textContent).not.toContain("Failed sources:");
  });

  it("renders NO 'Failed sources:' line for a different code even when failedKeys is present", async () => {
    rows.value = [
      {
        id: "a3",
        code: "SHEET_UNAVAILABLE",
        context: { sheet_name: "Acme", failedKeys: ["hotel", "rooms"] },
        raised_at: "2026-06-18T10:00:00.000Z",
      },
    ];
    const { PerShowAlertSection } = await import("@/components/admin/PerShowAlertSection");
    render(await PerShowAlertSection({ showId: "s1", slug: "x" }));
    const section = screen.getByTestId("per-show-alert-section");
    expect(section.textContent).not.toContain("Failed sources:");
  });
});
