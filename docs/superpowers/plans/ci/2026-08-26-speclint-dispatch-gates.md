# Plan — the wrapper refuses an unlinted artifact, and the AC check runs both ways

**Spec:** `docs/superpowers/specs/2026-08-26-speclint-dispatch-gates-design.md` (canonical).
**Ledger:** `BL-CODEX-GUARD-SPECLINT-PREDISPATCH-GATE` (`BACKLOG.md:818`), `BL-SPECLINT-AC-UNCLAIMED` (`BACKLOG.md:25`), `BL-ORPHANED-COMPONENTS-ZERO-PROD-IMPORTERS` (`BACKLOG.md:349`), `BL-NULLCODE-STAMP-BATCH-2` (`BACKLOG.md:220`).
**Branch:** `feat/speclint-dispatch-gates`. **Base:** `b30413cf5`.

Every requirement below is inlined from the spec rather than paraphrased, so the plan cannot
restate an approved criterion more weakly than the spec makes it.

---

## 0. State measured at plan time

| fact | value | command |
| --- | --- | --- |
| suites in scope at HEAD | 4 files, 55 tests, 32.81s, all green | `pnpm exec vitest run tests/codexGuard/lintDoc.test.ts tests/codexGuard/guardSurfaceGate.test.ts tests/codexGuard/importSurface.test.ts tests/specLint/taskContractWiring.test.ts` |
| guard-surface refusal, foreground | exit 2, no result artifact | `node scripts/codex-guard.mjs review --stage diff --round 1 …` with a conjunction-prose brief |
| guard-surface refusal, caller reads launcher | exit 0, no result artifact | same, `nohup … &` |
| `runGuard` call sites in `tests/codexGuard/*.test.ts` | 117 | `grep -rc "runGuard(" tests/codexGuard/*.test.ts \| awk -F: '{s+=$2} END {print s}'` |
| distinct `fail(...)` codes in `taskContract.ts` | 10 (12 `fail(` occurrences) | `grep -c 'fail(' lib/specLint/taskContract.ts` |
| `CODE_FIXTURES` rows | 10 | `tests/specLint/taskContractWiring.test.ts:74` |
| `BACKLOG.md` `^## BL-` / `^### BL-` | 21 / 14 | `grep -c '^## BL-' BACKLOG.md` |
| `BACKLOG-archive.md` `^## BL-` / `^### BL-` | 385 / 109 | `grep -c '^## BL-' BACKLOG-archive.md` |
| enrolled plans | 100 | `grep -rl '<!-- tasks: depth=' docs/superpowers/plans/ \| wc -l` |
| plans using `red-contract` | 47 | `grep -rl 'tasks: depth=[0-9] red-contract' docs/superpowers/plans/ \| wc -l` |

## 0.1 The AC arm's design, ruled

Spec §4.2 escalated the AC arm's live reach; **ruled 2026-08-26: branch (A),
migrate.** The body grammar declares, an unclaimed id needs an explicit
disposition on its declaring line, and the flagged plans are migrated in Task 11.
Four constraints ship with the ruling and bind tasks 8 through 12:

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

## 0.25 Acceptance criteria, inlined from spec §10

- AC-1: on `--stage spec|plan`, a `--lint-doc` whose report carries hard findings is refused with exit 2, naming the file and its hard count, with zero fake-codex calls, no lock, no result artifact and no corpus row; the same document at 0 hard dispatches unchanged.
- AC-2: on `--stage spec|plan`, a dispatch naming no `--lint-doc` is refused with exit 2; `--no-lint-gate` waives both arms; `--stage diff` and `--stage task` are untouched.
- AC-3: advisory findings never refuse, and every named document is checked rather than the first.
- AC-7: the guard-surface refusal prints one conforming `GUARD SURFACE:` line verbatim, and the AGENTS.md bullet shows the same line; the separator grammar is unchanged and a "plus" line is still refused with exit 2 and no result artifact.
- AC-8: both ledger rows are archived with `provenance: "feat/speclint-dispatch-gates"`, and the heading arithmetic proves the two `##` headings moved while all seven `###` sub-rows stayed in `BACKLOG.md`, each named in the assertion.

