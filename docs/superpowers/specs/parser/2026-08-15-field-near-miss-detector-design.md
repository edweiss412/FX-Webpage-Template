# Field near-miss detector — design

**Status:** Ready for adversarial review
**Date:** 2026-08-15
**Branch:** `feat/mutation-section-order` (continues `BL-MUTATION-SECTION-ORDER`; supersedes wave-plan branch-5 Tasks 3–4)
**Evidence base:** `docs/superpowers/plans/2026-08-08-parser-mutation-wave/05-section-order-parity-probe.md` (joint-unsatisfiability probe), `docs/superpowers/specs/parser/probes/2026-08-15-unknown-field-narrowing-audit.md` (394-emission audit; probe script alongside), `docs/superpowers/specs/parser/probes/2026-08-15-near-miss-calibration.md` (rule calibration — copied into §3 here).

## 1. Problem

`UNKNOWN_FIELD` is emitted today by a positional sweep inside `parseVenue`: a scope window opens at the first recognized venue field and closes at the first `VENUE_BLOCK_TERMINATORS` row (`lib/parser/blocks/venue.ts`, `inVenueFieldScope`; emission via `emitUnknownField`, `lib/parser/warnings.ts:351`). The parity probe proved the window is a positional artifact: spec §7.2(a) (emission parity) and §7.2(b) (swap invariance) are jointly unsatisfiable, and the honest position-free sweep costs +4,291 emissions (12×).

The 394-emission audit settled what the signal actually is:

- **0 of 394** emissions sit in the venue block proper — every fixture's venue block is clean.
- **~380 of 394** are junk swept from neighbor blocks: crew rosters, gear pull-sheets, agenda tables, a Google-Forms echo, xlsx artifacts.
- **~14 of 394** are genuine near-misses of KNOWN field labels — none of them venue fields: the 8-row colon-suffixed client-contact group (`Phone:`, `E-mail:`, `Cell Phone:`, `Address:`, …), `Stage`/`Storage` vs `event.stage_size`/`event.equipment_storage`, and the 2-row `ADDITIONAL ROOM` header defeated by HTML-entity newlines.

The product that was accidentally being delivered is therefore a **label-similarity near-miss detector**, and position was never the right key. This spec replaces the positional sweep with that detector, keyed on content alone.

## 1.1 Resolved scope — do not relitigate

1. **Coverage-audit product is dead.** Telling Doug which sheet sections are intentionally ignored reports the system working as designed and reads as a broken parser. User-ratified 2026-08-15 (session record; probe: dark blocks are office-side working data). No whole-document "unrecognized section" widening ships.
2. **Quieting is ratified.** Corpus emissions go 394 → the 72-row calibrated baseline (§3.2). The wave spec's §7.2(a) parity constraint is superseded by this spec: the new baseline is the calibrated multiset, regenerated deliberately. User-ratified 2026-08-15 after reviewing the audit.
3. **The `UNKNOWN_FIELD` code is kept**, not replaced: same §12.4 row identity, same gap class (`lib/parser/dataGaps.ts:38`), same actionable-anchor membership (`dataGaps.ts:414`), same help-family routing (prefix `"UNKNOWN"`, `app/help/errors/_families.ts:82`). Copy updates to near-miss framing (§5). No new warn code, no enum churn, warning-fingerprint continuity preserved.
4. **No edit-distance fuzzing in v1.** The corpus contains zero letter-typo instances (audit judgment table). Deterministic normalization + token-subset only; edit distance is a documented extension (§9), admissible later only with a live instance.
5. **Wave-plan branch-5 Tasks 3–4 are superseded** by this spec's task set; Tasks 1–2 (parity pin, swap-invariance RED tests) are kept and repurposed (§8). Recorded as a ratified amendment in the wave overview (`docs/superpowers/plans/2026-08-08-parser-mutation-wave/00-overview.md`).
6. **`UNKNOWN_SECTION_HEADER` is out of scope.** The section-level near-miss gate (`lib/parser/index.ts:731-759`, `emitUnknownSection` at `index.ts:758`) ships unchanged. Its strictness is correct under the near-miss framing: blocks that don't look like sections ("Pending", "Timestamp") SHOULD evade it.
7. **Threat model.** The detector defends against accidental authoring mistakes by sheet editors (typos, punctuation variants, encoding artifacts). Adversarial obfuscation is out of scope and files to documented limits.
8. **Consequence bound.** Every input row is either parsed by a block parser, flagged as a near-miss, or silently ignored as not-field-shaped — and "silently ignored" is the DESIGNED outcome for office-side content, not a defect. A hypothetical escaping input is a finding only with a probe showing a near-miss of a real field going silent; conservative silence on junk is the intent.

## 2. Mechanism

### 2.1 What is removed

