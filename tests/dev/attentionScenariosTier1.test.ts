import { describe, expect, test } from "vitest";
import { ATTENTION_ROUTES } from "@/lib/admin/attentionItems";
import { tier1AlertScenarios, scenarioIdForCode } from "@/lib/dev/attentionScenarios/tier1";
import { validateScenario } from "@/lib/dev/attentionScenarios/validate";

/**
 * Tier-1 alert totality is STRUCTURAL (spec §3.1): scenarios are derived at
 * runtime from ATTENTION_ROUTES keys, so a new alert code appears in the gallery
 * the moment its routing row lands, with no catalog edit and no completeness
 * meta-test.
 */
describe("tier 1 alert scenarios", () => {
  test("covers every ATTENTION_ROUTES code, asserted against the routing table itself", () => {
    const codes = tier1AlertScenarios().flatMap((s) => s.alerts.map((a) => a.code));
    // Compared to the live table, never to a hardcoded count: a stale number
    // would pass while the gallery silently lost a code.
    expect(new Set(codes)).toEqual(new Set(Object.keys(ATTENTION_ROUTES)));
  });

  test("produces exactly one scenario per code, with one alert each", () => {
    const all = tier1AlertScenarios();
    expect(all).toHaveLength(Object.keys(ATTENTION_ROUTES).length);
    for (const s of all) {
      expect(s.alerts, s.id).toHaveLength(1);
      expect(s.holds, s.id).toHaveLength(0);
      expect(s.tier, s.id).toBe(1);
    }
  });

  test("every generated scenario passes the catalog validator", () => {
    // This is the coupling that makes the per-code override table mandatory:
    // a code whose §3.1 contract needs context will FAIL validation until its
    // override lands, rather than silently rendering a degenerate card.
    for (const s of tier1AlertScenarios()) {
      expect(validateScenario(s), `${s.id}: ${validateScenario(s).join("; ")}`).toEqual([]);
    }
  });

  test("ids are namespaced, slugified, and globally unique", () => {
    expect(scenarioIdForCode("alert", "SYNC_STALLED")).toBe("alert-sync-stalled");
    expect(scenarioIdForCode("warn", "BLOCK_DISAPPEARED")).toBe("warn-block-disappeared");
    const ids = tier1AlertScenarios().map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("the alert and warn namespaces cannot collide on the same code", () => {
    expect(scenarioIdForCode("alert", "SAME_CODE")).not.toBe(
      scenarioIdForCode("warn", "SAME_CODE"),
    );
  });

  test("no scenario carries tier-2 only fields", () => {
    for (const s of tier1AlertScenarios()) {
      expect(s.bucket, s.id).toBeUndefined();
      expect(s.degraded ?? false, s.id).toBe(false);
    }
  });

  test("no scenario declares warnings, so tier-1 alerts never touch that column", () => {
    // §3.4 tri-state: absent means materialize does not write parse_warnings.
    for (const s of tier1AlertScenarios()) {
      expect(s.warnings, s.id).toBeUndefined();
    }
  });

  test("PICKER_EPOCH_RESET is present in the catalog even though derive cuts it", () => {
    // It keeps its ATTENTION_ROUTES row for registry totality; the gallery
    // renders it as an explicit "cut in derive" row so the absence is legible
    // rather than looking like a bug (§3.1).
    const ids = tier1AlertScenarios().map((s) => s.id);
    expect(ids).toContain(scenarioIdForCode("alert", "PICKER_EPOCH_RESET"));
  });
});
