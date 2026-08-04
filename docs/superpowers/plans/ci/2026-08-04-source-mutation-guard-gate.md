# Plan — source-mutation gate for guard surfaces

**Spec:** `docs/superpowers/specs/ci/2026-08-04-source-mutation-guard-gate.md` (canonical; §4.3 is the numeric authority)
**Branch:** `feat/mutation-gate-guard-surfaces`
**Date:** 2026-08-04

---

## 0. Pre-draft code-verification pass (`docs/agents/writing-plans.md:7`)

Every name this plan uses was grepped against the live tree before drafting. Verified:

| Claim | Verified at |
| --- | --- |
| `MUTATION_TEST_GLOBS`, `NIGHTLY_ONLY_EXCLUDES`, `PARALLEL_TEST_GLOBS` exist and are exported | `vitest.projects.ts:83`, `vitest.projects.ts:84`, `vitest.projects.ts:90-124` |
| the `mutation` project is env-gated and has no `exclude` | `vitest.config.ts:135-146` |
| `nightlyExcludes` applies to both default projects | `vitest.config.ts:102-107`, `vitest.config.ts:121` |
| nightly-count assertion is `toBe(9)` and counts every `NIGHTLY_ONLY_EXCLUDES` match | `tests/cross-cutting/vitest-projects-partition.test.ts:200-202` |
| the sibling harness-shape check is pattern-scoped to `tests/parser/mutationHarness.*` | `tests/cross-cutting/vitest-projects-partition.test.ts:304-312` |
| nightly workflow runs `VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm exec vitest run --project mutation` | `.github/workflows/mutation-harness.yml:51-54` |
| npm scripts use a bare env prefix; no `cross-env` dependency | `package.json:51` (`test:fuzz:deep`) |
| ledger reconciliation shape to mirror | `tests/parser/mutation/knownHoles.ts:2-6`, `tests/parser/mutation/knownHoles.ts:43-71` |
| no-op-is-a-hard-error precedent | `tests/parser/mutationHarness.shard0.test.ts:31-33` |
| `typescript` is a dependency (AST enumeration) | `package.json:136`, resolves at `5.9.3` |
| `parseDoc` / `checkTaskContract` signatures | `lib/specLint/parse.ts:65`, `lib/specLint/taskContract.ts:67` |
| `headings` built by one ascending loop (the L174 equivalence argument) | `lib/specLint/parse.ts:86`, push at `lib/specLint/parse.ts:134` |
| existing indentation test covers `OPEN` only | `tests/specLint/taskContract.test.ts:106` |
| existing dup-close test uses one surplus close | `tests/specLint/taskContract.test.ts:56` |

## 1. Meta-test inventory (mandatory, `docs/agents/writing-plans.md:16`)

<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
- **CREATES** `tests/mutation/_metaGuardSurfaceRegistry.test.ts` — per spec §3.7 / AC-11.
- **EXTENDS** `tests/cross-cutting/vitest-projects-partition.test.ts` — nightly count 9 → 10 (spec §5).
- Advisory-lock topology (`tests/auth/advisoryLockRpcDeadlock.test.ts`): **N/A** — no `pg_advisory*` in scope.
- Supabase call boundary (`tests/auth/_metaInfraContract.test.ts`): **N/A** — no Supabase client call.
- Mutation-surface observability (`tests/log/_metaMutationSurfaceObservability.test.ts`): **N/A** — no HTTP route, no `"use server"` action.
- admin_alerts catalog, sentinel hiding: **N/A** — no admin alert, no tile.

## 2. Structural decision — split the test surface by cost, not by module

The gate spawns one `vitest` subprocess per mutant (102 on the first surface). Nesting that inside the merge-gating suite would mean vitest-inside-vitest 102 times, so:

- **Merge-gating** (`tests/mutation/source/*.test.ts`, pure, fast) — operator declaration, AST enumeration, mutant splicing, no-op detection, oracle classification given an exit code, the overlay `load` hook as a pure function, ledger reconciliation, score arithmetic, gate predicate, registry meta-test.
<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
- **Nightly** (`tests/mutation/guardSurfaces.gate.test.ts`) — the real run over the enrolled surface, the clean-baseline check, and the end-to-end known-killing-mutant self-check.

The highest-consequence failure mode — the overlay silently not applying, so every mutant runs against clean source — is pinned in **both** places deliberately: as pure logic merge-gating (Task 3) and end-to-end nightly (Task 10).

## 3. Mutation-operator families (closure set, `docs/agents/writing-plans.md:24`)

The six of spec §3.1: `relational-boundary`, `equality-flip`, `logical-connector`, `integer-literal`, `regex-quantifier-bound`, `statement-removal`. This enumeration **is** the closure set the review converges against. A reviewer-proposed new family is admissible only with a live escaping mutant demonstrated against the shipped gate, and lands as an operator proposal (spec §6.3), not a round.

---

## 3.1 Acceptance criteria covered

Restated from spec §8 so each id resolves in this plan's own text; the spec remains canonical.

