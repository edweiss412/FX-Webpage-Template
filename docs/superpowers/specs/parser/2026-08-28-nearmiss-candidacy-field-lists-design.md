# Near-miss candidacy: field lists only — design

**Status:** Ready for adversarial review
**Date:** 2026-08-28
**Branch:** `fix/nearmiss-non-field-blocks` (closes `BL-NEARMISS-CANDIDACY-NON-FIELD-BLOCKS`)
**Predecessor:** `docs/superpowers/specs/parser/2026-08-15-field-near-miss-detector-design.md` (the detector this narrows; its §3.1 rule and §3.2 baseline are unchanged except where §3 below moves the corpus multiset)
**Evidence base:** `docs/superpowers/specs/parser/probes/2026-08-28-nearmiss-candidacy-probe.ts`, reading the frozen pre-change baseline at `docs/superpowers/specs/parser/probes/2026-08-28-nearmiss-baseline-at-merge-base.json` (65 rows, copied from the live baseline at `origin/main` 31beee5de). Every number in this document is printed by that one script.

The frozen copy exists because spec round 1 found the probe self-invalidating: it read the LIVE baseline, which AC-2 regenerates from 65 rows to 33, so the moment this spec shipped its own evidence would have collapsed (TABLE-D would print zero false positives removed). The removed-set and both refutations are claims about the corpus as it was at the merge base, so their input is pinned there. TABLE-J reads the live baseline separately and is the one table that SHOULD move when the change lands.

Reproduce all of it with:

```
pnpm exec tsx docs/superpowers/specs/parser/probes/2026-08-28-nearmiss-candidacy-probe.ts
```

## 1. Problem

`detectFieldNearMisses` (`lib/parser/fieldNearMiss.ts:236`) treats every pipe-run block in the document as a candidate home for a near-miss row. It walks `scanRowsWithOpener(markdown)` and asks only content questions of each row: is the label unresolved (`isCandidateLabel`, `fieldNearMiss.ts:184`), does it nearly match the vocabulary (`matchVocabulary`, `lib/parser/fieldNearMiss.ts:134`), does it clear the guards (`passesGuards`, `lib/parser/fieldNearMiss.ts:172`). Nothing asks whether the block the row sits in is a place field labels live at all.

Two corpus block shapes are not field lists, and the card's advice is wrong in both. The shipped card tells Doug to rename the row in his sheet so it matches the row we show. Neither of these rows was ever going to show.

- **A Google Form response dump**, opener `Timestamp`, on the RIA workbook's `FORM` tab. Its rows are form QUESTIONS, one per line. `Room Diagram` (`FORM!A29`) is reported as a near-miss of the `DETAILS/ROOM DIAGRAM` section header, and `Backdrop` (`FORM!A30`) as a near-miss of `Backdrop / Scenic`.
- **An inventory matrix**, opener `Console`, on its `3rd Level` tab. Column 0 is a gear CATEGORY and columns 1 to N are the items in it. `Speaker` (`3rd Level!A2`) is reported as a near-miss of `Virtual Speaker`.

The link arc (`docs/superpowers/specs/2026-08-27-wizard-warning-row-links-copy-design.md`) gave these rows a working "Open in Sheet" where they previously had none, which makes the wrong advice easier to follow rather than less wrong.

## 1.1 Resolved scope — do not relitigate

