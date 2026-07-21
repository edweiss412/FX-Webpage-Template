// The assembled scenario catalog (spec §3).
//
// One catalog, two consumers: the build-gated gallery route renders tiers 1 and
// 2 through the real deriveAttentionItems and bucketAttention with no database,
// and the materialize dev-panel card writes tier-3 composites into a local (or
// validation) Supabase so the real modal shows the state for real.
import { tier1AlertScenarios, tier1WarningScenarios } from "./tier1";
import { tier2Scenarios } from "./tier2";
import { tier3Scenarios } from "./tier3";
import type { AttentionScenario } from "./types";

export const ALL_SCENARIOS: AttentionScenario[] = [
  ...tier1AlertScenarios(),
  ...tier1WarningScenarios(),
  ...tier2Scenarios(),
  ...tier3Scenarios(),
];

const BY_ID = new Map(ALL_SCENARIOS.map((s) => [s.id, s]));

export function scenarioById(id: string): AttentionScenario | undefined {
  return BY_ID.get(id);
}

/**
 * Tier 3 only. Tiers 1 and 2 cannot be materialized: their distinguishing
 * inputs are functions, loader faults, or codes that derive cuts (§5.0).
 */
export function materializableScenarios(): AttentionScenario[] {
  return ALL_SCENARIOS.filter((s) => s.tier === 3);
}

export type { AttentionScenario } from "./types";
