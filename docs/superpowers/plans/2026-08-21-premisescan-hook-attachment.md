# Plan — premiseScan reports the two hook-attachment shapes it cannot follow

**Spec:** `docs/superpowers/specs/2026-08-21-premisescan-hook-attachment.md`
**Branch:** `fix/premisescan-hook-attachment` · **Base:** `origin/main` at `64c40a68e`
**Closes:** `BL-PREMISESCAN-FILE-SUITE-EAGER-HOOKS-LOST`, `BL-PREMISESCAN-NAMED-SUITE-FACTORY-HOOKS-LOST`

`impeccable-gate: N/A — no UI surface`

---

## 0. Pre-draft code verification

Every symbol this plan names, verified against the live tree at `64c40a68e` before drafting.
Anchored by symbol; line numbers are drafting-time locators.

| symbol | where | verified shape |
| --- | --- | --- |
| `classifyTests(root, suitePath)` | `tests/mutation/source/premiseScan.ts:1510` | `export function`, returns `TestClassification[]` |
| `TestClassification` | `tests/mutation/source/premiseScan.ts:38` | `{ testName, line, verdict, detail, hasPremise, exemption }` |
| `Verdict` | `tests/mutation/source/premiseScan.ts:36` | `"environment-touching" \| "environment-free" \| "unclassifiable"` |
| `topLevelHooks` loop | `tests/mutation/source/premiseScan.ts:1752` | reads `facts.sf.statements`, accepts `ExpressionStatement` only |
| `fileReports` | `tests/mutation/source/premiseScan.ts:1665` | `[...facts.moduleReports]`, merged into every test's `reasons` |
| precedence branch | `tests/mutation/source/premiseScan.ts:1725` | `if (ownUnresolved.length > 0) … else if (verdict === "environment-free" && reasons.length > 0)` |
| `withModule(reason, path)` | `tests/mutation/source/premiseScan.ts:1528` | appends `, in <path>` |
| `hookBodies(describeCall)` | `tests/mutation/source/premiseScan.ts:1834` | lexical hook collection, prunes nested BODY only |
| `isSuiteBody(arg)` | `tests/mutation/source/premiseScan.ts:1891` | unwraps 6 outer-expression kinds, then `ArrowFunction \| FunctionExpression` |
| `registrarRoot(callee)` | `tests/mutation/source/premiseScan.ts:68` | peels calls then properties; `MODIFIERS` gate; returns root or `null` |
| `HOOK_REGISTRARS` | `tests/mutation/source/premiseScan.ts:66` | `/^(beforeEach\|beforeAll\|afterEach\|afterAll)$/` |
| `verdict(src)` | `tests/mutation/source/premiseScan.test.ts:18` | writes a temp file, returns the FIRST row's verdict |
| `verdicts(src)` | `tests/mutation/source/premiseScan.test.ts:1031` | block-scoped inside one `describe`; returns every row's verdict, no `detail` |
| `premise` / `premiseHolds` | `tests/_shared/premise.ts:26` / `tests/_shared/premise.ts:36` | `premise(desc, actual, mustExceed)`, `premiseHolds(desc, condition)` |
| `premiseScan` registry row | `tests/mutation/source/registry.ts:168` | `suitePaths` = the scan suite + `_metaPremiseContract`; `operators` = 3; `scoreFloor` 0.95 |
| `EXPECTED_ENV_TOUCHING` | `tests/mutation/_metaPremiseContract.test.ts:32` | declares `premiseScan.test.ts: 0` at `tests/mutation/_metaPremiseContract.test.ts:94` |

**Gap this plan must close:** no existing helper returns `detail`. `verdict()` returns the first
row's verdict only, and `verdicts()` is block-scoped to one `describe` and drops `detail`. Task 1
adds a file-level `rows(src): TestClassification[]`.

## 0.05 Acceptance criteria this plan discharges

Restated here so every `ac=` id resolves inside the plan that claims it, and so a reader can see at a
glance which task proves what. The normative text is the spec's §6; this is an index, not a second
definition.

| id | claim | discharged by |
| --- | --- | --- |
| **AC-1** | all 12 (eager position × hook registrar) cells report, with a reason naming the hook and its line and NOT naming a suite | Task 1 |
| **AC-2** | the generated case count equals the declared axis product, and the registrar axis is derived from `HOOK_REGISTRARS` itself | Task 1 |
| **AC-3** | the rule is indifferent to registration spelling across the four structural classes | Task 1 |
| **AC-4** | all nine reporting cells report and all seven silent cells stay silent, 16 in total | Task 2 |
| **AC-5** | a provably `environment-touching` test keeps its verdict under BOTH producers | Tasks 1 and 2 |
| **AC-6** | every reporting cell has a one-variable negative twin that classifies `environment-free` | Tasks 1 and 2 |
| **AC-7** | the surface's own `suitePaths` carry no LIVE instance of either shape | Task 3 |
| **AC-8** | `EXPECTED_ENV_TOUCHING` is unchanged, proved by a field check on the committed diff | Task 4 |
| **AC-9** | the probe record's zeros still hold at HEAD | Task 4 |
| **AC-10** | the mutation score is measured at HEAD with an empty unaccepted-survivor set, at or above `scoreFloor` | Tasks 4a and 4b — 4a re-keys and RE-VALIDATES the accepted survivors, without which the gate fails outright; 4b supplies the provenance pair as an executable command, since the harness implements none |

## 0.1 Meta-test inventory

- **Creates:** none.
- **Extends:** `tests/mutation/source/premiseScan.test.ts` (a `suitePath` of the enrolled
  `premiseScan` surface), with a new self-pollution guard case (Task 3).