1. **Field lists only, ratified.** Near-miss cards fire only in blocks shaped like field lists. Form dumps and inventory matrices are NOT candidate homes, categorically. User-ratified by Eric on 2026-08-28 through the bl-orch dispatch that opened this arc. This settles the class-sweep exception (a) recorded on the ledger row, which parked the question because "which block shapes are legitimate near-miss homes" is a product decision the link arc could not make.
2. **Family matching is DECLINED for this arc.** The ledger row offered a second candidate repair: require the matched vocabulary entry's own block family to match the row's block, so a `DETAILS` entry cannot fire inside a `timestamp` block. The same 2026-08-28 ratification declines it and directs candidate (1) only. Both are not implemented. Do not propose family matching as a finding, an alternative, or an addition: it is a ratified scope decision, not an oversight, and the reason is that candidate (1) already removes every known false positive at zero true-positive cost (§3.2), so candidate (2) would be a second mechanism buying nothing measurable.
3. **The detector's §3.1 matching rule is untouched.** Normalization, the fused form, type (a) equality, type (b) token subset, `MIN_LEN`, `DISTINCTIVENESS_MAX`, the all-caps single-token guard and the vocabulary insertion-order tie-break all ship byte-identical. This spec adds a candidacy question ABOUT THE BLOCK and changes nothing about how a row is matched once its block is admitted.
4. **The consumption ledger is untouched.** Draw-down semantics, `consumptionKey`, and the local-copy discipline (`fieldNearMiss.ts:247`) ship unchanged.
5. **`UNKNOWN_FIELD` keeps its identity.** Same §12.4 row, same gap class, same anchor routing, same help family. No new warn code, no enum churn, no copy change. The set of emissions shrinks; nothing about an emission changes.
6. **Threat model.** The narrowing defends against real sheet shapes as they occur in the corpus. A block hand-constructed to sit exactly on a boundary is out of scope and files to §6 documented limits, not to a finding.
7. **Consequence bound.** Every block is either classified a field list and kept as a candidate home, or classified a non-home and excluded WITH its classification recorded. A wrong exclusion costs one missing advisory card, which the committed PER-BLOCK classification census (§3.5) surfaces at review time. The per-block census, not the baseline diff and not a per-namespace tally: an excluded block that hosts no emission today moves no baseline row, and a namespace-aggregated census does not move either when one block is swapped for another within the same namespace. Only a per-block verdict makes every wrong classification a diff. It can never corrupt a parse, drop a curated field, mis-route an anchor, or change a rendered value. There is no silent-corruption branch, because the change only ever REMOVES emissions from an advisory surface.
8. **NARROWING is the required direction.** The repair excludes candidacy. Any round that grows the recognizer instead of shrinking it is the forbidden direction for this arc.

## 2. Measurement

### 2.1 The committed baseline, by block

`tests/parser/__fixtures__/fieldNearMiss.baseline.json` holds 65 rows. Grouped by anchor namespace (TABLE-A):

| namespace | rows | distinct keys |
| --- | --- | --- |
| `timestamp` | 30 | `Backdrop`, `Room Diagram` |
| `client` | 24 | `Address:`, `E-mail:`, `Phone:` |
| `details` | 4 | `Stage`, `Storage` |
| `client contact` | 4 | `Address:`, `Client:/Contact:`, `E-mail:`, `Phone:` |
| `console` | 2 | `Speaker` |
| `joann` | 1 | `Diagrams?` |
| **TOTAL** | **65** | |

The first fact that shapes this repair: the `timestamp` namespace holds 30 of the 65 rows, and those 30 are ONLY the two keys the ledger row names as false positives, repeated across 15 fixtures. The `console` namespace holds 2, and both are the third named false positive. So the three named rows are not three rows. They are 32, and they are the entire content of their two namespaces. Excluding those two block shapes removes exactly the false-positive class and nothing else.

### 2.2 The ledger row's per-row matrix rule is refuted

The ledger row's candidate (1) describes a matrix as "a row whose value cells number more than two". Read as a per-ROW test, that rule is wrong, and the corpus says so loudly (TABLE-B). Counting non-empty cells after column 0 on the exact row each baseline emission came from:

| namespace | key | occurrences | value-cell histogram |
| --- | --- | --- | --- |
| `client contact` | `Address:` | 1 | 3vc x1 |
| `client contact` | `Client:/Contact:` | 1 | 8vc x1 |
| `client contact` | `E-mail:` | 1 | 3vc x1 |
| `client contact` | `Phone:` | 1 | 3vc x1 |
| `client` | `Address:` | 8 | 3vc x4, 6vc x4 |
| `client` | `E-mail:` | 8 | 1vc x4, 3vc x2, 6vc x2 |
| `client` | `Phone:` | 8 | 3vc x4, 6vc x4 |
| `console` | `Speaker` | 2 | 9vc x2 |
| `details` | `Stage` | 2 | 1vc x2 |
| `details` | `Storage` | 2 | 1vc x2 |
| `joann` | `Diagrams?` | 1 | 0vc x1 |
| `timestamp` | `Backdrop` | 15 | 0vc x7, 1vc x8 |
| `timestamp` | `Room Diagram` | 15 | 0vc x7, 1vc x8 |

