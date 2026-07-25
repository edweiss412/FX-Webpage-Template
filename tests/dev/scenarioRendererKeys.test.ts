/**
 * tests/dev/scenarioRendererKeys.test.ts
 * (spec docs/superpowers/specs/2026-07-24-gallery-alert-producer-parity.md §5, §7)
 *
 * Every gallery alert row must supply the context keys its OWN card reads.
 * A row that does not renders placeholder copy — "some sheets", "a crew
 * member", "this show" — which is exactly how the crew-row fan-out stayed
 * invisible in the gallery for a month after it shipped.
 *
 * Anti-tautology: the expected key set is derived per code from the live
 * ALERT_IDENTITY_MAP via rendererReadKeys(), never hardcoded, so a scenario
 * cannot satisfy this by matching a list someone typed next to it.
 */
import { describe, expect, it } from "vitest";
import { ALL_SCENARIOS } from "@/lib/dev/attentionScenarios/index";
import { rendererReadKeys, HANDLED_SEGMENT_KINDS } from "@/lib/adminAlerts/rendererReadKeys";
import { ALERT_IDENTITY_MAP } from "@/lib/adminAlerts/alertIdentityMap";

describe("gallery scenarios supply the keys their cards read (spec §5)", () => {
  it("every alert row carries its code's renderer-read keys", () => {
    const offenders: string[] = [];
    for (const scenario of ALL_SCENARIOS) {
      for (const [index, alert] of scenario.alerts.entries()) {
        const needed = rendererReadKeys(alert.code);
        if (needed.length === 0) continue;
        const have = new Set(Object.keys(alert.context));
        const missing = needed.filter((key) => !have.has(key));
        if (missing.length > 0) {
          offenders.push(`${scenario.id}[${index}] ${alert.code} missing ${missing.join("+")}`);
        }
      }
    }
    expect(
      offenders,
      `${offenders.length} rows render placeholder copy:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("rendererReadKeys handles every segment kind the live identity map uses", () => {
    // Totality guard: a NEW SegmentSpec kind must fail here rather than
    // silently contributing no required key and letting a degenerate fixture
    // through (spec §5).
    const handled = new Set<string>(HANDLED_SEGMENT_KINDS);
    const seen = new Set<string>();
    for (const entry of Object.values(ALERT_IDENTITY_MAP)) {
      if (!entry || !("segments" in entry) || !Array.isArray(entry.segments)) continue;
      for (const seg of entry.segments) seen.add(seg.kind);
    }
    const unhandled = [...seen].filter((kind) => !handled.has(kind));
    expect(unhandled, `unhandled segment kinds: ${unhandled.join(", ")}`).toEqual([]);
  });

  it("AMBIGUOUS_EMAIL_BINDING rows carry the plural ids their producer writes", () => {
    // The originating defect, pinned by name: the singular crew_member_id is
    // the SIBLING code's shape and can never derive a crewMatch.
    const rows = ALL_SCENARIOS.flatMap((s) =>
      s.alerts.filter((a) => a.code === "AMBIGUOUS_EMAIL_BINDING").map((a) => ({ id: s.id, a })),
    );
    expect(rows.length, "the gallery should exercise this code").toBeGreaterThan(0);
    for (const { id, a } of rows) {
      expect(Array.isArray(a.context["crew_member_ids"]), `${id}: needs crew_member_ids[]`).toBe(
        true,
      );
      expect(a.context["crew_member_id"], `${id}: must NOT carry the singular key`).toBeUndefined();
    }
  });
});
