# premiseScan reports the two hook-attachment shapes it cannot follow

**Status:** DRAFT · **Branch:** `fix/premisescan-hook-attachment` · **Base:** `origin/main` at `64c40a68e`
**Closes:** `BL-PREMISESCAN-FILE-SUITE-EAGER-HOOKS-LOST`, `BL-PREMISESCAN-NAMED-SUITE-FACTORY-HOOKS-LOST`
**Probe record:** `docs/superpowers/specs/ci/probes/2026-08-21-premisescan-hook-population.md`

---

## 1. What this is, and what it is not

`premiseScan` classifies every test in the enrolled suites as `environment-touching`,
`environment-free` or `unclassifiable` (`tests/mutation/source/premiseScan.ts`, `export type Verdict`
at `tests/mutation/source/premiseScan.ts:36`). Two Vitest registration shapes attach a hook that genuinely RUNS for a test while the
scanner never sees it, so the test reads `environment-free` — a **silent free**, the direction that
does not announce itself.

This spec makes both shapes **report `unclassifiable`** instead. It does **not** teach the scanner to
follow them.

### 1.1 This change is PROSPECTIVE, and the numbers say so

**The live population of both shapes is ZERO**, measured before this design was written:

| shape | live occurrences | population scanned |
| --- | --- | --- |
| hook in a file-scope registration's eager position | **0** | 3404 registrations across 70 enrolled suites |
| registration whose suite body is not an inline function | **0** | 3404 registrations across 70 enrolled suites |

```
$ pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-21-premisescan-hook-population/probe-population.mts
  1a  registration is a DIRECT statement of the file: 0 of 3404 registrations
  2a  describe/suite with a bare IDENTIFIER in the body position: 0 of 3404 registrations
  2c  any registration whose body position holds no inline function: 0 of 3404 registrations
```

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
| R2 | **The file-scope eager report is FILE-scoped, and that is exact rather than conservative.** A hook in a file-scope registration's eager position runs for every test in the file suite, so a file-level reason is correctly attributed. | §3.1 |
| R3 | **The unlocatable-body report is also FILE-scoped, and that IS an over-report.** Narrowing it to the affected tests requires resolving the identifier to its declaration, which is the analysis R1 declines. Filed as a documented limit in §4, not as a defect. | §3.2, §4 limit L2 |
| R4 | **Every fixture is synthetic source TEXT written to a temp file, never a live construct in the suite.** A live instance inside `premiseScan.test.ts` would make this surface's own suite an instance of the population it measures. | §7, and it is asserted executably by AC-7 |
| R5 | **No AC-1 movement, and none is introduced here.** `EXPECTED_ENV_TOUCHING` declares `tests/mutation/source/premiseScan.test.ts: 0` (`tests/mutation/_metaPremiseContract.test.ts:94`). `ENVIRONMENT_SOURCES.modules` is `["node:child_process", "scripts/lib/ledger-git"]` (`tests/mutation/source/premiseScan.ts:30`), and the new fixtures import neither, so the declared count stays 0. | §6 AC-8 |
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

### 3.1 Producer A — a hook in a file-scope eager position

While reading the SourceFile's statements for `topLevelHooks`, also detect a hook-registrar call
sitting in an EAGER position of a file-scope registration, and emit a file-level reason naming it.

- **Eager positions** are exactly the ones `hookBodies` already treats as eager for the nested case,
  so the two readers cannot disagree about what "eager" means: the arguments of a curried callee
  (`ts.isCallExpression(call.expression)` → `call.expression.arguments`), and every argument for
  which `isSuiteBody` is false.
- **File scope** means the registration is not lexically inside another registration's suite body.
- **Recognized by the same predicates the scanner already ships.** `registrarRoot` answers
  "is this a registration", `isSuiteBody` answers "is this the body", and `HOOK_REGISTRARS`
  answers "is this a hook". No second matcher is introduced. The comment at
  `tests/mutation/source/premiseScan.ts:1837` states why:
  "two matchers where the design assumes one can drift apart silently".

The reason is FILE-scoped and that is **exact**, not conservative: such a hook registers on the file
suite, so it runs for every test in the file.

Reason wording, following the house form (a lowercase phrase carrying its module, as
`withModule` at `tests/mutation/source/premiseScan.ts:1528` produces):

```
hook <name> in an eager position of a file-scope registration at line <n>, in <path>
```

### 3.2 Producer B — a registration whose body cannot be located

While walking, detect a registration for which **no argument satisfies `isSuiteBody`** and which has
at least two arguments, and emit a file-level reason naming it.

