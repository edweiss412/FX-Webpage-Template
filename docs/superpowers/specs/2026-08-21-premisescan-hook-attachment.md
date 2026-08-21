# premiseScan reports the two hook-attachment shapes it cannot follow

**Status:** DRAFT · **Branch:** `fix/premisescan-hook-attachment` · **Base:** `origin/main` at `64c40a68e`
**Closes:** `BL-PREMISESCAN-FILE-SUITE-EAGER-HOOKS-LOST`, `BL-PREMISESCAN-NAMED-SUITE-FACTORY-HOOKS-LOST`
**Probe record:** `docs/superpowers/specs/ci/probes/2026-08-21-premisescan-hook-population.md`

*Line numbers in this document are STAMPED AT THE BASE SHA above and are locators; the SYMBOL is the identity. Producer A, producer B and their accessor land inside `premiseScan.ts`, so every citation below the first hunk shifts the moment the change lands -- and a shifted citation that still resolves is a false statement nothing surfaces, because the checker verifies only that a line is in range. Stamping them beats re-pointing them: the sequential PR 2 edits the same file again, so a re-pointed number would be stale within the day, while a base-stamped one stays true forever and a symbol cannot go out of range.*

---

## 1. What this is, and what it is not

`premiseScan` classifies every test in the enrolled suites as `environment-touching`,
`environment-free` or `unclassifiable` (`tests/mutation/source/premiseScan.ts`, `export type Verdict`
at `tests/mutation/source/premiseScan.ts:36`). Two Vitest registration shapes attach a hook that genuinely RUNS for a test while the
scanner never sees it, so the test reads `environment-free` — a **silent free**, the direction that
does not announce itself.

This spec makes both shapes **report `unclassifiable`** instead. It does **not** teach the scanner to
follow them.

**It does not close the class.** A third shape — a hook registered by a helper the registration
CALLS — stays silently free, at every position, exactly as it does today. That is a pre-existing and
uniform limit of the scanner's lexical hook collection rather than something these producers
introduce, it is bracketed against the shipped baseline at §4 L4, and saying so here is what stops
this spec reading as a claim to have closed silent frees in general.

### 1.1 This change is PROSPECTIVE, and the numbers say so

**The live population of both shapes is ZERO**, measured before this design was written:

| shape | live occurrences | population scanned |
| --- | --- | --- |
| hook in the eager position of a registration outside every inline suite body | **0** | 3404 registrations across 70 enrolled suites |
| registration carrying a factory-slot argument the scanner cannot follow | **0** | 3404 registrations across 70 enrolled suites |

```
$ pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-21-premisescan-hook-population/probe-population.mts
  1a  registration is a DIRECT statement of the file: 0 of 3404 registrations
  2a  describe/suite carrying an unfollowable FACTORY SLOT (index >= 1): 0 of 3404 registrations
  2c  any registration with an unfollowable factory slot, either root: 0 of 3404 registrations
```

**The zeros are measurements because the same extractor returns non-zero on constructed input.** A
zero from a walk that never looked renders identically to a zero from a walk that looked and found
nothing, so the probe runs its own recognizer over a synthetic file carrying one instance of each
shape and must report there: `POSITIVE CONTROL (constructed): eagerDirect 2, eagerFileScope 2,
factoryDescribe 1, registrations 6`. The script throws rather than printing a corpus zero if either
control count is zero. A zero without a positive control is a broken read wearing a measurement's
clothes.

So **this change repairs no live wrong verdict.** Nothing in the corpus is misclassified today, and
this spec does not claim otherwise. What it ships is a **fail-closed boundary**: a construct that
today would pass clean the moment somebody writes one instead fails closed, before it can produce
its first silent free. Both ledger rows are filed MEDIUM on "a silent FREE"; the measurement says
the current exposure is zero and the value is prospective protection, and recording that here is
what stops a later reader treating either row as a mis-severitied live bug.

The measurement is also the whole argument for the design in §3: with a zero population, resolving
and reporting are indistinguishable on today's tree, so the cheaper and narrower one wins outright.

### 1.2 Resolved scope — do not relitigate

Each row carries its ratification. A reviewer should verify the citation rather than re-derive the
decision.

| # | Decision | Ratified by |
| --- | --- | --- |
| R1 | **Report, do not resolve.** Neither shape gets a resolver. An unfollowable body reports `unclassifiable`; it is not followed to its declaration. | §3, on the measured zero in §1.1. Both ledger rows name reporting as the honest alternative in their own words ("The honest alternative, if resolution is declined, is to REPORT"). Also AGENTS.md's standing narrowing direction under same-axis recurrence. |
| R2 | **BOTH reports are FILE-scoped and BOTH are conservative.** Neither reason claims which suite a construct attaches to, because lexical position is not semantic suite scope and establishing the difference needs the resolution R1 declines. An earlier draft claimed producer A's scope was exact; spec review r1 refuted it with a probe and the claim is withdrawn. | §3.1, §4 L1 and L2 |
| R3 | **The unlocatable-body report is also FILE-scoped, and that IS an over-report.** Narrowing it to the affected tests requires resolving the identifier to its declaration, which is the analysis R1 declines. Filed as a documented limit in §4, not as a defect. | §3.2, §4 limit L2 |
| R4 | **Every fixture is synthetic source TEXT written to a temp file, never a live construct in the suite.** A live instance inside `premiseScan.test.ts` would make this surface's own suite an instance of the population it measures. | §7, and it is asserted executably by AC-7 |
| R5 | **No AC-1 movement, and none is introduced here.** `EXPECTED_ENV_TOUCHING` declares `tests/mutation/source/premiseScan.test.ts: 0` (`tests/mutation/_metaPremiseContract.test.ts:94`). `ENVIRONMENT_SOURCES.modules` is `["node:child_process", "scripts/lib/ledger-git"]` (`tests/mutation/source/premiseScan.ts:30`), and the new fixtures import neither, so the declared count stays 0. | §6 AC-8 |
| R5b | **The fixture corpus does not cross the registration-spelling axis, and the numbers are the reason.** Completed at depth 1 the cross-product is 72; at depth 2 it is 43 spellings and 392 cases; the filing arc's 84 mixes depths. Vitest's modifier object is self-similar, so the axis is unbounded and every finite cut through it is arbitrary. | §5.1, §5.2, §5.4 |
| R6 | **The accept-set work is NOT in this PR.** `MODIFIERS` and `HOOK_REGISTRARS` stay exactly as they are on `origin/main`. | §8, and `BL-PREMISESCAN-REGISTRAR-ACCEPT-SETS-HAND-MAINTAINED` is a separate sequential PR |
| R7 | **`BL-PREMISESCAN-ALIAS-SLICE-UNCOVERED` (`BACKLOG.md:125`) is a peer `accepted-gap` row on this surface and is not closed here.** §8 states whether this change affects it. | §8 |

