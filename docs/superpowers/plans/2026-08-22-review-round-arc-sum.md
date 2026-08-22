# Plan — review-round arc sum

**Spec:** `docs/superpowers/specs/ci/2026-08-22-review-round-arc-sum.md` (canonical; §3.1 is the rule, §3.3 the grandfather contract, §4 the documented limits) · **Ledger row:** `BL-REVIEW-ROUND-COUNT-RESETS-ON-REMERGE` (`BACKLOG.md`) · **Branch:** `feat/review-round-arc-sum` · **Implementer:** Opus / Claude Code

Docs plus tests plus three `lib/reviewRounds/` modules: `count.ts`, `corpus.ts`, and one this arc creates. No UI surface, no DB, no advisory locks, no Playwright.

**impeccable-gate: N/A — no UI surface** (nothing under `app/`, `components/`, `app/globals.css`, `DESIGN.md`, or a Tailwind config).

## Meta-test inventory

- **EXTENDS** `tests/docs/_metaReviewRoundEconomy.test.ts` — the corpus gate. New fixtures for clause B, its suppression, the grandfather exemption, and the addition guard in both directions.
- **EXTENDS** `tests/reviewRounds/count.test.ts` and `tests/reviewRounds/report.test.ts`.
- **EXTENDS** `tests/mutation/source/registry.ts` and `tests/mutation/source/expectedLedgerKinds.ts` — both enrolled rows' accepted-siteId sets are line-keyed and this arc shifts their lines (Task 6).
- **CREATES** no new meta-test. The gate this arc changes IS the structural meta-test for its own subject; a second one over the same corpus would be a second definition of the same rule.
- `tests/auth/_metaInfraContract.test.ts`, `tests/log/_metaMutationSurfaceObservability.test.ts`, `tests/auth/advisoryLockRpcDeadlock.test.ts`: **N/A** — no Supabase call boundary, no mutation surface (no route handler, no `"use server"` action), no `pg_advisory*` call anywhere in the diff.

## Mutation-family closure

Both surfaces are enrolled (`tests/mutation/source/registry.ts:1343` for `reviewRoundCount` and `tests/mutation/source/registry.ts:1767` for `reviewRoundCorpus`), each with `operators: [...OPERATOR_NAMES]` and `scoreFloor: 1`. The closure set this arc converges against is therefore **the registry's declared operator set applied to the post-change files**, and the convergence criterion is the score plus an empty unaccepted-survivor set — both machine-computed. A reviewer-proposed new family is admissible only with a live escaping mutant demonstrated against the shipped guard.

Two mechanical constraints follow from the enrolment, and both are easy to trip:

1. **`reviewRoundCorpus.control` must stay a UNIQUE substring.** It is `"if (n < ROUND_THRESHOLD) continue;"` (`tests/mutation/source/registry.ts:1775`). Clause B introduces a second threshold comparison in the same file, so clause B is written over a differently-named binding — `if (arcSum < ROUND_THRESHOLD) continue;` — and never as a second copy of the control string.
2. **Accepted siteIds are LINE-KEYED and this arc moves those lines.** `reviewRoundCorpus.accepted` holds `statement-removal:79:7:continue;>(removed)` and `relational-boundary:146:25:<><=`; the row's own comment records them being re-derived once already, after the enforcement-pair arc shifted the file by two lines. Task 6 re-derives them from the run rather than editing the numbers by hand.

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
| AC-15 | **All nine cells** of the spec's coordinate-control matrix are implemented, one per `(key, coordinate)` across K1-K4. The matrix is reproduced verbatim above the task list with an owner column; a cell without a test is an unmet AC, and a cell whose owner's command does not run its suite is the same failure. | `pnpm vitest run tests/docs/_metaReviewRoundEconomy.test.ts tests/reviewRounds/count.test.ts tests/reviewRounds/report.test.ts` |
| AC-16 | **All eleven rows** of the spec's computed-value inventory (V1-V11) are asserted BY VALUE, not by presence, and every line the change adds or alters is additionally asserted verbatim as rendered (L1-L4, Task 5). The inventory is reproduced verbatim above the task list with an owner column; a row without a by-value assertion is an unmet AC. | `pnpm vitest run tests/reviewRounds/report.test.ts tests/docs/_metaReviewRoundEconomy.test.ts tests/reviewRounds/count.test.ts` |
| AC-18 | The documentation fan-out lands: `docs/superpowers/specs/ci/README.md` carries an index row for the new spec, the mechanically observable half of spec §6's five-item list. | `pnpm vitest run tests/docs/specsReadmeIndexParity.test.ts` |
| AC-17 | A non-arc-shaped `.md` under a branch directory carrying a parseable `## diff` section does NOT discharge a clause-B obligation: only a filing `readArcs` recognizes does. | `pnpm vitest run tests/docs/_metaReviewRoundEconomy.test.ts` |
| AC-11 | Both enrolled surfaces score at their `scoreFloor` of 1 with an empty unaccepted-survivor set, and `expectedLedgerKinds` matches the re-derived accepted sets. Both resolve to **shard 3**, and only the shard files run `registerSurfaceCases`. | `VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm heavy pnpm exec vitest run --project mutation tests/mutation/guardSurfaces.shard3.test.ts` |
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

