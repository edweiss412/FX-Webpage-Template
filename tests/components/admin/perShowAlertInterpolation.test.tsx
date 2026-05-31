// @vitest-environment jsdom
// M12.2 Phase A Task 8 (spec §7) — per-show alert copy must interpolate the
// alert's context (the carry-in `<sheet-name>` leak fix). Negative regression:
// with context.sheet_name populated, the rendered copy shows the real name and
// NEVER the literal `<sheet-name>` placeholder. (Stash the fix → this fails:
// the pre-fix safeDougFacing(code) called messageFor with no params.)
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const SHEET = "Validation — Normal day (R1)";

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
vi.mock("@/lib/time/now", () => ({ nowDate: async () => new Date("2026-06-03T12:00:00.000Z") }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin/show/x",
}));

afterEach(() => {
  cleanup();
  vi.resetModules();
});

describe("PerShowAlertSection <sheet-name> interpolation (§7)", () => {
  it("renders the real sheet name from context, not '<sheet-name>'", async () => {
    rows.value = [
      {
        id: "a1",
        code: "SHEET_UNAVAILABLE",
        context: { sheet_name: SHEET },
        raised_at: "2026-06-03T10:00:00.000Z",
      },
    ];
    const { PerShowAlertSection } = await import("@/components/admin/PerShowAlertSection");
    render(await PerShowAlertSection({ showId: "s1", slug: "x" }));
    const section = screen.getByTestId("per-show-alert-section");
    expect(section.textContent).toContain(SHEET);
    expect(section.textContent).not.toContain("<sheet-name>");
  });
});