---

## 2. The two shapes, against the current tree

### 2.1 A hook in a FILE-SCOPE registration's eager position

A registration's **eager positions** — its name argument, its options argument, and the arguments of
a curried `.each` / `.for` producer — are evaluated while the CURRENT suite is collecting, so a hook
written there registers on that current suite.

Where the current suite is a `describe`, this is already handled: `hookBodies`
(`tests/mutation/source/premiseScan.ts:1834`) prunes only the nested registration's BODY and walks
its other positions. Its own comment states the reason:
"a hook written there registers on US and runs for our other tests".

Where the current suite is the FILE suite there is no such collection step. The only file-scope hook
reader is the `topLevelHooks` loop inside `classifyTests` (`tests/mutation/source/premiseScan.ts:1752`), and it accepts a hook **only as
a direct expression statement of the SourceFile**:

```ts
for (const st of facts.sf.statements) {
  if (!ts.isExpressionStatement(st)) continue;
  const call = st.expression;
  if (!ts.isCallExpression(call)) continue;
  const callee = call.expression;
  if (ts.isIdentifier(callee) && HOOK_REGISTRARS.test(callee.text) && call.arguments[0])
    topLevelHooks.push(call.arguments[0]);
}
```

A hook in an eager ARGUMENT is not a statement, so it is never pushed, never attached, and every
test in the file reads free while it runs for them.

**Bracketed:** the filing arc measured this identically on `origin/main` and on its own branch, so
the shape is PRE-EXISTING and that arc neither causes nor widens it.

That arc's prose puts its constructed sweep at 84 cases:
"nine `describe` spellings, plus `.each`, `.for` and `.concurrent.each` producers, crossed with all four hook registrars".
**That number is
prose with no command beside it, and re-deriving it refutes it.** §5.1 has the derivation and the
consequence: the registration-spelling axis is not nine, and it is not any finite number.

### 2.2 A registration whose suite body is not an inline function

`hookBodies` collects hooks **lexically** inside a registration. Vitest also accepts a named factory
— `describe("A", suiteA)` where `suiteA` is a module-scope arrow, function expression or declaration
— and invokes it with that suite current.

`isSuiteBody` (`tests/mutation/source/premiseScan.ts:1891`) decides which argument IS the body, and its accept-set is closed by
TypeScript's outer-expression grammar: after unwrapping `( )`, `as`, `satisfies`, `!`, a type
assertion and `ExpressionWithTypeArguments`, the node must be an `ArrowFunction` or a
`FunctionExpression`. **An identifier is not**, correctly — it is not an inline function. The
consequence is that the factory's body is never walked, while the tests written inside that factory
ARE reached by the outer walk over the SourceFile and classified without its hooks.

**Bracketed:** identical on `origin/main` and on the filing arc's branch. Also PRE-EXISTING.

### 2.3 Why the two ship together

Both are the same class — a hook that genuinely runs is never attached, and a sibling reads
`environment-free` while it runs for that sibling — and both name the same honest alternative:
report rather than pass clean. **Resolve-versus-report is ONE decision.** Split across two PRs it
can be answered two different ways on one surface, which is worse than a slightly larger diff.

---

## 3. Design

The scanner already has a channel for "I found something I cannot resolve", and it is used rather
than extended. `classifyTests` collects `fileReports` from `facts.moduleReports` (`tests/mutation/source/premiseScan.ts:1665`), merges
them into every test's `reasons`, and demotes on the existing precedence rule (`tests/mutation/source/premiseScan.ts:1725`, the `ownUnresolved` branch):

```ts
if (ownUnresolved.length > 0) verdict = "unclassifiable";
else if (verdict === "environment-free" && reasons.length > 0) verdict = "unclassifiable";
```

That precedence is exactly right for both shapes and needs no change: an `environment-free` test in
an affected file becomes `unclassifiable`, and an `environment-touching` test **stays**
`environment-touching`. A proven environment reach is a stronger statement than
"something here is unresolvable", and demoting it would be a worse report rather than a safer one.

**So the whole repair is two new PRODUCERS of file-level reasons. No new precedence, no new
resolution, no new traversal.**

### 3.1 Producer A — a hook in an eager argument position the scanner does not attach

Detect a hook-registrar call sitting in an EAGER position of a registration that is not lexically
inside an inline suite body, and emit a file-level reason naming it.

- **An eager position is EVALUATED, and a nested function body in one is NOT.** A hook written
  inside a function VALUE sitting in an eager position — `describe.each([() => { beforeEach(…) }])` —
  is never invoked while Vitest collects, so reporting it attributes a hook that does not run. The
  walk therefore stops at every FUNCTION-LIKE node, using TypeScript's own `ts.isFunctionLike`
  predicate rather than a hand-listed set of kinds — a method, a getter, an accessor and a
  constructor are all containers Vitest does not invoke while collecting, and an enumeration of node
  kinds is a list to be completed one kind per review round. Spec review r3 finding 1 arrived as an
  arrow and r4 finding 2 as a `MethodDeclaration`, which is the enumeration failing exactly once
  before it was replaced. A hook written DIRECTLY in the datum, `describe.each([beforeEach(…)])`,
  still reports.
- **Eager positions** are the ones `hookBodies` already treats as eager for the nested case: the
  arguments of a curried callee (`ts.isCallExpression(call.expression)` → `call.expression.arguments`),
  and every argument for which `isSuiteBody` is false. The two readers agree on WHICH POSITIONS are
  eager, and an earlier draft went further and claimed they cannot disagree at all. **That was
  refuted.** `hookBodies` carries no function-like stop, so it also attaches a hook written inside a
  DEFERRED datum — `describe.each([() => { beforeEach(…) }])` inside an inline describe classifies
  `environment-touching` — while this producer declines to report there. Bracketed on both trees, that
  behaviour is IDENTICAL on `origin/main` and under this change, so it is pre-existing rather than
  introduced here, and `hookBodies` is fenced from edit by §3.3. The producers are the NARROWER of
  the two readers, deliberately: this one reports only what the runner evaluates.
