# Plan — premiseScan derives its registrar accept-sets from Vitest's own surface

**Spec:** `docs/superpowers/specs/2026-08-21-premisescan-registrar-accept-sets.md`
**Branch:** `fix/premisescan-registrar-accept-sets` · **Base:** `origin/main` at `0820436cf`
**Closes:** `BL-PREMISESCAN-REGISTRAR-ACCEPT-SETS-HAND-MAINTAINED`

`impeccable-gate: N/A — no UI surface`

---

## 0. Pre-draft code verification

Every file, symbol and line this plan names was read on this tree before the plan body was written.

| claim | verified |
| --- | --- |
| `REGISTRARS` is a 3-member literal | `tests/mutation/source/premiseScan.ts:47` |
| `MODIFIERS` is a 7-member literal | `tests/mutation/source/premiseScan.ts:48` |
| `HOOK_REGISTRARS` is a 4-alternative regex | `tests/mutation/source/premiseScan.ts:66` |
| `registrarRoot` peels calls and properties in two SEPARATE loops | `tests/mutation/source/premiseScan.ts:68` |
| the walk dispatches on the root BY NAME, `describe` branch | `tests/mutation/source/premiseScan.ts:1672` |
| the file-scope hook seed requires `ts.isIdentifier(callee)` | `tests/mutation/source/premiseScan.ts:1758` |
| `hookBodies` requires `ts.isIdentifier(n.expression)` | `tests/mutation/source/premiseScan.ts:1843` |
| `hookBodies` prunes a nested `describe` by name | `tests/mutation/source/premiseScan.ts:1862` |
| `eachProducers` reads the IMMEDIATE curried call only | `tests/mutation/source/premiseScan.ts:1906` |
| `loadTimePremises` requires `ts.isIdentifier(n.expression)` | `tests/mutation/source/premiseScan.ts:1953` |
| `TestClassification` fields are `testName` / `line` / `verdict` / `detail` | `tests/mutation/source/premiseScan.ts:38` |
| `classifyTests(root, suitePath)` is the only export that classifies | `tests/mutation/source/premiseScan.ts:1510` |
| the contract test derives `suites` from `GUARD_SURFACES` | `tests/mutation/_metaPremiseContract.test.ts:373` |
| `EXPECTED_ENV_TOUCHING` is the third declaration | `tests/mutation/_metaPremiseContract.test.ts:32` |
| premiseScan's `scoreFloor` is `0.95` and it has TWO accepted survivors | `tests/mutation/source/registry.ts` — `relational-boundary:603:29:>>>=`, `relational-boundary:1936:28:<><=` |

**Both accepted survivors shift.** `603` is `if (here && here.length > 0) return { kind: "local", …};` and
`1936` is `n.getStart(facts.sf) < call.getStart(facts.sf) &&`. Every edit site in this change
(`tests/mutation/source/premiseScan.ts:47`, `tests/mutation/source/premiseScan.ts:48`,
`tests/mutation/source/premiseScan.ts:66` and `tests/mutation/source/premiseScan.ts:68`) sits above
BOTH, and
`tests/mutation/source/premiseScan.ts:1906` sits above the second, so neither key
survives. An earlier note in this arc said only the second shifts; that was wrong and is corrected
here.

---

## 0.05 Acceptance criteria this plan discharges

| AC | criterion | spec |
| --- | --- | --- |
| **AC-1** | AC-1 does not move: the environment-touching record set is byte-identical before and after, and the only census delta is one record ADDED, classified environment-free. | §4 |
| **AC-2** | All three accept-sets are DERIVED from Vitest's declaration by ONE extractor, and a Vitest upgrade that changes any of them REDS. | §3.2, §3.6, §5 L1 |
| **AC-3** | The interleaved peel resolves `test.skipIf(c).each(rows)(…)` to its real registration, and no spurious registration is invented from the condition variable. | §2 |
| **AC-4** | Every call in the callee chain contributes its eager arguments, in the SAME traversal as the peel. | §3.5 |
| **AC-5** | `suite` is adopted AT THE DISPATCH, not merely in `REGISTRARS`; `bench` is excluded by construction. | §3.3 |
| **AC-6** | ONE predicate, parameterised by the name set AND by whether a property access counts, serves all three bare-identifier-callee SITES. The two hook consumers accept any object; `loadTimePremises` does not, because widening it would FALSELY CERTIFY rather than over-report. | §3.4, §3.7 |
| **AC-7** | Builders (`extend`, `override`, `scoped`, `fn`) are excluded because the declaration does not name them, not by an exception list. | §3.2 |
| **AC-8** | Every selector in the extractor ABORTS when it matches nothing, rather than returning a confident empty set. | §3.2 |

---

## 0.1 Meta-test inventory

| test | what it pins | touched here |
| --- | --- | --- |
| `tests/mutation/_metaPremiseContract.test.ts` | per-suite environment-touching counts; suites derived from `GUARD_SURFACES`; every enrolled suite classifies ≥1 test | **must stay green unchanged** — AC-1 |
| `tests/mutation/source/premiseScan.test.ts` | the scanner's behavioural suite (326 cases today) | **gains cases** — Task 1, Task 2, Task 3 |
| _metaVitestSurfaceDerivation.test.ts (NEW, under `tests/mutation/`) | the three committed literals equal what the extractor derives from the installed declaration | **created in Task 1** — AC-2, AC-7, AC-8 |

The new pin is a `_meta*` sibling rather than a case inside `premiseScan.test.ts`, matching
`tests/mutation/_metaClaimSweepSuiteDerivation.test.ts` which `origin/main` added on 2026-08-20 for
exactly this shape. It is deliberately NOT added to premiseScan's `suitePaths`: it decides nothing
about the scanner's behaviour and would buy wall clock at no score.

## 0.2 Mutation-family closure

`premiseScan` is enrolled (`scoreFloor: 0.95`). This change alters the source, so the gate is re-run
and the two accepted survivors are OBSERVED, re-keyed and re-validated (Task 5a). **Enrolment
precedes review:** the Task 5b command runs BEFORE the round-1 `--stage diff` dispatch, and its score
plus an empty unaccepted-survivor set goes on the brief's `GUARD SURFACE:` line. The gate asserts the
score and never prints it, so Task 5b supplies the producer rather than assuming one exists.

Per spec §6, this change moves premiseScan's mutant count and therefore its shard weight. If the
binding `source-shards` leg returns CANCELLED with no annotations, that is the 90-minute JOB TIMEOUT
(rule 172) and NOT a budget signal: do not re-run it, and state the local scored run as local.

---

## 0.3 Design validated empirically BEFORE this plan was written

Four census runs and one extractor prototype, all on this tree, all re-runnable.

**1. The census, and what a merge did to it.** These four rows measure the VARIANTS in isolation, on
a tree with no test-file edits. They are provenance for the design, **not expectations for Task 4** —
Task 4 asserts no whole-population count at all, for the reason recorded there. `docs/superpowers/specs/ci/probes/2026-08-21-premisescan-registrar-accept-sets/census.mts`
derives its population from `GUARD_SURFACES` and prints a record per classified test.

