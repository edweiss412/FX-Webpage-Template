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

Introduce a single exported predicate and use it at all three sites plus the v1 loop's discovery:

```ts
// lib/parser/blocks/rooms.ts
// Recognize a label-less venue-name room header by SHAPE, not by literal venue name.
// col0Raw is the raw first-column cell (may contain &#10; line breaks, NOT yet flattened).
export function isRoomHeaderShape(col0Raw: string): boolean
```

**`isRoomHeaderShape(col0Raw)` returns true iff ALL hold:**

1. **Non-empty, label-less proper name.** After flattening `&#10;`→newline and taking the first line, trimmed, uppercased: the first line matches an all-caps proper-name shape `^[A-Z0-9][A-Z0-9 &'./-]*$` (letters/digits/spaces + a small punctuation set; at least one letter). Reject a first line containing lowercase words (a mixed-case field label like `Breakout Room Setup Date / Time`) — the existing loops are already case-sensitive on uppercase headers (`:750-752`), preserve that.
2. **Not a known section/room banner.** The uppercased first line does NOT start with any structural keyword already handled by a dedicated path or that denotes a section: `GENERAL SESSION`, `BREAKOUT`, `ADDITIONAL`, `LUNCH`, `DETAILS`, plus the section banners `findGsBlockVenueHeader` already excludes (`:565-571`: `DOCUMENTS`, `DATES`, `CREW`, `DRESS`, `TRANSPORTATION`, `HOTEL`, `VENUE`, `AGENDA`, `CONTACTS`). Also NOT in `KNOWN_SECTION_HEADERS` / `KNOWN_SUB_LABELS` (`lib/parser/knownSections.ts:34,96`) and NOT a `GS <label>` field row (`^GS\s`).
3. **Strong evidence it is a room** (exactly the `findGsBlockVenueHeader` gate, generalized): EITHER a dims token rides in the header cell (`/\d+\s*'\s*x/i` across any header line) OR the block immediately beneath carries ≥1 recognized breakout room-field (the fields `applyBoFields`/`mergeBoFields` already recognize — `dimensions`/`floor`/`setup`/`set time`/etc.). "Immediately beneath" = the contiguous table rows up to the next `isRoomHeaderShape`/structural terminator.

**Uses of the predicate:**

- **v1 loop (`:823-847`)**: replace `mabelRe` iteration with iteration over every candidate col0 header row for which `isRoomHeaderShape(rawHeader)` is true AND the header is not already claimed by the BREAKOUT/LUNCH loops (`seen`) AND not a GS/section row. The merge-by-header-key + drop-empty-room logic (`:830-847`) is otherwise **unchanged**. `MABEL 1` / `MABEL 1\nAPPROXIMATELY 60' x 45'` / `MABEL 1\nDAY 1 & 2` / `LAUDERDALE …` all satisfy the shape (proper name; dims-in-header OR fields-beneath), so east-coast output is preserved.
- **`extractGsBlock` terminator (`:687`)** and **`NEXT_ROOM_HEADER_RE` (`:880-881`)**: keep the structural keywords (`GENERAL SESSION|BREAKOUT|ADDITIONAL ROOM|LUNCH ROOM|DETAILS`) and REPLACE the `MABEL|LAUDERDALE` alternatives with a call to `isRoomHeaderShape` on the row's col0. So the terminator now stops at ANY shape-recognized room header, not only the two literal names.

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

`fixtures/shows/raw/2024-05-east-coast-family-office.md` is the byte-identical anchor. The `parseSheet` output (rooms array: names, dims, floors, field values, ordering, merge/dedup) for east-coast MUST be **unchanged** vs `origin/main`. The plan adds a golden-equality test asserting the east-coast rooms array is deep-equal before/after. A NEW synthetic fixture (`SALON ABCD\n60' x 45'` at a non-east-coast venue) asserts a novel venue is now recognized (was dropped).

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