- **Which registrations.** Only those NOT lexically inside an inline suite body, and only those the
  runner EVALUATES. Where the parent is an inline `describe` body, `hookBodies` already walks the
  nested registration's eager positions and attaches the hook correctly, so reporting there would be
  a false advisory on the single most common shape in the corpus. And a registration sitting inside a
  function value Vitest never invokes — a `.each` datum, an uncalled helper — registers nothing at
  all, so naming a hook there is an attribution to a hook that does not run (diff review r1 finding
  2). A SUITE BODY is the exception that makes this more than "stop at every function": Vitest DOES
  invoke it, with that suite current. Both producers share ONE walker that carries these two facts,
  because the finding was a traversal gap and independent traversals are how only one of them came to
  carry the boundary.
- **Recognized by the same predicates the scanner already ships.** `registrarRoot` answers
  "is this a registration", `isSuiteBody` answers "is this the body", and `HOOK_REGISTRARS`
  answers "is this a hook". No second matcher is introduced. The comment at
  `tests/mutation/source/premiseScan.ts:1837` states why:
  "two matchers where the design assumes one can drift apart silently".

**The reason does NOT claim a scope, and an earlier draft's claim that it did was wrong.** Lexical
position is not semantic suite scope: a registration written inside a module-scope factory is
lexically outside every inline body, yet Vitest invokes that factory with ITS suite current
(the installed `@vitest/runner` 4.1.5 runs a suite factory under `runWithSuite`, so a hook the
factory registers lands on that collector), so the hook attaches to that suite, not to the file
suite. The scanner cannot tell the two apart without
the resolution R1 declines — so the reason names the CONSTRUCT and states that the suite is
undetermined, which is a claim it can support. The demote is file-level and conservative, per L2.

Reason wording, following the house form (a lowercase phrase carrying its module, as
`withModule` at `tests/mutation/source/premiseScan.ts:1528` produces):

```
hook <name> at line <n> is registered from an eager argument position, so the suite it attaches to cannot be determined, in <path>
```

### 3.2 Producer B — a registration carrying a factory-slot argument the scanner cannot follow

**The rule is keyed on the FACTORY SLOTS, not on "any argument".** Vitest's own declaration is the
authority, and it supplies exactly one fact this rule needs — where the factory can be:

```
interface SuiteCollectorCallable<ExtraContext = object> {
  <T>(name: string | Function, fn?: SuiteFactory<T>, options?: number): SuiteCollector<T>;
  <T>(name: string | Function, options: SuiteOptions, fn?: SuiteFactory<T>): SuiteCollector<T>;
}
```

Quoted from the installed `@vitest/runner` 4.1.5 type declarations, `SuiteCollectorCallable`. It is
not cited by path because `node_modules` is untracked; the durable anchor is the interface name plus
the pinned version, and `pnpm why vitest` reports the version in force.

Two consequences, both load-bearing and both learned from probes rather than assumed:

- **`name` may itself be a `Function`.** So a body test ranging over EVERY argument is satisfiable
  by the NAME — `describe(function titledSuite() {}, suiteA)` has a locatable "body" that is not the
  body, and the real factory `suiteA` goes unreported. Slot 0 is always `name`, so the rule ranges
  over indices **≥ 1** only.
- **The factory is OPTIONAL in both overloads.** So `describe("A", { skip: true })` is a legal
  bodyless registration, and a rule that reports whenever no argument is a body emits a reason for a
  body that does not exist — a wrong attribution, which the consequence bound forbids.

**The rule applies to a `describe` root only.** `suite` is a Vitest alias of `describe` — they are
the same function object — but the shipped `REGISTRARS` is `["it", "test", "describe"]` and matches
on the identifier TEXT, so `registrarRoot` returns `null` for a `suite(…)` registration and neither
producer ever sees it. Claiming `suite` here would be a positive claim the frozen accept-set
contradicts; it is a documented limit at §4 L3 instead. Spec review r3 finding 3. An `it`/`test`
registration cannot carry a suite factory, and its handler is not lost either way: a test's extent is
the whole call expression, so the traversal already resolves a named handler to its declaration and
reaches through it. Bracketed against the shipped baseline, `test("named", testFn)` with a spawning
`testFn` classifies `environment-touching` on `origin/main` — the body IS analysed. Reporting there
would be both a wrong attribution (naming a suite factory that cannot exist) and a false advisory on
the ordinary extraction of an inline test callback. Spec review r2 finding 2.

