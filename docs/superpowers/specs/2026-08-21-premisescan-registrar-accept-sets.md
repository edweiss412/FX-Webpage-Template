# premiseScan derives its registrar accept-sets from Vitest's own surface

**Status:** DRAFT · **Branch:** `fix/premisescan-registrar-accept-sets` · **Base:** `origin/main` at `c80f84427`
**Closes:** `BL-PREMISESCAN-REGISTRAR-ACCEPT-SETS-HAND-MAINTAINED`
**Sequenced after:** `fix/premisescan-hook-attachment` (PR 1), whose §4 L3 and L6 fence this row's subject.

---

## 1. What this is

`premiseScan` carries three hand-maintained accept-sets — `REGISTRARS`, `MODIFIERS` and
`HOOK_REGISTRARS` (`tests/mutation/source/premiseScan.ts:47`, `tests/mutation/source/premiseScan.ts:48` and `tests/mutation/source/premiseScan.ts:66`) — and each restates part
of Vitest's API rather than reading it. They have drifted, the drift is silent in the FREE direction,
and completing them by hand does not terminate: the filing arc completed one set at its round 6 and
another at its round 10, and the next Vitest release adds the next member.

This spec replaces all three with sets DERIVED from the installed package, and repairs
`registrarRoot`'s callee peel in the same change. **The two are one change, and §2 is the
measurement that says so.**

### 1.1 Resolved scope — do not relitigate

| # | Decision | Ratified by |
| --- | --- | --- |
| R1 | **Both halves ship together.** Completing the sets without the peel repair trades a silent omission for a silently WRONG verdict; repairing the peel without completing the sets leaves an enrolled test uncensused. | §2, measured through the shipped implementations |
| R2 | **Derived, never completed by hand.** A hand-completion is what the filing arc did twice and it does not terminate. | §3 |
| R3 | **The modifier set is derived from Vitest's DECLARATION, not from runtime property enumeration.** A property read over-accepts: it admits the hook registrars, and it admits BUILDERS (`extend`, `override`, `scoped`) whose call returns a new API rather than registering. The declaration names the chainable set directly. | §3.2 |
| R4 | **`aroundAll`/`aroundEach` are in scope at zero call sites; `suite` is adopted by routing it through the `describe` branch; `bench` is NOT adopted, derived from its declaration as a benchmark API rather than excepted by hand.** | §3.3, §5 L3 |
| R5 | **AC-1 does not move.** Measured: environment-touching holds at 74 and unclassifiable at 1; the only delta is one previously uncensused test entering the census, classified environment-FREE. | §4 |

---

## 2. The three states, measured through the shipped code

The ledger row states that completing the sets alone makes a conditional CHAIN form silently wrong.
**That claim was verified rather than inherited, and verifying it required running the shipped
implementations rather than modelling them.** An earlier hand model of `registrarRoot` — which asked
only what the OUTER callee peels to — reported the chain as unclassified and would have refuted the
row. The model was wrong: the walk also visits the INNER call `test.skipIf(c)` as its own node.

Three trees, three fixtures, `classifyTests` called in memory on each:

| fixture | `origin/main` | sets completed ONLY | sets + interleaved peel |
| --- | --- | --- | --- |
| `test.skipIf(c).each(rows)("chain %s", fn)` | `[]` not classified | **`<test at line 2>`** — a spurious registration whose name is synthesized because the "name argument" is the CONDITION | **`chain %s`** — the real registration |
| `test.skipIf(c)("live", fn)` | `[]` not classified | `live` ✓ | `live` ✓ |
| `test.each(rows)("plain %s", fn)` | `plain %s` ✓ | `plain %s` ✓ | `plain %s` ✓ |

The middle column is reproduced from the filing arc's actual round-10 commit `e77ead5c6`, confirmed
by reading its diff to touch ONLY the `MODIFIERS` literal and not the peel.

**So: `origin/main` is silently INCOMPLETE, completion alone is silently WRONG, and the two together
are correct.** That is the whole argument for R1, and it is a measurement rather than a reading.

