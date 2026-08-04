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

Four faces, one defect: the condition under which the assertion has discriminating power is unstated, and nothing re-checks it when the surroundings move.

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

**Guard, executable, merge-gating.** A fixture suite under `tests/mutation/source/fixtures/ (new)` that imports a module through `@/` is run through the real overlay config by the real runner. Its own premise is asserted: the fixture's source text must contain an `@/` import, so the guard cannot pass because the fixture stopped exercising the alias.

**Guard, executable, nightly.** The timeout is proved by a fixture test that sleeps past 5 000 ms. It runs in the nightly gate only, because 5 s is not worth paying on every merge; the merge-gating structural check above covers the same value.

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

> For every test in a suite named by any `GuardSurface.suitePaths`, if the test's body — or a file-local helper it calls — references a member of the closed `ENVIRONMENT_SOURCES` set, the body must contain at least one `premise` / `premiseHolds` call, or an inline `// no-premise: <reason>` comment with a non-empty reason.

Three terms, defined so the checker has no latitude:

- **test** — a call to `it` or `test`, including `.each` / `.skip` / `.only` forms. The body is the callback.
- **file-local helper** — a function declared at module scope in the same file and called by name from the body. One level, resolved syntactically. Deeper chains and cross-module helpers are L-2.
- **exemption** — a `// no-premise: <reason>` line comment inside the body, reason non-empty after trimming. Placement outside the body does not count, mirroring the registry's rejection of an empty `reason` (`tests/mutation/source/registry.ts:85-87`).

`ENVIRONMENT_SOURCES` is closed and declared, in the same spirit as `OPERATOR_NAMES`. It is keyed on **module provenance, never on spelling** — a spelling-keyed set is defeated by `import { spawnSync as run }`, and this repository has already spent six adversarial rounds establishing that every syntactic mechanism is defeated by a spelling (`BL-INTERNAL-CODE-ENUM-SCAN-WIDEN`, archived 2026-08-03).

| provenance | matches | why |
| --- | --- | --- |
| any binding imported from `node:child_process` | `spawnSync`, `execFileSync`, `execSync`, and any alias of them | the output is the checkout's state, which differs between a developer's clone and CI's |
| any member access on the `process` global whose object path starts `process.env` | `process.env.X`, destructured `const { env } = process` | ambient configuration, absent or different in CI |
| any binding imported from `scripts/lib/ledger-git` | `realGitSurface` and any alias | this repository's named adapter over the checkout |

**Accepted binding forms**, each with its own rejection fixture (§3.3.3):

| form | example | present in the corpus today |
| --- | --- | --- |
| static named | `import { spawnSync } from "node:child_process"` | yes — `tests/scripts/ledgerClaimsCheck.test.ts:22` |
| static aliased | `import { spawnSync as run } from "node:child_process"` | no |
| static namespace | `import * as cp from "node:child_process"`, then `cp.spawnSync(…)` | no |
| dynamic destructured | `const { realGitSurface } = await import("@/scripts/lib/ledger-git")` | yes — `tests/scripts/ledgerClaimsCheck.test.ts:396` |
| hook-mediated | the read is in a `beforeEach` / `beforeAll` in an enclosing `describe` | no |

The last row propagates: a hook's environment read classifies every test in its `describe` subtree, because that is where the value the tests consume comes from.

**Unrecognized forms fail closed, and that is what makes the consequence bound true.** A call whose callee resolves to none of the three provenances and whose binding the checker cannot trace — a re-export chain, a computed member access, an indirection through another module — is reported as **unclassifiable** and reds the run. It is not silently treated as environment-free. Clearing one is an explicit `// no-premise: <reason>` like any other, so the residue is visible in the diff rather than absorbed.

Deliberately **excluded**, stated so review does not re-derive it: `node:fs` reads of a tracked path are byte-identical in every environment, and the throwaway-repository construction that is this spec's recommended *cure* is built from `mkdtempSync`/`rmSync` — classifying it as a hazard would tax the fix; wall-clock is already pinned by the suites' `NOW` constant; unit tests reach no network.

#### 3.3.3 The meta-test, and why it cannot pass vacuously

