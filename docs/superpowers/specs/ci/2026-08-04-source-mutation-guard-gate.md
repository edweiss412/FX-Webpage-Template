# Source-mutation gate for guard surfaces — a convergence criterion that terminates

**Date:** 2026-08-04
**Status:** draft
**Subsystem:** ci
**Motivating measurement:** `AGENTS.md:251` (round-economy), `docs/agents/adversarial-round-economy-2026-07-31.md`, `docs/agents/spec-self-review.md:40`

<!-- spec-lint: not-ui — test-infrastructure spec. It names app/, components/ and DESIGN.md only inside §9 to declare them OUT of scope; the arc renders nothing, so the dimensional-invariant and transition-inventory sections are N/A. -->

Line references written `L<n>` throughout §2 and §4 are lines of the enrolled surface `lib/specLint/taskContract.ts`.

---

## 1. Problem

Measured 2026-08-04 across sixteen concurrent sessions: **474 adversarial-review rounds**, individual arcs at 41 / 40 / 38 / 33 / 30 / 28 / 25. Seven diagnosed in detail; every one had the same shape.

- **70–80% of findings were "the guard does not pin what it claims"** — not defects in the shipping change.
- Genuine design gaps front-loaded in rounds 1–4, then stopped.
- The deliverable ratcheted into a recognizer: "add `-X` at 71 psql sites" became a 2929-line shell-grammar parser; an 83-line component grew two test files to 1947 + 1012 lines with **zero product-code change after round 2**, killed by hand at `2d9d0ba11` (−1005 lines).
- **BLOCKING findings per round do not decay:** 0.32 in rounds 1–3, 0.38 in rounds 11+.

PR #702 (`863b8e139`) added the per-machine review-convergence-gate hook, which blocks a guard/detector dispatch whose brief states no consequence bound and no threat-model fence (`AGENTS.md:251-258`). That bounds round *count*; it does not address why rounds are *generated*.

### 1.1 Why the dominant finding class is mechanically decidable

"No escaping input exists" ranges over an infinite input space and does not terminate. **"No surviving mutant" ranges over a closed, declared set of operators applied to a finite program, and terminates.** Same word, different object — that distinction is this spec's whole subject.

Every one of these review findings was a mutation result wearing review clothes:

| Review finding | What actually decides it |
| --- | --- |
| AC-26 unfalsifiable | mutate `openCount === 1` → `>= 1`; fixture survives |
| AC-47 covered 1 of 10 codes | mutant downgrading one code to advisory survives |
| AC-17 permitted the harmless placement | mutant ignoring the shallower boundary survives |

### 1.2 Resolved scope — do not relitigate

Every row is a ratified decision. Challenge it only with a probe that refutes the cited evidence.

| # | Decision | Ratification |
| --- | --- | --- |
| R1 | **Mutation targets SOURCE, not fixtures.** The existing `tests/parser/mutation/**` harness mutates a *fixture corpus* (`tests/parser/mutation/operators.ts:265-274` — `header-typo`, `ref-sub`, `unicode-inject`, …). This spec mutates *program text*. Different object; the two harnesses coexist and share no code. | `tests/parser/mutation/operators.ts:265-274` |
| R2 | **Operator set is CLOSED and DECLARED** (§3.1). An input the operator set does not model is not a gap in the gate; it is outside the accept-set by construction, and is handled by proposing an operator, not by filing a review round. | §3.1, `docs/agents/spec-self-review.md:38` |
| R3 | **AST-based site enumeration, not text scanning.** Ratified by probe (§2.3): a line/regex text sweep leaked an `integer-literal` mutant into a user-facing message string (`taskContract.ts:129`) and required hand-written masking for TS generics and `=>`. The AST walk produces zero such sites *by construction*. This closes the "masking heuristic" finding class before round 1 — building the recognizer for it is the exact ratchet this arc exists to prevent. | §2.3 probe |
| R4 | **The gate is nightly + on-demand, NOT in merge-gating `pnpm test`.** It spawns one `vitest` subprocess per mutant (102 for the first surface, 76.6 s). Precedent: the parser harness is nightly-only for the same reason (`vitest.projects.ts:83-84`, `.github/workflows/mutation-harness.yml`). The *repaid tests* it motivates DO live in the merge-gating suite — that is the split, and it is deliberate. | §5, `vitest.projects.ts:83-84` |
| R5 | **Two ledger kinds, not one.** `equivalent` (provably no observable behavior difference) is excluded from the score denominator; `accepted-gap` (a real, deliberately-uncovered gap) counts as survived and depresses the score. A single "accepted" kind would let any ledger row buy a perfect score. | §3.5 |
| R6 | **Serial execution. Parallelism is deferred, not overlooked.** 76.6 s measured for the first surface. Sharding exists in the parser harness (`tests/parser/mutation/shardPartition.ts:11`) and can be lifted if a surface outgrows serial. Filed as a documented limit (§7 L-4), not a gap. | §2.2, §7 |
| R7 | **Enrollment is opt-in per surface via an explicit registry row.** No discovery, no inference from path or filename. A surface not in the registry is untouched. | §3.7 |
| R8 | **The gate does not compute or assert code coverage.** Mutation score and line coverage are different measurements; conflating them is out of scope. | §7 L-5 |

