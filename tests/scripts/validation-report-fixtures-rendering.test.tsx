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
 *     alert-audience-split reclassified BOTH as `audience: "health"` (developer
 *     report-subsystem diagnostics Doug cannot action). They now flow to the
 *     dev HealthAlertsPanel, NOT Doug's AlertBanner. Group B proves the HARNESS's
 *     seeded rows are EXCLUDED by AlertBanner's real SELECT predicate
 *     (DOUG_SURFACE_EXCLUDED_CODES, components/admin/AlertBanner.tsx:113); Group C
 *     proves AlertBanner does not render them and the raw code never leaks
 *     (invariant 5). Their render coverage lives in the health surface's own
 *     suite (tests/components/healthAlertsPanel.test.tsx).
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
import { DOUG_SURFACE_EXCLUDED_CODES } from "@/lib/messages/adminSurface";
import { HEALTH_CODES } from "@/lib/adminAlerts/audience";
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

  test("AlertBanner's real SELECT predicate EXCLUDES both harness codes (now health-audience)", async () => {
    // Mirror AlertBanner's ACTUAL exclusion (DOUG_SURFACE_EXCLUDED_CODES,
    // AlertBanner.tsx:113) — NOT just the info-severity list. alert-audience-split
    // reclassified both report codes as health, so Doug's banner SELECT must now
    // filter them out. Seeded fixtures + this predicate prove the routing on a
    // live row set.
    let query = supabase
      .from("admin_alerts")
      .select("code, context")
      .is("resolved_at", null)
      .like("context->>validation_tag", "m12-fixture-%");
    if (DOUG_SURFACE_EXCLUDED_CODES.length > 0) {
      query = query.not(
        "code",
        "in",
        `(${DOUG_SURFACE_EXCLUDED_CODES.map((c) => `"${c}"`).join(",")})`,
      );
    }
    const { data, error } = await query.order("raised_at", { ascending: false });
    expect(error).toBeNull();
    const codes = (data ?? []).map((r) => (r as { code: string }).code);
    // Both are health-audience → excluded from Doug's banner (they surface on the
    // dev HealthAlertsPanel instead).
    expect(codes).not.toContain("REPORT_LOOKUP_INCONCLUSIVE");
    expect(codes).not.toContain("REPORT_ORPHANED_LOST_LEASE");
  });

  test("both harness codes are health-audience (in the Doug-surface exclusion set)", () => {
    for (const code of ["REPORT_LOOKUP_INCONCLUSIVE", "REPORT_ORPHANED_LOST_LEASE"]) {
      expect(HEALTH_CODES).toContain(code);
      expect(DOUG_SURFACE_EXCLUDED_CODES).toContain(code);
    }
    // …and they are NOT info-severity (a distinct, orthogonal exclusion axis).
    expect(INFO_SEVERITY_CODES).not.toContain("REPORT_LOOKUP_INCONCLUSIVE");
    expect(INFO_SEVERITY_CODES).not.toContain("REPORT_ORPHANED_LOST_LEASE");
  });
});

// ─────────────────────────────────────────────────────────────────────
// Group C — AlertBanner EXCLUDES the (now health-audience) harness codes
// ─────────────────────────────────────────────────────────────────────

describe("Group C — AlertBanner excludes the health-audience harness codes", () => {
  afterEach(() => {
    cleanup();
    mockState.rows = [];
  });

  // alert-audience-split reclassified both report codes as health; they route to
  // the dev HealthAlertsPanel, so Doug's AlertBanner must NOT render them.
  const HEALTH_ROUTED_CODES = [
    "REPORT_LOOKUP_INCONCLUSIVE",
    "REPORT_ORPHANED_LOST_LEASE",
  ] as const satisfies readonly MessageCode[];

  for (const code of HEALTH_ROUTED_CODES) {
    test(`AlertBanner does not surface '${code}' and never leaks the raw code`, async () => {
      // Seed the code as the ONLY unresolved global alert. AlertBanner's SELECT
      // excludes DOUG_SURFACE_EXCLUDED_CODES (the mock builder honors `.not(in)`),
      // so the health code is filtered out and the banner has nothing to show.
      setRows([
        {
          id: `target-${code}`,
          code,
          raised_at: "2026-05-27T12:00:00Z",
          show_id: "11111111-1111-4111-8111-111111111111",
          context: { validation_tag: `m12-fixture-${code}` },
          shows: { slug: "validation-r1" },
          resolved_at: null,
        },
      ]);
      const { queryByTestId, container } = render(await AlertBanner());

      // No message panel renders (the only candidate row was health-excluded).
      expect(queryByTestId("error-explainer-message")).toBeNull();
      expect(queryByTestId("admin-alert-message")).toBeNull();

      // Invariant 5: the raw code string never leaks into the DOM, and neither
      // does its Doug copy — it belongs to the health panel now, not the banner.
      const literal = MESSAGE_CATALOG[code].dougFacing;
      expect(typeof literal).toBe("string");
      expect(container.innerHTML).not.toContain(code);
      expect(container.innerHTML).not.toContain(literal as string);
    });
  }
});