- **Edits:** `tests/mutation/source/registry.ts`, at Task 4a only, to re-key the accepted survivor
  whose line the source edits move. No other row and no other field is touched.
- **Explicitly does NOT touch:** `tests/mutation/_metaPremiseContract.test.ts`. Spec AC-8 makes that
  a field check on the committed diff, not a suite result.

## 0.2 Mutation-family closure

The closure set is the registry row's declared operators and nothing else:
`relational-boundary`, `equality-flip`, `integer-literal` (`tests/mutation/source/registry.ts`,
the `premiseScan` row). `logical-connector` and `statement-removal` are excluded there for wall
clock, which that row states is a budget rather than a claim about the mutants. A reviewer-proposed
NEW family is admissible only with a live escaping mutant demonstrated against the shipped guard;
widening the set is a registry change carrying its own numbers, not a finding on this diff.

---

## 0.3 Design validated empirically BEFORE this plan was written

A prototype of both producers was spliced into a copy of `premiseScan.ts` in a SEPARATE worktree
(`FX-worktrees/premise-spike`) — separate because a reviewer was live against the arc's tree, and a
transient mutation under a live read is a contaminated review. The prototype is ~40 lines and is not
the shipped implementation; it exists to answer "does this design produce the intended verdicts"
before a reviewer is asked that question.

**The prototype was carried through spec review r1's two findings and re-measured after each
repair.** Final state, all constructed cases correct:

```
A1 hook in the NAME argument              -> unclassifiable, both tests, reason names the hook
A1-twin identical minus the hook          -> environment-free
A2 hook in a curried .each producer       -> unclassifiable, both tests
B1 named factory (bare identifier)        -> unclassifiable, both tests
B-wrapped identifier `(suiteA)`           -> unclassifiable, both tests
B-twin factory inlined                    -> environment-free
NEGATIVE ordinary nested describe + hook  -> environment-free, NO report
NEGATIVE touching test in affected file   -> environment-touching, reason attached, NOT demoted
NEGATIVE wrapped INLINE bodies            -> environment-free, NO report
r1-F1a function-valued name hides factory -> unclassifiable  (silent free killed)
r1-F1b bodyless options registration      -> environment-free (false advisory killed)
r1-F2  eager hook inside a named factory  -> reason no longer claims a scope
```

The last three are the ones that would have cost rounds. An ordinary nested `describe` carrying a
hook is the single most common shape in the corpus and it must NOT report; a provably touching test
must keep its verdict rather than being demoted; and an inline body reached through one of the six
transparent wrappers `isSuiteBody` already accepts must not be mistaken for an unlocatable one.

**And the live corpus is untouched under the prototype, checked STRUCTURALLY** (spec §3.4):

```
$ pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-21-premisescan-hook-population/record-diff.mts
POSITIVE CONTROL: perturbing one record moves 1 (expected 1)
baseline ref             : origin/main
suites                   : 70
records: baseline 2648, live 2648
records only in baseline : 0     records only in live     : 0
VERDICT moved            : 0     DETAIL moved             : 0
```

That transcript is the COMMITTED script's output. An earlier draft quoted
`POSITIVE CONTROL differs: true`, which the committed script cannot emit — the constructed control
lived in the scratch prototype and the committed version carries a STRUCTURAL one that perturbs a
baseline record instead. The spec was corrected for this last round and the plan was not, which is
the artifact-PAIR sweep failing on its own arc. Plan review r1 finding 3.

All 2648 classified rows across the 70 enrolled suites are dumped as
`(suite, line, testName, verdict, detail)` under the SHIPPED baseline and under the prototype and
diffed as SETS. Detail strings are compared for equality BETWEEN THE TWO RUNS, never against known
reason strings, and the positive control lives inside the same invocation and throws if a constructed
named-factory file fails to disagree. The baseline module is the shipped state: `origin/main` and
this branch carry the same `premiseScan.ts` blob `8289f7291a`, and zero commits on this branch touch
that file.

So both halves of the consequence bound are MEASURED rather than argued: every constructed instance
reports, and **zero false advisories on the live corpus**. Note what this does and does not give
AC-8: no verdict moved, so no declared count can have moved — but a verdict-count comparison ALONE
could not have established that, because a reason attached to an `environment-touching` test moves no
count. The record diff is what covers both.

**The prototype is not the implementation and its numbers do not transfer to the shipped diff.** It
establishes that the design is sound; the tasks below still author their own cases and the score is
measured against the shipped source.

## 0.45 What each instrument does on THIS branch versus with the change — measured

Every instrument now exits non-zero when it finds the thing it looks for, so an implementer needs to
know which non-zero results are EXPECTED before the work lands. Measured on both trees rather than
predicted:

| instrument | on this branch (no producers) | with the change | what a wrong result means |
| --- | --- | --- | --- |
| `claims-check.mts` | **exit 0** — every declared limit has a probe, every named script resolves, spec and script agree on 16 | exit 0 | it checks DOCUMENTS, so the producers do not affect it; any non-zero is a real documentation defect |
| `cell-check.mts` | **exit 1**, `7 of 16` — the nine reporting cells emit no reason yet | **exit 0**, `16 of 16` | anything other than 7 on the branch means the cell set moved without the table moving |
| `limits-check.mts` | **exit 1**, L1, L2 and L5 FALSE — those three describe post-change behaviour | **exit 0**, all 8 HOLD | a FOURTH row FALSE on the branch means a limit that should hold today does not |
| `record-diff.mts` | **exit 2** — baseline and live are the same bytes, so it REFUSES to report | **exit 0**, 0 records moved | exit 1 with the change means the change is not verdict-neutral, which contradicts §3.4 |
| `derive-inputs.mts` | **exit 0**, 18 paths — it reads the registry and the filesystem, not the producers | **exit 0**, 18 paths | exit 2 means the walk is broken; a COUNT below 18 means an input stopped being reachable and the stamp has silently narrowed |

