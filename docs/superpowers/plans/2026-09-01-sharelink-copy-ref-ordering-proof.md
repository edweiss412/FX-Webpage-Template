# The share-link copy button's layout-effect ordering, proved: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close `SHARELINK-COPY-REF-ORDERING-PROOF` (DEFERRED.md) by building the test harness its un-defer trigger asks for, using it to prove that `ShareLinkCopyButton`'s `urlRef` write must be a LAYOUT effect, and registering that proof as an adversary in the share-link matrix so the proof cannot silently rot.

**Architecture:** No production code changes. One new jsdom test file drives React through `createRoot` with no `act()` and no `flushSync` on the rotate, so React's real scheduler puts the commit and the passive-effect flush in different tasks. A sibling probe ordered AFTER the button releases the stalled clipboard promise from its own layout effect, which lands the promise continuation in the microtask drain between the two. That is the commit-to-passive window the row says nobody had reached. The new file joins `VITEST_SUITES` in `scripts/share-link-flash-adversary-matrix.mjs`, and the layout-to-passive swap is registered there as adversary `A39`, so spec §9.0's "every registered adversary is rejected" becomes the executable statement of the proof.

**Tech Stack:** React 19.2.4 / react-dom 19.2.4, Vitest 4.1.5 + jsdom (the `parallel` project), the matrix script's own Playwright leg for full-mode confirmation.

**Governing documents:** the `SHARELINK-COPY-REF-ORDERING-PROOF` entry in `DEFERRED.md`; spec `docs/superpowers/specs/2026-07-24-share-link-chrome-backlog-design.md` §9.0/§9.1.1 for the matrix contract; the matrix report at `docs/superpowers/plans/2026-07-24-share-link-chrome-adversary-matrix.md`. There is no new spec: the row IS the requirement, and this arc's brief says so.

impeccable-gate: N/A — no UI surface

## Global constraints

- **Invariant 1 (TDD).** Each task: observed red, minimal change, observed green, commit.
- **Invariant 6 (commit per task).** `test(admin)` for the harness, `docs(plan)` for plan and ledger commits.
- **Invariant 8.** Not a UI arc. No file under `app/` or `components/` changes; `DESIGN.md` and the Tailwind config are untouched. The marker line above is the `N/A` form.
- **Invariant 11.** All work in `/Users/ericweiss/FX-worktrees/copyref`, branch `test/sharelink-copy-ref-ordering-proof`.
- **Invariant 12.** The row is marked IN PROGRESS on `d6e90d893` and pushed; the marker comes off in the PR's last commit, in the same commit that archives the row.
- **No new ledger rows**, of any facing, under any exception clause (arc brief). Anything found and not repaired goes in the PR body under "Unfixed peers" and into the readiness message.
- **No whitelist.** Round-11 review rejected `UNPROVEN_SURVIVORS` as laundering; this arc does not reintroduce it, does not add an `EQUIVALENT_SURVIVORS` row for `A39`, and does not exempt anything. `A39` is registered and REJECTED, or the arc reports failure to bl-orch.

## Meta-test inventory

- **EXTENDS** `tests/docs/_metaDeferralLedgerGraduation.test.ts`: one id added to its `GRADUATED` registry (Task 2).
- **SATISFIES, does not extend** `tests/docs/_metaLedgerInProgress.test.ts`: the IN PROGRESS marker written at Stage 0 is removed in the same commit that archives the row, so no marker reaches main.
- **CREATES no new structural meta-test.** The structural defense this arc ships is the adversary registration itself: `A39` in the matrix is the permanent, bidirectional check that the earlier whitelist lacked. A separate meta-test asserting "the file is in `VITEST_SUITES`" would assert less than the matrix run already asserts.
- **Advisory-lock topology: N/A.** Nothing in this diff touches `pg_advisory*`, an RPC, or a table.

## Mandatory task classes that do not apply

Stated rather than omitted, because a silent omission and a considered N/A read the same to a reviewer.

- **Layout-dimensions task: N/A.** No fixed-dimension parent with flex or grid children is touched. No component renders differently after this diff, because no component changes.
- **Transition-audit task: N/A.** No `AnimatePresence`, no conditional render, no visual state machine is added or altered. The new file observes an existing component's two labels; it introduces no transitions of its own.
- **Embedded-snippet typecheck: N/A by construction.** The only code block in this plan is a JavaScript `ADVERSARIES.push` literal for a `.mjs` script, which the repo's TypeScript config does not cover. The harness itself is deliberately REFERENCED rather than pasted: a second copy in this document could only drift from the one that runs, and the pill-size arc's round-2 findings were nearly all defects in embedded test code that had never executed.

## Mutation-family closure

The closure set this review converges against, enumerated up front. The subject is a two-row jsdom suite plus one registry row, so the families are small and closed:

