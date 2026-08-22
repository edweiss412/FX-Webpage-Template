# Plan — review-round arc sum

**Spec:** `docs/superpowers/specs/ci/2026-08-22-review-round-arc-sum.md` (canonical; §3.1 is the rule, §3.3 the grandfather contract, §4 the documented limits) · **Ledger row:** `BL-REVIEW-ROUND-COUNT-RESETS-ON-REMERGE` (`BACKLOG.md`) · **Branch:** `feat/review-round-arc-sum` · **Implementer:** Opus / Claude Code

Docs plus tests plus two `lib/` modules. No UI surface, no DB, no advisory locks, no Playwright.

**impeccable-gate: N/A — no UI surface** (nothing under `app/`, `components/`, `app/globals.css`, `DESIGN.md`, or a Tailwind config).

## Meta-test inventory

- **EXTENDS** `tests/docs/_metaReviewRoundEconomy.test.ts` — the corpus gate. New fixtures for clause B, its suppression, the grandfather exemption, and the addition guard in both directions.
- **EXTENDS** `tests/reviewRounds/count.test.ts` and `tests/reviewRounds/report.test.ts`.
- **EXTENDS** `tests/mutation/source/registry.ts` and `tests/mutation/source/expectedLedgerKinds.ts` — both enrolled rows' accepted-siteId sets are line-keyed and this arc shifts their lines (Task 7).
- **CREATES** no new meta-test. The gate this arc changes IS the structural meta-test for its own subject; a second one over the same corpus would be a second definition of the same rule.
- `tests/auth/_metaInfraContract.test.ts`, `tests/log/_metaMutationSurfaceObservability.test.ts`, `tests/auth/advisoryLockRpcDeadlock.test.ts`: **N/A** — no Supabase call boundary, no mutation surface (no route handler, no `"use server"` action), no `pg_advisory*` call anywhere in the diff.

## Mutation-family closure

Both surfaces are enrolled (`tests/mutation/source/registry.ts:1343` for `reviewRoundCount` and `tests/mutation/source/registry.ts:1767` for `reviewRoundCorpus`), each with `operators: [...OPERATOR_NAMES]` and `scoreFloor: 1`. The closure set this arc converges against is therefore **the registry's declared operator set applied to the post-change files**, and the convergence criterion is the score plus an empty unaccepted-survivor set — both machine-computed. A reviewer-proposed new family is admissible only with a live escaping mutant demonstrated against the shipped guard.

Two mechanical constraints follow from the enrolment, and both are easy to trip:

1. **`reviewRoundCorpus.control` must stay a UNIQUE substring.** It is `"if (n < ROUND_THRESHOLD) continue;"` (`tests/mutation/source/registry.ts:1775`). Clause B introduces a second threshold comparison in the same file, so clause B is written over a differently-named binding — `if (arcSum < ROUND_THRESHOLD) continue;` — and never as a second copy of the control string.
2. **Accepted siteIds are LINE-KEYED and this arc moves those lines.** `reviewRoundCorpus.accepted` holds `statement-removal:79:7:continue;>(removed)` and `relational-boundary:146:25:<><=`; the row's own comment records them being re-derived once already, after the enforcement-pair arc shifted the file by two lines. Task 7 re-derives them from the run rather than editing the numbers by hand.

## Files

- `lib/reviewRounds/count.ts` — add `arcCountedRounds`.
<!-- spec-lint: ignore — new file created by this plan's Task 2; not yet tracked -->
- `lib/reviewRounds/arcSumGrandfather.ts` — **new**: the 11 pairs, `ARC_SUM_FREEZE`, `isArcSumGrandfathered`.
- `lib/reviewRounds/corpus.ts` — `missing_arc_filing` and clause B.
- `scripts/review-economy.ts` — per-directory totals line; the trigger-rate bucket learns the sum.
- `tests/reviewRounds/count.test.ts`, `tests/reviewRounds/report.test.ts`, `tests/docs/_metaReviewRoundEconomy.test.ts`.
- `tests/mutation/source/registry.ts`, `tests/mutation/source/expectedLedgerKinds.ts`.
- `docs/review-rounds/README.md`, `AGENTS.md`, `docs/superpowers/specs/ci/2026-08-04-review-round-economy.md`, `docs/superpowers/specs/ci/README.md`.
- `BACKLOG.md` → `BACKLOG-archive.md`.

