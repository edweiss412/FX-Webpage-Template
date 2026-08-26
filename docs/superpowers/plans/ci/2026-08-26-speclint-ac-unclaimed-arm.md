# Plan — the acceptance-criterion arm (follow-on)

**Spec:** `docs/superpowers/specs/2026-08-26-speclint-dispatch-gates-design.md` §4 (canonical).
**Ledger:** `BL-SPECLINT-AC-UNCLAIMED` (`BACKLOG.md`), which stays OPEN.
**Status:** RATIFIED AND UNIMPLEMENTED. Nothing here has shipped.

**Why this is a separate document.** The lint-gate arm of that spec shipped in PR
#904. This arm did not. Four spec rounds established its design and its
measurements, and leaving those tasks inside the shipping plan would have made
that plan claim coverage it does not execute — a plan is read as a record of what
was done, and an unshipped task block inside a merged plan is a false one.

**What four rounds established, and what a follow-on should NOT re-derive:**

- The row's own premise is REFUTED on this corpus. "No marker cites it, therefore
  no task is scheduled to prove it" is false for a documented convention with 19
  instances, where a trailing criterion is discharged by a task outside the marker
  region and the plan says so in prose (spec §4.4).
- There is NO real-drift category. The per-id classification came back DISCHARGED
  28, UNSETTLED 7, FOREIGN-ID 4, RETIRED 1, and zero "nobody scheduled it"
  (`docs/superpowers/specs/probes/2026-08-26-ac-disposition-classification.md`).
- The declaration recognizer needed a TERMINATING cut, not a better pattern.
  Three consecutive rounds each found a new lexical class; v4 stops refining and
  declines any declaring line carrying more than one id, taking its cut from a
  COUNT rather than a pattern (spec §4.1). Both probe records are committed.
- The done condition is residue EQUALITY, fail-closed, not a flat zero — because
  constraints 2 and 4 as first ruled could not both hold (spec §4.2).

---

## 1. The design, ruled

Spec §4.2 escalated the AC arm's live reach; **ruled 2026-08-26: branch (A),
migrate.** The body grammar declares, an unclaimed id needs an explicit
disposition on its declaring line, and the flagged plans are migrated in Task 4.
Four constraints ship with the ruling and bind every task below:

1. Each migration edit states ONLY what that plan's prose already says, cited
   from the plan's own line. Never a reinterpretation.
2. A plan whose prose does not settle the disposition gets none: it goes in the
   PR body under "Unfixed peers" and stays flagged.
3. The convention gets ONE paragraph in `docs/agents/writing-plans.md`, not in
   `AGENTS.md`.
4. The probe domain is the live plans corpus. The done condition, restated after
   spec R2 finding 4 showed constraints 2 and 4 could not both hold: the corpus's
   unclaimed set equals a committed residue list EXACTLY, that list holding only
   the UNSETTLED pairs with their negative evidence. Fail-closed — a new unclaimed
   id is not on the list and reds the assertion.

---

<!-- tasks: depth=2 red-contract -->

## Task 1: TASK_AC_UNCLAIMED and the disposition grammar

<!-- task: red=`pnpm vitest run tests/specLint/taskContract.test.ts -t unclaimed` red-state=authored red-target=`lib/specLint/taskContract.ts:373` why=`the loop at :373-377 walks marker-cited ids only and there is no traversal in the other direction anywhere in the file, so a declared id nothing cites draws nothing; the new case asserting TASK_AC_UNCLAIMED on such a plan fails` ac=AC-4 -->

Collect the ids the plan declares, per spec §4.1's **v4** recognizer, and this
task implements v4 in full rather than the leading-id rule v3 shipped:

1. Elide fenced blocks first. A declaration inside one is inert — the witness is
   the shell comment at
   `docs/superpowers/plans/2026-08-21-control-outline-forward-guard.md:326`.
2. A candidate is a list item or ATX heading whose content begins with an id,
   that id's end anchored so the range form `AC-1..AC-7` declares nothing.
3. **Count every id on the candidate line.** Exactly one makes it CERTAIN.
   More than one makes the line AMBIGUOUS: the arm declines both directions on it
   and the line is recorded.

Then collect the ids every `ac=` cites and report the certain-and-uncited
difference, unless the declaring line carries a disposition.

The count in step 3 is the whole termination argument (spec §4.1) and its cases
are this task's, not Task 10's: 14 ambiguous lines across 12 plans exist in the
live corpus today, so a Task 7 that omits them commits green while classifying
inputs v4 must decline.

Both narrowings are corpus-forced and were refuted into existence across two
review rounds (spec §4.1): secondary-id collection read four other documents'
criteria as these plans', and an unanchored id matched inside `AC-1..AC-7`.

**The disposition set is an ACCEPT-set with a stated lexical grammar** (spec §4.3):
parenthesised and end-anchored, `RETIRED` case-sensitive, owner a token list and
never free prose. The anchoring is load-bearing and has a live witness —
`docs/superpowers/plans/2026-08-21-app-e2e-batch2.md:28` already ends with
"Task 10.", so a loose matcher exempts a real unclaimed id silently.

An unrecognised disposition REPORTS the id; it never exempts it. A deny-set would
fail open on the case nobody modelled, which is the direction this arm cannot
afford: to a plan author, silence and clean are indistinguishable.

`checkTaskContract` already receives the whole `DocModel`
(`lib/specLint/taskContract.ts:313`), so this is self-contained in a file the
mutation registry already covers (`tests/mutation/source/registry.ts:805`).

