<!-- spec-lint: not-ui — no UI surface: tasks land in tests/ci/**, tests/mutation/source/registry.ts, and docs -->

# Modal-wait candidate contract v2 — implementation plan

**Spec:** `docs/superpowers/specs/ci/2026-08-17-modal-wait-candidate-contract-design.md` (adversarial APPROVE, spec round 3) · **Ledger:** `BL-MODAL-WAIT-SITE-ASSOCIATED-COUNTS` + `BL-MODAL-WAIT-LINE-GRANULARITY-ACTIVATION` · **Branch:** `fix/modal-wait-candidate-contract`
**Implementer:** separate session (this arc is spec+plan only). Worktree, env link, and preflight already exist per invariant 11; the implementer re-runs `pnpm preflight` before Task 1.

impeccable-gate: N/A — no UI surface

## Surfaces and invariants

- Edited: `tests/ci/modalWaitHelper/scan.ts`, `tests/ci/modalWaitHelper/disposition.ts`, `tests/ci/_metaModalWaitHelper.test.ts`, `tests/mutation/source/registry.ts` (accepted-row ids + any new rows), `BACKLOG.md`/`BACKLOG-archive.md`, `docs/superpowers/plans/ci/README.md`.
- NOT edited: `scanForViolations` + `productOpenSurfaces` (spec §1 out-of-scope; behavior byte-unchanged), `tests/e2e/helpers/openShowReviewModal.ts`, every `tests/e2e/*.spec.ts` (label-only edits permitted if re-derivation demands; expected zero — spec §1).
<!-- spec-lint: ignore — tests/ci/_metaModalWaitCandidateV2.test.ts is created by Task 1 -->
- **Meta-test inventory:** this plan EXTENDS `tests/ci/_metaModalWaitHelper.test.ts` (registry assertions), CREATES `tests/ci/_metaModalWaitCandidateV2.test.ts` (premise proofs), UPDATES the `modal-wait-helper-scan` row in `tests/mutation/source/registry.ts`, and EXTENDS the `EXPECTED_ENV_TOUCHING` registry in `tests/mutation/_metaPremiseContract.test.ts` (one row per new deciding suite). No other structural registry applies: no Supabase call boundary, no advisory lock, no admin mutation surface, no tile/sentinel surface — the diff is test-infra only.
- **Mutation-family closure:** the operator families are the registry row's declared set (`operators: [...OPERATOR_NAMES]`, `tests/mutation/source/registry.ts:259`) — that enumeration is the closure set this arc's reviews converge against. A reviewer-proposed NEW family is admissible only with a live escaping mutant demonstrated against the shipped guard (AGENTS.md convergence criterion 4).
- **e2e harness-readiness:** N/A — no Playwright run is attached by any task; every suite here is vitest, and AC verification against e2e specs is static (census over source text).
- Acceptance criteria are spec §5's: **AC-1** statement unit + premise proofs; **AC-2** registry + row-1 proofs; **AC-3** total disposition preserved; **AC-4** route-pattern single source; **AC-5** guard untouched; **AC-6** mutation duties; **AC-7** bookkeeping. AC-7's ledger half is discharged by Task 4, outside the red-contract region (bookkeeping tail, not a TDD unit).

## Plan-time probes (run 2026-08-17 in this worktree; commands + output)

- `rg -c 'awaitReviewModalOrRecover\(' tests/e2e/*.spec.ts | awk -F: '{s+=$2} END {print s}'` → **12** (plan review R2 finding 5 caught the earlier `| sum` spelling — GNU checksum, fail-open; this is the command actually run, re-run 2026-08-17 after the finding) (matches the spec §2.2 registry table's 12 rows exactly).
- `rg -c 'scopeTitle|matchLineText|createSourceFile' tests/ci/modalWaitHelper/scan.ts` → **0 hits** — the v2 API is verifiably absent from the live tree, which is what makes Task 1's authored RED valid.
- Rule inventory: `rg -o 'id: "[^"]+"' tests/ci/modalWaitHelper/disposition.ts` → **30 rules**, of which **5** are prose rules (`a/prose`, `b/prose`, `c/prose`, `d/prose`, `e/prose`). Reconciliation for Task 2: 30 − 5 retired + 1 new exclusion (`d/evaluate-poll`, spec §4.3-1) = **26 rules** expected after the rewrite, ± any the re-derivation shows must split; any divergence from 26 is named in Task 2's commit message with its reason.
- Baseline deciding suite: `pnpm vitest run tests/ci/_metaModalWaitHelper.test.ts` → **24 passed (24)**.
<!-- spec-lint: ignore — tests/mutation/guardSurfaces.shardX.test.ts is a transient file this plan creates and deletes within Task 3; deliberately never tracked -->
- Baseline scoped mutation gate (validates Task 3's command shape AND its red capability — the gate mechanism reds on any unaccepted survivor or stale ledger row by registry contract, which Task 3's scan.ts edit will trigger via relocated siteIds until the ledger is refreshed): temporary `tests/mutation/guardSurfaces.shardX.test.ts` registering only `modal-wait-helper-scan`, `VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm heavy vitest run --project mutation tests/mutation/guardSurfaces.shardX.test.ts` → **7 passed, 114.76s**, then the temp file deleted (`_metaSourceShardIntegrity` pins the real shard set).
- Statement-unit corpus calibration: spec §2.2 table (line-unit vs statement-unit per origin; all 12 labels extractable; 4 of 12 labels on a different line than their call).

## Deliberate-red span

<!-- spec-lint: ignore — tests/ci/_metaModalWaitCandidateV2.test.ts is created by Task 1 -->
Task 1 authors the v2 premise proofs **in a NEW sibling suite file, `tests/ci/_metaModalWaitCandidateV2.test.ts`** (matched by the unit-suite include `tests/**/*.test.ts` — `BASE_INCLUDE`, `vitest.projects.ts:34` — so no wiring task is needed), and that file FAILS: its import of the v2 API does not resolve. Plan review R1 finding 1 is why the cases do NOT land in `_metaModalWaitHelper.test.ts` during the span — an unresolved import there fails collection of the whole file and masks the existing 24 cases behind one loader error. With the sibling file, `pnpm vitest run tests/ci/_metaModalWaitHelper.test.ts` stays green through Task 1 (verified claim: Task 1 touches neither that file nor any production file). Task 2 lands scan v2 + the disposition rewrite + the registry and drives BOTH files green; the sibling file is permanent and Task 2 adds it to the mutation row's `suitePaths` so its cases count as deciders (spec §1 as amended). This is the plan's one declared red span (parent-plan precedent: its Task 2→7 span). Do not push a PR-ready state inside it; Tasks 1+2 may land as one push.

Typecheck note (writing-plans snippet rule, stated exactly): the fenced block below was typechecked at plan time under the repo's strict flags (`--strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes`) with `declare`-stub declarations standing in for the not-yet-existing v2 API — `tsc` exit 0. Resolution of the real import is DESIGNED to fail until Task 2; the stub typecheck proves the snippet's own syntax and typing, and the resolution failure is the authored red, not a typecheck pass.

<!-- tasks: depth=3 red-contract -->

### Task 1: Author the v2 premise proofs (RED)

<!-- spec-lint: ignore — tests/ci/_metaModalWaitCandidateV2.test.ts is created by this task -->
<!-- task: red=`pnpm vitest run tests/ci/_metaModalWaitCandidateV2.test.ts` red-state=authored red-target=`tests/ci/modalWaitHelper/scan.ts:300` why=`enumerateCandidates at :300 is line-unit — it exports no statement-attributed candidate (no scopeTitle, matchLineText, endLine: probe shows 0 hits) and no label extraction, so the new suite's v2 import does not resolve and every case fails` ac=AC-1,AC-2 -->

