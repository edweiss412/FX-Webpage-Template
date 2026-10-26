# Near-miss label-opener arm and VENUE_ADDRESS_MISSING — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (this arc runs it natively, inline) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop near-miss rename cards in blocks that open on a label (the GEAR quote header), and add a `VENUE_ADDRESS_MISSING` notice for a named venue with no address.

**Architecture:** Part 1 adds one exported predicate, `isLabelOpener`, as a third exclusion arm inside `isCandidateHome`; nothing about matching changes, and every near-miss baseline, census and parity artifact is re-measured in the same commit. Part 2 adds one warn code emitted from `parseSheet` off the parsed venue, registered through the same files as `ROW_CELLS_FUSED` (commit `fde0bad97`).

**Tech Stack:** TypeScript, Vitest, the markdown-fixture parser under `lib/parser/`.

**Spec:** `docs/superpowers/specs/parser/2026-10-25-nearmiss-read-blocks-and-venue-address-design.md` (approved at spec review round 2). Executors read both.

**Branch:** `fix/near-miss-gear-quote-header`

impeccable-gate: N/A — no UI surface

No file under `app/` or `components/`, no `app/globals.css` token block, no `DESIGN.md`, no `tailwind.config.*` is touched. The new notice renders through the existing catalog-driven cards (spec §4.5, Dimensional Invariants: none).

## Global Constraints

- The detector's matching rule is untouched: `matchVocabulary`, `passesGuards`, `normalizeV3`, `fusedForm`, `MIN_LEN`, `DISTINCTIVENESS_MAX`, the tie-break and the consumption draw-down ship byte-identical (spec §1.1 item 5).
- The 2026-08-28 form-dump and inventory-matrix arms stay (spec §1.1 item 6).
- `UNKNOWN_FIELD` copy, §12.4 row and gap class unchanged (spec §1.1 item 7).
- Venue notice copy is verbatim from spec §4.5; no em dash, straight apostrophes, no banned vocabulary.
- §12.4 lockstep: master spec row, `pnpm gen:spec-codes`, `lib/messages/catalog.ts` row land in one commit (AGENTS.md).
- Corpus-derived counts in tests are computed from fixtures or the probe, never retyped.
- Heavy phases (full suite, mutation shard) run under `pnpm heavy` / `pnpm heavy:mutation`, outermost only.

## Review Focus

1. A quote header whose opener cell is merged with its first value in the exporter (`Client:/INSTITUTIONAL INVESTOR`): segment 0 is `Client:`, so the arm excludes it. Pinned in Task 1 by a unit case on `isLabelOpener`.
2. An opener whose cell spans lines with a colon at the end of its FIRST line (`ROOM DIMENSIONS:&#10;4100 SQ FT TOTAL`, `fixtures/shows/exporter-xlsx/east-coast.md`): the whole decoded segment does not end with a colon, so the block stays admitted. Pinned in Task 1 by a unit case on that exact string.
3. A venue name made only of whitespace: no notice (the trimmed name is empty). Pinned in Task 2 by a seam case.
4. A show where parsing yields no venue object at all: no notice and no throw. Pinned in Task 2 by a seam case.
5. A venue notice that was Ignored, then the venue name changes: the fingerprint changes with `rawSnippet`, so the notice returns. Pinned in Task 2 by asserting `rawSnippet` equals the current venue name on two fixtures with different venues.

## Meta-test inventory

EXTENDS:
- `tests/parser/dataGapsClassCompleteness.test.ts` (gap-class partition): one new `GAP_CLASSES` member.
- `tests/messages/_metaWarningCardCopy.test.ts` (card-copy registry): one new registry code.
- `tests/cross-cutting/codes.test.ts` (x1 catalog parity): one new §12.4 row.
- `tests/parser/warningScanScopeAnchor.test.ts` via `tests/parser/_warningCodeAnchor.ts`: one new code.
- `tests/messages/_metaErrorCatalogDocs.test.ts`, `tests/help/errors-grouping.test.tsx`: exercised, no edit expected (VENUE prefix mapped).

