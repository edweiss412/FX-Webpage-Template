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
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PerShowAlertSection } from "@/components/admin/PerShowAlertSection";
import { setLogSink, resetLogSink } from "@/lib/log";

// HelpAffordance + PerShowAlertResolveButton are Client Components that read
// usePathname()/useRouter(); stub next/navigation so they render in jsdom.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin/show/spring-conference",
  useSearchParams: () => new URLSearchParams(""),
}));

// Guard-path test only (below): every real code with an identity segment is
// now an INLINE_IDENTITY_CODES member whose params always resolve (full-sweep
// §3 always-resolving fallbacks), so there's no longer a real code+context
// combo that leaves a member's template unresolved. To still exercise
// PerShowAlertSection's fail-safe guard (the chip must never drop when a
// member's template fails to interpolate), this delegates to the REAL
// deriveAlertMessageParams for every test except the one that flips
// `forceUnresolvedMemberParams`, which strips show-name/crew-row-count so
// AMBIGUOUS_EMAIL_BINDING's template is left with unresolved placeholders.
// PerShowAlertSection is imported statically above, so a plain vi.mock (not
// per-test vi.doMock) is required — it's hoisted above that import.
const mockParamsState = vi.hoisted(() => ({ forceUnresolvedMemberParams: false }));
vi.mock("@/lib/adminAlerts/deriveMessageParams", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/adminAlerts/deriveMessageParams")>();
  return {
    ...actual,
    deriveAlertMessageParams: (...args: Parameters<typeof actual.deriveAlertMessageParams>) => {
      if (!mockParamsState.forceUnresolvedMemberParams)
        return actual.deriveAlertMessageParams(...args);
      const real = actual.deriveAlertMessageParams(...args);
      const { "show-name": _showName, "crew-row-count": _crewRowCount, ...rest } = real;
      return rest;
    },
  };
});

// Task 8 (alert-copy-full-sweep §4.2): the always-visible "What does this
// mean?" help block was DELETED — its content lives on /help/errors now.
// Every admin code's helpfulContext is already null post-T7, so the block is
// dead-by-fixture-data for every other test in this file; to prove the
// DELETION (not just that no fixture happens to trigger it), this forces
// messageFor().helpfulContext to a non-null sentinel and asserts the block
// still never renders. PerShowAlertSection is imported statically above, so
// this mock is hoisted the same way as the deriveMessageParams mock.
const mockHelpfulContextState = vi.hoisted(() => ({
  forceHelpfulContext: null as string | null,
}));
vi.mock("@/lib/messages/lookup", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/messages/lookup")>();
  return {
    ...actual,
    messageFor: (...args: Parameters<typeof actual.messageFor>) => {
      const real = actual.messageFor(...args);
      if (mockHelpfulContextState.forceHelpfulContext === null) return real;
      return { ...real, helpfulContext: mockHelpfulContextState.forceHelpfulContext };
    },
  };
});

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

// condensed-alert-copy Task 8 harnesses (spec 2026-07-17 §4.2/§5). Both reuse
// the file's showRows/setAlerts fixture pattern — no new mock plumbing.
async function renderSectionWithRoleFlagsRow() {
  mockState.showRows = [
    { id: SHOW_ID, title: "II - RIA Investment Forum", slug: "ria-investment-forum" },
  ];
  setAlerts([
    {
      id: "role-flags-1",
      code: "ROLE_FLAGS_NOTICE",
      raised_at: "2026-05-04T10:00:00Z",
      context: {
        changes: [{ crew_name: "Doug Larson", prior_flags: ["A1"], new_flags: ["A1", "LEAD"] }],
      },
    },
  ]);
  return renderSection();
}

// full-sweep §3 gave every placeholder an always-resolving fallback in
// deriveAlertMessageParams, so as of this sweep EVERY code with an identity
// segment is also an INLINE_IDENTITY_CODES member whose template always
// resolves (`§6` inline_member:yes rows == the segmented rows in
// alertIdentityMap.ts) — there is no longer a real catalog code that is
// segmented, non-member, AND places no placeholder. To still exercise the
// component's guard branch (PerShowAlertSection.tsx:401 — the chip must
// never drop when a member code's template FAILS to interpolate), this stubs
// deriveAlertMessageParams for one render so a real member code
// (AMBIGUOUS_EMAIL_BINDING) resolves its identity segments normally but its
// message params omit `show-name`/`crew-row-count`, leaving those two
// placeholders unresolved in the rendered template.
async function renderSectionWithUnresolvedMemberTemplate() {
  mockState.showRows = [{ id: SHOW_ID, title: "East Coast Spectacular", slug: "east-coast" }];
  setAlerts([
    {
      id: "unresolved-member-1",
      code: "AMBIGUOUS_EMAIL_BINDING",
      raised_at: "2026-05-04T10:00:00Z",
      context: { email: "jamie@example.com" },
    },
  ]);
  mockParamsState.forceUnresolvedMemberParams = true;
  return renderSection();
}

