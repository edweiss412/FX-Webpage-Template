/**
 * tests/admin/_metaInfraContract.test.ts (M10 close-out R6 §B)
 *
 * THE PROBLEM:
 *   Five consecutive M10 adversarial-review rounds (Phase 1 §B + Phase 2 §B +
 *   Phase 3 §B + close-out R1..R5) inspected every §B Supabase call site and
 *   approved a pattern that LOOKS correct:
 *
 *     const q = await supabase.from("T").select("...");
 *     if (q.error) return { kind: "infra_error", message: ... };
 *
 *   The pattern handles the RETURNED-`.error` branch but silently propagates
 *   a THROWN error from inside `await supabase`. A Supabase throw happens
 *   on auth-token expiration mid-query, network reset, RLS reject inside
 *   the postgrest client, or service-role construction faults. None of
 *   that surfaced in §B until R6 grep'd the "subject-to-typed-result"
 *   helpers and found six holes in OnboardingWizard, Dashboard, and the
 *   live first-seen staged page. Class-sweep then surfaced peers in
 *   `_finalizeCheckpoint.ts`, `PerShowAlertSection`, the wizard
 *   re-apply page, and `/admin/show/[slug]`.
 *
 * THE META-DISCIPLINE:
 *   Each helper subject to the §B Supabase call-boundary contract has a
 *   row in `infraRegistry` below. The registry asserts two things:
 *     1. the helper is grep-visible in the path it claims to live at
 *        (the registry doesn't go stale silently after refactor);
 *     2. the helper, when invoked with a Supabase client whose `.from()`
 *        throws synchronously OR whose query builder rejects mid-await,
 *        returns `{ kind: "infra_error", message: <descriptive> }`
 *        instead of letting the throw propagate as an uncaught framework
 *        exception.
 *
 *   New §B Supabase-touching helpers MUST register themselves here. The
 *   alternative is the per-call-site `not-subject-to-meta: <reason>`
 *   comment when the surface intentionally relies on Next.js error-
 *   boundary propagation (e.g., server-action mutations, dev-only
 *   scaffolding behind a build-gated route).
 *
 * This is the §B sibling of tests/auth/_metaInfraContract.test.ts (M5
 * R18) and tests/sync/_metaInfraContract.test.ts (M6).
 */
