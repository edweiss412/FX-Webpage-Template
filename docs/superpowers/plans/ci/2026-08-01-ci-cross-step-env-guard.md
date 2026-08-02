# Plan — job-scoped cross-step GITHUB_ENV/GITHUB_PATH grouping for both CI guard layers

**Spec:** `docs/superpowers/specs/ci/2026-08-01-ci-cross-step-env-guard-design.md` (canonical; §3 is the mutation-family closure set, §5 the documented limits). **Branch:** `test/ci-cross-step-env-guard`. **Backlog item:** `BL-CI-GITHUB-ENV-CROSS-STEP-STATE` (repo-root `BACKLOG.md`).

Every task: failing test → minimal implementation → passing test → one conventional commit (`test(ci): …`). No task touches UI, DB, locks, or mutation surfaces — invariants 2/3/5/8/9/10 are N/A.

**Invariant 11 (recorded; plan-review R1 finding 3):** all work happens in the worktree `../FX-worktrees/ci-cross-step-env-guard`, created off `origin/main` before the first edit. Setup ran `pnpm install`, then `pnpm worktree:link-env` (`LINK .env.local -> main checkout`, "resolves ✓"), then `pnpm preflight` (`preflight: env ✓ local DB ✓`, with the standing WARN that `TEST_DATABASE_URL` is non-loopback). The main checkout was never written.

**Execution-order note (honesty), corrected at plan-review R1 and made drift-proof at R3:** every task is SHIPPED — this document is an as-built record, not a forward list. T1/T2 were implemented red-first during the spec-R1 review wait; T3 (probe retirement + backlog graduation) landed in `91249b04d`. Each adversarial spec round since then produced its own repair commit on top. **This plan deliberately does NOT enumerate those rounds or their SHAs**: an enumeration written during an active review train is stale the moment the next round lands, which cost plan-review rounds R2 and R3. The authoritative records are, instead: the spec's §7 (one entry per round, with findings and dispositions) and `git log --oneline origin/main..HEAD` (one commit per repair). Both are generated from the work rather than transcribed alongside it, so neither can drift.

## Pre-draft verification (run 2026-08-01 in this worktree)

- Zero live writers: `grep -rn "GITHUB_ENV\|GITHUB_PATH" .github/` → no output.
- Probe at origin/main 0fb6f9efb: both layers pass a poisoned two-step workflow (spec §1.0) — probe file tests/ci/probe-cross-step-poison.test.ts (untracked, deleted in T3).
- Live symbols verified: `RunBlock` / `runBlocksOf` / `censusInvocations` `contextWhy` chain / config-set tripwire in `tests/ci/_metaSpecRegistration.test.ts`; `Opts` / per-job loop / rejection chain in `tests/ci/_workflowCoverageScan.ts`; scanner caller + self-suites in `tests/ci/_metaE2eWorkflowCoverage.test.ts`; two local actions under `.github/actions/`.
- Both guard test files already run in the unit suite (`tests/**/*.test.ts` serial include, `vitest.projects.ts` `BASE_INCLUDE`); NO new test file is created, so no testMatch/workflow-filter wiring changes. The probe file is deleted before merge, not wired.

## Meta-test inventory (mandatory declaration)

This arc EXTENDS two existing structural meta-tests in place (`tests/ci/_metaSpecRegistration.test.ts`, `tests/ci/_metaE2eWorkflowCoverage.test.ts` + the pure module `tests/ci/_workflowCoverageScan.ts`). No auth/DB/alert/tile registry applies: the diff is test-only CI guard surface — the touched files ARE the meta-tests. The comment-stripping registry (`tests/cross-cutting/_metaStripCommentsSingleSource.test.ts`) already carries a `marker-skip-regex` row for the census file; the scanner-side `stripCommentLines` needed its own reasoned row, which landed with the R3 repair commit `ff9c1e333` (not in T2 as originally planned) — the registry now carries both rows (spec §6).

## T1 — census: poison predicate + `runBlocksOf` job grouping + composite splice + poisoned context (SHIPPED: ea9b0cb3e)

**Red:** in the `runBlocksOf` fixture `it` of `tests/ci/_metaSpecRegistration.test.ts`, add assertions (they fail red against the current shape — existing `toEqual` rows gain `poisoned: false` in the same edit):