<!-- spec-lint: ignore — tests/ci/_metaModalWaitCandidateV2.test.ts is created by this task -->
**Files:** `tests/ci/_metaModalWaitCandidateV2.test.ts` (new sibling suite).

**Fixture builder — NOT the bare `fixtureRoot` copy.** The existing `fixtureRoot` creates only `tests/e2e`, and origin (d) derives its testid prefixes from a product scan of `app/` + `components/` that returns NOTHING for an absent tree (`tests/ci/modalWaitHelper/scan.ts:176-182`) — so a spec-only fixture yields zero (d) candidates and every (d) case is vacuous (R2 finding 1). The sibling suite's builder therefore writes BOTH trees: the spec file under `tests/e2e/` plus a minimal probe component under the fixture root's `components/` dir carrying an `/admin?…show=` href and a `data-testid` whose prefix the spec fixture references (the `rootAt` pattern already in the suite at `tests/ci/_metaModalWaitHelper.test.ts:292-298`). Every (d)-classification case opens with a `premise(...)` that `productOpenSurfaces(root)` yielded a prefix — the guard-premise rule made executable.

Author the spec §4.4 cases in the new file, each on a throwaway fixture root (the pattern at `tests/ci/_metaModalWaitHelper.test.ts:68-74`):

1. **Split-chained activation is undisposed** — two-tree fixture (see builder above); statement `await page\n.getByTestId("shows-table-row-x")\n.press("Enter");` plus a nearby N-wait; classification against the shipped rules reports the origin-(d) candidate `undisposed`, claimed by no reference-only rule. Failure mode caught: the line-unit census certified exactly this shape as `d/reference-not-activation` (ledger row 2, member 1).
2. **Evaluate-body activation is undisposed** — the corpus hydration-poll shape with `(el as HTMLElement).click()` in the body; same assertion. Paired positive: the un-mutated poll (body reads only) is NOT undisposed once Task 2's `d/evaluate-poll` exclusion lands. Failure mode: ledger row 2, member 2 — the suite stayed 24/24 green under this exact edit.
3. **Comment-out reds the member count** — fixture with a live activation + N-wait passes; activation line commented out drops the candidate and fails the member-count assertion; the commented line yields no candidate of ANY origin. Failure mode: spec-review R2's probe — raw-text matching silently re-certified a disabled site at nine live corpus instances.
4. **Deleted N-wait fails naming its row** — two-row registry fixture, one wait removed; the failure message carries the missing `(file, scopeTitle, labelSource)`.
5. **Cross-scope move fails naming both ends** — the same wait relocated into a different test block; message carries declared and observed scope. Failure mode: ledger row 1's probe — count and label set both survive the move; only the scope key sees it.
6. **Unlabeled N-wait fails extractability** — `awaitReviewModalOrRecover(page, { timeoutMs: 30_000 })` reported by file:line.
7. **Container discrimination** — `test("covers /admin?show= deeplinks", …)` whose body holds an adopted helper call: container claimed by the title rule, the call by its member rule, `ambiguous === []`.

