// @vitest-environment jsdom
/**
 * tests/components/PerShowAlertSection.test.tsx
 * (alert-at-a-glance-identity, Task 11 — sibling of Task 10's AlertBanner
 * identity line)
 *
 * Pins the at-a-glance IDENTITY line on the per-show alerts surface rendered
 * at /admin/show/[slug]. `PerShowAlertSection` is a Server Component; we
 * exercise it by mocking `createSupabaseServerClient` so the SAME chained
 * client serves BOTH:
 *   1. the admin_alerts read
 *      `.from("admin_alerts").select(...).eq("show_id",…).is("resolved_at",null).order(...)`
 *      (awaited directly off the builder — NO .limit()), and
 *   2. the identity resolver's crew/show reads
 *      `.from("crew_members"|"shows").select(cols).in(col, ids).limit(n)`.
 *
 * Admin surface → includePii: true. Every alert row belongs to the section's
 * `showId` prop, so `fetchPerShowAlerts` injects `showId` as each ResolverRow's
 * `show_id` — this is what lets a show-only code with NO drive_file_id resolve
 * the show-name segment.
 *
 * Anti-tautology: identity assertions read the SCOPED
 * `data-testid="per-show-alert-identity"` node (the thing under test); the crew
 * case additionally clones the row and REMOVES the identity node, proving the
 * name appears nowhere else (the identity node is the sole source). Expected
 * strings are derived from the fixtures, NOT by round-tripping describeAlert.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { PerShowAlertSection } from "@/components/admin/PerShowAlertSection";
import { setLogSink, resetLogSink } from "@/lib/log";

// HelpAffordance + PerShowAlertResolveButton are Client Components that read
// usePathname()/useRouter(); stub next/navigation so they render in jsdom.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin/show/spring-conference",
  useSearchParams: () => new URLSearchParams(""),
}));

const SHOW_ID = "11111111-1111-4111-8111-111111111111";

type AlertFixture = {
  id: string;
  code: string;
  raised_at: string;
  context?: Record<string, unknown> | null;
  occurrence_count?: number;
};

const mockState = vi.hoisted(() => ({
  alertRows: [] as Array<{
    id: string;
    code: string;
    raised_at: string;
    context: Record<string, unknown> | null;
    occurrence_count: number;
  }>,
  // Identity resolver fixtures (keyed/filtered by the `.in()` id list).
  crewRows: [] as Array<{ id: string; show_id: string | null; name: string | null }>,
  showRows: [] as Array<{
    id?: string;
    drive_file_id?: string;
    title: string | null;
    slug: string | null;
  }>,
  // When true, the admin_alerts read returns a PostgREST { error }.
  failAlertRead: false,
  // When true, the crew_members/shows reads return a PostgREST { error },
  // driving resolveAlertIdentities → kind:"infra_error" (section must still
  // render + degrade to no identity, per §3.2 the resolver never throws).
  failIdentityRead: false,
}));

vi.mock("@/lib/supabase/server", () => {
  return {
    createSupabaseServerClient: async () => {
      function createBuilder(table: string) {
        const inFilter: { column: string | null; values: string[] | null } = {
          column: null,
          values: null,
        };
        const builder = {
          select: () => builder,
          eq: () => builder,
          is: () => builder,
          // alert-audience-split: fetchPerShowAlerts appends `.not("code","in",…)`
          // to exclude HEALTH_CODES. The mock doesn't need to apply the exclusion
          // (fixtures use non-health codes) — just chain, so the read doesn't throw.
          not: () => builder,
          order: () => builder,
          in: (column: string, values: string[]) => {
            inFilter.column = column;
            inFilter.values = values;
            return builder;
          },
          // crew_members/shows are read via .in().limit(); admin_alerts is
          // awaited directly (see `then`).
          limit: (n: number) => {
            if (table === "crew_members" || table === "shows") {
              if (mockState.failIdentityRead) {
                return Promise.resolve({
                  data: null,
                  error: { message: "simulated identity read failure" },
                });
              }
              const source =
                table === "crew_members"
                  ? (mockState.crewRows as Array<Record<string, unknown>>)
                  : (mockState.showRows as Array<Record<string, unknown>>);
              const rows =
                inFilter.column && inFilter.values
                  ? source.filter((r) => inFilter.values!.includes(r[inFilter.column!] as string))
                  : source;
              return Promise.resolve({ data: rows.slice(0, n), error: null });
            }
            return Promise.resolve({ data: mockState.alertRows.slice(0, n), error: null });
          },
          // admin_alerts is awaited off the builder after .order() (no .limit()).
          then: (onFulfilled: (value: { data: unknown; error: unknown }) => void) => {
            const payload = mockState.failAlertRead
              ? { data: null, error: { message: "simulated admin_alerts read failure" } }
              : { data: mockState.alertRows, error: null };
            return Promise.resolve(payload).then(onFulfilled);
          },
        };
        return builder;
      }
      return { from: (table: string) => createBuilder(table) };
    },
  };
});

function setAlerts(rows: AlertFixture[]) {
  mockState.alertRows = rows.map((r) => ({
    id: r.id,
    code: r.code,
    raised_at: r.raised_at,
    context: r.context ?? null,
    occurrence_count: r.occurrence_count ?? 1,
  }));
}

async function renderSection() {
  return render(await PerShowAlertSection({ showId: SHOW_ID, slug: "spring-conference" }));
}

describe("PerShowAlertSection — at-a-glance identity line", () => {
  beforeEach(() => {
    mockState.alertRows = [];
    mockState.crewRows = [];
    mockState.showRows = [];
    mockState.failAlertRead = false;
    mockState.failIdentityRead = false;
  });
  afterEach(() => {
    cleanup();
    resetLogSink();
  });

  // NOTE (alert-audience-split reconciliation): the crew-rich codes
  // (OAUTH_IDENTITY_CLAIMED, ROLE_FLAGS_NOTICE, …) are now `audience:"health"`
  // and no longer surface on the per-show section (HEALTH_CODES excluded). Their
  // rich crew+email+show / crew-names identity is exercised on the HEALTH surface
  // (HealthAlertsPanel). Here the per-show identity line is verified with
  // doug-VISIBLE codes: AMBIGUOUS_EMAIL_BINDING (Show · email) and, for the
  // show-scoping-via-injected-showId case, PICKER_EPOCH_RESET (Show only).
  test("(a) AMBIGUOUS_EMAIL_BINDING → identity line renders email · show title (anti-tautology)", async () => {
    mockState.showRows = [{ id: SHOW_ID, title: "Spring Conference", slug: "spring-conference" }];
    setAlerts([
      {
        id: "ambig-1",
        code: "AMBIGUOUS_EMAIL_BINDING",
        raised_at: "2026-05-04T10:00:00Z",
        context: { email: "jamie@example.com" },
      },
    ]);
    const { getByTestId, container } = await renderSection();
    const identity = getByTestId("per-show-alert-identity");
    // Show resolves via the section's injected `showId` prop; email is projected
    // from context.email. Expected derived from the fixtures, not describeAlert.
    expect(identity.textContent).toContain("jamie@example.com");
    expect(identity.textContent).toContain("Show: Spring Conference");
    // Anti-tautology: clone the row, remove the identity node, and prove the
    // email is rendered NOWHERE else — the identity node is the sole source.
    const clone = container.cloneNode(true) as HTMLElement;
    clone.querySelector("[data-testid=per-show-alert-identity]")?.remove();
    expect(clone.textContent).not.toContain("jamie@example.com");
  });

  test("(b) PICKER_EPOCH_RESET (show-only, NO drive_file_id) → identity renders the SHOW-NAME segment via injected showId", async () => {
    // No drive_file_id and no show_id in context — the ONLY way the resolver
    // can produce a Show segment is the section injecting its `showId` prop as
    // the row's show_id. Stub the shows read for that showId. (crew-names /
    // ROLE_FLAGS_NOTICE identity is health-audience now → covered on the
    // HealthAlertsPanel, not here.)
    mockState.showRows = [{ id: SHOW_ID, title: "East Coast Spectacular", slug: "east-coast" }];
    setAlerts([
      {
        id: "picker-epoch-1",
        code: "PICKER_EPOCH_RESET",
        raised_at: "2026-05-04T10:00:00Z",
        context: {},
      },
    ]);
    const { getByTestId } = await renderSection();
    expect(getByTestId("per-show-alert-identity").textContent).toBe("Show: East Coast Spectacular");
  });

  test("global code (SHOW_UNPUBLISHED) → NO identity line, alert still renders", async () => {
    setAlerts([
      {
        id: "global-1",
        code: "SHOW_UNPUBLISHED",
        raised_at: "2026-05-04T10:00:00Z",
      },
    ]);
    const { queryByTestId, getByTestId } = await renderSection();
    expect(getByTestId("per-show-alert-global-1")).not.toBeNull();
    expect(queryByTestId("per-show-alert-identity")).toBeNull();
  });

  test("unknown code → NO identity line and does not throw", async () => {
    setAlerts([
      {
        id: "unknown-1",
        code: "TOTALLY_NOT_A_CATALOG_CODE",
        raised_at: "2026-05-04T10:00:00Z",
      },
    ]);
    await expect(
      (async () => {
        const { queryByTestId, getByTestId } = await renderSection();
        expect(getByTestId("per-show-alert-unknown-1")).not.toBeNull();
        expect(queryByTestId("per-show-alert-identity")).toBeNull();
      })(),
    ).resolves.toBeUndefined();
  });

  test("resolver infra_error → alert renders, SURVIVING partial identity still shows, no crash, degraded event logged", async () => {
    const records: Array<{ source: string; message: string }> = [];
    setLogSink((record) => {
      records.push({ source: record.source, message: record.message });
    });
    // AMBIGUOUS_EMAIL_BINDING (doug-visible) has a showName segment, so the
    // resolver issues a `shows` read — which the forced failIdentityRead fails.
    // The email segment is projected from context.email WITHOUT a DB read, so it
    // SURVIVES the failed show lookup. Per the spec §3.2 F9/P5 partial-degradation
    // contract (Codex whole-diff R2 MEDIUM), the caller must still render the
    // surviving segment — NOT drop the whole partial map.
    mockState.failIdentityRead = true;
    setAlerts([
      {
        id: "infra-1",
        code: "AMBIGUOUS_EMAIL_BINDING",
        raised_at: "2026-05-04T10:00:00Z",
        context: { email: "jamie@example.com" },
      },
    ]);
    const { getByTestId } = await renderSection();
    expect(getByTestId("per-show-alert-infra-1")).not.toBeNull(); // alert still renders
    // The surviving email segment renders; the Show segment (which needed the
    // failed DB read) does NOT — proving partial degradation, not all-or-nothing.
    const identity = getByTestId("per-show-alert-identity");
    expect(identity.textContent).toContain("jamie@example.com");
    // The Show segment needed the failed DB read, so its label is absent.
    expect(identity.textContent).not.toContain("Show:");
    expect(
      records.some(
        (r) =>
          r.source === "admin.perShowAlertSection" && /identity resolve degraded/.test(r.message),
      ),
    ).toBe(true);
  });
});
