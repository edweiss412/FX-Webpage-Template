# Review-round arc sum — the filing threshold counts per arc, not per merge base

**Date:** 2026-08-22 · **Ledger row:** `BL-REVIEW-ROUND-COUNT-RESETS-ON-REMERGE` (`BACKLOG.md`) · **Branch:** `feat/review-round-arc-sum` · **Amends:** `docs/superpowers/specs/ci/2026-08-04-review-round-economy.md` §4.3, §5.2, §8.3 limit 3

The round-economy gate counts a stage's rounds inside one `<baseSha12>.jsonl` file. Re-merging `origin/main` moves the merge base, so the next dispatch writes into a new file and the counter restarts at 1. An arc that burns four diff rounds across two bases reaches the threshold in neither file and owes nothing, and the gate's only enforcement point stops firing on exactly the long arcs it was built for.

This spec adds a second, residual obligation that sums a stage's rounds across every base under one branch directory. The per-base obligation, the per-base contiguity rule, and the per-base filing location are all untouched.

## §1 Purpose

`BL-REVIEW-ROUND-COUNT-RESETS-ON-REMERGE` measured the defect on a live arc: `feat/pane-compaction-send-auth` re-merged main after diff round 3, and round 4 landed in a fresh file as round 1. Its filing was written voluntarily and says so.

The incentive runs backwards. AGENTS.md's closure-hit rule *requires* a re-merge whenever main touches a file the branch touched, so the arcs most likely to split their corpus are the long ones — the arcs the cap exists to make account for themselves. No bad faith is needed: an arc can reach the cap, re-merge, and continue with a fresh counter without deciding anything.

The corpus also **forbids the honest workaround**, which is how the row confirmed the defect. Declaring the arc-honest number at a new base fails the contiguity check (`round_gap`): a first row at a new base recording "diff round 4" is rejected, and must be renumbered to 1 to pass. So the layout does not merely fail to sum across bases; it actively requires base-local renumbering.

## §1.1 Resolved scope — do not relitigate

1. **The repair shape is the ledger row's, ratified before this spec.** The threshold sums per **arc** (the branch directory); the filing's **location stays per-base** (it names the head the rounds examined). The corpus is already laid out branch-first, so the sum is a directory read rather than a new key. Arguing for a per-base threshold, or for relocating filings, argues against the row.
2. **Distinct `(baseSha, round)` pairs, never distinct `round` values.** A rebase renumbers, so `round` alone collides across bases and undercounts. The row settles this: "sum distinct `(base, round)` pairs, not distinct `round`".
3. **An arc that re-bases onto a much later main is the same arc for accounting.** The row settles this too. The directory is the accounting unit; how far the base moved is not consulted.
4. **The heading's declared count stays per-base, measured not assumed (§2, probe 2).** Of the 37 live filing sections where the per-base count and the arc sum differ, **37 declare the per-base count and 0 declare the arc sum**. Moving `count_mismatch` to the arc sum would red 37 sections of immutable evidence. The arc total belongs in the section's `**Examined:**` line, which the gate does not judge (2026-08-04 spec §7.2).
5. **The change is monotone, and that is the compatibility argument.** The per-base rule is untouched; the arc rule only *adds* problems. No corpus that passes today can fail on a per-base ground it passed on before, and every arc obliged today stays obliged. Pinned executably (§5).
6. **Hard, with a frozen grandfather set — not a permanent advisory tier.** The arc sum newly obliges **11** `(branch, stage)` pairs (§2, probe 1), and **all 11 are merged with no branch on origin** (probe 1b), so an advisory list naming them could never drain: it would be a standing false signal, and the dated hardening step would arrive with all 11 still owing. The frozen never-added set is the shape this gate already ships for the Mechanizable parity rule (`lib/reviewRounds/mechanizableGrandfather.ts`), for the same reason — filings and corpus rows are immutable evidence, so a rule that cannot be complied with retroactively binds forward only. Ratified by the orchestrator 2026-08-22 over the advisory-first alternative.
7. **The gate never consults `_roundAtPreviousBase`.** The cross-reference key some arcs write on their first row at a new base is traceability prose for a human reader, and §5 of this spec recommends it. Making the sum *depend* on it would defeat the gate against its own threat model: the 2026-08-04 spec §8.1 fences this system to "an arc that forgets", and a sum an arc must declare is defeated by forgetting. Measured: only 2 of 61 multi-base branch directories carry the key.
8. **Walker-derived discovery is preserved.** Both obligations read the corpus from disk (`readArcs`, `lib/reviewRounds/corpus.ts:112`). A new branch directory is covered without registration and fails by default. Any proposal that registers arcs is out of scope.

