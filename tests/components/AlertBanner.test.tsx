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
  /** Test fixture optional — defaults to null in setRows. Real row is required. */
  context?: Record<string, unknown> | null;
  shows: { slug: string } | null;
  /**
   * C4 R2 fix: model `resolved_at` so the mock can prove the production
   * `.is("resolved_at", null)` filter is load-bearing. Defaults to `null`
   * in setRows() (i.e., unresolved). Set to an ISO string to mark the row
   * resolved — it must be excluded from BOTH the data SELECT and the
   * count probe.
   */
  resolved_at?: string | null;
};
const mockState = vi.hoisted(() => ({
  rows: [] as Array<{
    id: string;
    code: string;
    raised_at: string;
    show_id: string | null;
    context: Record<string, unknown> | null;
    shows: { slug: string } | null;
    resolved_at: string | null;
  }>,
}));

vi.mock("@/lib/supabase/server", () => {
  return {
    createSupabaseServerClient: async () => {
      // Build a chained mock that mirrors TWO production call patterns:
      //   1. data probe (awaited via .order().limit(1)):
      //      .from('admin_alerts').select('id, code, raised_at, ...').is(...)
      //      .not(...).order(...).limit(1)
      //   2. count probe (M9 C4 / R0 — awaited directly off the builder):
      //      .from('admin_alerts').select('id', { count: 'exact', head: true })
      //      .is(...).not(...)
      //
      // The mock honors the .not() filter chain for both — info-severity
      // rows that sit at the top must be excluded from BOTH the .limit(1)
      // payload AND the count probe, matching real PostgREST semantics.
      // `from()` returns a fresh builder per call so the count probe's
      // filters don't leak into the data probe (and vice versa).
      function createBuilder() {
        const filters: Array<
          | { kind: "not_in"; column: string; values: string[] }
          | { kind: "is"; column: string; value: null | boolean }
        > = [];
        let countMode = false;
        const apply = () => {
          let rows: typeof mockState.rows = mockState.rows;
          for (const f of filters) {
            if (f.kind === "not_in") {
              rows = rows.filter((row) => {
                const cell = (row as unknown as Record<string, unknown>)[f.column];
                return typeof cell === "string" ? !f.values.includes(cell) : true;
              });
            } else if (f.kind === "is") {
              // C4 R2 fix: honor `.is(column, null)` so the
              // production `resolved_at IS NULL` filter is load-bearing
              // in tests. Without this, dropping the .is() call from
              // either the data SELECT or count probe would still pass.
              rows = rows.filter((row) => {
                const cell = (row as unknown as Record<string, unknown>)[f.column];
                if (f.value === null) return cell === null;
                return cell === f.value;
              });
            }
          }
          return rows;
        };
        const builder = {
          select: (
            _columns?: string,
            options?: { count?: "exact" | "planned" | "estimated"; head?: boolean },
          ) => {
            if (options?.count === "exact" && options.head === true) countMode = true;
            return builder;
          },
          is: (column: string, value: null | boolean) => {
            filters.push({ kind: "is", column, value });
            return builder;
          },
          not: (column: string, op: string, valueList: string) => {
            if (op === "in") {
              const inner = valueList.replace(/^\(/, "").replace(/\)$/, "");
              const values = inner
                .split(",")
                .map((v) => v.trim().replace(/^"/, "").replace(/"$/, ""))
                .filter(Boolean);
              filters.push({ kind: "not_in", column, values });
            }
            return builder;
          },
          order: () => builder,
          limit: (n: number) => Promise.resolve({ data: apply().slice(0, n), error: null }),
          // Awaiting the builder (no .order().limit()) returns the count
          // probe shape. Required for the M9 C4 queue-depth chip path.
          then: (onFulfilled: (value: { data: null; error: null; count: number }) => void) => {
            if (countMode) {
              return Promise.resolve({ data: null, error: null, count: apply().length }).then(
                onFulfilled,
              );
            }
            return Promise.resolve({ data: apply(), error: null }).then(
              onFulfilled as unknown as (v: { data: typeof mockState.rows; error: null }) => void,
            );
          },
        };
        return builder;
      }
      return {
        from: () => createBuilder(),
      };
    },
  };
});

