# Plan — premiseScan nested-hook sibling leak

**Spec:** `docs/superpowers/specs/ci/2026-08-19-premisescan-nested-hook-sibling-leak-design.md`
**Probe record:** `docs/superpowers/specs/ci/probes/2026-08-19-premisescan-nested-hook-leak-probe.md`
**Row:** `BL-PREMISESCAN-NESTED-HOOK-SIBLING-LEAK` · **Branch:** `fix/premisescan-nested-hook-sibling-leak`

**Goal:** stop `hookBodies` from attaching an inner `describe`'s hooks to that describe's siblings,
without moving any live verdict and without widening the recognizer.

- impeccable-gate: N/A — no UI surface. No file under `app/`, `components/`, `app/globals.css`,
  `tailwind.config.*` or `DESIGN.md` is touched.

## Acceptance criteria this plan discharges

Each id is defined in the spec's §6 and is named here so it resolves outside the task markers that
cite it.

- **AC-1** — no declared count in `tests/mutation/_metaPremiseContract.test.ts` moves. Task 2 Step 5.
- **AC-2** — the shared-outer sibling classifies `environment-free` while branch A stays touching.
  Task 2.
- **AC-3** — the two existing AC-12b foils stay green, byte-unchanged. Task 2 Step 5.
- **AC-4** — the OUTER describe's own hooks still reach every descendant. Task 3.
- **AC-5** — the stop fires on every `describe` spelling, from a DERIVED fixture set. Task 4.
- **AC-6** — every hook registrar, derived from the matcher rather than typed beside it. Task 5.
- **AC-7** — the source-mutation gate still passes with an empty unaccepted-survivor set. Task 6.

## The implementation surface, stated whole

Round 1's derived-cover repair moved this beyond a one-line change, so it is enumerated rather than
described as "three lines":

1. **The stop** in `hookBodies` (`tests/mutation/source/premiseScan.ts:1834`) — three lines.
2. **`hookBodies` stops carrying its own copy of the registrar set.** `HOOK_REGISTRARS` already
   exists as a regex at `tests/mutation/source/premiseScan.ts:66` and is consumed by the top-level
   hook seed at `tests/mutation/source/premiseScan.ts:1758`; `hookBodies` at
   `tests/mutation/source/premiseScan.ts:1840` carries a SECOND, textually identical regex
   literal. AC-6's derivation is only meaningful if both matchers are one, so `hookBodies` is
   changed to use the existing constant and the duplicate literal is deleted.
3. **Two exported name lists**, so the fixtures can be generated from the matcher instead of typed
   beside it: the registrar names that `HOOK_REGISTRARS` is BUILT FROM, and `MODIFIERS`
   (`tests/mutation/source/premiseScan.ts:48`), today module-local.

4. **A structural identity test** — a new suite, `premiseScanMatcherIdentity`, beside the deciding
   one — pinning that exactly one registrar-name literal survives. It is what makes item 2 assertable: the
   behavioural cases cannot express it, because the four registrars are already covered.

Items 2 and 3 are production edits to an enrolled guard surface. Task 6 re-runs the mutation gate
over them; that is the accepted cost of the derivation, not a hidden one.

## Global constraints

1. **TDD per task.** Every task in a red-contract region installs or authors its red, observes it,
   makes the minimal change, and RE-RUNS THE SAME COMMAND to observe green. A step that says
   "revert" without re-running has observed half a contract.
2. **No `-t` in a `red=` command.** A name filter that matches nothing exits 0, so the red can
   report green from the moment it is written (`RED_TEST_NAME_FILTER`,
   `lib/specLint/redContract.ts:46`). Every red below runs a whole file.
3. **No command that lies about its status.** `if … then … fi`, never `cmd || echo ok`. `git grep`,
   not `rg` — `rg` is not guaranteed on the PATH.
4. **Derived covers, never enumerated lists.** Where a task asserts over a set of spellings or
   registrars, the set is READ from the source of truth in the same assertion.
5. **Heavy phases run under the semaphore.** `pnpm heavy pnpm test`, `pnpm heavy pnpm mutation:guards`.

---

## Task 1: pin the base

**Files:** none modified. No red: this task establishes the ground every later red-state claim
rests on, so it is deliberately outside the red-contract region rather than carrying an invented
red-state.

- [ ] **Step 1: record the base.** `git merge-base origin/main HEAD` and `git log --oneline -1`.
      Every probe figure in the spec's §3 was taken at `a85ccd453`; if the merge-base has moved,
      re-run §3.1, §3.2 and the probe record's Instrument 3 and re-derive any conclusion whose row moved.