### 2.1 Why the inner call is the mechanism

`registrarRoot` peels callee CALLS and PROPERTIES in two SEPARATE loops
(`tests/mutation/source/premiseScan.ts:68`), so for `test.skipIf(c).each(rows)` the call loop exits
at a property access and the property loop then meets a CallExpression it cannot peel — the outer
registration resolves to nothing. Meanwhile the walk reaches the inner `test.skipIf(c)` on its own,
and once `skipIf` is in `MODIFIERS` that inner call peels cleanly to `test` and is recorded as a
registration. The test it invents takes its name from `c`.

An interleaved peel resolves the outer call correctly, and the inner call is then subsumed by it.

---

## 3. The derivation

### 3.1 What the installed surface says

```
$ pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-21-premisescan-hook-population/probe-acceptset.mts
vitest version: 4.1.5
SHIPPED MODIFIERS (7): concurrent, each, for, only, sequential, skip, todo
SHIPPED HOOK_REGISTRARS (4): afterAll, afterEach, beforeAll, beforeEach
SHIPPED REGISTRARS (3): describe, it, test
DERIVED hook globals present as functions (6): afterAll, afterEach, aroundAll, aroundEach, beforeAll, beforeEach
vitest exports that are suite/test registrars: bench, describe, it, suite, test
```

### 3.2 Derive from the DECLARATION, not from runtime properties

An earlier draft derived the modifier set by enumerating callable own properties of `describe`, `it`
and `test` and excluding top-level exports. That over-accepts, and spec review r1 finding 1 showed
how: `extend`, `override`, `scoped`, `fn` and `fails` are **BUILDERS** — a call to one returns a new
test API rather than registering anything — so admitting them makes `test.extend({})` peel to `test`
and invent a registration out of a builder call.

**Vitest's shipped declaration states the chainable modifier set directly**, and it is the
authoritative answer to the question the peel is asking:

```
type ChainableSuiteAPI<ExtraContext = object> = ChainableFunction<
  "concurrent" | "sequential" | "only" | "skip" | "todo" | "shuffle",
  SuiteCollectorCallable<ExtraContext>,
  { each: TestEachFunction; for: SuiteForFunction }
>;
type SuiteAPI<ExtraContext = object> = ChainableSuiteAPI<ExtraContext> & {
  skipIf: (condition: any) => ChainableSuiteAPI<ExtraContext>;
  runIf: (condition: any) => ChainableSuiteAPI<ExtraContext>;
};
```

Three groups, all named by the declaration: the chainable keys, the two curried members, and the two
conditional ones. Derived from them:

```
chainable keys : concurrent, sequential, only, skip, todo, shuffle
curried members: each, for
conditional    : skipIf, runIf
DERIVED SET, suite declaration alone (10): concurrent, each, for, only, runIf, sequential, shuffle, skip, skipIf, todo
ADDS  : runIf, shuffle, skipIf   <- INCOMPLETE: see below, `fails` is declared on the TEST API
DROPS : (none)
builders EXCLUDED: extend, override, scoped, fn, fails
```


**Both chainable declarations are read, not one.** `fails` is declared on `ChainableTestAPI` and not
on `ChainableSuiteAPI`, so a derivation reading only the suite declaration excludes a genuine test
modifier and leaves `test.fails("must fail", fn)` silently uncensused — spec review r2 finding 1, and
a defect in the derivation rather than in the idea of deriving. The union of both:

```
ChainableSuiteAPI chain : concurrent, sequential, only, skip, todo, shuffle | curried: each, for
ChainableTestAPI  chain : concurrent, sequential, only, skip, todo, fails   | curried: each, for
SuiteAPI conditional    : skipIf, runIf
UNION (11): concurrent, each, fails, for, only, runIf, sequential, shuffle, skip, skipIf, todo
ADDS : fails, runIf, shuffle, skipIf
DROPS: (none)
builders still excluded: extend, override, scoped, fn
```