CREATES: none.

Not applicable, with reason: Supabase call boundaries, admin-alert catalog, advisory-lock topology, email normalization, sentinel hiding — no DB call, no admin alert, no lock, no email, no tile change.

## Acceptance-criteria coverage

The criteria live in the spec (§5); this table maps each to its owner.

| Spec criterion | Owner |
| --- | --- |
| AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8 | Task 1 |
| AC-9 | Closeout step 0 (mutation score) |
| AC-10, AC-11, AC-12, AC-13, AC-14, AC-15 | Task 2 |

## Registry reconciliation (run at plan time)

Measured 2026-10-25 on the branch tip by a throwaway `tsx` script importing each registry (`GAP_CLASSES`, `DATA_GAP_CODES`, `MESSAGE_CATALOG`, the `tests/messages/warningCardCopyRegistry.ts` exports, `WARNING_CODE_ANCHOR`, `SPEC_CODES`) and reading the two copy-spec counts and the generated manifest. "After" is what Task 2 must produce; every row moves by exactly the one code `VENUE_ADDRESS_MISSING` or not at all.

| Registry | Now | After | Moved by |
| --- | --- | --- | --- |
| `GAP_CLASSES` (`lib/parser/dataGaps.ts`) | 39 | 40 | Task 2 |
| `DATA_GAP_CODES` size, pinned at `tests/parser/dataGaps.test.ts:44-45` and `tests/parser/dataGapsClassCompleteness.test.ts:97` | 39 | 40 | Task 2 |
| Persisted-warning universe, pinned at `tests/parser/dataGapsClassCompleteness.test.ts:101` (test title says "total 60 (39/8/2/11)") | 60 | 61 | Task 2, title becomes 61 (40/8/2/11) |
| `MESSAGE_CATALOG` keys | 283 | 284 | Task 2 |
| `SPEC_CODES` keys (`lib/messages/__generated__/spec-codes.ts`) | 283 | 284 | Task 2, regenerated |
| `internal-code-enums` entries sourced from `parse_warnings.code` | 61 | 62 | Task 2, regenerated |
| `WARNING_CODE_ANCHOR` (`tests/parser/_warningCodeAnchor.ts`), equality with the row above | 61 | 62 | Task 2 |
| `WARNING_CARD_COPY_CODES` | 48 | 49 | Task 2 |
| `EXPECTED_TRIGGER_CONTEXT` keys | 48 | 49 | Task 2 |
| `EXPECTED_HELPFUL_CONTEXT` keys (total over the registry) | 48 | 49 | Task 2 |
| `EXPECTED_CONTROLS_NOTE` keys (total over catalog rows carrying a note) | 3 | 4 | Task 2 |
| `EXPECTED_LONG_EXPLANATION` keys | 1 | 2 | Task 2 |
| Codes whose `controlsNote` names Ignore | `["UNKNOWN_FIELD"]` | `["UNKNOWN_FIELD","VENUE_ADDRESS_MISSING"]` | Task 2 |
| Copy-restore spec §3.1 heading "(N codes)" | 48 | 49 | Task 2 |
| Copy-restore spec §3.1 "Parser emitters (N)" | 35 | 36 | Task 2 |
| `EXPECTED_CORPUS_WARN_CODES` (raw corpus) | 8 | 8, unchanged | none: the notice fires on no raw fixture (spec TABLE-D) |
| Near-miss baseline rows, `EXPECTED_TOTAL` | 33 | 5 | Task 1 |

## Pre-draft code-verification pass

Run 2026-10-25 against the branch tip, `grep -c -F <symbol> <file>` per row (count of matches):