function setRows(rows: AlertRow[]) {
  // Order rows by raised_at DESC so .limit(1) returns the topmost.
  // Normalize the optional `context` to `null` so the mock matches the
  // production AlertBanner SELECT shape ({ context: Record<string, unknown>
  // | null } is required on the production row).
  mockState.rows = [...rows]
    .map((r) => ({ ...r, context: r.context ?? null, resolved_at: r.resolved_at ?? null }))
    .sort((a, b) => new Date(b.raised_at).getTime() - new Date(a.raised_at).getTime());
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

  test("info-severity codes (e.g., ROLE_FLAGS_NOTICE) are excluded; banner falls through to the next non-info row", async () => {
    setRows([
      {
        id: "info-row-newest",
        code: "ROLE_FLAGS_NOTICE",
        raised_at: "2026-05-09T12:00:00Z",
        show_id: null,
        shows: null,
      },
      {
        id: "warning-row-older",
        code: "WATCH_CHANNEL_ORPHANED",
        raised_at: "2026-05-04T00:00:00Z",
        show_id: "11111111-1111-4111-8111-111111111111",
        shows: { slug: "test-show" },
      },
    ]);
    const { getByTestId, container } = render(await AlertBanner());
    expect(getByTestId("error-explainer-message").textContent).toBe(
      MESSAGE_CATALOG.WATCH_CHANNEL_ORPHANED.dougFacing!,
    );
    expect(container.querySelector('[data-alert-id="info-row-newest"]')).toBeNull();
  });

  test("only an info-severity row exists → banner renders nothing", async () => {
    setRows([
      {
        id: "only-info",
        code: "ROLE_FLAGS_NOTICE",
        raised_at: "2026-05-09T12:00:00Z",
        show_id: null,
        shows: null,
      },
    ]);
    const { container } = render(await AlertBanner());
    expect(container.firstChild).toBeNull();
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

  // C0 round-6 M1: prove that AlertBanner threads admin_alerts.context
  // through ErrorExplainer's `params` so renderer interpolation
  // substitutes <placeholder> tokens (e.g., <sheet-name> for
  // TILE_SERVER_RENDER_FAILED). Without this assertion, the R5 plumbing
  // could regress without any test failing — the catalog interpolation
  // unit test only exercises messageFor directly.
  test("AlertBanner threads admin_alerts.context through ErrorExplainer for placeholder substitution", async () => {
    setRows([
      {
        id: "tile-failed-1",
        code: "TILE_SERVER_RENDER_FAILED",
        raised_at: "2026-05-04T11:00:00Z",
        show_id: "11111111-1111-4111-8111-111111111111",
        context: { tileId: "lodging-tile", message: "boom", sheet_name: "Spring Conference" },
        shows: { slug: "spring-conference" },
      },
    ]);
    const { getByTestId } = render(await AlertBanner());
    const text = getByTestId("error-explainer-message").textContent ?? "";
    // Producer's sheet_name should have replaced the <sheet-name>
    // placeholder via hyphen↔underscore key normalization.
    expect(text).toContain("Spring Conference");
    expect(text).not.toContain("<sheet-name>");
  });

  test("AlertBanner leaves <sheet-name> intact when context is null (no plumbing regression)", async () => {
    setRows([
      {
        id: "tile-failed-no-ctx",
        code: "TILE_SERVER_RENDER_FAILED",
        raised_at: "2026-05-04T12:00:00Z",
        show_id: "11111111-1111-4111-8111-111111111111",
        context: null,
        shows: { slug: "test-show" },
      },
    ]);
    const { getByTestId } = render(await AlertBanner());
    const text = getByTestId("error-explainer-message").textContent ?? "";
    expect(text).toContain("<sheet-name>"); // placeholder remains
  });

  test("M9 C4 / M5-D3: renders raised_at relative time + absolute tooltip", async () => {
    setRows([
      {
        id: "alert-with-time",
        code: "GITHUB_BOT_LOGIN_MISSING",
        raised_at: "2026-05-15T11:46:00Z", // 14 minutes before mock now
        show_id: null,
        shows: null,
      },
    ]);
    // Use fake timers so `new Date()` inside the component returns a
    // stable wall clock; raisedAtSuffix consumes the Date directly so
    // spying on Date.now alone is not sufficient.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 4, 15, 12, 0, 0)));
    try {
      const { getByTestId } = render(await AlertBanner());
      const raised = getByTestId("admin-alert-raised-at");
      // Anti-tautology: assert against the LITERAL string "Raised 14
      // minutes ago" (not a computed value), so a regression in either
      // raisedAtSuffix or the wrapping copy fails the test.
      expect(raised.textContent?.replace(/\s+/g, " ").trim()).toBe("Raised 14 minutes ago");
      const time = raised.querySelector("time");
      expect(time?.getAttribute("datetime")).toBe("2026-05-15T11:46:00Z");
      // Absolute tooltip on the <time> title for hover/long-press.
      expect(time?.getAttribute("title")).toMatch(/May 15.*2026/);
    } finally {
      vi.useRealTimers();
    }
  });

  test("M9 C4 / M5-D3: renders +N more chip when 2+ unresolved alerts queued", async () => {
    setRows([
      {
        id: "top",
        code: "GITHUB_BOT_LOGIN_MISSING",
        raised_at: "2026-05-15T10:00:00Z",
        show_id: null,
        shows: null,
      },
      {
        id: "queued-1",
        code: "GITHUB_BOT_LOGIN_MISSING",
        raised_at: "2026-05-15T09:00:00Z",
        show_id: null,
        shows: null,
      },
      {
        id: "queued-2",
        code: "GITHUB_BOT_LOGIN_MISSING",
        raised_at: "2026-05-15T08:00:00Z",
        show_id: null,
        shows: null,
      },
      {
        id: "queued-3",
        code: "GITHUB_BOT_LOGIN_MISSING",
        raised_at: "2026-05-15T07:00:00Z",
        show_id: null,
        shows: null,
      },
    ]);
    const { getByTestId } = render(await AlertBanner());
    const chip = getByTestId("admin-alert-queue-chip");
    // Anti-tautology: literal "+3 more ▸" — derived from fixture (4
    // total, 1 shown, 3 queued).
    expect(chip.textContent?.trim()).toBe("+3 more ▸");
    // ARIA label for screen readers per brief §5.3.
    expect(chip.getAttribute("aria-label")).toBe("View 3 more unresolved alerts");
    // M9 final-review R15: chip href targets /admin (the
    // production-safe landing). R13 retargeted to /admin/dev but R15
    // caught that /admin/dev is build-gated out of prod, so /admin
    // (which now exists at app/admin/page.tsx, added in R15) is the
    // always-built target. #alerts anchor scrolls to the layout
    // AlertBanner that renders above the admin landing.
    expect(chip.getAttribute("href")).toBe("/admin#alerts");
  });

  test("R15 fix: queue chip href target is the production-safe /admin landing", async () => {
    const { existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    // Compile-time route-reachability check. R15 added the always-
    // built /admin landing at app/admin/page.tsx.
    expect(existsSync(join(process.cwd(), "app/admin/page.tsx"))).toBe(true);
  });

  test("M9 C4 R2: resolved rows are excluded from BOTH top-alert SELECT and queue-depth count", async () => {
    // Brief §5.3 + AGENTS.md invariant: production filter is
    // `resolved_at IS NULL` on both chains. This test pins it: a
    // fixture with two unresolved rows + one resolved row must render
    // the top unresolved row and a "+1 more ▸" chip (NOT "+2 more ▸").
    setRows([
      {
        id: "unresolved-top",
        code: "GITHUB_BOT_LOGIN_MISSING",
        raised_at: "2026-05-15T10:00:00Z",
        show_id: null,
        shows: null,
        // resolved_at omitted → null (unresolved)
      },
      {
        id: "unresolved-queued",
        code: "GITHUB_BOT_LOGIN_MISSING",
        raised_at: "2026-05-15T09:00:00Z",
        show_id: null,
        shows: null,
      },
      {
        id: "RESOLVED-row",
        code: "GITHUB_BOT_LOGIN_MISSING",
        raised_at: "2026-05-15T11:00:00Z", // newest, but RESOLVED — must be hidden
        show_id: null,
        shows: null,
        resolved_at: "2026-05-15T11:30:00Z",
      },
    ]);
    const { getByTestId } = render(await AlertBanner());
    const banner = getByTestId("admin-alert-banner");
    // Top row is the newest UNRESOLVED, not the (newer) resolved row.
    expect(banner.getAttribute("data-alert-id")).toBe("unresolved-top");
    // Queue chip = unresolved count - 1 = 1 (NOT 2; the resolved row is excluded).
    const chip = getByTestId("admin-alert-queue-chip");
    expect(chip.textContent?.trim()).toBe("+1 more ▸");
  });

  test("M9 C4 / M5-D3: queue chip absent when only 1 unresolved alert", async () => {
    setRows([
      {
        id: "only-one",
        code: "GITHUB_BOT_LOGIN_MISSING",
        raised_at: "2026-05-15T10:00:00Z",
        show_id: null,
        shows: null,
      },
    ]);
    const { queryByTestId } = render(await AlertBanner());
    expect(queryByTestId("admin-alert-queue-chip")).toBeNull();
  });

  test("M9 C4 / M5-D3: Resolve button starts in idle state (text 'Resolve')", async () => {
    setRows([
      {
        id: "alert-resolve-idle",
        code: "GITHUB_BOT_LOGIN_MISSING",
        raised_at: "2026-05-15T10:00:00Z",
        show_id: null,
        shows: null,
      },
    ]);
    const { getByTestId, queryByTestId } = render(await AlertBanner());
    const btn = getByTestId("admin-alert-resolve-button");
    expect(btn.textContent?.trim()).toBe("Resolve");
    // The confirm-row is NOT in the DOM in idle state.
    expect(queryByTestId("admin-alert-confirm-row")).toBeNull();
  });
});
