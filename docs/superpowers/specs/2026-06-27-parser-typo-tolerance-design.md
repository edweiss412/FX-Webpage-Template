# Comprehensive parser typo-tolerance — design

**Date:** 2026-06-27
**Status:** spec (autonomous-ship; user approved P1+P2 scope, autocorrect+warn posture, 4 codes by family, 2 sequential PRs)
**Origin:** post-#156 follow-up; the owner directive is "typos happen, we should be prepared for them in sheets, including typos beyond the ones existing in the example sheets." Builds on the `fuzzyMatch` helper shipped in #155 and the #154/#155 deep-link plumbing.

All file:line citations below were grep-verified against the merged tree (`origin/main` @ `a05485ab`) before drafting.

---

## 1. Goal & scope

Make the parser tolerant of plausible single-edit typos in its **closed vocabularies** — without ever over-correcting a real/intentional token. A misspelled section header, column header, multi-word role, or field label should be auto-corrected (and surfaced as a deep-linked warning) instead of silently dropping a whole section / column / row / field.

**The 59 closed-vocab match sites collapse into 6 families.** This spec covers **P0 (shared gate infra) + P1 (safe surfaces) + P2 (field-alias chokepoint)**, delivered as two sequential PRs:

- **PR-A = P0 + P1** — the shared gate utility, the vocab/exclusion registry, the CI collision meta-test, the generator-driven test harness, and the safe (long-token / no-collision) fuzz surfaces.
- **PR-B = P2** — wire an opt-in fuzzy fallback into the field-alias resolver (venue first), then re-route the hand-maintained local alias maps through it.

