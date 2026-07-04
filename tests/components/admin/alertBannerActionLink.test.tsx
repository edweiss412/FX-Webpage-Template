// @vitest-environment jsdom
/**
 * AlertBanner renders the per-code action link for GLOBAL rows only
 * (spec §7.2, §8.4 — rendering-split rule, decision #3).
 * Failure modes caught: the LIVE_ROW_CONFLICT folder-fallback regression;
 * the split rule regressing (double navigation affordances on per-show
 * rows); a component path that bypasses resolveAlertAction and renders
 * context.orphan_url verbatim into href.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

vi.mock("@/lib/admin/alertCount", () => ({
  fetchUnresolvedAlertCount: async () => ({ kind: "ok", count: 1 }),
}));
vi.mock("@/lib/time/now", () => ({ nowDate: async () => new Date("2026-07-04T12:00:00.000Z") }));
// AlertBanner wraps rendered content in AlertBannerRouteBoundary, whose client
// hook calls useSearchParams() — the mock MUST provide it (the repo pattern,
// cf. tests/components/admin/AlertBannerRouteBoundary.test.tsx:10-14).
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(""),
}));

const rows = vi.hoisted(() => ({
  value: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => {
    const builder: Record<string, unknown> = {};
    const pass = () => builder;
    builder.select = pass;
    builder.is = pass;
    builder.not = pass;
    builder.order = pass;
    builder.limit = () => Promise.resolve({ data: rows.value, error: null });
    return { from: () => builder };
  },
}));

afterEach(() => {
  cleanup();
  vi.resetModules();
});

function globalRow(code: string, context: Record<string, unknown> | null) {
  return {
    id: "g1",
    code,
    raised_at: "2026-07-04T10:00:00.000Z",
    show_id: null,
    context,
    occurrence_count: 1,
    shows: null,
  };
}

async function renderBanner() {
  const { AlertBanner } = await import("@/components/admin/AlertBanner");
  return render(await AlertBanner());
}

describe("AlertBanner global action links", () => {
  it("global LIVE_ROW_CONFLICT with only folder_id renders the Drive-folder fallback link AND keeps the Mark-resolved form", async () => {
    const folder_id = "fold-9";
    rows.value = [globalRow("LIVE_ROW_CONFLICT", { folder_id })];
    const { getByTestId } = await renderBanner();
    const link = getByTestId("admin-alert-action-link");
    expect(link).toHaveAttribute(
      "href",
      `https://drive.google.com/drive/folders/${encodeURIComponent(folder_id)}`,
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link.textContent).toContain("Open Drive folder");
    // Spec §7.2: the link is a SIBLING BEFORE the Mark-resolved form — a
    // broken `actionLink ? <a> : <form>` implementation must fail here.
    const idInput = getByTestId("admin-alert-id-input");
    expect(idInput).toBeInTheDocument();
    expect(link.compareDocumentPosition(idInput) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("per-show row with a registered code renders Check it and NO action link (split rule)", async () => {
    rows.value = [
      {
        id: "p1",
        code: "PICKER_EPOCH_RESET",
        raised_at: "2026-07-04T10:00:00.000Z",
        show_id: "s1",
        context: { show_id: "s1" },
        occurrence_count: 1,
        shows: { slug: "east-coast" },
      },
    ];
    const { getByTestId, queryByTestId } = await renderBanner();
    expect(getByTestId("admin-alert-show-link")).toBeInTheDocument();
    expect(queryByTestId("admin-alert-action-link")).toBeNull();
  });

  it("global row with an unregistered code renders no action link", async () => {
    rows.value = [globalRow("GITHUB_BOT_LOGIN_MISSING", { reason: "x" })];
    const { queryByTestId } = await renderBanner();
    expect(queryByTestId("admin-alert-action-link")).toBeNull();
  });

  it("global WIZARD_SESSION_SUPERSEDED_RACE renders an INTERNAL link — no target/rel/icon", async () => {
    rows.value = [globalRow("WIZARD_SESSION_SUPERSEDED_RACE", { drive_file_id: "df-1" })];
    const { getByTestId } = await renderBanner();
    const link = getByTestId("admin-alert-action-link");
    expect(link).toHaveAttribute("href", "/admin/onboarding");
    // Spec §2 decision 4: internal links get NO external treatment — an
    // implementation that unconditionally adds target/_blank/↗ must fail here.
    expect(link).not.toHaveAttribute("target");
    expect(link).not.toHaveAttribute("rel");
    expect(link.textContent).toContain("Go to setup wizard");
    expect(link.textContent).not.toContain("↗");
  });

  it("global REPORT_ORPHANED_LOST_LEASE: valid URL renders verbatim; javascript: renders NO anchor", async () => {
    const orphan_url = "https://github.com/edweiss412/FX-Webpage-Template/issues/99";
    rows.value = [globalRow("REPORT_ORPHANED_LOST_LEASE", { orphan_url })];
    let result = await renderBanner();
    expect(result.getByTestId("admin-alert-action-link")).toHaveAttribute("href", orphan_url);
    // Resolve form coexists with the link (spec §7.2 sibling rule).
    expect(result.getByTestId("admin-alert-id-input")).toBeInTheDocument();
    cleanup();
    vi.resetModules();

    rows.value = [globalRow("REPORT_ORPHANED_LOST_LEASE", { orphan_url: "javascript:alert(1)" })];
    result = await renderBanner();
    expect(result.queryByTestId("admin-alert-action-link")).toBeNull();
    for (const a of Array.from(result.container.querySelectorAll("a"))) {
      expect(a.getAttribute("href") ?? "").not.toMatch(/^javascript:/);
    }
  });
});