- AC-4: `TASK_AC_UNCLAIMED` fires on a declared id no marker cites whose declaring line carries no disposition; hard, exit 1, rendered `FAIL`.
- AC-5: `TASK_AC_UNDECLARED` fires on a marker citing an id the plan does not declare, in a plan that declares at least one; no id ever draws two of the three codes.
- AC-6: the corpus's unclaimed set equals the committed residue list exactly, walked from disk, fail-closed.
- AC-9: `taskContract` scores at or above `scoreFloor` 0.95 with zero unaccepted survivors at the shipping head (discharged by the closeout, not by a task).

These four were previously named only in a prose sentence, which this arc's own arm correctly flags
as UNDECLARED — the plan cited them from markers without declaring them. Fixed by declaring them.

## 0.3 Meta-test inventory

- **CREATES** tests/codexGuard/lintGate.test.ts — the refusal suite. Modelled on
  `tests/codexGuard/guardSurfaceGate.test.ts:1-30`: every rejecting case writes an APPROVE
  scenario FIRST and then asserts zero fake-codex calls, because without a scenario the fake exits
  before recording a call and the zero-call assertion holds even had the gate dispatched.
- **CREATES** tests/specLintGate/bridgeParity.test.ts — parity between the enrolled `.ts` core
  and the `.mjs` bridge, modelled on `tests/reviewRounds/bridgeParity.test.ts`.
- **EXTENDS** `tests/codexGuard/importSurface.test.ts` — one allowlist row.
- **EXTENDS** `tests/specLint/taskContractWiring.test.ts` — `CODE_FIXTURES` rows and the title count.
- **EXTENDS** `tests/docs/_metaDeferralLedgerGraduation.test.ts` — two `BACKLOG_GRADUATED` rows.
- **EXTENDS** `tests/mutation/source/registry.ts` — one row for the new lint-gate core.
- **NOT APPLICABLE:** advisory-lock topology (no `pg_advisory*` surface), Supabase call boundary
  (no client call), `admin_alerts` catalog (no alert), sentinel hiding (no tile), layout-dimensions
  and transition-audit (no UI surface).

## 0.4 Mutation-family closure

`lib/specLint/taskContract.ts` is ALREADY enrolled (`tests/mutation/source/registry.ts:805`,
`scoreFloor: 0.95`, `millisPerBoot: 1126`, `operators: [...OPERATOR_NAMES]`), and
`checkTaskContract` receives the whole `DocModel` (`lib/specLint/taskContract.ts:313`), so the AC
work is self-contained in that one file and needs NO new enrolment.

`scripts/codex-guard.mjs` is ratified CANNOT-EXPRESS, measured not argued:
`docs/superpowers/specs/ci/2026-08-15-round-economy-enforcement-pair.md` §1.1 item 8 records that
the runner overlays a target only when a Vitest suite imports it and every `tests/codexGuard`
suite spawns the script instead. That ratification also gives the shipped remedy: the lib half is
expressible and gets enrolled. So the gate's decidable core is a three-part shape, matching
`reviewRoundEmit`:


- lib/specLintGate/gate.ts — the decision function, imported by tests, ENROLLED.
- scripts/specLintGate.mjs — the bare-node bridge `codex-guard.mjs` imports (it must run as
  plain `node` from any checkout, so it cannot import a `.ts`).
- a parity suite asserting the two agree case-for-case.

## 0.5 red= validity

Every `red=` below is the invariant-1 authored shape: the failing case is written by the task
itself, so none is run at plan time. Each task body names the production line whose absence makes
its new case fail, verified absent on the live tree at `b30413cf5`.

---

<!-- tasks: depth=2 red-contract -->