Four hits, each dispositioned in Task 7: README.md:22 and AGENTS.md:190 gain the arc sum; spec §4.3 and §5.4 gain a dated cross-reference, not a restatement. §8.3 limit 3 gains one too — it currently ratifies the under-obligation this arc repairs, so leaving it would put two live contracts in the corpus.

**Sweep 2 — every `ROUND_THRESHOLD` consumer**, so no reader is left counting per base while the gate sums. Run 2026-08-22; the consumers outside `constants.ts` are `lib/reviewRounds/corpus.ts:236` (clause A, unchanged), `scripts/review-economy.ts:196` (the trigger-rate bucket, which counts `new Set(rows.map(r => r.round)).size` **per base** and is dispositioned in Task 5), `scripts/review-economy.ts:395` (the prose line "filing threshold: 4 counted rounds in one stage", reworded in Task 5), `tests/mutation/source/registry.ts:1775` (the control string, constraint 1 above), plus test fixtures that derive from the constant and need no edit.

**Sweep 4 — is there a third reader?** Spec review R1 found both of its findings in the report, which raises the question the sweep-2 cover cannot answer: does anything ELSE read the corpus and reason about the threshold? Derived cover, run 2026-08-22 — `grep -rn 'readArcs\|checkCorpus\|countedRounds' --include='*.ts' --include='*.mjs' lib scripts tests`, excluding the two modules that define them. Production consumers: `scripts/review-economy.ts:137` and `scripts/review-economy.ts:146` (the report) and `tests/docs/_metaReviewRoundEconomy.test.ts` (the gate). **Two, and no third.** Everything else in the output is a test assertion or a comment. The reader class is therefore closed, and Task 5 covers all of it.

**Sweep 3 — registry count reconciliation.** `tests/mutation/source/expectedLedgerKinds.ts:204` declares `reviewRoundCount: {}` and `tests/mutation/source/expectedLedgerKinds.ts:210` declares `reviewRoundCorpus: { equivalent: 2 }`, matching the two accepted rows at `tests/mutation/source/registry.ts:1783` and `tests/mutation/source/registry.ts:1789`. Task 6 re-runs the harness and pastes the re-derived set; any delta lands in the same commit as the code that caused it.

## Tasks

Both of the spec's derived artifacts are reproduced below, **verbatim and once**, each with the column plan review round 1 found missing: which task owns the row, and therefore which suite must appear in that task's `red=` command. An artifact quoted as an instruction to copy it later is the same defect as a rule instantiated by hand, and the ownership column is what stops a task claiming a row its command cannot observe.

### The coordinate-control matrix (AC-15)

| key | coordinate | control - vary this one, hold the others fixed | must | owner |
| --- | --- | --- | --- | --- |
| K1 `arcCountedRounds`: stage to a set of `(baseSha, round)` | `baseSha` | one round number, two bases | count 2 | Task 1 |
| K1 | `round` | one base, two round numbers | count 2 | Task 1 |
| K1 | `stage` | a counted `spec` row at a third base | not raise `diff`'s count | Task 1 |
| K2 clause B obligation: `(directory, stage)` | `directory` | an owing directory, plus a LATER below-threshold directory | the owing one still reports | Task 2 |
| K2 | `stage` | one directory, 2 counted `diff` plus 2 counted `spec` | stay clean | Task 2 |
| K3 grandfather exemption: `(branch, stage)` | `branch` | the grandfathered shape on a non-grandfathered branch | report | Task 4 |
| K3 | `stage` | a grandfathered branch carrying a DIFFERENT counted stage | report | Task 4 |
| K4 trigger-rate population: `(directory, stage)` | `directory` | one stage spanning two bases of one directory | population 1, triggered | Task 5 |
| K4 | `stage` | one directory with two counted stages | population 2, not 1 | Task 5 |