---

## 2. Probe results (measured before design, per `docs/agents/spec-self-review.md:21` and `docs/agents/spec-self-review.md:23`)

All three probes ran against `lib/specLint/taskContract.ts` (250 lines) with suite `tests/specLint/taskContract.test.ts` (36 tests, 250 ms) on 2026-08-04.

### 2.1 Cost

| Probe | Mutants | Killed | Survived | No-ops | Wall | Raw score |
| --- | --- | --- | --- | --- | --- | --- |
| #1 text-scan operators | 78 | 49 | 29 | 0 | 85.8 s | 62.8% |
| #3 AST operators + overlay | **102** | **71** | **31** | **0** | **76.6 s** | **69.6%** |

76.6 s against roughly 50 minutes of dispatch across five whole-diff review rounds. Cost scales with *that surface's* suite, not the repo's.

### 2.2 The execution mechanism is falsifiable, and was falsified

A mutation runner that silently fails to apply its mutant reports a perfect score and is worthless. The overlay was therefore proved live before adoption:

| Run | Expected | Observed |
| --- | --- | --- |
| clean source through the overlay | 36 pass | 36 pass |
| `kind !== "plan"` → `kind === "plan"` | suite fails | **29 failed / 7 passed** |
| `h.depth <= depth` → `h.depth < depth` (known survivor) | 36 pass | 36 pass |
| tracked source after the run | untouched | `git status --porcelain` empty |

The mechanism is a Vite `load`-hook plugin returning mutant text for the target module id (§3.3). **The tracked source file is never written to** — no dirty-tree hazard, no crash-leaves-a-mutant-on-disk failure mode.

### 2.3 AST enumeration beats text scanning (ratifies R3)

| | Text scan | AST walk |
| --- | --- | --- |
| Sites found | 78 | 102 |
| `integer-literal` sites inside a message string (`taskContract.ts:129`) | 1 (false) | **0** |
| Masking code required for comments / TS generics / `=>` | hand-written, per-construct | none |

The AST walk additionally found a survivor the text scan missed: **removing `findings.sort(...)` entirely (`taskContract.ts:246`) survives the suite** — nothing pins deterministic finding order, on code that passed five rounds of adversarial review.

### 2.4 Baseline survivor classification

31 survivors = **11 genuine gaps + 18 equivalent mutants + 2 accepted gaps**. Full table in §4.2. Each equivalence is a *claim* and carries its argument plus a citation; one worked example, verified during this spec's drafting:

> The L174 `break;` removal is **equivalent** because `model.headings` is built by a single ascending loop (`lib/specLint/parse.ts:86`, with the push at `lib/specLint/parse.ts:134`), so with `end = Math.min(end, h.line)` the first match is already the minimum and continuing the loop cannot lower it.

Five of those equivalences were **not** obvious at first classification and were caught by re-derivation plus probe (R1). They are recorded here because they are the spec's own worked demonstration that "survivor" and "gap" are different words:

| site | why it is equivalent |
| --- | --- |
| L33, L39 (`{0,3}`→`{0,4}`) | `MARKER` and `MARKER_AC_ABSENT` only ever run on lines already admitted by `MARKER_ANY` (`taskContract.ts:22`, itself `{0,3}`), so every candidate has ≤3 leading spaces and widening their own bound admits nothing |
| L142 (`i = 0`→`1`) | the loop adds every marker-shaped line regardless of fencing; a marker-shaped line on document line 1 cannot be fenced (no fence can open before line 1, and a fence-opening line is backticks/tildes so it can never itself be marker-shaped), so line 1 is already in `markerLines` from pass 1 |
| L247 `-1`→`-2`, `1`→`2` | `Array.prototype.sort` observes a comparator result's **sign**, never its magnitude |

### 2.5 The comparator survivors, and the probe that split them

