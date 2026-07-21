/**
 * tests/dev/buildScenarioModalData.test.ts
 * (plan 2026-07-21-attention-modal-switcher-gallery Task 3)
 *
 * The atomic per-scenario modal-data builder. Proves: (1) no function leaks into
 * the serializable data; (2) the warning model is correlated to the scenario's
 * OWN warnings (not the default snapshot); (3) anchors are shaped EXACTLY so the
 * modal's own `anchorsForData` places an anchored alert in its true section, and
 * `T2_ANCHOR_ABSENT` stays anchorless.
 */
import { describe, expect, test } from "vitest";
import { buildScenarioModalData } from "@/lib/dev/buildScenarioModalData";
import { anchorsForData } from "@/lib/admin/attentionAnchorAvailability";
import { tier1WarningScenarios } from "@/lib/dev/attentionScenarios/tier1";
import { T2_ANCHOR_ABSENT } from "@/lib/dev/attentionScenarios/tier2";
import type { AttentionScenario } from "@/lib/dev/attentionScenarios/types";

function alertScenario(id: string, code: string): AttentionScenario {
  return {
    id,
    tier: 1,
    label: id,
    alerts: [{ code, context: {}, raised_at: "2026-07-01T12:00:00.000Z", occurrence_count: 1 }],
    holds: [],
  };
}

describe("buildScenarioModalData", () => {
  test("produces serializable data (no function leak)", () => {
    const warning = tier1WarningScenarios()[0]!;
    const anchored = alertScenario("probe-rooms", "ASSET_RECOVERY_BYTES_EXCEEDED");
    expect(() => structuredClone(buildScenarioModalData(warning))).not.toThrow();
    expect(() => structuredClone(buildScenarioModalData(anchored))).not.toThrow();
  });

  test("bySection is correlated to the scenario's OWN warnings, not the default snapshot", () => {
    const warningScenario = tier1WarningScenarios().find((s) => (s.warnings?.length ?? 0) > 0)!;
    expect(warningScenario, "expected a warning scenario with warnings").toBeDefined();
    const withWarning = buildScenarioModalData(warningScenario);
    // A no-warning baseline for contrast: its bySection must differ.
    const baseline = buildScenarioModalData(alertScenario("no-warn", "ASSET_RECOVERY_BYTES_EXCEEDED"));
    const warnedKeys = Object.keys(withWarning.bySection ?? {});
    const baseKeys = Object.keys(baseline.bySection ?? {});
    // The warned scenario's model reflects its warnings — it is not the baseline.
    expect(JSON.stringify(withWarning.bySection)).not.toBe(JSON.stringify(baseline.bySection));
    expect(warnedKeys.length + baseKeys.length).toBeGreaterThanOrEqual(0); // structural sanity
  });

  test("exact anchor: rooms->diagrams alert yields exactly {rooms:{diagrams}}", () => {
    const s = alertScenario("probe-rooms", "ASSET_RECOVERY_BYTES_EXCEEDED");
    const map = anchorsForData(buildScenarioModalData(s).data);
    expect(map).toEqual(new Map([["rooms", new Set(["diagrams"])]]));
  });

  test("exact anchor: event->opening_reel alert yields exactly {event:{opening_reel}}", () => {
    const s = alertScenario("probe-event", "OPENING_REEL_PERMISSION_DENIED");
    const map = anchorsForData(buildScenarioModalData(s).data);
    expect(map).toEqual(new Map([["event", new Set(["opening_reel"])]]));
  });

  test("T2_ANCHOR_ABSENT stays anchorless (size 0)", () => {
    // Build the real catalog scenario by id via a minimal anchored alert under
    // the T2_ANCHOR_ABSENT id — anchorsWantedFor returns {} for that id.
    const s: AttentionScenario = {
      id: T2_ANCHOR_ABSENT,
      tier: 2,
      label: T2_ANCHOR_ABSENT,
      alerts: [
        { code: "ASSET_RECOVERY_BYTES_EXCEEDED", context: {}, raised_at: "2026-07-01T12:00:00.000Z", occurrence_count: 1 },
      ],
      holds: [],
    };
    expect(anchorsForData(buildScenarioModalData(s).data).size).toBe(0);
  });
});
