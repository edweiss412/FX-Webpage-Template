# Parser Typo-Tolerance PR-D1 (EVENT DETAILS field labels) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recover likely-misspelled EVENT DETAILS field labels via a gated fuzzy pass over the block's local `CANONICAL_KEY_MAP`, so a typo'd label (e.g. `Stage Sze`) routes its value into the right canonical field instead of landing under a garbage fallback key — emitting a `FIELD_LABEL_AUTOCORRECTED` warning, exactly as venue (PR-B) and ops (PR-C) do for their blocks.

**Architecture:** `parseEventDetails` (lib/parser/blocks/event.ts) already resolves a label via `toCanonicalKey(col0)` (known-map-first, else normalize-and-keep). PR-D1 adds, in the *not-a-known-label* branch, a `gatedVocabCorrect` pass over the uppercase `CANONICAL_KEY_MAP` key spellings (≥5 chars). A near-miss is recorded as a **deferred candidate** and applied AFTER the parse loop, but only for canonical keys no EXACT label claimed (exact always wins — required because several labels collapse to one canonical, e.g. the dress-code family, under last-write-wins). This is the second of the two shipped patterns (PR-A's `gatedVocabCorrect`-over-a-local-vocab, not PR-B/C's `resolveAliasScoped`-over-FIELD_ALIASES) because `event.*` FIELD_ALIASES is intentionally incomplete (aliases.ts:114) — the block's `CANONICAL_KEY_MAP` is the local authority.

**Tech Stack:** TypeScript, Next.js 16 parser modules, Vitest. No DB, no UI, no migrations.

## Global Constraints