All three comparator mutants — `a.code < b.code` → `<=`, `a.code > b.code` → `>=`, and `: 0` → `: 1` — differ from clean behavior **only** for two findings sharing an identical `(docLine, code)` pair, because the code branch is reached only when `a.docLine - b.docLine` is `0`. Such a pair is reachable: `ac=AC-90,AC-91` with both ids unresolved yields two `TASK_AC_UNRESOLVED` on one line.

They do **not** share a disposition, and the reason is a methodological trap worth recording.

The first probe sorted elements that were identical in *every* field. Under that fixture all three mutants looked unobservable:

```text
exhaustive:  all 40320 permutations of 8 elements sharing one (docLine, code)  -> difference: false
randomized:  n up to 200, 30 trials per n                                      -> difference: false
```

**That fixture could not have detected a reversal**: swapping two indistinguishable elements produces an indistinguishable array. Real findings share `(docLine, code)` while differing in `message`. Re-probed against the real `checkTaskContract` on `node v20.20.1` with the document above:

```text
clean   AC-90,AC-91
<=      AC-91,AC-90      <- observably reversed
>=      AC-90,AC-91
: 0->1  AC-90,AC-91
```

So the dispositions split:

- **`<`→`<=` is a genuine gap.** V8 returns `-1` for the equal pair and reverses them; a full-output assertion that compares `message` kills it. It joins group I in §4.2.
- **`>`→`>=` and `: 0`→`: 1` are `accepted-gap`**, not `equivalent`. They survived both the equal-key permutation probe and the real-surface probe, but "provably no observable difference" would still overclaim: an inconsistent comparator is implementation-defined in ECMA-262, so the argument rests on V8's stable sort rather than on control flow — an engine fact pinned to a runtime version, not a proof. As `accepted-gap` they depress the score and give the first enrolled surface a real instance of that ledger kind (§3.5).

The lesson generalizes and is the reason this section exists: **a probe whose fixture cannot express the difference it is looking for reports "no difference" and looks like evidence.** Any equivalence claim resting on a probe must state what the fixture varies, and vary the field the mutant could actually move.

This is also the spec's worked example of the consequence bound in §6.2: the worst case was a conservative classification plus a visible ledger row, corrected by a better probe — never a silent absorption.

---

## 3. Mechanism

### 3.1 The operator set (the accept-set)

Closed, declared, six operators. Each row states exactly what it rewrites and the authoring mistake it models.

| Operator | AST node | Rewrite | Models |
| --- | --- | --- | --- |
| `relational-boundary` | `BinaryExpression` operator token | `<`↔`<=`, `>`↔`>=` | off-by-one on a boundary |
| `equality-flip` | `BinaryExpression` operator token | `===`↔`!==` | inverted equality test |
| `logical-connector` | `BinaryExpression` operator token | `&&`↔`\|\|` | wrong connective |
| `integer-literal` | `NumericLiteral` (integer only) | `n` → `n+1` | wrong constant / index |
| `regex-quantifier-bound` | `{m,n}` inside `RegularExpressionLiteral`, `StringLiteral`, or template literal parts | `{m,n}` → `{m,n+1}` | widened pattern bound |
| `statement-removal` | `ExpressionStatement`, `ContinueStatement`, `BreakStatement` | delete the node | dropped/forgotten statement |

**Accept-set discipline** (`docs/agents/spec-self-review.md:38`): the set is keyed on AST node kind, never on spelling. Anything outside it is rejected by name — the generator emits only these six, and a claimed gap outside them is an operator proposal (§6.3), not a finding.

`integer-literal` applies only where the AST says `NumericLiteral`, which is why message copy (`taskContract.ts:129`) and regex character classes produce no sites. `regex-quantifier-bound` is the *only* operator that reaches inside literal text, and only for the `{m,n}` shape.

### 3.2 Site enumeration

`ts.createSourceFile(path, text, ES2022, /*setParentNodes*/ true, ts.ScriptKind.TS)`, then `ts.forEachChild` recursion. Each site is `{ operator, start, end, replacement, line, from, to }` with `start`/`end` absolute character offsets; a mutant is `text.slice(0,start) + replacement + text.slice(end)`.

**Site id** is `` `${operator}:${line}:${column}:${from}>${to}` `` — stable across unrelated edits to other lines, and the ledger key. Line-number drift when the surface is edited is expected and is handled by reconciliation (§3.5), which reports it as a stale row plus a new alarm rather than silently absorbing it.

### 3.3 Mutant execution

Per mutant: write the mutant text to a scratch file, spawn `vitest run --config <overlay config>` with the surface's suite, restore nothing (the tracked file was never touched). The overlay config registers one plugin:

```ts
{
  name: "mutant-overlay",
  enforce: "pre",
  load(id) { return id.split("?")[0] === TARGET_ABS ? mutantSource : null; },
}
```

`load` receives the resolved absolute module id, so no alias-resolution subtleties and no interference with the target's own imports (`./parse`, `./types`).

### 3.4 Oracle

| Condition | Verdict |
| --- | --- |
| mutant text byte-identical to original | `NO_OP` — **hard error**, fails the gate |
| suite exits non-zero | `KILLED` |
| suite exits zero | `SURVIVED` |

`NO_OP` is a hard error, not a skip: a generator producing no-ops is silently inflating its own denominator. The parser harness takes the same posture (`tests/parser/mutationHarness.shard0.test.ts:31-33` asserts `noOps` is empty). Measured no-ops on the first surface: **0**.

A suite that fails on the *unmutated* source makes every verdict meaningless, so the runner establishes a **clean baseline first** and aborts the whole run if the unmutated source does not pass.

### 3.5 The accepted-survivor ledger

Shape follows the parser harness (`tests/parser/mutation/knownHoles.ts:2-6`), with the kind split from R5:

```ts
type AcceptedSurvivor = {
  siteId: string;                       // §3.2
  kind: "equivalent" | "accepted-gap";
  reason: string;                       // the argument, with a file:line citation
  ref?: string;                         // BL-*/DEF-* id; REQUIRED for accepted-gap
};
```

- `equivalent` — the mutant provably cannot change observable behavior. Excluded from the score denominator. `reason` must carry the argument and a citation (worked example in §2.4).
- `accepted-gap` — a real gap, deliberately uncovered. Counted as **survived**; depresses the score. `ref` is required so the debt is tracked.

**Kind lifecycle** (`docs/agents/spec-self-review.md:17` — no column may be empty, or the kind is a zombie):

| kind | storage | write path | read path | actual effect on output |
| --- | --- | --- | --- | --- |
| `equivalent` | ledger row on a registry entry | authored by hand when a survivor is shown unable to change observable behavior; `reason` carries the argument + citation | score-denominator filter; registry meta-test | removed from the denominator; not an unaccepted survivor |
| `accepted-gap` | ledger row on a registry entry | authored when a real gap is deliberately deferred; `ref` required | score denominator (counted as a survivor); registry meta-test enforces `ref` | depresses the score; not an unaccepted survivor |

Both kinds have a real instance on the first enrolled surface (§4.2: 18 `equivalent`, 2 `accepted-gap`), so neither ships with an unexercised read path. Had `accepted-gap` had no real instance, the unit tests would have been required to exercise it through a fixture ledger — an empty-list-only read path is the same defect wearing a different hat.

Reconciliation is the bidirectional set diff already proven in `reconcileLedger` (`tests/parser/mutation/knownHoles.ts:43-71`): `newAlarms` (actual ∖ ledger) and `staleRows` (ledger ∖ actual). A stale row fails the gate — a ledger that outlives its survivor is how a ratchet rots.

An `equivalent` claim cannot be machine-verified (equivalence is undecidable). The gate enforces what it can — the row exists, names a declared operator, and carries a non-empty reason — and the claim itself is reviewed. This is stated, not hidden: see §7 L-1.

### 3.6 Score and gate

```
score = killed / (killed + acceptedGap + unaccepted)      # equivalent excluded
```

The gate **fails** on any of:

1. any `NO_OP` mutant (§3.4);
2. the unmutated baseline not passing (§3.4);
3. any **unaccepted survivor** (a survivor with no ledger row);
4. any **stale ledger row** (a ledgered site that no longer survives, or no longer exists);
5. `score < floor` for that surface;
6. **the run produced zero mutants, or `score` is not a finite number.**

(3) is the primary gate. (5) is a secondary ratchet that bites when real gaps are blessed as `accepted-gap` — blessing them as `equivalent` instead is a *false claim*, which (5) cannot catch and review must, which is exactly why the two kinds are distinct.

**(6) exists because conditions 1–5 are all vacuously satisfiable.** A surface enrolled with an empty `operators` list generates no mutants, so `killed + acceptedGap + unaccepted` is `0`, `score` is `0/0 = NaN`, and `NaN < floor` is **false** — every listed failure condition passes and the gate reports green on a surface it never tested. Probed:

```sh
node -e 'const k=0,a=0,u=0,f=.95;const s=k/(k+a+u);console.log({score:String(s),belowFloor:s<f,gateFails:s<f||u>0})'
# { score: 'NaN', belowFloor: false, gateFails: false }
```