The extractor ABORTS with exit 2 if either chainable declaration matches nothing, because a selector
that stops matching reports a confident empty set. That floor fired during authoring, on a shell
quoting error that made both declarations return empty — the check caught its own broken run.

### 3.4 The hook set has THREE consumers, and all three must range over it

`HOOK_REGISTRARS` is consulted at `tests/mutation/source/premiseScan.ts:1758` (the file-scope seed),
`tests/mutation/source/premiseScan.ts:1842` (`hookBodies`) and `tests/mutation/source/premiseScan.ts:1960` (`loadTimePremises`), and **each requires a bare IDENTIFIER
callee.** Vitest also exposes the hooks as properties — `test.beforeEach(…)`, `test.aroundEach(…)` —
and every one of those is invisible to all three. Measured:

```
bare      beforeEach(spawn) inside a describe   -> pure body: environment-touching
qualified test.beforeEach(spawn) inside a describe -> pure body: environment-FREE
```

That is a silent free, and widening the hook NAMES does not touch it — spec review r2 finding 2, and
**§3.3's own rule arriving one section later on this spec's own change**: an accept-set is only
adopted where every consumer of it agrees.

The repair is ONE shared predicate — a callee is a hook registrar when it is a bare identifier in the
set, OR a property access whose name is in the set and whose object peels to a registrar root — used
by all three consumers. One predicate rather than three, because three copies of a rule are three
things that drift, which is the same defect one level down from the accept-set itself.


**The builders are excluded BY CONSTRUCTION rather than by exception.** They are not in
`ChainableSuiteAPI`, so a derivation that reads the declaration never sees them — which is what makes
this a derivation rather than a hand-list with a caveat.

**And the result vindicates the filing arc's round 10 exactly.** The three members the declaration
adds — `runIf`, `shuffle`, `skipIf` — are precisely the three that round added by hand. Its CONTENT
was right; what was missing was the peel repair beside it, which is §2's measurement and R1's whole
point.

### 3.3 `aroundAll` / `aroundEach`, `suite`, and `bench`

The derived hook set adds `aroundAll` and `aroundEach`, both with **zero enrolled call sites today**,
so adopting them is verdict-neutral now and correct later.

**`suite` and `bench` are NOT adopted by widening `REGISTRARS` alone, and spec review r1 finding 2
proved it.** `registrarRoot` returning a root is only half the path: the walk then DISPATCHES on the
root by name —

```ts
if (root_ === "describe") { … }
if (root_ === "it" || root_ === "test") { … }
```

— so a widened `REGISTRARS` yields `suite`, which matches neither branch, and the registration is
recognized and then dropped. Measured: with the derived sets applied, `suite("x", …)` loses hook
attribution where `describe("x", …)` keeps it, and `bench` produces no row at all.

The dispatch is a THIRD hand-maintained list, and it is the one that decides behaviour.

- **`suite` IS adopted**, by routing it through the same branch as `describe`. It is a Vitest alias —
  the same function object — so treating it identically is the derived answer, not a special case.
  This retires PR 1's §4 L6.
- **`bench` is NOT adopted**, and the exclusion is DERIVED rather than excepted: the declaration types
  it as a benchmark API, not a `SuiteAPI` or `TestAPI`, so a derivation that reads the declaration
  never admits it. A benchmark is not a test and carries no premise obligation. Recorded as §5 L3.

The general shape, and it is the reason this row exists: **an accept-set is only adopted where every
consumer of it agrees.** Widening one list while a second hand-list downstream still enumerates three
names produces a change that reads as adoption and behaves as nothing.

---

## 4. AC-1 does not move

```
A shipped        classified 2648  env-touching 74  unclassifiable 1
B derived        classified 2649  env-touching 74  unclassifiable 1
C derived+peel   classified 2649  env-touching 74  unclassifiable 1
```

