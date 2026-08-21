# premiseScan hook-attachment population probes — 2026-08-21

Probe record for the three rows the arc `fix/premisescan-hook-attachment` designs against:

- `BL-PREMISESCAN-FILE-SUITE-EAGER-HOOKS-LOST` (`BACKLOG.md`, the file-scope eager row)
- `BL-PREMISESCAN-NAMED-SUITE-FACTORY-HOOKS-LOST` (`BACKLOG.md`, the named-factory row)
- `BL-PREMISESCAN-REGISTRAR-ACCEPT-SETS-HAND-MAINTAINED` (`BACKLOG.md`, the accept-set row)

All three rows name a population measurement as their first scheduled step. Two of them say a
zero would make the design choice cheap. **All three measurements are below, each beside the
command that produced it.** Base: `origin/main` at `64c40a68e`, worktree
`FX-worktrees/premisescan-hook-attachment`, Vitest **4.1.5**.

Scripts are committed beside this record at
`docs/superpowers/specs/ci/probes/2026-08-21-premisescan-hook-population/` and are re-runnable
from the repository root with `pnpm exec tsx <path>`.

---

## 0. Which instrument produced each count, and why it is not the one with the defect

**No count below is produced by `premiseScan`.** Both hook rows are defects in which
`classifyTests` FAILS TO SEE a construct — a hook in a file-scope eager position is never
attached by the top-level seed loop in `classifyTests`, and a named factory's body is never
walked by `hookBodies`. Asking that scanner how many enrolled suites contain those constructs
returns zero **by construction**, because not-seeing-them is the defect. A real population of
forty would render as "zero, so either choice is cheap".

Every population figure is therefore produced by a **raw TypeScript AST walk written for this
probe**, and two recognizers are run over the same corpus:

| recognizer | what it is | status of its counts |
| --- | --- | --- |
| **WIDE** | written for this probe. A registration is any call whose callee peels, in ANY interleaving of calls and property accesses, to a root identifier in `{describe, it, test, suite, bench}`. Accepts every modifier spelling. | **the population** |
| **SHIPPED** | `registrarRoot`, `isSuiteBody`, `REGISTRARS`, `MODIFIERS` and `HOOK_REGISTRARS` extracted from `premiseScan.ts`'s own AST and evaluated, so the comparison cannot drift from a hand model of them | **a lower bound, never the population** |

The two-recognizer design is not decoration. Keying the population on the shipped
`registrarRoot` would inherit the accept-set row's own defect: `MODIFIERS` does not carry
`skipIf`, so a `test.skipIf(...)` registration is invisible to it, and probes 1 and 2 would have
been silently measured over a corpus two registrations short of the real one. The WIDE-versus-
SHIPPED delta below is that inheritance made visible.

The enrolled-suite list is derived, not enumerated: `GUARD_SURFACES.flatMap((s) => s.suitePaths)`,
the same expression `tests/mutation/_metaPremiseContract.test.ts` uses, so a newly enrolled
suite is covered by default.

---

## 1. Corpus, controls and the two-recognizer delta

```
$ pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-21-premisescan-hook-population/probe-population.mts

CORPUS: enrolled suites 70, files read 70
RECOGNIZER WIDE    registrations 3404, inline-bodied suites 459, chain forms 0
RECOGNIZER SHIPPED registrations 3402, inline-bodied suites 459, chain forms 0

WIDE-ONLY REGISTRATIONS (invisible to the shipped registrarRoot): 2
      tests/cross-cutting/psqlStartupFileSuppression.test.ts:1654  test.skipIf(isRoot)("chmod 000 on a directory holding a psql site fails the census", () => {
      tests/cross-cutting/psqlStartupFileSuppression.test.ts:1654  test.skipIf(isRoot)
```

The script aborts rather than reporting if `filesScanned`, `registrations` or the inline-bodied
control is zero, and aborts if WIDE finds FEWER registrations than SHIPPED. `0 of 0` and
`0 of 3404` render identically otherwise.

**The two WIDE-only nodes are one live registration** — the outer call and its `test.skipIf(isRoot)`
callee both peel to `test`. This independently reproduces the accept-set row's incident on the
current tree. The row cites that test at `:1653`; it is at **`:1654`** on `64c40a68e`, and the
citation that survives an edit is the content, `test.skipIf(isRoot)("chmod 000 on a directory
holding a psql site fails the census", …)`.

**`chain forms 0`** — no registration anywhere in the enrolled corpus is a property access sitting
on a call. That is the shape the accept-set row measures at zero repo-wide, confirmed here on the
enrolled subset by an independent recognizer.