- two-step poisoned job → `[{…, poisoned: false}, {…, poisoned: true}]` (F3 both directions: write-first poisons, write-after does not) — semantically real writes per spec §1 R1 correction (directory prepend via GITHUB_PATH, `PATH=` assignment via GITHUB_ENV);
- write in job A, run step in job B → B's block `poisoned: false` (F1 precision twin);
- full-line `#` comment mentioning GITHUB_ENV in a run block → does not poison (F6);
- workflow with `uses: ./a` where the passed `localActions` map holds composite doc a: action write → later workflow block poisoned; earlier workflow write → spliced action blocks poisoned; action step 1 writes → action step 2's block poisoned (F4, all three directions);
- `uses: ./ghost` absent from map → later blocks poisoned (F5);
- known `using: node20` action → later blocks poisoned (F7, R1);
- nested composite chain: writing grandchild poisons parent remainder + workflow; clean chain stays clean; self-cycle fail-closed; sequential same-action reuse stays clean (F8, R1);
- marketplace `uses: actions/checkout@v4` → no poison;
- standalone action doc (`runs.steps`) → internal ordering threads poison.

**Green:** `RunBlock` gains `poisoned: boolean`; `writesJobEnv` predicate per spec §2.0 (strip full-line `#` lines, test `/GITHUB_ENV|GITHUB_PATH/`); `runBlocksOf(doc, localActions?: Record<string, unknown>)` uses ONE recursive walker (`walkSteps`) for jobs, spliced composites, and the standalone entry — composite-only splice, PATH-scoped cycle guard, fail-closed on unknown/non-composite/cyclic `./` refs, neutral on remote refs. Plus the poisoned-context half: census item type gains `poisoned?: boolean`, `contextWhy` gains the poisoned branch (why-string `environment poisoned by an earlier same-job GITHUB_ENV/GITHUB_PATH write`), and the config-set tripwire builds the action-doc map, passes it to every `runBlocksOf` call, and drops the flat used-action append (spliced per use site).

Signature sketch (typechecked at draft time, see Snippet-typecheck note):

```ts
export type RunBlock = { run: string; guarded: boolean; poisoned: boolean };
export function runBlocksOf(doc: unknown, localActions?: Record<string, unknown>): RunBlock[];
```

The census-core fixture additions (same commit): poisoned classifying item → problems non-empty with the registry-route why, invoked empty; poisoned NON-classifying item → silent; registered poisoned line → contributes exactly its declared configs. Whole census file green against the live tree (zero writers, so no new registry rows — spec §4.3).

**Commit (shipped):** `test(ci): census models cross-step GITHUB_ENV/GITHUB_PATH state per job (spec §2.1)`

## T2 — scanner: per-job poison flag + `localActions` opt + caller (SHIPPED: 911662097)

**Red:** scanner self-suite additions in `tests/ci/_metaE2eWorkflowCoverage.test.ts`:

- poisoned workflow (write step, then invocation step) → `covered` empty, `rejected[0].reason === "earlier same-job step writes GITHUB_ENV/GITHUB_PATH"` (REPORTED, not dropped);
- three semantically-real write shapes all red (spec §1 R1 correction): `>>` path prepend, `tee -a "$GITHUB_ENV"` with a `PATH=` line, `>` redirect (F2);
- write AFTER invocation step → still covered (F3 negative); cross-job write → other job still covered (F1 precision);
- `uses: ./ghost` (no `localActions` entry) before invocation → rejected (F5), quoted-ref twin rejected; `uses: ./ok` whose provided composite text is clean → covered; whose text writes → rejected (F4); `using: node20` manifest → rejected (F7); nested chain writer rejected / clean chain covered / self-cycle rejected (F8);
- marketplace `uses:` before invocation → covered (trusted);
- between-step full-line comment prose mentioning GITHUB_ENV (comment-glue) → covered (F6); chunk-level `name:` mention → rejected (spec §5 L5 pin);
- whole-config literal in a poisoned job → claims rejected, not silently dropped.

**Green:** `Opts` gains `localActions?: Record<string, string>`; per-job loop threads `envPoisoned` across ALL step chunks (bookkeeping moved out from behind the `run:`-presence early-continue), qualification-then-bookkeeping order per spec §2.2, new reason inserted directly after `unmodelled execution override`; `localActionPoisons` resolves local refs recursively (quote-stripped, composite-only, cycle fail-closed). Caller builds the map from `.github/actions/**` manifests keyed `./<dir>`. Both live suites green.

**Commit (shipped):** `test(ci): scanner rejects claims after an earlier same-job GITHUB_ENV/GITHUB_PATH write (spec §2.2)`

## T3 — probe graduation, live-green gate, backlog graduation (SHIPPED: 91249b04d)

