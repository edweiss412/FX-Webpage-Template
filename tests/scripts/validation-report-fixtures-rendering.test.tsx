// @vitest-environment jsdom
/**
 * tests/scripts/validation-report-fixtures-rendering.test.tsx — M12 Phase 0.E
 * Task 0.E.2 (R31 rewrite — per-outcome rendering predicate).
 *
 * The harness's value is RENDERING. This suite pins the per-outcome rendering
 * predicate from the plan's R31 canonical table:
 *   • 6 catalog-flowing codes (IDEMPOTENCY_IN_FLIGHT / REPORT_RATE_LIMITED_ADMIN
 *     / REPORT_RATE_LIMITED_CREW / REPORT_HORIZON_EXPIRED / REPORT_LOOKUP_INCONCLUSIVE
 *     / REPORT_ORPHANED_LOST_LEASE) — messageFor(code).dougFacing is non-null.
 *     Anti-tautology: asserted against the MESSAGE_CATALOG literal, NOT just a
 *     non-null messageFor() round-trip.
 *   • 2 admin_alerts-surfacing outcomes (lookup-inconclusive, orphaned-lost-lease):
 *     the HARNESS's seeded row survives AlertBanner's SELECT predicate (NOT
 *     excluded as info-severity), proving AlertBanner's admin-RLS SELECT shape
 *     (components/admin/AlertBanner.tsx:97) would return it.
 *   • AlertBanner RENDER of REPORT_LOOKUP_INCONCLUSIVE under the anti-tautology
 *     DOM-clone guard — clone the tree, remove the message element, assert the
 *     dougFacing copy does not appear elsewhere (so the pass depends on the
 *     message element rendering it, not a stray sibling).
 */
import { afterAll, beforeAll, afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { createClient } from "@supabase/supabase-js";

import { AlertBanner } from "@/components/admin/AlertBanner";
import {
  MESSAGE_CATALOG,
  type MessageCatalogEntry,
  type MessageCode,
} from "@/lib/messages/catalog";
import { messageFor } from "@/lib/messages/lookup";
import { safeValidationCleanup } from "../db/_validation-cleanup-helpers";
import {
  LOCAL_SERVICE_ROLE_KEY,
  LOCAL_SUPABASE_URL,
  mintCombo,
  reportFixturesCleanup,
  runHarness,
  showIdByDrive,
} from "./_report-fixtures-helpers";

vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

// HelpAffordance (Client Component using usePathname) mounts inside AlertBanner;
// AlertBannerRouteBoundary (RECON-1) additionally reads useSearchParams for its
// remount key, so the mock must provide it too.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(""),
}));

// ── AlertBanner render mock (Group C) ──────────────────────────────────
// Mirrors the production SELECT chain shape (data probe via .order().limit(1)
// + count probe via head:true). `from()` returns a fresh builder per call.
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
      return { from: () => createBuilder() };
    },
  };
});

function setRows(
  rows: Array<{
    id: string;
    code: string;
    raised_at: string;
    show_id: string | null;
    context?: Record<string, unknown> | null;
    shows?: { slug: string } | null;
    resolved_at?: string | null;
  }>,
) {
  mockState.rows = [...rows]
    .map((r) => ({
      ...r,
      context: r.context ?? null,
      shows: r.shows ?? null,
      resolved_at: r.resolved_at ?? null,
    }))
    .sort((a, b) => new Date(b.raised_at).getTime() - new Date(a.raised_at).getTime());
}

// AlertBanner's INFO_SEVERITY exclusion list, recomputed exactly as
// components/admin/AlertBanner.tsx:57 derives it.
const INFO_SEVERITY_CODES: string[] = (Object.values(MESSAGE_CATALOG) as MessageCatalogEntry[])
  .filter((entry) => entry.severity === "info")
  .map((entry) => entry.code);

// ─────────────────────────────────────────────────────────────────────
// Group A — catalog completeness for the 6 catalog-flowing codes
// ─────────────────────────────────────────────────────────────────────