A guard whose own failure mode is "reports success while measuring nothing" is the exact defect class this arc exists to remove, so it is closed at the gate (condition 6) **and** at the registry (§3.7: at least one declared operator) — two independent layers, because the registry check is static and cannot see a run that generated zero mutants for some other reason (an empty source file, a suite matching no files).

### 3.7 Registry

```ts
type GuardSurface = {
  id: string;
  sourcePath: string;                 // repo-relative
  suitePaths: string[];               // repo-relative
  operators: OperatorName[];          // subset of §3.1, declared per surface
  scoreFloor: number;                 // 0..1
  accepted: AcceptedSurvivor[];
};
```

Enrollment is opt-in (R7). A **merge-blocking structural meta-test** (cheap, DB-free, no mutants run) pins: every `sourcePath`/`suitePath` exists on disk; **`operators` is non-empty**; every declared operator is implemented; **`suitePaths` is non-empty**; `scoreFloor` is a finite number in `(0, 1]`; every ledger row names a declared operator; every row has a non-empty reason; every `accepted-gap` row has a `ref`.

The non-empty checks are not defensive boilerplate — an empty `operators` list is precisely what makes the §3.6 gate pass vacuously, so this row and §3.6 condition 6 close the same hole from the static and dynamic sides.

---

## 4. First customer — `lib/specLint/taskContract.ts`

### 4.1 Why this surface

250 lines, freshly merged, 36-test suite at 250 ms, and it survived five rounds of adversarial review — so its residual debt is representative of what review leaves behind rather than of an unreviewed surface.

### 4.2 Survivor disposition

**11 genuine gaps**, repaid by test in this arc. Every fixture below was executed against clean `checkTaskContract` before this spec was written; "clean" is observed output, not intent.

| Group | Sites | Behavior no test pins today | clean output of the repair fixture |
| --- | --- | --- | --- |
| A | L20, L22 (`{0,3}`→`{0,4}`) | a 4-space-indented `end` / marker line is an indented code block and must NOT be recognized | `L6:TASK_MARKER_MISSING` / `L3:TASK_MARKER_MISSING` |
| B | L51 (`i = 0`→`1`) | an AC id occurring only on document line 1 still resolves | `(no findings)` |
| D | L63 (`column: 1`→`2`) | findings report `column: 1` | `col1` |
| E | L114 (`rejectedOpens--` removed) | the decrement consumes **one** close per rejected open, not every subsequent close | `L5:TASK_ENROLL_DUPLICATE, L8:TASK_ENROLL_MALFORMED` |
| F | L172 (`h.depth <= depth`→`<`) | an extent ends at the next heading of the enrolled depth **or shallower**, so a same-depth sibling ends it | `(no findings)` |
| G | L204 (`ms[1]`→`ms[2]`) | `TASK_MARKER_DUPLICATE` is reported on the **second** marker's line | `L5:TASK_MARKER_DUPLICATE` |
| H | L217 (`continue` removed) | precedence §3.3: a `TASK_RED_EMPTY` line draws exactly one code, not also `TASK_AC_UNRESOLVED` | `L4:TASK_RED_EMPTY` |
| I | L246 (sort removed), L247 (`\|\|`→`&&`) | findings are ordered by `docLine`, then by `code` | `[L4, L7]` where emission order is `[L7, L4]` |

| J | L247 (`<`→`<=`) | two findings sharing `(docLine, code)` keep their relative order | `AC-90,AC-91`; the mutant yields `AC-91,AC-90` |

Group I is the headline: **`findings.sort(...)` can be deleted outright and the suite still passes.** Its fixture needs a pass-1 finding on a LATE line plus a pass-2 finding on an EARLIER one; a duplicate opening cannot seed it, because `openCount !== 1` returns at `taskContract.ts:152` before any pass-2 finding exists. A malformed `<!-- tasks: … -->` line is the pass-1 finding that leaves `openCount` undisturbed.

Group J is the R2 correction (§2.5). Its assertion must compare the findings' **`message`** values, not merely `code` and `docLine` — a code-only assertion is exactly the fixture blindness that made this mutant look equivalent in the first place.

There is no group C: the site formerly listed there (L142) is equivalent (§2.4).

**18 equivalent mutants**, each ledgered with argument and citation: L51 rel, L79, L80, L83 rel, L132, L142 rel, L142 int, L146, L155 ×2, L174, L184 ×2, L198, L33, L39, L247 `-1`→`-2`, L247 `1`→`2`.