1. **Effect-phase swap.** `useLayoutEffect` to `useEffect` for the `urlRef` write. This is `A39`, the whole point of the arc.
2. **Guard deletion.** The captured-url comparison removed. Already `A32`; the new discriminating row must red under it too, or the row is testing the harness rather than the component.
3. **Guard inversion to blanket suppression.** Already `A35`; the new mirror row exists to red under it.
4. **Harness self-defeat.** The window silently closing (React scheduling changes, an `act()` environment turned on globally, `flushSync` reintroduced). Covered by executable premises inside the file rather than by an adversary, because the defect is in the harness and no source mutation expresses it.

A reviewer-proposed fifth family is admissible with a live escaping mutant demonstrated against the shipped file, per the round-economy rule. Family 4 is deliberately NOT expressed as a matrix adversary: the matrix mutates `TARGETS` (four production files) and the harness's own environment is not among them.

## Pre-draft code verification

Every claim below was grepped against the live tree at `059bd1bd4` / `d6e90d893` on 2026-09-01.

| Claim | Verified at |
|---|---|
| The `urlRef` write is a layout effect | `app/admin/show/[slug]/ShareLinkCopyButton.tsx:93-95` |
| `useEffect` and `useLayoutEffect` are both already imported, so the mutation needs no import edit | `app/admin/show/[slug]/ShareLinkCopyButton.tsx:18` |
| The captured-url guard | `app/admin/show/[slug]/ShareLinkCopyButton.tsx:107` |
| Button and announcer testids | `app/admin/show/[slug]/ShareLinkCopyButton.tsx:172` and `app/admin/show/[slug]/ShareLinkCopyButton.tsx:203` |
| The matrix runs vitest files by explicit list, and the rotate suite is already one of them | `scripts/share-link-flash-adversary-matrix.mjs:38-46` |
| `COPY` is the component's path | `scripts/share-link-flash-adversary-matrix.mjs:36` |
| `A32` (guard deleted) and `A35` (blanket suppression) exist and mutate `COPY` | `scripts/share-link-flash-adversary-matrix.mjs:493-497` and `scripts/share-link-flash-adversary-matrix.mjs:523-527` |
| `--only` with an unknown id exits 2 before `assertCleanTargets`/`acquireLock` | `scripts/share-link-flash-adversary-matrix.mjs:1189-1199` and `scripts/share-link-flash-adversary-matrix.mjs:1201-1202` |
| `--only` and `--quick` runs never write the report doc | `scripts/share-link-flash-adversary-matrix.mjs:1269` |
| Highest registered id is `A38`; `A39` is free | run output pasted in the sweep below |
| `tests/components/**` is in the parallel, DB-free vitest project | `vitest.projects.ts:105` |
| `premise` / `premiseHolds` live here | `tests/_shared/premise.ts:26` and `tests/_shared/premise.ts:36` |
| The graduation registry | `tests/docs/_metaDeferralLedgerGraduation.test.ts:72` (`GRADUATED`) |
| React and react-dom versions | `node -p "require('react/package.json').version"` gives `19.2.4`; react-dom the same |

## Reconciliation sweep, run at plan time

Every site that references the row id or the claim this arc invalidates. Run 2026-09-01 in the worktree.

```
$ grep -rn "SHARELINK-COPY-REF-ORDERING-PROOF" --exclude-dir=node_modules --exclude-dir=.git . | sed 's/:.*//' | sort | uniq -c
   1 DEFERRED.md
   1 docs/superpowers/plans/2026-07-24-share-link-chrome-adversary-matrix.md
   1 docs/superpowers/plans/2026-08-04-backlog-convergence.md
   1 docs/superpowers/specs/2026-08-05-l-wave-decisions-brief.md
   1 docs/superpowers/specs/2026-08-06-l-wave-design.md
   1 tests/components/admin/shareLinkCopyButtonRotate.test.tsx
   1 tests/fixtures/ledger-mass/2026-08-04.ledgers.json

$ grep -rn "UNPROVEN_SURVIVORS" --exclude-dir=node_modules --exclude-dir=.git . | sed 's/\(:[0-9]*\):.*/\1/'
DEFERRED.md:52
tests/fixtures/ledger-mass/2026-08-04.ledgers.json:5
docs/superpowers/plans/2026-07-24-share-link-chrome-adversary-matrix.md:8
```

Per-hit disposition:

