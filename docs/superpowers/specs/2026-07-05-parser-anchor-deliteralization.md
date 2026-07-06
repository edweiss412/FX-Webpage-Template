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
- **HOTEL/VENUE short-header typo tolerance.** Deferred (R7 f2) — their header rows lack `SECTION_FIELD_HEADER_WORD` corroboration, so the field-band gate can't serve them; they need a bespoke per-router gate. Filed as a backlog item; NOT in this PR.
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
// (b) PURE — dims token rides in the (possibly multi-line) header cell. VALUE + admit only.
function dimsInHeader(col0Raw: string): boolean       // /\d+\s*'\s*x/i across any header line
// (c) LOCAL — ≥1 recognized breakout room-field among the IMMEDIATE next 1–2 non-blank rows.
function hasRoomFieldEvidence(nextRowsText: string): boolean
// (d) ADMIT predicate — a candidate row worth extracting a block for (discovery + terminator).
export function isRoomHeaderShape(col0Raw: string, nextRowsText: string): boolean
//   = roomHeaderNameShape(col0Raw) && (dimsInHeader(col0Raw) || hasRoomFieldEvidence(nextRowsText))
```

**Design note — comprehensive re-analysis of the room-discovery false-positive vector (adversarial-review R2 f1, R3 f2, R4 f1, R6 f1, R7 f1 — 3+ consecutive same-vector rounds triggered the AGENTS.md "comprehensive re-analysis + structural defense" rule).** The literal `MABEL|LAUDERDALE` loop was safe because it matched two specific names; a shape scan is inherently more permissive. The resolution is a **two-stage admit-then-emit** model that separates "worth extracting a block for" from "actually a room":

1. **ADMIT** a candidate iff `roomHeaderNameShape && (dimsInHeader || hasRoomFieldEvidence(immediate 1–2 rows))`. This ADMITS a dims-only-first block (so its dims are captured for merge — R7 f1) AND a field-bearing block.
2. **Group** admitted candidates by header key and merge dims + fields across the group (the existing `mergeBoFields` merge-by-key logic, `:823-847`, UNCHANGED).
3. **EMIT** a room for a key-group iff **≥1 admitted block in that group had `hasRoomFieldEvidence`** (an ACTUAL immediate room-field row) — NOT merely dims. A group whose every member is dims-only (an equipment/asset row with a unique key and no field-bearing sibling) is DROPPED. This is the load-bearing gate: `roomHasContent` alone is INSUFFICIENT because it counts `dimensions` as content (`rooms.ts:424-441`), so a dims-only equipment row would pass it — the emit gate requires a real *field*-bearing block in the group, which equipment never has.

| False-positive / correctness class | Example | Closed by |
|-------|---------|-----------|
| All-caps NOTE inside a block | `SPECIAL NOTE` then note text | not admitted (no dims, no immediate field) |
| Uppercase FIELD-LABEL row | `BO SETUP` / `AUDIO` | `roomHeaderNameShape` item 3 (field-label exclusion) |
| Dimension-bearing EQUIPMENT/asset row | `5' X 9' WIDESCREEN…` (`fixed-income:121`) | admitted (dims) BUT emit-gate DROPS it (unique key, no field-bearing block in group) |
| Repeated room: dims-first + fields-later (CORRECTNESS) | `SALON ABCD&#10;60' x 45'` … `SALON ABCD&#10;DAY 1 & 2` + `BO Setup` | dims-only block admitted → merged into the same-key group → EMITTED because the day block is field-bearing; **dims survive** (R7 f1) |

east-coast holds: `MABEL 1&#10;DAY 1 & 2` (`:26`) + `BO Setup` (`:28`) and `LAUDERDALE …` (`:35`) + `BO Setup` (`:36`) are field-bearing → emitted; there is no lone dims-only equipment group. `dimsInHeader` is used for the admit branch and for extracting the dims value in `splitRoomHeader`, never as the sole emit criterion. Structural defense shipped this round: the **corpus-wide rooms-array no-op test** (§8) — de-literalization MUST be deep-equal to `origin/main` `rooms` on all 15 committed fixtures — is the mechanism-agnostic guard that catches ANY residual false positive OR dropped dimension across the whole corpus.

**`roomHeaderNameShape(col0Raw)` (pure) returns true iff ALL hold:**