import { beforeEach, describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const infraMock = vi.hoisted(() => ({
  throwOnConstruct: false,
  // Global throw-on-any-from() — the first call throws.
  throwOnFrom: false,
  // Per-table throw: if set, only the named table's .from() call throws.
  // Lets later-query assertions exercise the throw path independently of
  // the first .from() reachable in a multi-query helper (Codex R6 #1).
  throwOnFromTable: null as string | null,
  // Per-table data seed: lets a test set data for one table (so later
  // queries are reached) while another table's .from() throws. Without
  // this, the default maybeSingle/limit/etc resolves with null data,
  // and helpers that gate later queries on first-query data (e.g.
  // fetchLiveFirstSeenRow's shows lookup runs only if pending_syncs
  // returned a row) never exercise their later branches.
  dataByTable: {} as Record<string, unknown>,
}));

type AwaitableQuery = Promise<{ data: null; error: null }> & {
  select: (..._args: unknown[]) => AwaitableQuery;
  eq: (..._args: unknown[]) => AwaitableQuery;
  in: (..._args: unknown[]) => AwaitableQuery;
  is: (..._args: unknown[]) => AwaitableQuery;
  order: (..._args: unknown[]) => AwaitableQuery;
  limit: (..._args: unknown[]) => AwaitableQuery;
  range: (..._args: unknown[]) => AwaitableQuery;
  maybeSingle: (..._args: unknown[]) => Promise<{ data: null; error: null }>;
  returns: (..._args: unknown[]) => AwaitableQuery;
};

function makeThrowingClient() {
  return {
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
    },
    rpc: async () => ({ data: null, error: null }),
    from: (table?: string) => {
      if (infraMock.throwOnFrom) {
        throw new Error("META: simulated from() infrastructure fault");
      }
      if (
        infraMock.throwOnFromTable !== null &&
        typeof table === "string" &&
        table === infraMock.throwOnFromTable
      ) {
        throw new Error(`META: simulated from('${table}') infrastructure fault`);
      }
      const seededData =
        typeof table === "string" && table in infraMock.dataByTable
          ? (infraMock.dataByTable[table] as unknown)
          : null;
      // `count` mirrors a healthy head:true response (seeded rows' length,
      // else 0) so helpers with a count-integrity guard (loadNeedsAttention:
      // non-number head-count → infra_error, R2-F3) proceed past earlier
      // head-counts and reach the table under test in per-table throw cases.
      const result = {
        data: seededData,
        error: null,
        count: Array.isArray(seededData) ? seededData.length : 0,
      } as {
        data: unknown;
        error: null;
        count: number;
      };
      const builder: Partial<AwaitableQuery> = {};
      const passthrough = () => builder as AwaitableQuery;
      builder.select = passthrough;
      builder.eq = passthrough;
      builder.in = passthrough;
      builder.is = passthrough;
      builder.order = passthrough;
      builder.limit = passthrough;
      builder.range = passthrough;
      builder.returns = passthrough;
      builder.maybeSingle = async () => result as { data: null; error: null };
      // Make the builder itself awaitable so `await supabase.from().select()...`
      // resolves with a `{data, error}` shape when no terminal is called.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (builder as unknown as { then: any }).then = (
        onfulfilled?: ((v: { data: unknown; error: null }) => unknown) | null,
      ) => (onfulfilled ? onfulfilled(result) : undefined);
      return builder as AwaitableQuery;
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => {
    if (infraMock.throwOnConstruct) {
      throw new Error("META: simulated server-client construction fault");
    }
    return makeThrowingClient();
  },
  createSupabaseServiceRoleClient: () => {
    if (infraMock.throwOnConstruct) {
      throw new Error("META: simulated service-role construction fault");
    }
    return makeThrowingClient();
  },
}));

vi.mock("@/lib/auth/requireAdmin", () => ({
  requireAdmin: async () => {},
  requireAdminIdentity: async () => ({ email: "admin@example.com" }),
  AdminInfraError: class AdminInfraError extends Error {},
}));

beforeEach(() => {
  infraMock.throwOnConstruct = false;
  infraMock.throwOnFrom = false;
  infraMock.throwOnFromTable = null;
  infraMock.dataByTable = {};
});

const REPO_ROOT = join(__dirname, "..", "..");
function read(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf8");
}

// Registry of §B helpers subject to the Supabase call-boundary contract.
// Each row gets a "helper exists" grep assertion AND, where the helper is
// directly importable, a behavioral assertion (mock .from() to throw, check
// the helper returns typed infra_error).
const infraRegistry = [
  {
    helper: "fetchStep3Data",
    path: "components/admin/OnboardingWizard.tsx",
    contract: "manifest/pending_syncs/pending_ingestions await throws → infra_error",
  },
  {
    helper: "fetchDashboardData",
    path: "components/admin/Dashboard.tsx",
    contract: "shows/crew/pending_ingestions/pending_syncs await throws → infra_error",
  },
  {
    helper: "fetchLiveFirstSeenRow",
    path: "app/admin/show/staged/[stagedId]/page.tsx",
    contract: "pending_syncs + shows lookup await throws → infra_error",
  },
  {
    helper: "fetchWizardStagedRow",
    path: "app/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/page.tsx",
    contract: "pending_syncs await throws → infra_error",
  },
  {
    helper: "readFinalizeCheckpoint",
    path: "app/admin/_finalizeCheckpoint.ts",
    contract: "wizard_finalize_checkpoints await throws → infra_error",
  },
  {
    helper: "fetchPerShowAlerts",
    path: "components/admin/PerShowAlertSection.tsx",
    contract: "admin_alerts await throws → infra_error",
  },
  {
    helper: "lookupShow",
    path: "app/admin/show/[slug]/preview/[crewId]/page.tsx",
    contract: "shows lookup throws → { kind: 'infra_error' }",
  },
  {
    helper: "lookupCrewMember",
    path: "app/admin/show/[slug]/preview/[crewId]/page.tsx",
    contract: "crew_members lookup throws → { kind: 'infra_error' }",
  },
  {
    helper: "loadNeedsAttention",
    path: "lib/admin/loadNeedsAttention.ts",
    contract:
      "pending_ingestions/pending_syncs/shows await throws + construction throw → infra_error",
  },
  {
    helper: "loadNeedsAttentionCount",
    path: "lib/admin/needsAttentionCount.ts",
    contract:
      "pending_ingestions/pending_syncs head-count throws + construction throw → infra_error",
  },
  {
    helper: "fetchUnresolvedAlertCount",
    path: "lib/admin/alertCount.ts",
    contract:
      "admin_alerts head:true count; client construction + await/throw → { kind:'infra_error' }; count=0 is the ONLY clean state (feeds NotifBell badge + AlertBanner +N chip, no drift)",
  },
  {
    helper: "getActiveWatchedFolder",
    path: "lib/appSettings/getWatchedFolderId.ts",
    contract:
      "app_settings { watched_folder_id, watched_folder_name } maybeSingle; client construction (createClientResult) + returned-error + thrown await → { kind:'infra_error' }; destructures { data, error }",
  },
  {
    helper: "fetchDriveConnectionHealth",
    path: "lib/admin/driveConnectionHealth.ts",
    contract:
      "watch-status row + per-predicate active-shows head:true counts + max last_synced_at; client construction + any await/throw → { kind:'infra_error' } (never a false Healthy)",
  },
];