| id | criterion | task |
| --- | --- | --- |
| AC-1 | operator set is exactly the six of spec §3.1, declared once; implemented set equals declared set | 1 |
| AC-2 | enumeration is AST-based; zero `integer-literal` sites inside string/template literals | 1 |
| AC-3 | the overlay applies the mutant — clean passes, a known-killing mutant fails | 3, 10 |
| AC-4 | the runner never writes to the target source file | 3 |
| AC-5 | a `NO_OP` mutant fails the gate | 2, 6 |
| AC-6 | a failing unmutated baseline aborts the run rather than scoring mutants | 4 |
| AC-7 | an unaccepted survivor fails the gate | 6 |
| AC-8 | a stale ledger row fails the gate | 5 |
| AC-9 | `score < scoreFloor` fails the gate | 6 |
| AC-10 | `equivalent` excluded from the denominator; `accepted-gap` counted as a survivor | 5 |
| AC-11 | the registry meta-test fails on each malformed-row case | 7 |
| AC-12 | groups A, B, D, E, F, G, H, I, J repaid by tests that fail against their mutant | 8, 9 |
| AC-13 | post-repair: 0 unaccepted, 18 `equivalent`, 2 `accepted-gap`, score ≥ 0.95 (measured 82/84) | 10 |
| AC-14 | `AGENTS.md` carries the convergence bullet | 11 |
| AC-15 | gate absent from both default projects, present in `mutation`; nightly count is 10 | 10 |
| AC-16 | an empty `operators` list fails, at registry and gate layers independently | 6, 7 |
| AC-17 | a non-finite `score` fails the gate | 6 |

## 4. Tasks

<!-- tasks: depth=2 -->

## Task 1 — operator set + AST site enumeration

<!-- task: red=`pnpm vitest run tests/mutation/source/operators.test.ts` ac=AC-1,AC-2 -->

<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
Create `tests/mutation/source/operators.ts` (declared operator names + per-node site emission) and its test.

**Failure mode caught:** the text-scan probe's real defect — a mutant spliced into user-visible message copy. Assertions: the declared set is exactly the six of §3.1 and equals the set of implemented emitters; a fixture containing a digit inside a message string yields **zero** `integer-literal` sites at that line; zero sites inside line and block comments; zero `relational-boundary` sites on `Map<number, number[]>` or on `=>`.

Anti-tautology: assert against the enumerated site list, not against a count — a count passes if the right number of wrong sites is found.

## Task 2 — mutant construction + no-op detection

<!-- task: red=`pnpm vitest run tests/mutation/source/generate.test.ts` ac=AC-5 -->

Splice a site into mutant text; classify a mutant byte-identical to the original as `NO_OP`.

Expected text derived from the fixture by offset arithmetic, never hardcoded.

## Task 3 — overlay load hook (pure)

<!-- task: red=`pnpm vitest run tests/mutation/source/overlay.test.ts` ac=AC-3,AC-4 -->

**Failure mode caught:** the overlay missing its target, so every mutant runs against CLEAN source and the harness reports a perfect score having tested nothing.

`load(TARGET)` returns mutant text; `load(TARGET + "?v=1")` returns mutant text (query-suffixed ids are real in Vite); `load(someOtherId)` returns `null`; the target file's bytes are unchanged after config construction.

## Task 4 — oracle

<!-- task: red=`pnpm vitest run tests/mutation/source/oracle.test.ts` ac=AC-6 -->

exit 0 → `SURVIVED`; non-zero → `KILLED`; a failing unmutated baseline aborts the run instead of scoring any mutant. Per spec §7 L-3, a compile failure scores `KILLED` and that is asserted explicitly so it is not re-derived later.

## Task 5 — ledger reconciliation + score

<!-- task: red=`pnpm vitest run tests/mutation/source/ledger.test.ts` ac=AC-8,AC-10 -->

`equivalent` excluded from the denominator; `accepted-gap` counted as a survivor; stale row detected; unaccepted survivor detected. Fixture ledger carries BOTH kinds.

Anti-tautology: expected score derived from fixture bucket counts, so a fixture with no `accepted-gap` row cannot pass an assertion that claims to prove `accepted-gap` depresses the score.

## Task 6 — gate predicate

<!-- task: red=`pnpm vitest run tests/mutation/source/gate.test.ts` ac=AC-7,AC-9,AC-16,AC-17 -->

Seven cases: one all-clean pass, and six failures each flipping exactly ONE input from the passing fixture — no-op present, baseline red, unaccepted survivor, stale row, score below floor, and **zero mutants / non-finite score**.

The last case is the R1 HIGH: `0/0` is `NaN` and `NaN < floor` is `false`, so every other condition passes on a surface that was never tested. Driven with a zero-mutant result directly, so it holds even if the registry check is bypassed.

Flipping exactly one input per case is what stops a case passing for the wrong reason.

## Task 7 — registry + structural meta-test

<!-- task: red=`pnpm vitest run tests/mutation/_metaGuardSurfaceRegistry.test.ts` ac=AC-11 -->