describe("Group A — catalog completeness (messageFor predicate)", () => {
  const CATALOG_FLOWING_CODES = [
    "IDEMPOTENCY_IN_FLIGHT",
    "REPORT_RATE_LIMITED_ADMIN",
    "REPORT_RATE_LIMITED_CREW",
    "REPORT_HORIZON_EXPIRED",
    "REPORT_LOOKUP_INCONCLUSIVE",
    "REPORT_ORPHANED_LOST_LEASE",
  ] as const satisfies readonly MessageCode[];

  // Each code surfaces to exactly ONE audience: admin/Doug codes carry
  // `dougFacing`; the crew rate-limit code carries `crewFacing` (it's shown to
  // a crew member, not Doug). The plan's Task 0.E.2 line 195 predicate names
  // `dougFacing` for rate-limit-crew, but the live catalog (catalog.ts:858)
  // deliberately leaves dougFacing null and puts the crew copy in crewFacing.
  // The audience-agnostic predicate below — non-empty copy in at least one
  // facing field — is the correct, drift-proof form. (Flagged for orchestrator
  // triage: plan line 195 should cite crewFacing for the crew code.)
  for (const code of CATALOG_FLOWING_CODES) {
    test(`messageFor('${code}') resolves to non-empty user-facing copy (catalog literal)`, () => {
      const entry = MESSAGE_CATALOG[code];
      const facing = entry.dougFacing ?? entry.crewFacing;
      // Anti-tautology: assert the catalog SOURCE actually has copy, not just
      // that messageFor round-trips a possibly-null value.
      expect(typeof facing).toBe("string");
      expect((facing ?? "").length).toBeGreaterThan(0);
      // messageFor() resolves the same code to the same catalog entry.
      const resolved = messageFor(code);
      expect(resolved.dougFacing ?? resolved.crewFacing).toBe(facing);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────
// Group B — harness admin_alerts rows survive AlertBanner's SELECT filter
// ─────────────────────────────────────────────────────────────────────

describe("Group B — harness rows survive AlertBanner SELECT predicate", () => {
  const R1_DRIVE = "validation_R1";
  let supabase: ReturnType<typeof createClient>;

  beforeAll(() => {
    safeValidationCleanup();
    reportFixturesCleanup();
    mintCombo("R1", "M12 Validation — Phase0E rendering R1");
    if (!showIdByDrive(R1_DRIVE)) {
      throw new Error("Group B mint setup failed: no R1 show");
    }
    // Seed the two admin_alerts-surfacing outcomes via the harness.
    const li = runHarness([
      "--outcome",
      "lookup-inconclusive",
      "--alert-code",
      "inconclusive",
      "--combo",
      "R1",
    ]);
    expect(li.code).toBe(0);
    const orphan = runHarness(["--outcome", "orphaned-lost-lease", "--combo", "R1"]);
    expect(orphan.code).toBe(0);

    supabase = createClient(LOCAL_SUPABASE_URL, LOCAL_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  afterAll(() => {
    reportFixturesCleanup();
    safeValidationCleanup();
  });

  test("AlertBanner SELECT shape returns both harness codes (not info-severity excluded)", async () => {
    let query = supabase
      .from("admin_alerts")
      .select("code, context")
      .is("resolved_at", null)
      .like("context->>validation_tag", "m12-fixture-%");
    if (INFO_SEVERITY_CODES.length > 0) {
      query = query.not("code", "in", `(${INFO_SEVERITY_CODES.map((c) => `"${c}"`).join(",")})`);
    }
    const { data, error } = await query.order("raised_at", { ascending: false });
    expect(error).toBeNull();
    const codes = (data ?? []).map((r) => (r as { code: string }).code);
    // The harness's seeded codes must be present (not filtered out) — proving
    // AlertBanner's admin-RLS SELECT shape would surface them.
    expect(codes).toContain("REPORT_LOOKUP_INCONCLUSIVE");
    expect(codes).toContain("REPORT_ORPHANED_LOST_LEASE");
  });

  test("neither harness code is itself an info-severity code (would never reach the banner)", () => {
    expect(INFO_SEVERITY_CODES).not.toContain("REPORT_LOOKUP_INCONCLUSIVE");
    expect(INFO_SEVERITY_CODES).not.toContain("REPORT_ORPHANED_LOST_LEASE");
  });
});

// ─────────────────────────────────────────────────────────────────────
// Group C — AlertBanner render with anti-tautology DOM-clone guard
// ─────────────────────────────────────────────────────────────────────

describe("Group C — AlertBanner renders harness admin_alerts code", () => {
  afterEach(() => {
    cleanup();
    mockState.rows = [];
  });

  // The two codes the harness routes through AlertBanner.
  const ALERT_BANNER_CODES = [
    "REPORT_LOOKUP_INCONCLUSIVE",
    "REPORT_ORPHANED_LOST_LEASE",
  ] as const satisfies readonly MessageCode[];

  for (const code of ALERT_BANNER_CODES) {
    test(`renders dougFacing copy for '${code}' (anti-tautology DOM clone)`, async () => {
      // Topmost = target code; a DIFFERENT code queued as an older sibling so
      // the queue-chip path engages and we can prove the message came from the
      // message element, not the sibling.
      const sibling: MessageCode =
        code === "REPORT_LOOKUP_INCONCLUSIVE"
          ? "REPORT_ORPHANED_LOST_LEASE"
          : "REPORT_LOOKUP_INCONCLUSIVE";
      setRows([
        {
          id: `target-${code}`,
          code,
          raised_at: "2026-05-27T12:00:00Z",
          show_id: "11111111-1111-4111-8111-111111111111",
          context: { validation_tag: `m12-fixture-${code}` },
          shows: { slug: "validation-r1" },
        },
        {
          id: `sibling-${sibling}`,
          code: sibling,
          raised_at: "2026-05-27T09:00:00Z",
          show_id: "11111111-1111-4111-8111-111111111111",
          context: null,
          shows: { slug: "validation-r1" },
        },
      ]);
      const { getByTestId, container } = render(await AlertBanner());

      const literal = MESSAGE_CATALOG[code].dougFacing;
      expect(typeof literal).toBe("string");
      // The message element renders the TARGET code's catalog copy.
      expect(getByTestId("error-explainer-message").textContent).toBe(literal);

      // Anti-tautology: clone the rendered tree, remove BOTH legitimate render
      // sites of the target's dougFacing, and assert the copy does NOT appear
      // anywhere else (e.g. via the queue chip or the OLDER SIBLING alert's
      // render). RECON-1 (spec §3.3) renders the top alert's message twice — the
      // full block in the panel's `error-explainer-message` AND the inline
      // truncated `admin-alert-message` one-liner in the <summary> — so both must
      // be removed before the "not elsewhere" check. The line-319 assertion above
      // still genuinely depends on `error-explainer-message` rendering the literal.
      const clone = container.cloneNode(true) as HTMLElement;
      clone
        .querySelectorAll(
          '[data-testid="error-explainer-message"], [data-testid="admin-alert-message"]',
        )
        .forEach((el) => el.remove());
      expect(clone.innerHTML).not.toContain(literal as string);
    });
  }
});