**2 accepted gaps** (§2.5): L247 `>`→`>=` and L247 `: 0`→`: 1`. Both carry `ref: "BL-TASKCONTRACT-SORT-COMPARATOR-EQUALKEY"`, filed in `BACKLOG.md` by this arc — the `ref` is required by §3.7, so the backlog row is part of the diff, not a promise.

### 4.2.1 Why five review rounds left this behind

Two cases, because they are the thesis in miniature — a test that exists, is well named, and pins strictly less than its name claims:

1. **`tests/specLint/taskContract.test.ts:106`** — `it("M36/AC-39: 1-3 spaces of indentation are recognised, 4 are not")`. Its 4-space case exercises the `OPEN` regex only, and its 3-space case still passes when a bound widens to `{0,4}` (3 ≤ 4 either way). So the `OPEN` mutant dies while the `END` and `MARKER_ANY` mutants survive — the test's own name claims the coverage the gate shows is absent.
2. **`tests/specLint/taskContract.test.ts:56`** — `it("M27/AC-30: a rejected duplicate's close is consumed silently")` uses exactly ONE surplus close. Removing `rejectedOpens--` is invisible with one; it takes a second surplus close to observe. The test pins "consumed", not "consumed once".

Neither is a sloppy test. Both are the ordinary result of writing assertions from intent rather than from a falsifier — the class a mutation score decides mechanically and a reviewer's imagination does not.

### 4.3 Targets

This is the single source of truth for the arithmetic; every count elsewhere in the spec references it.

| bucket | count | in denominator? |
| --- | --- | --- |
| killed at baseline | 71 | yes |
| genuine gaps repaid by test (§4.2) | 11 | yes — they become killed |
| equivalent (§2.4) | 18 | **no** |
| accepted-gap (§2.5) | 2 | yes, as survivors |
| unaccepted | 0 | yes |

Survivors reconcile: 11 + 18 + 2 = **31**, matching the measured baseline in §2.1.

Post-repair: killed = 71 + 11 = **82**; denominator = 82 + 2 + 0 = **84**; score = 82/84 = **97.6%**.

`scoreFloor` is set to **0.95**, and its sensitivity is stated exactly rather than rhetorically:

```text
82 / (82 + 2) = 0.9762   ships
82 / (82 + 3) = 0.9647   passes
82 / (82 + 4) = 0.9535   passes
82 / (82 + 5) = 0.9425   BREACHES
```

So the floor is a **coarse** ratchet: from the shipping state it takes three further blessed gaps to red the gate, not one. It bounds wholesale ledger abuse — a surface quietly blessing its way to green — and nothing finer. A single wrong ledger row is NOT caught by the floor and is not meant to be; that is what the mandatory per-row argument, the `ref` requirement, and review of the ledger are for (§3.5, §7 L-1). Saying otherwise would overstate the mechanism, which is the failure mode this whole document exists to remove.

---

## 5. Wiring

| Surface | Change |
| --- | --- |
| `vitest.projects.ts:83` | add the gate file to `MUTATION_TEST_GLOBS` |
| `vitest.projects.ts:84` | add it to `NIGHTLY_ONLY_EXCLUDES` |
| `vitest.projects.ts:90-124` | add `tests/mutation/**/*.test.{ts,tsx}` to `PARALLEL_TEST_GLOBS` (the unit tests are pure; the gate file is excluded from both default projects by the line above) |
| `package.json` | `"mutation:guards": "VITEST_INCLUDE_MUTATION_HARNESS=1 vitest run --project mutation tests/mutation/guardSurfaces.gate.test.ts"` — the on-demand entry point, byte-identical in mechanism to the nightly job (`.github/workflows/mutation-harness.yml:51-54`) and differing only by file filter. An earlier draft invented a separate gate config file; two mechanisms for one job is how they drift. |
| `.github/workflows/mutation-harness.yml:13-32` | add `tests/mutation/**` to the `pull_request` path filter; the existing nightly job already runs `--project mutation` |
| `tests/cross-cutting/vitest-projects-partition.test.ts:200-202` | **bump the nightly-file count from 9 to 10 and update its message** — required, not optional (see below) |

`tests/cross-cutting/vitest-projects-partition.test.ts:177-222` requires every non-nightly test file to resolve to exactly one default project, satisfied by the three `vitest.projects.ts` rows above.

The count assertion at `tests/cross-cutting/vitest-projects-partition.test.ts:200-202` is a **companion change this spec previously omitted**, and the omission was a factual error rather than a judgement call:

```
expect(nightlyCount, "exactly the 9 nightly harness files live in no default project").toBe(9)
```