<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
`tests/mutation/source/registry.ts` with the `taskContract` entry. Meta-test fails on each of: missing `sourcePath`, empty `operators`, empty `suitePaths`, `scoreFloor` outside `(0,1]`, a ledger row naming an undeclared operator, an empty `reason`, an `accepted-gap` row with no `ref`. Each case flips one field of an otherwise-valid row.

## Task 8 — repay groups A, B, D, E on `taskContract.ts`

<!-- task: red=`pnpm vitest run tests/specLint/taskContract.test.ts` ac=AC-12 -->

Fixtures are spec §4.2's probed constructions. A/L20 — a 4-space-indented `end` does not close the region (`L6:TASK_MARKER_MISSING`). A/L22 — a 4-space-indented marker is not a marker (`L3:TASK_MARKER_MISSING`). B — an ac id whose only occurrence is document line 1 still resolves (`(no findings)`). D — findings report `column: 1`.

Extend the existing `tests/specLint/taskContract.test.ts:106` case rather than duplicating it: its name already claims the A coverage while exercising only `OPEN`.

Each assertion is verified by running its mutant and observing the test fail — demonstrated, not asserted.

## Task 9 — repay groups F, G, H, I on `taskContract.ts`

<!-- task: red=`pnpm vitest run tests/specLint/taskContract.test.ts` ac=AC-12 -->

F — a same-depth sibling ends the extent (`(no findings)`). G — `TASK_MARKER_DUPLICATE` reports the SECOND marker's line (`L5`), asserted on `docLine` so the `ms[2]`-undefined mutant fails. H — a `TASK_RED_EMPTY` line draws exactly one code (`L4:TASK_RED_EMPTY` alone). I — findings ordered by `docLine` then `code`, fixture `[L4, L7]` against emission order `[L7, L4]`.

J — two findings sharing `(docLine, code)` keep their relative order: `ac=AC-90,AC-91` with both ids unresolved yields two `TASK_AC_UNRESOLVED` on one line, clean `AC-90,AC-91`, and the `<`→`<=` mutant reverses them to `AC-91,AC-90`.

Group I's fixture needs a pass-1 finding on a LATE line plus a pass-2 finding on an EARLIER one. A duplicate opening cannot seed it — `openCount !== 1` returns at `lib/specLint/taskContract.ts:152` before any pass-2 finding exists — so the pass-1 finding is a malformed `<!-- tasks: … -->` line, which leaves `openCount` undisturbed.

**Group J's assertion must compare `message`, not `code`.** The two findings are identical in `docLine` and `code` and differ only in `message`, so a code-only assertion cannot see the reversal. This is the R2 correction, and the same blindness in a probe fixture is what made the mutant look equivalent for a whole round (spec §2.5, limit L-8).

## Task 10 — nightly gate, wiring, and backlog row

<!-- task: red=`pnpm vitest run tests/cross-cutting/vitest-projects-partition.test.ts` ac=AC-13,AC-15 -->

<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
`tests/mutation/guardSurfaces.gate.test.ts` asserting measured score ≥ floor, zero unaccepted survivors, exactly 18 `equivalent` and 2 `accepted-gap` rows, plus the end-to-end known-killing-mutant self-check.

Wiring, all five rows of spec §5: `MUTATION_TEST_GLOBS`; `NIGHTLY_ONLY_EXCLUDES`; `tests/mutation/**/*.test.{ts,tsx}` into `PARALLEL_TEST_GLOBS`; `"mutation:guards": "VITEST_INCLUDE_MUTATION_HARNESS=1 vitest run --project mutation tests/mutation/guardSurfaces.gate.test.ts"`; the workflow path filter. **And** the nightly count at `tests/cross-cutting/vitest-projects-partition.test.ts:200-202` from 9 to 10 with its message updated — the R1 MEDIUM.

Also adds `BL-TASKCONTRACT-SORT-COMPARATOR-EQUALKEY` to `BACKLOG.md`; spec §3.7 makes `ref` mandatory, so the row ships in this diff rather than as a promise.

## Task 11 — AGENTS.md convergence bullet

<!-- task: red=`pnpm vitest run tests/docs` ac=AC-14 -->

Third numbered item in the round-economy list at `AGENTS.md:253`, before the forbidden-form paragraph at `AGENTS.md:257`: for a surface enrolled in the registry, the convergence criterion is the mutation score plus an empty unaccepted-survivor set, and a "the guard does not pin X" finding is admissible only with the surviving mutant demonstrating it.

<!-- tasks: end -->

---

## 5. Verification before PR

`pnpm typecheck` · `pnpm lint` · `pnpm format:check` · `pnpm test` (full suite, not scoped) · `pnpm mutation:guards` · `pnpm spec:lint` on both spec and plan.

## 6. Out of scope

Per spec §9: no second enrolled surface; no parallel/sharded execution; no change to the parser fixture-mutation harness; no code-coverage measurement; no change to `taskContract.ts` product code (the comparator tiebreak is deferred to `BL-TASKCONTRACT-SORT-COMPARATOR-EQUALKEY` under class-sweep exception (a) — it needs a product decision about `spec:lint`'s report-order contract).

## 12. Close-out

impeccable-gate: N/A — no UI surface
