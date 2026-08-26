# Plan — eight source-mutation shards, so the partition fits its per-leg budget

Spec: `docs/superpowers/specs/ci/2026-08-26-mutation-shard-budget-fit.md`.

impeccable-gate: N/A — no UI surface

## What is already on the branch

Spec, plan and review-round corpus, no code. `git rev-list --count origin/main..HEAD` is the live
figure; a number written here would be stale by the next commit, which is what happened to the
first draft of this line.
The predecessor arc (PR #896, merged as `94de73ef6`) is the base: it replaced the weight model with
`bootsOf(surface) * surface.millisPerBoot` and moved `SHARD_BUDGET_SECONDS` to `tests/mutation/source/budget.ts`.

## Earning RED on code that already exists, and why this is ONE task

Every change here is on code that works today, so "write a failing test" is unavailable in its
naive form: a test written against working code passes on its first run.

The first draft split this into two tasks, a guard task and a change task, and plan review
BLOCKED it for the right reason. The guard asserts that shard indices below the count are not
matched by the ignore rules and the first index at or above it is. On today's tree that is TRUE,
so the guard passes the moment it is authored, and the only thing that makes it fail is the other
task raising the constant. A failure borrowed from a later task is not RED per task, and the
plan-writing rules reject a guard that passes when authored.

The tasks are also not separable in the tree. `_metaSourceShardIntegrity` pins the constant
against the workflow matrix and the budget-step env, the template case pins one shard file per
shard, and the ignore range decides whether those files can be staged at all. Move any one and the
suite is red until the others follow. So this is ONE task, and its RED is real, in two recorded
steps that both fail before anything is made to pass.

The task's own guard earns its RED inside that sequence rather than borrowing it: the guard is
written first and passes, then the constant moves with nothing else changed, and the guard fails
reporting shard4 through shard7 as ignored, which is the exact defect it exists to catch. That
transition is the plant, and the defect is REAL rather than constructed, because the constant is
the subject of the change.

## Pre-draft code-verification pass

Every symbol, path and line below was grepped against the live tree at `fb5b461d7`. Line numbers drifted from the arc brief, which named 152, 288-290 and 1522 for the three
workflow and coverage-scan sites; all three are re-read here rather than carried:

| claim | verified |
| --- | --- |
| `SOURCE_SHARD_COUNT = 4` | `tests/mutation/source/shardPartition.ts:26` |
| `SHARD_BUDGET_SECONDS = 60 * 60` | `tests/mutation/source/budget.ts:13` |
| workflow matrix | `.github/workflows/mutation-harness.yml:158` |
| budget step env | `.github/workflows/mutation-harness.yml:294-296` |
| coverage-scan value text | `tests/ci/_workflowCoverageScan.ts:1559-1560` |
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

**EXTENDS** `tests/mutation/_metaSourceShardIntegrity.test.ts` (nothing added; its existing
byte-identical-template and env-pin cases are exercised over eight files rather than four without
being edited). **EXTENDS**
`tests/mutation/source/shardPartition.test.ts` (one case DELETED, one added). **EXTENDS**
`tests/ci/_workflowCoverageScan.ts` (one pinned value text). **EXTENDS** `tests/mutation/_metaSpawnDisposition.test.ts` (one
`DISPOSITIONS` row). **EXTENDS** `tests/mutation/source/shardBalance.test.ts` (the held-out
comparison's shard count, derived from each fixture instead of read from the live constant). **CREATES** **tests/mutation/_metaShardRangeTracked.test.ts**, and only because
the spawn-disposition contract forces it: the guard shells out to git, and the file that would
otherwise have hosted it already carries a blanket `member: false` row that a real spawn would
contradict. The task says so at the point of the decision.

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

Exact-millisecond check on the equality the task depends on, because the re-arming case at
`shardPartition.test.ts:203` asserts `makespan === heaviest` rather than `>=`:

```
n=4 makespan_ms=4666275 heaviest_ms=2443987 equal=false evenSplit_ms=4662930.5 heaviest>evenSplit=false
n=8 makespan_ms=2443987 heaviest_ms=2443987 equal=true  evenSplit_ms=2331465.3 heaviest>evenSplit=true
```

At four shards that case takes its early-return branch. At eight it takes the `premise(...)` branch
and asserts equality, which holds exactly. Raising the count therefore RE-ARMS a case that has been
dormant, which is what its author built it to do, and its stale comment naming "521" and "21
surfaces" and `SOURCE_SHARD_COUNT = 4` is rewritten by the task rather than left describing a premise
that no longer applies.

## Acceptance criteria these tasks discharge

| AC | discharged by |
| --- | --- |
| AC-1 (`SOURCE_SHARD_COUNT === 8`, modelled binding leg under budget, derived) | Task 1 |
| AC-2 (four new shard files byte-identical modulo index) | Task 1 |
| AC-3 (every derived site carries 8) | Task 1 |
| AC-4 (the breach case DELETED, not skipped) | Task 1 |
| AC-5 (a real `mutation-harness` run green, every leg under 3,600 s) | Closeout |
| AC-6 (twelve required checks green) | Closeout |
| AC-7 (the tracked shard range derived from the count, both halves) | Task 1 |

There is no task for the non-empty-slice property: it is already pinned. The section after the
task region records why the task that would have added it was deleted.

<!-- tasks: depth=2 red-contract -->

## Task 1 — eight shards, the partition fits, and the tracked range follows the count

<!-- task: red=`pnpm vitest run tests/mutation/source/shardPartition.test.ts tests/mutation/_metaSourceShardIntegrity.test.ts tests/mutation/_metaShardRangeTracked.test.ts tests/mutation/_metaSpawnDisposition.test.ts tests/mutation/source/shardBalance.test.ts` red-state=authored red-target=`tests/mutation/source/shardPartition.ts:26` why=`this line holds 4, so the modelled binding leg is 4666275ms against a 3600s budget and the budget assertion written in place of the breach-recording case fails, and the scratch ignore rule keyed to the same count has no relation to it so raising the line makes every added shard file unstageable` ac=AC-1,AC-2,AC-3,AC-4,AC-7 -->

**RED, in two recorded steps. Both fail before anything is made to pass, and both go in the
commit message.**

Step A. Replace the breach-recording case at `tests/mutation/source/shardPartition.test.ts:234`
with the budget assertion. Run the suite: it fails, binding leg 4,666,275 ms against a 3,600 s
budget. The marker is `red-state=authored` rather than `live` because the command passes on the
tree as it stands and only fails once this case exists; `spec:lint --exec-red` rejected the `live`
form on exactly that ground, which is the check working.

Step B. Create the shard-range guard (below) in its own file, **tests/mutation/_metaShardRangeTracked.test.ts**,
for the reason that section gives. It PASSES on today's tree, which proves nothing yet. Then raise `SOURCE_SHARD_COUNT` to 8 and
change NOTHING else, and run both suites. Record every red: `_metaSourceShardIntegrity` fails on
the workflow matrix, on the budget-step env, on the shard-file count, and on the new guard, which
now reports shard4 through shard7 as ignored. That last one is the guard failing on the real
defect rather than a constructed proxy, and it is why the guard is written here rather than in a
task of its own that could never have been red.

### The shard-range guard

Derived from `SOURCE_SHARD_COUNT`, never from a literal range:

1. every index below the count resolves to a path the committed ignore rules do NOT match, and
2. the first index at or above the count IS matched, so the scratch convention keeps working.

Both halves are load-bearing. Half 1 alone passes against ignore rules that ignore nothing, which
would let a scoped-run scratch file reach a commit, the failure the rule was written for.

**Three fail-opens this guard must not have. Each was found by review and each is probed.**

- **Tracked-path suppression.** Invoke `git check-ignore` with `--no-index`. Without it git
  suppresses the answer for a TRACKED path, so half 1 reports "not ignored" for shard0 through
  shard7 whatever the rules say: a guard that cannot fail for exactly the files it protects.
- **Verbose exit status.** Decide on the EXIT STATUS with no `-v`. `-v` exits 0 whenever it has a
  rule to report, and a negating rule is a rule, so a path un-ignored by a later `!` line comes
  back exit 0 while not being ignored. `-v` may build the failure message; it may not decide.
- **Ambient exclude sources.** `git check-ignore` also reads `core.excludesFile` and
  `.git/info/exclude`, neither of which is committed. A contributor's local exclusion can satisfy
  half 2 while the committed rule is absent or wrong, which recreates the local-green,
  fresh-checkout-red discrepancy this guard exists to prevent. Probed by plan review against a
  path the committed rule does not match:

  ```
  $ git check-ignore --no-index tests/mutation/guardSurfaces.shard10.test.ts   ; echo exit=$?
  exit=1
  $ git -c core.excludesFile=<(printf 'tests/mutation/guardSurfaces.shard10.test.ts\n') \
      check-ignore --no-index tests/mutation/guardSurfaces.shard10.test.ts     ; echo exit=$?
  exit=0
  ```

  So the guard does not ask the working repository. It builds a scratch repository with
  `mkdtemp` plus `git init -q`, writes the repo's own committed ignore file into it, and asks
  THERE, with `-c core.excludesFile=/dev/null`. A fresh `init` gets an `info/exclude` that is
  comments only, and `/dev/null` removes the global file, so the only rules in force are the
  committed ones under test. The scratch directory is removed in a `finally`.

Ask git rather than parsing the ignore file: the question is what git DOES, and a parser
re-implementing git's glob semantics is a second implementation that can disagree with the first.
Exit 1 means "not ignored", a normal answer here, so the call tolerates that status and treats any
other non-zero as a fault.

**Guard premise.** The guard asserts over a path set derived from a constant, so it must prove it
looked at a non-empty set before concluding anything, or a `SOURCE_SHARD_COUNT` of 0 makes both
halves vacuously true. `premiseHolds(description, condition)` from `tests/_shared/premise.ts`,
imported by the new file the way `_metaSourceShardIntegrity.test.ts` imports it today.

**Where the guard lives, which the spawn-disposition contract decides rather than taste.**
`tests/mutation/_metaSpawnDisposition.test.ts` walks `tests/mutation/` for child-process call
shapes derived from `node:child_process`'s own exports, and a new site with no disposition row
reds it. A first draft of this plan put the guard in `_metaSourceShardIntegrity.test.ts` and
planned a row for it there. That cannot work, and plan review probed why:

- That file already produces one hit, a `RegExp.prototype.exec`, and it already has a file-level
  row (`_metaSpawnDisposition.test.ts:388`) declaring the whole file `member: false` with
  `hits: 1` and a digest.
- File rows match EVERY hit in their file (`rowsFor`), so adding a second file-level row with
  `member: true` gives both hits two rows, and a `kind: "site"` row does not displace the file
  row either, it composes with it. The blanket `member: false` claim would then cover a real
  spawn.
- Replacing the existing row with `member: true` classifies the regex `exec` as a spawn, and a
  member row's ceiling claim is checked PER HIT, so the accounting comes up one ceiling short:
  two spawn hits, one `timeout`.

So the guard goes in a NEW file, **tests/mutation/_metaShardRangeTracked.test.ts**, with its own
`{ kind: "file", member: true, reason: … }` row in `DISPOSITIONS`. A `member: true` row carries no
`hits` and no `digest` (those belong to file-level non-members), and two constraints bind that
"an explicit timeout" does not state precisely enough:

- **`ceilingCount` accepts a positive integer literal or one of four allowlisted names, nothing
  else.** `{ timeout: 10_000 }` counts; `{ timeout: RANGE_GIT_TIMEOUT_MS }` does not unless that
  name is allowlisted and satisfies `CEILING_HOME`. The guard uses the literal form.
- **`reason.trim().length` must be at least 20.**

The count is per file and must be at least the spawn hits in it, so the guard makes exactly ONE
`execFileSync` call: `git check-ignore --no-index` accepts every path at once and prints only the
ignored ones, which yields the whole ignored SET from one invocation and is a stronger assertion
than a per-path exit code. Probed in a clean repository:

```
$ printf 'g.shard[8-9].ts\n' > .gitignore
$ git -c core.excludesFile=/dev/null check-ignore --no-index g.shard0.ts g.shard7.ts g.shard8.ts g.shard9.ts
g.shard8.ts
g.shard9.ts
exit=0
```

One hit, one ceiling, and the assertion compares that printed set against the set derived from
`SOURCE_SHARD_COUNT`. That is participating in the walker rather than dodging it:
the new file is walked like any other, and its one row makes exactly one claim about exactly one
file. It also overrides this plan's earlier "creates no new meta-test file" line, which was a
preference and loses to a contract.

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
5. `tests/ci/_workflowCoverageScan.ts:1560`, the `values` entry under the `SOURCE_SHARD_COUNT`
   key, to text `"8"`. Resolve the key by name rather than by remembered line, because a first
   draft of this plan cited line 1542 and plan review caught it: that line belongs to the
   `SHARD_BUDGET_SECONDS` entry and is not this pin.

   ```
   $ rg -n 'SOURCE_SHARD_COUNT:' tests/ci/_workflowCoverageScan.ts
   1559:  SOURCE_SHARD_COUNT: {
   ```
6. In `package.json`, the `mutation:guards` script (line 58) names shard0 through shard7 plus the gates file.
7. The comment at `tests/mutation/source/shardPartition.ts:25` justifies four on a premise that is
   now false. Rewrite it: the makespan is pinned by the heaviest surface from eight on.
8. The stale comment at `shardPartition.test.ts:203-211` describes the four-shard regime. Rewrite
   it to describe the regime the count now sits in.

**The held-out margin fixtures are FOUR-LEG data, and the count change breaks them.** Plan review
found this and the plan had missed it entirely. `tests/mutation/source/shardBalance.test.ts:84`
passes the live `SOURCE_SHARD_COUNT` into `heldOutMargin`, and each committed pair fixture's
`observed` block records a partition at the count it was measured at:

```
$ python3 -c "import json;print(json.load(open('tests/mutation/source/fixtures/heldout/pair-1.json'))['observed'])"
{'secondsLegs': [5174, 3394, 3979, 5136], 'bootsLegs': [2247, 6138, 3827, 5471],
 'secondsBinding': 5174, 'bootsBinding': 6138, 'marginSeconds': 965}
```

`secondsLegs` has FOUR entries. Run at eight, the same fixture produces eight legs and a different
binding, so all three pairs fail: 5174/6138/965 becomes 2875/3283/408, and pairs 2 and 3 move
likewise. These are the predecessor arc's ratified AC-3 measurements.

**The repair is to decouple, and NOT to recompute the observations.** Recomputing `observed` at
eight would derive the expectation from the code under test, which is exactly the tautology that
test's own comment forbids: "an expectation derived from `weightOf` could not notice a rate mutant,
because both sides would move together." The observations are measurements and must stay
measurements.

So the held-out comparison runs at the shard count ITS OWN FIXTURE was measured at, derived from
the fixture rather than pinned to a literal: `fx.observed.secondsLegs.length`. Each pair then
declares its own leg count by construction, a future pair measured at a different count works with
no edit, and the assertion is unchanged in strength. The claim under test is whether the
seconds-calibrated weight beats the boot-count weight on held-out data, which is a question about
WEIGHTS; reading the shipped shard count there was a coupling to a constant the claim does not
depend on. This is a decoupling, not a weakening: same fixtures, same assertions, same recorded
numbers, one fewer irrelevant input.

It touches the predecessor arc's surface, so it is reported to bl-orch rather than done quietly,
and `tests/mutation/source/shardBalance.test.ts` joins the task's command set.

**Prose class sweep, swept to a derivation and not to a list.** Spec §2.1 calls this class B:
prose that spells the source shard count as a word or a digit, which compiles and asserts exactly
as before while saying something false. The sweep is a command, re-run rather than trusted:

```
rg -n -i '\bfour\b|4 LPT|\[0, ?1, ?2, ?3\]|shard0\.\.shard3' \
  .github/workflows/mutation-harness.yml tests/mutation tests/ci vitest.projects.ts .gitignore package.json
```

The repair is to DE-NUMBER, so the same sites cannot rot again at the next change, not to write 8
where 4 was. Spec review found six members my own first sweep missed and plan review found two more, which is
the reason this is a command plus a triaged table rather than a remembered list. The command's raw
output on this tree is about thirty lines, most of them "four" in an unrelated sense, so the N/A
rows below are part of the answer and not omissions from it. Members and dispositions:

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
| the root `.gitignore` comment at line 111, "pins the FOUR real shard files" | de-numbered |
| `tests/mutation/_metaLedgerKindsDeclarationParity.test.ts:12` "nightly, four-way sharded" | de-numbered |
| `tests/mutation/source/shardPartition.test.ts:245` | N/A, inside the case Step A deletes |
| the root `.gitignore` comments at lines 114 and 132, "four required checks went red" | N/A, an incident count, not the shard count |
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
a manual dispatch.

AC-5 reads its per-leg `elapsed.txt` values, and a breach is CLASSIFIED before it is answered,
because the spec's AC-5 has two branches and only one of them is "raise N". A first draft of this
closeout said to raise N unconditionally, which contradicts the spec it implements.

Classifying needs more than `elapsed.txt`, which carries only the leg total. It needs each
surface's own child seconds and the per-leg overhead, both of which come from the
`mutation-records-source-shards-*` artifacts:

```
gh run download <id> -D <dir>/meas-<id> \
  -p "mutation-records-source-shards-*" -p "elapsed-source-shards-*"
```

overhead for a leg is that leg's `elapsed.txt` minus the sum of its records' child durations; a
surface's own total is the sum of its record's child durations. Then:

- **Divisible.** No single surface on the breaching leg, plus that overhead, exceeds the budget
  alone. Raise N in this same PR and re-run.
- **Indivisible.** Some single surface on that leg does exceed it alone. No N helps, so the
  response is the spec's L-1 remedies (split the surface, or move the budget with the ceiling
  relation in lockstep) plus a message to bl-orch, because that is a scope decision this arc does
  not take alone. Never a filed ledger row.
- **Undecidable, and it is a real branch rather than a formality.** The records upload is
  `continue-on-error: true` (`.github/workflows/mutation-harness.yml:210`), so a run can report an
  over-budget `elapsed.txt` and carry no per-surface records at all. Neither branch above is then
  decidable. Do NOT guess and do NOT default to raising N: re-run the workflow once to try for the
  artifacts, and if they are absent again, report the breach to bl-orch as unclassified with the
  leg totals that do exist. An unclassified breach answered by raising N is the same wrong answer
  the unconditional draft gave, arrived at more slowly.

Before the whole-diff review's `GUARD SURFACE:` line, derive the touched-surface set rather than
asserting it, with two EXPLICIT SHAS, the merge base and this worktree's local head:

```
git -C <worktree> rev-parse HEAD
sh /Users/ericweiss/FX-worktrees/_briefs/seam-inputs.sh <base-sha> <head-sha>
```

Explicit shas, not `HEAD`: that script runs in the MAIN checkout, so a literal `HEAD` resolves to
main and reports a false clean seam. Not `origin/<branch>` either: that reads only the pushed head
and under-reports unpushed commits. The script also reads MAIN's registry, so a surface this branch
newly enrols is invisible to it and is declared by hand; this branch enrols none.

The `BL-MUTATION-SHARD-BUDGET-AGGREGATE-OVER` row is archived with the decision, the arithmetic and
the residual. The IN PROGRESS marker comes off in the PR's LAST commit, before any merge. This arc
does not merge; bl-orch issues the merge word.

## Plan checklist

- [ ] The single `red=` validated: `spec:lint --exec-red` clean, and the one `red-state=authored`
      marker names a production line that was read rather than resolved. There is no
      `red-state=live` marker in this plan; an earlier checklist required observing one.
- [ ] The prose sweep re-run rather than trusted, and its N/A rows justified individually.
- [ ] `sourceShardPartition` re-scored, scoped, with the take and release announced to bl-orch.
- [ ] No `BL-` or `DEF-` row filed, of any facing. Findings repaired here or recorded as documented
      limits in the spec's §4.