## Task 2: TASK_AC_UNDECLARED, and the three-code partition

<!-- task: red=`pnpm vitest run tests/specLint/taskContract.test.ts -t undeclared` red-state=authored red-target=`lib/specLint/taskContract.ts:118` why=`resolvesId at :118-126 is a word-boundaried regex over every non-marker line, so any prose occurrence satisfies a citation and a merely-mentioned id draws nothing; the new case asserting TASK_AC_UNDECLARED against a plan that mentions but does not declare the id fails` ac=AC-5 -->

Fires only in a plan that declares at least one id, so the 42 spec-side plans are
untouched. The partition test is the point of this task and is asserted directly:
one id never draws two of the three codes. `UNRESOLVED` needs no occurrence,
`UNDECLARED` needs an occurrence that is not a declaration, `UNCLAIMED` needs a
declaration. The fixture that proves it declares one id, mentions a second in
prose, and cites both.

## Task 3: wire the codes

<!-- task: red=`pnpm vitest run tests/specLint/taskContractWiring.test.ts -t derived-cover` red-state=authored red-target=`lib/specLint/taskContract.ts:373` why=`the derived-cover case this task writes parses every fail() call's first-argument literal out of lib/specLint/taskContract.ts and asserts set equality with the CODE_FIXTURES keys. Once Tasks 1 and 2 add their codes at the production sites, the production set contains codes the fixture set does not, and the case fails on that inequality. The it() title at :180 is prose and asserts nothing, so it is NOT the red-target` ac=AC-4,AC-5 -->

One `CODE_FIXTURES` row per new code, single-finding each per the file's own
comment at `tests/specLint/taskContractWiring.test.ts:69`, and the count in the title moves from ten to twelve.

The all-codes cover is derived from the production source alone, PARSED rather
than grepped — every string literal in first-argument position of a `fail` call —
and asserted equal to the `CODE_FIXTURES` key set. A same-line grep is what
produced this spec's own withdrawn "nine sites, ten codes" claim
(`TASK_ENROLL_EMPTY` is raised through `fail` at `lib/specLint/taskContract.ts:259`,
formatted across four lines), and unioning a grep with the fixture keys is
circular — the registry would supply the very member the census failed to find.

## Task 4: the corpus migration

<!-- task: red=`pnpm vitest run tests/specLint/acUnclaimedCorpus.test.ts` red-state=authored red-target=`docs/superpowers/plans/2026-08-21-app-e2e-batch2.md:28` why=`AC-3 is declared at :28 with no disposition on the line and no marker cites it, so the corpus test this task writes reports a non-empty unclaimed set and fails; it passes only once every such line carries its plan own disposition` ac=AC-6 -->

The corpus test walks every enrolled plan from disk and asserts the unclaimed set
equals the committed residue list EXACTLY, with a `premise()` guard so an empty
walk cannot satisfy it vacuously (`tests/_shared/premise.ts`, and
`tests/specLint/acCoverageCorpus.test.ts` is the shape).

**The unit is a declaring LINE, not a plan**, and under v4 one line disposes
exactly one id, because a line carrying more than one is AMBIGUOUS and the arm
declines it (spec §4.2.1). So the count is one line per id. Measured at plan time:
19 plans, **31 ids**, hence 31 declaring lines. `app-e2e-batch2` alone needs six,
at `docs/superpowers/plans/2026-08-21-app-e2e-batch2.md:28-34` — plan review R1
finding 4 measured that against the earlier "five" and was right. Per spec §4.2 constraint 1 each edit states ONLY
what that plan's prose already says, cited from its own line; per constraint 2 a
plan whose prose settles nothing gets NO disposition and goes on the residue list
instead, with what was searched. The per-plan classification with quoted evidence
is committed at `docs/superpowers/specs/probes/2026-08-26-ac-disposition-classification.md`
and is this task input.

The residue is fail-closed and is a number that may go DOWN as owning arcs resolve
their own plans, never up.

## Task 5: the convention paragraph

<!-- task: red=`pnpm vitest run tests/docs/_metaSpecLintDocs.test.ts` red-state=authored red-target=`docs/agents/writing-plans.md:26` why=`writing-plans.md documents the red= and gate-command contract at :26 and says nothing about acceptance-criterion dispositions, so a plan author has no statement of the convention the arm now enforces; the docs assertion this task writes fails against the current file` ac=AC-6 -->

ONE paragraph in `docs/agents/writing-plans.md` per spec §4.2 constraint 3 — NOT
`AGENTS.md`. It states the convention, the accept-set direction, and that a
disposition may only say what the plan already says.

<!-- tasks: end -->


## 6. Acceptance criteria, inlined from spec §10

- AC-4: `TASK_AC_UNCLAIMED` fires on a declared id no marker cites whose declaring line carries no disposition; hard, exit 1, rendered `FAIL`. A disposition on that line exempts it and nothing else, and an unrecognised disposition still reports.
- AC-5: `TASK_AC_UNDECLARED` fires on a marker citing an id the plan does not declare, in a plan that declares at least one; no id ever draws two of the three codes.
- AC-6: the corpus's unclaimed set equals the committed residue list exactly, walked from disk, fail-closed.
- AC-10: the live AMBIGUOUS declaring-line set equals the committed record exactly; a new multi-id declaring line reds until someone looks at it.

## 12. Closeout

impeccable-gate: N/A — no UI surface
