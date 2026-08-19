# Plan — premiseScan nested-hook sibling leak

**Spec:** `docs/superpowers/specs/ci/2026-08-19-premisescan-nested-hook-sibling-leak-design.md`
**Probe record:** `docs/superpowers/specs/ci/probes/2026-08-19-premisescan-nested-hook-leak-probe.md`
**Row:** `BL-PREMISESCAN-NESTED-HOOK-SIBLING-LEAK` · **Branch:** `fix/premisescan-nested-hook-sibling-leak`

**Goal:** stop `hookBodies` from attaching an inner `describe`'s hooks to that describe's siblings,
without moving any live verdict and without widening the recognizer.

- impeccable-gate: N/A — no UI surface. No file under `app/`, `components/`, `app/globals.css`,
  `tailwind.config.*` or `DESIGN.md` is touched.

## Global constraints

1. **TDD per task.** Failing test first, then the minimal implementation, then the passing test,
   then the commit. Every task declares its red as a COMMAND that can express a verdict.
2. **No command that lies about its status.** Use `if … then … fi`, never `cmd || echo ok`; a
   `grep` that prints and exits 0 is not a gate. `git grep`, not `rg` — `rg` is not guaranteed on
   the PATH.
3. **Derived covers, never enumerated lists.** Where a task asserts over a set of spellings or
   registrars, the set is READ from the source of truth in the same assertion, so a later addition
   is covered by default rather than silently exempt.
4. **Heavy phases run under the semaphore.** `pnpm heavy pnpm test`, `pnpm heavy pnpm mutation:guards`.
   Scoped vitest runs with an explicit file list stay unwrapped.

---

## Task 0: pin the base and re-run the spec's probes against it

<!-- task: red=`npx vitest run tests/mutation/source/premiseScan.test.ts -t "SHARED-OUTER"` red-state=pre-existing-green red-target=`tests/mutation/source/premiseScan.test.ts:3033` why=`this task establishes the BASE, so its command must be GREEN before any edit - the shared-outer pin passes on the unrepaired tree because the leak is live. A red here means the base is not what the spec measured and every later red-state claim is unanchored` ac=AC-1 -->

**Files:** none modified.

- [ ] **Step 1: record the base.** `git merge-base origin/main HEAD` and `git log --oneline -1`.
      Every probe figure in the spec's §3 was taken at `a85ccd453`; if the merge-base has moved,
      re-run §3.1 and §3.2 and re-derive any conclusion whose row moved.
- [ ] **Step 2: confirm the leak is live.** The command in the `red=` above must PASS. That is the
      pre-condition for Task 1's red meaning what it claims.
- [ ] **Step 3: confirm the corpus baseline.** `npx vitest run tests/mutation/_metaPremiseContract.test.ts`
      passes. This is the number AC-1 must still hold after the repair.

---

## Task 1: the sibling stops inheriting — the pin inverts, then the repair

<!-- task: red=`npx vitest run tests/mutation/source/premiseScan.test.ts -t "SHARED-OUTER"` red-state=authored red-target=`tests/mutation/source/premiseScan.test.ts:3033` why=`the fixture at :3033 currently asserts inB is environment-touching, which is the leak asserted as-is. Step 1 rewrites that assertion to environment-free and rewrites the comment to say what it now pins; on the unrepaired tree the classifier still returns environment-touching, so the command reds for exactly the reason the task exists. Step 2's three-line narrowing in hookBodies greens the same command` ac=AC-2 -->

**Files:** `tests/mutation/source/premiseScan.test.ts`, `tests/mutation/source/premiseScan.ts`.

- [ ] **Step 1: invert the pin and observe the red.** Rewrite the fixture at
      `tests/mutation/source/premiseScan.test.ts:3033`. `inA` keeps `environment-touching` — it is
      the FOIL, and a repair that stopped collecting hooks altogether would pass a one-sided
      assertion. `inB` becomes `environment-free`. The comment stops describing a documented limit
      and starts describing a closed one, citing this plan. **Keep the token `SHARED-OUTER` in the
      test name** — Task 0's and this task's `red=` commands both select it with `-t`, and renaming
      it past that token turns both gates into vacuous no-match passes.
- [ ] **Step 2: narrow `hookBodies`.** In `tests/mutation/source/premiseScan.ts:1834`, stop the walk
      at a nested `describe`, recognized by the SAME predicate the caller uses
      (`registrarRoot`, `tests/mutation/source/premiseScan.ts:68`):

```ts
// A nested describe owns its own hooks and the caller (:1676) already carries
// ours down to it, so walking into it attaches its hooks to its SIBLINGS.
if (n !== describeCall && ts.isCallExpression(n) && registrarRoot(n.expression) === "describe")
  return;
```

