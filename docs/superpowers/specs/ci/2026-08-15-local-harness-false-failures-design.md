# Local-harness false failures — gitignore-derived root skip + in-memory probe mutants

**Date:** 2026-08-15 · **Arc branch:** `docs/harness-false-failures-spec` (authoring) → `fix/local-harness-false-failures` (implementation) · **Status:** DRAFT

## §0 Why

Two probed local-only false-failure classes, each with its ledger entry as the spec-of-record for mechanics:

1. **`BL-PSQL-SCAN-NEXT-VARIANT-BUILD-DIRS`** (BACKLOG.md, filed 2026-08-11; duplicate filing `BL-PSQL-GUARD-WALKS-NEXT-BUILD-VARIANTS` — same defect filed twice from two triage sessions; both graduate here and the archive notes the duplication). The psql startup-file scan's `IGNORED_AT_ROOT` (`tests/cross-cutting/psqlStartupFiles/scan.ts`, symbol `IGNORED_AT_ROOT`) lists `.next` but not the sibling build outputs local tooling writes. The walk hands multi-MB generated bundles to the TypeScript AST scan and the recursive `visit` overflows: `RangeError: Maximum call stack size exceeded`, 19 of the suite's 745 cases red, no file named. Probed by bisect in the entry: moving the `.next-*` directories aside takes the suite to 745/745 with no other change. CI is unaffected (fresh checkout has no build output), which is why it can persist and cost each developer the same half-hour bisect.
2. **`BL-TESTFAST-RACES-TRANSIENT-MUTANT-FILE`** (BACKLOG.md, filed 2026-08-11). `tests/cross-cutting/pgCronCiVacuity.test.ts` (symbol `MUTANT_REL`) writes a real transient file into the globbed tree — a test-suffixed mechanism-probe-mutant sibling of the suite (path fixed by the `MUTANT_REL` constant) — runs it as a child-vitest mutant, and unlinks it. `scripts/test-fast.mjs` runs the serial and parallel vitest projects as two concurrent processes (its whole point), so another glob can pick the transient up mid-run and execute it outside its harness. Observed once in a full `pnpm test:fast`: the mutant fails by name, the file no longer exists by the time anyone looks, and `pg-cron-coverage.test.ts` passes 8/8 standalone immediately after. Not a CI problem (projects run in separate jobs).

## §1.1 Resolved scope — do not relitigate

1. **The gitignore-derived skip IS the derivation.** The entry's own terminating framing: skip what the repo's committed root `.gitignore` declares generated, NOT four (now seven) `.next-*` literals — a fifth build target must not re-open it. Derived-cover-over-enumeration is settled repo doctrine (AGENTS.md class-sweep rule: "a sweep verified by enumeration re-opens the moment someone adds a site"). A reviewer asking for literals, or for a wider ignore-grammar recognizer, is relitigating.
2. **The mutant never lands in the globbed tree.** The entry's first-scheduled-step fences the shape: out-of-tree (or structurally unmatchable), NOT a basename exclusion — a basename row would leave the next probe exposed.
3. **The `docs` root skip stays.** It is a ratified root-relative exclusion (scan.ts header: "The ratified `docs/**` exclusion is ROOT-relative"), independent of gitignore, and is out of scope here.
4. **Guard posture is unchanged.** The scan remains a regression net for ordinary code, not a security boundary against an evading author (scan.ts header, "What this guard IS"). Nothing in this arc widens or narrows what the scanner certifies — only which files the walk feeds it and what a thrown scan reports.
5. **Autonomy:** user grant 2026-08-15 (Eric), both user review gates WAIVED for this batch. Stop only for a genuinely new question.

## §2 Design

### §2.1 psql scan: derive the root skip from the committed root `.gitignore`

**Accept-set (keyed on structure, not spelling).** A line of the repo-root `.gitignore` contributes a root-skip name iff it is a PLAIN NAME: optional leading `/`, then a single path segment containing no glob metacharacter (`*`, `?`, `[`) and no `!` prefix and no interior `/`, then an optional trailing `/`. Everything outside that accept-set — wildcard patterns (`*.log`, `.codex-companion*/`), negations, nested paths — is REJECTED BY NAME: it contributes nothing to the skip set and the entry is walked as today. Rejection is the conservative direction: the walk can only over-scan, never silently under-scan, and an over-scanned pathological file now fails LOUD with its name (below).

