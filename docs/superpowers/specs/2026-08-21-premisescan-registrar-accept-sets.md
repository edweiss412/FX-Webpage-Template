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
| R3 | **The derivation is DISCRIMINATED, not "every own property of `describe`".** Vitest 4 attaches its whole API to the test object, so a naive read admits `describe`, `suite` and the four hook registrars as "modifiers". | §3.2 |
| R4 | **`aroundAll`/`aroundEach` are in scope and change nothing measurable today** — zero enrolled call sites. | §3.3 |
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

### 3.2 A naive derivation OVER-accepts, and that is why the rule is discriminated

Reading every own property of `describe`, `it` and `test` yields 23 members and adds 16 — including
`describe`, `suite`, and all four hook registrars, because Vitest 4 attaches the whole API to the
test object. Accepting those as MODIFIERS would make `test.beforeAll(…)` peel to `test` and classify
a hook registration as a test.

**The discriminator: a MODIFIER is an own property whose value is callable and which is NOT itself a
top-level Vitest export.** That removes exactly the re-exposed API surface:

```
  describe (11): concurrent, each, fn, for, only, runIf, sequential, shuffle, skip, skipIf, todo
  UNION    (15): concurrent, each, extend, fails, fn, for, only, override, runIf, scoped,
                 sequential, shuffle, skip, skipIf, todo
  ADDS over shipped MODIFIERS (8): extend, fails, fn, override, runIf, scoped, shuffle, skipIf
  DROPS    (0): (none)
```

**DROPS is 0, and that is the strongest property of this change.** The derived set is a strict
SUPERSET of the shipped one, so nothing currently recognized stops being recognized and the change
cannot silently un-classify anything. It is also why the premise is `CONTAINS` rather than `EQUALS`:
losing a member silently is the failure this row exists for, while gaining one on a Vitest release is
benign, and an equality premise would red for the wrong reason.

### 3.3 `aroundAll` / `aroundEach`, and `suite` / `bench`

The derived hook set adds `aroundAll` and `aroundEach`; the derived registrar set adds `suite` and
`bench`. All four have **zero enrolled call sites today**, so adopting them is verdict-neutral now
and correct later. `suite` is the subject of PR 1's §4 L6, which documented that a `suite(…)`
registration is invisible because `REGISTRARS` matches identifier TEXT — this change is where that
limit is retired.

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
| **L2** | A chain form deeper than the ones measured is resolved by the interleaved peel but is not separately fixtured. | The peel is a loop over two node kinds with no depth bound, so depth is not a decision input. §6 crosses the shapes the rule reads. |
| **L3** | `bench` is admitted as a registrar although no enrolled suite uses it. | Admitting it is the derived answer; excluding it would be a hand-exception, which is the thing this row retires. Verdict-neutral at zero call sites. |

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