### The computed-value inventory (AC-16)

| # | computed value | asserted by value in | owner |
| --- | --- | --- | --- |
| V1 | `arcCountedRounds`'s per-stage sum | `tests/reviewRounds/count.test.ts` | Task 1 |
| V2 | the `missing_arc_filing` message's total | the meta-test | Task 2 |
| V3 | that message's per-`(baseSha, stage)` breakdown, each entry | the meta-test | Task 2 |
| V4 | the totals line's per-stage arc sums | `tests/reviewRounds/report.test.ts` | Task 5 |
| V5 | the totals line's mark, as set equality with the gate's `missing_arc_filing` set | the report test | Task 5 |
| V6 | the frozen line's membership | the report test | Task 5 |
| V7 | the trigger-rate population | the report test | Task 5 |
| V8 | the trigger-rate triggered count | the report test | Task 5 |
| V9 | the trigger-rate month bucket - the directory-wide EARLIEST counted row, never the first base enumerated | the report test | Task 5 |
| V10 | the trigger-rate `rate` - a THIRD stored field on the bucket (`scripts/review-economy.ts:197`), rendered independently of the fraction beside it | the report test | Task 5 |
| V11 | the rate line as RENDERED, verbatim | the report test | Task 5 |

<!-- tasks: depth=3 red-contract -->

### Task 1 — `arcCountedRounds`, K1 and V1

<!-- task: red=`pnpm vitest run tests/reviewRounds/count.test.ts` red-state=authored red-target=`lib/reviewRounds/count.ts:28` why=`count.ts exports countedRounds and nothing that keys on baseSha, so the new import does not resolve, the suite cannot collect, and the colliding-rounds case never runs` ac=AC-1,AC-15,AC-16 -->

Owns matrix rows K1/`baseSha`, K1/`round`, K1/`stage`, and inventory row V1. Its command runs the one suite those four live in.

**RED.** Add to `tests/reviewRounds/count.test.ts`, importing `arcCountedRounds`:

- base `aaaaaaaaaaaa` rounds 1..3 plus base `bbbbbbbbbbbb` round 1 → `diff` is `ROUND_THRESHOLD`. The defect's exact shape: the renumbered row is a fourth pair where `countedRounds` sees three distinct values. (K1/`baseSha`.)
- two bases both numbered 1 and 2 → 4. (K1/`round`.)
- two rows sharing one `(base, round)` → 1, a parallel wave counting once.
- a `no_verdict` row and a `stage: "task"` row at a third base → contribute nothing.
- a counted `spec` row at a third base → does not raise `diff`'s count. (K1/`stage`: without it, a map keyed on the pair alone and not the stage passes every case above.)
- `arcCountedRounds([])` → an empty map, and `.get("diff") ?? 0` is `0`.

Every count above is asserted BY VALUE, which is V1.

**GREEN.** `export function arcCountedRounds(rows: ReviewRoundRow[]): Map<Stage, number>` beside `countedRounds`, sharing its two counting conjuncts and keying its per-stage set on `` `${r.baseSha} ${r.round}` `` — the separator `readArcs` already uses (`lib/reviewRounds/corpus.ts:124`), because it cannot occur in either field.

### Task 2 — clause B, the grandfather literal, K2, V2 and V3

<!-- task: red=`pnpm vitest run tests/docs/_metaReviewRoundEconomy.test.ts` red-state=authored red-target=`lib/reviewRounds/corpus.ts:24` why=`the ProblemKind union ends at mechanizable_untracked with no missing_arc_filing member, so the clause-B fixture's expected kind is a value checkCorpus can never return and the array comparison fails against an empty result` ac=AC-2,AC-7,AC-9,AC-12,AC-15,AC-16 -->

Owns K2's two rows and V2, V3. **It also owns the live-corpus set-hygiene assertions**, which were a separate task until plan review round 1 showed that task could have no RED: this task's command already includes the existing live-corpus case, so clause B cannot go green here unless the eleven-pair literal is already correct. Those assertions are guards over data this task lands, not a TDD step of their own, and giving them their own marker would author a test that passes the moment it is written.

**RED.** Fixtures planting a two-base directory under `feat/foo` — one base file with two counted diff rounds, a second with two more, each row's `baseSha` overridden to match its path or `identity_mismatch` fires first and the case proves nothing — asserting exactly `["missing_arc_filing"]`, and asserting the message's total and its per-`(baseSha, stage)` breakdown BY VALUE (V2, V3: a stage-blind breakdown is wrong on 7 of the 11 live newly-owing pairs while every other assertion still passes).