- `parseVenue`'s scope window: the `inVenueFieldScope` flag, the `VENUE_BLOCK_TERMINATORS` scope-close behavior for unknown-field purposes, and the `emitUnknownField` call inside `parseVenue` — all in `lib/parser/blocks/venue.ts`, anchored by those three symbols (line locators rot; the symbols are unique in the file). `parseVenue` keeps parsing venue FIELDS exactly as today; venue payload tests (`tests/parser/blocks/venue.test.ts`) stay green unchanged.
- `parseEvent`'s fallback emission: the `emitUnknownField` call in `lib/parser/blocks/event.ts` (unknown-label fallback branch, drafting-time locator `event.ts:225`). The fallback's self-slug STORAGE behavior (`toCanonicalKey` write, `event.ts:407-412`) is UNCHANGED — payload compatibility — but its warning emission moves to the detector, which is the sole `UNKNOWN_FIELD` emitter after this change. These are the only two `emitUnknownField` call sites in `lib/parser/` (verified by grep 2026-08-15); a structural assertion in the detector suite pins "exactly one call site" going forward.

### 2.2 What is added

A new module `fieldNearMiss` under `lib/parser/` (created by this work): a document-level pass invoked from `lib/parser/index.ts` where block parsers finish (aggregator in hand, same seam family as the branch-4 `normalizeLeadingColumn` call):

- **Candidate rows (consumption-keyed accept-set):** a row is a candidate iff the actual parse left it unresolved — it is not a recognized section/alias row (`resolveAlias` at `lib/parser/aliases.ts:166`, `resolveAliasFull` at `lib/parser/aliases.ts:177`, `isKnownSectionHeader` at `lib/parser/knownSections.ts:202`, `canonicalSectionKind` at `lib/parser/sectionKind.ts:82`) and no block parser resolved it to a CURATED key. Consumption is reported by the parse itself (a consumption ledger on the aggregator, populated where block parsers resolve rows), NOT re-derived from a static exclusion list — the calibration probe proved static vocab exclusion misclassifies rows resolved by block-internal maps (`event.ts` `CANONICAL_KEY_MAP` "room diagram"; `transport.ts` resolution of "Load In:"). **Curated-key resolution excludes a row; self-slug fallback storage does NOT** — `parseEvent`'s unknown-label fallback stores under a generic self-slug (`toCanonicalKey`, `event.ts:407-412`) without resolving to any real field, and those rows (including the corpus's most-confirmed true positives, Stage/Storage) remain candidates. The probe's 3-way verdict (UNCONSUMED / consumed-off-label stays / consumed-to-curated-key drops, calibration §7) is the normative semantics of the ledger. Position never enters — consumption is content/section-keyed, so the detector stays swap-invariant by construction.
- **Vocabulary (derived, never hand-listed):** all alias label strings from `FIELD_ALIASES` (`lib/parser/aliases.ts:19`) + all `SECTION_HEADER_TOKENS` + `LABEL_TO_KIND` keys. A later alias addition is covered automatically. `TYPO_ALIASES` (`aliases.ts:142`) members already resolve and are therefore never candidates.
- **Normalization (both sides):** decode HTML entities, strip trailing colons, collapse whitespace/newlines, casefold, trim.
- **Match rule + guards:** §3 (calibrated form is normative; the executable single source is the calibration test baseline).
- **Emission:** one `UNKNOWN_FIELD` warning per matching row via `emitUnknownField`, `blockRef` derived from the row's own block, message naming both the row label and the matched candidate (§5). No autocorrect field — the detector suggests, never rewrites.

### 2.3 Entity-decode header repair (companion fix)

The `ADDITIONAL ROOM&#10;Dimensions&#10;Floor` case is a real section header defeated by encoding, not an operator mistake. The header matcher's col-0 comparison path (`lib/parser/blocks/_sectionHeaderMatch.ts:31-40`) gains entity-decoding so the `rooms.additional` opener (`lib/parser/blocks/rooms.ts:108`) recognizes it. This is a payload-affecting parser repair with its own test; after it, those 2 rows stop being near-miss candidates (they resolve). Calibration table reflects post-repair state.

## 3. Calibration (normative)

Full measurement record: `docs/superpowers/specs/parser/probes/2026-08-15-near-miss-calibration.md` (probe scripts alongside; every number below is from its §7–10, measured stable across 3 independent runs). The committed baseline JSON (AC-N1) is the executable single source for expected emissions; the numbers here are the at-authoring-time record of that measurement.

### 3.1 Final rule (normative definition)