`nightlyCount` counts every file matching *any* `NIGHTLY_ONLY_EXCLUDES` entry, so adding the gate file makes it 10 and the assertion fails. Verified against the live test:

```sh
node -e 'const{readdirSync}=require("node:fs");const f=readdirSync("tests/parser").filter(x=>/^mutationHarness\..+\.test\.ts$/.test(x));console.log({current:f.length,afterProposedGate:f.length+1})'
# { current: 9, afterProposedGate: 10 }
```

The neighbouring harness-shape check at `tests/cross-cutting/vitest-projects-partition.test.ts:304-312` is unaffected: it filters on the literal `tests/parser/mutationHarness.*.test.ts` pattern, which the new file does not match. That asymmetry — one count is pattern-scoped and survives, the sibling is glob-scoped and does not — is exactly why the change has to be named per-assertion rather than as "update the partition test".

`tests/ci/_metaSpecRegistration.test.ts:189` covers Playwright discovery and subtracts `*.test.ts`, so no action is needed there.

---

## 6. The convergence criterion (the payload)

### 6.1 AGENTS.md change

The round-economy section (`AGENTS.md:251-258`) gains a third bullet alongside the consequence bound and the threat-model fence:

> **3. Score, for an enrolled surface.** When the subject is a guard surface enrolled in the source-mutation registry, the review's convergence criterion is stated as its mutation score and an empty unaccepted-survivor set. A "the guard does not pin X" finding is admissible only with the **surviving mutant** that demonstrates it — operator and site, from the declared set. If no declared operator produces a surviving mutant for the claimed gap, the finding is refuted or is an operator proposal (§6.3), not a round.

### 6.2 Consequence bound and threat-model fence

Restated here so a brief can cite this section rather than re-derive it:

- **Consequence bound.** Every mutant is killed, ledgered with a reason, or fails the gate — never silently uncounted. A survivor that turns out to be equivalent is a **documented limit**, not a finding.
- **Threat-model fence.** The operator set models **ordinary authoring mistakes by a contributor** — off-by-one, inverted comparison, wrong constant, dropped statement. Adversarial rewrites, semantic refactors, and multi-site coordinated changes are **out of scope** and file to documented limits.

### 6.3 Proposing an operator

A gap outside the declared set is closed by adding an operator: a registry-level change with its own before/after mutation numbers, not a review round on the current diff. This is the escape valve that keeps the accept-set honest without letting the set ratchet open mid-review.

---

## 7. Documented limits (carried from round 0)

