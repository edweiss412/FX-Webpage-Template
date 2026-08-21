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
| **AC-6** | ONE predicate, parameterised by the name set, serves all three bare-identifier-callee SITES, and it keys on the property NAME alone. | §3.4, §3.7 |
| **AC-7** | Builders (`extend`, `override`, `scoped`, `fn`) are excluded because the declaration does not name them, not by an exception list. | §3.2 |
| **AC-8** | Every selector in the extractor ABORTS when it matches nothing, rather than returning a confident empty set. | §3.2 |

---

## 0.1 Meta-test inventory

| test | what it pins | touched here |
| --- | --- | --- |
| `tests/mutation/_metaPremiseContract.test.ts` | per-suite environment-touching counts; suites derived from `GUARD_SURFACES`; every enrolled suite classifies ≥1 test | **must stay green unchanged** — AC-1 |
| `tests/mutation/source/premiseScan.test.ts` | the scanner's behavioural suite (326 cases today) | **gains cases** — AC-3, AC-4, AC-5, AC-6 |
| _metaVitestSurfaceDerivation.test.ts (NEW, under `tests/mutation/`) | the three committed literals equal what the extractor derives from the installed declaration | **created** — AC-2, AC-7, AC-8 |

The new pin is a `_meta*` sibling rather than a case inside `premiseScan.test.ts`, matching
`tests/mutation/_metaClaimSweepSuiteDerivation.test.ts` which `origin/main` added on 2026-08-20 for
exactly this shape. It is deliberately NOT added to premiseScan's `suitePaths`: it decides nothing
about the scanner's behaviour and would buy wall clock at no score.

## 0.2 Mutation-family closure

`premiseScan` is enrolled (`scoreFloor: 0.95`). This change alters the source, so the gate is re-run
and the two accepted survivors are re-keyed AND re-validated (Task 6a). **Enrolment precedes review:**
`pnpm mutation:guards` runs BEFORE the round-1 `--stage diff` dispatch and its score plus an empty
unaccepted-survivor set goes on the brief's `GUARD SURFACE:` line.

Per spec §6, this change moves premiseScan's mutant count and therefore its shard weight. If the
binding `source-shards` leg returns CANCELLED with no annotations, that is the 90-minute JOB TIMEOUT
(rule 172) and NOT a budget signal: do not re-run it, and state the local scored run as local.

---

## 0.3 Design validated empirically BEFORE this plan was written

Four census runs and one extractor prototype, all on this tree, all re-runnable.

**1. The census, and what a merge did to it.** `docs/superpowers/specs/ci/probes/2026-08-21-premisescan-registrar-accept-sets/census.mts`
derives its population from `GUARD_SURFACES` and prints a record per classified test.

```
                 suites  classified  env-touching  env-free  unclassifiable
A shipped            77        2761           101      2659               1
P peel ONLY          77        2761           101      2659               1
B sets ONLY          77        2762           101      2660               1
C sets + peel        77        2762           101      2660               1
```

**2. Peel-first is verdict-neutral, and that is what makes the task order safe.** `A → P` is ZERO
record moves. Spec §2 measures that completing the sets ALONE is silently WRONG, so a plan that
landed the sets first would leave an intermediate commit a bisect can land on in exactly that state.
R1 ("both halves ship together") is a PR-level constraint and does not by itself order the commits;
this measurement does. **The peel lands first.**

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

---

## 0.4 Red-command validation, run at plan time

| command | observed now | why that is correct |
| --- | --- | --- |
| `pnpm exec vitest run tests/mutation/source/premiseScan.test.ts --project parallel` | 326 passed, 869ms | every enrolled task is `red-state=authored`: the failing case is written by the task itself, so a green baseline is the expected state |
| `pnpm exec vitest run tests/mutation/_metaPremiseContract.test.ts --project parallel` | 11 passed, 15.4s | Task 5's verification command; proves the `parallel` project resolves for `tests/mutation/*.test.ts`, which is the shape Task 2's NEW file will use |

