# Typo-Tolerant Stage-Word Stripping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-correct misspelled crew stage words (e.g. `Strke`→`Strike`) once, upstream of both `extractStageRestriction` and `extractRoleFlags`, so a typo no longer cascades into spurious `UNKNOWN_ROLE_TOKEN` warnings or silently mis-parses `stage_restriction` — surfacing one deep-linked `STAGE_WORD_AUTOCORRECTED` drift note per cell.

**Architecture:** A small greenfield `fuzzyMatch` helper (Damerau-Levenshtein + closed-vocab match) powers `normalizeStageWords`, a confidence-gated cell normalizer in `personalization.ts`. `buildCrewMember` calls it once before the two extractors. The new warn-severity, crew-name-anchored `STAGE_WORD_AUTOCORRECTED` code reuses PR #154's deep-link path (no UI change).

**Tech Stack:** TypeScript, Vitest. Pure parser change; no DB, no advisory lock, no UI component.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-06-27-stage-word-typo-tolerance-design.md` (Codex-APPROVED). Spec wins on conflict.
- **TDD per task:** failing test → minimal impl → passing test → commit.
- **Roles/emails stay EXACT** — never fuzzy `ROLE_NORMALIZATIONS` (A1↔A2/V1↔L1 are edit-distance 1). The role-exclusion guard (a `ROLE_NORMALIZATIONS` member is classified as a role first) is mandatory.
- **Confidence gate = `≥ 2 stage-ish (exact OR near, Damerau ≤ 1) AND ≥ 1 exact anchor`** (NOT `≥ 2 exact`). Worked-example table is the contract.
- **`ONLY`/`***` peel:** each segment's comparison token strips a trailing `ONLY`/`***` marker before matching; the marker is preserved verbatim on rewrite (`***` day-restriction semantics intact). Only near-miss segments are rewritten; everything else (incl. hyphenated text) rejoined verbatim.
- **`STAGE_WORD_AUTOCORRECTED` is `warn`** (for the PR #154 deep link), full catalog copy modeled on `UNKNOWN_ROLE_TOKEN`, anchored by `blockRef.name`.
- **§12.4 3-part lockstep in ONE commit:** master spec §12.4 table + YAML appendix + `pnpm gen:spec-codes` + `catalog.ts`. `x1-catalog-parity` (`tests/cross-cutting/codes.test.ts`) blocks otherwise.
- **No raw codes (invariant 5):** rendered via catalog title; `x2-no-raw-codes` auto-discovers the emitted code from `lib/parser/**`.
- **Commit per task**, conventional commits, `--no-verify` (CI is the gate).
- **Deferred (class-sweep, do NOT implement):** section-header/field-alias family, `ONLY`-marker typos, `***`-count tolerance, format-tolerance (dates/dashes/`a.m.`).

---

## File Structure

**Create:**
- `lib/parser/fuzzyMatch.ts` — `damerauLevenshtein` + `closedVocabMatch` (Task 1).
- `tests/parser/fuzzyMatch.test.ts` (Task 1).
- `tests/parser/normalizeStageWords.test.ts` (Task 2).

**Modify:**
- `lib/parser/personalization.ts` — add `STAGE_VOCAB`, `normalizeStageWords` + types (Task 2).
- master spec §12.4 + `lib/messages/catalog.ts` + regen `lib/messages/__generated__/spec-codes.ts` (Task 3).
- `lib/parser/blocks/crew.ts` — call `normalizeStageWords` in `buildCrewMember`, emit the note, feed both extractors the corrected cell (Task 4).
- `lib/parser/dataGaps.ts` — add `STAGE_WORD_AUTOCORRECTED` to `OPERATOR_ACTIONABLE_ANCHORED` (Task 5).
- `lib/drive/showDayTimeAnchors.ts` — add `STAGE_WORD_AUTOCORRECTED` to the crew-name dispatch branch (Task 5).
- `tests/parser/blocks/crew.test.ts` (Task 4), `tests/drive/showDayTimeAnchors.test.ts` (Task 5).

---

## Task 1: `fuzzyMatch` helper

**Files:**
- Create: `lib/parser/fuzzyMatch.ts`
- Test: `tests/parser/fuzzyMatch.test.ts`

**Interfaces:**
- Produces: `damerauLevenshtein(a: string, b: string): number`; `closedVocabMatch(token: string, vocab: readonly string[], maxDistance: number): { match: string; exact: boolean } | null`.

- [ ] **Step 1: Write the failing test**

Create `tests/parser/fuzzyMatch.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { damerauLevenshtein, closedVocabMatch } from "@/lib/parser/fuzzyMatch";

describe("damerauLevenshtein", () => {
  it("is 0 for identical strings", () => {
    expect(damerauLevenshtein("STRIKE", "STRIKE")).toBe(0);
  });
  it("counts a single deletion / insertion / substitution as 1", () => {
    expect(damerauLevenshtein("STRKE", "STRIKE")).toBe(1); // deletion
    expect(damerauLevenshtein("STRIKEE", "STRIKE")).toBe(1); // insertion
    expect(damerauLevenshtein("STRIME", "STRIKE")).toBe(1); // substitution
  });
  it("counts an ADJACENT TRANSPOSITION as 1 (the differentiator vs plain Levenshtein)", () => {
    expect(damerauLevenshtein("LAOD IN", "LOAD IN")).toBe(1); // A/O swapped
    expect(damerauLevenshtein("STIRKE", "STRIKE")).toBe(1);
  });
  it("is high for unrelated tokens", () => {
    expect(damerauLevenshtein("XYZ", "STRIKE")).toBeGreaterThan(1);
    expect(damerauLevenshtein("A1", "SET")).toBeGreaterThan(1);
  });
  it("handles empty strings", () => {
    expect(damerauLevenshtein("", "SET")).toBe(3);
    expect(damerauLevenshtein("SET", "")).toBe(3);
  });
});

describe("closedVocabMatch", () => {
  const VOCAB = ["LOAD IN", "SET", "STRIKE", "LOAD OUT"] as const;
  it("returns an exact match with exact:true", () => {
    expect(closedVocabMatch("STRIKE", VOCAB, 1)).toEqual({ match: "STRIKE", exact: true });
  });
  it("returns a near-miss within maxDistance with exact:false", () => {
    expect(closedVocabMatch("STRKE", VOCAB, 1)).toEqual({ match: "STRIKE", exact: false });
    expect(closedVocabMatch("LAOD IN", VOCAB, 1)).toEqual({ match: "LOAD IN", exact: false });
  });
  it("returns null beyond maxDistance", () => {
    expect(closedVocabMatch("XYZ", VOCAB, 1)).toBeNull();
    expect(closedVocabMatch("A1", VOCAB, 1)).toBeNull();
  });
  it("prefers an exact hit over a near-miss", () => {
    expect(closedVocabMatch("SET", VOCAB, 1)).toEqual({ match: "SET", exact: true });
  });
  it("among near-misses picks smallest distance, then vocab order", () => {
    const V = ["AB", "AC", "XY"] as const;
    // "AD" is distance 1 from BOTH AB and AC → tie → vocab order wins → AB
    expect(closedVocabMatch("AD", V, 1)).toEqual({ match: "AB", exact: false });
    // "AAB" is distance 1 from AB but distance 2 from AC → smaller distance wins → AB
    expect(closedVocabMatch("AAB", V, 2)).toEqual({ match: "AB", exact: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/parser/fuzzyMatch.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `lib/parser/fuzzyMatch.ts`:

```ts
/**
 * Small fuzzy-match utilities for typo-tolerant CLOSED-vocabulary matching.
 * Damerau-Levenshtein (optimal string alignment) so a single adjacent
 * transposition — "Laod"→"Load", "Stirke"→"Strike" — is distance 1 (it is 2 in
 * plain Levenshtein), since transpositions are common typos. The internal plain
 * `levenshtein` in lib/parser/invariants.ts (crew-rename pairing) is intentionally
 * left untouched. Wired to stage words only in this PR; reusable for future
 * closed-vocab consumers (see the design's deferred list).
 */