## §2 Probes

Every number below is produced by command over the live corpus at merge base `50ca72a56`. Scripts are committed at `scripts/probes/reviewRoundArcSum/` so each is re-runnable, and §5 pins the two decisive counts as executable assertions rather than prose.

**Every count here carries an at-authoring-time qualifier, and the reason is not boilerplate: this arc's own dispatches enlarge the corpus it is measuring.** The figures below were taken before this arc's first review round wrote its row; that one row moves the arc-stage population from 281 to 282 and the per-base population from 345 to 346, which is exactly the discrepancy between probe 5's numbers and the ones spec review round 1 measured minutes earlier. Numerators are unaffected. The decisive counts — 11 newly owing, and 37 of 37 on probe 2 — are unaffected too, because a single spec round is four short of the threshold. Re-run the probes rather than quoting these after any merge into main.

### Probe 1 — how many arcs newly owe

`pnpm exec tsx scripts/probes/reviewRoundArcSum/arcSum.ts .`

```
arcs (branch directories): 126
arc-stage pairs with counted rows: 281
multi-base arcs: 61
malformed json lines: 0

NEWLY OWING (arcSum >= 4, no base at threshold, no filing section): 11
  chore/archive-duplicate-ids            | diff | maxPerBase=2 arcSum=4
  ci/app-e2e-batch1                      | plan | maxPerBase=2 arcSum=4
  docs/harness-false-failures-spec       | plan | maxPerBase=3 arcSum=4
  feat/crew-chrome-footer-avatar         | diff | maxPerBase=2 arcSum=4
  feat/diagram-viewing-polish            | diff | maxPerBase=2 arcSum=5
  feat/m2-e2e-infra                      | diff | maxPerBase=2 arcSum=4
  feat/mutation-ref-sub                  | diff | maxPerBase=3 arcSum=4
  fix/premisescan-registrar-accept-sets  | diff | maxPerBase=3 arcSum=6
  fix/scanner-scope-totality             | diff | maxPerBase=1 arcSum=5
  fix/sendauth-arm-classifier-unification | diff | maxPerBase=3 arcSum=4
  test/execution-methods-driver-derived  | diff | maxPerBase=3 arcSum=4
```

`fix/scanner-scope-totality` is the clearest instance: five diff rounds across five bases, **one round in each file**, obliged nowhere.

**Probe 1b — every one of the 11 is merged.** For each branch: `git ls-remote --heads origin <branch>` returns 0 refs, and `git log --merges --first-parent origin/main` holds exactly 1 merge commit naming it. None can ever gain a filing, which is what rules out the advisory tier (§1.1.6).

### Probe 2 — what existing filings declare

`pnpm exec tsx scripts/probes/reviewRoundArcSum/declared.ts .`

```
filing sections where perBase == arcSum (indistinguishable): 180
filing sections where perBase != arcSum (decisive):           37
  declared == perBase count : 37
  declared == arc sum       :  0
  declared == neither       :  0
```

Unanimous, and it settles §1.1.4 by measurement: `count_mismatch` stays per-base.

### Probe 3 — branch-name reuse against the corpus

`pnpm exec tsx scripts/probes/reviewRoundArcSum/reuse.ts .`

```
corpus branch directories: 126
branch names merged more than once, ANY: 4
of those, ones that HAVE a corpus directory: 0
```

The three reused names the 2026-08-04 spec §5.2 enumerates (`feat/attention-alert-routing`, `feat/watch-reconcile-backoff`, `feat/role-vocab-settings-desktop-grid`) plus one more all predate the corpus. This is the one hazard a per-directory sum introduces, and it is at zero live instances; §4 limit 1 bounds it.

### Probe 4 — the freeze boundary

`pnpm exec tsx scripts/probes/reviewRoundArcSum/freeze.ts .`

```
latest startedAt across the 11 grandfathered pairs: 2026-08-21T18:48:38.105Z
entries with a row missing startedAt:               0
latest startedAt anywhere in the corpus:            2026-08-22T05:41:59.637Z
```

`ARC_SUM_FREEZE` is set between them (§3.3).

### Probe 5 — the report's trigger rate under both units

Added after spec review round 1, which found the report's headline metric still on the per-base model.

`pnpm exec tsx scripts/probes/reviewRoundArcSum/triggerRate.ts .`

```
per-base   (branch, baseSha, stage): 199/346  57.5%
per-arc    (branch directory, stage): 212/282  75.2%
```

Both parts of the fraction move, so the published rate jumps ~18 points with nothing about the repo's behavior having changed. The 13-pair numerator difference is the arc-only threshold crossings: probe 1's 11 that owe a filing, plus 2 that already carry one. §3.4 makes the report label the change rather than let a reader take it for improvement.

