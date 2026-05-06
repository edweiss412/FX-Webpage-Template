// @vitest-environment jsdom
/**
 * tests/components/AlertBanner.test.tsx (M5 §B Task 5.9 — Doug's portion)
 *
 * Pins the public contract of <AlertBanner> — the admin-surface banner that
 * surfaces the topmost unresolved row from `public.admin_alerts` via
 * <ErrorExplainer surface="admin" /> with helpfulContext enabled.
 *
 * Spec §4.6 (admin_alerts table) + §12.4 (catalog) + invariant 5
 * (no raw codes in user-visible UI).
 *
 * The banner is a Server Component; we exercise it in unit tests by mocking
 * `createSupabaseServerClient` so the .from('admin_alerts').select() chain
 * returns synthesized rows. The component is `async`, so each test awaits
 * the JSX before passing it to `render()`.
 *
 * Anti-tautology: every assertion compares rendered text against the literal
 * MESSAGE_CATALOG[code].dougFacing string from the catalog file, NOT the
 * `messageFor()` runtime call (which would just round-trip the production
 * code path and pass even if both sides drifted together).
 *
 * "No raw codes in DOM" contract (invariant 5): scan the rendered DOM for
 * any of the literal MessageCode strings. Assert ZERO matches outside of
 * `data-testid` attribute values. This is the §12.4 catalog's central
 * promise — admin-side or otherwise, raw codes never reach end-users.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { AlertBanner } from "@/components/admin/AlertBanner";
import { MESSAGE_CATALOG, type MessageCode } from "@/lib/messages/catalog";

// In-memory rows the mock supabase client returns. Each test mutates this.
// Mock shape mirrors the production SELECT exactly:
// `id, code, raised_at, show_id, shows(slug)`. Do NOT add fields the
// component doesn't select; mock drift hides production-side regressions.
type AlertRow = {
  id: string;
  code: string;
  raised_at: string;
  show_id: string | null;
  shows: { slug: string } | null;
};
const mockState = vi.hoisted(() => ({
  rows: [] as Array<{
    id: string;
    code: string;
    raised_at: string;
    show_id: string | null;
    shows: { slug: string } | null;
  }>,
}));

vi.mock("@/lib/supabase/server", () => {
  return {
    createSupabaseServerClient: async () => {
      // Build a chained mock that mirrors the call pattern:
      //   supabase
      //     .from('admin_alerts')
      //     .select('id, code, raised_at, show_id, shows(slug)')
      //     .is('resolved_at', null)
      //     .order('raised_at', { ascending: false })
      //     .limit(1)
      // and resolves to { data: AlertRow[], error: null }.
      const builder = {
        select: () => builder,
        is: () => builder,
        order: () => builder,
        limit: (n: number) => Promise.resolve({ data: mockState.rows.slice(0, n), error: null }),
      };
      return {
        from: () => builder,
      };
    },
  };
});

function setRows(rows: AlertRow[]) {
  // Order rows by raised_at DESC so .limit(1) returns the topmost.
  mockState.rows = [...rows].sort(
    (a, b) => new Date(b.raised_at).getTime() - new Date(a.raised_at).getTime(),
  );
}

describe("AlertBanner", () => {
  beforeEach(() => {
    mockState.rows = [];
  });
  afterEach(() => {
    cleanup();
  });

  test("renders nothing when no unresolved alerts (no DOM mount)", async () => {
    setRows([]);
    const { container } = render(await AlertBanner());
    expect(container.firstChild).toBeNull();
  });

  test("synthesized AMBIGUOUS_EMAIL_BINDING row → banner renders the dougFacing catalog text", async () => {
    setRows([
      {
        id: "alert-1",
        code: "AMBIGUOUS_EMAIL_BINDING",
        raised_at: "2026-05-04T10:00:00Z",
        show_id: "11111111-1111-4111-8111-111111111111",
        shows: { slug: "test-show" },
      },
    ]);
    const { getByTestId } = render(await AlertBanner());
    expect(getByTestId("error-explainer-message").textContent).toBe(
      MESSAGE_CATALOG.AMBIGUOUS_EMAIL_BINDING.dougFacing!,
    );
  });

  test("multiple unresolved alerts → banner renders only the most recent (topmost by raised_at DESC)", async () => {
    setRows([
      {
        id: "old",
        code: "GITHUB_BOT_LOGIN_MISSING",
        raised_at: "2026-05-01T00:00:00Z",
        show_id: null,
        shows: null,
      },
      {
        id: "new",
        code: "WATCH_CHANNEL_ORPHANED",
        raised_at: "2026-05-04T12:00:00Z",
        show_id: "11111111-1111-4111-8111-111111111111",
        shows: { slug: "test-show" },
      },
    ]);
    const { getByTestId, container } = render(await AlertBanner());
    expect(getByTestId("error-explainer-message").textContent).toBe(
      MESSAGE_CATALOG.WATCH_CHANNEL_ORPHANED.dougFacing!,
    );
    // Only ONE banner mounts.
    expect(container.querySelectorAll("[data-testid=admin-alert-banner]").length).toBe(1);
  });

  // Codes whose dougFacing copy the AlertBanner can display. Parameterized
  // so a future catalog tweak forces a test update for every code that the
  // banner is allowed to surface.
  const ADMIN_CODES = [
    "AMBIGUOUS_EMAIL_BINDING",
    "LEAKED_LINK_DETECTED",
    "WATCH_CHANNEL_ORPHANED",
    "WEBHOOK_TOKEN_INVALID",
    "REPORT_ORPHANED_LOST_LEASE",
    "GITHUB_BOT_LOGIN_MISSING",
    "REPORT_LEASE_THRASHING",
    "TILE_SERVER_RENDER_FAILED",
  ] as const satisfies readonly MessageCode[];

  for (const code of ADMIN_CODES) {
    test(`banner copy for code='${code}' equals MESSAGE_CATALOG[${code}].dougFacing (anti-tautology)`, async () => {
      setRows([
        {
          id: `alert-${code}`,
          code,
          raised_at: "2026-05-04T10:00:00Z",
          show_id: null,
          shows: null,
        },
      ]);
      const { getByTestId } = render(await AlertBanner());
      expect(getByTestId("error-explainer-message").textContent).toBe(
        MESSAGE_CATALOG[code].dougFacing!,
      );
    });
  }

  test("INVARIANT 5: no raw error codes in rendered DOM (outside data-testid attributes)", async () => {
    setRows([
      {
        id: "alert-1",
        code: "AMBIGUOUS_EMAIL_BINDING",
        raised_at: "2026-05-04T10:00:00Z",
        show_id: "11111111-1111-4111-8111-111111111111",
        shows: { slug: "test-show" },
      },
    ]);
    const { container } = render(await AlertBanner());

    // Strip data-testid attribute values so a `data-testid="admin-alert-banner"`
    // attribute does NOT count as a leaked code. We are looking for raw catalog
    // keys leaking into TEXT or other attributes.
    const stripped = container.innerHTML.replace(/data-testid="[^"]*"/g, "");

    // Walk every code in the catalog and assert NONE of them appear as a
    // standalone token (UPPER_SNAKE_CASE, 2+ underscored words). The
    // AlertBanner is allowed to surface dougFacing copy from the catalog,
    // but never the raw code key itself.
    const codes = Object.keys(MESSAGE_CATALOG);
    for (const code of codes) {
      // Match the bare token only when it appears as a word — bounded by
      // either non-identifier chars or string boundaries — so a substring
      // accidentally embedded inside English copy doesn't false-flag.
      const re = new RegExp(`\\b${code}\\b`);
      expect(
        re.test(stripped),
        `raw code '${code}' must not appear in the rendered DOM (invariant 5)`,
      ).toBe(false);
    }
  });

  test("renders the Resolve form (Server Action target) for a global alert", async () => {
    setRows([
      {
        id: "alert-with-resolve",
        code: "GITHUB_BOT_LOGIN_MISSING",
        raised_at: "2026-05-04T10:00:00Z",
        show_id: null,
        shows: null,
      },
    ]);
    const { getByTestId } = render(await AlertBanner());
    const button = getByTestId("admin-alert-resolve-button");
    expect(button).not.toBeNull();
    expect(button.tagName.toLowerCase()).toBe("button");
    // The hidden alert-id input pins which row the action resolves.
    const idInput = getByTestId("admin-alert-id-input") as HTMLInputElement;
    expect(idInput.value).toBe("alert-with-resolve");
  });

  test("per-show alert does not render inline Resolve and links to the show-scoped alert", async () => {
    setRows([
      {
        id: "per-show-alert",
        code: "AMBIGUOUS_EMAIL_BINDING",
        raised_at: "2026-05-04T10:00:00Z",
        show_id: "11111111-1111-4111-8111-111111111111",
        shows: { slug: "test-show" },
      },
    ]);

    const { getByTestId, queryByTestId } = render(await AlertBanner());

    expect(queryByTestId("admin-alert-resolve-button")).toBeNull();
    expect(queryByTestId("admin-alert-id-input")).toBeNull();
    const link = getByTestId("admin-alert-show-link") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/admin/show/test-show?alert_id=per-show-alert");
  });
});