```
                 suites  classified  env-touching  env-free  unclassifiable
A shipped            77        2761           101      2659               1
P peel ONLY          77        2761           101      2659               1
B sets ONLY          77        2762           101      2660               1
C sets + peel        77        2762           101      2660               1
```

**2. Peel-only is verdict-neutral — and that is why it CANNOT be its own task.** `A → P` is ZERO
record moves, and the reason is structural rather than incidental: with today's `MODIFIERS` a
mid-chain CALL can only come from `each`/`for` currying, which is always the LAST link, so no input
distinguishes the interleaved peel from the two sequential loops.

An earlier draft of this plan read that measurement as an ORDERING argument — land the peel first,
because sets-first would leave a bisect-reachable commit in the state spec §2 calls silently wrong.
The tiebreak behind it is sound (prefer intermediate states that are merely INCOMPLETE, which a
bisect can see, over states that are WRONG, which it cannot), but it does not apply here, because a
third option dominates both orderings: **do not split them.** Zero record moves means zero
OBSERVABLE behaviour, and a task with no observable red cannot satisfy invariant 1 — it would commit
with its own test command still failing. Spec R1 already says the two are one change. Plan review r1
finding 1, and the measurement that was used to order the split is what refutes it.

**3. `B → C` is zero record moves.** The peel changes no classification on the live corpus today. It
earns its place by what it makes RESOLVABLE, which is spec §5 L2 as a measurement.

**4. The extractor works, and its floor fired on the first run.** A prototype resolving
`@vitest/runner` and reading it with the TypeScript AST derives:

```
MODIFIERS derived (11): concurrent, each, fails, for, only, runIf, sequential, shuffle, skip, skipIf, todo
  ADDS: fails, runIf, shuffle, skipIf   DROPS: (none)
HOOKS     derived  (6): afterAll, afterEach, aroundAll, aroundEach, beforeAll, beforeEach
  ADDS: aroundAll, aroundEach           DROPS: (none)
```

reproducing spec §3.2 and §3.6 **by a different method than the spec's own probe** — the spec read
runtime properties and a regex, this reads the declaration AST. An independent reproduction is the
strongest form that evidence takes.

**5. Read the declaration with the AST, not with a regex — decided by running it.** The prototype's
first draft used regexes and its `interface Hooks` selector matched nothing on the very first run.
The arc's own repair direction applies: when a recognizer needs a new grammar corner, reach for the
total reader instead of a smarter pattern. `typescript` is already a dependency of this surface.

**6. Resolution is two-step, and the obvious one-step form does not work.**
`require.resolve("@vitest/runner")` from the repo root FAILS under plain node — the runner is a
TRANSITIVE dependency; only `vitest` is direct. It happened to work under `tsx`, which is exactly how
this would have shipped and then broken elsewhere. The chain that works under plain node:

```ts
const rootReq  = createRequire(join(ROOT, "package.json"));
const vitestReq = createRequire(rootReq.resolve("vitest" + "/package.json"));
const dist = dirname(vitestReq.resolve("@vitest/runner"));   // resolve it AS VITEST WOULD
```

The declaration file's name carries a CONTENT HASH (today: tasks.d-Bh0IjN67.d.ts) inside a
VERSIONED store directory.
Both segments move on an upgrade, so **neither may be written down**; the extractor reads every
`*.d.ts` in the resolved dist (4 files today).

**7. `bench` is excluded by the declaration, which is stronger than the spec's own evidence.** The
runner declares exactly four registrar constants:

```
declare const suite: SuiteAPI;      declare const describe: SuiteAPI;
declare const test: TestAPI;        declare const it: TestAPI;
```

`bench` is not among them. Spec §3.1's probe listed `bench` as a registrar because it read runtime
exports; the declaration does not, so deriving `REGISTRARS` as "declared `SuiteAPI` or `TestAPI`"
excludes it **by construction**, which is what §3.3 and AC-7 claim and what a runtime read cannot
deliver.

**8. Every enrolled task's red FIRES at its own commit boundary — run, not reasoned.** Plan review r1
finding 1 was exactly a boundary state that had been reasoned about instead of executed, so the
boundary is now a committed probe:

```
$ pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-21-premisescan-registrar-accept-sets/boundary.mts
suiteTwin      rows=1  child=environment-free
describeTwin   rows=1  child=environment-touching
qualifiedHook  rows=1  child=environment-free
factoryAlias   rows=1  child=environment-free
nestedPrune    rows=2  inner child=environment-touching  outer sibling=environment-touching
```

`suiteTwin` free against `describeTwin` touching is Task 2's first red. `qualifiedHook` and
`factoryAlias` free are Task 3's two reds.

**`nestedPrune` is Task 2's SECOND red, and it exists because the twin alone does not discriminate**
(plan review r2 finding 1). Measured across three implementations:

| | `suiteTwin child` | `nestedPrune outer sibling` |
| --- | --- | --- |
| shipped | environment-free | environment-touching |
| **dispatch widened ONLY** | environment-touching ✓ | environment-touching ✗ |
| both sites widened | environment-touching ✓ | environment-FREE ✓ |

The middle row is the whole point: widening only `tests/mutation/source/premiseScan.ts:1672` satisfies
the twin completely while the nested `suite`'s hook still leaks to its sibling through the unrepaired
prune at `tests/mutation/source/premiseScan.ts:1862`. **The sibling, not the inner child, is the
assertion** — the inner child is touching under all three.

**These four lines are IDENTICAL with Task 1 applied**, which is worth stating rather than glossing:
the probe establishes that Tasks 2 and 3 red at their boundaries, and says NOTHING about Task 1 — the
Task 1 red lives in the `skipIf` shapes, which today are not recognized at all. The probe exits 2 if
every fixture classifies zero tests, because four tidy `(NOT CLASSIFIED)` lines under exit 0 are
indistinguishable from a scanner that correctly declined all four.

---

## 0.4 Red-command validation, run at plan time

| command | observed now | why that is correct |
| --- | --- | --- |
| `pnpm exec vitest run tests/mutation/source/premiseScan.test.ts --project parallel` | 326 passed, 869ms | every enrolled task is `red-state=authored`: the failing case is written by the task itself, so a green baseline is the expected state |
| `pnpm exec vitest run tests/mutation/_metaPremiseContract.test.ts --project parallel` | 11 passed, 15.4s | Task 5's verification command; proves the `parallel` project resolves for `tests/mutation/*.test.ts`, which is the shape Task 2's NEW file will use |

Task 1 creates the derivation pin, so the second row validates the SHAPE that file's command will
use rather than running it against nothing. A "no test files found" error is not a red.

**All three enrolled tasks are `red-state=authored`.** No task in this plan claims a `red-state=live`,
so none owes an observed-failing run at plan time.

## 0.45 What each instrument does on THIS branch versus with the change — measured

| instrument | on this branch | with the change | what a WRONG result means |
| --- | --- | --- | --- |
| `census.mts` | exit 0, `2761 / 101 / 1` | `101` unchanged; `classified` rises by one PLUS one per new case in `premiseScan.test.ts`, which is a `suitePath` and therefore censused | a moved env-touching record means AC-1 moved and a user decision IS owed — stop and escalate |
| `census.mts --records` with the name channel severed | exit 2, "the record channel is dead" | unchanged | exit 0 here means the abort was removed; the diff is then blind to verdict moves |
| `_metaPremiseContract` | 11 passed | 11 passed, unchanged | any per-suite count change contradicts AC-1 |
| `premiseScan.test.ts` | 326 passed | 326 + the new cases | — |
| `_metaVitestSurfaceDerivation` | file does not exist | passes; reds if any literal ≠ derived | a green run with an empty derived set means a selector stopped matching and AC-8's floor was removed |