Three of the four are red-then-green by construction, and that is the point: a green
`cell-check` or `limits-check` on this branch would mean the instrument had stopped discriminating,
not that the work was done. `claims-check` is the exception because its subject is the documents
rather than the scanner.

This table exists because the question "what exit code does an instrument produce when it finds the
thing it is looking for" turned up two instruments that produced ZERO — one of them found only after
the other had been fixed without sweeping its peers.

**A repair that changes what an instrument DOES changes what a clean tree looks like.** This table
exists only because making `limits-check` GATE rather than print — itself a repair, for an instrument
that reported findings under exit 0 — changed its result on the pre-change branch from green to red.
Nobody anticipated that, and it was found by RUNNING the gates rather than by reasoning about them.
The general form: when a repair alters an instrument's exit behaviour, the expected profile of every
tree it runs on moves with it, and the profile is part of what the repair owes.



## 0.46 Each r4 repair carries a both-directions proof, because a repair is a task

Repairs are authored faster, under more pressure, and with less review than original work, and they
inherit the full acceptance burden anyway — which is how three of plan review r4's four findings came
to be defects in this arc's own repairs. So each repair below was proven the way the original work
was, rather than reasoned about:

| repair | proven to WORK | proven to FAIL when it should |
| --- | --- | --- |
| `record-diff` gates on movement | 0 records moved, exit 0 | a constructed unconditional reason moves 5221 records, **exit 1**. The FIRST perturbation moved zero and was refused rather than accepted — an ineffective patch renders identically to a real null |
| Task 4b enforces gate status and stamp equality | healthy path **exit 0** | failing gate → **exit 7** (the gate's own status, not swallowed); differing stamps → **exit 1** |
| Task 4b's input set is a derived closure | derives **18** — the transitive walk plus four declared harness seeds | a 3-input set trips the floor → **exit 2**; ten missing inputs → **exit 2** rather than the empty-stream digest |
| the twin premise runs per cell | a correct one-variable twin satisfies it | an unrelated hook-free twin is **REJECTED** — the premise discriminates rather than merely executing |

The `probe-*` scripts are deliberately NOT in this table: they are measurement instruments whose job
is to produce a figure, so report-only is correct for them, and the discriminator is recorded in
§0.45 so a later sweep does not re-raise them as missing gates.

## 0.4 Red-command validation, run at plan time

Every `red=` in the region below is the SAME command, parse-checked and collection-probed here so a
red that exits non-zero for a collection reason is named rather than believed:

```
$ sh -nc 'pnpm exec vitest run tests/mutation/source/premiseScan.test.ts --project parallel'
PARSE OK

$ pnpm exec vitest list tests/mutation/source/premiseScan.test.ts --project parallel | wc -l
326
```

326 collected cases, so the command can express a verdict in both directions. No `-t` name filter is
used anywhere in the region: one that matches nothing exits 0 and reports green from the moment it
is written.

**All three enrolled tasks share ONE red command** — `pnpm exec vitest run tests/mutation/source/premiseScan.test.ts --project parallel` — and each is `red-state=authored`: the failing case is written by the task itself, which is
the ordinary invariant-1 shape — so each names the production line whose absence makes the new case
fail, verified absent on the live tree, with observed-red landing in the task's own RED step.

---

## 1. Architecture

Two new PRODUCERS of file-level reasons inside `classifyTests`. No new precedence, no new
resolution, no new traversal, and no edit to `MODIFIERS`, `HOOK_REGISTRARS`, `registrarRoot`,
`isSuiteBody` or `hookBodies`.

Both producers append to the same local array the existing `fileReports` feeds, so the existing
precedence branch demotes `environment-free` to `unclassifiable` and leaves `environment-touching`
intact with no edit.

---

## 1.5 Rule 17 — every named weaker implementation owes a KILLING CHECK that exists and fires

The plan names weaker implementations in two places: Task 1's four pre-dispatch mutants and Task 2's
kill-target table. A plan can be entirely right about those and the implementation still ship without
the checks — that gap lives only between plan and implementation, so no plan review and no fixture
audit catches it.

**Derive the list from the tables above, never from recall**, and for each entry record which of
three states it is in:

- **ABSENT** — no shipped test would fail if the weaker implementation were substituted. Not
  acceptable; author the case.
- **PRESENT BUT UNPROVEN** — a case exists that should kill it, never run against the mutant. That is
  a claim, not a proof, and it fails in the direction that looks green.
- **PROVEN** — the weaker implementation was actually built or the mutation applied, the named case
  observed failing, and the original restored.

Every entry must reach PROVEN before the diff dispatch, and the counts go in the commit. Two of them
are already PROVEN ahead of implementation, because spec review r1 and r2 built them as findings:
the raw-node-kind reading (killed by the wrapped-identifier cell) and the any-argument reading
(killed by the function-valued-name cell). **A finding that became a fixture cannot recur silently.**

## 1.6 Coverage is COMPLETE, and saying so is what stops the guard suite ratcheting

The arc ships four checks — `cell-check`, `record-diff`, `limits-check` and `claims-check`. Each was
added for a measured reason, and a suite that grows one check per round is the same ratchet this
repository has paid 20 and 41 rounds for, wearing a guard's clothes instead of a recognizer's. The
terminating condition, stated so a later round cannot propose a fifth check as an improvement:

> **Coverage is COMPLETE when every claim-site class has a derived cover AND the map itself is
> derived from the document's own declarations.** A new claim then REDS automatically and no further
> check is owed.

A fifth check is owed only if a new claim-site CLASS appears — never because a further instance is
imagined inside a class already covered. An instance found inside a covered class is a defect in
THAT COVER, and the repair is to fix the cover rather than add a sibling beside it. Same rule the
spec's §5.4 states for the spelling axis, applied to the guard suite itself.

---

<!-- tasks: depth=2 red-contract -->

## Task 1 — `rows()` helper, and producer A reports an eager-position hook

<!-- task: red=`pnpm exec vitest run tests/mutation/source/premiseScan.test.ts --project parallel` red-state=authored red-target=`tests/mutation/source/premiseScan.ts:1752` why=`the new cases assert verdict "unclassifiable" and a detail naming the hook; today the topLevelHooks loop accepts only ExpressionStatement, so no reason is ever produced and every case reads "environment-free"` ac=AC-1,AC-2,AC-3,AC-5,AC-6 -->

**Files:** `tests/mutation/source/premiseScan.test.ts`, `tests/mutation/source/premiseScan.ts`

**What is red and why.** The new cases assert that a hook in the eager position of a registration
outside every inline suite body makes every `environment-free` test in that file `unclassifiable`,
with a `detail` naming the hook and its line — and NOT naming a suite, since spec review r1
withdrew that claim. The production line whose defect makes them fail is the `topLevelHooks` loop, which today
`continue`s on any statement that is not an `ExpressionStatement` and therefore never sees a hook in
an argument position. Verified absent on the live tree, sweep run at plan time:

```
$ grep -n "eager" tests/mutation/source/premiseScan.ts
1855:    // `.each`/`.for` producer, and the eager name and options arguments -- so a
1881: * expression let a wrapped body be walked as if it were an eager argument,
```

Two hits, both COMMENTS and neither at file scope: 1855 is inside `hookBodies`, describing the
NESTED case it already handles, and 1881 is `isSuiteBody`'s docblock. No executable eager-position
reading exists outside `hookBodies`.

RED step authors the cases; GREEN step adds the producer. Same command both times.

**An eager position is EVALUATED, and a nested function body in one is NOT** (spec §3.1, spec review
r3 finding 1). The walk stops at every FUNCTION-LIKE node, using TypeScript's own `ts.isFunctionLike` predicate
rather than a hand-listed set of kinds — so `describe.each([() => { beforeEach(…) }])` and
`describe.each([{ setup() { beforeEach(…) } }])` are both SILENT while
`describe.each([beforeEach(…)])` still reports. An enumeration of node kinds is a list to be
completed one kind per review round; it failed exactly once (r4 finding 2 arrived as a
`MethodDeclaration`) before being replaced. **One cell covers the whole class**, not one per kind,
because a cell per kind rebuilds the enumeration the predicate deleted.

**Cases — the 12 cells, generated from two declared axis arrays, not hand-written:**

- `POSITIONS` = `["name", "options", "producer"]`
- `REGISTRARS` — derived from the shipped `HOOK_REGISTRARS` source, never retyped, so a registrar
  added there without a case fails AC-2 rather than being silently uncovered.

**All 12 cells are realizable and all 12 report under the prototype**, measured at plan time so
AC-1's largest claim is not left to implementation to discover:

```text
REPORTS  name     x {beforeEach, beforeAll, afterEach, afterAll}
REPORTS  options  x {beforeEach, beforeAll, afterEach, afterAll}
REPORTS  producer x {beforeEach, beforeAll, afterEach, afterAll}
12 of 12 producer-A cells report
```

The spelling varies with the position because it must: the curried-producer slot exists only on a
curried spelling, so that row uses `describe.each([...])(...)` while the name and options rows use a
bare `describe`. The CELL is (position × registrar); the spelling is whatever makes that position
exist, and §5.2's independence proof is what establishes the choice does not matter.

Every cell is an **expect-a-REPORT** case: it asserts a `detail` the implementation must PRODUCE,
never an absence. Each cell carries a one-variable negative twin — identical bytes minus the hook —
that must classify `environment-free`, which is what makes the report attributable rather than a
scanner that reports on everything.

**Premise, executable and unconditional relative to what it guards.** Above the assertions, not
inside any `.each` callback:

```ts
const HOOK = `beforeEach(() => { spawnHelper(); })`;
const caseSrc: string = `describe(String(${HOOK}), () => { it("inA", () => {}); });`;
const twinSrc: string = caseSrc.replace(HOOK, `"x"`);

premise("the generated cell set is non-empty", cells.length, 0);
premiseHolds(
  "the twin is the case with exactly the hook text replaced, so the pair differs by ONE variable",
  twinSrc !== caseSrc && twinSrc === caseSrc.replace(HOOK, `"x"`) && caseSrc.includes(HOOK),
);
```

**The premise runs PER CELL, on that cell's own inputs, and verifies that `hookText` IS A HOOK.**

```ts
const HOOK_CALL = /^(beforeEach|beforeAll|afterEach|afterAll)\s*\(/;

for (const cell of cells) {
  premiseHolds(
    `${cell.id}: the twin is this cell's own source with exactly ITS HOOK replaced`,
    HOOK_CALL.test(cell.hookText.trim()) &&
      cell.caseSrc.includes(cell.hookText) &&
      cell.twinSrc !== cell.caseSrc &&
      cell.twinSrc === cell.caseSrc.replace(cell.hookText, `"x"`),
  );
}
premise("the generated cell set is non-empty", cells.length, 0);
```

Two generator errors this rejects, both of which passed earlier drafts:

- **An unrelated hook-free twin** for some cell while a correct representative is displayed. The
  earlier premise was stated ONCE over a hard-coded pair, so it proved that SOME case was fine — the
  validates-something-ADJACENT defect (plan review r4 finding 4).
- **A `hookText` naming more than the hook.** With it set to the whole eager expression
  `String(beforeEach(…))`, the twin removes `String(…)` too, yet every other conjunct still holds and
  the twin is still `environment-free`, so the verdict assertion passes as well (plan review r5
  finding 3). The `HOOK_CALL` test is what makes the premise read the thing it names.

Verified: a correct one-variable twin is ACCEPTED; the wide-span generator is REJECTED; the unrelated
twin is REJECTED.

**Task 2 carries its own B-SPECIFIC predicate, not "the same" premise.** Producer B's twin inlines
the factory rather than replacing a hook, so it asserts that the twin is this cell's own source with
exactly its unfollowable factory-slot argument replaced by an inline body — the same one-variable
shape, over a different variable. An earlier draft said only that Task 2 carried "the same" premise,
which named no predicate at all.


**The weak form of that premise was caught by typechecking the snippet, and it is worth naming.** An
earlier draft asserted only `twinSrc !== caseSrc`, which proves the pair DIFFERS and says nothing
about differing by exactly one variable — the property the twin exists to establish. A premise that
cannot fail for the reason it names is a tautology however it reads, so the condition now pins the
substitution itself and asserts the hook was present to begin with. Typechecked under
`--strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes`, exit 0.

**AC-3, the spelling-independence proof, lives HERE rather than in a task of its own — and the
reason is measured.** The four structurally distinct spelling classes (bare `describe`, depth-1
plain `describe.skip`, depth-1 curried `describe.each`, depth-2 `describe.concurrent.each`) all
REPORT the moment this producer lands, probed:

```
REPORTS  bare describe          REPORTS  depth-1 curried .each
REPORTS  depth-1 plain .skip    REPORTS  depth-2 concurrent.each
```

So a separate task for them would carry a red that is PRE-SATISFIED by this one — green from the
moment it is authored, proving nothing and unable to fail for the reason it names. They are
assertions ABOUT this producer, so they belong in its cycle, where they are red before it lands and
green after. An earlier draft of this plan had them as Task 3; the plan's own rule-81 self-check
caught it.

**The expected reason is built by CALLING the shipped formatter, never by re-typing it — and the
plan-time attempt to re-type it was already wrong.** `withModule` is

```ts
const withModule = (reason: string, path: string): string =>
  reason.includes(" in ") ? reason : `${reason} in ${path}`;