```
1  lib/parser/fieldNearMiss.ts  ::  export function isCandidateHome
1  lib/parser/fieldNearMiss.ts  ::  export function detectFieldNearMisses
1  lib/parser/fieldNearMiss.ts  ::  export function buildVocabulary
1  lib/parser/warnings.ts  ::  export function emitOrphanedCrewRows
1  lib/parser/warnings.ts  ::  export function emitUnknownField
1  lib/parser/index.ts  ::  parseVenue(markdown, version, agg)
1  lib/parser/dataGaps.ts  ::  export const GAP_CLASSES
1  lib/parser/dataGaps.ts  ::  export function isQualityRegression
1  lib/messages/catalog.ts  ::  export const MESSAGE_CATALOG
1  tests/messages/warningCardCopyRegistry.ts  ::  export const WARNING_CARD_COPY_CODES
1  tests/messages/warningCardCopyRegistry.ts  ::  export const EXPECTED_CONTROLS_NOTE
1  tests/messages/warningCardCopyRegistry.ts  ::  export const EXPECTED_HELPFUL_CONTEXT
1  tests/messages/warningCardCopyRegistry.ts  ::  export const EXPECTED_TRIGGER_CONTEXT
1  tests/messages/warningCardCopyRegistry.ts  ::  export const EXPECTED_LONG_EXPLANATION
1  tests/parser/_warningCodeAnchor.ts  ::  export const WARNING_CODE_ANCHOR
2  tests/parser/fieldNearMissBaseline.test.ts  ::  EXPECTED_TOTAL
4  tests/parser/fieldNearMissBaseline.test.ts  ::  UPDATE_NEAR_MISS_BASELINE
2  tests/parser/venueSignalParity.test.ts  ::  UPDATE_VENUE_PARITY_BASELINE
3  lib/admin/step3SectionStatus.ts  ::  KIND_TO_SECTION
2  tests/_shared/premise.ts  ::  export function premise
1  tests/_shared/premise.ts  ::  export function premiseHolds
6  tests/mutation/source/registry.ts  ::  fieldNearMiss
```

The `fieldNearMiss` mutation surface is in source shard 5 (`surfacesForShard(5)`, 7 surfaces), run by `tests/mutation/guardSurfaces.shard5.test.ts`.

<!-- tasks: depth=2 red-contract -->

## Task 1 — the label-opener arm withdraws the quote header, and every near-miss artifact is re-measured

<!-- task: red=`pnpm exec vitest run tests/parser/fieldNearMissBaseline.test.ts tests/parser/fieldNearMiss.test.ts` red-state=authored red-target=`lib/parser/fieldNearMiss.ts:232` why=`isCandidateHome reaches its final return true for a block whose opener is Client:, because neither the form-dump nor the matrix arm fires on it, so the new AC-1 case (FinTech parse emits Address:, Phone:, E-mail:) and the excluded half of the new AC-4 block cases fail until a label-opener arm returns false before this line` ac=AC-1,AC-2,AC-3,AC-4,AC-5,AC-6,AC-7,AC-8 -->

What is red and why: the new AC-1 and AC-4 cases expect no emission from a `Client:` block; `isCandidateHome` admits every block the two existing arms do not refuse, and a `Client:` block is one of them.

**Files:**
- Modify: `lib/parser/fieldNearMiss.ts` (new exported `isLabelOpener`, one arm in `isCandidateHome`)
- Modify: `tests/parser/fieldNearMiss.test.ts`, `tests/parser/fieldNearMissBaseline.test.ts`, `tests/parser/candidateLabel.test.ts`, `tests/_shared/nearMissWarning.ts`
- Modify: `docs/superpowers/specs/parser/probes/2026-08-28-nearmiss-block-census.ts` (longhand rule gains the arm)
- Regenerate: `tests/parser/__fixtures__/fieldNearMiss.baseline.json`, `tests/parser/__fixtures__/nearMissBlockCensus.json`, `tests/parser/__fixtures__/venueSignalParity.baseline.json`

**Interfaces:**
- Produces: `export function isLabelOpener(opener: string): boolean` in `lib/parser/fieldNearMiss.ts`. True when the opener, entity-decoded and `clean`ed, split at the first `/`, has a segment 0 that, trimmed, ends with a colon.