describe("PerShowAlertSection — at-a-glance identity line", () => {
  beforeEach(() => {
    mockState.alertRows = [];
    mockState.crewRows = [];
    mockState.showRows = [];
    mockState.failAlertRead = false;
    mockState.failIdentityRead = false;
    mockParamsState.forceUnresolvedMemberParams = false;
    mockHelpfulContextState.forceHelpfulContext = null;
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
  test("(a) AMBIGUOUS_EMAIL_BINDING → identity woven inline into the message, no separate identity chip (full-sweep §6.a)", async () => {
    // alert-copy-full-sweep §6.a: AMBIGUOUS_EMAIL_BINDING joined
    // INLINE_IDENTITY_CODES, so its Show/email/crew-row-count identity now
    // renders INLINE in the dougFacing message itself (lib/messages/catalog.ts
    // AMBIGUOUS_EMAIL_BINDING.dougFacing) instead of the separate
    // per-show-alert-identity chip — the chip is suppressed for member codes
    // whose template resolved (component guard, PerShowAlertSection.tsx:401).
    mockState.showRows = [{ id: SHOW_ID, title: "Spring Conference", slug: "spring-conference" }];
    setAlerts([
      {
        id: "ambig-1",
        code: "AMBIGUOUS_EMAIL_BINDING",
        raised_at: "2026-05-04T10:00:00Z",
        context: { email: "jamie@example.com" },
      },
    ]);
    const { getByTestId, queryByTestId } = await renderSection();
    const row = getByTestId("per-show-alert-ambig-1");
    // Show resolves via the section's injected `showId` prop; email is
    // projected from context.email; crew-row-count has no context value so it
    // falls back to "two or more crew rows" (spec §3, new fallback param).
    expect(row.textContent).toContain(
      "In 'Spring Conference', jamie@example.com is shared by two or more crew rows, so Google login can't safely tell who's who.",
    );
    expect(queryByTestId("per-show-alert-identity")).toBeNull();
  });

  test("(b) PICKER_EPOCH_RESET → identity woven inline via injected showId, no separate identity chip (full-sweep §6.a)", async () => {
    // alert-copy-full-sweep §6.a: PICKER_EPOCH_RESET joined
    // INLINE_IDENTITY_CODES too — its Show segment (resolved via the
    // section's injected `showId` prop, since context carries neither
    // drive_file_id nor show_id) now renders inline in the message rather
    // than the separate identity chip.
    mockState.showRows = [{ id: SHOW_ID, title: "East Coast Spectacular", slug: "east-coast" }];
    setAlerts([
      {
        id: "picker-epoch-1",
        code: "PICKER_EPOCH_RESET",
        raised_at: "2026-05-04T10:00:00Z",
        context: {},
      },
    ]);
    const { getByTestId, queryByTestId } = await renderSection();
    expect(getByTestId("per-show-alert-picker-epoch-1").textContent).toContain(
      "Picker selections for 'East Coast Spectacular' were reset.",
    );
    expect(queryByTestId("per-show-alert-identity")).toBeNull();
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

  test("resolver infra_error → alert renders, SURVIVING partial identity still shows inline, no crash, degraded event logged", async () => {
    const records: Array<{ source: string; message: string }> = [];
    setLogSink((record) => {
      records.push({ source: record.source, message: record.message });
    });
    // AMBIGUOUS_EMAIL_BINDING (doug-visible) has a showName segment, so the
    // resolver issues a `shows` read — which the forced failIdentityRead fails.
    // The email segment is projected from context.email WITHOUT a DB read, so it
    // SURVIVES the failed show lookup. Per the spec §3.2 F9/P5 partial-degradation
    // contract (Codex whole-diff R2 MEDIUM), the caller must still render the
    // surviving segment — NOT drop the whole partial map. Post full-sweep §6.a,
    // AMBIGUOUS_EMAIL_BINDING is an INLINE_IDENTITY_CODES member, so the
    // surviving/degraded identity renders WOVEN INTO the message (no separate
    // chip): email resolves to its real context value while the show segment,
    // which needed the failed DB read, falls back to the generic "this show"
    // param (deriveMessageParams.ts always-resolving fallback) instead of the
    // real title — proving partial degradation without ever leaking a raw
    // placeholder or crashing.
    mockState.failIdentityRead = true;
    setAlerts([
      {
        id: "infra-1",
        code: "AMBIGUOUS_EMAIL_BINDING",
        raised_at: "2026-05-04T10:00:00Z",
        context: { email: "jamie@example.com" },
      },
    ]);
    const { getByTestId, queryByTestId } = await renderSection();
    const row = getByTestId("per-show-alert-infra-1"); // alert still renders
    expect(row.textContent).toContain(
      "In this show, jamie@example.com is shared by two or more crew rows, so Google login can't safely tell who's who.",
    );
    // The Show segment needed the failed DB read, so the real title never
    // appears — only the generic fallback above.
    expect(row.textContent).not.toContain("Spring Conference");
    // No separate identity chip: the member-code template resolved (via the
    // fallback param), so the chip is suppressed per the component guard.
    expect(queryByTestId("per-show-alert-identity")).toBeNull();
    expect(
      records.some(
        (r) =>
          r.source === "admin.fetchPerShowAlerts" && /identity resolve degraded/.test(r.message),
      ),
    ).toBe(true);
  });

  // condensed-alert-copy Task 8 (spec 2026-07-17 §4.2/§5): derived message
  // params + identity-chip suppression for INLINE_IDENTITY_CODES members.
  test("ROLE_FLAGS_NOTICE renders inline-context copy, no identity line (spec 2026-07-17 §4.2)", async () => {
    await renderSectionWithRoleFlagsRow();
    expect(
      screen.getByText(
        "In 'II - RIA Investment Forum', Doug Larson's role changed from A1 to A1 + LEAD. Lead changes must be confirmed in the show page.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("per-show-alert-identity")).toBeNull();
  });

  test("keeps the identity line when the template cannot resolve (guard path)", async () => {
    // AMBIGUOUS_EMAIL_BINDING (an INLINE_IDENTITY_CODES member) with its
    // message params stubbed to omit show-name/crew-row-count: the template
    // fails to interpolate (safeDougFacingTemplate → null), so the component
    // falls back to "Something needs your attention on this show." AND keeps
    // the identity chip visible — a regression pin proving the chip is a
    // fail-safe that never drops just because a code is a member, only when
    // its template actually resolved.
    await renderSectionWithUnresolvedMemberTemplate();
    const row = screen.getByTestId("per-show-alert-unresolved-member-1");
    expect(row.textContent).toContain("Something needs your attention on this show.");
    expect(screen.getByTestId("per-show-alert-identity")).toBeInTheDocument();
  });

  test("Task 8: always-visible help block never renders, even if a code's helpfulContext were non-null (content moved to /help/errors)", async () => {
    // Every admin code's real catalog helpfulContext is already null
    // post-T7, so a plain fixture render can't distinguish "deleted" from
    // "happened not to trigger." Force messageFor().helpfulContext to a
    // non-null sentinel via the module mock above and prove the block still
    // never renders and the sentinel text never appears anywhere in the row.
    mockHelpfulContextState.forceHelpfulContext = "SENTINEL_HELP_TEXT_SHOULD_NEVER_RENDER";
    setAlerts([
      {
        id: "help-block-1",
        code: "SHOW_UNPUBLISHED",
        raised_at: "2026-05-04T10:00:00Z",
      },
    ]);
    const { getByTestId, queryByTestId, queryByText } = await renderSection();
    // Sanity: the row itself still renders (the deletion didn't break the row).
    expect(getByTestId("per-show-alert-help-block-1")).not.toBeNull();
    expect(queryByTestId("per-show-alert-help-help-block-1")).toBeNull();
    expect(queryByText("What does this mean?")).toBeNull();
    expect(queryByText("SENTINEL_HELP_TEXT_SHOULD_NEVER_RENDER")).toBeNull();
  });
});