26 of the 65 firings carry more than two value cells, and **24 of those 26 are true positives**: the real `client` and `client contact` hits at 3 and 6 and 8 value cells. Only 2 are the `console` false positive. A per-row "more than two value cells" exclusion would delete 24 true positives to remove 2 false ones. The rule is therefore adopted at BLOCK level instead (§3.1), where it costs nothing: a `client` block always contains at least one narrow row, and a `console` block never does.

### 2.3 Why no cell-shape test alone can work, and why a positive predicate fails

Block shapes at the first instance of each firing namespace (TABLE-C):

| namespace | opener | rows | min value cells | resolving rows |
| --- | --- | --- | --- | --- |
| `client` | `CLIENT` | 4 | 1 | 4 |
| `details` | `DETAILS` | 20 | 1 | 17 |
| `timestamp` | `Timestamp` | 50 | 0 | 19 |
| `console` | `Console` | 7 | 6 | 0 |
| `joann` | `JOANN` | 5 | 0 | 0 |
| `client contact` | `Client:/Contact:` | 10 | 0 | 0 |

Two things follow, and both constrain the design.

**`details` and `timestamp` are the same shape.** Both are single-column lists of labels with no values at all in the raw fixture. A `DETAILS` block is the canonical legitimate home; a `Timestamp` block is a form dump. No test over cell counts can separate them, because there is nothing in their cell counts to separate. Only the opener distinguishes them, which is why the form-dump arm is keyed on the opener and not on shape.

**A positive "is a field list" predicate keyed on resolving rows fails.** The natural positive definition is that a field list is a block the parser demonstrably reads fields from, so it should contain at least one row resolving to a known field. The corpus refutes it: a `Timestamp` form dump contains **19 resolving rows**, because form questions like `Email Address` and `Phone Number` hit real aliases. Scored, that predicate keeps all 30 timestamp false positives while losing 5 true positives, since `client contact` blocks contain **zero** resolving rows (their labels are all colon-suffixed variants that near-miss rather than resolve). Restricting it to non-opener rows is worse: 29 true positives lost. Both variants are in TABLE-D and neither ships.

This is why the shipped rule is two named shape exclusions rather than a positive predicate. It is not a preference for deny-lists. It is a measurement: the positive form was tried against the corpus and is refuted, and the refutation is recorded here so that a reviewer proposing it does not have to re-derive the result.

## 3. The rule (normative)

### 3.1 Definition

A pipe-run block is **not a candidate home** when either arm holds. Every other block is a candidate home and the detector's behavior inside it is unchanged.

- **Form dump.** `normalizeV3(opener) === "timestamp"`. A Google Form response export opens on the `Timestamp` column; its rows are questions, not fields.
- **Inventory matrix.** Every row in the block carries at least 6 value cells, where a value cell is a non-empty cleaned cell after column 0. Equivalently, the block's MINIMUM value-cell count is 6 or more.

The matrix arm is a MINIMUM over the block, not a test on the firing row, and not an average or a share. That is deliberate and load-bearing. A minimum states exactly the property that separates the two shapes: an inventory matrix is uniformly wide because every row is a grid line, whereas a field list always contains at least one narrow label-and-value row even when other rows in it are wide. Measured, `console` has minimum 6 and `client` has minimum 1, despite `client` containing rows with 8 value cells. A share-based or average-based threshold would introduce a tuned constant with no corpus justification; the minimum introduces none.

The threshold of 6 is selected by a stated criterion, not fitted to an instance: **take the largest threshold that still excludes every inventory matrix in the corpus.** All four `console` blocks have a minimum of 6, so 6 is that largest value; at 7 the arm catches only two of the four and stops doing its job. Taking the largest is what makes the exclusion the NARROWEST one that satisfies the ratification.

The corpus row outcome is insensitive to the constant across a wide band, which is why the row-count table alone cannot choose it (TABLE-F):