---

## 2. PROBE 1 — file-scope eager hooks: **0**

```
$ pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-21-premisescan-hook-population/probe-population.mts

--- PROBE 1  file-scope eager hooks (instrument: WIDE, independent AST walk)
  1a  registration is a DIRECT statement of the file: 0 of 3404 registrations
  1b  any registration outside a describe body: 0 of 3404 registrations
  1a  SHIPPED lower bound: 0 of 3402 registrations
```

### 2.1 The zero is attributable, because a positive control reports

An expect-CLEAN result is satisfied by any recognizer that fails to look. The identical walk over
constructed input carrying one instance of each construct:

```
POSITIVE CONTROL (constructed): eagerDirect 2, eagerFileScope 2, factoryDescribe 1, registrations 6
```

The script throws if either control count is zero, so a corpus zero can never be reported by a
recognizer that does not report on a real instance.

### 2.2 The zero varies ONE thing, not a conjunction

`1a` reports a conjunction — a hook call AND an eager argument position AND a file-scope
registration — so a null could be about the probe's scope bookkeeping rather than about the
corpus. Each conjunct measured alone:

```
$ pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-21-premisescan-hook-population/probe-decompose.mts

--- probe 1's conjuncts, each varied alone
  C1 control  hook-registrar calls in the corpus, any position: 11
  P1          hook-registrar calls NOT written as a plain expression statement: 0
  P2a         registrations outside any registration body (file suite scope): 446
  P2b         file-scope eager arguments that are not a plain string literal: 2
      tests/styles/_metaControlOutlineFill.test.ts:115  [CallExpression]  RESOLVED.map((r, i) => [i + 1, r] as const)
      tests/styles/_metaControlOutlineFill.test.ts:168  [CallExpression]  DIVIDERS.map((d) => [`${d.file}:${d.line}`, d] as const)
  C2 control  curried .each/.for registrations in the corpus: 302
```

**`P1 = 0` is the single-variable fact the compound zero rests on.** Of the eleven real hook
registrar CALLS in the enrolled corpus, every one is written as a plain expression statement.
Not one appears in an argument, an initializer, or any other non-statement position. That
statement is independently checkable, needs no scope bookkeeping, and would remain true even if
the walk's `insideDescribeBody` tracking were wrong.

The eager slot itself is live rather than hypothetical: **446** registrations sit at file-suite
scope and **2** of their eager arguments are something other than a plain string literal (both
curried `.each` producers). The slot exists across the corpus; no hook occupies it.

### 2.3 The hook census reconciles across two independent extractors

One route plus a control proves the read succeeded, not that the population is total. A second
extractor over the same 70 suites:

```
$ pnpm exec tsx -e '<line-regex extractor, quoted in full in §6>'
EXTRACTOR 2 total line-regex hook occurrences: 34
```

The two routes DISAGREE — 11 against 34 — and the disagreement is fully accounted for rather than
explained away. The per-suite counts agree EXACTLY on eight of the nine suites carrying hooks
(1, 1, 1, 2, 2, 1, 1, 1). The whole gap is one file, `tests/mutation/source/premiseScan.test.ts`:
1 against 24. Resolved by AST:

```
real hook CALLS (AST): 1
hook-name occurrences inside string/template literals (AST): 23
calls + string occurrences = 24   line-regex total was 24
RECONCILED EXACTLY
```

The 23 are the scanner's OWN fixtures — hook constructs written as source TEXT and handed to
`classifyTests`. A line regex cannot tell a call from a string; the AST walk can, and excluding
them is correct. Worth recording explicitly: two of those fixture strings
(`describe.each([beforeEach(…), 1])` and `describe(String(beforeEach(…)), …)`) are precisely the
file-scope eager construct this row is about. **It exists in the corpus only as fixture text,
never as a live registration.**

---

## 3. PROBE 2 — named suite factories: **0**

```
$ pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-21-premisescan-hook-population/probe-population.mts

--- PROBE 2  named suite factories (instrument: WIDE, independent AST walk)
  2a  describe/suite with a bare IDENTIFIER in the body position: 0 of 3404 registrations
  2b  it/test with a bare IDENTIFIER in the body position: 0 of 3404 registrations
  2c  any registration whose body position holds no inline function: 0 of 3404 registrations
  2a  SHIPPED lower bound: 0 of 3402 registrations
```

`2c` is deliberately wider than the row: it counts EVERY registration whose body position holds
something other than an inline function, not only a bare identifier. That is the population for
the report-rather-than-resolve alternative, since it is the set of registrations whose body
`hookBodies` cannot locate lexically for any reason. It is also zero.

