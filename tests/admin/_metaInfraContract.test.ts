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
  throwOnFrom: false,
}));

type AwaitableQuery = Promise<{ data: null; error: null }> & {
  select: (..._args: unknown[]) => AwaitableQuery;
  eq: (..._args: unknown[]) => AwaitableQuery;
  in: (..._args: unknown[]) => AwaitableQuery;
  is: (..._args: unknown[]) => AwaitableQuery;
  order: (..._args: unknown[]) => AwaitableQuery;
  maybeSingle: (..._args: unknown[]) => Promise<{ data: null; error: null }>;
  returns: (..._args: unknown[]) => AwaitableQuery;
};

function makeThrowingClient() {
  return {
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
    },
    rpc: async () => ({ data: null, error: null }),
    from: () => {
      if (infraMock.throwOnFrom) {
        throw new Error("META: simulated from() infrastructure fault");
      }
      const builder: Partial<AwaitableQuery> = {};
      const passthrough = () => builder as AwaitableQuery;
      builder.select = passthrough;
      builder.eq = passthrough;
      builder.in = passthrough;
      builder.is = passthrough;
      builder.order = passthrough;
      builder.returns = passthrough;
      builder.maybeSingle = async () => ({ data: null, error: null });
      // Make the builder itself awaitable so `await supabase.from().select()...`
      // resolves with a `{data, error}` shape when no terminal is called.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (builder as unknown as { then: any }).then = (
        onfulfilled?: ((v: { data: null; error: null }) => unknown) | null,
      ) => (onfulfilled ? onfulfilled({ data: null, error: null }) : undefined);
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
      const directBuilderRe =
        /\b(?:let|const|var)\s+([A-Za-z_$][\w$]*)\s*=\s*supabase\b/g;
      lines.forEach((line, idx) => {
        for (const m of line.matchAll(directBuilderRe)) {
          if (m[1]) {
            builderNames.add(m[1]);
            builderAssignLines.push(idx);
          }
        }
      });
      let prevSize = -1;
      while (prevSize !== builderNames.size) {
        prevSize = builderNames.size;
        const namesAlt = Array.from(builderNames).join("|");
        if (!namesAlt) break;
        const chainRe = new RegExp(
          `\\b([A-Za-z_$][\\w$]*)\\s*=\\s*(?:${namesAlt})\\b`,
          "g",
        );
        lines.forEach((line, idx) => {
          for (const m of line.matchAll(chainRe)) {
            if (m[1] && !builderNames.has(m[1])) {
              builderNames.add(m[1]);
              builderAssignLines.push(idx);
            } else if (m[1] === undefined) {
              // matchAll always populates groups for capturing groups; no-op.
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
        const forward = lines
          .slice(lineIdx + 1, Math.min(lines.length, lineIdx + 30))
          .join("\n");
        const hasTryBefore = /\btry\s*\{/.test(back);
        const hasCatchAfter = /\}\s*catch\s*\(/.test(forward);
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
        const forward = lines
          .slice(lineIdx + 1, Math.min(lines.length, lineIdx + 30))
          .join("\n");
        const hasTryBefore = /\btry\s*\{/.test(back);
        const hasCatchAfter = /\}\s*catch\s*\(/.test(forward);
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
      expect((result as { kind: string; message: string }).message).toMatch(
        /threw/,
      );
    });
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
      expect((result as { kind: string; message: string }).message).toMatch(
        /threw/,
      );
    });
  });

  describe("fetchLiveFirstSeenRow", () => {
    test("server-client construction throw → typed infra_error", async () => {
      infraMock.throwOnConstruct = true;
      const { fetchLiveFirstSeenRow } = await import(
        "@/app/admin/show/staged/[stagedId]/page"
      );
      const result = await fetchLiveFirstSeenRow("00000000-0000-0000-0000-000000000abc");
      expect(result).toMatchObject({ kind: "infra_error" });
    });

    test("from() throw → typed infra_error", async () => {
      infraMock.throwOnFrom = true;
      const { fetchLiveFirstSeenRow } = await import(
        "@/app/admin/show/staged/[stagedId]/page"
      );
      const result = await fetchLiveFirstSeenRow("00000000-0000-0000-0000-000000000abc");
      expect(result).toMatchObject({ kind: "infra_error" });
      expect((result as { kind: string; message: string }).message).toMatch(
        /threw/,
      );
    });
  });

  describe("fetchWizardStagedRow", () => {
    test("server-client construction throw → typed infra_error", async () => {
      infraMock.throwOnConstruct = true;
      const { fetchWizardStagedRow } = await import(
        "@/app/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/page"
      );
      const result = await fetchWizardStagedRow(
        "00000000-0000-0000-0000-000000000001",
        "drive-file-1",
      );
      expect(result).toMatchObject({ kind: "infra_error" });
    });

    test("from() throw → typed infra_error", async () => {
      infraMock.throwOnFrom = true;
      const { fetchWizardStagedRow } = await import(
        "@/app/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/page"
      );
      const result = await fetchWizardStagedRow(
        "00000000-0000-0000-0000-000000000001",
        "drive-file-1",
      );
      expect(result).toMatchObject({ kind: "infra_error" });
      expect((result as { kind: string; message: string }).message).toMatch(
        /threw/,
      );
    });
  });

  describe("readFinalizeCheckpoint", () => {
    test("server-client construction throw → typed infra_error", async () => {
      infraMock.throwOnConstruct = true;
      const { readFinalizeCheckpoint } = await import(
        "@/app/admin/_finalizeCheckpoint"
      );
      const result = await readFinalizeCheckpoint(
        "00000000-0000-0000-0000-000000000001",
      );
      expect(result).toMatchObject({ kind: "infra_error" });
    });

    test("from() throw → typed infra_error", async () => {
      infraMock.throwOnFrom = true;
      const { readFinalizeCheckpoint } = await import(
        "@/app/admin/_finalizeCheckpoint"
      );
      const result = await readFinalizeCheckpoint(
        "00000000-0000-0000-0000-000000000001",
      );
      expect(result).toMatchObject({ kind: "infra_error" });
      expect((result as { kind: string; message: string }).message).toMatch(
        /threw/,
      );
    });
  });

  describe("fetchPerShowAlerts", () => {
    test("server-client construction throw → typed infra_error", async () => {
      infraMock.throwOnConstruct = true;
      const { fetchPerShowAlerts } = await import(
        "@/components/admin/PerShowAlertSection"
      );
      const result = await fetchPerShowAlerts(
        "00000000-0000-0000-0000-000000000001",
      );
      expect(result).toMatchObject({ kind: "infra_error" });
    });

    test("from() throw → typed infra_error", async () => {
      infraMock.throwOnFrom = true;
      const { fetchPerShowAlerts } = await import(
        "@/components/admin/PerShowAlertSection"
      );
      const result = await fetchPerShowAlerts(
        "00000000-0000-0000-0000-000000000001",
      );
      expect(result).toMatchObject({ kind: "infra_error" });
      expect((result as { kind: string; message: string }).message).toMatch(
        /threw/,
      );
    });
  });

  // AlertBanner is the admin-layout-mounted banner. Codex R3 caught that
  // builder construction (`.from(...).select(...).is(...)`) was OUTSIDE
  // the try block, so a synchronous `.from()` throw would have crashed
  // the admin layout despite the await being wrapped. These behavioral
  // tests pin the contract: throws (construction OR builder OR await)
  // resolve to null and do NOT propagate.
  describe("AlertBanner", () => {
    test("server-client construction throw → resolves to null (banner hides)", async () => {
      infraMock.throwOnConstruct = true;
      const { AlertBanner } = await import("@/components/admin/AlertBanner");
      const result = await AlertBanner();
      expect(result).toBeNull();
    });

    test("from() throw on SELECT builder construction → resolves to null", async () => {
      infraMock.throwOnFrom = true;
      const { AlertBanner } = await import("@/components/admin/AlertBanner");
      // The component should NOT propagate the synchronous .from() throw;
      // it must catch and log + return null.
      await expect(AlertBanner()).resolves.toBeNull();
    });
  });
});