## §3 Design

### §3.1 Two obligations, the second residual

The threshold rule gains a second clause. Both live; the per-base clause is unchanged.

**Clause A — per base (unchanged, 2026-08-04 spec §4.3).** A stage whose distinct counted `round` values *within one base file* reach `ROUND_THRESHOLD` owes a filing section **at that base**. Reported as `missing_filing`.

**Clause B — per arc (new).** For a branch directory *D* and a counted stage *S*:

```
arcCounted(D, S) = |{ (row.baseSha, row.round)
                      : row ∈ every .jsonl under D,
                        row.status === "verdict",
                        row.stage === S }|
```

When `arcCounted(D, S) >= ROUND_THRESHOLD`, the directory owes **at least one** filing section for *S* in a filing **`readArcs` recognizes** under *D* — that is, an `arc.filingPath`, whose name matches `^[0-9a-f]{12}\.md$` (`lib/reviewRounds/corpus.ts:65`). Clause B reports when no such section exists anywhere under *D*, as a new `ProblemKind`, `missing_arc_filing`, whose message names the directory, the sum, and the per-`(baseSha, stage)` breakdown that produced it.

**"Any `.md`" would be a silent satisfaction path, and the corpus already contains the shape that exploits it (R4 finding 1).** A stray `.md` under a branch directory is deliberately IGNORED prose, not data — `docs/review-rounds/README.md` says so, and `tests/docs/_metaReviewRoundEconomy.test.ts:589` pins a stray prose file under a branch directory as an accepted ignored file. An implementation reading the loose wording would let such a file, carrying a parseable `## diff` section, discharge a real obligation, while the canonical reader sees no filing at all: an obliged arc reported compliant, which is the one outcome the consequence bound forbids. Sections come from the same `arc.filingText` the rest of `checkCorpus` reads, and from nothing else.

**Suppression.** Clause B does not report for `(D, S)` when clause A is already reporting `missing_filing` for *S* at any base under *D*. Its only job is to keep one unmet obligation from producing two messages.

Writing it as "when any base reached the threshold" would pick out the same corpora — if every threshold base has a section, that section is also a section under *D*, so clause B is satisfied and silent either way. The two are equivalent, and this spec states the narrow one because it names the reason (do not double-report) instead of a proxy that happens to coincide with it. §5 pins the equivalence with the fixture that discriminates them if it is ever broken: a threshold base carrying its own section, plus two later bases below threshold, must stay clean.

Two properties follow, and each is a test in §5.

- **Monotonicity (§1.1.5).** Clause A is untouched and clause B only adds, so the problem set can only grow. This is what makes the change safe over 126 historical directories without inspecting them one at a time.
- **No new satisfaction path for a clause-A obligation.** A filing elsewhere in the directory never discharges a base that reached the threshold on its own. This is the property that keeps branch-name reuse from *weakening* the gate: a reused name whose second PR burns 4 rounds at one base still owes at that base, exactly as today.

**Where clause B's filing goes.** Any arc-shaped `.md` under the directory, by the recognizer above. The gate does not pick, because the filer knows which head the rounds actually examined and the 2026-08-04 spec §7.2 keeps the gate out of prose judgment. The convention the README states is the **latest** base holding rows for that stage.

### §3.2 What stays per base, and why the contiguity rule survives

The ledger row asks this spec to state exactly which invariant replaces per-base contiguity. The answer is that **nothing replaces it — it stays, and the sum is what makes it harmless.**

| Check | Unit | Change |
| --- | --- | --- |
| `round_gap` (contiguous `1..N`) | per base file | none |
| `count_mismatch` (heading vs corpus) | per base file | none — §1.1.4, probe 2 |
| `identity_mismatch` (row vs path) | per base file | none |
| `stage_without_rows` | per base file | none |
| `missing_filing` | per base file | none |
| **`missing_arc_filing`** | **per branch directory** | **new (§3.1 clause B)** |

Per-base contiguity forced the reset only because the *threshold* was also per base. Once the threshold sums distinct `(baseSha, round)` pairs, renumbering from 1 at a new base is arithmetically free: `(A,1) (A,2) (A,3) (B,1)` is four pairs, and so is `(A,1) (A,2) (A,3) (B,4)`. The three-part shape is the one already on disk — **contiguity per base, sum per arc, and a `_roundAtPreviousBase` cross-reference linking the bases for a human reader.**

Keeping contiguity also preserves what it is for: it detects rows lost or hand-edited *within* a file, a diagnosis that has nothing to do with base moves.

### §3.3 The grandfather set