`tests/mutation/_metaPremiseContract.test.ts (new)`, merge-gating, static, DB-free. It walks the enrolled suites' ASTs rather than a hand-written file list, so a newly enrolled surface is covered by default.

The declared per-suite counts assertion 3 compares against live in that file, keyed by suite path, not in `GuardSurface` — `GuardSurface` belongs to the #703 spec and this contract does not need to widen it. Their key set is asserted equal to the enrolled suite set, so a newly enrolled suite fails until it declares its own count rather than silently inheriting another's; that is the same failure mode `EXPECTED_LEDGER_KINDS` was corrected for in that spec's whole-diff R2.

Five assertions exist solely to keep the checker from reporting green on nothing:

1. the enrolled-suite set is non-empty;
2. the set of tests examined is non-empty;
3. **per enrolled suite**, the number of tests classified as environment-touching equals a count declared independently in the registry — not counted from the classification itself, which would compare a list to itself. A recognizer that silently stops matching (a `spawnSync` call moved behind a wrapper, say) drops that count to zero and reds, instead of reporting a clean corpus it no longer understands. A genuinely pure suite declares `0` honestly and is not forced to invent a match. This mirrors `EXPECTED_LEDGER_KINDS` (`tests/mutation/guardSurfaces.gate.test.ts:33`), which exists for the same reason;
4. a **fixture matrix**, one row per accepted binding form in §3.3.2's table: for each form, a synthetic test source using that form with no premise must be REJECTED, and the same source with a premise added must be ACCEPTED. Each pair differs in exactly one thing, so a rejection is attributable to the premise. One pair per form, not one pair overall — a single pair validates only the spelling it happens to use, which is the defect the provenance keying exists to avoid;
5. an **unclassifiable fixture**: a source whose environment read arrives through a form the checker cannot trace must be REPORTED, not passed. This is the executable half of the fail-closed claim in §3.3.2; without it, "unrecognized forms fail closed" is prose.

Assertion 4 is the one that matters. Without it the checker could be `return []` and the first three would still pass. Assertion 3 is the one that keeps mattering after the fixtures stop changing — **with the caveat the design owes it**: a declared count catches a recognizer that stops matching, but it does *not* catch a newly added test the recognizer never matched, because the recognized count is unchanged and still equals the declaration. That gap is closed by assertion 5, not by the count: a new test using an untraceable form is reported as unclassifiable rather than counted as environment-free.

#### 3.3.4 Retro-application

Every qualifying test in the two enrolled suites gets its premise or its exemption in this PR, including the live V2 instance at `tests/scripts/ledgerClaimsCheck.test.ts:508-510`. That instance's premise is false in CI, so it is repaired the way `484824b9e` repaired its sibling — against a corpus the test constructs — rather than by writing a premise that reds CI.

The five ad-hoc `premise` strings already in the tree (`tests/scripts/ledgerFields.test.ts:53`, `tests/scripts/ledgerClaimsCheck.test.ts:535`, `tests/docs/_ledgerMdast.walker.test.ts:296`, and two in `tests/e2e/published-review-modal.layout.spec.ts`) are converted where they fall inside an enrolled suite and left alone where they do not. Converting the whole tree is a non-goal (§5).

### 3.4 Unit 4 — the durable rule

`docs/agents/writing-plans.md` is canonical for this subject and already carries the anti-tautology rule the two instances violated (`docs/agents/writing-plans.md:10-14`). A bullet is added beneath it stating the premise rule, both failure shapes, and the worked example from §1.2's table — the table is the teaching artifact, because "the repair of a red test introduced the vacuity" is the part no one predicts.

`AGENTS.md` gains a pointer only; the rule itself lives in one place.

---

## 4. Contracts for adversarial review

Stated here so the review briefs can cite rather than re-derive them, per `AGENTS.md`'s convergence-criterion section.

**Consequence bound.** Every test in an enrolled suite reaches one of exactly four states, and there is no fifth: it carries a premise; it carries an explicit exemption with a non-empty reason; it is classified environment-free by a traced provenance; or it is **reported as unclassifiable and reds the run**. Nothing is silently unclassified. A test whose environment read arrives through a form the checker cannot trace is therefore loud, not invisible — that is the difference between this bound and a recognizer's coverage claim. Widening `ENVIRONMENT_SOURCES` is a proposal carrying its own before/after counts, not a review round.

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