- [ ] **Step 2: confirm the leak is live.** `npx vitest run tests/mutation/source/premiseScan.test.ts`
      passes on the unrepaired tree, the shared-outer pin included. That pass is what makes Task 2's
      red mean what it claims.
- [ ] **Step 3: confirm the corpus baseline.** `npx vitest run tests/mutation/_metaPremiseContract.test.ts`
      passes. This is the number AC-1 must still hold afterwards.

---

<!-- tasks: depth=2 red-contract -->

## Task 2: the sibling stops inheriting

<!-- task: red=`npx vitest run tests/mutation/source/premiseScan.test.ts` red-state=authored red-target=`tests/mutation/source/premiseScan.ts:1834` why=`hookBodies walks a describe with ts.forEachChild and never stops, so an inner describe's hook is collected by every ancestor and attached to every SIBLING branch. Step 1 rewrites the fixture that currently asserts that leak as-is; on the unrepaired tree the classifier still returns environment-touching for the sibling, so the command reds against the defective hookBodies named here. Step 4 re-runs the same command green` ac=AC-2,AC-1,AC-3 -->

**Files:** `tests/mutation/source/premiseScan.test.ts`, `tests/mutation/source/premiseScan.ts`.

- [ ] **Step 1: invert the pin.** Rewrite the fixture at
      `tests/mutation/source/premiseScan.test.ts:3033`. `inA` keeps `environment-touching` — it is
      the FOIL, and a repair that stopped collecting hooks altogether would pass a one-sided
      assertion. `inB` becomes `environment-free`. The comment stops describing a documented limit
      and starts describing a closed one, citing this plan.
- [ ] **Step 2: observe the red.** Run the `red=` command. Expected: one failure, the rewritten
      case, `expected 'environment-touching' to be 'environment-free'`.
- [ ] **Step 3: narrow `hookBodies`** (`tests/mutation/source/premiseScan.ts:1834`), recognizing a
      nested `describe` with the SAME predicate the caller uses (`registrarRoot`, `tests/mutation/source/premiseScan.ts:68`):

```ts
// A nested describe owns its own hooks and the caller (:1676) already carries
// ours down to it, so walking into it attaches its hooks to its SIBLINGS.
if (n !== describeCall && ts.isCallExpression(n) && registrarRoot(n.expression) === "describe")
  return;
```

- [ ] **Step 4: re-run the SAME command and observe green.**
      `npx vitest run tests/mutation/source/premiseScan.test.ts` — 300 passing, no skips. AC-3 is
      discharged here rather than separately: the two existing AC-12b foils are in this file and
      unchanged, so their passing in this run is the assertion.
- [ ] **Step 5: AC-1.** `npx vitest run tests/mutation/_metaPremiseContract.test.ts` — green, every
      declared count unchanged. **This staying green is the arc's headline, so it is asserted, not
      assumed.** It was measured green before a line was written (spec §3.2); this re-observes it
      against the committed repair.
- [ ] **Step 6: commit.** `fix(mutation): a nested describe's hooks stop reaching its siblings`

## Task 3: the outer describe's own hooks still reach every descendant

<!-- task: red=`npx vitest run tests/mutation/source/premiseScan.test.ts` red-state=authored red-target=`tests/mutation/source/premiseScan.ts:1834` why=`the one way Task 2's narrowing can be wrong is over-narrowing, and no existing fixture covers that direction - :2976 and :3011 both put the spawner in a nested describe and :3033 asserts the sibling. Step 2 installs the falsifying mutant IN hookBodies (the stop moved ABOVE the isHook push, which drops the outer describe's own hooks) and the authored case reds against it; Step 3 restores the shipped stop and re-runs the same command green` ac=AC-4 -->

**Files:** `tests/mutation/source/premiseScan.test.ts`.

- [ ] **Step 1: author the case and its foil.** A spawning `beforeEach` declared DIRECTLY in
      `describe("outer")`, with pure tests in nested `A` and `B`: both classify
      `environment-touching`. The foil is the same file with that hook moved into `A`: then only
      `A`'s test is touching and `B`'s is free. **Both halves are required** — the positive alone
      passes under a `hookBodies` that never stops, and the foil alone passes under one that always
      stops.
- [ ] **Step 2: install the NAMED mutant and observe the red.** Two plausible over-narrowings exist
      and this criterion catches only one, so the falsifying one is named rather than left to
      whoever runs the step. Move the `return` ABOVE the `isHook` push and key it to any nested
      call; the outer describe's own hooks are then dropped and the new case reds — probed
      2026-08-19: `expected 'environment-free' to be 'environment-touching'`. The same stop placed
      AFTER the push is EQUIVALENT here and passes; that is not the case failing to discriminate.