| Site | Disposition |
|---|---|
| `DEFERRED.md`, the `SHARELINK-COPY-REF-ORDERING-PROOF` entry | The row itself. Archived in Task 2. |
| `docs/superpowers/plans/2026-07-24-share-link-chrome-adversary-matrix.md:8` | REPAIRED in Task 1. The sentence "the adversary is unregistered rather than exempted" becomes false the moment `A39` lands. |
| `tests/components/admin/shareLinkCopyButtonRotate.test.tsx:27-49` | REPAIRED in Task 1. Its SCOPE paragraph states the timing "is still not proven" and that no jsdom probe reached the window. Both become false. |
| `docs/superpowers/plans/2026-08-04-backlog-convergence.md:55` | LEFT ALONE. A dated 2026-08-04 screening record listing the a-class KEEP ids as they stood that day. Editing a dated record to match today makes it a worse record. |
| `docs/superpowers/specs/2026-08-05-l-wave-decisions-brief.md:104`, `docs/superpowers/specs/2026-08-06-l-wave-design.md:95` | LEFT ALONE. Same reason: dated l-wave screening records, and `2026-08-06-l-wave-design.md:95` says "PREREQ ... no such harness exists today", which was true on its own date. |
| `tests/fixtures/ledger-mass/2026-08-04.ledgers.json:5` | LEFT ALONE, and MUST NOT be edited: it is a frozen dated snapshot the ledger-mass guard reads. Editing it to reflect today would break the guard's own baseline. |

The sweep is by derivation, not by phrase: the two greps enumerate every file that names the row or the rejected whitelist, and the table disposes every one. A phrase grep alone cannot see a document that refers to the gap without naming it, so the second axis was the two test files the row itself names as the proof surface (`tests/components/admin/shareLinkCopyButtonRotate.test.tsx`, `tests/e2e/share-link-flash.spec.ts`); grepping those two for `not proven|unproven|commit-to-passive|act()` returned four lines, all in the rotate suite's header, and none in the Playwright spec.

## Registry count reconciliation

`scripts/share-link-flash-adversary-matrix.mjs` today registers 38 adversaries. The run below is the mechanical enumeration, not a count read off the report doc:

```
$ node scripts/share-link-flash-adversary-matrix.mjs --only A39 --quick ; echo "EXIT=$?"
--only names unknown adversary id(s): A39
known ids: A1, A2, A3, A4, A5, A6, A7, A8, A9, A10, A11, A12, A13, A14, A15, A16, A17, A18, A19, A20, A23, A24, A25, A26, A27, A28, A29, A30, A31, A32, A33, A34, A35, A36, A37, A38, A22, A21
EXIT=2
```

38 ids, no `A39`. This plan adds exactly one row, so the registry goes to 39 and the generated table in the report doc (which currently reads `_38 adversaries · 37 rejected · 1 survived · 0 unapplied._`) becomes one row short until a FULL run regenerates it. See the closeout for how that is handled honestly rather than by hand-editing a generated block.

## e2e harness readiness

This plan attaches no new Playwright spec. It does invoke the matrix's existing Playwright leg in full mode, so the three items are stated against that leg rather than waived:

- **(a) Boot mechanism:** the matrix shells out to the repo's own Playwright config; the spec it runs is `tests/e2e/share-link-flash.spec.ts`, unchanged by this arc.
- **(b) Readiness gate:** unchanged. No new assertion is added to that spec, so no new hydration gate is introduced.
- **(c) Detach safety:** unchanged, for the same reason. No new `locator.evaluate` sampler is added.

Full mode is a non-interactive Playwright run and therefore a heavy phase: every full-mode invocation in this plan is written `pnpm heavy node scripts/share-link-flash-adversary-matrix.mjs ...`, matching the AGENTS.md transitive-shape rule. The Playwright invocation itself is at `scripts/share-link-flash-adversary-matrix.mjs:1042`; AGENTS.md and `tests/docs/agentsHeavyPhaseRule.test.ts` both pin the string `scripts/share-link-flash-adversary-matrix.mjs:1014`, which today lands inside a JSDoc block and names nothing. So the AGENTS.md citation has drifted, and THIS diff moved it further: the invocation sat at `scripts/share-link-flash-adversary-matrix.mjs:1017` before the `A39` block was inserted, and the 25 lines that block adds pushed it to `scripts/share-link-flash-adversary-matrix.mjs:1042`. The RULE the citation supports is unaffected in either case. It is not repaired here, and the reason is in Unfixed peers. `--quick` invocations spawn no browser and run vitest against an explicit file list, so they stay unwrapped.

## Acceptance criteria