```

A hand-written expectation with a comma before `in` fails against it; that is exactly what happened
when this was probed, and the discrepancy was in the MODEL, not in the surface. Rule 84 — compute
through the shipped implementation, because a reimplementation is a second definition free to drift.

**And that helper carries a trap the tests must pin.** It appends the module path only when the
reason does NOT already contain `" in "`. So a reason worded `"…cannot be located in this module"`
would silently ship with no path, and every assertion that checks only the sentence would still
pass. Probed: neither producer's current wording contains `" in "`, and both emit their path —

```text
PATH PRESENT  | hook beforeEach at line 1 is registered from an eager argument position, …
PATH PRESENT  | the registration at line 2 has no inline suite body and carries an argument …
```

— but that is true of today's wording only, which is a claim with an expiry date. **Both tasks
therefore assert that the emitted `detail` CONTAINS the suite path**, which catches the drop
whatever the wording becomes, rather than asserting the wording and inheriting its expiry.

**Four pre-dispatch mutants** (the `detail` assertions are string-presence guards). Run each before
the diff dispatch and record the result in the commit:

(a) reason string emptied → cases must red;
(b) reason string plus an appended suffix → must red, because the assertion pins by equality
    derived from the case's own fields rather than by `toMatch`;
(c) the reason present but not live — produced into a local that is never merged into `reasons` →
    must red;
(d) each discriminating parameter varied in turn — the hook name, the position, the line number.

## Task 2 — producer B reports a factory-slot argument the scanner cannot follow

<!-- task: red=`pnpm exec vitest run tests/mutation/source/premiseScan.test.ts --project parallel` red-state=authored red-target=`tests/mutation/source/premiseScan.ts:1669` why=`the new cases assert an "unclassifiable" verdict plus a detail for each reporting cell, "environment-free" for each silent cell and for each one-variable twin, and an unchanged "environment-touching" verdict for the precedence case; today nothing in classifyTests examines a registration's factory slots, so the reporting and twin assertions fail` ac=AC-4,AC-5,AC-6 -->

