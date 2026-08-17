<!-- spec-lint: not-ui — no UI surface: tasks land in tests/ci/**, tests/mutation/source/registry.ts, and docs -->

# Modal-wait candidate contract v2 — implementation plan

**Spec:** `docs/superpowers/specs/ci/2026-08-17-modal-wait-candidate-contract-design.md` (adversarial APPROVE, spec round 3) · **Ledger:** `BL-MODAL-WAIT-SITE-ASSOCIATED-COUNTS` + `BL-MODAL-WAIT-LINE-GRANULARITY-ACTIVATION` · **Branch:** `fix/modal-wait-candidate-contract`
**Implementer:** separate session (this arc is spec+plan only). Worktree, env link, and preflight already exist per invariant 11; the implementer re-runs `pnpm preflight` before Task 1.

impeccable-gate: N/A — no UI surface

## Surfaces and invariants

- Edited: `tests/ci/modalWaitHelper/scan.ts`, `tests/ci/modalWaitHelper/disposition.ts`, `tests/ci/_metaModalWaitHelper.test.ts`, `tests/mutation/source/registry.ts` (accepted-row ids + any new rows), `BACKLOG.md`/`BACKLOG-archive.md`, `docs/superpowers/plans/ci/README.md`.
- NOT edited: `scanForViolations` + `productOpenSurfaces` (spec §1 out-of-scope; behavior byte-unchanged), `tests/e2e/helpers/openShowReviewModal.ts`, every `tests/e2e/*.spec.ts` (label-only edits permitted if re-derivation demands; expected zero — spec §1).
- **Meta-test inventory:** this plan EXTENDS `tests/ci/_metaModalWaitHelper.test.ts` (new premise-proof describe block + registry assertions) and UPDATES the `modal-wait-helper-scan` row in `tests/mutation/source/registry.ts`. No other structural registry applies: no Supabase call boundary, no advisory lock, no admin mutation surface, no tile/sentinel surface — the diff is test-infra only.
- **Mutation-family closure:** the operator families are the registry row's declared set (`operators: [...OPERATOR_NAMES]`, `tests/mutation/source/registry.ts:259`) — that enumeration is the closure set this arc's reviews converge against. A reviewer-proposed NEW family is admissible only with a live escaping mutant demonstrated against the shipped guard (AGENTS.md convergence criterion 4).
- **e2e harness-readiness:** N/A — no Playwright run is attached by any task; every suite here is vitest, and AC verification against e2e specs is static (census over source text).
- Acceptance criteria are spec §5's: **AC-1** statement unit + premise proofs; **AC-2** registry + row-1 proofs; **AC-3** total disposition preserved; **AC-4** route-pattern single source; **AC-5** guard untouched; **AC-6** mutation duties; **AC-7** bookkeeping. AC-7's ledger half is discharged by Task 4, outside the red-contract region (bookkeeping tail, not a TDD unit).

## Plan-time probes (run 2026-08-17 in this worktree; commands + output)

- `rg -c 'awaitReviewModalOrRecover\(' tests/e2e/*.spec.ts | sum` → **12** (matches the spec §2.2 registry table's 12 rows exactly).
- `rg -c 'scopeTitle|matchLineText|createSourceFile' tests/ci/modalWaitHelper/scan.ts` → **0 hits** — the v2 API is verifiably absent from the live tree, which is what makes Task 1's authored RED valid.
- Rule inventory: `rg -o 'id: "[^"]+"' tests/ci/modalWaitHelper/disposition.ts` → **30 rules**, of which **5** are prose rules (`a/prose`, `b/prose`, `c/prose`, `d/prose`, `e/prose`). Reconciliation for Task 2: 30 − 5 retired + 1 new exclusion (`d/evaluate-poll`, spec §4.3-1) = **26 rules** expected after the rewrite, ± any the re-derivation shows must split; any divergence from 26 is named in Task 2's commit message with its reason.
- Baseline deciding suite: `pnpm vitest run tests/ci/_metaModalWaitHelper.test.ts` → **24 passed (24)**.
<!-- spec-lint: ignore — tests/mutation/guardSurfaces.shardX.test.ts is a transient file this plan creates and deletes within Task 3; deliberately never tracked -->
- Baseline scoped mutation gate (validates Task 3's command shape AND its red capability — the gate mechanism reds on any unaccepted survivor or stale ledger row by registry contract, which Task 3's scan.ts edit will trigger via relocated siteIds until the ledger is refreshed): temporary `tests/mutation/guardSurfaces.shardX.test.ts` registering only `modal-wait-helper-scan`, `VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm heavy vitest run --project mutation tests/mutation/guardSurfaces.shardX.test.ts` → **7 passed, 114.76s**, then the temp file deleted (`_metaSourceShardIntegrity` pins the real shard set).
- Statement-unit corpus calibration: spec §2.2 table (line-unit vs statement-unit per origin; all 12 labels extractable; 4 of 12 labels on a different line than their call).

## Deliberate-red span

Task 1 authors the v2 premise proofs and they FAIL (the API does not exist). Task 2 lands scan v2 + the disposition rewrite + the registry and drives the WHOLE suite green. Between Task 1's commit and Task 2's, `tests/ci/_metaModalWaitHelper.test.ts` is red **only in the new describe block** — the existing 24 cases stay green through Task 1 because Task 1 touches no production file. This is the plan's one declared red span (parent-plan precedent: its Task 2→7 span). Do not push a PR-ready state inside it; Tasks 1+2 may land as one push.

Typecheck note (writing-plans snippet rule): the fenced block in Task 1 was typechecked at plan time by splicing it into a scratch `.ts` file beside the suite with `pnpm exec tsc --noEmit -p tsconfig.json` semantics via the repo's strict options; it imports only symbols Task 2 creates, so at plan time it fails to RESOLVE (that is the authored red), and its internal syntax is valid TypeScript.

<!-- tasks: depth=3 red-contract -->

### Task 1: Author the v2 premise proofs (RED)

<!-- task: red=`pnpm vitest run tests/ci/_metaModalWaitHelper.test.ts` red-state=authored red-target=`tests/ci/modalWaitHelper/scan.ts:300` why=`enumerateCandidates at :300 is line-unit — it exports no statement-attributed candidate (no scopeTitle, matchLineText, endLine: probe shows 0 hits) and no label extraction, so every new case fails to resolve or assert` ac=AC-1,AC-2 -->

**Files:** `tests/ci/_metaModalWaitHelper.test.ts` (new describe block only).

Author a new `describe("candidate contract v2 premise proofs")` block with the spec §4.4 cases, each using the suite's existing `fixtureRoot` pattern (`tests/ci/_metaModalWaitHelper.test.ts:68-74`):

1. **Split-chained activation is undisposed** — fixture statement `await page\n.getByTestId("shows-table-row-x")\n.press("Enter");` plus a nearby N-wait; classification against the shipped rules reports the origin-(d) candidate `undisposed`, claimed by no reference-only rule. Failure mode caught: the line-unit census certified exactly this shape as `d/reference-not-activation` (ledger row 2, member 1).
2. **Evaluate-body activation is undisposed** — the corpus hydration-poll shape with `(el as HTMLElement).click()` in the body; same assertion. Paired positive: the un-mutated poll (body reads only) is NOT undisposed once Task 2's `d/evaluate-poll` exclusion lands. Failure mode: ledger row 2, member 2 — the suite stayed 24/24 green under this exact edit.
3. **Comment-out reds the member count** — fixture with a live activation + N-wait passes; activation line commented out drops the candidate and fails the member-count assertion; the commented line yields no candidate of ANY origin. Failure mode: spec-review R2's probe — raw-text matching silently re-certified a disabled site at nine live corpus instances.
4. **Deleted N-wait fails naming its row** — two-row registry fixture, one wait removed; the failure message carries the missing `(file, scopeTitle, labelSource)`.
5. **Cross-scope move fails naming both ends** — the same wait relocated into a different test block; message carries declared and observed scope. Failure mode: ledger row 1's probe — count and label set both survive the move; only the scope key sees it.
6. **Unlabeled N-wait fails extractability** — `awaitReviewModalOrRecover(page, { timeoutMs: 30_000 })` reported by file:line.
7. **Container discrimination** — `test("covers /admin?show= deeplinks", …)` whose body holds an adopted helper call: container claimed by the title rule, the call by its member rule, `ambiguous === []`.

Anti-tautology: every fixture derives its expected failure from its own constructed corpus (never from the live tree), and each case's one-line "what is red and why" is the failure mode named above — none proves merely "a function was called". RED validity: each case fails at plan-authoring time because `tests/ci/modalWaitHelper/scan.ts:300`'s `enumerateCandidates` exposes neither the v2 fields nor label extraction (plan-time probe: 0 hits for `scopeTitle|matchLineText|createSourceFile`).

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

Commit: `test(ci): author candidate-contract v2 premise proofs (red)`.

### Task 2: Statement-unit producer + disposition rewrite + N-wait registry (GREEN)

<!-- task: red=`pnpm vitest run tests/ci/_metaModalWaitHelper.test.ts` red-state=authored red-target=`tests/ci/modalWaitHelper/scan.ts:300` why=`same command Task 1 observed red; this task lands the v2 producer, rewritten rules, and registry that drive it green — the SAME command passes at task end` ac=AC-1,AC-2,AC-3,AC-4,AC-5 -->

**Files:** `tests/ci/modalWaitHelper/scan.ts`, `tests/ci/modalWaitHelper/disposition.ts`, `tests/ci/_metaModalWaitHelper.test.ts` (live-corpus assertions updated to v2 counts).

1. **scan.ts:** implement the spec §4.1 contract — parse with `ts.createSourceFile`; run origin regexes over `stripCommentsForFile` output (offset-preserving; `tests/_shared/stripComments.ts:215`); attribute each match to its nearest enclosing `ts.Statement`; dedupe per (statement, origin); slice `text`/`matchLineText` from the stripped bytes; resolve `scopeTitle` (nearest `test`/`describe` title, null at module scope) and `exemptReason` (existing `exemptionReasonAt`); extract the `label:` property source text for `awaitReviewModalOrRecover` statements. `MODAL_ROUTE_PATTERN` stays the single exported route regex (AC-4); `scanForViolations` and `productOpenSurfaces` byte-unchanged (AC-5).
2. **disposition.ts:** re-author every rule against the v2 shape under the spec §4.3 principles (refusal gates read statement text; title/assertion discrimination reads `matchLineText`); retire the five prose rules; add `d/evaluate-poll` with the statement-level activation refusal; add `N_WAIT_SITES` (12 rows from the spec §2.2 table, re-derived); derive `f/member-shape-N`'s count from the registry.
3. **Meta test:** update live-corpus expected counts to the re-derived v2 numbers; add the registry assertions (extractability, exact triple match, scope-local uniqueness, derived count).
4. Reconciliation (run, paste output in the commit body): rule count = 30 − 5 + 1 = 26 expected (divergence named with reason); registry rows = 12 = `rg -c` sum; candidate totals re-derived and compared against the spec §2.2 calibration (at or below, per the strip-before-match caveat).
5. `pnpm typecheck` + full deciding suite green + `pnpm test:fast` for collateral.

Commit: `fix(ci): modal-wait census v2 — statement unit, strip-before-match, site-associated N-wait registry`.

### Task 3: Mutation ledger re-score + disposition enrolment decision

<!-- task: red=`VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm heavy vitest run --project mutation tests/mutation/guardSurfaces.shardX.test.ts` red-state=authored red-target=`tests/ci/modalWaitHelper/scan.ts:300` why=`Task 2's rewrite of scan.ts relocates every generated mutation siteId, and the two accepted registry rows (tests/mutation/source/registry.ts:283-296) pin ids by line:column into the PRE-edit file — so the scoped gate, recreated per the plan-time baseline recipe, is OBSERVED red (stale-ledger-row) at this task's start and passes after the ledger re-derivation; red-state=live would be factually wrong at plan time because the temp shard file does not exist on the tree and the baseline run exits 0` ac=AC-6 -->

<!-- spec-lint: ignore — tests/mutation/guardSurfaces.shardX.test.ts is a transient file this task creates and deletes; deliberately never tracked -->
**Files:** `tests/mutation/source/registry.ts`; temporary `tests/mutation/guardSurfaces.shardX.test.ts` (created for the run, DELETED before commit — `_metaSourceShardIntegrity` pins the real shard set).

1. Recreate the scoped shard file exactly as the plan-time baseline (filter `GUARD_SURFACES` to `modal-wait-helper-scan`); run the gate. Expect stale-ledger-row / survivor output naming the relocated ids.
2. Re-derive: update both accepted rows' siteIds to their new locations (same equivalence arguments if the code shapes survived; re-argue or drop otherwise). New survivors: repay each with a deciding case in the meta suite, or add an accepted row with a per-row reason. `scoreFloor` stays 0.95.
3. Re-run to green; record score + unaccepted-survivor set (must be empty) in the commit body — this is the number the implementation arc's round-1 diff brief states (AGENTS.md criterion 4).
4. **disposition.ts enrolment (spec §4.5):** add a candidate registry row (`sourcePath: tests/ci/modalWaitHelper/disposition.ts`, `suitePaths: [tests/ci/_metaModalWaitHelper.test.ts]`), run scoped; if the survivor set is dominated by equivalent mutants of `reason`/`protects` prose strings, either accept per-row or record a probe-backed not-expressible disposition in the commit body and drop the row — honest outcome either way, decided by the run, before the first diff-review dispatch.
5. Delete the temp shard file; `git status` clean of it.

Gate-red validation (mutant-red treatment for declared gate commands): the plan-time baseline run proves the command executes and passes on the pre-edit tree; the gate mechanism's non-zero exit on failure is pinned by the registry contract itself (`stale-ledger-row` and unaccepted-survivor are red states by construction, exercised live in this repo — `docs/superpowers/specs/ci/2026-08-04-source-mutation-guard-gate.md`).

Commit: `test(mutation): re-score modal-wait-helper-scan post-v2; disposition enrolment disposition`.

<!-- tasks: end -->

### Task 4: Bookkeeping tail (outside the red-contract region)

Discharges AC-7 in prose with its own observed red-then-green: `pnpm vitest run tests/docs/` green before merge.

1. `docs/superpowers/plans/ci/README.md` gains this plan's index row.
2. Ledger: both rows graduate to `BACKLOG-archive.md` recording the contract change and this spec/plan as the durable form; the `**Status:** IN PROGRESS · **Branch:**` markers come off **in the PR's last commit before merge** (invariant 12 — never merged into main; archives reject in-flight entries, so graduation and marker removal are the same commit).
3. Review-rounds corpus rows for the implementation arc's own dispatches committed with the arc.
4. PR body: cross-model whole-diff review verdict, mutation score + survivor set, the reconciliation outputs, and any label-only e2e edits named individually (expected: none).

## Execution notes for the implementation session

- Diff-review briefs: this is a guard surface — every brief carries the spec §6 consequence bound, `PROBE DOMAIN:` line, threat fence, and (round 1) the `GUARD SURFACE: … MUTATION SCORE: <killed>/<total> … 0 unaccepted survivors` line from Task 3's recorded run, per AGENTS.md codex-guard rules.
- Do-not-relitigate list for diff briefs: inherit spec §1.1 verbatim, plus the two recorded review dispositions (within-scope placement = documented limit 2 with its R1 probe; comment handling = strip-before-match with its R2 probe).
- Same-axis watch: if two consecutive diff rounds land on candidate-shape grammar corners, stop patching and re-read the spec §4.3 principles — the repair direction is narrowing (undisposed fall-through) per both ledger rows, never a wider rule.