- AC-1 With the harness, the shipped component leaves the button reading `Copy` and the announcer empty when a stalled clipboard promise settles inside the commit-to-passive window of a rotate. Discharged by a CLEAN run of the new suite on the unmutated tree (Task 1 Step 6b), never by the matrix, which mutates before it ever runs vitest.
- AC-2 With `useLayoutEffect` swapped for `useEffect` at `ShareLinkCopyButton.tsx:93`, that same row REDS. The row's un-defer trigger is satisfied by an observed red, not by an argument.
- AC-3 The harness states its own premises executably, so a future React or setup change that closes the window fails loudly instead of passing vacuously.
- AC-4 A mirror row proves the harness's window does not itself suppress confirmations: a commit that does not change the url, released in the same window, still confirms.
- AC-5 The layout-to-passive swap is registered as adversary `A39` in the matrix, the new file is in `VITEST_SUITES`, and a scoped matrix run records `A39 REJECTED`. No whitelist row, no `EQUIVALENT_SURVIVORS` row, no exemption.
- AC-6 Every row the new file adds rejects at least one registered adversary, so spec §9.0's no-vacuous-row rule holds for the rows this arc introduces. Attribution is by a row id proven unique across `VITEST_SUITES`, because the matrix records a rejected row by title alone and a shared title would credit this file with another suite's failure.
- AC-7 The two prose sites this change makes false are repaired in the same branch, and the three dated historical records plus the frozen ledger-mass fixture are left alone with the reason recorded.
- AC-8 The row is graduated in the PR's last commit: moved to `DEFERRED-archive.md`, added to `GRADUATED`, IN PROGRESS marker removed.

## Tasks

<!-- tasks: depth=3 red-contract -->

### Task 1: The ordering harness, the adversary, and the prose it falsifies

<!-- task: red=`node scripts/share-link-flash-adversary-matrix.mjs --only A39 --quick` red-state=live why=`A39 is not a registered adversary id, so the run refuses with exit 2 before it mutates or locks anything; it exits 0 only once A39 is registered AND some vitest row reds under it` ac=AC-1,AC-2,AC-3,AC-4,AC-5,AC-6,AC-7 -->

**Files:** tests/components/admin/shareLinkCopyButtonOrdering.test.tsx (new; written without backticks because the citation lint resolves cited paths against the tracked tree, and a file this task has not created yet is not in it), `scripts/share-link-flash-adversary-matrix.mjs`, `tests/components/admin/shareLinkCopyButtonRotate.test.tsx`, `docs/superpowers/plans/2026-07-24-share-link-chrome-adversary-matrix.md`.

The red is the command in the marker, observed at plan time (exit 2, output pasted in the registry reconciliation above). It goes green only when both halves land: `A39` registered, and a vitest row that actually reds under it. Registering `A39` alone turns exit 2 into exit 1 with `*** SURVIVED ***`, which is the failure this arc exists to avoid, so the command discriminates the half-done state as well as the not-done one.

- [x] **Step 1: The harness file.** tests/components/admin/shareLinkCopyButtonOrdering.test.tsx, carrying `// @vitest-environment jsdom`. It drives React directly rather than through Testing Library, because RTL's `render` and `rerender` wrap every commit in `act()`, and `act()` flushes passive effects before yielding to the microtask queue. That is the exact obstacle the row records, and dropping RTL is what removes it. Mechanism, in order:
  1. `IS_REACT_ACT_ENVIRONMENT` is set to `false` for the file, so React never installs its act queue and schedules through the real scheduler.
  2. Mount with `flushSync(() => root.render(...))`, so the initial tree exists synchronously. `flushSync` DOES flush passive effects (probed: after the mount `flushSync`, a sibling probe had already logged both `layout` and `passive`), which is why it is used for setup and NEVER for the rotate.
  3. Click the button through a real DOM `click()`. The fake clipboard's `writeText` returns a promise the test can settle on demand.
  4. Rotate with a bare `root.render(...)`, outside `act` and outside `flushSync`. React schedules that render through its own scheduler, so the commit lands in a later macrotask.
  5. A `ReleaseProbe` rendered AFTER `ShareLinkCopyButton` calls `release()` from its own `useLayoutEffect`. Layout effects run in tree order, so the button's `useLayoutEffect([url])` has already written `urlRef` by the time the probe fires. The release therefore lands after the whole commit's layout phase and before its passive phase.
  6. The promise continuation is a microtask; React's passive flush is a scheduler task. (The scheduler picks its host callback by what the environment offers, and under Node it takes `setImmediate` rather than `MessageChannel`; the harness therefore waits for the flush to be OBSERVED rather than for a fixed number of turns, and the language ordering rule that microtasks drain before any task is what puts the continuation first.)
- [x] **Step 2: The premises, above the assertions that rest on them.** Using `premiseHolds` from `tests/_shared/premise.ts`, unconditionally, not inside any `.each` callback, and evaluated on each case's OWN run rather than once for the file. Five, and the list here is the file's list:
  1. the click captured the url this case is about, so the assertion is about the copy it names;
  2. the probe reached the release at all, so a commit under test happened;
  3. at release time the commit's layout effects HAVE run and none of its passive effects have (the probe's per-commit phase log is exactly `["layout"]`);
  4. the settled promise resumed its continuations, and the commit's passive effects eventually ran, each proven present before either is compared, since `indexOf` returns `-1` for an event that never happened and `-1` precedes every real index;
  5. the microtask drain preceded the passive flush, which is the window itself.

  The act environment is SET to false rather than asserted. A premise that checks a value the same file just assigned proves nothing; what is worth asserting is the consequence, which is premises 3 and 5. The setting is documented at the site instead, because a future global setup file that turned the flag on would reinstate the act queue and close the window.