<!-- spec-lint: ignore — new file created by this spec's implementation; not yet tracked -->
A new module `lib/reviewRounds/arcSumGrandfather.ts` exports the 11 pairs from probe 1 as a literal, plus the freeze timestamp:

```ts
export const ARC_SUM_FREEZE = "2026-08-22T00:00:00.000Z";
export const ARC_SUM_GRANDFATHERED: readonly { branch: string; stage: CountedStage }[] = [ … ];
export function isArcSumGrandfathered(branch: string, stage: string): boolean;
```

`(branch, stage)` and not a path, because clause B's obligation is not attached to any one base — that is the whole point of it. The lookup builds a `Set` keyed on `` `${branch} ${stage}` `` at module load, matching the separator `readArcs` already uses for the same reason (`lib/reviewRounds/corpus.ts:124`): the hash, dash and colon characters are all legal in git branch names and would collide.

**Additions are rejected structurally, not by convention.** Three assertions in the meta-test, each over the *live* corpus:

1. **Every grandfathered pair's counted rows all carry a `startedAt` strictly before `ARC_SUM_FREEZE`.** A row with `startedAt: null` cannot be proven older and therefore fails — conservative and loud (measured: 0 such rows among the 11). Every row written from now on postdates the freeze, so **no future arc can be added to the set at all.** This is the structural rejection; the prose contract in the header comment is a description of it, not the mechanism.
2. **Every grandfathered pair still owes under clause B.** An entry whose arc has since gained a filing, or whose rows were deleted, is stale and fails — so the set can only **shrink**, exactly like `MECHANIZABLE_GRANDFATHERED`.
3. **The set holds exactly 11 entries**, the dated count from probe 1, as a second lock against a silent edit.

Fixture-planted arcs are never in the set, so meta-test fixtures exercise clause B by default; one fixture plants a grandfathered pair to cover the exemption branch, and one plants a pair with a post-freeze row to cover the addition guard.

**Every coordinate of a compound key gets its own control (spec review R2).** The exemption key is `(branch, stage)`, and a battery that varies only the branch cannot tell it from a key on `branch` alone — under which every OTHER counted stage on a grandfathered branch becomes silently exempt, and the report-equals-gate assertion passes too, because both consumers share the one widened predicate. So each coordinate is varied with the others held fixed, and the rule generalizes to any coordinate added later.

**Mutation cannot stand in for these controls, and this is why.** The declared operator set is `relational-boundary`, `equality-flip`, `logical-connector`, `integer-literal`, `regex-quantifier-bound`, `statement-removal` (`tests/mutation/source/operators.ts:17`). None of them can drop a coordinate from a key expression, so no mutant of any enrolled file expresses this defect and no score would have fallen. That is a **documented limit of the mutation gate on this surface** (§4 limit 8), not a gap in the registry, and it is the reason the coordinate controls are executable fixtures rather than a scoring claim.

The same reasoning is why the grandfather module stays out of the registry: with the predicate's conjunction living in the enrolled `corpus.ts`, the module holds a frozen list and a timestamp and nothing an operator could meaningfully mutate.

### §3.4 The report (`pnpm review:economy`)

The report is the reader that made the defect invisible. It prints one line per `(branch, base)` — `chore/archive-duplicate-ids` appears as two `diff 2/2` lines with nothing showing the 4 — so a reader scanning it sees two short arcs and no obligation.

For every branch directory with more than one base, the report gains a **totals line** listing each counted stage's arc sum. It gates nothing; the meta-test does.

**The report never reimplements a gate predicate — it imports the one the gate uses.** This is the structural rule, stated before the two sites it fixes, because a second copy of the obligation test is what let the report and the gate disagree in the first place. Spec review round 1 found both instances of that one class, and it has exactly two:

1. **The mark on the totals line is clause B's own predicate**, grandfather included. Marking on "sum at threshold and no section" alone would flag all 11 frozen pairs, permanently, in a report whose whole job is to be read — the standing false signal §1.1.6 rejects, reintroduced one section later by the same document. Grandfathered pairs print on their own line, labelled as frozen evidence, so they stay visible as history rather than as debt.
2. **`triggerRateByMonth` moves to the arc unit** (`scripts/review-economy.ts:196`). It currently populates per `(branch, baseSha, stage)` and tests the threshold within one base file, so it is the defective model in the report's headline number. Population becomes `(branch directory, stage)`, bucketed by the first counted row's month across the whole directory, and the test becomes the sum.

Both numerator and denominator move, so the published figure changes without any behavior changing (probe 5). The report says so on the line itself rather than leaving a reader to conclude the repo got better at filing.