Anti-tautology: every fixture derives its expected failure from its own constructed corpus (never from the live tree), and each case's one-line "what is red and why" is the failure mode named above — none proves merely "a function was called".

**Four pre-dispatch mutants per string-presence assertion (writing-plans mandate; R2 finding 8).** The suite carries four string-presence claims — the missing `(file, scopeTitle, labelSource)` triple in case 4's message, both scopes in case 5's message, file:line in case 6's, and `.press("Enter")` in case 1's candidate text. Before the implementation arc's round-1 diff dispatch, run all four mutant shapes against each: (a) the expected value emptied; (b) the expected content plus an appended suffix; (c) the content present but not live (commented out, in an attribute, behind a false condition); (d) each discriminating parameter of the function under test varied in turn. Record each result in the Task 2 commit body; any assertion a mutant survives is strengthened before dispatch.

RED validity: each case fails at plan-authoring time because `tests/ci/modalWaitHelper/scan.ts:300`'s `enumerateCandidates` exposes neither the v2 fields nor label extraction (plan-time probe: 0 hits for `scopeTitle|matchLineText|createSourceFile`).

Sketch (typechecked shape, not the full block):

```ts
import { enumerateCandidatesV2, type CandidateV2 } from "./modalWaitHelper/scan";

test("split-chained activation is undisposed", () => {
  const root = fixtureRoot(
    "split-chain",
    [
      'test("x", async ({ page }) => {',
      "  await page",
      '    .getByTestId("shows-table-row-x")',
      '    .press("Enter");',
      "});",
    ].join("\n"),
  );
  const candidates: CandidateV2[] = enumerateCandidatesV2(root);
  const d = candidates.filter((c) => c.origin === "d-link-activation");
  expect(d).toHaveLength(1);
  expect(d[0]?.text).toContain('.press("Enter")');
});
```