**Files:** `tests/mutation/source/premiseScan.test.ts`, `tests/mutation/source/premiseScan.ts`

**The rule** (spec §3.2): for a `describe` root ONLY — `suite` is a Vitest alias but the frozen
`REGISTRARS` matches identifier TEXT, so `registrarRoot` never returns it (§4 L6) — among the
arguments at index >= 1 —
slot 0 is always `name` per Vitest's `SuiteCollectorCallable` — accept if one is a locatable inline
body, or if EVERY one is an inert literal. Otherwise report. Per REGISTRATION, never per argument.

**`it`/`test` roots are excluded, and that is a repair rather than a simplification.** A test
registration cannot carry a suite factory, and its handler is not lost either way: a test's extent is
the whole call expression, so the traversal already resolves a named handler to its declaration.
Bracketed — `test("named", testFn)` with a spawning `testFn` is `environment-touching` on
`origin/main`. Reporting there was spec review r2 finding 2, a wrong attribution AND a false advisory
on the ordinary extraction of an inline test callback.

**Why the red is the vitest suite and NOT `cell-check.mts`, which is the sharper point.**
`cell-check.mts` decides a cell solely on `rows.some((r) => r.detail.length > 0)` — whether a reason
was emitted. It never reads a VERDICT and never runs a twin. So it can observe AC-4 and it
structurally CANNOT observe AC-5 (a touching test keeps its verdict) or AC-6 (a one-variable twin
classifies `environment-free`), and a marker naming all three against that command would claim
proofs its own red cannot see. Plan review r1 finding 1.