// Every helper file gets a grep-shape assertion that EVERY supabase-derived
// await (including builder variables like `await query`) is enclosed in
// try/catch. This closes Codex R1 #1 (behavioral test short-circuits at the
// first failing query, missing regressions in later queries) AND Codex R2
// #1 (grep rule missing builder-variable awaits like AlertBanner's
// `await query.order(...)` and `await countQuery`).
const grepShapeRegistry = [
  ...infraRegistry.map((r) => ({
    surface: r.path,
    contract: r.contract,
  })),
  {
    surface: "app/admin/show/[slug]/page.tsx",
    contract:
      "supabase client construction + shows/pending_syncs/crew_members awaits each wrapped in try/catch",
  },
  {
    surface: "components/admin/AlertBanner.tsx",
    contract:
      "supabase client construction + admin_alerts SELECT + count probe (builder-variable awaits) each wrapped in try/catch",
  },
];

describe("META §B Supabase call-boundary contract", () => {
  test("every helper registered here grep-resolves to a real source path", () => {
    for (const entry of infraRegistry) {
      const source = read(entry.path);
      expect(source, `${entry.helper} registry row points at missing source`).toContain(
        entry.helper,
      );
      expect(entry.contract.length).toBeGreaterThan(0);
    }
  });

  test("every grep-shape surface has every supabase-derived await enclosed in try/catch", () => {
    // Heuristic: for each AWAIT-OF-SUPABASE-DERIVED-VALUE line, require
    // BOTH a `try {` within the preceding 20 lines AND a `} catch` within
    // the following 30 lines. Brace-counting against TypeScript would
    // need a real parser to handle destructuring braces; the proximity
    // rule is robust enough to catch the R6 bug shape (raw await with no
    // try wrapper) while tolerating the existing helper file styles.
    //
    // Codex R6 R2 update: the rule originally matched only literal
    // `await supabase` — that missed AlertBanner's `await query` and
    // `await countQuery` builder-variable pattern. The rule now also
    // matches `await <ident>` where `<ident>` is a query-builder
    // variable assigned from `supabase.from(...).<...>` or from a
    // prior builder variable in the same file (fixpoint walk catches
    // chained reassignments).
    for (const entry of grepShapeRegistry) {
      const source = read(entry.surface);
      const lines = source.split("\n");

      // 1. Identify builder-variable names assigned from `supabase` (or
      //    chain-assigned from an already-known builder name). Capture
      //    the line indices of every assignment for the synchronous-throw
      //    check (Codex R4: `<ident> = supabase.from(...)` must also be
      //    inside try/catch because `.from()` is a synchronous throw site).
      const builderNames = new Set<string>();
      const builderAssignLines: number[] = [];
      const directBuilderRe = /\b(?:let|const|var)\s+([A-Za-z_$][\w$]*)\s*=\s*supabase\b/g;
      lines.forEach((line, idx) => {
        for (const m of line.matchAll(directBuilderRe)) {
          if (m[1]) {
            builderNames.add(m[1]);
            builderAssignLines.push(idx);
          }
        }
      });
      // Run chain-walk to fixpoint AND collect every chain-assignment
      // line index — including SAME-NAME reassignments like
      // `query = query.not(...)`. Codex R5 #2 caught that the prior
      // version added the line to builderAssignLines only when the LHS
      // was a NEW name; same-name reassignments matched chainRe but
      // never got pinned, leaving a regression hole.
      let prevSize = -1;
      while (prevSize !== builderNames.size) {
        prevSize = builderNames.size;
        const namesAlt = Array.from(builderNames).join("|");
        if (!namesAlt) break;
        const chainRe = new RegExp(`\\b([A-Za-z_$][\\w$]*)\\s*=\\s*(?:${namesAlt})\\b`, "g");
        lines.forEach((line, idx) => {
          for (const m of line.matchAll(chainRe)) {
            if (m[1]) {
              builderNames.add(m[1]);
              if (!builderAssignLines.includes(idx)) {
                builderAssignLines.push(idx);
              }
            }
          }
        });
      }

      // 2. Find every line awaiting a supabase-derived expression.
      const awaitLineNumbers: number[] = [];
      const builderAwaitRe =
        builderNames.size > 0
          ? new RegExp(`\\bawait\\s+(?:${Array.from(builderNames).join("|")})\\b`)
          : null;
      lines.forEach((line, idx) => {
        if (/\bawait\s+supabase\b/.test(line)) {
          awaitLineNumbers.push(idx);
          return;
        }
        if (builderAwaitRe && builderAwaitRe.test(line)) {
          awaitLineNumbers.push(idx);
        }
      });
      expect(
        awaitLineNumbers.length,
        `${entry.surface} should contain at least one supabase-derived await`,
      ).toBeGreaterThan(0);

      // 3. Assert every supabase-derived await is inside a try/catch.
      for (const lineIdx of awaitLineNumbers) {
        const back = lines.slice(Math.max(0, lineIdx - 20), lineIdx).join("\n");
        const forward = lines.slice(lineIdx + 1, Math.min(lines.length, lineIdx + 30)).join("\n");
        const hasTryBefore = /\btry\s*\{/.test(back);
        const hasCatchAfter = /\}\s*catch\s*[({]/.test(forward);
        expect(
          hasTryBefore && hasCatchAfter,
          `${entry.surface}: supabase-derived await at line ${lineIdx + 1} (${lines[lineIdx]?.trim()}) is not inside a try/catch (try-before=${hasTryBefore}, catch-after=${hasCatchAfter})`,
        ).toBe(true);
      }

      // 4. Codex R4 #1: every BUILDER ASSIGNMENT line is ALSO inside a
      //    try/catch, because `.from()` can throw synchronously and a
      //    throw at the assignment bypasses any wrapping that exists
      //    only around the later await. The grep-shape rule had a blind
      //    spot here — the COUNT-construction regression Codex flagged
      //    would have re-introduced an unwrapped `supabase.from(...)`
      //    despite the await staying inside its try.
      for (const lineIdx of builderAssignLines) {
        const back = lines.slice(Math.max(0, lineIdx - 20), lineIdx).join("\n");
        const forward = lines.slice(lineIdx + 1, Math.min(lines.length, lineIdx + 30)).join("\n");
        const hasTryBefore = /\btry\s*\{/.test(back);
        const hasCatchAfter = /\}\s*catch\s*[({]/.test(forward);
        expect(
          hasTryBefore && hasCatchAfter,
          `${entry.surface}: supabase builder assignment at line ${lineIdx + 1} (${lines[lineIdx]?.trim()}) is not inside a try/catch (try-before=${hasTryBefore}, catch-after=${hasCatchAfter}). \`.from()\` is a synchronous throw site; the assignment MUST be inside the try, not just the eventual await.`,
        ).toBe(true);
      }
    }
  });

  describe("fetchStep3Data", () => {
    test("server-client construction throw → typed infra_error", async () => {
      infraMock.throwOnConstruct = true;
      const { fetchStep3Data } = await import("@/components/admin/OnboardingWizard");
      const result = await fetchStep3Data("00000000-0000-0000-0000-000000000001");
      expect(result).toMatchObject({ kind: "infra_error" });
    });

    test("from() throw → typed infra_error", async () => {
      infraMock.throwOnFrom = true;
      const { fetchStep3Data } = await import("@/components/admin/OnboardingWizard");
      const result = await fetchStep3Data("00000000-0000-0000-0000-000000000001");
      expect(result).toMatchObject({ kind: "infra_error" });
      // The message MUST identify the threw-path, not the .error-path —
      // that's the contract that R6 found violated.
      expect((result as { kind: string; message: string }).message).toMatch(/threw/);
    });

    // Codex R6 #1: pin each individual table's throw path so a regression
    // in a LATER catch handler (returning null or wrong shape instead of
    // the typed infra_error) cannot slip past the behavioral suite.
    test.each([
      ["onboarding_scan_manifest", /onboarding_scan_manifest.*threw/],
      ["pending_syncs", /pending_syncs.*threw/],
      ["pending_ingestions", /pending_ingestions.*threw/],
    ])(
      "from('%s') throw → typed infra_error with table-specific message",
      async (table, messageRe) => {
        infraMock.throwOnFromTable = table;
        const { fetchStep3Data } = await import("@/components/admin/OnboardingWizard");
        const result = await fetchStep3Data("00000000-0000-0000-0000-000000000001");
        expect(result).toMatchObject({ kind: "infra_error" });
        expect((result as { kind: string; message: string }).message).toMatch(messageRe);
      },
    );
  });

  describe("fetchDashboardData", () => {
    test("server-client construction throw → typed infra_error", async () => {
      infraMock.throwOnConstruct = true;
      const { fetchDashboardData } = await import("@/components/admin/Dashboard");
      const result = await fetchDashboardData();
      expect(result).toMatchObject({ kind: "infra_error" });
    });

    test("from() throw → typed infra_error (shows query first)", async () => {
      infraMock.throwOnFrom = true;
      const { fetchDashboardData } = await import("@/components/admin/Dashboard");
      const result = await fetchDashboardData();
      expect(result).toMatchObject({ kind: "infra_error" });
      expect((result as { kind: string; message: string }).message).toMatch(/threw/);
    });

    // Codex R6 #1: pin every query in the pipeline. The shows table is
    // exercised first; crew_members is conditionally reached only when
    // showsRows is non-empty (the mock returns []), so the crew_members-
    // throw path doesn't get exercised here without seeding showsRows.
    // pending_ingestions and pending_syncs ARE reachable on the empty-
    // shows path (the firstSeenStaged block runs regardless because
    // showIds.length >= 0 is always true — that's the unreachable-else
    // shape).
    test.each([
      ["shows", /shows.*threw/],
      ["pending_ingestions", /pending_ingestions.*threw/],
      ["pending_syncs", /pending_syncs.*threw/],
    ])(
      "from('%s') throw → typed infra_error with table-specific message",
      async (table, messageRe) => {
        infraMock.throwOnFromTable = table;
        const { fetchDashboardData } = await import("@/components/admin/Dashboard");
        const result = await fetchDashboardData();
        expect(result).toMatchObject({ kind: "infra_error" });
        expect((result as { kind: string; message: string }).message).toMatch(messageRe);
      },
    );

    test("from('crew_members') throw (with seeded shows row) → typed infra_error", async () => {
      // crew_members lookup only fires if showsRows is non-empty. Seed
      // one shows row so the helper proceeds past the empty-shows
      // short-circuit and into the crew_members query, then throw.
      infraMock.dataByTable = {
        shows: [{ id: "s1", slug: "rpas", drive_file_id: "df-1" }],
      };
      infraMock.throwOnFromTable = "crew_members";
      const { fetchDashboardData } = await import("@/components/admin/Dashboard");
      const result = await fetchDashboardData();
      expect(result).toMatchObject({ kind: "infra_error" });
      expect((result as { kind: string; message: string }).message).toMatch(/crew_members.*threw/);
    });
  });

  // Needs-attention loader (mobile needs-attention Task 1, spec §4.1) —
  // extracted from fetchDashboardData; the same per-table throw matrix
  // applies. The shows existence branch only fires when the pending reads
  // surfaced candidate drive_file_ids, so that case seeds a pending row.
  describe("loadNeedsAttention", () => {
    test("server-client construction throw → typed infra_error", async () => {
      infraMock.throwOnConstruct = true;
      const { loadNeedsAttention } = await import("@/lib/admin/loadNeedsAttention");
      const result = await loadNeedsAttention({ cap: 20 });
      expect(result).toMatchObject({ kind: "infra_error" });
    });

    test.each([
      ["pending_ingestions", /pending_ingestions.*threw/],
      ["pending_syncs", /pending_syncs.*threw/],
    ])(
      "from('%s') throw → typed infra_error with table-specific message",
      async (table, messageRe) => {
        infraMock.throwOnFromTable = table;
        const { loadNeedsAttention } = await import("@/lib/admin/loadNeedsAttention");
        const result = await loadNeedsAttention({ cap: 20 });
        expect(result).toMatchObject({ kind: "infra_error" });
        expect((result as { kind: string; message: string }).message).toMatch(messageRe);
      },
    );

    test("from('shows') throw (with seeded pending_ingestions row) → typed infra_error", async () => {
      // The existence lookup only fires when the pending rows carried
      // drive_file_ids. Seed one pending_ingestions row so the loader
      // proceeds past the empty-id short-circuit into the shows lookup,
      // then throw.
      infraMock.dataByTable = {
        pending_ingestions: [
          {
            id: "ing-1",
            drive_file_id: "df-1",
            drive_file_name: null,
            last_attempt_at: null,
            last_error_code: null,
          },
        ],
      };
      infraMock.throwOnFromTable = "shows";
      const { loadNeedsAttention } = await import("@/lib/admin/loadNeedsAttention");
      const result = await loadNeedsAttention({ cap: 20 });
      expect(result).toMatchObject({ kind: "infra_error" });
      expect((result as { kind: string; message: string }).message).toMatch(
        /existence query threw/,
      );
    });
  });

  // Badge-count helper (mobile needs-attention Task 2, spec §4.2) — the
  // head-counts-only sibling of loadNeedsAttention. No message field (the
  // badge collapses any infra failure into the no-badge degraded state),
  // so assertions pin the exact { kind: 'infra_error' } shape. The mock's
  // healthy head-count resolves to a NUMBER (0), so the per-table
  // pending_syncs throw is reached past the ingestion count-integrity
  // guard.
  describe("loadNeedsAttentionCount", () => {
    test("server-client construction throw → { kind: 'infra_error' } (never rejects)", async () => {
      infraMock.throwOnConstruct = true;
      const { loadNeedsAttentionCount } = await import("@/lib/admin/needsAttentionCount");
      await expect(loadNeedsAttentionCount()).resolves.toEqual({
        kind: "infra_error",
      });
    });

    test.each([["pending_ingestions"], ["pending_syncs"]])(
      "from('%s') throw → { kind: 'infra_error' }",
      async (table) => {
        infraMock.throwOnFromTable = table;
        const { loadNeedsAttentionCount } = await import("@/lib/admin/needsAttentionCount");
        const result = await loadNeedsAttentionCount();
        expect(result).toEqual({ kind: "infra_error" });
      },
    );
  });

  describe("fetchLiveFirstSeenRow", () => {
    test("server-client construction throw → typed infra_error", async () => {
      infraMock.throwOnConstruct = true;
      const { fetchLiveFirstSeenRow } = await import("@/app/admin/show/staged/[stagedId]/page");
      const result = await fetchLiveFirstSeenRow("00000000-0000-0000-0000-000000000abc");
      expect(result).toMatchObject({ kind: "infra_error" });
    });

    test("from('pending_syncs') throw → typed infra_error", async () => {
      infraMock.throwOnFromTable = "pending_syncs";
      const { fetchLiveFirstSeenRow } = await import("@/app/admin/show/staged/[stagedId]/page");
      const result = await fetchLiveFirstSeenRow("00000000-0000-0000-0000-000000000abc");
      expect(result).toMatchObject({ kind: "infra_error" });
      expect((result as { kind: string; message: string }).message).toMatch(/pending_syncs.*threw/);
    });

    test("from('shows') throw (with seeded pending_syncs row) → typed infra_error", async () => {
      // Codex R6 #1: the shows-lookup branch only fires when pending_syncs
      // returned a row. Seed the pending_syncs maybeSingle result so the
      // helper proceeds past the not_found short-circuit into the shows
      // lookup, then throw.
      infraMock.dataByTable = {
        pending_syncs: {
          staged_id: "stg-1",
          drive_file_id: "df-1",
          staged_modified_time: "2026-05-19T00:00:00.000Z",
          base_modified_time: null,
          parse_result: null,
          triggered_review_items: [],
          source_kind: "manual",
        },
      };
      infraMock.throwOnFromTable = "shows";
      const { fetchLiveFirstSeenRow } = await import("@/app/admin/show/staged/[stagedId]/page");
      const result = await fetchLiveFirstSeenRow("00000000-0000-0000-0000-000000000abc");
      expect(result).toMatchObject({ kind: "infra_error" });
      expect((result as { kind: string; message: string }).message).toMatch(/shows.*threw/);
    });
  });

  describe("fetchWizardStagedRow", () => {
    test("server-client construction throw → typed infra_error", async () => {
      infraMock.throwOnConstruct = true;
      const { fetchWizardStagedRow } =
        await import("@/app/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/page");
      const result = await fetchWizardStagedRow(
        "00000000-0000-0000-0000-000000000001",
        "drive-file-1",
      );
      expect(result).toMatchObject({ kind: "infra_error" });
    });

    test("from() throw → typed infra_error", async () => {
      infraMock.throwOnFrom = true;
      const { fetchWizardStagedRow } =
        await import("@/app/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/page");
      const result = await fetchWizardStagedRow(
        "00000000-0000-0000-0000-000000000001",
        "drive-file-1",
      );
      expect(result).toMatchObject({ kind: "infra_error" });
      expect((result as { kind: string; message: string }).message).toMatch(/threw/);
    });
  });

  describe("readFinalizeCheckpoint", () => {
    test("server-client construction throw → typed infra_error", async () => {
      infraMock.throwOnConstruct = true;
      const { readFinalizeCheckpoint } = await import("@/app/admin/_finalizeCheckpoint");
      const result = await readFinalizeCheckpoint("00000000-0000-0000-0000-000000000001");
      expect(result).toMatchObject({ kind: "infra_error" });
    });

    test("from() throw → typed infra_error", async () => {
      infraMock.throwOnFrom = true;
      const { readFinalizeCheckpoint } = await import("@/app/admin/_finalizeCheckpoint");
      const result = await readFinalizeCheckpoint("00000000-0000-0000-0000-000000000001");
      expect(result).toMatchObject({ kind: "infra_error" });
      expect((result as { kind: string; message: string }).message).toMatch(/threw/);
    });
  });

  describe("fetchPerShowAlerts", () => {
    test("server-client construction throw → typed infra_error", async () => {
      infraMock.throwOnConstruct = true;
      const { fetchPerShowAlerts } = await import("@/components/admin/PerShowAlertSection");
      const result = await fetchPerShowAlerts("00000000-0000-0000-0000-000000000001");
      expect(result).toMatchObject({ kind: "infra_error" });
    });

    test("from() throw → typed infra_error", async () => {
      infraMock.throwOnFrom = true;
      const { fetchPerShowAlerts } = await import("@/components/admin/PerShowAlertSection");
      const result = await fetchPerShowAlerts("00000000-0000-0000-0000-000000000001");
      expect(result).toMatchObject({ kind: "infra_error" });
      expect((result as { kind: string; message: string }).message).toMatch(/threw/);
    });
  });

  // Preview-as impersonation page helpers (R7 named gap). Both helpers
  // wrap the entire body — client construction + builder + await +
  // .error check — in try/catch and return `{ kind: 'infra_error' }`
  // (no message field; the page collapses the failure into the same
  // "We could not load that preview" UI for any infra failure mode).
  // Behavioral tests pin: server-client construction throw + per-table
  // .from() throw both surface as the typed infra_error result.
  describe("lookupShow (preview-as page)", () => {
    test("server-client construction throw → { kind: 'infra_error' }", async () => {
      infraMock.throwOnConstruct = true;
      const { lookupShow } = await import("@/app/admin/show/[slug]/preview/[crewId]/page");
      const result = await lookupShow("any-slug");
      expect(result).toEqual({ kind: "infra_error" });
    });

    test("from('shows') throw → { kind: 'infra_error' }", async () => {
      infraMock.throwOnFromTable = "shows";
      const { lookupShow } = await import("@/app/admin/show/[slug]/preview/[crewId]/page");
      const result = await lookupShow("any-slug");
      expect(result).toEqual({ kind: "infra_error" });
    });
  });

  describe("lookupCrewMember (preview-as page)", () => {
    test("server-client construction throw → { kind: 'infra_error' }", async () => {
      infraMock.throwOnConstruct = true;
      const { lookupCrewMember } = await import("@/app/admin/show/[slug]/preview/[crewId]/page");
      const result = await lookupCrewMember(
        "00000000-0000-0000-0000-000000000001",
        "00000000-0000-0000-0000-0000000000aa",
      );
      expect(result).toEqual({ kind: "infra_error" });
    });

    test("from('crew_members') throw → { kind: 'infra_error' }", async () => {
      infraMock.throwOnFromTable = "crew_members";
      const { lookupCrewMember } = await import("@/app/admin/show/[slug]/preview/[crewId]/page");
      const result = await lookupCrewMember(
        "00000000-0000-0000-0000-000000000001",
        "00000000-0000-0000-0000-0000000000aa",
      );
      expect(result).toEqual({ kind: "infra_error" });
    });
  });

  // AlertBanner is the admin-layout-mounted banner. Codex R3 caught that
  // builder construction (`.from(...).select(...).is(...)`) was OUTSIDE
  // the try block, so a synchronous `.from()` throw would have crashed
  // the admin layout despite the await being wrapped. The try/catch
  // wrapping is still pinned by the grep-shape surface above; these
  // behavioral tests pin the SUCCESSOR contract (M12.2 B1 Task 1.3,
  // fail-visible matrix line 79 / spec §2.4): every infra fault —
  // construction throw, detail returned-error, OR detail thrown — now
  // renders the cataloged degraded banner (`admin-alert-banner-degraded`
  // via ADMIN_ALERT_COUNT_FAILED), NEVER null. A positive/degraded
  // NotifBell count and a null banner would route the operator to an
  // empty /admin#alerts surface, hiding alert context exactly when
  // degraded. Only the genuinely-empty queue (no unresolved rows) still
  // returns null. The throw must still be CAUGHT (not propagated) — it
  // is surfaced as the degraded banner element, not an uncaught throw.
  describe("AlertBanner", () => {
    test("server-client construction throw → degraded banner element, not null", async () => {
      infraMock.throwOnConstruct = true;
      const { AlertBanner } = await import("@/components/admin/AlertBanner");
      const result = await AlertBanner();
      expect(result).not.toBeNull();
      // The caught throw surfaces as the cataloged degraded banner, not a
      // propagated error and not a null (hidden) banner.
      expect(
        (result as { props?: { ["data-testid"]?: string } } | null)?.props?.["data-testid"],
      ).toBe("admin-alert-banner-degraded");
    });

    test("from() throw on SELECT builder construction → degraded banner element, not null", async () => {
      infraMock.throwOnFrom = true;
      const { AlertBanner } = await import("@/components/admin/AlertBanner");
      // The component must NOT propagate the synchronous .from() throw;
      // it catches and renders the degraded banner (fail-visible).
      const result = await AlertBanner();
      expect(result).not.toBeNull();
      expect(
        (result as { props?: { ["data-testid"]?: string } } | null)?.props?.["data-testid"],
      ).toBe("admin-alert-banner-degraded");
    });
  });
});