**The rule, an accept-set with the complement default-denied.** Among the arguments at index ≥ 1,
ACCEPT if one is a locatable inline body (`isSuiteBody`, whose accept-set is already closed by
TypeScript's outer-expression grammar), or if EVERY one is an inert literal — a string, numeric,
object, array, `true` or `false` literal. Otherwise the registration carries a reference this
scanner cannot follow in a slot that could hold the factory, and it reports.

It is deliberately NOT keyed on "the argument is an identifier". An identifier is the shape the
ledger rows name, but a property access, an element access and a call are equally unfollowable, and
a rule keyed on the identifier spelling is a denylist that accepts whatever it did not model.

The report is per REGISTRATION, not per argument. `test("name", fn, WALK_TIMEOUT_MS)` — an inline
body plus a named timeout constant — is a single registration whose factory IS located, so it is
silent. That shape is live in the corpus (`tests/cross-cutting/psqlStartupFileSuppression.test.ts`,
the `"the walk is not vacuous"` registration), and a per-argument rule reported it, which §3.4
records as a measured regression rather than a hypothetical.

The reason is FILE-scoped and that **is an over-report** — see limit L2. Its live cost is zero
(§1.1), and the direction is the one the consequence bound permits.

```
the registration at line <n> has no inline suite body and carries an argument this scanner cannot follow, so if that argument is the suite factory its hooks cannot be located, in <path>
```

### 3.3 What is deliberately NOT built

- No identifier resolution to a declaration, for either producer.
- No change to `MODIFIERS`, `HOOK_REGISTRARS`, `REGISTRARS`, `registrarRoot` or `isSuiteBody`.
- No change to the precedence rule, to `hookBodies`, or to the nested-describe behaviour the filing
  arc shipped.
- No new verdict. `unclassifiable` already exists and already means this.

### 3.4 The design is validated empirically, not argued

A ~40-line prototype of both producers was spliced into a copy of `premiseScan.ts` in a SEPARATE
worktree — separate because a reviewer was live against this one, and a transient mutation under a
live read is a contaminated review. It is not the shipped implementation; it exists so that the
question "does this design produce the intended verdicts" is answered by measurement before a
reviewer is asked it.

Every constructed case behaves as specified, including the three that would otherwise cost rounds:
an ordinary nested `describe` carrying a hook does NOT report; a provably `environment-touching`
test KEEPS its verdict in an affected file rather than being demoted; and an inline body reached
through the transparent wrappers `isSuiteBody` already accepts is not mistaken for an unlocatable
one. The three constructs spec review r1 raised — a function-valued name hiding a factory, a
bodyless options registration, and an eager hook inside a named factory — all behave correctly under
the repaired rules above.

**And the live corpus is untouched under the prototype — checked STRUCTURALLY, not lexically:**

```
$ pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-21-premisescan-hook-population/record-diff.mts
POSITIVE CONTROL: perturbing one record moves 1 (expected 1)
baseline ref             : origin/main
suites                   : 70
records: baseline 2648, live 2648
records only in baseline : 0
records only in live     : 0
VERDICT moved            : 0
DETAIL moved             : 0
```

**That transcript is the COMMITTED script's own output.** An earlier draft of this section quoted a
positive-control line the committed script could not emit, because the control lived in the scratch
prototype and the committed version had replaced it with the byte-identity abort — spec review r3
finding 5, and the same false-quotation class as r2 finding 3. The control now lives in the committed
script and is quoted from a real run of it.

Every classified row across every enrolled suite is dumped as the tuple
`(suite, line, testName, verdict, detail)` under the SHIPPED baseline and under the prototype, and
the two are diffed as SETS. **Detail strings are compared for equality between the two runs, never
against known reason strings**, so a change in reason wording cannot blind the check. The positive
control classifies one constructed named-factory file both ways inside the same invocation and
requires the records to disagree; the script throws rather than reporting clean if they do not.

**The baseline side is verified too**, since a contaminated baseline makes a zero meaningless in the
direction that looks clean:

```
$ git rev-parse origin/main:tests/mutation/source/premiseScan.ts
8289f7291a03098c6ad6e53d35d33699172a1c72
$ git rev-parse HEAD:tests/mutation/source/premiseScan.ts
8289f7291a03098c6ad6e53d35d33699172a1c72
$ git log --oneline origin/main..HEAD -- tests/mutation/source/premiseScan.ts | wc -l
0
```

The baseline module is the SHIPPED state, not this branch's partly-repaired one.

**Two weaker checks were tried first, and the reason they are recorded rather than replaced quietly
is the methodological point.** Each was blind in a way the other could not cover, and the pair read
as belt-and-braces while the braces were cut:

| check | covers | blind to |
| --- | --- | --- |
| verdict-count comparison (2648 / 74 / 1) | a construct that moves any verdict | a reason attached to an `environment-touching` test — **no count moves**, which is exactly the r1 finding-2 shape |
| regex over `detail` for the known reason strings | that gap, and only that gap | the one run where a repair changes the wording, which is the only run being asked about |

So finding-2's class had exactly ONE covering check, and that check was the one carrying the wording
defect. **A union of checks is a cover only if you can name which check covers which class.** An
unnamed mapping hides the classes with a single covering check; those drop to zero coverage silently
while the other check still reports green, and the green is what makes it convincing. The record
diff has neither blind spot, and it needs no knowledge of what the wording IS.

Both halves of the consequence bound are therefore MEASURED: every constructed instance reports, and
there are **zero false advisories on the live corpus**.

**Both scripts are committed and both are PROVEN IN BOTH DIRECTIONS**, which is what makes their
zeros mean anything. `record-diff.mts` ABORTS with exit 2 when the working tree's `premiseScan.ts` is
byte-identical to the baseline ref, because there a perfect zero would be the baseline compared
against itself — the answer the author is hoping for, produced by a check with nothing to measure.
Run on this branch it aborts; run where the change exists it reports the figures above and exits 0.
`cell-check.mts` exits 1 on `origin/main` with **7 of 16** — the nine reporting cells fail because
neither producer exists yet, and they fail for the ASSERTED reason (a cell that emits no reason)
rather than for a collection or import error — and exits 0 with **16 of 16** where the change exists.

Its positive control is structural rather than fixture-based: it perturbs one record of the baseline
set and requires the identical comparison to report exactly one move. A control built from a
constructed fixture goes silent whenever the change under test happens not to touch that fixture's
construct, and a silent control is indistinguishable from a working one.

**All sixteen §5.2 cells are probed, not asserted:**

```
$ pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-21-premisescan-hook-population/cell-check.mts
--- nine cells that must REPORT   (bare identifier, function declaration, property
    access, wrapped identifier ×2, call expression, function-valued name,
    factory-in-slot-1-with-timeout, literal-options-then-factory)          all PASS
--- seven cells that must stay SILENT  (bodyless options, inline body + named
    timeout constant, named options + inline body, named constant as the NAME,
    it/test root, deferred hook in a function-valued .each datum, deferred hook
    in a method-shorthand datum)                                          all PASS
16 of 16 cells behave as the spec's table claims
```

**One measured regression is recorded here rather than smoothed over**, because it is the whole
argument for §3.2's per-registration shape. An intermediate per-ARGUMENT rule took the corpus from
1 `unclassifiable` to **398** — a single live registration, `test("…", fn, WALK_TIMEOUT_MS)`, whose
named timeout constant is not an inert literal. The first detector run reported "0 new reasons"
anyway, because that detector was keyed on the PREVIOUS reason wording; re-keying it to the current
wording is what surfaced the 398. Two lessons kept: a rule about factories must range over the
factory slots only, and a checker keyed on text a repair just changed reports a confident zero about
nothing.

### 3.5 The rejected alternative, with the number that rejected it

A simpler rule was tried first and is recorded here because a reviewer who cannot see this number may
reasonably ask why it was not taken: **report per ARGUMENT — any argument at index ≥ 1 that is
neither a locatable inline body nor an inert literal.**

It is wrong, and the corpus says so immediately:

```
per-ARGUMENT rule:      suites 70  classified 2648  env-touching 74  unclassifiable 398
per-REGISTRATION rule:  suites 70  classified 2648  env-touching 74  unclassifiable 1
```

**1 to 398**, from ONE ordinary live registration —
the registration whose title begins `"the walk is not vacuous"`, of the shape
`test(<title>, () => {…}, WALK_TIMEOUT_MS)`, in
`tests/cross-cutting/psqlStartupFileSuppression.test.ts`. Its named timeout constant is not an inert
literal, so a per-argument rule reports it; its factory IS located, so a per-registration rule does
not. One false advisory in a 400-test file demotes every `environment-free` test in that file.

The lesson kept in the design: a rule about the FACTORY must range over the factory slots and answer
once per registration. Asking the question per argument answers a different question — "is every
argument followable" — which no part of this spec needs.

### 3.6 Both accept-sets are DERIVED from the shipped surface, not modelled

This spec and its sequential PR 2 apply one principle in two places, and naming it is what makes the
design read as principled rather than as two ad-hoc rules:

- **PR 2** derives `MODIFIERS` and `HOOK_REGISTRARS` from the installed Vitest package's own exports,
  because a hand-maintained list drifts from the surface it restates and completing it by hand does
  not terminate.
- **§3.2 here** takes from Vitest's shipped `SuiteCollectorCallable` declaration exactly one fact —
  **slot 0 is always `name`** — and builds the accept-set on it. No model of the overload set is
  constructed, nothing is keyed on an identifier spelling, and the complement is default-denied.

The distinction that matters: a FACT the shipped surface states is a durable input; a MODEL of that
surface built by hand is a second definition that can drift from the first without either being
obviously wrong. §5.5 records this arc's own paperwork drifting by the same mechanism.

### 3.7 The claim population is DERIVED, and the check set is CLOSED

Two sweeps on this arc reported clean over the wrong population — the second after the first had
already been corrected. **A table is a convenient population, not a correct one**: its rows are
already written down and already shaped like a checklist, so a sweep gravitates to them, and a clean
result over the wrong population is indistinguishable from a clean result over the right one.

The population is therefore read out of this document rather than typed in. `claims-check.mts`
derives §4's limit-row ids from the spec and asserts `limits-check.mts` probes exactly that set, and
extracts every fenced `$ …` command naming a probe script and asserts the file exists — which is spec
review r2 finding 3's class made mechanical. Proven in both directions: against a constructed
unprobed limit row and a constructed missing script it reports both and exits 1; restored, it exits
0. It aborts with exit 2 if either selector matches nothing, because a selector that no longer
matches the document reports a confident zero.

**The check set is CLOSED, and saying so is what stops it ratcheting.** Four checks, each added for a
measured reason, is exactly how a guard suite grows one member per round:

> **Coverage is COMPLETE when every claim-site class has a derived cover AND the map itself is
> derived from the document's own declarations.** A new claim then REDS automatically and no further
> check is owed.

| claim-site class | derived cover | how its population is derived |
| --- | --- | --- |
| §4 documented limits | `limits-check.mts` | ids read out of §4 by `claims-check.mts` |
| §5.2 reporting and silent cells | `cell-check.mts` | pins its own count, exits 2 when it diverges from the table |
| corpus neutrality | `record-diff.mts` | every enrolled suite from `GUARD_SURFACES.flatMap(s => s.suitePaths)`; aborts when there is nothing to measure |
| this spec's executable citations | `claims-check.mts` part B | fenced commands EXTRACTED from the spec |

**§3.7 bounds the CHECK set. The CELL set is bounded by the RULE**, in two derived parts: one cell
per (decision input × distinguishable outcome) of §3.1 and §3.2, and one cell per NAMED WEAKER
IMPLEMENTATION in §5.2's kill-target column. Every cell declares which it exists for, and the
declaration is a closed union, so **a cell that names neither does not compile** — the unmapped case
is unrepresentable rather than merely checked. Derived and printed by `cell-check.mts`:

```
cell budget, derived: 9 decision-input cells (over 5 distinct inputs)
                    + 8 weaker-implementation cells (over 7 distinct implementations) = 17
```

Note the units: **9 and 8 are CELL counts and sum to the total; 5 and 7 are DISTINCT-reason counts
and do not.** Both render as bare numbers in prose, which is exactly how a reader lands on 5 + 7 = 12
and files a finding against arithmetic that was never wrong. `claims-check.mts` part C asserts the
total this spec declares against the total `cell-check.mts` actually pins, across the two files.

**The consequence is that the corpus has NO INDEPENDENT GROWTH CHANNEL.** It can only grow when the
RULE gains a decision input or a named weaker implementation — and rule changes are what the round
cap and the fence already govern. So fencing the rule fences the corpus for free, with no second
mechanism, which is a stronger bound than any cap on cell count. The honest residue: a future finding
naming a NEW decision input would grow it, but that IS a rule change, and rule changes are governed.

A fifth check is owed only if a new claim-site CLASS appears — never because a further instance is
imagined inside a class already covered. An instance found inside a covered class is a defect in THAT
COVER, and the repair is to fix the cover rather than add a sibling beside it. Same rule §5.4 states
for the spelling axis, applied to the guard suite itself.

---

## 4. Documented limits

| id | limit | why it is a limit and not a defect |
| --- | --- | --- |
| **L1** | A test that this change moves is reported `unclassifiable` rather than proven `environment-touching`. The limit is narrower than it sounds: it applies ONLY to tests OUTSIDE the registration carrying the hook. A test NESTED inside that registration is unaffected — `hookBodies` already collects the eager hook for it and proves it touching, and this change does not disturb that. | Bracketed on both trees rather than asserted: `describe(String(beforeEach(spawn)), () => { it("nested") }); it("sibling")` gives `nested=environment-touching, sibling=environment-free` on `origin/main` and `nested=environment-touching, sibling=unclassifiable` under this change. The sibling's `environment-free` IS the silent free being closed; the nested test's proven verdict is untouched. So the report replaces a WRONG answer, not a right one, and the conservative direction is taken only where the scanner genuinely cannot decide. An earlier draft of this row said the hook is "REPORTED, never attached", which is false for the nested case; the arc's own limits re-analysis caught it. |
| **L2** | BOTH reports are FILE-scoped, so each demotes `environment-free` tests in the file that the reported construct could not have affected. | Narrowing either needs the resolution R1 declines. Measured live cost: zero registrations, so zero tests, confirmed under a working prototype in §3.4. An over-report with a named cause is a documented limit; a silent free is not. |
| **L3** | Neither producer fires on a registration the shipped `registrarRoot` does not recognize. `MODIFIERS` is incomplete on Vitest 4.1.5 — `test.skipIf(...)` is invisible to it, one live instance in `tests/cross-cutting/psqlStartupFileSuppression.test.ts`. | That is `BL-PREMISESCAN-REGISTRAR-ACCEPT-SETS-HAND-MAINTAINED`'s subject and ships in the sequential PR 2. Fixing it here would fold two decisions into one recognizer, which is the bigger target. |
| **L4** | **A hook registered by a CALLED HELPER is invisible, at every position.** `describe(registerHook(), …)`, where `registerHook()` registers a `beforeEach` and returns a name, is classified `environment-free`. Neither producer fires, because both key on a syntactic `HOOK_REGISTRARS` call and there is none. | **PRE-EXISTING and UNIFORM, bracketed against the shipped baseline rather than asserted.** The same helper is equally invisible inside an inline `describe` body and as a plain file-scope statement — all three classify `environment-free` identically on `origin/main` and under this change. It is `hookBodies`' and the top-level seed's existing LEXICAL contract, which this change neither causes nor widens, and it is the same disposition the filing arc applied to its own four pre-existing gaps. Closing it means following hook registration through a call, which is the resolution R1 declines. Raised as spec review r2 finding 1, whose substance was right and whose attribution to this design was not. |
| **L5** | Producer B reports a registration whose only non-inert factory-slot argument is in fact OPTIONS rather than a factory — `describe("A", opts, () => {})` is silent because slot 2 is a body, but `describe("A", opts)` reports. | The scanner cannot tell a named options object from a named factory without resolution. The reason says "if that argument is the suite factory", so the report is correctly attributed rather than overclaiming, and the worst case is a conservative demote with a named cause. Zero live instances. |
| **L6** | A `suite(…)` registration is never recognized, so a named factory passed to it stays silently free. `suite` IS `describe` at runtime, but `REGISTRARS` matches identifier TEXT. | Bracketed: `suite("A", f)` classifies `environment-free` on `origin/main` AND under this change, so it is neither caused nor widened here. Adding `suite` means editing `REGISTRARS`, which is `BL-PREMISESCAN-REGISTRAR-ACCEPT-SETS-HAND-MAINTAINED`'s subject and belongs to the sequential PR 2. Spec review r3 finding 3. |
| **L7** | **This scanner does not fold constants.** A hook in a statically DEAD operand — `describe(String(false && beforeEach(…)), …)`, an unselected `?:` arm, a logical-assignment or optional-call argument — is REPORTED, though it can never run. | The scanner cannot tell `false &&` from `someFlag &&`, and going silent on the second is a silent free, the direction the bound forbids. So it reports on both, and the REASON is worded so the report is not a false claim: it says the hook OCCUPIES an eager position and that whether it registers cannot be determined, rather than asserting it is registered. Diff review r1 finding 1, where the old wording made this a wrong attribution rather than a conservative report. Probed by `limits-check.mts` in both halves, the negative one being load-bearing. |

---

## 5. The fixture corpus, and why it is not a cross-product

### 5.1 The registration-spelling axis is INFINITE, so no enumeration over it is complete

A guard for a shape with zero live instances is a guard whose corpus contains zero instances of that
shape, so a green suite over it is evidence about coverage and nothing about correctness. The fix is
a corpus complete **by construction** at round 1 rather than complete by exhaustion at round N. The
obvious way to get one is to commit the filing arc's cross-product. **Re-deriving that
cross-product shows it cannot be committed, because the axis it crosses over is unbounded.**

```
$ pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-21-premisescan-hook-population/probe-chains.mts
shipped MODIFIERS (7): each, for, skip, only, concurrent, sequential, todo
DEPTH 1 ONLY: spellings 8, curried 2, pairs 18, cross-product 72
LIVE chains on vitest 4.1.5 that the shipped registrarRoot accepts: 43
spellings 43, of which curried 12
(form x eager position) pairs = 43 + 43 + 12 = 98
PRODUCER A cross-product = 98 x 4 hook registrars = 392

$ pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-21-premisescan-hook-population/probe-chain-depth.mts
describe.concurrent  -> function
describe.concurrent.concurrent  -> function
describe.concurrent.concurrent.concurrent  -> function
describe.concurrent.concurrent.concurrent.concurrent  -> function
describe.concurrent.concurrent.concurrent.concurrent.concurrent.concurrent  -> function
describe.skip.only.each -> function
describe.each.each      -> undefined
```

Vitest 4.1.5's modifier object is **self-similar**: every chainable modifier returns an object
carrying the same modifiers, so `describe.concurrent.concurrent.concurrent…` resolves at any depth
and `registrarRoot`'s peel loop accepts all of it. Completed at depth 1 the cross-product is **72**;
at depth 2 it is **392**; at depth N it is unbounded. The arc's 84 sits between the two because its
nine spellings mix depths — eight depth-1 forms plus `describe.concurrent.each`, which is depth 2.
**Every finite cut through an infinite axis is arbitrary, 84 and 392 alike.** A corpus that samples
such an axis and calls itself complete is the enumerated cover AGENTS.md's class-sweep rule forbids,
one level up from the code.

The one bound the probe DOES establish: `describe.each.each` is `undefined`, so a curried modifier
**terminates** the chain. Curried is a terminal position, not a further axis.

### 5.2 Cross the axes the rule READS; prove independence of the axis it does not

The two producers in §3 read exactly two things: **which argument position** a hook sits in, and
**whether a call is a hook registrar**. Neither reads the registration spelling — the spelling is
consumed entirely by `registrarRoot`, which returns a root string and nothing else, and which this
change does not touch.

So the corpus crosses the axes the rule reads, completely, and proves the rule INDIFFERENT to the
axis it does not read rather than sampling it:

| axis | members | status |
| --- | --- | --- |
| eager position | name argument, options argument, curried producer argument | **crossed completely** — 3 |
| hook registrar | `beforeEach`, `beforeAll`, `afterEach`, `afterAll` — the whole of `HOOK_REGISTRARS` (`tests/mutation/source/premiseScan.ts:66`) | **crossed completely** — 4 |
| registration spelling | unbounded (§5.1) | **NOT crossed.** Proved independent at one fixed cell over the four structurally distinct classes: bare `describe`, depth-1 plain (`describe.skip`), depth-1 curried (`describe.each`), depth-2 ending curried (`describe.concurrent.each`). |

**Producer A: 3 × 4 = 12 producer-A cells, complete over what the rule reads**, plus 4
spelling-independence cells, plus one negative twin per cell.

Producer B reads one thing: whether the arguments at index ≥ 1 clear the §3.2 accept-set. That
accept-set is closed; its COMPLEMENT is open, so the corpus is keyed on structural classes rather
than spellings.

**Every row below is an ANTI-TAUTOLOGY DEVICE and names the two implementations it separates**, so
its discriminating power is written down and cannot be quietly weakened later. A fixture whose
kill target is recorded is a fixture a later edit cannot silently defang.

| case | REPORTS under | falls SILENT under | so it kills |
| --- | --- | --- | --- |
| bare identifier — `describe("A", suiteA)` | the specified rule | nothing; every candidate reports | the baseline shape both ledger rows name |
| identifier declared as a `function` declaration | the specified rule | an implementation keying on the DECLARATION's form | a rule that accepts only arrow-initialized factories |
| property access — `describe("A", suites.a)` | the specified rule | an identifier denylist | a rule keyed on the identifier spelling |
| **wrapped identifier — `describe("A", (suiteA))`, `describe("A", suiteA as never)`** | an implementation reading `isSuiteBody`'s RESULT | an implementation reading the RAW argument node kind (`ts.isIdentifier(arg)`), which sees a `ParenthesizedExpression` / `AsExpression`, decides "not an identifier", and falls silent where a report is owed | the raw-node-kind reading — the fail-open direction |
| call expression — `describe("A", makeSuite())` | the specified rule | a rule requiring a BINDING | a rule that only follows named references |
| **function-valued NAME — `describe(function titledSuite() {}, suiteA)`** | a rule ranging over index ≥ 1 only | a rule whose body test ranges over EVERY argument, where the NAME satisfies it and the real factory goes unreported | the any-argument reading — spec review r1 finding 1, and the defect it demonstrated |
| **factory in slot 1 with a trailing timeout — `describe("A", f, 5000)`** | a rule examining EVERY factory slot | a LAST-SLOT-ONLY rule, which sees the numeric timeout, accepts it as inert, and misses the factory | the last-slot-only reading — spec review r3 finding 2 |
| **literal options in slot 1, factory in slot 2 — `describe("A", { concurrent: true }, f)`** | a rule examining EVERY factory slot | a FIRST-SLOT-ONLY rule, which sees the object literal, accepts it as inert, and misses the factory | the first-slot-only reading — the same finding's other half |

**Negative cases, which the same corpus must keep SILENT.** Each is one ordinary edit from a
reporting case, so a rule that reports on them is over-firing on live authoring:

| case | why it must stay silent |
| --- | --- |
| `describe("A", { skip: true })` | the factory is OPTIONAL in both overloads, so this is a legal bodyless registration and a reason naming its body would be a wrong attribution |
| `test("name", fn, WALK_TIMEOUT_MS)` | an inline body plus a named timeout constant. Live in the corpus; an intermediate per-ARGUMENT rule reported it and took the corpus from 1 `unclassifiable` to 398 (§3.4) |
| `describe("A", opts, () => {})` | slot 2 is an inline body, so the factory IS located whatever `opts` is |
| `describe(NAME_CONST, () => {})` | slot 0 is the name and is never examined |
| `test("named", testFn)` | an `it`/`test` root cannot carry a suite factory, and the traversal already reaches a named handler — spec review r2 finding 2 |
| `describe.each([() => { beforeEach(…) }])(…)` | the hook sits inside a function VALUE in an eager position; Vitest never invokes it while collecting, so reporting it would attribute a hook that does not run — spec review r3 finding 1 |
| `describe.each([{ setup() { beforeEach(…) } }])(…)` | ONE cell for the whole function-like class. `ts.isFunctionLike` covers methods, getters, accessors and constructors together, so a cell per node kind would be the enumeration that predicate deleted — spec review r4 finding 2 |
| `describe.each([() => { describe(String(beforeEach(…)), …) }])(…)` | a REGISTRATION nested inside a deferred datum. The function-like boundary existed only inside the hook collector, so the outer walk crossed the datum to reach this registration and reported there — diff review r1 finding 2 |

**Nine reporting cells and eight silent cells — 17 in total, pinned by `cell-check.mts`, which exits
2 if that count ever diverges from this table.** Seven of the seventeen exist because a review found
the defect they now hold fixed, and a finding that became a fixture cannot recur silently.

### 5.3 The sampling rule, stated once

**Cross every axis the rule under test reads. For an axis it does not read, commit an independence
proof over the structurally distinct classes instead of a sample.**

### 5.4 The repair direction for an independence failure — the terminating clause

**If a later finding shows a spelling the rule is NOT indifferent to, the repair is to make the rule
indifferent. It is never to add that spelling as a case.**

This has its own heading because it is the terminating answer to the recognizer ratchet, and a
methodology paragraph is where it would go unread. The measured failure mode on this repository is a
recognizer that grows one grammar corner per round, each widening a bigger target for the next: 20
diff rounds with a flat finding rate on one arc, 41 on another. Adding the offending spelling as a
case is that ratchet's first step, and it re-opens an axis §5.1 proves is infinite — one member at a
time, forever.

The move that terminates is not a better enumeration. It is proving the rule does not read the axis
at all.

### 5.5 A number in prose is provenance, not data — including this spec's own

Three figures in this arc's own paperwork were carried as prose and were wrong or unsupported when
re-derived: the filing arc's 84, an intermediate 96 this spec briefly carried (a hand-derived
depth-mixing artifact, removed), and a "0 new reasons" reading produced by a detector keyed on
wording a repair had just changed (§3.4). Every figure in §5.1 now carries the command that produced
it, and every count in this document is derived rather than recalled.