**What deliberately does NOT move.** The per-`(branch, base)` listing stays — it names where rows actually live, and the totals line sits above it rather than replacing it. `silentArcs` stays joined on `(branch, baseSha)`: a silent arc is a merge that recorded nothing at all, which is a per-merge question that applies no threshold, and `scripts/review-economy.ts:267` joins on `arcKey`, and the comment above it already records why joining on branch alone would be wrong there. The derived cover for "did anything else move" is every site comparing against `ROUND_THRESHOLD` outside `constants.ts` and the fixtures — `lib/reviewRounds/corpus.ts:236` (clause A, unchanged), the two sites above, and `scripts/review-economy.ts:395`, whose prose line stops describing one base as the unit.

### §3.5 Author-facing contract (`docs/review-rounds/README.md`)

The filing-duty section gains: the threshold is reached either by one base's rounds or by the arc's rounds summed across its bases, counting distinct `(base, round)` pairs; a re-merge restarts `--round` at 1 by design and the arc sum is unaffected; the first row at a new base should carry `_roundAtPreviousBase` for traceability; a filing owed by the arc sum goes at the latest base holding rows for that stage, its heading declares **that file's** count, and its `**Examined:**` line names the cross-base total.

## §4 Documented limits

1. **A reused branch name sums two unrelated PRs.** Direction: **over-obligation** — a filing demanded where two short PRs shared a name — which the 2026-08-04 spec §8.2 already rules a documented limit costing one `**Mechanizable:** none` line. Zero live instances (probe 3), and the four reused names in history all predate the corpus. The alternative — partitioning a directory's bases by the merge commits of that branch on main — is **not implementable in this gate**: `mergedArcs` declines outright on a shallow clone (`lib/reviewRounds/mergedArcs.ts:46`) and CI checks out at depth 1 by design, so a git-ancestry partition would silently do nothing in the only environment that matters.
2. **One filing section per stage discharges the whole directory, however many rounds follow it.** An arc that files for `diff` at its first base and then burns three more diff rounds at each of two later bases owes nothing further: the section exists, so clause B is satisfied. Only clause A can re-oblige it, and only if some single later base reaches the threshold on its own.

   This is the existing contract, not a new hole. A single-base arc that files at round 4 and then burns ten more rounds at the same base is likewise never re-obliged — `missing_filing` asks whether a section exists, not whether it is current. What keeps that honest at one base is `count_mismatch`, which forces the heading to keep declaring the true count; across bases there is no later section for it to hold to account. Closing it needs a declared cross-base total on the filing, which would red the 37 sections probe 2 measured, so it is fenced here rather than repaired (§7).

   **The reused-branch-name case is this limit's worst instance**, and it is the one under-obligation direction the change carries: a reused name whose first PR filed for a stage, whose second PR re-merges so no base of its own reaches the threshold, and whose rounds therefore hide behind the first PR's section. All three conditions, zero live instances (probe 3), and not a regression — that arc escapes under today's rule too, since none of its bases reaches the threshold either. Monotonicity (§1.1.5) is what guarantees that reading.
3. **A clause-B filing's heading declares its own base's count, not the arc sum** (§1.1.4). `## diff — 1 rounds` on a five-base arc is legal and reads oddly; the `**Examined:**` line carries the real span, and the gate does not judge prose (2026-08-04 §7.2).
4. **The grandfather set is 11 pairs of merged arcs and will never be complied with.** It is frozen evidence, not a queue. It shrinks only if one of those arcs is retroactively filed or its rows are deleted.
5. **`_roundAtPreviousBase` is unvalidated and unconsulted** (§1.1.7). A wrong value, or its absence, changes no gate outcome.
6. **Rows never committed stay invisible**, inherited unchanged from the 2026-08-04 spec §8.3 limit 2. Clause B reads the committed corpus like clause A.
7. **A branch directory renamed or deleted loses its history**, inherited from §8.3 limit 3's rename half. Only the base-move half of that limit is repaired here.

8. **The mutation gate cannot express coordinate omission on these surfaces.** No operator in the declared set (`tests/mutation/source/operators.ts:17`) drops a coordinate from a key expression, so a predicate silently keyed on `branch` alone, or a stage-blind clause B, produces no surviving mutant and costs no score. The coordinate controls in §5 are the guard; the score is not, and `scoreFloor: 1` must not be read as covering it.

## §5 Testing (TDD per task)

**`tests/reviewRounds/count.test.ts`** — `arcCountedRounds(rows)`: distinct `(baseSha, round)` pairs; the same round number at two bases counts **twice** (the renumbering case, the exact defect); the same `(base, round)` at two rows counts **once** (a parallel wave); `no_verdict` rows and `stage: "task"` rows never contribute; a counted `spec` row never raises `diff`'s count (the stage coordinate control); an empty input is 0, not `NaN`.