/** Damerau-Levenshtein (optimal string alignment) edit distance. O(m·n). */
export function damerauLevenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const d: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i]![0] = i;
  for (let j = 0; j <= n; j++) d[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i]![j] = Math.min(
        d[i - 1]![j]! + 1, // deletion
        d[i]![j - 1]! + 1, // insertion
        d[i - 1]![j - 1]! + cost, // substitution
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1); // adjacent transposition
      }
    }
  }
  return d[m]![n]!;
}

/**
 * Match `token` against a closed `vocab`. Exact hit → { match, exact:true }.
 * Else the nearest member within `maxDistance` → { match, exact:false }. No match
 * within the radius → null. Ties broken by smallest distance, then vocab order.
 */
export function closedVocabMatch(
  token: string,
  vocab: readonly string[],
  maxDistance: number,
): { match: string; exact: boolean } | null {
  for (const v of vocab) {
    if (v === token) return { match: v, exact: true };
  }
  let best: string | null = null;
  let bestDist = maxDistance + 1;
  for (const v of vocab) {
    const dist = damerauLevenshtein(token, v);
    if (dist <= maxDistance && dist < bestDist) {
      best = v;
      bestDist = dist;
    }
  }
  return best ? { match: best, exact: false } : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/parser/fuzzyMatch.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/parser/fuzzyMatch.ts tests/parser/fuzzyMatch.test.ts
git commit --no-verify -m "feat(parser): add fuzzyMatch helper (Damerau-Levenshtein + closedVocabMatch)"
```

---

## Task 2: `normalizeStageWords`

**Files:**
- Modify: `lib/parser/personalization.ts` (append after `extractStageRestriction`, ~line 162)
- Test: `tests/parser/normalizeStageWords.test.ts`

**Interfaces:**
- Consumes: `closedVocabMatch` (Task 1), `ROLE_NORMALIZATIONS` (existing, `personalization.ts:15-39`).
- Produces: `STAGE_VOCAB`; `type StageWordCorrection = { detected: string; corrected: string }`; `type StageNormalization = { corrected: string; corrections: StageWordCorrection[] }`; `normalizeStageWords(roleCell: string): StageNormalization`.

- [ ] **Step 1: Write the failing test**

Create `tests/parser/normalizeStageWords.test.ts` — every row of the spec §4.2 table + the guard cases:

```ts
import { describe, it, expect } from "vitest";
import { normalizeStageWords } from "@/lib/parser/personalization";

describe("normalizeStageWords — confidence-gated stage-word typo correction", () => {
  it("East Coast full list: corrects Strke, leaves A1, one correction", () => {
    const r = normalizeStageWords("Load In/Set/Strke/Load Out - A1");
    expect(r.corrected).toBe("Load In/Set/Strike/Load Out - A1");
    expect(r.corrections).toEqual([{ detected: "Strke", corrected: "Strike" }]);
  });

  it("2-word ONLY, typo on the RIGHT (peel ONLY): corrects + keeps ONLY", () => {
    const r = normalizeStageWords("Load Out / Strke ONLY");
    expect(r.corrected).toBe("Load Out / Strike ONLY");
    expect(r.corrections).toEqual([{ detected: "Strke", corrected: "Strike" }]);
  });

  it("2-word ONLY, typo on the LEFT (transposition): corrects + keeps ONLY", () => {
    const r = normalizeStageWords("Laod In / Set ONLY");
    expect(r.corrected).toBe("Load In / Set ONLY");
    expect(r.corrections).toEqual([{ detected: "Laod In", corrected: "Load In" }]);
  });

  it("multiple typos in one cell → all corrected, one result (each typo Damerau ≤ 1)", () => {
    // Lod In (+A), Strke (-I), Load Ot (+U) are EACH distance 1. (A two-typo word
    // like "Lod Ot" would be distance 2 → beyond maxDistance=1 → not corrected.)
    const r = normalizeStageWords("Lod In/Set/Strke/Load Ot - V1");
    expect(r.corrected).toBe("Load In/Set/Strike/Load Out - V1");
    expect(r.corrections.map((c) => c.corrected).sort()).toEqual(["Load In", "Load Out", "Strike"]);
  });

  it("a stage word with TWO typos (Damerau 2) is NOT corrected", () => {
    // "Lod Ot" → "Load Out" is distance 2; with Set+Strike as anchors the gate could
    // fire, but Lod Ot is not a near-miss so it is left as an unknown role token.
    const r = normalizeStageWords("Load In/Set/Strike/Lod Ot - V1");
    expect(r.corrections).toEqual([]); // Lod Ot not within maxDistance=1; nothing corrected
    expect(r.corrected).toBe("Load In/Set/Strike/Lod Ot - V1");
  });

  it("lone near-miss with NO exact anchor → NOT corrected (intentional token wins)", () => {
    const r = normalizeStageWords("Strke - A1");
    expect(r.corrected).toBe("Strke - A1");
    expect(r.corrections).toEqual([]);
  });

  it("genuine unknown role with stage context → NOT corrected (not a near-miss)", () => {
    const r = normalizeStageWords("Load In/Set/Strike/Load Out - RIGGER");
    expect(r.corrected).toBe("Load In/Set/Strike/Load Out - RIGGER");
    expect(r.corrections).toEqual([]);
  });

  it("role-exclusion: a recognized role is never rewritten to a stage word", () => {
    // A1 is a real role; even with stage context it is classified as a role, not corrected.
    const r = normalizeStageWords("Load In/Set/Strike/Load Out - A1");
    expect(r.corrected).toContain("- A1"); // A1 untouched
  });

  it("clean stage list (no typo) → unchanged, no corrections", () => {
    const r = normalizeStageWords("Load In / Set / Strike / Load Out - LEAD");
    expect(r.corrections).toEqual([]);
    expect(r.corrected).toBe("Load In / Set / Strike / Load Out - LEAD");
  });

  it("hyphenated non-stage segment in stage context is rejoined verbatim", () => {
    const r = normalizeStageWords("Load In/Set/Strke/Load Out - SOME-VALUE");
    expect(r.corrected).toBe("Load In/Set/Strike/Load Out - SOME-VALUE");
    expect(r.corrections).toEqual([{ detected: "Strke", corrected: "Strike" }]);
  });

  it("*** day-restriction marker preserved on a corrected stage word", () => {
    const r = normalizeStageWords("Load In/Set/Strke/Load Out*** - A1");
    expect(r.corrected).toBe("Load In/Set/Strike/Load Out*** - A1");
  });

  it("empty / non-stage cell → unchanged", () => {
    expect(normalizeStageWords("- A1").corrections).toEqual([]);
    expect(normalizeStageWords("").corrections).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/parser/normalizeStageWords.test.ts`
Expected: FAIL — `normalizeStageWords` not exported.

- [ ] **Step 3: Implement**

In `lib/parser/personalization.ts`, add the import at the top (near the other imports):

```ts
import { closedVocabMatch } from "@/lib/parser/fuzzyMatch";
```

Append after `extractStageRestriction` (after line 162):

```ts
// ── normalizeStageWords (typo-tolerant stage-word correction) ──────────────────

/** Post-tokenization canonical stage tokens (uppercase). */
const STAGE_VOCAB = ["LOAD IN", "SET", "STRIKE", "LOAD OUT"] as const;
/** Canonical display casing for the rewrite (regexes downstream are /i, so case
 *  is cosmetic, but we keep the corpus casing). */
const STAGE_CANONICAL: Record<string, string> = {
  "LOAD IN": "Load In",
  SET: "Set",
  STRIKE: "Strike",
  "LOAD OUT": "Load Out",
};
/** Trailing restriction marker peeled from a segment's comparison token: a
 *  `ONLY` (optionally `ONLY***`) or a bare `***` (exactly three). Deliberately
 *  NOT 1–2 stars — `***`-count tolerance is deferred; `ONLY*`/`ONLY**` are left
 *  unpeeled (fall through to existing behavior). */
const STAGE_TRAILING_MARKER_RE = /(\s*\bONLY\b(?:\s*\*{3})?\s*|\s*\*{3}\s*)$/i;

export type StageWordCorrection = { detected: string; corrected: string };
export type StageNormalization = { corrected: string; corrections: StageWordCorrection[] };

/**
 * Auto-correct misspelled stage words in a cleaned role cell, confidence-gated.
 * Returns the corrected cell + the list of corrections. Gate: ≥ 2 stage-ish
 * tokens (exact OR Damerau ≤ 1) AND ≥ 1 exact stage anchor. A recognized role
 * (ROLE_NORMALIZATIONS) is classified as a role first and never rewritten. Only
 * near-miss segments are rewritten; exact-stage and non-stage segments (incl.
 * hyphenated text) and the peeled ONLY/*** marker are preserved verbatim.
 */
export function normalizeStageWords(roleCell: string): StageNormalization {
  // Split keeping separators (odd indices) so the rebuild is faithful.
  const parts = roleCell.split(/([/\-])/);
  let exactCount = 0;
  let stageIshCount = 0;
  // candidate[i] holds the canonical UPPER vocab member for a part to rewrite.
  const candidate: (string | null)[] = new Array(parts.length).fill(null);

  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) continue; // separator
    const raw = parts[i] ?? "";
    const marker = raw.match(STAGE_TRAILING_MARKER_RE)?.[0] ?? "";
    const head = marker ? raw.slice(0, raw.length - marker.length) : raw;
    const cmp = head.trim().toUpperCase();
    if (!cmp) continue;
    if (ROLE_NORMALIZATIONS[cmp]) continue; // role-exclusion: never a stage word
    if ((STAGE_VOCAB as readonly string[]).includes(cmp)) {
      exactCount += 1;
      stageIshCount += 1;
      continue;
    }
    const match = closedVocabMatch(cmp, STAGE_VOCAB, 1);
    if (match && !match.exact) {
      stageIshCount += 1;
      candidate[i] = match.match;
    }
  }

  // Confidence gate.
  if (!(stageIshCount >= 2 && exactCount >= 1)) {
    return { corrected: roleCell, corrections: [] };
  }

  const corrections: StageWordCorrection[] = [];
  const rebuilt = parts.map((raw, i) => {
    const cand = candidate[i];
    if (!cand) return raw;
    const marker = raw.match(STAGE_TRAILING_MARKER_RE)?.[0] ?? "";
    const head = marker ? raw.slice(0, raw.length - marker.length) : raw;
    const detected = head.trim();
    const corrected = STAGE_CANONICAL[cand] ?? cand;
    corrections.push({ detected, corrected });
    // Replace the trimmed head core, preserving head's surrounding whitespace + the marker.
    return head.replace(detected, corrected) + marker;
  });

  return { corrected: rebuilt.join(""), corrections };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/parser/normalizeStageWords.test.ts`
Expected: PASS (all rows + guards).

- [ ] **Step 5: Negative-regression check (prove the gate is pinned)**

Temporarily change the gate to `stageIshCount >= 2` (drop `&& exactCount >= 1`), re-run: the "lone near-miss → NOT corrected" test MUST fail. Revert the change. (This proves the test catches a too-greedy gate.)

- [ ] **Step 6: Commit**

```bash
git add lib/parser/personalization.ts tests/parser/normalizeStageWords.test.ts
git commit --no-verify -m "feat(parser): add normalizeStageWords (ONLY-peel + confidence gate + role-exclusion)"
```

---

## Task 3: `STAGE_WORD_AUTOCORRECTED` catalog (§12.4 3-part lockstep)

**Files:**
- Modify: `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (§12.4 table ~`:2881`, YAML appendix ~`:3061`)
- Modify: `lib/messages/catalog.ts` (add a row after `UNKNOWN_ROLE_TOKEN` ~`:1064`)
- Regenerate: `lib/messages/__generated__/spec-codes.ts` (via `pnpm gen:spec-codes`)
- Test: `tests/cross-cutting/codes.test.ts` (x1 — no new test, must stay green)

**Interfaces:**
- Produces: `STAGE_WORD_AUTOCORRECTED` recognized by `isMessageCode`/`messageFor` (`lib/messages/lookup.ts`).

- [ ] **Step 1: Add the §12.4 master-spec table row**

In `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md`, in the §12.4 markdown table (after the `UNKNOWN_ROLE_TOKEN` row), add (5 columns: code | condition | dougFacing | crewFacing | followUp):

```markdown
| `STAGE_WORD_AUTOCORRECTED` | a crew role cell has a misspelled stage word (e.g. `Strke`) that we auto-corrected | "We read a likely-misspelled stage word in _<crew-name>_'s role (for example 'Strke' as 'Strike') and used the corrected version, so their schedule still reads correctly. If it was intentional, update the sheet." | — | Doug → optional fix |
```

- [ ] **Step 2: Add the §12.4 YAML appendix entry (helpfulContext)**

In the same file's §12.4 helpfulContext YAML appendix (the ` ```yaml ` block after the `<!-- §12.4 helpfulContext appendix` anchor), add:

```yaml
STAGE_WORD_AUTOCORRECTED: "A stage word in this crew member's role looked misspelled (e.g. 'Strke'), so we read it as the closest real stage word ('Strike') and used that — nothing else is affected. If the spelling was intentional, update the sheet."
```

- [ ] **Step 3: Add the `catalog.ts` row (full copy, modeled on `UNKNOWN_ROLE_TOKEN`)**

In `lib/messages/catalog.ts`, after the `UNKNOWN_ROLE_TOKEN` row (`:1064`), add (no `severity` field — parse warnings omit it):

```ts
  STAGE_WORD_AUTOCORRECTED: {
    code: "STAGE_WORD_AUTOCORRECTED",
    dougFacing:
      "We read a likely-misspelled stage word in _<crew-name>_'s role (for example 'Strke' as 'Strike') and used the corrected version, so their schedule still reads correctly. If it was intentional, update the sheet.",
    crewFacing: null,
    followUp: "Doug → optional fix",
    helpfulContext:
      "A stage word in this crew member's role looked misspelled (e.g. 'Strke'), so we read it as the closest real stage word ('Strike') and used that — nothing else is affected. If the spelling was intentional, update the sheet.",
    title: "Auto-corrected a misspelled stage word",
    longExplanation:
      "A stage word in a crew member's role cell looked misspelled, so we read it as the closest real stage word and used that — the role and schedule still parse correctly. If the spelling was intentional, update the sheet.",
    helpHref: "/help/errors#STAGE_WORD_AUTOCORRECTED",
  },
```

- [ ] **Step 4: Regenerate spec-codes + run x1**

Run:
```bash
pnpm gen:spec-codes
pnpm vitest run tests/cross-cutting/codes.test.ts tests/cross-cutting/extract-spec-codes.test.ts
```
Expected: `lib/messages/__generated__/spec-codes.ts` now contains `STAGE_WORD_AUTOCORRECTED` (dougFacing/crewFacing/followUp/helpfulContext matching the catalog), and x1-catalog-parity PASSES. If x1 fails, the three sources disagree — reconcile the exact copy strings (they must be byte-identical between §12.4 prose and `catalog.ts`).

- [ ] **Step 5: Commit (all three together)**

```bash
git add docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md lib/messages/catalog.ts lib/messages/__generated__/spec-codes.ts
git commit --no-verify -m "feat(messages): add STAGE_WORD_AUTOCORRECTED catalog code (§12.4 3-part lockstep)"
```

---

## Task 4: Integrate `normalizeStageWords` in `buildCrewMember` + emit the note

**Files:**
- Modify: `lib/parser/blocks/crew.ts:264-267` (insert at `:265`)
- Test: `tests/parser/blocks/crew.test.ts`

**Interfaces:**
- Consumes: `normalizeStageWords` (Task 2); `crewBlockRef` (`crew.ts:232`); `STAGE_WORD_AUTOCORRECTED` catalog code (Task 3).

- [ ] **Step 1: Write the failing test**

In `tests/parser/blocks/crew.test.ts`, add (mirror the file's existing `newAggregator()` → `parseCrew(md, version, agg)` pattern — a v1 TECH sheet so the compound `Name - stages - role` cell is exercised):

```ts
import { newAggregator } from "@/lib/parser/warnings";
// ... existing imports (parseCrew) ...

it("auto-corrects a misspelled stage word: 0 UNKNOWN_ROLE_TOKEN + 1 STAGE_WORD_AUTOCORRECTED, role parses", () => {
  const md = [
    "| TECH | PHONE | ARRIVAL | DEPARTURE |",
    "| --- | --- | --- | --- |",
    "| Eric Weiss - Load In/Set/Strke/Load Out - A1 | 555 |  |  |",
  ].join("\n");
  const agg = newAggregator();
  const crew = parseCrew(md, "v1", agg);

  expect(agg.warnings.filter((w) => w.code === "UNKNOWN_ROLE_TOKEN")).toHaveLength(0);
  // EXACTLY ONE drift note per cell (count, not find — guards against double-push
  // into the aggregator).
  const notes = agg.warnings.filter((w) => w.code === "STAGE_WORD_AUTOCORRECTED");
  expect(notes).toHaveLength(1);
  const note = notes[0]!;
  expect(note.severity).toBe("warn");
  expect(note.blockRef).toMatchObject({ kind: "crew", name: "Eric Weiss" }); // deep-link anchor
  expect(crew[0]!.role_flags).toContain("A1"); // real role still parses
});

it("auto-corrects a typo'd ONLY stage restriction (silent mis-parse fixed)", () => {
  const md = [
    "| CREW | NAME | ROLE | PHONE |",
    "| --- | --- | --- | --- |",
    "|  | Jane Doe | - Load Out / Strke ONLY | 555 |",
  ].join("\n");
  const agg = newAggregator();
  const crew = parseCrew(md, "v4", agg);

  expect(agg.warnings.find((w) => w.code === "STAGE_WORD_AUTOCORRECTED")).toBeTruthy();
  // stage_restriction now resolves (was silently { kind: "none" } before the fix).
  expect(crew[0]!.stage_restriction).toEqual({ kind: "explicit", stages: ["Load Out", "Strike"] });
});

it("does NOT emit STAGE_WORD_AUTOCORRECTED for a clean stage list", () => {
  const md = [
    "| CREW | NAME | ROLE | PHONE |",
    "| --- | --- | --- | --- |",
    "|  | Amy Lane | - Load In / Set / Strike / Load Out - LEAD | 555 |",
  ].join("\n");
  const agg = newAggregator();
  parseCrew(md, "v4", agg);
  expect(agg.warnings.find((w) => w.code === "STAGE_WORD_AUTOCORRECTED")).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/parser/blocks/crew.test.ts -t "stage word"`
Expected: FAIL — the cascade still emits `UNKNOWN_ROLE_TOKEN`; no `STAGE_WORD_AUTOCORRECTED`.

- [ ] **Step 3: Implement**

In `lib/parser/blocks/crew.ts`, add the import near the other `personalization` imports:

```ts
import { normalizeStageWords } from "../personalization";
```

Insert at `crew.ts:265` (between `const cleanedRole = …` at `:264` and `const stageRestriction = extractStageRestriction(cleanedRole)` at `:266`), and change both extractor calls to use the corrected cell:

```ts
  const cleanedRole = dayResult.cleanedRoleCell.trim();           // :264 (unchanged)

  // Auto-correct misspelled stage words ONCE, upstream of both extractors, so the
  // UNKNOWN_ROLE_TOKEN cascade AND the silent stage_restriction mis-parse are fixed.
  const stageNorm = normalizeStageWords(cleanedRole);
  const roleCellForParse = stageNorm.corrected;
  if (stageNorm.corrections.length > 0) {
    const stageNote: ParseWarning = {
      severity: "warn",
      code: "STAGE_WORD_AUTOCORRECTED",
      message: `Read likely-misspelled stage word(s) ${stageNorm.corrections
        .map((c) => `'${c.detected}' as '${c.corrected}'`)
        .join(", ")} in role cell: '${cleanedRole}'`,
      rawSnippet: cleanedRole,
      blockRef: crewBlockRef,
    };
    warnings.push(stageNote);
    if (agg) agg.warnings.push(stageNote);
  }

  const stageRestriction = extractStageRestriction(roleCellForParse);  // was cleanedRole
  const roleFlagResult = extractRoleFlags(roleCellForParse);           // was cleanedRole
```

(Confirm `ParseWarning` is imported in `crew.ts` — it is, used by the existing `UNKNOWN_ROLE_TOKEN` stamping.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/parser/blocks/crew.test.ts`
Expected: PASS (new cases + the full existing crew suite stays green — the happy path is unchanged because `normalizeStageWords` is a no-op on clean cells).

- [ ] **Step 5: Commit**

```bash
git add lib/parser/blocks/crew.ts tests/parser/blocks/crew.test.ts
git commit --no-verify -m "feat(parser): auto-correct stage-word typos in buildCrewMember (fixes cascade + silent stage_restriction)"
```

---

## Task 5: Deep-link wiring (`STAGE_WORD_AUTOCORRECTED` → crew-cell anchor)

**Files:**
- Modify: `lib/parser/dataGaps.ts:122-127` (`OPERATOR_ACTIONABLE_ANCHORED`)
- Modify: `lib/drive/showDayTimeAnchors.ts:114-115` (the crew-name dispatch branch)
- Test: `tests/drive/showDayTimeAnchors.test.ts`

**Interfaces:**
- Consumes: the crew-name resolver `resolveCrewRoleCell` (existing).

- [ ] **Step 1: Write the failing test**

In `tests/drive/showDayTimeAnchors.test.ts`, extend the dispatch test (mirror the existing `attachSourceCellAnchors` test):

```ts
it("resolves STAGE_WORD_AUTOCORRECTED by blockRef.name (crew cell), like the other crew codes", () => {
  const crewAnchors = [{ name: "jane doe", anchor: { title: "INFO", gid: 0, a1: "C3" } }];
  const ws: ParseWarning[] = [
    { severity: "warn", code: "STAGE_WORD_AUTOCORRECTED", message: "x", blockRef: { kind: "crew", index: 0, name: "Jane Doe" } },
  ];
  attachSourceCellAnchors(ws, { showDay: [], crewRole: crewAnchors, region: {} });
  expect(ws[0]!.sourceCell).toEqual({ title: "INFO", gid: 0, a1: "C3" });
});

it("hasCellAnchoredWarning is true for STAGE_WORD_AUTOCORRECTED", () => {
  expect(hasCellAnchoredWarning([{ severity: "warn", code: "STAGE_WORD_AUTOCORRECTED", message: "x" }])).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/drive/showDayTimeAnchors.test.ts -t "STAGE_WORD_AUTOCORRECTED"`
Expected: FAIL — code not in the set / not dispatched, `sourceCell` undefined.

- [ ] **Step 3: Implement**

In `lib/parser/dataGaps.ts`, add the code to `OPERATOR_ACTIONABLE_ANCHORED` (`:122-127`):

```ts
export const OPERATOR_ACTIONABLE_ANCHORED: ReadonlySet<string> = new Set([
  "SCHEDULE_TIME_UNPARSED",
  "UNKNOWN_ROLE_TOKEN",
  "UNKNOWN_DAY_RESTRICTION",
  "STAGE_WORD_AUTOCORRECTED",
  FIELD_UNREADABLE,
]);
```

In `lib/drive/showDayTimeAnchors.ts`, add the code to the crew-name dispatch branch (`:114`):

```ts
    } else if (
      w.code === "UNKNOWN_ROLE_TOKEN" ||
      w.code === "UNKNOWN_DAY_RESTRICTION" ||
      w.code === "STAGE_WORD_AUTOCORRECTED"
    ) {
      cell = resolveCrewRoleCell(sources.crewRole, w.blockRef?.name);
    }
```

(`CELL_ANCHORED_CODES === OPERATOR_ACTIONABLE_ANCHORED` (`:15`), so adding to the set also widens `hasCellAnchoredWarning` automatically. The existing `CELL_ANCHORED_CODES ≡ OPERATOR_ACTIONABLE_ANCHORED` identity test stays green — it's the same object.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/drive/showDayTimeAnchors.test.ts`
Expected: PASS (new cases + the existing dispatch/identity tests stay green).

- [ ] **Step 5: Commit**

```bash
git add lib/parser/dataGaps.ts lib/drive/showDayTimeAnchors.ts tests/drive/showDayTimeAnchors.test.ts
git commit --no-verify -m "feat(drive): deep-link STAGE_WORD_AUTOCORRECTED to the crew cell (reuses PR #154 anchor path)"
```

---

## Task 6: Full verification

**Files:** none (verification).

- [ ] **Step 1: Typecheck + format (the CI commands)**

Run:
```bash
pnpm typecheck
pnpm format:check
```
Expected: both PASS. If `format:check` flags new files, run `pnpm prettier --write` on them and re-check.

- [ ] **Step 2: The catalog + no-raw-codes gates**

Run:
```bash
pnpm vitest run tests/cross-cutting/codes.test.ts tests/cross-cutting/extract-spec-codes.test.ts tests/cross-cutting/no-raw-codes.test.ts
```
Expected: PASS. `x2-no-raw-codes` auto-discovers `STAGE_WORD_AUTOCORRECTED` from the `lib/parser/blocks/crew.ts` emission (`source: 'parse_warnings.code'`) and confirms it's never rendered raw (it has catalog copy).

- [ ] **Step 3: Full affected test surface**

Run:
```bash
pnpm vitest run tests/parser tests/drive tests/messages tests/cross-cutting
```
Expected: PASS (env-gated DB/HTTP suites may skip locally — they run in CI).

- [ ] **Step 4: Confirm invariant-8 N/A**

Run `git diff origin/main --stat -- 'components/**' 'app/**'` — expect **no** UI-component/page changes (the note renders through the unchanged PR #154 `PerShowActionableWarnings`). If empty, the impeccable dual-gate is N/A and the milestone proceeds to whole-diff review. If any `components/`/`app/` (non-api) file changed, run `/impeccable critique` + `/impeccable audit`.

- [ ] **Step 5: Commit any verification fixes**

```bash
git add -A
git commit --no-verify -m "chore: typecheck/format fixes for stage-word typo tolerance"
```

---

## Adversarial review (cross-model)

After self-review, invoke the cross-CLI Codex review on the WHOLE diff. Iterate to APPROVE (reviewer-only). Do not proceed to merge without an APPROVE.

---

## Self-Review (checklist — not a subagent)

1. **Spec coverage:** §3 helper → Task 1; §4 normalizeStageWords (ONLY-peel, gate, role-exclusion, worked table, rewrite) → Task 2; §5 buildCrewMember integration (both extractors) → Task 4; §6 STAGE_WORD_AUTOCORRECTED + deep-link wiring → Tasks 3+5; §6.1 §12.4 lockstep → Task 3; §6.2 x2 → Task 6; §8 guards → Task 2; §9 leave-exact (role-exclusion) → Task 2; §10 tests (every worked-example row, over-match, ONLY-peel, hyphen, ***) → Tasks 1,2,4; §11 invariants → Task 6. No gaps.
2. **Placeholder scan:** every code step has real code; no TBD/TODO.
3. **Type consistency:** `StageNormalization`/`StageWordCorrection`/`normalizeStageWords` consistent (Tasks 2,4); `closedVocabMatch`/`damerauLevenshtein` consistent (Tasks 1,2); `STAGE_WORD_AUTOCORRECTED` string consistent (Tasks 3,4,5); `OPERATOR_ACTIONABLE_ANCHORED` shape consistent (Task 5).