- [ ] **Step 3: restore the shipped stop and re-run the SAME command green.**
- [ ] **Step 4: commit.** `test(mutation): pin that an outer describe's hooks still reach descendants`

## Task 4: every describe spelling the caller recognizes also stops the walk

<!-- task: red=`npx vitest run tests/mutation/source/premiseScan.test.ts` red-state=authored red-target=`tests/mutation/source/premiseScan.ts:1834` why=`the stop and the caller's branch must agree on what a describe IS, and a stop keyed to a bare identifier would leak through every modifier spelling while the caller still treated them as describes. Step 3 installs that defective stop IN hookBodies and the derived cases red against it; Step 4 restores registrarRoot's predicate and re-runs the same command green. Probed 2026-08-19: all eight single spellings plus one compound chain leak before the repair and are closed after it` ac=AC-5 -->

**Files:** `tests/mutation/source/premiseScan.test.ts`, `tests/mutation/source/premiseScan.ts`.

- [ ] **Step 1: export `MODIFIERS`** (`tests/mutation/source/premiseScan.ts:48`), today module-local.
- [ ] **Step 2: generate the cases from it.** One per member as the NESTED registrar, each with a
      spawning hook in branch A and a pure test in sibling B under a shared outer `describe`, plus
      the plain `describe` and at least one COMPOUND chain (`describe.concurrent.each`) — the
      chain path is `registrarRoot`'s modifier loop at `tests/mutation/source/premiseScan.ts:73`,
      which a set generated from single members never reaches. `describe.each` and `describe.for`
      take the curried form. `describe.todo` is a real case, not an exception: the scanner is
      LEXICAL, so it sees a hook inside a `describe.todo` body regardless of Vitest never running
      it. Assert the generated count against `MODIFIERS.size` plus the extra cases, computed from
      `MODIFIERS` in the same expression, and state the premise executably with
      `premise("modifier spellings are enumerable", cases.length, 0)` from `tests/_shared/premise.ts`
      so a mis-read set cannot pass as an empty loop.
- [ ] **Step 3: install the defective stop and observe the red** — key it to
      `ts.isIdentifier(n.expression) && n.expression.text === "describe"`. The plain case stays
      green and every modifier case reds, which is the discrimination a four-row enumerated list
      would not have had.
- [ ] **Step 4: restore `registrarRoot` and re-run the SAME command green.**
- [ ] **Step 5: commit.** `test(mutation): the nested-describe stop covers every modifier spelling`

## Task 5: one registrar set, not two

<!-- task: red=`npx vitest run tests/mutation/source/premiseScanMatcherIdentity.test.ts` red-state=authored red-target=`tests/mutation/source/premiseScan.ts:1840` why=`hookBodies carries a SECOND registrar regex textually identical to HOOK_REGISTRARS at :66, so the fixture set and the matcher can drift apart silently - the disagreement AC-6 claims to eliminate. The red is a STRUCTURAL assertion in a new file: the module holds exactly one registrar-name literal. It reds against the duplicate at :1840 named here, and NO existing test can carry it - a behavioural red cannot, because the four registrars are already covered by enumerated cases at premiseScan.test.ts:2929 and :2955, so removing a name from the list would red those instead and the authored claim would be false. Step 3 deletes the duplicate and re-runs the same command green` ac=AC-6 -->

**Files:** a new `premiseScanMatcherIdentity` suite under `tests/mutation/source/`,
plus `tests/mutation/source/premiseScan.ts` and `tests/mutation/source/premiseScan.test.ts`.

**Why the red is structural and not behavioural.** The four registrars are ALREADY covered by
enumerated cases at `tests/mutation/source/premiseScan.test.ts:2929` and
`tests/mutation/source/premiseScan.test.ts:2955`. So a red produced
by removing a name from the exported list would be carried by those pre-existing tests, not by the
cases this task authors, and `red-state=authored` would be a false claim. The defect here is not
missing coverage — it is that TWO matchers exist where the design assumes one, and that is a
structural property, so it gets a structural assertion.

- [ ] **Step 1: author the identity test and observe the red.** A new file asserting that
      `tests/mutation/source/premiseScan.ts` contains exactly ONE registrar-name literal. It reds on
      the current tree, where `tests/mutation/source/premiseScan.ts:66` and
      `tests/mutation/source/premiseScan.ts:1840` both carry one. State the premise executably —
      `premise("the module was read", source.length, 0)` from `tests/_shared/premise.ts` — so an
      unreadable path cannot pass as zero occurrences.
- [ ] **Step 2: lift the names and delete the duplicate.** Export the four registrar names as a list,
      BUILD `HOOK_REGISTRARS` (`tests/mutation/source/premiseScan.ts:66`) from it, and change
      `hookBodies` at `tests/mutation/source/premiseScan.ts:1840` to use that constant. The existing
      consumer at `tests/mutation/source/premiseScan.ts:1758` is untouched — it tests the same regex
      object.