- Deliberately keyed on **the absence of a locatable body**, not on "the argument is an identifier".
  An identifier is the shape the ledger row names, but a property access, a call, or anything else in
  that position is equally unfollowable, and a rule keyed on the identifier spelling would be a
  denylist that accepts whatever it did not model. This is an accept-set with the complement
  default-denied: `isSuiteBody`'s closed grammar is the accept-set, and everything outside it
  reports.
- The `< 2 arguments` guard keeps `describe.each(rows)("name", fn)` and bare calls out of the
  producer; a registration with fewer than two arguments has no body position to be missing.

The reason is FILE-scoped and that **is an over-report** — see limit L2. Its live cost is zero
(§1.1), and the direction is the one the consequence bound permits.

```
suite body at line <n> is not an inline function, so hooks registered by it cannot be located, in <path>
```

### 3.3 What is deliberately NOT built

- No identifier resolution to a declaration, for either producer.
- No change to `MODIFIERS`, `HOOK_REGISTRARS`, `REGISTRARS`, `registrarRoot` or `isSuiteBody`.
- No change to the precedence rule, to `hookBodies`, or to the nested-describe behaviour the filing
  arc shipped.
- No new verdict. `unclassifiable` already exists and already means this.

---

## 4. Documented limits

| id | limit | why it is a limit and not a defect |
| --- | --- | --- |
| **L1** | A hook in a file-scope eager position is REPORTED, never attached. A test that could have been proven `environment-touching` through that hook is reported `unclassifiable` instead. | The report is the conservative direction: the reader is told the scanner cannot decide, rather than told the test is free. Following the hook is the resolver R1 declines. |
| **L2** | The unlocatable-body report is FILE-scoped, so it demotes `environment-free` tests in the file that the unlocatable body could not have affected. | Narrowing it needs the identifier resolution R1 declines. Measured live cost: zero registrations, so zero tests. An over-report with a named cause is a documented limit; a silent free is not. |
| **L3** | Neither producer fires on a registration the shipped `registrarRoot` does not recognize. `MODIFIERS` is incomplete on Vitest 4.1.5 — `test.skipIf(...)` is invisible to it, one live instance in `tests/cross-cutting/psqlStartupFileSuppression.test.ts`. | That is `BL-PREMISESCAN-REGISTRAR-ACCEPT-SETS-HAND-MAINTAINED`'s subject and ships in the sequential PR 2. Fixing it here would fold two decisions into one recognizer, which is the bigger target. |
| **L4** | A hook reached only through a helper CALLED from an eager position is not distinguished from one written there. | The producer reports on the syntactic position; a call in an eager position is already an eager argument and reports. This is conservative in the same direction. |

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

Producer B reads one thing: whether any argument satisfies `isSuiteBody`. Its accept-set is closed
by TypeScript's outer-expression grammar; its COMPLEMENT is open, so the corpus is keyed on the
structural classes of a non-inline body rather than on spellings:

| body-position shape | why it is in the corpus |
| --- | --- |
| bare identifier (`describe("A", suiteA)`) | the shape both ledger rows name |
| identifier declared as a `function` declaration | proves the rule does not key on the declaration's own form |
| property access (`describe("A", suites.a)`) | proves the rule is not an identifier denylist |
| **wrapped identifier (`describe("A", (suiteA))`, `describe("A", suiteA as never)`)** | the sharp one: unwrapping an outer expression yields an identifier, so this reports only if the rule reads `isSuiteBody`'s RESULT rather than the raw argument kind |
| call expression (`describe("A", makeSuite())`) | an unfollowable body that is not a binding at all |

**Producer B: 5 producer-B cells, plus one negative twin per cell, plus 4 registrar-independence
cells.**

### 5.3 The sampling rule, stated once

**Cross every axis the rule under test reads. For an axis it does not read, commit an independence
proof over the structurally distinct classes instead of a sample.** If a later finding shows a
spelling the rule is NOT indifferent to, that is a defect in the independence claim, and the repair
is to make the rule indifferent — never to add that spelling as a case, which would re-open an
infinite axis one member at a time.

---

## 6. Acceptance criteria

Every row names the executable step that proves it and the channel the proof arrives on. A green
suite is not a proof for AC-7, AC-8 or AC-9 — those name their own field checks.

