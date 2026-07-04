// @vitest-environment jsdom
// alert-audience-split Task 4 (AC c / spec §5): the per-show alert section
// EXCLUDES `audience: "health"` codes (they flow to the app-health indicator),
// but — unlike the banner/bell — does NOT exclude info-severity codes, so
// SHOW_FIRST_PUBLISHED keeps its existing per-show affordance. Unknown codes
// stay visible (exclusion, not allowlist) and never leak the raw code string.
//
// This mock HONORS the production `.not("code","in",(…))` filter (parsing the
// value list exactly like PostgREST) so the exclusion is load-bearing here —
// a non-filtering mock would render the health row and pass tautologically.
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

type Row = {
  id: string;
  code: string;
  context: Record<string, unknown> | null;
  raised_at: string;
  show_id: string;
  resolved_at: string | null;
};
const rows = vi.hoisted(() => ({ value: [] as Row[] }));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from() {
      const filters: Array<
        | { kind: "eq"; col: string; val: unknown }
        | { kind: "is"; col: string; val: null }
        | { kind: "not_in"; col: string; vals: string[] }
      > = [];
      const builder: Record<string, unknown> = {};
      builder.select = () => builder;
      builder.eq = (col: string, val: unknown) => {
        filters.push({ kind: "eq", col, val });
        return builder;
      };
      builder.is = (col: string, val: null) => {
        filters.push({ kind: "is", col, val });
        return builder;
      };
      builder.not = (col: string, _op: string, list: string) => {
        const vals = list
          .replace(/^\(/, "")
          .replace(/\)$/, "")
          .split(",")
          .map((v) => v.trim().replace(/^"/, "").replace(/"$/, ""))
          .filter(Boolean);
        filters.push({ kind: "not_in", col, vals });
        return builder;
      };
      builder.order = () => {
        const out = rows.value.filter((r) =>
          filters.every((f) => {
            const cell = (r as unknown as Record<string, unknown>)[f.col];
            if (f.kind === "eq") return cell === f.val;
            if (f.kind === "is") return cell === null;
            return typeof cell === "string" ? !f.vals.includes(cell) : true;
          }),
        );
        return Promise.resolve({ data: out, error: null });
      };
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

describe("PerShowAlertSection audience exclusion (Task 4)", () => {
  it("filters health codes out, keeps info + doug + unknown, and never leaks a raw code", async () => {
    rows.value = [
      {
        id: "h1",
        code: "TILE_PROJECTION_FETCH_FAILED", // audience:health → EXCLUDED
        context: { failedKeys: ["hotel"] },
        raised_at: "2026-06-18T11:00:00.000Z",
        show_id: "s1",
        resolved_at: null,
      },
      {
        id: "i1",
        code: "SHOW_FIRST_PUBLISHED", // info, NON-health → kept (per-show keeps info)
        context: null,
        raised_at: "2026-06-18T10:30:00.000Z",
        show_id: "s1",
        resolved_at: null,
      },
      {
        id: "d1",
        code: "AMBIGUOUS_EMAIL_BINDING", // audience:doug → kept
        context: null,
        raised_at: "2026-06-18T10:00:00.000Z",
        show_id: "s1",
        resolved_at: null,
      },
      {
        id: "u1",
        code: "TOTALLY_UNKNOWN_CODE", // uncataloged → kept (exclusion, not allowlist)
        context: null,
        raised_at: "2026-06-18T09:30:00.000Z",
        show_id: "s1",
        resolved_at: null,
      },
    ];
    const { PerShowAlertSection } = await import("@/components/admin/PerShowAlertSection");
    render(await PerShowAlertSection({ showId: "s1", slug: "x" }));

    // Health code is filtered out.
    expect(screen.queryByTestId("per-show-alert-h1")).toBeNull();
    // Info + doug + unknown all survive.
    expect(screen.getByTestId("per-show-alert-i1")).toBeTruthy();
    expect(screen.getByTestId("per-show-alert-d1")).toBeTruthy();
    expect(screen.getByTestId("per-show-alert-u1")).toBeTruthy();
    // Heading count reflects the 3 kept rows (health excluded).
    const section = screen.getByTestId("per-show-alert-section");
    expect(section.textContent).toContain("Alerts for this show (3)");

    // invariant 5 / AC7: neither the excluded health code nor the unknown code
    // leaks its raw code string into the DOM (strip data-testid values first).
    const stripped = section.innerHTML.replace(/data-testid="[^"]*"/g, "");
    expect(stripped).not.toContain("TOTALLY_UNKNOWN_CODE");
    expect(stripped).not.toContain("TILE_PROJECTION_FETCH_FAILED");
  });
});