Both K2 cells land here:

- **K2/`directory`** — an owing directory PLUS a later below-threshold directory; the owing one must still report. Excludes an accumulator keyed on stage alone where each directory overwrites the last. Every other two-directory fixture in this plan gives its directories the same obligation state, so none of them discriminates this.
- **K2/`stage`** — one directory holding 2 counted `diff` and 2 counted `spec` rounds stays clean. A stage-blind clause B sums them to `ROUND_THRESHOLD` and reports.

<!-- spec-lint: ignore — new file created by this task; not yet tracked -->
**GREEN.** New `lib/reviewRounds/arcSumGrandfather.ts` exporting `ARC_SUM_FREEZE`, the 11 `{ branch, stage }` pairs, and `isArcSumGrandfathered`, with the spec §3.3 contract in its header. Then clause B in `checkCorpus`, grouping the arcs `readArcs` already returned by `arc.branch`. The threshold comparison uses a differently named binding — `if (arcSum < ROUND_THRESHOLD) continue;` — so `reviewRoundCorpus.control` (`tests/mutation/source/registry.ts:1775`) stays a unique substring.

Then the three set-hygiene assertions over `ROOT`: every listed pair still owes under clause B; every counted row of every listed pair predates the freeze; the set holds exactly 11. Each carries a `premiseHolds` from `tests/_shared/premise.ts` stating the condition that gives it discriminating power — the live corpus holds at least one multi-base directory — executed unconditionally, never inside a `.each` callback.

### Task 3 — suppression, satisfaction, monotonicity

<!-- task: red=`pnpm vitest run tests/docs/_metaReviewRoundEconomy.test.ts` red-state=authored red-target=`lib/reviewRounds/corpus.ts:236` why=`clause A pushes missing_filing with nothing consulting it afterwards, so the base-at-threshold fixture reports both missing_filing and missing_arc_filing where the case asserts exactly one` ac=AC-3,AC-4,AC-5,AC-8,AC-17 -->

**RED.** Four cases:

- the Task 2 directory with a filing section at base A → clean; again with it at base B → clean.
- **the satisfaction recognizer (AC-17):** the same 2 + 2 directory PLUS a non-arc-shaped `.md` under it carrying a parseable `## diff` section → **still reports** `missing_arc_filing`. The stray file is ignored prose to `readArcs` (`lib/reviewRounds/corpus.ts:65`), and an implementation reading "any `.md`" lets it discharge a real obligation while the canonical reader sees no filing. The existing stray-filing case at `tests/docs/_metaReviewRoundEconomy.test.ts:597` does NOT cover this: it reaches the threshold in ONE base and asserts clause A's `missing_filing`, which a loose clause B still emits, so it passes either way. This fixture must therefore stay below the per-base threshold in every base.
- a directory with `ROUND_THRESHOLD` rounds at base A and two at base B, no filing → exactly `["missing_filing"]`.
- the spec §3.1 equivalence fixture: `ROUND_THRESHOLD` rounds at A **with** a section at A, plus two at B and two at C → clean.

**GREEN.** Clause B skips a stage for which clause A already pushed `missing_filing` under the same directory, and reads sections only from `arc.filingText`.

Monotonicity lands here too, asserted by kind over the fixture battery: every per-base problem the gate reports before the change is still reported after it. Like the hygiene assertions in Task 2 it is a guard rather than a TDD step, and it belongs beside the suppression logic that could break it.

### Task 4 — the addition guard, both directions, and K3

<!-- task: red=`pnpm vitest run tests/docs/_metaReviewRoundEconomy.test.ts` red-state=authored red-target=`lib/reviewRounds/corpus.ts:24` why=`nothing consults ARC_SUM_FREEZE yet, so a listed pair is exempt on list membership alone and the post-freeze case reports no problem where it asserts the guard fires` ac=AC-6,AC-15 -->

**RED.** The orchestrator's verify condition is that list membership and the timestamp cannot be satisfied independently, so both directions are cases:

- **timestamp without list membership:** a two-base directory whose rows all predate `ARC_SUM_FREEZE`, on a branch NOT among the 11 → still reports. (K3/`branch`.)
- **list membership without the timestamp:** a directory on one of the 11 branches, same stage, carrying one row `startedAt` after the freeze → the guard fires. Repeated with `startedAt: null`, which cannot be proven older and must fail the same way.
- **K3/`stage`:** a grandfathered BRANCH carrying a DIFFERENT counted stage, at threshold by sum with no filing → still reports. Without it a `branch`-keyed predicate passes every case here and silently exempts every other stage on those 11 branches; the report-equals-gate assertion passes too, since both consumers read the one widened predicate, and no declared mutation operator can drop a key coordinate (spec §4 limit 8).
- the accepting case: a listed pair, all rows pre-freeze → exempt.

The harness's default row is `startedAt: "2026-08-01T00:00:00.000Z"` (`tests/docs/_metaReviewRoundEconomy.test.ts:136`), which is pre-freeze, so the post-freeze cases override it explicitly rather than relying on the default.

**GREEN.** Exemption is the conjunction of both conditions, and the message names which half failed.

### Task 5 — the report: K4 and V4 through V11

<!-- task: red=`pnpm vitest run tests/reviewRounds/report.test.ts` red-state=authored red-target=`scripts/review-economy.ts:196` why=`the trigger bucket counts new Set(rows.map(r => r.round)).size within one base, so a directory-spanning arc increments nothing and the K4 population case reads a report with no totals line at all` ac=AC-10,AC-13,AC-14,AC-15,AC-16 -->

Owns K4's two rows and V4 through V11. Its command runs the report suite, where all ten live.

Both spec-review findings on the report were one class: it had its own copy of the obligation test. The structural repair ships in this task rather than waiting for a recurrence — the report imports clause B's predicate instead of restating it.

**RED.** A multi-base directory gets a totals line naming each counted stage's arc sum; a single-base one does not; a stage at threshold by sum with no section anywhere is marked; a **grandfathered** pair in that same state is NOT marked and appears on the frozen line; the marked set EQUALS the gate's `missing_arc_filing` set over one shared fixture corpus. `tests/reviewRounds/report.test.ts:373` already plants a `feat/spanner` multi-base fixture — extend it rather than planting a second.

- **K4/`directory`** — one stage spanning two bases of one directory: population 1, triggered.
- **K4/`stage`** — one directory with two counted stages: population 2, not 1. Excludes a population keyed on directory alone, which over the live corpus reports 125 where the unit gives 282.

Every value in inventory rows V4-V11 is asserted BY VALUE. **And the spec's rendering rule is "every line this change adds or alters", not the rate line alone**, so the lines are enumerated here the same way the values are — a rule stated without its enumeration is the defect this arc has now paid for four times:

| # | line | state |
| --- | --- | --- |
| L1 | the totals line | new |
| L2 | the frozen-evidence line | new |
| L3 | the trigger-rate line | altered (population, triggered and rate all move) |
| L4 | the `filing threshold: …` prose line | altered wording |

Each is asserted VERBATIM as rendered. That catches a struct-versus-rendering disagreement whatever the field list omits — the shape of the last spec finding, where `rate` stayed on the per-base model while `population` and `triggered` moved — and it catches malformed operator-facing output that correct values alone would not.

**GREEN.** The totals line reading the gate's predicate; the trigger bucket populated per `(branch directory, stage)`, tested against the sum, bucketed by the directory-wide earliest counted row; `rate` recomputed from the moved fields; the rate line naming the unit change, since both parts of the fraction move and the published figure jumps about 18 points with no behavior change. `scripts/review-economy.ts:395`'s prose line stops saying "in one stage" as if one base were the unit. `silentArcs` is deliberately untouched — it applies no threshold, and `scripts/review-economy.ts:267` joins on `arcKey` for a reason the comment above it records.

### Task 6 — mutation re-run and siteId re-derivation

<!-- task: red=`VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm heavy pnpm exec vitest run --project mutation tests/mutation/guardSurfaces.shard3.test.ts` red-state=authored red-target=`tests/mutation/source/registry.ts:1783` why=`the accepted siteIds are line-keyed and Tasks 2-4 shift corpus.ts, so each accepted row names a site the run no longer produces and the shard reports unaccepted survivors` ac=AC-11 -->

**The command is the SHARD, not the gates file.** `tests/mutation/guardSurfaces.gates.test.ts` asserts registry keys, shard-partition integrity and the timeout premise; `registerSurfaceCases`, which generates mutants and compares survivors against accepted `siteId`s, runs only in the shard files. Both enrolled surfaces resolve to **shard 3**, confirmed at plan time by running `surfacesForShard` over the live registry. A command naming the gates file would stay green after the siteIds drift and could not produce the output this task re-derives them from.