1. **Non-empty, label-less proper name.** After flattening `&#10;`→newline and taking the first line, trimmed, uppercased: the first line matches an all-caps proper-name shape `^[A-Z0-9][A-Z0-9 &'./-]*$` (letters/digits/spaces + a small punctuation set; at least one letter). Reject a first line containing lowercase words (a mixed-case field label like `Breakout Room Setup Date / Time`) — the existing loops are already case-sensitive on uppercase headers (`:750-752`), preserve that.
2. **Not a known section/room banner.** The uppercased first line does NOT start with any structural keyword already handled by a dedicated path or that denotes a section: `GENERAL SESSION`, `BREAKOUT`, `ADDITIONAL`, `LUNCH`, `DETAILS`, plus the section banners `findGsBlockVenueHeader` already excludes (`:565-571`: `DOCUMENTS`, `DATES`, `CREW`, `DRESS`, `TRANSPORTATION`, `HOTEL`, `VENUE`, `AGENDA`, `CONTACTS`). Also NOT in `KNOWN_SECTION_HEADERS` / `KNOWN_SUB_LABELS` (`lib/parser/knownSections.ts:34,96`) and NOT a `GS <label>` field row (`^GS\s`).
3. **Not a room-FIELD label** (adversarial-review R4 finding 1). A sheet with UPPERCASE field labels (`BO SETUP`, `AUDIO`, `SET TIME`) would otherwise satisfy the name-shape + immediate-field-evidence gate and fabricate a room named after a field label — a regression the literal MABEL/LAUDERDALE loop cannot cause. Reject the row if its uppercased first line — after stripping an optional leading `BO ` or `GS ` prefix — is one of the room-field labels that `applyBoFields`/`applyGsLabel` recognize (`rooms.ts:695-707` + the `applyBoFields` label set): `SETUP`, `SET TIME`, `SHOW TIME`, `STRIKE TIME`, `AUDIO`, `VIDEO`, `SCENIC`, `LIGHTING`, `LED`, `POWER`, `OTHER`, `DIMENSIONS`, `FLOOR`, `DIGITAL SIGNAGE`, `NAME(S)`, `NOTES`. The exclusion list is DERIVED from the live `applyBoFields`/`applyGsLabel` code (not hardcoded in the spec) so it cannot drift; the plan pins it to a shared constant.

**`hasRoomFieldEvidence(nextRowsText)`**: ≥1 recognized breakout room-field row among the IMMEDIATE next 1–2 non-blank table rows following the header (the fields `applyBoFields`/`mergeBoFields` recognize — `setup`/`set time`/`show time`/`strike time`/`audio`/`video`/`scenic`/`lighting`/`power`/`other`/`floor`; matched as `BO <field>` or bare label rows exactly as `applyBoFields` does). **`dimensions` is deliberately NOT field-evidence** — a dims value is what an equipment row carries, so counting it would defeat the emit gate. Bounded to the immediate rows, NOT the whole block.

A tiny helper `nextNonBlankRows(lines, i, n=2)` returns the next `n` non-blank, non-separator table rows after index `i`, joined — used by both call sites so the window is identical.

**Uses:**

- **v1 discovery loop (`:823-847`)**: replace `mabelRe` iteration with a scan over every candidate col0 header row: ADMIT via `isRoomHeaderShape(rawHeader, nextNonBlankRows(lines, rowIndex))`, AND not already claimed by the BREAKOUT/LUNCH loops (`seen`), AND not a GS/section row. Track per-admitted-block whether it had `hasRoomFieldEvidence`. Group by header key + `mergeBoFields` (UNCHANGED). **EMIT** a key-group's room ONLY IF ≥1 of its blocks was field-bearing (replaces the `roomHasContent`-only drop for shape-discovered rooms — `roomHasContent` counts dims and would keep equipment). `MABEL 1&#10;DAY 1 & 2` / `LAUDERDALE …` are field-bearing → emitted; a `SALON ABCD&#10;60' x 45'` dims-only block merges into its same-key day-block group and is emitted with dims preserved (R7 f1); an equipment row (`5' X 9' WIDESCREEN…`, unique key, no field-bearing block) is admitted but DROPPED (R6 f1); an all-caps note is not admitted (R3 f2). No false-positive rooms anywhere in the corpus.
- **`extractGsBlock` terminator (`:687`)** and **`NEXT_ROOM_HEADER_RE` → `extractBoBlock` (`:880-898`)**: keep the structural keywords (`GENERAL SESSION|BREAKOUT|ADDITIONAL ROOM|LUNCH ROOM|DETAILS`) and REPLACE the `MABEL|LAUDERDALE` alternatives with the ADMIT predicate `isRoomHeaderShape(col0(i), nextNonBlankRows(lines, i))` — so extraction stops at the next admitted room header (adversarial-review R2 finding 1 — a name-shape-only terminator would let an all-caps note truncate a block silently; note that a note is not admitted, so it does not terminate either). The **corpus-wide rooms no-op test** (§8) plus explicit **negative terminator + discovery + equipment + repeated-block tests** pin this — the highest-risk area in the PR, bounded by the admit/emit split and a whole-corpus regression, not asserted blind.

### 2.3 Guard conditions (Part A)

| Input | Behavior |
|-------|----------|
| Empty / whitespace-only col0 | `isRoomHeaderShape` → false |
| Separator row (`\| :---: \|`) | false (caller already skips; predicate also rejects — no letters) |
| Mixed-case field label (`Breakout Room Setup …`) | `roomHeaderNameShape` false (lowercase words present) |
| Section banner (`DETAILS`, `CREW`, …) | `roomHeaderNameShape` false (exclusion list) |
| Uppercase room-field label (`BO SETUP`, `AUDIO`) | `roomHeaderNameShape` false (item 3 field-label exclusion) |
| Proper name, no dims, no immediate field (stray note) | NOT admitted → no room |
| Equipment row: dims-in-header, no immediate field, unique key (`5' X 9' WIDESCREEN…`) | ADMITTED (dims) but EMIT-gate DROPS it (no field-bearing block in group) → no room |
| Dims-only block sharing a key with a field-bearing block (`SALON ABCD&#10;60' x 45'`) | ADMITTED (dims) → merged → EMITTED with dims (via the field-bearing sibling) |
| Proper name + ≥1 room-field row IMMEDIATELY beneath | ADMITTED + field-bearing → EMITTED |
| `MABEL 1&#10;DAY 1 & 2` + `BO Setup` beneath (east-coast) | EMITTED (regression anchor) |