| threshold | blocks excluded by the matrix arm | baseline rows removed | TP lost |
| --- | --- | --- | --- |
| 2 | 151 | 2 | 0 |
| 3 | 78 | 2 | 0 |
| 4 | 35 | 2 | 0 |
| 5 | 22 | 2 | 0 |
| **6 SHIPPED** | **18** | **2** | **0** |
| 7 | 13 | 0 | 0 |

Every threshold from 2 through 6 removes the same two rows and loses nothing. Read alone, that table says the constant does not matter. It does, and the reason is the subject of §3.5: **a threshold also decides which blocks can EVER report a near-miss, and a family that hosts no emission today loses candidacy without moving a single row.** Measured per family (TABLE-H):

| threshold | blocks excluded | notable families hit |
| --- | --- | --- |
| 3 | 78 | `venue`=4, `console`=4 |
| 4 | 35 | `console`=4 |
| 5 | 22 | `console`=4 |
| **6 SHIPPED** | **18** | **`console`=4** |
| 7 | 13 | `console`=2 |

A threshold of 3 withdraws candidacy from **four `venue` blocks**. Venue is the canonical field-list family: the predecessor detector's positional sweep lived inside `parseVenue` (`lib/parser/blocks/venue.ts`), and this whole product exists because that sweep was keyed on the wrong thing, not because venue stopped being where fields live. Excluding venue blocks is the one exclusion this arc must not make, and no row-count table could see it, because no venue row fires today. At 6, zero `venue` and zero `details` blocks are touched and the only family hit is the intended one.

### 3.2 Scored against the baseline

Each candidate rule scored as rows kept, false positives removed, true positives lost (TABLE-D):

| rule | kept | FP removed | TP lost |
| --- | --- | --- | --- |
| R0 current, admit every block | 65 | 0 | 0 |
| R1 not a form dump | 35 | 30 | 0 |
| R2 not an inventory matrix | 63 | 2 | 0 |
| R3 positive: block holds at least 1 resolving row | 58 | 2 | **5** |
| R3b positive: at least 1 resolving non-opener row | 34 | 2 | **29** |
| **R1+R2 SHIPPED** | **33** | **32** | **0** |

The shipped rule removes all 32 false positives and loses zero true positives. Corpus scanned: 514 blocks across 17 fixtures.

### 3.3 Every excluded row, with its classification

All 32 removed rows, each with the arm that removed it, the block opener, the block's minimum value-cell count and the firing row's own value-cell count (TABLE-E). This table is what makes "zero true positives lost" a measurement rather than a claim: every row below is one of the three keys the ledger row names, and no other key appears.

| namespace | key | arm | opener | block min vc | row vc | fixtures |
| --- | --- | --- | --- | --- | --- | --- |
| `console` | `Speaker` | inventory-matrix | `Console` | 6 | 9 | `fixtures/shows/exporter-xlsx/ria.md`, `fixtures/shows/raw/2025-06-ria-investment-forum.md` |
| `timestamp` | `Backdrop` | form-dump | `Timestamp` | 0 | 0 | `fixtures/shows/exporter-xlsx/fintech.md`, `fixtures/shows/exporter-xlsx/ria.md`, `fixtures/shows/raw/2025-03-dci-rpas-central.md`, `fixtures/shows/raw/2025-04-asset-mgmt-cfo-coo.md`, `fixtures/shows/raw/2025-06-ria-investment-forum.md`, `fixtures/shows/raw/2026-04-asset-mgmt-cfo-coo-waldorf.md`, `fixtures/shows/raw/2026-05-fintech-forum-cto-summit.md` |
| `timestamp` | `Backdrop` | form-dump | `Timestamp` | 0 | 1 | `fixtures/shows/exporter-xlsx/consultants.md`, `fixtures/shows/exporter-xlsx/fixed-income.md`, `fixtures/shows/exporter-xlsx/redefining-fi.md`, `fixtures/shows/exporter-xlsx/rpas.md`, `fixtures/shows/raw/2025-05-redefining-fixed-income-private-credit.md`, `fixtures/shows/raw/2025-10-consultants-roundtable.md`, `fixtures/shows/raw/2025-10-fixed-income-trading-summit.md`, `fixtures/shows/raw/2026-03-rpas-central-four-seasons.md` |
| `timestamp` | `Room Diagram` | form-dump | `Timestamp` | 0 | 0 | `fixtures/shows/exporter-xlsx/fintech.md`, `fixtures/shows/exporter-xlsx/ria.md`, `fixtures/shows/raw/2025-03-dci-rpas-central.md`, `fixtures/shows/raw/2025-04-asset-mgmt-cfo-coo.md`, `fixtures/shows/raw/2025-06-ria-investment-forum.md`, `fixtures/shows/raw/2026-04-asset-mgmt-cfo-coo-waldorf.md`, `fixtures/shows/raw/2026-05-fintech-forum-cto-summit.md` |
| `timestamp` | `Room Diagram` | form-dump | `Timestamp` | 0 | 1 | `fixtures/shows/exporter-xlsx/consultants.md`, `fixtures/shows/exporter-xlsx/fixed-income.md`, `fixtures/shows/exporter-xlsx/redefining-fi.md`, `fixtures/shows/exporter-xlsx/rpas.md`, `fixtures/shows/raw/2025-05-redefining-fixed-income-private-credit.md`, `fixtures/shows/raw/2025-10-consultants-roundtable.md`, `fixtures/shows/raw/2025-10-fixed-income-trading-summit.md`, `fixtures/shows/raw/2026-03-rpas-central-four-seasons.md` |