- **Normalization (both sides, "v3"):** decode HTML entities → casefold → collapse every run of non-alphanumeric characters to one space → trim. Additionally compute a **fused form**: delete hyphens sitting directly between two alphanumerics BEFORE the punctuation collapse (`E-mail:` → `email`); free-standing hyphens are untouched.
- **Match:** (a) normalized-string equality against a vocabulary entry, or (b) token subset-or-equal: the candidate's token set (plain or fused form) is a non-empty subset of, or equal to, some vocabulary entry's token set.
- **Guards (all three, deterministic):** minimum normalized length 5; reject ALL-CAPS single-token candidates; for type-(b) matches require at least one candidate token whose vocabulary document-frequency is ≤ 4 (threshold = the frequency of "address", the least-distinctive required true-positive token — corpus-derived, not arbitrary).
- **Vocabulary:** derived per §2.2; 132 distinct v3-normalized entries at authoring time (174 raw strings).

### 3.2 Measured corpus outcome (17 fixtures, 5,736 candidate rows)

- 77 rule firings, minus 5 rows the consumption ledger excludes (resolved to curated keys: 3× "Room Diagram" in DETAILS blocks, 1× "Notes" via `event.ts`'s curated map, 1× "Load In:" via `transport.ts`) = **72 expected emissions**, the committed baseline.
- Of the 72: **7 audited true positives** (Stage ×2, Storage ×2, Address:, Phone:, Client:/Contact:) + **25 same-shape near-misses in additional fixtures** (colon-suffixed contact fields incl. the 9 recovered `E-mail:` rows) + **15 `Backdrop`** (confirmed unconsumed near-miss of `event.scenic`'s "Backdrop / Scenic") + residual low-signal firings (21 Google-Forms-echo rows in `Timestamp` blocks, `Speaker` ×2, question-form labels `Details?`/`Diagrams?`, and peers — full grouping in probe §5/§8-9), all conservative and surfaced, pinned in the baseline.
- **Confirmed non-catches** (each with its verified reason, probe §8): `ALT. E-mail:` (extra token), `Cell Phone:` (tokens span two aliases), `Fax:`/`Event Name:` (no vocabulary counterpart), `Other` (contextual). Dispositions in §9 Documented limits.
- Guard variants tried and REJECTED with measured TP loss (probe §4): multi-token-only subset matching (TP→0), distinctiveness ≤1 (drops `Address:`), block-opener-recognized gating (drops the fused-opener block's TPs). These are fenced: re-proposing any of them requires a probe showing zero TP loss on this corpus.

### 3.3 Consumption ledger semantics (measured, §7 of the probe)

The naive "payload changed ⇒ consumed" rule would have dropped Stage/Storage — `parseEvent`'s fallback stores them under self-slug keys while today also emitting `UNKNOWN_FIELD`. The ledger therefore records CURATED resolutions only (exact/alias matches in a block parser's own map or regex path); fallback self-slug writes do not mark a row consumed. Verified against the real `CANONICAL_KEY_MAP` including the coincidence case (a curated slug equal to the self-slug: "room diagram", "notes" — curated wins, row excluded).

## 4. Acceptance criteria

- **AC-N1:** On the unmutated 17-fixture corpus, the detector emits exactly the calibrated true-positive set (§3) — pinned by an explicit committed baseline (the branch-5 `venueSignalParity` pattern: committed JSON, env-var regen, never `toMatchSnapshot`).
- **AC-N2:** The emission multiset is invariant under every adjacent-block swap: the 10 named swaps (`tests/parser/venueSwapInvariance.test.ts`) AND the exhaustive 497-swap sweep (`tests/parser/mutationHarness.venueSwapSweep.test.ts`) go GREEN.
- **AC-N3:** Venue payload parsing is byte-identical to today on the full corpus (`tests/parser/blocks/venue.test.ts` unchanged and green).
- **AC-N4:** The entity-decode repair makes the `ADDITIONAL ROOM` block parse as `rooms.additional` payload, with a fixture-backed test.
- **AC-N5:** Full mutation harness: four reconciliation buckets empty; the 10 real-loss `section-reorder:` ledger rows deleted; the 72 ratified ledger rows remain documented (numerical coincidence with §3.2's 72-emission baseline — unrelated quantities); `OPERATOR_FINDING_MAP["section-reorder"]` disposition per wave plan Task 4 Step 2 (archived row keeps its id resolvable).
- **AC-N6:** Copy/§12.4 lockstep: catalog row updated (title + dougFacing per §5), `pnpm gen:spec-codes` regen, card copy row, help entry — all in one commit; `x1-catalog-parity` green; impeccable dual gate run on the help/errors diff.
- **AC-N7:** the new `fieldNearMiss` module enrolled in the source-mutation registry (`tests/mutation/source/registry.ts`, `GuardSurface` row) with score + unaccepted-survivor set stated in the round-1 diff-review brief.

## 5. Warning surface

- **Catalog (`lib/messages/catalog.ts:1308`):** title moves from "Unrecognized row in sheet" to near-miss framing; dougFacing copy names the candidate, e.g. "A row labeled 'Stage' looks like it was meant to be 'Stage Size', so it isn't showing on the crew page. If it should show, rename the row in the sheet." Exact copy drafted at plan time under the copy rules (no raw codes, no em-dashes, `'` apostrophes, `STAGE_WORD_AUTOCORRECTED` tone template at `catalog.ts:1382-1397`).
- **Message payload:** `emitUnknownField` gains the matched-candidate string (shape decided at plan time: either message interpolation or a structured field mirrored into the catalog interpolation contract).
- **Anchors:** sourceCell anchoring behavior (`lib/drive/showDayTimeAnchors.ts`, `resolveUnknownFieldCell`) unchanged; `stripLegacyUnknownFieldAnchors` (`lib/parser/dataGaps.ts:505`) unchanged.
- **UI surface:** copy changes reach the warning card + `/help/errors` → invariant-8 impeccable dual gate runs on that diff before ship.

## 6. Consequences for the mutation wave

- The branch-5 parity baseline (`tests/parser/__fixtures__/venueSignalParity.baseline.json`) is regenerated deliberately to the calibrated multiset in the same commit that lands the detector — the regen IS the ratified §7.2(a) delta (Resolved scope #2).
- Swap-invariance tests flip RED→GREEN (AC-N2) — they were the executable statement of the gap and become the regression guard.
- Wave AC-W1's remaining-rows arithmetic shifts by the 10 deletions only (unchanged from the wave plan's Task 4 intent).

## 7. Non-goals

- No whole-document coverage audit (Resolved scope #1).
- No new warn code, no severity change, no DB/RPC/advisory-lock surface, no crew-page render change (warnings surface on admin/report surfaces only).
- No edit-distance matching, no live-sheet-driven vocabulary expansion in v1.

## 8. Testing

- TDD per task. Calibration test = explicit committed baseline + `UPDATE_*` env regen (pattern: `tests/parser/venueSignalParity.test.ts`).
- Premise guards (`tests/_shared/premise.ts:36`) on every mutation-shaped test input, per `BL-GUARD-PREMISE-REACHABILITY`.
- Detector suite exercises: each TP class fires; each audited noise class (roster names, agenda times, gear items, forms echo, `NO_HEADER` artifact, `#REF!` residue) does NOT fire; entity-decode repair; swap invariance.
- Mutation-registry enrollment (AC-N7) precedes the first diff review round (`pnpm mutation:guards` run before dispatch).
- Full 8-shard harness at close; four buckets empty.

## Dimensional Invariants

N/A — no layout change anywhere. The UI-visible delta is copy-only (catalog strings, warning card copy, help entry text) on existing components whose layout this spec does not touch.

## Transition Inventory

N/A — no visual states are added, removed, or changed; copy-only edits.

## 9. Documented limits

- **Letter-typo misspellings** (e.g. `Vanue Adress`) are not caught by v1 — zero corpus instances; extension requires a live instance plus its own calibration round.
- **Targetless unknowns are not near-misses.** `Fax:`, `Event Name:` (and any label with no counterpart anywhere in the derived vocabulary) stay silent by design: a near-miss requires a target field, and flagging vocabulary-less labels is the rejected coverage-audit product (§1.1.1). `Cell Phone:` stays silent in v1 — its tokens span two different aliases (`Contact Cell`, `Client Phone`) and no single-entry subset exists; a cross-entry match rule is a documented extension, not v1 scope.
- **Contextual rows** (e.g. `Other` inside the additional-rooms block) are invisible to a content-keyed rule by design — position-blindness is the load-bearing property; their block's recognition (§2.3) is the mechanism that handles them.
- **Calibrated residual noise:** the final rule's residual false positives ship as-is, pinned in the baseline (probe §5/§8–9): `Speaker` ×2 and the 21 Google-Forms-echo rows in `Timestamp` blocks (vocabulary-frequency statistics provably cannot separate `Speaker` from required true positives — its token frequency equals `stage`/`storage`'s), plus question-form labels (`Details?`, `Diagrams?`). Conservative, surfaced, bounded by the committed baseline.
- **Single-token generic labels** that resist guard separation (per §3's residual-FP record, if any) are conservatively silenced or conservatively flagged as calibrated — either way surfaced in the baseline, never silently wrong.
- **Open input space:** the corpus is a non-exhaustive sample; the acceptance posture is "parsed correctly or signaled, never silently wrong" (`docs/audits/edge-case-preparedness-audit-2026-07-04.md:92`). A novel junk shape that fires the detector is a false positive costing one spurious warning (conservative, surfaced); a novel near-miss shape that evades it is silence on content that was already silent today — no regression against the pre-detector state.
- **Adversarial obfuscation** (deliberately crafted labels): out of scope (Resolved scope #7).