## Acceptance criteria

| id | criterion | command |
| --- | --- | --- |
| AC-1 | `arcCountedRounds` counts distinct `(baseSha, round)` pairs per stage: colliding round numbers at two bases count twice, a repeated `(base, round)` counts once, `no_verdict` and `task` rows never contribute. | `pnpm vitest run tests/reviewRounds/count.test.ts` |
| AC-2 | An arc at threshold only by its sum, with no filing section anywhere under its directory, reports `missing_arc_filing`. | `pnpm vitest run tests/docs/_metaReviewRoundEconomy.test.ts` |
| AC-3 | The same arc passes once any one `.md` under the directory carries a section for that stage, at either base. | `pnpm vitest run tests/docs/_metaReviewRoundEconomy.test.ts` |
| AC-4 | One unmet obligation produces one message: a base at threshold with no filing reports `missing_filing` and never also `missing_arc_filing`. | `pnpm vitest run tests/docs/_metaReviewRoundEconomy.test.ts` |
| AC-5 | The §3.1 equivalence holds: a threshold base carrying its own section, plus later bases below threshold, is clean. | `pnpm vitest run tests/docs/_metaReviewRoundEconomy.test.ts` |
| AC-6 | Exemption requires BOTH list membership AND pre-freeze rows, and neither alone: a pair NOT in the 11 whose rows all predate `ARC_SUM_FREEZE` still reports, and a LISTED pair carrying a post-freeze row (or a `startedAt: null` row) fails the addition guard. | `pnpm vitest run tests/docs/_metaReviewRoundEconomy.test.ts` |
| AC-7 | Over the real corpus: every one of the 11 grandfathered pairs still owes under clause B, every one of their counted rows predates `ARC_SUM_FREEZE`, and the set holds exactly 11 entries. | `pnpm vitest run tests/docs/_metaReviewRoundEconomy.test.ts` |
| AC-8 | Monotonicity: every per-base problem the gate reports today is still reported, by kind, after the change. | `pnpm vitest run tests/docs/_metaReviewRoundEconomy.test.ts` |
| AC-9 | The live corpus is clean. | `pnpm vitest run tests/docs/_metaReviewRoundEconomy.test.ts` |
| AC-10 | `pnpm review:economy` prints a totals line for a multi-base directory, omits it for a single-base one, and marks a stage at threshold with no section anywhere. | `pnpm vitest run tests/reviewRounds/report.test.ts` |
| AC-13 | The report never reimplements a gate predicate: its marked set equals the gate's `missing_arc_filing` set over the same fixture corpus, so a grandfathered pair is not marked. | `pnpm vitest run tests/reviewRounds/report.test.ts` |
| AC-14 | `triggerRateByMonth` populates per `(branch directory, stage)` and tests the arc sum, and the rate line says the unit changed. | `pnpm vitest run tests/reviewRounds/report.test.ts` |
| AC-15 | **All nine cells** of the spec's coordinate-control matrix are implemented, one per `(key, coordinate)` across K1-K4. The matrix is copied verbatim into Task 3's body; a cell without a test is an unmet AC. | `pnpm vitest run tests/docs/_metaReviewRoundEconomy.test.ts tests/reviewRounds/count.test.ts tests/reviewRounds/report.test.ts` |
| AC-16 | **All eleven rows** of the spec's computed-value inventory (V1-V11), including V11's verbatim rendered-line assertion for every line this change adds or alters are asserted BY VALUE, not by presence. The inventory is copied verbatim into Task 6's body; a row without a by-value assertion is an unmet AC. | `pnpm vitest run tests/reviewRounds/report.test.ts tests/docs/_metaReviewRoundEconomy.test.ts tests/reviewRounds/count.test.ts` |
| AC-17 | A non-arc-shaped `.md` under a branch directory carrying a parseable `## diff` section does NOT discharge a clause-B obligation: only a filing `readArcs` recognizes does. | `pnpm vitest run tests/docs/_metaReviewRoundEconomy.test.ts` |
| AC-11 | Both enrolled surfaces score at their `scoreFloor` of 1 with an empty unaccepted-survivor set, and `expectedLedgerKinds` matches the re-derived accepted sets. | `VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm heavy pnpm exec vitest run --project mutation tests/mutation/guardSurfaces.gates.test.ts` |
| AC-12 | This arc's own corpus rows satisfy the rule it ships (eat-your-own-cooking; §1.1 of the spec is written against it). | `pnpm vitest run tests/docs/_metaReviewRoundEconomy.test.ts` |