(Naming — whether v2 replaces `enumerateCandidates` in place or ships beside it during the span — is Task 2's call; the RED does not depend on it.)

After authoring, verify the span claim: `pnpm vitest run tests/ci/_metaModalWaitHelper.test.ts` → 24 passed, and `pnpm vitest run tests/ci/_metaModalWaitCandidateV2.test.ts` → observed red (unresolved import). Commit: `test(ci): author candidate-contract v2 premise proofs (red)`.

### Task 2: Statement-unit producer + disposition rewrite + N-wait registry (GREEN)

<!-- task: red=`pnpm vitest run tests/ci/_metaModalWaitCandidateV2.test.ts` red-state=authored red-target=`tests/ci/modalWaitHelper/scan.ts:300` why=`same command Task 1 observed red; this task lands the v2 producer, rewritten rules, and registry that drive it green — the SAME command passes at task end` ac=AC-1,AC-2,AC-3,AC-4,AC-5,AC-6 -->

**Files:** `tests/ci/modalWaitHelper/scan.ts`, `tests/ci/modalWaitHelper/disposition.ts`, `tests/ci/_metaModalWaitHelper.test.ts` (live-corpus assertions updated to v2 counts), `tests/mutation/source/registry.ts` + `tests/mutation/source/expectedLedgerKinds.ts` (SAME commit — see step 5).

1. **scan.ts:** implement the spec §4.1 contract — parse with `ts.createSourceFile`; run origin regexes over `stripCommentsForFile` output (offset-preserving; `tests/_shared/stripComments.ts:215`); attribute each match to its nearest enclosing `ts.Statement`; dedupe per (statement, origin); slice `text`/`matchLineText` from the stripped bytes; resolve `scopeTitle` (nearest `test`/`describe` title, null at module scope) and `exemptReason` (existing `exemptionReasonAt`); extract the `label:` property source text for `awaitReviewModalOrRecover` statements. `MODAL_ROUTE_PATTERN` stays the single exported route regex (AC-4); `scanForViolations` and `productOpenSurfaces` byte-unchanged (AC-5).
2. **disposition.ts:** re-author every rule against the v2 shape under the spec §4.3 principles (refusal gates read statement text; title/assertion discrimination reads `matchLineText`); retire the five prose rules; add `d/evaluate-poll` with the statement-level activation refusal; add `N_WAIT_SITES` (12 rows from the spec §2.2 table, re-derived); derive `f/member-shape-N`'s count from the registry.
3. **Meta test:** update live-corpus expected counts to the re-derived v2 numbers; add the registry assertions (extractability, exact triple match, scope-local uniqueness, derived count).
4. Reconciliation (run, paste output in the commit body): rule count = 30 − 5 + 1 = 26 expected (divergence named with reason); registry rows = 12 = `rg -c` sum; candidate totals re-derived and compared against the spec §2.2 calibration (at or below, per the strip-before-match caveat).
5. **Mutation ledger refresh, SAME commit as the scan.ts edit** (plan review R1 finding 2: the registry NOTE at `tests/mutation/source/registry.ts:278-284` mandates same-commit id refresh, so deferring it to a later task knowingly commits stale rows). Recreate the scoped shard per the baseline recipe, run the gate, re-derive both accepted rows' siteIds (same equivalence arguments if the code shapes survived; re-argue or drop otherwise), repay or accept any new survivors, and reconcile `tests/mutation/source/expectedLedgerKinds.ts:225` (`"modal-wait-helper-scan": { equivalent: 2 }`) if the accepted kinds/count moved — `guardSurfaces.gates.test.ts:21-23` pins the key set and counts (R1 finding 3). Add the Task 1 sibling suite to the row's `suitePaths` so its cases count as deciders, AND add its matching row to `EXPECTED_ENV_TOUCHING` in `tests/mutation/_metaPremiseContract.test.ts:261` — that guard derives every unique `suitePaths` entry and asserts exact set equality, so a new deciding suite without its row fails `pnpm test:fast` (R2 finding 3). Delete the temp shard file before committing.
6. `pnpm typecheck` + both deciding suites green + `VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm vitest run --project mutation tests/mutation/guardSurfaces.gates.test.ts` (the suite lives ONLY in the opt-in mutation project — `vitest.projects.ts:90`; the bare form collects nothing and exits 1, R2 finding 2; corrected command validated at plan time: 5 passed) + `pnpm test:fast` for collateral. Record the score + unaccepted-survivor set (must be empty) in the commit body — the number the round-1 diff brief states.

Commit: `fix(ci): modal-wait census v2 — statement unit, strip-before-match, site-associated N-wait registry (mutation ledger refreshed same-commit)`.

### Task 3: disposition.ts enrolment decision

<!-- task: red=`VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm vitest run --project mutation tests/mutation/guardSurfaces.gates.test.ts` red-state=authored red-target=`tests/mutation/source/expectedLedgerKinds.ts:225` why=`enrolling disposition.ts adds a GUARD_SURFACES row whose id has no EXPECTED_LEDGER_KINDS key; gates.test.ts:21-23 pins key-set equality, so this suite is OBSERVED red the moment the row lands and green once the key and accepted rows are reconciled — and on the not-expressible branch the probe row is removed again, completing the same red-then-green on the same command` ac=AC-6 -->

<!-- spec-lint: ignore — tests/mutation/guardSurfaces.shardX.test.ts is a transient file this task creates and deletes; deliberately never tracked -->
**Files:** `tests/mutation/source/registry.ts`, `tests/mutation/source/expectedLedgerKinds.ts`; temporary `tests/mutation/guardSurfaces.shardX.test.ts` (created for the run, DELETED before commit — `_metaSourceShardIntegrity` pins the real shard set).

The `modal-wait-helper-scan` re-score already landed inside Task 2's commit (same-commit ledger contract). This task settles the OTHER §4.5 duty: whether `disposition.ts` enrolls.

1. Add the candidate row (`sourcePath: "tests/ci/modalWaitHelper/disposition.ts"`, `suitePaths: [both deciding suites]`, `operators: [...OPERATOR_NAMES]`) — observe `guardSurfaces.gates.test.ts` red (missing `EXPECTED_LEDGER_KINDS` key).
2. Run the scoped gate (temp shard filtered to the new id). Decide from the run: survivors dominated by equivalent mutants of `reason`/`protects` prose strings → accept per-row with reasons, add the `EXPECTED_LEDGER_KINDS` entry, keep the row; or record a probe-backed not-expressible disposition in the commit body and remove the row (step 1's red still completed; the gates suite returns green on removal). Honest outcome either way, decided by the run, BEFORE the first diff-review dispatch (AGENTS.md criterion 4).
3. Delete the temp shard file; `git status` clean of it; `VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm vitest run --project mutation tests/mutation/guardSurfaces.gates.test.ts` green.

Gate-red capability is DEMONSTRATED, not asserted (plan review R1 finding 4) — constructed failing input run at plan time: the scoped shard with one accepted `siteId` corrupted to `statement-removal:1:1:bogus>(removed)` produced

```text
EXIT=1
FAIL |mutation| … > source-mutation gate — modal-wait-helper-scan > passes every gate condition
AssertionError: gate failures: … unaccepted-survivor: 1 survivor(s) with no ledger row: statement-removal:189:9:continue;>(removed)
```

so the exact wrapper path Task 2 step 5 and this task rely on exits non-zero on a ledger/mutant mismatch.

Commit: `test(mutation): disposition.ts enrolment disposition (probe-backed)`.

<!-- tasks: end -->

### Task 4: Ledger graduation red-first (outside the red-contract region; final commit lands in Task 5's ordering)

Discharges AC-7's ledger half with its own observed red-then-green on `pnpm vitest run tests/docs/_metaDeferralLedgerGraduation.test.ts` (plan review R1 finding 5; message corrected by R2 finding 7):

1. **Red first:** add both `{ id, provenance: "fix/modal-wait-candidate-contract" }` rows to `BACKLOG_GRADUATED` (`tests/docs/_metaDeferralLedgerGraduation.test.ts:99`) while the entries still sit in `BACKLOG.md` — the "every graduated id is archive-only" case fails, and the OBSERVED red is `missing from BACKLOG-archive.md` on the first id, because the archive-presence assertion runs before the active-absence one and the loop stops at the first failure (`tests/docs/_metaDeferralLedgerGraduation.test.ts:654-657`).
2. **Green:** move both entries to `BACKLOG-archive.md` (splice per the lessons file's seam rules; section heading + branch provenance per the meta-test's section-scoped assertion), removing the `**Status:** IN PROGRESS · **Branch:**` markers in the same commit — invariant 12: the markers never reach main and the archive never holds in-flight rows. **This commit is STAGED here and LANDS at Task 5 step 3** so the last-commit ordering holds against the review rounds' corpus rows.
3. `docs/superpowers/plans/ci/README.md` index row: **already present** (landed with the plan commit) — verify, do not re-add.
4. PR body: whole-diff review verdict (Task 5), mutation score(s) + survivor set(s), the reconciliation outputs, and any label-only e2e edits named individually (expected: none).

### Task 5: Whole-diff adversarial review → bookkeeping-only tail → CI → merge

The convergence ordering plan review R1 finding 6 required, with the last-commit contradiction R2 finding 6 caught repaired by an explicit two-phase tail:

1. **Dispatch** the whole-diff cross-model review over the full implementation diff (Tasks 1-3 committed; Task 4's graduation commit NOT yet landed): `node scripts/codex-guard.mjs review --brief <round brief> --cwd <worktree> --out <fresh dir> --stage diff --round <n> --max-attempts 2 --attempt-max-secs 1380 --total-max-secs 2800 --stall-secs 900`, backgrounded. Round-1 brief carries the `GUARD SURFACE:` line with `MUTATION SCORE: <killed>/<total>` + "0 unaccepted survivors" for `modal-wait-helper-scan` (Task 2's recorded run) AND, if enrolled, the `disposition.ts` surface's score (Task 3) — the wrapper exits 2 without the line; plus the spec §6 consequence bound / `PROBE DOMAIN:` / threat fence, REVIEWER ONLY, and the do-not-relitigate list below.
2. **Result handling:** read the dispatch's result JSON in its out dir; `status: "no_verdict"` is an infra fault (retry ladder), never a clean review; findings are repaired with a class-sweep per finding, committed, pushed, and the next round dispatched with the repair recorded in the brief. Iterate to `VERDICT: APPROVE`. Corpus rows append automatically; at 4 counted rounds on the diff stage the round-economy filing is owed (`docs/review-rounds/README.md`).
3. **Bookkeeping-only tail, declared as such:** after APPROVE, land exactly ONE further commit — Task 4's graduation + marker removal, plus the final round's own corpus rows. It is mechanical bookkeeping by construction (ledger moves, registry rows, corpus JSONL) and contains NO implementation change; any non-bookkeeping edit re-enters step 1's review loop instead of riding this commit. This satisfies "review covers what merges" in the only form a marker-removal tail permits: the reviewed diff and the merged diff differ only by the declared bookkeeping commit, named in the PR body.
4. **Merge tail:** push; `gh pr merge --merge --auto` and RE-ARM after every subsequent push; real CI green on required contexts read from branch protection by name (never `isRequired`); `git rev-list --left-right --count main...origin/main` == `0  0` after fast-forward; then Stage 4.4 — CronDelete the nudge, clear pane + agent labels.

## Execution notes for the implementation session

- Diff-review briefs: this is a guard surface — every brief carries the spec §6 consequence bound, `PROBE DOMAIN:` line, threat fence, and (round 1) the `GUARD SURFACE: … MUTATION SCORE: <killed>/<total> … 0 unaccepted survivors` line from Task 2's recorded run, per AGENTS.md codex-guard rules (Task 5 step 1 is the executable form).
- Do-not-relitigate list for diff briefs: inherit spec §1.1 verbatim, plus the two recorded review dispositions (within-scope placement = documented limit 2 with its R1 probe; comment handling = strip-before-match with its R2 probe).
- Same-axis watch: if two consecutive diff rounds land on candidate-shape grammar corners, stop patching and re-read the spec §4.3 principles — the repair direction is narrowing (undisposed fall-through) per both ledger rows, never a wider rule.