**Composition.** `IGNORED_AT_ROOT` becomes `{"docs"}` (ratified literal, §1.1 item 3) ∪ the derived set. The current nine non-`docs` literals (`.next`, `.turbo`, `.vercel`, `coverage`, `dist`, `build`, `out`, `playwright-report`, `test-results`) are all plain-name rows of the committed `.gitignore` today, so the derivation subsumes them — verified at authoring time against `.gitignore`, which also contributes the seven `.next*` variants (`.next/`, `.next-dev/`, `.next-prod/`, `.next-prod-flip/`, `.next-build-artifact-gate-test/`, `.next-screenshots-help/`, `.next-prefetch-probe/`) plus the other untracked scratch roots (`tmp/`, `/screenshots/`, `.validation-state/`, …). `IGNORED_ANYWHERE` (`.git`, `node_modules`) is unchanged. The derivation reads the committed file only — never `git check-ignore` — so the skip set is identical on every machine and in CI, and never varies with a developer's global excludes.

**Fail loud with the file name.** When per-file analysis throws (the `scanSource` call chain inside `collectPsqlUsage`), the error is rethrown carrying the repo-relative path of the file being parsed. Never caught-and-continued: a swallowed scan error is a silent under-count, the exact class the walk's `unreadable` ledger exists to prevent (scan.ts, `walk` doc comment). The next `.gitignore` gap therefore names itself instead of needing a bisect.

**Consequence bound.** Every file the walk reaches is either analyzed or NAMED in a loud failure; the only silently-skipped roots are the documented, gitignore-derived set plus `docs`. Never silently wrong.

**Tracked-source safety.** A gitignored path is untracked by definition, and the scan's contract is tracked-source fail-by-default (scan.ts comment above `IGNORED_ANYWHERE`: only genuinely untracked machinery is skipped). One residual: a TRACKED root directory whose plain name is later added to `.gitignore` would be newly skipped (git keeps tracking it; the derivation would not know). Fenced as a documented limit (§4.2) with a stays-quiet pin: the guard's tests assert the derived set for THIS repo's `.gitignore` excludes every tracked source root (`app`, `components`, `lib`, `scripts`, `tests`, `supabase`).

### §2.2 pgCron mechanism probes: serve the mutant from memory, write nothing into the tree