**Out of scope (deferred to later PRs, NOT this spec):** P3 (short section routers CREW/TECH/HOTEL/VENUE behind the field-band gate; long single-word role codes; `ONLY` restriction markers) and P4 (`DATES` router's `DATE↔DATES` collision; rooms multiword-suffix headers; pull-sheet header; terminator consolidation). **Never-fuzz** surfaces are enumerated in §8.

The testing philosophy — generate typos *from* each vocabulary rather than from fixtures — is the heart of "typos beyond the example sheets" (§7).

---

## 2. The shared gate (P0)

One parameterized confidence-gate utility, built on the existing `closedVocabMatch` (`lib/parser/fuzzyMatch.ts:41`, which already does exact-first at `:47` and Damerau distance with adjacent-transposition = 1 at `:28-30`).

New helper `lib/parser/typoGate.ts` exporting `gatedVocabCorrect(token, vocabEntry, opts)`:

**Universal invariants (every fuzzable surface):**
1. **Exact-first.** Never fuzz a token that exactly equals any member of the target vocab (`closedVocabMatch` returns `{exact:true}` → return as-is, no correction, no warning).
2. **maxDistance = 1** (Damerau OSA — a single deletion / insertion / substitution / adjacent transposition).
3. **Cross-vocab exclusion.** Reject a non-exact correction if the raw token is an exact member of a *different* registered vocab (the #155 role-exclusion class, generalized). The exclusion set per surface is declared in the registry (§3) and always includes `KNOWN_SUB_LABELS` (`knownSections.ts:91`: `DATE`/`DAY`/`ROOM`), `ROLE_NORMALIZATIONS` (`personalization.ts:16`), and the version/sentinel/terminator sets relevant to that surface.
4. **Always warn.** A non-exact correction emits a warn-severity, deep-linked warning (never a silent re-route) — mirroring `STAGE_WORD_AUTOCORRECTED` (`crew.ts:274`).

**Per-family options (passed via `opts`):**
- `fieldBand?: number` — require the candidate row to carry ≥N `SECTION_FIELD_HEADER_WORDS` (reuse `countFieldHeaderWords`, `knownSections.ts:236`). Used by section routers (P3; long P1 routers may set it to 0 since they're distinctive).
- `minLen?: number` — reject tokens shorter than N (drops noise magnets like `GS`/`SET`/`LED`). Field-alias fallback uses `minLen: 5`.
- `tieAbort?: boolean` — if ≥2 candidates tie at the min distance, return no correction (field-alias requires this; the stage-word caller does not). `closedVocabMatch` currently breaks ties by vocab order; the gate adds a tie-detection wrapper (count candidates at `bestDist`).
- `scopePrefix?: string` — restrict candidates to those whose canonical starts with a prefix (field-alias in-block scope, e.g. `venue.`).
- `noExactSpellingElsewhere?: (token) => boolean` — for section routers, reject if an exact spelling of the corrected header exists elsewhere in the doc (so a real `CREW` header isn't shadowed by a fuzzy one). P3; not used in P1.

The **block-exit/terminator decision stays conservative**: a fuzzy-ambiguous label is treated as *in-block*, never as a terminator (a wrong terminator truncates the roster/schedule — the catastrophic direction). PR-A does not touch terminators (deferred to P4 consolidation).

---

## 3. Vocab + exclusion registry + collision meta-test (P0)

A single registry `lib/parser/typoVocabRegistry.ts` lists every fuzzable vocab with: its members (or a reference), its surface, its warn code, and its cross-vocab exclusion set. This is the structural-defense anchor.

The registry holds **two classes** of vocab: `fuzzable` (gets a fuzzy pass) and `excluded` (the cross-vocab exclusion + do-not-fuzz sets — short role codes, version markers, `KNOWN_SUB_LABELS`, sentinels, terminators). Both classes are registered so the meta-test and the gate's exclusion check read from one source.

**CI collision meta-test** (`tests/parser/typoVocabCollision.test.ts`): for every registered **fuzzable** vocab `V` and every accepted-under-gate member `m` of `V`, assert that **no member of any *other* registered vocab — fuzzable OR excluded/do-not-fuzz — sits within Damerau-1 of `m`** (subject to that surface's gate, e.g. `minLen`). This is strictly broader than "other fuzzable vocabs": it catches a dense exclusion neighborhood (e.g. the short role codes `A1/A2/V1/L1/LED`, or sentinels `TBD/TBA`) drifting within distance-1 of a fuzzable member. It fails at CI time if a future vocab edit introduces any distance-1 cross-collision. This is the M5/M12 structural-defense pattern applied pre-emptively.

The registry is the single source the meta-test, the gate's exclusion check, and the generator tests (§7) all walk — no hand-maintained parallel list.

---

## 4. P1 surfaces (PR-A) — safe, autocorrect + warn

Each is a new fuzzy pass placed *after* the existing exact match and *before* the drop/unknown path. All are long-token or no-intra-collision, so they need no field-band corroboration.

### 4.1 Multi-word role phrases → `ROLE_TOKEN_AUTOCORRECTED`
- **Vocab:** `MULTI_WORD_TOKENS` (`personalization.ts:43`: `CONTENT CREATION`, `SHOW CALLER`, `GREEN ROOM`, `CAM OP`). Pairwise distance ≫2.
- **Site:** `extractRoleFlags` (`personalization.ts:261`), the MWT loop at `:303-310` (consumed before the per-token canonicalization at `:323`). A multi-word typo (`CONTENT CRETION`) survives the `/`-`-` split as one space-containing token.
- **Gate:** universal only (no `minLen`/`fieldBand`); exclusion = `ROLE_NORMALIZATIONS` (never fuzz a real short code into a phrase, and vice-versa). Short single-word role codes (`A1`/`V1`/`LED`…) are **NOT** fuzzed here (do-not-fuzz §8) — they remain the `UNKNOWN_ROLE_TOKEN` path.
- **Warning:** stamped with the crew `blockRef` (like `STAGE_WORD_AUTOCORRECTED`) so it deep-links to the role cell.

### 4.2 Crew column headers → `COLUMN_HEADER_AUTOCORRECTED`
- **Vocab:** `{NAME, ROLE, PHONE, EMAIL}` — the `===` matches in `detectColumns` (`crew.ts:80-83`). Pairwise Damerau ≥3 (no intra-collision). `EMAIL`'s default `-1` drops every crew email on a header like `E-MAIL` — highest-value/lowest-risk fix.
- **Site:** `detectColumns` (`crew.ts:70`). The row is already a confirmed CREW/TECH header, so no field-band needed; per-segment fuzz after the exact pass fails.
- **Also:** `detectPassengersColIdx` (`transport.ts:477`) `{PASSENGERS}` — long, distinctive. `FLIGHT` stays a substring test (do not fuzz a 6-char substring).
- **Gate:** universal; exclusion = the other column labels + `KNOWN_SUB_LABELS`. Warning anchors to the header cell (region-level if exact A1 unavailable — reuse the #156 region-anchor pattern).

### 4.3 Long section routers → `SECTION_HEADER_AUTOCORRECTED`
- **Vocab (P1 subset — long/distinctive only):** `TRANSPORTATION` (`transport.ts` header regexes) and `EVENT DETAILS`/`GS DETAILS` (`event.ts` header). 14-char `TRANSPORTATION` has no near-neighbor in any FXAV vocab; `EVENT DETAILS` fuzzes the **2-word phrase only** (never bare `DETAILS`).
- **Gate:** universal + `fieldBand: 0` for these distinctive long phrases (the long, multi-word token IS the safety — neither has a distance-1 real-word/plural neighbor); exclusion = `KNOWN_SECTION_HEADERS` other members + `KNOWN_SUB_LABELS`. The collision meta-test (§3) pins that no excluded member sits within distance-1 of `TRANSPORTATION`/`EVENT DETAILS`.
- **NOT in P1 (deferred):** the short routers (`CREW/TECH/HOTEL/VENUE`, 4-6 chars) need the `fieldBand: 2` corroboration → **P3**. **Agenda weekday names are also deferred** (out of PR-A): full names like `SUNDAY/MONDAY` have distance-1 real-word/plural neighbors (`SUNDAE→SUNDAY`, `MONDAYS→MONDAY`) that occur in free-text agenda cells, so `fieldBand: 0` is unsafe for them — they need a day-banner-position context gate, designed in a later phase.
- **Warning:** the `blockRef` + deep-link anchor disambiguates which section; the message names the corrected header.

**Do NOT touch in P1:** `isKnownSectionHeader` (`knownSections.ts:173`) stays exact — it is the *alarm* guard that fires `UNKNOWN_SECTION_HEADER`; fuzzing it would silence the dropped-section alarm (§8).

---

## 5. P2 — field-alias fuzzy chokepoint (PR-B)

The single highest-leverage structural fix: one fuzzy fallback, inherited by every block that resolves field labels.

### 5.1 The opt-in SCOPED fuzzy resolver
The existing `resolveAlias` (`aliases.ts:162`) / `resolveAliasFull` (`aliases.ts:173`) are **GLOBAL and unscoped** — `REVERSE_MAP` is one flat alias→canonical map across all blocks, so an exact hit can return *another block's* canonical (e.g. an exact `PHONE`/`EMAIL` resolving to `crew.phone` from a contact block). Today that's masked because each block RE-DECLARES its own local vocab. So re-routing a block through the *unscoped* resolver would **regress block scoping on the EXACT path**, not just the fuzzy one. Therefore the new resolver is **scoped on both paths**:

- `resolveAlias` / `resolveAliasFull` stay **exact AND global, UNCHANGED** (they honor the `TYPO_ALIASES` allowlist at `:138` → info `TYPO_NORMALIZED`; `detectVersion` (`schema.ts:107`) and the venue valCanon guard depend on this).
- Add `resolveAliasScoped(label, scopePrefix)` — resolves ONLY to canonicals starting with `scopePrefix` (e.g. `venue.`), in two steps: (1) **exact-in-scope**: if `REVERSE_MAP.get(label)` is in-scope, return it; if it's an exact alias but OUT of scope, return null (this is NOT this block's field — never silently borrow another block's canonical) — this closes HIGH-1/MEDIUM-1. (2) **fuzzy-in-scope fallback** via `gatedVocabCorrect` over only the in-scope `REVERSE_MAP` keys with the field-alias gate: `minLen: 5`, `tieAbort: true`, exclusion of `VERSIONS.requires` canonicals + `KNOWN_SUB_LABELS` + any token that is an exact member of ANY `REVERSE_MAP` alias (even out-of-scope: an exact alias is never fuzzed). Returns `{canonical, corrected: boolean}` — `corrected:true` only on a gated non-exact in-scope hit, `corrected:false` on an exact-in-scope hit, `null` otherwise.

### 5.2 Venue first (avoids the visibility downgrade)
- venue (`venue.ts:100`) resolves `col0` via `resolveAliasFull`; an unrecognized label today fires **`UNKNOWN_FIELD`** (warn, deep-linked since #156). Insert `resolveAliasScoped(col0, "venue.")` before the `UNKNOWN_FIELD` emission: on a `corrected:true` hit, recover the field AND emit **`FIELD_LABEL_AUTOCORRECTED`** (warn, deep-linked) — preserving venue's current operator visibility (NOT a downgrade to silent info). On `corrected:false` (exact-in-scope) or null, behavior is unchanged from today.

### 5.3 Re-route the local parallels (add a SCOPED fuzzy fallback, do NOT collapse into the global map)
These blocks RE-DECLARE field-alias vocab locally; give each a **scoped** fuzzy fallback so they inherit the one gate while keeping their own vocab/semantics — they do NOT route through the *unscoped* global `resolveAlias`. Concretely: each block keeps its exact local resolution, and on a local miss calls `resolveAliasScoped(label, "<block>.")` (or a fuzzy pass over its own local vocab via `gatedVocabCorrect`) before dropping the field. Surfaces: ops (`ops.ts:29-33`), rooms V4 bare labels + dispatchers (`rooms.ts:183-196`, `:352-365`), transport `V2_SCHEDULE_LABELS` + vehicle (`transport.ts:93-103`), client contact dispatch (`client.ts:58-99`), dates v1 labels (`dates.ts:137`), event `CANONICAL_KEY_MAP` (`event.ts:59-98`), diagrams (`diagrams.ts:22`). Each emits `FIELD_LABEL_AUTOCORRECTED` (warn) on a gated fuzzy recovery. **The exact path for each block stays scoped to that block's own vocab — no block ever resolves a label to a different block's canonical** (the structural fix for HIGH-1).

**Exclusions (stay exact, never fuzzed):** `detectVersion`'s `resolveAlias` (`schema.ts:107`), the venue valCanon value-guard, `TYPO_ALIASES` (the fixed allowlist). `VERSIONS.requires` canonicals are excluded from every fuzzy candidate set so a typo never flips v2/v4 detection (whole-sheet mis-route, §8).

---

## 6. Warning codes (4 families)

PR-A mints 3, PR-B mints 1. Each follows the documented #155 **6-surface lockstep**: catalog.ts row + master-spec §12.4 prose + `pnpm gen:spec-codes` + `OPERATOR_ACTIONABLE_ANCHORED` (`dataGaps.ts:122`) + `app/help/errors/_families.ts` prefix map + the /help page. All are **warn**, **deep-linked** (in `OPERATOR_ACTIONABLE_ANCHORED`), modeled on `STAGE_WORD_AUTOCORRECTED` (`catalog.ts`), copy styled "we read _<wrong>_ as _<right>_ … if intentional, fix the sheet."

| Code | PR | Surface | blockRef / anchor |
|------|----|---------|--------------------|
| `ROLE_TOKEN_AUTOCORRECTED` | A | multi-word role phrase | crew `blockRef.name` → role cell |
| `COLUMN_HEADER_AUTOCORRECTED` | A | crew/passenger column header | header cell / region |
| `SECTION_HEADER_AUTOCORRECTED` | A | TRANSPORTATION / EVENT DETAILS router | section region |
| `FIELD_LABEL_AUTOCORRECTED` | B | fuzzy field-alias recovery (ANY block) | field cell / block region |

**`FIELD_LABEL_AUTOCORRECTED` is block-generic** (LOW finding): it fires for venue AND every re-routed block (§5.3), so its catalog copy + `/help` family must read generically ("we read a field label _<wrong>_ as _<right>_") — NOT venue-specific — or non-venue field warnings look misclassified. The `blockRef`/anchor names the actual block.

**Prefix-map note (the #155 CI-only trap):** the new prefixes `ROLE`, `COLUMN`, `SECTION`, `FIELD` must be mapped in `app/help/errors/_families.ts` or `tests/help/errors-grouping.test.tsx` (shard 2) orphan-guard fails CI-only. Recommended: `ROLE`→crew-schedule, `COLUMN`→crew-schedule, `SECTION`→syncing-sheets, `FIELD`→syncing-sheets (the parsing/reading family). Run the FULL `pnpm vitest run` before each push.

The existing info `TYPO_NORMALIZED` (`catalog.ts`, info, not deep-linked) is UNCHANGED — it stays the channel for the `TYPO_ALIASES` known-typo allowlist confirmations.

---

## 7. Testing strategy (the "beyond example sheets" core)

Per fuzzable vocab `V` (walked from the §3 registry), a **generator-driven property test** + collision tripwire, NOT example-sheet-driven:

1. **Positive (typos beyond examples).** For each canonical member `m` of `V`, programmatically generate every single-edit neighbor — one deletion, one insertion (each position × a small alphabet), one substitution, every adjacent transposition. **Then filter the generated set to the UNAMBIGUOUS, gate-passing neighbors** before asserting — a neighbor is dropped from the positive set if it (a) exactly equals another member of `V` or any registered vocab, (b) sits at distance 1 from a *second* `V` member (a tie the gate aborts), or (c) is shorter than the surface's `minLen`. This carveout is mandatory: the gate intentionally rejects ties/excluded/too-short neighbors, so asserting "every raw neighbor corrects" would contradict the safety gate. With the surface's CONTEXT satisfied (confirmed CREW/TECH header row for columns; the in-scope block for field-alias; for the P1 routers TRANSPORTATION/EVENT DETAILS the context is `fieldBand: 0` so only a header-position cell is needed, NOT a field-band row), assert each *surviving* generated typo corrects back to `m`. Proves tolerance of typos absent from `fixtures/shows/*`.
2. **Negative over-correction (load-bearing).** (a) every exact member returns `exact:true`, never rewritten; (b) every member of each EXCLUDED vocab is never fuzzed into `V` — concrete: `DATE`/`DAY`/`ROOM` never → a section/sub-label; `A2`↛`A1`, `V1`↛`L1`, `LED`↛`LEAD`, `LAV`↛`GAV`, `TBA`↛ a sentinel; a venue typo never resolves to a transport/rooms canonical; (c) **tie-abort** — a token at distance 1 from TWO members aborts on the field-alias path; (d) **context-absence** — a near-miss without corroboration (lone `CREWW` with no field-band; `ONY` with no adjacent date) is NOT corrected.
3. **Anti-tautology mutation** (per the negative-regression rule): mutate the gate to a no-op (drop the cross-vocab exclusion, or widen maxDistance to 2) and assert the §7.2 over-correction tests now FAIL. A green over-correction test against an un-mutated impl proves nothing.
4. **Structural collision meta-test** (§3) — CI tripwire over the whole registry.
5. **Whole-pipeline / anti-self-satisfying** — assert against the parse RESULT data source (parsed roster / hotel / schedule / `markdownVariables`), not the container that renders both the warning and the recovered data.

Every new test task states the concrete failure mode it catches (e.g. "`E-MAIL` header drops all crew emails"; "`A2` fuzzed to `A1` mis-assigns an audio role").

---

## 8. Guard conditions, do-not-fuzz list, risks

**Guard conditions (every gate path):** empty/whitespace token → no correction. Token exactly matches the target vocab → exact, no warning. Token exactly matches an excluded vocab → no correction (cross-vocab exclusion). Tie at min distance on the field-alias path → abort. Field-band required but absent → no correction. No region/cell anchor resolvable → warning still emits, just without a deep link (graceful degrade, the #154/#156 pattern).

**DO-NOT-FUZZ (fuzzing is net-negative or unsafe — never in any phase):**
- `isKnownSectionHeader` (`knownSections.ts:173`) — the *alarm* guard; fuzzing silences `UNKNOWN_SECTION_HEADER`.
- Short role codes `A1/A2/V1/L1/GS/BO/PTZ/LED/GAV` (`personalization.ts:323`) — dense distance-1 peers; **`LED↔LEAD` is security-relevant** (`LEAD` gates Financials/`shows_internal`). Keep `UNKNOWN_ROLE_TOKEN`.
- `detectVersion`/`VERSIONS` (`schema.ts`) — a fuzzy version flip mis-routes every block. Stays exact.
- venue valCanon value-guard, `normalizeStageWords` role-exclusion (`personalization.ts:209`) — negative/guard sites; fuzzing inverts their meaning.
- `TYPO_ALIASES` (`aliases.ts:138`) — fixed allowlist; fuzz lives in the fallback.
- `detectDateColIdx {DATE}` (`transport.ts:463`) — 4-char scanned over ALL cells (`GATE`/`LATE`/`DATA` collisions).
- sentinels: `ADMIN_PLACEHOLDER_VALUES` (`ops.ts`), travelFlights sentinels, `NAME_STOP_TOKENS` (`contacts.ts`) — intra-vocab distance-1 pairs (`TBD↔TBA`, `-↔—`) and the failure direction drops a real value/surname.
- ALL format surfaces — `normalizeDate` (`_helpers.ts:96`), `DATE_TOKEN`, `CLOCK_RE`, dash classes, `TRIPLE_ASTERISK` — a date/time/dash/star-count is not a word; Damerau is meaningless. Separate regex-robustness effort (deferred, §9 of the stage-word design).
- block-entry header regexes for transport (the EMAIL-required v4/v2 disambiguation) — a loose match routes the wrong column shape.

**Top risks → mitigations:** cross-vocab over-correction → exact-first + exclusion set + `minLen≥5` + do-not-fuzz dense neighborhoods + in-block scope + tie-abort + the CI collision meta-test. Whole-sheet mis-route → `detectVersion` exact + version-canonicals excluded. Guard inversion → the three guard sites are do-not-fuzz. Terminator over-correction cuts a block → terminators stay conservative/exact (P4 consolidation). Silent corrections → header/column/role/field-label all warn+deep-link. New-code CI-only failure → the 6-surface checklist + full `pnpm vitest run`. Short-token false positives → distance is never the sole gate for <5-char tokens; field-band/adjacency is load-bearing (these are all P3, not PR-A).

---

## 9. Phasing & PR boundaries

- **PR-A (P0 + P1):** `typoGate.ts` + `typoVocabRegistry.ts` + collision meta-test + generator harness; multi-word roles, crew/passenger columns, TRANSPORTATION/EVENT DETAILS routers; 3 new codes (`ROLE_TOKEN_`, `COLUMN_HEADER_`, `SECTION_HEADER_AUTOCORRECTED`). Pure parser; no DB/lock/UI.
- **PR-B (P2):** `resolveAliasFuzzy` wired into venue, then the local-parallel re-routing; 1 new code (`FIELD_LABEL_AUTOCORRECTED`). Pure parser.
- **Deferred (later, not this spec):** P3 short routers (CREW/TECH/HOTEL/VENUE behind `fieldBand: 2`) + long single-word role codes + `ONLY` markers (`DAY_RESTRICTION_MARKER_AUTOCORRECTED`) + **agenda weekday day-names** (need a day-banner-position context gate, §4.3); P4 `DATES` router, rooms suffix headers, pull-sheet header, terminator consolidation. Format/date/`***`-count robustness is a separate non-fuzzy effort.

---

## 10. Invariants, meta-tests, watchpoints

- **Meta-test inventory:** CREATES `tests/parser/typoVocabCollision.test.ts` (the registry collision tripwire). EXTENDS the `OPERATOR_ACTIONABLE_ANCHORED` membership pin-tests (`tests/parser/operatorActionableWarnings.test.ts` + `tests/drive/showDayTimeAnchors.test.ts`) by +3 (PR-A) then +1 (PR-B). No Supabase boundary, no advisory lock (`tests/auth/advisoryLockRpcDeadlock.test.ts` untouched), no UI component (invariant 8 N/A — `app/help/errors/_families.ts` prefix-map edits author no visual surface, per #155).
- **§12.4 lockstep** per new code (the 3-part: master-spec prose + `gen:spec-codes` + `catalog.ts`); NEVER prettier the master spec.
- **Watchpoints / do-not-relitigate:** the do-not-fuzz list (§8) is deliberate — short role codes, version detection, guard sites, sentinels, and all format surfaces are intentionally exact; `resolveAlias` stays exact (fuzz is a separate opt-in `resolveAliasFuzzy`); `TYPO_NORMALIZED` stays info for the known-typo allowlist; field-alias path uses tie-abort (unlike the stage-word path). The generator tests + collision meta-test are the structural guarantee that the exclusions hold.