- [ ] **Step 3: green, and prove nothing else moved.**

```bash
npx vitest run tests/mutation/source/premiseScan.test.ts
npx vitest run tests/mutation/_metaPremiseContract.test.ts
```

Expected: the deciding suite fully green, and the contract suite green with every declared count
unchanged. **`_metaPremiseContract` staying green is the headline, so it is asserted, not assumed** —
it is what the spec's §3.2 measured before a line was written, and what AC-1 pins afterwards.

- [ ] **Step 4: commit.** `fix(mutation): a nested describe's hooks stop reaching its siblings`

---

## Task 2: the outer describe's own hooks still reach every descendant

<!-- task: red=`npx vitest run tests/mutation/source/premiseScan.test.ts -t "outer hook reaches both branches"` red-state=authored red-target=`tests/mutation/source/premiseScan.ts:1834` why=`the one way Task 1's narrowing can be wrong is over-narrowing - stopping at a nested describe so early that the OUTER describe's own hooks stop reaching nested tests. No existing fixture covers that direction: :2976 and :3011 both have the spawner in a nested describe, and :3033 asserts the sibling. Authored red-state because the case does not exist yet; it must be seen failing against a deliberately over-narrowed hookBodies (return BEFORE the isHook push) before it is trusted` ac=AC-4 -->

**Files:** `tests/mutation/source/premiseScan.test.ts`.

- [ ] **Step 1: author the case and its foil.** A spawning `beforeEach` declared DIRECTLY in
      `describe("outer")`, with pure tests in nested `A` and `B`: both classify
      `environment-touching`. The foil is the same file with that hook moved into `A`: then only
      `A`'s test is touching and `B`'s is free. **Both halves are required** — the positive alone
      passes under a `hookBodies` that never stops, and the foil alone passes under one that always
      stops.
- [ ] **Step 2: prove the case can fail, with the mutant NAMED.** Two plausible over-narrowings
      exist and only one of them this criterion catches, so the falsifying one is stated rather than
      left to whoever runs the step. Place the `return` BEFORE the `isHook` push, keyed to any
      nested call — the outer describe's own direct hooks are then dropped and the new case reds
      (probed 2026-08-19: `expected 'environment-free' to be 'environment-touching'`). The same stop
      placed AFTER the push is EQUIVALENT here and passes, because collection has already happened;
      do not mistake that for the case failing to discriminate. Revert after observing the red.
- [ ] **Step 3: commit.** `test(mutation): pin that an outer describe's hooks still reach descendants`

---

## Task 3: every describe spelling the caller recognizes also stops the walk

<!-- task: red=`npx vitest run tests/mutation/source/premiseScan.test.ts -t "every describe modifier stops the leak"` red-state=authored red-target=`tests/mutation/source/premiseScan.ts:68` why=`the stop and the caller's own branch must agree on what a describe IS. registrarRoot accepts a modifier chain (MODIFIERS at tests/mutation/source/premiseScan.ts:48, consulted by registrarRoot at :73), so a stop keyed to a bare describe identifier would leak through describe.each / describe.only / describe.skip while the caller still treated them as describes. Authored red-state: the case does not exist, and it must be seen failing against a stop written as ts.isIdentifier(n.expression) && n.expression.text === "describe"` ac=AC-5 -->

**Files:** `tests/mutation/source/premiseScan.test.ts`.

- [ ] **Step 1: derive the spelling list, do not type it.** `MODIFIERS`
      (`tests/mutation/source/premiseScan.ts:48`) is module-local today. EXPORT it, import it in the
      suite, and generate one case per member. A hand-typed list is exempt from the next modifier
      anyone adds; a derived one reds. The export is a new symbol on an enrolled surface, so Task 5
      re-runs the gate over it — that is the cost of the derivation and it is accepted, not hidden.
      **Add at least one COMPOUND chain** (`describe.concurrent.each`): `registrarRoot`'s loop
      (`tests/mutation/source/premiseScan.ts:73`) walks a chain of modifiers, and a set generated
      from single members alone never reaches that path. Spec round 1 probed `describe.for`,
      `describe.sequential` and `describe.concurrent.each` each retaining the wrong sibling verdict
      on the unrepaired tree, so all three are live cases, not hypotheticals.
- [ ] **Step 2: state the premise executably, and assert the COUNT against the derived population.**
      `premise("modifier spellings are enumerable", cases.length, 0)` from `tests/_shared/premise.ts`
      stops an empty loop from passing by asserting nothing. Then assert the generated count equals
      `MODIFIERS.size` plus the compound cases, computed from `MODIFIERS` in the same expression —
      that is what makes a member added later fail rather than sit silently uncovered, and it is the
      half a hand-written stop-list would otherwise satisfy.
