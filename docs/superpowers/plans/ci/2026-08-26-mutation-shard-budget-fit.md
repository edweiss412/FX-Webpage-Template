# Plan — eight source-mutation shards, so the partition fits its per-leg budget

Spec: `docs/superpowers/specs/ci/2026-08-26-mutation-shard-budget-fit.md`.

impeccable-gate: N/A — no UI surface

## What is already on the branch

One commit, `docs(spec)`, carrying the spec and its index row in `docs/superpowers/specs/ci/README.md`. No code yet.
The predecessor arc (PR #896, merged as `94de73ef6`) is the base: it replaced the weight model with
`bootsOf(surface) * surface.millisPerBoot` and moved `SHARD_BUDGET_SECONDS` to `tests/mutation/source/budget.ts`.

## Earning RED on code that already exists

Every task below changes code that works today, so "write a failing test" is unavailable in its
naive form: a test written against working code passes on its first run. Two of the three tasks
earn RED the same way, and it is the strongest form available here because the defect is REAL
rather than planted: **raise `SOURCE_SHARD_COUNT` first, with nothing else changed, and watch the
guard fail.** The constant is the whole subject of this plan, so moving it IS the defect injection,
and each guard is then proved against the exact failure it exists to catch rather than against a
constructed proxy.

Task 3 is ordinary test-first: it asserts a property nothing asserts today.

## Pre-draft code-verification pass

Every symbol, path and line below was grepped against the live tree at `fb5b461d7`. Line numbers drifted from the arc brief, which named 152, 288-290 and 1522 for the three
workflow and coverage-scan sites; all three are re-read here rather than carried:

| claim | verified |
| --- | --- |
| `SOURCE_SHARD_COUNT = 4` | `tests/mutation/source/shardPartition.ts:26` |
| `SHARD_BUDGET_SECONDS = 60 * 60` | `tests/mutation/source/budget.ts:13` |
| workflow matrix | `.github/workflows/mutation-harness.yml:158` |
| budget step env | `.github/workflows/mutation-harness.yml:294-296` |
| coverage-scan value text | `tests/ci/_workflowCoverageScan.ts:1542` |
| `mutation:guards` script | `package.json`, line 58 |
| shard template, index-only difference | `diff guardSurfaces.shard0 guardSurfaces.shard3` shows lines 1 and 12 only |
| vitest include is a GLOB, so new shard files self-register | `vitest.projects.ts:90` `"tests/mutation/guardSurfaces.shard*.test.ts"` |
| the PR fires the harness by path filter | `.github/workflows/mutation-harness.yml` `pull_request.paths` includes `tests/mutation/**` |
| `shardPartition.ts` is an ENROLLED mutation surface | `tests/mutation/source/registry.ts:3323`, id `sourceShardPartition` |
| the breach case to delete | `tests/mutation/source/shardPartition.test.ts:234` |
| the re-arming regime case | `tests/mutation/source/shardPartition.test.ts:203` |

### The hazard this plan exists to not walk into

The root `.gitignore` carries a scratch rule at line 137:

```
tests/mutation/guardSurfaces.shard[4-9].test.ts
```

Every shard file this plan adds falls inside that range, so `git add` skips all four SILENTLY,
every local run stays green because the files are on disk, and CI fails on a fresh checkout.
Probed at plan time:

```
$ git check-ignore -v tests/mutation/guardSurfaces.shard4.test.ts
.gitignore:137:tests/mutation/guardSurfaces.shard[4-9].test.ts	tests/mutation/guardSurfaces.shard4.test.ts
```

Shards 5, 6 and 7 report identically. The comment above that rule records this exact failure
happening once already: "Four required checks went red on a fresh checkout while every local run
looked normal, because the file is on disk whether or not it is TRACKED."

Nothing in the repo relates that range to `SOURCE_SHARD_COUNT`. Grepped: no test under
`tests/mutation/`, `tests/ci/` or `tests/docs/` reads the ignore rules at all. So the range is a
hardcoded literal that silently contradicts the constant the moment the constant moves.

## Meta-test inventory (mandatory declaration)

**EXTENDS** `tests/mutation/_metaSourceShardIntegrity.test.ts` (two new cases; its existing
byte-identical-template and env-pin cases are exercised over eight files rather than four without
being edited). **EXTENDS**
`tests/mutation/source/shardPartition.test.ts` (one case DELETED, one added, Task 2). **EXTENDS**
`tests/mutation/guardSurfaces.gates.test.ts` (one new case, Task 3). **EXTENDS**
`tests/ci/_workflowCoverageScan.ts` (one pinned value text). **CREATES** no new meta-test file: every
property this diff can break already has a home, and adding a file would be a second place to look.

No Supabase call boundary, no `admin_alerts` row, no advisory lock, no §12.4 catalog row, no
migration, no UI surface, no React component, no `pg_advisory` path, no new e2e spec.

## Mutation-family closure

`tests/mutation/source/shardPartition.ts` is enrolled as `sourceShardPartition`
(`tests/mutation/source/registry.ts:3323`) and this diff edits it, so enrolment precedes review:
the score is re-run and stated on the round-1 diff brief's `GUARD SURFACE:` line, scoped to that one
surface, or `codex-guard` exits 2 before dispatching.

```
VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm heavy:mutation pnpm tsx \
  scripts/mutation-score-surfaces.ts sourceShardPartition
```

The mutation class is granted by bl-orch for this surface only, and the take and the release are
each announced to it.

**The kill mechanism survives the change, which is the thing to check rather than assume.** The
registry row's own comment says a mutant of `SOURCE_SHARD_COUNT` is self-consistent inside
`shardPartition.test.ts` (the suite reads the constant to build its expectations) and is killed only
by `_metaSourceShardIntegrity` comparing the constant against the workflow's hard-coded matrix and
env text. That comparison is untouched here: after this diff it compares against `[0, 1, 2, 3, 4, 5,
6, 7]` and `"8"` instead of `[0, 1, 2, 3]` and `"4"`, so the mutant `integer-literal:26:35:8>9` dies
exactly where `4>5` died.

## Reconciliations, RUN at plan time

Modelled partition over the live registry, and the realized partition scored against the seconds
surfaces actually took on main's nightly `32920754274`:

```
 N  modelled_makespan_s  leg_elapsed_s  margin_s  margin%  fits
 6               3112.7         4404.4    -804.4   -22.3%  no
 7               2667.5         3839.0    -239.0    -6.6%  no
 8               2444.0         3298.6     301.4     8.4%  YES
 9               2444.0         3273.7     326.3     9.1%  YES
10               2444.0         3273.7     326.3     9.1%  YES
```

Leg elapsed, not child seconds: the budget check reads `elapsed.txt`, whose timer starts before
checkout, setup and two Playwright installs. Per-surface seconds are the WORST observed across
both scored nightlies, plus the worst per-leg overhead observed, 216.8 s. The atomic floor is
`controlOutlineResidue` at 3,056.9 s of children plus that overhead, 3,273.7 s, which is 90.9%
of a leg on its own and is why N above 8 buys 24.9 s.

Exact-millisecond check on the equality Task 2 depends on, because the re-arming case at
`shardPartition.test.ts:203` asserts `makespan === heaviest` rather than `>=`:

```
n=4 makespan_ms=4666275 heaviest_ms=2443987 equal=false evenSplit_ms=4662930.5 heaviest>evenSplit=false
n=8 makespan_ms=2443987 heaviest_ms=2443987 equal=true  evenSplit_ms=2331465.3 heaviest>evenSplit=true
```

At four shards that case takes its early-return branch. At eight it takes the `premise(...)` branch
and asserts equality, which holds exactly. Raising the count therefore RE-ARMS a case that has been
dormant, which is what its author built it to do, and its stale comment naming "521" and "21
surfaces" and `SOURCE_SHARD_COUNT = 4` is rewritten in Task 2 rather than left describing a premise
that no longer applies.

## Acceptance criteria these tasks discharge

| AC | discharged by |
| --- | --- |
| AC-1 (`SOURCE_SHARD_COUNT === 8`, modelled binding leg under budget, derived) | Task 2 |
| AC-2 (four new shard files byte-identical modulo index) | Task 2 |
| AC-3 (every derived site carries 8) | Task 2 |
| AC-4 (the breach case DELETED, not skipped) | Task 2 |
| AC-5 (a real `mutation-harness` run green, every leg under 3,600 s) | Closeout |
| AC-6 (twelve required checks green) | Closeout |
| AC-7 (the tracked shard range derived from the count, both halves) | Task 1 |

There is no task for the non-empty-slice property: it is already pinned. The section after the
task region records why the task that would have added it was deleted.

<!-- tasks: depth=2 red-contract -->

## Task 1 — the tracked shard range follows the shard count

<!-- task: red=`pnpm vitest run tests/mutation/_metaSourceShardIntegrity.test.ts` red-state=authored red-target=`tests/mutation/source/shardPartition.ts:26` why=`the scratch ignore rule is a hardcoded index range with no relation to this constant, and no test anywhere reads the ignore rules, so raising this line silently makes every shard file the change adds unstageable` ac=AC-7 -->

Add one case to `tests/mutation/_metaSourceShardIntegrity.test.ts` asserting, DERIVED from
`SOURCE_SHARD_COUNT` rather than from a literal range:

1. every index below the count resolves to a path the ignore rules do NOT match, and
2. the first index at or above the count IS matched, so the scratch convention keeps working.

Both halves are load-bearing. Half 1 alone passes against ignore rules that ignore nothing, which
would let a scoped-run scratch file reach a commit, the failure the rule was written for.

**Two fail-opens this case must not have, both found by spec review and both probed.** Spec §5
AC-7 carries the probes; this is the implementation obligation they create.

- Invoke `git check-ignore` with `--no-index`. Without it git suppresses the answer for a TRACKED
  path, so half 1 reports "not ignored" for shard0 through shard7 whatever the rules say. It would
  be a guard that cannot fail for exactly the files it protects.
- Decide on the EXIT STATUS, with no `-v`. `-v` exits 0 whenever it has a rule to report, and a
  negating rule is a rule, so a path un-ignored by a later `!` line comes back exit 0 while not
  being ignored. `-v` may build the failure message; it may not decide.

Run `git check-ignore` through `execFileSync`, not by parsing the ignore file: the question is
what git DOES, and a parser re-implementing git's glob semantics is a second implementation that
can disagree with the first. Exit 1 means "not ignored", a normal answer here, so the call
tolerates that status and treats any other non-zero as a fault.

**Guard premise.** The case asserts over a path set derived from a constant, so it must prove it
looked at a non-empty set before concluding anything, or a `SOURCE_SHARD_COUNT` of 0 makes both
halves vacuously true. `premiseHolds(description, condition)` from `tests/_shared/premise.ts`,
which this file already imports.

**RED, and it is real rather than planted.** This case is written FIRST, while the constant is
still 4 and the scratch range still starts at 4. It passes: shard0 through shard3 are unmatched,
shard4 is matched. That is a guard passing on correct state and proves nothing yet. Task 2 raises
the constant to 8 with the ignore range untouched, and this case goes RED reporting shard4 through
shard7 as ignored, which is the exact defect it exists to catch. That transition is recorded in
Task 2's commit message. The marker's `red-target` names the constant because the constant is what
moves; the rule it silently contradicts lives in the root `.gitignore`, which cannot be cited in a
marker (a path with no slash is bare-filename shorthand) and is quoted in full above instead.

## Task 2 — eight shards, and the partition fits

<!-- task: red=`pnpm vitest run tests/mutation/source/shardPartition.test.ts tests/mutation/_metaSourceShardIntegrity.test.ts` red-state=authored red-target=`tests/mutation/source/shardPartition.ts:26` why=`at SOURCE_SHARD_COUNT = 4 the modelled binding leg is 4666275ms against a 3600s budget, so the budget assertion this task writes in place of the breach-recording case fails the moment it exists and before the constant moves` ac=AC-1,AC-2,AC-3,AC-4 -->

**RED, in two observable steps, both recorded in the task's commit message.**

Step A. Replace the breach-recording case at `tests/mutation/source/shardPartition.test.ts:234`
with the budget assertion. Run the suite: it fails, binding leg 4,666,275 ms against a 3,600 s
budget. The marker is `red-state=authored` rather than `live` because the command passes on the
tree as it stands and only fails once this case exists; `spec:lint --exec-red` rejected the `live`
form on exactly that ground, which is the check working.

Step B. Raise `SOURCE_SHARD_COUNT` to 8 and change NOTHING else. Run both suites and record what
goes red, because this is the step that proves Task 1's guard catches a real defect rather than a
constructed one: `_metaSourceShardIntegrity` fails on the workflow matrix, on the budget-step env,
on the shard-file count, AND on Task 1's new case, which now reports shard4..7 ignored.

**GREEN.** Then, in this order, because the order is the point:

1. Narrow the root ignore file's scratch rule at line 137 so its index range starts at 8 rather
   than 4. FIRST, before the files exist, so `git add` cannot silently skip them:

   ```
   -tests/mutation/guardSurfaces.shard[4-9].test.ts
   +tests/mutation/guardSurfaces.shard[8-9].test.ts
   ```

2. Create `tests/mutation/guardSurfaces.shard{4,5,6,7}.test.ts` from the `shard0` template,
   byte-identical modulo the filename on line 1 and the `SOURCE_SHARD` literal on line 12.
   Copy the template, do not retype it.
3. `.github/workflows/mutation-harness.yml:158`, matrix to `[0, 1, 2, 3, 4, 5, 6, 7]`.
4. `.github/workflows/mutation-harness.yml:296`, `SOURCE_SHARD_COUNT: "8"`.
5. `tests/ci/_workflowCoverageScan.ts:1542`, value text `"8"`.
6. In `package.json`, the `mutation:guards` script (line 58) names shard0 through shard7 plus the gates file.
7. The comment at `tests/mutation/source/shardPartition.ts:25` justifies four on a premise that is
   now false. Rewrite it: the makespan is pinned by the heaviest surface from eight on.
8. The stale comment at `shardPartition.test.ts:203-211` describes the four-shard regime. Rewrite
   it to describe the regime the count now sits in.

**Prose class sweep, swept to a derivation and not to a list.** Spec §2.1 calls this class B:
prose that spells the source shard count as a word or a digit, which compiles and asserts exactly
as before while saying something false. The sweep is a command, re-run rather than trusted:

```
rg -n -i '\bfour\b|4 LPT|\[0, ?1, ?2, ?3\]|shard0\.\.shard3' \
  .github/workflows/mutation-harness.yml tests/mutation tests/ci vitest.projects.ts .gitignore package.json
```

The repair is to DE-NUMBER, so the same sites cannot rot again at the next change, not to write 8
where 4 was. Round 1 of review found six members my own first sweep missed, which is the reason
this is a command and a table rather than a remembered list. Members and dispositions:

| site | disposition |
| --- | --- |
| `.github/workflows/mutation-harness.yml:8` "4 LPT-balanced shard files" | de-numbered |
| `.github/workflows/mutation-harness.yml:150` "4 LPT shards" | de-numbered |
| `.github/workflows/mutation-harness.yml:198` "four workspaces cannot collide" | de-numbered |
| `.github/workflows/mutation-harness.yml:216` "green on all four shards" | de-numbered |
| `tests/mutation/source/shardPartition.test.ts:84` case title "the four shard slices" | de-numbered |
| `tests/mutation/_metaSourceShardIntegrity.test.ts:5` "A correct `[0,1,2,3]`" | de-numbered |
| `tests/mutation/source/records.test.ts:314` "all four shard workspaces" | de-numbered |
| `tests/mutation/source/records.test.ts:323` "four matrix jobs" | de-numbered |
| `tests/mutation/source/registry.ts:3332` "the WORKFLOW's hard-coded `[0, 1, 2, 3]`" | de-numbered; the `"3600"` in the same sentence is the budget and stays |
| `vitest.projects.ts:86` "sharded across four files" | de-numbered |
| the root `.gitignore` comment at line 126 | de-numbered |
| `tests/mutation/source/shardPartition.test.ts:245` | N/A, inside the case Step A deletes |
| `tests/planFences/readCore.test.ts:340` "four SOURCE extensions" | N/A, a different domain (plan fences), not this count |
| `tests/mutationWeight/instrument.test.ts:1104` "FOUR surfaces over four shards" | N/A, a self-contained fixture with its own literal 4; it does not import `SOURCE_SHARD_COUNT` |

**Anti-tautology, on the replacement budget case.** It asserts the binding leg computed from
`sourceShardAssignment()` and `weightOf` over the LIVE `GUARD_SURFACES` is at or under
`SHARD_BUDGET_SECONDS`. No committed second count, because a literal here rots exactly as the
deleted case's did. The concrete failure it catches: a surface enrols heavy enough, or a rate is
re-measured upward, and the partition silently stops fitting. It is not satisfiable by the constant
alone, since raising `SOURCE_SHARD_COUNT` without the registry changing lowers the makespan, which
is the direction the assertion permits.

<!-- tasks: end -->

## A third task, deleted before it was written

An earlier draft added a case asserting no shard slice is empty, on the reasoning that
`registerSurfaceCases` wraps `describe.each` and an empty slice would register zero cases. Review
round 2 checked both halves of that and both were wrong. `tests/mutation/source/records.test.ts:413`
already asserts it, over `SOURCE_SHARD_COUNT`, so it covers eight shards without an edit. And an
empty shard file would not pass quietly regardless: `passWithNoTests` is unset in both
`vitest.config.ts` and `vitest.projects.ts`, so it defaults false and vitest fails a file with no
suites. The task is recorded as deleted rather than removed silently, because a duplicate guard
that cannot start red is the thing the RED contract above exists to prevent, and this plan nearly
shipped one.

## Closeout

`pnpm heavy pnpm test`, `pnpm typecheck`, `pnpm exec eslint .`, `pnpm format:check`, each as its own
command. Then push, then the real `mutation-harness` run, which the PR fires by path filter without
a manual dispatch. AC-5 reads its per-leg `elapsed.txt` values. If the measured max leg breaches
while the model says it fits, N is raised again in this same PR and re-run: the model is evidence,
the run adjudicates.

The `BL-MUTATION-SHARD-BUDGET-AGGREGATE-OVER` row is archived with the decision, the arithmetic and
the residual. The IN PROGRESS marker comes off in the PR's LAST commit, before any merge. This arc
does not merge; bl-orch issues the merge word.

## Plan checklist

- [ ] Every `red=` validated: the `red-state=live` marker observed failing, each `red-state=authored`
      marker naming a production line that was read rather than resolved.
- [ ] The prose sweep re-run rather than trusted, and its N/A rows justified individually.
- [ ] `sourceShardPartition` re-scored, scoped, with the take and release announced to bl-orch.
- [ ] No `BL-` or `DEF-` row filed, of any facing. Findings repaired here or recorded as documented
      limits in the spec's §4.