`cell-check.mts` is still committed and still valuable — it is an already-failing gate (7 of 16, exit
1 on this branch; 16 of 16, exit 0 with the producer) and Task 4 runs it. It is a GATE, not this
task's red.

The red is `red-state=authored`, the ordinary invariant-1 shape: the failing cases are written by
this task, and the production line whose absence makes them fail is the registration branch of
`classifyTests`'s walk, which examines no factory slot today.

**Nine REPORTING cells, each naming the implementation it kills** (spec §5.2), so a later edit cannot
silently defang the case:

| cell | kills |
| --- | --- |
| bare identifier | the baseline shape |
| `function` declaration factory | a rule accepting only arrow-initialized factories |
| property access | a rule keyed on the identifier spelling |
| **wrapped identifier** `(suiteA)`, `suiteA as never` | a rule reading the RAW argument node kind, which sees a `ParenthesizedExpression` and falls silent — the fail-open direction |
| call expression | a rule requiring a named BINDING |
| **function-valued name** `describe(function t() {}, suiteA)` | a rule whose body test ranges over EVERY argument, where the NAME satisfies it and the factory goes unreported |
| **factory in slot 1 + trailing timeout** `describe("A", f, 5000)` | a LAST-SLOT-ONLY rule, which accepts the numeric timeout as inert and misses the factory |
| **literal options then factory** `describe("A", { concurrent: true }, f)` | a FIRST-SLOT-ONLY rule, which accepts the object literal as inert and misses the factory |

**Seven SILENT cells**, each one ordinary edit from a reporting cell, so a rule that fires on them is
over-firing on live authoring:

`describe("A", { skip: true })` — legal bodyless registration, factory is OPTIONAL in both overloads;
`test("name", fn, WALK_TIMEOUT_MS)` — inline body plus a named timeout constant, LIVE in the corpus;
`describe("A", opts, () => {})` — slot 2 is a body, so the factory is located whatever `opts` is;
`describe(NAME_CONST, () => {})` — slot 0 is the name and is never examined;
`test("named", testFn)` — an `it`/`test` root, which cannot carry a suite factory and whose handler
the traversal already reaches. That last one is spec review r2 finding 2 turned into a case: without
it, the claim that producer B is suite-only sits in prose and is checked by nothing.

The two bolded reporting cells and the first two silent cells are spec review r1's findings, now
fixtures. **A finding that became a fixture cannot recur silently.**

**Also asserts the guard does not misfire** on a body reached through each of the six
outer-expression wrappers `isSuiteBody` already accepts.

**Registrar-independence for this producer** lives here for the same reason: the four hook
registrars are indifferent to producer B's rule, and a separate task asserting so would be green
from birth.

**AC-5, for BOTH producers.** A provably `environment-touching` test in a file either producer has
reported KEEPS its verdict rather than being demoted to `unclassifiable`. Asserted per producer, not
once — the precedence branch is shared, but a producer that pushed its reason into `ownUnresolved`
instead of the file-level array would invert it for its own cases only.

## Task 3 — the surface's own suites carry no live instance

<!-- task: red=`pnpm exec vitest run tests/mutation/source/premiseScan.test.ts --project parallel` red-state=authored red-target=`tests/mutation/source/premiseScan.test.ts:4091` why=`the guard scans the surface's own suitePaths for a live instance of either shape and asserts zero; it is authored against a constructed violation first, so it is observed failing before the violation is removed` ac=AC-7 -->

**Files:** `tests/mutation/source/premiseScan.test.ts`

**Prototyped at plan time, in both directions, so AC-7 is measured rather than promised:**

RECORD of a plan-time prototype run, 2026-08-21, in a scratch worktree. It is deliberately NOT
printed as a runnable command: the prototype lives outside the tracked tree, and printing a command
that does not resolve is the defect spec review r2 finding 3 raised against the spec — the sweep unit
is the artifact PAIR, so the same shape is repaired here rather than only there. Task 3 builds the
committed version.

```text
suitePaths derived from the registry row: 2
DIRECTION 1 (as shipped)  live instances: 0  -> PASS
DIRECTION 2 (unlocatable suite body) matching instances: 1  -> PASS
      tests/mutation/source/premiseScan.test.ts:4136 live unlocatable suite body
DIRECTION 2 (eager-position hook) matching instances: 1  -> PASS
      tests/mutation/source/premiseScan.test.ts:4135 live eager hook
restored byte-exact: true
```

**One constructed violation PER SHAPE, each required to be detected on its own, and each matched by
the reason it should produce rather than by any hit.** A single named-factory violation is passed by
a weaker guard that recognizes unlocatable suite bodies and ignores eager-position hooks entirely, so
a guard claiming "either shape" needs one probe per shape to prove it. Plan review r2 finding 1.

