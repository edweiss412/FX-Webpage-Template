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
import { firstSentence, stripEmphasis } from "@/lib/messages/collapsedSummary";

// RECON-1 T3: <AlertBanner> now wraps its normal-state render in
// <AlertBannerRouteBoundary> (a 'use client' island that reads BOTH
// usePathname() AND useSearchParams()), and Phase G.3's <HelpAffordance>
// (also a Client Component) uses usePathname(). vi.mock is HOISTED above
// imports, so its factory must NOT close over plain module-scope `let`s
// (they read as undefined at hoist time). Use the vi.hoisted pattern (the
// repo convention, cf. tests/components/admin/AlertBannerRouteBoundary.test.tsx
// + tests/components/admin/nav/transitionAudit.test.ts). Keep the default
// route non-admin ("/") so the existing HelpAffordance Learn-more emission
// stays gated out and pre-T3 assertions on banner contents remain stable.
const navState = vi.hoisted(() => ({ pathname: "/", search: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => navState.pathname,
  useSearchParams: () => new URLSearchParams(navState.search),
}));

// RECON-1 T3: the count badge (total) + "+N more" link both source from
// fetchUnresolvedAlertCount(). Default delegates to a real count derived
// from the seeded rows (length of unresolved non-info rows), matching the
// pre-T3 behavior where the count came through the same Supabase mock; the
// per-test override (count.set / count.infra) lets the bounded-count (250)
// and infra-error (treated as 1) guard tests drive the count independently
// of how many detail rows the .limit(1) probe sees.
const countState = vi.hoisted(() => ({
  override: null as { kind: "ok"; count: number } | { kind: "infra_error" } | null,
}));
vi.mock("@/lib/admin/alertCount", async (importOriginal) => {
  // Reuse the REAL info-severity exclusion list so the default count mirrors
  // the production helper's `resolved_at IS NULL AND code NOT IN (info…)`
  // semantics — keeps the pre-T3 queue-chip / resolved-exclusion tests
  // load-bearing (they never set an override).
  const { MESSAGE_CATALOG: CAT } = await import("@/lib/messages/catalog");
  void importOriginal;
  const infoCodes = new Set(
    Object.values(CAT)
      .filter((e) => (e as { severity?: string }).severity === "info")
      .map((e) => (e as { code: string }).code),
  );
  return {
    fetchUnresolvedAlertCount: async () => {
      if (countState.override) return countState.override;
      const count = mockState.rows.filter(
        (r) => r.resolved_at === null && !infoCodes.has(r.code),
      ).length;
      return { kind: "ok" as const, count };
    },
  };
});

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
  // RECON-1 T3 §6 swap tests: when true, the DETAIL SELECT (the .limit(1)
  // probe) returns a PostgREST `{ error }`, driving AlertBanner's
  // detailFailed branch → the degraded variant (no <details>).
  failDetailRead: false,
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
          limit: (n: number) =>
            mockState.failDetailRead
              ? Promise.resolve({ data: null, error: { message: "simulated detail read failure" } })
              : Promise.resolve({ data: apply().slice(0, n), error: null }),
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

