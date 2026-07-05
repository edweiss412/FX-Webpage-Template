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
 *     dev HealthAlertsPanel, NOT any Doug-facing alert surface. Group B proves the
 *     HARNESS's seeded rows are EXCLUDED by the Doug-surface exclusion predicate
 *     (DOUG_SURFACE_EXCLUDED_CODES). Their positive render coverage lives in the
 *     health surface's own suite (tests/components/healthAlertsPanel.test.tsx).
 *
 * (The former Group C rendered the retired AlertBanner — bell notification
 * center §8 — and is removed with the component.)
 */
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";

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

// The Doug-surface INFO_SEVERITY exclusion list, recomputed exactly as
// lib/messages/adminSurface.ts derives it (info-severity ∪ inbox-routed feeds
// BANNER_EXCLUDED_CODES; here we recompute just the info-severity axis).
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
// Group B — harness admin_alerts rows vs the Doug-surface exclusion filter
// ─────────────────────────────────────────────────────────────────────

describe("Group B — harness rows vs the Doug-surface exclusion predicate", () => {
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

  test("the Doug-surface exclusion predicate EXCLUDES both harness codes (now health-audience)", async () => {
    // Mirror the Doug-surface exclusion (DOUG_SURFACE_EXCLUDED_CODES) — NOT just
    // the info-severity list. alert-audience-split reclassified both report codes
    // as health, so any Doug-facing SELECT must filter them out. Seeded fixtures +
    // this predicate prove the routing on a live row set. (The AlertBanner that
    // once applied this predicate is retired — bell notification center §8 — but
    // the exclusion set it used still governs the Doug-facing surfaces.)
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

// Group C (AlertBanner render coverage) is retired with the component itself —
// bell notification center §8. The two report codes' non-rendering on the
// Doug-facing surface is now governed by the exclusion set proven in Group B;
// their positive render coverage lives in the health surface's own suite
// (tests/components/healthAlertsPanel.test.tsx).