**`tests/docs/_metaReviewRoundEconomy.test.ts`** — fixtures, each a planted branch directory:

- 2 counted diff rounds at base A + 2 at base B, no filing → `missing_arc_filing`. **The core new assertion.**
- The same arc with a filing section at A → passes. Again with it at B → passes.
- **The satisfaction recognizer (R4 F1):** the same 2 + 2 directory plus a NON-arc-shaped `.md` under it carrying a parseable `## diff` section → still reports `missing_arc_filing`. The stray file is ignored prose to `readArcs`, and a "any `.md`" implementation would let it discharge a real obligation while the canonical reader sees no filing. Paired with the accepting direction already in the suite, so the recognizer is pinned from both sides.
- Rounds `1,2` at A and `1,2` at B → fires: four pairs from colliding round values.
- 4 rounds at one base, no filing → `missing_filing` and **not** `missing_arc_filing` (no double report).
- 5 at A unfiled + 2 at B → exactly one problem, from clause A.
- 4 at A **with a section at A**, + 2 at B + 2 at C → clean. The §3.1 equivalence fixture: a threshold base whose obligation is already discharged, plus later bases the sum can see. It is also limit 2's accepting direction, so the fence is executable rather than asserted.
- 3 + 0 across two bases → passes (below threshold).
- 2 + 2 of `stage: "task"`, and 2 + 2 of `status: "no_verdict"` → pass.
- A grandfathered `(branch, stage)` at 2 + 2 → passes; the identical shape on a non-grandfathered branch → fires. One fixture, two directories, so the exemption cannot pass by accident.
#### The coordinate-control matrix

Rounds 2 and 3 both landed here, and the second time was my fault rather than the reviewer's: R2's repair stated the rule as prose ("one control per coordinate") and then instantiated it by hand, which missed two cells. **A rule a human applies by hand is not a mechanism.** So the battery is DERIVED from the key list instead, as a table with one row per `(key, coordinate)`. A missing control is then a visibly empty cell in this document rather than something a reviewer has to re-derive, and adding a key or a coordinate later adds rows rather than requiring anyone to remember the rule.

**The rows are enumerated from the DECISIONS the code makes, not from the data structures I could picture.** That distinction is plan review round 3's finding and it cost a round: the first version listed "clause B's obligation key" as one row, when clause B makes THREE decisions that each key on `(directory, stage)` — it counts rows into a sum, it looks up whether a filing section exists, and it decides whether clause A already reported. A battery controlling only the first admits an implementation that collects filing sections globally, or ignores the filing's stage, or suppresses across every directory, or suppresses every stage in one directory. All four pass a count-only battery and all four silently drop a real obligation.

So the enumeration is: for each decision the change makes, for each coordinate of that decision's key, one control varying exactly that coordinate.

| decision | keys on |
| --- | --- |
| K1 count rows into a per-stage sum | `(baseSha, round)` within a stage |
| K2a count into the per-directory obligation | `(directory, stage)` |
| K2b look up whether a filing section satisfies it | `(directory, stage)` |
| K2c decide whether clause A already reported | `(directory, stage)` |
| K3 decide whether the pair is exempt | `(branch, stage)` |
| K4 populate the trigger rate | `(directory, stage)` |

Thirteen controls follow:

| key | coordinate | control - vary this one, hold the others fixed | must |
| --- | --- | --- | --- |
| K1 `arcCountedRounds`: stage to a set of `(baseSha, round)` | `baseSha` | one round number, two bases | count 2 |
| K1 | `round` | one base, two round numbers | count 2 |
| K1 | `stage` | a counted `spec` row at a third base | not raise `diff`'s count |
| K2a obligation count | `directory` | an owing directory, plus a LATER below-threshold directory | the owing one still reports |
| K2a | `stage` | one directory, 2 counted `diff` plus 2 counted `spec` | stay clean |
| K2b satisfaction lookup | `directory` | an owing directory, plus a DIFFERENT directory carrying a recognized filing | the owing one still reports |
| K2b | `stage` | an owing `diff` directory whose only section is `## spec` | still reports |
| K2c suppression | `directory` | one directory at per-base threshold unfiled, plus a SECOND owing only by sum | the second still reports |
| K2c | `stage` | one directory where `diff` is at per-base threshold unfiled and `spec` owes only by sum | `spec` still reports |
| K3 grandfather exemption: `(branch, stage)` | `branch` | the grandfathered shape on a non-grandfathered branch | report |
| K3 | `stage` | a grandfathered branch carrying a DIFFERENT counted stage | report |
| K4 trigger-rate population: `(directory, stage)` | `directory` | one stage spanning two bases of one directory | population 1, triggered |
| K4 | `stage` | one directory with two counted stages | population 2, not 1 |