// Test-local emphasis strip (anti-tautology: not the production helper).
// Catalog copy may carry Markdown emphasis; the renderer styles it as
// <em>/<strong>, so textContent must contain the marker-free prose.
function stripMarkers(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/(^|[\s("'])_(\S(?:.*?\S)?)_(?=[\s)"'.,!?;:]|$)/g, "$1$2");
}

describe("AlertBanner", () => {
  beforeEach(() => {
    mockState.rows = [];
    mockState.failDetailRead = false;
    countState.override = null;
    navState.pathname = "/";
    navState.search = "";
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
      // Emphasis markers in the catalog literal render as <em>/<strong>,
      // so textContent carries the marker-free prose (never literal "*").
      expect(getByTestId("error-explainer-message").textContent).toBe(
        stripMarkers(MESSAGE_CATALOG[code].dougFacing!),
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
    // Anti-tautology: literal "+3 more →" — derived from fixture (4
    // total, 1 shown, 3 queued). RECON-1 T3 swapped the chip glyph ▸→→
    // and bounds the visible count via formatBoundedCount (3 < 100 → "3").
    expect(chip.textContent?.trim()).toBe("+3 more →");
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
    // the top unresolved row and a "+1 more →" chip (NOT "+2 more →").
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
    expect(chip.textContent?.trim()).toBe("+1 more →");
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

  // ===========================================================================
  // RECON-1 T3 — AlertBanner calm collapsible strip (spec §3.1/§3.3/§4/§5/§8).
  //
  // These pin the quieted normal-state render: native <details>/<summary>
  // disclosure (no-JS reachable), the action as a section-grid SIBLING of
  // <details> (never inside <summary>/<details> — no toggle conflict, §3.3),
  // the full-width expanded panel, bounded-but-exact counts (F11/F14/F16),
  // the resolve form-boundary integrity (F1), the §5 guards, and the §6
  // server-swap structural property (only <details> in normal renders).
  //
  // Fixture helpers below. A "global" alert has show_id null (renders the
  // Resolve form); a "per-show" alert has show_id set (renders View-show when
  // the joined slug is present).
  // ===========================================================================

  // ---- 3a: DOM structure (action outside <summary>; full-width panel) ----

  test("global action (form) is NOT a descendant of <summary> or <details> (no toggle conflict)", async () => {
    setRows([
      {
        id: "global-1",
        code: "GITHUB_BOT_LOGIN_MISSING",
        raised_at: "2026-05-04T10:00:00Z",
        show_id: null,
        shows: null,
      },
    ]);
    const { container } = render(await AlertBanner());
    const section = container.querySelector("[data-testid=admin-alert-banner]")!;
    expect(section.querySelector("summary form, summary a, details form")).toBeNull();
    // the action lives in its own grid cell
    expect(section.querySelector("[data-testid=admin-alert-action] form")).not.toBeNull();
  });

  test("per-show action (View show link) lives in the action cell, NOT inside <summary>/<details> (F34)", async () => {
    setRows([
      {
        id: "pershow-1",
        code: "AMBIGUOUS_EMAIL_BINDING",
        raised_at: "2026-05-04T10:00:00Z",
        show_id: "11111111-1111-4111-8111-111111111111",
        shows: { slug: "test-show" },
      },
    ]);
    const { container } = render(await AlertBanner());
    const section = container.querySelector("[data-testid=admin-alert-banner]")!;
    expect(section.querySelector("[data-testid=admin-alert-show-link]")).not.toBeNull(); // View-show renders…
    expect(
      section.querySelector("[data-testid=admin-alert-action] [data-testid=admin-alert-show-link]"),
    ).not.toBeNull(); // …in the action cell…
    // …and NOT nested in the disclosure (would be hidden when collapsed / drift on expand):
    expect(
      section.querySelector(
        "summary [data-testid=admin-alert-show-link], details [data-testid=admin-alert-show-link], summary a, details a[href*='/admin/show/']",
      ),
    ).toBeNull();
  });

  test("expanded panel and summary are both present in SSR DOM (no-JS reachable)", async () => {
    setRows([
      {
        id: "global-2",
        code: "GITHUB_BOT_LOGIN_MISSING",
        raised_at: "2026-05-04T10:00:00Z",
        show_id: null,
        shows: null,
      },
    ]);
    const { container } = render(await AlertBanner());
    const section = container.querySelector("[data-testid=admin-alert-banner]")!;
    expect(section.querySelector("summary")).not.toBeNull();
    expect(section.querySelector("[data-testid=admin-alert-panel]")).not.toBeNull();
  });

  test("collapsed summary line is the FIRST SENTENCE of catalog dougFacing, inline (no block child), emphasis stripped (M12.3 item 3)", async () => {
    // M12.3 item 3: the collapsed one-liner is now the first complete sentence
    // of dougFacing (emphasis stripped) — no mid-word truncation. Anti-tautology:
    // derive the expectation from the catalog via the SAME helpers the component
    // uses (firstSentence ∘ stripEmphasis), never hardcoded.
    const CODE = "TILE_SERVER_RENDER_FAILED" satisfies MessageCode;
    setRows([
      {
        id: "emph-1",
        code: CODE,
        raised_at: "2026-05-04T10:00:00Z",
        show_id: null,
        shows: null,
        // no context → <sheet-name> placeholder stays, but no `*` should remain
      },
    ]);
    const { container } = render(await AlertBanner());
    const line = container.querySelector("[data-testid=admin-alert-banner] summary span.truncate")!;
    const expected = stripEmphasis(firstSentence(MESSAGE_CATALOG[CODE].dougFacing!));
    expect(line.textContent).toBe(expected);
    // emphasis markers removed (no literal "*" leaks)
    expect(line.textContent).not.toContain("*");
    expect(line.querySelector("p, div, ul, section")).toBeNull(); // inline only — truncation-safe
    // it is NOT the same node as the panel's <ErrorExplainer> block
    expect(line.querySelector("[data-testid=admin-alert-panel]")).toBeNull();
  });

  test("collapsed line is the first sentence only — a multi-sentence dougFacing does not bleed sentence 2 into the one-liner (M12.3 item 3)", async () => {
    // Find a banner-eligible (non-info) catalog code whose dougFacing has a real
    // sentence boundary, so firstSentence actually truncates. Derive everything
    // from the catalog (anti-tautology, parameterization-safe).
    const entry = Object.values(MESSAGE_CATALOG).find((e) => {
      const d = (e as { dougFacing: string | null }).dougFacing;
      const sev = (e as { severity?: string }).severity;
      return (
        typeof d === "string" &&
        sev !== "info" &&
        stripEmphasis(firstSentence(d)) !== stripEmphasis(d)
      );
    }) as { code: string; dougFacing: string } | undefined;
    expect(entry).toBeDefined(); // precondition: such a code exists in the catalog
    const code = entry!.code;
    const full = stripEmphasis(entry!.dougFacing);
    const firstOnly = stripEmphasis(firstSentence(entry!.dougFacing));
    expect(firstOnly.length).toBeLessThan(full.length); // pins that truncation happens
    setRows([
      {
        id: "multi-sentence",
        code,
        raised_at: "2026-05-04T10:00:00Z",
        show_id: null,
        shows: null,
      },
    ]);
    const { container } = render(await AlertBanner());
    const line = container.querySelector(
      "[data-testid=admin-alert-banner] summary [data-testid=admin-alert-message]",
    )!;
    expect(line.textContent).toBe(firstOnly);
    // the full message (panel) still renders the WHOLE dougFacing (unchanged)
    const panelMsg = container.querySelector(
      "[data-testid=admin-alert-panel] [data-testid=error-explainer-message]",
    );
    expect(panelMsg?.textContent).toBe(entry!.dougFacing);
  });

  test("collapsedSummary helpers strip BOTH single-asterisk *emphasis* AND double-asterisk **bold** (review #3)", async () => {
    // At least one catalog dougFacing uses **bold** (SHOW_FIRST_PUBLISHED's
    // "**Made a mistake?**", catalog.ts:657). The collapsed line now flows
    // through stripEmphasis; pin that it collapses both forms with NO residual
    // asterisks so a weakening back to the single-asterisk-only form regresses.
    expect(stripEmphasis("*emphasis* and more")).toBe("emphasis and more");
    expect(stripEmphasis("**Made a mistake?** click here")).toBe("Made a mistake? click here");
    expect(stripEmphasis("a *one* and **two** mixed")).toBe("a one and two mixed");
    expect(stripEmphasis("**bold**")).not.toContain("*");
  });

  // ---- 3b: bounded counts + exact-count accessibility (§8 F11/F12/F14/F16) ----

  test("badge: bounded visible text (aria-hidden) + exact count in sr-only markup", async () => {
    setRows([
      {
        id: "badge-250",
        code: "GITHUB_BOT_LOGIN_MISSING",
        raised_at: "2026-05-04T10:00:00Z",
        show_id: null,
        shows: null,
      },
    ]);
    countState.override = { kind: "ok", count: 250 };
    const { container } = render(await AlertBanner());
    const badge = container.querySelector("[data-testid=admin-alert-badge]")!;
    expect(badge.querySelector("[aria-hidden=true]")!.textContent).toBe("99+");
    expect(badge.querySelector(".sr-only")!.textContent).toBe("250 unresolved alerts");
  });

  test("queue link bounds visible text but keeps exact aria-label", async () => {
    setRows([
      {
        id: "chip-250",
        code: "GITHUB_BOT_LOGIN_MISSING",
        raised_at: "2026-05-04T10:00:00Z",
        show_id: null,
        shows: null,
      },
    ]);
    countState.override = { kind: "ok", count: 250 }; // moreCount = 249
    const { container } = render(await AlertBanner());
    const link = container.querySelector("[data-testid=admin-alert-queue-chip]")!;
    expect(link.textContent).toContain("99+");
    expect(link.getAttribute("aria-label")).toBe("View 249 more unresolved alerts");
  });

  test("no badge / no queue chip when only one unresolved (count === 1)", async () => {
    setRows([
      {
        id: "single-1",
        code: "GITHUB_BOT_LOGIN_MISSING",
        raised_at: "2026-05-04T10:00:00Z",
        show_id: null,
        shows: null,
      },
    ]);
    countState.override = { kind: "ok", count: 1 };
    const { container } = render(await AlertBanner());
    expect(container.querySelector("[data-testid=admin-alert-banner] .sr-only")).toBeNull();
    expect(container.querySelector("[data-testid=admin-alert-badge]")).toBeNull();
    expect(container.querySelector("[data-testid=admin-alert-queue-chip]")).toBeNull();
  });

  // ---- 3c: resolve form-boundary integrity (§8 F1, §11) ----

  test("global resolve action is a <form> with hidden id wrapping ResolveAlertButton (form boundary intact)", async () => {
    // Negative-regression: moving the button outside <form> breaks
    // useFormStatus pending + the Server Action's `id` — keep the form as the
    // action slot (spec §3.1 slot-integrity rule).
    setRows([
      {
        id: "alert-1",
        code: "GITHUB_BOT_LOGIN_MISSING",
        raised_at: "2026-05-04T10:00:00Z",
        show_id: null,
        shows: null,
      },
    ]);
    const { container } = render(await AlertBanner());
    const form = container.querySelector("[data-testid=admin-alert-action] form")!;
    expect(form).not.toBeNull();
    const hidden = form.querySelector(
      "input[name=id][data-testid=admin-alert-id-input]",
    ) as HTMLInputElement;
    expect(hidden.value).toBe("alert-1");
    // ResolveAlertButton renders inside the same form
    expect(form.querySelector("button")).not.toBeNull();
  });

  // ---- 3d: guard conditions (§5) ----

  test("per-show alert with missing slug renders no 'View show' link but panel still present (§5)", async () => {
    setRows([
      {
        id: "pershow-noslug",
        code: "AMBIGUOUS_EMAIL_BINDING",
        raised_at: "2026-05-04T10:00:00Z",
        show_id: "11111111-1111-4111-8111-111111111111",
        shows: null, // joined slug missing
      },
    ]);
    const { container } = render(await AlertBanner());
    expect(container.querySelector("[data-testid=admin-alert-show-link]")).toBeNull();
    expect(container.querySelector("[data-testid=admin-alert-panel]")).not.toBeNull(); // still expandable
  });

  test("HelpAffordance null (unknown code) → panel omits it, raised-at still renders (§5)", async () => {
    // An uncataloged code → HelpAffordance returns null; the panel's raised-at
    // row still renders and nothing crashes.
    setRows([
      {
        id: "nohelp-1",
        code: "SOME_UNCATALOGED_CODE_FOR_HELP",
        raised_at: "2026-05-04T10:00:00Z",
        show_id: null,
        shows: null,
      },
    ]);
    const { container } = render(await AlertBanner());
    const panel = container.querySelector("[data-testid=admin-alert-panel]")!;
    expect(panel.querySelector("[data-testid=admin-alert-raised-at]")).not.toBeNull();
    // no crash; HelpAffordance simply rendered nothing
  });

  test("count infra-error → treated as 1: calm banner still renders, no badge, no +N more (§5)", async () => {
    setRows([
      {
        id: "infra-count",
        code: "GITHUB_BOT_LOGIN_MISSING",
        raised_at: "2026-05-04T10:00:00Z",
        show_id: null,
        shows: null,
      },
    ]);
    countState.override = { kind: "infra_error" };
    const { container } = render(await AlertBanner());
    // calm STRUCTURE present — proves infra-error still renders the new banner:
    expect(container.querySelector("[data-testid=admin-alert-banner] summary")).not.toBeNull();
    expect(container.querySelector("[data-testid=admin-alert-panel]")).not.toBeNull();
    // …and the count-derived chrome is absent because the count is unavailable:
    expect(container.querySelector("[data-testid=admin-alert-queue-chip]")).toBeNull();
    expect(container.querySelector("[data-testid=admin-alert-badge]")).toBeNull();
  });

  test("uncataloged alert.code does NOT crash and leaks no raw code (collapsedText guard)", async () => {
    // admin_alerts.code is an unconstrained DB string. messageFor() would throw
    // on an uncataloged code and take down the PERSISTENT admin layout. The
    // banner must still render and must NOT render the raw code.
    const UNKNOWN = "TOTALLY_NOT_A_CATALOG_CODE";
    setRows([
      {
        id: "unknown-code",
        code: UNKNOWN,
        raised_at: "2026-05-04T10:00:00Z",
        show_id: null,
        shows: null,
      },
    ]);
    await expect(
      (async () => {
        const ui = await AlertBanner();
        const { container } = render(ui);
        const summary = container.querySelector("[data-testid=admin-alert-banner] summary");
        expect(summary).not.toBeNull(); // banner still renders
        expect(summary!.textContent).not.toContain(UNKNOWN); // no raw code leak
      })(),
    ).resolves.toBeUndefined();
  });

  test("known code with null dougFacing does NOT fall back to crewFacing in the admin summary (surface boundary)", async () => {
    // admin_alerts.code is unconstrained, so a drifted / manual / version-skewed
    // row could put a known code that has dougFacing:null but a populated
    // crewFacing (e.g. GOOGLE_NO_CREW_MATCH) at the top of the queue. The
    // collapsed summary must NOT show crew-facing guidance to Doug on the
    // PERSISTENT admin layout — it must mirror ErrorExplainer (surface="admin"
    // → dougFacing only, null → render nothing; ErrorExplainer.tsx:86,91).
    // Negative-regression: restoring the `?? topMessage?.crewFacing` fallback in
    // collapsedText makes this assertion fail (the crew copy would appear).
    const CODE = "GOOGLE_NO_CREW_MATCH" satisfies MessageCode;
    expect(MESSAGE_CATALOG[CODE].dougFacing).toBeNull(); // precondition (pins the fixture)
    const crewCopy = MESSAGE_CATALOG[CODE].crewFacing!;
    expect(typeof crewCopy).toBe("string");
    setRows([
      {
        id: "null-doug-code",
        code: CODE,
        raised_at: "2026-05-04T10:00:00Z",
        show_id: null,
        shows: null,
      },
    ]);
    const ui = await AlertBanner();
    const { container } = render(ui);
    const summary = container.querySelector("[data-testid=admin-alert-banner] summary");
    expect(summary).not.toBeNull(); // banner still renders
    // collapsed message line is EMPTY (no crew copy), matching the panel's
    // <ErrorExplainer> which renders null for a null-dougFacing admin surface.
    const message = container.querySelector("[data-testid=admin-alert-message]");
    expect(message?.textContent ?? "").toBe("");
    expect(summary!.textContent).not.toContain(crewCopy); // crew guidance absent
  });

  // ---- 3e: §6 server-swap transitions (component-level; covers F4) ----
  // Each swap is an independent per-request server render with a different
  // mock. The no-stale-state property is STRUCTURAL: degraded/null branches
  // contain NO <details>, so a browser-owned open/height cannot survive a swap
  // into them. (The same-alert F9 client re-render case is the T8 real-browser
  // test.) Forcing a real degraded read-failure here is impractical; the mock
  // surfaces it via a dedicated FAIL marker code that drives detailFailed.

  test("§6 normal→null: 1 unresolved renders <details>; 0 unresolved renders nothing", async () => {
    setRows([
      {
        id: "swap-1",
        code: "GITHUB_BOT_LOGIN_MISSING",
        raised_at: "2026-05-04T10:00:00Z",
        show_id: null,
        shows: null,
      },
    ]);
    let r = render(await AlertBanner());
    // Pin the OUTER disclosure <details> via the caret testid (unique to the
    // outer summary), NOT a nested ErrorExplainer/HelpAffordance "What does this
    // mean?" <details> — those live inside the panel, which is now a SECTION
    // sibling of <details> (F18 fix), so scoping by panel would no longer match.
    expect(
      r.container.querySelector(
        "[data-testid=admin-alert-banner] details:has([data-testid=admin-alert-caret])",
      ),
    ).not.toBeNull();
    cleanup();
    setRows([]); // 0 unresolved → AlertBanner returns null
    r = render(await AlertBanner());
    expect(r.container.querySelector("[data-testid=admin-alert-banner]")).toBeNull();
  });

  test("§6 null→normal: inserting an alert makes the banner appear", async () => {
    setRows([]); // empty → null
    let r = render(await AlertBanner());
    expect(r.container.querySelector("[data-testid=admin-alert-banner]")).toBeNull();
    cleanup();
    setRows([
      {
        id: "swap-2",
        code: "GITHUB_BOT_LOGIN_MISSING",
        raised_at: "2026-05-04T10:00:00Z",
        show_id: null,
        shows: null,
      },
    ]);
    r = render(await AlertBanner());
    expect(
      r.container.querySelector(
        "[data-testid=admin-alert-banner] details:has([data-testid=admin-alert-caret])",
      ),
    ).not.toBeNull();
  });

  test("§6 normal/expanded→degraded: degraded render has NO <details> (stale open cannot survive)", async () => {
    // Drive detailFailed via the dedicated detail-read error hook.
    mockState.failDetailRead = true;
    const { container } = render(await AlertBanner());
    expect(container.querySelector("[data-testid=admin-alert-banner-degraded]")).not.toBeNull();
    expect(container.querySelector("details")).toBeNull(); // no element to carry a stale open/height
  });

  test("§6 degraded→null: read recovers to empty → nothing renders", async () => {
    setRows([]); // recovered, empty → null
    const { container } = render(await AlertBanner());
    expect(
      container.querySelector(
        "[data-testid=admin-alert-banner], [data-testid=admin-alert-banner-degraded]",
      ),
    ).toBeNull();
  });

  test("§6 degraded→normal (D→C recovery): read recovers WITH an alert → normal banner returns, collapsed, no degraded", async () => {
    mockState.failDetailRead = true;
    let r = render(await AlertBanner());
    expect(r.container.querySelector("[data-testid=admin-alert-banner-degraded]")).not.toBeNull();
    cleanup();
    mockState.failDetailRead = false;
    setRows([
      {
        id: "swap-recover",
        code: "GITHUB_BOT_LOGIN_MISSING",
        raised_at: "2026-05-04T10:00:00Z",
        show_id: null,
        shows: null,
      },
    ]);
    r = render(await AlertBanner());
    expect(r.container.querySelector("[data-testid=admin-alert-banner-degraded]")).toBeNull(); // degraded gone
    // Outer disclosure <details> (pinned via caret), not a nested help <details>.
    const details = r.container.querySelector(
      "[data-testid=admin-alert-banner] details:has([data-testid=admin-alert-caret])",
    );
    expect(details).not.toBeNull(); // normal banner back…
    expect(details!.hasAttribute("open")).toBe(false); // …collapsed, no stale open
  });
});
