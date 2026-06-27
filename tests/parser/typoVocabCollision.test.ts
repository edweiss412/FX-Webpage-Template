import { describe, it, expect } from "vitest";
import { TYPO_VOCABS } from "@/lib/parser/typoVocabRegistry";
import { inScopeAliases } from "@/lib/parser/aliases";
import { CANONICAL_KEY_MAP } from "@/lib/parser/blocks/event";
import { TRANSPORT_SCHEDULE_VOCAB } from "@/lib/parser/blocks/transport";
import { V4_BARE_LABEL_VOCAB } from "@/lib/parser/blocks/rooms";
import { CLIENT_V4_LABELS, CLIENT_V2_LABELS } from "@/lib/parser/blocks/client";
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

/**
 * PR-D2: the v2 transport schedule-label fuzzy fallback (gatedVocabCorrect over
 * V2_SCHEDULE_LABELS) must have a matching registry entry so the collision tripwire guards it.
 * The entry is DERIVED from the exported vocab (not hand-listed) so it cannot drift.
 */
describe("transport schedule-label vocab registration (PR-D2)", () => {
  it("registers a transportScheduleLabel fuzzable vocab matching TRANSPORT_SCHEDULE_VOCAB", () => {
    const tr = TYPO_VOCABS.find((v) => v.id === "transportScheduleLabel");
    expect(tr).toBeDefined();
    expect(tr!.klass).toBe("fuzzable");
    expect([...tr!.members].sort()).toEqual([...TRANSPORT_SCHEDULE_VOCAB].sort());
    expect(tr!.members).toContain("RENTAL PICKUP");
  });
});

/**
 * PR-D3: the v4 room-label fuzzy fallback (gatedVocabCorrect over V4_BARE_LABELS) must have a
 * matching registry entry so the collision tripwire guards it. DERIVED from the exported vocab.
 */
describe("room v4-label vocab registration (PR-D3)", () => {
  it("registers a roomV4Label fuzzable vocab matching V4_BARE_LABEL_VOCAB", () => {
    const rm = TYPO_VOCABS.find((v) => v.id === "roomV4Label");
    expect(rm).toBeDefined();
    expect(rm!.klass).toBe("fuzzable");
    expect([...rm!.members].sort()).toEqual([...V4_BARE_LABEL_VOCAB].sort());
    expect(rm!.members).toContain("DIGITAL SIGNAGE");
    expect(rm!.members.every((m) => m.length >= 5)).toBe(true);
  });
});

/**
 * PR-D4: the client fuzzy fallback (gatedVocabCorrect over CLIENT_V4_LABELS / CLIENT_V2_LABELS)
 * must have matching registry entries so the collision tripwire guards them. DERIVED from the
 * exported vocabs (single source — gate + registry can't drift).
 */
describe("client field-label vocab registration (PR-D4)", () => {
  it("registers a clientV4Label fuzzable vocab matching CLIENT_V4_LABELS", () => {
    const v = TYPO_VOCABS.find((e) => e.id === "clientV4Label");
    expect(v).toBeDefined();
    expect(v!.klass).toBe("fuzzable");
    expect([...v!.members].sort()).toEqual(
      [...CLIENT_V4_LABELS].map((s) => s.toUpperCase()).sort(),
    );
    expect(v!.members.every((m) => m.length >= 5)).toBe(true);
  });

  it("registers a clientV2Label fuzzable vocab matching CLIENT_V2_LABELS", () => {
    const v = TYPO_VOCABS.find((e) => e.id === "clientV2Label");
    expect(v).toBeDefined();
    expect(v!.klass).toBe("fuzzable");
    expect([...v!.members].sort()).toEqual(
      [...CLIENT_V2_LABELS].map((s) => s.toUpperCase()).sort(),
    );
    expect(v!.members.every((m) => m.length >= 5)).toBe(true);
  });
});
