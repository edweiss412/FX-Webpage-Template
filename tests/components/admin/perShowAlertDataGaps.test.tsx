// @vitest-environment jsdom
/**
 * parse-data-quality-warnings Task 11 (§6.4) — a SHOW_FIRST_PUBLISHED per-show
 * alert renders a BESPOKE data-gaps sub-line listing the per-class breakdown
 * from context.data_gaps. NOT interpolated into the catalog dougFacing copy; the
 * digest is a sibling detail line (the failedKeys precedent). Other codes (and
 * SHOW_FIRST_PUBLISHED rows without data_gaps) render NO such line. Human labels
 * only — never the raw §12.4 code literal (invariant 5).
 */
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
vi.mock("@/lib/time/now", () => ({ nowDate: async () => new Date("2026-06-23T12:00:00.000Z") }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin/show/x",
}));

afterEach(() => {
  cleanup();
  vi.resetModules();
});

const dataGaps = {
  total: 3,
  classes: { FIELD_UNREADABLE: 2, UNKNOWN_SECTION_HEADER: 0, BLOCK_DISAPPEARED: 1 },
};

describe("PerShowAlertSection SHOW_FIRST_PUBLISHED data_gaps sub-line", () => {
  it("renders a bespoke data-gaps sub-line with the per-class breakdown from context.data_gaps", async () => {
    rows.value = [
      {
        id: "a1",
        code: "SHOW_FIRST_PUBLISHED",
        context: { sheet_name: "Acme", data_gaps: dataGaps },
        raised_at: "2026-06-23T10:00:00.000Z",
      },
    ];
    const { PerShowAlertSection } = await import("@/components/admin/PerShowAlertSection");
    render(await PerShowAlertSection({ showId: "s1", slug: "x" }));
    const line = screen.getByTestId("per-show-alert-data-gaps-a1");
    // Per-class breakdown derived from context.data_gaps (the data source).
    expect(line.textContent).toMatch(/2 unreadable fields/);
    expect(line.textContent).toMatch(/1 vanished block/);
    // The zero-count class is omitted.
    expect(line.textContent).not.toMatch(/unknown section/);
    // invariant 5: never the raw §12.4 code literal.
    expect(line.textContent).not.toMatch(/FIELD_UNREADABLE|BLOCK_DISAPPEARED/);
    // The bespoke line is NOT folded into the catalog dougFacing copy.
    expect(line.textContent).not.toContain("—");
  });

  it("renders NO data-gaps sub-line when the SHOW_FIRST_PUBLISHED row has no data_gaps", async () => {
    rows.value = [
      {
        id: "a2",
        code: "SHOW_FIRST_PUBLISHED",
        context: { sheet_name: "Acme" },
        raised_at: "2026-06-23T10:00:00.000Z",
      },
    ];
    const { PerShowAlertSection } = await import("@/components/admin/PerShowAlertSection");
    render(await PerShowAlertSection({ showId: "s1", slug: "x" }));
    expect(screen.queryByTestId("per-show-alert-data-gaps-a2")).toBeNull();
  });

  it("renders NO data-gaps sub-line for a different code even when data_gaps is present", async () => {
    rows.value = [
      {
        id: "a3",
        code: "SHEET_UNAVAILABLE",
        context: { sheet_name: "Acme", data_gaps: dataGaps },
        raised_at: "2026-06-23T10:00:00.000Z",
      },
    ];
    const { PerShowAlertSection } = await import("@/components/admin/PerShowAlertSection");
    render(await PerShowAlertSection({ showId: "s1", slug: "x" }));
    expect(screen.queryByTestId("per-show-alert-data-gaps-a3")).toBeNull();
  });

  it("renders NO data-gaps sub-line when data_gaps.total is 0", async () => {
    rows.value = [
      {
        id: "a4",
        code: "SHOW_FIRST_PUBLISHED",
        context: {
          sheet_name: "Acme",
          data_gaps: {
            total: 0,
            classes: { FIELD_UNREADABLE: 0, UNKNOWN_SECTION_HEADER: 0, BLOCK_DISAPPEARED: 0 },
          },
        },
        raised_at: "2026-06-23T10:00:00.000Z",
      },
    ];
    const { PerShowAlertSection } = await import("@/components/admin/PerShowAlertSection");
    render(await PerShowAlertSection({ showId: "s1", slug: "x" }));
    expect(screen.queryByTestId("per-show-alert-data-gaps-a4")).toBeNull();
  });
});