That parallel is an argument FOR the design rather than an embarrassment about the paperwork. **This
arc's subject IS a hand-maintained set drifting from a derived one** — `MODIFIERS` and
`HOOK_REGISTRARS` restating a surface instead of reading it — and the arc's own documentation
drifted by the identical mechanism at the identical rate. A list maintained by hand goes stale
whether it lives in a source file or a sentence.

---

## 6. Acceptance criteria

Every row names the executable step that proves it and the channel the proof arrives on. A green
suite is not a proof for AC-7, AC-8 or AC-9 — those name their own field checks.

| id | claim | proved by |
| --- | --- | --- |
| **AC-1** | For **every one of the 12** (eager position × hook registrar) cells, a hook in that position of a registration outside every inline suite body makes every `environment-free` test in that file `unclassifiable`, with a reason naming the hook and its line — and NOT naming a suite, per R2. | Generated fixtures in `tests/mutation/source/premiseScan.test.ts` driven from two declared axis arrays, asserting verdict AND reason text. Every case is expect-a-REPORT, never expect-clean. |
| **AC-2** | The generated case count EQUALS the product of the declared axes, and the hook-registrar axis equals `HOOK_REGISTRARS`'s own members. | A count assertion derived from the arrays, plus an assertion that the registrar array is derived from the shipped `HOOK_REGISTRARS` rather than retyped. A missing axis member fails here rather than being invisible. |
| **AC-3** | The rule is INDIFFERENT to registration spelling across the four structural classes in §5.2. | Four cases at one fixed (position, registrar) cell asserting identical verdicts and reason shapes. |
| **AC-4** | For **every one of the 9 reporting cells** in §5.2, a registration carrying a factory-slot argument the scanner cannot follow makes every `environment-free` test in that file `unclassifiable`; and for **every one of the 7 silent cells**, no reason is emitted at all. `cell-check.mts` pins the total at 16 and exits 2 if the table and the script ever disagree. | Generated fixtures, same shape. Each reporting cell names the implementation it kills; the wrapped-identifier cell fails under a raw-node-kind reading and the function-valued-name cell fails under an any-argument reading. The silent cells are the over-firing half and each is one ordinary edit from a reporting cell. |
| **AC-5** | A test that is provably `environment-touching` STAYS `environment-touching` in a file affected by either producer. | Fixture pairing a touching test with an affected file, for both producers. Proves the precedence rule at `tests/mutation/source/premiseScan.ts:1725` was not inverted. |
| **AC-6** | **Negative twins, one variable each.** Identical fixture bytes MINUS the eager hook (producer A) and with the factory inlined (producer B) classify `environment-free`. | One twin per generated case, differing by exactly one thing, so a clean verdict is attributable to "examined and correctly declined" rather than to "never got here". |
| **AC-7** | **This surface's own suites contain no LIVE instance of either shape.** Every fixture is synthetic source text handed to `classifyTests` through a temp file. | An executable check over the surface's own `suitePaths` (`tests/mutation/source/registry.ts:170-172`), run in-process, asserting zero live instances. Demonstrated in BOTH directions: it fails when a live instance is constructed and passes when it is removed. |
| **AC-8** | `EXPECTED_ENV_TOUCHING` is unchanged, and `tests/mutation/source/premiseScan.test.ts` still declares 0. | `pnpm exec vitest run tests/mutation/_metaPremiseContract.test.ts --project parallel` green, PLUS a field check that the committed diff touches no line of `EXPECTED_ENV_TOUCHING` (`git diff origin/main...HEAD -- tests/mutation/_metaPremiseContract.test.ts`). A green suite alone cannot prove the second. |
| **AC-9** | The probe record's zeros still hold at HEAD. | Re-run `probe-population.mts` and `probe-decompose.mts`; the counts in §1.1 are unchanged. This is the derived cover for AC-7, replacing a hand enumeration. |
| **AC-10** | The surface's mutation score is measured at HEAD with an empty unaccepted-survivor set, at or above the registry's `scoreFloor` of `0.95`. | `pnpm mutation:guards`, foreground, with a before/after provenance pair stamped inside the measuring invocation over the DERIVED input set — source, registry row, both `suitePaths`, and their transitive local imports. |