2 + 15 + 15 = 32. The 33 surviving rows are the `client` 24, the `client contact` 4, the `details` 4 and the `joann` 1.

### 3.4 The `joann` row survives, deliberately

`joann | Diagrams?` is the one surviving row whose home is arguably not a field list: a five-row block opening on a crew member's name, with no resolving rows and no values. It survives because the ratification names exactly two non-home shapes, and this block is neither. Excluding it would need a third arm keyed on something this spec has not measured and the ratification did not authorize, which is the forbidden direction for this arc (§1.1.8). It is recorded as a documented limit (§6) with a re-file trigger, not carried as a hidden decision.

### 3.5 The block classification census, and why row counts cannot stand in for it

Spec round 1 raised this and it is confirmed. Every table in §2 and §3.2 selects its rows through the baseline's key set, so all of them measure the same thing: what happens to rows that already fire. Two failures are invisible to all of them at once.

- **Under-implementation.** An implementation that simply suppressed the three known keys `timestamp Room Diagram`, `timestamp Backdrop` and `console Speaker` would produce the 33-row baseline, satisfy AC-1, and pass the fixture cases at AC-5 and AC-6, while implementing no block classification at all. The rule in §3.1 classifies BLOCKS; nothing that counts rows can tell the difference.
- **Wrong exclusion.** A block wrongly excluded that happens to host no emission today moves no row, so it appears nowhere. That is not hypothetical: it is exactly how a threshold of 3 withdrew candidacy from four `venue` blocks while every outcome table in this spec read green (§3.1).

The second one defeats the consequence bound as §1.1.7 originally stated it. That clause promised a wrong exclusion would be surfaced by the committed baseline diff. For an emission-free block it is not, so the promise was only true of the blocks that already fire.

**The census is what makes the bound true, and it is keyed PER BLOCK.** Spec round 2 found the first version of it aggregated by namespace, printing `{excluded, kept}` totals. That is not a verdict per block, and the corpus supplies the counterexample: `audio` has 13 blocks, 4 excluded and 9 kept, so an implementation that admitted one intended-excluded `audio` block while excluding one intended-kept one left the table byte-identical at `audio | 4 | 9`. A wrong exclusion did not have to change any committed cell, so the bound was still false.

Each excluded block now carries its own identity in TABLE-I: verdict, arm, namespace, `fixture#ordinal`, minimum value cells, row count, and opener. A wrong exclusion adds a line, a wrong admission removes one, and the `audio` swap above moves two. The excluded set is printed in full because it is the set the rule acts on and the set that can be wrong; kept blocks are counted rather than listed, since the artifact would otherwise be 514 lines of mostly `kept | -`.

33 of 514 blocks excluded, 16 of them emission-free at the merge base, and no `venue`, `details`, `client` or `client contact` block among them.

