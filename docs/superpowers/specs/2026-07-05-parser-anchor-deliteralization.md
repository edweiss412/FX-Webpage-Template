# Parser Anchor De-Literalization — Spec (2026-07-05)

**Source:** Recommendation 3 of `docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/edge-case-preparedness-audit-2026-07-04.md` §5 item 3. Recommendations 1 (version-detection confidence gate, PR #302) and 2 (re-sync quality gate, PR #315) already shipped.

**One-line intent:** De-literalize the three Tier-1 "single-literal anchor" brittleness sources the audit ranked highest (findings #6, #7, #5), so future show-bible variation (new venue room names, reordered stage-restriction phrasings, short-header typos) is either parsed correctly or explicitly signaled — never silently wrong.

**Blast radius:** parser-only. **NO UI** (no file under `app/` except none; no `components/`; no CSS/tokens). **NO DB / migrations. NO advisory-locks.** One new §12.4 error code (`UNKNOWN_STAGE_RESTRICTION`) → the standard 3-way catalog lockstep + downstream CI gates (§7 below).

---

## 1. Scope

Three independent de-literalizations, shipped in one PR (they share the "single-literal anchor" structural diagnosis from the audit §4, and none touches DB/UI):

| Part | File(s) | Audit finding | Risk |
|------|---------|---------------|------|
| A. Room-header shape predicate | `lib/parser/blocks/rooms.ts` | #6 (Tier 1) | High — `rooms.ts` is corpus-tuned; regression-prone |
| B. Stage-restriction token grammar | `lib/parser/personalization.ts`, `lib/parser/blocks/crew.ts` | #7 (Tier 2) | Medium |
| C. Short-header typo tolerance | `lib/parser/sectionHeaderNormalize.ts` | #5 (Tier 1) | Low — extends an existing, gated mechanism |

### Out of scope (explicit — do NOT relitigate)

- **Rehearsal as a work phase / stage.** DESCOPED. `StageRestriction` (`lib/parser/types.ts:28-29`) and `WorkPhase` (`:141`) are the SAME union, and the schedule model has no rehearsal *day* — `PHASE_TAG_WORKPHASES` (`lib/crew/stageSchedule.ts:16-21`) only emits Load In/Set/Show/Load Out. Adding "Rehearsal" to the stage vocab WITHOUT a day mapping makes a "Rehearsal ONLY" crew member intersect zero days (`stageWorksDay` `:24-37` → `effectiveViewerDateRestriction` `:66` returns `days: []`) — strictly worse than the current safe fallback (whole show + warning). Any rehearsal→day mapping (Set? Show?) is an ungrounded guess (Rehearsal is not in the 7-show corpus). Part B therefore recognizes the **5 already-typed stages** and *signals* an unrecognized clause; it does NOT change the type. No `StageRestriction`/`WorkPhase` edit.
- **Always-signal on shape-recognized rooms.** Part A REPLACES the literal venue anchors with a shape predicate; a room newly recognized by shape appears on the crew/review surfaces (itself visible to Doug) — it does NOT additionally emit a new warning code. (The audit's "Additive + always-signal" variant was considered and declined during brainstorming; pure replacement was chosen.)
- **Property/fuzz harness (audit rec 5), silent-channel wiring (rec 4), MI-1 e2e / known-sections walker (rec 6).** Separate recommendations, separate PRs.
- **Widening date/address/dims formats (audit findings #8/#9/#11).** Tier-2, opportunistic, not this PR.

---

## 2. Part A — Room-header shape predicate

### 2.1 Current brittle behavior (cited)

`rooms.ts` hangs v1 room recognition on two hardcoded venue names, `MABEL` and `LAUDERDALE` (from the single 2024 east-coast fixture), at three sites:

1. **`extractGsBlock` terminator** (`lib/parser/blocks/rooms.ts:687`): `/^\|\s*(GENERAL SESSION|BREAKOUT|ADDITIONAL|LUNCH|MABEL|LAUDERDALE|DETAILS)\b/i` — stops GS bare-field extraction at the next room/section header.
2. **v1 room loop** (`:825`): `const mabelRe = /^\|\s*(MABEL\s+\d[^|]*|LAUDERDALE[^|]*?)\s*\|/gim;` — the ONLY discovery path for a label-less venue-named room block.
3. **`NEXT_ROOM_HEADER_RE`** (`:880-881`): `/^\|\s*(GENERAL\s+SESSION|BREAKOUT|ADDITIONAL\s+ROOM|LUNCH\s+ROOM|MABEL|LAUDERDALE|DETAILS)\b/i` — the block-extraction terminator used by `extractBoBlock` (`:883-898`).

Consequence (audit #6): every new venue has new room names; a bare proper-name GS/breakout header (e.g. `SALON ABCD\n60' x 45'`) at a venue that isn't the east-coast one is **lost or mis-grouped** — no room row, no signal.

Note: shape-based recognition already exists for the *GS* label-less case — `findGsBlockVenueHeader` (`:543-581`) requires "strong evidence" (in-cell `&#10;` newline OR a dims token, plus a section-banner exclusion list). Part A generalizes that same discipline to the v1 breakout-room loop and de-literalizes the three sites above with one shared predicate.

### 2.2 New behavior

Introduce **three** functions with clean single-responsibility contracts (splitting the pure name-shape test from the contextual evidence test — a single-cell predicate cannot see the block beneath, per adversarial-review R1 finding 2). All exported from `lib/parser/blocks/rooms.ts`:

```ts
// (a) PURE — name-shape only, computable from the header cell alone.
export function roomHeaderNameShape(col0Raw: string): boolean
// (b) PURE — dims token rides in the (possibly multi-line) header cell.
function dimsInHeader(col0Raw: string): boolean       // /\d+\s*'\s*x/i across any header line
// (c) LOCAL — ≥1 recognized breakout room-field in the IMMEDIATE next 1–2 non-blank table rows.
function hasRoomFieldEvidence(nextRowsText: string): boolean
// (d) UNIFIED predicate — the SAME strong-evidence gate for BOTH discovery and terminator.
export function isRoomHeaderShape(col0Raw: string, nextRowsText: string): boolean
//   = roomHeaderNameShape(col0Raw) && (dimsInHeader(col0Raw) || hasRoomFieldEvidence(nextRowsText))
```

**Design note (adversarial-review R2 finding 1 + R3 finding 2):** discovery and the terminator use the **identical** `isRoomHeaderShape` predicate over the **immediate next 1–2 non-blank table rows** — NOT the whole block beneath. A whole-block scan for discovery is what lets an all-caps note (`SPECIAL NOTE`) inside a valid block get fabricated into a bogus room, because legit fields appearing *later* in the enclosing block satisfy a whole-block evidence check. Bounding the evidence to the rows *immediately* following the header makes "a note followed by more note text" fail evidence (no dims, no immediate field row) while a real header (`GRAND FOYER\nDAY 1 & 2` followed at once by BO field rows, or `SALON ABCD\n60' x 45'` with dims-in-header) passes. This aligns discovery and terminator on one bounded-local rule.

**`roomHeaderNameShape(col0Raw)` (pure) returns true iff ALL hold:**

1. **Non-empty, label-less proper name.** After flattening `&#10;`→newline and taking the first line, trimmed, uppercased: the first line matches an all-caps proper-name shape `^[A-Z0-9][A-Z0-9 &'./-]*$` (letters/digits/spaces + a small punctuation set; at least one letter). Reject a first line containing lowercase words (a mixed-case field label like `Breakout Room Setup Date / Time`) — the existing loops are already case-sensitive on uppercase headers (`:750-752`), preserve that.
2. **Not a known section/room banner.** The uppercased first line does NOT start with any structural keyword already handled by a dedicated path or that denotes a section: `GENERAL SESSION`, `BREAKOUT`, `ADDITIONAL`, `LUNCH`, `DETAILS`, plus the section banners `findGsBlockVenueHeader` already excludes (`:565-571`: `DOCUMENTS`, `DATES`, `CREW`, `DRESS`, `TRANSPORTATION`, `HOTEL`, `VENUE`, `AGENDA`, `CONTACTS`). Also NOT in `KNOWN_SECTION_HEADERS` / `KNOWN_SUB_LABELS` (`lib/parser/knownSections.ts:34,96`) and NOT a `GS <label>` field row (`^GS\s`).
3. **Not a room-FIELD label** (adversarial-review R4 finding 1). A sheet with UPPERCASE field labels (`BO SETUP`, `AUDIO`, `SET TIME`) would otherwise satisfy the name-shape + immediate-field-evidence gate and fabricate a room named after a field label — a regression the literal MABEL/LAUDERDALE loop cannot cause. Reject the row if its uppercased first line — after stripping an optional leading `BO ` or `GS ` prefix — is one of the room-field labels that `applyBoFields`/`applyGsLabel` recognize (`rooms.ts:695-707` + the `applyBoFields` label set): `SETUP`, `SET TIME`, `SHOW TIME`, `STRIKE TIME`, `AUDIO`, `VIDEO`, `SCENIC`, `LIGHTING`, `LED`, `POWER`, `OTHER`, `DIMENSIONS`, `FLOOR`, `DIGITAL SIGNAGE`, `NAME(S)`, `NOTES`. The exclusion list is DERIVED from the live `applyBoFields`/`applyGsLabel` code (not hardcoded in the spec) so it cannot drift; the plan pins it to a shared constant.

**`hasRoomFieldEvidence(nextRowsText)`**: ≥1 recognized breakout room-field row among the IMMEDIATE next 1–2 non-blank table rows following the header (the fields `applyBoFields`/`mergeBoFields` recognize — `dimensions`/`floor`/`setup`/`set time`/`show time`/`strike time`/`audio`/`video`/`scenic`/`lighting`/`power`/`other`). Bounded to the immediate rows, NOT the whole block (see design note above).

A tiny helper `nextNonBlankRows(lines, i, n=2)` returns the next `n` non-blank, non-separator table rows after index `i`, joined — used by both call sites so the evidence window is identical.

**Uses (both call the SAME `isRoomHeaderShape(col0, nextNonBlankRows(...))`):**

- **v1 discovery loop (`:823-847`)**: replace `mabelRe` iteration with a scan over every candidate col0 header row, calling `isRoomHeaderShape(rawHeader, nextNonBlankRows(lines, rowIndex))` AND the header is not already claimed by the BREAKOUT/LUNCH loops (`seen`) AND not a GS/section row. The merge-by-header-key + drop-empty-room logic (`:830-847`) is otherwise **unchanged**. `MABEL 1\nAPPROXIMATELY 60' x 45'` satisfies via `dimsInHeader`; `MABEL 1\nDAY 1 & 2` (no dims) satisfies via `hasRoomFieldEvidence` on the BO field rows immediately after; both merge by key `MABEL 1`. An all-caps note `SPECIAL NOTE` followed immediately by note text (no field row) FAILS evidence → no bogus room (adversarial-review R3 finding 2). So east-coast output is preserved and no false-positive rooms are created.
- **`extractGsBlock` terminator (`:687`)** and **`NEXT_ROOM_HEADER_RE` → `extractBoBlock` (`:880-898`)**: keep the structural keywords (`GENERAL SESSION|BREAKOUT|ADDITIONAL ROOM|LUNCH ROOM|DETAILS`) and REPLACE the `MABEL|LAUDERDALE` alternatives with `isRoomHeaderShape(col0(i), nextNonBlankRows(lines, i))` — the SAME strong-evidence gate as discovery (adversarial-review R2 finding 1 — a name-shape-only terminator would let any all-caps note / equipment / value row inside a GS/BO block truncate it silently). `extractBoBlock`/`extractGsBlock` already iterate lines by index, so the lookahead is a cheap peek. Consequence: an all-caps note (`IMPORTANT NOTES`) with no dims and no immediate room-field row does NOT terminate; `MABEL 1\nDAY 1 & 2` (no dims, BO fields immediately after) DOES terminate. The **byte-identical east-coast golden test** (§2.4) plus explicit **negative terminator + negative discovery tests** (§8) pin this — the single highest-risk decision in the PR, bounded by an evidence gate rather than asserted blind.

### 2.3 Guard conditions (Part A)

| Input | Behavior |
|-------|----------|
| Empty / whitespace-only col0 | `isRoomHeaderShape` → false |
| Separator row (`\| :---: \|`) | false (caller already skips; predicate also rejects — no letters) |
| Mixed-case field label (`Breakout Room Setup …`) | false (lowercase words present) |
| Section banner (`DETAILS`, `CREW`, …) | false (exclusion list) |
| Proper name, NO dims-in-header, NO fields beneath | false (fails strong-evidence gate — e.g. a stray all-caps note row) |
| Proper name + dims-in-header | true |
| Proper name + ≥1 room-field row beneath | true |
| `MABEL 1` / `LAUDERDALE 2` (east-coast) | true (regression anchor) |

### 2.4 Regression anchor (Part A)

`fixtures/shows/raw/2024-05-east-coast-family-office.md` is the byte-identical anchor. The `parseSheet` output (rooms array: names, dims, floors, field values, ordering, merge/dedup) for east-coast MUST be **unchanged** vs `origin/main`. The plan adds a golden-equality test asserting the east-coast rooms array is deep-equal to a snapshot captured from `origin/main`. This fixture already exercises the no-dim `MABEL 1\nDAY 1 & 2` merge case (the R1-finding-2 contextual-evidence path); the test is the authoritative guard on the terminator evidence-asymmetry decision (§2.2). A NEW synthetic fixture (`SALON ABCD\n60' x 45'`) asserts a novel venue is now recognized (was dropped).

---

## 3. Part B — Stage-restriction token grammar

### 3.1 Current brittle behavior (cited)

`extractStageRestriction` (`lib/parser/personalization.ts:158-169`) recognizes exactly three hand-picked phrasings via three regexes:

- `FULL_STAGE_ONLY_PATTERN` (`:53-54`) — `Load In / Set / Strike / Load Out ONLY` → all 4 physical stages.
- `LOAD_IN_SET_ONLY_PATTERN` (`:55`) — anchored `^- Load In / Set ONLY$` → `[Load In, Set]`.
- `LOAD_OUT_STRIKE_ONLY_PATTERN` (`:56`) — anchored `^- Load Out / Strike ONLY$` → `[Load Out, Strike]`.

`extractRoleFlags` (`:267-370`) DUPLICATES the same three patterns to strip the stage prefix before tokenizing role flags (`:279-293`).

Consequence (audit #7): a reordered or novel-but-valid subset — `Set / Strike ONLY`, `Load Out / Strike ONLY` (note: only `Load In/Set` and `Load Out/Strike` orderings are hardcoded), `Set / Show ONLY` — falls through `extractStageRestriction` to `{kind:"none"}` AND is then mis-tokenized by `extractRoleFlags` into an `UNKNOWN_ROLE_TOKEN` cascade (e.g. `Set / Strike ONLY` → tokens `SET`, `STRIKE ONLY` → two spurious unknown-role warnings), and the crew member sees the **whole show**. An out-of-vocab clause like `Rehearsal ONLY` produces an `UNKNOWN_ROLE_TOKEN` with imprecise "role token" copy.

### 3.2 New behavior — one shared `parseStageClause`

Introduce one order-independent grammar function, shared by both consumers (kills the 3-pattern duplication):

```ts
// lib/parser/personalization.ts
const STAGE_RESTRICTION_VOCAB = ["LOAD IN", "SET", "SHOW", "STRIKE", "LOAD OUT"] as const;
//                                                  ^^^^ NEW: Show added (already a valid WorkPhase)

export type StageClause = {
  /** Recognized stage tokens in appearance order, deduped. Empty if none recognized. */
  stages: Array<"Load In" | "Set" | "Show" | "Strike" | "Load Out">;
  /** True iff a trailing ONLY(±***) restriction marker was present. */
  hasOnly: boolean;
  /** The role cell with the leading stage clause + ONLY marker removed, for role-flag tokenizing. */
  cleaned: string;
  /** True iff the cell had an ONLY-clause that looked like a restriction but no stage resolved. */
  unrecognizedRestriction: boolean;
  warnings: ParseWarning[];
};
export function parseStageClause(roleCell: string): StageClause
```

**Grammar (evaluated on the role cell, after day-restriction extraction already ran upstream — see `crew.ts:299-304`):**

1. Strip an optional leading `-` and whitespace (preserved for `cleaned` reconstruction).
2. **Find the ONLY marker.** Locate the first `\bONLY\b(\*{0,3})?`. If ABSENT → `hasOnly = false`, `stages = []`, `unrecognizedRestriction = false`, `cleaned = roleCell` UNCHANGED, return. (A partial subset with no ONLY — e.g. `Set / Strike` — is thus never consumed, so `extractRoleFlags` still emits its `UNKNOWN_ROLE_TOKEN` signal — adversarial-review R2 finding 2, never silent. Descriptive full lists w/o ONLY are handled by the retained `FULL_STAGE_PATTERN` strip in `extractRoleFlags`.)
3. **ONLY present.** Let `body` = text between the leading dash and the ONLY marker; `tail` = text after the marker. Split `body` on `/` into segments (trimmed). Classify the WHOLE body:
   - **All-stages:** every segment EXACTLY equals a `STAGE_RESTRICTION_VOCAB` member (≥1 segment). Full-segment-exact is load-bearing — `SHOW CALLER` ≠ `SHOW`, so it is not a stage (adversarial-review R1 finding 1). → `stages` = segments (appearance order, deduped, canonical-cased), `hasOnly = true`, `unrecognizedRestriction = false`, `cleaned` = `tail` (as the role-flag remainder). This is the explicit-restriction path.
   - **Pure-role:** body has NO stage segment AND tokenizes ENTIRELY to recognized roles using **the SAME tokenization as `extractRoleFlags`** — multi-word extraction first (`SHOW CALLER`, `GREEN ROOM`, …), THEN split on both `/` AND `-`, each remaining token resolving to a `ROLE_NORMALIZATIONS` member (adversarial-review R5 finding 1 — the live role parser decomposes `BO - V1` on `-`, so a `/`-only split would misread it). → `stages = []`, `hasOnly = true`, `unrecognizedRestriction = false`, `cleaned = roleCell` UNCHANGED (so `extractRoleFlags` yields the role(s) + `ONLY` flag). Covers `SHOW CALLER ONLY`, `A1 ONLY`, `BO - V1 ONLY`, `GS - A1 ONLY`, `BO - LEAD ONLY`. (Implementation shares one tokenizer helper with `extractRoleFlags` so the two can never diverge on what counts as "all-roles".)
   - **Date-bearing:** body contains a date token (`\d{1,2}/\d{1,2}`) — a leaked day restriction (normally consumed by `extractDayRestriction` upstream, `crew.ts:299`). → treat as none, `cleaned = roleCell` unchanged (defensive; not expected).
   - **Mixed / unrecognized (the safety-critical branch):** body has ≥1 unrecognized segment (a non-stage, non-role, non-date token) — whether alone (`Rehearsal ONLY`) OR mixed with recognized stages (`Set / Rehearsal ONLY`, `Set / Sho ONLY`, `Load In / Rehearsal ONLY`). → `stages = []` (NEVER emit a partial explicit restriction from the recognized prefix — adversarial-review R3 finding 1), `hasOnly = true`, `unrecognizedRestriction = true`, `cleaned = tail` (the garbled body IS consumed so `extractRoleFlags` does not double-warn, but a post-ONLY role tail like `- LEAD` is PRESERVED for role-flag parsing — matching `origin/main` which still surfaces the role). `extractStageRestriction` then returns `{kind:"none"}` + `UNKNOWN_STAGE_RESTRICTION` → whole-show fallback + precise signal.

**Rule of thumb:** an ONLY-clause yields an explicit stage restriction ONLY when **every** pre-ONLY `/`-segment is an exact stage. Any unrecognized segment collapses the entire clause to the safe whole-show fallback with a warning — a recognized prefix never partially narrows the schedule.

Note: `Sho` (typo of `Show`) is NOT auto-corrected by `normalizeStageWords` (its `STAGE_VOCAB` is the 4 physical stages, no `Show` — §3.3), so `Set / Sho ONLY` lands in the mixed/unrecognized branch (whole-show + `UNKNOWN_STAGE_RESTRICTION`), which is the safe outcome; extending stage-word typo correction to `Show` is out of scope.

**Decision table:**

| Role cell | stages | hasOnly | unrecognizedRestriction | Resulting `StageRestriction` |
|-----------|--------|---------|-------------------------|------------------------------|
| `- Load In / Set / Strike / Load Out ONLY*** - LEAD` | [Load In,Set,Strike,Load Out] | true | false | explicit, 4 stages (unchanged) |
| `- Load In / Set ONLY` | [Load In,Set] | true | false | explicit [Load In,Set] (unchanged) |
| `Set / Strike ONLY` (reordered subset) | [Set,Strike] | true | false | explicit [Set,Strike] (**FIXED**) |
| `Set / Show ONLY` | [Set,Show] | true | false | explicit [Set,Show] (**NEW**, Show valid) |
| `Load In / Set / Strike / Load Out - LEAD` (full, no ONLY) | [4 stages] | false | false | none; `cleaned` unchanged, full-list prefix stripped by retained `FULL_STAGE_PATTERN` → role LEAD (unchanged) |
| `Set / Strike` (partial, no ONLY) | [Set,Strike] | false | false | none; `cleaned` UNCHANGED → `extractRoleFlags` emits `UNKNOWN_ROLE_TOKEN` (signal preserved, **NOT silent**) |
| `SHOW ONLY` | [Show] | true | false | explicit [Show] |
| `Set / Rehearsal ONLY` (mixed) | [] | true | true | none + `UNKNOWN_STAGE_RESTRICTION` (**never partial [Set]** — R3 f1) |
| `Set / Sho ONLY` (typo mixed) | [] | true | true | none + `UNKNOWN_STAGE_RESTRICTION` |
| `Load In / Rehearsal ONLY - LEAD` (mixed + tail) | [] | true | true | none + `UNKNOWN_STAGE_RESTRICTION`; `cleaned="- LEAD"` → role LEAD preserved |
| `Rehearsal ONLY` | [] | true | true | none + `UNKNOWN_STAGE_RESTRICTION` warn (**FIXED copy**) |
| `SHOW CALLER` | [] | false | false | none; role SHOW_CALLER preserved (**collision guard**) |
| `SHOW CALLER ONLY` | [] | true | false | none; role SHOW_CALLER + ONLY flag (body has recognized role → not unrecognized) |
| `- SHOW CALLER` | [] | false | false | none; role SHOW_CALLER preserved |
| `- LEAD` | [] | false | false | none (unchanged) |
| `A1 / GS` | [] | false | false | none (unchanged) |

**`extractStageRestriction` becomes:**

```ts
export function extractStageRestriction(roleCell: string): {
  restriction: StageRestriction;
  warnings: ParseWarning[];
} {
  const clause = parseStageClause(roleCell);
  if (clause.stages.length > 0 && clause.hasOnly) {
    return { restriction: { kind: "explicit", stages: clause.stages }, warnings: [] };
  }
  if (clause.unrecognizedRestriction) {
    return {
      restriction: { kind: "none" },
      warnings: [{
        severity: "warn",
        code: "UNKNOWN_STAGE_RESTRICTION",
        message: `Role cell has a work-phase restriction we couldn't read: '${roleCell}'`,
        rawSnippet: roleCell,
      }],
    };
  }
  return { restriction: { kind: "none" }, warnings: [] };
}
```

Signature change: `extractStageRestriction` now returns `{restriction, warnings}` (mirrors `extractDayRestriction`'s `DayRestrictionResult` shape, `:68-73`). Caller `crew.ts:324` threads the warnings (stamped with `crewBlockRef`) into `warnings`/`agg.warnings` exactly as `dayResult.warnings` is threaded (`:300-301`).

**`extractRoleFlags`** replaces its three hardcoded *with-ONLY* strip-patterns (the `FULL_STAGE_ONLY`/`LOAD_IN_SET_ONLY`/`LOAD_OUT_STRIKE_ONLY` handling at `:279-293`) with `parseStageClause(roleCell).cleaned` as the remainder to tokenize. Because `cleaned` is unchanged unless a with-ONLY restriction was consumed (§3.2 step 4), `extractRoleFlags` RETAINS its existing `FULL_STAGE_PATTERN` (no-ONLY) prefix strip (`:279-283`, the descriptive "works all phases" case) applied to that remainder — this is not one of the three restriction patterns being de-duplicated. Net: a `Set / Strike` (no ONLY) remainder is unchanged and tokenizes to `UNKNOWN_ROLE_TOKEN` exactly as today; a `Load In / Set / Strike / Load Out - LEAD` (full, no ONLY) still strips to `LEAD`. The `hasOnlyMarker`/`ONLY` role-flag push (`:269,336-337,365-367`) is unchanged.

### 3.3 `Show` in the restriction vocab — downstream check

Adding `Show` to `STAGE_RESTRICTION_VOCAB` lets a crew member be restricted to `Show`. `Show` is ALREADY a `WorkPhase` (`types.ts:141`) and `PHASE_TAG_WORKPHASES` maps `Show`→`["Show"]` (`stageSchedule.ts:19`), so a `[Set,Show]`-restricted crew correctly sees Set + Show days via the EXISTING `stageWorksDay` intersection (`:24-37`). No type change, no consumer change. (`STAGE_VOCAB` at `personalization.ts:174` — the *typo-correction* vocab for `normalizeStageWords` — is a SEPARATE list and is intentionally left at 4; adding Show there is out of scope and unrelated to this grammar.)

### 3.4 Guard conditions (Part B)

| Input | Behavior |
|-------|----------|
| `null`/empty role cell | Callers never pass null (`roleCellForParse` is a trimmed string); empty → stages [], hasOnly false, none |
| ONLY inside a paren-date (`(6/24 ONLY)`) | Consumed UPSTREAM by `extractDayRestriction` (`crew.ts:299`) before `parseStageClause` sees it; body would be empty/date → not `unrecognizedRestriction` |
| Bare `***` with no ONLY, non-stage role (`- LEAD***`) | stages [], hasOnly false → none; existing `hasTripleAsterisk`→`unknown_asterisk` path (`crew.ts:347-362`) unchanged |
| `ONLY` as a lone role flag with a recognized role (`A1 ONLY`) | body `A1` IS a recognized `ROLE_NORMALIZATIONS` token → NOT `unrecognizedRestriction`; falls to role-flag path (A1 + ONLY flag) unchanged |
| Whitespace/case variants (`load in/set  ONLY`) | Recognized (case-insensitive, flexible whitespace) |

---

## 4. Part C — Short-header typo tolerance (deferred P3 pickup)

### 4.1 Current behavior (cited)

`normalizeSectionHeaders` (`lib/parser/sectionHeaderNormalize.ts:44-97`) fuzz-corrects only three LONG headers — `LONG_SECTION_VOCAB = ["TRANSPORTATION", "EVENT DETAILS", "GS DETAILS"]` (`:16`) — behind a gate that accepts a label-only row OR a row with ≥1 field-header word (`:70-73`). The short routers `CREW`/`TECH`/`HOTEL`/`VENUE` were explicitly **deferred** as P3 in `docs/superpowers/specs/2026-06-27-parser-typo-tolerance-design.md` (§out-of-scope: "P3 (short section routers CREW/TECH/HOTEL/VENUE behind the field-band gate …)").

Consequence (audit #5): a one-edit typo in a short header — `HOTLE`, `TCEH`, `VENEU` — silently vanishes the section (TECH/HOTEL/VENUE); a `CRWE` typo instead trips the loud MI-3/4/5 hard fail. This part corrects the typo in a pre-pass so the section parses AND, for CREW, pre-empts the cryptic MI hard-fail with a clean auto-correct + warning.

### 4.2 New behavior

Add a `SHORT_SECTION_VOCAB` corrected behind gating STRICTER than the long-vocab path. The gates are: `minLen` + `exclude` (both real `gatedVocabCorrect` opts, `lib/parser/typoGate.ts:3-8`) + a **caller-side field-band gate** (`countFieldHeaderWords(otherCells) ≥ 1`, already at `sectionHeaderNormalize.ts:73`) + `noExactSpellingElsewhere` (caller, `:75-76`).

```ts
const SHORT_SECTION_VOCAB = ["CREW", "TECH", "HOTEL", "VENUE"] as const;
```

Aligned EXACTLY to the documented P3 set — the four short routers, all of which have a clean INFO-tab deep-link region. **`DATES` is intentionally excluded** (it was P4, not P3): it has NO header-block `RegionId` (mapping it to `schedule` would mis-link the warning to the AGENDA tab, since the DATES header lives on the INFO tab), it carries the delicate DATE↔DATES near-collision (P4), and a DATES typo already fails loudly via MI-3 — so the quiet-failure value is absent. (This narrows the informal "CREW/TECH/HOTEL/VENUE/DATES" list from the feature brief to the correct P3 four; noted in the ship report.)

**Two-pass structure in `normalizeSectionHeaders`:** per row, try the existing LONG vocab first (unchanged gate: label-only OR ≥1 field word). If no long match, try `SHORT_SECTION_VOCAB` with the STRICTER gate below. Both write the SAME `SECTION_HEADER_AUTOCORRECTED` warning code (`:87`) — an EXISTING §12.4 code (`catalog.ts:1213`). No new code for Part C.

- **Field-band gate (caller-side, stricter for short):** a short-header correction fires ONLY when the candidate row carries ≥1 `SECTION_FIELD_HEADER_WORDS` in its other cells (`countFieldHeaderWords`, `knownSections.ts:241`) — the `labelOnly` branch that the long vocab allows is NOT accepted for short headers (short headers are collision-prone; require field-header corroboration). A bare mistyped `CRWE` with no field-header cells is left untouched (the existing MI hard-fail still catches genuinely-absent CREW).
- **`minLen: 4`** — `CREW`/`TECH` are 4 chars, so the established `minLen: 5` (field-alias fallback) would reject them. `minLen: 4` admits the four-char routers while still dropping ≤3-char noise magnets. Damerau-1 on a 4-char token is the tight edge; the field-band gate + `noExactSpellingElsewhere` + `EXCLUDE` are the compensating controls.
- **`EXCLUDE`** — the existing cross-vocab exclusion (`:26-31`) already includes every other `KNOWN_SECTION_HEADERS` member + `KNOWN_SUB_LABELS`. So `VENUES`/`HOTELS`/`HOTEL STAYS`/etc. (in `KNOWN_SECTION_HEADERS`) are in `EXCLUDE` and are never fuzzed into a short router, and `noExactSpellingElsewhere` prevents shadowing a real header. `DATE`/`DAY`/`ROOM` sub-labels (`knownSections.ts:107,112,113`) remain in `EXCLUDE` harmlessly.

**Region mapping:** extend `CANON_TO_REGION` (`:18-22`) with the four short headers, using the canonical `RegionId` values from `REGION_ANCHOR_SPEC` (`lib/sheet-links/buildSheetDeepLink.ts:61-123`): `CREW`→`crew`, `TECH`→`crew` (the `crew` region header is `/^(CREW|TECH)$/i`, `:76`), `HOTEL`→`hotels` (`:85-90`), `VENUE`→`venue` (`:107-112`). All four are valid `RegionId` union members (`REGION_IDS`, `:29-44`).

### 4.3 Guard conditions (Part C)

| Input | Behavior |
|-------|----------|
| Correctly-spelled `CREW` | `gatedVocabCorrect` returns `{corrected:false}` (exact-first, `typoGate.ts:23-25`) → unchanged (corpus guard: no-op on clean sheets) |
| `CRWE` with field-header cells (`NAME`/`ROLE`) in the row | corrected to `CREW` + `SECTION_HEADER_AUTOCORRECTED`, region `crew` |
| `HOTLE` / `TCEH` / `VENEU` with field-header cells | corrected to `HOTEL`/`TECH`/`VENUE` |
| `CRWE` label-only, no field-header cells | field-band gate fails → NOT corrected (left for MI hard-fail) |
| `HOTELS` / `VENUES` (real plural header) | in `EXCLUDE` → never fuzzed to `HOTEL`/`VENUE` |
| A real `CREW` header already present elsewhere in the doc | `noExactSpellingElsewhere` (`:75-76`) → the mistyped one is NOT corrected (never shadow a real header) |
| `TEAM` | `Damerau(TEAM,TECH)=2 > 1` → no match. Safe. |

---

## 5. Data flow (unchanged except the two threaded points)

```
parseSheet(markdown)
  → normalizeSectionHeaders (Part C: short-header fuzz)      [sectionHeaderNormalize.ts]
  → block parsers scan corrected markdown
      → rooms: parseGsRoom / parseBoRooms                     [Part A: isRoomHeaderShape]
      → crew rows: parseCrewRow                               [crew.ts]
          → extractDayRestriction (unchanged)
          → normalizeStageWords (unchanged)
          → extractStageRestriction → {restriction, warnings} [Part B: parseStageClause]  ← threads warnings
          → extractRoleFlags (uses parseStageClause.cleaned)  [Part B]
  → ParsedSheet { …, warnings[] }
```

No change to sync/apply, DB, or any downstream consumer. `StageRestriction`/`WorkPhase` types unchanged. Warning surfacing (review surfaces, data-quality badge, `OPERATOR_ACTIONABLE_ANCHORED`) uses the existing pipeline; `UNKNOWN_STAGE_RESTRICTION` is registered in it (§7).

---

## 6. Meta-test inventory (declared)

- **No new structural meta-test created.** Part C extends the mechanism `sectionHeaderNormalize` already guards via `2026-06-27-parser-typo-tolerance` tests; Part B/A are pure-function changes covered by unit + golden-fixture tests.
- **Extends:** `tests/messages/codes.test.ts` (x1-catalog-parity) automatically covers the new `UNKNOWN_STAGE_RESTRICTION` row once added to §12.4 + `catalog.ts` (the 3-way lockstep test). `_metaKnownSectionsRegistry.test.ts` is NOT affected (no new *section* header token; `SHORT_SECTION_VOCAB` members are already in `KNOWN_SECTION_HEADERS`).
- **Advisory-lock topology:** N/A — no `pg_advisory*` surface touched.

---

## 7. New §12.4 code — `UNKNOWN_STAGE_RESTRICTION` (full touchpoint checklist)

Per `AGENTS.md` cross-cutting discipline + memory `feedback_new_12_4_code_full_ci_touchpoints`, a new code lands ALL of these in the SAME PR (the plan makes each a task):

1. **Master spec §12.4 prose** — `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md`: add the `UNKNOWN_STAGE_RESTRICTION` row (audience: doug; auto/manual resolution per the row's nature — auto-resolving on re-parse, mirroring `UNKNOWN_ROLE_TOKEN`). Do NOT run prettier on the master spec (memory `feedback_never_prettier_the_master_spec`).
2. **`pnpm gen:spec-codes`** → regenerates `lib/messages/__generated__/spec-codes.ts`. Commit the regen.
3. **`lib/messages/catalog.ts`** — add the matching runtime row (dougFacing copy, followUp `Doug → fix sheet`, `helpHref: /help/errors#UNKNOWN_STAGE_RESTRICTION`, title, longExplanation, helpfulContext). Copy models the whole-show-fallback: e.g. dougFacing "_<crew-name>_'s role names a work-phase restriction we couldn't read (like 'Rehearsal ONLY'). We're showing them the whole show to be safe. Use the standard phases — Load In / Set / Show / Strike / Load Out — so we can filter their schedule."
4. **`pnpm gen:internal-code-enums`** → regenerates `lib/messages/__generated__/internal-code-enums.ts`. Commit.
5. **Help family** — add `UNKNOWN_STAGE_RESTRICTION` to the `/help/errors` families source so the `helpHref` anchor resolves (mirror how `UNKNOWN_DAY_RESTRICTION`/`SECTION_HEADER_AUTOCORRECTED` are registered — the plan cites the exact file).
6. **`OPERATOR_ACTIONABLE_ANCHORED`** (`lib/parser/dataGaps.ts:161-181`) — add `UNKNOWN_STAGE_RESTRICTION` so the warning is eligible for an "Open in Sheet" deep link on review surfaces (it is operator-actionable — Doug fixes the sheet). Assign the crew `blockRef` (`{ kind: "crew", name: <crew name> }`) at the crew.ts stamping site (mirror the `dayResult.warnings`/`stampedRoleWarnings` stamping, `crew.ts:300,328-332`).
   6a. **Anchor resolver dispatch (adversarial-review R5 finding 2)** — membership in `OPERATOR_ACTIONABLE_ANCHORED` is necessary but NOT sufficient for a per-cell anchor: `lib/drive/showDayTimeAnchors.ts:130-135` resolves the crew-role cell by `blockRef.name` only for an explicit code list (`UNKNOWN_ROLE_TOKEN`/`UNKNOWN_DAY_RESTRICTION`/`STAGE_WORD_AUTOCORRECTED`/`ROLE_TOKEN_AUTOCORRECTED`). ADD `UNKNOWN_STAGE_RESTRICTION` to that branch so it resolves to the role cell by `blockRef.name` (else it degrades to a coarse region anchor or none). Regression test: the warning resolves by `blockRef.name` to the role cell on BOTH the sync and onboarding anchor-population paths.
7. **`audience` classification** — `doug` (like the other parse warnings). Verify against the audience-split registry (`project_alert_audience_split`).
8. **Run the FULL suite** (`pnpm test`), not just the touched files — a new code touches x1/x2/help/codes-coverage gates.

---

## 8. Testing & regression (anti-tautology)

Every new test states the concrete failure mode it catches; expected values derive from fixtures, never hardcoded to the implementation.

### Part A
- **Golden regression (primary):** `parseSheet` on `2024-05-east-coast-family-office.md` → assert the `rooms` array is **deep-equal** to the `origin/main` baseline (names/dims/floors/fields/order). Failure mode: shape predicate changes east-coast grouping. (Assert against the parsed data source, not a rendered container.)
- **Novel-venue recognition (dims-in-header):** synthetic markdown with `| SALON ABCD\n60' x 45' |` + a `Setup` field row at a non-MABEL venue → assert one breakout room `{name:'SALON ABCD', dimensions:"60' x 45'"}` appears (was dropped on `origin/main`). Failure mode: literal-only recognition.
- **Novel-venue recognition (no-dim, fields-beneath):** synthetic `| GRAND FOYER\nDAY 1 & 2 |` (NO dims token) followed by a recognized room-field row (`BO Setup` / `Setup`) → assert the room is recognized via `hasRoomFieldEvidence` (not dims). Directly exercises the R1-finding-2 contextual-evidence path and the `MABEL 1\nDAY 1 & 2` merge shape. Failure mode: single-cell predicate can't see fields beneath.
- **Negative (no false positive, discovery):** an all-caps note row (`| IMPORTANT NOTES |`) with NO dims and NO room fields beneath → assert NO room row created. Failure mode: shape predicate too loose.
- **Negative (terminator does not truncate, R2 finding 1):** a GS/BO block with an all-caps non-room row (`| SPECIAL NOTE |`, no dims, followed by more note text — NOT a room field) sitting BEFORE later legitimate room-field rows → assert extraction does NOT stop at the note row and the later fields ARE captured on the room. Failure mode: name-shape-only terminator truncates the block silently.
- **Negative (discovery does not fabricate, R3 finding 2):** SAME fixture — the all-caps `SPECIAL NOTE` row (followed immediately by note text, with valid room fields only further down the enclosing block) → assert NO room named `SPECIAL NOTE` is created (the immediate next rows are note text, not fields, so `hasRoomFieldEvidence` is false). Failure mode: whole-block discovery evidence fabricates a bogus room from a note.
- **Negative (uppercase field labels are not rooms, R4 finding 1):** a room block whose field labels are UPPERCASE — `| BO SETUP |` followed by `| BO SET TIME |`, and `| AUDIO |` followed by `| VIDEO |` — → assert NO room named `BO SETUP` / `AUDIO` / etc. is created (`roomHeaderNameShape` rejects recognized room-field labels, `BO `/`GS `-prefixed or bare). Failure mode: field-label rows fabricate rooms when the sheet uses uppercase labels — a regression vs the literal loop.
- **`roomHeaderNameShape` / `hasRoomFieldEvidence` / `isRoomHeaderShape` unit tables:** every §2.3 guard row, exercising the pure-shape and contextual-evidence functions separately.

### Part B
- **`parseStageClause` unit table:** every §3.2 decision-table row. Reordered subset (`Set / Strike ONLY`) → `[Set,Strike]`; `Set / Show ONLY` → `[Set,Show]`.
- **Regression:** the three original phrasings still produce identical `StageRestriction` (full-4, `[Load In,Set]`, `[Load Out,Strike]`).
- **No-cascade:** `Set / Strike ONLY` → `extractRoleFlags` produces ZERO `UNKNOWN_ROLE_TOKEN` (was 2 on `origin/main`). Failure mode: duplication not removed.
- **Signal:** `Rehearsal ONLY` → `extractStageRestriction` returns one `UNKNOWN_STAGE_RESTRICTION` warning and `{kind:"none"}` (whole-show fallback). Assert NO `UNKNOWN_ROLE_TOKEN` double-warn.
- **SHOW_CALLER collision (R1 finding 1):** `SHOW CALLER`, `SHOW CALLER ONLY`, `- SHOW CALLER` → `extractRoleFlags` yields role flag `SHOW_CALLER` (NOT stage `Show` + unknown `CALLER`); `extractStageRestriction` → `{kind:"none"}`, NO `UNKNOWN_STAGE_RESTRICTION`. Failure mode: full-segment-exact matching regressed to prefix-matching, cannibalizing the role.
- **Hyphenated role scopes preserved (R5 finding 1):** `BO - V1 ONLY`, `GS - A1 ONLY`, `BO - LEAD ONLY` → `extractStageRestriction` `{kind:"none"}` with NO `UNKNOWN_STAGE_RESTRICTION`, AND `extractRoleFlags` yields the roles (`BO`+`V1`, `GS`+`A1`, `BO`+`LEAD`) + `ONLY`. Failure mode: `/`-only classification misreads a hyphen-scoped role as an unknown stage restriction and strips the role flags.
- **Anchor resolution (R5 finding 2):** a crew row producing `UNKNOWN_STAGE_RESTRICTION` → `resolveWarningSourceCells` resolves it by `blockRef.name` to the role cell (a non-null `sourceCell`) on both the sync and onboarding anchor paths. Failure mode: added to the actionable set but no resolver branch → link-less actionable row.
- **No-ONLY subset preserves signal (R2 finding 2):** `Set / Strike` (no ONLY) → `extractStageRestriction` `{kind:"none"}` with NO warning, AND `extractRoleFlags` emits `UNKNOWN_ROLE_TOKEN` (identical to `origin/main`). `Load In / Set / Strike / Load Out - LEAD` (full, no ONLY) → role `LEAD`, no restriction, no unknown token. Failure mode: silent strip drops the existing unknown-token signal.
- **Mixed ONLY-clause never partially narrows (R3 finding 1):** `Set / Rehearsal ONLY`, `Set / Sho ONLY`, `Load In / Rehearsal ONLY - LEAD` → `extractStageRestriction` returns `{kind:"none"}` + exactly one `UNKNOWN_STAGE_RESTRICTION` (NOT explicit `[Set]`/`[Load In]`); assert stages is empty and the crew member is NOT narrowed to the recognized prefix. For the `- LEAD` tail case, assert `extractRoleFlags` still yields role `LEAD` (post-ONLY tail preserved). Failure mode: recognized-prefix consumption emits a partial explicit restriction that silently hides valid days.
- **End-to-end filter:** `stage-filtered-schedule` — a crew row `Set / Show ONLY` folds to a `date_restriction` covering exactly Set + Show days (derive the expected day set from the fixture's `dates`/`schedule_phases`, not a literal). Failure mode: Show not intersecting.
- **Existing `tests/…stage-filtered-schedule` + `personalization` + `crew` suites** stay green.

### Part C
- **Correction:** `CRWE` in a row carrying `NAME`/`ROLE` field-header words → corrected to `CREW` + `SECTION_HEADER_AUTOCORRECTED` with region `crew`. `HOTLE`→`HOTEL` (region `hotels`), `TCEH`→`TECH` (region `crew`), `VENEU`→`VENUE` (region `venue`).
- **Gate:** `CRWE` label-only (no field-header cells) → NOT corrected (field-band gate).
- **Plural non-shadow:** `HOTELS`/`VENUES` → NEVER corrected to `HOTEL`/`VENUE` (EXCLUDE).
- **No-shadow:** a mistyped `CRWE` with a correctly-spelled `CREW` elsewhere in the doc → NOT corrected.
- **Corpus no-op:** every committed clean fixture → `normalizeSectionHeaders` produces zero short-header corrections (no false positives on real sheets).

---

## 9. Disagreement-loop preempts (for the adversarial reviewer)

- **Fail-open posture on unrecognized clauses is intentional.** `Rehearsal ONLY` → whole-show + warning (NOT zero-days, NOT hard-fail). This mirrors the existing `unknown_asterisk` fallback (`crew.ts:347-362`) and is safer than hiding a show from a crew member. Cited: §1 out-of-scope (Rehearsal) + the `effectiveViewerDateRestriction` zero-days trap (`stageSchedule.ts:66`).
- **Shape-recognized rooms are NOT signaled.** Deliberate (brainstorming chose "replace", declined "always-signal"). A newly-recognized room is visible on the review surface by its presence. §1 out-of-scope.
- **`minLen: 4` for the short vocab** (vs the established `minLen: 5` for field-alias fallback) is deliberate — `CREW`/`TECH` are 4 chars. The caller-side field-band corroboration (`countFieldHeaderWords ≥ 1`, `:73`) + `noExactSpellingElsewhere` + `EXCLUDE` are the compensating gates. Cited: typo-tolerance design §4.3 deferred these *behind the field-band gate*, which is exactly this gate. **`DATES` deliberately NOT in the short vocab** — P4 (not P3), region-less, DATE↔DATES delicacy, already-loud MI-3. See §4.2.
- **`STAGE_VOCAB` (typo vocab, `:174`) stays 4-wide; `STAGE_RESTRICTION_VOCAB` (grammar, new) is 5-wide.** Two different vocabularies for two different jobs (spelling correction vs clause recognition). Not a contradiction.
- **Byte-identical east-coast is the room contract**, not "looks right." Deep-equal golden test is load-bearing.

## 10. Self-consistency / numeric sweep

- Stage counts: `STAGE_RESTRICTION_VOCAB` = **5** (Load In, Set, Show, Strike, Load Out). `STAGE_VOCAB` (typo) = **4** (no Show) — intentional, §3.3.
- `SHORT_SECTION_VOCAB` = **4** (CREW, TECH, HOTEL, VENUE — DATES excluded per §4.2). `LONG_SECTION_VOCAB` = **3** (unchanged).
- New §12.4 codes = **1** (`UNKNOWN_STAGE_RESTRICTION`). New room codes = **0**. New Part-C codes = **0** (reuses `SECTION_HEADER_AUTOCORRECTED`).
- Rooms.ts literal sites de-literalized = **3** (`:687`, `:825`, `:880-881`).
- Stage-restriction hardcoded patterns removed = **3** (replaced by 1 `parseStageClause`).
```
