# Parser typo-tolerance PR-A (P0 + P1) — implementation plan

> **For agentic workers:** TDD per task — failing test → minimal impl → passing test → commit. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ship the shared typo-correction gate + registry + collision meta-test + generator harness, plus the 3 safe P1 fuzz surfaces (multi-word roles, crew columns, TRANSPORTATION/EVENT DETAILS routers) — each autocorrect+warn, with a `*_AUTOCORRECTED` warn code.

**Architecture:** A parameterized `gatedVocabCorrect` (built on the existing `closedVocabMatch`) with exact-first / cross-vocab exclusion / tie-abort / minLen / scopePrefix. A central registry of fuzzable + excluded vocabs drives both a CI collision meta-test and the generator-driven tests. Three surfaces call the gate at their existing exact-match sites and emit deep-linked warnings reusing the #154/#156 anchor plumbing.

**Tech Stack:** TypeScript, Vitest. Pure parser; no DB, no advisory lock, no UI component.

**Spec:** `docs/superpowers/specs/2026-06-27-parser-typo-tolerance-design.md` (Codex-APPROVED). Spec wins on conflict.

## Global Constraints

- TDD per task; commit per task; conventional commits; `--no-verify` (CI is the gate).
- **Gate universals (every fuzzable surface):** exact-first (never fuzz a token exactly matching ANY registered vocab) → maxDistance 1 (Damerau) → cross-vocab exclusion → always emit a warn-severity deep-linked correction. Per-family opts: `minLen`, `tieAbort`, `scopePrefix` (P2 only), `fieldBand` (`0` for P1 long routers).
- **Do-NOT-fuzz (spec §8):** short role codes (`A1/A2/V1/L1/GS/BO/LED…`), version detection, `isKnownSectionHeader` alarm guard, valCanon guard, sentinels, ALL format/date/`***`-count surfaces, weekdays (deferred). PR-A fuzzes ONLY: `MULTI_WORD_TOKENS`, crew columns `{NAME,ROLE,PHONE,EMAIL}`, long section routers `{TRANSPORTATION, EVENT DETAILS, GS DETAILS}`. (The passenger column `{PASSENGERS}` is deferred — see Task 6.)
- **3 new warn codes** (`ROLE_TOKEN_`, `COLUMN_HEADER_`, `SECTION_HEADER_AUTOCORRECTED`), each via the #155 6-surface lockstep: `catalog.ts` row + master-spec §12.4 prose + `pnpm gen:spec-codes` + `OPERATOR_ACTIONABLE_ANCHORED` (`dataGaps.ts:122`) + `app/help/errors/_families.ts` prefix map + `/help` page. New prefixes `ROLE`/`COLUMN`/`SECTION` MUST be mapped in `_families.ts` or the `errors-grouping` shard-2 orphan-guard fails CI-only.
- **NEVER prettier the master spec** (it's `.prettierignore`'d; x1-catalog-parity byte-compares it).
- **Run the COMPLETE `pnpm vitest run` before push** (the #155 lesson: `tests/help` is shard 2). Env-bound live-DB/HTTP suites (test-auth-gate Layer-2, pg-cron-coverage, email-canonicalization live audit) fail locally without infra, pass in CI.

## Meta-test inventory

- **CREATES:** `tests/parser/typoVocabCollision.test.ts` (the registry collision tripwire — every fuzzable member vs ALL registered vocabs incl. excluded).
- **EXTENDS:** the `OPERATOR_ACTIONABLE_ANCHORED` membership pin-tests (`tests/parser/operatorActionableWarnings.test.ts` + `tests/drive/showDayTimeAnchors.test.ts`) by +3 (14→17).
- Advisory-lock / Supabase-boundary: N/A (pure parser). Invariant 8: N/A (`_families.ts` prefix-map edit authors no visual surface, per #155).

## File Structure

- Create: `lib/parser/typoGate.ts` (`gatedVocabCorrect`), `lib/parser/typoVocabRegistry.ts` (registry), `tests/parser/typoGate.test.ts`, `tests/parser/typoVocabCollision.test.ts`, `tests/parser/_typoGenerator.ts` (test util — single-edit neighbor generator).
- Modify: `lib/parser/personalization.ts` (`extractRoleFlags` multi-word fuzzy), `lib/parser/blocks/crew.ts` (`detectColumns` fuzzy + role-warning stamping), `lib/parser/index.ts` (`normalizeSectionHeaders` pre-pass) + a new `lib/parser/sectionHeaderNormalize.ts`, `lib/parser/dataGaps.ts` (set), `lib/messages/catalog.ts` + `docs/.../2026-04-30-fxav-crew-pages-v1.md` (§12.4) + generated codes, `app/help/errors/_families.ts`.

---

## Task 1: `gatedVocabCorrect` — the shared gate

**Files:** Create `lib/parser/typoGate.ts`, `tests/parser/typoGate.test.ts`.

**Interfaces:**
- Produces: `gatedVocabCorrect(token: string, vocab: readonly string[], opts: GateOpts): { match: string; corrected: boolean } | null` where `GateOpts = { maxDistance?: number; minLen?: number; tieAbort?: boolean; exclude?: readonly string[] }`. Returns `{match, corrected:false}` on an exact hit; `{match, corrected:true}` on a gated non-exact hit; `null` otherwise.
- Consumes: `closedVocabMatch`, `damerauLevenshtein` (`lib/parser/fuzzyMatch.ts`).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { gatedVocabCorrect } from "@/lib/parser/typoGate";

const V = ["TRANSPORTATION", "EVENT DETAILS"] as const;

describe("gatedVocabCorrect", () => {
  it("exact hit → corrected:false (no warning needed)", () => {
    expect(gatedVocabCorrect("TRANSPORTATION", V, {})).toEqual({ match: "TRANSPORTATION", corrected: false });
  });
  it("distance-1 near miss → corrected:true", () => {
    expect(gatedVocabCorrect("TRANSPORTATON", V, {})).toEqual({ match: "TRANSPORTATION", corrected: true });
  });
  it("beyond distance 1 → null", () => {
    expect(gatedVocabCorrect("XYZ", V, {})).toBeNull();
  });
  it("token shorter than minLen → null (never corrected)", () => {
    expect(gatedVocabCorrect("GS", ["GREEN ROOM"], { minLen: 5 })).toBeNull();
  });
  it("token exactly in the exclude set → null (cross-vocab exclusion), even if distance-1 from a member", () => {
    // 'A2' is excluded; do not let it correct to 'A1'
    expect(gatedVocabCorrect("A2", ["A1"], { exclude: ["A1", "A2", "V1", "L1"] })).toBeNull();
  });
  it("tieAbort: a token distance-1 from TWO members returns null", () => {
    // 'AD' is distance 1 from both 'AB' and 'AC'
    expect(gatedVocabCorrect("AD", ["AB", "AC"], { tieAbort: true })).toBeNull();
    // without tieAbort, closedVocabMatch's vocab-order tiebreak picks the first
    expect(gatedVocabCorrect("AD", ["AB", "AC"], {})).toEqual({ match: "AB", corrected: true });
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm vitest run tests/parser/typoGate.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// lib/parser/typoGate.ts
import { closedVocabMatch, damerauLevenshtein } from "@/lib/parser/fuzzyMatch";

export type GateOpts = {
  maxDistance?: number; // default 1
  minLen?: number; // reject tokens shorter than this
  tieAbort?: boolean; // ≥2 candidates at min distance → null
  exclude?: readonly string[]; // cross-vocab exclusion (raw token exactly in here → null)
};

/**
 * Confidence-gated closed-vocab correction. Exact-first; else nearest within
 * maxDistance subject to the gate. Returns {match, corrected:false} on exact,
 * {match, corrected:true} on a gated near-miss, null otherwise. See spec §2.
 */
export function gatedVocabCorrect(
  token: string,
  vocab: readonly string[],
  opts: GateOpts,
): { match: string; corrected: boolean } | null {
  const maxDistance = opts.maxDistance ?? 1;
  // Exact-first: an exact member is never a "correction".
  for (const v of vocab) {
    if (v === token) return { match: v, corrected: false };
  }
  // Cross-vocab exclusion: a token that is an exact member of a DIFFERENT vocab
  // is never fuzzed (the #155 role-exclusion generalized).
  if (opts.exclude && opts.exclude.includes(token)) return null;
  // minLen: short tokens are too collision-prone to fuzz.
  if (opts.minLen !== undefined && token.length < opts.minLen) return null;
  const m = closedVocabMatch(token, vocab, maxDistance);
  if (!m || m.exact) return m && m.exact ? { match: m.match, corrected: false } : null;
  // tie-abort: count candidates at the winning distance.
  if (opts.tieAbort) {
    const bestDist = damerauLevenshtein(token, m.match);
    const tied = vocab.filter((v) => damerauLevenshtein(token, v) === bestDist).length;
    if (tied > 1) return null;
  }
  return { match: m.match, corrected: true };
}
```

- [ ] **Step 4: Run to verify pass** — `pnpm vitest run tests/parser/typoGate.test.ts` → PASS.

- [ ] **Step 5: Commit** — `git add lib/parser/typoGate.ts tests/parser/typoGate.test.ts && git commit --no-verify -m "feat(parser): add gatedVocabCorrect typo gate (exact-first, exclusion, tie-abort, minLen)"`

---

## Task 2: Vocab registry + the single-edit generator util

**Files:** Create `lib/parser/typoVocabRegistry.ts`, `tests/parser/_typoGenerator.ts`, `tests/parser/_typoGenerator.test.ts`.

**Interfaces:**
- Produces: `TYPO_VOCABS: readonly VocabEntry[]` where `VocabEntry = { id: string; klass: "fuzzable" | "excluded"; members: readonly string[]; minLen?: number }`. The fuzzable entries name the PR-A surfaces; the excluded entries name the cross-vocab/do-not-fuzz sets.
- Produces (test util): `singleEditNeighbors(word: string): string[]` and `unambiguousTypos(member: string, vocab: readonly string[], opts): string[]` (neighbors filtered to gate-passing, non-tie, non-cross-member).

- [ ] **Step 1: Write the failing test for the generator**

```ts
// tests/parser/_typoGenerator.test.ts
import { describe, it, expect } from "vitest";
import { singleEditNeighbors, unambiguousTypos } from "@/tests/parser/_typoGenerator";

describe("singleEditNeighbors", () => {
  it("includes a deletion, a substitution, and an adjacent transposition", () => {
    const n = singleEditNeighbors("SET");
    expect(n).toContain("ET"); // deletion of S
    expect(n).toContain("EST"); // transpose S,E
    expect(n.every((x) => x !== "SET")).toBe(true); // never the original
  });
});

describe("unambiguousTypos", () => {
  it("drops neighbors that collide with another vocab member or tie", () => {
    // 'AB'/'AC' are distance-1 peers; a neighbor equal to a member or tying is dropped
    const typos = unambiguousTypos("AB", ["AB", "AC"], { minLen: 0 });
    expect(typos).not.toContain("AC"); // exact other member
    expect(typos).not.toContain("AD"); // ties AB & AC
    expect(typos.length).toBeGreaterThan(0); // e.g. 'ABB'/'ZB' survive
  });
});
```

- [ ] **Step 2: Run to verify fail** — FAIL (module not found).

- [ ] **Step 3: Implement the generator util**

```ts
// tests/parser/_typoGenerator.ts
import { damerauLevenshtein } from "@/lib/parser/fuzzyMatch";

const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ ".split("");

/** Every single-edit neighbor (deletion, insertion, substitution, adjacent transposition), deduped, excluding the original. */
export function singleEditNeighbors(word: string): string[] {
  const out = new Set<string>();
  for (let i = 0; i < word.length; i++) out.add(word.slice(0, i) + word.slice(i + 1)); // deletion
  for (let i = 0; i <= word.length; i++)
    for (const c of ALPHA) out.add(word.slice(0, i) + c + word.slice(i)); // insertion
  for (let i = 0; i < word.length; i++)
    for (const c of ALPHA) if (c !== word[i]) out.add(word.slice(0, i) + c + word.slice(i + 1)); // substitution
  for (let i = 0; i + 1 < word.length; i++)
    out.add(word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2)); // adjacent transposition
  out.delete(word);
  return [...out];
}

/**
 * Neighbors that the gate SHOULD correct back to `member`: drop any neighbor that
 * (a) exactly equals another vocab member, (b) ties at the min distance with a
 * second member, or (c) is shorter than minLen. See spec §7.1 carveout.
 */
export function unambiguousTypos(
  member: string,
  vocab: readonly string[],
  opts: { minLen?: number },
): string[] {
  const minLen = opts.minLen ?? 0;
  return singleEditNeighbors(member).filter((n) => {
    if (n.length < minLen) return false;
    if (vocab.includes(n)) return false; // exact other member
    const dists = vocab.map((v) => damerauLevenshtein(n, v));
    const best = Math.min(...dists);
    const winners = dists.filter((d) => d === best).length;
    if (winners > 1) return false; // tie
    return vocab[dists.indexOf(best)] === member; // must resolve to `member`
  });
}
```

- [ ] **Step 4: Write the registry + run**

```ts
// lib/parser/typoVocabRegistry.ts
export type VocabEntry = { id: string; klass: "fuzzable" | "excluded"; members: readonly string[]; minLen?: number };

// Fuzzable PR-A surfaces + the excluded/do-not-fuzz vocabs the collision meta-test must check against.
export const TYPO_VOCABS: readonly VocabEntry[] = [
  { id: "multiWordRole", klass: "fuzzable", members: ["CONTENT CREATION", "SHOW CALLER", "GREEN ROOM", "CAM OP"] },
  { id: "crewColumn", klass: "fuzzable", members: ["NAME", "ROLE", "PHONE", "EMAIL"] },
  // NOTE: the passenger column ({PASSENGERS}) is DEFERRED from PR-A — its only caller
  // parseV4Transport (transport.ts:143) has no `agg`/anchor in scope, so the warn emission
  // is awkward; it moves to a P1-followup. Not registered here (nothing wires it yet).
  { id: "longSectionHeader", klass: "fuzzable", members: ["TRANSPORTATION", "EVENT DETAILS", "GS DETAILS"] },
  // excluded / do-not-fuzz neighborhoods (spec §8) the meta-test guards against:
  { id: "shortRoleCodes", klass: "excluded", members: ["A1", "A2", "V1", "L1", "GS", "BO", "PTZ", "LED", "GAV", "LEAD"] },
  { id: "knownSubLabels", klass: "excluded", members: ["DATE", "DAY", "ROOM"] },
  { id: "sentinels", klass: "excluded", members: ["TBD", "TBA", "N/A"] },
];
```

Run: `pnpm vitest run tests/parser/_typoGenerator.test.ts` → PASS.

- [ ] **Step 5: Commit** — `git add lib/parser/typoVocabRegistry.ts tests/parser/_typoGenerator.ts tests/parser/_typoGenerator.test.ts && git commit --no-verify -m "feat(parser): typo vocab registry + single-edit generator test util"`

---

## Task 3: Collision meta-test (CI tripwire)

**Files:** Create `tests/parser/typoVocabCollision.test.ts`.

**Interfaces:** Consumes `TYPO_VOCABS` (Task 2), `damerauLevenshtein` (`fuzzyMatch.ts`).

**Note on TDD framing:** this is a *standing structural guard*, not a behavior red-green. To satisfy the "prove the test is load-bearing" invariant, Step 2 includes an **intentional-mutation proof**: temporarily add a colliding member to the registry, watch the guard FAIL, then revert — proving the guard actually detects collisions (analogous to the negative-regression rule).

- [ ] **Step 1: Write the meta-test (it PASSES against the registry as designed — a standing guard)**

```ts
// tests/parser/typoVocabCollision.test.ts
import { describe, it, expect } from "vitest";
import { TYPO_VOCABS } from "@/lib/parser/typoVocabRegistry";
import { damerauLevenshtein } from "@/lib/parser/fuzzyMatch";

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
```

- [ ] **Step 2: Run + mutation proof.** `pnpm vitest run tests/parser/typoVocabCollision.test.ts` → PASS. Then TEMPORARILY add a colliding member to `TYPO_VOCABS` (e.g. add `"TRANSPORTATON"` to an `excluded` entry — distance 1 from the fuzzable `TRANSPORTATION`), re-run → the guard must FAIL (proving it detects collisions), then REVERT the temporary member and re-run → PASS. (If it fails for a REAL reason, fix the registry/exclusions — never weaken the test.)
- [ ] **Step 3: Commit** — `git add tests/parser/typoVocabCollision.test.ts && git commit --no-verify -m "test(parser): CI collision tripwire for typo vocabs"`

---

## Task 4: Mint the 3 warn codes (§12.4 6-surface lockstep)

**Files:** Modify `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (§12.4 table + YAML appendix), `lib/messages/catalog.ts`, regen `lib/messages/__generated__/{spec-codes,internal-code-enums}.ts`, `lib/parser/dataGaps.ts`, `app/help/errors/_families.ts`, `tests/parser/operatorActionableWarnings.test.ts`, `tests/drive/showDayTimeAnchors.test.ts`.

**Interfaces:** Produces the 3 codes recognized by `messageFor`/the deep-link selector.

- [ ] **Step 1: Add the 3 §12.4 master-spec table rows** (after the `STAGE_WORD_AUTOCORRECTED` row), 5 columns `code | condition | dougFacing | crewFacing | followUp`:

```markdown
| `ROLE_TOKEN_AUTOCORRECTED` | a crew role cell has a misspelled multi-word role we auto-corrected | "We read a likely-misspelled role in _<crew-name>_'s cell (for example 'Content Cretion' as 'Content Creation') and used the corrected version. If it was intentional, update the sheet." | — | Doug → optional fix |
| `COLUMN_HEADER_AUTOCORRECTED` | a crew table column header was misspelled and we auto-corrected it | "We read a likely-misspelled column header on _<sheet-name>_'s crew table (for example 'E-MAIL' as 'EMAIL') and used the corrected column. If it was intentional, update the sheet." | — | Doug → optional fix |
| `SECTION_HEADER_AUTOCORRECTED` | a section header was misspelled and we auto-corrected it | "We read a likely-misspelled section header on _<sheet-name>_ (for example 'Transportaton' as 'Transportation') and parsed that section anyway. If it was intentional, update the sheet." | — | Doug → optional fix |
```

- [ ] **Step 2: Add the 3 §12.4 YAML appendix `helpfulContext` entries** (after `STAGE_WORD_AUTOCORRECTED`):

```yaml
ROLE_TOKEN_AUTOCORRECTED: "A multi-word role in this crew member's cell looked misspelled (e.g. 'Content Cretion'), so we read it as the closest real role ('Content Creation') and used that. If the spelling was intentional, update the sheet."
COLUMN_HEADER_AUTOCORRECTED: "A column header on this crew table looked misspelled (e.g. 'E-MAIL'), so we read it as the closest real header ('EMAIL') and used that column. If it was intentional, update the sheet."
SECTION_HEADER_AUTOCORRECTED: "A section header on this sheet looked misspelled (e.g. 'Transportaton'), so we read it as the closest real section ('Transportation') and parsed that section anyway. If it was intentional, update the sheet."
```

- [ ] **Step 3: Add the 3 `catalog.ts` rows** (after `STAGE_WORD_AUTOCORRECTED`), each modeled on it (no `severity` field — parse warnings omit it). dougFacing/helpfulContext must be **byte-identical** to §12.4. Example for one (repeat for all 3 with the copy above + a `title`/`longExplanation`/`helpHref`):

```ts
  ROLE_TOKEN_AUTOCORRECTED: {
    code: "ROLE_TOKEN_AUTOCORRECTED",
    dougFacing:
      "We read a likely-misspelled role in _<crew-name>_'s cell (for example 'Content Cretion' as 'Content Creation') and used the corrected version. If it was intentional, update the sheet.",
    crewFacing: null,
    followUp: "Doug → optional fix",
    helpfulContext:
      "A multi-word role in this crew member's cell looked misspelled (e.g. 'Content Cretion'), so we read it as the closest real role ('Content Creation') and used that. If the spelling was intentional, update the sheet.",
    title: "Auto-corrected a misspelled role",
    longExplanation:
      "A multi-word role in a crew member's cell looked misspelled, so we read it as the closest real role and used that — the role still parses. If the spelling was intentional, update the sheet.",
    helpHref: "/help/errors#ROLE_TOKEN_AUTOCORRECTED",
  },
```

(`COLUMN_HEADER_AUTOCORRECTED` title "Auto-corrected a column header"; `SECTION_HEADER_AUTOCORRECTED` title "Auto-corrected a section header"; longExplanation/helpHref analogous.)

- [ ] **Step 4: Add the 3 codes to `OPERATOR_ACTIONABLE_ANCHORED`** (`lib/parser/dataGaps.ts`, the set is 14 → 17):

```ts
  "ROLE_TOKEN_AUTOCORRECTED",
  "COLUMN_HEADER_AUTOCORRECTED",
  "SECTION_HEADER_AUTOCORRECTED",
```

- [ ] **Step 5: Map the 3 new prefixes in `app/help/errors/_families.ts`** — add `"ROLE"` and `"COLUMN"` to the `crew-schedule` family `prefixes`, and `"SECTION"` to the `syncing-sheets` family `prefixes`.

- [ ] **Step 5b: Wire the 3 codes into the `attachSourceCellAnchors` dispatch** (`lib/drive/showDayTimeAnchors.ts`) so they resolve a deep-link anchor (otherwise they're in the anchored set but render link-less). Paths verified against the live dispatch (crew-name branch at `:122-129`, region branches after):
  - `ROLE_TOKEN_AUTOCORRECTED` → add to the crew-name branch (`resolveCrewRoleCell(sources.crewRole, w.blockRef?.name)`, alongside `UNKNOWN_ROLE_TOKEN`/`STAGE_WORD_AUTOCORRECTED`) — it carries `blockRef:{kind:"crew", name}`.
  - `COLUMN_HEADER_AUTOCORRECTED` (`blockRef:{kind:"crew"}`) and `SECTION_HEADER_AUTOCORRECTED` (`blockRef:{kind:<RegionId>}`) → add to the `FIELD_UNREADABLE || UNKNOWN_FIELD` region branch condition (it resolves `sources.region[blockRef.kind]`; `"crew"`, `"transportation"`, `"details"` are all valid `RegionId`s). Add a dispatch test in `tests/drive/showDayTimeAnchors.test.ts` for each (mirroring the existing UNKNOWN_FIELD/STAGE_WORD tests).

- [ ] **Step 6: Regen + bump the pin tests + run x1/x2/help** (the x1/x2 tests live at `tests/cross-cutting/codes.test.ts` + `tests/cross-cutting/{extract-spec-codes,no-raw-codes}.test.ts` — confirmed present; the AGENTS.md `tests/messages/codes.test.ts` citation is stale)

```bash
pnpm gen:spec-codes && pnpm gen:internal-code-enums
```
Bump `tests/parser/operatorActionableWarnings.test.ts` "contains exactly the N codes" 14→17 (sorted: add `COLUMN_HEADER_AUTOCORRECTED`, `ROLE_TOKEN_AUTOCORRECTED`, `SECTION_HEADER_AUTOCORRECTED` in alpha position) and `tests/drive/showDayTimeAnchors.test.ts` "all N anchored codes" 14→17.
Run: `pnpm vitest run tests/cross-cutting/codes.test.ts tests/cross-cutting/extract-spec-codes.test.ts tests/cross-cutting/no-raw-codes.test.ts tests/help/errors-grouping.test.tsx tests/parser/operatorActionableWarnings.test.ts tests/drive/showDayTimeAnchors.test.ts` → all PASS.

- [ ] **Step 7: Commit** (all lockstep parts together) — `git add docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md lib/messages/catalog.ts lib/messages/__generated__/ lib/parser/dataGaps.ts app/help/errors/_families.ts tests/parser/operatorActionableWarnings.test.ts tests/drive/showDayTimeAnchors.test.ts && git commit --no-verify -m "feat(messages): add 3 *_AUTOCORRECTED codes (role/column/section, §12.4 lockstep)"`

---

## Task 5: Multi-word role fuzz → `ROLE_TOKEN_AUTOCORRECTED`

**Files:** Modify `lib/parser/personalization.ts` (`extractRoleFlags` :261), `lib/parser/blocks/crew.ts` (role-warning stamping :270-274), `tests/parser/blocks/crew.test.ts`.

**Interfaces:** Consumes `gatedVocabCorrect` (Task 1), `ROLE_NORMALIZATIONS`/`MULTI_WORD_TOKENS` (`personalization.ts:16,43`). `extractRoleFlags` already returns `{ flags, unknownTokens, warnings }`.

- [ ] **Step 1: Write the failing test** (in `tests/parser/blocks/crew.test.ts`, mirror the stage-word tests; v1 TECH compound cell):

```ts
it("auto-corrects a misspelled multi-word role: 0 UNKNOWN_ROLE_TOKEN + 1 ROLE_TOKEN_AUTOCORRECTED", () => {
  const md = [
    "| TECH | PHONE | ARRIVAL | DEPARTURE |",
    "| --- | --- | --- | --- |",
    "| Jane Roe - Content Cretion | 555 |  |  |",
  ].join("\n");
  const agg = newAggregator();
  const crew = parseCrew(md, "v1", agg);
  expect(agg.warnings.filter((w) => w.code === "UNKNOWN_ROLE_TOKEN")).toHaveLength(0);
  const notes = agg.warnings.filter((w) => w.code === "ROLE_TOKEN_AUTOCORRECTED");
  expect(notes).toHaveLength(1);
  expect(notes[0]!.severity).toBe("warn");
  expect(notes[0]!.blockRef).toMatchObject({ kind: "crew", name: "Jane Roe" });
});

it("does NOT fuzz a short role code into a multi-word role (A2 stays UNKNOWN, never CONTENT CREATION)", () => {
  const md = ["| TECH | PHONE | ARRIVAL | DEPARTURE |", "| --- | --- | --- | --- |", "| Sam Poe - ZZ9 | 555 |  |  |"].join("\n");
  const agg = newAggregator();
  parseCrew(md, "v1", agg);
  expect(agg.warnings.find((w) => w.code === "ROLE_TOKEN_AUTOCORRECTED")).toBeUndefined();
});
```

- [ ] **Step 2: Run to verify fail** — the cascade still emits `UNKNOWN_ROLE_TOKEN`; no autocorrect.

**Why the typo survives to a space-containing token (verify this in Step 2's red run):** the MWT loop matches `new RegExp(\`\\b${mwt}\\b\`, "i")` (`personalization.ts:303`), so `Content Cretion` does NOT match `\bCONTENT\s+CREATION\b` and is left in `working`. Tokenization is `working.split(/[/\-]/)` (`:317`) — it splits ONLY on `/` and `-`, NOT spaces — so `Content Cretion` survives as ONE token `"CONTENT CRETION"` (trimmed + uppercased). The `rawTokens` loop then sees a space-containing unknown token. **Conservative gate (deliberate):** we only fuzz tokens that ALREADY contain a space (`tok.includes(" ")`), so a space-DELETION typo (`CAMOP` for `CAM OP`) is NOT corrected in PR-A — that is an accepted limitation (conservative; never over-corrects a short single-word code into a phrase). State this in the test comment.

- [ ] **Step 3: Implement.** In `personalization.ts` `extractRoleFlags`, import `gatedVocabCorrect`; in the `rawTokens` loop, before pushing `UNKNOWN_ROLE_TOKEN`, when `tok` contains a space (multi-word) try a gated correction against `MULTI_WORD_TOKENS` (exclude the short `ROLE_NORMALIZATIONS` single-word keys):

```ts
    const canonical = ROLE_NORMALIZATIONS[tok];
    if (canonical) {
      pushFlag(canonical);
    } else {
      const fix = tok.includes(" ")
        ? gatedVocabCorrect(tok, MULTI_WORD_TOKENS, { exclude: SHORT_ROLE_CODES })
        : null;
      if (fix?.corrected && ROLE_NORMALIZATIONS[fix.match]) {
        pushFlag(ROLE_NORMALIZATIONS[fix.match]!);
        warnings.push({
          severity: "warn",
          code: "ROLE_TOKEN_AUTOCORRECTED",
          message: `Read likely-misspelled role '${tok}' as '${fix.match}' in role cell: '${roleCell}'`,
          rawSnippet: roleCell,
        });
      } else {
        unknownTokens.push(tok);
        warnings.push({ severity: "warn", code: "UNKNOWN_ROLE_TOKEN", message: `Unknown role token: '${tok}' in role cell: '${roleCell}'`, rawSnippet: roleCell });
      }
    }
```

Add `const SHORT_ROLE_CODES = Object.keys(ROLE_NORMALIZATIONS).filter((k) => !k.includes(" "));` near the top of the function (the exclusion = real single-word codes). In `crew.ts`, extend the role-warning stamping (`:270-272`) to also stamp `ROLE_TOKEN_AUTOCORRECTED` with `crewBlockRef`:

```ts
  const stampedRoleWarnings = roleFlagResult.warnings.map((w) =>
    w.code === "UNKNOWN_ROLE_TOKEN" || w.code === "ROLE_TOKEN_AUTOCORRECTED" ? { ...w, blockRef: crewBlockRef } : w,
  );
```

- [ ] **Step 4: Run to verify pass** + full crew + parser suite green.
- [ ] **Step 5: Commit** — `feat(parser): fuzzy-correct misspelled multi-word roles (ROLE_TOKEN_AUTOCORRECTED)`

---

## Task 6: Crew column fuzz → `COLUMN_HEADER_AUTOCORRECTED`

**Files:** Modify `lib/parser/blocks/crew.ts` (`detectColumns` :70 + caller :104), tests in `tests/parser/blocks/crew.test.ts`.

**Scope note:** `detectColumns` is **private** with a **single caller** (`crew.ts:104` — verified by `rg -n detectColumns lib tests`: only `:70` def + `:104` call, no direct tests). So the return-shape change `{ colMap, corrections }` touches exactly those two lines; no other call site/test breaks. The **passenger column is DEFERRED** (its only caller `parseV4Transport` (`transport.ts:143`) has no `agg`/anchor in scope — see Task 2 registry note). Task 6 = crew columns only.

**Interfaces:** `detectColumns(headerLine)` returns `{ colMap: ColMap; corrections: { raw: string; corrected: string; field: keyof ColMap }[] }`; `parseCrew` (`:104`, has `agg`) emits `COLUMN_HEADER_AUTOCORRECTED` per correction.

- [ ] **Step 1: Pre-step — confirm the single-caller invariant.** Run `rg -n "detectColumns" lib tests` and confirm output is exactly `crew.ts:70` (def) + `crew.ts:104` (call). If any other usage appears, update it in Step 3.

- [ ] **Step 2: Write the failing test** — a crew header `| CREW | NAME | ROLE | PHONE | E-MAIL |` (`E-MAIL`→`EMAIL`, Damerau 1) must set the email column AND emit one `COLUMN_HEADER_AUTOCORRECTED`; assert `crew[*].email` is populated (the concrete failure mode: a typo'd header drops every crew email). Add a generator-driven case: for each of `{NAME,ROLE,PHONE,EMAIL}`, every `unambiguousTypos(member, ["NAME","ROLE","PHONE","EMAIL"], {minLen:0})` maps to that column.

- [ ] **Step 3: Run to verify fail.**

- [ ] **Step 4: Implement.** In `detectColumns`, after the exact `===` chain per segment, add a fuzzy fallback for any segment that matched no column, via `gatedVocabCorrect(seg, ["NAME","ROLE","PHONE","EMAIL"], { exclude: ["DATE","DAY","ROOM"] })` (the `KNOWN_SUB_LABELS` exclusion blocks `ROLE`↔`ROOM`); on `corrected:true` assign the column index + push `{ raw: seg, corrected: fix.match, field }` to `corrections`. Return `{ colMap, corrections }`. Update the single caller (`:104`): destructure `{ colMap, corrections }` and for each correction `agg?.warnings.push({ severity:"warn", code:"COLUMN_HEADER_AUTOCORRECTED", message:\`Read likely-misspelled column header '${c.raw}' as '${c.corrected}'\`, rawSnippet: headerLine, blockRef: { kind:"crew", index:0 } })`. Keep `seg.includes("FLIGHT")` exact (substring — do not fuzz a 6-char substring test).

- [ ] **Step 5: Run to verify pass** + full crew + parser suite. **Negative-regression:** (a) a real `EMAIL` header is NOT flagged (corrected:false → no warning); (b) `ROOM` is NOT corrected to any column — `ROOM`↔`ROLE` is Damerau **2** (R-O-O-M vs R-O-L-E differ at 2 positions), so `maxDistance:1` already rejects it; this test pins that the radius stays 1. **Mutation check (proves maxDistance is load-bearing):** temporarily set `maxDistance: 2` in this surface's call and confirm `ROOM`→`ROLE` now (wrongly) corrects → revert. (The crew columns have NO distance-1 cross-vocab collision — pairwise ≥3, no `KNOWN_SUB_LABEL` within 1 — so the `exclude` is precautionary; the meta-test pins this.)
- [ ] **Step 6: Commit** — `feat(parser): fuzzy-correct crew column headers (COLUMN_HEADER_AUTOCORRECTED)`

---

## Task 7: Section-router fuzz → `SECTION_HEADER_AUTOCORRECTED`

**Files:** Create `lib/parser/sectionHeaderNormalize.ts`; modify `lib/parser/index.ts` (`parseSheet` :320-379, insert the pre-pass before the block calls); tests `tests/parser/sectionHeaderNormalize.test.ts`.

**Interfaces:** `normalizeSectionHeaders(markdown: string): { corrected: string; warnings: ParseWarning[] }` — scans each markdown TABLE row's first cell (`col0`); rewrites it to a canonical long-section header ONLY when ALL the safety gates below pass, emitting `SECTION_HEADER_AUTOCORRECTED`. Run in `parseSheet` so the corrected markdown flows to every block parser. Mirrors `normalizeStageWords`.

**The safety gates (HIGH-2: do NOT rewrite arbitrary value cells).** A row's `col0` is rewritten ONLY if ALL hold:
1. `gatedVocabCorrect(col0Upper, ["TRANSPORTATION","EVENT DETAILS","GS DETAILS"], { exclude: [...other KNOWN_SECTION_HEADERS, ...KNOWN_SUB_LABELS] })` returns `corrected:true` (distance-1 near-miss, not exact).
2. **Header-shape gate** — the row looks like a section header, NOT a data row: either it is **label-only** (every other cell in the row is empty/whitespace) OR `countFieldHeaderWords(otherCells) >= 1` (`knownSections.ts:236`). A data row whose `col0` happens to be one edit from a long header (other cells carry values, not field-header words) FAILS this gate and is left untouched.
3. **`noExactSpellingElsewhere`** — no row anywhere in the doc has a `col0` that EXACTLY equals the corrected canonical (so a real, correctly-spelled `TRANSPORTATION` header elsewhere is never shadowed by a fuzzy rewrite of a different cell).

**Row tokenization (MEDIUM: don't corrupt the table).** Reuse the existing `splitRow` (`_helpers.ts:39`) to get cells and reconstruct by replacing ONLY the col0 segment, preserving the pipe count and the other cells verbatim. Skip alignment/separator rows (`/^[\s:|*-]*$/` segments) and non-table lines. The reconstruction must keep `splitRow(line).length` unchanged.

- [ ] **Step 1: Write the failing tests**
  - `| Transportaton | NAME | PHONE |` (typo'd v2 transport header; field-band present via NAME/PHONE) → `corrected` contains `TRANSPORTATION`, exactly one `SECTION_HEADER_AUTOCORRECTED`, AND end-to-end `parseSheet(corrected)` parses the transportation block (today `parseTransportation` returns null → section dropped).
  - `| EVENT DETALS | |` (label-only) → corrects to `EVENT DETAILS`.
  - Generator: for each of `["TRANSPORTATION","EVENT DETAILS","GS DETAILS"]`, every `unambiguousTypos(member, [...vocab], {minLen:0})` placed in a header-shape row corrects.
  - **Negative (the HIGH-2 guards):** (a) a DATA row `| Transportaton | 555-1234 | john@x.com |` (other cells are values, not field-header words, not empty) is NOT rewritten (header-shape gate fails); (b) `| Information | ... |` is NOT fuzzed (distance > 1); (c) `| DETAILS | |` is NOT fuzzed to `EVENT DETAILS` (distance > 1); (d) **CORPUS ZERO-CHANGE**: for EVERY `fixtures/shows/**/*.md`, `normalizeSectionHeaders(md).corrected === md` AND `.warnings` is empty (the fixtures are correctly spelled, so the pre-pass must be a no-op on all real data — this is the load-bearing false-positive guard); (e) row-shape: `splitRow` cell count is preserved on a corrected row.

- [ ] **Step 2: Run to verify fail** (the typo cases fail; the corpus zero-change passes trivially until the impl exists, so assert it AFTER the impl too).

- [ ] **Step 3: Implement** `normalizeSectionHeaders` in `lib/parser/sectionHeaderNormalize.ts` with the 3 gates above. Map the corrected canonical to its `RegionId` for the anchor via `const CANON_TO_REGION: Record<string, RegionId> = { TRANSPORTATION: "transportation", "EVENT DETAILS": "details", "GS DETAILS": "details" };` (all three are valid `RegionId`s in `buildSheetDeepLink.ts`). On a passing match, rewrite the col0 segment and push `{ severity:"warn", code:"SECTION_HEADER_AUTOCORRECTED", message:\`Read likely-misspelled section header '${raw}' as '${canonical}'\`, rawSnippet: raw, blockRef: { kind: CANON_TO_REGION[canonical], index:0 } }`. Wire into `parseSheet` (`index.ts:~366`, immediately after `const agg = newAggregator();` and BEFORE `parseClient`): `const secNorm = normalizeSectionHeaders(markdown); markdown = secNorm.corrected; agg.warnings.push(...secNorm.warnings);`. **Residual-risk note (state in the test):** the header-shape gate is a strong current-corpus guard, not a universal proof — a future value row whose col0 is one edit from a long section AND another cell equals a field-header word would still pass; the CORPUS ZERO-CHANGE assertion is the standing backstop and would catch any such fixture today.

- [ ] **Step 4: Run to verify pass** + **full `pnpm vitest run tests/parser`** (the corpus-parse regressions must stay green — i.e. every fixture still parses identically, proving the pre-pass changed nothing on real data).
- [ ] **Step 5: Commit** — `feat(parser): fuzzy-correct long section headers via a gated pre-pass (SECTION_HEADER_AUTOCORRECTED)`

---

## Task 8: Full verification + anti-tautology mutation

**Files:** none new (verification); add the mutation note to the relevant test files if not already present.

- [ ] **Step 1: Anti-tautology mutation.** Temporarily widen the gate (`maxDistance: 2`) or drop the `exclude` in one surface and confirm a negative-regression test FAILS (e.g. `A2`→`A1`, or `ROLE`→`ROOM`); then revert. Document the mutation each negative test catches in its comment. (Per the negative-regression rule — a green over-correction test against the un-mutated impl proves nothing.)
- [ ] **Step 2:** `pnpm typecheck && pnpm eslint lib tests && pnpm format:check` → clean (prettier-fix new files if flagged; never the master spec).
- [ ] **Step 3:** `pnpm vitest run` (the FULL suite). Expected: only the 3 env-bound live-infra suites fail locally; `tests/help` + collision meta-test green.
- [ ] **Step 4:** `git diff origin/main --stat -- 'components/**' 'app/**'` → only `app/help/errors/_families.ts` (data prefix-map, invariant-8 N/A). Commit any fixes.

---

## Self-Review (checklist)

1. **Spec coverage:** §2 gate → Task 1; §3 registry + meta-test → Tasks 2,3; §4.1 roles → Task 5; §4.2 columns → Task 6; §4.3 routers → Task 7; §6 codes → Task 4; §7 generator/negative/mutation → Tasks 2,5,6,7,8. Weekdays/short-routers/field-aliases correctly DEFERRED (not in any task). No gaps.
2. **Placeholder scan:** every code step has real code; the catalog rows repeat the full copy.
3. **Type consistency:** `gatedVocabCorrect` signature consistent (Tasks 1,5,6,7); `{match, corrected}` shape; `VocabEntry`/`TYPO_VOCABS` consistent (Tasks 2,3); `detectColumns` returns `{colMap, corrections}` (Task 6); pin-test count 14→17 (Task 4). The 3 code strings consistent across Tasks 4–7.

## Adversarial review (cross-model)

After self-review, the WHOLE diff goes to Codex `adversarial-review` (reviewer-only). Iterate to APPROVE before merge.
