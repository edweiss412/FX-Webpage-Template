// @vitest-environment jsdom
/**
 * Per-show alert rows render a "Learn more" help wayfinding link (impeccable
 * critique P1, alert-copy full-sweep). Longform education for a code now
 * lives at /help/errors#<CODE> (or the PARSE_ERROR_LAST_GOOD carve-out at
 * /help/admin/parse-warnings#PARSE_ERROR_LAST_GOOD), but rows had no route
 * to it. Rendered after the existing per-code action link, low-emphasis so
 * it never competes with the row's real actions.
 *
 * Anti-tautology: every href assertion is derived from the catalog's own
 * `helpHref` field, and the absence case uses a real cataloged code whose
 * `helpHref` is null (GOOGLE_NO_CREW_MATCH) rather than an uncataloged code,
 * so a broken catalog-membership guard can't accidentally pass.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MESSAGE_CATALOG, type MessageCode } from "@/lib/messages/catalog";

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
vi.mock("@/lib/time/now", () => ({ nowDate: async () => new Date("2026-07-04T12:00:00.000Z") }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin/show/east-coast",
}));

afterEach(() => {
  cleanup();
  vi.resetModules();
});

async function renderSection(slug = "east-coast") {
  const { PerShowAlertSection } = await import("@/components/admin/PerShowAlertSection");
  render(await PerShowAlertSection({ showId: "s1", slug }));
}

const HELP_CODE: MessageCode = "AMBIGUOUS_EMAIL_BINDING";
const NO_HELP_CODE: MessageCode = "GOOGLE_NO_CREW_MATCH";
const CARVEOUT_CODE: MessageCode = "PARSE_ERROR_LAST_GOOD";

describe("PerShowAlertSection — Learn more help link (impeccable P1)", () => {
  it("renders when the code's catalog helpHref is non-null, with the exact href + 'Learn more' text, as an internal (non-target) link", async () => {
    rows.value = [
      {
        id: "a1",
        code: HELP_CODE,
        context: null,
        raised_at: "2026-07-04T10:00:00.000Z",
      },
    ];
    await renderSection();
    const row = screen.getByTestId("per-show-alert-a1");
    const link = within(row).getByTestId("per-show-alert-help-link-a1");
    expect(link).toHaveAttribute("href", MESSAGE_CATALOG[HELP_CODE].helpHref as string);
    expect(link.textContent).toBe("Learn more");
    expect(link.tagName).toBe("A");
    expect(link).not.toHaveAttribute("target");
  });

  it("is absent when the code's catalog helpHref is null", async () => {
    rows.value = [
      {
        id: "a2",
        code: NO_HELP_CODE,
        context: null,
        raised_at: "2026-07-04T10:00:00.000Z",
      },
    ];
    await renderSection();
    const row = screen.getByTestId("per-show-alert-a2");
    expect(within(row).queryByTestId("per-show-alert-help-link-a2")).toBeNull();
  });

  it("PARSE_ERROR_LAST_GOOD carve-out: links to /help/admin/parse-warnings, link text still 'Learn more'", async () => {
    rows.value = [
      {
        id: "a3",
        code: CARVEOUT_CODE,
        context: { sheet_name: "Acme" },
        raised_at: "2026-07-04T10:00:00.000Z",
      },
    ];
    await renderSection();
    const row = screen.getByTestId("per-show-alert-a3");
    const link = within(row).getByTestId("per-show-alert-help-link-a3");
    expect(link).toHaveAttribute("href", "/help/admin/parse-warnings#PARSE_ERROR_LAST_GOOD");
    expect(link.textContent).toBe("Learn more");
  });
});
