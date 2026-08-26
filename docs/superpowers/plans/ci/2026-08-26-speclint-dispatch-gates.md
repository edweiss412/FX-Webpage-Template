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

## 0.1 What is NOT settled, and what that blocks

Spec §4.2 escalates the AC arm's live reach to the orchestrator: branch (A) migrate, (B) opt-in,
(C) lint gate only. **Tasks 1 through 7 are independent of that choice and are complete as
written.** Tasks 8 through 10 are written for branch (A), the recommendation; if (B) or (C) is
chosen, only those three change and §0.2 says how.

## 0.2 Branch deltas for tasks 8-10

- **(A), as written.** Body grammar declares; an unclaimed id needs an explicit disposition on its
  declaring line; 25 merged plans get a one-line edit in Task 10.
- **(B).** Task 8 gains the region grammar of spec §4.2.1 and its three region codes; Task 9's
  corpus test asserts zero newly-flagged plans instead of the migration set; Task 10 is dropped.
- **(C).** Tasks 8-10 are dropped entirely; the spec's §4 becomes a documented-limits record and
  `BL-SPECLINT-AC-UNCLAIMED` stays open with its premise defect recorded against it.

## 0.25 Acceptance criteria, inlined from spec §10

- AC-1: on `--stage spec|plan`, a `--lint-doc` whose report carries hard findings is refused with exit 2, naming the file and its hard count, with zero fake-codex calls, no lock, no result artifact and no corpus row; the same document at 0 hard dispatches unchanged.
- AC-2: on `--stage spec|plan`, a dispatch naming no `--lint-doc` is refused with exit 2; `--no-lint-gate` waives both arms; `--stage diff` and `--stage task` are untouched.
- AC-3: advisory findings never refuse, and every named document is checked rather than the first.
- AC-7: the guard-surface refusal prints one conforming `GUARD SURFACE:` line verbatim, and the AGENTS.md bullet shows the same line; the separator grammar is unchanged and a "plus" line is still refused with exit 2 and no result artifact.
- AC-8: both ledger rows are archived with `provenance: "feat/speclint-dispatch-gates"`, and the heading arithmetic proves the two `##` headings moved while all seven `###` sub-rows stayed in `BACKLOG.md`, each named in the assertion.

AC-4, AC-5, AC-6 and AC-9 belong to the AC arm and the mutation score; they are discharged by
tasks 8-10 and the closeout, which §0.1 holds pending the branch decision.

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

## Tasks 8-10 — the AC arm

Written once branch (A), (B) or (C) is chosen per §0.1. Held rather than drafted so the plan does
not carry a design the spec has escalated.

## 12. Closeout

impeccable-gate: N/A — no UI surface
