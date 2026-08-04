# Guard premise reachability — design

**Status:** draft · **Filed:** 2026-08-04 · **Branch:** `chore/guard-premise-reachability` · **Ledger:** `BL-GUARD-PREMISE-REACHABILITY`

A guard that cannot fail is worse than no guard: it occupies the slot where a real one would go, and it reports green forever. PR #701 shipped two of them inside one branch, both caught by a reviewer rather than by any gate. This spec closes that class where it is closable, and says plainly where it is not.

---

## 1. The evidence

Every claim in this section was established by probe. Commands and outputs are in §1.5.

### 1.1 Instance one — the unreachable boundary (whole-diff R11 F3)

A test advertised as the guard for the mutant `claims: res.claims.slice(0, 100)` ran the real CLI against the live repository, which holds roughly thirteen claims. A cap at 100 is unreachable at 13, so the guard could not fail against the exact mutation it named. Repaired at `0b57d4a68` and `f7da7cc69` by exporting `reportEnvelope` (`scripts/ledger-claims.ts:44-50`) and feeding it a 101-claim fixture.

### 1.2 Instance two — the degenerate truth source (whole-diff R13 F3)

The same test file asserted the real git adapter resolved refs. Its history is the interesting part, because the vacuity was **introduced by repairing a red test**:

| commit | assertion | local | CI |
| --- | --- | --- | --- |
| `5f1a98a66` | `expect(local.size).toBeGreaterThan(0)` | passes | **fails** — CI has zero `refs/remotes/origin/*` |
| `f7da7cc69` | `expect(local.size).toBe(truth)`, `truth` counted by `git for-each-ref` in the same repository | passes | passes — **and so does the mutant** |
| `484824b9e` | assertion against a throwaway repository with a known ref namespace | passes | passes |

The middle row is the defect. Making an assertion environment-independent by asking the environment for the expected value collapses both sides together wherever the environment is degenerate.

### 1.3 What CI's checkout actually looks like

Not inferred from a comment. GitHub Actions run `30933500525`, `Unit + DB suite`, shard 8/8:

```
FAIL tests/scripts/ledgerClaimsCheck.test.ts > … > resolves real refs, and origin/HEAD is absent from both maps
AssertionError: no refs resolved from a real worktree: expected 0 to be greater than 0
```

CI checks this repository out with **zero** `refs/remotes/origin/*`.

### 1.4 What the PR #703 source-mutation gate does and does not cover

The gate (`tests/mutation/source/**`, registry `tests/mutation/source/registry.ts`, `pnpm mutation:guards`) was the first candidate answer. Probed against both instances:

**Instance one is structurally out of reach.** `reportEnvelope` (`scripts/ledger-claims.ts:44-50`) yields exactly one mutation site under the declared operator set — `integer-literal` on the `status: 0` literal. The named mutant inserts a `.slice(0, 100)` call, and no operator in `OPERATOR_NAMES` (`tests/mutation/source/operators.ts:17-24`) synthesizes a call expression. Enrollment can never generate it. This is a property of the closed operator set, which is deliberate (that spec's §6.3), not a defect in it.

**Instance two is generated, and the gate would have caught it — nightly.** `statement-removal` on `map.set(name, oid)` (`scripts/lib/ledger-git.ts:118`) produces exactly the escaping mutant the reviewer named. The gate runs inside `mutation-harness.yml` (`vitest.projects.ts:87` puts `tests/mutation/guardSurfaces.gate.test.ts` in the nightly-only project; `.github/workflows/mutation-harness.yml:53-55` runs it), which means it runs **in the zero-ref environment**, where the `f7da7cc69` assertion cannot discriminate — so the mutant would have been reported SURVIVED. That is genuinely more than the brief credited the gate with. It is also one nightly cycle late, on a check the workflow header states is not merge-gating.

**Enrollment does not cost one registry row today.** Two blockers, neither in that spec's documented-limits table (§7):

- `tests/mutation/source/mutantOverlay.config.ts` declares no `@` path alias. The root config does (`vitest.config.ts:150`). **1461 of 1788** test files in this repo import through `@/`, and every one of them fails `assertCleanBaseline` immediately.
- The same config declares no `testTimeout`. The root sets 30 000 ms (`vitest.config.ts:85-86`). Vitest's 5 000 ms default failed `tests/scripts/ledgerClaimsCheck.test.ts` on **unmutated** source.

Neither surfaced because the one enrolled surface's suite (`tests/specLint/taskContract.test.ts`) uses relative imports and fast tests.

**And the gate's own liveness control is single-surface.** `tests/mutation/guardSurfaces.gate.test.ts:116-120` builds `broken` by replacing the literal `if (kind !== "plan") return [];`, which exists only in `lib/specLint/taskContract.ts`, then asserts `broken !== source`. Inside a `describe.each` over the registry, that assertion fails for any second surface — enrolling one reds the gate. Worse, `broken` is then **never passed to `runSurface`**: the control run uses the surface's own operators, so the assertion proves only that a string exists in a file. Unit 2.1 repairs the shape.

### 1.4.1 What enrollment found that fourteen review rounds did not

The strongest argument for enrolling is not an argument. `statement-removal` on `git.fetch()` (`scripts/lib/ledger-claims-core.ts:137`) survives, and the test that exists to catch exactly that is `tests/scripts/ledgerClaimsCheck.test.ts:546-565`:

```ts
expect(calls.indexOf("fetch"), "fetch must precede the snapshot").toBeLessThan(
  calls.indexOf("localRefs"),
);
```

With the fetch deleted, `calls` is `["localRefs"]`, so `indexOf("fetch")` is `-1`, `indexOf("localRefs")` is `0`, and `-1 < 0` passes. Verified by applying the mutant and running that test alone: `1 passed`. A guard for the ordering of two events passes when the first event never happens.

That is a **third vacuity shape**, it was shipped through fourteen whole-diff rounds, and the gate found it in one run.

### 1.4.2 The overlay stops at the process boundary, and the score understates because of it

`statement-removal` on `degraded.push("no-fetch-cached-refs")` (`scripts/lib/ledger-claims-core.ts:142`) also survives — while `tests/scripts/ledgerClaimsCheck.test.ts:515` asserts exactly that string. Both are true at once, and the reason is structural: the overlay is a Vite `load` hook (`tests/mutation/source/overlay.ts:1-20`), so it serves mutant text to the **vitest process's module graph**. That test's assertion is made through `spawnSync(TSX_BIN, …)`, and the child process loads the tracked file, which #703's AC-4 guarantees is byte-identical.

Demonstrated from both sides, since one side alone proves nothing:

| delivery | verdict |
| --- | --- |
| the harness's overlay | SURVIVED |
| the same edit written to disk, that test run alone | `1 failed` |

The assertion is fully capable of catching the defect. Only the delivery differs. So **every assertion a suite makes through a spawned child contributes zero to its mutation score**, and a suite whose strongest guarantees are end-to-end scores lower than it deserves. This is not in #703's limits table; it is carried here as L-7 and it shapes the triage — a survivor of this kind is repaid by adding an in-process twin assertion, not by writing a test for behavior that is already tested.

### 1.5 Probe transcript

```
# operator sites on the ledger surface (enumerateSites, all six operators)
scripts/lib/ledger-git.ts         81 sites
scripts/lib/ledger-claims-core.ts 61 sites
scripts/ledger-claims.ts          68 sites
  reportEnvelope (lines 44-50) contains exactly one: integer-literal:49:20:0>1
  localRefs (line 118):           statement-removal:118:9:map.set(name, oid);>(removed)

# V2 arithmetic, against a controlled ref namespace
origin refs present=true   truth=3 clean.size=3 mutant.size=0  -> discriminates
origin refs present=false  truth=0 clean.size=0 mutant.size=0  -> VACUOUS

# alias usage across the suite corpus
1461 of 1788 test files import through "@/"

# baseline under the overlay config, unmutated source, before the fixes
FAIL … "emits every claim through the CLI's --json serialization, uncapped"
Error: Test timed out in 5000ms.
```

Numbers for the enrolled surfaces are in §3.2.2.

---

## 2. The class, named

Both instances are one defect wearing two faces. A guard's assertion has **discriminating power** only under some condition — a fixture large enough to cross a boundary, an environment rich enough to differ from empty. That condition is the test's **premise**. In both instances the premise was true when written, false where it ran, and stated nowhere.

- **V1, unreachable boundary.** The fixture cannot reach the value the assertion discriminates at. 13 claims against a cap of 100.
- **V2, degenerate truth source.** The expected value is derived from the same source as the actual value, and both collapse together. `truth = 0`, `size = 0`.
- **V3, sentinel-satisfied comparison.** An absent event is encoded as a sentinel that happens to satisfy the comparison. `indexOf` returns `-1`, and `-1` is less than every real index, so an ordering assertion holds when the first event never occurred (§1.4.1).
- **V4, premise for a mechanism since refactored away.** The assertion still guards a precondition, but the thing it was a precondition *for* no longer runs. `guardSurfaces.gate.test.ts:120` asserts a control mutation "applies" to a `broken` value the control run never receives (§1.4).
- **V5, the assertion never executes.** Not that it fails to discriminate — that it never runs at all, in exactly the case it exists for. `test.each([])` registers no case, so a premise in its callback is unreachable precisely when the producer is degenerate (§3.3.2.2). This one surfaced *inside the mechanism this spec proposes*, which is the strongest available evidence that the class is easy to re-enter while actively looking for it.

Five faces, one defect: the condition under which the assertion has discriminating power is unstated or unreachable, and nothing re-checks it when the surroundings move.

They are also not four separate mechanisms to build. V1's instance read the environment (it spawned the CLI against the live checkout), V2's read git, and V3's is caught by the mutation gate the moment its surface is enrolled. V4 is caught by making the control executable (§3.2.1).

**A further live instance of V2,** found by applying this taxonomy to the merged branch: `tests/scripts/ledgerClaimsCheck.test.ts:508-510` asserts `payload.claims.length` equals `core.claims.length`, both read from the live checkout. In CI both are zero and the assertion cannot distinguish a correct envelope from `claims: []`. It is the V2 shape exactly, still shipped, and it is this spec's first retro-application target (§3.3.4).

---

## 3. Design

Four units. Unit 1 is a prerequisite for Unit 2; Unit 3 is independent of both but is scoped by Unit 2's registry.

### 3.1 Unit 1 — overlay-config parity with the root config

`tests/mutation/source/mutantOverlay.config.ts` gains the `@` alias and the two timeouts. Both are taken from a **single shared definition** that the root config also consumes, so the two cannot drift apart again; a hand-copied constant is the same defect one release later.

- Shared definitions live in `vitest.projects.ts`, which is already the module both configs' wiring flows through.
- `vitest.config.ts` is refactored to consume them, so there is one definition and two readers, not three definitions.

**Guard, merge-gating.** A meta-test asserts the overlay config's resolved `resolve.alias` and `test.testTimeout` / `test.hookTimeout` equal the shared definitions. This can fail: reverting either value reds it.

**Guards, executable — and each one names its file and its execution owner.** Spec R9 found that the first draft named neither, which lands the fixtures in one of two failure modes and both are this spec's own subject at the wiring level: `BASE_INCLUDE` is `["tests/**/*.test.ts", …]` (`vitest.projects.ts:34`), so a fixture named `*.test.ts` is discovered by the default projects and runs on **every merge** — contradicting "nightly only" — while a fixture named anything else is discovered by nothing and is **dark**, a guard that cannot fail because it never runs.

So neither fixture is discovered. Both are named `*.fixture.ts`, which `BASE_INCLUDE` cannot match, and both are **invoked explicitly** through the overlay config, whose `include` is a single explicit path (`req("MUTATION_SUITE")`) and therefore does not care about the name:

| fixture | file | invoked by | runs |
| --- | --- | --- | --- |
| `@/` alias resolves | `tests/mutation/source/fixtures/aliasImport.fixture.ts (new)` | `tests/mutation/_metaOverlayConfigParity.test.ts (new)`, through the overlay config | every merge — it is fast |
| `testTimeout` exceeds vitest's 5 000 ms default | `tests/mutation/source/fixtures/slowTest.fixture.ts (new)` | `tests/mutation/guardSurfaces.gate.test.ts` | nightly only, because it sleeps ~5.2 s |

A wiring meta-test pins both halves, since "it is nightly-only" is otherwise a claim nobody checks: the default projects resolve **zero** files under `tests/mutation/source/fixtures/`, and `pnpm mutation:guards` executes the slow fixture. Merge-gating structural parity (above) covers the timeout **value** on every merge regardless, so a nightly-only executable proof is a second line rather than the only one.

### 3.2 Unit 2 — enroll the ledger surface

Two surfaces enrolled, each with a triaged `accepted` ledger and an honest `scoreFloor`, plus the per-surface row in `EXPECTED_LEDGER_KINDS` that `tests/mutation/guardSurfaces.gate.test.ts` requires.

| surface | suites | mutants | killed | score | survivors |
| --- | --- | --- | --- | --- | --- |
| `scripts/lib/ledger-claims-core.ts` | `tests/scripts/ledgerClaimsCheck.test.ts`, `tests/scripts/ledgerClaims.test.ts` | 61 | 38 | 0.623 | 23 |
| `scripts/lib/ledger-git.ts` | `tests/scripts/ledgerClaimsCheck.test.ts` | 81 | 40 | 0.494 | 41 |

Every survivor is dispositioned exactly one of three ways, and the count of each is stated in the plan:

- **killed** — a new test in the surface's own suite, which is merge-gating and is the point of the exercise;
- **`equivalent`** — an argument that the mutant cannot change observable behavior, with the citation, subject to the #703 spec's L-1 and L-8;
- **`accepted-gap`** — a real gap, deliberately not repaid here, carrying a `BL-`/`DEF-` ref that resolves.

**A stability question this surface raises and taskContract did not.** `scripts/lib/ledger-git.ts` is an adapter over the checkout, so a mutant's verdict can differ between a developer's full clone and CI's zero-ref checkout — which is this spec's own thesis turned on the gate. The plan measures it: the ledger is triaged locally, and the nightly CI run's survivor set is compared against it before the surface is declared stable. Any mutant whose verdict is environment-dependent is killed by a test that constructs its own ref namespace (the `484824b9e` pattern), never ledgered — a ledger row whose truth depends on where it ran is exactly the thing this spec exists to stop.

#### 3.2.1 Unit 2.1 — the liveness control becomes per-surface and actually runs

A prerequisite for enrolling anything, per §1.4. The control exists to prove the overlay is live: without it, a harness whose overlay silently failed to apply would report a perfect score with every mutant running against clean source.

`GuardSurface` gains one field:

```ts
/** A deliberately behavior-changing edit the suite MUST notice. Proves the overlay is live. */
control: { from: string; to: string };
```

- `validateSurface` rejects a row whose `from` does not occur **exactly once** in `sourcePath`. Not "at least once": an ambiguous anchor makes the control's target unknowable, and a zero-occurrence anchor is the taskContract bug generalized rather than fixed.
- The gate **runs** the control text as the mutant — `runSurface` receives it — and asserts KILLED. That is the assertion `guardSurfaces.gate.test.ts:120` reads as if it makes and does not.
- `lib/specLint/taskContract.ts` keeps its existing control text, moved from the test body into its registry row, so the first customer's behavior is unchanged and the change is a pure generalization.

Each new surface declares its own. Both ledger surfaces' controls invert a guard whose suite demonstrably notices it; the plan names the text and shows the KILLED verdict rather than asserting it in prose.

#### 3.2.2 What the numbers mean, and the volume they imply

Both runs are against this branch's tree with Unit 1's config fixes applied, on a full clone. **64 survivors between them, on two modules that had just cleared fourteen whole-diff adversarial rounds.** That figure is the arc's plainest result: a review process that exhausts its reviewer leaves roughly half the single-site mutants of its own subject alive.

It is also the bulk of this PR's work, and the plan sequences the two surfaces as separate units so review can be split per the `AGENTS.md` tight-scope rule rather than dispatched as one 64-row diff.

Two survivors are worth naming now because they are the same real gap on both surfaces, and both are `killed` dispositions rather than ledger rows: `statement-removal` on the `git fetch` invocation (`scripts/lib/ledger-git.ts:78`) and on `git.fetch()` (`scripts/lib/ledger-claims-core.ts:137`). Nothing in either suite asserts the real fetch happens — the ordering test uses the fake surface — so the network read the whole claim-freshness argument rests on can be deleted with the suite green.

A large minority are timeout constants (`30000>30001`, `10000>10001`, `1000>1001`, `86400>86401`). Those are the expected `equivalent` shape, and each still owes the argument; "it is only a millisecond" is not one, since a timeout constant reachable by a test would be observable.

### 3.3 Unit 3 — the premise contract

#### 3.3.1 The helper

`tests/_shared/premise.ts (new)`:

```ts
/** The condition under which the assertion below has discriminating power. */
export function premise(description: string, actual: number, mustExceed: number): void;

/** The non-numeric form. */
export function premiseHolds(description: string, condition: boolean): void;
```

Both throw on violation with a message that names the failure as a premise failure — "this test proves nothing in this environment" is a different instruction to the reader than "the code is wrong", and conflating them is how `5f1a98a66`'s red test got repaired into a vacuous one. The helper exists as much for the AST-detectable call site as for the assertion.

#### 3.3.2 The rule

> For every test in a suite named by any `GuardSurface.suitePaths`, if anything in the test's **reachable body set** (§3.3.2.1) references a member of the closed `ENVIRONMENT_SOURCES` set, the test body must contain at least one `premise` / `premiseHolds` call, or an inline `// no-premise: <reason>` comment with a non-empty reason.
>
> **One exception, and it is the only one:** when the provenance is an environment-derived producer of any registration construct — `it.each`, `test.each`, `describe.each` — the premise sits in the **associated pre-registration position** defined in §3.3.2.2, dominating every enclosing such construct — over the named binding, between it and the `test.each(<binding>)` call — because a premise inside the callback cannot run when the producer yields nothing. Both placements are the same contract; only one of them can execute.

Three terms, defined so the checker has no latitude:

- **test** — a call to `it` or `test`, including `.each` / `.skip` / `.only` forms. A `describe.each` producer is part of the extent of every test nested inside it (§3.3.2.2). Its **extent is the entire call expression**, not just the callback: the `.each` producer argument, any table literal, and the callback body are all inside it. That is spec R7, and it is a simplification rather than a special case — `test.each(loadFromEnvironment())(…, value => {…})` reads the environment in the producer, which the callback never references, and the repository uses non-literal `.each` producers at 120 sites (`tests/components/tiles/_pureRenderCompliance.test.ts:82` among them), so it is ordinary rather than exotic.
- **reachable body set** — every declaration reachable from the test body through the reference graph, to a cycle-safe fixed point. Defined in full in §3.3.2.1. Neither depth nor syntactic position is a parameter.
- **exemption** — a `// no-premise: <reason>` line comment inside the body, reason non-empty after trimming. Placement outside the body does not count, mirroring the registry's rejection of an empty `reason` (`tests/mutation/source/registry.ts:85-87`).

`ENVIRONMENT_SOURCES` is closed and declared, in the same spirit as `OPERATOR_NAMES`. It is keyed on **module provenance, never on spelling** — a spelling-keyed set is defeated by `import { spawnSync as run }`, and this repository has already spent six adversarial rounds establishing that every syntactic mechanism is defeated by a spelling (`BL-INTERNAL-CODE-ENUM-SCAN-WIDEN`, archived 2026-08-03).

| provenance | matches | why |
| --- | --- | --- |
| any binding imported from `node:child_process` | `spawnSync`, `execFileSync`, `execSync`, and any alias of them | the output is the checkout's state, which differs between a developer's clone and CI's |
| any member access on the `process` global whose object path starts `process.env` | `process.env.X`, destructured `const { env } = process` | ambient configuration, absent or different in CI |
| any binding imported from `scripts/lib/ledger-git` | `realGitSurface` and any alias | this repository's named adapter over the checkout |

**Accepted binding forms, as a matrix over provenance × form.** Each provenance declares the forms it can be reached through, and the fixture matrix (§3.3.3) must cover **every cell**. The cell list is *derived from the `ENVIRONMENT_SOURCES` declaration, not hand-written* — a newly declared provenance therefore fails the meta-test until it has its own fixtures, rather than inheriting coverage from a neighbour. That is the difference between this table and its first draft, which listed forms ad hoc and left `process.env` with zero rows while claiming full coverage (spec R2).

Module provenances (`node:child_process`, `scripts/lib/ledger-git`) are reached through import bindings:

| form | example | in the corpus today |
| --- | --- | --- |
| static named | `import { spawnSync } from "node:child_process"` | yes — `tests/scripts/ledgerClaimsCheck.test.ts:22` |
| static aliased | `import { spawnSync as run } from "node:child_process"` | no |
| static namespace | `import * as cp from "node:child_process"`, then `cp.spawnSync(…)` | no |
| dynamic destructured | `const { realGitSurface } = await import("@/scripts/lib/ledger-git")` | yes — `tests/scripts/ledgerClaimsCheck.test.ts:396` |

The `process.env` provenance is a global, so it has no import forms and its own set instead:

| form | example | in the corpus today |
| --- | --- | --- |
| direct member access | `process.env.LEDGER_GIT_ROOT` | yes — `tests/scripts/ledgerClaimsCheck.test.ts:434` |
| destructured | `const { env } = process`, then `env.X` | no |
| aliased destructure | `const { env: e } = process`, then `e.X` | no |

The corpus count cannot substitute for these fixtures, and the reason is worth stating because it is not obvious: the one `process.env` use in the enrolled suites sits in a test that *also* calls `realGitSurface`, so that test stays classified through the other provenance whether or not `process.env` detection works at all. A future test resting on ambient configuration alone would pass as environment-free.

**Hook-mediated reads** apply to every provenance rather than being a form of one: a read in a `beforeEach` / `beforeAll` classifies every test in its enclosing `describe` subtree, because that is where the value those tests consume comes from. The fixture matrix carries one hook-mediated pair per provenance.

#### 3.3.2.1 Provenance is a fixed point over the declaration-reference graph

The first draft of this section claimed every untraceable read would be reported while §5 L-2 simultaneously said cross-module reads were not traced. Both could not be true, and the contradiction hid a real hole (spec R3): at a call site, `runCheck(g, …)` and a helper that spawns internally are **syntactically identical**. Reporting every unresolved imported call rejects nearly every enrolled test; allowing them lets an ordinary refactor — moving a `spawnSync` behind a helper — walk straight through the guard. Neither is acceptable, so the checker resolves the question instead of assuming an answer.

**Three consecutive rounds found the same vector, so the enumeration is abandoned rather than extended.** R3 named a cross-module wrapper, R4 named a `process.env` global and a two-level same-file chain, R5 named a module-scope initializer — `const root = process.env.ROOT; export function readRoot() { return root; }`, which no *body* reads. Each was correct and each repair was one more syntactic position bolted onto a list. `AGENTS.md`'s same-vector rule says the third round is where patching stops and the vector is re-analysed whole, so here is the whole analysis.

A test body consumes a value. Within the repository, that value can carry environment state through a function body, a module-scope initializer, a block-scope initializer in an enclosing closure, a default parameter, a class field or static block, or a getter. Enumerating those positions is the ratchet: the list has no closure and every round adds one. What all six share is that each is a **declaration with an initializer**, referenced from somewhere. So the traversal keys on that and stops caring about position:

> Build the graph whose nodes are **declarations** — functions, variables, parameters, class members — and whose edges are **references**. A node's **extent** is its own initializer or body, plus any module-level statement that writes to it. A test is environment-touching if a declared provenance appears anywhere in the extent of any node reachable from its body's references. Cycle-safe fixed point.

Resolution uses the `@` alias and relative specifiers — the same resolution `vitest.config.ts:150` declares. **Position is not a parameter, and neither is depth.** The rule covers all six positions above by construction, including the two nobody has raised (class fields, default parameters), because it never asks where a provenance appears — only whether the declaration containing it is reachable.

The "plus any module-level statement that writes to it" clause is spec R6, which named `export let root; root = process.env.ROOT;` — provenance in an assignment statement, which is neither a declaration initializer nor a function body. Probed: that form occurs **zero** times in this repository, against 36 module-level assignments of any kind; the 9 assignments whose right-hand side does carry a provenance are all inside function bodies, which the rule already covered. It is covered anyway, because it costs one more node kind in the same syntactic walk.

**What is NOT adopted, and why, so it is not proposed again.** R6's recommendation was to replace this with symbol-level data-flow analysis. Declined. Rounds R3 through R6 each named a real form and each repair was another language feature, and the destination of that trajectory is a data-flow analyser for TypeScript — the exact ratchet `AGENTS.md`'s convergence-criterion section measures at 474 rounds, where "add `-X` at 71 psql sites" became a 2929-line shell-grammar parser. Data-flow would not even end it: `eval`, computed property access, and aliasing defeat any analysis short of running the program.

**The real defect was the claim, not the mechanism.** This spec promised that *nothing* within the repository graph is silently unclassified — a soundness claim about static analysis of a Turing-complete language, which no version of this checker could ever have honored. That overclaim is what made four consecutive rounds each look like a legitimate hole, because each one was: against an unbounded promise, every gap is a defect. §4's consequence bound is now stated over a **declared list of analyzed forms**, which is closable.

**The vector is fenced in both directions from here.** A finding on it is admissible only with a form that is (a) outside the declared analyzed list, **and** (b) shown by probe to occur in this repository or to be reachable by ordinary authoring in it. A form meeting (a) but not (b) is a documented limit and files to §5 without a round — which is what the admissibility contract in `AGENTS.md` already says about a hypothetical whose worst case is conservative. And the worst case here is conservative: a missed premise *requirement*, on a surface that the mutation gate and human review still cover. It is a gap in a net, never a wrong answer.

**It terminates and it is small.** The fixed point ranges over repository files only; it stops at `node_modules`, at a declared provenance, and at an already-visited declaration. `scripts/lib/ledger-check.ts:6-7` imports exactly `./ledger-claims-core` and `./ledger-fields`, neither of which imports `node:child_process` or reads `process.env` — the surface takes its git access by injection — so `runCheck` resolves to pure, correctly, and a wrapper that spawned or read the environment at any depth or in any position would resolve to environment-touching, also correctly. That is the whole point: the graph answers a question the call site cannot.

**Declarations, not modules — the distinction that decides whether this is usable at all.** The cheap implementation keys on module import closures, and on this corpus it is wrong in the most damaging direction. `scripts/ledger-claims.ts:19` imports `realGitSurface` from `./lib/ledger-git`, which imports `node:child_process` (`scripts/lib/ledger-git.ts:10`) and reads `process.env` at four sites. A module-closure rule therefore classifies **every** test importing `reportEnvelope` as environment-touching — including `tests/scripts/ledgerClaimsCheck.test.ts:524-542`, the 101-claim fixture that is this spec's own exemplar of a correctly constructed guard, and which touches no environment whatsoever. The reference graph gives the right answer: `reportEnvelope`'s body is one object literal (`scripts/ledger-claims.ts:49`) referencing nothing environment-bearing, and `realGitSurface` merely shares its module. Probed on the real corpus before the design was fixed, and it is the concrete case AC-10b exists to catch.

**Over-classification is the risk on the other side, and it is measured rather than assumed.** A fixed point that reached too far would mark every test environment-touching and turn the premise into a ritual. The plan reports the classified counts for both enrolled suites before the contract is declared done; if the traversal marks a dependency-injected test as environment-touching, the traversal is wrong, not the test.

**What the traversal genuinely cannot see, stated as the bound it is.** A binding imported from outside the repository — a third-party test utility that reads the environment on the test's behalf — resolves to `node_modules` and is treated as pure. That is a documented limit (L-2) and it is outside the threat-model fence: refactoring a spawn or an env read behind a *local* helper, at any depth, is ordinary authoring and is covered; reaching the environment through a third-party package to escape the checker is not ordinary authoring.

**Unclassifiable and undetected are different things, and conflating them is what made §3.3.3 and §4 disagree** (spec R7). A recognizer has exactly two failure modes and this spec now names both:

- **Unclassifiable** — the checker *recognizes* a provenance-bearing construct but cannot resolve it. A closed list: a dynamic `import()` whose specifier is not a string literal; a member access on `process` whose property is computed; a re-export chain the resolver cannot follow; an imported binding whose module resolves inside the repository but cannot be parsed. Each is **reported and reds the run** — the checker knows enough to know it does not know. Clearing one is an explicit `// no-premise: <reason>`, so the residue is visible in the diff.
- **Undetected** — the checker does not recognize the construct as provenance-bearing at all, so it cannot report it. This is L-8, and no assertion claims otherwise.

The distinction is not a hedge: it is the difference between "I found something I cannot resolve" and "I did not find anything", and only the first can be made loud.

Four fixtures pin the traversal, and they are the ones that matter most in §3.3.3's matrix. Each of the three positives has the pure wrapper as its foil, so the traversal cannot pass by being a constant in either direction:

| fixture | must classify as | closes |
| --- | --- | --- |
| pure local wrapper — a helper importing only pure repo modules | environment-free | the `return true` degenerate traversal |
| cross-module wrapper importing `node:child_process` | environment-touching | spec R3 |
| cross-module wrapper reading `process.env` and importing nothing | environment-touching | spec R4 — a global has no import edge to follow |
| two-level same-file chain, `outer() → inner() → spawnSync()` | environment-touching | spec R4 — depth is not a parameter |
| module-scope initializer — `const root = process.env.ROOT` returned by a pure-looking helper | environment-touching | spec R5 — no body reads it |
| pure module constant — `const n = 3` returned by a helper | environment-free | the foil for the row above, so the rule is not "any module constant" |
| default parameter and class-field initializers reading a provenance | environment-touching | positions nobody raised; they are covered by construction and the fixtures prove it rather than asserting it |
| a helper importing `reportEnvelope`, whose module also imports `realGitSurface` | environment-free | the module-closure over-classification above |

Deliberately **excluded**, stated so review does not re-derive it: `node:fs` reads of a tracked path are byte-identical in every environment, and the throwaway-repository construction that is this spec's recommended *cure* is built from `mkdtempSync`/`rmSync` — classifying it as a hazard would tax the fix; wall-clock is already pinned by the suites' `NOW` constant; unit tests reach no network.

#### 3.3.2.2 A premise must execute unconditionally, or it is the very thing this spec exists to stop

Spec R8 found the sharpest defect in this document, and it is worth stating as a rule rather than as a patch, because the mechanism had reproduced the exact class it was built to catch.

`test.each(producer())(…, cb => { premise(…) })` places the premise inside the callback. Vitest registers `.each` cases by iterating the producer's result, so when an environment-derived producer returns `[]`, **no case is registered and the callback never runs** — in precisely the degenerate environment the premise exists to detect. If the file holds any other passing test, the suite is green. Probed:

```
test.each(producer())(…)   // producer returns []
  + one unrelated passing test in the same file
→ Test Files 1 passed (1) · Tests 1 passed (1)
```

The callback body threw unconditionally and never executed. A premise that cannot run is a guard that cannot fail, which is this spec's subject.

**The rule, stated generally rather than for `.each`:**

> A premise must execute **unconditionally relative to the assertion it is a premise for**. It may not sit anywhere whose execution count can be zero when the premise is false — a `.each` callback, a `describe.each` body, a loop body, or a conditional branch.

**Every producer-derived registration construct, not just `test.each`.** Spec R11 found `describe.each` unhandled — the same hazard, and `tests/mutation/guardSurfaces.gate.test.ts:45` uses it. That was a class-sweep failure in the R8 repair rather than a new class, so here is the sweep, with counts of **non-literal** producers measured on this repository:

| construct | non-literal producers | covered |
| --- | --- | --- |
| `it.each` | 62 | yes |
| `test.each` | 53 | yes |
| `describe.each` | 5 | yes |
| `it.for` / `test.for` / `describe.for` | 0 | yes by the rule; absent from the corpus |
| `.skip` / `.only` / `.concurrent` variants of the above | 0 | yes by the rule; absent from the corpus |

The rule is over the shape, not the list: **any registration construct whose case count comes from a producer expression**. The table records what that currently resolves to here, so a reader can see the rule is grounded rather than speculative.

**Nesting, since a premise can sit under more than one of them.** A premise must **dominate every enclosing producer-derived registration** — a premise inside a `describe.each` body is unreachable when *that* producer is empty, exactly as a callback premise is when a `test.each` producer is empty. For a test nested inside an environment-derived `describe.each`, the premise belongs above the `describe.each` call, not inside its body.

**The associated placement, stated exactly, because "in the enclosing scope" is not a rule a checker can apply** (spec R10: §3.3.2 requires the premise inside the test's extent, this section requires it outside, and nothing connected the two — so an implementation had to reject the safe placement or accept the vacuous one). The association is by name and order:

> For an environment-derived producer, the result is bound to a named `const` in the enclosing scope, and a `premise` / `premiseHolds` call **over that binding** appears between the binding and the `it.each(<binding>)` / `test.each(<binding>)` / `describe.each(<binding>)` call that consumes it. That premise satisfies the requirement for every case the call registers, and for every test nested inside it when the construct is `describe.each`.

```ts
const refs = listRefsFromCheckout();                    // environment-derived producer
premise("the checkout yields refs to iterate", refs.length, 0);   // executes at registration time
test.each(refs)("%s resolves", (ref) => { … });         // zero cases is now impossible silently
```

Decidable statically — same scope, matching name, premise between the two — and it executes when the module or `describe` body is evaluated, which is before registration and independent of how many cases exist. §3.3.2's rule text carries the same exception, so the two sections state one contract rather than two.

AC-8c proves it by execution rather than classification: a fixture whose producer returns `[]`, beside a passing test, must make the suite **fail**, and a callback-local premise on the same producer must be **rejected**. Static classification cannot see the first, which is why round 8 could raise it against static rules that were already correct.

#### 3.3.3 The meta-test, and why it cannot pass vacuously

`tests/mutation/_metaPremiseContract.test.ts (new)`, merge-gating, static, DB-free. It walks the enrolled suites' ASTs rather than a hand-written file list, so a newly enrolled surface is covered by default.

The declared per-suite counts assertion 3 compares against live in that file, keyed by suite path, not in `GuardSurface` — `GuardSurface` belongs to the #703 spec and this contract does not need to widen it. Their key set is asserted equal to the enrolled suite set, so a newly enrolled suite fails until it declares its own count rather than silently inheriting another's; that is the same failure mode `EXPECTED_LEDGER_KINDS` was corrected for in that spec's whole-diff R2.

Five assertions exist solely to keep the checker from reporting green on nothing:

1. the enrolled-suite set is non-empty;
2. the set of tests examined is non-empty;
3. **per enrolled suite**, the number of tests classified as environment-touching equals a count declared independently in the registry — not counted from the classification itself, which would compare a list to itself. A recognizer that silently stops matching (a `spawnSync` call moved behind a wrapper, say) drops that count to zero and reds, instead of reporting a clean corpus it no longer understands. A genuinely pure suite declares `0` honestly and is not forced to invent a match. This mirrors `EXPECTED_LEDGER_KINDS` (`tests/mutation/guardSurfaces.gate.test.ts:33`), which exists for the same reason;
4. a **fixture matrix over every provenance × form cell** of §3.3.2: for each cell, a synthetic test source using that form with no premise must be REJECTED, and the same source with a premise added must be ACCEPTED. Each pair differs in exactly one thing, so a rejection is attributable to the premise. The required cell list is **derived from the `ENVIRONMENT_SOURCES` declaration**, and the meta-test asserts the fixture set covers it exactly — so a newly declared provenance reds until it brings its own fixtures, instead of inheriting a neighbour's coverage. One pair per cell, not one pair overall: a single pair validates only the spelling it happens to use, which is the defect the provenance keying exists to avoid, and a per-form list that is not derived from the provenances is how `process.env` ended up with zero coverage in this spec's own first draft;
5. an **unclassifiable fixture per form in that closed list** (§3.3.2.1): a non-literal dynamic `import()`, a computed member access on `process`, an unfollowable re-export, and an unparseable in-repo module must each be REPORTED, not passed. This is the executable half of the fail-closed claim, and it is scoped to the *unclassifiable* list — it makes no claim about undetected forms (L-8), which is the contradiction spec R7 found between this list and §4.

Assertion 4 is the one that matters. Without it the checker could be `return []` and the first three would still pass. Assertion 3 is the one that keeps mattering after the fixtures stop changing — **with the caveat the design owes it**: a declared count catches a recognizer that stops matching, but it does *not* catch a newly added test the recognizer never matched, because the recognized count is unchanged and still equals the declaration. That gap is closed by assertion 5, not by the count: a new test using an untraceable form is reported as unclassifiable rather than counted as environment-free.

#### 3.3.4 Retro-application

Every qualifying test in the two enrolled suites gets its premise or its exemption in this PR. **Two of them are named as mandatory construction-based repairs, not exemptions**, because both are live V2 instances whose premise is false in the environment that merge-gates:

| test | why it does not discriminate where it runs | repair |
| --- | --- | --- |
| `tests/scripts/ledgerClaimsCheck.test.ts:508-510` | `payload.claims.length` and `core.claims.length` are both read from the live checkout; in CI both are zero, so `claims: []` is indistinguishable from a correct envelope | construct the corpus, as `484824b9e` did for its sibling |
| `tests/scripts/ledgerClaimsCheck.test.ts:393-409` | `isShallow()` is compared to git's answer **in the same checkout**. CI's checkout is shallow, so `truth` is `true` and the named `Boolean(out)` mutant also returns `true` — the test's own comment concedes it "fails wherever git says false", which is the developer's full clone and not CI (spec R3) | a controlled repository fixture covering **both** values: a throwaway repo is non-shallow, and a `--depth=1` clone of it over `file://` is shallow |

Neither is repaired by adding a premise. A premise on either would state something false in CI and turn the suite red there, which is correct behavior for an unreachable premise and the wrong outcome for a guard that can simply be given a reachable fixture. The premise convention is for cases where the environment genuinely cannot be constructed; where it can, construction wins.

The five ad-hoc `premise` strings already in the tree (`tests/scripts/ledgerFields.test.ts:53`, `tests/scripts/ledgerClaimsCheck.test.ts:535`, `tests/docs/_ledgerMdast.walker.test.ts:296`, and two in `tests/e2e/published-review-modal.layout.spec.ts`) are converted where they fall inside an enrolled suite and left alone where they do not. Converting the whole tree is a non-goal (§5).

### 3.4 Unit 4 — the durable rule

`docs/agents/writing-plans.md` is canonical for this subject and already carries the anti-tautology rule the two instances violated (`docs/agents/writing-plans.md:10-14`). A bullet is added beneath it stating the premise rule, both failure shapes, and the worked example from §1.2's table — the table is the teaching artifact, because "the repair of a red test introduced the vacuity" is the part no one predicts.

`AGENTS.md` gains a pointer only; the rule itself lives in one place.

---

## 4. Contracts for adversarial review

Stated here so the review briefs can cite rather than re-derive them, per `AGENTS.md`'s convergence-criterion section.

**Consequence bound**, stated over a closed list of analyzed forms rather than as a soundness claim. Earlier drafts promised that *nothing* within the repository graph is silently unclassified. That is a soundness claim about static analysis of a Turing-complete language and no version of this checker could honor it; four consecutive review rounds each found a form it did not cover, and each was correct because the promise was unbounded. The bound is therefore stated the only way it can be true:

> **Analyzed forms.** A declared provenance is detected wherever it appears in the extent of any declaration reachable through the reference graph (§3.3.2.1) — function bodies, module- and block-scope initializers, default parameters, class fields and static blocks, getters, and module-level assignments to a reachable binding.
>
> **Within those forms, every test reaches one of exactly four states and there is no fifth:** it carries a premise; it carries an explicit exemption with a non-empty reason; it is classified environment-free; or it hits a construct on the closed **unclassifiable** list (§3.3.2.1) and is **reported and reds the run**.

A test's extent for this purpose is its entire call expression, including a `.each` producer (§3.3.2).

A provenance reaching a test through a form outside that list is **undetected** — distinct from *unclassifiable*, which is recognized-but-unresolvable and reds (§3.3.2.1). The consequence of undetected is bounded and conservative: a missed premise *requirement*. Not a wrong answer, not a corrupted classification — a guard that should have been asked for a premise is not asked, on a surface the mutation gate and human review still cover. This mechanism is a net, not a proof, and the difference is the whole reason the bound is closable.

Widening the analyzed-form list, like widening `ENVIRONMENT_SOURCES`, is a proposal carrying its own before/after counts, not a review round.

The one thing outside the repository is named rather than implied: a binding resolving into `node_modules` is treated as pure (L-2).

**Threat-model fence.** The mechanism models **ordinary authoring mistakes by a contributor** — a fixture that cannot reach a boundary, an expected value read from the same degenerate source as the actual. Deliberate evasion of the recognizer is out of scope and files to documented limits.

**Convergence criterion.** For the two enrolled surfaces: the mutation score plus an empty unaccepted-survivor set, both machine-computed. A "the guard does not pin what it claims" finding against those surfaces is admissible only with the surviving mutant that demonstrates it — an operator and a site, both from the declared set. For the premise checker: the consequence bound above. **The closure set of possible vacuity shapes is explicitly NOT the convergence criterion** — enumeration over that class does not terminate.

---

## 4.1 Resolved scope — do not relitigate

Each of these was settled by probe or by an existing ratification. Reopening one is a review defect unless accompanied by the evidence named in its row.

| decision | settled by | evidence required to reopen |
| --- | --- | --- |
| Hand-declared mutants are not built (§6) | scope decision, 2026-08-04 | a probed instance the premise assertion cannot reach |
| `OPERATOR_NAMES` is not widened | `docs/superpowers/specs/ci/2026-08-04-source-mutation-guard-gate.md` §6.3 | an operator proposal with its own before/after numbers, which is not a round on this diff |
| `ENVIRONMENT_SOURCES` excludes `readFileSync` and wall-clock (§3.3.2) | a tracked file is byte-identical everywhere; the suites pin `NOW` | a probed case where either differs between a developer clone and CI |
| The contract binds enrolled suites only, not the tree (§5 L-1) | 1461 of 1788 files import through `@/`; a tree-wide recognizer is the documented ratchet | — |
| PR #701's individual findings are not re-reviewed (§6) | the brief that opened this arc | — |
| The gate is nightly and not merge-gating (§5 L-5) | `.github/workflows/mutation-harness.yml` header; `vitest.projects.ts:87` | — |
| Premise strength is a review judgement, not a checker rule (§5 L-3) | strength is undecidable; presence is not | — |
| `ENVIRONMENT_SOURCES` is keyed on module provenance, not on spelling (§3.3.2) | spec R1 finding 2; a spelling-keyed set is defeated by an alias, established over six rounds on `BL-INTERNAL-CODE-ENUM-SCAN-WIDEN` | a traced form the provenance keying still misses, shown by fixture |
| An untraceable form reds as unclassifiable rather than passing (§3.3.2, AC-8a) | spec R1 finding 2; it is what makes §4's consequence bound true rather than aspirational | — |
| The liveness control is per-surface and is actually run (§3.2.1) | spec R1 finding 1, confirmed against `tests/mutation/guardSurfaces.gate.test.ts:116-120` | — |
| Provenance keys on the declaration-reference graph, not on bodies, modules, or a list of syntactic positions (§3.3.2.1) | spec R3/R4/R5 were three rounds on one vector; `AGENTS.md`'s same-vector rule required re-analysing it whole rather than adding a fourth position | a form outside the declared analyzed list AND probed to occur in this repository or to be reachable by ordinary authoring in it |
| Symbol-level data-flow analysis is NOT adopted (§3.3.2.1) | spec R6 recommendation, declined; the trajectory is a TypeScript data-flow analyser, and `eval`/computed access/aliasing defeat it anyway | — |
| A test's extent is its whole call expression, so `.each` producers are inside it (§3.3.2) | spec R7; probed — 120 non-literal `.each` producers in this repository | — |
| A premise may not sit where its execution count can be zero (§3.3.2.2) | spec R8; probed — `test.each([])` beside one passing test reports `Tests 1 passed (1)` and the callback never runs | — |
| The `.each` premise is associated by name and order — a named `const` binding, a premise over it, then `test.each(<binding>)` (§3.3.2.2) | spec R10; "in the enclosing scope" was not a rule a checker could apply, and §3.3.2 and §3.3.2.2 contradicted each other until it was | — |
| The rule covers EVERY producer-derived registration construct and a premise must dominate every enclosing one (§3.3.2.2) | spec R11, which was a class-sweep failure in the R8 repair rather than a new class; swept and counted — `it.each` 62, `test.each` 53, `describe.each` 5 non-literal producers, `.for` forms zero | a construct whose case count is producer-derived that the rule does not reach |
| Executable fixtures are named `*.fixture.ts` and invoked explicitly, never discovered (§3.1) | spec R9; `BASE_INCLUDE` at `vitest.projects.ts:34` matches only `*.test.ts`/`*.test.tsx`, so a discovered fixture runs every merge and an undiscovered one is dark | — |
| *Unclassifiable* (recognized, unresolvable, reds) and *undetected* (unrecognized, L-8) are separate categories (§3.3.2.1) | spec R7; conflating them is what made §3.3.3 and §4 disagree | — |
| The consequence bound is over a closed list of analyzed forms, not a soundness claim (§4) | spec R6; the unbounded promise is what made R3–R6 each a legitimate finding | — |

---

## 5. Documented limits

| id | limit | consequence |
| --- | --- | --- |
| L-1 | The premise contract binds only suites named in the mutation registry | An unenrolled suite may still ship a vacuous guard. Deliberate: a repo-wide recognizer over 1788 test files is the ratchet this spec exists to avoid. Enrollment is how a surface opts in, and it is now cheap (Unit 1). |
| L-8 | Detection covers a CLOSED LIST of analyzed forms (§4), not every expressible one; *undetected* is distinct from *unclassifiable*, which reds | A provenance reaching a test through a form outside the list is not detected. Conservative by construction: the cost is a missed premise requirement, never a wrong classification, on a surface the mutation gate and review still cover. Probed at spec R6 — the one such form named (`root = process.env.X` at module top level) occurs zero times in this repository against 36 module-level assignments of any kind. |
| L-2 | Provenance is traced through the REPOSITORY module graph, and stops at `node_modules` | A third-party package that reads the environment on a test's behalf resolves to `node_modules` and is treated as pure. Inside the fence: refactoring a spawn behind a local helper is ordinary authoring and IS traced (§3.3.2.1); reaching the environment through a third-party package to escape the checker is not. Forms the resolver cannot follow at all — computed member access, a non-literal dynamic specifier — are reported and red, never passed as environment-free. |
| L-3 | A premise can itself be trivially true | `premise("x", 1, 0)` satisfies the checker and proves nothing. The checker enforces presence, not strength; strength is a review judgement, as it is for every assertion. |
| L-4 | V1 with no environment read is uncovered | A pure fixture too small to cross a boundary, with no spawn and no `process.env`, is not classified as environment-touching. Both shipped instances read the environment, so the mechanism reaches both, but the pure-fixture variant remains the prose rule's job (`docs/agents/writing-plans.md:13`). |
| L-5 | The mutation gate is nightly and not merge-gating | An enrolled surface's new gap surfaces one cycle after it lands. Unchanged by this spec; stated because §1.4 depends on it. |
| L-7 | The overlay does not reach a spawned child process | An assertion made through `spawnSync`/`execFileSync` contributes nothing to the mutation score, though it may fully cover the behavior. Demonstrated both ways in §1.4.2. Triage repays such a survivor with an in-process twin assertion; a suite that is mostly end-to-end will score lower than its real coverage, and the score must be read with that in mind. |
| L-6 | Mutant verdicts on `ledger-git.ts` can be environment-dependent | Addressed by construction (§3.2) — such mutants are killed by tests that build their own ref namespace, never ledgered — but the constraint is a standing one for any future adapter surface. |

---

## 6. Non-goals

- Re-reviewing PR #701's logic, or repairing any individual finding from it. Those are repaired; §1 uses them as evidence about process only.
- A general vacuity detector over the whole test tree.
- Hand-declared mutants in the registry (mutant text given literally rather than generated). It is the only mechanism that would close §1.1's class by proof rather than by premise, and it was considered and not chosen — the premise assertion closes the same instance at a fraction of the machinery, on a gate that merged three days ago.
- Widening `OPERATOR_NAMES`. Out of scope per that spec's §6.3.

---

## 7. Acceptance criteria

- **AC-1** `tests/mutation/source/mutantOverlay.config.ts` resolves `@` and carries the root's timeouts, both from a single shared definition consumed by `vitest.config.ts` as well.
- **AC-2** A merge-gating meta-test fails when either value is reverted, demonstrated by running the reverted config, not asserted in prose.
- **AC-3** `tests/mutation/source/fixtures/aliasImport.fixture.ts (new)` passes through the real overlay config and the real runner, and the guard asserts the fixture still contains an `@/` import.
- **AC-3a** Every executable fixture names its file and its execution owner (§3.1's table). A wiring meta-test proves the default vitest projects resolve **zero** files under `tests/mutation/source/fixtures/`, and that `pnpm mutation:guards` executes the slow fixture named in §3.1's table. Without it, "nightly only" is a claim nobody checks and the fixture is either paid for on every merge or dark — both of which are this spec's own subject.
- **AC-4** `scripts/lib/ledger-claims-core.ts` and `scripts/lib/ledger-git.ts` are enrolled; `pnpm mutation:guards` passes; every survivor is killed, `equivalent` with an argument, or `accepted-gap` with a resolving ledger ref.
- **AC-4a** `GuardSurface.control` exists; `validateSurface` rejects a row whose `from` occurs zero times or more than once in `sourcePath`, each demonstrated by a rejection case; `lib/specLint/taskContract.ts` carries its existing control text as a registry row with no behavior change.
- **AC-4b** The gate **runs** each surface's control as the mutant and asserts KILLED — the run receives the control text, which `guardSurfaces.gate.test.ts:120` today does not. Demonstrated per enrolled surface by the recorded verdict, not asserted in prose.
- **AC-5** Each enrolled surface has its own `EXPECTED_LEDGER_KINDS` row.
- **AC-6** No `accepted` row on `ledger-git.ts` has an environment-dependent verdict; each such mutant is killed by a test that constructs its own ref namespace.
- **AC-7** `premise` / `premiseHolds` exist, fail loudly, and name the failure as a premise failure.
- **AC-8** `tests/mutation/_metaPremiseContract.test.ts (new)` carries one rejection/acceptance fixture pair **per provenance × form cell** of §3.3.2 — for the module provenances: static named, static aliased, static namespace, dynamic destructured; for `process.env`: direct member access, destructured, aliased destructure; plus one hook-mediated pair per provenance — each pair differing in exactly one thing. The required cell list is derived from the `ENVIRONMENT_SOURCES` declaration and asserted to match the fixture set exactly, so a newly declared provenance reds until it brings its own fixtures.
- **AC-8a** Each form on the closed *unclassifiable* list (§3.3.2.1) has a fixture that is REPORTED and reds, not passed as environment-free. The criterion makes no claim about *undetected* forms, which are L-8 — conflating the two is what made this AC contradict §4 before spec R7.
- **AC-8b** A fixture pair **per registration construct in use** — `it.each`, `test.each`, `describe.each` (§3.3.2.2's table) — where an environment-reading producer whose callback references only its parameter must classify as environment-touching, each with a pure-producer twin as its foil.
- **AC-8c** **Executable, not static.** For **each** construct in AC-8b, a fixture whose environment-derived producer returns `[]`, placed beside a passing test in the same file, must make the suite FAIL — including the `describe.each` case, where zero registrations means zero nested tests. Probed at spec R8 that `test.each([])` currently passes green — zero cases registered, callback never run — so this criterion is met by running it, never by classification.
- **AC-8d** The associated placement of §3.3.2.2 is accepted and the callback-local placement is rejected, proven by a fixture pair over the same producer, plus a nesting case: a premise inside an environment-derived `describe.each` body is REJECTED, and the same premise above the `describe.each` call is ACCEPTED. Without both halves the checker could accept everything or nothing and one fixture would still pass. The checker additionally rejects a premise placed anywhere its execution count can be zero.
- **AC-9** The meta-test's non-vacuity assertions (§3.3.3, items 1-3) are present and each fails against a corresponding degenerate input; the declared per-suite count map's key set is asserted equal to the enrolled suite set, so a newly enrolled suite fails until it declares its own.
- **AC-10** Every qualifying test in the two enrolled suites carries a premise or a reasoned exemption. **Two are construction-based repairs and an exemption is not permitted for either**: `tests/scripts/ledgerClaimsCheck.test.ts:508-510` constructs its own corpus, and `tests/scripts/ledgerClaimsCheck.test.ts:393-409` asserts `isShallow()` against a controlled repository covering BOTH values — a throwaway repo for non-shallow and a `--depth=1` `file://` clone of it for shallow — so it discriminates in CI, where it currently does not.
- **AC-10a** The premise checker computes a cycle-safe fixed point over the declaration-reference graph (§3.3.2.1), with every fixture in that section's table: pure local wrapper, cross-module `node:child_process` wrapper, cross-module `process.env` wrapper importing nothing, two-level same-file chain, module-scope initializer, pure module constant, default-parameter and class-field initializers, and the `reportEnvelope` case that a module-closure rule over-classifies. Every environment-touching fixture has an environment-free foil differing in one thing, so a constant traversal fails in both directions.
- **AC-10b** The classified counts for both enrolled suites are reported, and no dependency-injected test (one whose git access arrives through `fake()`) is classified environment-touching. Over-classification turns the premise into a ritual and is a defect in the traversal, not in the test.
- **AC-11** `docs/agents/writing-plans.md` carries the rule with the §1.2 table; `AGENTS.md` points at it and does not restate it.
- **AC-12** `pnpm test` and `pnpm typecheck` pass; real CI is green.

impeccable-gate: N/A — no UI surface