## Task 1: the lint-gate core as an enrolled leaf

<!-- task: red=`pnpm vitest run tests/specLintGate/gate.test.ts` red-state=authored red-target=`scripts/codex-guard.mjs:1873` why=`the decision currently lives inline in the wrapper's lint loop at :1873 and there is no importable module to test; lib/specLintGate/gate.ts does not exist, so the suite this task writes cannot resolve its import and fails at collection` ac=AC-1,AC-2,AC-3 -->

Pure function, no filesystem and no spawn: given the stage, the parsed per-document reports and the
flags, return refuse-or-proceed plus the message. The wrapper keeps the I/O.

RED: lib/specLintGate/gate.ts does not exist.

## Task 2: the bare-node bridge and its parity suite

<!-- task: red=`pnpm vitest run tests/specLintGate/bridgeParity.test.ts` red-state=authored red-target=`tests/codexGuard/importSurface.test.ts:21` why=`the allowlist at :21-27 is an EXACT pin of five specifiers and scripts/specLintGate.mjs is not among them, so the bridge cannot be imported by the wrapper until the pin is grown in this task; the bridge file does not exist and the parity suite cannot resolve it` ac=AC-1 -->

scripts/specLintGate.mjs mirrors the core; the parity suite runs both over the same cases and
asserts they agree, with a header naming the failure it catches — the bridge losing a branch of the
contract while the TypeScript suite stays green.

The allowlist grows by one row. **Also repaired in this task, per the class-sweep default:** the
pin's header cites "spec §1.1 item 4" for the vendor-inline ratification, and that item is
"Filings are immutable evidence" — the codex-guard spec has no §1.1 at all. The citation is
corrected to §1.1 item 8, which is the ratification that actually governs a new sibling.

## Task 3: the coverage arm

<!-- task: red=`pnpm vitest run tests/codexGuard/lintGate.test.ts -t coverage` red-state=authored red-target=`scripts/codex-guard.mjs:143` why=`the stage accept-set at :143 gates --stage and nothing downstream requires a --lint-doc for spec or plan, so a dispatch naming no artifact composes a prompt and dispatches; the new case asserting exit 2 fails against that` ac=AC-2 -->

On `--stage spec|plan`, at least one `--lint-doc` is required. `--no-lint-gate` waives it. The
harness injects the waiver beside `--stage`/`--round` (`tests/codexGuard/harness.ts:189`) — one
edit, not 117.

## Task 4: the enforcement arm, over EVERY document

<!-- task: red=`pnpm vitest run tests/codexGuard/lintGate.test.ts -t enforcement` red-state=authored red-target=`scripts/codex-guard.mjs:1920` why=`the only refusal in the lint loop is the {0,1} status check at :1920; a status of 1 means hard findings and falls straight through to the embed and cfg.prompt = composePrompt(cfg) at :1939, so a hard document dispatches. The new case asserting exit 2 on a hard document fails against that` ac=AC-1,AC-3 -->

Every `--lint-doc` is checked, not the first. The refusal names every failing document and its hard
count in one message. Advisory never blocks. The multi-document case is a REQUIRED case, not an
extra: a gate reading `cfg.lintDocs[0]` passes every single-document test while dispatching a hard
artifact whenever a clean one is named ahead of it.

## Task 5: the count extractor refuses rather than defaults

<!-- task: red=`pnpm vitest run tests/codexGuard/lintGate.test.ts -t summary-grammar` red-state=authored red-target=`scripts/codex-guard.mjs:312` why=`embedReport at :312-368 validates that a summary: line exists, is unique and is last, never that a count can be read from it — probed, a report ending "summary: banana" passes intact. No code refuses it, so the new case asserting exit 2 on an unparseable summary fails` ac=AC-1 -->

A report exiting 0 or 1 whose summary line does not match `summary: <int> hard, <int> advisory`
exactly is refused as an infra fault, naming the file and the line. Distinct from the `{0,1}` check,
which is untouched; both refuse for different reasons and both are planted.