| id | Limit | Consequence |
| --- | --- | --- |
| L-1 | `equivalent` claims are not machine-verifiable (equivalence is undecidable) | A wrong `equivalent` row hides a real gap. Mitigated by requiring the argument + citation, and by review of ledger rows specifically. Never silently wrong: the row is visible in the ledger. |
| L-2 | Single-site mutants only — no coordinated multi-site mutants | Bugs requiring two simultaneous edits are not modeled. Out of scope per the fence (§6.2). |
| L-3 | A mutant that makes the surface fail to compile is scored `KILLED` | Type errors count as detection. Defensible (the typechecker is part of the suite's gate) and stated so it is not re-derived. |
| L-4 | Serial execution; ~0.75 s/mutant | A much larger surface would need the parser harness's sharding (`tests/parser/mutation/shardPartition.ts:11`). Deferred, not overlooked (R6). |
| L-5 | Mutation score is not code coverage | The gate makes no coverage claim (R8). |
| L-6 | The score is only as meaningful as the enrolled suite | A surface whose suite asserts nothing scores 0% and reds immediately — the failure mode is loud, not silent. |
| L-7 | The two `accepted-gap` rows of §2.5 rest on V8's sort behavior for an inconsistent comparator, pinned by probe on `node v20.20.1`, not on a control-flow proof | ECMA-262 leaves an inconsistent comparator implementation-defined. A future engine could observably reorder equal keys, at which point both mutants become killable and their rows go stale — which the gate reports (§3.6 condition 4) rather than absorbing. This is why they are `accepted-gap` and not `equivalent`. |
| L-8 | An equivalence claim resting on a probe is only as strong as what its fixture VARIES | The R2 correction (§2.5): a permutation probe over elements identical in every field reported "no difference" for a mutant that observably reorders real findings, because the fixture could not express the difference. Any probe-backed `equivalent` row must state which field it varied, and vary the one the mutant could move. |
| L-9 | A mutant that never TERMINATES is scored `KILLED` after a 180 s per-suite ceiling (`tests/mutation/source/runner.ts`, `MUTANT_TIMEOUT_MS`) | Added 2026-08-15 (`fix/ui-interactive-token-policy`) after a real one: `statement-removal` of `cursor = cursor.parent;` inside `while (cursor)` in `tests/styles/interactiveScanCore.ts` ran 1h48m on ONE mutant with 0 of 207 scored, and four wedged children from other arcs were alive on the same machine (2h28m–5h43m). Counting a timeout as detection is the standard convention (Stryker, PIT) and is defensible here for the same reason as L-3: a guard that stops terminating never goes green again, so the mutant cannot ship silently. The ceiling is 90x a measured healthy run, so a timeout means a hang, not a slow machine. It is discriminated from an infra death by `code === "ETIMEDOUT"` alone — a reaper SIGTERM still throws `MutantRunInfraError` and stays fatal. |

---

## 8. Acceptance criteria

- **AC-1** The operator set is exactly the six of §3.1, declared in one exported constant; a structural test pins that the implemented operators and the declared names are the same set.
- **AC-2** Site enumeration is AST-based; a test asserts **zero** `integer-literal` sites inside string/template literals for a fixture containing a digit in a message string.
- **AC-3** The overlay applies the mutant: a test runs a known-killing mutant and asserts the suite fails, and runs the clean source and asserts it passes. (Guards the §2.2 falsification permanently.)
- **AC-4** The runner never writes to the target source file: a test asserts the file's bytes are unchanged after a run.
- **AC-5** A `NO_OP` mutant fails the gate.
- **AC-6** A failing unmutated baseline aborts the run rather than scoring mutants.
- **AC-7** An unaccepted survivor fails the gate.
- **AC-8** A stale ledger row fails the gate.
- **AC-9** `score < scoreFloor` fails the gate.
- **AC-10** `equivalent` rows are excluded from the score denominator; `accepted-gap` rows are included as survivors. Tested with a fixture ledger of each kind.
- **AC-11** The structural meta-test (§3.7) fails on each of: a missing `sourcePath`, an **empty `operators` list**, an **empty `suitePaths` list**, a `scoreFloor` outside `(0, 1]`, an undeclared operator in a ledger row, an empty `reason`, and an `accepted-gap` row with no `ref`. Each case flips exactly one field of an otherwise-valid registry row.
- **AC-12** `lib/specLint/taskContract.ts` is enrolled, and every group A, B, D, E, F, G, H, I, J of §4.2 is repaid by a test in `tests/specLint/taskContract.test.ts` that **fails against the corresponding mutant and passes against clean source** — demonstrated by running the mutant, not asserted in prose. Group J's assertion compares finding `message` values, not `code` alone.
- **AC-13** After repair the surface reports 0 unaccepted survivors, exactly 18 `equivalent` and 2 `accepted-gap` ledger rows, and score ≥ `scoreFloor` (0.95). The measured value is 82/84 = 97.6% (§4.3).
- **AC-14** `AGENTS.md` carries the §6.1 third bullet.
- **AC-15** The gate file is absent from both default vitest projects and present in the `mutation` project, and `tests/cross-cutting/vitest-projects-partition.test.ts:200-202` counts 10 nightly files (§5).
- **AC-16** A registry row with an empty `operators` list **fails**, at both layers independently: the structural meta-test rejects it (AC-11), and a gate run that produced zero mutants fails on §3.6 condition 6 rather than computing `NaN` and passing. The gate-side case is tested by driving the gate with a zero-mutant result directly, so it holds even if the registry check is bypassed.
- **AC-17** A non-finite `score` fails the gate. Asserted against the literal `0/0` case, since `NaN < floor` is `false` and would otherwise pass every other condition.

---

## 9. Out of scope

- Enrolling any surface other than `lib/specLint/taskContract.ts`. Enrollment is per-surface and opt-in (R7); a second customer is a follow-up.
- Parallel/sharded execution (R6, L-4).
- Changing, refactoring, or extending the parser fixture-mutation harness (R1).
- Code-coverage measurement (R8, L-5).
- Any UI surface. **`impeccable-gate: N/A — no UI surface`** — this arc touches no file under `app/`, `components/`, `app/globals.css`, `tailwind.config.*`, or `DESIGN.md`.
- Any DB surface: no migration, no RPC, no table, no CHECK. The tier×domain and CHECK/enum matrices of `docs/agents/spec-self-review.md:15-16` are **N/A** for this spec.
- No React component, so guard-conditions-per-prop, mode boundaries, dimensional invariants and the transition inventory (`docs/agents/spec-self-review.md:7-12`) are **N/A**.
- No boolean config flag, so the flag-lifecycle table (`docs/agents/spec-self-review.md:17`) is **N/A**.
