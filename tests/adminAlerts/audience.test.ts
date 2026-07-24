import { describe, expect, test } from "vitest";
import {
  HEALTH_CODES,
  DEGRADED_HEALTH_CODES,
  NOTICE_HEALTH_CODES,
  DOUG_EXCLUDED_CODES,
  dougSummaryFor,
  autoResolveNote,
  AUTO_RESOLVE_NOTES,
} from "@/lib/adminAlerts/audience";

describe("audience-derived code sets", () => {
  test("HEALTH_CODES contains a health code and excludes a doug code", () => {
    expect(HEALTH_CODES).toContain("WEBHOOK_TOKEN_INVALID");
    expect(HEALTH_CODES).not.toContain("SHEET_UNAVAILABLE");
  });

  test("DEGRADED_HEALTH_CODES / NOTICE_HEALTH_CODES partition by weight", () => {
    expect(DEGRADED_HEALTH_CODES).toContain("EMAIL_NOT_CONFIGURED");
    expect(DEGRADED_HEALTH_CODES).not.toContain("PICKER_SELECTION_RACE");
    expect(NOTICE_HEALTH_CODES).toContain("PICKER_SELECTION_RACE");
    expect(NOTICE_HEALTH_CODES).not.toContain("EMAIL_NOT_CONFIGURED");
  });

  test("DOUG_EXCLUDED_CODES = info-severity ∪ health (both arms present)", () => {
    // info-only, NON-health code — proves the info arm of the union is present.
    expect(DOUG_EXCLUDED_CODES).toContain("SHOW_FIRST_PUBLISHED");
    // health code — proves the health arm is present.
    expect(DOUG_EXCLUDED_CODES).toContain("WEBHOOK_TOKEN_INVALID");
    // a plain doug (non-info, non-health) code stays fail-visible.
    expect(DOUG_EXCLUDED_CODES).not.toContain("SHEET_UNAVAILABLE");
    // SHOW_FIRST_PUBLISHED is info, NOT health.
    expect(HEALTH_CODES).not.toContain("SHOW_FIRST_PUBLISHED");
  });

  test("dougSummaryFor reads catalog dougSummary, null for non-health / unknown", () => {
    expect(dougSummaryFor("WEBHOOK_TOKEN_INVALID")?.length ?? 0).toBeGreaterThan(0);
    expect(dougSummaryFor("SHEET_UNAVAILABLE")).toBeNull();
    expect(dougSummaryFor("NOT_A_CODE")).toBeNull();
  });

  test("autoResolveNote returns the custom RESYNC_QUALITY_REGRESSED note, not the generic fallback", () => {
    expect(autoResolveNote("RESYNC_QUALITY_REGRESSED")).toBe(
      "Clears automatically once the sheet's data quality recovers.",
    );
    expect(autoResolveNote("RESYNC_QUALITY_REGRESSED")).not.toContain("No action is needed here");
    // The note states the CLEAR CONDITION only. The instruction to fix the sheet
    // is the alert body's job, and this footer used to repeat it verbatim one
    // line below — the same duplication this change removed between Overview and
    // the Sheet warnings panel, at a smaller scale.
    expect(autoResolveNote("RESYNC_QUALITY_REGRESSED")).not.toContain("fix the sheet");
  });

  // Em-dashes are banned in user-visible copy (AGENTS.md pre-code mechanical UI
  // gate). Every note in this map renders in an alert-card footer, so the ban
  // applies to the whole map, not just the row edited above — asserting only the
  // edited row would let the next added note reintroduce the class.
  test("no auto-resolve note contains an em dash", () => {
    for (const code of Object.keys(AUTO_RESOLVE_NOTES)) {
      expect(autoResolveNote(code), `${code} note must not contain an em dash`).not.toMatch(/—/);
    }
  });
});