- [ ] **Step 1: RED.** Every exclusion below is asserted DIFFERENTIALLY, against a firing control in the same test, so "nothing fired" can never mean "the detector never ran" (the pattern of `expectContributesNothing`, `tests/parser/fieldNearMiss.test.ts`).
  - AC-1, in `tests/parser/fieldNearMissBaseline.test.ts`: for each of `fixtures/shows/raw/2026-05-fintech-forum-cto-summit.md` and `fixtures/shows/exporter-xlsx/fintech.md`, the as-committed `parseSheet` emits no `UNKNOWN_FIELD` keyed `Address:`, `Phone:` or `E-mail:`, AND, in the same test, the same text with only the quote header's opener cell `Client:` replaced by `CLIENT` emits all three (the control: the rows are reachable and match).
  - AC-4, in `tests/parser/fieldNearMiss.test.ts`: the source block is the FinTech raw fixture's `Client:` block from `corpusBlocks()`. One test per excluded variant (as committed, `CLIENT:`, `Client:/Contact:`), each calling `expectContributesNothing(variant)`, which appends the east-coast `Stage` control and asserts the combined output equals the control's own. One test per admitted variant (`CLIENT`, `TRANSPORTATION/Load In:`, `GENERAL SESSION SINCLAIR BALLROOM TOTAL: 74' x 31'`), each asserting `Address:` fires. Every rebuilt variant carries `premiseHolds` that its scanned opener differs from the source's; every case carries `premiseHolds` that `matchVocabulary("Address:", vocab)` is non-null and the guards pass.
  Run the red command: AC-1's no-emission half and the three excluded AC-4 cases fail; the admitted cases and the AC-1 control half pass.
- [ ] **Step 2: GREEN.** Implement `isLabelOpener` below `MATRIX_MIN_VALUE_CELLS` (after `matchVocabulary`, so the two line-keyed accepted mutation rows on the `fieldNearMiss` registry entry, which point into `matchVocabulary`, do not move) and call it as the third arm of `isCandidateHome`, before `return true`. Add its direct unit cases, true for `Client:`, `CLIENT:`, `Client:/Contact:`, `Client: ` and `Client:/INSTITUTIONAL INVESTOR`; false for `CLIENT`, `TRANSPORTATION/Load In:`, `GENERAL SESSION SINCLAIR BALLROOM TOTAL: 74' x 31'`, `ROOM DIMENSIONS:&#10;4100 SQ FT TOTAL`, `DETAILS`, `VENUE NAME`, `Timestamp`, `` (empty).
- [ ] **Step 3: repair the cases the arm flips** (the spike run of 2026-10-25 against this exact change failed exactly these seven in `tests/parser/fieldNearMiss.test.ts`; no other near-miss case moved):
  - `audited true positives fire` › "the colon-suffixed client-contact rows name their venue/client aliases", "Client:/Contact: matches as an equality once punctuation collapses", "E-mail: matches only through the fused form": keep each `matchVocabulary` assertion (the matching rule is unchanged) and replace each emission assertion with `expectContributesNothing(block)` on the withdrawn block, under a `premiseHolds` that the row matches and clears the guards, and in the same test assert that a rebuilt block emits the row (the firing control). How the control is rebuilt depends on where the row sits, and both forms were run on 2026-10-25 against the consultants raw fixture's `Client:/Contact:` block:
    - for `Address:`, `Phone:` and `E-mail:`, which are ordinary rows of the block, replace the opener cell `Client:/Contact:` with `CLIENT`;
    - for `Client:/Contact:`, which IS the opener row, replacing the opener would delete the row under test, so instead prepend one line `| CLIENT |  |` above the block. The opener becomes `CLIENT` and `Client:/Contact:` becomes an ordinary row. Measured: `{"opener":"CLIENT","fired":["Client:/Contact:","Address:","Phone:","E-mail:"]}`.
    Each control carries `premiseHolds` that its scanned opener is `CLIENT` and that the row under test is still present in `scanRowsWithOpener(control)`. Rename the describe to say these rows MATCH but sit in a withdrawn block.
  - `tests/_shared/nearMissWarning.ts` reads its real mixed-case `UNKNOWN_FIELD` from `fixtures/shows/exporter-xlsx/consultants.md`, which emits none once the arm lands, so `tests/components/perShowActionableWarnings.candidateBand.test.tsx` and `tests/components/admin/wizard/step3CandidateBand.test.tsx` fail at collection (spike, 2026-10-25). Point its `FIXTURE` at `fixtures/shows/exporter-xlsx/east-coast.md`, whose candidates `Stage Size` and `Equipment Storage` are mixed-case corpus data, and update the comments naming the old fixture and its row count. Both suites then run in Step 5.
  - `block/kind anchor namespace` › "falls back to the normalized block-opener label for any other block": the `client contact` example is now withdrawn; keep the `joann` example, which still emits.
  - `block candidacy` › AC-4 (2026-08-28 numbering) "a narrow-minimum block stays a candidate even where the FIRING row is wide": move the witness to an admitted block per spec AC-6.
  - `block candidacy` › AC-9 census: after regeneration (Step 4) the family loop asserts `venue` and `details` blocks all stay candidates; for `client` it asserts the refused ids are exactly the `Client:`-opener blocks and every `CLIENT`-opener block stays; `client contact` is asserted refused. Family premises re-derived from the census.
  - `block candidacy` › AC-10: passes unchanged once the census carries the new arm.