---

## 1. Architecture

Four edits to `premiseScan.ts`, one new extractor module, one new pin test.

1. **One traversal, not two rules.** `registrarRoot`'s two sequential loops become a single
   fixpoint loop that alternates call-peel and modifier-peel; `eachProducers` walks the SAME chain
   and collects every call's arguments. Spec §3.5: "the two are one loop."
2. **Three literals, one authority, one extractor.** `REGISTRARS`, `MODIFIERS` and `HOOK_REGISTRARS`
   become committed literals derived from Vitest's declaration, pinned by a structural test. The
   scanner does NOT read `node_modules` at scan time (§5 L1) — the pin does, in the test.
3. **`suite` is adopted at the DISPATCH.** Widening `REGISTRARS` alone is adoption that behaves as
   nothing (§3.3). Both sites that name `"describe"` accept `suite` too.
4. **One predicate, three sites, parameterised by the name set AND the direction.** A callee matches
   when its property NAME is in the given set; whether a property access counts is a parameter,
   because widening is conservative at the two hook sites and FALSE CERTIFICATION at the third. `HOOK_REGISTRARS` itself has
   TWO consumers; the third site, `loadTimePremises`, carries the identical shape over
   `/^premise(Holds)?$/`, which is why the predicate takes the set rather than closing over one.
   Three copies of a rule are three things that drift, the accept-set defect one level down.

### 1.5 Every named weaker implementation owes a KILLING check

| weaker implementation | why it is tempting | the check that kills it |
| --- | --- | --- |
| peel calls then properties (today) | two loops read simply | Task 1's `test.skipIf(c).each(rows)("chain %s", fn)` case asserts the name is `chain %s` — the two-loop form yields a spurious `<test at line N>` |
| collect the immediate curried call's arguments only | passes every single-level fixture | Task 1's `describe.skipIf(process.env.CI).each([1])(…)` case asserts the child is environment-TOUCHING; a one-level collector leaves it free |
| widen `REGISTRARS` to include `suite` | looks like adoption | Task 2's case asserts `suite("x", () => { beforeEach(spawn); it(…) })` classifies its child environment-touching; set-only widening drops it |
| key the hook rule on a callee resolving through `registrarRoot` | reads as principled | Task 3's `describe("outer", (t) => { t.beforeEach(spawn); it(…) })` case — the parameter is a local binding that peels to nothing |
| derive hooks from a hand-written candidate array filtered by runtime presence | there IS a real runtime check | Task 1's pin compares against `interface Hooks` members; a filter can only SUBTRACT, never add the member nobody thought of |
| let a selector return `[]` when it matches nothing | the set still "derives" | Task 1's floor: each selector throws naming itself; proved by pointing one at a name that does not exist |

---

## Task 1 — the derived sets AND the peel, as ONE commit

<!-- task: red=`pnpm exec vitest run tests/mutation/source/premiseScan.test.ts --project parallel` red-state=authored red-target=`tests/mutation/source/premiseScan.ts:68` why=`the new cases assert that test.skipIf(c).each(rows)("chain %s", fn) classifies under the name "chain %s" with no spurious registration, that test.skipIf(c)("live", fn) classifies as "live", and that describe.skipIf(process.env.CI).each([1])(...) makes its child environment-touching; today skipIf is not in MODIFIERS so none of the three is recognized at all, and registrarRoot peels calls and properties in two separate loops so even with skipIf added the chain form resolves to nothing` ac=AC-2,AC-3,AC-4,AC-7,AC-8 -->

**This is ONE task because the peel alone has NO OBSERVABLE RED, and that is measured, not argued.**
Plan review r1 finding 1. §0.3's `A → P` run is zero record moves, and the reason is structural: with
today's `MODIFIERS`, a mid-chain CALL can only come from `each`/`for` currying, which is always the
LAST link — so no input distinguishes the interleaved peel from the two sequential loops. A peel-first
task would commit with its own test command still red, which invariant 1 forbids. Spec R1 already says
the two are one change; splitting them was the error, and the measurement that was used to ORDER the
split is what refutes it.

**Files:** `tests/mutation/source/premiseScan.ts`, `tests/mutation/source/premiseScan.test.ts`,
vitestSurface.ts and _metaVitestSurfaceDerivation.test.ts (both new).

### The extractor

New module vitestSurface.ts, beside the scanner under `tests/mutation/source/`, exporting
`deriveModifiers()`, `deriveHooks()` and `deriveRegistrars()`. Resolution is the two-step chain from
§0.3 item 6, and every `*.d.ts` in the resolved dist is read with `ts.createSourceFile`.

| set | derived from | today |
| --- | --- | --- |
| `MODIFIERS` | `ChainableSuiteAPI` ∪ `ChainableTestAPI` chain keys and curried members, ∪ every condition-taking member reachable from `SuiteAPI` **and** `TestAPI` — including through named interfaces in their intersections | 11 |
| `HOOK_REGISTRARS` | members of `interface Hooks` | 6 |
| `REGISTRARS` | `declare const X: SuiteAPI \| TestAPI` | 4 — `suite`, `describe`, `it`, `test` |

**The conditional selector follows the intersection, including its NAMED members** (plan review r4
finding 3). `TestAPI = ChainableTestAPI & ExtendedAPI & Hooks & { … }`
(`node_modules/@vitest/runner` — `type TestAPI`, 4.1.5), and `skipIf`/`runIf` are declared on
`interface ExtendedAPI`, not inline. A selector reading only `SuiteAPI`'s inline object gets the right
ANSWER today, because the two coincide, and would not RED if `ExtendedAPI` gained a member — which
falsifies AC-2's upgrade-red claim while every equality check still passes. Resolve each intersection
member: inline type literals directly, named references by looking the declaration up.

**AC-8's floor is per selector, not per module.** Each of the four selectors throws naming ITSELF when
it yields nothing; a module-level "did we get anything" check passes as long as one selector still
matches, which is the vacuity this prevents. **Prove it, and print the proof:**

```bash
# temporarily, in vitestSurface.ts: chainable("ChainableSuiteAPI") -> chainable("ChainableSuiteAPIX")
pnpm exec vitest run tests/mutation/_metaVitestSurfaceDerivation.test.ts --project parallel 2>&1 \
  | grep -q 'derive: ChainableSuiteAPIX yielded no members' \
  || { echo "FAIL: the perturbed selector did not name ITSELF"; exit 1; }
```

The grep is what makes it a proof rather than a red: any broken selector reds the suite, but only the
right one names ITSELF. Repeat per selector; four perturbations, four distinct messages. Paste them
in the commit body.

**`grep` MASKS the suite's nonzero exit, so the perturbation run proves nothing about the finished
state** (plan review r3 finding 2). Restore every perturbation and close the task on a green run of
BOTH commands, unmasked:

```bash
git diff --quiet tests/mutation/source/vitestSurface.ts \
  || { echo "ABORT: a floor perturbation was left in place"; exit 2; }
pnpm exec vitest run tests/mutation/_metaVitestSurfaceDerivation.test.ts --project parallel   # expect green
pnpm exec vitest run tests/mutation/source/premiseScan.test.ts --project parallel             # expect green
```

Without the first of those two, an implementation where the scanner cases pass while the pin still
carries a failing equality or absence assertion satisfies every other command this task prints —
AC-2, AC-7 and AC-8 would all read as discharged. **The task's `red=` marker names the scanner suite
because a marker carries one command; the pin's green run is not optional for that reason.**

**AC-7 is discharged by construction and asserted anyway.** The pin asserts `extend`, `override`,
`scoped` and `fn` are ABSENT from the derived modifier set — not redundant with the equality check,
because it names the failure direction.

### The scanner change

`registrarRoot` becomes one `for (;;)` alternating `isCallExpression` and `isPropertyAccessExpression`,
returning `null` on a property not in `MODIFIERS`. `eachProducers` walks the identical chain, pushing
each `CallExpression`'s arguments. One loop, not two rules (spec §3.5).

The three derived literals land in `premiseScan.ts`, sorted, each naming the extractor call that
produced it in a comment — **provenance, not data.**

### Cases

- `test.skipIf(c).each(rows)("chain %s", fn)` → one classification named `chain %s`, and **no**
  classification named `<test at line …>`. The second half is the anti-tautology half: asserting only
  that `chain %s` appears passes while the spurious registration also appears.
- `test.skipIf(c)("live", fn)` → named `live`.
- `test.each(rows)("plain %s", fn)` → named `plain %s` (regression guard).
- `describe.skipIf(process.env.CI).each([1])((…) => { it("x", () => {}) })` → child
  **environment-touching**, detail naming `process.env`.
- `describe.each([process.env.CI])(…)` → unchanged environment-touching (single-level regression).
- the pin: each committed literal equals what its extractor derives.

**AC-2, AC-3, AC-4, AC-7, AC-8.**

---

## Task 2 — `suite` is adopted at the DISPATCH

<!-- task: red=`pnpm exec vitest run tests/mutation/source/premiseScan.test.ts --project parallel` red-state=authored red-target=`tests/mutation/source/premiseScan.ts:1672` why=`the new case asserts suite("x", () => { beforeEach(spawn); it("y", fn) }) classifies its child environment-touching, exactly as the describe twin does; after Task 1 registrarRoot returns "suite" but the walk dispatches on the root by name and "suite" matches neither branch, so the registration is recognized and dropped and the child is environment-free` ac=AC-5 -->

Two sites name `"describe"` and both must accept `suite`: the walk's dispatch
(`tests/mutation/source/premiseScan.ts:1672`) and `hookBodies`' nested-describe prune
(`tests/mutation/source/premiseScan.ts:1862`). **Editing only the first is the defect this task
exists to catch** — the prune would then treat a nested `suite` as ordinary content and attach its
hooks to its siblings.

**TWO cases, because there are two sites and the first case passes with the second site unrepaired.**
Plan review r2 finding 1 demonstrated exactly that: widening only the dispatch satisfied every
assertion the first draft listed.

1. **The dispatch twin.** The same body under `describe` and under `suite`, asserting the same verdict.
   A twin is what makes it impossible to pass by asserting a constant.
2. **The nested-prune case, which is the ONLY one that reaches
   `tests/mutation/source/premiseScan.ts:1862`.** A `suite` nested inside an outer `describe`, with a
   hook inside the NESTED one and a sibling test in the OUTER one:

   ```ts
   describe("outer", () => {
     suite("inner", () => {
       beforeEach(() => { process.env.CI; });
       it("inner child", () => {});
     });
     it("outer sibling", () => {});
   });
   ```

   `inner child` is environment-touching and **`outer sibling` is environment-FREE**. With the prune
   still keyed on `"describe"` alone, the nested `suite` is not recognized as a suite, its hook is
   treated as ordinary content of the outer describe, and the sibling is wrongly reported touching.
   The sibling assertion is the whole case; asserting only `inner child` passes either way.