### 2.4 Regression anchor (Part A)

The primary guard is a **corpus-wide rooms-array no-op test** (§8): for EVERY committed fixture under `fixtures/shows/raw/`, `parseSheet(...).rooms` MUST be deep-equal to a snapshot captured from `origin/main`. De-literalization is intended to be a **no-op on all existing fixtures** (MABEL/LAUDERDALE match by shape+evidence; v4/v2 label paths are untouched) and to add rooms only for NOVEL shapes not present in the corpus. This whole-corpus assertion — not just the single east-coast golden — is the structural defense against the room-discovery false-positive class (a bogus room appearing on ANY fixture fails the test). `2024-05-east-coast-family-office.md` remains the key positive case (`MABEL 1&#10;DAY 1 & 2` + `BO Setup`, `LAUDERDALE …` + `BO Setup`). A NEW synthetic fixture (`SALON ABCD` with a `BO Setup` row immediately beneath) asserts a novel venue is now recognized (was dropped); a NEW negative equipment-list fixture (a dimension-bearing asset row like `5' X 9' … SCREEN` followed by more asset rows) asserts NO room is fabricated.

---

## 3. Part B — Stage-restriction token grammar

### 3.1 Current brittle behavior (cited)

`extractStageRestriction` (`lib/parser/personalization.ts:158-169`) recognizes exactly three hand-picked phrasings via three regexes:

- `FULL_STAGE_ONLY_PATTERN` (`:53-54`) — `Load In / Set / Strike / Load Out ONLY` → all 4 physical stages.
- `LOAD_IN_SET_ONLY_PATTERN` (`:55`) — anchored `^- Load In / Set ONLY$` → `[Load In, Set]`.
- `LOAD_OUT_STRIKE_ONLY_PATTERN` (`:56`) — anchored `^- Load Out / Strike ONLY$` → `[Load Out, Strike]`.

`extractRoleFlags` (`:267-370`) DUPLICATES the same three patterns to strip the stage prefix before tokenizing role flags (`:279-293`).