## Reconciliation sweeps — authored AND RUN at plan time

**Sweep 1 — prose that states the per-base counting rule.** Run 2026-08-22 at `50ca72a56`:

```
$ grep -rn 'distinct `round` values\|counted per\|per base file' \
    AGENTS.md docs/review-rounds/README.md \
    docs/superpowers/specs/ci/2026-08-04-review-round-economy.md
docs/review-rounds/README.md:22   "Counted means distinct `round` values among rows with status verdict…"
AGENTS.md:190                     "counted = distinct `round` values on rows with status: verdict…"
…/2026-08-04-review-round-economy.md:86    "§4.3 ROUND_THRESHOLD = 4, counted per (arc, stage), where an arc is (branch, baseSha)"
…/2026-08-04-review-round-economy.md:159   "§5.4 The threshold counts distinct `round` values among rows with status === verdict"
```

Four hits, each dispositioned in Task 8: README.md:22 and AGENTS.md:190 gain the arc sum; spec §4.3 and §5.4 gain a dated cross-reference, not a restatement. §8.3 limit 3 gains one too — it currently ratifies the under-obligation this arc repairs, so leaving it would put two live contracts in the corpus.

**Sweep 2 — every `ROUND_THRESHOLD` consumer**, so no reader is left counting per base while the gate sums. Run 2026-08-22; the consumers outside `constants.ts` are `lib/reviewRounds/corpus.ts:236` (clause A, unchanged), `scripts/review-economy.ts:196` (the trigger-rate bucket, which counts `new Set(rows.map(r => r.round)).size` **per base** and is dispositioned in Task 6), `scripts/review-economy.ts:395` (the prose line "filing threshold: 4 counted rounds in one stage", reworded in Task 6), `tests/mutation/source/registry.ts:1775` (the control string, constraint 1 above), plus test fixtures that derive from the constant and need no edit.

**Sweep 4 — is there a third reader?** Spec review R1 found both of its findings in the report, which raises the question the sweep-2 cover cannot answer: does anything ELSE read the corpus and reason about the threshold? Derived cover, run 2026-08-22 — `grep -rn 'readArcs\|checkCorpus\|countedRounds' --include='*.ts' --include='*.mjs' lib scripts tests`, excluding the two modules that define them. Production consumers: `scripts/review-economy.ts:137` and `scripts/review-economy.ts:146` (the report) and `tests/docs/_metaReviewRoundEconomy.test.ts` (the gate). **Two, and no third.** Everything else in the output is a test assertion or a comment. The reader class is therefore closed, and Task 6 covers all of it.

**Sweep 3 — registry count reconciliation.** `tests/mutation/source/expectedLedgerKinds.ts:204` declares `reviewRoundCount: {}` and `tests/mutation/source/expectedLedgerKinds.ts:210` declares `reviewRoundCorpus: { equivalent: 2 }`, matching the two accepted rows at `tests/mutation/source/registry.ts:1783` and `tests/mutation/source/registry.ts:1789`. Task 7 re-runs the harness and pastes the re-derived set; any delta lands in the same commit as the code that caused it.

## Tasks

<!-- tasks: depth=3 red-contract -->

### Task 1 — `arcCountedRounds`

<!-- task: red=`pnpm vitest run tests/reviewRounds/count.test.ts` red-state=authored red-target=`lib/reviewRounds/count.ts:28` why=`count.ts exports countedRounds and nothing that keys on baseSha, so the new import does not resolve, the suite cannot collect, and the colliding-rounds case never runs` ac=AC-1,AC-15 -->

**RED.** Add to `tests/reviewRounds/count.test.ts`, importing `arcCountedRounds`:

- rows at base `aaaaaaaaaaaa` rounds 1..3 plus base `bbbbbbbbbbbb` round 1 → `diff` is `ROUND_THRESHOLD`. This is the defect's exact shape: the renumbered row is a fourth pair, where `countedRounds` sees only three distinct values.
- rows at two bases both numbered 1 and 2 → 4.
- two rows sharing one `(base, round)` → 1 (a parallel wave counts once, matching `countedRounds`).
- a `no_verdict` row and a `stage: "task"` row at a third base → contribute nothing.
- a counted `spec` row at a third base → does not raise `diff`'s count. The stage coordinate control (AC-15): without it, a map keyed on the pair alone and not the stage passes every other case here.
- `arcCountedRounds([])` → an empty map, and `.get("diff") ?? 0` is `0`.