## Task 6: the guard-surface refusal message and its docs

<!-- task: red=`pnpm vitest run tests/codexGuard/guardSurfaceGate.test.ts -t conforming-line` red-state=authored red-target=`scripts/codex-guard.mjs:578` why=`the refusal text at :578-583 repeats the AGENTS.md conjunction prose verbatim (<killed>/<total> plus "0 unaccepted survivors" plus OPERATORS:) and shows no conforming line, so the new case asserting the message contains one fails` ac=AC-7 -->

The message prints one conforming line verbatim; the AGENTS.md bullet shows the same line. The
separator grammar is NOT widened — a "plus" line is still refused, still exit 2, still no result
artifact, and the test asserts all three.

## Task 7: archive both bookkeeping rows

<!-- task: red=`pnpm vitest run tests/docs/_metaDeferralLedgerGraduation.test.ts` red-state=authored red-target=`tests/docs/_metaDeferralLedgerGraduation.test.ts:99` why=`both rows are still in the open ledger, so a BACKLOG_GRADUATED row added to the registry at :99 fails the archive-only assertion at :704-737 until the sections move` ac=AC-8 -->

Cut heading-to-any-NEXT-heading. **The next heading after the nullcode container at `BACKLOG.md:220`
is a `###`, not a `##`.** Proof is set arithmetic, run before and after: `^## BL-` 21 to 19 and
`^### BL-` 14 to 14 in `BACKLOG.md`; 385 to 387 and 109 to 109 in the archive; no id both open and
archived; and all seven sub-row ids still present in `BACKLOG.md`, **named individually in the
assertion**: `BL-THEME-NOTE-NO-DISMISS-AFFORDANCE`, `BL-THEME-NOTE-BUBBLE-TEXT-ALIGN`,
`BL-AGENDA-PROSE-SECOND-DAY`, `BL-AGENDA-POSITIONAL-DAYSET-FALLBACK`,
`BL-HEALTH-RESOLVE-DB-LOCKDOWN`, `BL-PARSER-FIELD-PROVENANCE-MODEL`,
`BL-EXPORT-BLANK-ROW-SEGMENTATION`. Two of those are claimed by `fix/theme-note-polish`, so moving
one would also steal a live claim.

`tests/components/_orphanedComponents.ts` is NOT touched: its `backlog:` citation resolves against
both ledgers via `ledgerFiles()` (`tests/docs/_metaLedgerReferentialIntegrity.test.ts:67`).

<!-- tasks: end -->

The region reopens here — sequential regions are legal, each with its own depth
(`docs/superpowers/specs/2026-08-09-task-enrollment-multi-region-design.md`), and
these are TDD units like the rest.

<!-- tasks: depth=2 red-contract -->

## Task 8: TASK_AC_UNCLAIMED and the disposition grammar

<!-- task: red=`pnpm vitest run tests/specLint/taskContract.test.ts -t unclaimed` red-state=authored red-target=`lib/specLint/taskContract.ts:373` why=`the loop at :373-377 walks marker-cited ids only and there is no traversal in the other direction anywhere in the file, so a declared id nothing cites draws nothing; the new case asserting TASK_AC_UNCLAIMED on such a plan fails` ac=AC-4 -->

Collect the ids the plan declares — a list item or ATX heading whose content
begins with the id, **that LEADING id only, with its end anchored** — collect the
ids every `ac=` cites, and report the declared-and-uncited difference unless the
declaring line carries a disposition.

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

## Task 9: TASK_AC_UNDECLARED, and the three-code partition

<!-- task: red=`pnpm vitest run tests/specLint/taskContract.test.ts -t undeclared` red-state=authored red-target=`lib/specLint/taskContract.ts:118` why=`resolvesId at :118-126 is a word-boundaried regex over every non-marker line, so any prose occurrence satisfies a citation and a merely-mentioned id draws nothing; the new case asserting TASK_AC_UNDECLARED against a plan that mentions but does not declare the id fails` ac=AC-5 -->