---

## 7. The rule-21 constraint, stated as a hazard rather than a habit

`premiseScan.test.ts` is a `suitePath` of the `premiseScan` surface AND is one of the suites
`_metaPremiseContract` classifies. **A live instance of either shape written into that file would
make this surface's own suite a member of the population this spec measures at zero** — and worse,
producer B's file-level report would then demote that suite's own `environment-free` tests to
`unclassifiable`, moving a census the probe record pins.

The corpus already demonstrates the safe form: 23 hook-registrar names occur inside
`premiseScan.test.ts` as STRING literals (the reconciliation in the probe record, §2.3) and exactly
1 as a live call. Two of those strings are already the file-scope eager construct. Fixtures are
source TEXT, and AC-7 asserts it executably rather than trusting the convention.

---

## 8. What this change does NOT touch

- **`BL-PREMISESCAN-REGISTRAR-ACCEPT-SETS-HAND-MAINTAINED`** — untouched. `MODIFIERS` and
  `HOOK_REGISTRARS` keep their `origin/main` bytes. Ships as the sequential PR 2, which carries the
  LIVE fix (one enrolled test uncensused today) where this PR is prospective.
- **`BL-PREMISESCAN-ALIAS-SLICE-UNCOVERED` (`BACKLOG.md:125`)** — a peer `accepted-gap` row on this
  surface, not closed here. This change adds no `@/` specifier handling and removes none, so the
  row's subject is untouched. Its acceptance premise is nonetheless RE-DERIVED rather than inherited
  at AC-10: an existing `equivalent` or `accepted-gap` row can stop being true once reachability
  widens, and this change widens which files produce reasons.
