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
const CREW_ID = "22222222-2222-4222-8222-222222222222";

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

  test("(a) OAUTH_IDENTITY_CLAIMED → identity line renders crew name · email · show title (scoped, anti-tautology)", async () => {
    mockState.crewRows = [{ id: CREW_ID, show_id: SHOW_ID, name: "Jamie Rivera" }];
    mockState.showRows = [{ id: SHOW_ID, title: "Spring Conference", slug: "spring-conference" }];
    setAlerts([
      {
        id: "oauth-1",
        code: "OAUTH_IDENTITY_CLAIMED",
        raised_at: "2026-05-04T10:00:00Z",
        context: { crew_member_id: CREW_ID, user_email: "jamie@example.com", show_id: SHOW_ID },
      },
    ]);
    const { getByTestId, container } = await renderSection();
    const identity = getByTestId("per-show-alert-identity");
    // Expected string derived from the fixtures (Crew · email · Show), NOT by
    // calling describeAlert (which would round-trip the production path).
    expect(identity.textContent).toBe(
      "Crew: Jamie Rivera · jamie@example.com · Show: Spring Conference",
    );
    // Anti-tautology: clone the row, remove the identity node, and prove the
    // crew name is rendered NOWHERE else — the identity node is the sole source.
    const clone = container.cloneNode(true) as HTMLElement;
    clone.querySelector("[data-testid=per-show-alert-identity]")?.remove();
    expect(clone.textContent).not.toContain("Jamie Rivera");
  });

  test("(b) EMAIL_DELIVERY_FAILED (show-only, NO drive_file_id) → identity renders the SHOW-NAME segment via injected showId", async () => {
    // No drive_file_id and no show_id in context — the ONLY way the resolver
    // can produce a Show segment is the section injecting its `showId` prop as
    // the row's show_id. Stub the shows read for that showId.
    mockState.showRows = [{ id: SHOW_ID, title: "East Coast Spectacular", slug: "east-coast" }];
    setAlerts([
      {
        id: "email-1",
        code: "EMAIL_DELIVERY_FAILED",
        raised_at: "2026-05-04T10:00:00Z",
        context: {},
      },
    ]);
    const { getByTestId } = await renderSection();
    expect(getByTestId("per-show-alert-identity").textContent).toBe("Show: East Coast Spectacular");
  });

  test("(c) ROLE_FLAGS_NOTICE → identity renders crew names + count from context.changes (no DB read)", async () => {
    setAlerts([
      {
        id: "role-1",
        code: "ROLE_FLAGS_NOTICE",
        raised_at: "2026-05-04T10:00:00Z",
        context: { changes: [{ crew_name: "Alex Kim" }, { crew_name: "Sam Poe" }] },
      },
    ]);
    const { getByTestId } = await renderSection();
    const text = getByTestId("per-show-alert-identity").textContent ?? "";
    expect(text).toContain("Alex Kim");
    expect(text).toContain("Sam Poe");
    expect(text).toContain("2 role changes");
  });

  test("global code (GITHUB_BOT_LOGIN_MISSING) → NO identity line, alert still renders", async () => {
    setAlerts([
      {
        id: "global-1",
        code: "GITHUB_BOT_LOGIN_MISSING",
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
    // OAUTH row so the resolver actually issues crew/show reads — which fail.
    // The email segment is projected from context.user_email WITHOUT a DB read,
    // so it SURVIVES the failed crew/show lookups. Per the spec §3.2 F9/P5
    // partial-degradation contract (Codex whole-diff R2 MEDIUM), the caller must
    // still render the surviving segment — NOT drop the whole partial map.
    mockState.failIdentityRead = true;
    setAlerts([
      {
        id: "infra-1",
        code: "OAUTH_IDENTITY_CLAIMED",
        raised_at: "2026-05-04T10:00:00Z",
        context: { crew_member_id: CREW_ID, user_email: "jamie@example.com", show_id: SHOW_ID },
      },
    ]);
    const { getByTestId } = await renderSection();
    expect(getByTestId("per-show-alert-infra-1")).not.toBeNull(); // alert still renders
    // The surviving email segment renders; crew/show (which needed the failed
    // DB reads) do NOT — proving partial degradation, not all-or-nothing drop.
    const identity = getByTestId("per-show-alert-identity");
    expect(identity.textContent).toContain("jamie@example.com");
    // The crew/show segments needed the failed DB reads, so their labels are absent.
    expect(identity.textContent).not.toContain("Crew:");
    expect(identity.textContent).not.toContain("Show:");
    expect(
      records.some(
        (r) =>
          r.source === "admin.perShowAlertSection" && /identity resolve degraded/.test(r.message),
      ),
    ).toBe(true);
  });
});
