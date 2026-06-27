# Typo-Tolerant Stage-Word Stripping — Design

**Date:** 2026-06-27
**Status:** Design (autonomous-ship approved)
**Worktree:** `.claude/worktrees/feat+stage-word-typo-tolerance` (off `origin/main` @ `dd3dab98`, includes PR #154 parse-warning deep links)
**All `file:line` citations verified against HEAD `dd3dab98`.**

---

## 1. Goal

A misspelled stage word — e.g. `Strke` for `Strike` — defeats the **exact-spelling** stage-word matching in `lib/parser/personalization.ts`, with two distinct symptoms on the *same* crew role cell:

1. **`UNKNOWN_ROLE_TOKEN` cascade** (`extractRoleFlags`): `FULL_STAGE_PATTERN` (`:45`) fails to match, so the four stage words leak into the role tokenizer and each emits a spurious `UNKNOWN_ROLE_TOKEN`. Observed live on East Coast: `Eric Weiss - Load In/Set/Strke/Load Out - A1` → **4** spurious warnings (`LOAD IN`, `SET`, `STRKE`, `LOAD OUT`); the real role `A1` still parses.
2. **Silent `stage_restriction` mis-parse** (`extractStageRestriction`): a typo in any `…ONLY` stage pattern (`FULL_STAGE_ONLY_PATTERN`/`LOAD_IN_SET_ONLY_PATTERN`/`LOAD_OUT_STRIKE_ONLY_PATTERN`, `:46-49`) makes it return `{ kind: "none" }` instead of the real restriction — no warning at all (e.g. `Load Out / Strke ONLY` → wrong restriction, silently).

Make the four stage patterns typo-tolerant, **auto-correcting** obvious typos and surfacing **one** deep-linked drift note per cell, while leaving genuinely-intentional tokens to win.

## 2. Approach (class-sweep informed)

A class-sweep (4 readers over role/stage, block-headers, value-parsers, warning-emission sites) established the bug **shape** — *closed-vocabulary exact match defeated by a near-miss → noise cascade or silently-wrong parse* — and its dispositions (§9). The decisions that shape this spec:

- **Fix the four stage patterns as ONE unit**, not just `FULL_STAGE_PATTERN`. They share one closed 4-word vocabulary on the same cell; half-fixing leaves `LOAD OUT STRKE ONLY` silently broken.
- **Normalize once, upstream of both extractors.** A single `normalizeStageWords(cleanedRole)` runs in `buildCrewMember` *before* `extractStageRestriction` and `extractRoleFlags`, so all four patterns benefit and exactly one drift note fires per cell.
- **Build a small shared `fuzzyMatch` helper now, wire it ONLY to stage words.** Future closed-vocab consumers (deferred §9) reuse it.
- **Roles and emails stay exact** — `A1`↔`A2`, `V1`↔`L1` are edit-distance 1; fuzzy there would silently rewrite a real role. The stage fix kills the cascade *without* touching role vocab.

## 3. The shared fuzzy helper — `lib/parser/fuzzyMatch.ts` (new)

A small, independently unit-tested module. Greenfield — the only existing edit-distance code is an internal, non-exported plain `levenshtein` in `lib/parser/invariants.ts:24-57` (used for MI-13/14 crew-rename pairing; **not** refactored here — out of scope).

```ts
/** Damerau-Levenshtein distance (Levenshtein + adjacent transposition). Chosen
 *  over plain Levenshtein because a single transposition — "Laod"→"Load",
 *  "Stirke"→"Strike" — is distance 1 here but distance 2 in plain Levenshtein,
 *  and transpositions are common stage-word typos. O(m·n). */
export function damerauLevenshtein(a: string, b: string): number;

/** Match `token` against a closed vocabulary. Returns the matched vocab member +
 *  whether it was an EXACT hit, or null. `maxDistance` bounds the fuzzy radius
 *  (1 for stage words). Ties broken by smallest distance, then vocab order. */
export function closedVocabMatch(
  token: string,
  vocab: readonly string[],
  maxDistance: number,
): { match: string; exact: boolean } | null;
```

`closedVocabMatch` is the reusable primitive; the **confidence gate** lives in the stage-specific caller (§4), not the helper, because the gate is domain-specific (different consumers need different gates).

## 4. `normalizeStageWords` — the cell-entry normalization (in `personalization.ts`)

```ts
const STAGE_VOCAB = ["LOAD IN", "SET", "STRIKE", "LOAD OUT"] as const; // post-tokenization forms

export type StageWordCorrection = { detected: string; corrected: string };
export type StageNormalization = { corrected: string; corrections: StageWordCorrection[] };

/** Normalize stage-word typos in a cleaned role cell, confidence-gated. Returns
 *  the corrected cell text (typos rewritten to canonical stage words) + the list
 *  of corrections made (for the drift note). When the gate fails, returns the
 *  cell unchanged with no corrections. */
export function normalizeStageWords(roleCell: string): StageNormalization;
```

### 4.1 Algorithm
1. **Split keeping separators.** Split `roleCell` on `/` and `-` with a capturing group so the separators survive for a faithful rewrite (`"Load Out / Strke ONLY"` → `["Load Out ", "/", " Strke ONLY"]`).
2. **Per-segment comparison form.** For each content segment, derive the comparison token: trim, uppercase, then **peel a trailing restriction marker** — `\s*\bONLY\b\s*\*{0,3}\s*$` (and a bare `\*{3}`) — so a stage word followed by `ONLY`/`***` (e.g. `"STRKE ONLY"`) is compared as `"STRKE"`. This mirrors how the `…ONLY` regexes treat `ONLY` as a separate trailing marker, so the normalizer's token model **matches the grammar it feeds** (closes the HIGH-class divergence: without the peel, `"STRKE ONLY"` is distance > 1 from `STRIKE` and the gate silently fails on the 2-word ONLY cells).
3. **Classify each segment, in precedence order:**
   - (a) comparison token is an **exact member of `ROLE_NORMALIZATIONS`** → it is a ROLE; **never** a stage correction (role-exclusion guard — a recognized role, including any future one, is never rewritten to a stage word).
   - (b) exact member of `STAGE_VOCAB` → **exact stage anchor**.
   - (c) `closedVocabMatch(token, STAGE_VOCAB, 1)` near-miss **and not (a)** → **correction candidate**.
   - (d) otherwise → non-stage token (`ONLY` alone, a genuine unknown role) — left alone.
4. **Confidence gate (corrected from the class-sweep — `≥2 EXACT` fails the 2-word ONLY cells):** apply corrections **only if** the cell has **≥ 2 stage-ish segments (exact OR near) AND ≥ 1 EXACT stage anchor.** Otherwise return unchanged.
5. **Rewrite (only correction candidates; everything else verbatim):** for each correction candidate, replace the **stage-word portion of its ORIGINAL segment** (the part before the peeled marker) with the canonical stage word, preserving the segment's surrounding case/whitespace. **Exact-stage and non-stage segments — including hyphenated role text — are rejoined VERBATIM**, so a hyphenated role phrase (e.g. `SOME-VALUE`) is never partially rewritten even though the `-` split fragmented it. The peeled trailing marker (`ONLY` / `ONLY***` / bare `***`) is **re-appended verbatim** — its day-restriction semantics are preserved downstream (a bare `***` still drives `hasTripleAsterisk` → `UNKNOWN_DAY_RESTRICTION` in `crew.ts`). Rejoin with the preserved separators. Collect `{ detected, corrected }` per correction. Because the rewrite is in-place and separator-preserving, the corrected cell still satisfies the spacing-sensitive `…ONLY` regexes (`"Load Out / Strike ONLY"` matches `LOAD_OUT_STRIKE_ONLY_PATTERN`).

### 4.2 Worked examples (the gate must satisfy ALL of these)
| Role cell | stage-ish (exact / near) | exact anchor? | Gate | Result |
|---|---|---|---|---|
| `Load In/Set/Strke/Load Out - A1` (East Coast, full) | 4 (3 exact / 1 near) | yes (3) | **fires** | `Strke`→`Strike`; 0 `UNKNOWN_ROLE_TOKEN`; `A1` parses; 1 drift note |
| `Load Out / Strke ONLY` (2-word ONLY, typo right) | 2 (1 exact `LOAD OUT` / 1 near `STRKE`, after peeling `ONLY`) | yes (1) | **fires** | `Strke`→`Strike`; cell → `Load Out / Strike ONLY` → `stage_restriction = [Load Out, Strike]`; 1 drift note |
| `Laod In / Set ONLY` (2-word ONLY, typo left) | 2 (1 exact `SET` after peel / 1 near `LAOD IN`, transposition) | yes (1) | **fires** | `Laod`→`Load`; cell → `Load In / Set ONLY` → `stage_restriction = [Load In, Set]`; 1 drift note |
| `Lod In/Set/Strke/Lod Ot - V1` (3 typos) | 4 (1 exact `SET` / 3 near) | yes (1) | **fires** | all 3 corrected; `V1` parses; 1 drift note |
| `Strke - A1` (lone near-miss, no other stage word) | 1 (0 exact / 1 near `STRKE`~`STRIKE`) | **no** | **does not fire** | `STRKE` stays `UNKNOWN_ROLE_TOKEN` (deep-linked) — without an exact stage anchor we are not confident it's a typo, so a possibly-intentional token wins |
| `XYZ - A1` (genuine unknown role) | 0 | no | **does not fire** | `XYZ` stays `UNKNOWN_ROLE_TOKEN` — correct |

The lone-`Strke` row is the load-bearing safety case: a near-miss is auto-corrected **only** with corroborating context (≥ 1 exact stage word + ≥ 2 stage-ish total). An isolated near-miss is left as an unknown-role warning so the operator judges it via the deep link — that is how "use the detected token if intentional" is honored without any in-app override.

### 4.3 Over-match safety
- **Roles never enter the stage vocab.** `STAGE_VOCAB` is the four stage phrases only. Role tokens (`A1`, `LEAD`, …) are not in it and are not fuzzied (they hit `closedVocabMatch` → no match → left alone → role logic unchanged).
- **The exact-anchor requirement** means a single stray token that *happens* to be distance-1 from a stage word is never corrected in isolation — it needs ≥ 1 confirmed exact stage word alongside it.
- **`maxDistance = 1`** bounds the fuzzy radius; distance-2 garbage (`XYZ`) never matches.

## 5. Integration in `buildCrewMember` (`crew.ts`)

Insert at **`crew.ts:265`** (the blank line between `cleanedRole` at `:264` and `extractStageRestriction` at `:266`), so both extractors receive the corrected cell:

```ts
const cleanedRole = dayResult.cleanedRoleCell.trim();           // :264 (unchanged)

// Auto-correct misspelled stage words ONCE, upstream of both extractors, so the
// UNKNOWN_ROLE_TOKEN cascade AND the silent stage_restriction mis-parse are both fixed.
const stageNorm = normalizeStageWords(cleanedRole);
const roleCellForParse = stageNorm.corrected;
if (stageNorm.corrections.length > 0) {
  const note: ParseWarning = {
    severity: "warn",
    code: "STAGE_WORD_AUTOCORRECTED",
    message: `Read likely-misspelled stage word(s) ${stageNorm.corrections
      .map((c) => `'${c.detected}' as '${c.corrected}'`)
      .join(", ")} in role cell: '${cleanedRole}'`,
    rawSnippet: cleanedRole,
    blockRef: crewBlockRef, // crew.ts:232 — same NAME-keyed anchor as UNKNOWN_ROLE_TOKEN
  };
  warnings.push(note);
  if (agg) agg.warnings.push(note);
}

const stageRestriction = extractStageRestriction(roleCellForParse); // was cleanedRole
const roleFlagResult = extractRoleFlags(roleCellForParse);          // was cleanedRole
```

`crewBlockRef` (`{ kind:"crew", index, name: params.nameRaw }`) is the PR #154 anchor key, so the note deep-links to the exact crew cell with zero new anchor code. The note is emitted **once per cell**, listing all corrections (no re-cascade). Multiple-correction case → one note.

## 6. The `STAGE_WORD_AUTOCORRECTED` code + deep-link wiring (reuses PR #154)

A new operator-actionable, crew-cell-anchored, deep-linked code:

- **Emission severity `warn`** (not `info`) — required for `operatorActionableWarnings` (`dataGaps.ts:144` gates on `severity === "warn"`) to render it with the deep link. (`TYPO_NORMALIZED` is `info` + all-null copy → it does *not* get a PR #154 link; this code is the warn+anchored variant.)
- **Add to `OPERATOR_ACTIONABLE_ANCHORED`** (`dataGaps.ts:122-127` → 5 members). Because `CELL_ANCHORED_CODES === OPERATOR_ACTIONABLE_ANCHORED` (`showDayTimeAnchors.ts:15`), this also makes it pass the anchor-population gate automatically.
- **Resolve by `blockRef.name`**: add `STAGE_WORD_AUTOCORRECTED` to the crew-name branch of `attachSourceCellAnchors` (`showDayTimeAnchors.ts:114-115`, alongside `UNKNOWN_ROLE_TOKEN`/`UNKNOWN_DAY_RESTRICTION`).
- **Renders for free** on Step-3, StagedReviewCard, and the per-show panel via the unchanged `PerShowActionableWarnings` (PR #154) — **no `components/` file changes** (so invariant-8 impeccable is N/A; confirmed in the plan).

### 6.1 §12.4 catalog (3-part lockstep — lands in one commit)
New code → master spec §12.4 prose (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md`) + `pnpm gen:spec-codes` (regenerates `lib/messages/__generated__/spec-codes.ts`) + `lib/messages/catalog.ts`. The `x1-catalog-parity` gate (`tests/cross-cutting/codes.test.ts` + `tests/cross-cutting/extract-spec-codes.test.ts`, run by `pnpm test:audit:x1-catalog-parity`) compares the three; all must move together.

**Copy** — full operator-facing copy *styled* like `UNKNOWN_ROLE_TOKEN` (it's title-rendered, not `.message`-rendered, since it's warn+anchored), with drift *wording* modeled on `TYPO_NORMALIZED` (`venue.ts:119`, "we read X as Y"):
- `title`: "Auto-corrected a misspelled stage word"
- `dougFacing`: "We read a likely-misspelled stage word in _<crew-name>_'s role (e.g. 'Strke' → 'Strike') and used the corrected version, so their schedule still parses. If it was intentional, update the sheet."
- `helpfulContext`: similar, advisory.
- `helpHref`: `/help/errors#STAGE_WORD_AUTOCORRECTED`
- `crewFacing`: `null` (admin-only drift note — crew never see it; matches the other crew-cell codes whose `crewFacing` is null).
- `followUp`: `"Doug → optional fix"`.
- `longExplanation`: the help-page expansion of `dougFacing` (one or two sentences; same content, fuller).

### 6.2 x2-no-raw-codes
The code renders via its catalog title (the `PerShowActionableWarnings` title-or-message path), never the bare code. `x2-no-raw-codes` (`tests/cross-cutting/no-raw-codes.test.ts`) — register `STAGE_WORD_AUTOCORRECTED` as `source: 'parse_warnings.code'` like the sibling crew codes.

## 7. Data flow

```
role cell (cleanedRole) ──► normalizeStageWords ──► { corrected, corrections }
   │                                                      │ corrections>0
   │                                                      ▼ emit STAGE_WORD_AUTOCORRECTED (warn, blockRef.name)
   ├─ extractStageRestriction(corrected)  ─► correct stage_restriction (silent mis-parse FIXED)
   └─ extractRoleFlags(corrected)         ─► correct role flags, ZERO spurious UNKNOWN_ROLE_TOKEN
   │
   ▼ warnings persist (PR #154 anchor population on both ingestion paths) → render with "Open in Sheet ↗"
```

## 8. Guard conditions / edge cases (spec-review discipline)
- **Empty / no stage words:** `normalizeStageWords` returns the cell unchanged, no corrections, no note (gate needs ≥ 2 stage-ish + ≥ 1 exact).
- **No typo (clean stage list):** gate may pass (≥ 2 exact) but there are zero *near-miss* corrections → `corrections` is empty → no note, cell unchanged. The happy path (`FULL_STAGE_PATTERN` exact strip) is untouched.
- **Token near a stage word that is actually a role:** a **recognized** role (`ROLE_NORMALIZATIONS` member) is never reinterpreted as a stage typo — the role-exclusion guard (§4.1 step 3a) classifies it as a role first. Today every role (`A1`/`A2`/`V1`/`L1`/`LEAD`/…) is already edit-distance ≥ 2 from every stage phrase, so the guard has no current trigger; it future-proofs a new role added near a stage word. An **unknown** token that is a near-miss in confident stage context IS corrected — but the drift note surfaces the change (deep-linked), so an intentional unknown token is recoverable by the operator via the sheet, never *silently* lost. (We do not claim the collision is impossible; we bound it: known roles are excluded, unknown near-misses are corrected-but-surfaced.)
- **Correction changes a token that `extractRoleFlags` would have flagged:** intended — that's the cascade fix.
- **`ONLY` present:** `ONLY` is not a stage word and not corrected; it still drives `extractStageRestriction`'s `…ONLY` patterns (now on the corrected cell) and `extractRoleFlags`'s `hasOnlyMarker`.
- **Span rewrite correctness:** corrections rewrite the matched token's original substring in `roleCell` (case/spacing preserved around it) so the corrected cell remains a valid role cell for both extractors.

## 9. Scope — class-sweep dispositions

**In scope (this PR):** the four stage patterns (`FULL_STAGE_PATTERN`, `FULL_STAGE_ONLY_PATTERN`, `LOAD_IN_SET_ONLY_PATTERN`, `LOAD_OUT_STRIKE_ONLY_PATTERN`) via the upstream `normalizeStageWords`; the shared `fuzzyMatch` helper (wired only to stage words); the `STAGE_WORD_AUTOCORRECTED` code + deep-link wiring.

**Leave EXACT (never fuzzy):** `ROLE_NORMALIZATIONS` (A1↔A2/V1↔L1 catastrophe), emails. `TYPO_NORMALIZED`/`TYPO_ALIASES` (existing precedent, not a fix site). Already-tolerant sites (`VENUE_LABEL_RE` inlines `hotal`; agenda `DOWc` optional-letter quantifiers).

**Deferred (same shape — follow-ups with triggers):**
- **Section-header / field-alias family** (the big one): `CREW`/`TECH`/`HOTEL`/`TRANSPORTATION` headers, `detectColumns` (`NAME`/`ROLE`/`PHONE`/`EMAIL`), `KNOWN_SECTION_HEADERS`, room headers, `FIELD_ALIASES`/`UNKNOWN_FIELD`. Closed-vocab, fuzzy-safe, but large cross-file surface + higher blast radius (a header typo drops a whole section). Trigger: a dedicated section-header-typo PR reusing this `fuzzyMatch` helper + the `TYPO_ALIASES`/`resolveAliasFull` pattern (cheapest: edit-distance fallback inside `resolveAliasFull` that flips `isTypo=true`, reusing the `TYPO_NORMALIZED` emission).
- **`MULTI_WORD_TOKENS`** role phrases (`CONTENT CREATION` etc.) — same cascade shape but on the role surface; fuzzy only multi-word phrases, never short codes. Trigger: a real-sheet multi-word role typo.
- **`ONLY`-marker typos** (`PAREN_ONLY_PATTERN`/`BARE_DATES_ONLY_PATTERN`/`hasOnlyMarker`) — short, pervasive token; needs its own gate (`ONLY` adjacent to a date/stage token). Trigger: a real-sheet `ONLY` typo.
- **`***`-count tolerance** (`TRIPLE_ASTERISK`) — a count pattern, not a word vocab; a *different* mechanism. Trigger: a real-sheet off-by-one asterisk.
- **Format-tolerance** (M/D/Y dates, U+2212 dashes, `a.m.`/`p.m.`) — a *different* mechanism; MUST NOT route through the word fuzzy helper. Separate format-robustness effort.

## 10. Testing strategy (TDD per task)
- `damerauLevenshtein`: exact-0; single insert/delete/substitute = 1; adjacent transposition = 1 (the differentiator vs plain Levenshtein); unrelated = high. `closedVocabMatch`: exact hit (`exact:true`); near-miss within `maxDistance`; no match beyond it; tie-break.
- `normalizeStageWords`: every row of the §4.2 worked-example table (assert `corrected` + `corrections` exactly). Gate fires for full + **both** 2-word ONLY cells (typo on the right `Load Out / Strke ONLY` AND on the left `Laod In / Set ONLY` — proves the `ONLY`-peel works on either side); does NOT fire for isolated near-miss / genuine unknown / clean cell.
- **`ONLY`/`***`-peel:** a stage word with a trailing `ONLY` or `***` (`STRKE ONLY`, `Strke***`) is matched on the peeled token (`STRKE`), and the rewrite preserves the trailing marker (`Strike ONLY`) so the `…ONLY` regex still matches downstream.
- **Over-match guards (negative-regression):** (i) a `ROLE_NORMALIZATIONS` member passed in a cell WITH stage context is never rewritten (role-exclusion); (ii) a genuine unknown role (`RIGGER`/`XYZ`) with stage context is NOT corrected (not a near-miss) and still emits `UNKNOWN_ROLE_TOKEN`; (iii) a lone near-miss with no exact anchor (`Strke - A1`) is NOT corrected. Verify by mutating the gate (drop the exact-anchor requirement) and confirming the lone-near-miss test then fails — proving the test pins the guard.
- **Hyphenated / fragmented segments + `***` preservation:** a non-stage hyphenated role segment in a cell WITH stage context (e.g. `Load In/Set/Strike/Load Out - SOME-VALUE`) is rejoined VERBATIM — only near-miss-stage segments are rewritten, so `SOME-VALUE` is never partially mangled. A `***` day-restriction marker on a corrected stage word (`Strke***`) is preserved (`Strike***`) and `UNKNOWN_DAY_RESTRICTION` still fires downstream.
- `extractRoleFlags`/`parseCrew` end-to-end (mirror `tests/parser/blocks/crew.test.ts`, `tests/parser/warnings.test.ts` — `newAggregator()` → `parseCrew(md, version, agg)`): the exact East Coast string → **0** `UNKNOWN_ROLE_TOKEN` + **1** `STAGE_WORD_AUTOCORRECTED` (with `blockRef.name`) + `A1` flag; `Load Out / Strke ONLY` → correct `stage_restriction` + 1 note.
- **Negative-regression / over-match:** a genuine unknown role (`RIGGER`/`XYZ`) STILL emits `UNKNOWN_ROLE_TOKEN` (the fix doesn't eat real unknowns); a real role near a stage word isn't corrected. Verify by mutating the gate to prove the test catches a too-greedy fix.
- Deep-link wiring: `STAGE_WORD_AUTOCORRECTED` resolves a `sourceCell` via the crew-name anchor (extend `tests/drive/showDayTimeAnchors.test.ts` / `tests/parser/crewRoleWarningBlockRef.test.ts`); it's in `OPERATOR_ACTIONABLE_ANCHORED`.
- Catalog: `x1-catalog-parity` + `x2-no-raw-codes` green after the 3-part lockstep + the no-raw-codes registration.

## 11. Plan-wide invariants
1. **TDD per task.** 2. **Advisory lock:** N/A (pure parser + existing flow, no new lock). 5. **No raw codes:** rendered via catalog title (§6.2). 8. **UI quality gate:** N/A — no `components/`/`app/` file changes (renders via the unchanged PR #154 component; confirm in plan). 9. **Supabase boundary:** N/A. No DB migration. §12.4 3-part lockstep + x1/x2 apply (§6.1-6.2).

## 12. Watchpoints (do NOT relitigate)
- **Roles/emails stay EXACT — by design** (`ROLE_NORMALIZATIONS` A1↔A2/V1↔L1 are edit-distance 1; class-sweep `leave-exact`). Do not propose fuzzy-matching roles.
- **The four stage patterns are fixed as a UNIT via one upstream normalization** — not `FULL_STAGE_PATTERN` alone (class-sweep: half-fix leaves `LOAD OUT STRKE ONLY` broken). The happy-path exact strip is intentionally left in place (handles clean sheets; the normalization is a no-op on them).
- **The confidence gate is `≥ 2 stage-ish (exact OR near) AND ≥ 1 exact anchor`** — NOT `≥ 2 exact` (which fails the 2-word ONLY cells; class-sweep correction). The worked-example table (§4.2) is the contract.
- **The segment-comparison form MUST peel a trailing `ONLY`/`***` per segment** (§4.1 step 2) — without it, `"STRKE ONLY"` is distance > 1 from `STRIKE` and the gate silently fails on BOTH 2-word ONLY cells (spec-review R1 [high]). The normalizer's token model must match the `…ONLY` regex grammar it feeds.
- **Role-exclusion guard (§4.1 step 3a):** a `ROLE_NORMALIZATIONS` member is classified as a role first and is NEVER rewritten to a stage word. No current role triggers it (all are distance ≥ 2 from stage phrases); it future-proofs new roles. The §8 collision claim is bounded, not "impossible" (spec-review R1 [medium]).
- **`STAGE_WORD_AUTOCORRECTED` is `warn`, not `info`** — required for the PR #154 deep link (the selector gates on `warn`); `TYPO_NORMALIZED` is `info` and intentionally not deep-linked. Modeled on `TYPO_NORMALIZED` for *wording*, on `UNKNOWN_ROLE_TOKEN` for *contract* (warn + anchored + full copy).
- **Damerau (not the existing plain `levenshtein` in `invariants.ts`)** — transpositions are common stage typos; the existing internal helper is left untouched (MI-13/14 pairing is out of scope).
- **The deferred follow-ups are deferred, with triggers (§9)** — especially the section-header family. This PR's blast radius is the stage vocabulary only.