Task 2's own red command names a file that does not exist yet, so its SHAPE is validated by the
second row rather than by running it against nothing. A "no test files found" error is not a red.

**All four enrolled tasks are `red-state=authored`.** No task in this plan claims a `red-state=live`,
so none owes an observed-failing run at plan time.

## 0.45 What each instrument does on THIS branch versus with the change — measured

| instrument | on this branch | with the change | what a WRONG result means |
| --- | --- | --- | --- |
| `census.mts` | exit 0, `2761 / 101 / 1` | exit 0, `2762 / 101 / 1`, one record ADDED | a moved env-touching record means AC-1 moved and a user decision IS owed — stop and escalate |
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
4. **One predicate, three sites, parameterised by the name set.** A callee matches when its property
   NAME is in the given set — bare identifier or any property access. `HOOK_REGISTRARS` itself has
   TWO consumers; the third site, `loadTimePremises`, carries the identical shape over
   `/^premise(Holds)?$/`, which is why the predicate takes the set rather than closing over one.
   Three copies of a rule are three things that drift, the accept-set defect one level down.

### 1.5 Every named weaker implementation owes a KILLING check

| weaker implementation | why it is tempting | the check that kills it |
| --- | --- | --- |
| peel calls then properties (today) | two loops read simply | Task 1's `test.skipIf(c).each(rows)("chain %s", fn)` case asserts the name is `chain %s` — the two-loop form yields a spurious `<test at line N>` |
| collect the immediate curried call's arguments only | passes every single-level fixture | Task 1's `describe.skipIf(process.env.CI).each([1])(…)` case asserts the child is environment-TOUCHING; a one-level collector leaves it free |
| widen `REGISTRARS` to include `suite` | looks like adoption | Task 3's case asserts `suite("x", () => { beforeEach(spawn); it(…) })` classifies its child environment-touching; set-only widening drops it |
| key the hook rule on a callee resolving through `registrarRoot` | reads as principled | Task 4's `describe("outer", (t) => { t.beforeEach(spawn); it(…) })` case — the parameter is a local binding that peels to nothing |
| derive hooks from a hand-written candidate array filtered by runtime presence | there IS a real runtime check | Task 2's pin compares against `interface Hooks` members; a filter can only SUBTRACT, never add the member nobody thought of |
| let a selector return `[]` when it matches nothing | the set still "derives" | Task 2's floor: each selector throws naming itself; proved by pointing one at a name that does not exist |

---

## Task 1 — one traversal: interleaved peel, and every call in the chain contributes its arguments

<!-- task: red=`pnpm exec vitest run tests/mutation/source/premiseScan.test.ts --project parallel` red-state=authored red-target=`tests/mutation/source/premiseScan.ts:68` why=`the new cases assert that test.skipIf(c).each(rows)("chain %s", fn) classifies under the name "chain %s" with no spurious registration, and that describe.skipIf(process.env.CI).each([1])(...) makes its child environment-touching; today registrarRoot peels calls and properties in two separate loops so the outer registration resolves to nothing, and eachProducers reads only the immediate curried call, so both cases fail` ac=AC-3,AC-4 -->

**Why this task is first.** Measured in §0.3: peel-only is ZERO record moves on the live corpus, while
sets-only is silently wrong (spec §2). Landing the peel first means no intermediate commit is ever in
the wrong state.

Write the failing cases in `tests/mutation/source/premiseScan.test.ts` first:

- `test.skipIf(c).each(rows)("chain %s", fn)` → one classification named `chain %s`, and **no**
  classification named `<test at line …>`. The second half is the anti-tautology half: asserting only
  that `chain %s` appears passes while the spurious registration also appears.
- `test.skipIf(c)("live", fn)` → named `live`.
- `test.each(rows)("plain %s", fn)` → named `plain %s` (the regression guard: today's behaviour must
  not move).