The single-variable form, measuring the INGREDIENT a named factory is made of without reference
to whether anything passes it to `describe`:

```
--- probe 2's conjunct, varied alone
  Q2          module-scope function bindings that themselves register or hook: 0
```

**Zero module-scope function bindings anywhere in the enrolled corpus themselves register a test
or a hook.** There is no factory-shaped binding to pass to a registration, so the compound zero
in `2a` is not a scoping artefact — the ingredient does not exist. The positive control in §2.1
reports `factoryDescribe 1` on constructed input, so the recognizer does fire on a real instance.

---

## 4. PROBE 3 — what a DERIVED accept-set adds

```
$ pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-21-premisescan-hook-population/probe-acceptset.mts

vitest version: 4.1.5

SHIPPED MODIFIERS (7): concurrent, each, for, only, sequential, skip, todo
SHIPPED HOOK_REGISTRARS (4): afterAll, afterEach, beforeAll, beforeEach
SHIPPED REGISTRARS (3): describe, it, test
```

### 4.1 A naive derivation OVER-accepts, and that is a design finding

Reading every own property of `describe`, `it` and `test` yields 23 members and adds 16:

```
DERIVED  from describe|it|test own properties (23): afterAll, afterEach, aroundAll, aroundEach,
  beforeAll, beforeEach, concurrent, describe, each, extend, fails, fn, for, only, override,
  runIf, scoped, sequential, shuffle, skip, skipIf, suite, todo
  ADDS (16): afterAll, afterEach, aroundAll, aroundEach, beforeAll, beforeEach, describe, extend,
             fails, fn, override, runIf, scoped, shuffle, skipIf, suite
```

Vitest 4 attaches the WHOLE API to the test object, so `describe`, `suite` and the four hook
registrars appear as properties of `test`. Accepting them as MODIFIERS would make
`test.beforeAll(…)` peel to `test` and classify a hook registration as a test. The accept-set row
says "the suite modifiers as properties of `describe`"; on the installed version that sentence is
true of `describe` and NOT of `it`/`test`, and a derivation written from it verbatim is wrong.

### 4.2 The discriminated derivation

A MODIFIER is an own property whose value is callable and which is NOT itself a top-level Vitest
export — which removes exactly the re-exposed API surface:

```
--- per-object own properties
  describe (11): concurrent, each, fn, for, only, runIf, sequential, shuffle, skip, skipIf, todo
  it       (22): … the full API …
  test     (22): … the full API …
  suite    (11): concurrent, each, fn, for, only, runIf, sequential, shuffle, skip, skipIf, todo
  bench     (6): fn, only, runIf, skip, skipIf, todo

--- discriminated: callable own property that is NOT a top-level vitest export
  describe (11): concurrent, each, fn, for, only, runIf, sequential, shuffle, skip, skipIf, todo
  it       (14): concurrent, each, extend, fails, fn, for, only, override, runIf, scoped, sequential, skip, skipIf, todo
  test     (14): concurrent, each, extend, fails, fn, for, only, override, runIf, scoped, sequential, skip, skipIf, todo
  UNION    (15): concurrent, each, extend, fails, fn, for, only, override, runIf, scoped, sequential, shuffle, skip, skipIf, todo
  ADDS over shipped MODIFIERS (8): extend, fails, fn, override, runIf, scoped, shuffle, skipIf
  DROPS    (0): (none)
```

```
DERIVED hook globals present as functions (6): afterAll, afterEach, aroundAll, aroundEach, beforeAll, beforeEach
  ADDS (2): aroundAll, aroundEach

vitest exports that are suite/test registrars: bench, describe, it, suite, test
FLOOR: vitest exports read 28
```

**DROPS is 0 in every case.** The derived set is a strict SUPERSET of the shipped one, which is
what makes a CONTAINS premise correct and an EQUALS premise wrong: losing a member silently is
the failure, gaining one on a Vitest release is benign. The script aborts on an empty derived
set, since deriving nothing renders identically to a surface with no members.

---

## 5. PROBE 3b — AC-1 movement: **none**

The accept-set row states that adopting a derived set may move `_metaPremiseContract`'s declared
counts, which is an AC-1 movement and would need the user decision PR #843's sixteen-test movement
needed. Measured rather than reasoned about. Three configurations, the tracked
`premiseScan.ts` never mutated (two sibling copies are written, imported and deleted):

| config | what changes |
| --- | --- |
| **A** | shipped — baseline |
| **B** | derived `MODIFIERS` + derived `HOOK_REGISTRARS` — the completion the filing arc reverted at its r12 |
| **C** | B, plus an interleaved callee peel in `registrarRoot` — both halves together |