The concrete failure mode: without the base in the key, an arc that renumbers after a re-merge undercounts by exactly the number of rounds at every base after the first.

**GREEN.** `export function arcCountedRounds(rows: ReviewRoundRow[]): Map<Stage, number>` beside `countedRounds`, sharing its two counting conjuncts and keying its per-stage set on `` `${r.baseSha} ${r.round}` `` — the separator `corpus.ts:124` already uses, because it cannot occur in either field. The doc comment states why the key is the pair and not the round.

### Task 2 — the grandfather module

<!-- task: red=`pnpm vitest run tests/docs/_metaReviewRoundEconomy.test.ts` red-state=authored red-target=`lib/reviewRounds/corpus.ts:24` why=`the ProblemKind union ends at mechanizable_untracked with no missing_arc_filing member, so the clause-B fixture's expected kind is a value checkCorpus can never return and the array comparison fails against an empty result` ac=AC-2,AC-6,AC-15 -->

**RED.** Fixtures in `tests/docs/_metaReviewRoundEconomy.test.ts` planting a two-base directory under feat/foo — one base file with two counted diff rounds and a second with two more (each row's `baseSha` overridden to match its path, or `identity_mismatch` fires first and the case proves nothing) — asserting exactly `["missing_arc_filing"]`.

<!-- spec-lint: ignore — new file created by this task; not yet tracked -->
**GREEN.** New `lib/reviewRounds/arcSumGrandfather.ts` exporting `ARC_SUM_FREEZE = "2026-08-22T00:00:00.000Z"`, the 11 `{ branch, stage }` pairs from the spec's probe 1, and `isArcSumGrandfathered`. Header comment carries the §3.3 contract: closed historical set, frozen at this arc's landing, never added to (the freeze makes that structural, not aspirational), removed only when a pair stops owing. Then clause B in `checkCorpus`, grouping the already-read arcs by `arc.branch`, reported with the directory, the sum, and the per-base breakdown in the message.

### Task 3 — suppression, satisfaction, and the coordinate-control matrix

<!-- task: red=`pnpm vitest run tests/docs/_metaReviewRoundEconomy.test.ts` red-state=authored red-target=`lib/reviewRounds/corpus.ts:236` why=`clause A returns before clause B is consulted for that stage only if Task 2 wired the suppression, and at this point it has not, so the base-at-threshold fixture reports both missing_filing and missing_arc_filing where the case asserts exactly one` ac=AC-3,AC-4,AC-5,AC-15,AC-17 -->

**Copy the spec's coordinate-control matrix into this task body verbatim and implement every row.** Nine cells across four compound keys. Spec rounds 2 and 3 both landed on this one axis, and the second time was because R2's repair was a prose rule instantiated by hand — so the matrix, not the rule, is what this task follows. A cell with no test is an unmet AC-15, visible as an empty row rather than as something a reviewer must re-derive.

The two cells that hand-instantiation missed, since they are the ones most likely to be skipped again:

- **K2 `directory`** — an owing directory PLUS a later below-threshold directory; the owing one must still report. Excludes a clause-B accumulator keyed on stage alone, where each directory overwrites the last. Both stated two-directory fixtures elsewhere in this plan give their directories the same obligation state, so none of them discriminates this.
- **K4 `stage`** — one directory with two counted stages must give a population of 2, not 1. Excludes a trigger-rate population keyed on directory alone, which over the live corpus reports 125 where the unit gives 282.

**RED.** Three fixtures: the Task 2 directory with a `.md` at base A carrying a diff section → clean; the same with the section at base B instead → clean; a directory with `ROUND_THRESHOLD` rounds at base A and two at base B, no filing → exactly `["missing_filing"]`. Then the equivalence fixture from spec §5: `ROUND_THRESHOLD` rounds at A **with** a section at A, plus two at B and two at C → clean.

**GREEN.** Clause B skips a stage for which clause A already pushed `missing_filing` under the same directory.

Also the clause-B stage control (AC-15): a directory holding 2 counted `diff` rounds and 2 counted `spec` rounds and nothing else stays clean. A stage-blind clause B sums them to `ROUND_THRESHOLD` and reports; no other fixture in the battery separates the two.

### Task 4 — the addition guard, both directions

<!-- task: red=`pnpm vitest run tests/docs/_metaReviewRoundEconomy.test.ts` red-state=authored red-target=`lib/reviewRounds/corpus.ts:24` why=`nothing consults ARC_SUM_FREEZE yet, so a listed pair is exempt on list membership alone and the post-freeze case reports no problem where it asserts the guard fires` ac=AC-6 -->

**RED.** The pair of cases the orchestrator's verify condition names, so list membership and the timestamp cannot be satisfied independently:

- **timestamp without list membership:** a two-base directory whose rows all predate `ARC_SUM_FREEZE` on a branch that is NOT one of the 11 → still `missing_arc_filing`. Pre-freeze rows alone grant nothing.
- **list membership without the timestamp:** a directory on one of the 11 branches, same stage, carrying one row with `startedAt` after the freeze → the guard fires. Repeated with `startedAt: null`, which cannot be proven older and must fail the same way.
- and the accepting case: a listed pair, all rows pre-freeze → exempt.
- **the stage coordinate control (spec R2's finding):** a grandfathered BRANCH carrying a DIFFERENT counted stage, at threshold by sum with no filing → still reports. Without it, a predicate keyed on `branch` alone passes every case above and silently exempts every other stage on those 11 branches. Nothing else catches it: the report-equals-gate assertion passes too, since both consumers read the one widened predicate, and no declared mutation operator can drop a key coordinate (spec §4 limit 8).

The fixture harness's default row is `startedAt: "2026-08-01T00:00:00.000Z"` (`tests/docs/_metaReviewRoundEconomy.test.ts:136`), which is pre-freeze, so the post-freeze cases override it explicitly rather than relying on the default.

**GREEN.** Exemption is the conjunction of both conditions; the guard's message names which half failed.

### Task 5 — set hygiene over the real corpus, and monotonicity

<!-- task: red=`pnpm vitest run tests/docs/_metaReviewRoundEconomy.test.ts` red-state=authored red-target=`lib/reviewRounds/arcSumGrandfather.ts` why=`the exported set is asserted against the live corpus for the first time here, and until Task 2's literal is correct the still-owes assertion names the pairs that disagree` ac=AC-7,AC-8,AC-9,AC-12 -->

**RED + GREEN in one task, because both halves read the live tree.** Three assertions over `ROOT`: every listed pair still owes under clause B; every counted row of every listed pair predates the freeze; the set holds exactly 11 entries. Each carries a `premiseHolds` from `tests/_shared/premise.ts` stating the condition that gives it discriminating power — the live corpus holds at least one multi-base directory, so an empty corpus cannot pass these vacuously. The premises execute unconditionally, never inside a `.each` callback.

Monotonicity is asserted by kind: the pre-change gate's problems over a fixture battery are a subset of the post-change gate's. The live-corpus case (`tests/docs/_metaReviewRoundEconomy.test.ts:1020`) stays as it is and is the acceptance for the whole change.

### Task 6 — the report learns the sum

<!-- task: red=`pnpm vitest run tests/reviewRounds/report.test.ts` red-state=authored red-target=`scripts/review-economy.ts:196` why=`the trigger bucket counts new Set(rows.map(r => r.round)).size within one base, so a two-base spanning arc increments nothing and the totals-line case reads a report with no such line` ac=AC-10,AC-13,AC-14,AC-15,AC-16 -->

Both spec review R1 findings landed here, and they are one class: the report had its own copy of the obligation test. The structural repair ships in this same task rather than waiting for a recurrence — the report imports clause B's predicate instead of restating it.

**Copy the spec's computed-value inventory into this task body verbatim and assert every row by value.** Eleven rows, V1-V11, derived field-by-field from the `Report` type rather than from memory. Rounds 3 and 4 both landed on the value class because the rule was stated in prose and instantiated by hand; the inventory is the mechanism, and a row with no by-value assertion is an unmet AC-16 rather than something a reviewer must notice. The two rows the hand-written list omitted, since they are the ones most likely to be skipped again: **V3**, the `missing_arc_filing` message's per-`(baseSha, stage)` breakdown, where a stage-blind rendering is wrong on 7 of the 11 newly-owing pairs while every matrix cell still passes; **V9**, the trigger-rate month bucket, which is the directory-wide EARLIEST counted row and never the first base enumerated; and **V10**, the bucket's third stored field `rate`, which renders independently of the fraction beside it, so a hybrid publishes `213/282  57.8%` with both halves individually passing. **V11 is the assertion that makes a missed field non-fatal:** every line this change adds or alters is asserted verbatim as rendered, which catches struct-versus-rendering disagreement in one go.

**RED.** Cases: a multi-base directory gets a totals line naming each counted stage's arc sum; a single-base one does not; a stage at threshold by sum with no section anywhere is marked; a **grandfathered** pair in that same state is NOT marked and appears on the frozen line (R1 finding 1's accepting direction); `triggerRateByMonth` counts a spanning arc as one triggered `(directory, stage)` where the per-base unit counted two untriggered pairs (R1 finding 2); and the marked set equals the gate's `missing_arc_filing` set over one shared fixture corpus, which is the assertion that would have caught both findings. `tests/reviewRounds/report.test.ts:373` already plants a `feat/spanner` multi-base fixture — extend it rather than planting a second.

**GREEN.** The totals line reading the gate's predicate; the trigger bucket populated per `(branch directory, stage)` and tested against the sum; the rate line naming the unit change, since both parts of the fraction move and the published figure jumps about 18 points with no behavior change (spec probe 5). `review-economy.ts:395`'s prose line stops saying "in one stage" as if one base were the unit. `silentArcs` is deliberately untouched — it applies no threshold, and `review-economy.ts:264` already records why it joins on `(branch, baseSha)`.

### Task 7 — mutation re-run and siteId re-derivation

<!-- task: red=`VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm exec vitest run --project mutation tests/mutation/guardSurfaces.gates.test.ts` red-state=authored red-target=`tests/mutation/source/registry.ts:1783` why=`the accepted siteIds are line-keyed and Tasks 2-4 shift corpus.ts, so each accepted row names a site the run no longer produces and the gate reports unaccepted survivors` ac=AC-11 -->

Run `pnpm heavy` around it (transitive shape rule: the gate spawns a real child per mutant). Re-derive the accepted siteIds **from the run's own output**, never by editing the numbers by hand, and reconcile `expectedLedgerKinds.ts` in the same commit. Any genuinely new survivor is either killed by a test or accepted with a reason that says why it cannot change observable behavior — never accepted to make the number go green.

### Task 8 — documentation fan-out

<!-- task: red=`pnpm spec:lint docs/superpowers/specs/ci/2026-08-22-review-round-arc-sum.md` red-state=authored red-target=`docs/superpowers/specs/ci/README.md:25` why=`the index has no row for this spec, so the fan-out is incomplete and the sweep-1 dispositions are unlanded` ac=AC-9 -->

The four sweep-1 hits, plus `docs/superpowers/specs/ci/2026-08-04-review-round-economy.md` §8.3 limit 3, plus the ci index row. Cross-references, never restatements — two copies drift.

<!-- tasks: end -->

### Task 9 — ledger close (outside the red-contract region)

Bookkeeping, with no test-driven RED of its own: the region above is closed before it because the surface that would be its `red-target=` is `BACKLOG.md`, a root-level path the marker grammar classifies as a bare filename (`lib/specLint/redContract.ts:164`). Verified by `pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts tests/docs/_metaReviewRoundEconomy.test.ts`.

Archive `BL-REVIEW-ROUND-COUNT-RESETS-ON-REMERGE` to `BACKLOG-archive.md`, retiring its interim rule, and drop the in-progress marker in the same commit. **This is the PR's last commit, before the merge** (invariant 12): a marker that merges into main names a branch the merge just deleted.

## Checklist

- [ ] Tasks 1-9, TDD each, one commit per task
- [ ] Self-review (numeric sweep, citation pass, self-consistency sweep)
- [ ] Adversarial review (cross-model, Codex) to APPROVE
- [ ] Whole-diff cross-model review to APPROVE
- [ ] Real CI green
- [ ] Readiness report to `bl-orch`; the orchestrator merges

## Convergence criterion (for this plan's own reviews)

Inherited whole from the spec's: consequence bound, `PROBE DOMAIN` (the live `docs/review-rounds/**` corpus plus the meta-test's planted fixtures), and the threat-model fence (merge-timing artifacts by ordinary arcs; an arc that hides rounds is out of scope). **Score:** stated per the mutation-family closure above in the round-1 diff brief, after `pnpm mutation:guards` has run.