**Mechanism.** Reuse the shipped in-memory overlay from the source-mutation harness: `tests/mutation/source/mutantOverlay.config.ts` serves mutant text for a target module from a vitest `load` hook (`mutantOverlayPlugin`), so the tracked file is never written and "a crashed or killed run cannot leave a mutant on disk" (that config's own doc). For these probes the TARGET is the suite file itself: the child vitest runs `tests/cross-cutting/pg-cron-coverage.test.ts` at its real path with the mutated text served in memory. The mutant TEXT lives in a `mkdtemp` scratch file with a non-test extension, outside the repo tree; no path matched by any project glob ever exists, at any instant, so the race class is removed rather than narrowed — and a SIGKILL mid-probe leaves no stray tracked-looking file for the next full run to trip on (a hazard of the current shape the entry did not name).

**Import + config parity — PROBED at authoring time (2026-08-15), both directions.** Because the suite runs at its real path, `./_liveCaseCounter` and `@/` imports resolve with no rewriting; the overlay config already carries `REPO_ALIAS` and `TEST_TIMEOUT_MS` from `vitest.projects.ts` (single-source constants, exported for exactly this reuse). Stays-green half: the UNMUTATED suite text served through `mutantOverlay.config.ts` (with `CI=true PG_CRON_COVERAGE_TARGET=local`, local stack up) passes 11/11 in 1.29s — no `setupFiles` divergence bites, no sibling config is needed. Fires half: the same invocation with an inert `liveCase` spliced at the probe's own `DESCRIBE_ANCHOR` fails BY NAME with the exact message probe A asserts (`live case "INERT MECHANISM PROBE" issued NO database query`), proving the `load` hook serves mutant text for a TEST-file target, not only for imported modules. Both transcripts ride in the plan.

**Probes keep their own premise.** Both mechanism-sabotage probes assert the child FAILS with a named message (`live case "INERT MECHANISM PROBE" issued NO database query`, and the aggregate-branch message). A mutant that silently fails to run yields a passing child, which fails the probe's first assertion — so the relocation cannot go dark without the probes themselves going red. The anchor-validated `writeMutant` contract (every anchor occurs exactly once, validated before writing) is preserved; only the write destination and the child invocation change.

### §2.3 Mutation-registry enrolment (AGENTS.md convergence bullet 4)

- **`tests/cross-cutting/psqlStartupFiles/scan.ts`** is expressible by the registry (an importable module whose verdict-deciding suite is `tests/cross-cutting/psqlStartupFileSuppression.test.ts`; same shape as the enrolled `tests/cross-cutting/pgCronSmokes.ts`). It is not enrolled today. **Authoring-time budget probe (2026-08-15):** the deciding suite runs 745 cases in 39.84s, and `enumerateSites` over scan.ts yields 978 sites across all six operators (statement-removal 324, integer-literal 258, equality-flip 196, logical-connector 152, relational-boundary 43, regex-quantifier-bound 5) — full enrolment is ~11 h of per-mutant children, unrunnable in any nightly budget. The registry explicitly supports per-surface operator subsets ("a surface may enrol fewer than all six", `tests/mutation/source/operators.ts` doc), so the implementation branch enrols a SCOPED row — operator subset chosen at plan time with worst-case runtime under ~45 minutes, control mutant per the registry contract, budget-excluded operators recorded on the row with this probe as the reason — BEFORE its first diff-review dispatch, runs `pnpm heavy pnpm mutation:guards`, and states the score plus the unaccepted-survivor set in the round-1 diff brief. A wider subset is a future registry change carrying its own numbers, not a review finding (AGENTS.md convergence bullet 4).
- **`tests/cross-cutting/pgCronCiVacuity.test.ts`** is a SUITE, not a source module with a deciding suite; the registry cannot express it (there is no module-under-mutation — the probe file is itself the verdict mechanism). Cannot-express by shape, stated here so the review does not re-derive it.

## §3 Sequencing + claim handoff

1. This branch (`docs/harness-false-failures-spec`) carries spec + plan + HANDOFF and claims all three entries (Stage-0 markers pushed).
2. Before this branch's PR merges, the implementation branch `fix/local-harness-false-failures` is created off `origin/main`, marks the same three entries `**Status:** IN PROGRESS · **Branch:** fix/local-harness-false-failures`, and pushes — the transient dual declaration is the designed handoff state (L-wave §3 pattern).
3. This branch's last pre-merge commit strips its own three markers. At no instant is any entry undeclared on origin.
4. The implementation branch graduates all three entries (archive moves, markers stripped inside the moves) when it ships.

## §4 Documented limits

1. **Wildcard-ignored roots are not derived.** A root entry ignored only by a wildcard pattern (e.g. `.codex-companion*/`) stays walked. Worst case is a loud failure naming the file (§2.1), not a silent skip — conservative by construction. Widening the accept-set is a future decision, not drift.
2. **A tracked root directory later named by a plain-name `.gitignore` line would be skipped.** Committed-`.gitignore` review plus the stays-quiet pin in §2.1 (derived set excludes every tracked source root) fence it; the suite's non-vacuity census cases ("the walk is not vacuous", "the walk read every directory") remain the behavioral backstop.
3. **The scan still overflows on a pathological file inside a WALKED directory.** The fix removes the known generated-output trigger and names the file on any recurrence; it does not make the AST visitor iterative. A named failure is the accepted outcome for the next unknown trigger.
4. **`test:fast`'s serial/parallel overlap is unchanged.** The race is removed by removing the file, not by serializing the projects; any OTHER writer of transient test-shaped files into the globbed tree would recreate the class. The plan's class sweep (authored and run) shows `MUTANT_REL` in `pgCronCiVacuity.test.ts` is the only such writer today; a future one is a review matter, fenced by this limit rather than by a new guard.

## §5 Meta-test / registry inventory

- **CREATES:** unit rows for the `.gitignore` accept-set parser (positive and negative), a constructed-tree walk fixture proving skip + scan + loud-throw-with-name, the stays-quiet pin of §2.1, and the registry row enrolling `scan.ts` (§2.3, probe-gated).
- **EXTENDS:** `tests/cross-cutting/pgCronCiVacuity.test.ts` (probe mechanics relocate; assertions unchanged). No new Supabase call site, no mutation surface under invariant 10 (test/tooling code only), no advisory locks, no §12.4 rows, no UI surface.

## §6 Acceptance criteria

- **AC-1:** With representative `.next-*` build outputs present locally, `pnpm vitest run tests/cross-cutting/psqlStartupFileSuppression.test.ts` passes 745/745 (executable RED first: a synthesized deep-AST bundle file inside a gitignored `.next-*` dir reds the unfixed suite with the entry's `RangeError`; green after).
- **AC-2:** A scan error inside a walked file fails naming that file's repo-relative path (unit-proven with an injected thrower).
- **AC-3:** The derived skip set for this repo's `.gitignore` contains every current `IGNORED_AT_ROOT` literal except `docs`, contains all seven `.next*` variants, and contains no tracked source root — pinned by test rows, not prose.
- **AC-4:** Both pgCron mechanism-sabotage probes pass with NO file ever created under a path matched by any default-project glob (the mutant text lives outside the tree; the tracked suite file is never written).
- **AC-5:** `pnpm test:fast` full run green with the probes executing (not skipped); the probes' failure-message assertions are byte-identical to today's.
- **AC-6:** `scan.ts` enrolled in `tests/mutation/source/registry.ts` with the §2.3 scoped operator subset, a stated score, and an empty-or-accepted survivor set; budget-excluded operators recorded on the row with the probe.
- **AC-7:** All three entries graduated to `BACKLOG-archive.md` (duplication noted on both psql rows), markers handled per §3, `pnpm vitest run tests/docs/` green.

impeccable-gate: N/A — no UI surface