Also assert `bench("b", fn)` produces **no** classification (AC-5's other half, and §5 L3).

**AC-5.**

---

## Task 3 — one predicate, three sites, keyed on the property name

<!-- task: red=`pnpm exec vitest run tests/mutation/source/premiseScan.test.ts --project parallel` red-state=authored red-target=`tests/mutation/source/premiseScan.ts:1758` why=`the new cases assert that test.beforeEach(spawn) at file scope and (t) => t.beforeEach(spawn) inside a suite factory both make the enclosed test environment-touching; today every site requires a bare identifier callee, so each qualified form is invisible and every case reads environment-free` ac=AC-6 -->

One exported predicate, **parameterised by TWO things: the name set, and whether a property access
counts.** A callee matches when its name is in the SET PASSED IN and its shape is permitted by the
SECOND parameter — bare identifier always, property access on any object only where the caller asks
for it. The two hook consumers ask for it; `loadTimePremises` does not, for the reason below.

**`HOOK_REGISTRARS` has TWO consumers, not three, and the plan says so because the spec said
otherwise.** `grep -n HOOK_REGISTRARS tests/mutation/source/premiseScan.ts` returns the declaration
plus `tests/mutation/source/premiseScan.ts:1758` and `tests/mutation/source/premiseScan.ts:1843`. The third site,
`tests/mutation/source/premiseScan.ts:1953` (`loadTimePremises`), carries the identical
bare-identifier-callee shape over `/^premise(Holds)?$/`. Spec §3.4 has been corrected; the
parameterised predicate is what lets one implementation serve a site that ranges over a different set.

**The three sites fail in OPPOSITE directions, and only two get the widening. This retracts an
earlier draft of this plan** (plan review r4 finding 1), which said all three were repaired because
"it is the same one-line call" — the class-sweep default correctly applied to the wrong class.

- The two hook consumers fail toward a **silent FREE**. More matching means more
  environment-touching, so widening them is CONSERVATIVE.
- `loadTimePremises` feeds `premiseIsAssociated`, and from there `hasPremise`
  (`tests/mutation/source/premiseScan.ts:1729`). More matching means more registrations credited with
  a premise they do not have — **FALSE CERTIFICATION**, which is the direction §6's bound names first.
  `logger.premise("rows", rows.length, 0)` sitting before an `.each` registration would satisfy the
  associated-premise requirement outright.

**So the predicate takes the name set AND whether a property access counts**, and
`loadTimePremises` is called with property access OFF — it keeps requiring a bare identifier. Its
existing failure, not seeing `t.premise(…)`, reports a premise as MISSING when one exists, which is
conservative and is a DOCUMENTED LIMIT rather than a defect.

**A pre-existing instance of the same shape is bracketed, not widened.** `hasPremise` ORs a raw text
match, `/\bpremise(Holds)?\s*\(/` over the test's own text (`tests/mutation/source/premiseScan.ts:1729`),
and `\b` matches after a `.` — so `logger.premise(…)` INSIDE a test body already certifies today, on
`origin/main`, independently of this change. That is pre-existing, is not caused or widened here, and
closing it is a separate decision about a different code path. Recorded so a later reviewer does not
re-derive it.

**A one-directional class sweep is the lesson.** The shape was identical at all three sites; the
CONSEQUENCE of repairing it was not. Sweeping a class means checking each instance's failure
direction, not only its syntax.

Cases, one per site, because a single case passes with two of three still unrepaired:

- file scope: `test.beforeEach(spawn)` then `it("x", fn)` → environment-touching.
- inside a describe: `describe("d", () => { test.beforeEach(spawn); it("x", fn) })` → touching.
- factory alias: `describe("d", (t) => { t.beforeEach(spawn); it("x", fn) })` → touching.
- `aroundEach` in the qualified form → touching (the derived set's new member, exercised).
- `loadTimePremises`, and it asserts the OPPOSITE of the hook cases: a `.each` registration whose
  associated premise is written as `logger.premise(…)` is **NOT** credited — the registration is still
  reported as lacking an associated premise. Crediting it is false certification, the only class that
  cannot ship. `t.premise(…)` is likewise not seen, and that stays a documented limit: reporting a
  premise as missing when one exists is the conservative direction.
- **the over-report, asserted not merely documented:** `logger.afterAll(spawn)` reports. §5 L5 calls
  this a conservative over-report with a named cause; a limit that is never exercised is a claim, so
  the case pins the behaviour the limit describes.

**AC-6.**

---

## Task 4 — the closing corpus measurement (verification, no red)

**`tests/mutation/source/premiseScan.test.ts` IS in the census population** — it is one of
premiseScan's three `suitePaths` — so Tasks 1-3 add records to the very population this task measures.
**No whole-population count can be predicted here, and none is asserted** (plan review r2 finding 2;
an earlier draft appended the partition BESIDE the whole-population numbers it supersedes and left
both standing, which was r3 finding 1). The claim is partitioned, and records are name-keyed so
inserting a case does not re-key every record below it.

### Step 0 — the baseline, taken FROM THE MERGE BASE

**A working-tree guard cannot produce this baseline, and an earlier draft's did not** (plan review r4
finding 2). Task 4 runs AFTER Tasks 1-3, which COMMIT their changes, so `git diff --quiet` reports a
clean tree and happily censuses the post-change state — a "before" identical to the "after", under
which the one-addition check fails and every diff reads empty. The guard was checking the wrong thing:
not "is the tree dirty" but "is this tree the one I mean to measure".

Take it from the merge base itself, in a detached worktree, so no ordering discipline is required:

```bash
CENSUS=docs/superpowers/specs/ci/probes/2026-08-21-premisescan-registrar-accept-sets/census.mts
# EXPORTED, because step 2's derivation runs in a CHILD process and reads
# `process.env.BASE`. As a bare shell variable the child saw `undefined`, the
# derivation threw before producing a partition, and the failure then looked like
# a census problem rather than a missing export.
export BASE
BASE=$(git merge-base origin/main HEAD)
git worktree add --detach /tmp/census-base "$BASE" >/dev/null
ln -s "$PWD/node_modules" /tmp/census-base/node_modules
mkdir -p "/tmp/census-base/$(dirname "$CENSUS")"
cp "$CENSUS" "/tmp/census-base/$CENSUS"      # the probe post-dates the merge base
(cd /tmp/census-base && pnpm exec tsx "$CENSUS" --records) | tail -n +7 | sort > /tmp/census-before.txt
git worktree remove --force /tmp/census-base

[ -s /tmp/census-before.txt ] || { echo "ABORT: empty baseline"; exit 2; }
git -C . diff --quiet "$BASE" -- tests/mutation/source/premiseScan.ts \
  && { echo "ABORT: the scanner is unchanged from the merge base; there is nothing to measure"; exit 2; }
```

The second guard is the one that matters and it is the one the earlier draft could not express: it
compares the working tree against **the merge base**, not against HEAD, so a committed change is
visible to it. It also fails when Tasks 1-3 have NOT run — a baseline compared against itself.

### Step 1 — the third declaration is unmoved

```bash
pnpm exec vitest run tests/mutation/_metaPremiseContract.test.ts --project parallel   # expect green
```

`EXPECTED_ENV_TOUCHING` declares per-suite environment-TOUCHING counts. **Any per-suite change
contradicts AC-1**, and this is also what catches a new case that unexpectedly reads the environment.

### Step 2 — the partitioned record diff

```bash
CENSUS=docs/superpowers/specs/ci/probes/2026-08-21-premisescan-registrar-accept-sets/census.mts
# DERIVED, never hardcoded — see the note below. Every suite this branch edits
# that is also in the census population, computed from git at run time.
# ONE PATH PER LINE. `grep -F` treats each LINE of its pattern as a separate
# pattern, so a newline-joined set matches any of them, while a COMMA-joined set
# is a single pattern containing a comma and matches NOTHING. Measured on this
# branch: the joined value matched 0 records where the two paths separately
# matched 327, so every record fell into the "unedited" side and (b) checked an
# empty set while reporting success.
EDITED=$(pnpm exec tsx --eval '
import { GUARD_SURFACES } from "./tests/mutation/source/registry";
import { execSync } from "node:child_process";
const pop = new Set(GUARD_SURFACES.flatMap((s) => s.suitePaths));
const changed = execSync(`git diff --name-only ${process.env.BASE}...HEAD`).toString().split("\n").filter(Boolean);
console.log(changed.filter((f) => pop.has(f)).join("\n"));
')
[ -n "$EDITED" ] || { echo "ABORT: the derived edited set is EMPTY - the derivation is broken, not the tree"; exit 2; }
printf '%s\n' "$EDITED" > /tmp/edited-suites.txt
pnpm exec tsx "$CENSUS" --records | tail -n +7 | sort > /tmp/census-after.txt

# (a) UNEDITED population: additions only, and every addition environment-free.
diff <(grep -v -F -f /tmp/edited-suites.txt /tmp/census-before.txt) \
     <(grep -v -F -f /tmp/edited-suites.txt /tmp/census-after.txt) > /tmp/unedited.diff || true
[ "$(grep -c '^<' /tmp/unedited.diff)" = 0 ] || { echo "FAIL: a record outside every edited suite moved or vanished"; exit 1; }
! grep '^>' /tmp/unedited.diff | grep -qv '^> environment-free' \
  || { echo "FAIL: an addition outside the edited suites is not environment-free"; exit 1; }

# (b) EDITED suites: additions AND DECLARED RENAMES, keyed by the RECORD.
#
# THIS CHECK HAS NOW BEEN REWRITTEN THREE TIMES ON ONE AXIS (diff r2 F4, r3 F5,
# r1-at-e5d1d723d69c F5) and each earlier repair edited the COUNTING. That is the
# drip the same-vector-recurrence rule names, so the counting is gone rather than
# refined.
#
# Why counting could never work here, at any key: a rename is a removal plus an
# addition, and so is a SUBSTITUTION of one registration for an unrelated one.
# The two are indistinguishable in any aggregate, because the aggregate is
# exactly what they have in common. Keying the count by (verdict, suite) made the
# masking narrower and left it intact -- this branch adds many free records to
# `premiseScan.test.ts`, so a pre-existing free registration there could vanish
# under one of them and the count would not move.
#
# The census already emits the key that settles it -- `verdict | suite | name
# #ordinal`, one line per registration -- and the check was throwing it away.
# Now: a real set difference over those lines. EVERY removal fails unless it is
# DECLARED below as a rename with its replacement. A rename is a claim about
# intent that no diff can infer, so it is written down and adjudicated, which is
# what the prose has claimed since r2 while the commands counted.
cat > /tmp/declared-renames.txt <<'RENAMES'
# One per line: <old record line>  =>  <new record line>, both verbatim census
# lines. Empty means this branch renames nothing and every removal is a failure.
RENAMES

pnpm exec tsx --eval '
import { readFileSync } from "node:fs";
const edited = readFileSync("/tmp/edited-suites.txt", "utf8").split("\n").filter(Boolean);
const inEdited = (line: string): boolean => edited.some((e) => line.includes(e));
const load = (p: string): string[] =>
  readFileSync(p, "utf8").split("\n").filter((l) => l.trim() !== "" && inEdited(l));
// MULTISET difference, not Set difference. Two registrations can share a key
// only if the census ordinal failed, and if it ever does, a Set would silently
// absorb the duplicate and under-report the loss.
const bag = (xs: string[]): Map<string, number> => {
  const m = new Map<string, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return m;
};
const before = bag(load("/tmp/census-before.txt"));
const after = bag(load("/tmp/census-after.txt"));
const removed: string[] = [];
const added: string[] = [];
for (const [k, n] of before) for (let i = 0; i < n - (after.get(k) ?? 0); i++) removed.push(k);
for (const [k, n] of after) for (let i = 0; i < n - (before.get(k) ?? 0); i++) added.push(k);
const declared = new Map<string, string>();
for (const line of readFileSync("/tmp/declared-renames.txt", "utf8").split("\n")) {
  if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
  const [from, to] = line.split("=>").map((x) => x.trim());
  if (from === undefined || to === undefined || from === "" || to === "")
    { console.error(`FAIL: unparseable declared rename: ${line}`); process.exit(1); }
  declared.set(from, to);
}
console.log(`records in edited suites: ${[...before.values()].reduce((a, b) => a + b, 0)} before, ${[...after.values()].reduce((a, b) => a + b, 0)} after`);
for (const r of added) console.log(`  ADDED    ${r}`);
for (const r of removed) console.log(`  REMOVED  ${r}`);
const undeclared: string[] = [];
for (const r of removed) {
  const to = declared.get(r);
  // A declared rename must name a replacement that ACTUALLY ARRIVED. Otherwise
  // the declaration is a way to delete a record by writing a sentence.
  if (to === undefined) { undeclared.push(`${r}  (no declaration)`); continue; }
  const idx = added.indexOf(to);
  if (idx === -1) { undeclared.push(`${r}  (declared -> ${to}, which is NOT among the additions)`); continue; }
  added.splice(idx, 1);
  console.log(`  RENAMED  ${r}\n        -> ${to}`);
}
if (undeclared.length > 0) {
  console.error("FAIL: records left the edited suites without a declared rename:");
  for (const u of undeclared) console.error(`  ${u}`);
  process.exit(1);
}
console.log(`(b) holds: ${removed.length} removal(s), all declared and all matched`);
' || exit 1

# (c) AC-1, over the UNEDITED population. Restricted deliberately: an edited
# suite's own renames are (b)'s business, and counting them here reports a rename
# as an AC-1 violation -- true of the wrong question.
diff <(grep -v -F -f /tmp/edited-suites.txt /tmp/census-before.txt | grep '^environment-touching') \
     <(grep -v -F -f /tmp/edited-suites.txt /tmp/census-after.txt | grep '^environment-touching') \
  || { echo "FAIL: the env-touching set moved outside the edited suites"; exit 1; }
echo "AC-1 holds"
```

**(c) is the load-bearing one, and it is scoped to the UNEDITED population** — legitimate where a
count is not, because it asserts a SET is unchanged rather than predicting a size. Whole-population
was the earlier form and it was wrong in a way only running it reveals: a test RENAMED inside an
edited suite is a remove plus an add at the same verdict, so the touching set differs textually and
(c) reports an AC-1 violation for a rename that moved no verdict at all. (a) alone is not enough
either — it passes if a touching record is swapped for a free one, since that is still one `>` and one
`<`. **A verdict move inside an EDITED suite is caught by (b)'s per-verdict counts**: a record that
changes verdict decrements the old verdict's count, and (b) fails on any verdict whose count falls.

**These three commands were repaired after diff review round 3 ran them**, which is the whole point of
the finding: they had been read and reasoned about, never executed. `BASE` was assigned but not
exported, so the child process computing the edited set read `undefined`; the set was then joined with
a comma and handed to `grep -F` as ONE pattern, which matched 0 of 2805 records where the two paths
separately match 329; and (b) forbade every removal while the prose beside it claimed renames were
allowed. Each failure was in the direction that reads as success.

**THE EDITED SET IS DERIVED, AND A HARDCODED ONE WAS MEASURED WRONG ON THIS VERY BRANCH.** This block
originally named ONE edited suite. The branch later grew a SECOND: a required-CI repair renamed a test
in `tests/specLint/declaredLimitPinsCorpus.test.ts`, which is also in the census population, and the
hardcoded partition reported that rename as *"a record outside the edited suite moved or vanished"* —
a true statement about the wrong question, and one that reads as an AC-1 break. The edited set is
therefore `git diff --name-only BASE...HEAD` intersected with the population, so a suite edited
tomorrow is covered by default rather than becoming a false failure.

**AC-1 AND A RENAME ARE DIFFERENT CLAIMS, AND CHECK (c) MUST NOT CONFLATE THEM.** AC-1 says the
CLASSIFIER does not move verdicts. A test RENAMED in an edited suite changes a record's identity — it
is a remove plus an add at the same verdict — without any classification changing. So (c) is
evaluated over the UNEDITED population, where AC-1's claim actually bites, and a removal inside an
edited suite is (b)'s business rather than (c)'s.

**(b) DECLARES RENAMES; IT DOES NOT INFER THEM, AND IT NO LONGER COUNTS ANYTHING.** Three successive
versions of this check compared aggregate counts — first by verdict, then by (verdict, suite) — and a
review round refuted each. The refutations were not about the key. A rename is a removal plus an
addition and so is a SUBSTITUTION of one registration for an unrelated one; an aggregate is precisely
what the two have in common, so no key makes counting able to tell them apart. This branch adds many
free records to `premiseScan.test.ts`, which is enough to pay for a pre-existing free record
disappearing there at any count granularity.

So (b) takes a multiset difference over the census's own record lines — `verdict | suite | name
#ordinal`, the key it was already emitting and the check was already discarding — prints every
addition and every removal, and FAILS on any removal that is not DECLARED, by hand, alongside the
addition that replaces it. A declared rename whose replacement never arrived also fails, so the
declaration cannot become a way to delete a record by writing a sentence. Intent is not derivable
from a diff; writing it down is the only honest form, and it is what this prose has claimed since the
first refutation while the commands counted.

**Every new case must be environment-FREE, and that is a requirement on how the cases are written,
not a prediction.** The fixtures are source STRINGS passed to `classifyTests`; a string literal
containing `process.env` is not a property access, so the case bodies do not read the environment. A
case that genuinely needs to would owe an `EXPECTED_ENV_TOUCHING` update, which step 1 catches by
failing — so this is checked, not assumed.

**If any env-touching record moves, AC-1 has moved and a user decision IS owed** (spec §4, and the
PR #843 escalation shape). Stop and escalate rather than updating `EXPECTED_ENV_TOUCHING`.

**AC-1.**

---

## Task 5a — OBSERVE the two-in two-out, THEN re-key (verification, no red)

**Files:** `tests/mutation/source/registry.ts`

Both accepted survivors shift (§0). **Order matters and the first draft had it backwards** — plan
review r1 finding 2: once the ledger holds the new keys, `reconcile` reports `unaccepted: []` and
`stale: []`, so "exactly two stale and exactly two new" is an observation that is only possible
BEFORE the registry edit.

1. **Observe, with the source change landed and the ledger UNTOUCHED.** Expect exactly the two old
   ids in `stale` and exactly two new ids in `unaccepted`, **and nothing else**. A third entry in
   either list is a genuine new survivor, not a shift, and it stops the task.
2. **Re-key by EXPRESSION and COLUMN, never by line arithmetic.** The mutated expression text and its
   1-based column must be byte-identical at the old key and the new one. That is what makes it a
   re-key rather than a new acceptance; `tests/mutation/source/registry.ts`'s `claimSweep` row records
   the same procedure for the same operation.
3. **Re-run and expect both lists EMPTY.** Step 1 proves nothing appeared; step 3 proves the re-key
   landed on the right sites.

The producer for all three steps is the one command in Task 5b.

## Task 5b — the score and the survivor sets, from the shipped functions (verification, no red)

**Files:** none — this task runs commands and records their output.

**The gate ASSERTS the score and never PRINTS it** (plan review r1 finding 3): the only comparison is
`expect(result.score.value).toBeGreaterThanOrEqual(surface.scoreFloor)` at
`tests/mutation/source/surfaceCases.ts:79`, and nothing in `tests/mutation/source/gate.ts` or
`tests/mutation/source/runner.ts` writes it to stdout. A brief line requiring
`MUTATION SCORE: <k>/<t>` therefore needs a producer, and this is it — built from the shipped
functions rather than reimplementing the arithmetic:

```bash
pnpm heavy pnpm exec tsx --eval '
  import { runSurface } from "./tests/mutation/source/runner";
  import { reconcile, score } from "./tests/mutation/source/ledger";
  import { GUARD_SURFACES } from "./tests/mutation/source/registry";
  const s = GUARD_SURFACES.find((x) => x.id === "premiseScan");
  if (!s) { console.error("no premiseScan row"); process.exit(2); }
  const r = runSurface(process.cwd(), s);
  if (r.mutantCount === 0) { console.error("ABORT: zero mutants; the run tested nothing"); process.exit(2); }
  const sc = score({ killed: r.killed, survivors: r.survivors, ledger: s.accepted ?? [] });
  const rec = reconcile(r.survivors, s.accepted ?? []);
  console.log(`MUTATION SCORE: ${sc.killed}/${sc.denominator}`);
  console.log(`unaccepted: ${JSON.stringify(rec.unaccepted)}`);
  console.log(`stale: ${JSON.stringify(rec.stale)}`);
'
```

`sc.denominator` is `killed + countedSurvivors` — equivalents excluded — which is the `<k>/<t>` the
`GUARD SURFACE:` line means. **The zero-mutant abort is load-bearing:** `Score.value` is documented to
be `NaN` on an empty denominator (`tests/mutation/source/ledger.ts:63`), and `NaN >= floor` is
`false`, so the gate catches it — but this command computes rather than gates, and a printed
`MUTATION SCORE: 0/0` would read as a measurement.

**Heavy-wrapped** because `runSurface` spawns a suite per mutant.

Per §0.2, a CANCELLED `source-shards` leg is the 90-minute job timeout (rule 172), not a verdict: do
not re-run it, and state a local scored run plainly as local.

**The provenance stamp is PR 1's, and it arrives with PR 1.** `derive-inputs.mts` lands on `main` with
`fix/premisescan-hook-attachment`; this PR is sequenced after it and does not carry a second copy —
two implementations of one derivation is the defect class this arc exists to close. vitestSurface.ts
is correctly OUTSIDE that input set: it is neither the mutated source nor imported by any deciding
suite, so it cannot move the score.

---

## Task 6 — ledger closeout, EARLY, as one commit

`BL-PREMISESCAN-REGISTRAR-ACCEPT-SETS-HAND-MAINTAINED` is archived and its `**Status:** IN PROGRESS ·
**Branch:**` marker removed **in the PR's last commit, before the merge** (invariant 12): a marker
that reaches `main` names a branch the merge just deleted, and
`tests/docs/_metaLedgerInProgress.test.ts` then reds on main.

Verify with commands, not by reading:

```bash
ROW='BL-PREMISESCAN-REGISTRAR-ACCEPT-SETS-HAND-MAINTAINED'
fail() { echo "FAIL: $1"; exit 1; }

# Preconditions FIRST, so that every absence below can only mean what it says.
for f in BACKLOG.md BACKLOG-archive.md; do
  [ -s "$f" ] || fail "$f is missing or empty — every absence below would be meaningless"
done
# A row is declared at `##` OR `###` — 66/24 in BACKLOG.md, 303/99 in the archive.
[ "$(grep -cE '^#{2,3} (BL|DEF)-[A-Z0-9-]+' BACKLOG.md)" -gt 0 ] || fail "BACKLOG.md declares no rows"
[ "$(grep -cE '^#{2,3} (BL|DEF)-[A-Z0-9-]+' BACKLOG-archive.md)" -gt 0 ] || fail "archive declares no rows"

grep -qE "^#{2,3} $ROW( |$|—)" BACKLOG.md         && fail "the row is still DECLARED in BACKLOG.md"
grep -qE "^#{2,3} $ROW( |$|—)" BACKLOG-archive.md || fail "removed but never DECLARED in the archive"
grep -rn 'IN PROGRESS' BACKLOG.md DEFERRED.md | grep -qi premisescan \
  && fail "an IN PROGRESS marker would reach main"
both=$(comm -12 \
  <(grep -oE '^#{2,3} (BL|DEF)-[A-Z0-9-]+' BACKLOG.md         | sed -E 's/^#+ //' | sort -u) \
  <(grep -oE '^#{2,3} (BL|DEF)-[A-Z0-9-]+' BACKLOG-archive.md | sed -E 's/^#+ //' | sort -u))
[ -z "$both" ] || fail "declared in BOTH files: $both"

pnpm exec vitest run tests/docs/_metaLedgerInProgress.test.ts tests/docs/_metaLedgerMintBar.test.ts --project parallel \
  || { echo "FAIL: a ledger guard is red"; exit 1; }
echo "ledger closeout verified"
```

**Every line FAILS rather than printing a number to be eyeballed** — and the last line had to be
repaired to make that true of itself. The block carries no `set -e`, so the Vitest run above sat
unguarded and `echo "ledger closeout verified"` printed on its heels whether the guards were green or
red; a shell probe of a failing command followed by that echo exits `0`. The claim in this very
paragraph was false about the one command that could most cheaply make the whole closeout a lie
(diff review r2, F5). Explicit `|| { …; exit 1; }` rather than `set -e`, because the block is meant to
be pasted line by line and `set -e` does not survive that. The first draft used
`grep -c … # expect 0`, which prints its result and moves on — an expectation stated beside a command
instead of enforced by it, the same class as plan review r3 finding 2 one artifact over.

The second check is the direction the first cannot see: removed-from-open is satisfied by a row that
was DELETED rather than archived. The `comm -12` is a third direction again — archived-minus-open
alone passes a row that was COPIED rather than moved.

**EVERY CHECK IS ANCHORED TO `^## <ROW>`, AND THAT WAS BOUGHT BY RUNNING THEM EARLY.** Dry-run against
the tree BEFORE the closeout edit, an earlier draft of this block keyed each check on
`grep -q "$ROW" <file>` — which matches a bare cross-REFERENCE in another entry's prose. Measured:
the "removed but never archived" check PASSED ALREADY, before anything was archived, because this row
is cited in the prose of a different archive entry; and the `comm -12` over bare ids reported **120
false overlaps**, since archive entries routinely cite other rows by id. Both predicates ranged over
MENTIONS where they meant DECLARATIONS. A heading is the declaration.

**AND THE HEADING LEVEL WAS BOUGHT A THIRD TIME.** The repair above anchored on `^## ` alone, which
fixed *ranges over MENTIONS* and introduced *ranges over ONE HEADING LEVEL*. Measured on this tree:
`BACKLOG.md` declares 66 rows at `##` and **24 at `###`**; the archive 303 and **99**. The
both-declared check was therefore structurally blind to 123 rows and would have passed forever for
every one of them — a repaired predicate inheriting a fresh blind spot from the side nobody was
looking at. Both levels are matched now; the check still returns 0 on this tree, so the widening
costs nothing and covers 123 more rows.

**The preconditions were bought the same way.** `grep … && fail` passes silently when the FILE is
missing — the failure mode is good news, so it is the one that survives. With no ledger files at all
the block still exited 1, but only because the archive check happens to be an absence→fail running
afterward; that is ordering luck, not design. Proving the files exist and declare rows FIRST is what
makes every later absence mean what it says.

**Closeout checks are the least-tested code in any plan** — written early, executed once, at the
moment they are most load-bearing and least convenient to debug. Run them against the current tree
while there is still time to think: they should fail at the FIRST check, for the asserted reason,
because the row is still open.

`BL-ACCEPTSET-CONSUMER-COVERAGE` (filed during this arc's spec stage) is **not** closed here. Its
repair is a structural test whose consumer list is DERIVED — walking for reads of each set's
identifier — so a consumer added later is covered rather than becoming a fourth instance. That is a
separate arc; this PR's Task 4 repairs the three known consumers of one set, which is the instance,
not the class.

---

## 2. Sequencing note

Task 1 → 2 → 3 is forced, and Task 1 is one task rather than two for the same kind of reason:

- **The sets and the peel are ONE task** because peel-only is measured to change nothing observable
  (§0.3 item 2), so a peel-first commit would leave its own test command red — invariant 1, not
  preference. Spec R1 says the same thing from the correctness side.
- **1 before 2** because the dispatch cannot see `suite` until `REGISTRARS` contains it.
- **1 before 3** because `aroundEach` is not in the hook set until the derivation lands.
- **4 after 3** because the census claim is about the finished change.
- **5a before 5b's second run, and OBSERVE before RE-KEY** because a ledger already holding the new
  keys reports `stale: []` and `unaccepted: []`; the two-in two-out observation is only available
  before the registry edit (plan review r1 finding 2).

## 12. Close-out

`impeccable-gate: N/A — no UI surface`

Round-economy: this arc's spec stage crossed the threshold and is filed at
`docs/review-rounds/fix/premisescan-registrar-accept-sets/c80f844278bd.md`. **The merge of
`origin/main` moved the merge base to `0820436cf4dd`, so the plan and diff stages write to a NEW
corpus file** — that split is by design and the rows are never consolidated. If the plan stage
crosses four counted rounds it owes its own filing under the new key, **filed by this session and not
left for the implementer**.

---

## 13. Handover to the implementer

**Branch `fix/premisescan-registrar-accept-sets` is pushed and clean.** Spec and plan are both
APPROVED-equivalent at their caps; nothing here is awaiting a reviewer.

### Start here

1. `git worktree add -b <your-branch> ../FX-worktrees/<name> origin/main` is NOT what you want — this
   branch already exists and carries the spec, the plan, two probes and both round-economy filings.
   Check it out and continue on it.
2. `pnpm install`, `pnpm worktree:link-env`, `pnpm preflight`.
3. Read §0.3 before Task 1. Eight measurements are recorded there, all re-runnable; **do not re-derive
   them**, and do not treat §0.3's census table as an expectation for Task 4 (it measures the variants
   in isolation, on a tree with no test-file edits).
4. Task order is 1 → 2 → 3 → 4 → 5a → 5b → 6 and §2 says why each edge is forced.

### The four things most likely to trip you

- **Task 1 is one commit, not two.** The peel alone changes nothing observable, so it cannot carry a
  red. Do not split it back apart.
- **`loadTimePremises` does NOT get the any-object widening.** Its failure direction is inverted from
  the two hook consumers: matching more there means CREDITING a premise that does not exist. This was
  the only BLOCKING finding in eleven rounds; if you find yourself writing one predicate that treats
  all three sites alike, stop.
- **Task 4 asserts no whole-population count.** `premiseScan.test.ts` is in the census population and
  your own cases add to it. Check (c) — the environment-touching SET is unchanged — is the AC-1 claim.
- **Task 5a observes BEFORE re-keying.** Once the ledger holds the new keys, `reconcile` reports empty
  lists and the two-in two-out observation is gone.

### Two things this arc learned the expensive way

**A line-keyed identity churns, and the shift is not uniform.** Both accepted survivors move. Re-key by
EXPRESSION and COLUMN, never by line arithmetic — and never by assuming a constant offset. A concurrent
red on `main` (run 32459382957) shows the same surface's eight rows shifting by +1 seven times and by
**+24** once; a uniform re-key writes a wrong key for exactly that row, and a wrong key then reads as a
fresh stale row rather than as an error in the repair.

**A class sweep must check each instance's failure DIRECTION, not only its syntax.** Three sites shared
one shape here and one of them failed the other way. A repair whose safety argument is that it is
syntactically identical to a safe one has not made a safety argument.

### Review economy for the implementation stage

The diff stage starts a fresh round count. `premiseScan` is enrolled, so **enrolment precedes review**:
run Task 5b's producer BEFORE the round-1 `--stage diff` dispatch and put `MUTATION SCORE: <k>/<t>`
plus "0 unaccepted survivors" on the brief's `GUARD SURFACE:` line — the wrapper refuses the dispatch
without it. If the diff stage crosses four counted rounds it owes its own filing under the merge base
in effect at that time; **file it yourself rather than leaving it for whoever comes next.**