Fires only in a plan that declares at least one id, so the 42 spec-side plans are
untouched. The partition test is the point of this task and is asserted directly:
one id never draws two of the three codes. `UNRESOLVED` needs no occurrence,
`UNDECLARED` needs an occurrence that is not a declaration, `UNCLAIMED` needs a
declaration. The fixture that proves it declares one id, mentions a second in
prose, and cites both.

## Task 10: wire the codes

<!-- task: red=`pnpm vitest run tests/specLint/taskContractWiring.test.ts` red-state=authored red-target=`tests/specLint/taskContractWiring.test.ts:180` why=`the title at :180 asserts ALL TEN codes and the table iterates CODE_FIXTURES; adding two rows without moving the count leaves the title stating ten while twelve run, and the new rows have no fixtures yet so the per-code exit/FAIL assertions fail` ac=AC-4,AC-5 -->

One `CODE_FIXTURES` row per new code, single-finding each per the file's own
comment at `tests/specLint/taskContractWiring.test.ts:69`, and the count in the title moves from ten to twelve.

The all-codes cover is derived from the production source alone, PARSED rather
than grepped — every string literal in first-argument position of a `fail` call —
and asserted equal to the `CODE_FIXTURES` key set. A same-line grep is what
produced this spec's own withdrawn "nine sites, ten codes" claim
(`TASK_ENROLL_EMPTY` is raised through `fail` at `lib/specLint/taskContract.ts:259`,
formatted across four lines), and unioning a grep with the fixture keys is
circular — the registry would supply the very member the census failed to find.

## Task 11: the corpus migration

<!-- task: red=`pnpm vitest run tests/specLint/acUnclaimedCorpus.test.ts` red-state=authored red-target=`docs/superpowers/plans/2026-08-21-app-e2e-batch2.md:28` why=`AC-3 is declared at :28 with no disposition on the line and no marker cites it, so the corpus test this task writes reports a non-empty unclaimed set and fails; it passes only once every such line carries its plan own disposition` ac=AC-6 -->

The corpus test walks every enrolled plan from disk and asserts the unclaimed set
equals the committed residue list EXACTLY, with a `premise()` guard so an empty
walk cannot satisfy it vacuously (`tests/_shared/premise.ts`, and
`tests/specLint/acCoverageCorpus.test.ts` is the shape).

**The unit is a declaring LINE, not a plan.** Measured at plan time under the v3
grammar: 19 plans, 33 ids, and eight plans need more than one line
(`app-e2e-batch2` needs five). Per spec §4.2 constraint 1 each edit states ONLY
what that plan's prose already says, cited from its own line; per constraint 2 a
plan whose prose settles nothing gets NO disposition and goes on the residue list
instead, with what was searched. The per-plan classification with quoted evidence
is committed at `docs/superpowers/specs/probes/2026-08-26-ac-disposition-classification.md`
and is this task input.

The residue is fail-closed and is a number that may go DOWN as owning arcs resolve
their own plans, never up.

## Task 12: the convention paragraph

<!-- task: red=`pnpm vitest run tests/docs/_metaSpecLintDocs.test.ts` red-state=authored red-target=`docs/agents/writing-plans.md:26` why=`writing-plans.md documents the red= and gate-command contract at :26 and says nothing about acceptance-criterion dispositions, so a plan author has no statement of the convention the arm now enforces; the docs assertion this task writes fails against the current file` ac=AC-6 -->

ONE paragraph in `docs/agents/writing-plans.md` per spec §4.2 constraint 3 — NOT
`AGENTS.md`. It states the convention, the accept-set direction, and that a
disposition may only say what the plan already says.

<!-- tasks: end -->

## 12. Closeout

impeccable-gate: N/A — no UI surface