- `describe.skipIf(process.env.CI).each([1])((…) => { it("x", () => {}) })` → the child is
  **environment-touching**, with a detail naming `process.env`.
- `describe.each([process.env.CI])(…)` → unchanged environment-touching (single-level regression).

Then the implementation: `registrarRoot` becomes one `for (;;)` alternating `isCallExpression` and
`isPropertyAccessExpression`, returning `null` on a property not in `MODIFIERS`; `eachProducers`
walks the identical chain, pushing each `CallExpression`'s arguments.

**Note for the implementer.** These cases pass with `skipIf` absent from `MODIFIERS` only for the
`each`-shaped rows. The `skipIf` rows cannot go green until Task 2 widens the set — so **the `skipIf`
cases are authored in Task 1 and expected to go green in Task 2.** Do not weaken them to fit Task 1;
mark them with the reason inline. The `describe.each` and `test.each` rows go green in Task 1.

**AC-3, AC-4.**

---

## Task 2 — the extractor, the three derived literals, and the pin that reds on an upgrade

<!-- task: red=`pnpm exec vitest run tests/mutation/_metaVitestSurfaceDerivation.test.ts --project parallel` (file created by this task) red-state=authored red-target=`tests/mutation/source/premiseScan.ts:47` why=`the new pin derives the three accept-sets from Vitest's declaration and asserts the shipped literals equal them; today MODIFIERS lacks fails/runIf/shuffle/skipIf, HOOK_REGISTRARS lacks aroundAll/aroundEach and REGISTRARS lacks suite, so all three assertions fail` ac=AC-2,AC-7,AC-8 -->

New module vitestSurface.ts, beside the scanner under `tests/mutation/source/`, exporting `deriveModifiers()`,
`deriveHooks()` and `deriveRegistrars()`. Resolution is the two-step chain from §0.3 item 6 — resolve
vitest's own package manifest from the repo root, then resolve `@vitest/runner` from vitest's own package —
and every `*.d.ts` in the resolved dist is read with `ts.createSourceFile`.

| set | derived from | today |
| --- | --- | --- |
| `MODIFIERS` | `ChainableSuiteAPI` ∪ `ChainableTestAPI` chain keys and curried members, ∪ `SuiteAPI`'s condition-taking members | 11 |
| `HOOK_REGISTRARS` | members of `interface Hooks` | 6 |
| `REGISTRARS` | `declare const X: SuiteAPI \| TestAPI` | 4 — `suite`, `describe`, `it`, `test` |

**AC-8's floor is per selector, not per module.** Each of the four selectors throws naming ITSELF
when it yields nothing. A single module-level "did we get anything" check passes as long as one
selector still matches, which is the vacuity this exists to prevent. **Prove it:** point one selector
at a type name that does not exist and observe that selector's own message; the plan's reviewer
should expect that proof in the commit body, not an assertion that the floor is there.

**AC-7 is discharged by construction and asserted anyway.** The pin asserts `extend`, `override`,
`scoped` and `fn` are ABSENT from the derived modifier set. That assertion is not redundant with the
equality check: it names the failure direction, so a future extractor that starts admitting builders
fails with the reason rather than with a diff.

Commit the three literals into `premiseScan.ts`, sorted, each with the extractor call that produced
it named in a comment — **provenance, not data** (a number in a comment is provenance; the literal is
the data).

**AC-2, AC-7, AC-8.** Task 1's `skipIf` cases go green here.

---

## Task 3 — `suite` is adopted at the DISPATCH

<!-- task: red=`pnpm exec vitest run tests/mutation/source/premiseScan.test.ts --project parallel` red-state=authored red-target=`tests/mutation/source/premiseScan.ts:1672` why=`the new case asserts suite("x", () => { beforeEach(spawn); it("y", fn) }) classifies its child environment-touching, exactly as the describe twin does; after Task 2 registrarRoot returns "suite" but the walk dispatches on the root by name and "suite" matches neither branch, so the registration is recognized and dropped and the child is environment-free` ac=AC-5 -->

