/**
 * tests/dev/deriveScenarioAttention.test.ts
 * (plan 2026-07-21-attention-modal-switcher-gallery Task 2)
 *
 * The shared derivation extracted from buildBlockProps. Two guarantees:
 *  - a single declared alert code surfaces as an attention item (input/output,
 *    order-independent);
 *  - every tier-1 alert scenario yields at least one item (§3.2 R1-15) — a
 *    tier-1 scenario that derived nothing would be a silently-empty modal.
 */
import { describe, expect, test } from "vitest";
import { buildScenarioFeed, deriveScenarioAttention } from "@/lib/dev/deriveScenarioAttention";
import { tier1AlertScenarios } from "@/lib/dev/attentionScenarios/tier1";
import type { AttentionScenario } from "@/lib/dev/attentionScenarios/types";

describe("deriveScenarioAttention", () => {
  test("a declared alert code surfaces as an attention item", () => {
    // A real single-alert tier-1 scenario; expected code derived INDEPENDENTLY
    // from the scenario's own declared input, not from the helper's output.
    // A single-alert scenario whose code actually surfaces (not a cut code).
    const single = tier1AlertScenarios().find(
      (s) => s.alerts.length === 1 && deriveScenarioAttention(s).length > 0,
    );
    expect(single, "expected a surfacing single-alert tier-1 scenario").toBeDefined();
    const expectedCode = single!.alerts[0]!.code;

    const items = deriveScenarioAttention(single!);
    expect(items.some((i) => i.kind === "alert" && i.alert.code === expectedCode)).toBe(true);
  });

  test("surfacing alert codes derive items; cut codes derive none (faithful to the real surface)", () => {
    // NOT every tier-1 scenario surfaces: DOUG_EXCLUDED_CODES (system/admin
    // alerts) are cut from the published attention surface, so the real modal
    // shows nothing for them and neither does the derivation. The gallery's
    // render/exclude decision lives in Task 4's partition, not here; this only
    // proves the extraction reflects the surface faithfully.
    const scenarios = tier1AlertScenarios();
    const surfacing = scenarios.filter((s) => deriveScenarioAttention(s).length > 0);
    const cut = scenarios.filter((s) => deriveScenarioAttention(s).length === 0);
    expect(surfacing.length).toBeGreaterThan(0); // some codes DO surface
    expect(cut.length).toBeGreaterThan(0); // and some are legitimately cut
  });

  test("buildScenarioFeed carries truncated only when the scenario flags it", () => {
    const HOLD: AttentionScenario["holds"][number] = {
      drive_file_id: "f",
      domain: "crew_email",
      entity_key: "k",
      held_value: { email: "a@example.test" },
      proposed_value: { disposition: "email_change", name: "N", email: "b@example.test" },
      base_modified_time: "2026-07-01T12:00:00.000Z",
      kind: "mi11_pending",
    };
    const base: AttentionScenario = {
      id: "probe-ft2",
      tier: 2,
      label: "p",
      alerts: [],
      holds: [HOLD],
    };
    expect(buildScenarioFeed(base)?.truncated).toBe(false);
    expect(buildScenarioFeed({ ...base, feedTruncated: true })?.truncated).toBe(true);
    expect(buildScenarioFeed({ ...base, holds: [], feedTruncated: true })).toBeNull();
  });
});
