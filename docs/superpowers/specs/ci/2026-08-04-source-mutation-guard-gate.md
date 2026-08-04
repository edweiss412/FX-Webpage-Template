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

31 survivors = **18 genuine gaps + 13 equivalent mutants**. Full table in §4.2. Each equivalence is a *claim* and carries its argument plus a citation; one worked example, verified during this spec's drafting:

> The L174 `break;` removal is **equivalent** because `model.headings` is built by a single ascending loop (`lib/specLint/parse.ts:86`, with the push at `lib/specLint/parse.ts:134`), so with `end = Math.min(end, h.line)` the first match is already the minimum and continuing the loop cannot lower it.

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
5. `score < floor` for that surface.

(3) is the primary gate. (5) is a secondary ratchet that bites when real gaps are blessed as `accepted-gap` — blessing them as `equivalent` instead is a *false claim*, which (5) cannot catch and review must, which is exactly why the two kinds are distinct.

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

Enrollment is opt-in (R7). A **merge-blocking structural meta-test** (cheap, DB-free, no mutants run) pins: every `sourcePath`/`suitePath` exists on disk; every declared operator is implemented; every ledger row names a declared operator; every row has a non-empty reason; every `accepted-gap` row has a `ref`.

---

## 4. First customer — `lib/specLint/taskContract.ts`

### 4.1 Why this surface

250 lines, freshly merged, 36-test suite at 250 ms, and it survived five rounds of adversarial review — so its residual debt is representative of what review leaves behind rather than of an unreviewed surface.

### 4.2 Survivor disposition

18 genuine gaps, repaid by test in this arc, grouped by the behavior they pin:

| Group | Sites | Behavior no test pins today |
| --- | --- | --- |
| A | L20, L22, L33, L39 (`{0,3}`→`{0,4}`) | a 4-space-indented enrollment/marker line is an indented code block and must NOT be recognized |
| B | L51 (`i = 0`→`1`) | an AC id occurring only on line 1 still resolves |
| C | L142 (`i = 0`→`1`) | a fenced marker-shaped line on line 1 still joins `markerShaped` |
| D | L63 (`column: 1`→`2`) | findings report `column: 1` |
| E | L114 (`rejectedOpens--` removed) | the decrement consumes **one** close per rejected open, not every subsequent close |
| F | L172 (`h.depth <= depth`→`<`) | an extent ends at the next heading of the enrolled depth **or shallower**, so a same-depth sibling ends it |
| G | L204 (`ms[1]`→`ms[2]`) | `TASK_MARKER_DUPLICATE` is reported on the **second** marker's line |
| H | L217 (`continue` removed) | precedence §3.3: a `TASK_RED_EMPTY` line draws exactly one code, not also `TASK_AC_UNRESOLVED` |
| I | L246 (sort removed), L247 ×6 | findings are ordered by `docLine`, then by `code` |

Group I is the headline: **`findings.sort(...)` can be deleted outright and the suite still passes.**

13 equivalent mutants, ledgered with argument and citation: L51 rel, L79, L80, L83 rel, L132, L142 rel, L146, L155 ×2, L174, L184 ×2, L198.

### 4.3 Targets

Post-repair: killed 71 + 18 = **89**; equivalent 13 excluded; `accepted-gap` **0**; unaccepted **0**; score **89/89 = 100%**. `scoreFloor` is set to **0.95**, leaving headroom so an ordinary later edit does not red the nightly on arithmetic alone.

---

## 5. Wiring

| Surface | Change |
| --- | --- |
| `vitest.projects.ts:83` | add the gate file to `MUTATION_TEST_GLOBS` |
| `vitest.projects.ts:84` | add it to `NIGHTLY_ONLY_EXCLUDES` |
| `vitest.projects.ts:90-124` | add `tests/mutation/**/*.test.{ts,tsx}` to `PARALLEL_TEST_GLOBS` (the unit tests are pure; the gate file is excluded from both default projects by the line above) |
| `package.json` | `"mutation:guards": "vitest run --config tests/mutation/source/gate.config.ts"` — the on-demand entry point |
| `.github/workflows/mutation-harness.yml:13-32` | add `tests/mutation/**` to the `pull_request` path filter; the existing nightly job already runs `--project mutation` |

`tests/cross-cutting/vitest-projects-partition.test.ts:177-222` requires every non-nightly test file to resolve to exactly one default project, satisfied by the three `vitest.projects.ts` rows above. The harness-shape check at `tests/cross-cutting/vitest-projects-partition.test.ts:304-312` matches only `tests/parser/mutationHarness.*.test.ts` and is unaffected. `tests/ci/_metaSpecRegistration.test.ts:189` covers Playwright discovery and subtracts `*.test.ts`, so no action is needed there.

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
- **AC-11** The structural meta-test (§3.7) fails on: a missing `sourcePath`, an undeclared operator in a ledger row, an empty `reason`, and an `accepted-gap` row with no `ref`.
- **AC-12** `lib/specLint/taskContract.ts` is enrolled, and every group A–I of §4.2 is repaid by a test in `tests/specLint/taskContract.test.ts` that **fails against the corresponding mutant and passes against clean source**.
- **AC-13** After repair the surface reports 0 unaccepted survivors and score ≥ `scoreFloor` (0.95).
- **AC-14** `AGENTS.md` carries the §6.1 third bullet.
- **AC-15** The gate is absent from both default vitest projects and present in the `mutation` project (pinned by the existing partition test).

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