Consequence (audit #7): a reordered or novel-but-valid subset — `Set / Strike ONLY`, `Load Out / Strike ONLY` (note: only `Load In/Set` and `Load Out/Strike` orderings are hardcoded), `Set / Show ONLY` — falls through `extractStageRestriction` to `{kind:"none"}` AND is then mis-tokenized by `extractRoleFlags` into an `UNKNOWN_ROLE_TOKEN` cascade (e.g. `Set / Strike ONLY` → tokens `SET`, `STRIKE ONLY` → two spurious unknown-role warnings), and the crew member sees the **whole show** (a valid restriction silently ignored). The grammar recognizes these reordered/subset stage clauses; a malformed one that mixes a real stage with an unreadable token (`Set / Rehearsal ONLY`) gets a precise `UNKNOWN_STAGE_RESTRICTION` instead of the confusing multi-`UNKNOWN_ROLE_TOKEN` cascade. (A clause with NO recognized stage — `Rehearsal ONLY`, `RIGGER ONLY` — is a role clause and keeps its existing `UNKNOWN_ROLE_TOKEN` behavior; §3.2.)

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
3. **ONLY present.** Let `body` = text between the leading dash and the ONLY marker; `tail` = text after the marker. Split `body` on `/` into segments (trimmed). **Comprehensive re-analysis of the stage-clause classification vector (adversarial-review R1 f1, R3 f1, R5 f1, R8 f1 — 3+ same-vector rounds triggered the AGENTS.md rule). Structural discriminator: the presence of a RECOGNIZED STAGE TOKEN is the SOLE signal that separates a stage restriction from a role clause — there is NO stage-word guessing/heuristic (that would reintroduce the brittle literal lists this PR removes).** Three mutually-exclusive branches:
   - **All-stages** — every `/`-segment EXACTLY equals a `STAGE_RESTRICTION_VOCAB` member (≥1 segment; full-segment-exact so `SHOW CALLER` ≠ `SHOW`, R1 f1). → `stages` = segments (appearance order, deduped, canonical), `hasOnly = true`, `unrecognizedRestriction = false`, `consumedOnlyClause = true`, `cleaned = tail`. Explicit restriction.
   - **Some-stage (malformed)** — ≥1 `/`-segment is an exact stage but NOT all are. → `stages = []` (NEVER partial-narrow to the recognized prefix, R3 f1), `hasOnly = true`, `unrecognizedRestriction = true`, `consumedOnlyClause = true`, `cleaned = tail` (garbled stage body consumed so `extractRoleFlags` does not double-warn; a post-ONLY role tail like `- LEAD` is preserved). → `UNKNOWN_STAGE_RESTRICTION` + whole-show. Covers `Set / Rehearsal ONLY`, `Set / Sho ONLY`, `Load In / Rehearsal ONLY - LEAD`.
   - **No-stage (ROLE clause)** — body contains ZERO recognized stage tokens. → it is a role clause regardless of whether its roles are known; `stages = []`, `hasOnly = true`, `unrecognizedRestriction = false`, `consumedOnlyClause = false`, **`cleaned = roleCell` UNCHANGED** so `extractRoleFlags` handles it with its own tokenizer (multi-word extraction, then `/` and `-` split) — PRESERVING recognized roles and emitting `UNKNOWN_ROLE_TOKEN` for unrecognized ones (adversarial-review R5 f1 hyphen decomposition, R8 f1 unknown-role preservation). Covers `A1 ONLY`, `SHOW CALLER ONLY`, `BO - V1 ONLY`, `GS - A1 ONLY` (roles preserved), `RIGGER ONLY` → `UNKNOWN_ROLE_TOKEN`, `A1 / RIGGER ONLY` → `A1` kept + `UNKNOWN_ROLE_TOKEN(RIGGER)`, `Rehearsal ONLY` → `UNKNOWN_ROLE_TOKEN` (matches `origin/main`; no stage-word guess). NO `UNKNOWN_STAGE_RESTRICTION` here.

   (A date token in `body` — `\d{1,2}/\d{1,2}` — is a leaked day restriction normally consumed upstream by `extractDayRestriction` (`crew.ts:299`); it has no recognized stage, so it falls into No-stage and is left to the existing role/day path. Defensive; not expected.)

**Structural invariant (the class-closing rule):** `UNKNOWN_STAGE_RESTRICTION` fires **iff** `body` contains ≥1 recognized stage token AND is not all-stages. Zero recognized stages ⟹ role clause (never a stage restriction); all stages ⟹ explicit restriction. This single predicate subsumes SHOW CALLER (no stage → role), hyphenated `BO - V1` (no stage → role), `RIGGER`/`Rehearsal` (no stage → role/UNKNOWN_ROLE_TOKEN), and `Set / Rehearsal` (some-stage → UNKNOWN_STAGE_RESTRICTION). A dedicated unit test asserts the invariant directly.

Note: `Sho` (typo of `Show`) is NOT auto-corrected by `normalizeStageWords` (its `STAGE_VOCAB` is the 4 physical stages, no `Show` — §3.3), so `Set / Sho ONLY` is some-stage-malformed (safe `UNKNOWN_STAGE_RESTRICTION`); extending stage-word typo correction to `Show` is out of scope.

**Decision table:**

| Role cell | stages | hasOnly | unrecognizedRestriction | Resulting `StageRestriction` |
|-----------|--------|---------|-------------------------|------------------------------|
| `- Load In / Set / Strike / Load Out ONLY*** - LEAD` | [Load In,Set,Strike,Load Out] | true | false | explicit, 4 stages (unchanged) |
| `- Load In / Set ONLY` | [Load In,Set] | true | false | explicit [Load In,Set] (unchanged) |
| `Set / Strike ONLY` (reordered subset) | [Set,Strike] | true | false | explicit [Set,Strike] (**FIXED**) |
| `Set / Show ONLY` | [Set,Show] | true | false | explicit [Set,Show] (**NEW**, Show valid) |
| `Load In / Set / Strike / Load Out - LEAD` (full, no ONLY) | [4 stages] | false | false | none; `cleaned` unchanged, full-list prefix stripped by retained `FULL_STAGE_PATTERN` → role LEAD (unchanged) |
| `Set / Strike` (partial, no ONLY) | [Set,Strike] | false | false | none; `cleaned` UNCHANGED → `extractRoleFlags` emits `UNKNOWN_ROLE_TOKEN` (signal preserved, **NOT silent**) |
| `SHOW ONLY` | [Show] | true | false | all-stages → explicit [Show] |
| `Set / Rehearsal ONLY` (some-stage) | [] | true | true | none + `UNKNOWN_STAGE_RESTRICTION` (**never partial [Set]** — R3 f1) |
| `Set / Sho ONLY` (some-stage typo) | [] | true | true | none + `UNKNOWN_STAGE_RESTRICTION` |
| `Load In / Rehearsal ONLY - LEAD` (some-stage + tail) | [] | true | true | none + `UNKNOWN_STAGE_RESTRICTION`; `cleaned="- LEAD"` → role LEAD preserved |
| `Rehearsal ONLY` (no-stage) | [] | true | false | none; ROLE clause → `extractRoleFlags` emits `UNKNOWN_ROLE_TOKEN` (R8: no stage-word guess) |
| `RIGGER ONLY` (no-stage) | [] | true | false | none; role clause → `UNKNOWN_ROLE_TOKEN(RIGGER)` (R8 f1) |
| `A1 / RIGGER ONLY` (no-stage) | [] | true | false | none; role clause → `A1` kept + `UNKNOWN_ROLE_TOKEN(RIGGER)` (R8 f1) |
| `SHOW CALLER` | [] | false | false | none; role SHOW_CALLER preserved (**collision guard**) |
| `SHOW CALLER ONLY` (no-stage) | [] | true | false | none; role SHOW_CALLER + ONLY flag |
| `BO - V1 ONLY` (no-stage, hyphen) | [] | true | false | none; roles BO+V1 + ONLY (R5 f1) |
| `- SHOW CALLER` | [] | false | false | none; role SHOW_CALLER preserved |
| `- LEAD` | [] | false | false | none (unchanged) |
| `A1 / GS` | [] | false | false | none (unchanged) |

**`extractStageRestriction` becomes:**

```ts
export function extractStageRestriction(roleCell: string): {
  restriction: StageRestriction;
  warnings: ParseWarning[];
  consumedOnlyClause: boolean; // true iff an ONLY(±***) stage clause was parsed (explicit OR unrecognized)
} {
  const clause = parseStageClause(roleCell);
  if (clause.stages.length > 0 && clause.hasOnly) {
    return { restriction: { kind: "explicit", stages: clause.stages }, warnings: [], consumedOnlyClause: true };
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
      consumedOnlyClause: true,
    };
  }
  return { restriction: { kind: "none" }, warnings: [], consumedOnlyClause: false };
}
```

Signature change: `extractStageRestriction` now returns `{restriction, warnings, consumedOnlyClause}` (the warnings mirror `extractDayRestriction`'s `DayRestrictionResult` shape, `:68-73`). Caller `crew.ts:324` threads the warnings (stamped with `crewBlockRef`) into `warnings`/`agg.warnings` exactly as `dayResult.warnings` is threaded (`:300-301`).

**Triple-asterisk double-warn suppression (adversarial-review R7 finding 3):** `parseStageClause` treats `ONLY***` as the ONLY marker, so a SOME-STAGE clause like `Set / Rehearsal ONLY***` sets `consumedOnlyClause = true`. The EXISTING triple-asterisk guard at `crew.ts:347-362` fires `UNKNOWN_DAY_RESTRICTION` whenever `hasTripleAsterisk(roleRaw) && dateRestriction.kind === "none" && stageRestriction.kind === "none"` — which would ALSO be true for that consumed some-stage clause, producing a MISLEADING second warning alongside `UNKNOWN_STAGE_RESTRICTION`. Fix: add `&& !stageResult.consumedOnlyClause` to that guard's condition (the `***` belongs to the stage ONLY marker — mirroring the existing carve-out comment at `:341-346` for recognized stage restrictions, now extended to the some-stage consumed case). A NO-STAGE clause (`Rehearsal ONLY***`, `- LEAD***`) has `consumedOnlyClause = false`, so it retains `origin/main` behavior (its `***` still emits `UNKNOWN_DAY_RESTRICTION` — not a regression, since no `UNKNOWN_STAGE_RESTRICTION` is raised there to double it).

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

Consequence (audit #5): a one-edit typo in a short header — `TCEH` — silently vanishes the TECH grid; a `CRWE` typo instead trips the loud MI-3/4/5 hard fail. This part corrects the typo in a pre-pass so TECH parses AND, for CREW, pre-empts the cryptic MI hard-fail with a clean auto-correct + warning. (HOTEL/VENUE typos are also silent per the audit, but their header rows lack the field-header corroboration this gate needs — see §4.2 — so they are deferred to a per-router follow-up.)

### 4.2 New behavior

Add a `SHORT_SECTION_VOCAB` corrected behind gating STRICTER than the long-vocab path. The gates are: `minLen` + `exclude` (both real `gatedVocabCorrect` opts, `lib/parser/typoGate.ts:3-8`) + a **caller-side field-band gate** (`countFieldHeaderWords(otherCells) ≥ 1`, already at `sectionHeaderNormalize.ts:73`) + `noExactSpellingElsewhere` (caller, `:75-76`).

```ts
const SHORT_SECTION_VOCAB = ["CREW", "TECH"] as const;
```

Scoped to the two short routers whose REAL header rows in the corpus carry `SECTION_FIELD_HEADER_WORDS` so the field-band gate actually fires (adversarial-review R7 finding 2): `CREW | NAME | ROLE | PHONE …` (`NAME`/`ROLE`/`PHONE` are field-header words) and `TECH | PHONE | ARRIVAL | DEPARTURE` (`PHONE`). **`HOTEL` and `VENUE` are intentionally excluded**: their real header rows are `HOTEL | RESERVATION #1 | | RESERVATION #2` and (v1) `VENUE | Four Seasons …` — NO cell is a `SECTION_FIELD_HEADER_WORD`, so the field-band gate would NEVER fire and a `HOTLE`/`VENEU` typo would be silently left uncorrected. Shipping them in the vocab would be a hollow promise. They need a bespoke per-router corroboration (e.g. a `RESERVATION #`-shape or hotel/venue-value lookahead) that is out of scope here; filed as a backlog item. **`DATES` also excluded** (P4, region-less, DATE↔DATES delicacy, already-loud MI-3). (This narrows the informal "CREW/TECH/HOTEL/VENUE/DATES" list from the feature brief to the two routers the gate can actually serve; noted in the ship report + backlog.)

**Two-pass structure in `normalizeSectionHeaders`:** per row, try the existing LONG vocab first (unchanged gate: label-only OR ≥1 field word). If no long match, try `SHORT_SECTION_VOCAB` with the STRICTER gate below. Both write the SAME `SECTION_HEADER_AUTOCORRECTED` warning code (`:87`) — an EXISTING §12.4 code (`catalog.ts:1213`). No new code for Part C.

- **Field-band gate (caller-side, stricter for short):** a short-header correction fires ONLY when the candidate row carries ≥1 `SECTION_FIELD_HEADER_WORDS` in its other cells (`countFieldHeaderWords`, `knownSections.ts:241`) — the `labelOnly` branch that the long vocab allows is NOT accepted for short headers (short headers are collision-prone; require field-header corroboration). A bare mistyped `CRWE` with no field-header cells is left untouched (the existing MI hard-fail still catches genuinely-absent CREW).
- **`minLen: 4`** — `CREW`/`TECH` are 4 chars, so the established `minLen: 5` (field-alias fallback) would reject them. `minLen: 4` admits the four-char routers while still dropping ≤3-char noise magnets. Damerau-1 on a 4-char token is the tight edge; the field-band gate + `noExactSpellingElsewhere` + `EXCLUDE` are the compensating controls.
- **`EXCLUDE`** — the existing cross-vocab exclusion (`:26-31`) already includes every other `KNOWN_SECTION_HEADERS` member + `KNOWN_SUB_LABELS`, and `noExactSpellingElsewhere` prevents shadowing a real header. `TECH`↔`TEAM` is Damerau-2 (safe); `CREW`↔`CREWS` (`CREWS` in `KNOWN_SECTION_HEADERS`→`EXCLUDE`). `DATE`/`DAY`/`ROOM` sub-labels remain in `EXCLUDE` harmlessly.

**Region mapping:** extend `CANON_TO_REGION` (`:18-22`) with the two short headers, using the canonical `RegionId` values from `REGION_ANCHOR_SPEC` (`lib/sheet-links/buildSheetDeepLink.ts:61-123`): `CREW`→`crew`, `TECH`→`crew` (the `crew` region header is `/^(CREW|TECH)$/i`, `:76`). Both are valid `RegionId` union members (`REGION_IDS`, `:29-44`).

### 4.3 Guard conditions (Part C)

| Input | Behavior |
|-------|----------|
| Correctly-spelled `CREW` | `gatedVocabCorrect` returns `{corrected:false}` (exact-first, `typoGate.ts:23-25`) → unchanged (corpus guard: no-op on clean sheets) |
| `CRWE` in a `CREW \| NAME \| ROLE \| PHONE` row | corrected to `CREW` + `SECTION_HEADER_AUTOCORRECTED`, region `crew` |
| `TCEH` in a `TECH \| PHONE \| ARRIVAL \| DEPARTURE` row | corrected to `TECH` (PHONE is a field-header word), region `crew` |
| `CRWE` label-only, no field-header cells | field-band gate fails → NOT corrected (left for MI hard-fail) |
| `CREWS` (real plural header) | in `EXCLUDE` → never fuzzed to `CREW` |
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
3. **`lib/messages/catalog.ts`** — add the matching runtime row (dougFacing copy, followUp `Doug → fix sheet`, `helpHref: /help/errors#UNKNOWN_STAGE_RESTRICTION`, title, longExplanation, helpfulContext). Copy models the whole-show-fallback: e.g. dougFacing "_<crew-name>_'s role mixes a work-phase (like Set) with something we couldn't read (e.g. 'Set / Rehearsal ONLY'), so we can't tell which days apply. We're showing them the whole show to be safe. Use the standard phases — Load In / Set / Show / Strike / Load Out — so we can filter their schedule."
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
- **Corpus-wide rooms no-op (PRIMARY structural defense, R6 finding 1):** for EVERY fixture under `fixtures/shows/raw/`, assert `parseSheet(...).rooms` deep-equals a snapshot captured from `origin/main`. Catches ANY false-positive room across the whole corpus (e.g. the dimension-bearing equipment row `fixed-income:121`), not just east-coast. Failure mode: shape discovery fabricates or drops a room on any real sheet. (Assert against the parsed `rooms` data source, not a rendered container.)
- **Novel-venue recognition:** synthetic markdown with `| SALON ABCD |` and a `BO Setup` field row immediately beneath (+ a dims line in the header cell) → assert one breakout room `{name:'SALON ABCD', dimensions:"60' x 45'"}` appears (was dropped on `origin/main`). Failure mode: literal-only recognition.
- **Novel-venue recognition (no-dim, fields-beneath):** synthetic `| GRAND FOYER&#10;DAY 1 & 2 |` (NO dims token) followed immediately by a recognized room-field row (`BO Setup`) → assert the room is recognized via `hasRoomFieldEvidence`. Exercises the `MABEL 1&#10;DAY 1 & 2` merge shape. Failure mode: predicate can't see immediate fields.
- **Negative (equipment-with-dims is not a room, R6 finding 1):** a dimension-bearing asset row (`| 5' X 9' WIDESCREEN PROJECTION SCREEN W/ MOUNTING HARDWARE |`) followed by more asset rows (`DLP DATA PROJECTOR`, not a room field) → assert NO room is created (admitted via dims but dropped by the emit gate — no field-bearing block in its key-group). Failure mode: dims counted as content turns equipment into rooms.
- **Repeated-block dims survive (R7 finding 1):** synthetic `| SALON ABCD&#10;60' x 45' |` (dims-only, no immediate field) appearing BEFORE a later `| SALON ABCD&#10;DAY 1 & 2 |` + `BO Setup` row → assert ONE room `{name:'SALON ABCD', dimensions:"60' x 45'", setup:...}` (dims from the first block MERGED, room emitted because the second block is field-bearing). Failure mode: requiring immediate fields on every block drops the dims-only block and loses its dimensions.
- **Negative (terminator does not truncate, R2 finding 1):** a GS/BO block with an all-caps non-room row (`| SPECIAL NOTE |`, followed by more note text — NOT a room field) BEFORE later legitimate room-field rows → assert extraction does NOT stop at the note row and the later fields ARE captured on the room. Failure mode: name-shape-only terminator truncates the block silently.
- **Negative (discovery does not fabricate, R3 finding 2):** SAME fixture — assert NO room named `SPECIAL NOTE` is created (immediate next rows are note text, not fields). Failure mode: discovery fabricates a bogus room from a note.
- **Negative (uppercase field labels are not rooms, R4 finding 1):** a room block whose field labels are UPPERCASE — `| BO SETUP |` then `| BO SET TIME |`, `| AUDIO |` then `| VIDEO |` — → assert NO room named `BO SETUP` / `AUDIO` is created (`roomHeaderNameShape` item 3 rejects field labels). Failure mode: field-label rows fabricate rooms on uppercase-label sheets.
- **`roomHeaderNameShape` / `hasRoomFieldEvidence` / `isRoomHeaderShape` unit tables:** every §2.3 guard row, exercising the pure-shape and immediate-evidence functions separately.

### Part B
- **`parseStageClause` unit table:** every §3.2 decision-table row. Reordered subset (`Set / Strike ONLY`) → `[Set,Strike]`; `Set / Show ONLY` → `[Set,Show]`.
- **Regression:** the three original phrasings still produce identical `StageRestriction` (full-4, `[Load In,Set]`, `[Load Out,Strike]`).
- **No-cascade:** `Set / Strike ONLY` → `extractRoleFlags` produces ZERO `UNKNOWN_ROLE_TOKEN` (was 2 on `origin/main`). Failure mode: duplication not removed.
- **Structural invariant (class-closing, R1/R3/R5/R8):** direct unit — `UNKNOWN_STAGE_RESTRICTION` fires IFF `body` has ≥1 recognized stage token AND is not all-stages. Parameterized over all §3.2 decision rows.
- **No-stage role clause (R8 finding 1):** `RIGGER ONLY` → NO `UNKNOWN_STAGE_RESTRICTION`; `extractRoleFlags` emits `UNKNOWN_ROLE_TOKEN(RIGGER)`. `A1 / RIGGER ONLY` → role `A1` preserved + `UNKNOWN_ROLE_TOKEN(RIGGER)`, no stage warning. `Rehearsal ONLY` → `UNKNOWN_ROLE_TOKEN` (matches `origin/main`; no stage-word guess). Failure mode: a role-vocabulary gap misclassified as a stage restriction, dropping valid role flags.
- **Triple-asterisk single-signal (R7 finding 3):** `Set / Rehearsal ONLY***` (some-stage) → EXACTLY ONE `UNKNOWN_STAGE_RESTRICTION`, ZERO `UNKNOWN_DAY_RESTRICTION` (the `consumedOnlyClause` guard suppresses the triple-asterisk day warning). Controls: `- LEAD***` (no-stage, `consumedOnlyClause` false) still emits `UNKNOWN_DAY_RESTRICTION`; `Rehearsal ONLY***` (no-stage) behaves as `origin/main` (`UNKNOWN_ROLE_TOKEN` + `UNKNOWN_DAY_RESTRICTION`). Failure mode: a consumed `ONLY***` stage clause double-warns as a day restriction.
- **SHOW_CALLER collision (R1 finding 1):** `SHOW CALLER`, `SHOW CALLER ONLY`, `- SHOW CALLER` → `extractRoleFlags` yields role flag `SHOW_CALLER` (NOT stage `Show` + unknown `CALLER`); `extractStageRestriction` → `{kind:"none"}`, NO `UNKNOWN_STAGE_RESTRICTION`. Failure mode: full-segment-exact matching regressed to prefix-matching, cannibalizing the role.
- **Hyphenated role scopes preserved (R5 finding 1):** `BO - V1 ONLY`, `GS - A1 ONLY`, `BO - LEAD ONLY` → `extractStageRestriction` `{kind:"none"}` with NO `UNKNOWN_STAGE_RESTRICTION`, AND `extractRoleFlags` yields the roles (`BO`+`V1`, `GS`+`A1`, `BO`+`LEAD`) + `ONLY`. Failure mode: `/`-only classification misreads a hyphen-scoped role as an unknown stage restriction and strips the role flags.
- **Anchor resolution (R5 finding 2):** a crew row producing `UNKNOWN_STAGE_RESTRICTION` → `resolveWarningSourceCells` resolves it by `blockRef.name` to the role cell (a non-null `sourceCell`) on both the sync and onboarding anchor paths. Failure mode: added to the actionable set but no resolver branch → link-less actionable row.
- **No-ONLY subset preserves signal (R2 finding 2):** `Set / Strike` (no ONLY) → `extractStageRestriction` `{kind:"none"}` with NO warning, AND `extractRoleFlags` emits `UNKNOWN_ROLE_TOKEN` (identical to `origin/main`). `Load In / Set / Strike / Load Out - LEAD` (full, no ONLY) → role `LEAD`, no restriction, no unknown token. Failure mode: silent strip drops the existing unknown-token signal.
- **Mixed ONLY-clause never partially narrows (R3 finding 1):** `Set / Rehearsal ONLY`, `Set / Sho ONLY`, `Load In / Rehearsal ONLY - LEAD` → `extractStageRestriction` returns `{kind:"none"}` + exactly one `UNKNOWN_STAGE_RESTRICTION` (NOT explicit `[Set]`/`[Load In]`); assert stages is empty and the crew member is NOT narrowed to the recognized prefix. For the `- LEAD` tail case, assert `extractRoleFlags` still yields role `LEAD` (post-ONLY tail preserved). Failure mode: recognized-prefix consumption emits a partial explicit restriction that silently hides valid days.
- **End-to-end filter:** `stage-filtered-schedule` — a crew row `Set / Show ONLY` folds to a `date_restriction` covering exactly Set + Show days (derive the expected day set from the fixture's `dates`/`schedule_phases`, not a literal). Failure mode: Show not intersecting.
- **Existing `tests/…stage-filtered-schedule` + `personalization` + `crew` suites** stay green.

### Part C
- **Correction:** `CRWE` in a `CREW | NAME | ROLE | PHONE`-shape row → corrected to `CREW` + `SECTION_HEADER_AUTOCORRECTED`, region `crew`. `TCEH` in a `TECH | PHONE | ARRIVAL | DEPARTURE`-shape row → `TECH`, region `crew`.
- **Gate:** `CRWE` label-only (no field-header cells) → NOT corrected (field-band gate).
- **Plural non-shadow:** `CREWS` → NEVER corrected to `CREW` (EXCLUDE).
- **No-shadow:** a mistyped `CRWE` with a correctly-spelled `CREW` elsewhere in the doc → NOT corrected.
- **Out-of-scope routers stay untouched:** `HOTLE | RESERVATION #1 | | RESERVATION #2` and `VENEU | Four Seasons …` → NOT corrected (no field-header word; deferred — documents the R7 f2 boundary).
- **Corpus no-op:** every committed clean fixture → `normalizeSectionHeaders` produces zero short-header corrections (no false positives on real sheets).

---

## 9. Disagreement-loop preempts (for the adversarial reviewer)

- **Fail-open posture on unreadable clauses is intentional.** A some-stage clause (`Set / Rehearsal ONLY`) → whole-show + `UNKNOWN_STAGE_RESTRICTION`; a no-stage clause (`Rehearsal ONLY`) → whole-show + `UNKNOWN_ROLE_TOKEN` (role clause). Both are whole-show + warning (NOT zero-days, NOT hard-fail), mirroring the existing `unknown_asterisk` fallback (`crew.ts:347-362`) and safer than hiding a show. Cited: §1 out-of-scope (Rehearsal) + the `effectiveViewerDateRestriction` zero-days trap (`stageSchedule.ts:66`). **Stage-token presence is the sole stage-vs-role discriminator — no stage-word heuristic (see §3.2 structural invariant); do not relitigate.**
- **Shape-recognized rooms are NOT signaled.** Deliberate (brainstorming chose "replace", declined "always-signal"). A newly-recognized room is visible on the review surface by its presence. §1 out-of-scope.
- **`minLen: 4` for the short vocab** (vs the established `minLen: 5` for field-alias fallback) is deliberate — `CREW`/`TECH` are 4 chars. The caller-side field-band corroboration (`countFieldHeaderWords ≥ 1`, `:73`) + `noExactSpellingElsewhere` + `EXCLUDE` are the compensating gates. Cited: typo-tolerance design §4.3 deferred these *behind the field-band gate*, which is exactly this gate. **Part C vocab is CREW/TECH only** — HOTEL/VENUE header rows carry no `SECTION_FIELD_HEADER_WORD` so the field-band gate can never fire for them (R7 f2); shipping them would be a hollow promise, so they are deferred to a per-router follow-up. `DATES` also excluded (P4, region-less, already-loud MI-3). See §4.2.
- **Room de-literalization is an admit-then-emit split, not a single predicate.** dims-only blocks are ADMITTED (to preserve dims via merge — R7 f1) but a room is EMITTED only when its key-group has a field-bearing block (so equipment with dims is dropped — R6 f1). `dimsInHeader` in the emit gate would reintroduce the equipment false-positive; the emit gate is field-evidence, not `roomHasContent` (which counts dims). Do not relitigate.
- **The `consumedOnlyClause` flag on `extractStageRestriction`** exists solely to suppress the pre-existing `crew.ts` triple-asterisk `UNKNOWN_DAY_RESTRICTION` when an `ONLY***` stage clause already consumed the marker (R7 f3) — it is not a new restriction concept.
- **`STAGE_VOCAB` (typo vocab, `:174`) stays 4-wide; `STAGE_RESTRICTION_VOCAB` (grammar, new) is 5-wide.** Two different vocabularies for two different jobs (spelling correction vs clause recognition). Not a contradiction.
- **Corpus-wide rooms no-op is the room contract**, not "looks right." De-literalization must be deep-equal to `origin/main` `rooms` on ALL committed fixtures; a bogus room anywhere fails. Discovery/terminator gate is name-shape + immediate-field-evidence (dims-alone rejected — R6). This whole-corpus regression is the structural defense that closed the three-round false-positive vector; do not relitigate the dims-alone branch.

## 10. Self-consistency / numeric sweep

- Stage counts: `STAGE_RESTRICTION_VOCAB` = **5** (Load In, Set, Show, Strike, Load Out). `STAGE_VOCAB` (typo) = **4** (no Show) — intentional, §3.3.
- `SHORT_SECTION_VOCAB` = **2** (CREW, TECH — HOTEL/VENUE deferred per §4.2 R7 f2, DATES excluded per §4.2). `LONG_SECTION_VOCAB` = **3** (unchanged).
- New §12.4 codes = **1** (`UNKNOWN_STAGE_RESTRICTION`). New room codes = **0**. New Part-C codes = **0** (reuses `SECTION_HEADER_AUTOCORRECTED`).
- Rooms.ts literal sites de-literalized = **3** (`:687`, `:825`, `:880-881`).
- Stage-restriction hardcoded patterns removed = **3** (replaced by 1 `parseStageClause`).
```