- [ ] **Step 3: prove it can fail**, by keying the stop to a bare identifier and confirming the
      modifier cases red while the plain `describe` case stays green. Revert.
- [ ] **Step 4: commit.** `test(mutation): the nested-describe stop covers every modifier spelling`

---

## Task 4: all four hook registrars

<!-- task: red=`npx vitest run tests/mutation/source/premiseScan.test.ts -t "every hook registrar"` red-state=authored red-target=`tests/mutation/source/premiseScan.ts:1834` why=`hookBodies matches four registrar names with one regex; a fixture pair covering only beforeEach and beforeAll reads as complete and leaves half the defect live, which is the exact shape #843's own probe row D found. Authored red-state: the case does not exist and must be seen failing against a hookBodies whose stop fires only for the before* forms` ac=AC-6 -->

**Files:** `tests/mutation/source/premiseScan.test.ts`.

- [ ] **Step 1: derive the registrar list, do not type it.** The four names live in a regex
      literal inside `hookBodies` (`tests/mutation/source/premiseScan.ts:1834`). Lift them to an
      exported `HOOK_REGISTRARS` array that the regex is BUILT FROM, so the suite and the matcher
      cannot disagree, and generate one case per member: the spawner in nested `A`, a pure test in
      sibling `B`, `B` free. Same accepted cost as Task 3 Step 1.
- [ ] **Step 2: premise on a non-empty case list**, as in Task 3 Step 2.
- [ ] **Step 3: commit.** `test(mutation): the sibling-leak fix covers all four hook registrars`

---

## Task 5: the guard still pins what it claims

<!-- task: red=`pnpm heavy pnpm mutation:guards` red-state=pre-existing-green red-target=`tests/mutation/source/registry.ts` why=`premiseScan is enrolled with a score floor; this task's command must be GREEN after the repair, and the number plus an empty unaccepted-survivor set is what the round-1 diff brief must state. Enrolment precedes review - a diff dispatched before this runs invites a whole round of the-guard-does-not-pin-what-it-claims findings that the score settles mechanically` ac=AC-7 -->

**Files:** `tests/mutation/source/registry.ts` if and only if a `siteId` re-key is required.

- [ ] **Step 1: run the gate.** `pnpm heavy pnpm mutation:guards`.
- [ ] **Step 2: dispose of every survivor.** A survivor is repaid with a test or argued
      `equivalent` in the registry with its reasoning. Any `siteId` re-key is DERIVED from the
      failing run's own output, never hand-edited by line number.
- [ ] **Step 3: record the score** in the plan and in the round-1 diff brief: killed/total plus
      "0 unaccepted survivors".
- [ ] **Step 4: commit** only if the registry changed.

---

## Task 6: whole-suite green, then graduation

<!-- task: red=`npx vitest run tests/docs/_metaLedgerInProgress.test.ts` red-state=authored red-target=`tests/docs/_metaLedgerInProgress.test.ts:51` why=`an archive may not hold an entry whose status is IN PROGRESS, so moving the row into BACKLOG-archive.md with its marker still attached reds this suite; stripping the marker in the same edit session greens the same command, which is what proves the marker came off before the merge` ac=AC-1 -->

**Files:** `BACKLOG.md`, `BACKLOG-archive.md`, `docs/review-rounds/fix/premisescan-nested-hook-sibling-leak/`.

- [ ] **Step 1: whole suite and static gates.** `pnpm heavy pnpm test`; `pnpm typecheck`;
      `pnpm exec eslint .`; `pnpm format:check`.
- [ ] **Step 2: whole-diff adversarial review to APPROVE**, dispatched BEFORE the graduation commit,
      with the mutation score from Task 5 on the brief's `GUARD SURFACE:` line.
- [ ] **Step 3: perform the graduation in the WORKING TREE and leave it uncommitted** — archive move,
      marker strip, graduation record, every round-corpus row — then review it as a working-tree
      diff, so the PR's last commit is still reviewed even though nothing may follow it.
- [ ] **Step 4: ONE commit closes the history.** Then prove the marker is gone from the tree that
      merges:

```bash
if git grep -n -F 'Status:** IN PROGRESS' -- BACKLOG.md BACKLOG-archive.md; then
  echo "marker still present — it would merge to main"; exit 1
fi
echo "no in-progress marker in the tree that merges"
```

- [ ] **Step 5: push, real CI green, `gh pr merge --merge`, fast-forward `main`, verify
      `git rev-list --left-right --count main...origin/main` reports `0  0`.** Then Stage 4.4:
      delete the cron nudge and clear the pane and agent labels.

---

## 12. Close-out

impeccable-gate: N/A — no UI surface.