1. Strip an optional leading `-` and whitespace.
2. Greedily consume a **stage run** at the start: one or more `STAGE_RESTRICTION_VOCAB` members (case-insensitive, flexible interior whitespace) joined by `/`. Record them in appearance order, deduped, mapped to canonical casing (`Load In`/`Set`/`Show`/`Strike`/`Load Out`).
3. After the run, look for `\s+ONLY\b(\*{0,3})?`. If present → `hasOnly = true`.
4. Everything after the ONLY marker (or after the stage run if no ONLY) is the role-flag tail → `cleaned`.
5. If step 2 consumed **0 stages** BUT the cell matches the whole-cell shape `^\s*-?\s*<body>\s+ONLY\b(\*{0,3})?\s*$` where `<body>` (a) is non-empty, (b) contains NO recognized `ROLE_NORMALIZATIONS` token, (c) contains NO date token (`\d{1,2}/\d{1,2}`) → `unrecognizedRestriction = true`, and consume the clause into `cleaned = ""` (so `extractRoleFlags` does not also warn). This is the `Rehearsal ONLY` case.

**Decision table:**

| Role cell | stages | hasOnly | unrecognizedRestriction | Resulting `StageRestriction` |
|-----------|--------|---------|-------------------------|------------------------------|
| `- Load In / Set / Strike / Load Out ONLY*** - LEAD` | [Load In,Set,Strike,Load Out] | true | false | explicit, 4 stages (unchanged) |
| `- Load In / Set ONLY` | [Load In,Set] | true | false | explicit [Load In,Set] (unchanged) |
| `Set / Strike ONLY` (reordered subset) | [Set,Strike] | true | false | explicit [Set,Strike] (**FIXED**) |
| `Set / Show ONLY` | [Set,Show] | true | false | explicit [Set,Show] (**NEW**, Show valid) |
| `Load In / Set / Strike / Load Out` (no ONLY) | [4 stages] | false | false | none (stripped for flags; unchanged) |
| `Rehearsal ONLY` | [] | true | true | none + `UNKNOWN_STAGE_RESTRICTION` warn (**FIXED copy**) |
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

**`extractRoleFlags`** replaces its three hardcoded strip-patterns (`:279-293`) with `parseStageClause(roleCell).cleaned` as the remainder to tokenize. The `hasOnlyMarker`/`ONLY` role-flag push (`:269,336-337,365-367`) is unchanged.

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
6. **`OPERATOR_ACTIONABLE_ANCHORED`** (`lib/parser/dataGaps.ts:161-181`) — add `UNKNOWN_STAGE_RESTRICTION` so the warning gets an "Open in Sheet" deep link on review surfaces (it is operator-actionable — Doug fixes the sheet). Assign the crew `blockRef` at the crew.ts stamping site.
7. **`audience` classification** — `doug` (like the other parse warnings). Verify against the audience-split registry (`project_alert_audience_split`).
8. **Run the FULL suite** (`pnpm test`), not just the touched files — a new code touches x1/x2/help/codes-coverage gates.

---

## 8. Testing & regression (anti-tautology)

Every new test states the concrete failure mode it catches; expected values derive from fixtures, never hardcoded to the implementation.

### Part A
- **Golden regression (primary):** `parseSheet` on `2024-05-east-coast-family-office.md` → assert the `rooms` array is **deep-equal** to the `origin/main` baseline (names/dims/floors/fields/order). Failure mode: shape predicate changes east-coast grouping. (Assert against the parsed data source, not a rendered container.)
- **Novel-venue recognition:** synthetic markdown with `| SALON ABCD\n60' x 45' |` + a `Setup` field row at a non-MABEL venue → assert one breakout room `{name:'SALON ABCD', dimensions:"60' x 45'"}` appears (was dropped on `origin/main`). Failure mode: literal-only recognition.
- **Negative (no false positive):** an all-caps note row (`| IMPORTANT NOTES |`) with NO dims and NO room fields beneath → assert NO room row created. Failure mode: shape predicate too loose.
- **`isRoomHeaderShape` unit table:** every §2.3 guard row.

### Part B
- **`parseStageClause` unit table:** every §3.2 decision-table row. Reordered subset (`Set / Strike ONLY`) → `[Set,Strike]`; `Set / Show ONLY` → `[Set,Show]`.
- **Regression:** the three original phrasings still produce identical `StageRestriction` (full-4, `[Load In,Set]`, `[Load Out,Strike]`).
- **No-cascade:** `Set / Strike ONLY` → `extractRoleFlags` produces ZERO `UNKNOWN_ROLE_TOKEN` (was 2 on `origin/main`). Failure mode: duplication not removed.
- **Signal:** `Rehearsal ONLY` → `extractStageRestriction` returns one `UNKNOWN_STAGE_RESTRICTION` warning and `{kind:"none"}` (whole-show fallback). Assert NO `UNKNOWN_ROLE_TOKEN` double-warn.
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