Two sites name `"describe"` and both must accept `suite`: the walk's dispatch
(`tests/mutation/source/premiseScan.ts:1672`) and `hookBodies`' nested-describe prune
(`tests/mutation/source/premiseScan.ts:1862`). **Editing only the first is the defect this task
exists to catch** — the prune would then treat a nested `suite` as ordinary content and attach its
hooks to its siblings.

The case is written as a TWIN: the same body under `describe` and under `suite`, asserting the same
verdict. A twin is what makes it impossible to pass by asserting a constant.

Also assert `bench("b", fn)` produces **no** classification (AC-5's other half, and §5 L3).

**AC-5.**

---

## Task 4 — one predicate, three sites, keyed on the property name

<!-- task: red=`pnpm exec vitest run tests/mutation/source/premiseScan.test.ts --project parallel` red-state=authored red-target=`tests/mutation/source/premiseScan.ts:1758` why=`the new cases assert that test.beforeEach(spawn) at file scope and (t) => t.beforeEach(spawn) inside a suite factory both make the enclosed test environment-touching; today every site requires a bare identifier callee, so each qualified form is invisible and every case reads environment-free` ac=AC-6 -->

One exported predicate, **parameterised by the name set** — a callee matches when its property name
is in the SET PASSED IN, whether it is a bare identifier or a property access on ANY object.

**`HOOK_REGISTRARS` has TWO consumers, not three, and the plan says so because the spec said
otherwise.** `grep -n HOOK_REGISTRARS tests/mutation/source/premiseScan.ts` returns the declaration
plus `tests/mutation/source/premiseScan.ts:1758` and `tests/mutation/source/premiseScan.ts:1843`. The third site,
`tests/mutation/source/premiseScan.ts:1953` (`loadTimePremises`), carries the identical
bare-identifier-callee shape over `/^premise(Holds)?$/`. Spec §3.4 has been corrected; the
parameterised predicate is what lets one implementation serve a site that ranges over a different set.

**The three sites fail in different DIRECTIONS, and both are repaired anyway.** The two hook
consumers fail toward a silent FREE — the thing §6's bound forbids. `loadTimePremises` failing to see
`t.premise(…)` reports a premise as MISSING when one exists, which is conservative and therefore not
urgent. It is repaired in the same change because it is the same one-line call and the class-sweep
default is every instance of one shape in the same PR; deferring it would need a reason the sweep
rule accepts, and "same defect, different file" is explicitly not one.

Cases, one per site, because a single case passes with two of three still unrepaired:

- file scope: `test.beforeEach(spawn)` then `it("x", fn)` → environment-touching.
- inside a describe: `describe("d", () => { test.beforeEach(spawn); it("x", fn) })` → touching.
- factory alias: `describe("d", (t) => { t.beforeEach(spawn); it("x", fn) })` → touching.
- `aroundEach` in the qualified form → touching (the derived set's new member, exercised).
- `loadTimePremises`: a `.each` registration whose associated premise is written as
  `t.premise(…)` rather than `premise(…)` is SEEN. Today it is not, and the registration is reported
  as lacking an associated premise.
- **the over-report, asserted not merely documented:** `logger.afterAll(spawn)` reports. §5 L5 calls
  this a conservative over-report with a named cause; a limit that is never exercised is a claim, so
  the case pins the behaviour the limit describes.

**AC-6.**

---

## Task 5 — the closing corpus measurement (verification, no red)

Three commands, and the third is the one that can fail meaningfully:

1. `pnpm exec vitest run tests/mutation/_metaPremiseContract.test.ts --project parallel` — 11 passed,
   unchanged. Any per-suite count change contradicts AC-1.
2. `pnpm exec tsx docs/.../census.mts` — expect `2762 / 101 / 1`.
3. `diff` the `--records` output against the pre-change baseline captured at Task 0. **Expect exactly
   one added row and ZERO moved rows.** The environment-touching set must be byte-identical.

**If any env-touching record moves, AC-1 has moved and a user decision IS owed** (spec §4, and the
PR #843 escalation shape). Stop and escalate rather than updating `EXPECTED_ENV_TOUCHING`.

Capture the baseline BEFORE Task 1's commit: `git stash`-free, just run the census on the merge base
and keep the file. A baseline captured after the change proves nothing.

**AC-1.**

---

## Task 6a — re-key AND re-validate the accepted survivors, BEFORE the gate is run

Both keys shift (§0). Re-key **by EXPRESSION and COLUMN, not by line arithmetic**: the mutated
expression text and its 1-based column must be byte-identical at the old key and the new one. That is
what makes it a re-key rather than a new acceptance, and it is the procedure
`tests/mutation/source/registry.ts`'s `claimSweep` row records for the same operation.

Re-VALIDATE, do not merely re-key: run the gate and confirm it reports exactly two stale rows and
exactly two new survivors with **no others**. A re-key that silently accepts a third survivor is the
failure this ordering exists to catch, which is why 6a precedes 6b.

## Task 6b — the provenance pair, as one command that ENFORCES what it claims

`pnpm heavy pnpm mutation:guards` (heavy-wrapped: the browser gate spawns a real child per mutant).

The command must enforce BOTH conditions on every path — the gate's exit status AND stamp equality —
and `;` between them discards the first. Use `&&`, and compare the digests explicitly rather than
printing both and eyeballing them. A gate killed by a SIGNAL exits non-zero through a different path
than a failing gate; both must fail the command.

Record `MUTATION SCORE: <k>/<t>` plus "0 unaccepted survivors" on the round-1 `--stage diff` brief's
`GUARD SURFACE:` line. Per §0.2, a CANCELLED `source-shards` leg is the job timeout, not a verdict.

## Task 7 — ledger closeout, EARLY, as one commit

`BL-PREMISESCAN-REGISTRAR-ACCEPT-SETS-HAND-MAINTAINED` is archived and its `**Status:** IN PROGRESS ·
**Branch:**` marker removed **in the PR's last commit, before the merge** (invariant 12): a marker
that reaches `main` names a branch the merge just deleted, and
`tests/docs/_metaLedgerInProgress.test.ts` then reds on main.

`BL-ACCEPTSET-CONSUMER-COVERAGE` (filed during this arc's spec stage) is **not** closed here. Its
repair is a structural test whose consumer list is DERIVED — walking for reads of each set's
identifier — so a consumer added later is covered rather than becoming a fourth instance. That is a
separate arc; this PR's Task 4 repairs the three known consumers of one set, which is the instance,
not the class.

---

## 2. Sequencing note

Task 1 → 2 → 3 → 4 is forced, and not by convenience:

- **1 before 2** because peel-only is measured verdict-neutral and sets-only is measured silently
  wrong (§0.3 items 2 and 3). The reverse order puts a bisect-reachable commit in the wrong state.
- **2 before 3** because the dispatch cannot see `suite` until `REGISTRARS` contains it.
- **2 before 4** because `aroundEach` is not in the hook set until the derivation lands.
- **5 after 4** because the census claim is about the finished change.
- **6a before 6b** because a gate run against stale keys reports noise instead of the two-in two-out
  result that proves the re-key.

---

## 12. Close-out

`impeccable-gate: N/A — no UI surface`

Round-economy: this arc's spec stage crossed the threshold and is filed at
`docs/review-rounds/fix/premisescan-registrar-accept-sets/c80f844278bd.md`. **The merge of
`origin/main` moved the merge base to `0820436cf4dd`, so the plan and diff stages write to a NEW
corpus file** — that split is by design and the rows are never consolidated. If the plan stage
crosses four counted rounds it owes its own filing under the new key, **filed by this session and not
left for the implementer**.