- [ ] **Step 3: re-run the SAME command green.**
- [ ] **Step 4: generate the AC-6 fixtures from the exported list**, one case per member: spawner
      nested in `A`, pure test in sibling `B`, `B` free. These add no coverage the enumerated cases
      lack — their value is that they are DERIVED, so a fifth registrar is covered by default. Assert
      the generated count against the exported list's length in the same expression, and run
      `npx vitest run tests/mutation/source/premiseScan.test.ts` green.
- [ ] **Step 5: commit.** `refactor(mutation): hookBodies and the top-level seed share one registrar set`

<!-- tasks: end -->

---

## Task 6: the guard still pins what it claims

**Files:** `tests/mutation/source/registry.ts` if and only if a `siteId` re-key is required. No
authored red: this task's command must be GREEN, and a task whose contract is "stay green" does not
belong in a red-contract region.

- [ ] **Step 1: run the gate.** `pnpm heavy pnpm mutation:guards`. Tasks 4 and 5 added exported
      symbols and deleted a duplicated literal on an enrolled surface, so the mutant population
      moves and this run is not a formality.
- [ ] **Step 2: dispose of every survivor.** A survivor is repaid with a test or argued
      `equivalent` in the registry with its reasoning. Any `siteId` re-key is DERIVED from the
      failing run's own output, never hand-edited by line number.
- [ ] **Step 3: record the score** here and in the round-1 diff brief: killed/total plus
      "0 unaccepted survivors". Enrolment precedes review — a diff dispatched before this runs
      invites a whole round of the-guard-does-not-pin-what-it-claims findings the score settles
      mechanically.
- [ ] **Step 4: commit** only if the registry changed.

---

<!-- tasks: depth=2 red-contract -->

## Task 7: whole-suite green, then graduation

<!-- task: red=`npx vitest run tests/docs/_metaLedgerInProgress.test.ts` red-state=authored red-target=`tests/docs/_metaLedgerInProgress.test.ts:52` why=`the state that creates and removes this failure is the ledger row in BACKLOG.md, which the marker grammar cannot name - a root-level file is bare-filename shorthand and RED_TARGET_INVALID rejects it (lib/specLint/redContract.ts:164) - so the target names the predicate the row is judged by: :52 is the isArchive test (:51 is its doc comment), and an archive may not hold an entry whose status is IN PROGRESS. Step 3 moves the row into BACKLOG-archive.md with its marker still attached and the command reds; Step 4 strips the marker in the SAME edit session and re-runs the same command green, which is what proves the marker came off before the merge` ac=AC-1 -->

**Files:** `BACKLOG.md`, `BACKLOG-archive.md`,
`docs/review-rounds/fix/premisescan-nested-hook-sibling-leak/`.

- [ ] **Step 1: whole suite and static gates.** `pnpm heavy pnpm test`; `pnpm typecheck`;
      `pnpm exec eslint .`; `pnpm format:check`.
- [ ] **Step 2: whole-diff adversarial review to APPROVE**, dispatched BEFORE the graduation commit,
      with Task 6's mutation score on the brief's `GUARD SURFACE:` line.
- [ ] **Step 3: move the row to the archive with its marker STILL ATTACHED and observe the red.**
      Run the `red=` command. Expected: FAIL — `archived work cannot be in flight`.
- [ ] **Step 4: strip the marker in the SAME edit session, write the graduation record, and re-run
      the SAME command green.** Invariant 12 is literal: a graduating entry's marker comes off in
      the same commit that archives it, because archives categorically reject in-progress work.
- [ ] **Step 5: leave it all uncommitted and review it as a working-tree diff**, so the PR's last
      commit is still reviewed even though nothing may follow it. The wrapper writes that review's
      corpus row at dispatch time, into the worktree, beside the graduation edits.
- [ ] **Step 6: ONE commit closes the history** — archive move, marker strip, graduation record,
      every corpus row. Then prove the marker is gone from the tree that merges:

```bash
if git grep -n -F 'Status:** IN PROGRESS' -- BACKLOG.md BACKLOG-archive.md; then
  echo "marker still present — it would merge to main"; exit 1
fi
echo "no in-progress marker in the tree that merges"
```

- [ ] **Step 7: push, real CI green, `gh pr merge --merge`, fast-forward `main`, verify
      `git rev-list --left-right --count main...origin/main` reports `0  0`.** Then Stage 4.4:
      delete the cron nudge and clear the pane and agent labels.

<!-- tasks: end -->

---

## 12. Close-out

impeccable-gate: N/A — no UI surface