An in-process check over the surface's own `suitePaths`, read from the registry row rather than
retyped, asserting zero LIVE instances of either shape — fixtures are source TEXT, so a live one
would make this surface a member of the population the probe record measures at zero, and producer
B would then demote this suite's own `environment-free` tests.

**Proved in BOTH directions**, per the rule that a check which cannot fail is not a check: it reds
against a constructed live instance and passes once removed. Record both runs in the commit.

<!-- tasks: end -->

---

Tasks 4 and 5 are deliberately OUTSIDE the red-contract region, and the reason was measured rather
than assumed. Both were drafted with markers and both markers were INVALID, caught by running the
commands at plan-authoring time:

```
$ pnpm exec vitest run tests/docs/_metaLedgerInProgress.test.ts --project parallel
  Test Files  1 passed (1)      Tests  17 passed (17)
$ pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-21-premisescan-hook-population/probe-population.mts >/dev/null; echo $?
  0
```

A `red-state=live` red must be OBSERVED failing at plan time; both exit 0. Neither task has a
red-then-green cycle on one command — they VERIFY a state rather than change one — so enrolling them
would have shipped two markers whose cycle cannot complete. A plan region may be closed and reopened,
and headings between regions are unchecked, so that is what happens here.

## Task 4 — the closing measurements (verification, no red)

**Files:** `docs/superpowers/specs/ci/probes/2026-08-21-premisescan-hook-population.md`

- **AC-8 field check:** `git diff origin/main...HEAD -- tests/mutation/_metaPremiseContract.test.ts`
  must show no line of `EXPECTED_ENV_TOUCHING` changed. A green meta-suite cannot prove this.
- **AC-9:** re-run both population probes; counts unchanged against the record.
- **The FOUR committed passes, run to a FIXED POINT rather than once**, in a worktree carrying the
  change: `cell-check.mts` (16 of 16, exit 0, with its derived cell budget summing to the cell
  count), `record-diff.mts` (0 records, 0 verdicts and 0 details moved, with its structural control
  reporting exactly one move), `limits-check.mts` (every L1-L6 and §2-§3 claim prints HOLDS) and
  `claims-check.mts` (every declared limit has a probe, every probe script named by any arc document
  resolves). The fourth was missing from this list while §1.6 counted four — plan review r1
  finding 2, and the same stale-inventory class as finding 4. Each is proven in both directions, so a green from any of them is attributable:
  `record-diff.mts` ABORTS where there is nothing to measure and `cell-check.mts` reds where the
  producer is absent. A claim that stops being true prints FALSE rather than being inferred from a
  passing suite.
- **AC-10:** `pnpm mutation:guards` in the FOREGROUND under `pnpm heavy`, with a before/after
  provenance pair stamped INSIDE the measuring invocation over the DERIVED input set — source,
  registry row, both `suitePaths`, and their transitive local imports, the file count printed beside
  the digest. Editing any of those retires the score (spec §6 AC-10); say so rather than letting a
  stale number stand.

### Task 4a — re-key AND re-validate the accepted survivors, BEFORE the gate is run

**Files:** `tests/mutation/source/registry.ts`

`premiseScan` carries two `equivalent` rows and both are LINE-KEYED:
`relational-boundary:603:29:>>>=` and `relational-boundary:1936:28:<><=`. Tasks 1 and 2 insert lines
into `premiseScan.ts` at roughly 1669 and 1752, so:

- the **603** row precedes every edit and does not move;
- the **1936** row sits AFTER them and shifts. Its site id goes stale, and the gate then reports BOTH
  an unaccepted survivor at the new line AND a stale ledger row at the old one, so **AC-10's command
  fails outright**. Plan review r3 finding 1.

That row's own reason records eleven previous re-keys (`1752 -> 2061 -> … -> 1936`), so this is a
known recurring obligation of editing this file rather than a surprise.

**Re-keying is not re-validating, and both are required.** A resolving key proves the site still
exists, not that the reason still holds.

1. Run the gate once to learn the new site id, or enumerate sites, and re-key by the mutated
   EXPRESSION and its 1-based column — `n.getStart(facts.sf) < call.getStart(facts.sf)` at column 28
   — never by the line alone.
2. **Re-check the premise against the shipped source**, and record the check rather than inheriting
   it. The premise is that `<` and `<=` differ only when two nodes start at the identical offset,
   which distinct sibling statements cannot do. What would VOID it: a new caller of
   `premiseIsAssociated` that compares a node against itself, or any change to that comparison's
   operands. Neither producer adds one — both append to a file-level reason array and neither touches
   `premiseIsAssociated` — but that is the statement to verify against the diff, not to assume.
3. Append the new key to the row's re-key trail so the twelfth move is as legible as the previous
   eleven.

### Task 4b — the provenance pair, as an executable command that ENFORCES what it claims

AC-10 requires a before/after stamp taken INSIDE the measuring invocation, and the harness implements
no stamping. The plan supplies it.

**The input set is DERIVED, by a committed script.** `derive-inputs.mts` seeds from the registry
row's `sourcePath` and `suitePaths` and walks relative imports, PLUS four harness files it declares
explicitly because no import walk can reach them: `runner.ts` reaches `mutantOverlay.config.ts` by
PATH, and `surfaceCases.ts` is what computes and enforces the score. A change to any of them moves
the score while a transitive-only stamp stays equal (plan review r5 finding 1). Those seeds pull in
`gate.ts` and `expectedLedgerKinds.ts` transitively. **Derived total: 18.**