- [ ] **Step 4: re-measure, each reviewed row by row.**
  - Census: add the `label-opener` arm to the longhand rule in `docs/superpowers/specs/parser/probes/2026-08-28-nearmiss-block-census.ts` (written out, not imported, per that file's header), run it with `node --import tsx`, and confirm the artifact's diff is exactly the 10 blocks of spec §3.2.
  - Baseline: `UPDATE_NEAR_MISS_BASELINE=1 pnpm exec vitest run tests/parser/fieldNearMissBaseline.test.ts`; the diff removes exactly the rows the probe's TABLE-C P4 column removes and leaves 5. Update `EXPECTED_TOTAL`, the composition partition (4 `details` rows, 1 `joann` row), and add a `BASELINE_NOTE` line naming the spec.
  - Candidate spellings: in `tests/parser/candidateLabel.test.ts`, derive the "preserves the SPELLING" case's set from `buildVocabulary()` raw spellings (spec §6).
  - Venue signal parity: `UPDATE_VENUE_PARITY_BASELINE=1 pnpm exec vitest run tests/parser/venueSignalParity.test.ts`; every removed or changed line belongs to a fixture whose near-miss baseline rows changed, and is either a raw-row signature whose block namespace is `client` or `client contact`, or that fixture's `UNKNOWN_FIELD` warning-count line, whose new count equals the fixture's regenerated near-miss row count (the line is absent when the count is 0). The consultants raw fixture, for example, loses exactly these five lines:

    ```
    R:client contact|Address:x1
    R:client contact|Client:/Contact:x1
    R:client contact|E-mail:x1
    R:client contact|Phone:x1
    W:UNKNOWN_FIELDx4
    ```
- [ ] **Step 5: green.** The red command passes; so do `tests/components/perShowActionableWarnings.candidateBand.test.tsx`, `tests/components/admin/wizard/step3CandidateBand.test.tsx`, `tests/parser/candidateLabel.test.ts`, `tests/parser/venueSignalParity.test.ts`, `tests/parser/consumptionLedger.test.ts`, `tests/drive/unknownFieldAnchors.test.ts`.
- [ ] **Step 6: commit** `fix(parser): near-miss cards skip blocks that open on a label`.

## Task 2 — VENUE_ADDRESS_MISSING, registered end to end

<!-- task: red=`pnpm exec vitest run tests/parser/venueAddressMissing.test.ts` red-state=authored red-target=`lib/parser/index.ts:637` why=`parseSheet calls parseVenue on this line and emits nothing about a named venue whose address is empty, so the new suite's corpus case expecting exactly one VENUE_ADDRESS_MISSING on fixtures/shows/exporter-xlsx/fintech.md fails until the emit call follows this line` ac=AC-10,AC-11,AC-12,AC-13,AC-14,AC-15 -->

**Interfaces:**

- Produces, in `lib/parser/warnings.ts`: `export function venueAddressMissingName(venue: { name: string; address: string } | null): string | null`. It returns `venue.name` verbatim when `venue` is non-null, `venue.name.trim()` is non-empty and `venue.address.trim()` is empty, and `null` otherwise. Also `export function emitVenueAddressMissing(agg: ParseAggregator, venueName: string): void`, which pushes the warning. The emit helper takes the name string only (spec AC-12).

What is red and why: the new suite expects one `VENUE_ADDRESS_MISSING` on each corpus fixture whose parsed venue has a name and an empty address; `parseSheet` emits none today.

Steps:

1. RED. Create the new suite tests/parser/venueAddressMissing.test.ts (the path the red command names):
   - AC-10: for every fixture under `fixtures/shows/raw/` and `fixtures/shows/exporter-xlsx/` (README.md excluded, the same list `tests/parser/fieldNearMissBaseline.test.ts` walks), parse, compute `expected = name.trim() !== "" && address.trim() === ""` from `show.venue`, and assert the count of `VENUE_ADDRESS_MISSING` is `expected ? 1 : 0`. Premise, unconditional and above the loop: at least one fixture expects 1 and at least one expects 0.
   - AC-11: a relabel case on a real fixture (`fixtures/shows/raw/2026-05-fintech-forum-cto-summit.md` with `| VENUE ADDRESS |` replaced by `| Street Address |`): premise that the source fixture's address is non-empty and the relabelled parse's is empty, then assert the warning fires with `severity: "warn"`, `blockRef` deep-equal to `{ kind: "venue" }`, `rawSnippet === show.venue.name`, and `hasIgnorableSnippet(w)` true. The same test asserts the unrelabelled source fixture emits no `VENUE_ADDRESS_MISSING` (the differential pair).
   - Seam cases on `venueAddressMissingName`, in ONE test so every refusal sits beside a firing case: name `"Kimpton Gray"` with address `""` returns `"Kimpton Gray"` and with `"  "` returns `"Kimpton Gray"` (the firing cases, asserted first); `null` venue, name `"   "` with empty address, and a non-empty address each return `null`.
   - In the AC-10 loop, every fired warning's `rawSnippet` equals that fixture's `show.venue.name`, and the firing fixtures carry at least two distinct venue names (premise), so an Ignore keyed on one venue cannot silence another.
   - AC-12: mock the emit helper's module export to a no-op and assert `show` deep-equals the unmocked parse on every firing fixture.
   - AC-15: `KIND_TO_SECTION[w.blockRef.kind]` is `"venue"` for the AC-11 warning.
   Run it: RED on the AC-10 and AC-11 cases.
2. GREEN, one commit, per spec §4.6 (lockstep):
   - `lib/parser/warnings.ts`: `export const VENUE_ADDRESS_MISSING = "VENUE_ADDRESS_MISSING"` and `emitVenueAddressMissing(agg, venueName: string)` pushing a literal-code warn warning, modelled on `emitOrphanedCrewRows`.
   - `lib/parser/index.ts`: after line 637, `const missingVenue = venueAddressMissingName(venue); if (missingVenue !== null) emitVenueAddressMissing(agg, missingVenue);`.
   - Master spec §12.4 row (parser soft-warnings group) and its `helpfulContext` YAML appendix entry; `pnpm gen:spec-codes`; `pnpm gen:internal-code-enums`.
   - `lib/messages/catalog.ts` row, copy verbatim from spec §4.5.
   - `lib/parser/dataGaps.ts` `GAP_CLASSES` entry per spec §4.4; `tests/parser/dataGaps.test.ts` and `tests/parser/dataGapsClassCompleteness.test.ts` count pins each move by one.
   - Copy-restore spec: §3.1 heading count and its "Parser emitters" member list gain the code; §4.2 gains an appended row `VENUE_ADDRESS_MISSING — title: **"Venue with no address"**`.
   - `tests/messages/warningCardCopyRegistry.ts`: `WARNING_CARD_COPY_CODES`, `EXPECTED_TRIGGER_CONTEXT`, `EXPECTED_LONG_EXPLANATION`, `EXPECTED_CONTROLS_NOTE`, `EXPECTED_HELPFUL_CONTEXT`.
   - `tests/messages/_metaWarningCardCopy.test.ts`: the Ignore-naming pin moves to both codes, title and comment updated (spec §4.6 item 5).
   - `tests/parser/_warningCodeAnchor.ts`: `WARNING_CODE_ANCHOR` gains the code.
   - AC-13 case in `tests/parser/dataGaps.test.ts`: `isQualityRegression` false when the only difference is one `VENUE_ADDRESS_MISSING`, with a positive control that a non-exempt code's same difference IS a regression.
   - `tests/parser/venueSignalParity.test.ts` baseline regenerated with `UPDATE_VENUE_PARITY_BASELINE=1`; diff reviewed: three new warning signatures only, one `VENUE_ADDRESS_MISSING` per firing exporter fixture (Task 1 already took part 1's removals).
3. Run the registry and meta suites named in AC-14 plus the task's own suite; all green.

<!-- tasks: end -->

## Closeout

Run in order on the final tree, each from the worktree root; a red stops the closeout.

0. Mutation surface re-scored (spec AC-9). The arm adds branches to a registered guard surface; AC-9 needs its score at or above the 0.95 floor with no unaccepted survivor.

   - Run, outermost-wrapped per the heavy-phase rule, reproducing the `mutation:guards` script's env: `pnpm heavy:mutation env VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm exec vitest run --project mutation tests/mutation/guardSurfaces.shard5.test.ts`.
   - Read the score from the record this run writes, proving it is NEW (its timestamp is after the run's start), not the latest on disk.
   - Re-key the two line-keyed accepted rows on the `fieldNearMiss` registry entry if their lines moved, by kind and source text, after commit hooks have formatted the file.
   - Any surviving mutant in `isLabelOpener` gets a killing case in `tests/parser/fieldNearMiss.test.ts`, not an accepted row.

1. `NODE_OPTIONS=--max-old-space-size=8192 pnpm typecheck` (the script itself is a bare `tsc --noEmit`; the heap is set here because a default-heap run of this repo's typecheck runs out of memory).
2. `pnpm exec eslint .` and `pnpm format:check`.
3. Full unit suite, outermost-wrapped: `pnpm heavy pnpm test`.
4. Generated-file freshness: `pnpm gen:spec-codes && pnpm gen:internal-code-enums && git diff --exit-code lib/messages/__generated__/`.
5. The probe re-run (`node --import tsx docs/superpowers/specs/parser/probes/2026-10-25-nearmiss-known-header-probe.ts`) completes, and its TABLE-C totals line now reads `before 5` and `P4 5`: the arm is live, so the shipped detector already emits the P4 set and applying P4 again removes nothing. Its "emission set == frozen baseline" flag is now `false` by design, because the frozen copy is the pre-change 33-row baseline; that flag is not a closeout criterion.
6. Invariant 8: no UI surface (marker line above). Invariant 12: no ledger row is closed by this branch, so no marker to add or remove.
7. Whole-diff cross-model review (codex-guard, `--stage diff`), split by surface: part 1 (`lib/parser/fieldNearMiss.ts` and the near-miss suites, baselines, census) and part 2 (venue notice and its registrations). Then push, real CI green on all required checks, `gh pr merge --merge`, fast-forward local `main`, verify `git rev-list --left-right --count main...origin/main` is `0  0`.

## Documented limits

The spec's §7 is the record; this plan adds none.