- [x] **Step 3: The discriminating row.** After the release lands in the window and the tree settles, the button reads `Copy` and the announcer's text is empty. Scoped to the two testids separately, so a passing label cannot stand in for a passing announcement. This is `T-ORDER-STALE`, the row that reds under `A39` (AC-2) and also under `A32` (AC-6, family 2).
- [x] **Step 4: The mirror row.** Same harness, but the second `root.render` passes the SAME url. The commit still happens and the probe still releases inside the window, but nothing rotated, so the guard must let the confirmation through: the button reads `Copied` and the announcer reads `URL copied to clipboard`. Without this row the discriminating row is satisfied by a harness that suppresses everything. This is `T-ORDER-FRESH`. It reds under `A35` (AC-6, family 3).
- [x] **Step 5: Register the adversary and the suite.** Add the file to `VITEST_SUITES` in `scripts/share-link-flash-adversary-matrix.mjs`, and push `A39`:

  ```js
  ADVERSARIES.push([
    "A39",
    "copy button: urlRef written in a PASSIVE effect, so a promise settling before the passive flush confirms a dead url",
    [
      [
        COPY,
        "  useLayoutEffect(() => {\n    urlRef.current = url;\n  }, [url]);",
        "  useEffect(() => {\n    urlRef.current = url;\n  }, [url]);",
      ],
    ],
  ]);
  ```

  The find string occurs exactly once in `ShareLinkCopyButton.tsx` and needs no import edit, because line 18 already imports both hooks. A mutation that fails to apply is reported `UNAPPLIED`, not silently passed, so a stale find string cannot read as a survivor.

- [x] **Step 6: Observed red, then observed green, on the marker's command.** Paste both. The red is exit 2 (unknown id). The green is `A39 REJECTED` and exit 0.

  ```
  $ node scripts/share-link-flash-adversary-matrix.mjs --only A39 --quick   # BEFORE
  --only names unknown adversary id(s): A39
  EXIT=2

  $ node scripts/share-link-flash-adversary-matrix.mjs --only A39 --quick   # AFTER
  A39  REJECTED  (1 rows)  copy button: urlRef written in a PASSIVE effect, so a promise
                           settling before the passive flush confirms a dead url
  1 adversaries · 1 rejected · 0 SURVIVED · 0 unapplied
  EXIT=0
  ```

- [x] **Step 6b: The clean baseline, which the matrix never runs (AC-1).** `pnpm vitest run tests/components/admin/shareLinkCopyButtonOrdering.test.tsx --project parallel`, observed GREEN on the UNMUTATED tree, output pasted.

  This step exists because `A39 REJECTED` on its own does not establish AC-1. The matrix applies the mutation and only then runs vitest (`scripts/share-link-flash-adversary-matrix.mjs:1235-1242`); there is no clean pass anywhere in the loop. So a row that is red against the SHIPPED component and still red under `A39` reports `REJECTED` and exits 0, and the arc would ship a harness that says nothing. The pair is the proof: green on the shipped component, red under the mutant. Neither half alone is.

  **This step earned itself on its first run.** The very first `--only A39` run reported `A39 REJECTED (2 rows)`, exit 0, and looked like a finished proof. The baseline run then exited 1: BOTH cases were red on the shipped component, on the premise `the microtask drain preceded the passive flush`. The cause was in the harness, not the component. `order` was a run-long log scanned with `indexOf`, and the MOUNT commit had already logged a layout and a passive of its own, so the scan found the mount's passive effect, placed it before a microtask that had not happened yet, and refused to run the assertion. `order` is now cleared alongside `phases` immediately before the commit under test. Without Step 6b this arc would have committed a harness that proved nothing while the matrix said `REJECTED`, which is round 1's finding 2 happening for real rather than in theory.

  ```
  $ npx vitest run tests/components/admin/shareLinkCopyButtonOrdering.test.tsx --project parallel
  Test Files  1 passed (1)
       Tests  2 passed (2)
  EXIT=0
  ```

  The residual gap is exactly this one and nothing else, which is worth stating because it bounds what the baseline has to cover. `runVitest` already refuses to score a run whose requested suites did not all report (`scripts/share-link-flash-adversary-matrix.mjs:943-954`), a suite that collected zero tests (`scripts/share-link-flash-adversary-matrix.mjs:957-964`), or a test neither passed nor failed (`scripts/share-link-flash-adversary-matrix.mjs:965-970`); each throws as an infrastructure fault rather than counting as a rejection. Absence of a baseline was the one way left for `REJECTED` to be true and worthless.

