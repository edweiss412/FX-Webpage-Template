/**
 * tests/dev/scenarioProducerBinding.test.ts
 * (spec docs/superpowers/specs/2026-07-24-gallery-alert-producer-parity.md §5)
 *
 * Binds every gallery scenario's context to what its code's producers actually
 * write. These two rules live in a test rather than in `validate.ts` because
 * they need the producer-scope registry, which is test infrastructure —
 * `lib/` must not import from `tests/`. The row-level rules that need no such
 * access (crewMatch code restriction, crewMatch/context agreement, identity
 * agreement) do live in the validator.
 *
 * The key-subset rule is the one that would have caught the originating defect
 * on the day it was written: `crew_member_id` on AMBIGUOUS_EMAIL_BINDING is a
 * key that code's producer never writes.
 */
import { describe, expect, it } from "vitest";
import { ALL_SCENARIOS } from "@/lib/dev/attentionScenarios/index";
import { allowedKeys, hasProducerRow } from "../adminAlerts/alertProducerScope.registry";

/** Gallery-only marker keys that are not producer keys (validate.ts:159). */
const DEV_ONLY_KEYS = new Set(["__devScenarioTag"]);

/** Roster ids a scenario actually renders. `volumes.crew` grows the default
 *  six-row roster with deterministic generated ids
 *  (lib/dev/publishedModalFixture.ts:273-279, :484-488). */
function rosterIdsFor(scenario: { fixture?: { volumes?: { crew?: number } } }): Set<string> {
  const ids = new Set<string>();
  for (let i = 1; i <= 6; i++) {
    ids.add(`cccccccc-0000-4000-8000-00000000000${i}`);
  }
  const grown = scenario.fixture?.volumes?.crew;
  if (typeof grown === "number") {
    for (let i = 7; i <= grown; i++) {
      ids.add(`cccccccc-0000-4000-8000-${String(i).padStart(3, "0")}000000000`.slice(0, 36));
    }
  }
  return ids;
}

const CREW_ID_KEYS = ["crew_member_id", "stale_crew_member_id"];

describe("gallery scenario contexts are bound to their producers (spec §5)", () => {
  it("declares no key its code's producers never write", () => {
    const offenders: string[] = [];
    for (const scenario of ALL_SCENARIOS) {
      for (const [index, alert] of scenario.alerts.entries()) {
        // No discovered producer means no key universe to constrain against.
        // An empty allowed-set would otherwise REJECT every non-empty context
        // rather than permitting it, so the rule is skipped, not inverted.
        if (!hasProducerRow(alert.code)) continue;
        const allowed = new Set(allowedKeys(alert.code));
        for (const key of Object.keys(alert.context)) {
          if (DEV_ONLY_KEYS.has(key)) continue;
          if (!allowed.has(key)) {
            offenders.push(`${scenario.id}[${index}] ${alert.code}.${key}`);
          }
        }
      }
    }
    expect(offenders, `keys no producer writes:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("skips the subset rule for codes with no producer row, rather than rejecting them", () => {
    // Proves the bypass is exercised by the live catalog, not just available.
    const bypassed = ALL_SCENARIOS.flatMap((s) => s.alerts).filter((a) => !hasProducerRow(a.code));
    expect(bypassed.length).toBeGreaterThan(0);
    for (const alert of bypassed) expect(allowedKeys(alert.code)).toEqual([]);
  });

  it("every declared crew id resolves to a row of that scenario's own roster", () => {
    const offenders: string[] = [];
    for (const scenario of ALL_SCENARIOS) {
      const roster = rosterIdsFor(scenario as never);
      for (const [index, alert] of scenario.alerts.entries()) {
        const declared: string[] = [];
        for (const key of CREW_ID_KEYS) {
          const value = alert.context[key];
          if (typeof value === "string") declared.push(value);
        }
        const plural = alert.context["crew_member_ids"];
        if (Array.isArray(plural)) {
          for (const value of plural) if (typeof value === "string") declared.push(value);
        }
        for (const id of alert.crewMatch?.crewMemberIds ?? []) declared.push(id);

        for (const id of declared) {
          if (!roster.has(id)) offenders.push(`${scenario.id}[${index}] ${alert.code} -> ${id}`);
        }
      }
    }
    expect(offenders, `crew ids that resolve to no rendered row:\n${offenders.join("\n")}`).toEqual(
      [],
    );
  });
});
