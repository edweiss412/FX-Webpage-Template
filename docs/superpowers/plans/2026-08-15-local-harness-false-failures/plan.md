# Local-harness false failures — implementation plan

> **For agentic workers:** execute task-by-task per `HANDOFF.md` in this directory (the Opus pane's entry point). The spec is `docs/superpowers/specs/ci/2026-08-15-local-harness-false-failures-design.md`; this plan carries its own adversarial-review gate below.

**Goal:** close the two probed local-only false-failure classes — the psql scan's `.next-*` stack overflow and the `test:fast` transient-mutant race — plus the spec's enrolment obligation, graduating `BL-PSQL-SCAN-NEXT-VARIANT-BUILD-DIRS`, `BL-PSQL-GUARD-WALKS-NEXT-BUILD-VARIANTS`, and `BL-TESTFAST-RACES-TRANSIENT-MUTANT-FILE`.

**Architecture:** one implementation branch, `fix/local-harness-false-failures`, off `origin/main` (worktree + claims created by the authoring session per spec §3). Tasks in order; TDD per task; conventional commits; cross-model diff review; real CI green; merge; `0 0`.

**Date:** 2026-08-15 · **Spec:** `docs/superpowers/specs/ci/2026-08-15-local-harness-false-failures-design.md` · **Status:** plan-APPROVED (codex-guard R3, 2026-08-15, FINDINGS: 0; R1's eight and R2's one finding repaired in-branch; spec APPROVED codex-guard R2 same day)

## Global constraints

- AGENTS.md invariants bind; exercised here: 1 (TDD), 6 (commits), 11 (worktree-only), 12 (claims). No UI surface (invariant 8 N/A), no DB, no advisory locks, no §12.4 rows, no invariant-9/10 registry rows (test/tooling code only).
- Heavy-slot discipline: `pnpm heavy` wraps every full-suite vitest run, `pnpm test:fast`, and `pnpm mutation:guards`. Scoped single-file vitest runs stay unwrapped.
- Guard-premise rule (`tests/_shared/premise.ts`) applies to the new fixture cases where an assertion's discriminating power rests on a constructed condition.

## Pre-draft verification pass (probes recorded; no task re-derives them)

- `pnpm vitest run tests/cross-cutting/psqlStartupFileSuppression.test.ts` → **745 passed, 39.84s** (2026-08-15, authoring worktree, no `.next-*` dirs present).
- `enumerateSites` over `tests/cross-cutting/psqlStartupFiles/scan.ts`: relational-boundary 43, equality-flip 196, logical-connector 152, integer-literal 258, regex-quantifier-bound 5, statement-removal 324 — **total 978**; full enrolment ≈ 11 h at ~40 s/mutant. Spec §2.3 ratifies a scoped subset.
- **Overlay parity, stays-green half:** unmutated `tests/cross-cutting/pg-cron-coverage.test.ts` served through `tests/mutation/source/mutantOverlay.config.ts` (`MUTATION_TARGET` = the suite's own absolute path, `MUTATION_SUITE` = its repo-relative path, `CI=true PG_CRON_COVERAGE_TARGET=local`, local stack up) → **11 passed, 1.29s**. No `setupFiles` divergence; no sibling config needed.
- **Overlay parity, fires half:** same invocation with an inert `liveCase("INERT MECHANISM PROBE", () => {})` spliced at `DESCRIBE_ANCHOR` → child FAILS by name: `live case "INERT MECHANISM PROBE" issued NO database query`. The `load` hook serves mutant text for a TEST-file target.
- **Class sweep 1 — transient tree writers (authored AND run):** `rg -n 'writeFileSync\([^)]*test\.' tests/ scripts/` filtered of tmpdir/fixture writers → the ONLY writer of a transient test-shaped file into the globbed tree is `tests/cross-cutting/pgCronCiVacuity.test.ts` (`MUTANT_REL`). No peer instances; spec §4.4 fences future ones.
- **Class sweep 2 — default-stdio echo (authored AND run, 2026-08-15):** enumerated every `execFileSync`/`execSync` call under `tests/` lacking an explicit `stdio` (per-file regex extraction over the `rg -ln` file list). The repo idiom for child runners is `stdio: "pipe"` (all e2e harness spawns, the mutation runner, the build-artifact gate); the no-stdio callers are psql/git/pnpm helpers whose children are EXPECTED TO SUCCEED — an echoed failure there is diagnostic, not misleading. The only found default-stdio spawner of INTENTIONALLY-failing vitest children is `runSuite` in `pgCronCiVacuity.test.ts` — the instance Task 2 repairs. The broader shape stays fenced as spec §4.4's documented limit, not swept repo-wide.
- **Echo probe (authored AND run):** `execFileSync` with only `encoding` set both prints child stderr to the parent terminal AND captures it on `err.stderr` (minimal Node repro, recorded in the spec §0). Capture and passthrough are independent, so piping stderr changes no assertion input.
- Root `.gitignore` plain-name rows cover all nine non-`docs` `IGNORED_AT_ROOT` literals plus the seven `.next*` variants (spec §2.1 census).
- `vitest.projects.ts` exports `REPO_ALIAS` and `TEST_TIMEOUT_MS` for config reuse (its own doc: "ONE definition, two readers"); `BASE_INCLUDE` requires a test suffix (`*.test.ts` / `*.test.tsx`) under `tests/**`, so a non-test-suffixed temp file outside the repo matches no project glob.

## Meta-test inventory (declared)

- **CREATES:** accept-set parser unit rows + constructed-tree walk fixtures + stays-quiet derived-set pin (all inside `tests/cross-cutting/psqlStartupFileSuppression.test.ts`, the deciding suite); registry row `psqlStartupFileScan` in `tests/mutation/source/registry.ts`.
- **EXTENDS:** `tests/cross-cutting/pgCronCiVacuity.test.ts` (probe mechanics relocate; assertion messages byte-identical).
- **Registries:** invariant-9/10 untouched; source-mutation registry gains the Task 3 row PLUS its `EXPECTED_LEDGER_KINDS` companion entry in `tests/mutation/guardSurfaces.gate.test.ts` (the gate's parity assertion reds without it — that red is Task 3's executable RED).

<!-- tasks: depth=3 -->

### Task 1 — gitignore-derived root skip + loud named throw

<!-- task: red=`pnpm vitest run tests/cross-cutting/psqlStartupFileSuppression.test.ts` ac=AC-1,AC-2,AC-3 -->

RED is the ordinary new-case shape: the task writes new cases into the existing deciding suite, and the production line whose absence makes them fail is the literal `IGNORED_AT_ROOT` set (`tests/cross-cutting/psqlStartupFiles/scan.ts`, symbol `IGNORED_AT_ROOT`) — it contains no derivation, so the fixture-tree case below throws `RangeError: Maximum call stack size exceeded` inside `visit`, and the derived-set pin cases fail on a missing export. Observe the red, then implement, then the SAME command passes.

1. New cases (write first, observe red):
   - **Accept-set parser rows.** Export a pure function from scan.ts (suggested name `rootSkipNamesFromGitignore(text: string): Set<string>`). Positive rows: `.next-dev/`, `/screenshots/`, `out`, `.vercel`. Negative rows (each rejected, contributing nothing): `*.log`, `.env.*.local`, `!keep/`, `a/b/`, `.codex-companion*/`, `# comment`, empty line. Derive expectations from the literal strings in the test, not from the implementation (anti-tautology).
   - **Walk fixture, fires half.** `mkdtemp` tree: `.gitignore` containing `genout/`; a bundle file inside `genout` holding a deep-AST expression (`"x=" + "1+".repeat(60000) + "1"` — nested binary depth far past the recursion limit); a sibling `run.ts` with a real psql call site. `collectPsqlUsage(root)` returns the psql site, `filesScanned` excludes the `genout` bundle, and does not throw.
   - **Walk fixture, premise half.** Same tree WITHOUT the `.gitignore` row: the deep file is walked and the call throws — with a message containing the bundle's tree-relative path. This is the premise that the fixture can fail, exercised end-to-end. Use `premise`/`premiseHolds` where an assertion rests on the constructed tree's shape.
   - **Injected-thrower unit row (AC-2's ratified proof shape).** The rethrow wrapper is an EXPORTED helper (suggested `analyzeNaming(relPath, fn)`) applied to EVERY per-file analyzer call in `collectPsqlUsage` (scan, indirection, workflow passes — not only the path the deep fixture happens to exercise); its unit row calls it with an injected thrower and asserts the rethrown message carries the given repo-relative path. A structural row asserts every per-file call site in `collectPsqlUsage` goes through the wrapper (regex over the function body, or the wrapper is the only call surface) so a future analyzer cannot bypass it.
   - **Stays-quiet derived-set pin (AC-3).** `rootSkipNamesFromGitignore(readFileSync(join(REPO_ROOT, ".gitignore")))` ⊇ the nine current non-`docs` literals ∪ the seven `.next*` names, and ∩ `{app, components, lib, scripts, tests, supabase}` = ∅.
2. GREEN implementation:
   - `collectPsqlUsage(repoRoot)` computes the skip set per call: `{"docs"}` ∪ `rootSkipNamesFromGitignore(...)` over `join(repoRoot, ".gitignore")`; an ABSENT `.gitignore` yields the empty derived set (fixture roots and nested-root calls keep working — the suite calls `collectPsqlUsage(join(REPO_ROOT, "tests", "docs"))` and constructed tmp roots today); a present-but-unreadable one propagates its error loudly. Never a silent fallback to literals.
   - Per-file analysis in `collectPsqlUsage` rethrows any scan error wrapped with the repo-relative path (rethrow, never catch-and-continue; `unreadable` stays as-is).
   - Reconcile any existing suite case that pinned the literal-set behavior at a fixture root (the full-suite green run is the gate; expected: none beyond message updates, since the derived set at a fixture root without `.gitignore` is empty and `docs` is unchanged).
   - Update the scan.ts comments that describe `IGNORED_AT_ROOT` as a hand-list (class-sweep at round 0 for prose describing the old mechanism).
3. Commit: `fix(infra): derive psql-scan root skip from committed gitignore; name the file a scan throws on`.

### Task 2 — pgCron probe mutants served from memory

<!-- task: red=`pnpm vitest run --project=serial tests/cross-cutting/pgCronCiVacuity.test.ts` ac=AC-4,AC-5 -->

RED is a staged-wrongness observation on the same command: step 1 relocates the mutant write and child target but does NOT yet pass the overlay config/env — the child runs the UNMUTATED suite at its real path, passes, and probe A's `expect(run.status).not.toBe(0)` fails (observed, recorded in the task record). Step 2 wires the overlay; the SAME command goes green. The production lines are `writeMutant`'s destination and `runSuite`'s child invocation in `tests/cross-cutting/pgCronCiVacuity.test.ts`.

1. `writeMutant` writes the mutated suite text to `mkdtemp()`-scoped scratch with a non-test extension (e.g. `mutant.txt`); delete `MUTANT_REL`/`MUTANT_ABS` and the `unlinkSync` finallys (temp dir cleanup replaces them); keep the anchor-occurs-exactly-once validation verbatim.
2. Mutant child invocation: `pnpm exec vitest run --config tests/mutation/source/mutantOverlay.config.ts` with env `MUTATION_ROOT` (repo root), `MUTATION_TARGET` (absolute path of `tests/cross-cutting/pg-cron-coverage.test.ts`), `MUTATION_MUTANT` (the scratch file), `MUTATION_SUITE` (`tests/cross-cutting/pg-cron-coverage.test.ts`), plus the probe's existing `CI`/`PG_CRON_COVERAGE_TARGET` env. The three non-mutant `runSuite` callers keep `--project=serial` unchanged. Both parity halves are already probed (pre-draft pass) — this is wiring, not exploration.
3. Echo repair (spec §2.2, same shape-sweep): `runSuite`'s `execFileSync` gains `stdio: ["ignore", "pipe", "pipe"]`; `err.stderr` stays populated (echo probe above). EXECUTABLE before/after, recorded in the task record, runnable verbatim: `LOG=$(mktemp); pnpm exec vitest run --project=serial tests/cross-cutting/pgCronCiVacuity.test.ts 2>"$LOG"; grep -c "FAIL" "$LOG"` — NONZERO on the pre-repair tree (the intentionally failing children echo on every run, no staging needed) and ZERO after, same command pair. Assertion byte-identity is mechanical, not directed: `git diff origin/main -- tests/cross-cutting/pgCronCiVacuity.test.ts | grep '^[-+]' | grep -c 'expect('` returns 0 (the diff touches `writeMutant`/`runSuite` mechanics, never an assertion line).
4. Assertion messages stay byte-identical (spec AC-5); no new assertion weakening; the probes' own `expect(status).not.toBe(0)` remains the premise that the mutant executed.
5. Run the file's suite green (local stack up via preflight), then `pnpm heavy pnpm test:fast` once at branch close (Task 5) as the overlap-mode proof.
6. Commit: `fix(infra): serve pgCron mechanism-probe mutants from memory via the mutant overlay; stop echoing child FAIL lines`.

### Task 3 — enrol scan.ts in the source-mutation registry

<!-- task: red=`pnpm heavy pnpm mutation:guards` ac=AC-6 -->

RED is executable on the same command: step 1 adds the `GUARD_SURFACES` row ALONE — `tests/mutation/guardSurfaces.gate.test.ts` then reds deterministically at its registry-parity assertion (`Object.keys(EXPECTED_LEDGER_KINDS)` must equal every surface id — verified live at the gate's parity `expect`), observed and recorded. Steps 2-3 complete the enrolment; the SAME command goes green.

1. Registry row `psqlStartupFileScan`: `sourcePath: "tests/cross-cutting/psqlStartupFiles/scan.ts"`, `suitePaths: ["tests/cross-cutting/psqlStartupFileSuppression.test.ts"]`, `operators: ["relational-boundary", "regex-quantifier-bound"]` (48 pre-edit sites ≈ 32 min worst case at the measured 39.84 s/run — inside the spec's ~45-minute ceiling; the four excluded operators recorded on the row with the spec §2.3 probe numbers as the reason). Control mutant, exact and verified-unique (1 occurrence, `grep -c 'token.slice(1).includes("X")'` = 1): `from: 'return token.slice(1).includes("X");'` → `to: 'return true;'` — every flagless cluster then certifies suppression, which the suite's negative certification cases kill deterministically in any environment. Run the gate now: observed RED (parity assertion names the missing `EXPECTED_LEDGER_KINDS` entry).
2. Add the `EXPECTED_LEDGER_KINDS` companion entry in `tests/mutation/guardSurfaces.gate.test.ts` for `psqlStartupFileScan` (the gate's independent expectation row — its ledger-kind counts come from the first `pnpm heavy pnpm mutation:guards` run), disposition every survivor (killed-by-suite-extension, `equivalent`, or `accepted-gap` with a `BL-`/`DEF-` ref per the ledger contract), set `scoreFloor` at-or-below the achieved score.
3. GREEN on the same command; STATE score + unaccepted-survivor set in the round-1 diff-review brief (AGENTS.md convergence bullet 4). Commit: `test(infra): enrol psqlStartupFiles/scan in the source-mutation registry (scoped subset)`.

### Task 4 — graduate the three entries

<!-- task: red=`pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts` ac=AC-7 -->

Archive-RED per entry, three commits or one (implementer's call, but each move observes its own red): move the entry body to `BACKLOG-archive.md` WITH its `**Status:** IN PROGRESS · **Branch:** fix/local-harness-false-failures` marker intact → the named command fails BY NAME (archives categorically reject in-flight entries — proves the guard sees THIS entry) → strip the marker → green.

- `BL-PSQL-SCAN-NEXT-VARIANT-BUILD-DIRS` + `BL-PSQL-GUARD-WALKS-NEXT-BUILD-VARIANTS`: one dated resolution paragraph each, each cross-noting the other as the duplicate filing of the same defect (spec §0); resolution records the gitignore-derived mechanism and the loud-name rethrow.
- `BL-TESTFAST-RACES-TRANSIENT-MUTANT-FILE`: resolution records the overlay mechanism, that no tree path ever exists, and the crash-safety improvement (no stray file on SIGKILL).
- `pnpm vitest run tests/docs/` green after the moves.
- Commit: `docs(backlog): graduate the local-harness false-failure entries`.

<!-- tasks: end -->

### Task 5 — close the branch

1. `git merge origin/main` (BACKLOG/archive conflicts resolve per-entry, both sides preserved — the batch's sibling arcs are id-disjoint).
2. Gates: `pnpm heavy pnpm test:fast` (the relocated probes run inside it — the arc's own race-free proof), `pnpm typecheck`, `pnpm exec eslint .`, `pnpm format:check`.
3. Cross-model diff review to APPROVE — dispatched only after Tasks 1-4 are fully committed, and no content commit lands after the final approving round (review covers what merges): codex-guard `--stage diff --round <n>`, round cap 4; brief carries REVIEWER ONLY, the numbered CONSEQUENCE BOUND / PROBE DOMAIN / THREAT MODEL FENCE block with the literal phrase "never silently wrong", VERDICT + FINDINGS instructions, the spec §1.1 do-not-relitigate list, and the Task 3 mutation score + unaccepted-survivor set.
4. Markers: Task 4's archive moves stripped all three inside the graduating commits — the ratified invariant-12 rule ("a graduating entry's marker comes off in the same commit that archives it", AGENTS.md invariant 12); no separate strip commit exists, so the diff the final review round examines IS the diff that merges (no post-review commit). Task 5 verifies the terminal state: `grep -c 'Branch:\*\* fix/local-harness-false-failures' BACKLOG.md DEFERRED.md` returns 0 matches. Then PR (preflight ran — not docs-only); real CI green; `gh pr merge --merge`; ff main; `git rev-list --left-right --count main...origin/main` → `0 0`.

## Acceptance criteria (spec §6, restated for the task markers)

- **AC-1** representative build outputs present → deciding suite fully green: all 745 pre-arc cases plus this task's new rows pass, none removed (red first: synthesized deep-AST bundle in a gitignored dir reds the unfixed walk).
- **AC-2** a scan error names the file (injected-thrower unit row).
- **AC-3** derived-set pins: ⊇ nine literals ∪ seven `.next*`, ∩ tracked source roots = ∅.
- **AC-4** probes pass with no tree path ever created (in-memory overlay; temp-dir mutant text).
- **AC-5** `test:fast` green, probe assertions byte-identical, no child `FAIL` echo on the outer streams.
- **AC-6** scan.ts enrolled (scoped subset), score + survivor set stated in the round-1 diff brief.
- **AC-7** three entries graduated, markers per spec §3, `tests/docs/` green.

## Adversarial review (cross-model)

This plan: self-review → codex-guard `--stage plan --round <n>` to APPROVE before execution handoff. Each brief: REVIEWER ONLY; consequence bound / probe domain / threat fence; round cap 4.

## Execution handoff

A NEW Opus pane executes from `HANDOFF.md` in this directory after the authoring PR merges. Never end a turn mid-pipeline; 10-minute nudge per Stage-0 semantics.

impeccable-gate: N/A — no UI surface

## Self-review checklist (run before dispatching the plan review)

- [x] Every named file/symbol re-grepped (pre-draft pass above).
- [x] Anti-tautology: parser rows derive expectations from test-local literals; the walk fixture's premise half proves the fixture can fail; the derived-set pin reads the committed `.gitignore`, not the implementation's output re-fed to itself.
- [x] Reconciliation sweeps authored AND RUN: the transient-writer class sweep (output above); the overlay parity probes (both halves recorded).
- [x] `red=` validity: Task 1/2/4 name the production line or observed staged red; Task 3 sits outside the marker region with its reason stated inline.
- [x] `pnpm spec:lint` on this plan: 0 hard.
- [x] Numeric sweep after every repair round.
