import { describe, it, expect } from "vitest";
import { TYPO_VOCABS } from "@/lib/parser/typoVocabRegistry";
import { inScopeAliases } from "@/lib/parser/aliases";
import { CANONICAL_KEY_MAP } from "@/lib/parser/blocks/event";
import { damerauLevenshtein } from "@/lib/parser/fuzzyMatch";

/**
 * Standing structural guard (spec §3): no fuzzable member may sit within Damerau-1
 * of any OTHER registered vocab member — fuzzable OR excluded/do-not-fuzz. This fails
 * at CI time if a future vocab edit introduces a distance-1 cross-collision (e.g. a
 * new short header colliding with a sub-label, or a role code drifting next to a
 * fuzzable phrase). Proven load-bearing by the intentional-mutation step in the plan
 * (temporarily adding a colliding member makes this FAIL).
 */
describe("typo vocab collision tripwire (spec §3)", () => {
  it("no fuzzable member sits within Damerau-1 of any OTHER registered vocab member", () => {
    const collisions: string[] = [];
    for (const v of TYPO_VOCABS.filter((e) => e.klass === "fuzzable")) {
      const minLen = v.minLen ?? 0;
      for (const m of v.members) {
        if (m.length < minLen) continue;
        for (const other of TYPO_VOCABS) {
          if (other.id === v.id) continue;
          for (const o of other.members) {
            if (o === m) continue;
            if (damerauLevenshtein(m, o) <= 1) collisions.push(`${v.id}:${m} ↔ ${other.id}:${o}`);
          }
        }
      }
    }
    expect(collisions).toEqual([]);
  });
});

/**
 * PR-C: the ops field-alias fuzzy fallback (resolveAliasScoped("…","ops.")) must have a
 * matching registry entry so the collision tripwire above guards it. The entry is DERIVED
 * from inScopeAliases("ops.") (not hand-listed) so it cannot drift as FIELD_ALIASES changes.
 */
describe("ops field-alias vocab registration (PR-C)", () => {
  it("registers an opsFieldAlias fuzzable vocab derived from inScopeAliases('ops.')", () => {
    const ops = TYPO_VOCABS.find((v) => v.id === "opsFieldAlias");
    expect(ops).toBeDefined();
    expect(ops!.klass).toBe("fuzzable");
    const expected = inScopeAliases("ops.")
      .filter((a) => a.length >= 5)
      .map((a) => a.toUpperCase())
      .sort();
    expect([...ops!.members].sort()).toEqual(expected);
    expect(expected).toContain("INVOICE");
  });
});

/**
 * PR-D1: the EVENT DETAILS fuzzy fallback (gatedVocabCorrect over CANONICAL_KEY_MAP) must
 * have a matching registry entry so the collision tripwire above guards it. The entry is
 * DERIVED from CANONICAL_KEY_MAP (not hand-listed) so it cannot drift as the map changes.
 */
describe("event field-label vocab registration (PR-D1)", () => {
  it("registers an eventFieldAlias fuzzable vocab derived from CANONICAL_KEY_MAP", () => {
    const ev = TYPO_VOCABS.find((v) => v.id === "eventFieldAlias");
    expect(ev).toBeDefined();
    expect(ev!.klass).toBe("fuzzable");
    const expected = Object.keys(CANONICAL_KEY_MAP)
      .filter((k) => k.length >= 5)
      .map((k) => k.toUpperCase())
      .sort();
    expect([...ev!.members].sort()).toEqual(expected);
    expect(expected).toContain("STAGE SIZE");
    expect(expected).not.toContain("LED"); // 3 chars — filtered out, stays exact-only
  });
});