**The census alone still does not bind the detector, so AC-10 does.** Round 2's other finding: a census proves that a PREDICATE classifies blocks. It does not prove `detectFieldNearMisses` gates its emissions through that predicate. An implementation could expose a correct predicate for the census, leave it disconnected, and hardcode suppression of the three known keys in the detector, satisfying the 33-row baseline, both shape cases, and the census at once.

The binding is measured directly (TABLE-L): into EVERY corpus block, inject one row whose label is a known near-miss and is NOT one of the three known keys, run the real `detectFieldNearMisses` over that block with a fresh aggregator, and require it to emit IF AND ONLY IF the predicate admits the block. Injecting one label row into a real corpus block is one ordinary edit, so every input stays inside the declared probe domain.

At the merge base this probe reports **33 disagreements out of 514 blocks** — exactly the 33 blocks the rule excludes, because today the detector has no candidacy gate and emits in all of them. The implementation drives that to 0. A three-key hardcode leaves all 33 standing. The probe also prints a positive control (the injected label emits in 514 of 514 blocks today), because a binding probe whose emission check silently matched nothing would report agreement for the wrong reason: the first draft of it read a `detail` field that `emitUnknownField` does not set, and reported "not emitted" for every block on a detector that was emitting everywhere.

The census is DERIVED by walking the corpus, never enumerated by hand: adding a fixture extends it rather than silently leaving the new blocks unpinned.

## 4. Acceptance criteria

- **AC-1.** On `fixtures/shows/raw/2025-06-ria-investment-forum.md`, a full `parseSheet` emits NO `UNKNOWN_FIELD` for `Room Diagram` or `Backdrop` in the `timestamp` namespace, and none for `Speaker` in the `console` namespace. This is the ledger row's done condition at the parse seam. RED before the change: all three are emitted today.
- **AC-2.** The corpus baseline is re-measured and re-ratified at 33 rows, regenerated deliberately via `UPDATE_NEAR_MISS_BASELINE=1`, with the removed set being exactly the 32 rows of §3.3 and the surviving set being exactly the 33 of §3.2. The baseline diff is reviewed row by row, not accepted wholesale.
- **AC-3.** No row in the surviving 33 changes any field of its emission identity: `fixture`, `key`, `block`, `kind` and `candidate` are byte-identical to their pre-change values. The narrowing removes emissions; it never rewrites one.
- **AC-4.** A block whose minimum value-cell count is 2 or less remains a candidate home even when individual rows in it are wide. Pinned against a `client` block, which holds rows at 6 value cells and must keep firing. This is the executable statement of §2.2's refutation, and it fails if anyone reimplements the matrix arm per row.
- **AC-5.** A `Timestamp`-opener block is excluded even though it contains resolving rows and is single-column. Pinned with a premise assertion that the block WOULD have fired before the change, so the test cannot pass by the block being uninteresting.
- **AC-6.** A `Console`-shaped block is excluded by the matrix arm, with a premise assertion that its `Speaker` row matches the vocabulary and clears the guards. The premise is what distinguishes "excluded by the new rule" from "never matched anyway".
- **AC-7.** `matchVocabulary`, `passesGuards`, `normalizeV3`, `fusedForm` and the consumption draw-down are unchanged. Pinned structurally, so a future edit that moves matching behavior under cover of this narrowing fails.
- **AC-9.** The block classification census (§3.5) is pinned as a committed artifact keyed PER BLOCK, asserted at CANDIDACY level rather than through emissions. The test walks every corpus block, applies the candidacy predicate, and compares the full per-block verdict set, each row identified by `fixture#ordinal` so a swap within one namespace cannot leave the artifact unchanged. It carries a premise that the walk actually saw the families it claims to cover, so a scoping bug that selects nothing cannot pass it vacuously, and it asserts BOTH directions: every `venue` and `details` block admitted, every `console` block refused. A pin that only asserted admission would pass against a predicate that admits everything, which is the pre-change detector.
- **AC-10.** The detector is bound to the predicate. For every corpus block, injecting one row whose label is a known near-miss and is not one of the three known keys makes `detectFieldNearMisses` emit if and only if the predicate admits that block. RED at the merge base with exactly 33 disagreements, the 33 excluded blocks; GREEN at 0 after implementation. This is the criterion that fails an implementation exposing a correct predicate for AC-9 while suppressing the three known keys directly in the detector, which every other criterion in this spec accepts. The test asserts its own positive control (the injected label must emit somewhere), because a binding assertion whose emission check matches nothing reports agreement for the wrong reason.
- **AC-8.** The source-mutation surface `fieldNearMiss` (`tests/mutation/source/registry.ts:2550`, floor 0.95, all operators) scores at or above its floor with an empty unaccepted-survivor set after the change, and the two existing accepted rows are re-keyed if line movement drifts their `siteId`.