Thirteen controls. K2a's `directory` row and K4's `stage` row were spec round 3's findings; the whole K2b and K2c blocks were plan round 3's, and they are the reason the table is now indexed by decision rather than by data structure. The two wrong implementations they exclude are worth naming, because neither is exotic: a clause-B accumulator keyed on stage alone, where each directory's state overwrites the last, and a trigger-rate population keyed on directory alone, which reports a denominator of 125 where the unit gives 282.

#### Values are asserted, never presences

R3 finding 3, and a different class from the matrix: the report battery asserted that the totals line APPEARS and is MARKED, never what number it displays. The gate and `arcCountedRounds` can both be correct while the report computes its own total by deduplicating bare `round` values, and every specified assertion still passes over a line stating the wrong number. Measured over the live corpus, **44 of 282 arc-stage totals** differ between distinct `round` and distinct `(baseSha, round)`, the largest being `chore/guard-completeness-wave diff` at 7 against 4. (The reviewer reported 264, with sample rows showing `roundOnly=1`; re-derived by command it is 44 and those values are 2, 4, 2, 5, 2, 3. The gap is real, the magnitude was not, and it is recorded here so a later round does not inherit the wrong figure.)

R4 then landed two more instances of the same class, which means the R3 repair had the same defect as the R2 one: a rule stated in prose and instantiated by hand. **Third occurrence of that pattern, so the vector is declared and closed the way the matrix closed its own** — by enumeration of the thing itself rather than of the tests. The question "what does this change make the code compute?" is finite and answerable, so here is all of it, and every row is asserted by value:

| # | computed value | asserted by value in |
| --- | --- | --- |
| V1 | `arcCountedRounds`'s per-stage sum | `tests/reviewRounds/count.test.ts` |
| V2 | the `missing_arc_filing` message's total | the meta-test |
| V3 | that message's per-`(baseSha, stage)` breakdown, each entry | the meta-test — **R4 F2** |
| V4 | the totals line's per-stage arc sums | `tests/reviewRounds/report.test.ts` |
| V5 | the totals line's mark, as set equality with the gate's `missing_arc_filing` set | the report test |
| V6 | the frozen line's membership | the report test |
| V7 | the trigger-rate population | the report test |
| V8 | the trigger-rate triggered count | the report test |
| V9 | the trigger-rate month bucket — the directory-wide EARLIEST counted row, never the first base enumerated | the report test — **R4 F3** |
| V10 | the trigger-rate `rate` — a THIRD stored field on the bucket (`scripts/review-economy.ts:197`), rendered independently of the fraction beside it | the report test — **R5 F1** |
| V11 | the rate line as RENDERED, verbatim (`  2026-08  213/282  75.5%`) | the report test |

**V10 is R5's finding, and the way the inventory failed a third time is the point.** `triggerRateByMonth[month]` stores three fields — `population`, `triggered`, `rate` — and the hand-written inventory listed the first two. A hybrid implementation updates both, leaves `rate` computed from the per-base model, and publishes `213/282  57.8%`: a fraction and a percentage on one line that disagree, each individually passing its row.

**So the inventory is now derived from the `Report` type rather than from memory** (`scripts/review-economy.ts:11-25`), field by field over every structure this change writes: `triggerRateByMonth` contributes three fields plus its key, and `arcs`, `malformedRows`, `findingsByStage` and `silentArcs` are untouched.

**And V11 is the belt the field inventory cannot be, which is why it exists.** Asserting the rendered LINE verbatim catches `population`, `triggered`, `rate` and the month simultaneously, including any disagreement between the struct and its rendering — the exact shape of R5's finding. A field inventory can always omit a field; a rendered-line assertion cannot omit anything the reader sees. **Every line this change adds or alters is asserted verbatim as rendered**, and the field rows above are the diagnosis when one fails.

V3 and V9 are R4's findings and were the two rows the hand-written list omitted. V3 matters because the breakdown is a new diagnostic computed per `(baseSha, stage)`, and a stage-blind rendering is wrong on **7 of the 11** newly-owing pairs while every matrix cell still passes. V9 matters because "first enumerated base" and "earliest across the directory" disagree the moment a directory's bases are not in chronological order, and K4's population-and-triggered control cannot see the difference.