- **TDD per task** (invariant 1): failing test → run-fail → minimal impl → run-pass → commit. One task per commit, conventional-commits style (`feat(parser):` / `test(parser):`).
- **No new error code.** PR-D1 REUSES `FIELD_LABEL_AUTOCORRECTED`, which already exists end-to-end from PR-B: catalog row `lib/messages/catalog.ts:1117`; OPERATOR_ACTIONABLE membership `lib/parser/dataGaps.ts:131`; deep-link dispatch `lib/drive/showDayTimeAnchors.ts:141` (region-level: resolves `sources.region[blockRef.kind]` when `kind` is a RegionId); help-family prefix `app/help/errors/_families.ts:61` (`FIELD`). The #155 6-surface code lockstep is therefore NOT triggered — do not edit the §12.4 catalog or run `gen:spec-codes`.
- **`blockRef.kind = "details"`** — `details` is a RegionId (`lib/sheet-links/buildSheetDeepLink.ts` REGION_IDS) whose anchor is a header-block over `EVENT DETAILS|DETAILS|GS DETAILS`. A typo'd row anchors region-level or degrades link-less (graceful).
- **Single source / no drift:** the fuzzable vocab is DERIVED from `CANONICAL_KEY_MAP` and exported once (`EVENT_LABEL_VOCAB`); the registry imports that exact const; a registration test re-derives and asserts equality (mirrors PR-B/C's derived-from-`inScopeAliases` guard).
- **Corpus stability:** genuinely-unknown labels (no exact hit AND no fuzzy hit) MUST keep their current fallback behavior (`toCanonicalKey` normalize-and-keep). The fixtures are correctly spelled, so the whole-corpus event tests must be unchanged.

### Fuzzy-vs-exact behavior contract (resolves plan-review findings 1–3)

These rules are the crux of the design and are each pinned by a test:

1. **A REAL exact value wins; a suppressed typo sibling is DROPPED, not fallback-kept, and emits NO warning.** "Claims a canonical" means an EXACT label wrote a **real** (non-empty, non-sentinel) value for it. When that holds, any typo sibling that fuzzy-resolves to the same canonical is dropped entirely — its value is NOT written under a normalized fallback key, and no `FIELD_LABEL_AUTOCORRECTED` is emitted (the field is already correctly captured by the exact row, so the duplicate is noise). This IS a behavior change vs today (today a typo'd label like `Attir` lands under the garbage key `attir`); it only affects rows that fuzzy-match a known field, never genuinely-unknown labels, and never the (correctly-spelled) fixtures. Matches the shipped ops anti-shadow contract (PR-C).
   - **Empty / sentinel exact does NOT claim (no data loss).** If the only exact row for a canonical had an empty or sentinel value (`""`/`TBD`/`N/A`/`TBA`), a typo sibling carrying a **real** value still recovers into that canonical and warns — recovering real data is strictly better than today (today the typo's value lands under a garbage key and the canonical stays empty). The recovery write goes through `writeField`, so a sentinel fuzzy value never displaces a real exact value, and a real fuzzy value correctly overrides a sentinel exact value (consistent with event's sentinel-aware precedence, event.ts:148-165). This is tracked with an `exactReal` set (canonicals an exact row gave a real value), NOT a bare "seen" set.
2. **Multiple fuzzy siblings (no exact for that canonical): last-write-wins, with the SAME sentinel-aware precedence as exact labels.** The fuzzy candidate map is updated per row using the identical rule as `writeField` (a sentinel value never displaces a real one already held), so the fuzzy path matches event's documented known-label semantics (last-write-wins except sentinel, event.ts:148-165). The emitted warning's `rawSnippet` reflects the WINNING label (the one whose value is kept).
3. **A genuinely-unknown label (no exact, no fuzzy hit — including tie-aborted or below-minLen) keeps its fallback key, unchanged.**

## Meta-test inventory (mandatory declaration)

- **EXTENDS** `tests/parser/typoVocabCollision.test.ts` — adds a derived `eventFieldAlias` fuzzable row to `TYPO_VOCABS`; the standing tripwire then auto-asserts no `eventFieldAlias` member sits within Damerau-1 of any OTHER registered vocab member (incl. `shortRoleCodes`/`knownSubLabels`/`sentinels`). Plus a new registration test pinning the derivation. **Creates no new meta-test.**
- **N/A — declared explicitly:** advisory-lock topology (`tests/auth/advisoryLockRpcDeadlock.test.ts`), Supabase call-boundary (`tests/auth/_metaInfraContract.test.ts`), `admin_alerts` catalog, and postgrest-dml-lockdown — PR-D1 is parser-only: no DB writes, no auth, no admin alerts, no `pg_advisory*`.
- **N/A — no new warn code** → the §12.4 catalog-parity (`x1`) lockstep is not in scope (reuse of an existing code).

## File Structure

- **Modify** `lib/parser/blocks/event.ts` — export `CANONICAL_KEY_MAP` + a derived `EVENT_LABEL_VOCAB`; add a `writeField` helper (extract the existing sentinel-aware precedence); add the deferred fuzzy fallback + post-loop application + warn emission to `parseEventDetails`.
- **Modify** `lib/parser/typoVocabRegistry.ts` — add the `eventFieldAlias` entry importing `EVENT_LABEL_VOCAB`.
- **Modify** `tests/parser/blocks/event.test.ts` — add the fuzzy-recovery describe block (Task 1 tests).
- **Modify** `tests/parser/typoVocabCollision.test.ts` — add the `eventFieldAlias` registration test (Task 2).

---

## Task 1: EVENT DETAILS fuzzy field-label recovery (deferred-commit)

**Files:**
- Modify: `lib/parser/blocks/event.ts`
- Test: `tests/parser/blocks/event.test.ts`

**Interfaces:**
- Consumes: `gatedVocabCorrect` (`lib/parser/typoGate.ts:16`), `ParseAggregator` + `newAggregator` (`lib/parser/warnings.ts`), `shouldHideGenericOptional` (already imported, `lib/visibility/emptyState`), `presence`/`clean`/`splitRow` (`./_helpers`).
- Produces (for Task 2): `export const CANONICAL_KEY_MAP` and `export const EVENT_LABEL_VOCAB: readonly string[]` from `lib/parser/blocks/event.ts`.

- [ ] **Step 1: Write the failing BEHAVIOR tests** — append to `tests/parser/blocks/event.test.ts`. The file currently imports only `describe/it/expect`, `readFileSync`, `parseEventDetails`, `detectVersion` (verified — no name collisions). Add ONLY `import { newAggregator } from "@/lib/parser/warnings";` for now (the gate/vocab/generator imports come in Step 5 with the property test, so this step's red is a clean assertion failure, not a missing-export compile error). Then append:

```ts
// ── PR-D1: EVENT DETAILS fuzzy field-label recovery ──────────────────────────
// Helper: build a minimal EVENT DETAILS block from label/value rows.
function evBlock(rows: string[]): string {
  return ["| EVENT DETAILS | |", ...rows].join("\n") + "\n| CREW | |\n";
}

describe("parseEventDetails — fuzzy field-label recovery (PR-D1)", () => {
  it("recovers a misspelled label and warns once (kind=details)", () => {
    const agg = newAggregator();
    const ed = parseEventDetails(evBlock(["| Stage Sze | 20x16 |"]), "v4", agg);
    expect(ed.stage_size).toBe("20x16");
    const warns = agg.warnings.filter((w) => w.code === "FIELD_LABEL_AUTOCORRECTED");
    expect(warns).toHaveLength(1);
    expect(warns[0]!.severity).toBe("warn");
    expect(warns[0]!.blockRef).toEqual({ kind: "details" });
    expect(warns[0]!.rawSnippet).toBe("Stage Sze");
  });

  it("exact-wins: an exact label beats a typo'd sibling for the same canonical, either order — typo value dropped, no warn", () => {
    // dress family: "attire"/"dress code" both → dress_code. Exact must win regardless of
    // order; the suppressed typo's value is DROPPED (not kept under a fallback key) and emits
    // no warning (contract rules 1+3). "attir" must NOT appear as a phantom field.
    const aggA = newAggregator();
    const edA = parseEventDetails(
      evBlock(["| Attir | WRONG |", "| Dress Code | Business Casual |"]),
      "v4",
      aggA,
    );
    expect(edA.dress_code).toBe("Business Casual");
    expect(edA.attir).toBeUndefined();
    expect(aggA.warnings.filter((w) => w.code === "FIELD_LABEL_AUTOCORRECTED")).toHaveLength(0);

    const aggB = newAggregator();
    const edB = parseEventDetails(
      evBlock(["| Dress Code | Business Casual |", "| Attir | WRONG |"]),
      "v4",
      aggB,
    );
    expect(edB.dress_code).toBe("Business Casual");
    expect(edB.attir).toBeUndefined();
    expect(aggB.warnings.filter((w) => w.code === "FIELD_LABEL_AUTOCORRECTED")).toHaveLength(0);
  });

  it("empty/sentinel exact does not claim: a real typo sibling still recovers and warns (no data loss)", () => {
    // The exact "Dress Code" row is EMPTY, so it does not claim dress_code; the typo "Attir"
    // carries a real value and recovers into dress_code (contract rule 1, empty-exact clause).
    const aggEmpty = newAggregator();
    const edEmpty = parseEventDetails(
      evBlock(["| Dress Code | |", "| Attir | Casual |"]),
      "v4",
      aggEmpty,
    );
    expect(edEmpty.dress_code).toBe("Casual");
    expect(aggEmpty.warnings.filter((w) => w.code === "FIELD_LABEL_AUTOCORRECTED")).toHaveLength(1);

    // Sentinel exact ("TBD") likewise does not block a real fuzzy recovery; writeField lets the
    // real value override the sentinel.
    const aggSentinel = newAggregator();
    const edSentinel = parseEventDetails(
      evBlock(["| Dress Code | TBD |", "| Attir | Casual |"]),
      "v4",
      aggSentinel,
    );
    expect(edSentinel.dress_code).toBe("Casual");
    expect(
      aggSentinel.warnings.filter((w) => w.code === "FIELD_LABEL_AUTOCORRECTED"),
    ).toHaveLength(1);
  });

  it("multiple fuzzy siblings (no exact): last-write-wins, single warn naming the winning label", () => {
    // "Stage Sze" and "Stge Size" both → stage_size, no exact row. Last value wins (matching
    // event's known-label last-write-wins), and exactly one warning fires (contract rule 2).
    const agg = newAggregator();
    const ed = parseEventDetails(
      evBlock(["| Stage Sze | 20x16 |", "| Stge Size | 30x20 |"]),
      "v4",
      agg,
    );
    expect(ed.stage_size).toBe("30x20");
    const warns = agg.warnings.filter((w) => w.code === "FIELD_LABEL_AUTOCORRECTED");
    expect(warns).toHaveLength(1);
    expect(warns[0]!.rawSnippet).toBe("Stge Size");
  });

  it("round-trips a punctuated member: a typo of a slash/paren label maps back to its canonical", () => {
    // Guards the CANONICAL_KEY_MAP[match.toLowerCase()] back-lookup for members excluded from
    // the alphabetic-only property test below. "Backdrop / Scenicc" → "backdrop / scenic" → scenic.
    const agg = newAggregator();
    const ed = parseEventDetails(evBlock(["| Backdrop / Scenicc | white cyc |"]), "v4", agg);
    expect(ed.scenic).toBe("white cyc");
    expect(agg.warnings.filter((w) => w.code === "FIELD_LABEL_AUTOCORRECTED")).toHaveLength(1);
  });

  it("exact spellings still route unchanged, no fuzzy warning", () => {
    const agg = newAggregator();
    const ed = parseEventDetails(evBlock(["| Diagrams | yes |", "| LED | 4 |"]), "v4", agg);
    expect(ed.diagrams).toBe("yes");
    expect(ed.led).toBe("4");
    expect(agg.warnings.filter((w) => w.code === "FIELD_LABEL_AUTOCORRECTED")).toHaveLength(0);
  });

  it("genuinely-unknown label is preserved via the fallback key (no fuzzy, no warn)", () => {
    // "Catering" is not near any event label → stays under its normalized fallback key.
    const agg = newAggregator();
    const ed = parseEventDetails(evBlock(["| Catering | Lunch |"]), "v4", agg);
    expect(ed.catering).toBe("Lunch");
    expect(agg.warnings.filter((w) => w.code === "FIELD_LABEL_AUTOCORRECTED")).toHaveLength(0);
  });

  it("below-minLen: a short typo input (<5) is not corrected, falls through to fallback", () => {
    // "Powr" (4 chars) would be distance-1 from POWER but minLen:5 blocks it.
    const agg = newAggregator();
    const ed = parseEventDetails(evBlock(["| Powr | x |"]), "v4", agg);
    expect(ed.power).toBeUndefined();
    expect(ed.powr).toBe("x");
    expect(agg.warnings.filter((w) => w.code === "FIELD_LABEL_AUTOCORRECTED")).toHaveLength(0);
  });

  it("tie-abort: a typo equidistant from two members is not corrected", () => {
    // "goosnecks" is distance-1 from both "goosneck" and "goosenecks" → no correction.
    const agg = newAggregator();
    const ed = parseEventDetails(evBlock(["| goosnecks | brass |"]), "v4", agg);
    expect(ed.gooseneck).toBeUndefined();
    expect(ed.goosnecks).toBe("brass");
    expect(agg.warnings.filter((w) => w.code === "FIELD_LABEL_AUTOCORRECTED")).toHaveLength(0);
  });

  it("VALUE-guard: a typo in the cell VALUE (not the label) is never fuzzed", () => {
    const agg = newAggregator();
    const ed = parseEventDetails(evBlock(["| Catering | Stage Sze |"]), "v4", agg);
    expect(ed.stage_size).toBeUndefined();
    expect(agg.warnings.filter((w) => w.code === "FIELD_LABEL_AUTOCORRECTED")).toHaveLength(0);
  });

});
```

  **Concrete failure modes these catch:** value-into-wrong-field on a typo (recover test); a typo'd duplicate clobbering an exact field under last-write-wins (exact-wins, both orders); silent data loss when the exact row is empty/sentinel (empty-exact recovery); first-vs-last among fuzzy siblings (multiple-siblings); the punctuated back-lookup (round-trip); regression of the keep-unknown-fields fallback (genuinely-unknown); over-eager correction of short/ambiguous tokens (below-minLen, tie-abort); fuzzing the value instead of the label (VALUE-guard). The "typos beyond the example sheets" property test lands in Step 5 (after the export exists).

- [ ] **Step 2: Run to verify fail** — `pnpm vitest run tests/parser/blocks/event.test.ts`. Expected (a clean assertion red, NOT a compile error): the **recover**, **exact-wins** (`ed.attir` undefined), **empty/sentinel-exact recovery**, **multiple-fuzzy-siblings**, and **punctuated round-trip** tests FAIL on their assertions (current behavior drops the typo under a fallback key and emits no warning); the **exact-spellings**, **genuinely-unknown**, **below-minLen**, **tie-abort**, and **VALUE-guard** tests already PASS (they encode current behavior) — confirm those 5 show green in this same run.

- [ ] **Step 3: Implement the fuzzy fallback in `lib/parser/blocks/event.ts`.**

  3a. Add the import (after the existing `_helpers` import, event.ts:33):
```ts
import { gatedVocabCorrect } from "@/lib/parser/typoGate";
```

  3b. `export` the map and add the derived vocab + gate opts. Change `const CANONICAL_KEY_MAP` (event.ts:59) to `export const CANONICAL_KEY_MAP`, and immediately AFTER the map literal (after event.ts:98) add:
```ts
// Uppercase label spellings the EVENT DETAILS fuzzy fallback corrects toward — DERIVED
// from CANONICAL_KEY_MAP keys (single source of truth; lib/parser/typoVocabRegistry.ts
// imports this exact const so the registry can't drift). The len>=5 filter keeps short
// keys (notably "led", 3 chars) OUT of the correction targets, so nothing fuzzes to "led"
// and the LED↔LEAD security adjacency (spec §8) cannot arise here; "led" remains a valid
// EXACT field via the known-map path.
export const EVENT_LABEL_VOCAB: readonly string[] = Object.keys(CANONICAL_KEY_MAP)
  .filter((k) => k.length >= 5)
  .map((k) => k.toUpperCase());

// Do-not-fuzz tokens passed to the gate's cross-vocab exclusion. minLen:5 already drops
// every one of these (all < 5 chars), so this is belt-and-suspenders matching the
// milestone's gate-exclusion convention + robustness if a >=5 do-not-fuzz token is added.
const EVENT_GATE_EXCLUDE = ["LED", "LEAD", "DATE", "DAY", "ROOM", "TBD", "TBA", "N/A"] as const;
const EVENT_GATE_OPTS = { minLen: 5, tieAbort: true, exclude: EVENT_GATE_EXCLUDE } as const;
```

  3c. Extract the sentinel-aware write into a helper. Add this function (e.g. just below `toCanonicalKey`, after event.ts:183):
```ts
/**
 * Sentinel-aware field write (M4-D1 precedence, extracted so the post-loop fuzzy
 * application reuses the identical rule): a sentinel value never clobbers a real value
 * already held for the same canonical key; otherwise last-write-wins.
 */
function writeField(result: Record<string, string>, key: string, val: string): void {
  const existing = result[key];
  const incomingIsSentinel = shouldHideGenericOptional(val);
  const existingIsReal = existing !== undefined && !shouldHideGenericOptional(existing);
  if (incomingIsSentinel && existingIsReal) return; // keep the real value, drop the sentinel
  result[key] = val;
}
```

  3d. Add the deferred-candidate state at the top of `parseEventDetails`, right after `const result: Record<string, string> = {};` (event.ts:106):
```ts
  // PR-D1 deferred-commit state: canonicals an EXACT label gave a REAL value (a real exact
  // value wins over any fuzzy sibling — empty/sentinel exact does NOT claim, so a real fuzzy
  // can still recover), and the surviving fuzzy candidate per canonical (last-write-wins).
  const exactReal = new Set<string>();
  const fuzzyCandidates = new Map<string, { rawLabel: string; value: string }>();
```

  3e. Replace the two-column write branch (event.ts:144-166, the `if (col1) { ... }` block) with:
```ts
    // Two-column row: col0 is label, col1 is value
    if (col1) {
      const val = presence(col1);
      const exactCanon = CANONICAL_KEY_MAP[col0Lower];
      if (exactCanon !== undefined) {
        // Known label — unchanged write; a REAL value claims the canonical so fuzzy can't
        // shadow it (an empty/sentinel exact value does NOT claim — see contract rule 1).
        if (val) {
          writeField(result, exactCanon, val);
          if (!shouldHideGenericOptional(val)) exactReal.add(exactCanon);
        }
      } else {
        // Not a known label: try a gated fuzzy recovery on the LABEL only (never the value).
        // (`fix.corrected === false` — an EXACT gate hit — is unreachable here: an exact label
        // would have matched `CANONICAL_KEY_MAP[col0Lower]` above, since EVENT_LABEL_VOCAB is
        // derived solely from the map's keys. If it ever did occur it falls through to the
        // fallback below, which is the safe default.)
        const fix = gatedVocabCorrect(col0.toUpperCase(), EVENT_LABEL_VOCAB, EVENT_GATE_OPTS);
        if (fix?.corrected) {
          const canon = CANONICAL_KEY_MAP[fix.match.toLowerCase()];
          if (canon && val) {
            // Defer; apply post-loop unless an exact label claims this canonical. Among fuzzy
            // siblings: last-write-wins with the SAME sentinel-aware precedence as exact labels
            // (a sentinel never displaces a real candidate), so `rawLabel` tracks the winning value.
            const prev = fuzzyCandidates.get(canon);
            const incomingIsSentinel = shouldHideGenericOptional(val);
            const prevIsReal = prev !== undefined && !shouldHideGenericOptional(prev.value);
            if (!(incomingIsSentinel && prevIsReal)) {
              fuzzyCandidates.set(canon, { rawLabel: col0, value: val });
            }
          }
        } else {
          // Genuinely-unknown label (no fuzzy hit, tie-aborted, or below-minLen): preserve the
          // existing normalize-and-keep fallback.
          const key = toCanonicalKey(col0);
          if (key && val) writeField(result, key, val);
        }
      }
    }
    // Single-column row (label only, no value) — skip
```
  (Note: `col0Lower` is already in scope — declared at event.ts:139 before the terminating-label checks.)

  3f. Apply deferred fuzzy candidates AFTER the loop, BEFORE the empty-section check (insert just before event.ts:173 `if (Object.keys(result).length === 0)`):
```ts
  // Apply fuzzy candidates, skipping any canonical an EXACT label claimed with a real value
  // (exact-real wins). writeField still applies, so a fuzzy value correctly overrides an
  // empty/sentinel exact value but a sentinel fuzzy never clobbers a real value.
  for (const [canon, cand] of fuzzyCandidates) {
    if (exactReal.has(canon)) continue;
    writeField(result, canon, cand.value);
    agg?.warnings.push({
      severity: "warn",
      code: "FIELD_LABEL_AUTOCORRECTED",
      message: `Read likely-misspelled EVENT DETAILS label '${cand.rawLabel}' as field '${canon}'`,
      blockRef: { kind: "details" },
      rawSnippet: cand.rawLabel,
    });
  }
```

- [ ] **Step 4: Run behavior tests to verify pass** — `pnpm vitest run tests/parser/blocks/event.test.ts` → all green (new behavior tests + pre-existing event tests). Then `pnpm vitest run tests/parser` → the whole-corpus event coverage is unchanged (fixtures are correctly spelled, so no fuzzy fires and no new warnings appear).

- [ ] **Step 5: Add the "typos beyond the example sheets" property test (now that the export exists).** Add the imports at the top of `tests/parser/blocks/event.test.ts`: `import { gatedVocabCorrect } from "@/lib/parser/typoGate";`, `import { EVENT_LABEL_VOCAB } from "@/lib/parser/blocks/event";`, `import { unambiguousTypos } from "../_typoGenerator";`. Then append a new describe block:
```ts
// Property test over the gate directly (the "typos beyond the example sheets" core). Scope to
// purely alphabetic+space members so generator neighbors (ALPHA = A–Z + space) are well-formed;
// punctuated members (BACKDROP / SCENIC, FONTS (II ONLY), DRESS_CODE) are covered by the
// explicit round-trip unit test above.
describe("parseEventDetails — gate corrects unseen typos (PR-D1)", () => {
  it("corrects unambiguous single-edit typos of every clean member back to that member", () => {
    const opts = { minLen: 5, tieAbort: true } as const;
    const clean = EVENT_LABEL_VOCAB.filter((m) => /^[A-Z ]+$/.test(m));
    expect(clean.length).toBeGreaterThan(8);
    for (const member of clean) {
      for (const typo of unambiguousTypos(member, EVENT_LABEL_VOCAB, { minLen: 5 })) {
        const fix = gatedVocabCorrect(typo, EVENT_LABEL_VOCAB, opts);
        expect(fix?.corrected, `${typo} → ${member}`).toBe(true);
        expect(fix?.match, `${typo} → ${member}`).toBe(member);
      }
    }
  });
});
```
  Run `pnpm vitest run tests/parser/blocks/event.test.ts` → green. (This is test-after for the gate, which is already implemented + unit-tested in PR-A; the new code under test — the parser wiring — was TDD'd in Steps 1–4. The property test guards the derived vocab against typos absent from the fixtures.)

- [ ] **Step 6: Anti-tautology mutation proofs (run, confirm RED, revert — do NOT commit the mutation).**
  - **Exact-real guard is load-bearing:** temporarily make the fuzzy hit commit INLINE (in the `else`/fuzzy branch, replace the deferral with `if (canon && val) { writeField(result, canon, val); }` and delete the post-loop application loop). Run the file → the "exact-wins" test goes RED (the `Attir`→dress_code typo clobbers `Business Casual` in the typo-after-exact order). Revert.
  - **Gate minLen is load-bearing:** temporarily drop `minLen: 5` from `EVENT_GATE_OPTS`. Run → the "below-minLen" test goes RED (`Powr`→`POWER` now corrects). Revert.
  Confirm `git diff lib/parser/blocks/event.ts` is empty after reverting both.

- [ ] **Step 7: Commit**
```bash
git add lib/parser/blocks/event.ts tests/parser/blocks/event.test.ts
git commit -m "feat(parser): fuzzy field-label recovery in EVENT DETAILS block"
```

---

## Task 2: Register `eventFieldAlias` in the collision tripwire

**Files:**
- Modify: `lib/parser/typoVocabRegistry.ts`
- Test: `tests/parser/typoVocabCollision.test.ts`

**Interfaces:**
- Consumes: `EVENT_LABEL_VOCAB` + `CANONICAL_KEY_MAP` from `lib/parser/blocks/event.ts` (Task 1).

- [ ] **Step 1: Write the failing registration test** — append to `tests/parser/typoVocabCollision.test.ts`. Add `import { CANONICAL_KEY_MAP } from "@/lib/parser/blocks/event";` at the top, then:
```ts
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
```

- [ ] **Step 2: Run to verify fail** — `pnpm vitest run tests/parser/typoVocabCollision.test.ts` → the registration test FAILS (`eventFieldAlias` undefined); the existing collision tripwire still PASSES.

- [ ] **Step 3: Add the registry entry** — in `lib/parser/typoVocabRegistry.ts`, add the import at the top (after the `inScopeAliases` import, line 1):
```ts
import { EVENT_LABEL_VOCAB } from "@/lib/parser/blocks/event";
```
and add the entry immediately after the `opsFieldAlias` row (typoVocabRegistry.ts:52):
```ts
  // PR-D1: EVENT DETAILS field-label fuzzy fallback (gatedVocabCorrect over the block's
  // local CANONICAL_KEY_MAP). Members are the SAME derived vocab the gate fuzzes, so the
  // tripwire guards exactly what ships. (Not resolveAliasScoped — event uses a local map.)
  { id: "eventFieldAlias", klass: "fuzzable", minLen: 5, members: EVENT_LABEL_VOCAB },
```

- [ ] **Step 4: Run + mutation proof.** `pnpm vitest run tests/parser/typoVocabCollision.test.ts` → both the registration test and the collision tripwire PASS (registration green; no `eventFieldAlias` member sits within Damerau-1 of any other registered vocab). **If a REAL collision surfaces** (an event member near a sub-label/role code/another field-alias), do NOT weaken the test — resolve it: confirm whether the colliding member is genuinely ambiguous and, if so, exclude that single member from the gate vocab with a documented carve-out (and mirror it in the derivation the registration test checks). Then the mutation proof: temporarily add a Damerau-1 neighbor of an event member (e.g. `"STAGE SIZS"`) to the `sentinels` excluded entry → confirm the collision tripwire FAILS → revert.

- [ ] **Step 5: Commit**
```bash
git add lib/parser/typoVocabRegistry.ts tests/parser/typoVocabCollision.test.ts
git commit -m "test(parser): register eventFieldAlias fuzzable vocab + collision guard"
```

---

## Task 3: Full verification

- [ ] **Step 1:** `pnpm typecheck && pnpm eslint lib tests && pnpm prettier --check lib/parser/blocks/event.ts tests/parser/blocks/event.test.ts lib/parser/typoVocabRegistry.ts tests/parser/typoVocabCollision.test.ts` → clean (prettier-fix new files; never the master spec).
- [ ] **Step 2:** `pnpm vitest run` (FULL — the #155 lesson). Expected: only the 3 known env-bound live-infra suites fail locally (`tests/admin/test-auth-gate.test.ts` Layer-2 HTTP, `tests/cross-cutting/email-canonicalization.test.ts` live audit, `tests/cross-cutting/pg-cron-coverage.test.ts` live-DB) — they pass in real CI. `tests/parser`, `tests/help`, and the collision meta-test must be green.
- [ ] **Step 3:** Confirm no `FIELD_LABEL_AUTOCORRECTED` catalog/§12.4 drift was introduced (we only REUSED the code): `git diff --name-only origin/main..HEAD` lists exactly the 4 code files + this plan — no `lib/messages/`, no `docs/superpowers/specs/`.

---

## Self-Review (checklist)

1. **Spec coverage:** §5.3 names the event block (`CANONICAL_KEY_MAP`) as a re-route surface; the synthesis ratified `gatedVocabCorrect`-over-local-vocab (not `resolveAliasScoped`) because `event.*` FIELD_ALIASES is incomplete (aliases.ts:114). Covered by Task 1.
2. **Exact-wins + ordering contract:** the deferred-commit + `exactReal` guard is the crux (many-to-one families under last-write-wins; only a real exact value claims). The "Fuzzy-vs-exact behavior contract" section states all three rules; pinned by the exact-wins test (both orders, asserting the typo value is dropped + no warn), the empty/sentinel-exact recovery test, the multiple-fuzzy-siblings last-write-wins test, and the inline-mutation proof. (Resolves plan-review R1 findings 1–3 + R2 finding 2.)
3. **No new code / no #155 lockstep:** verified `FIELD_LABEL_AUTOCORRECTED` exists in catalog (1117), dataGaps (131), dispatch (141), `_families` (61). Task 3 Step 3 guards against accidental catalog drift.
4. **Drift:** vocab derived + exported once; registry imports it; registration test re-derives. No hand-listed member set.
5. **Type consistency:** `EVENT_LABEL_VOCAB: readonly string[]`; `writeField(result, key, val)` used by both exact and fuzzy paths; `gatedVocabCorrect(...).match` is uppercase, mapped back via `CANONICAL_KEY_MAP[match.toLowerCase()]`.

## Adversarial review (cross-model)

**Plan review R1 (Codex): CHANGES_REQUESTED → all 5 findings resolved** — (1+3 HIGH/MED) the fuzzy-vs-exact behavior contract is now explicit (exact wins; suppressed typo dropped, not fallback-kept, no warn) + tested (`ed.attir` undefined assertion); (2 MED) fuzzy siblings now use last-write-wins-except-sentinel matching event's known-label semantics + a new test; (4 LOW) a punctuated-member round-trip test (`Backdrop / Scenicc` → scenic) covers the `CANONICAL_KEY_MAP[match.toLowerCase()]` lookup that the alphabetic-only property test excludes; (5 LOW) a code comment documents why `corrected:false` is unreachable in the fuzzy branch.

**Plan review R2 (Codex): CHANGES_REQUESTED → both findings resolved** — (1 HIGH) the TDD sequence is restructured so the red phase is a clean assertion failure: Step 1 adds only behavior tests (just the `newAggregator` import; verified no name collisions in the file), and the generator property test (which needs the new exports) moves to Step 5 after implementation; (2 MED) the "exact claims a canonical" rule is refined to `exactReal` — only a REAL (non-empty, non-sentinel) exact value claims, so an empty/sentinel exact row never blocks a real fuzzy recovery (no data loss) and a real fuzzy correctly overrides a sentinel exact via `writeField`; pinned by the new empty/sentinel-exact recovery test.

After implementation, send the whole diff to Codex (`codex exec`, read-only, high reasoning) as a REVIEWER-ONLY adversarial review. Iterate to APPROVE. Do-not-relitigate preempts: (a) event-only scope (transport/rooms/client are deferred PR-D2-D4); (b) `gatedVocabCorrect`-over-local-vocab is the correct pattern here, NOT `resolveAliasScoped` (aliases.ts:114 — `event.*` FIELD_ALIASES intentionally incomplete); (c) `FIELD_LABEL_AUTOCORRECTED` reuse is deliberate, no new code; (d) the `EVENT_GATE_EXCLUDE` is intentional belt-and-suspenders since minLen:5 already drops all <5-char do-not-fuzz tokens; (e) the suppressed-typo-emits-no-warning + typo-value-dropped contract is ratified (R1 finding 1+3).

## Execution Handoff

Inline execution in this session (TDD per task, commit per task), then whole-diff Codex review → push → real CI green → `gh pr merge --merge` → fast-forward local `main`.
