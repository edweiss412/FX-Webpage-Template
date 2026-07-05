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
      builder.not = pass;
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
    expect(line.textContent).toMatch(/1 removed section/);
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

  // ── full 22-code generalization (Task 3) ────────────────────────────────────

  it("renders the NEWLY-counted gap classes from a full-shape context (not just the original 3)", async () => {
    rows.value = [
      {
        id: "a5",
        code: "SHOW_FIRST_PUBLISHED",
        context: {
          sheet_name: "Acme",
          // classes with codes that did NOT exist in the pre-#289 3-key reader.
          data_gaps: { total: 3, classes: { UNKNOWN_FIELD: 2, SCHEDULE_TIME_UNPARSED: 1 } },
        },
        raised_at: "2026-06-23T10:00:00.000Z",
      },
    ];
    const { PerShowAlertSection } = await import("@/components/admin/PerShowAlertSection");
    render(await PerShowAlertSection({ showId: "s1", slug: "x" }));
    const line = screen.getByTestId("per-show-alert-data-gaps-a5");
    expect(line.textContent).toMatch(/2 unrecognized fields/);
    expect(line.textContent).toMatch(/1 unreadable schedule time/);
    expect(line.textContent).not.toMatch(/UNKNOWN_FIELD|SCHEDULE_TIME_UNPARSED/); // invariant 5
  });

  it("is backward-compatible with an OLD 3-key context (missing keys → 0, no crash, persisted total kept)", async () => {
    rows.value = [
      {
        id: "a6",
        code: "SHOW_FIRST_PUBLISHED",
        // exactly the shape #289 persisted — only 3 keys, no new codes present.
        context: {
          sheet_name: "Acme",
          data_gaps: {
            total: 3,
            classes: { FIELD_UNREADABLE: 2, UNKNOWN_SECTION_HEADER: 0, BLOCK_DISAPPEARED: 1 },
          },
        },
        raised_at: "2026-06-23T10:00:00.000Z",
      },
    ];
    const { PerShowAlertSection } = await import("@/components/admin/PerShowAlertSection");
    render(await PerShowAlertSection({ showId: "s1", slug: "x" }));
    const line = screen.getByTestId("per-show-alert-data-gaps-a6");
    expect(line.textContent).toMatch(/2 unreadable fields/);
    expect(line.textContent).toMatch(/1 removed section/);
  });

  it("bounds the sub-line to 4 classes + '+N more' via the shared cap helper", async () => {
    rows.value = [
      {
        id: "a7",
        code: "SHOW_FIRST_PUBLISHED",
        context: {
          sheet_name: "Acme",
          data_gaps: {
            total: 6,
            classes: {
              FIELD_UNREADABLE: 1,
              UNKNOWN_SECTION_HEADER: 1,
              BLOCK_DISAPPEARED: 1,
              UNKNOWN_FIELD: 1,
              SCHEDULE_TIME_UNPARSED: 1,
              UNKNOWN_ROLE_TOKEN: 1,
            },
          },
        },
        raised_at: "2026-06-23T10:00:00.000Z",
      },
    ];
    const { PerShowAlertSection } = await import("@/components/admin/PerShowAlertSection");
    render(await PerShowAlertSection({ showId: "s1", slug: "x" }));
    const line = screen.getByTestId("per-show-alert-data-gaps-a7");
    expect(line.textContent).toMatch(/\+2 more/); // 6 classes, cap 4 → +2 more
  });
});