A presence-only assertion is what lets a wrong number through, and a hand-written list of values is what lets a whole value through.
- **Addition guard:** a grandfathered pair with one row `startedAt` after `ARC_SUM_FREEZE` fails; the same with `startedAt: null` fails.
- **Set hygiene over the real corpus:** all 11 pairs still owe; all their rows predate the freeze; the set is exactly 11.
- **Monotonicity:** every fixture that fires a per-base problem today fires the same problem after the change, asserted by kind.
- **Live corpus is clean** (existing case, line 1020) stays green — the acceptance for the whole change.
- **Walker default:** a brand-new fixture directory at 2 + 2 fires with no test edit, pinning §1.1.8.

**`tests/reviewRounds/report.test.ts`** — the totals line appears for a multi-base directory and is absent for a single-base one; a stage at threshold by sum with no section anywhere is MARKED; a **grandfathered** pair in the same state is NOT marked and prints on the frozen line instead (spec review R1 finding 1, in its accepting direction, so the fence is executable); `triggerRateByMonth` populates per `(branch directory, stage)` and counts a spanning arc as triggered where the per-base unit counted it as two untriggered pairs (R1 finding 2); and the rate line carries the unit change on its face. The mark and clause B are asserted to come from ONE predicate — the report's marked set equals the gate's `missing_arc_filing` set over the same fixture corpus — which is the executable form of §3.4's structural rule and the assertion that would have caught both R1 findings.

**Mutation enrolment (enrolment precedes review).** `lib/reviewRounds/count.ts` (`reviewRoundCount`, `tests/mutation/source/registry.ts:1343`) and `lib/reviewRounds/corpus.ts` (`reviewRoundCorpus`, `tests/mutation/source/registry.ts:1767`) are already enrolled, and this change edits both. `pnpm mutation:guards` runs **before** the round-1 diff dispatch, and the brief carries a `GUARD SURFACE:` line per surface with its score and "0 unaccepted survivors". The new grandfather module is a data literal with no branching and is not enrolled; the assertions that police it are the three in §3.3.

## §6 Documentation fan-out

- `docs/review-rounds/README.md` — §3.5.
- `AGENTS.md`, round-economy bullet — the counted-rounds sentence gains the arc sum and cites this spec.
- `docs/superpowers/specs/ci/2026-08-04-review-round-economy.md` — dated cross-reference lines at §4.3 (the threshold's unit), §5.2 (which currently ratifies a base move splitting the arc and under-obliging it), §5.4 (the counting rule) and §8.3 limit 3, each pointing here. Four places, matching the sweep that found them. No restatement; two copies drift.
- `docs/superpowers/specs/ci/README.md` — index row.
- `BACKLOG.md` — `BL-REVIEW-ROUND-COUNT-RESETS-ON-REMERGE` archived on merge, its interim rule retired.

## §7 Non-goals

- No change to `round` semantics, to `--round`, or to the wrapper's emission path. `codex-guard.mjs` is untouched.
- No retroactive filings, no backfilled rows, no edits to any merged filing.
- No git-ancestry partitioning of a directory's bases (§4 limit 1 — unavailable on a shallow clone).
- No arc-sum requirement on a filing heading's declared count (§1.1.4), and no new cross-base total field on a filing. Either would red the 37 sections probe 2 measured, and both are the repair §4 limit 2 fences off.
- No anti-tamper posture; the 2026-08-04 spec §8.1 fence is inherited whole.
- No third ledger, no registration of arcs (§1.1.8).

## Convergence criterion (for this spec's own reviews)

**Consequence bound:** every arc is correctly obliged, correctly exempt, or loudly refused — never silently unobliged. Over-obligation costs one `**Mechanizable:** none` line and files to §4 as a documented limit, not a finding.

**PROBE DOMAIN:** the live `docs/review-rounds/**` corpus at merge base `50ca72a56` — 126 branch directories, 61 multi-base — plus the branch directories planted as fixtures by `tests/docs/_metaReviewRoundEconomy.test.ts`. A probe over a constructed corpus more than one ordinary edit away from a live directory files to §4.

**Threat-model fence:** merge-timing accounting artifacts produced by ordinary arcs following the AGENTS.md closure-hit rule. An arc that hides rounds — deleting rows, hand-editing the corpus, timing a re-merge to dodge a filing — is out of scope by declaration and inherits the 2026-08-04 spec §8.1 fence.

**Closed criterion:** the threshold sums per arc over distinct `(baseSha, round)` pairs; `pnpm vitest run tests/docs/_metaReviewRoundEconomy.test.ts` is green over the entire live corpus with the 11 grandfathered pairs named and no twelfth; and the forbidden-workaround case — colliding round numbers across bases — is covered by an executable fixture. All three are settled by command, not by opinion.

**Score:** stated per §5 in the round-1 diff brief.