`pnpm heavy` is in the marker as well as the body, because RED and GREEN must be the SAME command and a mutation run wraps at its outermost entry.

Re-derive the accepted siteIds **from the run's own output**, never by editing the numbers by hand, and reconcile `tests/mutation/source/expectedLedgerKinds.ts` in the same commit. A genuinely new survivor is either killed by a test or accepted with a reason that says why it cannot change observable behavior — never accepted to make the number go green.

### Task 7 — documentation fan-out

<!-- task: red=`pnpm vitest run tests/docs/specsReadmeIndexParity.test.ts` red-state=live why=`the ci index has no row for this spec, and the suite already fails on the live tree naming 2026-08-22-review-round-arc-sum.md as missing` ac=AC-18 -->

**This red is `live`, not `authored`, and was run at plan time.** It observes AC-18, not AC-9 — AC-9 is the live-corpus assertion inside the meta-test, which this command never runs, and claiming it here would be the ownership failure round 1 found. Only the SPEC needs an index row: `specsReadmeIndexParity` reads `docs/superpowers/specs` only (`tests/docs/specsReadmeIndexParity.test.ts:36`), so the plan document is out of its scope. The command currently exits 1 with `docs/superpowers/specs/ci/README.md is missing a row for: | [2026-08-22-review-round-arc-sum.md](./2026-08-22-review-round-arc-sum.md) | <date> |`. An earlier draft named a `spec:lint` invocation over the already-ratified spec, which exits 0 with every fan-out edit still absent and could never have gone red.

The index row is the mechanically observable half. The rest of the fan-out lands in the same commit and is verified by reading. It is the spec's §6 list, item for item, because a fan-out that drifts from the spec that ratified it is how a superseded contract stays live in the corpus:

- **`docs/review-rounds/README.md`** gains all five author-facing rules spec §3.5 states, not just the first: the threshold is reached by one base's rounds OR the arc's rounds summed across bases, counting distinct `(base, round)` pairs; a re-merge restarts `--round` at 1 by design and the arc sum is unaffected; the first row at a new base should carry `_roundAtPreviousBase` for traceability; a filing owed by the arc sum goes at the latest base holding rows for that stage; its heading declares THAT FILE's count while its `**Examined:**` line names the cross-base total.
- **`AGENTS.md:190`**, round-economy bullet — the counted-rounds sentence gains the arc sum and cites this spec.
- **`docs/superpowers/specs/ci/2026-08-04-review-round-economy.md`** — dated cross-references at **four** places, matching spec §6: §4.3 (the threshold's unit), **§5.2** (which currently ratifies a base move splitting the arc and under-obliging it, and is the one that most needs superseding), §5.4 (the counting rule), and §8.3 limit 3. No restatements.
- **`docs/superpowers/specs/ci/README.md`** — the index row, the half this task's command observes.

<!-- tasks: end -->

### Task 8 — ledger close (outside the red-contract region)

Bookkeeping, with no test-driven RED of its own: the region above closes before it because the surface that would be its `red-target=` is `BACKLOG.md`, a root-level path the marker grammar classifies as a bare filename (`lib/specLint/redContract.ts:164`).

Archive `BL-REVIEW-ROUND-COUNT-RESETS-ON-REMERGE` to `BACKLOG-archive.md`, retiring its interim rule, and drop the in-progress marker in the same commit. **This is the PR's last commit, before the merge** (invariant 12): a marker that merges into main names a branch the merge just deleted. Verified by `pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts tests/docs/_metaReviewRoundEconomy.test.ts`.

## Checklist

- [ ] Tasks 1-7, TDD each, one commit per task; Task 8 is bookkeeping with no RED and closes the ledger in the PR's last commit
- [ ] Self-review (numeric sweep, citation pass, self-consistency sweep)
- [ ] Adversarial review (cross-model, Codex) to APPROVE
- [ ] Whole-diff cross-model review to APPROVE
- [ ] Real CI green
- [ ] Readiness report to `bl-orch`; the orchestrator merges

## Convergence criterion (for this plan's own reviews)

Inherited whole from the spec's: consequence bound, `PROBE DOMAIN` (the live `docs/review-rounds/**` corpus plus the meta-test's planted fixtures), and the threat-model fence (merge-timing artifacts by ordinary arcs; an arc that hides rounds is out of scope). **Score:** stated per the mutation-family closure above in the round-1 diff brief, after `pnpm mutation:guards` has run.