- [x] **Step 7: Non-vacuity of both new rows (AC-6), attributed by a row id that only this file can produce.**

  The matrix records a rejected row as `a.fullName ?? a.title` and discards the suite path (`scripts/share-link-flash-adversary-matrix.mjs:980-985`), so a title alone cannot say WHICH file produced it, and a title shared with another suite would let someone else's failure be read as this file's coverage. Both existing collision candidates are real: `A32` already credits the rotate suite's in-flight row and `A35` already credits its current-url row. So the two new cases are named `T-ORDER-STALE` and `T-ORDER-FRESH`, following the `T-FLASH-*` convention the browser spec already uses, and the check has two halves.

  First, uniqueness, DERIVED from the script's own suite list rather than from a list typed here, so a suite added later is covered by default. Run as a scratch script with `node`, from the worktree root:

  ```js
  const { readFileSync } = require("node:fs");
  const src = readFileSync("scripts/share-link-flash-adversary-matrix.mjs", "utf8");
  const m = src.match(/const VITEST_SUITES = \[([\s\S]*?)\]/);
  const files = ((m?.[1] ?? "").match(/"([^"]+)"/g) ?? []).map((x) => x.slice(1, -1));
  const KNOWN = "tests/components/admin/shareLinkCopyButtonRotate.test.tsx";
  if (!files.includes(KNOWN)) {
    console.error(`PREMISE: the parsed VITEST_SUITES list does not contain ${KNOWN}; the scan saw ${files.length} files and is not reading the real list`);
    process.exit(1);
  }
  let bad = 0;
  for (const id of ["T-ORDER-STALE", "T-ORDER-FRESH"]) {
    const carrying = files.filter((f) => readFileSync(f, "utf8").includes(id));
    const defs = carrying.flatMap((f) => readFileSync(f, "utf8").split("\n").filter((l) => l.includes(`it("${id}`)));
    const only = carrying.length === 1 ? carrying[0] : undefined;
    const ok = only !== undefined && defs.length === 1 && only.endsWith("shareLinkCopyButtonOrdering.test.tsx");
    console.log(`${id} files=${carrying.length} defs=${defs.length} ${carrying.join(",")} ${ok ? "OK" : "FAIL"}`);
    if (!bad && !ok) bad = 1;
  }
  process.exit(bad ? 1 : 0);
  ```

  It exits non-zero rather than printing for a human to read, and it was probed both ways at plan time. Against the live tree it exits 1 with `T-ORDER-STALE files=0 defs=0 FAIL` and the same for `T-ORDER-FRESH`, because the suite does not exist yet; that is this step's red. Against a planted stub whose `VITEST_SUITES` holds one unrelated file it exits 1 on the PREMISE branch instead, which is the arm that stops a regex matching nothing from reporting a clean scan. The positive control that the scan reads real files: substituting the rotate suite's existing title `a copy still in flight when the url rotates never announces success` reports `files=1 defs=1`.

  Second, attribution. `node scripts/share-link-flash-adversary-matrix.mjs --only A32,A35,A39 --quick`, then read the matrix JSON at tmp/adversary-matrix.json, which the run writes for every invocation including a scoped one. Exit 0 alone is not the evidence: the matrix credits an adversary when ANY row reds, so all three could pass on rows this arc did not write.

  ```
  node -e "const r=require('./tmp/adversary-matrix.json');for(const x of r)console.log(x.id,x.status,JSON.stringify(x.rows))"
  ```

  `T-ORDER-STALE` must appear under `A39` and under `A32`; `T-ORDER-FRESH` under `A35`. A new row appearing under no adversary is a §9.0 violation and is fixed here, not deferred.

  Observed, after the commit hooks had formatted the file, because a line-keyed scan verified before prettier is a scan of bytes that are no longer there:

  ```
  $ node <the uniqueness script above>
  T-ORDER-STALE files=1 defs=1 tests/components/admin/shareLinkCopyButtonOrdering.test.tsx OK
  T-ORDER-FRESH files=1 defs=1 tests/components/admin/shareLinkCopyButtonOrdering.test.tsx OK
  EXIT=0

  $ node scripts/share-link-flash-adversary-matrix.mjs --only A32,A35,A39 --quick
  A32  REJECTED  (2 rows)   A35  REJECTED  (3 rows)   A39  REJECTED  (1 rows)
  A32 -> T-ORDER-STALE (plus the rotate suite's in-flight row)
  A35 -> T-ORDER-FRESH (plus the rotate suite's completed-copy and current-url rows)
  A39 -> T-ORDER-STALE, and nothing else
  ```

  `A39` credited to exactly one row, and that row this file's, is the proof in its narrowest form.

- [x] **Step 8: The four string-presence mutants.** The rows assert on rendered text, so run all four before the review dispatch and record each: (a) the announcer's text emptied at the source; (b) the expected label with an appended suffix; (c) the label present but not live, moved behind a false condition; (d) each discriminating parameter varied, which here is the url passed to the second `root.render` and the identity of the url captured at click time. Each must red the row that claims to see it, identified by its `T-ORDER-*` id rather than by prose, for the reason Step 7 gives. Seven were run, each one asserted to have APPLIED before its result was read, and each restored afterwards; the clean baseline was re-read first and had zero red rows.

  | Mutant | Expected red | Result |
  |---|---|---|
  | (a) announcer's text emptied at the source | `T-ORDER-FRESH` | killed |
  | (b) announcer's text with an appended suffix | `T-ORDER-FRESH` | killed |
  | (b2) the `Copied` label with an appended suffix | `T-ORDER-FRESH` | killed |
  | (c) announcer's text present in the source but behind `false` | `T-ORDER-FRESH` | killed |
  | (d1) the stale case loses its rotate (`NEW, NEW`) | `T-ORDER-STALE` | killed |
  | (d2) the mirror case gains a rotate (`OLD, NEW`) | `T-ORDER-FRESH` | killed |
  | (e) the probe releases from a PASSIVE effect, closing the window | both rows | killed |

  (c) is the one that matters for string-presence: the component keeps `URL copied to clipboard` in the button's `aria-label` as well, so a case reading the wrong node would have passed with the announcer dead. (e) is family 4 from the closure set, and the only mutant that attacks the harness rather than the component: it proves the premises fire when the window closes instead of the rows passing vacuously.
- [x] **Step 9: Repair the prose this task falsifies.** `docs/superpowers/plans/2026-07-24-share-link-chrome-adversary-matrix.md:8` currently ends with the clause about the adversary being unregistered rather than exempted; it now records that the adversary IS registered, as `A39`, and that the whitelist stayed rejected. The SCOPE paragraph at `tests/components/admin/shareLinkCopyButtonRotate.test.tsx:27-49` states the timing is unproven and that a jsdom probe cannot beat `act()`; it now points at the new file and says what changed, keeping the `act()` sentence as the reason RTL is not used there rather than deleting the history.
- [x] **Step 10: Gates.** `pnpm typecheck`, `pnpm exec eslint .`, `pnpm format:check`, each as its own command. Commit `test(admin): prove the copy button's urlRef write must be a layout effect`.

### Task 2: Graduate the row

<!-- task: red=`pnpm vitest run tests/docs/_metaDeferralLedgerGraduation.test.ts` red-state=authored red-target=`tests/docs/_metaDeferralLedgerGraduation.test.ts:72` why=`the id added to GRADUATED is still a live entry in DEFERRED.md and absent from DEFERRED-archive.md, so the archive-only assertion fails on it` ac=AC-8 -->

**Files:** `tests/docs/_metaDeferralLedgerGraduation.test.ts`, `DEFERRED.md`, `DEFERRED-archive.md`.

This is the PR's last commit. It is authored red, not live red: the failing case is one this task writes.

- [x] **Step 1: Add the id to `GRADUATED`** with a comment saying what closed it: the un-defer trigger's harness exists, and the adversary is registered rather than whitelisted.
- [x] **Step 2: Observed red** on the marker's command, for the stated reason.

  ```
  $ pnpm vitest run tests/docs/_metaDeferralLedgerGraduation.test.ts
  FAIL every graduated id is archive-only
  AssertionError: SHARELINK-COPY-REF-ORDERING-PROOF missing from DEFERRED-archive.md
  Tests  1 failed | 142 passed (143)
  ```

  After the move, the same command plus the in-progress guard: `Tests 160 passed (160)`, and `grep -rn "IN PROGRESS"` over all four ledger files returns nothing.
- [x] **Step 3: Move the entry** from `DEFERRED.md` to `DEFERRED-archive.md`, and REMOVE the `**Status:** IN PROGRESS · **Branch:** ...` field in the same edit. An archive may not hold in-flight work, and a marker that reaches main names a branch the merge deleted.
- [x] **Step 4: Record the outcome in the archived entry.** What was proven, by which file, and that the whitelist was NOT reintroduced.
- [x] **Step 5: Observed green** on the same command, plus `pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts`.
- [x] **Step 6: Gates and commit.** `docs(plan): graduate SHARELINK-COPY-REF-ORDERING-PROOF`.

<!-- tasks: end -->

---

## 12. Closeout

<!-- gate: cmd=`pnpm heavy node scripts/share-link-flash-adversary-matrix.mjs --only A39` probed=`the same command with A39 unregistered exits 2, observed 2026-09-01 and pasted in the registry reconciliation above; with A39 registered but no row reding under it the script exits 1 with *** SURVIVED ***, which is the script's own documented behaviour at scripts/share-link-flash-adversary-matrix.mjs:1366-1372` -->

<!-- gate: cmd=`pnpm vitest run tests/components/admin/shareLinkCopyButtonOrdering.test.tsx --project parallel` probed=`the constructed failing input is the A39 mutation itself: with useLayoutEffect swapped for useEffect in ShareLinkCopyButton.tsx the discriminating case reports label Copied against announcer URL copied to clipboard and the command exits non-zero, observed by probe on 2026-09-01 before this plan was written` -->

<!-- gate: cmd=`pnpm exec tsx scripts/spec-lint.ts docs/superpowers/plans/2026-09-01-sharelink-copy-ref-ordering-proof.md` probed=`run against this file before the plan-stage dispatch; a draft with a task marker missing its why= exits non-zero` -->

**Full-mode confirmation.** The first gate above runs `A39` in FULL mode, browser leg included, because the recorded evidence for an adversary should not come from the leg that skips half the suite. It is one adversary, not thirty-nine. Its exit code is not the whole reading: full mode adds the browser rows to the same credit pool, so the matrix JSON is read for `T-ORDER-STALE` under `A39` exactly as in Task 1 Step 7. `A39 REJECTED` credited only to a browser row would mean the jsdom harness did not fire, which is a failure of this arc however green the command looks.

**The report doc's generated block.** `scripts/share-link-flash-adversary-matrix.mjs:1269` refuses to write the report on any `--only` or `--quick` run, deliberately, so a partial run cannot record a truthful-looking table over an incomplete matrix. That means the generated block keeps saying `38 adversaries` until somebody spends a full 39-adversary run, which is a heavy Playwright phase repeated once per adversary. This arc does NOT hand-edit the generated block: hand-transcribed totals drifting is the exact defect the generator was built to end. Two honest outcomes, and bl-orch picks:

1. bl-orch grants a serial local turn for the full run, and the regenerated block lands in this branch.
2. It does not, and the report doc's HAND-WRITTEN prose records that `A39` was registered on 2026-09-01 and verified REJECTED by a scoped full-mode run, with the generated table dated to the last full run above it.

**bl-orch ruled option 2 on 2026-09-01.** A 39-leg heavy Playwright regeneration on this box buys one documentation row at hours of local heavy time, against the standing offload posture. So: the generated block is left exactly as its last full run wrote it, and the HAND-WRITTEN caption around it carries the run stamp, a one-line note naming `A39`'s separate evidence, and the regen trigger, which is simply the next full-mode run picking it up. The generated block is not hand-edited. The ruling carries one condition this arc must honour: if any parity gate reds on 38 against 39, the GATE'S NAME goes to bl-orch before anything else is tried, because that is a different decision and not a silent workaround. Checked at plan time and re-checked at closeout: `grep -rln "38 adversaries\|adversaries ·" tests/ .github/` returns nothing, and no test in `tests/` reads the report doc.

**Invariant 8.** No UI surface, so the dual gate does not apply. Marker at the head of this plan.

**Unfixed peers.**

1. `AGENTS.md`'s heavy-phase rule cites `scripts/share-link-flash-adversary-matrix.mjs:1014` for the claim that the matrix runs non-interactive Playwright in full mode. Line 1014 lands inside a JSDoc block and names nothing; the invocation is at `scripts/share-link-flash-adversary-matrix.mjs:1042`.

   **The citation was already stale before this arc, and this arc made it staler.** It pointed at `scripts/share-link-flash-adversary-matrix.mjs:1014` while the invocation was at `scripts/share-link-flash-adversary-matrix.mjs:1017`, and the 25 lines the `A39` block adds pushed the invocation to `scripts/share-link-flash-adversary-matrix.mjs:1042`. The rule it supports is correct throughout, and no gate reds: `tests/docs/agentsHeavyPhaseRule.test.ts` asserts only that the STRING is present in `AGENTS.md`, which it still is.

   Not repaired here. Fixing it means editing `AGENTS.md` plus three pinned literals in that guard (`tests/docs/agentsHeavyPhaseRule.test.ts:154`, `tests/docs/agentsHeavyPhaseRule.test.ts:221`, and the `editRule` mutant at `tests/docs/agentsHeavyPhaseRule.test.ts:992`), which is a guard surface and a repo-constitution document this arc does not otherwise touch: class-sweep exception (c). The four sites are enumerated here so the repair is one instruction rather than a re-derivation. No ledger row is filed, per this arc's standing instruction; it goes to bl-orch in the readiness message.

## Task checklist

- [x] Pre-draft code verification (table above, run 2026-09-01)
- [x] Reconciliation sweep authored AND run (output pasted above)
- [x] Registry count reconciliation (run, output pasted)
- [x] Plan self-review
- [x] Adversarial review (cross-model, Codex) to APPROVE at round 3 (R1 3 findings, R2 1 BLOCKING, R3 0)
- [x] Task 1
- [x] Task 2
- [ ] Whole-diff adversarial review (cross-model, Codex) to APPROVE
- [ ] Thirteen required CI checks green on the pushed head
- [ ] READINESS to bl-orch. THE ARC NEVER MERGES.