## 5. Testing

The suites are the two the registry already names, so the mutation surface keeps deciding this code.

- `tests/parser/fieldNearMiss.test.ts` gains the per-class cases: AC-4, AC-5, AC-6, AC-7, AC-9. Each shape case states its premise executably via `tests/_shared/premise.ts` and asserts the exclusion, never merely the absence of output. A test that only shows "nothing was emitted" would pass against a detector that emits nothing at all, which is exactly the mutant the registry's `control` row plants.
- `tests/parser/fieldNearMissBaseline.test.ts` carries AC-1, AC-2 and AC-3 at the `parseSheet` document seam. `EXPECTED_TOTAL` moves 65 to 33 in the same commit as the regenerated baseline JSON, and the baseline note gains a line recording this spec as the reason the multiset moved.

Anti-tautology: the shape-arm tests derive their expectations from the fixture's own measured shape rather than hardcoding, and every exclusion case is paired with a positive control in the same block family that must still fire. The `client` positive control at AC-4 is the one that catches a per-row reimplementation of the matrix arm; the census at AC-9 is the one that catches an implementation which suppresses three keys and classifies nothing.

Note on what each level of test can see. AC-1 through AC-3 work in emission space and answer "what changes today". AC-9 works in candidacy space and answers "what can ever be reported". The threshold-3 venue defect was invisible to the first and obvious to the second, so a change to this rule is not adequately tested by emission counts alone, however many of them there are.

## 6. Documented limits

Filed here rather than as ledger rows, per the 2026-08-25 process freeze: each names the condition that would make it a real finding.

1. **A field list opening on the literal word `Timestamp`.** The form-dump arm is keyed on the opener string. A legitimate field list whose first cell is `Timestamp` would be excluded wholesale. Zero corpus instances; a live sheet exhibiting one is the re-file trigger.
2. **An inventory matrix carrying one narrow row.** The matrix arm takes the block minimum, so a grid with a single trailing note row at 1 value cell is admitted and its rows can fire again. This fails toward today's shipped behavior rather than away from it. A live sheet where this produces a wrong card is the re-file trigger.
3. **The `joann` block shape.** §3.4. A name-opener block with no resolving rows is not obviously a field list, but excluding it is outside this arc's ratification. The re-file trigger is a second corpus instance of the shape, or an owner decision that name-opener blocks are not homes.
4. **Sixteen excluded blocks host no emission today.** The matrix and form-dump arms together withdraw candidacy from 33 of 514 corpus blocks (§3.5), and 16 of those hold no baseline row at the merge base. A near-miss appearing in one of those 16 in a future sheet would go unreported. This is a genuinely reduced surface rather than a deferred question: the earlier draft of this spec used a threshold of 3, which withdrew candidacy from 78 blocks including four `venue` blocks, and §3.1 retires that by construction. The re-file trigger is a live sheet where a real near-miss is suppressed by either arm; §3.5's census is what makes such a suppression visible rather than silent.

5. **Fixtures are the corpus, not the workbooks.** The markdown fixtures concatenate tabs, so the block boundaries measured here are the fixture's pipe runs. The three named rows were probed against the live RIA workbook by the filing arc; this spec's tables are fixture-derived by construction, and the two agree on all three rows.

## 7. Non-goals

Family matching (§1.1.2). Edit-distance fuzzing, still out per the predecessor spec §1.1.4. Any change to `UNKNOWN_SECTION_HEADER`. Any copy change to the card: the advice text is correct for the blocks that survive, and the arc removes the blocks where it was wrong rather than rewording it.

## Dimensional Invariants

None. No UI surface is touched by this change.

## Transition Inventory

None. No component with multiple visual states is touched by this change.

impeccable-gate: N/A — no UI surface