| id | claim | proved by |
| --- | --- | --- |
| **AC-1** | For **every one of the 12** (eager position × hook registrar) cells, a hook in that position of a file-scope registration makes every `environment-free` test in that file `unclassifiable`, with a reason naming the hook and its line. | Generated fixtures in `tests/mutation/source/premiseScan.test.ts` driven from two declared axis arrays, asserting verdict AND reason text. Every case is expect-a-REPORT, never expect-clean. |
| **AC-2** | The generated case count EQUALS the product of the declared axes, and the hook-registrar axis equals `HOOK_REGISTRARS`'s own members. | A count assertion derived from the arrays, plus an assertion that the registrar array is derived from the shipped `HOOK_REGISTRARS` rather than retyped. A missing axis member fails here rather than being invisible. |
| **AC-3** | The rule is INDIFFERENT to registration spelling across the four structural classes in §5.2. | Four cases at one fixed (position, registrar) cell asserting identical verdicts and reason shapes. |
| **AC-4** | For **every one of the 5** body-position shapes in §5.2, including the wrapped identifier, a registration whose body is not an inline function makes every `environment-free` test in that file `unclassifiable`. | Generated fixtures, same shape. The wrapped-identifier case is the one that fails if the rule reads the raw argument kind instead of `isSuiteBody`. |
| **AC-5** | A test that is provably `environment-touching` STAYS `environment-touching` in a file affected by either producer. | Fixture pairing a touching test with an affected file, for both producers. Proves the precedence rule at `tests/mutation/source/premiseScan.ts:1725` was not inverted. |
| **AC-6** | **Negative twins, one variable each.** Identical fixture bytes MINUS the eager hook (producer A) and with the factory inlined (producer B) classify `environment-free`. | One twin per generated case, differing by exactly one thing, so a clean verdict is attributable to "examined and correctly declined" rather than to "never got here". |
| **AC-7** | **This surface's own suites contain no LIVE instance of either shape.** Every fixture is synthetic source text handed to `classifyTests` through a temp file. | An executable check over the surface's own `suitePaths` (`tests/mutation/source/registry.ts:170-172`), run in-process, asserting zero live instances. Demonstrated in BOTH directions: it fails when a live instance is constructed and passes when it is removed. |
| **AC-8** | `EXPECTED_ENV_TOUCHING` is unchanged, and `tests/mutation/source/premiseScan.test.ts` still declares 0. | `pnpm exec vitest run tests/mutation/_metaPremiseContract.test.ts --project parallel` green, PLUS a field check that the committed diff touches no line of `EXPECTED_ENV_TOUCHING` (`git diff origin/main...HEAD -- tests/mutation/_metaPremiseContract.test.ts`). A green suite alone cannot prove the second. |
| **AC-9** | The probe record's zeros still hold at HEAD. | Re-run `probe-population.mts` and `probe-decompose.mts`; the counts in §1.1 are unchanged. This is the derived cover for AC-7, replacing a hand enumeration. |
| **AC-10** | The surface's mutation score is measured at HEAD with an empty unaccepted-survivor set, at or above the registry's `scoreFloor` of `0.95`. | `pnpm mutation:guards`, foreground, with a before/after provenance pair stamped inside the measuring invocation over the DERIVED input set — source, registry row, both `suitePaths`, and their transitive local imports. |

---

## 7. The rule-21 constraint, stated as a hazard rather than a habit

`premiseScan.test.ts` is a `suitePath` of the `premiseScan` surface AND is one of the 70 suites
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

- **Consequence bound.** Every construct is classified correctly or reports `unclassifiable`; never
  silently free. The forbidden directions are **false certification** (a test told it is free while
  a hook reaches the environment for it) and **wrong attribution** (a reason naming a construct that
  is not there). A conservative `unclassifiable` with a named cause — including the file-scoped
  over-report at L2 — is a DOCUMENTED LIMIT, not a finding. Usefulness is not the criterion;
  correct attribution is.
- **`PROBE DOMAIN:`** the live tracked test corpus `premiseScan` walks — the 70 suites derived from
  `GUARD_SURFACES.flatMap((s) => s.suitePaths)` — the three population probes committed at
  `docs/superpowers/specs/ci/probes/2026-08-21-premisescan-hook-population/`, the filing arc's
  constructed sweep (whose 84 is corrected in §5.1), and the two bracketed differentials quoted in
  the ledger rows. A
  constructed input more than one ordinary edit from that set files to §4, not to a round.
- **Threat fence.** Ordinary repository-local refactors by a contributor — extracting an inline
  callback to a named constant is routine authoring, not obfuscation. Adversarial module graphs are
  out of scope and file to §4.
- **Score.** `MUTATION SCORE: <k>/<t>` plus "0 unaccepted survivors" on the `GUARD SURFACE:` line of
  the round-1 `--stage diff` brief; `pnpm mutation:guards` run BEFORE the first diff dispatch.