- **The nested-describe behaviour** the filing arc shipped in PR #853.

---

## 9. Convergence criterion

- **Consequence bound.** Every construct is **correct or signaled, never silently wrong**: it is
  classified correctly, or it reports `unclassifiable`. The two forbidden directions are **false
  certification** (a test told it is `environment-free` while a hook reaches the environment for it)
  and **wrong attribution** (a reason naming a construct that is not there, or claiming a scope the
  scanner cannot establish). A conservative `unclassifiable` with a named cause — including the
  file-scoped over-reports at L2 and L5 — is a DOCUMENTED LIMIT, not a finding. Usefulness is not
  the criterion; correct attribution is.
- **`PROBE DOMAIN:`** the live tracked test corpus `premiseScan` walks — the suites derived from
  `GUARD_SURFACES.flatMap((s) => s.suitePaths)` — the three population probes committed at
  `docs/superpowers/specs/ci/probes/2026-08-21-premisescan-hook-population/`, the installed
  `@vitest/runner` 4.1.5 declarations, the filing arc's constructed sweep (whose 84 is corrected in
  §5.1), and the two bracketed differentials quoted in the ledger rows. A constructed input more
  than one ordinary edit from that set files to §4, not to a round.
- **Threat fence.** Ordinary repository-local refactors by a contributor — extracting an inline
  callback to a named constant is routine authoring, not obfuscation. Adversarial module graphs are
  out of scope and file to §4.
- **Score.** `MUTATION SCORE: <k>/<t>` plus "0 unaccepted survivors" on the `GUARD SURFACE:` line of
  the round-1 `--stage diff` brief; `pnpm mutation:guards` run BEFORE the first diff dispatch.
