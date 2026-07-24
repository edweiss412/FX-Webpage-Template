import { describe, expect, test } from "vitest";
import { validateScenario } from "@/lib/dev/attentionScenarios/validate";
import {
  ALL_SCENARIOS,
  scenarioById,
  materializableScenarios,
} from "@/lib/dev/attentionScenarios/index";
import { T3_IDS } from "@/lib/dev/attentionScenarios/tier3";
import { tier1AlertScenarios, tier1WarningScenarios } from "@/lib/dev/attentionScenarios/tier1";
import { tier2Scenarios } from "@/lib/dev/attentionScenarios/tier2";

describe("catalog index", () => {
  test("tier 3 is non-empty and matches its declared id list exactly", () => {
    // Without both halves of this, an EMPTY tier 3 would satisfy every other
    // assertion in this file vacuously.
    expect(T3_IDS.length).toBeGreaterThanOrEqual(3);
    expect(
      materializableScenarios()
        .map((s) => s.id)
        .sort(),
    ).toEqual([...T3_IDS].sort());
  });

  test("ALL_SCENARIOS is the union of every tier, with nothing lost", () => {
    const expected =
      tier1AlertScenarios().length +
      tier1WarningScenarios().length +
      tier2Scenarios().length +
      T3_IDS.length;
    expect(ALL_SCENARIOS).toHaveLength(expected);
  });

  test("every scenario in the catalog is valid", () => {
    expect(ALL_SCENARIOS.length).toBeGreaterThan(0);
    for (const s of ALL_SCENARIOS) {
      expect(validateScenario(s), `${s.id}: ${validateScenario(s).join("; ")}`).toEqual([]);
    }
  });

  test("ids are globally unique across all tiers", () => {
    const ids = ALL_SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("scenarioById resolves a known id and rejects an unknown one", () => {
    // Both halves: an implementation that always returns undefined, or one that
    // returns a scenario for anything, each fails exactly one of these.
    const first = ALL_SCENARIOS[0]!;
    expect(scenarioById(first.id)?.id).toBe(first.id);
    expect(scenarioById("no-such-scenario")).toBeUndefined();
    expect(scenarioById("")).toBeUndefined();
  });

  test("materializable means tier 3 and nothing else", () => {
    for (const s of materializableScenarios()) expect(s.tier, s.id).toBe(3);
    const nonT3 = ALL_SCENARIOS.filter((s) => s.tier !== 3).map((s) => s.id);
    const materializable = new Set(materializableScenarios().map((s) => s.id));
    for (const id of nonT3) expect(materializable.has(id), id).toBe(false);
  });

  test("no tier-3 scenario carries bucket, degraded, or feedTruncated, which DB state cannot reproduce", () => {
    for (const s of materializableScenarios()) {
      expect(s.bucket, s.id).toBeUndefined();
      expect(s.degraded ?? false, s.id).toBe(false);
      expect(s.feedTruncated ?? false, s.id).toBe(false);
    }
  });

  test("every tier-3 scenario materializes something", () => {
    // A scenario with no alerts, no holds, and no warnings would be refused by
    // the Apply guard as nothing-to-materialize, so it must not exist here.
    for (const s of materializableScenarios()) {
      const hasState = s.alerts.length > 0 || s.holds.length > 0 || s.warnings !== undefined;
      expect(hasState, s.id).toBe(true);
    }
  });

  test("the composites cover all three storable domains across the tier", () => {
    const all = materializableScenarios();
    expect(
      all.some((s) => s.alerts.length > 0),
      "some composite carries alerts",
    ).toBe(true);
    expect(
      all.some((s) => s.holds.length > 0),
      "some composite carries holds",
    ).toBe(true);
    expect(
      all.some((s) => s.warnings !== undefined),
      "some composite declares warnings",
    ).toBe(true);
    // And at least one deliberately OMITS warnings, exercising the tri-state
    // absent branch that leaves parse_warnings untouched (§3.4).
    expect(
      all.some((s) => s.warnings === undefined),
      "some composite omits warnings",
    ).toBe(true);
  });

  test("no composite carries duplicate alert codes or hold keys", () => {
    // The DB enforces both (a partial unique index on (show_id, code), and
    // unique (show_id, domain, entity_key)), so a duplicate would fail at insert.
    for (const s of materializableScenarios()) {
      const codes = s.alerts.map((a) => a.code);
      expect(new Set(codes).size, `${s.id} alert codes`).toBe(codes.length);
      const keys = s.holds.map((h) => `${h.domain}:${h.entity_key}`);
      expect(new Set(keys).size, `${s.id} hold keys`).toBe(keys.length);
    }
  });
});

describe("modal-state fields are tier-2 exclusive across the catalog", () => {
  // Structural pin (plan Task 2 guard 19): the five gallery-only fields must
  // never appear on tier-1/3 scenarios — tier 3 is the materializable tier and
  // materialize must never observe them.
  test("no tier-1/3 scenario carries changeLog/feedNull/fixture/ignoreWarningIndexes/landing/actionOutcomes", () => {
    for (const s of ALL_SCENARIOS) {
      if (s.tier === 2) continue;
      expect(s.changeLog, `${s.id} changeLog`).toBeUndefined();
      expect(s.feedNull, `${s.id} feedNull`).toBeUndefined();
      expect(s.fixture, `${s.id} fixture`).toBeUndefined();
      expect(s.ignoreWarningIndexes, `${s.id} ignoreWarningIndexes`).toBeUndefined();
      expect(s.landing, `${s.id} landing`).toBeUndefined();
      expect(s.actionOutcomes, `${s.id} actionOutcomes`).toBeUndefined();
    }
  });
});
