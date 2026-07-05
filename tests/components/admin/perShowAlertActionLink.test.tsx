// @vitest-environment jsdom
/**
 * Per-show alert rows render the per-code action link (spec §7.1, §8.3).
 * Failure modes caught: missing/wrong href from a context refactor; the
 * external target/rel treatment dropped; a link rendering despite a failed
 * guard (incl. the javascript: orphan_url case asserted against the DOM —
 * catches a component path that bypasses resolveAlertAction).
 * Anti-tautology: every query is scoped WITHIN the row's own testid subtree
 * and every expected href is derived from the fixture's field values.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

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

describe("PerShowAlertSection action links", () => {
  it("ROLE_FLAGS_NOTICE with drive_file_id renders an external sheet link", async () => {
    const drive_file_id = "df-123";
    rows.value = [
      {
        id: "a1",
        code: "ROLE_FLAGS_NOTICE",
        context: { drive_file_id, changes: [] },
        raised_at: "2026-07-04T10:00:00.000Z",
      },
    ];
    await renderSection();
    const row = screen.getByTestId("per-show-alert-a1");
    const link = within(row).getByTestId("per-show-alert-action-a1");
    expect(link).toHaveAttribute(
      "href",
      `https://docs.google.com/spreadsheets/d/${drive_file_id}/edit#gid=0`,
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link.textContent).toContain("Open in Sheet");
  });

  it("ROLE_FLAGS_NOTICE without drive_file_id renders no action link", async () => {
    rows.value = [
      {
        id: "a2",
        code: "ROLE_FLAGS_NOTICE",
        context: { changes: [] },
        raised_at: "2026-07-04T10:00:00.000Z",
      },
    ];
    await renderSection();
    const row = screen.getByTestId("per-show-alert-a2");
    expect(within(row).queryByTestId("per-show-alert-action-a2")).toBeNull();
  });

  it("SHOW_FIRST_PUBLISHED renders the internal share-access fragment link (no target)", async () => {
    const slug = "east-coast";
    rows.value = [
      {
        id: "a3",
        code: "SHOW_FIRST_PUBLISHED",
        context: { sheet_name: "Acme" },
        raised_at: "2026-07-04T10:00:00.000Z",
      },
    ];
    await renderSection(slug);
    const row = screen.getByTestId("per-show-alert-a3");
    const link = within(row).getByTestId("per-show-alert-action-a3");
    expect(link).toHaveAttribute("href", `/admin/show/${encodeURIComponent(slug)}#share-access`);
    expect(link).not.toHaveAttribute("target");
    expect(link.textContent).toContain("Go to Published toggle");
  });

  it("show-scoped REPORT_ORPHANED_LOST_LEASE renders the GitHub link; javascript: URL renders nothing", async () => {
    const orphan_url = "https://github.com/edweiss412/FX-Webpage-Template/issues/99";
    rows.value = [
      {
        id: "a4",
        code: "REPORT_ORPHANED_LOST_LEASE",
        context: { orphan_url },
        raised_at: "2026-07-04T10:00:00.000Z",
      },
    ];
    await renderSection();
    const good = screen.getByTestId("per-show-alert-a4");
    expect(within(good).getByTestId("per-show-alert-action-a4")).toHaveAttribute(
      "href",
      orphan_url,
    );
    cleanup();
    vi.resetModules();

    rows.value = [
      {
        id: "a5",
        code: "REPORT_ORPHANED_LOST_LEASE",
        context: { orphan_url: "javascript:alert(1)" },
        raised_at: "2026-07-04T10:00:00.000Z",
      },
    ];
    await renderSection();
    const bad = screen.getByTestId("per-show-alert-a5");
    expect(within(bad).queryByTestId("per-show-alert-action-a5")).toBeNull();
    // Belt-and-suspenders against ANY sibling path rendering the raw URL:
    for (const a of Array.from(bad.querySelectorAll("a"))) {
      expect(a.getAttribute("href") ?? "").not.toMatch(/^javascript:/);
    }
  });
});