`EXPECTED_ENV_TOUCHING` (`tests/mutation/_metaPremiseContract.test.ts:32`) declares
environment-TOUCHING counts. **That number does not move for any suite.** The only delta is
`tests/cross-cutting/psqlStartupFileSuppression.test.ts` going 399 → 400 as the previously uncensused
`test.skipIf(isRoot)` test enters the census, classified environment-FREE and therefore carrying no
declaration obligation. `_metaPremiseContract` passes 10 of 10 under both A and C, and perturbing one
declared count 2 → 3 reds it by name, so that green is load-bearing.

**No AC-1 movement, so no user decision is owed** — the escalation PR #843's sixteen-test movement
required does not arise here.

---

## 5. Documented limits

| id | limit | why it is a limit |
| --- | --- | --- |
| **L1** | The derived sets are read from the INSTALLED package at authoring time, not at scan time. A Vitest upgrade that adds a modifier does not take effect until the sets are re-derived. | Reading them at scan time would make the scanner's verdicts depend on `node_modules`, which is not tracked. The repair is a re-derivation step, and a structural test pins the derived set against the installed surface so an upgrade REDS rather than drifting silently. |
| **L2** | A chain form deeper than the ones measured is resolved by the interleaved peel but is not separately fixtured. | The peel is a loop over two node kinds with no depth bound, so depth is not a decision input. |
| **L4** | **A modifier call whose result is BOUND before invocation invents a registration and misses the real one.** `const p = test.each(rows); p("real", fn)` records `<test at line N>` and never sees `p("real", fn)`. | **PRE-EXISTING and bracketed, not caused or widened here.** Measured on `origin/main`'s unmodified scanner, which already carries `each` in `MODIFIERS`: that fixture yields `<test at line 3>: environment-free` today. The declaration-derived set adds no new builder to this class — §3.2's exclusion of `extend`, `override` and `scoped` is precisely what stops this change widening it. Closing it means deciding a registration by whether its result is invoked, which is execution reasoning this surface does not do. Raised as spec review r1 finding 1, whose widening half is fixed and whose pre-existing half is documented here. |
| **L3** | `bench(…)` registrations are not censused. | The declaration types `bench` as a benchmark API rather than a `SuiteAPI` or `TestAPI`, so a derivation that reads the declaration never admits it — the exclusion is derived, not excepted. A benchmark is not a test and carries no premise obligation. Zero enrolled call sites. |

---

## 6. Convergence criterion

- **Consequence bound.** Every registration is **correct or signaled, never silently wrong**: it is
  classified correctly, or it reports `unclassifiable`. The two forbidden directions are **false
  certification** (a registration silently uncensused, or a spurious registration invented from a
  condition variable) and **wrong attribution**. A conservative report with a named cause is a
  DOCUMENTED LIMIT.
- **`PROBE DOMAIN:`** the live tracked test corpus `premiseScan` walks — the enrolled suites derived
  from `GUARD_SURFACES.flatMap((s) => s.suitePaths)` — the installed `@vitest/runner` 4.1.5 surface,
  the committed probes under `docs/superpowers/specs/ci/probes/2026-08-21-premisescan-hook-population/`,
  and the filing arc's round-10 commit `e77ead5c6`. A constructed input more than one ordinary edit
  from that set files to §5.
- **Threat fence.** Ordinary repository-local authoring by a contributor. Adversarial module graphs
  and constructs no contributor would write are out of scope.
- **Score.** `MUTATION SCORE: <k>/<t>` plus "0 unaccepted survivors" on the `GUARD SURFACE:` line of
  the round-1 `--stage diff` brief. **This change alters `premiseScan`'s mutant count and therefore
  its shard weight**, and a weight-balanced re-pack can push the binding `source-shards` leg past the
  90-minute JOB TIMEOUT, which returns CANCELLED with no annotations rather than a budget warning. If
  that happens the evidence is a LOCAL scored run with provenance stamped inside the measuring
  invocation, stated plainly as local rather than allowed to read as CI confirmation.
- **No AC's red may depend on a survivor appearing** unless a declared operator can express the
  defect. A perfect score with an empty survivor set can coexist with a live defect class the
  operator set cannot generate.