- Deleted tests/ci/probe-cross-step-poison.test.ts (its assertions live inverted in the suites; `git cat-file -e HEAD:tests/ci/probe-cross-step-poison.test.ts` fails, confirming absence).
- Gates: `pnpm vitest run tests/ci/_metaSpecRegistration.test.ts tests/ci/_metaE2eWorkflowCoverage.test.ts tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts tests/cross-cutting/_metaStripCommentsSingleSource.test.ts` green, plus the pre-push ladder (`pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`). **Full-suite disposition (plan-review R1 finding 2):** the local `pnpm test` invocation ends 1696 passed / 1 failed on this shared machine, the failure rotating among DB- and process-spawning specs under concurrent-session contention (each passes isolated). A locally green full run is therefore not achievable while sibling sessions share the database, so the gate's authority moves to **real CI**, which runs the same suite on a dedicated runner: PR #650 must be green before merge, and that is the merge condition this plan enforces. The per-suite runs above and the isolated reruns are the local evidence.
- Graduate the BACKLOG entry: move `BL-CI-GITHUB-ENV-CROSS-STEP-STATE` from `BACKLOG.md` to `BACKLOG-archive.md` with provenance `test/ci-cross-step-env-guard`, add the ONE `BACKLOG_GRADUATED` registry row required by `tests/docs/_metaDeferralLedgerGraduation.test.ts`, and run that test. (Merge conflicts with sibling graduations are EXPECTED; resolve by layering, keep both sides, re-run the mdast walker guard.)
- **Commit (shipped):** `test(ci): graduate BL-CI-GITHUB-ENV-CROSS-STEP-STATE; retire cross-step probe (T3)` — verified: the id is absent from `BACKLOG.md`, present in `BACKLOG-archive.md` with this branch as provenance, and registered once in `BACKLOG_GRADUATED`.

## Snippet-typecheck note (writing-plans rule)

The only embedded snippet is the T1 signature sketch; it was typechecked at draft time by pasting into a scratch module in this worktree against the repo tsconfig (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`). All other test shapes reuse existing fixture idioms already compiling in the two suites (object-literal `toEqual` rows, `S(...)`/`base(...)` YAML template helpers).

## Failure modes each new test catches (anti-tautology declaration)

- F1/F3/F6 negatives: catch over-poisoning (a guard that reds clean jobs forces reason-free rows — precision is load-bearing, not cosmetic).
- F1 positive + F4 + F5: catch the exact probe-demonstrated false-coverage/false-silence bug — a mutant deleting grouping, splice, or fail-closed unknown-ref handling reverts to probe behavior and fails these.
- F2 triple: catches write-shape narrowing (any grammar tighter than the substring predicate fails at least one shape).
- F7 + F8 (added at spec R1 via live escaping mutants, refined R7-R10): catch map-presence-treated-as-modeled and recursion deletion — in-memory mutants of each produce `covered=true, reasons=[]`, and the fixtures red them at direct AND nested sites; the R8-R10 additions (typed validator, narrow accept profile, uses classifier) each carry their own shape tables.
- R11 closes the last uses-shape instance: the census walker shares `usesKind` with the scanner and the manifest profile, so a refless remote ref poisons census-side too — mutant check: reverting the walker branch to "any non-local ref is neutral" makes the refless fixtures record a clean invocation again.
- Reason-string assertions: catch silent dropping (the `_rowWrapperScan` lesson — a scanner that matches nothing is worse than none).

## Review + ship

- Codex adversarial review of this plan (codex-guard, REVIEWER ONLY brief, finding-admissibility contract, §3 closure set F1–F8 as the convergence criterion) → APPROVE.
- All tasks shipped; whole-diff Codex review → APPROVE; push; real CI green; `gh pr merge --merge`; ff-sync main to `0  0`.

## Pre-push ladder record (contract, not a transcript — plan-review R3)

Recording a ladder run against a specific SHA goes stale the moment the next repair lands, which is what R2 and R3 both flagged. The durable contract instead: **the pre-push ladder (`pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`) is re-run at FINAL HEAD after the review train ends, and merge is gated on real CI for PR #650 rather than on any local transcript.**

Standing observations from every run so far (ladders 2, 5, 6, 7, 8): typecheck, lint (44 pre-existing warnings, 0 errors) and format:check are green; `pnpm test` reports ~1696 passed with a single failure that rotates among DB-touching and process-spawning specs (`tests/scripts/runExcludedTest.test.ts`, validation-project specs, live-Google smokes) and passes in isolation every time — the documented shared-machine contention class, since sibling autonomous sessions share this database. Live-Google flakes are separately explained by the machine's Node 250ms family-autoselect timeout (isolated pass under `NODE_OPTIONS=--network-family-autoselection-attempt-timeout=3000`). A locally green full suite is therefore not achievable here; CI on a dedicated runner is the authoritative signal, and the guard suites specific to this diff (`tests/ci/_metaSpecRegistration.test.ts`, `tests/ci/_metaE2eWorkflowCoverage.test.ts`) are green on every run.