```bash
D=docs/superpowers/specs/ci/probes/2026-08-21-premisescan-hook-population

premise_stamp() {
  local files n digest f missing=0
  files=$(pnpm exec tsx "$D/derive-inputs.mts") || { echo "STAMP ABORT: closure walk failed" >&2; return 2; }
  n=$(printf '%s\n' "$files" | grep -c .)
  [ "$n" -ge 10 ] || { echo "STAMP ABORT: derived only $n inputs" >&2; return 2; }
  while IFS= read -r f; do
    [ -f "$f" ] || { echo "STAMP ABORT: input does not exist: $f" >&2; missing=1; }
  done <<< "$files"
  [ "$missing" -eq 0 ] || return 2
  digest=$(printf '%s\n' "$files" | xargs shasum | shasum | cut -c1-12) || { echo "STAMP ABORT: hashing failed" >&2; return 2; }
  [ "$digest" != "da39a3ee5e6b" ] || { echo "STAMP ABORT: empty-stream digest; nothing was hashed" >&2; return 2; }
  printf '%s stamp over %s inputs: %s\n' "$1" "$n" "$digest"
}

set -o pipefail
before=$(premise_stamp BEFORE) || exit 2
echo "$before"
pnpm heavy pnpm mutation:guards
gate=$?
after=$(premise_stamp AFTER) || exit 2
echo "$after"
[ "$gate" -eq 0 ] || { echo "GATE FAILED (exit $gate) — the score is not valid" >&2; exit "$gate"; }
[ "${before#BEFORE}" = "${after#AFTER}" ] || { echo "INPUTS MOVED DURING THE RUN" >&2; exit 1; }
echo "score valid: gate passed and every input byte-identical across the run"
```

**Every input is checked to EXIST before hashing, and the empty digest is rejected by name.** An
earlier draft hashed inside a `printf` argument, so a failing substitution was masked by printf's own
success even under `pipefail`: ten missing inputs produced `da39a3ee5e6b` — the digest of an empty
stream — and the command reported a valid score (plan review r5 finding 2). A digest computed over
nothing is indistinguishable from a digest computed over everything unless something says otherwise.

**The derive script is COMMITTED rather than written to `/tmp`.** An earlier draft heredoc'd it into
`/tmp` and ran it from there; its relative import of the registry then resolves against `/tmp` and
the script cannot load at all. Found by running the plan's own command rather than reading it.

`set -o pipefail`, `gate=$?` captured immediately, and an explicit digest comparison are what make
the two claims true. Proven: healthy path exit 0; failing gate exit 7, carrying the gate's own status
rather than a swallowed one; differing stamps exit 1; a 3-input closure exit 2; ten missing inputs
exit 2 rather than a plausible digest.

**Any input moving retires the score** (spec §6 AC-10), including a whitespace-only edit and a
test-side one, since the deciding suites are what make a survivor a survivor.

## Task 5 — ledger closeout, EARLY and as one commit (verification, no red)

**Files:** `BACKLOG.md`, `BACKLOG-archive.md`

Taken BEFORE whole-diff review, as ONE commit: both rows archived, both IN PROGRESS markers removed,
peers filed. Absence is then guaranteed rather than maintained. Verify by set arithmetic in both
directions — union of BL/DEF ids exact, `comm -12` archived-versus-open empty, in-progress marker
count zero — and re-verify after any subsequent `origin/main` merge.
**Why this is EARLY and not the PR's last commit, ratified — do not relitigate.** `AGENTS.md`
invariant 12 says the marker comes off in the PR's last commit. That ordering was **corrected** and
the correction is the operative rule: the whole ledger change — peer rows filed, graduating rows
archived, markers removed — is ONE commit taken BEFORE whole-diff review. Two reasons, both from the
ruling: absence is then GUARANTEED rather than maintained, since gone at commit N is gone at every
commit after N; and a ledger commit placed after whole-diff review is unreviewed code riding into the
merge, which `writing-plans` forbids.

The objection that this leaves the work unclaimed during review is the trade-off the ruling
considered and accepted. It is covered by the ARMING WINDOW instead: `--auto` is never armed until
CI is green AND review approves, so the window in which an unclaimed row could matter is the window
in which the PR cannot merge anyway. PR #838 shipped a stale marker to main because auto-merge was
armed at push time, not because a ledger commit sat in the wrong position.

The residual hazard the ruling names is a different one and it IS this plan's obligation: a mid-arc
merge of `origin/main` AFTER the closeout commit can reintroduce a row or a marker. Hence the
set-arithmetic re-verify below, run again after every subsequent main merge, plus an absent-at-HEAD
check immediately before merge.


`_metaLedgerInProgress` passes both BEFORE and AFTER this task (17/17 at plan time, measured above):
the markers this branch carries are well-formed and name a branch that exists on origin, which is
exactly what invariant 12 requires while work is in flight. The gate that would catch a STALE marker
is the same suite run on `main` after the merge, where the branch no longer exists. So this task's
verification is the set arithmetic and the absent-at-HEAD check, not a suite verdict.

---

## 2. Sequencing note

Tasks 1 and 2 each complete a full red-then-green cycle on the SAME command before the next begins.

**Every task's `why=` was re-checked against what the tasks BEFORE it now guarantee, not against the
state at authoring time**, and that check is what dissolved the original Task 3: its
spelling-independence red was pre-satisfied by Task 1, so it would have been green from the moment
it was written. Task 3 (the self-pollution guard) is unaffected — its red comes from a constructed
violation the earlier tasks do not create, and it was prototyped failing and passing at plan time.