```
$ pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-21-premisescan-hook-population/probe-acmovement.mts

CORPUS: 70 enrolled suites
A shipped      classified 2648  env-touching 74  unclassifiable 1
B derived      classified 2649  env-touching 74  unclassifiable 1
C derived+peel classified 2649  env-touching 74  unclassifiable 1

B vs A — suites whose numbers move: 1
      tests/cross-cutting/psqlStartupFileSuppression.test.ts
          total 399->400  touching 2->2  unclassifiable 0->0

C vs A — suites whose numbers move: 1
      tests/cross-cutting/psqlStartupFileSuppression.test.ts
          total 399->400  touching 2->2  unclassifiable 0->0

TRACKED SOURCE UNMUTATED: yes (94180 bytes before, 94180 after)
```

Each patch anchor is asserted to match EXACTLY ONCE before the write, and the run throws rather
than reporting if a patch produces identical bytes or if the tracked source moved.

**`EXPECTED_ENV_TOUCHING` declares environment-TOUCHING counts per suite. That number does not
move for any suite: 74 to 74 corpus-wide, 2 to 2 on the one suite whose census changes at all.**
The only movement is `total` on `psqlStartupFileSuppression.test.ts`, 399 to 400 — the previously
uncensused `test.skipIf(isRoot)` test entering the census, classified environment-FREE, which
carries no declaration obligation.

### 5.1 Confirmed by running the meta-test itself, both ways

```
$ pnpm exec vitest run tests/mutation/_metaPremiseContract.test.ts --project parallel
  # shipped:                Test Files 1 passed (1)   Tests 10 passed (10)
  # with config C applied:  Test Files 1 passed (1)   Tests 10 passed (10)
```

The tracked source was restored byte-exact after the config-C run (`git status --porcelain`
empty).

### 5.2 That green is load-bearing, proved by perturbing the threshold

A passing suite is not evidence unless the assertion can fail. Flipping one declared count from
`2` to `3` in `EXPECTED_ENV_TOUCHING`:

```
× classifies the declared number of environment-touching tests per suite 4ms
AssertionError: tests/cross-cutting/psqlStartupFileSuppression.test.ts: expected 2 to be 3
  Tests  1 failed | 9 passed (10)
```

Restored byte-exact. The declaration is checked, not decorative, so the unchanged green under
config C is a real result.

**Conclusion: no AC-1 movement, and no user escalation is owed on any of the three rows.**

---

## 6. Second extractor, quoted in full

The reconciliation in §2.3 used this, run from the repository root:

```bash
pnpm exec tsx -e '
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GUARD_SURFACES } from "./tests/mutation/source/registry";
const suites=[...new Set(GUARD_SURFACES.flatMap(s=>s.suitePaths))].sort();
let n=0; const per=new Map<string,number>();
for(const s of suites){
  const lines=readFileSync(join(process.cwd(),s),"utf8").split("\n");
  let c=0;
  lines.forEach(l=>{ const m=l.match(/(^|[^.\w])(beforeEach|beforeAll|afterEach|afterAll|aroundEach|aroundAll)\s*\(/g); if(m){n+=m.length;c+=m.length;} });
  if(c) per.set(s,c);
}
console.log("EXTRACTOR 2 total line-regex hook occurrences: "+n);
for(const [s,c] of [...per].sort()) console.log(`      ${c}  ${s}`);
'
```

---

## 7. What these measurements decide

1. **Both hook rows have a measured live population of ZERO, and a zero is a result rather than
   a shrug.** Each row says a zero makes either choice cheap. It does more than that: it makes
   the cheaper and narrower choice strictly better, because the expensive choice buys nothing
   observable on the corpus while adding reachability machinery to a TypeScript scanner — the
   growth direction the same-axis recurrence rule forbids. The design branch these probes select
   is **REPORT `unclassifiable`, do not build the resolver**, and it ships as a ratified decision
   with these numbers behind it rather than as a deferral.

2. **The accept-set row's two halves are safe to ship together and unsafe to split**, confirmed
   independently here: chain forms measure 0 across the enrolled corpus, and completing the sets
   alone (config B) is already indistinguishable from completing them with the peel repair
   (config C) on today's tree.

3. **A derived accept-set must be discriminated, not read wholesale off the test object.** The
   naive derivation adds 16 members including `describe`, `suite` and the four hook registrars,
   and would classify a hook registration as a test.

4. **No AC-1 movement, so the batch's one genuine escalation point does not fire on this arc.**