---

## 5. Documented limits

| id | limit | consequence |
| --- | --- | --- |
| L-1 | The premise contract binds only suites named in the mutation registry | An unenrolled suite may still ship a vacuous guard. Deliberate: a repo-wide recognizer over 1788 test files is the ratchet this spec exists to avoid. Enrollment is how a surface opts in, and it is now cheap (Unit 1). |
| L-2 | The recognizer traces provenance within one file, not across modules | An environment read reached through a helper in another module cannot be traced to its provenance. It is **reported as unclassifiable and reds the run** rather than passing as environment-free (§3.3.2), so the limit costs an explicit exemption, never a silent miss. |
| L-3 | A premise can itself be trivially true | `premise("x", 1, 0)` satisfies the checker and proves nothing. The checker enforces presence, not strength; strength is a review judgement, as it is for every assertion. |
| L-4 | V1 with no environment read is uncovered | A pure fixture too small to cross a boundary, with no spawn and no `process.env`, is not classified as environment-touching. Both shipped instances read the environment, so the mechanism reaches both, but the pure-fixture variant remains the prose rule's job (`docs/agents/writing-plans.md:13`). |
| L-5 | The mutation gate is nightly and not merge-gating | An enrolled surface's new gap surfaces one cycle after it lands. Unchanged by this spec; stated because §1.4 depends on it. |
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
- **AC-3** A fixture suite importing through `@/` passes through the real overlay config and the real runner, and the guard asserts the fixture still contains an `@/` import.
- **AC-4** `scripts/lib/ledger-claims-core.ts` and `scripts/lib/ledger-git.ts` are enrolled; `pnpm mutation:guards` passes; every survivor is killed, `equivalent` with an argument, or `accepted-gap` with a resolving ledger ref.
- **AC-4a** `GuardSurface.control` exists; `validateSurface` rejects a row whose `from` occurs zero times or more than once in `sourcePath`, each demonstrated by a rejection case; `lib/specLint/taskContract.ts` carries its existing control text as a registry row with no behavior change.
- **AC-4b** The gate **runs** each surface's control as the mutant and asserts KILLED — the run receives the control text, which `guardSurfaces.gate.test.ts:120` today does not. Demonstrated per enrolled surface by the recorded verdict, not asserted in prose.
- **AC-5** Each enrolled surface has its own `EXPECTED_LEDGER_KINDS` row.
- **AC-6** No `accepted` row on `ledger-git.ts` has an environment-dependent verdict; each such mutant is killed by a test that constructs its own ref namespace.
- **AC-7** `premise` / `premiseHolds` exist, fail loudly, and name the failure as a premise failure.
- **AC-8** `tests/mutation/_metaPremiseContract.test.ts (new)` carries one rejection/acceptance fixture pair **per accepted binding form** in §3.3.2's table — static named, static aliased, static namespace, dynamic destructured, hook-mediated — each pair differing in exactly one thing.
- **AC-8a** An unclassifiable fixture — an environment read through a form the checker cannot trace — is REPORTED and reds, not passed as environment-free. This is the executable proof of the fail-closed claim, without which §4's consequence bound is prose.
- **AC-9** The meta-test's non-vacuity assertions (§3.3.3, items 1-3) are present and each fails against a corresponding degenerate input; the declared per-suite count map's key set is asserted equal to the enrolled suite set, so a newly enrolled suite fails until it declares its own.
- **AC-10** Every qualifying test in the two enrolled suites carries a premise or a reasoned exemption, including `tests/scripts/ledgerClaimsCheck.test.ts:508-510`, whose repair constructs its own corpus.
- **AC-11** `docs/agents/writing-plans.md` carries the rule with the §1.2 table; `AGENTS.md` points at it and does not restate it.
- **AC-12** `pnpm test` and `pnpm typecheck` pass; real CI is green.

impeccable-gate: N/A — no UI surface
